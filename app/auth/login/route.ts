import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const connection = req.nextUrl.searchParams.get("connection");
    return await auth0.startInteractiveLogin({
      authorizationParameters: connection ? { connection } : searchParams,
      returnTo: searchParams.returnTo || "/",
    });
  } catch (err: any) {
    console.warn("Direct Auth0 login fallback triggered:", err?.message || err);
    const rawDomain =
      process.env.AUTH0_DOMAIN ||
      (process.env.AUTH0_ISSUER_BASE_URL && !process.env.AUTH0_ISSUER_BASE_URL.includes("auth.paayh.com")
        ? process.env.AUTH0_ISSUER_BASE_URL
        : "dev-43c1fflhle3lv7jj.us.auth0.com");
    const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const clientId = process.env.AUTH0_CLIENT_ID || "QvUHZH4fxCrmS7HhaIaQv6iK8a49iPci";
    const baseUrl =
      process.env.APP_BASE_URL ||
      process.env.AUTH0_BASE_URL ||
      req.nextUrl.origin ||
      "http://localhost:3000";
    const connection = req.nextUrl.searchParams.get("connection");
    const connectionParam = connection ? `&connection=${encodeURIComponent(connection)}` : "";
    const directUrl = `https://${cleanDomain}/authorize?client_id=${encodeURIComponent(
      clientId
    )}&response_type=code&redirect_uri=${encodeURIComponent(
      `${baseUrl}/auth/callback`
    )}&scope=openid%20profile%20email${connectionParam}`;
    return NextResponse.redirect(directUrl);
  }
}
