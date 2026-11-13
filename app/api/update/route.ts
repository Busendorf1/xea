import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { getAuthenticatedEmail, isAdminEmail } from "@/lib/authHelper";
import { invalidateCachedProfile } from "@/lib/utils/cache";
import { getProfileEditCooldownState } from "@/lib/utils/profileCooldown";
import {
  encryptSensitiveField,
  hashPassphraseOneWay,
  blindHashPII,
  coarsenDobToBirthYear,
} from "@/lib/security/piiCrypto";
import { validateProfileImageUrl } from "@/lib/security/profileUrlValidator";

function legacyPhoneSha256(digits: string): string {
  return crypto.createHash("sha256").update(`xea-phone-v1:${digits}`).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req, { allowMobileHeader: true });
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const isAdmin = isAdminEmail(emailLower);
    const data = await req.json();

    // Validate profileImage URL upfront against strict HTTPS allowlist (blocks XSS/SSRF)
    let validatedProfileImage: string | undefined = undefined;
    if (data?.profileImage !== undefined) {
      const imgCheck = validateProfileImageUrl(data.profileImage);
      if (!imgCheck.valid) {
        return NextResponse.json({ error: imgCheck.error || "Invalid profile image URL." }, { status: 400 });
      }
      validatedProfileImage = imgCheck.sanitized;
    }

    // Check if this is an avatar-only update (`profileImage` only) — exempt from 15-day demographic/profile cooldown
    const nonAvatarKeys = Object.keys(data || {}).filter(
      (k) => k !== "profileImage" && k !== "email" && data[k] !== undefined
    );
    const isAvatarOnlyUpdate = data?.profileImage !== undefined && nonAvatarKeys.length === 0;

    if (isAvatarOnlyUpdate) {
      const { error: avatarErr } = await supabaseAdmin
        .from("users")
        .update({ profileImage: validatedProfileImage ?? "" })
        .ilike("email", emailLower);
      if (avatarErr) {
        return NextResponse.json({ error: "Could not update profile photo." }, { status: 500 });
      }
      await invalidateCachedProfile(emailLower);
      return NextResponse.json({ success: true, message: "Profile photo updated successfully" }, { status: 200 });
    }

    // 1. Server-Side 15-Day Cooldown Enforcement (for users who have already completed initial setup)
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select('id, "lastUpdated", has_updated_profile, "firstName", "lastName", phone')
      .ilike("email", emailLower)
      .maybeSingle();

    const cooldownState = getProfileEditCooldownState({
      hasUpdatedProfile: existingUser?.has_updated_profile,
      lastUpdated: existingUser?.lastUpdated,
      isAdmin,
    });

    if (cooldownState.isLocked) {
      return NextResponse.json(
        {
          error: `You can only update your profile once every 15 days. (${cooldownState.daysRemaining} day(s) remaining)`,
          nextAvailableDate: cooldownState.nextAvailableIso,
          daysRemaining: cooldownState.daysRemaining,
        },
        { status: 429 }
      );
    }

    // 2. Check phone uniqueness against both encrypted `phone_hash` blind indexes and legacy plaintext `phone`
    const phone = data.phone;
    if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
      const trimmedPhone = String(phone).trim();
      const phoneDigits = trimmedPhone.replace(/\D/g, "");
      if (phoneDigits.length < 7) {
        return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
      }

      const candidateHashes = Array.from(
        new Set([blindHashPII(phoneDigits), legacyPhoneSha256(phoneDigits)].filter(Boolean))
      );

      let phoneOwnerFound = false;
      if (candidateHashes.length > 0) {
        const { data: hashMatch, error: hashErr } = await supabaseAdmin
          .from("users")
          .select("id")
          .in("phone_hash", candidateHashes)
          .not("email", "ilike", emailLower)
          .limit(1)
          .maybeSingle();

        if (hashErr && hashErr.code !== "42703" && !String(hashErr.message || "").includes("phone_hash")) {
          console.error("❌ Phone hash uniqueness check error:", hashErr);
          return NextResponse.json({ error: "Try again later" }, { status: 500 });
        }
        if (hashMatch) {
          phoneOwnerFound = true;
        }
      }

      if (!phoneOwnerFound) {
        const { data: plainMatch, error: plainErr } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("phone", trimmedPhone)
          .not("email", "ilike", emailLower)
          .limit(1)
          .maybeSingle();

        if (plainErr) {
          console.error("❌ Phone uniqueness check error:", plainErr);
          return NextResponse.json({ error: "Try again later" }, { status: 500 });
        }
        if (plainMatch) {
          phoneOwnerFound = true;
        }
      }

      if (phoneOwnerFound) {
        return NextResponse.json({ error: "This phone number is already in use by another user." }, { status: 400 });
      }
    }

    // 3. Check username uniqueness if username is provided in update
    const usernameInput = data.username;
    let cleanUsername: string | null = null;
    if (usernameInput) {
      cleanUsername = String(usernameInput).trim().toLowerCase().replace(/^@/, "");
      const handlesToCheck = [cleanUsername, `@${cleanUsername}`];
      const { data: usernameCheck, error: userErr } = await supabaseAdmin
        .from("users")
        .select("id")
        .in("username", handlesToCheck)
        .not("email", "ilike", emailLower)
        .limit(1)
        .maybeSingle();

      if (userErr) {
        console.error("❌ Username check error:", userErr);
        return NextResponse.json({ error: "Try again later" }, { status: 500 });
      }

      if (usernameCheck) {
        return NextResponse.json({ error: "This username is already taken. Please choose another." }, { status: 400 });
      }
    }

    // Build the update payload dynamically
    const allowedFields = [
      "username",
      "dob",
      "country",
      "state",
      "location",
      "phone",
      "passphrase",
      "industry",
      "interest",
      "behavior",
      "lifestyle",
      "personality",
      "intl_travel",
      "local_travel",
      "profileImage",
      "bio",
      "gender",
      "employment",
      "business_name",
      "has_updated_profile",
      "firstName",
      "lastName",
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
        } else if (field === "username" && cleanUsername) {
          updateData.username = cleanUsername;
        } else if (field === "profileImage") {
          updateData.profileImage = validatedProfileImage;
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
        sanitizedDob = coarsenDobToBirthYear(parsedDate.toISOString().split("T")[0]);
      }
    }

    const encryptedPassphrase = updateData.passphrase
      ? hashPassphraseOneWay(updateData.passphrase)
      : null;
    const encryptedPhone = updateData.phone
      ? encryptSensitiveField(String(updateData.phone).trim())
      : null;

    // Prepare encrypted firstName / lastName and HMAC blind hashes BEFORE DB writes
    const piiPatch: Record<string, any> = {
      email_hash: blindHashPII(emailLower),
    };
    if (updateData.phone) {
      piiPatch.phone_hash = blindHashPII(String(updateData.phone).replace(/\D/g, ""));
    }
    const rawFirst = updateData.firstName !== undefined ? updateData.firstName : existingUser?.firstName;
    if (rawFirst && typeof rawFirst === "string" && rawFirst.trim() !== "" && !rawFirst.startsWith("enc:v1:")) {
      piiPatch.firstName = encryptSensitiveField(rawFirst.trim());
    }
    const rawLast = updateData.lastName !== undefined ? updateData.lastName : existingUser?.lastName;
    if (rawLast && typeof rawLast === "string" && rawLast.trim() !== "" && !rawLast.startsWith("enc:v1:")) {
      piiPatch.lastName = encryptSensitiveField(rawLast.trim());
    }

    let rpcSuccess = false;
    try {
      const { error: rpcError } = await supabaseAdmin.rpc("update_user_profile", {
        p_email: emailLower,
        p_username: updateData.username || null,
        p_dob: sanitizedDob,
        p_country: updateData.country || null,
        p_state: updateData.state || null,
        p_location: updateData.location || null,
        p_phone: encryptedPhone,
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
        p_profile_image: validatedProfileImage !== undefined ? validatedProfileImage : null,
        p_bio: updateData.bio || null,
        p_business_name: updateData.business_name || null,
        p_has_updated_profile: true,
      });

      if (!rpcError) {
        rpcSuccess = true;
      } else {
        console.warn("⚠️ update_user_profile RPC failed, falling back to direct service_role update:", rpcError.message);
      }
    } catch (e: any) {
      console.warn("⚠️ update_user_profile RPC exception:", e?.message || e);
    }

    if (!rpcSuccess) {
      // Direct service-role database update (includes firstName/lastName/blind hashes atomically in one row write)
      const directPayload: Record<string, any> = {
        ...piiPatch,
        lastUpdated: new Date().toISOString(),
        has_updated_profile: true,
      };

      if (updateData.username) directPayload.username = updateData.username;
      if (sanitizedDob) directPayload.dob = sanitizedDob;
      if (updateData.country) directPayload.country = updateData.country;
      if (updateData.state) directPayload.state = updateData.state;
      if (updateData.location) directPayload.location = updateData.location;
      if (encryptedPhone) directPayload.phone = encryptedPhone;
      if (encryptedPassphrase) directPayload.passphrase = encryptedPassphrase;
      if (updateData.industry) directPayload.industry = updateData.industry;
      if (updateData.interest) directPayload.interest = updateData.interest;
      if (updateData.behavior) directPayload.behavior = updateData.behavior;
      if (updateData.lifestyle) directPayload.lifestyle = updateData.lifestyle;
      if (updateData.personality) directPayload.personality = updateData.personality;
      if (updateData.gender) directPayload.gender = updateData.gender;
      if (updateData.employment) directPayload.employment = updateData.employment;
      if (updateData.intl_travel !== undefined) directPayload.intl_travel = updateData.intl_travel;
      if (updateData.local_travel !== undefined) directPayload.local_travel = updateData.local_travel;
      if (validatedProfileImage !== undefined) directPayload.profileImage = validatedProfileImage;
      if (updateData.bio !== undefined) directPayload.bio = updateData.bio;
      if (updateData.business_name !== undefined) directPayload.business_name = updateData.business_name;

      const { error: directErr } = await supabaseAdmin
        .from("users")
        .update(directPayload)
        .ilike("email", emailLower);

      if (directErr) {
        console.error("❌ Direct service-role update failed:", directErr.message);
        return NextResponse.json({ error: "Could not save profile updates. Please try again." }, { status: 500 });
      }
    } else {
      // update_user_profile RPC doesn't accept firstName/lastName/blind hashes; persist them explicitly and fail closed on error
      const { error: piiErr } = await supabaseAdmin
        .from("users")
        .update(piiPatch)
        .ilike("email", emailLower);

      if (piiErr) {
        console.error("❌ Failed to persist encrypted name / PII blind indexes:", piiErr.message);
        return NextResponse.json({ error: "Could not save profile details. Please try again." }, { status: 500 });
      }
    }

    // Invalidate cached profile and feed targeting caches in L1 & L2 Redis
    await invalidateCachedProfile(emailLower);

    // Auto-bind referral code if present in cookie or payload
    try {
      const refCode = data.referralCode || req.cookies.get("paayh_ref_code")?.value;
      if (refCode && String(refCode).trim()) {
        const { bindUserToAgentByCode } = await import("@/lib/agentSystem");
        await bindUserToAgentByCode({
          refereeEmail: emailLower,
          referralCode: String(refCode).trim(),
        }).catch(() => {});
      }
    } catch {}

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
    return NextResponse.json({ error: "Try again later" }, { status: 500 });
  }
}
