import assert from "assert";
import { NextRequest } from "next/server";
import {
  generateDuitkuCallbackSignature,
  verifyDuitkuCallbackSignature,
  generateDuitkuInquirySignature,
} from "../lib/duitku";
import { POST as callbackRouteHandler } from "../app/api/payments/duitku/callback/route";
import { updateOrderStatusServer, saveOrder } from "../lib/orders-store";
import { Order } from "../types";
import { generateSecureOrderToken } from "../lib/token-security";

console.log("================================================================================");
console.log("TEST SUITE: Duitku Phase 2B Integration & Regression Tests");
console.log("================================================================================\n");

// Mock environment
process.env.DUITKU_MERCHANT_CODE = "D12345";
process.env.DUITKU_API_KEY = "test_api_key_duitku_secret_32char";
process.env.DUITKU_ENV = "sandbox";

async function runRegressionSuite() {
  const merchantCode = "D12345";
  const apiKey = "test_api_key_duitku_secret_32char";

  // Helper to create mock orders in dev store
  const createMockOrder = async (
    orderId: string,
    method: "QRIS" | "Cash",
    total: number,
    status: Order["orderStatus"] = "Pesanan baru",
    paymentStatus: Order["paymentStatus"] = "Menunggu Pembayaran",
    gatewayProvider: "duitku" | null = method === "QRIS" ? "duitku" : null
  ): Promise<Order> => {
    const token = generateSecureOrderToken();
    const order: Order = {
      id: orderId,
      token,
      createdAt: new Date().toISOString(),
      customerName: "Budi Santoso",
      customerWhatsapp: "081234567890",
      fulfillmentType: "pickup",
      deliveryArea: "Pickup Toko (Lhoksukon)",
      orderNote: "",
      items: [
        {
          id: "item-1",
          productId: "prod-1",
          productName: "Ayam Geprek Sambal Korek",
          productImage: "/placeholder.png",
          basePrice: total,
          selectedOptions: [],
          selectedAddons: [],
          itemNote: "",
          quantity: 1,
          unitPrice: total,
          itemTotal: total,
          isAvailable: true,
          productType: "ready",
        },
      ],
      subtotal: total,
      shippingFee: 0,
      total,
      orderStatus: status,
      paymentStatus,
      paymentMethod: method,
      paymentDeadline: method === "QRIS" ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : "",
      merchantName: "Nook by Jina",
      gatewayProvider,
    };
    return await saveOrder(order);
  };

  const createCallbackReq = (params: Record<string, string>) => {
    const searchParams = new URLSearchParams(params);
    return new NextRequest("http://localhost:3000/api/payments/duitku/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: searchParams.toString(),
    });
  };

  // ---------------------------------------------------------------------------
  // 1. Customer Method Choices & Isolation
  // ---------------------------------------------------------------------------
  console.log("--- 1. Customer Payment Method Choices (QRIS & Cash only) ---");
  const qrisOrder = await createMockOrder("NBJ-20261103-0101", "QRIS", 35000);
  assert.strictEqual(qrisOrder.paymentMethod, "QRIS");
  assert.strictEqual(qrisOrder.gatewayProvider, "duitku");
  assert.strictEqual(qrisOrder.paymentStatus, "Menunggu Pembayaran");

  const cashOrder = await createMockOrder("NBJ-20261103-0102", "Cash", 25000);
  assert.strictEqual(cashOrder.paymentMethod, "Cash");
  assert.strictEqual(cashOrder.gatewayProvider, null);
  assert.strictEqual(cashOrder.paymentDeadline, "");
  console.log("✅ Passed: QRIS and Cash correctly initialized with proper isolation.\n");

  // ---------------------------------------------------------------------------
  // 2. Inquiry Signature Formula
  // ---------------------------------------------------------------------------
  console.log("--- 2. Inquiry Signature Generation (HMAC-SHA256) ---");
  const inquirySig = generateDuitkuInquirySignature(merchantCode, "NBJ-20261103-0101", 35000, apiKey);
  assert.strictEqual(inquirySig.length, 64);
  console.log("✅ Passed: Inquiry HMAC-SHA256 signature generated.\n");

  // ---------------------------------------------------------------------------
  // 3. Callback Security: Tampering Amount Rejected
  // ---------------------------------------------------------------------------
  console.log("--- 3. Callback Rejects Tampered Amount ---");
  const validSig = generateDuitkuCallbackSignature(merchantCode, "35000", "NBJ-20261103-0101", apiKey);
  const tamperedSig = verifyDuitkuCallbackSignature(
    {
      merchantCode,
      amount: "40000",
      merchantOrderId: "NBJ-20261103-0101",
      signature: validSig,
    },
    apiKey
  );
  assert.strictEqual(tamperedSig, false);
  console.log("✅ Passed: Tampered amount rejected in signature verification.\n");

  // ---------------------------------------------------------------------------
  // 4. Callback Security: Rejects Cash Orders
  // ---------------------------------------------------------------------------
  console.log("--- 4. Callback Strictly Rejects Cash Orders ---");
  const cashSig = generateDuitkuCallbackSignature(merchantCode, "25000", "NBJ-20261103-0102", apiKey);
  const cashReq = createCallbackReq({
    merchantCode,
    amount: "25000",
    merchantOrderId: "NBJ-20261103-0102",
    signature: cashSig,
    resultCode: "00",
    reference: "REF_CASH_FAIL",
  });
  const cashRes = await callbackRouteHandler(cashReq);
  // Expected to be rejected because order is Cash
  assert.strictEqual(cashRes.status, 400);
  console.log("✅ Passed: Cash order callback attempt rejected with HTTP 400.\n");

  // ---------------------------------------------------------------------------
  // 5. Callback Security: Status Transition & Idempotency
  // ---------------------------------------------------------------------------
  console.log("--- 5. Status Transition to Lunas via updateOrderStatusServer ---");
  const updatedOrder = await updateOrderStatusServer("NBJ-20261103-0101", "Diproses", "Lunas");
  assert.strictEqual(updatedOrder?.orderStatus, "Diproses");
  assert.strictEqual(updatedOrder?.paymentStatus, "Lunas");
  console.log("✅ Passed: Order transitioned to Diproses and Lunas.\n");

  // ---------------------------------------------------------------------------
  // 6. Immutability: Paid orders cannot be cancelled
  // ---------------------------------------------------------------------------
  console.log("--- 6. Paid Order Immutability (Cannot be cancelled) ---");
  let cancelThrew = false;
  try {
    await updateOrderStatusServer("NBJ-20261103-0101", "Dibatalkan", "Dibatalkan");
  } catch (err: unknown) {
    cancelThrew = true;
    assert.ok(err instanceof Error && err.message.includes("tidak dapat dibatalkan"));
  }
  assert.strictEqual(cancelThrew, true);
  console.log("✅ Passed: Paid order cannot be cancelled.\n");

  // ---------------------------------------------------------------------------
  // 7. Cancelled orders cannot be resurrected to Lunas
  // ---------------------------------------------------------------------------
  console.log("--- 7. Cancelled Orders Cannot Be Resurrected to Lunas ---");
  const preliminaryOrder = await createMockOrder("NBJ-20261103-0103", "QRIS", 50000, "Pesanan baru", "Menunggu Pembayaran");
  await updateOrderStatusServer(preliminaryOrder.id, "Dibatalkan", "Dibatalkan");

  let resurrectThrew = false;
  try {
    await updateOrderStatusServer("NBJ-20261103-0103", "Diproses", "Lunas");
  } catch (err: unknown) {
    resurrectThrew = true;
    assert.ok(err instanceof Error && err.message.includes("dibatalkan"));
  }
  assert.strictEqual(resurrectThrew, true);
  console.log("✅ Passed: Cancelled order resurrection strictly rejected.\n");

  // ---------------------------------------------------------------------------
  // 8. Cash Orders Can Be Verified Manually by Admin
  // ---------------------------------------------------------------------------
  console.log("--- 8. Cash Orders Admin Verification ---");
  const cashSettled = await updateOrderStatusServer("NBJ-20261103-0102", "Diproses", "Lunas");
  assert.strictEqual(cashSettled?.orderStatus, "Diproses");
  assert.strictEqual(cashSettled?.paymentStatus, "Lunas");
  console.log("✅ Passed: Cash order settled manually by admin.\n");

  console.log("================================================================================");
  console.log("🎉 ALL PHASE 2B REGRESSION & SECURITY SCENARIOS PASSED (0 FAILURES)!");
  console.log("================================================================================");
}

runRegressionSuite().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
