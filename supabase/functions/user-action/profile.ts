import { getVerifiedUserEmail } from "../_shared/auth.ts";
import { computeAtwTierDetails } from "../_shared/atwEngine.ts";
import {
  computeEmailHash,
  computePhoneHash,
  errorResponse,
  isAdminEmail,
  jsonResponse,
  sanitizeCsvArray,
} from "../_shared/cors.ts";
import {
  decryptProfilePIIEdge,
  decryptSensitiveFieldEdge,
  encryptSensitiveFieldEdge,
} from "../_shared/crypto.ts";
import { sanitizePostgrestValue, validateSafeMediaUrl } from "../_shared/urlValidation.ts";

const PROFILE_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;

const PERMANENT_BAN_REASONS = new Set(["admin_perm_banned", "perm_banned"]);

interface DeactivationState {
  isDeactivated: boolean;
  isPermBanned: boolean;
  deactivatedAtMs: number | null;
}

async function getDeactivationState(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
): Promise<DeactivationState> {
  const { data } = await supabase
    .from("deactivated_users")
    .select("email, reason, deactivated_at")
    .eq("email", email)
    .maybeSingle();

  if (!data) {
    return { isDeactivated: false, isPermBanned: false, deactivatedAtMs: null };
  }

  const reason = typeof data.reason === "string" ? data.reason.trim().toLowerCase() : "";
  const isPermBanned = PERMANENT_BAN_REASONS.has(reason);
  const parsedAt = data.deactivated_at ? new Date(data.deactivated_at).getTime() : NaN;
  return {
    isDeactivated: true,
    isPermBanned,
    deactivatedAtMs: Number.isFinite(parsedAt) ? parsedAt : null,
  };
}

async function isDeactivatedEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
): Promise<boolean> {
  const state = await getDeactivationState(supabase, email);
  return state.isDeactivated;
}

function getBearerIssuedAtMs(req?: Request): number | null {
  if (!req) return null;
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.iat === "number" && Number.isFinite(payload.iat)
      ? payload.iat * 1000
      : null;
  } catch {
    return null;
  }
}

export async function handleCheckUsername(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const rawUsername = String(body?.username || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  if (!rawUsername || rawUsername.length < 3) {
    return jsonResponse({
      available: false,
      message: "Username must be at least 3 characters",
    });
  }
  if (!/^[a-z0-9_.-]{3,30}$/.test(rawUsername)) {
    return jsonResponse({
      available: false,
      message: "Username may only contain letters, numbers, underscores, dots, or hyphens",
    });
  }

  const verifiedCaller = await getVerifiedUserEmail(req);
  const callerEmail = (
    verifiedCaller && verifiedCaller !== "service_role"
      ? verifiedCaller
      : req.headers.get("x-user-email") || String(body?.email || "")
  )
    .toLowerCase()
    .trim();

  const { data: existing } = await supabase
    .from("users")
    .select("email")
    .in("username", [rawUsername, `@${rawUsername}`])
    .limit(1)
    .maybeSingle();

  if (existing && String(existing.email || "").toLowerCase().trim() !== callerEmail) {
    return jsonResponse({ available: false, message: "Username is already taken" });
  }

  return jsonResponse({ available: true, message: "Username available" });
}

export async function handleGetProfile(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  req?: Request,
): Promise<Response> {
  const deactState = await getDeactivationState(supabase, cleanEmail);

  let { data: userRow } = await supabase
    .from("users")
    .select("*")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (deactState.isPermBanned || userRow?.ad_account_status === "perm_banned") {
    return errorResponse(
      "This account has been permanently banned and cannot be accessed.",
      403,
      { code: "ACCOUNT_PERM_BANNED" },
    );
  }

  if (deactState.isDeactivated) {
    const iatMs = getBearerIssuedAtMs(req);
    const isFreshLoginAfterDeactivation =
      iatMs !== null &&
      deactState.deactivatedAtMs !== null &&
      iatMs > deactState.deactivatedAtMs + 1000;

    if (!isFreshLoginAfterDeactivation) {
      return errorResponse(
        "This account has been deactivated and cannot be accessed.",
        403,
        { code: "ACCOUNT_DEACTIVATED" },
      );
    }

    // Clear non-ban deactivation tombstone and any dormant residual row so user rejoins as fresh account
    await supabase
      .from("deactivated_users")
      .delete()
      .eq("email", cleanEmail)
      .not("reason", "in", '("admin_perm_banned","perm_banned")');

    if (userRow?.ad_account_status === "deactivated") {
      await supabase
        .from("users")
        .delete()
        .ilike("email", cleanEmail)
        .eq("ad_account_status", "deactivated");
      userRow = null;
    }
  } else if (userRow?.ad_account_status === "deactivated") {
    return errorResponse(
      "This account has been deactivated and cannot be accessed.",
      403,
      { code: "ACCOUNT_DEACTIVATED" },
    );
  }

  // Only provision brand-new accounts that have never been deactivated
  if (!userRow) {
    const referralCode = `XEA${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const dummyPhone = `PLACEHOLDER_PHONE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const dummyPassphrase = `PLACEHOLDER_PASS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const defaultUsername =
      cleanEmail.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase() ||
      `user_${Date.now()}`;

    const { error: rpcErr } = await supabase.rpc("auto_provision_user", {
      p_email: cleanEmail,
      p_first_name: cleanEmail.split("@")[0] || "User",
      p_last_name: "User",
      p_profile_image: "",
      p_business_name: "",
      p_phone: dummyPhone,
      p_passphrase: dummyPassphrase,
    });

    if (rpcErr) {
      await supabase.from("users").insert([
        {
          email: cleanEmail,
          username: defaultUsername,
          phone: dummyPhone,
          passphrase: dummyPassphrase,
          dob: "1970-01-01",
          country: "PLACEHOLDER",
          state: "PLACEHOLDER",
          location: "PLACEHOLDER",
          balance: 0,
          monetized: "false",
          monetization_clicks: 0,
          atw_tier: "ATW1",
          attention_worth_score: 0.1,
          referral_code: referralCode,
          has_updated_profile: false,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    const { data: created } = await supabase
      .from("users")
      .select("*")
      .ilike("email", cleanEmail)
      .maybeSingle();
    userRow = created;
  }

  if (!userRow) {
    return errorResponse("Unable to load your profile right now. Please try again.", 404);
  }

  const decrypted = await decryptProfilePIIEdge(userRow);
  const adminUser = isAdminEmail(cleanEmail);
  let editMsRemaining = 0;
  let editDaysRemaining = 0;
  let editLockedUntil: string | null = null;

  if (!adminUser && userRow.has_updated_profile && userRow.lastUpdated) {
    const lastMs = new Date(userRow.lastUpdated).getTime();
    if (Number.isFinite(lastMs) && lastMs > 0) {
      const targetMs = lastMs + PROFILE_COOLDOWN_MS;
      const diff = targetMs - Date.now();
      if (diff > 0) {
        editMsRemaining = diff;
        editDaysRemaining = Math.ceil(diff / (24 * 60 * 60 * 1000));
        editLockedUntil = new Date(targetMs).toISOString();
      }
    }
  }

  const atw = computeAtwTierDetails({
    email: cleanEmail,
    clicks: userRow.monetization_clicks,
    attentionWorthScore: userRow.attention_worth_score,
    currentTier: userRow.atw_tier,
    isAffiliate: userRow.is_affiliate,
    isCareer: userRow.is_career,
  });

  return jsonResponse({
    ...decrypted,
    cooldown_until: userRow.suspended_until || null,
    balance: Number(userRow.balance || 0),
    atw_tier: atw.tier,
    atw_level: atw.tierLevel,
    holding_cap: atw.isUnlimited ? null : atw.holdingCap,
    attention_worth_score: atw.score,
    can_edit_profile: editMsRemaining <= 0,
    edit_days_remaining: editDaysRemaining,
    edit_ms_remaining: editMsRemaining,
    edit_locked_until: editLockedUntil,
  });
}

export async function handleUpdateProfile(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const deactState = await getDeactivationState(supabase, cleanEmail);
  if (deactState.isPermBanned) {
    return errorResponse("Permanently banned accounts cannot be updated.", 403, {
      code: "ACCOUNT_PERM_BANNED",
    });
  }
  if (deactState.isDeactivated) {
    return errorResponse("Deactivated accounts cannot be updated.", 403);
  }

  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (existingUser?.ad_account_status === "perm_banned") {
    return errorResponse("Permanently banned accounts cannot be updated.", 403, {
      code: "ACCOUNT_PERM_BANNED",
    });
  }

  if (!existingUser || existingUser.ad_account_status === "deactivated") {
    return errorResponse("Active user profile not found.", 404);
  }

  // Validate 15-day profile update cooldown for non-admins when demographics change
  const adminUser = isAdminEmail(cleanEmail);
  const demographicChanged = Boolean(
    body.dob ||
      body.country ||
      body.state ||
      body.location ||
      body.gender ||
      body.employment ||
      body.industry ||
      body.interest,
  );
  if (
    !adminUser &&
    existingUser.has_updated_profile &&
    existingUser.lastUpdated &&
    demographicChanged
  ) {
    const lastMs = new Date(existingUser.lastUpdated).getTime();
    if (Number.isFinite(lastMs) && Date.now() - lastMs < PROFILE_COOLDOWN_MS) {
      return errorResponse("You can only update your demographic profile once every 15 days.", 429);
    }
  }

  // Validate profileImage URL safely (no javascript:/data:/SSRF)
  const incomingProfileImage = body.profileImage ?? body.profile_image;
  let safeProfileImage = existingUser.profileImage;
  if (incomingProfileImage !== undefined) {
    const urlCheck = validateSafeMediaUrl(incomingProfileImage);
    if (!urlCheck.valid) {
      return errorResponse(urlCheck.error || "Invalid profile image URL.", 400);
    }
    safeProfileImage = urlCheck.sanitized;
  }

  // Username sanitization & uniqueness
  let nextUsername = existingUser.username;
  if (body.username !== undefined) {
    const cleanUname = String(body.username || "").trim().toLowerCase().replace(/^@/, "");
    if (cleanUname.length < 3 || !/^[a-z0-9_.-]{3,30}$/.test(cleanUname)) {
      return errorResponse(
        "Username must be 3-30 chars (letters, numbers, underscores, dots, or hyphens).",
        400,
      );
    }
    const { data: taken } = await supabase
      .from("users")
      .select("email")
      .ilike("username", cleanUname)
      .maybeSingle();
    if (taken && String(taken.email || "").toLowerCase().trim() !== cleanEmail) {
      return errorResponse("This username is already taken.", 409);
    }
    nextUsername = cleanUname;
  }

  // 18+ DOB validation & birth-year coarsening
  let nextDob = existingUser.dob;
  if (body.dob !== undefined && String(body.dob).trim() !== "") {
    const parsedDob = new Date(String(body.dob));
    if (Number.isNaN(parsedDob.getTime())) {
      return errorResponse("Invalid date of birth format.", 400);
    }
    const birthYear = parsedDob.getUTCFullYear();
    const age = new Date().getUTCFullYear() - birthYear;
    if (age < 18 || age > 120) {
      return errorResponse("You must be at least 18 years old to use this platform.", 400);
    }
    nextDob = `${birthYear}-01-01`;
  }

  // Encrypted phone uniqueness verification (check phone_hash + decrypted legacy values)
  let nextPhone = existingUser.phone;
  let nextPhoneHash = existingUser.phone_hash;
  if (body.phone !== undefined && String(body.phone).trim() !== "") {
    const rawPhone = String(body.phone).trim();
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return errorResponse("Please provide a valid phone number (10-15 digits).", 400);
    }
    const phoneHash = await computePhoneHash(rawPhone);
    const { data: hashConflict } = await supabase
      .from("users")
      .select("email")
      .eq("phone_hash", phoneHash)
      .limit(5);

    const conflictRow = (hashConflict || []).find(
      (r: { email: string }) => String(r.email || "").toLowerCase().trim() !== cleanEmail,
    );
    if (conflictRow) {
      return errorResponse("This phone number is already in use by another account.", 409);
    }

    // Legacy check for plaintext match if phone_hash wasn't backfilled
    const { data: rawConflict } = await supabase
      .from("users")
      .select("email, phone")
      .eq("phone", rawPhone)
      .limit(3);
    if (
      (rawConflict || []).some(
        (r: { email: string }) => String(r.email || "").toLowerCase().trim() !== cleanEmail,
      )
    ) {
      return errorResponse("This phone number is already in use by another account.", 409);
    }

    // Verify encrypted matches across candidates sharing last 4 digits if needed
    const existingDecrypted = existingUser.phone
      ? await decryptSensitiveFieldEdge(String(existingUser.phone))
      : "";
    if (existingDecrypted.replace(/\D/g, "") !== digits || !existingUser.phone?.startsWith("enc:v1:")) {
      nextPhone = await encryptSensitiveFieldEdge(rawPhone);
    }
    nextPhoneHash = phoneHash;
  }

  // Parameterized invite / referral binding (ZERO .or() filter injection)
  let nextReferredBy = existingUser.referred_by;
  const rawInvite = String(body.referralCode || body.referredBy || body.inviteCode || "").trim();
  if (rawInvite && !existingUser.referred_by) {
    const safeToken = sanitizePostgrestValue(rawInvite).replace(/^@/, "");
    if (safeToken) {
      let refUser = null;
      const { data: byCode } = await supabase
        .from("users")
        .select("email, referral_code, username")
        .ilike("referral_code", safeToken)
        .maybeSingle();
      if (byCode) {
        refUser = byCode;
      } else {
        const { data: byUser } = await supabase
          .from("users")
          .select("email, referral_code, username")
          .ilike("username", safeToken)
          .maybeSingle();
        if (byUser) refUser = byUser;
      }

      if (refUser?.email) {
        const refEmail = String(refUser.email).toLowerCase().trim();
        if (refEmail !== cleanEmail && !(await isDeactivatedEmail(supabase, refEmail))) {
          nextReferredBy = refEmail;
          await supabase.from("referrals").upsert(
            {
              referrer_email: refEmail,
              referee_email: cleanEmail,
              status: "active",
            },
            { onConflict: "referee_email" },
          ).catch(() => {});
        }
      }
    }
  }

  const nextFirstName =
    body.firstName !== undefined
      ? await encryptSensitiveFieldEdge(String(body.firstName).trim())
      : existingUser.firstName;
  const nextLastName =
    body.lastName !== undefined
      ? await encryptSensitiveFieldEdge(String(body.lastName).trim())
      : existingUser.lastName;

  const emailHash = existingUser.email_hash || (await computeEmailHash(cleanEmail));

  const updatePayload: Record<string, unknown> = {
    username: nextUsername,
    firstName: nextFirstName,
    lastName: nextLastName,
    profileImage: safeProfileImage,
    bio: body.bio !== undefined ? String(body.bio).slice(0, 500) : existingUser.bio,
    business_name:
      body.business_name !== undefined
        ? String(body.business_name).slice(0, 120)
        : existingUser.business_name,
    dob: nextDob,
    phone: nextPhone,
    phone_hash: nextPhoneHash,
    email_hash: emailHash,
    country: body.country !== undefined ? String(body.country).trim() : existingUser.country,
    state: body.state !== undefined ? String(body.state).trim() : existingUser.state,
    location: body.location !== undefined ? String(body.location).trim() : existingUser.location,
    gender: body.gender !== undefined ? String(body.gender).trim() : existingUser.gender,
    employment: body.employment !== undefined ? String(body.employment).trim() : existingUser.employment,
    interest: body.interest !== undefined ? sanitizeCsvArray(body.interest) : existingUser.interest,
    industry: body.industry !== undefined ? sanitizeCsvArray(body.industry) : existingUser.industry,
    behavior: body.behavior !== undefined ? sanitizeCsvArray(body.behavior) : existingUser.behavior,
    lifestyle: body.lifestyle !== undefined ? sanitizeCsvArray(body.lifestyle) : existingUser.lifestyle,
    personality:
      body.personality !== undefined ? sanitizeCsvArray(body.personality) : existingUser.personality,
    intl_travel:
      body.intl_travel !== undefined ? Boolean(body.intl_travel) : existingUser.intl_travel,
    local_travel:
      body.local_travel !== undefined ? Boolean(body.local_travel) : existingUser.local_travel,
    referred_by: nextReferredBy,
    has_updated_profile: true,
    lastUpdated: new Date().toISOString(),
  };

  const { data: updated, error: updErr } = await supabase
    .from("users")
    .update(updatePayload)
    .ilike("email", cleanEmail)
    .select("*")
    .maybeSingle();

  if (updErr) {
    return errorResponse(updErr.message || "Failed to update profile.", 400);
  }

  const decrypted = updated ? await decryptProfilePIIEdge(updated) : {};
  return jsonResponse({ success: true, user: decrypted });
}

export async function handleRecalibrateLocation(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cleanEmail: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (await isDeactivatedEmail(supabase, cleanEmail)) {
    return errorResponse("Account is deactivated.", 403);
  }
  const country = String(body?.country || "").trim();
  const state = String(body?.state || "").trim();
  const location = String(body?.location || "").trim();
  if (!country) {
    return errorResponse("Country is required.", 400);
  }

  await supabase
    .from("users")
    .update({
      country,
      state,
      location,
      lastUpdated: new Date().toISOString(),
    })
    .ilike("email", cleanEmail);

  return jsonResponse({
    updated: true,
    source: body?.source || "gps",
    current: { country, state, location },
  });
}
