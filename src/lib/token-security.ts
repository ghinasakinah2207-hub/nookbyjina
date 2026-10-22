import crypto from "crypto";

/**
 * Generates a cryptographically secure, high-entropy random token for customer order access.
 * Returns a URL-safe random string with 32+ characters.
 */
export function generateSecureOrderToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Computes a SHA-256 hash of the raw order token.
 * This hash is stored in the database (anonymous_order_tokens.token_hash)
 * so that raw tokens are never persisted in plaintext in the database.
 */
export function hashOrderToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length < 8) {
    throw new Error("Token tidak valid untuk di-hash.");
  }
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

/**
 * Validates whether a token string meets minimum entropy and format requirements.
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") return false;
  const clean = token.trim();
  return clean.length >= 16 && /^[a-zA-Z0-9_\-]+$/.test(clean);
}
