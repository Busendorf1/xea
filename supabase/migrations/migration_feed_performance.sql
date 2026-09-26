-- MIGRATION: OPTIMIZE FEED PERFORMANCE & THREAD SAFETY FOR XEA AD SYSTEM
-- Run this SQL in your Supabase Dashboard -> SQL Editor.

-- 1. Add new columns for Daily Impression Capping & Frequency Capping to the public.adds table
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS campaign_days integer DEFAULT 1;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS daily_impression_cap integer;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS daily_impression_count integer DEFAULT 0;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS last_reset_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS user_frequency_cap integer DEFAULT 1;

-- 2. Create a join table to normalize ad views (replacing in-memory array appends on the main ad row)
CREATE TABLE IF NOT EXISTS public.ad_impressions (
    id BIGSERIAL PRIMARY KEY,
    ad_id UUID REFERENCES public.adds(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    view_count integer DEFAULT 1
);

-- Add column if table already exists but column does not
ALTER TABLE public.ad_impressions ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 1;

-- Indexing for fast checking and preventing duplicate views
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_impressions_user_ad ON public.ad_impressions(user_email, ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_email ON public.ad_impressions(user_email);

-- Indexing adds for performance
CREATE INDEX IF NOT EXISTS idx_adds_targeting_all ON public.adds(targeting_all);

-- 3. Create the get_user_feed stored procedure (RPC)
-- This performs demographic matching, daily cap filtering, frequency cap filtering, and sorting randomly in the DB.
CREATE OR REPLACE FUNCTION public.get_user_feed(
  p_user_email TEXT,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS SETOF public.adds AS $$
DECLARE
  v_user RECORD;
  v_age INT;
BEGIN
  -- Fetch user profile traits
  SELECT * INTO v_user FROM public.users WHERE email ILIKE p_user_email LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Compute age from DOB
  v_age := date_part('year', age(v_user.dob));

  -- Query and return randomly shuffled matching ads
  RETURN QUERY
  SELECT a.*
  FROM public.adds a
  WHERE 
    -- Exclude ads this user has already seen up to/exceeding their target frequency cap
    NOT EXISTS (
      SELECT 1 FROM public.ad_impressions imp 
      WHERE imp.ad_id = a.id 
        AND imp.user_email = p_user_email 
        AND imp.view_count >= COALESCE(a.user_frequency_cap, 1)
    )
    -- Demographic restrictions: country
    AND (a.country IS NULL OR a.country = '' OR a.country ILIKE v_user.country)
    -- Demographic restrictions: gender (allows both to match male/female)
    AND (a.gender IS NULL OR a.gender = '' OR a.gender = 'both' OR a.gender ILIKE v_user.gender)
    -- Demographic restrictions: employment status
    AND (a.employment_status IS NULL OR a.employment_status = '' OR lower(v_user.employment) = ANY(string_to_array(replace(lower(a.employment_status), ' ', ''), ',')))
    -- Demographic restrictions: age range (represented as integer[] e.g., ARRAY[minAge, maxAge])
    AND (
      a.age_range IS NULL 
      OR cardinality(a.age_range) < 2 
      OR (v_age >= a.age_range[1] AND v_age <= a.age_range[2])
    )
    -- Targeting interests/lifestyle/etc.
    AND (
      a.targeting_all = TRUE
      OR a.interest && v_user.interest
      OR a.lifestyle && v_user.lifestyle
      OR a.personality && v_user.personality
      OR a.behavior && v_user.behavior
      OR a.industry && v_user.industry
    )
    -- Daily impression capping logic:
    AND (
      a.daily_impression_cap IS NULL
      OR a.last_reset_date IS NULL
      OR a.last_reset_date < CURRENT_DATE
      OR a.daily_impression_count < a.daily_impression_cap
    )
  ORDER BY random() -- Shuffle randomly for every user feed request
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create the record_ad_impression stored procedure (RPC)
-- Atomic count increment, daily cap reset/increment, user frequency upsert, and budget threshold deletion.
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_user_email TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_count INT;
  v_max_impressions INT;
  v_daily_count INT;
  v_reset_date DATE;
  v_daily_cap INT;
  v_user_freq_cap INT;
  v_user_views INT;
BEGIN
  -- Fetch current frequency cap for the ad
  SELECT COALESCE(user_frequency_cap, 1) INTO v_user_freq_cap
  FROM public.adds
  WHERE id = p_ad_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Fetch current user views
  SELECT view_count INTO v_user_views
  FROM public.ad_impressions
  WHERE ad_id = p_ad_id AND user_email = p_user_email;

  -- If user has already reached/exceeded frequency limit, do not count
  IF v_user_views IS NOT NULL AND v_user_views >= v_user_freq_cap THEN
    RETURN FALSE;
  END IF;

  -- Upsert the user view count in the ad_impressions join table
  INSERT INTO public.ad_impressions (ad_id, user_email, view_count)
  VALUES (p_ad_id, p_user_email, 1)
  ON CONFLICT (user_email, ad_id)
  DO UPDATE SET view_count = ad_impressions.view_count + 1;

  -- Fetch current daily cap values
  SELECT daily_impression_count, last_reset_date, daily_impression_cap
  INTO v_daily_count, v_reset_date, v_daily_cap
  FROM public.adds
  WHERE id = p_ad_id;

  -- Compute new daily counts (lazy reset)
  IF v_reset_date IS NULL OR v_reset_date < CURRENT_DATE THEN
    v_daily_count := 1;
    v_reset_date := CURRENT_DATE;
  ELSE
    v_daily_count := COALESCE(v_daily_count, 0) + 1;
  END IF;

  -- Increment total impression count and update daily cap values atomically
  UPDATE public.adds
  SET impression_count = COALESCE(impression_count, 0) + 1,
      daily_impression_count = v_daily_count,
      last_reset_date = v_reset_date
  WHERE id = p_ad_id
  RETURNING impression_count, impressions INTO v_current_count, v_max_impressions;

  -- Delete ad if it has reached its threshold limit
  IF v_current_count >= v_max_impressions THEN
    DELETE FROM public.adds WHERE id = p_ad_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
