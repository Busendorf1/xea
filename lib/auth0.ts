import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

const rawDomain =
  process.env.AUTH0_DOMAIN ||
  process.env.AUTH0_ISSUER_BASE_URL ||
  "dev-43c1fflhle3lv7jj.us.auth0.com";

const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const auth0 = new Auth0Client({
  domain: cleanDomain,
  clientId: process.env.AUTH0_CLIENT_ID || "placeholder-client-id",
  clientSecret: process.env.AUTH0_CLIENT_SECRET || "placeholder-client-secret",
  secret: process.env.AUTH0_SECRET || "placeholder-secret-must-be-32-characters-long",
  appBaseUrl: process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || "http://localhost:3000",
  httpTimeout: 15000,
  async onCallback(error, ctx) {
    if (error) {
      console.error("❌ [Auth0 Callback Error]:", {
        name: error.name,
        code: (error as any).code,
        message: error.message,
        cause: (error as any).cause,
      });
      return new NextResponse(
        `Authentication failed: ${error.message}${
          (error as any).cause?.message ? ` (${(error as any).cause.message})` : ""
        }. Please check your Auth0 application credentials and Allowed Callback URLs.`,
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    const baseUrl = process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || "http://localhost:3000";
    const target = ctx.returnTo ? new URL(ctx.returnTo, baseUrl).toString() : `${baseUrl}/`;
    return NextResponse.redirect(target, 307);
  },
});

