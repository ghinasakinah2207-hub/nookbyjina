/**
 * Supabase Storage path parsing, canonical normalization, and security helpers.
 * Pure utility functions kept separate from "use server" action files.
 */

export interface StorageObjectIdentity {
  bucket: string;
  path: string;
}

/** Allowed prefixes for safe cleanup operations */
export const ALLOWED_STORAGE_PREFIXES = ["products", "banners"] as const;

/**
 * Safely decodes URI components, returning original string if decoding fails.
 */
function safeDecodeUriComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Cleans and canonicalizes an object path:
 * - Strips query parameters (?token=..., ?v=...)
 * - Strips hash fragments (#...)
 * - Safely decodes percent-encoded characters (%20 -> ' ', etc.)
 * - Replaces consecutive duplicate slashes (// -> /)
 * - Trims leading and trailing whitespace and slashes
 */
export function normalizeStoragePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== "string") return "";

  // 1. Strip hash and query string
  let cleaned = rawPath.split("#")[0].split("?")[0].trim();

  // 2. Decode percent-encoding
  cleaned = safeDecodeUriComponent(cleaned);

  // 3. Normalize multiple slashes to single slash
  cleaned = cleaned.replace(/\/+/g, "/");

  // 4. Strip leading and trailing slashes
  cleaned = cleaned.replace(/^\/+|\/+$/g, "");

  return cleaned;
}

/**
 * Parses any Supabase Storage URL (public, signed, authenticated, or direct)
 * and returns its canonical bucket and object path.
 *
 * Explicitly rejects:
 * - Local static repository assets (/images/..., public/...)
 * - Data URLs (data:image/...)
 * - Blob URLs (blob:...)
 * - External URLs not belonging to Supabase Storage
 */
export function extractStorageIdentity(
  url: string,
  expectedBucket = "store-assets"
): StorageObjectIdentity | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  // 1. Filter out static repo assets and non-storage formats
  if (
    trimmed.startsWith("/images/") ||
    trimmed.startsWith("/public/") ||
    trimmed.startsWith("public/") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return null;
  }

  // 2. Patterns supported:
  // a) /storage/v1/object/public/<bucket>/<path>
  // b) /storage/v1/object/sign/<bucket>/<path>
  // c) /storage/v1/object/authenticated/<bucket>/<path>
  // d) /storage/v1/object/<bucket>/<path>
  const storagePatterns = [
    `/storage/v1/object/public/`,
    `/storage/v1/object/sign/`,
    `/storage/v1/object/authenticated/`,
    `/storage/v1/object/`,
  ];

  for (const pattern of storagePatterns) {
    const idx = trimmed.indexOf(pattern);
    if (idx !== -1) {
      const rest = trimmed.slice(idx + pattern.length);
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) return null;

      const bucket = rest.slice(0, slashIdx);
      const rawPath = rest.slice(slashIdx + 1);
      const canonicalPath = normalizeStoragePath(rawPath);

      if (!canonicalPath) return null;

      return {
        bucket,
        path: canonicalPath,
      };
    }
  }

  // 3. Relative bucket path format: "<bucket>/<path>" (e.g. "store-assets/products/...")
  if (trimmed.startsWith(`${expectedBucket}/`)) {
    const rawPath = trimmed.slice(expectedBucket.length + 1);
    const canonicalPath = normalizeStoragePath(rawPath);
    if (canonicalPath) {
      return {
        bucket: expectedBucket,
        path: canonicalPath,
      };
    }
  }

  // 4. Raw object path with allowed prefix: e.g. "products/xyz.webp"
  const normalized = normalizeStoragePath(trimmed);
  for (const prefix of ALLOWED_STORAGE_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return {
        bucket: expectedBucket,
        path: normalized,
      };
    }
  }

  return null;
}

/**
 * Extracts the canonical object path within a specific bucket.
 * Returns null if the URL is not in the expected bucket.
 */
export function extractStoragePathFromUrl(
  url: string,
  bucket = "store-assets"
): string | null {
  const identity = extractStorageIdentity(url, bucket);
  if (!identity) return null;
  if (identity.bucket !== bucket) return null;
  return identity.path;
}

/**
 * Checks if two URLs or paths point to the exact same storage object.
 * Completely immune to substring collisions or protocol/host differences.
 */
export function isSameStorageObject(
  urlOrPathA: string,
  urlOrPathB: string,
  bucket = "store-assets"
): boolean {
  const pathA = extractStoragePathFromUrl(urlOrPathA, bucket);
  const pathB = extractStoragePathFromUrl(urlOrPathB, bucket);

  if (!pathA || !pathB) return false;
  return pathA === pathB;
}

/**
 * Verifies that a storage path resides inside one of the whitelisted prefixes.
 * Prevents traversal attacks (e.g. "../", root bucket deletion).
 */
export function isAllowedStoragePrefix(
  path: string,
  allowedPrefixes: readonly string[] = ALLOWED_STORAGE_PREFIXES
): boolean {
  if (!path || path.includes("..") || path.startsWith("/")) return false;
  const normalized = normalizeStoragePath(path);
  return allowedPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/**
 * Generates exact URL representations of a storage path for exact DB matching.
 */
export function getExactStorageUrlVariants(
  canonicalPath: string,
  bucket = "store-assets",
  supabaseUrl?: string
): string[] {
  const cleanPath = normalizeStoragePath(canonicalPath);
  if (!cleanPath) return [];

  const variants = new Set<string>();

  // 1. Raw canonical path
  variants.add(cleanPath);

  // 2. Relative API paths
  variants.add(`/storage/v1/object/public/${bucket}/${cleanPath}`);
  variants.add(`/storage/v1/object/${bucket}/${cleanPath}`);
  variants.add(`${bucket}/${cleanPath}`);

  // 3. Full URL if supabaseUrl is provided
  if (supabaseUrl) {
    const trimmedBase = supabaseUrl.replace(/\/+$/, "");
    variants.add(`${trimmedBase}/storage/v1/object/public/${bucket}/${cleanPath}`);
    variants.add(`${trimmedBase}/storage/v1/object/${bucket}/${cleanPath}`);
  }

  return Array.from(variants);
}
