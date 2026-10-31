import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getCachedProfile, setCachedProfile } from "@/lib/utils/cache";
import redisConnection, { isRedisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

let useBaselineProfileColumnsUntil = 0;

function sanitizeProfileResponse(rawUser: Record<string, any> | null) {
  if (!rawUser) return null;
  const sanitized = { ...rawUser };
  delete sanitized.passphrase;
  return sanitized;
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const { touchUserActivity } = await import("@/lib/utils/activityTracker");

    // 1. Attempt to fetch from Two-Tier (L1 Memory + L2 Redis) cache first (<0.1ms)
    let user = await getCachedProfile(emailLower);
    if (user) {
      touchUserActivity(emailLower, user).catch(() => {});

      if (isRedisReady()) {
        try {
          const liveVal = await redisConnection.get(`user:live_clicks:${emailLower}`);
          if (liveVal) {
            const liveClicks = Number(liveVal) || 0;
            user.monetization_clicks = Math.max(user.monetization_clicks || 0, liveClicks);
            if (user.monetization_clicks >= 300) user.monetized = "true";
          }
        } catch {}
      }

      return NextResponse.json(sanitizeProfileResponse(user));
    }

    const BASELINE_COLUMNS = `id, "profileImage", username, "firstName", "lastName", "lastUpdated", bio, interest, email, industry, behavior, lifestyle, personality, gender, monetized, monetized_at, created_at, monetized_until, monetization_type, country, state, location, phone, business_name, mutual_count, balance, withdrawal, monetization_clicks, last_active_at`;
    const PROFILE_COLUMNS = `id, "profileImage", username, "firstName", "lastName", "lastUpdated", bio, interest, email, industry, behavior, lifestyle, personality, gender, monetized, monetized_at, created_at, monetized_until, monetization_type, country, state, location, phone, business_name, mutual_count, balance, withdrawal, monetization_clicks, last_active_at, referral_code, referral_downloads_count, atw_tier`;

    let error: any = null;
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      try {
        const useBaseline = Date.now() < useBaselineProfileColumnsUntil;
        let data: any = null;
        let dbErr: any = null;

        if (!useBaseline) {
          const primaryRes = await supabaseAdmin
            .from("users")
            .select(PROFILE_COLUMNS)
            .ilike("email", emailLower)
            .order("has_updated_profile", { ascending: false, nullsFirst: false })
            .limit(2);
          data = primaryRes.data;
          dbErr = primaryRes.error;
        }

        if (useBaseline || dbErr) {
          if (dbErr && (dbErr.code === "42703" || String(dbErr.message || "").includes("does not exist"))) {
            useBaselineProfileColumnsUntil = Date.now() + 30 * 60 * 1000;
          }
          const fallback = await supabaseAdmin
            .from("users")
            .select(BASELINE_COLUMNS)
            .ilike("email", emailLower)
            .limit(2);

          data = fallback.data as any;
          dbErr = fallback.error;
        }

        if (dbErr) {
          error = dbErr;
          console.warn(`⚠️ Supabase fetch attempt ${i + 1} failed:`, dbErr.message);
        } else if (data && data.length > 0) {
          const chosen = data.find((u: any) => u.country && u.country !== "PLACEHOLDER") || data[0];
          user = chosen;
          error = null;
          break;
        } else {
          user = null;
          error = null;
          break;
        }
      } catch (err: any) {
        error = err;
        console.warn(`⚠️ Supabase fetch attempt ${i + 1} encountered exception:`, err.message || err);
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (error) {
      console.error("❌ Error fetching user profile after all attempts:", error?.message || error);
      return NextResponse.json({ error: error?.message || "Database connection failure" }, { status: 500 });
    }

    if (!user) {
      const dummyPhone = `PLACEHOLDER_PHONE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const dummyPassphrase = `PLACEHOLDER_PASS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const { error: insertError } = await supabaseAdmin.rpc("auto_provision_user", {
        p_email: email,
        p_first_name: email.split("@")[0],
        p_last_name: "User",
        p_profile_image: "",
        p_business_name: "",
        p_phone: dummyPhone,
        p_passphrase: dummyPassphrase,
      });

      if (insertError) {
        console.error("❌ Auto-provisioning failed:", insertError);
        return NextResponse.json({ error: "Failed to setup profile" }, { status: 500 });
      }

      const { data: newUserRows, error: fetchError } = await supabaseAdmin
        .from("users")
        .select(Date.now() < useBaselineProfileColumnsUntil ? BASELINE_COLUMNS : PROFILE_COLUMNS)
        .ilike("email", emailLower)
        .limit(1);

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }
      user = newUserRows?.[0] || null;
    }

    if (user) {
      user = sanitizeProfileResponse(user);
      if (isRedisReady()) {
        try {
          const liveVal = await redisConnection.get(`user:live_clicks:${emailLower}`);
          if (liveVal) {
            const liveClicks = Number(liveVal) || 0;
            user.monetization_clicks = Math.max(user.monetization_clicks || 0, liveClicks);
            if (user.monetization_clicks >= 300) {
              user.monetized = "true";
            }
          }
        } catch {}
      }

      await setCachedProfile(emailLower, user);
      touchUserActivity(emailLower, user).catch(() => {});
    }

    return NextResponse.json(user);
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/profile:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
