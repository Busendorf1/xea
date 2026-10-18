-- =============================================================================
-- MIGRATION 008: FEED TARGETING, BVN REMOVAL, EXHAUSTED AD ARCHIVAL & SPACING
-- =============================================================================
-- 1. Remove any trace of BVN from public.users
-- 2. Ensure all required columns exist across users, addsactive, and ad_impressions
-- 3. Move exhausted ads out of public.addsactive into public.addscompleted
--    automatically via trigger + immediate cleanup sweep
-- 4. Case-insensitive array & LocationSelector (country / state / province) matching
-- 5. Support [minAge, maxAge] numeric arrays (e.g. {18,65}) and string age ranges
-- 6. Hard frequency cap exclusion + 2-hour retargeting spacing
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. REMOVE BVN COLUMN FROM USERS TABLE & ENSURE DEFENSIVE COLUMNS EXIST
-- -----------------------------------------------------------------------------
ALTER TABLE public.users DROP COLUMN IF EXISTS bvn_hash CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS bvn CASCADE;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employment TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employment_status TEXT;

ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS impression_count INT DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS cost_per_impression NUMERIC(12,2) DEFAULT 25.00;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS user_frequency_cap INT DEFAULT 1;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS is_admin_post BOOLEAN DEFAULT FALSE;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS targeting_all BOOLEAN DEFAULT FALSE;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS employment_status TEXT;

ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 1;
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS today_view_count INT DEFAULT 1;
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ DEFAULT now();

-- -----------------------------------------------------------------------------
-- 2. EXHAUSTED ADS ARCHIVAL (addsactive -> completed_ads & addscompleted)
--    + AUTOMATIC BID DEACTIVATION WHEN CAMPAIGN COMPLETES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addscompleted (
  LIKE public.addsactive INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
);

CREATE TABLE IF NOT EXISTS public.completed_ads (
  LIKE public.addsactive INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
);

-- Allow bidded_ads to be recorded at creation time (while in 'adds' queue) without FK violation,
-- while only counting bids in market rates once the ad is live in 'addsactive'
ALTER TABLE public.bidded_ads DROP CONSTRAINT IF EXISTS bidded_ads_ad_id_fkey;

CREATE OR REPLACE FUNCTION public.get_industry_attention_prices()
RETURNS TABLE (
  industry_name TEXT,
  floor_price NUMERIC(12,2),
  highest_bid NUMERIC(12,2),
  total_active_bids BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH industries AS (
    SELECT 'politics' AS ind, 1500.00::NUMERIC(12,2) AS flr
    UNION ALL SELECT 'business', 45.00::NUMERIC(12,2)
    UNION ALL SELECT 'government', 2000.00::NUMERIC(12,2)
    UNION ALL SELECT 'individual', 25.00::NUMERIC(12,2)
    UNION ALL SELECT 'religion', 1500.00::NUMERIC(12,2)
    UNION ALL SELECT 'product_sales', 55.00::NUMERIC(12,2)
  ),
  live_bids AS (
    SELECT
      lower(b.industry) AS ind,
      b.bid_price,
      b.id
    FROM public.bidded_ads b
    INNER JOIN public.addsactive a ON a.id = b.ad_id
    WHERE b.is_active = TRUE
      AND a.completed_at IS NULL
      AND COALESCE(a.is_paused, FALSE) = FALSE
      AND (COALESCE(a.impressions, 0) <= 0 OR COALESCE(a.impression_count, 0) < a.impressions)
  )
  SELECT 
    i.ind AS industry_name,
    i.flr AS floor_price,
    COALESCE(MAX(lb.bid_price), i.flr) AS highest_bid,
    COUNT(lb.id) AS total_active_bids
  FROM industries i
  LEFT JOIN live_bids lb ON lb.ind = i.ind
  GROUP BY i.ind, i.flr;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.archive_exhausted_ad_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_impressions INT;
  v_count       INT;
BEGIN
  v_impressions := COALESCE(NEW.impressions, 0);
  v_count := COALESCE(NEW.impression_count, 0);

  IF NEW.completed_at IS NOT NULL OR (v_impressions > 0 AND v_count >= v_impressions) THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

    BEGIN
      INSERT INTO public.completed_ads
      SELECT NEW.*
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.addscompleted
      SELECT NEW.*
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    UPDATE public.adds
    SET
      impression_count = v_count,
      completed_at = NEW.completed_at
    WHERE id = NEW.id;

    UPDATE public.bidded_ads
    SET is_active = FALSE
    WHERE ad_id = NEW.id;

    DELETE FROM public.addsactive WHERE id = NEW.id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_exhausted_ad ON public.addsactive;
CREATE TRIGGER trg_archive_exhausted_ad
AFTER UPDATE OF impression_count, completed_at ON public.addsactive
FOR EACH ROW
EXECUTE FUNCTION public.archive_exhausted_ad_fn();

-- Immediate sweep: move any already-exhausted ads out of addsactive right now
DO $$
BEGIN
  BEGIN
    INSERT INTO public.completed_ads
    SELECT *
    FROM public.addsactive
    WHERE completed_at IS NOT NULL
       OR (COALESCE(impressions, 0) > 0 AND COALESCE(impression_count, 0) >= impressions)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.addscompleted
    SELECT *
    FROM public.addsactive
    WHERE completed_at IS NOT NULL
       OR (COALESCE(impressions, 0) > 0 AND COALESCE(impression_count, 0) >= impressions)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  UPDATE public.adds a
  SET
    impression_count = COALESCE(act.impression_count, a.impression_count, 0),
    completed_at = COALESCE(act.completed_at, now())
  FROM public.addsactive act
  WHERE a.id = act.id
    AND (
      act.completed_at IS NOT NULL
      OR (COALESCE(act.impressions, 0) > 0 AND COALESCE(act.impression_count, 0) >= act.impressions)
    );

  UPDATE public.bidded_ads b
  SET is_active = FALSE
  WHERE NOT EXISTS (
    SELECT 1 FROM public.addsactive act
    WHERE act.id = b.ad_id
      AND act.completed_at IS NULL
      AND (COALESCE(act.impressions, 0) <= 0 OR COALESCE(act.impression_count, 0) < act.impressions)
  );

  DELETE FROM public.addsactive
  WHERE completed_at IS NOT NULL
     OR (COALESCE(impressions, 0) > 0 AND COALESCE(impression_count, 0) >= impressions);
END $$;

-- -----------------------------------------------------------------------------
-- 3. KEEP ad_impressions TIMESTAMPS UPDATED ON SEEN / IMPRESSION RECORDING
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count    BIGINT;
  v_max_impressions  BIGINT;
  v_daily_count      INT;
  v_reset_date       DATE;
  v_daily_cap        INT;
  v_user_freq_cap    INT;
  v_user_views       INT;
  v_rollover_balance INT;
  v_campaign_days    INT;
  v_created_at       TIMESTAMPTZ;
  v_is_rollover      BOOLEAN;
  v_email_lower      TEXT;
BEGIN
  v_email_lower := lower(btrim(p_user_email));

  -- Check if user is suspended
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = v_email_lower
      AND suspended_until IS NOT NULL
      AND suspended_until > now()
  ) THEN
    RETURN FALSE;
  END IF;

  -- Fetch ad parameters from addsactive table
  SELECT
    GREATEST(COALESCE(user_frequency_cap, 1), 1),
    COALESCE(daily_impression_cap, 99999999),
    COALESCE(daily_impression_count, 0),
    COALESCE(last_reset_date, CURRENT_DATE),
    COALESCE(rollover_balance, 0),
    COALESCE(campaign_days, 1),
    created_at,
    COALESCE(impressions, 99999999),
    COALESCE(impression_count, 0)
  INTO
    v_user_freq_cap,
    v_daily_cap,
    v_daily_count,
    v_reset_date,
    v_rollover_balance,
    v_campaign_days,
    v_created_at,
    v_max_impressions,
    v_current_count
  FROM public.addsactive
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check total impression cap
  IF v_max_impressions > 0 AND v_current_count >= v_max_impressions THEN
    UPDATE public.addsactive SET completed_at = now() WHERE id = p_ad_id;
    RETURN FALSE;
  END IF;

  v_is_rollover := (v_campaign_days IS NOT NULL AND (CURRENT_DATE - v_created_at::date) > v_campaign_days);

  -- Get user's current view count for this ad
  SELECT COALESCE(view_count, 0) INTO v_user_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND lower(user_email) = v_email_lower;

  -- Strictly enforce user frequency cap
  IF v_user_views IS NOT NULL AND v_user_views >= v_user_freq_cap THEN
    RETURN FALSE;
  END IF;

  -- Upsert user view record with today_view_count and last_viewed_at for 2-hour spacing
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count, today_view_count, last_viewed_at)
  VALUES (p_ad_id, v_email_lower, 1, 1, now())
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET
    view_count = COALESCE(public.ad_impressions.view_count, 0) + 1,
    today_view_count = CASE
      WHEN public.ad_impressions.last_viewed_at::date = CURRENT_DATE
      THEN COALESCE(public.ad_impressions.today_view_count, 0) + 1
      ELSE 1
    END,
    last_viewed_at = now();

  -- Reset daily count if day has changed
  IF v_reset_date IS NULL OR v_reset_date < CURRENT_DATE THEN
    v_daily_count := 1;
    v_reset_date  := CURRENT_DATE;
  ELSE
    v_daily_count := v_daily_count + 1;
  END IF;

  v_current_count := v_current_count + 1;

  -- Increment counts in addsactive table (trigger will auto-archive if v_current_count >= v_max_impressions)
  UPDATE public.addsactive
  SET
    impression_count       = v_current_count,
    daily_impression_count = v_daily_count,
    last_reset_date        = v_reset_date,
    completed_at           = CASE
      WHEN (v_max_impressions > 0 AND v_current_count >= v_max_impressions) THEN now()
      ELSE completed_at
    END
  WHERE id = p_ad_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS FOR CASE-INSENSITIVE & AGE RANGE MATCHING
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.array_lower_overlap(arr1 TEXT[], arr2 TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(arr1, ARRAY[]::TEXT[])) AS a1
    INNER JOIN unnest(COALESCE(arr2, ARRAY[]::TEXT[])) AS a2
      ON lower(btrim(a1)) = lower(btrim(a2))
    WHERE btrim(a1) <> '' AND lower(btrim(a1)) NOT IN ('all', 'any', 'none', 'placeholder')
  );
$$;

CREATE OR REPLACE FUNCTION public.safe_parse_date(p_text TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_text IS NULL THEN
    RETURN NULL;
  END IF;
  v_clean := btrim(p_text);
  IF v_clean = '' OR lower(v_clean) IN ('placeholder', 'null', 'none') OR v_clean !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN substring(v_clean from 1 for 10)::DATE;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.matches_ad_age_range(p_age INT, p_age_range_raw TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_clean TEXT;
  v_parts TEXT[];
  v_min   INT;
  v_max   INT;
BEGIN
  IF p_age IS NULL OR p_age_range_raw IS NULL THEN
    RETURN TRUE;
  END IF;

  v_clean := lower(btrim(p_age_range_raw));
  IF v_clean = '' OR v_clean IN ('all', 'any', 'none', '{}', '[]') THEN
    RETURN TRUE;
  END IF;

  -- Check [minAge, maxAge] or {minAge, maxAge} tuple from Step2Budget.tsx (e.g. "{18,65}" or "[25,45]")
  v_parts := regexp_match(v_clean, '^[\[\{]?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[\]\}]?$');
  IF v_parts IS NOT NULL AND array_length(v_parts, 1) = 2 THEN
    v_min := v_parts[1]::INT;
    v_max := v_parts[2]::INT;
    IF v_min <= 18 AND v_max >= 65 THEN
      RETURN TRUE;
    END IF;
    RETURN p_age >= v_min AND (p_age <= v_max OR v_max >= 65);
  END IF;

  -- Check standard hyphenated or plus buckets (e.g. "18-24", "25-34", "55+")
  IF (v_clean LIKE '%18-24%' AND p_age BETWEEN 18 AND 24)
     OR (v_clean LIKE '%25-34%' AND p_age BETWEEN 25 AND 34)
     OR (v_clean LIKE '%35-44%' AND p_age BETWEEN 35 AND 44)
     OR (v_clean LIKE '%45-54%' AND p_age BETWEEN 45 AND 54)
     OR ((v_clean LIKE '%55+%' OR v_clean LIKE '%55-%') AND p_age >= 55)
     OR (v_clean LIKE '%18+%' AND p_age >= 18) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. ACCURATE, WELL-SPACED get_user_feed RPC
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_user_feed(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  ad_type TEXT,
  industry TEXT[],
  interest TEXT[],
  lifestyle TEXT[],
  behavior TEXT[],
  personality TEXT[],
  age_range TEXT,
  targeting_all BOOLEAN,
  impressions INT,
  campaign_days INT,
  user_frequency_cap INT,
  country TEXT,
  state TEXT,
  province TEXT,
  gender TEXT,
  employment_status TEXT,
  ad_media_type TEXT,
  ad_content TEXT,
  ad_action_buttons TEXT[],
  action_phone TEXT,
  action_whatsapp TEXT,
  action_website TEXT,
  action_email TEXT,
  action_ios TEXT,
  action_android TEXT,
  action_watch_now TEXT,
  display_mutual_button BOOLEAN,
  product_name TEXT,
  product_price NUMERIC(12,2),
  product_cta_type TEXT,
  product_cta_link TEXT,
  ad_media TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  impression_count INT,
  cost_per_impression NUMERIC(12,2),
  is_bidded BOOLEAN,
  bid_price NUMERIC(12,2)
) AS $$
DECLARE
  v_user_dob          DATE;
  v_user_country      TEXT;
  v_user_state        TEXT;
  v_user_location     TEXT;
  v_user_gender       TEXT;
  v_user_employment   TEXT;
  v_user_interest     TEXT[];
  v_user_lifestyle    TEXT[];
  v_user_personality  TEXT[];
  v_user_behavior     TEXT[];
  v_user_industry     TEXT[];
  v_user_all_persona  TEXT[];
  v_age               INT;
  v_email_lower       TEXT;
BEGIN
  v_email_lower := lower(btrim(p_user_email));

  SELECT 
    public.safe_parse_date(u.dob::TEXT),
    CASE WHEN lower(btrim(COALESCE(u.country, ''))) IN ('', 'placeholder') THEN NULL ELSE btrim(u.country) END,
    CASE WHEN lower(btrim(COALESCE(u.state, ''))) IN ('', 'placeholder') THEN NULL ELSE btrim(u.state) END,
    CASE WHEN lower(btrim(COALESCE(u.location, ''))) IN ('', 'placeholder') THEN NULL ELSE btrim(u.location) END,
    CASE WHEN lower(btrim(COALESCE(u.gender, ''))) IN ('', 'placeholder') THEN NULL ELSE btrim(u.gender) END,
    COALESCE(NULLIF(btrim(u.employment_status), ''), NULLIF(btrim(u.employment), '')),
    COALESCE(u.interest, ARRAY[]::TEXT[]),
    COALESCE(u.lifestyle, ARRAY[]::TEXT[]),
    COALESCE(u.personality, ARRAY[]::TEXT[]),
    COALESCE(u.behavior, ARRAY[]::TEXT[]),
    COALESCE(u.industry, ARRAY[]::TEXT[])
  INTO 
    v_user_dob, v_user_country, v_user_state, v_user_location,
    v_user_gender, v_user_employment,
    v_user_interest, v_user_lifestyle, v_user_personality, v_user_behavior, v_user_industry
  FROM public.users u
  WHERE lower(u.email) = v_email_lower
  LIMIT 1;

  IF v_user_dob IS NOT NULL THEN
    v_age := date_part('year', age(current_date, v_user_dob))::INT;
  ELSE
    v_age := NULL;
  END IF;

  v_user_all_persona := v_user_interest || v_user_industry || v_user_lifestyle || v_user_behavior || v_user_personality;

  RETURN QUERY
  WITH user_ad_views AS (
    SELECT
      i.ad_id,
      SUM(COALESCE(i.view_count, 1))::INT AS user_views,
      MAX(i.last_viewed_at) AS last_viewed_at,
      SUM(
        CASE WHEN i.last_viewed_at::DATE = current_date
             THEN COALESCE(i.today_view_count, 1)
             ELSE 0
        END
      )::INT AS today_views
    FROM public.ad_impressions i
    WHERE lower(i.user_email) = v_email_lower
    GROUP BY i.ad_id
  ),
  active_bids AS (
    SELECT b.ad_id, MAX(b.bid_price)::NUMERIC(12,2) AS max_bid
    FROM public.bidded_ads b
    WHERE b.is_active = TRUE
    GROUP BY b.ad_id
  )
  SELECT 
    a.id,
    a.ad_type,
    a.industry,
    a.interest,
    a.lifestyle,
    a.behavior,
    a.personality,
    a.age_range::TEXT,
    a.targeting_all,
    a.impressions,
    a.campaign_days,
    a.user_frequency_cap,
    a.country,
    a.state,
    a.province,
    a.gender,
    a.employment_status,
    a.ad_media_type,
    a.ad_content,
    a.ad_action_buttons,
    a.action_phone,
    a.action_whatsapp,
    a.action_website,
    a.action_email,
    a.action_ios,
    a.action_android,
    a.action_watch_now,
    a.display_mutual_button,
    a.product_name,
    a.product_price,
    a.product_cta_type,
    a.product_cta_link,
    a.ad_media,
    a.user_email,
    a.created_at,
    a.completed_at,
    COALESCE(a.impression_count, 0)::INT AS impression_count,
    COALESCE(a.cost_per_impression, 0)::NUMERIC(12,2) AS cost_per_impression,
    (ab.max_bid IS NOT NULL) AS is_bidded,
    COALESCE(ab.max_bid, a.cost_per_impression, 25.00)::NUMERIC(12,2) AS bid_price
  FROM public.addsactive a
  LEFT JOIN user_ad_views uav ON uav.ad_id = a.id
  LEFT JOIN active_bids ab ON ab.ad_id = a.id
  WHERE
    -- 1. Active, unpaused, and unexhausted
    a.completed_at IS NULL
    AND COALESCE(a.is_paused, FALSE) = FALSE
    AND (
      COALESCE(a.is_admin_post, FALSE) = TRUE
      OR COALESCE(a.impressions, 0) <= 0
      OR COALESCE(a.impression_count, 0) < a.impressions
    )

    -- 1b. Hard Frequency Cap Exclusion + Retargeting Cooldown Spacing (2 hours minimum gap)
    AND COALESCE(uav.user_views, 0) < GREATEST(COALESCE(a.user_frequency_cap, 1), 1)
    AND (
      COALESCE(uav.user_views, 0) = 0
      OR (
        (uav.last_viewed_at IS NULL OR uav.last_viewed_at <= now() - INTERVAL '2 hours')
        AND COALESCE(uav.today_views, 0) < GREATEST(1, CEIL(COALESCE(a.user_frequency_cap, 1)::NUMERIC / GREATEST(COALESCE(a.campaign_days, 1), 1)))::INT
      )
    )

    -- 2. Never serve an advertiser their own paid ad in the earning feed
    AND (COALESCE(a.is_admin_post, FALSE) = TRUE OR lower(btrim(COALESCE(a.user_email, ''))) <> v_email_lower)

    -- 3. Strict Country Match (unless multi-location province handles country per entry)
    AND (
      a.targeting_all = TRUE
      OR a.country IS NULL OR btrim(a.country) = '' OR lower(btrim(a.country)) IN ('all', 'any', 'global')
      OR v_user_country IS NULL
      OR lower(btrim(a.country)) = lower(v_user_country)
      OR lower(v_user_country) = ANY(SELECT lower(btrim(x)) FROM unnest(string_to_array(a.country, ',')) x)
    )

    -- 4. Strict State / Province / LocationSelector Multi-Location Match
    AND (
      a.targeting_all = TRUE
      OR ((a.state IS NULL OR btrim(a.state) = '' OR lower(btrim(a.state)) IN ('all', 'any'))
          AND (a.province IS NULL OR btrim(a.province) = '' OR lower(btrim(a.province)) IN ('all', 'any')))
      OR (v_user_state IS NULL AND v_user_location IS NULL)
      OR EXISTS (
        SELECT 1
        FROM unnest(regexp_split_to_array(COALESCE(a.state, '') || ',' || COALESCE(a.province, ''), '[,;]')) AS s
        WHERE btrim(s) <> '' AND lower(btrim(s)) NOT IN ('all', 'any')
          AND (
            regexp_replace(lower(btrim(s)), '\s*(state|province|region|county|lga)\M', '', 'g') =
              regexp_replace(lower(COALESCE(v_user_state, '')), '\s*(state|province|region|county|lga)\M', '', 'g')
            OR regexp_replace(lower(btrim(s)), '\s*(state|province|region|county|lga)\M', '', 'g') =
              regexp_replace(lower(COALESCE(v_user_location, '')), '\s*(state|province|region|county|lga)\M', '', 'g')
          )
      )
    )

    -- 5. Strict Gender Match
    AND (
      a.targeting_all = TRUE
      OR a.gender IS NULL OR btrim(a.gender) = '' OR lower(btrim(a.gender)) IN ('all', 'any', 'both')
      OR v_user_gender IS NULL
      OR lower(btrim(a.gender)) = lower(v_user_gender)
      OR lower(v_user_gender) = ANY(SELECT lower(btrim(x)) FROM unnest(string_to_array(a.gender, ',')) x)
    )

    -- 6. Strict Age Range Match (Supports both [min, max] tuples and string ranges)
    AND (
      a.targeting_all = TRUE
      OR public.matches_ad_age_range(v_age, a.age_range::TEXT)
    )

    -- 7. Strict Employment Status Match
    AND (
      a.targeting_all = TRUE
      OR a.employment_status IS NULL OR btrim(a.employment_status) = '' OR lower(btrim(a.employment_status)) IN ('all', 'any')
      OR v_user_employment IS NULL
      OR lower(v_user_employment) = ANY(SELECT lower(btrim(x)) FROM unnest(string_to_array(a.employment_status, ',')) x)
    )

    -- 8. Case-Insensitive Psychographic Match
    AND (
      a.targeting_all = TRUE
      OR COALESCE(a.is_admin_post, FALSE) = TRUE
      OR cardinality(v_user_all_persona) = 0
      OR (
        (a.interest IS NULL OR cardinality(a.interest) = 0)
        AND (a.industry IS NULL OR cardinality(a.industry) = 0)
        AND (a.lifestyle IS NULL OR cardinality(a.lifestyle) = 0)
        AND (a.personality IS NULL OR cardinality(a.personality) = 0)
        AND (a.behavior IS NULL OR cardinality(a.behavior) = 0)
      )
      OR public.array_lower_overlap(a.interest, v_user_all_persona)
      OR public.array_lower_overlap(a.industry, v_user_all_persona)
      OR public.array_lower_overlap(a.lifestyle, v_user_all_persona)
      OR public.array_lower_overlap(a.personality, v_user_all_persona)
      OR public.array_lower_overlap(a.behavior, v_user_all_persona)
    )
  ORDER BY
    -- Rank 0: Fresh unseen ads ahead of retargeted repeat views
    CASE WHEN COALESCE(uav.user_views, 0) = 0 THEN 0 ELSE 1 END ASC,
    -- Rank 1: Exact psychographic + geographic match priority
    (
      CASE WHEN public.array_lower_overlap(a.interest, v_user_interest) THEN 30 ELSE 0 END +
      CASE WHEN public.array_lower_overlap(a.industry, v_user_industry) THEN 25 ELSE 0 END +
      CASE WHEN public.array_lower_overlap(a.lifestyle, v_user_lifestyle) THEN 20 ELSE 0 END +
      CASE WHEN public.array_lower_overlap(a.behavior, v_user_behavior) THEN 20 ELSE 0 END +
      CASE WHEN public.array_lower_overlap(a.personality, v_user_personality) THEN 20 ELSE 0 END
    ) DESC,
    -- Rank 2: Highest Bid / CPI Priority
    COALESCE(ab.max_bid, a.cost_per_impression, 25.00) DESC,
    -- Rank 3: Freshness
    a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INT, INT) TO anon, authenticated, service_role;
