-- =========================================================================
-- MIGRATION: DYNAMIC GLOBAL RLS ENFORCEMENT & COMPLIANT AD ROLLOVER
-- Paste and Run in your Supabase SQL Editor (SQL Editor -> New query -> Run)
-- =========================================================================

-- =========================================================================
-- PART 1: DYNAMICALLY ENABLE ROW LEVEL SECURITY (RLS) ON ALL EXISTING TABLES
-- =========================================================================

DO 
DECLARE
  r RECORD;
BEGIN
  -- Enable RLS on every table currently present in the public schema
  FOR r IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
  END LOOP;
END ;

-- =========================================================================
-- PART 2: DYNAMIC POLICY CREATION (Only runs if the table exists)
-- =========================================================================

DO 
BEGIN
  -- 2.1 Users table policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
    DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

    CREATE POLICY "Users can view their own profile" ON public.users
      FOR SELECT TO authenticated, anon
      USING (lower(auth.jwt() ->> 'email') = lower(email));

    CREATE POLICY "Users can update their own profile" ON public.users
      FOR UPDATE TO authenticated
      USING (lower(auth.jwt() ->> 'email') = lower(email))
      WITH CHECK (lower(auth.jwt() ->> 'email') = lower(email));
  END IF;

  -- 2.2 Notifications table policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

    CREATE POLICY "Users can view their own notifications" ON public.notifications
      FOR SELECT TO authenticated, anon
      USING (lower(auth.jwt() ->> 'email') = lower(user_email));

    CREATE POLICY "Users can delete their own notifications" ON public.notifications
      FOR DELETE TO authenticated
      USING (lower(auth.jwt() ->> 'email') = lower(user_email));
  END IF;

  -- 2.3 Global announcements & Read logs policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'global_announcements') THEN
    DROP POLICY IF EXISTS "Public can view active announcements" ON public.global_announcements;
    CREATE POLICY "Public can view active announcements" ON public.global_announcements
      FOR SELECT TO authenticated, anon
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'read_announcements') THEN
    DROP POLICY IF EXISTS "Users can manage read logs" ON public.read_announcements;
    CREATE POLICY "Users can manage read logs" ON public.read_announcements
      FOR ALL TO authenticated, anon
      USING (lower(auth.jwt() ->> 'email') = lower(user_email))
      WITH CHECK (lower(auth.jwt() ->> 'email') = lower(user_email));
  END IF;

  -- 2.4 Active Ads & News feed visibility policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'addsactive') THEN
    DROP POLICY IF EXISTS "Public can view active ads" ON public.addsactive;
    CREATE POLICY "Public can view active ads" ON public.addsactive
      FOR SELECT TO authenticated, anon
      USING (completed_at IS NULL AND (is_paused IS NULL OR is_paused = false));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'newsactive') THEN
    DROP POLICY IF EXISTS "Public can view active highlights" ON public.newsactive;
    CREATE POLICY "Public can view active highlights" ON public.newsactive
      FOR SELECT TO authenticated, anon
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'adds') THEN
    DROP POLICY IF EXISTS "Advertisers can view their own ads" ON public.adds;
    CREATE POLICY "Advertisers can view their own ads" ON public.adds
      FOR SELECT TO authenticated, anon
      USING (lower(auth.jwt() ->> 'email') = lower(user_email));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'news') THEN
    DROP POLICY IF EXISTS "Advertisers can view their own news" ON public.news;
    CREATE POLICY "Advertisers can view their own news" ON public.news
      FOR SELECT TO authenticated, anon
      USING (lower(auth.jwt() ->> 'email') = lower(user_email));
  END IF;

  -- 2.5 Payments table policy
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
    CREATE POLICY "Users can view their own payments" ON public.payments
      FOR SELECT TO authenticated
      USING (lower(auth.jwt() ->> 'email') = lower(user_email));
  END IF;

  -- 2.6 Referrals table policy
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
    DROP POLICY IF EXISTS "Users can view their own referrals" ON public.referrals;
    CREATE POLICY "Users can view their own referrals" ON public.referrals
      FOR SELECT TO authenticated
      USING (lower(auth.jwt() ->> 'email') = lower(referrer_email));
  END IF;

  -- 2.7 Blocked ads & advertisers policies (Uses reporter_email)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_ads') THEN
    DROP POLICY IF EXISTS "Users can manage their own blocked ads" ON public.blocked_ads;
    CREATE POLICY "Users can manage their own blocked ads" ON public.blocked_ads
      FOR ALL TO authenticated
      USING (lower(auth.jwt() ->> 'email') = lower(reporter_email))
      WITH CHECK (lower(auth.jwt() ->> 'email') = lower(reporter_email));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_advertisers') THEN
    DROP POLICY IF EXISTS "Users can manage their own blocked advertisers" ON public.blocked_advertisers;
    CREATE POLICY "Users can manage their own blocked advertisers" ON public.blocked_advertisers
      FOR ALL TO authenticated
      USING (lower(auth.jwt() ->> 'email') = lower(reporter_email))
      WITH CHECK (lower(auth.jwt() ->> 'email') = lower(reporter_email));
  END IF;
END ;

-- =========================================================================
-- PART 3: SAFE AD ROLLOVER FEED RPC FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit      INT DEFAULT 100,
  p_offset     INT DEFAULT 0
)
RETURNS SETOF public.addsactive AS 
DECLARE
  v_user        RECORD;
  v_age         INT;
  v_email_lower TEXT;
BEGIN
  v_email_lower := lower(p_user_email);

  -- Fast indexed user lookup
  SELECT * INTO v_user FROM public.users WHERE lower(email) = v_email_lower LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_user.dob IS NOT NULL THEN
    v_age := date_part('year', age(v_user.dob::date));
  ELSE
    v_age := 25;
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.addsactive a
  WHERE
    -- 1. Exclude completed campaigns
    a.completed_at IS NULL

    -- 2. Exclude paused campaigns
    AND (a.is_paused IS NULL OR a.is_paused = FALSE)

    -- 3. Exclude campaigns that reached total impression target
    AND (
      a.impressions IS NULL
      OR COALESCE(a.impression_count, 0) < a.impressions
    )

    -- 4. Exclude ads this user has already seen >= frequency cap
    -- (Frequency cap is doubled in rollover mode to allow re-engagement)
    AND NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp
      WHERE imp.ad_id = a.id
        AND lower(imp.user_email) = v_email_lower
        AND imp.view_count >= (
          CASE 
            WHEN a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days 
            THEN COALESCE(a.user_frequency_cap, 1) * 2
            ELSE COALESCE(a.user_frequency_cap, 1)
          END
        )
    )

    -- 5. Bypass demographics for mutual connections; otherwise enforce STRICT Safety Rules:
    AND (
      ARRAY[v_email_lower] && COALESCE(a.mutual_targets, '{}'::text[])
      OR (
        -- [RULE 1] COUNTRY: STRICT (NEVER broadened across international borders)
        (a.country IS NULL OR a.country = '' OR lower(a.country) = lower(COALESCE(v_user.country, '')))

        -- [RULE 2] GENDER: STRICT (NEVER broadened across genders)
        AND (a.gender IS NULL OR a.gender = '' OR lower(a.gender) = 'both' OR lower(a.gender) = lower(COALESCE(v_user.gender, '')))

        -- [RULE 3] AGE RANGE: STRICT (NEVER broadened - Protects minors/children & compliance)
        AND (
          a.age_range IS NULL OR cardinality(a.age_range) < 2
          OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
        )

        -- [RULE 4] EMPLOYMENT STATUS: Matches OR relaxed in rollover mode
        AND (
          a.employment_status IS NULL OR a.employment_status = ''
          OR lower(COALESCE(v_user.employment, '')) = ANY(
            string_to_array(replace(lower(a.employment_status), ' ', ''), ',')
          )
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )

        -- [RULE 5] INTERESTS / INDUSTRY / LIFESTYLE / PERSONALITY / BEHAVIOR:
        -- Strictly matched during active schedule, SAFELY BROADENED during Rollover mode
        AND (
          a.targeting_all = TRUE
          OR a.interest    && v_user.interest
          OR a.lifestyle   && v_user.lifestyle
          OR a.personality && v_user.personality
          OR a.behavior    && v_user.behavior
          OR a.industry    && v_user.industry
          OR (a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days)
        )
      )
    )

    -- 6. Daily impression cap (Expanded with banked rollover balance)
    AND (
      a.daily_impression_cap IS NULL
      OR a.last_reset_date IS NULL
      OR a.last_reset_date < CURRENT_DATE
      OR COALESCE(a.daily_impression_count, 0) < COALESCE(
           a.daily_impression_cap + COALESCE(a.rollover_balance, 0),
           a.daily_impression_cap, 99999999
         )
    )

  ORDER BY
    -- Prioritize Mutual targets first
    (CASE WHEN ARRAY[v_email_lower] && COALESCE(a.mutual_targets, '{}'::text[]) THEN 0 ELSE 1 END) ASC,
    -- Prioritize Rollover campaigns second
    (CASE WHEN a.campaign_days IS NOT NULL AND (CURRENT_DATE - a.created_at::date) > a.campaign_days THEN 0 ELSE 1 END) ASC,
    -- Then oldest campaign first
    a.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
 LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_user_feed(text, integer, integer) TO anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
