import { NextRequest } from "next/server";
import { auth0 } from "./auth0";

const auth0Domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "dev-43c1fflhle3lv7jj.us.auth0.com";
const cleanDomain = auth0Domain.replace(/^https?:\/\//, "");

/**
 * Secure helper to fetch email from Auth0 access token (mobile Bearer)
 * or fallback to cookie session (web client).
 */
export async function getAuthenticatedEmail(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    console.log("🔑 Next.js Server: Verifying mobile Auth0 access token...");
    try {
      const res = await fetch(`https://${cleanDomain}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("📡 Next.js Server: Auth0 userinfo response status:", res.status);
      if (res.ok) {
        const userInfo = await res.json();
        console.log("✅ Next.js Server: Verified email:", userInfo.email);
        return userInfo.email?.toLowerCase() || null;
      } else {
        const errText = await res.text();
        console.warn("❌ Next.js Server: Auth0 userinfo verification failed:", errText);
      }
    } catch (err) {
      console.error("❌ Next.js Server: Error calling Auth0 userinfo:", err);
    }
  }

  const session = await auth0.getSession();
  if (session?.user?.email) {
    console.log("✅ Next.js Server: Verified web session cookie email:", session.user.email);
  }
  return session?.user?.email?.toLowerCase() || null;
}
