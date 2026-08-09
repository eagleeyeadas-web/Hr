-- ============================================================
-- MIGRATION: Push Notification Trigger via pg_net
-- File: supabase/migrations/20260809_push_trigger_pg_net.sql
-- ============================================================
--
-- SAFE TO COMMIT TO GIT.
-- Contains NO secrets, NO hardcoded keys.
--
-- The service_role key is read at runtime from the PostgreSQL
-- database setting 'app.settings.service_role_key', which
-- Supabase automatically configures on every project.
-- You do NOT need to paste any key into this file.
--
-- HOW TO RUN:
--   Paste this entire file into Supabase Dashboard > SQL Editor
--   and click Run. It is safe to run multiple times.
-- ============================================================


-- ============================================================
-- STEP 1: Enable pg_net extension
-- ============================================================
-- pg_net provides net.http_post() for async HTTP from PostgreSQL.
-- Safe to run even if already enabled (IF NOT EXISTS).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;


-- ============================================================
-- STEP 2: Verify pg_net loaded successfully
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    RAISE EXCEPTION
      '[PUSH TRIGGER] FATAL: pg_net extension failed to load. '
      'Enable it from Supabase Dashboard -> Database -> Extensions -> pg_net '
      'then re-run this migration.';
  END IF;
  RAISE LOG '[PUSH TRIGGER] pg_net is available.';
END;
$$;


-- ============================================================
-- STEP 3: Add endpoint column to push_subscriptions if missing
-- ============================================================
-- The push.js frontend code sends onConflict: "endpoint" but
-- the original table had no endpoint column, causing duplicate
-- subscription rows. This adds the column, backfills it from
-- the existing subscription JSONB, deduplicates stale rows,
-- and adds a UNIQUE constraint.
-- ============================================================

-- 3a. Add column (idempotent)
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint TEXT;

-- 3b. Backfill from existing subscription JSON
UPDATE public.push_subscriptions
  SET endpoint = subscription->>'endpoint'
  WHERE endpoint IS NULL
    AND subscription->>'endpoint' IS NOT NULL;

-- 3c. Remove duplicate rows keeping the most recently created
--     one per endpoint (safe — deduplication before constraint)
DELETE FROM public.push_subscriptions
  WHERE id NOT IN (
    SELECT DISTINCT ON (subscription->>'endpoint') id
    FROM public.push_subscriptions
    WHERE subscription->>'endpoint' IS NOT NULL
    ORDER BY subscription->>'endpoint', created_at DESC
  )
  AND subscription->>'endpoint' IS NOT NULL;

-- 3d. Add unique constraint on endpoint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_push_endpoint'
      AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT unique_push_endpoint UNIQUE (endpoint);
    RAISE LOG '[PUSH TRIGGER] unique_push_endpoint constraint added.';
  ELSE
    RAISE LOG '[PUSH TRIGGER] unique_push_endpoint constraint already exists.';
  END IF;
END;
$$;


-- ============================================================
-- STEP 4: Create the trigger function
-- ============================================================
--
-- KEY DESIGN DECISIONS:
--
-- 1. NO HARDCODED SECRETS.
--    The service_role key is read from app.settings.service_role_key,
--    a PostgreSQL database variable that Supabase automatically
--    sets on every project. This file is safe to commit to Git.
--
-- 2. CORRECT pg_net CALL.
--    Uses net.http_post() (not extensions.http_post()).
--    The body parameter receives JSONB (not TEXT).
--
-- 3. CORRECT PAYLOAD FORMAT.
--    Sends { "type": "INSERT", "table": "notifications", "record": {...} }
--    matching exactly what send-push/index.ts expects.
--
-- 4. HR NOTIFICATIONS ONLY.
--    Only fires when NEW.user_id IS NOT NULL (HR-targeted rows).
--    Skips employee self-notifications (employee_phone only).
--
-- 5. NEVER BLOCKS THE INSERT.
--    EXCEPTION handler ensures push failures never prevent the
--    notification row from being saved.
--
-- 6. DIAGNOSTIC LOGGING.
--    Uses RAISE LOG for structured debug output visible in
--    Supabase Dashboard -> Database -> Logs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_service_key TEXT;
  v_payload     JSONB;
  v_headers     JSONB;
  v_request_id  BIGINT;
  v_edge_fn_url CONSTANT TEXT :=
    'https://qabtydijzsvfejeyrakc.supabase.co/functions/v1/send-push';
BEGIN
  -- -------------------------------------------------------
  -- Only fire for HR-targeted notifications (user_id IS NOT NULL).
  -- Rows with only employee_phone are employee self-notifications
  -- and do not need an HR push.
  -- -------------------------------------------------------
  IF NEW.user_id IS NULL THEN
    RAISE LOG
      '[PUSH TRIGGER] Skipping notification id=% — user_id is NULL (employee self-notification, no HR push needed).',
      NEW.id;
    RETURN NEW;
  END IF;

  RAISE LOG
    '[PUSH TRIGGER] notification inserted — id=%, user_id=%, type=%, related_id=%',
    NEW.id, NEW.user_id, NEW.type, NEW.related_id;

  -- -------------------------------------------------------
  -- Read the service_role key from the Supabase-managed
  -- PostgreSQL setting. This is set automatically by Supabase
  -- and is never hardcoded or committed to any file.
  -- -------------------------------------------------------
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE LOG
      '[PUSH TRIGGER] WARNING: app.settings.service_role_key is not set. '
      'Attempting call without auth — this will likely return 401.';
    v_service_key := '';
  END IF;

  -- -------------------------------------------------------
  -- Build the webhook payload in the exact format that
  -- send-push/index.ts expects to receive from a database webhook.
  -- -------------------------------------------------------
  v_payload := jsonb_build_object(
    'type',   'INSERT',
    'table',  'notifications',
    'record', jsonb_build_object(
      'id',             NEW.id,
      'user_id',        NEW.user_id,
      'employee_phone', NEW.employee_phone,
      'title',          NEW.title,
      'message',        NEW.message,
      'type',           NEW.type,
      'is_read',        NEW.is_read,
      'related_id',     NEW.related_id,
      'created_at',     NEW.created_at
    )
  );

  -- -------------------------------------------------------
  -- Build authorization headers.
  -- -------------------------------------------------------
  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || v_service_key
  );

  RAISE LOG
    '[PUSH INVOCATION] Queuing send-push HTTP request for notification id=%',
    NEW.id;

  -- -------------------------------------------------------
  -- Make the async HTTP POST via pg_net.
  --
  -- IMPORTANT NOTES ABOUT net.http_post():
  --   - The body parameter MUST be JSONB, not TEXT.
  --   - This call is non-blocking (async). The INSERT transaction
  --     commits immediately; the HTTP request fires after.
  --   - Returns a BIGINT request_id for tracing.
  -- -------------------------------------------------------
  SELECT net.http_post(
    url     := v_edge_fn_url,
    headers := v_headers,
    body    := v_payload
  ) INTO v_request_id;

  RAISE LOG
    '[PUSH INVOCATION] send-push queued — pg_net request_id=%, notification_id=%',
    v_request_id, NEW.id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- NEVER block the notifications INSERT if push fails.
  RAISE LOG
    '[PUSH TRIGGER] ERROR invoking send-push — notification_id=%, SQLSTATE=%, MESSAGE=%',
    NEW.id, SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$;


-- ============================================================
-- STEP 5: Drop old trigger safely (idempotent)
-- ============================================================

DROP TRIGGER IF EXISTS trg_on_notification_inserted ON public.notifications;


-- ============================================================
-- STEP 6: Create exactly one AFTER INSERT trigger
-- ============================================================

CREATE TRIGGER trg_on_notification_inserted
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();


-- ============================================================
-- STEP 7: Verify everything was created correctly
-- ============================================================

DO $$
DECLARE
  v_trigger_count   INTEGER;
  v_function_count  INTEGER;
  v_endpoint_col    INTEGER;
BEGIN
  -- Check trigger
  SELECT COUNT(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE t.tgname = 'trg_on_notification_inserted'
    AND n.nspname = 'public'
    AND c.relname = 'notifications'
    AND NOT t.tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION
      '[PUSH TRIGGER] VERIFICATION FAILED: expected 1 trigger, found %.', v_trigger_count;
  END IF;

  -- Check function
  SELECT COUNT(*) INTO v_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'trigger_send_push_notification'
    AND n.nspname = 'public';

  IF v_function_count <> 1 THEN
    RAISE EXCEPTION
      '[PUSH TRIGGER] VERIFICATION FAILED: trigger function not found in public schema.';
  END IF;

  -- Check endpoint column
  SELECT COUNT(*) INTO v_endpoint_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'push_subscriptions'
    AND column_name = 'endpoint';

  IF v_endpoint_col <> 1 THEN
    RAISE EXCEPTION
      '[PUSH TRIGGER] VERIFICATION FAILED: endpoint column missing from push_subscriptions.';
  END IF;

  RAISE LOG
    '[PUSH TRIGGER] ALL VERIFICATIONS PASSED — trigger=%, function=%, endpoint_col=%',
    v_trigger_count, v_function_count, v_endpoint_col;
  RAISE LOG
    '[PUSH TRIGGER] Migration complete. The push notification chain is now active.';
END;
$$;


-- ============================================================
-- VERIFICATION QUERIES
-- (Run these manually to confirm state after migration)
-- ============================================================

-- 1. Check pg_net is loaded:
--    SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_net';

-- 2. Check trigger exists and is enabled:
--    SELECT tgname, tgenabled, tgtype
--    FROM pg_trigger t
--    JOIN pg_class c ON c.oid = t.tgrelid
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE c.relname = 'notifications'
--      AND n.nspname = 'public'
--      AND NOT t.tgisinternal;

-- 3. Check trigger function exists:
--    SELECT p.proname, n.nspname
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE p.proname = 'trigger_send_push_notification';

-- 4. Check HR push subscriptions:
--    SELECT id, user_id, employee_phone, endpoint, created_at
--    FROM public.push_subscriptions
--    WHERE user_id = '89fbbf79-b54f-4cc0-b5c0-f04e3a1ac022';

-- 5. Check pg_net HTTP responses after a test:
--    SELECT id, method, url, status, response_status_code, error_msg, created
--    FROM net._http_response
--    ORDER BY created DESC LIMIT 10;

-- 6. Verify app.settings.service_role_key is available:
--    SELECT current_setting('app.settings.service_role_key', true) IS NOT NULL AS key_available;
-- ============================================================
