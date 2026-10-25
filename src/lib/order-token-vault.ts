"use client";

const TOKEN_VAULT_KEY = "temu_order_tokens_v1";

/**
 * Saves a secret order access token to the local client token vault.
 * Keyed by orderId (e.g. "TJ-261025-006").
 */
export function saveOrderToken(orderId: string, token: string): void {
  if (typeof window === "undefined" || !orderId || !token) return;
  try {
    const raw = localStorage.getItem(TOKEN_VAULT_KEY);
    const vault: Record<string, string> = raw ? JSON.parse(raw) : {};
    vault[orderId] = token;
    localStorage.setItem(TOKEN_VAULT_KEY, JSON.stringify(vault));
  } catch {
    // Ignore storage write errors (quota, private browsing)
  }
}

/**
 * Retrieves a stored secret order access token by orderId.
 */
export function getOrderToken(orderId: string): string | null {
  if (typeof window === "undefined" || !orderId) return null;
  try {
    const raw = localStorage.getItem(TOKEN_VAULT_KEY);
    if (!raw) return null;
    const vault: Record<string, string> = JSON.parse(raw);
    return vault[orderId] || null;
  } catch {
    return null;
  }
}

/**
 * Retrieves all stored order tokens as an array of tokens.
 */
export function getAllOrderTokens(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TOKEN_VAULT_KEY);
    if (!raw) return [];
    const vault: Record<string, string> = JSON.parse(raw);
    return Object.values(vault).filter(
      (t): t is string => typeof t === "string" && t.length >= 8
    );
  } catch {
    return [];
  }
}

/**
 * Finds an orderId associated with a specific token in the local vault.
 */
export function getOrderIdByToken(token: string): string | null {
  if (typeof window === "undefined" || !token) return null;
  try {
    const raw = localStorage.getItem(TOKEN_VAULT_KEY);
    if (!raw) return null;
    const vault: Record<string, string> = JSON.parse(raw);
    for (const [id, t] of Object.entries(vault)) {
      if (t === token) return id;
    }
    return null;
  } catch {
    return null;
  }
}
