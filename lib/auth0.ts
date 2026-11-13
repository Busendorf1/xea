import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";
const rawDomain =
  process.env.AUTH0_DOMAIN ||
  process.env.AUTH0_ISSUER_BASE_URL ||
  "auth.paayh.com";

const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const auth0 = new Auth0Client({
  domain: cleanDomain,
  clientId: process.env.AUTH0_CLIENT_ID || "placeholder-client-id",
  clientSecret: process.env.AUTH0_CLIENT_SECRET || "placeholder-client-secret",
  secret: process.env.AUTH0_SECRET || "placeholder-secret-must-be-32-characters-long",
  appBaseUrl: process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || "http://localhost:3000",
  httpTimeout: 15000,
  async beforeSessionSaved(session) {
    // Ensure Sign in with Apple repeat logins or Private Relay accounts always have a normalized email
    if (session?.user && !session.user.email && typeof session.user.sub === "string") {
      const sanitizedSub = session.user.sub.replace(/^apple\|/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
      session.user.email = `${sanitizedSub}@privaterelay.appleid.com`.toLowerCase();
    }

    // Fresh OAuth sign-in clears non-ban self/dormancy deactivation tombstones so returning users go through setup profile cleanly
    if (session?.user?.email) {
      const cleanEmail = String(session.user.email).toLowerCase().trim();
      try {
        const { clearSelfDeactivationForRejoinEdge } = await import("./edgeRejoinHelper");
        await clearSelfDeactivationForRejoinEdge(cleanEmail);
        (session.user as Record<string, unknown>).loginAt = Date.now();
      } catch {}
    }

    return session;
  },
  async onCallback(error, ctx, session) {
    const baseUrl = process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || "http://localhost:3000";
    if (error) {
      const errCode = String((error as any).code || "");
      const errMsg = String(error.message || "");
      console.error("❌ [Auth0 Callback Error]:", {
        name: error.name,
        code: errCode,
        message: errMsg,
        cause: (error as any).cause,
      });

      // Recover seamlessly if state cookie was consumed by a double-click, back-navigation, or www/non-www redirect
      if (
        errCode === "invalid_state" ||
        errCode === "missing_state" ||
        errMsg.toLowerCase().includes("state parameter is invalid") ||
        errMsg.toLowerCase().includes("state parameter")
      ) {
        if (session?.user) {
          return NextResponse.redirect(`${baseUrl}/logged-in?view=feed`, 307);
        }
        return NextResponse.redirect(`${baseUrl}/auth/login`, 307);
      }

      return new NextResponse(
        `Authentication failed: ${error.message}${
          (error as any).cause?.message ? ` (${(error as any).cause.message})` : ""
        }. Please check your Auth0 application credentials and Allowed Callback URLs.`,
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    const target = ctx.returnTo ? new URL(ctx.returnTo, baseUrl).toString() : `${baseUrl}/`;
    return NextResponse.redirect(target, 307);
  },
});

