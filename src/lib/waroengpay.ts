import "server-only";
import crypto from "crypto";

/**
 * WaroengPay API Client & Security Library
 * Strictly implements the authoritative WaroengPay documentation (waroengpay.md).
 * Base URL: https://waroengpay.com
 */

export interface WaroengPayConfig {
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
  isSandbox: boolean;
}

export interface WaroengPayCreatePaymentRequest {
  amount: number; // Rupiah integer (1.000 to 10.000.000)
  reference?: string; // Order reference (max 100 chars, non-unique metadata)
  description?: string; // Description shown on payment page (max 200 chars)
  callback_url?: string; // Webhook recipient URL
  redirect_url?: string; // Customer return URL after settlement
  expires_in?: number; // Expiry in minutes (5-60, default 15)
  platform_fee?: number; // Optional platform fee (default 0)
}

export interface WaroengPayPaymentResponse {
  id: string; // WRG-...
  reference: string | null;
  description: string | null;
  status: "pending" | "paid" | "expired" | "cancelled";
  base_amount: number;
  unique_code: number;
  amount: number; // base_amount + unique_code
  fee: number;
  net_amount: number;
  qris: string; // QRIS payload string (or test string in sandbox)
  pay_url: string; // https://waroengpay.com/pay/WRG-...
  callback_url: string | null;
  redirect_url: string | null;
  created_at: string; // ISO 8601
  expires_at: string; // ISO 8601
  paid_at: string | null; // ISO 8601
  late: boolean;
  livemode: boolean;
  link_id: string | null;
  customer: {
    name: string | null;
    phone: string | null;
    note: string | null;
  } | null;
  payment: {
    issuer?: string;
    payer?: string;
    bca_ref?: string;
    transaction_at?: string;
  } | null;
}

export interface WaroengPayWebhookEvent {
  id: string; // evt_...
  event: "payment.paid" | "payment.expired" | "payment.cancelled" | "ping";
  created_at: string;
  livemode: boolean;
  data: WaroengPayPaymentResponse;
}

const WAROENGPAY_BASE_URL = "https://waroengpay.com";

/**
 * Returns WaroengPay configuration from environment.
 * Validates presence of API key and webhook secret.
 */
export function getWaroengPayConfig(): WaroengPayConfig {
  const apiKey = (process.env.WAROENGPAY_API_KEY || "").trim();
  const webhookSecret = (process.env.WAROENGPAY_WEBHOOK_SECRET || "").trim();

  if (!apiKey) {
    throw new Error("WAROENGPAY_API_KEY belum dikonfigurasi di environment server.");
  }

  const isSandbox = apiKey.startsWith("wp_test_");

  return {
    apiKey,
    webhookSecret,
    baseUrl: WAROENGPAY_BASE_URL,
    isSandbox,
  };
}

/**
 * Checks whether WaroengPay credentials are configured on the server.
 */
export function isWaroengPayConfigured(): boolean {
  return Boolean(process.env.WAROENGPAY_API_KEY && process.env.WAROENGPAY_API_KEY.trim().length > 0);
}

/**
 * Checks if current WaroengPay credentials are in test/sandbox mode (wp_test_).
 */
export function isWaroengPaySandbox(): boolean {
  const apiKey = (process.env.WAROENGPAY_API_KEY || "").trim();
  return apiKey.startsWith("wp_test_");
}

/**
 * Creates a dynamic QRIS payment invoice via POST /api/payments.
 */
export async function createWaroengPayPayment(
  payload: WaroengPayCreatePaymentRequest,
  idempotencyKey?: string
): Promise<WaroengPayPaymentResponse> {
  const config = getWaroengPayConfig();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  if (idempotencyKey && idempotencyKey.trim().length > 0) {
    headers["Idempotency-Key"] = idempotencyKey.trim().slice(0, 100);
  }

  const res = await fetch(`${config.baseUrl}/api/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: Math.round(payload.amount),
      reference: payload.reference ? String(payload.reference).slice(0, 100) : undefined,
      description: payload.description ? String(payload.description).slice(0, 200) : undefined,
      callback_url: payload.callback_url,
      redirect_url: payload.redirect_url,
      expires_in: payload.expires_in ?? 15,
      platform_fee: payload.platform_fee ?? 0,
    }),
  });

  const responseJson = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg =
      responseJson?.error ||
      `WaroengPay API Error (${res.status} ${res.statusText})`;
    const errorCode = responseJson?.code || "unknown_error";
    throw new Error(`Gagal membuat pembayaran WaroengPay [${errorCode}]: ${errorMsg}`);
  }

  return responseJson as WaroengPayPaymentResponse;
}

/**
 * Retrieves payment status from WaroengPay via GET /api/payments/:id.
 */
export async function getWaroengPayPayment(
  paymentId: string
): Promise<WaroengPayPaymentResponse> {
  const config = getWaroengPayConfig();

  const res = await fetch(`${config.baseUrl}/api/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const responseJson = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = responseJson?.error || `WaroengPay check error (${res.status})`;
    const errorCode = responseJson?.code || "check_failed";
    throw new Error(`Gagal memeriksa status pembayaran WaroengPay [${errorCode}]: ${errorMsg}`);
  }

  return responseJson as WaroengPayPaymentResponse;
}

/**
 * Cancels a pending payment via POST /api/payments/:id/cancel.
 */
export async function cancelWaroengPayPayment(
  paymentId: string
): Promise<WaroengPayPaymentResponse> {
  const config = getWaroengPayConfig();

  const res = await fetch(`${config.baseUrl}/api/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  const responseJson = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = responseJson?.error || `Cancel payment failed (${res.status})`;
    throw new Error(`Gagal membatalkan pembayaran WaroengPay: ${errorMsg}`);
  }

  return responseJson as WaroengPayPaymentResponse;
}

/**
 * Simulates payment settlement or expiration in sandbox mode.
 * POST /api/payments/:id/simulate (only accepts wp_test_ key).
 */
export async function simulateWaroengPayPayment(
  paymentId: string,
  action: "pay" | "expire" = "pay"
): Promise<WaroengPayPaymentResponse> {
  const config = getWaroengPayConfig();

  if (!config.isSandbox) {
    throw new Error("Simulasi pembayaran hanya diizinkan dalam mode Sandbox (wp_test_).");
  }

  const res = await fetch(`${config.baseUrl}/api/payments/${encodeURIComponent(paymentId)}/simulate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });

  const responseJson = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = responseJson?.error || `Simulate failed (${res.status})`;
    throw new Error(`Gagal melakukan simulasi pembayaran WaroengPay: ${errorMsg}`);
  }

  return responseJson as WaroengPayPaymentResponse;
}

/**
 * Verifies WaroengPay webhook signature using HMAC-SHA256 and constant-time comparison.
 * Formula: hex(HMAC-SHA256(webhook_secret, "<timestamp>.<raw body>"))
 * Rejects timestamps older or ahead by more than 300 seconds (replay defense).
 */
export function verifyWaroengPayWebhookSignature(
  params: {
    rawBody: string;
    timestamp: string;
    signature: string;
  },
  customSecret?: string
): boolean {
  const { rawBody, timestamp, signature } = params;

  if (!rawBody || !timestamp || !signature) {
    return false;
  }

  const secret = customSecret ?? (process.env.WAROENGPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return false;
  }

  // 1. Freshness check: timestamp must be within 300 seconds (5 minutes)
  const parsedTs = Number(timestamp);
  if (isNaN(parsedTs) || parsedTs <= 0) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsedTs) > 300) {
    return false;
  }

  // 2. Compute expected HMAC-SHA256 signature
  const dataToSign = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(dataToSign)
    .digest("hex");

  // 3. Timing-safe comparison to protect against timing attacks
  try {
    const sigBuffer = Buffer.from(signature.toLowerCase(), "hex");
    const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), "hex");

    if (sigBuffer.length !== expectedBuffer.length || sigBuffer.length === 0) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
