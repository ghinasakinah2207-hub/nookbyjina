import "server-only";
import crypto from "crypto";

/**
 * Interface representing Duitku Gateway configuration.
 * All variables are server-only and validated at runtime.
 */
export interface DuitkuConfig {
  merchantCode: string;
  apiKey: string;
  env: "sandbox" | "production";
  callbackUrl: string;
  returnUrl: string;
  inquiryEndpoint: string;
}

/**
 * Payload for creating an invoice via Duitku Merchant API v2 inquiry.
 */
export interface DuitkuInquiryRequest {
  paymentAmount: number;
  merchantOrderId: string;
  productDetails: string;
  email: string;
  phoneNumber?: string;
  customerVaName: string;
  paymentMethod?: string;
  expiryPeriod?: number; // In minutes
}

/**
 * Successful response from Duitku Merchant API v2 inquiry.
 */
export interface DuitkuInquiryResponse {
  statusCode: string;
  statusMessage: string;
  merchantCode: string;
  reference: string;
  paymentUrl: string;
  vaNumber?: string;
  qrString?: string;
  amount: string;
}

/**
 * Normalized parameters received from Duitku callback (IPN).
 * Duitku sends callbacks via POST application/x-www-form-urlencoded.
 */
export interface DuitkuCallbackPayload {
  merchantCode: string;
  amount: string;
  merchantOrderId: string;
  productDetail?: string;
  additionalParam?: string;
  paymentCode?: string;
  resultCode: string;
  merchantUserId?: string;
  reference: string;
  signature: string;
  spUserHash?: string;
  settlementDate?: string;
  issuerCode?: string;
}

const DUITKU_SANDBOX_INQUIRY_ENDPOINT = "https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry";
const DUITKU_PRODUCTION_INQUIRY_ENDPOINT = "https://passport.duitku.com/webapi/api/merchant/v2/inquiry";

const DUITKU_SANDBOX_CHECK_ENDPOINT = "https://sandbox.duitku.com/webapi/api/merchant/transactionStatus";
const DUITKU_PRODUCTION_CHECK_ENDPOINT = "https://passport.duitku.com/webapi/api/merchant/transactionStatus";

/**
 * Result of checking transaction status via Duitku Check Transaction API.
 */
export interface DuitkuCheckTransactionResponse {
  merchantOrderId: string;
  reference: string;
  amount: string;
  fee?: string;
  statusCode: string; // "00" = Success, "01" = Pending, "02" = Cancelled/Expired
  statusMessage: string;
}

/**
 * Generates MD5 signature for Duitku Check Transaction:
 * Formula: MD5(merchantCode + merchantOrderId + apiKey)
 */
export function generateDuitkuCheckSignature(
  merchantCode: string,
  merchantOrderId: string,
  apiKey: string
): string {
  const data = `${merchantCode}${merchantOrderId}${apiKey}`;
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Checks transaction status with Duitku Merchant API.
 * Used during retry or inquiry timeout reconciliation.
 */
export async function checkDuitkuTransaction(
  merchantOrderId: string
): Promise<DuitkuCheckTransactionResponse | null> {
  const config = getDuitkuConfig();
  const signature = generateDuitkuCheckSignature(config.merchantCode, merchantOrderId, config.apiKey);

  const checkEndpoint = config.env === "production"
    ? DUITKU_PRODUCTION_CHECK_ENDPOINT
    : DUITKU_SANDBOX_CHECK_ENDPOINT;

  const payload = {
    merchantCode: config.merchantCode,
    merchantOrderId,
    signature,
  };

  try {
    const res = await fetch(checkEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[Duitku Check] HTTP ${res.status} when checking transaction: ${merchantOrderId}`);
      return null;
    }

    const data = await res.json();
    return data as DuitkuCheckTransactionResponse;
  } catch (err) {
    console.error("[Duitku Check] Network error checking transaction:", err);
    return null;
  }
}

/**
 * Checks whether Duitku Gateway configuration is available in server environment.
 */
export function isDuitkuConfigured(): boolean {
  return Boolean(
    process.env.DUITKU_MERCHANT_CODE?.trim() && process.env.DUITKU_API_KEY?.trim()
  );
}

/**
 * Retrieves and validates Duitku configuration from environment variables.
 * Fails closed if required parameters are missing or invalid.
 */
export function getDuitkuConfig(): DuitkuConfig {
  const merchantCode = process.env.DUITKU_MERCHANT_CODE?.trim();
  const apiKey = process.env.DUITKU_API_KEY?.trim();
  const rawEnv = (process.env.DUITKU_ENV || "sandbox").trim().toLowerCase();
  const callbackUrl = process.env.DUITKU_CALLBACK_URL?.trim();
  const returnUrl = process.env.DUITKU_RETURN_URL?.trim();

  const env: "sandbox" | "production" = rawEnv === "production" ? "production" : "sandbox";

  if (!merchantCode || !apiKey) {
    throw new Error(
      "Konfigurasi Duitku belum lengkap: DUITKU_MERCHANT_CODE atau DUITKU_API_KEY belum disetel di environment server."
    );
  }

  // Fallback defaults for URLs if not explicitly specified
  const resolvedCallback = callbackUrl || "/api/payments/duitku/callback";
  const resolvedReturn = returnUrl || "/pesanan/return";
  const inquiryEndpoint = env === "production"
    ? DUITKU_PRODUCTION_INQUIRY_ENDPOINT
    : DUITKU_SANDBOX_INQUIRY_ENDPOINT;

  return {
    merchantCode,
    apiKey,
    env,
    callbackUrl: resolvedCallback,
    returnUrl: resolvedReturn,
    inquiryEndpoint,
  };
}

/**
 * Generates HMAC-SHA256 signature for Duitku v2 transaction inquiry:
 * Formula: HMAC-SHA256(merchantCode + merchantOrderId + paymentAmount + apiKey, apiKey)
 * Note: Duitku standard v2 inquiry signature combines merchantCode, merchantOrderId, amount, and apiKey.
 */
export function generateDuitkuInquirySignature(
  merchantCode: string,
  merchantOrderId: string,
  paymentAmount: number,
  apiKey: string
): string {
  const data = `${merchantCode}${merchantOrderId}${paymentAmount}${apiKey}`;
  return crypto.createHmac("sha256", apiKey).update(data).digest("hex");
}

/**
 * Generates HMAC-SHA256 signature for Duitku v2 callback:
 * Formula: HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey)
 */
export function generateDuitkuCallbackSignature(
  merchantCode: string,
  amount: string | number,
  merchantOrderId: string,
  apiKey: string
): string {
  const data = `${merchantCode}${amount}${merchantOrderId}`;
  return crypto.createHmac("sha256", apiKey).update(data).digest("hex");
}

/**
 * Validates the callback signature using timingSafeEqual to guard against timing attacks.
 */
export function verifyDuitkuCallbackSignature(
  payload: {
    merchantCode: string;
    amount: string | number;
    merchantOrderId: string;
    signature: string;
  },
  apiKey: string
): boolean {
  if (!payload.signature || !apiKey) return false;

  const expectedSignature = generateDuitkuCallbackSignature(
    payload.merchantCode,
    payload.amount,
    payload.merchantOrderId,
    apiKey
  );

  const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), "utf-8");
  const receivedBuffer = Buffer.from(payload.signature.toLowerCase(), "utf-8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Requests an invoice/payment link from Duitku Merchant API v2.
 * Safely wraps API calls and prevents credential leaks in error messages.
 */
export async function createDuitkuTransaction(
  req: DuitkuInquiryRequest
): Promise<DuitkuInquiryResponse> {
  const config = getDuitkuConfig();
  const signature = generateDuitkuInquirySignature(
    config.merchantCode,
    req.merchantOrderId,
    req.paymentAmount,
    config.apiKey
  );

  const payload = {
    merchantCode: config.merchantCode,
    paymentAmount: req.paymentAmount,
    merchantOrderId: req.merchantOrderId,
    productDetails: req.productDetails,
    email: req.email,
    phoneNumber: req.phoneNumber || "",
    additionalParam: "",
    merchantUserInfo: "",
    customerVaName: req.customerVaName,
    callbackUrl: config.callbackUrl,
    returnUrl: config.returnUrl,
    signature,
    expiryPeriod: req.expiryPeriod || 30, // 30 mins default
    ...(req.paymentMethod ? { paymentMethod: req.paymentMethod } : {}),
  };

  try {
    const res = await fetch(config.inquiryEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await res.json();

    if (!res.ok || responseData.statusCode !== "00") {
      const errMsg = responseData.statusMessage || `Duitku API error (${responseData.statusCode || res.status})`;
      // Log generic error server-side without leaking config.apiKey
      console.error("[Duitku Inquiry] Request failed:", {
        merchantOrderId: req.merchantOrderId,
        statusCode: responseData.statusCode,
        statusMessage: responseData.statusMessage,
      });
      throw new Error(`Gagal memproses pembayaran Duitku: ${errMsg}`);
    }

    return responseData as DuitkuInquiryResponse;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Gagal memproses pembayaran Duitku")) {
      throw error;
    }
    console.error("[Duitku Inquiry] Network or unexpected exception");
    throw new Error("Gagal menghubungi gateway pembayaran Duitku. Silakan coba lagi.");
  }
}
