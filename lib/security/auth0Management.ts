/**
 * Auth0 Management API helper used for permanent account deletion.
 *
 * Apple App Store Guideline 5.1.1(v) and Google Play's account-deletion policy require that
 * in-app deletion removes the account itself, not just the app's profile row. Deleting the
 * Auth0 identity stops a deleted user from being silently re-created on their next login,
 * and lets Auth0 revoke linked social tokens (including Sign in with Apple, when the Apple
 * connection is configured with its key).
 *
 * Required env (Machine-to-Machine app authorised for the Auth0 Management API with
 * scopes `read:users` and `delete:users`):
 *   AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET
 * Falls back to AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET if that client has been granted
 * Management API access. If neither is authorised, this logs a warning and returns false;
 * the database deletion still completes.
 */

function resolveAuth0Domain(): string | null {
  const raw = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "";
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getManagementToken(domain: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const clientId = process.env.AUTH0_MGMT_CLIENT_ID || process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.warn(`⚠️ Auth0 management token request failed (${res.status}). Grant the client read:users + delete:users.`);
    return null;
  }
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

/**
 * Deletes every Auth0 identity registered to this email (Google, Apple, email/password...).
 * Returns true if at least one identity was deleted or none existed.
 */
export async function deleteAuth0IdentitiesByEmail(email: string): Promise<boolean> {
  const domain = resolveAuth0Domain();
  if (!domain) return false;
  try {
    const token = await getManagementToken(domain);
    if (!token) return false;

    const lookup = await fetch(
      `https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(email.toLowerCase().trim())}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!lookup.ok) {
      console.warn(`⚠️ Auth0 users-by-email lookup failed (${lookup.status}).`);
      return false;
    }
    const users: Array<{ user_id: string }> = await lookup.json();
    if (!Array.isArray(users) || users.length === 0) return true;

    const results = await Promise.allSettled(
      users.map((u) =>
        fetch(`https://${domain}/api/v2/users/${encodeURIComponent(u.user_id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        })
      )
    );
    return results.some((r) => r.status === "fulfilled" && (r.value.ok || r.value.status === 404));
  } catch (err) {
    console.warn("⚠️ Auth0 identity deletion error:", err);
    return false;
  }
}

/**
 * Hide-my-Email relay addresses (privaterelay.appleid.com) are often the account's only
 * identifier. Since we keep no other contact address, deletion also cuts off the relay.
 */
export function isApplePrivateRelay(email: string): boolean {
  return /@privaterelay\.appleid\.com$/i.test(email.trim());
}
