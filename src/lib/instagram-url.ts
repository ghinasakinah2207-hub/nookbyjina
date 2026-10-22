/**
 * Instagram URL utilities: validation, normalization, and handle extraction.
 */

export interface InstagramUrlValidationResult {
  isValid: boolean;
  normalized: string;
  handle?: string;
  error?: string;
}

/**
 * Normalizes and validates an Instagram profile URL.
 * - Accepts empty / whitespace: returns valid empty string (unconfigured).
 * - Accepts formats like:
 *   - https://www.instagram.com/nookbyjina/
 *   - https://instagram.com/nookbyjina
 *   - http://instagram.com/nookbyjina
 *   - instagram.com/nookbyjina
 *   - www.instagram.com/nookbyjina
 *   - @nookbyjina
 * - Rejects non-instagram domains or invalid handles.
 */
export function normalizeInstagramUrl(
  input?: string | null
): InstagramUrlValidationResult {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return { isValid: true, normalized: "", handle: "" };
  }

  let candidate = trimmed;

  // Handle @username shorthand
  if (candidate.startsWith("@")) {
    const handleOnly = candidate.slice(1).trim();
    if (/^[a-zA-Z0-9._]{1,30}$/.test(handleOnly)) {
      return {
        isValid: true,
        normalized: `https://www.instagram.com/${handleOnly}/`,
        handle: `@${handleOnly}`,
      };
    }
    return {
      isValid: false,
      normalized: "",
      error:
        "Nama profil Instagram tidak valid. Gunakan 1-30 karakter (huruf, angka, titik, atau garis bawah).",
    };
  }

  // Prepend protocol if missing
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host !== "instagram.com") {
      return {
        isValid: false,
        normalized: "",
        error:
          "Link Instagram harus menggunakan domain instagram.com (contoh: https://www.instagram.com/yourhandle/).",
      };
    }

    // Clean pathname
    const cleanPath = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!cleanPath) {
      return {
        isValid: false,
        normalized: "",
        error:
          "Link harus menyertakan nama profil Instagram (contoh: https://www.instagram.com/yourhandle/).",
      };
    }

    // Extract first path segment as username
    const segments = cleanPath.split("/").filter(Boolean);
    const username = segments[0];

    // Reject reserved non-profile routes if exact
    const reservedRoutes = new Set([
      "explore",
      "reels",
      "stories",
      "p",
      "direct",
      "accounts",
      "about",
      "legal",
    ]);

    if (reservedRoutes.has(username.toLowerCase())) {
      return {
        isValid: false,
        normalized: "",
        error:
          "Tautan bukan merupakan profil Instagram toko yang valid.",
      };
    }

    // Validate Instagram username format
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
      return {
        isValid: false,
        normalized: "",
        error:
          "Nama profil Instagram tidak valid. Gunakan 1-30 karakter (huruf, angka, titik, atau garis bawah).",
      };
    }

    return {
      isValid: true,
      normalized: `https://www.instagram.com/${username}/`,
      handle: `@${username}`,
    };
  } catch {
    return {
      isValid: false,
      normalized: "",
      error:
        "Format link Instagram tidak valid. Contoh: https://www.instagram.com/yourhandle/",
    };
  }
}
