import supabaseAdmin from "./utils/dbAdmin";

const PERMANENT_BAN_REASONS = new Set(["admin_perm_banned", "perm_banned"]);

async function upstashDel(keys: string[]): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || keys.length === 0) return;

  try {
    await fetch(`${url.replace(/\/+$/, "")}/del/${keys.map((k) => encodeURIComponent(k)).join("/")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort cache eviction only
  }
}

export async function isEmailPermanentlyBannedEdge(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return false;

  try {
    const [{ data: deact }, { data: userRow }] = await Promise.all([
      supabaseAdmin
        .from("deactivated_users")
        .select("email, reason")
        .ilike("email", cleanEmail)
        .maybeSingle(),
      supabaseAdmin
        .from("users")
        .select("ad_account_status")
        .ilike("email", cleanEmail)
        .maybeSingle(),
    ]);

    const reason = String((deact as { reason?: string } | null)?.reason || "")
      .toLowerCase()
      .trim();
    if (PERMANENT_BAN_REASONS.has(reason) || userRow?.ad_account_status === "perm_banned") {
      return true;
    }
  } catch {
    // Fail open only for permanent-ban precheck; downstream route guards re-verify
  }

  return false;
}

/**
 * Edge-safe counterpart to clearSelfDeactivationForRejoin.
 * Never imports ioredis / Node built-ins so Next.js Edge Middleware compiles cleanly.
 */
export async function clearSelfDeactivationForRejoinEdge(
  email: string
): Promise<{ allowed: boolean; permanentlyBanned: boolean }> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return { allowed: false, permanentlyBanned: false };

  if (await isEmailPermanentlyBannedEdge(cleanEmail)) {
    return { allowed: false, permanentlyBanned: true };
  }

  try {
    await supabaseAdmin.from("deactivated_users").delete().ilike("email", cleanEmail);

    const { data: leftoverUser } = await supabaseAdmin
      .from("users")
      .select("id, ad_account_status")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (leftoverUser && leftoverUser.ad_account_status === "deactivated") {
      const { error: delErr } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", leftoverUser.id);

      if (delErr) {
        const ts = Date.now();
        await supabaseAdmin
          .from("users")
          .update({
            ad_account_status: "active",
            has_updated_profile: false,
            country: "PLACEHOLDER",
            state: "PLACEHOLDER",
            location: "PLACEHOLDER",
            phone: `PLACEHOLDER_PHONE_${ts}`,
            passphrase: `PLACEHOLDER_PASS_${ts}`,
            balance: 0,
            monetized: "false",
            monetization_clicks: 0,
            is_agent: false,
            referred_by: null,
          })
          .eq("id", leftoverUser.id);
      }
    }
  } catch {
    // Non-blocking cleanup
  }

  await upstashDel([`deactivated:${cleanEmail}`, `user_profile:${cleanEmail}`]);

  return { allowed: true, permanentlyBanned: false };
}
