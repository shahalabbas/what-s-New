-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 0009: 24/7 Background Push Notification Reminders
-- Enables pg_cron, pg_net, subscriptions, prefs, dedupe logs, and scheduler
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. Device Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  user_agent      TEXT,
  platform        TEXT NOT NULL DEFAULT 'other' CHECK (platform IN ('ios', 'android', 'desktop', 'other')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  failure_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON public.push_subscriptions(user_id);

-- 3. User Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  classes     BOOLEAN NOT NULL DEFAULT true,
  meals       BOOLEAN NOT NULL DEFAULT true,
  meal_types  TEXT[] NOT NULL DEFAULT '{breakfast,lunch,hi_tea,dinner}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Sent Reminders Deduplication Log
CREATE TABLE IF NOT EXISTS public.notifications_sent (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('class', 'meal', 'test')),
  item_key    TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notifications_sent_user_kind_item UNIQUE (user_id, kind, item_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_sent_lookup 
  ON public.notifications_sent(user_id, kind, item_key);

-- 5. Row Level Security (RLS)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_sent ENABLE ROW LEVEL SECURITY;

-- push_subscriptions: Users manage only their own devices
DROP POLICY IF EXISTS "Users view own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users view own subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users insert own subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users update own subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users delete own subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- notification_prefs: Users manage their own preferences
DROP POLICY IF EXISTS "Users view own prefs" ON public.notification_prefs;
CREATE POLICY "Users view own prefs"
  ON public.notification_prefs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own prefs" ON public.notification_prefs;
CREATE POLICY "Users insert own prefs"
  ON public.notification_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own prefs" ON public.notification_prefs;
CREATE POLICY "Users update own prefs"
  ON public.notification_prefs FOR UPDATE
  USING (auth.uid() = user_id);

-- notifications_sent: Owner can view delivery log; service_role has full access
DROP POLICY IF EXISTS "Users view own sent logs" ON public.notifications_sent;
CREATE POLICY "Users view own sent logs"
  ON public.notifications_sent FOR SELECT
  USING (auth.uid() = user_id);

-- 6. SQL Function: due_reminders() (Security Definer, Asia/Kolkata time window)
CREATE OR REPLACE FUNCTION public.due_reminders(current_time_override TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (
  kind TEXT,
  item_key TEXT,
  program TEXT,
  batch_year INTEGER,
  title TEXT,
  body TEXT,
  url TEXT,
  tag TEXT,
  meal_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_time TIMESTAMPTZ;
  now_ist TIMESTAMP;
  win_start TIMESTAMP;
  win_end TIMESTAMP;
BEGIN
  -- Use override timestamp for unit testing if provided, otherwise real now()
  base_time := COALESCE(current_time_override, now());
  now_ist := (base_time AT TIME ZONE 'Asia/Kolkata');
  win_start := now_ist + interval '5 minutes';
  win_end := now_ist + interval '6 minutes';

  -- 1. Classes starting in [now + 5m, now + 6m)
  RETURN QUERY
  SELECT
    'class'::TEXT AS kind,
    cs.id::TEXT AS item_key,
    cs.program,
    cs.batch_year,
    (COALESCE(c.code, 'Class') || ' in 5 min · ' || to_char(cs.start_time, 'FMHH12:MI'))::TEXT AS title,
    (
      COALESCE(c.name, 'Class Session') ||
      CASE WHEN cs.session_no IS NOT NULL AND c.total_sessions IS NOT NULL 
        THEN ' · Session ' || cs.session_no || ' of ' || c.total_sessions
        WHEN cs.session_no IS NOT NULL THEN ' · Session ' || cs.session_no
        ELSE '' END ||
      CASE WHEN cs.room IS NOT NULL THEN ' · ' || cs.room ELSE '' END
    )::TEXT AS body,
    '/'::TEXT AS url,
    ('class-' || cs.id::TEXT)::TEXT AS tag,
    NULL::TEXT AS meal_type
  FROM public.class_sessions cs
  LEFT JOIN public.courses c ON c.id = cs.course_id
  WHERE cs.status <> 'cancelled'
    AND (cs.date + cs.start_time) >= win_start
    AND (cs.date + cs.start_time) < win_end
    -- Exclude dates that have a holiday or campus_event (no classes)
    AND NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE (e.date = cs.date OR (e.start_at AT TIME ZONE 'Asia/Kolkata')::date = cs.date)
        AND e.type IN ('holiday', 'campus_event')
        AND (e.program = cs.program OR e.program IS NULL)
        AND (e.batch_year = cs.batch_year OR e.batch_year IS NULL)
    );

  -- 2. Meals starting in [now + 5m, now + 6m)
  RETURN QUERY
  WITH meal_candidates AS (
    SELECT
      d.date,
      d.meal,
      d.label,
      d.start_time,
      d.items,
      d.has_non_veg
    FROM public.mess_menu_day d
    WHERE d.date = win_start::date
      AND (d.date + d.start_time) >= win_start
      AND (d.date + d.start_time) < win_end
      AND jsonb_array_length(d.items) > 0
  )
  SELECT
    'meal'::TEXT AS kind,
    ('meal:' || mc.date || ':' || mc.meal)::TEXT AS item_key,
    NULL::TEXT AS program,
    NULL::INTEGER AS batch_year,
    (mc.label || ' in 5 min · ' || to_char(mc.start_time, 'FMHH12:MI'))::TEXT AS title,
    (
      COALESCE(
        (
          SELECT string_agg(elem->>'name', ', ')
          FROM (
            SELECT elem
            FROM jsonb_array_elements(mc.items) elem
            WHERE elem->>'diet' = 'veg'
            LIMIT 3
          ) v
        ),
        'Campus Meal'
      ) ||
      COALESCE(
        (
          SELECT ' · ' || (elem->>'name') || ' (' || 
            CASE WHEN elem->>'diet' = 'non_veg' THEN 'non-veg' ELSE elem->>'diet' END || ')'
          FROM jsonb_array_elements(mc.items) elem
          WHERE elem->>'diet' IN ('egg', 'non_veg')
          LIMIT 1
        ),
        ''
      )
    )::TEXT AS body,
    '/mess'::TEXT AS url,
    ('meal-' || mc.date || '-' || mc.meal)::TEXT AS tag,
    mc.meal::TEXT AS meal_type
  FROM meal_candidates mc;
END;
$$;

-- 7. SQL Function: dispatch_reminders()
CREATE OR REPLACE FUNCTION public.dispatch_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  due_items JSONB;
  cron_secret TEXT;
  edge_url TEXT;
BEGIN
  -- Collect any items starting in 5 minutes
  SELECT jsonb_agg(to_jsonb(r)) INTO due_items FROM public.due_reminders() r;

  -- If nothing is due, exit immediately (Costs 0 Edge Function calls)
  IF due_items IS NULL OR jsonb_array_length(due_items) = 0 THEN
    RETURN;
  END IF;

  -- Read secrets safely from Supabase Vault (never hard-coded)
  SELECT decrypted_secret INTO cron_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_secret' 
  LIMIT 1;

  SELECT decrypted_secret INTO edge_url 
  FROM vault.decrypted_secrets 
  WHERE name = 'edge_function_url' 
  LIMIT 1;

  IF cron_secret IS NULL OR edge_url IS NULL THEN
    RAISE WARNING 'dispatch_reminders: cron_secret or edge_function_url missing in vault.decrypted_secrets';
    RETURN;
  END IF;

  -- Fire HTTP POST via pg_net
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    body := jsonb_build_object('items', due_items)
  );
END;
$$;

-- 8. Register pg_cron Job (runs every minute)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('send-reminders') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'send-reminders'
    );
    PERFORM cron.schedule(
      'send-reminders',
      '* * * * *',
      'SELECT public.dispatch_reminders();'
    );
  END IF;
END $$;
