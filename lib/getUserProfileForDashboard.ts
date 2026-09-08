import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getCachedProfile, setCachedProfile } from "@/lib/utils/cache";
import { safeParseArray } from "@/lib/utils/parsers";
import { UserProfile } from "@/components/DashboardClient/page";

export interface DashboardProfileResult {
  user?: UserProfile;
  parsedInterest?: string[];
  email?: string;
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
    console.log(`🔄 Profile cache miss in Server Component for: ${email}. Fetching from Supabase...`);
    let { data: dbData, error: dbError } = await supabaseAdmin
      .from("users")
      .select(PROFILE_COLUMNS)
      .eq("email", email)
      .maybeSingle();

    if (dbError || !dbData) {
      // Try case-insensitive fallback if exact email didn't match
      const fallback = await supabaseAdmin
        .from("users")
        .select(BASELINE_COLUMNS)
        .ilike("email", email)
        .maybeSingle();

      if (fallback.data) {
        dbData = fallback.data as any;
        dbError = null;
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
    const profileImage = typeof session.user.picture === "string" ? session.user.picture : "";
    const business_name = typeof session.user.business_name === "string" ? session.user.business_name : "";

    const timestamp = Date.now();
    const rand = Math.floor(Math.random() * 1000000);
    const dummyPhone = `PLACEHOLDER_PHONE_${timestamp}_${rand}`;
    const dummyPassphrase = `PLACEHOLDER_PASS_${timestamp}_${rand}`;

    // Try RPC auto-provisioning first
    const { error: insertError } = await supabaseAdmin.rpc("auto_provision_user", {
      p_email: email,
      p_first_name: givenName,
      p_last_name: familyName,
      p_profile_image: profileImage,
      p_business_name: business_name,
      p_phone: dummyPhone,
      p_passphrase: dummyPassphrase,
    });

    if (insertError) {
      const errDetail = {
        message: insertError.message || "(no message)",
        code: insertError.code || "(no code)",
        details: insertError.details || "(no details)",
        hint: insertError.hint || "(no hint)",
      };
      console.error("❌ Auto-provisioning RPC failed:", JSON.stringify(errDetail));

      // Attempt resilient direct insert fallback into public.users
      console.log(`🔄 Attempting direct table insert fallback for: ${email}`);
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

      if (directInsertError) {
        const directErrDetail = {
          message: directInsertError.message || "(no message)",
          code: directInsertError.code || "(no code)",
          details: directInsertError.details || "(no details)",
          hint: directInsertError.hint || "(no hint)",
        };
        console.error("❌ Direct fallback insert also failed:", JSON.stringify(directErrDetail));

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
        } else {
          return { error: "Failed to set up account" };
        }
      }
    }

    // If user was resolved through conflict check above, handle redirection or dashboard rendering
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
  import("@/lib/utils/activityTracker")
    .then(({ touchUserActivity }) => touchUserActivity(email, user))
    .catch(() => {});

  return {
    user: user as UserProfile,
    parsedInterest,
    email,
  };
}
