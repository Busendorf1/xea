import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const connection = req.nextUrl.searchParams.get("connection");
  const loginOptions = {
    authorizationParameters: connection
      ? { connection, scope: "openid profile email" }
      : { scope: "openid profile email", ...searchParams },
    returnTo: searchParams.returnTo || "/",
  };

  try {
    return await auth0.startInteractiveLogin(loginOptions);
  } catch (err: any) {
    console.warn("Auth0 startInteractiveLogin first attempt failed, retrying:", err?.message || err);
    return await auth0.startInteractiveLogin(loginOptions);
  }
}
