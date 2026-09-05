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
  const email = session?.user?.email;
  if (!email) {
    return { error: "No email associated with session" };
  }

  // 1. Attempt to fetch from Redis cache first (<0.1ms)
  let user: any = await getCachedProfile(email);

  if (user) {
    console.log(`🚀 Profile cache hit in Server Component for: ${email}`);
  } else {
    console.log(`🔄 Profile cache miss in Server Component for: ${email}. Fetching from Supabase...`);
    let { data: dbData, error: dbError } = await supabaseAdmin
      .from("users")
      .select(`
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
      `)
      .ilike("email", email)
      .maybeSingle();

    if (dbError) {
      console.warn("⚠️ Attempting baseline column fallback for user query:", dbError.message || dbError);
      const fallback = await supabaseAdmin
        .from("users")
        .select(`
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
        `)
        .ilike("email", email)
        .maybeSingle();

      dbData = fallback.data as any;
    }

    user = dbData;
    if (user) {
      await setCachedProfile(email, user);
    }
  }

  // 2. If user does not exist in DB, auto-provision
  if (!user) {
    console.log(`👤 User not found in database. Auto-provisioning profile for: ${email}`);
    const givenName = session.user.given_name || session.user.name || "User";
    const familyName = session.user.family_name || "";
    const profileImage = session.user.picture || "";
    const business_name = session.user.business_name || "";

    const dummyPhone = `PLACEHOLDER_PHONE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const dummyPassphrase = `PLACEHOLDER_PASS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
      console.error("❌ Auto-provisioning failed:", insertError);
      return { error: "Failed to set up account" };
    }

    return { redirectUrl: "/user/profile-setup" };
  }

  // 3. If user has not completed initial profile setup, redirect
  if (user.country === "PLACEHOLDER" || user.state === "PLACEHOLDER" || user.location === "PLACEHOLDER") {
    return { redirectUrl: "/user/profile-setup" };
  }

  const parsedInterest = safeParseArray(user.interest);

  return {
    user: user as UserProfile,
    parsedInterest,
    email,
  };
}
