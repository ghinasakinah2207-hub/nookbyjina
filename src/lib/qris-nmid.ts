/**
 * Utility to extract National Merchant ID (NMID) from Indonesian QRIS EMVCo payloads.
 *
 * QRIS EMVCo Specification (ASPI / Bank Indonesia):
 * - Tags 26-51: Merchant Account Information Template
 * - Sub-tag 02 (or 01 in legacy templates): NMID (starts with "ID", followed by 9-16 characters)
 */

export function extractNmidFromQris(qrisPayload?: string | null): string | null {
  if (!qrisPayload || typeof qrisPayload !== "string") return null;
  const str = qrisPayload.trim();

  // Mode sandbox test string
  if (str.startsWith("WAROENGPAY-TEST")) return null;

  try {
    let index = 0;
    while (index < str.length - 4) {
      const tag = str.substring(index, index + 2);
      const length = parseInt(str.substring(index + 2, index + 4), 10);
      if (isNaN(length) || length <= 0) break;
      const valueStart = index + 4;
      const valueEnd = valueStart + length;
      if (valueEnd > str.length) break;
      const value = str.substring(valueStart, valueEnd);

      const tagNum = parseInt(tag, 10);
      // Tags 26 to 51 are Merchant Account Information
      if (tagNum >= 26 && tagNum <= 51) {
        let subIndex = 0;
        while (subIndex < value.length - 4) {
          const subTag = value.substring(subIndex, subIndex + 2);
          const subLen = parseInt(value.substring(subIndex + 2, subIndex + 4), 10);
          if (isNaN(subLen) || subLen <= 0) break;
          const subValStart = subIndex + 4;
          const subValEnd = subValStart + subLen;
          if (subValEnd > value.length) break;
          const subVal = value.substring(subValStart, subValEnd);

          // Subtag 02 is standardized for NMID in QRIS MPM
          if ((subTag === "02" || subTag === "01") && /^ID[0-9A-Z]{8,18}$/i.test(subVal)) {
            return subVal;
          }
          subIndex = subValEnd;
        }

        // Direct regex check within the merchant info value
        const directMatch = value.match(/ID[0-9]{9,15}/i);
        if (directMatch) {
          return directMatch[0];
        }
      }

      index = valueEnd;
    }
  } catch {
    // Graceful fallback on malformed string
  }

  // Fallback regex scan for NMID pattern
  const fallbackMatch = str.match(/ID[0-9]{10,15}/);
  if (fallbackMatch) {
    return fallbackMatch[0];
  }

  return null;
}
