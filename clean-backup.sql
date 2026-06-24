-- CLEAN BACKUP FOR PUBLIC SCHEMA

CREATE TABLE public.ad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ad_type text NOT NULL,
    industry text,
    interest text,
    lifestyle text,
    behavior text,
    personality text,
    country text,
    state text,
    province text,
    gender text,
    employment_status text,
    age_range_min integer,
    age_range_max integer,
    impressions integer NOT NULL,
    cost_per_impression numeric,
    total_cost numeric
);
CREATE TABLE public.adds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_type text NOT NULL,
    industry text[] DEFAULT '{}'::text[],
    interest text[] DEFAULT '{}'::text[],
    lifestyle text[] DEFAULT '{}'::text[],
    behavior text[] DEFAULT '{}'::text[],
    personality text[] DEFAULT '{}'::text[],
    age_range integer[] DEFAULT ARRAY[18, 65],
    targeting_all boolean DEFAULT false,
    impressions integer DEFAULT 1000,
    country text,
    state text,
    province text,
    gender text,
    employment_status text,
    ad_media_type text,
    ad_content text,
    ad_media_url text,
    ad_action_buttons text[] DEFAULT '{}'::text[],
    action_phone text,
    action_whatsapp text,
    action_website text,
    action_email text,
    cost_per_impression numeric(10,2),
    total_cost numeric(12,2),
    created_at timestamp without time zone DEFAULT now(),
    email text,
    user_id uuid,
    ad_media text,
    impression_count numeric,
    seen_users text[],
    user_email text,
    CONSTRAINT adds_ad_media_type_check CHECK ((ad_media_type = ANY (ARRAY['image'::text, 'video'::text])))
);
CREATE TABLE public.addsactive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_type text NOT NULL,
    industry text[] DEFAULT '{}'::text[],
    interest text[] DEFAULT '{}'::text[],
    lifestyle text[] DEFAULT '{}'::text[],
    behavior text[] DEFAULT '{}'::text[],
    personality text[] DEFAULT '{}'::text[],
    age_range integer[] DEFAULT ARRAY[18, 65],
    targeting_all boolean DEFAULT false,
    impressions integer DEFAULT 1000,
    country text,
    state text,
    province text,
    gender text,
    employment_status text,
    ad_media_type text,
    ad_content text,
    ad_media_url text,
    ad_action_buttons text[] DEFAULT '{}'::text[],
    action_phone text,
    action_whatsapp text,
    action_website text,
    action_email text,
    cost_per_impression numeric(10,2),
    total_cost numeric(12,2),
    created_at timestamp without time zone DEFAULT now(),
    email text,
    user_id uuid,
    ad_media text,
    impression_count numeric,
    seen_users text[],
    user_email text,
    CONSTRAINT adds_ad_media_type_check CHECK ((ad_media_type = ANY (ARRAY['image'::text, 'video'::text])))
);
COMMENT ON TABLE public.addsactive IS 'This is a duplicate of adds';
CREATE TABLE public.ads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_type text NOT NULL,
    industry text[],
    interest text[],
    lifestyle text[],
    behavior text[],
    personality text[],
    age_range integer[],
    impressions integer,
    country text,
    state text,
    province text,
    gender text,
    employment_status text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    email text,
    user_id uuid,
    impression numeric,
    cost numeric,
    ad_media_type text,
    ad_content text,
    ad_action_buttons text[],
    action_details jsonb,
    media text,
    ad_id uuid,
    media_images text[],
    media_video text,
    company_logo text,
    media_url text
);
CREATE TABLE public.news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    image_url text NOT NULL,
    interest text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    user_id uuid,
    user_email text
);
CREATE TABLE public.newsactive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    image_url text NOT NULL,
    interest text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    user_id uuid,
    user_email text
);
COMMENT ON TABLE public.newsactive IS 'This is a duplicate of news';
CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    username text NOT NULL,
    dob date NOT NULL,
    country text NOT NULL,
    state text NOT NULL,
    location text NOT NULL,
    industry text[],
    interest text[],
    behavior text[],
    lifestyle text[],
    personality text[],
    gender text,
    employment text,
    email text NOT NULL,
    phone text NOT NULL,
    intl_travel boolean,
    local_travel boolean,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    passphrase text,
    "firstName" text,
    "lastName" text,
    bio text,
    "profileImage" text,
    "lastUpdated" text,
    monetized text,
    monetized_at timestamp without time zone
);
ALTER TABLE ONLY public.ad
    ADD CONSTRAINT ad_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.adds
    ADD CONSTRAINT adds_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.addsactive
    ADD CONSTRAINT addsactive_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.newsactive
    ADD CONSTRAINT newsactive_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT unique_email UNIQUE (email);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT unique_passphrase UNIQUE (passphrase);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT unique_phone UNIQUE (phone);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT unique_username UNIQUE (username);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE POLICY "Enable delete for users based on user_id" ON public.adds FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Enable delete for users based on user_id" ON public.ads FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Enable delete for users based on user_id" ON public.news FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Enable insert for authenticated users only" ON public.adds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.ads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.news FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable read access for all users" ON public.adds FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.ads FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.news FOR SELECT USING (true);
CREATE POLICY "Enable update for users based on email" ON public.adds FOR UPDATE USING (((( SELECT auth.jwt() AS jwt) ->> 'email'::text) = email)) WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'email'::text) = email));
CREATE POLICY "Enable update for users based on email" ON public.ads FOR UPDATE USING (((( SELECT auth.jwt() AS jwt) ->> 'email'::text) = email)) WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'email'::text) = email));
GRANT ALL ON TABLE public.ad TO anon;
GRANT ALL ON TABLE public.ad TO authenticated;
GRANT ALL ON TABLE public.ad TO service_role;
GRANT ALL ON TABLE public.adds TO anon;
GRANT ALL ON TABLE public.adds TO authenticated;
GRANT ALL ON TABLE public.adds TO service_role;
GRANT ALL ON TABLE public.addsactive TO anon;
GRANT ALL ON TABLE public.addsactive TO authenticated;
GRANT ALL ON TABLE public.addsactive TO service_role;
GRANT ALL ON TABLE public.ads TO anon;
GRANT ALL ON TABLE public.ads TO authenticated;
GRANT ALL ON TABLE public.ads TO service_role;
GRANT ALL ON TABLE public.news TO anon;
GRANT ALL ON TABLE public.news TO authenticated;
GRANT ALL ON TABLE public.news TO service_role;
GRANT ALL ON TABLE public.newsactive TO anon;
GRANT ALL ON TABLE public.newsactive TO authenticated;
GRANT ALL ON TABLE public.newsactive TO service_role;
GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

-- DATA INSERTS

