/**
 * Utility functions for Indonesian phone number validation and normalization.
 */

/**
 * Normalizes an Indonesian phone number to international format (628...).
 * Handles inputs like:
 * - "081234567890" -> "6281234567890"
 * - "+6281234567890" -> "6281234567890"
 * - "6281234567890" -> "6281234567890"
 * - "+62 812-3456-7890" -> "6281234567890"
 * - "81234567890" -> "6281234567890"
 * - Accidental duplicate prefix "62628..." -> "628..."
 * - Accidental "+6208..." -> "628..."
 */
export function normalizeIndonesianPhone(phone: string): string {
  if (!phone) return "";
  let digits = phone.trim().replace(/[^0-9]/g, "");

  // Prevent duplicate country code like 6262...
  while (digits.startsWith("6262")) {
    digits = digits.slice(2);
  }

  // Handle +6208... (where digits became 6208...)
  if (digits.startsWith("6208")) {
    digits = "62" + digits.slice(3);
  }

  // Handle standard prefixes
  if (digits.startsWith("08")) {
    digits = "62" + digits.slice(1);
  } else if (digits.startsWith("8")) {
    digits = "62" + digits;
  }

  return digits;
}

/**
 * Validates Indonesian mobile phone number.
 * Standard Indonesian mobile numbers:
 * - In local format: starts with 08, 10 to 14 digits (e.g. 081234567890)
 * - In international format: starts with 628, 11 to 15 digits (e.g. 6281234567890)
 */
export function validateIndonesianPhone(phone: string): {
  isValid: boolean;
  error?: string;
  normalized: string;
} {
  const trimmed = phone.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: "Nomor WhatsApp aktif wajib diisi.",
      normalized: "",
    };
  }

  const normalized = normalizeIndonesianPhone(trimmed);

  // Indonesian mobile numbers in international format start with 628 followed by 8 to 12 digits (total 11 to 15 digits).
  // Some valid operator numbers might be 10 digits total (e.g. 62811xxxxxx, local 0811xxxxxx is 10 digits).
  // Regex matches 628 followed by a non-zero digit and 6 to 11 more digits (total 10 to 15 digits).
  const isIndonesianMobile = /^628[1-9][0-9]{6,11}$/.test(normalized);

  if (!isIndonesianMobile) {
    return {
      isValid: false,
      error:
        "Nomor WhatsApp harus berupa nomor HP aktif (contoh: 081234567890).",
      normalized,
    };
  }

  return {
    isValid: true,
    normalized,
  };
}
