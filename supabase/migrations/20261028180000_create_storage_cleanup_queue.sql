-- ==============================================================================
-- Migration: Create storage_cleanup_queue table & coordinated claiming RPC
-- Purpose: Persistent, durable queue for storage file cleanup retries,
--          concurrency coordination, and auditing in NOOK BY JINA.
-- Note: This migration is prepared for owner review. DO NOT apply to production
--       automatically without explicit owner confirmation.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket TEXT NOT NULL DEFAULT 'store-assets',
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_storage_cleanup_queue_bucket_path UNIQUE (bucket, file_path)
);

-- Fast index for queue processing by status and next_attempt_at
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_queue_processing
    ON public.storage_cleanup_queue(status, next_attempt_at);

-- Row Level Security
ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

-- Allow only service-role callers to view and manage cleanup jobs
CREATE POLICY "Service role full access to storage_cleanup_queue"
    ON public.storage_cleanup_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- Function: claim_storage_cleanup_jobs
-- Purpose: Safely claims a batch of pending/failed cleanup jobs using
--          FOR UPDATE SKIP LOCKED to prevent concurrent worker collisions.
--          Automatically recovers jobs stuck in 'processing' for > 5 minutes,
--          transitioning jobs at max_retries to permanent 'failed'.
-- Security: SECURITY DEFINER with strict search_path = pg_catalog.
--           All application objects are explicitly qualified with public schema.
--           Executable ONLY by service_role (revoked from public, anon, authenticated).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.claim_storage_cleanup_jobs(
    p_batch_size INT DEFAULT 10,
    p_file_paths TEXT[] DEFAULT NULL
)
RETURNS SETOF public.storage_cleanup_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    -- 1. Recover stuck processing jobs whose worker likely crashed/timed out (> 5 minutes)
    --    Uses FOR UPDATE SKIP LOCKED to prevent concurrent recovery collisions.
    WITH stuck_jobs AS (
        SELECT id, retry_count, max_retries
        FROM public.storage_cleanup_queue
        WHERE status = 'processing'
          AND last_attempt_at < clock_timestamp() - INTERVAL '5 minutes'
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.storage_cleanup_queue q
    SET status = CASE
            WHEN q.retry_count + 1 >= q.max_retries THEN 'failed'
            ELSE 'pending'
        END,
        retry_count = q.retry_count + 1,
        error_message = CASE
            WHEN q.retry_count + 1 >= q.max_retries THEN 'Worker timed out in processing state (max retries reached)'
            ELSE 'Worker timed out in processing state; automatically returned to pending queue'
        END,
        next_attempt_at = clock_timestamp() + INTERVAL '15 seconds',
        updated_at = clock_timestamp()
    FROM stuck_jobs
    WHERE q.id = stuck_jobs.id;

    -- 2. Atomically select and claim available jobs avoiding concurrent worker collisions
    RETURN QUERY
    WITH claimable AS (
        SELECT id
        FROM public.storage_cleanup_queue
        WHERE (status = 'pending' OR status = 'failed')
          AND retry_count < max_retries
          AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp())
          AND (p_file_paths IS NULL OR file_path = ANY(p_file_paths))
        ORDER BY created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.storage_cleanup_queue q
    SET status = 'processing',
        last_attempt_at = clock_timestamp(),
        updated_at = clock_timestamp()
    FROM claimable
    WHERE q.id = claimable.id
    RETURNING q.*;
END;
$$;

-- Revoke execute from public/anon/authenticated to maintain strict service-role isolation
REVOKE ALL ON FUNCTION public.claim_storage_cleanup_jobs(INT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_storage_cleanup_jobs(INT, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_cleanup_jobs(INT, TEXT[]) TO service_role;
