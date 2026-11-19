-- ============================================================================
-- Migration: 20261119000000_ensure_floor_ads_and_bidded_interleave.sql
-- Purpose:
--   1. Backfill `is_bidded` / `bid_price` integrity where needed and ensure
--      standard floor-priced ads have a fast partial index (`idx_addsactive_floor_pool_cpi`).
--   2. Reserve a dedicated `standard_pool` (up to 65 floor-priced ads) inside
--      `public.get_user_feed` alongside `main_pool` (250) and `rollover_pool` (60),
--      so floor-priced campaigns never starve behind 100–250+ active higher-bid campaigns.
--   3. Interleave bidded and floor-priced ads in the 3:1 (75% / 25%) auction ratio
--      within `get_user_feed` before `LIMIT v_limit`.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_addsactive_floor_pool_cpi
ON public.addsactive (cost_per_impression DESC, created_at DESC)
WHERE completed_at IS NULL
  AND COALESCE(is_paused, false) = false
  AND COALESCE(is_bidded, false) = false;

CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id TEXT,
  user_email TEXT,
  ad_media TEXT,
  ad_media_type TEXT,
  ad_content TEXT,
  ad_type TEXT,
  product_name TEXT,
  product_price DOUBLE PRECISION,
  product_cta_type TEXT,
  product_cta_link TEXT,
  action_phone TEXT,
  action_whatsapp TEXT,
  action_email TEXT,
  action_website TEXT,
  action_ios TEXT,
  action_android TEXT,
  action_watch_now TEXT,
  ad_action_buttons JSONB,
  cost_per_impression DOUBLE PRECISION,
  bid_price DOUBLE PRECISION,
  is_bidded BOOLEAN,
  is_boosted BOOLEAN,
  boosted_amount DOUBLE PRECISION,
  boosted_at TIMESTAMPTZ,
  display_mutual_button BOOLEAN,
  mutual_targets JSONB,
  mutual_adds_count INTEGER,
  interest JSONB,
  industry JSONB,
  behavior JSONB,
  lifestyle JSONB,
  personality JSONB,
  country TEXT,
  state TEXT,
  province TEXT,
  gender TEXT,
  employment_status TEXT,
  age_range JSONB,
  targeting_all BOOLEAN,
  is_paused BOOLEAN,
  is_admin_post BOOLEAN,
  user_frequency_cap INTEGER,
  campaign_days INTEGER,
  impressions INTEGER,
  impression_count INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  is_rollover BOOLEAN,
  rollover_started_at TIMESTAMPTZ,
  broadening_stage INTEGER,
  rollover_balance DOUBLE PRECISION,
  daily_impression_cap INTEGER,
  daily_impression_count INTEGER,
  last_reset_date DATE,
  is_ai_content BOOLEAN,
  relevance_score DOUBLE PRECISION,
  viewer_view_count INTEGER,
  effective_user_cap INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_lower TEXT := LOWER(BTRIM(COALESCE(p_user_email, '')));
  v_now TIMESTAMPTZ := clock_timestamp();
  v_today DATE := (clock_timestamp() AT TIME ZONE 'UTC')::DATE;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);

  v_country_lower TEXT := '';
  v_state_norm TEXT := '';
  v_loc_norm TEXT := '';
  v_gender_lower TEXT := '';
  v_emp_lower TEXT := '';
  v_user_age INTEGER := NULL;
  v_ad_status TEXT := 'active';
  v_u_interest TEXT[] := ARRAY[]::TEXT[];
  v_u_industry TEXT[] := ARRAY[]::TEXT[];
  v_u_behavior TEXT[] := ARRAY[]::TEXT[];
  v_u_lifestyle TEXT[] := ARRAY[]::TEXT[];
  v_u_personality TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_email_lower = '' THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.deactivated_users du WHERE LOWER(du.email) = v_email_lower) THEN
    RETURN;
  END IF;

  SELECT
    LOWER(BTRIM(COALESCE(u.country, ''))),
    public.normalize_geo_token(u.state),
    public.normalize_geo_token(u.location),
    LOWER(BTRIM(COALESCE(u.gender, ''))),
    LOWER(BTRIM(COALESCE(NULLIF(BTRIM(u.employment_status), ''), u.employment, ''))),
    CASE
      WHEN NULLIF(BTRIM(u.dob::TEXT), '') ~ '^\d{4}-\d{2}-\d{2}'
           AND LEFT(BTRIM(u.dob::TEXT), 10) <> '1970-01-01'
           AND UPPER(BTRIM(u.dob::TEXT)) <> 'PLACEHOLDER'
      THEN EXTRACT(YEAR FROM age(v_now::DATE, LEFT(BTRIM(u.dob::TEXT), 10)::DATE))::INTEGER
      ELSE NULL
    END,
    LOWER(BTRIM(COALESCE(u.ad_account_status, 'active'))),
    public.normalize_targeting_tokens(to_jsonb(u.interest)),
    public.normalize_targeting_tokens(to_jsonb(u.industry)),
    public.normalize_targeting_tokens(to_jsonb(u.behavior)),
    public.normalize_targeting_tokens(to_jsonb(u.lifestyle)),
    public.normalize_targeting_tokens(to_jsonb(u.personality))
  INTO
    v_country_lower,
    v_state_norm,
    v_loc_norm,
    v_gender_lower,
    v_emp_lower,
    v_user_age,
    v_ad_status,
    v_u_interest,
    v_u_industry,
    v_u_behavior,
    v_u_lifestyle,
    v_u_personality
  FROM public.users u
  WHERE LOWER(u.email) = v_email_lower
  LIMIT 1;

  IF NOT FOUND OR v_ad_status = 'deactivated' OR v_ad_status = 'perm_banned' THEN
    RETURN;
  END IF;

  IF v_country_lower = 'placeholder' THEN
    v_country_lower := '';
  END IF;

  IF v_country_lower = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH main_pool AS (
    SELECT a.*
    FROM public.addsactive a
    WHERE a.completed_at IS NULL
      AND COALESCE(a.is_paused, false) = false
      AND (COALESCE(a.impressions, 0) <= 0 OR COALESCE(a.impression_count, 0) < a.impressions)
      AND (a.scheduled_start_at IS NULL OR a.scheduled_start_at <= v_now)
      AND (
        COALESCE(a.targeting_all, false) = true
        OR COALESCE(a.is_admin_post, false) = true
        OR a.country IS NULL
        OR BTRIM(a.country) = ''
        OR LOWER(BTRIM(a.country)) IN ('all', 'any', 'global', 'everyone', 'worldwide', 'placeholder')
        OR LOWER(BTRIM(a.country)) = v_country_lower
        OR (',' || regexp_replace(LOWER(a.country), '[\[\]"\s]+', ',', 'g') || ',') LIKE ('%,' || v_country_lower || ',%')
      )
    ORDER BY COALESCE(a.bid_price, 0) DESC, a.cost_per_impression DESC, a.created_at DESC
    LIMIT 250
  ),
  standard_pool AS (
    SELECT a.*
    FROM public.addsactive a
    WHERE a.completed_at IS NULL
      AND COALESCE(a.is_paused, false) = false
      AND COALESCE(a.is_bidded, false) = false
      AND (COALESCE(a.impressions, 0) <= 0 OR COALESCE(a.impression_count, 0) < a.impressions)
      AND (a.scheduled_start_at IS NULL OR a.scheduled_start_at <= v_now)
      AND (
        COALESCE(a.targeting_all, false) = true
        OR COALESCE(a.is_admin_post, false) = true
        OR a.country IS NULL
        OR BTRIM(a.country) = ''
        OR LOWER(BTRIM(a.country)) IN ('all', 'any', 'global', 'everyone', 'worldwide', 'placeholder')
        OR LOWER(BTRIM(a.country)) = v_country_lower
        OR (',' || regexp_replace(LOWER(a.country), '[\[\]"\s]+', ',', 'g') || ',') LIKE ('%,' || v_country_lower || ',%')
      )
    ORDER BY a.cost_per_impression DESC, a.created_at DESC
    LIMIT 65
  ),
  rollover_pool AS (
    SELECT a.*
    FROM public.addsactive a
    WHERE a.completed_at IS NULL
      AND COALESCE(a.is_paused, false) = false
      AND (COALESCE(a.is_rollover, false) = true OR COALESCE(a.broadening_stage, 0) >= 1)
      AND (COALESCE(a.impressions, 0) <= 0 OR COALESCE(a.impression_count, 0) < a.impressions)
      AND (a.scheduled_start_at IS NULL OR a.scheduled_start_at <= v_now)
      AND (
        COALESCE(a.targeting_all, false) = true
        OR COALESCE(a.is_admin_post, false) = true
        OR a.country IS NULL
        OR BTRIM(a.country) = ''
        OR LOWER(BTRIM(a.country)) IN ('all', 'any', 'global', 'everyone', 'worldwide', 'placeholder')
        OR LOWER(BTRIM(a.country)) = v_country_lower
        OR (',' || regexp_replace(LOWER(a.country), '[\[\]"\s]+', ',', 'g') || ',') LIKE ('%,' || v_country_lower || ',%')
      )
    ORDER BY COALESCE(a.bid_price, 0) DESC, a.cost_per_impression DESC, a.created_at DESC
    LIMIT 60
  ),
  country_pool AS (
    SELECT DISTINCT ON (u_pool.id) u_pool.*
    FROM (
      SELECT * FROM main_pool
      UNION ALL
      SELECT * FROM standard_pool
      UNION ALL
      SELECT * FROM rollover_pool
    ) u_pool
  ),
  evaluated AS (
    SELECT
      a.*,
      rs.is_scheduled_future,
      rs.is_expired_platform,
      rs.is_rollover AS calc_is_rollover,
      GREATEST(COALESCE(a.broadening_stage, 0), rs.broadening_stage::INTEGER) AS eff_stage,
      rs.effective_user_cap AS eff_cap,
      GREATEST(1, COALESCE(a.campaign_days, 1)) AS safe_days,
      GREATEST(3600000.0, EXTRACT(EPOCH FROM (rs.effective_end_at - rs.effective_start_at)) * 1000.0) AS duration_ms,
      GREATEST(0.0, EXTRACT(EPOCH FROM (v_now - rs.effective_start_at)) * 1000.0) AS elapsed_ms,
      rs.duration_ratio,
      rs.impression_ratio,
      COALESCE(ai.view_count, 0)::INTEGER AS cur_views,
      CASE
        WHEN ai.last_viewed_at IS NOT NULL AND (ai.last_viewed_at AT TIME ZONE 'UTC')::DATE = v_today
        THEN COALESCE(ai.today_view_count, 0)::INTEGER
        ELSE 0
      END AS cur_today_views,
      ai.last_viewed_at AS cur_last_viewed_at,
      public.normalize_targeting_tokens(to_jsonb(a.state)) || public.normalize_targeting_tokens(to_jsonb(a.province)) AS ad_states,
      public.normalize_targeting_tokens(to_jsonb(a.gender)) AS ad_genders,
      public.normalize_targeting_tokens(to_jsonb(a.employment_status)) AS ad_emps,
      public.normalize_targeting_tokens(to_jsonb(a.interest)) AS ad_interest,
      public.normalize_targeting_tokens(to_jsonb(a.industry)) AS ad_industry,
      public.normalize_targeting_tokens(to_jsonb(a.behavior)) AS ad_behavior,
      public.normalize_targeting_tokens(to_jsonb(a.lifestyle)) AS ad_lifestyle,
      public.normalize_targeting_tokens(to_jsonb(a.personality)) AS ad_personality,
      to_jsonb(a.age_range) AS ad_age_json,
      GREATEST(
        COALESCE(a.bid_price::DOUBLE PRECISION, 0),
        COALESCE(ba.bid_price::DOUBLE PRECISION, 0),
        COALESCE(a.cost_per_impression::DOUBLE PRECISION, 0)
      ) AS auction_bid
    FROM country_pool a
    LEFT JOIN public.bidded_ads ba ON ba.ad_id = a.id AND ba.is_active = true
    LEFT JOIN public.ad_impressions ai ON ai.ad_id = a.id AND LOWER(ai.user_email) = v_email_lower
    CROSS JOIN LATERAL public.get_campaign_rollover_state(
      a.created_at::TIMESTAMPTZ,
      a.approved_at::TIMESTAMPTZ,
      a.scheduled_start_at::TIMESTAMPTZ,
      a.scheduled_end_at::TIMESTAMPTZ,
      COALESCE(a.campaign_days, 1)::INT,
      COALESCE(a.impressions, 0)::INT,
      COALESCE(a.impression_count, 0)::INT,
      COALESCE(a.cost_per_impression, 0)::NUMERIC,
      COALESCE(a.is_admin_post, FALSE)::BOOLEAN,
      COALESCE(a.user_frequency_cap, 1)::INT,
      v_now
    ) rs
    WHERE rs.is_scheduled_future = false
      AND rs.is_expired_platform = false
      AND (COALESCE(a.is_admin_post, false) = true OR LOWER(COALESCE(a.user_email, '')) <> v_email_lower)
      AND NOT EXISTS (
        SELECT 1 FROM public.deactivated_users du
        WHERE LOWER(du.email) = LOWER(a.user_email)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_ads ba_blk
        WHERE LOWER(ba_blk.reporter_email) = v_email_lower AND ba_blk.ad_id::TEXT = a.id::TEXT
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_advertisers bv_blk
        WHERE LOWER(bv_blk.reporter_email) = v_email_lower AND LOWER(bv_blk.advertiser_email) = LOWER(a.user_email)
      )
      AND (
        COALESCE(a.daily_impression_cap, 0) <= 0
        OR a.last_reset_date IS NULL
        OR a.last_reset_date < v_today
        OR COALESCE(a.daily_impression_count, 0) < (COALESCE(a.daily_impression_cap, 0) + COALESCE(a.rollover_balance, 0))
      )
  ),
  pacing_eval AS (
    SELECT
      e.*,
      GREATEST(1, CEIL(COALESCE(e.user_frequency_cap, 1)::DOUBLE PRECISION / e.safe_days::DOUBLE PRECISION))::INTEGER AS base_daily_cap,
      GREATEST(1, CEIL((e.duration_ms - LEAST(e.elapsed_ms, e.duration_ms * 0.95)) / 86400000.0))::INTEGER AS remaining_days
    FROM evaluated e
  ),
  pacing_bounds AS (
    SELECT
      p.*,
      CASE
        WHEN p.eff_stage >= 2 THEN GREATEST(p.base_daily_cap + 1, CEIL(p.eff_cap::DOUBLE PRECISION / GREATEST(1, p.remaining_days)::DOUBLE PRECISION)::INTEGER)
        WHEN p.eff_stage = 1 THEN GREATEST(p.base_daily_cap, CEIL(p.eff_cap::DOUBLE PRECISION / GREATEST(1, p.remaining_days)::DOUBLE PRECISION)::INTEGER)
        ELSE p.base_daily_cap
      END AS eff_daily_cap,
      CASE
        WHEN p.eff_cap <= 1 THEN p.duration_ms * 2.0
        WHEN p.base_daily_cap > 12 THEN 0.0
        WHEN p.eff_stage >= 2 THEN GREATEST(5400000.0, LEAST(14400000.0, FLOOR(p.duration_ms / (p.eff_cap * 2.0))))
        WHEN p.eff_stage = 1 THEN GREATEST(7200000.0, LEAST(21600000.0, FLOOR(p.duration_ms / (p.eff_cap * 2.0))))
        ELSE GREATEST(7200000.0, LEAST(43200000.0, FLOOR(p.duration_ms / GREATEST(2.0, p.eff_cap * 2.0))))
      END AS eff_spacing_ms,
      (
        (CASE WHEN COALESCE(p.is_boosted, false) OR COALESCE(p.boosted_amount, 0) > 0 THEN 1.25 ELSE 1.0 END)
        * (
          CASE
            WHEN p.eff_stage >= 2 THEN 1.45
            WHEN p.eff_stage = 1 THEN 1.22
            ELSE 1.0 + GREATEST(0.0, LEAST(1.5, p.duration_ratio::DOUBLE PRECISION) - p.impression_ratio::DOUBLE PRECISION) * 0.35
          END
        )
      )::DOUBLE PRECISION AS eff_urgency
    FROM pacing_eval p
  ),
  matched AS (
    SELECT
      e.*,
      (
        COALESCE(e.targeting_all, false) = true
        OR COALESCE(e.is_admin_post, false) = true
        OR e.eff_stage >= 2
        OR cardinality(e.ad_states) = 0
        OR (v_state_norm = '' AND v_loc_norm = '')
        OR EXISTS (
          SELECT 1 FROM unnest(e.ad_states) AS st
          WHERE public.normalize_geo_token(st) <> ''
            AND (
              (v_state_norm <> '' AND (v_state_norm = public.normalize_geo_token(st) OR v_state_norm LIKE '%' || public.normalize_geo_token(st) || '%' OR public.normalize_geo_token(st) LIKE '%' || v_state_norm || '%'))
              OR (v_loc_norm <> '' AND (v_loc_norm = public.normalize_geo_token(st) OR v_loc_norm LIKE '%' || public.normalize_geo_token(st) || '%' OR public.normalize_geo_token(st) LIKE '%' || v_loc_norm || '%'))
            )
        )
      ) AS geo_state_ok,
      (
        COALESCE(e.targeting_all, false) = true
        OR COALESCE(e.is_admin_post, false) = true
        OR e.eff_stage >= 2
        OR cardinality(e.ad_genders) = 0
        OR v_gender_lower = ''
        OR v_gender_lower = ANY(e.ad_genders)
      ) AS gender_ok,
      (
        COALESCE(e.targeting_all, false) = true
        OR COALESCE(e.is_admin_post, false) = true
        OR e.eff_stage >= 2
        OR cardinality(e.ad_emps) = 0
        OR v_emp_lower = ''
        OR v_emp_lower = ANY(e.ad_emps)
      ) AS emp_ok,
      (
        COALESCE(e.targeting_all, false) = true
        OR COALESCE(e.is_admin_post, false) = true
        OR e.eff_stage >= 2
        OR v_user_age IS NULL
        OR e.ad_age_json IS NULL
        OR jsonb_typeof(e.ad_age_json) <> 'array'
        OR jsonb_array_length(e.ad_age_json) < 2
        OR NOT ((e.ad_age_json ->> 0) ~ '^\d+$' AND (e.ad_age_json ->> 1) ~ '^\d+$')
        OR v_user_age BETWEEN LEAST((e.ad_age_json ->> 0)::INTEGER, (e.ad_age_json ->> 1)::INTEGER)
                           AND GREATEST((e.ad_age_json ->> 0)::INTEGER, (e.ad_age_json ->> 1)::INTEGER)
      ) AS age_ok,
      (
        CASE WHEN cardinality(e.ad_interest) > 0 AND e.ad_interest && v_u_interest THEN 3 ELSE 0 END +
        CASE WHEN cardinality(e.ad_industry) > 0 AND e.ad_industry && v_u_industry THEN 3 ELSE 0 END +
        CASE WHEN cardinality(e.ad_behavior) > 0 AND e.ad_behavior && v_u_behavior THEN 2 ELSE 0 END +
        CASE WHEN cardinality(e.ad_lifestyle) > 0 AND e.ad_lifestyle && v_u_lifestyle THEN 2 ELSE 0 END +
        CASE WHEN cardinality(e.ad_personality) > 0 AND e.ad_personality && v_u_personality THEN 2 ELSE 0 END
      ) AS psych_score,
      (
        cardinality(e.ad_interest) = 0
        AND cardinality(e.ad_industry) = 0
        AND cardinality(e.ad_behavior) = 0
        AND cardinality(e.ad_lifestyle) = 0
        AND cardinality(e.ad_personality) = 0
      ) AS psych_wildcard
    FROM pacing_bounds e
    WHERE
      (COALESCE(e.is_admin_post, false) = true OR e.cur_views < e.eff_cap)
      AND (COALESCE(e.is_admin_post, false) = true OR e.cur_today_views < e.eff_daily_cap)
      AND (
        COALESCE(e.is_admin_post, false) = true
        OR e.cur_views = 0
        OR e.cur_last_viewed_at IS NULL
        OR EXTRACT(EPOCH FROM (v_now - e.cur_last_viewed_at)) * 1000.0 >= e.eff_spacing_ms
      )
  ),
  scored AS (
    SELECT
      m.*,
      (
        (CASE WHEN m.cur_views = 0 THEN 500.0 ELSE 0.0 END)
        + (CASE WHEN m.psych_wildcard OR m.psych_score > 0 OR m.eff_stage >= 1 THEN 250.0 ELSE 0.0 END)
        + (m.psych_score * 15.0)
        + LEAST(300.0, m.auction_bid * 0.25)
        + (CASE WHEN COALESCE(m.is_bidded, false) THEN 120.0 ELSE 0.0 END)
        + (CASE WHEN COALESCE(m.is_boosted, false) THEN 80.0 ELSE 0.0 END)
        + ((m.eff_urgency - 1.0) * 60.0)
        + (CASE WHEN m.created_at >= (v_now - interval '24 hours') THEN 35.0 ELSE 0.0 END)
      )::DOUBLE PRECISION AS raw_score
    FROM matched m
    WHERE m.geo_state_ok AND m.gender_ok AND m.emp_ok AND m.age_ok
  ),
  fair_spaced AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(COALESCE(s.user_email, ''))
        ORDER BY s.raw_score DESC, s.created_at DESC
      ) AS advertiser_slot_idx,
      (
        COALESCE(s.is_bidded, false) = true
        OR (COALESCE(s.bid_price, 0) > 0 AND COALESCE(s.bid_price, 0) > COALESCE(s.cost_per_impression, 0))
      ) AS is_bidded_tier
    FROM scored s
  ),
  tier_interleaved AS (
    SELECT
      f.*,
      ROW_NUMBER() OVER (
        PARTITION BY f.is_bidded_tier
        ORDER BY f.advertiser_slot_idx ASC, f.raw_score DESC, f.created_at DESC
      ) AS tier_pos
    FROM fair_spaced f
  )
  SELECT
    f.id::TEXT,
    f.user_email::TEXT,
    f.ad_media::TEXT,
    f.ad_media_type::TEXT,
    f.ad_content::TEXT,
    f.ad_type::TEXT,
    f.product_name::TEXT,
    f.product_price::DOUBLE PRECISION,
    f.product_cta_type::TEXT,
    f.product_cta_link::TEXT,
    f.action_phone::TEXT,
    f.action_whatsapp::TEXT,
    f.action_email::TEXT,
    f.action_website::TEXT,
    f.action_ios::TEXT,
    f.action_android::TEXT,
    f.action_watch_now::TEXT,
    to_jsonb(f.ad_action_buttons),
    COALESCE(f.cost_per_impression, 0)::DOUBLE PRECISION,
    f.bid_price::DOUBLE PRECISION,
    COALESCE(f.is_bidded, false),
    COALESCE(f.is_boosted, false),
    COALESCE(f.boosted_amount, 0)::DOUBLE PRECISION,
    f.boosted_at::TIMESTAMPTZ,
    COALESCE(f.display_mutual_button, true),
    to_jsonb(f.mutual_targets),
    COALESCE(f.mutual_adds_count, 0)::INTEGER,
    to_jsonb(f.interest),
    to_jsonb(f.industry),
    to_jsonb(f.behavior),
    to_jsonb(f.lifestyle),
    to_jsonb(f.personality),
    f.country::TEXT,
    f.state::TEXT,
    f.province::TEXT,
    f.gender::TEXT,
    f.employment_status::TEXT,
    to_jsonb(f.age_range),
    COALESCE(f.targeting_all, false),
    COALESCE(f.is_paused, false),
    COALESCE(f.is_admin_post, false),
    COALESCE(f.user_frequency_cap, 1)::INTEGER,
    COALESCE(f.campaign_days, 1)::INTEGER,
    COALESCE(f.impressions, 0)::INTEGER,
    COALESCE(f.impression_count, 0)::INTEGER,
    f.completed_at::TIMESTAMPTZ,
    f.created_at::TIMESTAMPTZ,
    f.approved_at::TIMESTAMPTZ,
    f.scheduled_start_at::TIMESTAMPTZ,
    f.scheduled_end_at::TIMESTAMPTZ,
    COALESCE(f.calc_is_rollover, f.is_rollover, false),
    f.rollover_started_at::TIMESTAMPTZ,
    f.eff_stage::INTEGER,
    COALESCE(f.rollover_balance, 0)::DOUBLE PRECISION,
    f.daily_impression_cap::INTEGER,
    COALESCE(f.daily_impression_count, 0)::INTEGER,
    f.last_reset_date::DATE,
    COALESCE(f.is_ai_content, false),
    f.raw_score,
    f.cur_views,
    f.eff_cap
  FROM tier_interleaved f
  ORDER BY
    CASE
      WHEN f.is_bidded_tier THEN f.tier_pos + ((f.tier_pos - 1) / 3)
      ELSE f.tier_pos * 4
    END ASC,
    f.advertiser_slot_idx ASC,
    f.raw_score DESC,
    f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_feed(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_feed(TEXT, INTEGER, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
