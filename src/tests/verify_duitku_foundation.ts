import assert from "assert";
import crypto from "crypto";
import { NextRequest } from "next/server";
import {
  generateDuitkuCallbackSignature,
  verifyDuitkuCallbackSignature,
  generateDuitkuInquirySignature,
} from "../lib/duitku";
import { POST as callbackRouteHandler } from "../app/api/payments/duitku/callback/route";

console.log("================================================================================");
console.log("TEST SUITE: Duitku Sandbox Foundation — Service Layer & Callback Security");
console.log("================================================================================\n");

// Mock environment for test execution
process.env.DUITKU_MERCHANT_CODE = "D12345";
process.env.DUITKU_API_KEY = "test_api_key_duitku_secret_32char";
process.env.DUITKU_ENV = "sandbox";

async function runTests() {
  const merchantCode = "D12345";
  const apiKey = "test_api_key_duitku_secret_32char";
  const merchantOrderId = "NBJ-20261103-0001";
  const amount = "45000";

  // 1. Signature generation & verification (valid case)
  console.log("--- TEST 1: Valid Callback Signature Verification ---");
  const validSignature = generateDuitkuCallbackSignature(merchantCode, amount, merchantOrderId, apiKey);
  assert.ok(validSignature && validSignature.length === 64, "Signature HMAC-SHA256 must be 64-character hex");

  const isValid = verifyDuitkuCallbackSignature(
    {
      merchantCode,
      amount,
      merchantOrderId,
      signature: validSignature,
    },
    apiKey
  );
  assert.strictEqual(isValid, true, "Signature verification should pass for identical inputs");
  console.log("✅ Passed: Valid signature correctly verified.\n");

  // 2. Signature verification (invalid signature)
  console.log("--- TEST 2: Invalid Callback Signature Rejected ---");
  const isInvalid = verifyDuitkuCallbackSignature(
    {
      merchantCode,
      amount,
      merchantOrderId,
      signature: "0000000000000000000000000000000000000000000000000000000000000000",
    },
    apiKey
  );
  assert.strictEqual(isInvalid, false, "Invalid signature must be strictly rejected");
  console.log("✅ Passed: Invalid signature safely rejected.\n");

  // 3. Amount tampering detection
  console.log("--- TEST 3: Amount Mismatch Rejected in Signature Check ---");
  const tamperedAmountValid = verifyDuitkuCallbackSignature(
    {
      merchantCode,
      amount: "50000", // Tampered amount
      merchantOrderId,
      signature: validSignature,
    },
    apiKey
  );
  assert.strictEqual(tamperedAmountValid, false, "Tampered amount must fail signature verification");
  console.log("✅ Passed: Amount tampering detected and rejected.\n");

  // 4. Merchant Code mismatch
  console.log("--- TEST 4: Merchant Code Mismatch Rejected ---");
  const tamperedMerchantValid = verifyDuitkuCallbackSignature(
    {
      merchantCode: "D99999", // Tampered merchant
      amount,
      merchantOrderId,
      signature: validSignature,
    },
    apiKey
  );
  assert.strictEqual(tamperedMerchantValid, false, "Tampered merchantCode must fail signature verification");
  console.log("✅ Passed: Merchant code mismatch detected and rejected.\n");

  // 5. Inquiry Signature Formula check
  console.log("--- TEST 5: Inquiry HMAC-SHA256 Signature Generation ---");
  const inquirySig = generateDuitkuInquirySignature(merchantCode, merchantOrderId, 45000, apiKey);
  const expectedInquirySig = crypto
    .createHmac("sha256", apiKey)
    .update(`${merchantCode}${merchantOrderId}45000`)
    .digest("hex");
  assert.strictEqual(inquirySig, expectedInquirySig, "Inquiry signature must strictly match HMAC-SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey)");
  assert.strictEqual(inquirySig.length, 64, "Inquiry signature should be 64-char hex");
  console.log("✅ Passed: Inquiry signature generated correctly.\n");

  // Helper to build URL-encoded request for callbackRouteHandler
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

  // 6. Callback route handler - Missing required parameters
  console.log("--- TEST 6: Callback Handler Rejects Missing Parameters (400) ---");
  const missingParamReq = createCallbackReq({
    merchantCode,
    amount,
    // merchantOrderId is missing!
    signature: validSignature,
    resultCode: "00",
  });
  const missingRes = await callbackRouteHandler(missingParamReq);
  assert.strictEqual(missingRes.status, 400, "Should return HTTP 400 for missing mandatory parameters");
  console.log("✅ Passed: Missing parameters rejected with HTTP 400.\n");

  // 7. Callback route handler - Unauthorized merchantCode
  console.log("--- TEST 7: Callback Handler Rejects Foreign Merchant Code (403) ---");
  const foreignMerchantReq = createCallbackReq({
    merchantCode: "D_FOREIGN",
    amount,
    merchantOrderId,
    signature: validSignature,
    resultCode: "00",
  });
  const foreignRes = await callbackRouteHandler(foreignMerchantReq);
  assert.strictEqual(foreignRes.status, 403, "Should return HTTP 403 for mismatched merchant code");
  console.log("✅ Passed: Foreign merchantCode rejected with HTTP 403.\n");

  // 8. Callback route handler - Invalid signature in HTTP POST
  console.log("--- TEST 8: Callback Handler Rejects Bad Signature (400) ---");
  const badSigReq = createCallbackReq({
    merchantCode,
    amount,
    merchantOrderId,
    signature: "bad_signature_test_hash_hex_1234567890abcdef1234567890abcdef12345678",
    resultCode: "00",
  });
  const badSigRes = await callbackRouteHandler(badSigReq);
  assert.strictEqual(badSigRes.status, 400, "Should return HTTP 400 for bad signature");
  console.log("✅ Passed: Bad signature rejected with HTTP 400.\n");

  console.log("================================================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
