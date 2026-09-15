import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getCachedProfile, setCachedProfile } from "@/lib/utils/cache";
import { safeParseArray } from "@/lib/utils/parsers";
import { UserProfile } from "@/components/DashboardClient/page";
import redisConnection from "@/lib/redis";
import crypto from "crypto";
import { isAdminEmail } from "@/lib/authHelper";
import { touchUserActivity } from "@/lib/utils/activityTracker";
import { isDefaultProviderAvatar } from "@/lib/utils/avatar";

export interface DashboardProfileResult {
  user?: UserProfile;
  parsedInterest?: string[];
  email?: string;
  initialAds?: any[];
  initialProfiles?: Record<string, any>;
  redirectUrl?: string;
  error?: string;
}

export async function getUserProfileForDashboard(session: any): Promise<DashboardProfileResult> {
  const rawEmail = session?.user?.email;
  if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.trim()) {
    return { error: "No valid email associated with session" };
  }
  const email = rawEmail.toLowerCase().trim();

  const BASELINE_COLUMNS = `
    id,
    "profileImage",
    username,
    "firstName",
    "lastName",
    "lastUpdated",
    bio,
    interest,
    email,
    industry,
    behavior,
    lifestyle,
    personality,
    gender,
    monetized,
    monetized_at,
    created_at,
    monetized_until,
    monetization_type,
    country,
    state,
    location,
    phone,
    business_name,
    passphrase,
    mutual_count,
    balance,
    withdrawal,
    bvn_hash,
    monetization_clicks,
    last_active_at
  `;

  const PROFILE_COLUMNS = `
    id,
    "profileImage",
    username,
    "firstName",
    "lastName",
    "lastUpdated",
    bio,
    interest,
    email,
    industry,
    behavior,
    lifestyle,
    personality,
    gender,
    monetized,
    monetized_at,
    created_at,
    monetized_until,
    monetization_type,
    country,
    state,
    location,
    phone,
    business_name,
    passphrase,
    mutual_count,
    balance,
    withdrawal,
    bvn_hash,
    monetization_clicks,
    last_active_at,
    referral_code,
    referral_downloads_count,
    atw_tier
  `;

  // 1. Attempt to fetch from Redis cache first (<0.1ms)
  let user: any = await getCachedProfile(email);

  if (user) {
    console.log(`🚀 Profile cache hit in Server Component for: ${email}`);
  } else {
    // Fetch user profile from Supabase with retries (resilience to flaky networks / transient DNS hiccups)
    let dbError = null;
    let dbData = null;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await supabaseAdmin
          .from("users")
          .select(PROFILE_COLUMNS)
          .eq("email", email)
          .maybeSingle();

        if (res.error) {
          const fallback = await supabaseAdmin
            .from("users")
            .select(BASELINE_COLUMNS)
            .ilike("email", email)
            .maybeSingle();

          if (fallback.data) {
            dbData = fallback.data as any;
            dbError = null;
            break;
          } else {
            dbError = fallback.error || res.error;
          }
        } else if (res.data) {
          dbData = res.data as any;
          dbError = null;
          break;
        } else {
          // No data found with exact match, try case-insensitive fallback
          const fallback = await supabaseAdmin
            .from("users")
            .select(BASELINE_COLUMNS)
            .ilike("email", email)
            .maybeSingle();

          if (fallback.data) {
            dbData = fallback.data as any;
            dbError = null;
            break;
          }
          // User truly not in DB
          break;
        }
      } catch (err: any) {
        dbError = err;
        console.warn(`⚠️ Supabase profile fetch attempt ${attempt + 1} encountered exception:`, err?.message || err);
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }

    user = dbData;
    if (user) {
      await setCachedProfile(email, user);
    }
  }

  // 2. If user does not exist in DB, auto-provision
  if (!user) {
    console.log(`👤 User not found in database. Auto-provisioning profile for: ${email}`);
    const givenName = String(session.user.given_name || session.user.name || email.split("@")[0] || "User").trim();
    const familyName = String(session.user.family_name || "").trim();
    const rawPicture = typeof session.user.picture === "string" ? session.user.picture : "";
    const profileImage = isDefaultProviderAvatar(rawPicture) ? "" : rawPicture;
    const business_name = typeof session.user.business_name === "string" ? session.user.business_name : "";

    const timestamp = Date.now();
    const rand = Math.floor(Math.random() * 1000000);
    const dummyPhone = `PLACEHOLDER_PHONE_${timestamp}_${rand}`;
    const dummyPassphrase = `PLACEHOLDER_PASS_${timestamp}_${rand}`;

    let provisionSucceeded = false;

    // Try RPC auto-provisioning first
    try {
      const { error: insertError } = await supabaseAdmin.rpc("auto_provision_user", {
        p_email: email,
        p_first_name: givenName,
        p_last_name: familyName,
        p_profile_image: profileImage,
        p_business_name: business_name,
        p_phone: dummyPhone,
        p_passphrase: dummyPassphrase,
      });

      if (!insertError) {
        provisionSucceeded = true;
      } else {
        const errDetail = {
          message: insertError.message || "(no message)",
          code: insertError.code || "(no code)",
          details: insertError.details || "(no details)",
          hint: insertError.hint || "(no hint)",
        };
        console.warn("⚠️ Auto-provisioning RPC failed:", JSON.stringify(errDetail));
      }
    } catch (rpcErr: any) {
      console.warn("⚠️ Auto-provisioning RPC network exception:", rpcErr?.message || rpcErr);
    }

    if (!provisionSucceeded) {
      // Attempt resilient direct insert fallback into public.users
      console.log(`🔄 Attempting direct table insert fallback for: ${email}`);
      try {
        const { error: directInsertError } = await supabaseAdmin
          .from("users")
          .insert({
            email,
            username: email,
            business_name,
            firstName: givenName,
            lastName: familyName,
            profileImage,
            dob: "1970-01-01",
            country: "PLACEHOLDER",
            state: "PLACEHOLDER",
            location: "PLACEHOLDER",
            phone: dummyPhone,
            passphrase: dummyPassphrase,
            industry: [],
            interest: [],
            behavior: [],
            lifestyle: [],
            personality: [],
            intl_travel: false,
            local_travel: false,
            balance: 0.0,
            withdrawal: 0.0,
            mutual_count: 0,
            mutuals: [],
            monetized: false,
          });

        if (!directInsertError) {
          provisionSucceeded = true;
        } else {
          const directErrDetail = {
            message: directInsertError.message || "(no message)",
            code: directInsertError.code || "(no code)",
            details: directInsertError.details || "(no details)",
            hint: directInsertError.hint || "(no hint)",
          };
          console.warn("⚠️ Direct fallback insert warning:", JSON.stringify(directErrDetail));

          // Check if user actually exists despite the error (e.g. race condition / unique constraint collision)
          const { data: existingUser } = await supabaseAdmin
            .from("users")
            .select(BASELINE_COLUMNS)
            .ilike("email", email)
            .maybeSingle();

          if (existingUser) {
            console.log(`✅ User was resolved after insert conflict for: ${email}`);
            user = existingUser;
            await setCachedProfile(email, user);
          }
        }
      } catch (directErr: any) {
        console.warn("⚠️ Direct fallback insert network exception:", directErr?.message || directErr);
      }
    }

    // Always gracefully redirect new / unprovisioned users to profile-setup rather than crashing dashboard
    if (!user) {
      return { redirectUrl: "/user/profile-setup" };
    }
  }

  // 3. If user has not completed initial profile setup, redirect
  if (user.country === "PLACEHOLDER" || user.state === "PLACEHOLDER" || user.location === "PLACEHOLDER") {
    return { redirectUrl: "/user/profile-setup" };
  }

  const parsedInterest = safeParseArray(user.interest);

  // Lazy evaluation of activity & 7-day inactivity reset on login
  touchUserActivity(email, user).catch(() => {});

  // 4. Server-Side Feed Pre-load: If Redis already has candidate ads cached, hydrate initialAds
  let initialAds: any[] | undefined = undefined;
  let initialProfiles: Record<string, any> | undefined = undefined;
  try {
    const [cachedAdIdsStr, cachedProfilesStr] = await Promise.all([
      redisConnection.get(`feed:ad_ids:${email}`).catch(() => null),
      redisConnection.get(`feed:profiles:${email}`).catch(() => null),
    ]);

    if (cachedAdIdsStr) {
      const adIds: string[] = JSON.parse(cachedAdIdsStr).slice(0, 10);
      if (adIds.length > 0) {
        const detailKeys = adIds.map((id) => `ad:detail:${id}`);
        const rawDetails = await redisConnection.mget(detailKeys).catch(() => []);
        const secretKey = process.env.AUTH0_SECRET || "xea-default-auth0-secret-key-32ch";
        const servedAt = Date.now();

        initialAds = (rawDetails || [])
          .map((raw) => {
            if (!raw) return null;
            try {
              const ad = JSON.parse(raw);
              const isPlatformPost = Boolean(
                ad.is_admin_post ||
                isAdminEmail(ad.user_email || ad.email) ||
                !ad.cost_per_impression ||
                Number(ad.cost_per_impression) <= 0 ||
                !ad.impressions ||
                Number(ad.impressions) <= 0
              );
              const payload = `${ad.id}:${email}:${servedAt}`;
              const token = crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
              return {
                ...ad,
                is_admin_post: isPlatformPost,
                cost_per_impression: isPlatformPost ? 0 : Number(ad.cost_per_impression || 0),
                impressions: isPlatformPost ? 0 : Number(ad.impressions || 0),
                verification_token: token,
                served_at: servedAt,
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        if (cachedProfilesStr) {
          try {
            initialProfiles = JSON.parse(cachedProfilesStr);
          } catch {}
        }
      }
    }
  } catch (err) {
    // Non-blocking prefetch failure fallback
  }

  return {
    user: user as UserProfile,
    parsedInterest,
    email,
    initialAds,
    initialProfiles,
  };
}
