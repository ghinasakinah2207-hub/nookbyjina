import fs from "fs";
import path from "path";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  extractStoragePathFromUrl,
  normalizeStoragePath,
  isAllowedStoragePrefix,
} from "./storage-utils";

/**
 * ARCHITECTURAL NOTICE REGARDING VERCEL / SERVERLESS DURABILITY:
 * Vercel Serverless Functions execute in stateless, ephemeral microVM containers.
 * The filesystem is read-only outside /tmp, and /tmp is strictly scoped to a single container
 * instance that is recycled on cold starts.
 *
 * Therefore, local filesystem storage (.data/ or /tmp) is NOT durable in cloud production.
 * True cloud-native persistence for storage cleanup retries requires the Supabase PostgreSQL
 * table 'storage_cleanup_queue' (defined in supabase/migrations/20261028180000_create_storage_cleanup_queue.sql).
 *
 * In local development and automated test runners, the local file store below provides
 * a functional fallback, but the application explicitly alerts the admin if the database
 * queue table is missing in production.
 */

export type StorageCleanupStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface StorageCleanupItem {
  id: string;
  bucket: string;
  filePath: string;
  status: StorageCleanupStatus;
  retryCount: number;
  maxRetries: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueResult {
  items: StorageCleanupItem[];
  isDatabaseQueueAvailable: boolean;
  warning?: string;
}

const LOCAL_QUEUE_DIR = path.join(process.cwd(), ".data");
const LOCAL_QUEUE_FILE = path.join(LOCAL_QUEUE_DIR, "storage-cleanup-queue.json");

/**
 * Reads local fallback queue file if database table does not exist.
 * Used for local testing and dev environments.
 */
function readLocalQueue(): StorageCleanupItem[] {
  try {
    if (!fs.existsSync(LOCAL_QUEUE_FILE)) return [];
    const content = fs.readFileSync(LOCAL_QUEUE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Writes local fallback queue file.
 */
function writeLocalQueue(items: StorageCleanupItem[]): void {
  try {
    if (!fs.existsSync(LOCAL_QUEUE_DIR)) {
      fs.mkdirSync(LOCAL_QUEUE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_QUEUE_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch {
    // Non-fatal fallback for read-only serverless environments
  }
}

/**
 * Verifies whether the PostgreSQL table `storage_cleanup_queue` exists in Supabase.
 */
export async function doesQueueTableExist(client: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await client
      .from("storage_cleanup_queue")
      .select("id")
      .limit(1);

    if (error && (error.code === "42P01" || error.message?.includes("does not exist"))) {
      return false;
    }
    return !error;
  } catch {
    return false;
  }
}

/**
 * Enqueues storage file paths for cleanup with persistent tracking.
 * Returns both the generated queue items and a status indicating whether
 * durable PostgreSQL storage is active.
 */
export async function enqueueStorageCleanup(
  client: SupabaseClient,
  items: { bucket?: string; filePath: string }[]
): Promise<EnqueueResult> {
  const now = new Date().toISOString();
  const validItems: StorageCleanupItem[] = [];

  for (const item of items) {
    const bucket = item.bucket || "store-assets";
    const cleanPath = normalizeStoragePath(item.filePath);

    if (!cleanPath || !isAllowedStoragePrefix(cleanPath)) continue;

    validItems.push({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`,
      bucket,
      filePath: cleanPath,
      status: "pending",
      retryCount: 0,
      maxRetries: 5,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (validItems.length === 0) {
    return { items: [], isDatabaseQueueAvailable: true };
  }

  const tableExists = await doesQueueTableExist(client);

  if (tableExists) {
    let hasUpsertError = false;
    let lastErrMsg = "";

    for (const item of validItems) {
      const { error: upsertErr } = await client.from("storage_cleanup_queue").upsert(
        {
          id: item.id,
          bucket: item.bucket,
          file_path: item.filePath,
          status: item.status,
          retry_count: 0,
          max_retries: item.maxRetries,
          error_message: null,
          last_attempt_at: null,
          next_attempt_at: item.nextAttemptAt,
          updated_at: now,
        },
        { onConflict: "bucket, file_path" }
      );

      if (upsertErr) {
        hasUpsertError = true;
        lastErrMsg = upsertErr.message;
      }
    }

    if (hasUpsertError) {
      return {
        items: validItems,
        isDatabaseQueueAvailable: false,
        warning: `Gagal memperbarui antrean database: ${lastErrMsg}`,
      };
    }

    return { items: validItems, isDatabaseQueueAvailable: true };
  }

  // Fallback for local development and test environments
  const localItems = readLocalQueue();
  const returnedItems: StorageCleanupItem[] = [];

  for (const newItem of validItems) {
    const existingIdx = localItems.findIndex(
      (x) => x.bucket === newItem.bucket && x.filePath === newItem.filePath
    );
    if (existingIdx !== -1) {
      localItems[existingIdx].id = newItem.id;
      localItems[existingIdx].status = "pending";
      localItems[existingIdx].retryCount = 0;
      localItems[existingIdx].maxRetries = newItem.maxRetries;
      delete localItems[existingIdx].errorMessage;
      delete localItems[existingIdx].lastAttemptAt;
      localItems[existingIdx].nextAttemptAt = now;
      localItems[existingIdx].updatedAt = now;
      returnedItems.push(localItems[existingIdx]);
    } else {
      localItems.push(newItem);
      returnedItems.push(newItem);
    }
  }
  writeLocalQueue(localItems);

  return {
    items: returnedItems,
    isDatabaseQueueAvailable: false,
    warning:
      "Tabel database 'storage_cleanup_queue' belum tersedia di Supabase. File sistem lokal (.data) tidak persisten di serverless cloud Vercel. Jalankan migrasi SQL antrean untuk persistensi cloud.",
  };
}

/**
 * Retrieves pending or failed items from the queue ready for retry.
 * Supports atomic worker claiming via RPC 'claim_storage_cleanup_jobs' if installed,
 * with standard SELECT query fallback.
 */
export async function getPendingStorageCleanups(
  client: SupabaseClient,
  batchSize = 20,
  filePaths?: string[]
): Promise<StorageCleanupItem[]> {
  const tableExists = await doesQueueTableExist(client);

  if (tableExists) {
    // Attempt atomic RPC claiming first (avoids worker collision & recovers stuck jobs)
    try {
      const rpcParams: { p_batch_size: number; p_file_paths?: string[] | null } = {
        p_batch_size: batchSize,
      };
      if (filePaths && filePaths.length > 0) {
        rpcParams.p_file_paths = filePaths;
      }

      const { data: rpcData, error: rpcErr } = await client.rpc(
        "claim_storage_cleanup_jobs",
        rpcParams
      );

      if (!rpcErr && rpcData && Array.isArray(rpcData)) {
        return rpcData.map((d: Record<string, unknown>) => ({
          id: String(d.id),
          bucket: String(d.bucket || "store-assets"),
          filePath: String(d.file_path),
          status: d.status as StorageCleanupStatus,
          retryCount: Number(d.retry_count || 0),
          maxRetries: Number(d.max_retries || 5),
          lastAttemptAt: d.last_attempt_at ? String(d.last_attempt_at) : undefined,
          nextAttemptAt: d.next_attempt_at ? String(d.next_attempt_at) : undefined,
          errorMessage: d.error_message ? String(d.error_message) : undefined,
          createdAt: String(d.created_at),
          updatedAt: String(d.updated_at),
        }));
      }
    } catch {
      // Fallback to table query if RPC is not present
    }

    let query = client
      .from("storage_cleanup_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .lt("retry_count", 5)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (filePaths && filePaths.length > 0) {
      query = query.in("file_path", filePaths);
    }

    const { data, error } = await query;

    if (!error && data) {
      return data.map((d) => ({
        id: d.id,
        bucket: d.bucket,
        filePath: d.file_path,
        status: d.status,
        retryCount: d.retry_count,
        maxRetries: d.max_retries,
        lastAttemptAt: d.last_attempt_at,
        nextAttemptAt: d.next_attempt_at,
        errorMessage: d.error_message,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }
  }

  // Fallback to local file queue in dev
  const localItems = readLocalQueue();
  let filtered = localItems.filter(
    (x) => (x.status === "pending" || x.status === "failed") && x.retryCount < x.maxRetries
  );
  if (filePaths && filePaths.length > 0) {
    const pathSet = new Set(filePaths);
    filtered = filtered.filter((x) => pathSet.has(x.filePath));
  }
  return filtered;
}

/**
 * Updates the status and attempt statistics of a queue item.
 */
export async function updateStorageCleanupStatus(
  client: SupabaseClient,
  id: string,
  status: StorageCleanupStatus,
  error?: string
): Promise<void> {
  const now = new Date().toISOString();
  const tableExists = await doesQueueTableExist(client);

  if (tableExists) {
    const updatePayload: Record<string, unknown> = {
      status,
      last_attempt_at: now,
      updated_at: now,
    };
    if (error !== undefined) {
      updatePayload.error_message = error;
    }
    if (status === "failed") {
      const { data } = await client
        .from("storage_cleanup_queue")
        .select("retry_count, max_retries")
        .eq("id", id)
        .maybeSingle();

      const maxRetries = data?.max_retries ?? 5;
      const newCount = (data?.retry_count ?? 0) + 1;
      updatePayload.retry_count = newCount;

      if (newCount >= maxRetries) {
        updatePayload.error_message = `Max retries (${maxRetries}) exceeded: ${error || "Unknown error"}`;
        updatePayload.next_attempt_at = null;
      } else {
        const nextDelaySeconds = Math.min(300, Math.pow(2, newCount) * 10);
        updatePayload.next_attempt_at = new Date(Date.now() + nextDelaySeconds * 1000).toISOString();
      }
    }

    await client.from("storage_cleanup_queue").update(updatePayload).eq("id", id);
    return;
  }

  // Fallback to local queue in dev
  const localItems = readLocalQueue();
  const idx = localItems.findIndex((x) => x.id === id);
  if (idx !== -1) {
    localItems[idx].status = status;
    localItems[idx].lastAttemptAt = now;
    localItems[idx].updatedAt = now;
    if (error !== undefined) localItems[idx].errorMessage = error;
    if (status === "failed") {
      const maxRetries = localItems[idx].maxRetries || 5;
      localItems[idx].retryCount += 1;
      if (localItems[idx].retryCount >= maxRetries) {
        localItems[idx].errorMessage = `Max retries (${maxRetries}) exceeded: ${error || "Unknown error"}`;
        delete localItems[idx].nextAttemptAt;
      } else {
        const nextDelaySeconds = Math.min(300, Math.pow(2, localItems[idx].retryCount) * 10);
        localItems[idx].nextAttemptAt = new Date(Date.now() + nextDelaySeconds * 1000).toISOString();
      }
    }
    writeLocalQueue(localItems);
  }
}

/**
 * Exhaustive reference audit across all relevant database tables:
 * 1. product_images (image_url)
 * 2. home_banners (image_url)
 * 3. store_settings (store_logo_url, qris_image_url)
 * 4. categories (image_url, icon)
 *
 * Uses precise canonical path normalization, eliminating substring collision bugs.
 */
export async function auditLiveReferences(
  client: SupabaseClient,
  canonicalPath: string,
  bucket = "store-assets",
  excludeProductId?: string
): Promise<{ isReferenced: boolean; references: string[] }> {
  const references: string[] = [];
  const cleanTarget = normalizeStoragePath(canonicalPath);

  if (!cleanTarget) return { isReferenced: false, references: [] };

  // 1. Inspect product_images
  let prodQuery = client.from("product_images").select("id, product_id, image_url");
  if (excludeProductId) {
    prodQuery = prodQuery.neq("product_id", excludeProductId);
  }

  const { data: prodImages } = await prodQuery;
  if (prodImages) {
    for (const row of prodImages) {
      if (row.image_url) {
        const rowPath = extractStoragePathFromUrl(row.image_url, bucket);
        if (rowPath === cleanTarget) {
          references.push(`product_images(product_id: ${row.product_id})`);
        }
      }
    }
  }

  // 2. Inspect home_banners
  const { data: banners } = await client
    .from("home_banners")
    .select("id, title, image_url");

  if (banners) {
    for (const banner of banners) {
      if (banner.image_url) {
        const rowPath = extractStoragePathFromUrl(banner.image_url, bucket);
        if (rowPath === cleanTarget) {
          references.push(`home_banners(id: ${banner.id}, title: ${banner.title})`);
        }
      }
    }
  }

  // 3. Inspect store_settings
  const { data: settings } = await client
    .from("store_settings")
    .select("store_logo_url, qris_image_url")
    .maybeSingle();

  if (settings) {
    if (settings.store_logo_url) {
      const logoPath = extractStoragePathFromUrl(settings.store_logo_url, bucket);
      if (logoPath === cleanTarget) {
        references.push("store_settings(store_logo_url)");
      }
    }
    if (settings.qris_image_url) {
      const qrisPath = extractStoragePathFromUrl(settings.qris_image_url, bucket);
      if (qrisPath === cleanTarget) {
        references.push("store_settings(qris_image_url)");
      }
    }
  }

  // 4. Inspect categories
  const { data: categories } = await client
    .from("categories")
    .select("id, name, image_url, icon");

  if (categories) {
    for (const cat of categories) {
      if (cat.image_url) {
        const catImgPath = extractStoragePathFromUrl(cat.image_url, bucket);
        if (catImgPath === cleanTarget) {
          references.push(`categories(id: ${cat.id}, name: ${cat.name})`);
        }
      }
      if (cat.icon && cat.icon.includes("/")) {
        const catIconPath = extractStoragePathFromUrl(cat.icon, bucket);
        if (catIconPath === cleanTarget) {
          references.push(`categories(id: ${cat.id}, icon: ${cat.icon})`);
        }
      }
    }
  }

  return {
    isReferenced: references.length > 0,
    references,
  };
}
