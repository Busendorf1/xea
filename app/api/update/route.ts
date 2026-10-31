import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { invalidateCachedProfile } from "@/lib/utils/cache";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const isAdmin = isAdminEmail(emailLower);
    const data = await req.json();

    // 1. Server-Side 30-Day Cooldown Enforcement (for users who have already completed initial setup)
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, lastUpdated, has_updated_profile")
      .ilike("email", emailLower)
      .maybeSingle();

    if (!isAdmin && existingUser?.has_updated_profile && existingUser?.lastUpdated) {
      const lastUpdatedTime = new Date(existingUser.lastUpdated).getTime();
      if (!isNaN(lastUpdatedTime)) {
        const elapsedMs = Date.now() - lastUpdatedTime;
        if (elapsedMs < THIRTY_DAYS_MS) {
          const daysLeft = Math.ceil((THIRTY_DAYS_MS - elapsedMs) / (24 * 60 * 60 * 1000));
          return NextResponse.json(
            { error: `You can only update your profile once every 30 days. (${daysLeft} day(s) remaining)` },
            { status: 429 }
          );
        }
      }
    }

    // 2. Check phone uniqueness if phone is provided in update
    const phone = data.phone;
    if (phone) {
      const { data: phoneCheck, error: phoneErr } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("phone", phone)
        .neq("email", email)
        .maybeSingle();

      if (phoneErr) {
        console.error("❌ Phone check error:", phoneErr);
      }

      if (phoneCheck) {
        return NextResponse.json({ error: "This phone number is already in use by another user." }, { status: 400 });
      }
    }

    // 3. Check username uniqueness if username is provided in update
    const usernameInput = data.username;
    if (usernameInput) {
      const cleanUsername = usernameInput.trim().toLowerCase().replace(/^@/, "");
      const { data: usernameCheck, error: userErr } = await supabaseAdmin
        .from("users")
        .select("id")
        .ilike("username", cleanUsername)
        .neq("email", email)
        .maybeSingle();

      if (userErr) {
        console.error("❌ Username check error:", userErr);
      }

      if (usernameCheck) {
        return NextResponse.json({ error: "This username is already taken. Please choose another." }, { status: 400 });
      }
    }

    // Build the update payload dynamically
    const allowedFields = [
      "username", "dob", "country", "state", "location", "phone", "passphrase",
      "industry", "interest", "behavior", "lifestyle", "personality",
      "intl_travel", "local_travel", "profileImage", "bio", "gender", "employment",
      "business_name", "has_updated_profile", "firstName", "lastName"
    ];

    const updateData: any = {
      lastUpdated: new Date().toISOString(),
    };

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        if (field === "intl_travel") {
          updateData.intl_travel = data.intl_travel === true || data.intl_travel === "yes";
        } else if (field === "local_travel") {
          updateData.local_travel = data.local_travel === true || data.local_travel === "yes";
        } else {
          updateData[field] = data[field];
        }
      }
    });

    // Support camelCase payloads from profile-setup component
    if (data.intlTravel !== undefined) {
      updateData.intl_travel = data.intlTravel === true || data.intlTravel === "yes";
    }
    if (data.localTravel !== undefined) {
      updateData.local_travel = data.localTravel === true || data.localTravel === "yes";
    }
    if (data.businessName !== undefined) {
      updateData.business_name = data.businessName;
    }

    // Cap psychographic trait arrays at 5 items on the server
    for (const arrField of ["behavior", "lifestyle", "personality"] as const) {
      if (Array.isArray(updateData[arrField]) && updateData[arrField].length > 5) {
        updateData[arrField] = updateData[arrField].slice(0, 5);
      }
    }

    // Sanitize and validate 18+ dob if present
    let sanitizedDob: string | null = null;
    if (updateData.dob && updateData.dob !== "PLACEHOLDER" && String(updateData.dob).trim() !== "") {
      const parsedDate = new Date(updateData.dob);
      if (!isNaN(parsedDate.getTime())) {
        const ageDiffMs = Date.now() - parsedDate.getTime();
        const ageYears = ageDiffMs / (365.25 * 24 * 60 * 60 * 1000);
        if (ageYears < 18) {
          return NextResponse.json(
            { error: "You must be at least 18 years old to use this platform." },
            { status: 400 }
          );
        }
        sanitizedDob = parsedDate.toISOString().split("T")[0];
      }
    }

    const { encryptSensitiveField } = await import("@/lib/security/piiCrypto");
    const encryptedPassphrase = updateData.passphrase ? encryptSensitiveField(updateData.passphrase) : null;

    const { error } = await supabaseAdmin.rpc("update_user_profile", {
      p_email: email,
      p_username: updateData.username || null,
      p_dob: sanitizedDob,
      p_country: updateData.country || null,
      p_state: updateData.state || null,
      p_location: updateData.location || null,
      p_phone: updateData.phone || null,
      p_passphrase: encryptedPassphrase,
      p_industry: updateData.industry || null,
      p_interest: updateData.interest || null,
      p_behavior: updateData.behavior || null,
      p_lifestyle: updateData.lifestyle || null,
      p_personality: updateData.personality || null,
      p_gender: updateData.gender || null,
      p_employment: updateData.employment || null,
      p_intl_travel: updateData.intl_travel !== undefined ? updateData.intl_travel : null,
      p_local_travel: updateData.local_travel !== undefined ? updateData.local_travel : null,
      p_profile_image: updateData.profileImage || null,
      p_bio: updateData.bio || null,
      p_business_name: updateData.business_name || null,
      p_has_updated_profile: true,
    });

    if (error) {
      console.error("Update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Persist firstName / lastName if provided
    if (updateData.firstName !== undefined || updateData.lastName !== undefined) {
      const namePatch: Record<string, any> = {};
      if (updateData.firstName !== undefined) namePatch.firstName = String(updateData.firstName).trim();
      if (updateData.lastName !== undefined) namePatch.lastName = String(updateData.lastName).trim();
      try {
        await supabaseAdmin.from("users").update(namePatch).ilike("email", emailLower);
      } catch {}
    }

    // Invalidate cached profile and feed targeting caches in L1 & L2 Redis
    await invalidateCachedProfile(emailLower);

    try {
      const redis = (await import("@/lib/redis")).default;
      const { isRedisReady } = await import("@/lib/redis");
      if (isRedisReady()) {
        await Promise.all([
          redis.del(`feed:ad_ids:${emailLower}`),
          redis.del(`feed:ads:${emailLower}`),
          redis.del(`feed:profiles:${emailLower}`),
        ]).catch(() => {});
      }
    } catch {}

    return NextResponse.json({ success: true, message: "Profile updated successfully" }, { status: 200 });
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
