import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVerifiedUserEmail } from "../_shared/auth.ts";
import {
  decryptProfilePIIEdge,
  decryptSensitiveFieldEdge,
  encryptSensitiveFieldEdge,
  hashWalletPinEdge,
  verifyWalletPinEdge,
} from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-email, x-user-authorization",
};

const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 45 * 60; // 45 minutes

interface PinFailRecord {
  count: number;
  expiresAt: number;
}

const memoryPinFailStore = new Map<string, PinFailRecord>();
let walletPinColumnMissingUntil = 0;

function getPinLockoutStatus(bucketKey: string): {
  locked: boolean;
  secondsLeft: number;
  minsLeft: number;
} {
  const now = Date.now();
  const rec = memoryPinFailStore.get(bucketKey);
  if (!rec) return { locked: false, secondsLeft: 0, minsLeft: 0 };
  if (rec.expiresAt <= now) {
    memoryPinFailStore.delete(bucketKey);
    return { locked: false, secondsLeft: 0, minsLeft: 0 };
  }
  if (rec.count >= MAX_FAILED_PIN_ATTEMPTS) {
    const secondsLeft = Math.max(1, Math.ceil((rec.expiresAt - now) / 1000));
    return {
      locked: true,
      secondsLeft,
      minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
    };
  }
  return { locked: false, secondsLeft: 0, minsLeft: 0 };
}

function recordFailedPinAttempt(bucketKey: string): {
  locked: boolean;
  attemptsRemaining: number;
  secondsLeft: number;
  minsLeft: number;
} {
  const now = Date.now();
  const existing = memoryPinFailStore.get(bucketKey);
  let count = 1;
  let expiresAt = now + PIN_LOCKOUT_SECONDS * 1000;

  if (existing && existing.expiresAt > now) {
    count = existing.count + 1;
    expiresAt =
      count >= MAX_FAILED_PIN_ATTEMPTS
        ? now + PIN_LOCKOUT_SECONDS * 1000
        : existing.expiresAt;
  }

  memoryPinFailStore.set(bucketKey, { count, expiresAt });

  if (count >= MAX_FAILED_PIN_ATTEMPTS) {
    const secondsLeft = Math.max(1, Math.ceil((expiresAt - now) / 1000));
    return {
      locked: true,
      attemptsRemaining: 0,
      secondsLeft,
      minsLeft: Math.max(1, Math.ceil(secondsLeft / 60)),
    };
  }

  return {
    locked: false,
    attemptsRemaining: Math.max(0, MAX_FAILED_PIN_ATTEMPTS - count),
    secondsLeft: PIN_LOCKOUT_SECONDS,
    minsLeft: 45,
  };
}

function formatTryAgainMins(mins: number): string {
  const safeMins = Math.max(1, Math.ceil(mins));
  return `${safeMins} min${safeMins === 1 ? "" : "s"}`;
}

function extractStoredPinHash(userRow: Record<string, any> | null): string {
  if (!userRow) return "";
  const direct =
    typeof userRow.wallet_pin_hash === "string"
      ? userRow.wallet_pin_hash.trim()
      : "";
  if (direct) return direct;
  const fallbackPass =
    typeof userRow.passphrase === "string" ? userRow.passphrase.trim() : "";
  if (
    fallbackPass.startsWith("pin:v1:") ||
    fallbackPass.startsWith("hash:v1:")
  ) {
    return fallbackPass;
  }
  return "";
}

async function fetchUserForPin(
  supabase: any,
  emailLower: string
): Promise<{
  user: Record<string, any> | null;
  usePassphraseFallback: boolean;
  error: any;
}> {
  const skipDedicatedCol = Date.now() < walletPinColumnMissingUntil;

  if (!skipDedicatedCol) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, phone, username, passphrase, wallet_pin_hash")
      .ilike("email", emailLower)
      .maybeSingle();

    if (!error) {
      return { user: data, usePassphraseFallback: false, error: null };
    }

    if (
      error.code === "42703" ||
      String(error.message || "").includes("wallet_pin_hash")
    ) {
      walletPinColumnMissingUntil = Date.now() + 10 * 60 * 1000;
    } else {
      return { user: null, usePassphraseFallback: false, error };
    }
  }

  const { data: fbData, error: fbErr } = await supabase
    .from("users")
    .select("id, email, phone, username, passphrase")
    .ilike("email", emailLower)
    .maybeSingle();

  return { user: fbData, usePassphraseFallback: true, error: fbErr };
}

async function saveUserPinHash(
  supabase: any,
  userId: string,
  hashedPin: string,
  usePassphraseFallback: boolean
): Promise<{ error: any }> {
  if (!usePassphraseFallback) {
    const { error } = await supabase
      .from("users")
      .update({ wallet_pin_hash: hashedPin })
      .eq("id", userId);

    if (!error) return { error: null };

    if (
      error.code === "42703" ||
      String(error.message || "").includes("wallet_pin_hash")
    ) {
      walletPinColumnMissingUntil = Date.now() + 10 * 60 * 1000;
    } else {
      return { error };
    }
  }

  const { error: fbErr } = await supabase
    .from("users")
    .update({ passphrase: hashedPin })
    .eq("id", userId);

  return { error: fbErr };
}

function resolveOptOutFromRow(row: any): string {
  const rawOpt = String(row?.opt_out_status || "")
    .toLowerCase()
    .trim();
  const rawStatus = String(row?.status || "")
    .toLowerCase()
    .trim();
  if (rawStatus === "opted_out" || rawOpt === "accepted") return "accepted";
  if (rawOpt === "forced") return "forced";
  if (rawStatus === "req_remove" || rawOpt === "agent_requested")
    return "agent_requested";
  if (rawStatus === "req_unfollow" || rawOpt === "requested")
    return "requested";
  if (rawStatus === "rej_unfollow" || rawOpt === "rejected") return "rejected";
  return "none";
}

function mapOptOutToDbStatus(optOut: string): string {
  switch (optOut) {
    case "requested":
      return "req_unfollow";
    case "agent_requested":
      return "req_remove";
    case "rejected":
      return "rej_unfollow";
    case "accepted":
    case "forced":
      return "opted_out";
    default:
      return "qualified";
  }
}

async function buildAgentNetworkPayload(supabase: any, cleanEmail: string) {
  const [userRes, dlRes, upRes] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, referral_code, is_agent, agent_registered_at, mutual_count, mutuals"
      )
      .ilike("email", cleanEmail)
      .maybeSingle(),
    supabase
      .from("referrals")
      .select("*", { count: "exact" })
      .ilike("referrer_email", cleanEmail)
      .neq("status", "opted_out")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("referrals")
      .select("*")
      .ilike("referee_email", cleanEmail)
      .maybeSingle(),
  ]);

  const userData = (userRes.data || {}) as Record<string, any>;
  const isAgent = Boolean(userData.is_agent);
  let referralCode = String(userData.referral_code || "").toUpperCase();

  if (!referralCode && userData.id) {
    referralCode = `PAAYH-${String(userData.id)
      .replace(/-/g, "")
      .slice(0, 6)
      .toUpperCase()}`;
    await supabase
      .from("users")
      .update({ referral_code: referralCode })
      .eq("id", userData.id);
  }

  const rawMutuals: string[] = Array.isArray(userData.mutuals)
    ? Array.from(
        new Set(
          (userData.mutuals as string[])
            .map((m) => String(m || "").toLowerCase().trim())
            .filter(Boolean)
        )
      )
    : [];

  const activeDownlineRows = (dlRes.data || []).filter((r: any) => {
    const opt = resolveOptOutFromRow(r);
    const st = String(r.status || "").toLowerCase();
    return st !== "opted_out" && opt !== "accepted" && opt !== "forced";
  });

  const upRow = upRes.data as any;
  const upOpt = upRow ? resolveOptOutFromRow(upRow) : "none";
  const hasActiveUp =
    upRow &&
    String(upRow.status || "").toLowerCase() !== "opted_out" &&
    upOpt !== "accepted" &&
    upOpt !== "forced";

  const emailsToLookup = new Set<string>();
  for (const r of activeDownlineRows) {
    const e = String(r.referee_email || "")
      .toLowerCase()
      .trim();
    if (e) emailsToLookup.add(e);
  }
  if (hasActiveUp && upRow.referrer_email) {
    emailsToLookup.add(String(upRow.referrer_email).toLowerCase().trim());
  }
  for (const m of rawMutuals) {
    emailsToLookup.add(m);
  }

  const profileMap: Record<string, any> = {};
  if (emailsToLookup.size > 0) {
    const { data: profRows } = await supabase
      .from("users")
      .select(
        'email, username, "firstName", "lastName", business_name, "profileImage", bio, location, country, monetized, monetization_clicks, created_at, gender, is_agent'
      )
      .in("email", Array.from(emailsToLookup));

    for (const r of (profRows || []) as any[]) {
      const e = String(r.email || "")
        .toLowerCase()
        .trim();
      const handle = String(r.username || e)
        .split("@")[0]
        .replace(/^@/, "")
        .trim();
      const firstName =
        typeof r.firstName === "string"
          ? (await decryptSensitiveFieldEdge(r.firstName)) || ""
          : "";
      const lastName =
        typeof r.lastName === "string"
          ? (await decryptSensitiveFieldEdge(r.lastName)) || ""
          : "";
      const fullName =
        r.business_name && String(r.business_name).trim()
          ? String(r.business_name).trim()
          : `${firstName} ${lastName}`.trim() || handle;
      const isMonetized =
        r.monetized === true ||
        r.monetized === "true" ||
        r.monetized === "yes" ||
        r.monetized === "1" ||
        Number(r.monetization_clicks || 0) >= 300;

      profileMap[e] = {
        username: handle,
        displayName: fullName,
        profileImage: r.profileImage || null,
        isAgent: Boolean(r.is_agent),
        profile: {
          business_name: r.business_name || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          username: handle,
          profileImage: r.profileImage || undefined,
          bio: r.bio || undefined,
          location:
            r.location && r.location !== "PLACEHOLDER" ? r.location : undefined,
          country:
            r.country && r.country !== "PLACEHOLDER" ? r.country : undefined,
          monetized: isMonetized,
          created_at: r.created_at || undefined,
          gender: r.gender || undefined,
        },
      };
    }
  }

  let totalAgentEarned = 0;
  let pendingOptOutRequestsCount = 0;

  const invites = activeDownlineRows.map((row: any) => {
    const refEmail = String(row.referee_email || "")
      .toLowerCase()
      .trim();
    const prof = profileMap[refEmail] || {
      username: refEmail.split("@")[0],
      displayName: refEmail.split("@")[0],
      profileImage: null,
      isAgent: false,
      profile: { username: refEmail.split("@")[0] },
    };
    const optOut = resolveOptOutFromRow(row);
    if (optOut === "requested") pendingOptOutRequestsCount += 1;
    const isMonetized = Boolean(prof.profile?.monetized);
    const earned = isMonetized
      ? Math.round((Number(row.total_commission_earned) || 0) * 100) / 100
      : 0;
    totalAgentEarned = Math.round((totalAgentEarned + earned) * 100) / 100;

    return {
      id: prof.username,
      refereeKey: refEmail,
      username: prof.username,
      displayName: prof.displayName,
      profileImage: prof.profileImage,
      profile: prof.profile,
      isAgent: prof.isAgent,
      commissionRatePct: prof.isAgent ? 2 : 1,
      earnedFromUser: earned,
      optOutStatus: optOut,
      optOutRequestedAt: row.opt_out_requested_at || null,
      joinedAt: row.created_at || new Date().toISOString(),
    };
  });

  let uplineAgent = null;
  if (hasActiveUp && upRow.referrer_email) {
    const upEmail = String(upRow.referrer_email).toLowerCase().trim();
    const upProf = profileMap[upEmail] || {
      username: upEmail.split("@")[0],
      displayName: upEmail.split("@")[0],
      profileImage: null,
      isAgent: true,
      profile: { username: upEmail.split("@")[0] },
    };
    if (upOpt === "agent_requested") pendingOptOutRequestsCount += 1;
    uplineAgent = {
      username: upProf.username,
      displayName: upProf.displayName,
      profileImage: upProf.profileImage,
      profile: upProf.profile,
      isRefereeAgent: isAgent,
      deductionRatePct: isAgent ? 2 : 1,
      totalGainedFromMe:
        Math.round((Number(upRow.total_commission_earned) || 0) * 100) / 100,
      optOutStatus: upOpt,
      optOutRequestedAt: upRow.opt_out_requested_at || null,
      joinedAt: upRow.created_at || new Date().toISOString(),
    };
  }

  const mutuals = rawMutuals.map((mEmail) => {
    const mProf = profileMap[mEmail] || {
      username: mEmail.split("@")[0],
      displayName: mEmail.split("@")[0],
      profileImage: null,
      isAgent: false,
      profile: { username: mEmail.split("@")[0] },
    };
    return {
      id: mProf.username,
      username: mProf.username,
      displayName: mProf.displayName,
      profileImage: mProf.profileImage,
      profile: mProf.profile,
    };
  });

  const mutualsCount = Math.max(
    Number(userData.mutual_count || 0),
    mutuals.length
  );
  const totalInvites =
    typeof dlRes.count === "number" && dlRes.count > invites.length
      ? dlRes.count
      : invites.length;

  return {
    success: true,
    isAgent,
    agentRegisteredAt: userData.agent_registered_at || null,
    referralCode,
    totalAgentEarned,
    invitesCount: totalInvites,
    uplineAgentsCount: uplineAgent ? 1 : 0,
    mutualsCount,
    pendingOptOutRequestsCount,
    invites,
    uplineAgent,
    mutuals,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "")
      .trim()
      .toLowerCase();

    // Public-safe username check (can be called before or during profile setup)
    if (action === "check_username") {
      const rawUsername = String(body?.username || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "");
      if (!rawUsername || rawUsername.length < 3) {
        return new Response(
          JSON.stringify({
            available: false,
            message: "Username must be at least 3 characters",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
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
        .ilike("username", rawUsername)
        .maybeSingle();

      if (existing && existing.email?.toLowerCase().trim() !== callerEmail) {
        return new Response(
          JSON.stringify({
            available: false,
            message: "Username is already taken",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ available: true, message: "Username available" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Zero-Trust caller verification for all authenticated user actions
    const verifiedEmail = await getVerifiedUserEmail(req);
    const rawEmail =
      req.headers.get("x-user-email") || String(body?.email || "");
    const requestedEmail = rawEmail.toLowerCase().trim();

    if (!verifiedEmail) {
      return new Response(
        JSON.stringify({ error: "Please sign in again to continue." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      verifiedEmail !== "service_role" &&
      requestedEmail &&
      verifiedEmail !== requestedEmail
    ) {
      return new Response(
        JSON.stringify({ error: "Session mismatch. Please sign in again." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanEmail =
      verifiedEmail === "service_role" ? requestedEmail : verifiedEmail;

    if (!cleanEmail) {
      return new Response(
        JSON.stringify({ error: "Authentication required." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // -------------------------------------------------------------------------
    // 1. GET OR CREATE PROFILE (with AES-256-GCM Decryption)
    // -------------------------------------------------------------------------
    if (action === "get_profile") {
      let { data: userRow, error: fetchErr } = await supabase
        .from("users")
        .select("*")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!fetchErr && !userRow) {
        // Autonomous first-login creation using service_role (bypasses anon INSERT lockdown)
        const referralCode = `PAAYH-${crypto
          .randomUUID()
          .replace(/-/g, "")
          .slice(0, 6)
          .toUpperCase()}`;
        const newProfilePayload = {
          email: cleanEmail,
          balance: 0,
          monetized: "false",
          monetization_clicks: 0,
          country: "PLACEHOLDER",
          state: "PLACEHOLDER",
          location: "PLACEHOLDER",
          referral_code: referralCode,
          created_at: new Date().toISOString(),
        };

        const { data: created } = await supabase
          .from("users")
          .insert([newProfilePayload])
          .select("*")
          .maybeSingle();

        userRow = created;
      }

      if (!userRow) {
        return new Response(
          JSON.stringify({
            error: "Unable to load your profile right now. Please try again.",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const decrypted = await decryptProfilePIIEdge(userRow);
      const formatted = {
        ...decrypted,
        cooldown_until: userRow.suspended_until || null,
        balance: Number(userRow.balance || 0),
      };

      return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 2. UPDATE PROFILE (with 30-day Cooldown, AES-256-GCM Encryption & Invite Linking)
    // -------------------------------------------------------------------------
    if (action === "update_profile") {
      const updates = body?.updates || body || {};

      const { data: currentUser } = await supabase
        .from("users")
        .select("*")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!currentUser) {
        return new Response(
          JSON.stringify({ error: "User profile not found." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const allowedFields = [
        "firstName",
        "lastName",
        "username",
        "phone",
        "bio",
        "profileImage",
        "country",
        "state",
        "location",
        "dob",
        "gender",
        "employment",
        "industry",
        "interest",
        "lifestyle",
        "behavior",
        "personality",
        "business_name",
      ];

      const dbPayload: Record<string, any> = {
        lastUpdated: new Date().toISOString(),
        has_updated_profile: true,
      };

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          dbPayload[field] = updates[field];
        }
      }

      if (updates.intlTravel !== undefined) {
        dbPayload.intl_travel =
          updates.intlTravel === "yes" || updates.intlTravel === true;
      } else if (updates.intl_travel !== undefined) {
        dbPayload.intl_travel = Boolean(updates.intl_travel);
      }

      if (updates.localTravel !== undefined) {
        dbPayload.local_travel =
          updates.localTravel === "yes" || updates.localTravel === true;
      } else if (updates.local_travel !== undefined) {
        dbPayload.local_travel = Boolean(updates.local_travel);
      }

      // Encrypt sensitive PII fields with AES-256-GCM before storing in DB
      if (typeof dbPayload.phone === "string" && dbPayload.phone.trim()) {
        dbPayload.phone = await encryptSensitiveFieldEdge(dbPayload.phone);
      }
      if (
        typeof dbPayload.firstName === "string" &&
        dbPayload.firstName.trim()
      ) {
        dbPayload.firstName = await encryptSensitiveFieldEdge(
          dbPayload.firstName
        );
      }
      if (typeof dbPayload.lastName === "string" && dbPayload.lastName.trim()) {
        dbPayload.lastName = await encryptSensitiveFieldEdge(
          dbPayload.lastName
        );
      }

      // Handle optional invite/referral code during profile setup
      const rawInvite = String(
        updates.inviteCode || updates.referralCode || ""
      )
        .trim()
        .replace(/^@/, "");
      if (rawInvite && !currentUser.referred_by) {
        const { data: referrer } = await supabase
          .from("users")
          .select("email, referral_code, username")
          .or(`referral_code.ilike.${rawInvite},username.ilike.${rawInvite}`)
          .maybeSingle();

        const referrerEmail = referrer?.email
          ? String(referrer.email).toLowerCase().trim()
          : "";
        if (referrerEmail && referrerEmail !== cleanEmail) {
          dbPayload.referred_by = referrerEmail;
          try {
            await supabase.from("referrals").upsert(
              [
                {
                  referrer_email: referrerEmail,
                  referee_email: cleanEmail,
                  status: "qualified",
                  opt_out_status: "none",
                },
              ],
              { onConflict: "referee_email" }
            );
          } catch {}
        }
      }

      const { data: updatedRow, error: updateErr } = await supabase
        .from("users")
        .update(dbPayload)
        .eq("id", currentUser.id)
        .select("*")
        .maybeSingle();

      if (updateErr) {
        return new Response(
          JSON.stringify({
            error: "Could not save profile updates. Please try again.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const decrypted = await decryptProfilePIIEdge(updatedRow || currentUser);
      return new Response(
        JSON.stringify({
          ...decrypted,
          success: true,
          balance: Number((updatedRow || currentUser).balance || 0),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // -------------------------------------------------------------------------
    // 3. RECALIBRATE LOCATION
    // -------------------------------------------------------------------------
    if (action === "recalibrate_location") {
      const country = String(body?.country || "").trim();
      const state = String(body?.state || "").trim();
      const location = String(body?.location || "").trim();

      if (!country) {
        return new Response(
          JSON.stringify({ error: "Country is required." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
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

      return new Response(
        JSON.stringify({
          updated: true,
          source: body?.source || "gps",
          current: { country, state, location },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // -------------------------------------------------------------------------
    // 4. WALLET 4-DIGIT PIN STATUS & ACTIONS (Setup / Verify / Change / Reset)
    // -------------------------------------------------------------------------
    if (action === "wallet_pin_status") {
      const { user, error } = await fetchUserForPin(supabase, cleanEmail);
      if (error || !user) {
        return new Response(JSON.stringify({ hasPin: false }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const storedPinHash = extractStoredPinHash(user);
      return new Response(
        JSON.stringify({ hasPin: Boolean(storedPinHash) }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      action === "wallet_pin_action" ||
      action === "setup" ||
      action === "verify" ||
      action === "change" ||
      action === "reset"
    ) {
      const pinAction = String(
        body?.pinAction || body?.subAction || body?.action || ""
      )
        .trim()
        .toLowerCase();
      const clientIp =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "edge";
      const pinAttemptBucket = `wallet_pin_fail:${cleanEmail}:${clientIp}`;
      const resetAttemptBucket = `wallet_pin_reset_fail:${cleanEmail}:${clientIp}`;

      if (pinAction === "verify" || pinAction === "change") {
        const lockStatus = getPinLockoutStatus(pinAttemptBucket);
        if (lockStatus.locked) {
          return new Response(
            JSON.stringify({
              error: `Too many wrong PIN attempts. Try again in ${formatTryAgainMins(
                lockStatus.minsLeft
              )}.`,
              retryAfter: lockStatus.secondsLeft,
              retryAfterMinutes: lockStatus.minsLeft,
            }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      if (pinAction === "reset") {
        const resetLockStatus = getPinLockoutStatus(resetAttemptBucket);
        if (resetLockStatus.locked) {
          return new Response(
            JSON.stringify({
              error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(
                resetLockStatus.minsLeft
              )}.`,
              retryAfter: resetLockStatus.secondsLeft,
              retryAfterMinutes: resetLockStatus.minsLeft,
            }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      const {
        user,
        usePassphraseFallback,
        error: fetchErr,
      } = await fetchUserForPin(supabase, cleanEmail);

      if (fetchErr || !user) {
        return new Response(
          JSON.stringify({
            error:
              "Unable to process Wallet PIN request right now. Please try again.",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const storedPinHash = extractStoredPinHash(user);
      const hasExistingPin = Boolean(storedPinHash);

      if (pinAction === "setup") {
        if (hasExistingPin) {
          return new Response(
            JSON.stringify({
              error:
                "A Wallet PIN is already set for this account. Please enter your PIN or use 'Forgot PIN?'.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const pin = String(body?.pin || "").trim();
        const confirmPin = String(body?.confirmPin ?? pin).trim();
        if (!/^\d{4}$/.test(pin)) {
          return new Response(
            JSON.stringify({
              error: "Wallet PIN must be a 4-digit number (0-9).",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        if (pin !== confirmPin) {
          return new Response(
            JSON.stringify({
              error: "PIN and confirmation PIN do not match.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const hashedPin = await hashWalletPinEdge(pin, cleanEmail);
        const { error: updateErr } = await saveUserPinHash(
          supabase,
          user.id,
          hashedPin,
          usePassphraseFallback
        );

        if (updateErr) {
          return new Response(
            JSON.stringify({
              error: "Could not save your Wallet PIN right now. Please try again.",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        memoryPinFailStore.delete(pinAttemptBucket);
        return new Response(
          JSON.stringify({
            success: true,
            hasPin: true,
            verified: true,
            message: "Wallet PIN created and wallet unlocked.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (pinAction === "verify") {
        if (!hasExistingPin) {
          return new Response(
            JSON.stringify({
              error: "PIN_NOT_SET",
              hasPin: false,
              message: "Please set your initial 4-digit Wallet PIN first.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const pin = String(body?.pin || "").trim();
        if (!/^\d{4}$/.test(pin)) {
          return new Response(
            JSON.stringify({ error: "Please enter a valid 4-digit PIN." }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const isValid = await verifyWalletPinEdge(
          pin,
          cleanEmail,
          storedPinHash
        );
        if (!isValid) {
          const failInfo = recordFailedPinAttempt(pinAttemptBucket);
          if (failInfo.locked) {
            return new Response(
              JSON.stringify({
                error: `Too many wrong PIN attempts. Try again in ${formatTryAgainMins(
                  failInfo.minsLeft
                )}.`,
                retryAfter: failInfo.secondsLeft,
                retryAfterMinutes: failInfo.minsLeft,
              }),
              {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          return new Response(
            JSON.stringify({
              error: `Incorrect 4-digit Wallet PIN (${
                failInfo.attemptsRemaining
              } attempt${
                failInfo.attemptsRemaining === 1 ? "" : "s"
              } left before 45-min lockout).`,
              attemptsRemaining: failInfo.attemptsRemaining,
            }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        memoryPinFailStore.delete(pinAttemptBucket);
        return new Response(
          JSON.stringify({
            success: true,
            hasPin: true,
            verified: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (pinAction === "change") {
        if (!hasExistingPin) {
          return new Response(
            JSON.stringify({
              error: "No existing PIN found. Please set a new PIN.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const currentPin = String(body?.currentPin || "").trim();
        const newPin = String(body?.newPin || "").trim();
        const confirmPin = String(body?.confirmPin ?? newPin).trim();

        if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
          return new Response(
            JSON.stringify({
              error: "Both current and new PINs must be 4 digits.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        if (newPin !== confirmPin) {
          return new Response(
            JSON.stringify({
              error: "New PIN and confirmation PIN do not match.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const isCurrentValid = await verifyWalletPinEdge(
          currentPin,
          cleanEmail,
          storedPinHash
        );
        if (!isCurrentValid) {
          const failInfo = recordFailedPinAttempt(pinAttemptBucket);
          if (failInfo.locked) {
            return new Response(
              JSON.stringify({
                error: `Too many wrong PIN attempts. Try again in ${formatTryAgainMins(
                  failInfo.minsLeft
                )}.`,
                retryAfter: failInfo.secondsLeft,
                retryAfterMinutes: failInfo.minsLeft,
              }),
              {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          return new Response(
            JSON.stringify({
              error: `Current Wallet PIN is incorrect (${
                failInfo.attemptsRemaining
              } attempt${
                failInfo.attemptsRemaining === 1 ? "" : "s"
              } left before 45-min lockout).`,
            }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const hashedPin = await hashWalletPinEdge(newPin, cleanEmail);
        const { error: updateErr } = await saveUserPinHash(
          supabase,
          user.id,
          hashedPin,
          usePassphraseFallback
        );

        if (updateErr) {
          return new Response(
            JSON.stringify({
              error:
                "Could not update your Wallet PIN right now. Please try again.",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        memoryPinFailStore.delete(pinAttemptBucket);
        return new Response(
          JSON.stringify({
            success: true,
            hasPin: true,
            verified: true,
            message: "Wallet PIN changed successfully.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (pinAction === "reset") {
        const confirmEmail = String(body?.confirmEmail || "")
          .toLowerCase()
          .trim();
        const phoneInput = String(body?.phone || "").trim();
        const newPin = String(body?.newPin || "").trim();
        const confirmPin = String(body?.confirmPin ?? newPin).trim();

        if (!confirmEmail || confirmEmail !== cleanEmail) {
          const failInfo = recordFailedPinAttempt(resetAttemptBucket);
          if (failInfo.locked) {
            return new Response(
              JSON.stringify({
                error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(
                  failInfo.minsLeft
                )}.`,
              }),
              {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          return new Response(
            JSON.stringify({
              error:
                "Email verification failed. Please enter your exact registered account email address.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const decryptedPhone =
          (await decryptSensitiveFieldEdge(user.phone)) ||
          String(user.phone || "");
        const savedPhoneLast10 = decryptedPhone.startsWith("PLACEHOLDER")
          ? ""
          : decryptedPhone.replace(/\D/g, "").slice(-10);
        const inputPhoneLast10 = phoneInput.replace(/\D/g, "").slice(-10);

        if (savedPhoneLast10) {
          if (!inputPhoneLast10 || inputPhoneLast10 !== savedPhoneLast10) {
            const failInfo = recordFailedPinAttempt(resetAttemptBucket);
            if (failInfo.locked) {
              return new Response(
                JSON.stringify({
                  error: `Too many failed reset attempts. Try again in ${formatTryAgainMins(
                    failInfo.minsLeft
                  )}.`,
                }),
                {
                  status: 429,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                }
              );
            }
            return new Response(
              JSON.stringify({
                error:
                  "Phone verification failed. The phone number entered does not match your registered profile phone number.",
              }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        } else if (!phoneInput) {
          return new Response(
            JSON.stringify({
              error: "Please enter your phone number to verify your identity.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (!/^\d{4}$/.test(newPin)) {
          return new Response(
            JSON.stringify({
              error: "New Wallet PIN must be a 4-digit number (0-9).",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        if (newPin !== confirmPin) {
          return new Response(
            JSON.stringify({
              error: "New PIN and confirmation PIN do not match.",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const hashedPin = await hashWalletPinEdge(newPin, cleanEmail);
        const { error: updateErr } = await saveUserPinHash(
          supabase,
          user.id,
          hashedPin,
          usePassphraseFallback
        );

        if (updateErr) {
          return new Response(
            JSON.stringify({
              error:
                "Could not reset your Wallet PIN right now. Please try again.",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        memoryPinFailStore.delete(pinAttemptBucket);
        memoryPinFailStore.delete(resetAttemptBucket);

        try {
          await supabase.from("notifications").insert([
            {
              user_email: cleanEmail,
              title: "Security Alert: Wallet PIN Reset",
              message:
                "Your 4-digit Wallet PIN was recently reset after verifying your registered email and phone number.",
              is_read: false,
            },
          ]);
        } catch {}

        return new Response(
          JSON.stringify({
            success: true,
            hasPin: true,
            verified: true,
            message: "Wallet PIN reset successfully.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: "Invalid PIN action." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 5. NOTIFICATIONS (Get / Mark Read / Delete)
    // -------------------------------------------------------------------------
    if (action === "get_notifications") {
      const [{ data: userNotifs }, { data: announcements }, { data: readAnn }] =
        await Promise.all([
          supabase
            .from("notifications")
            .select("*")
            .ilike("user_email", cleanEmail)
            .order("created_at", { ascending: false })
            .limit(60),
          supabase
            .from("announcements")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("read_announcements")
            .select("announcement_id")
            .ilike("user_email", cleanEmail),
        ]);

      const readSet = new Set(
        (readAnn || []).map((r: any) => String(r.announcement_id))
      );

      const formattedAnnouncements = (announcements || []).map((a: any) => ({
        id: `ann_${a.id}`,
        user_email: cleanEmail,
        title: a.title || "Platform Announcement",
        message: a.message || a.content || "",
        type: "announcement",
        is_read: readSet.has(String(a.id)),
        created_at: a.created_at,
      }));

      const combined = [...(userNotifs || []), ...formattedAnnouncements].sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );

      return new Response(JSON.stringify(combined), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "mark_notifications_read") {
      const notificationId = body?.notificationId;
      const all = Boolean(body?.all);

      if (all) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .ilike("user_email", cleanEmail);
      } else if (notificationId) {
        if (String(notificationId).startsWith("ann_")) {
          const rawAnnId = String(notificationId).replace(/^ann_/, "");
          await supabase
            .from("read_announcements")
            .upsert(
              [{ user_email: cleanEmail, announcement_id: rawAnnId }],
              { onConflict: "user_email,announcement_id" }
            );
        } else {
          await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", notificationId)
            .ilike("user_email", cleanEmail);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_notifications") {
      const notificationIds = body?.notificationIds;
      const all = Boolean(body?.all);

      if (all) {
        await supabase
          .from("notifications")
          .delete()
          .ilike("user_email", cleanEmail);
      } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
        const regularIds = notificationIds.filter(
          (id: string) => !String(id).startsWith("ann_")
        );
        if (regularIds.length > 0) {
          await supabase
            .from("notifications")
            .delete()
            .in("id", regularIds)
            .ilike("user_email", cleanEmail);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 6. COMBINED FINANCIAL STATEMENT (Payments + Withdrawals)
    // -------------------------------------------------------------------------
    if (action === "get_statement") {
      const [{ data: paymentsRows }, { data: withdrawalRows }] =
        await Promise.all([
          supabase
            .from("payments")
            .select(
              "id, reference, amount, status, type, description, metadata, created_at"
            )
            .ilike("user_email", cleanEmail)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("withdrawals")
            .select(
              "id, reference, amount, fee, bank_name, account_number, account_name, status, created_at"
            )
            .ilike("user_email", cleanEmail)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

      const safePayments = (paymentsRows || []).filter(
        (r: any) => r.type !== "withdrawal"
      );
      const safeWithdrawals =
        withdrawalRows && withdrawalRows.length > 0
          ? withdrawalRows.map((w: any) => ({
              ...w,
              type: "withdrawal",
              description:
                w.description ||
                `Withdrawal to ${w.bank_name || "Bank"} (${
                  w.account_number || ""
                })`,
            }))
          : (paymentsRows || []).filter((r: any) => r.type === "withdrawal");

      const all = [...safePayments, ...safeWithdrawals].sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );

      return new Response(
        JSON.stringify({
          payments: safePayments,
          withdrawals: safeWithdrawals,
          all,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // -------------------------------------------------------------------------
    // 7. MONETIZATION STATUS & CANCEL
    // -------------------------------------------------------------------------
    if (action === "get_monetization") {
      const { data: u } = await supabase
        .from("users")
        .select(
          "id, balance, monetized, monetization_clicks, atw_tier, lastUpdated, is_career, is_affiliate"
        )
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!u) {
        return new Response(
          JSON.stringify({
            isMonetized: false,
            clicksCount: 0,
            clicksRemaining: 300,
            atwTier: "ATW1",
            holdingCap: 30000,
            isUnlimited: false,
            daysInactive: 0,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      let clicks = Number(u.monetization_clicks || 0);
      const isExempt = Boolean(
        u.is_career ||
        u.is_affiliate ||
        cleanEmail === "nonsom019@gmail.com" ||
        cleanEmail === "nonsom2023@gmail.com" ||
        cleanEmail === "admin@paayh.com" ||
        cleanEmail === "admin@xea.com" ||
        cleanEmail === "support@paayh.com"
      );
      if (isExempt && clicks === 300) {
        try {
          const { data: impRows } = await supabase
            .from("ad_impressions")
            .select("view_count")
            .ilike("user_email", cleanEmail);
          const actualImpSum = (impRows || []).reduce(
            (acc: number, r: any) => acc + (Number(r.view_count) || 1),
            0
          );
          if (actualImpSum < 290) {
            clicks = actualImpSum;
            await supabase
              .from("users")
              .update({ monetization_clicks: clicks })
              .eq("id", u.id);
          }
        } catch {}
      }

      const nextTarget =
        clicks < 300 ? 300 : (Math.floor(clicks / 300) + 1) * 300;
      const computedLvl = clicks >= 300 ? Math.floor(clicks / 300) : 1;
      const existingLvl = u.atw_tier
        ? parseInt(String(u.atw_tier).replace(/\D/g, ""), 10) || 1
        : 1;
      const finalLvl = Math.max(1, existingLvl, computedLvl);
      const finalAtwTier = isExempt ? "Unlimited" : `ATW${finalLvl}`;
      const isMonetized =
        isExempt ||
        u.monetized === true ||
        u.monetized === "true" ||
        u.monetized === "yes" ||
        clicks >= 300;

      if (u.atw_tier !== finalAtwTier || (isMonetized && u.monetized !== "true" && u.monetized !== true)) {
        supabase
          .from("users")
          .update({
            atw_tier: finalAtwTier,
            ...(isMonetized ? { monetized: "true" } : {}),
          })
          .eq("id", u.id)
          .then(() => {}, () => {});
      }

      return new Response(
        JSON.stringify({
          isMonetized,
          clicksCount: clicks,
          clicksRemaining: Math.max(0, nextTarget - clicks),
          targetClicks: nextTarget,
          atwTier: finalAtwTier,
          atwLevel: finalLvl,
          isUnlimited: isExempt,
          holdingCap: isExempt ? null : finalLvl * 30000,
          balance: Number(u.balance || 0),
          daysInactive: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "cancel_monetization") {
      const confirmEmail = String(body?.confirmEmail || "")
        .toLowerCase()
        .trim();
      if (confirmEmail && confirmEmail !== cleanEmail) {
        return new Response(
          JSON.stringify({
            error: "Confirmation email does not match your account.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      await supabase
        .from("users")
        .update({ monetized: "false", monetization_clicks: 0, atw_tier: "ATW1" })
        .ilike("email", cleanEmail);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 8. DEACTIVATE ACCOUNT
    // -------------------------------------------------------------------------
    if (action === "deactivate_account") {
      await supabase
        .from("users")
        .update({ ad_account_status: "deactivated" })
        .ilike("email", cleanEmail);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // 9. AGENT & REFERRAL NETWORK (Status / Register / Opt-Out)
    // -------------------------------------------------------------------------
    if (action === "agent_network") {
      const payload = await buildAgentNetworkPayload(supabase, cleanEmail);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "agent_register" || action === "register") {
      const nowIso = new Date().toISOString();
      await supabase
        .from("users")
        .update({ is_agent: true, agent_registered_at: nowIso })
        .ilike("email", cleanEmail);

      const payload = await buildAgentNetworkPayload(supabase, cleanEmail);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "agent_opt_out" || action === "opt_out") {
      const optOutAction = String(body?.optOutAction || "")
        .trim()
        .toLowerCase();
      const cleanRef = String(body?.refereeEmail || "")
        .toLowerCase()
        .trim();
      const nowIso = new Date().toISOString();

      if (optOutAction === "request" || optOutAction === "cancel_request") {
        const nextOpt = optOutAction === "request" ? "requested" : "none";
        const dbStatus = mapOptOutToDbStatus(nextOpt);
        const { error } = await supabase
          .from("referrals")
          .update({
            status: dbStatus,
            opt_out_status: nextOpt,
            opt_out_requested_at: optOutAction === "request" ? nowIso : null,
          })
          .ilike("referee_email", cleanEmail);
        if (error) {
          await supabase
            .from("referrals")
            .update({ status: dbStatus })
            .ilike("referee_email", cleanEmail);
        }
      } else if (
        (optOutAction === "agent_request" || optOutAction === "agent_cancel") &&
        cleanRef
      ) {
        const nextOpt =
          optOutAction === "agent_request" ? "agent_requested" : "none";
        const dbStatus = mapOptOutToDbStatus(nextOpt);
        const { error } = await supabase
          .from("referrals")
          .update({
            status: dbStatus,
            opt_out_status: nextOpt,
            opt_out_requested_at:
              optOutAction === "agent_request" ? nowIso : null,
          })
          .ilike("referrer_email", cleanEmail)
          .ilike("referee_email", cleanRef);
        if (error) {
          await supabase
            .from("referrals")
            .update({ status: dbStatus })
            .ilike("referrer_email", cleanEmail)
            .ilike("referee_email", cleanRef);
        }
      } else if (optOutAction === "accept" && cleanRef) {
        await Promise.all([
          supabase
            .from("referrals")
            .update({ status: "opted_out", opt_out_status: "accepted" })
            .ilike("referrer_email", cleanEmail)
            .ilike("referee_email", cleanRef),
          supabase
            .from("users")
            .update({ referred_by: null })
            .ilike("email", cleanRef),
        ]);
      } else if (optOutAction === "reject" && cleanRef) {
        await supabase
          .from("referrals")
          .update({ status: "rej_unfollow", opt_out_status: "rejected" })
          .ilike("referrer_email", cleanEmail)
          .ilike("referee_email", cleanRef);
      } else if (optOutAction === "referee_accept") {
        await Promise.all([
          supabase
            .from("referrals")
            .update({ status: "opted_out", opt_out_status: "accepted" })
            .ilike("referee_email", cleanEmail),
          supabase
            .from("users")
            .update({ referred_by: null })
            .ilike("email", cleanEmail),
        ]);
      } else if (optOutAction === "referee_reject") {
        await supabase
          .from("referrals")
          .update({ status: "qualified", opt_out_status: "none" })
          .ilike("referee_email", cleanEmail);
      } else if (optOutAction === "force") {
        await Promise.all([
          supabase
            .from("referrals")
            .update({ status: "opted_out", opt_out_status: "forced" })
            .ilike("referee_email", cleanEmail),
          supabase
            .from("referrals")
            .update({ status: "opted_out", opt_out_status: "forced" })
            .ilike("referrer_email", cleanEmail)
            .neq("status", "opted_out"),
          supabase
            .from("users")
            .update({ is_agent: false, referred_by: null })
            .ilike("email", cleanEmail),
        ]);
      }

      const payload = await buildAgentNetworkPayload(supabase, cleanEmail);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unsupported user action." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Unable to process request right now. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
