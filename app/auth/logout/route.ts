import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rawDomain =
    process.env.AUTH0_DOMAIN ||
    process.env.AUTH0_ISSUER_BASE_URL ||
    "dev-43c1fflhle3lv7jj.us.auth0.com";
  const cleanDomain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const clientId = process.env.AUTH0_CLIENT_ID || "";
  const baseUrl =
    process.env.APP_BASE_URL ||
    process.env.AUTH0_BASE_URL ||
    req.nextUrl.origin ||
    "http://localhost:3000";

  // Build direct Auth0 v2 logout URL to bypass OIDC discovery network timeouts
  const auth0LogoutUrl =
    clientId && clientId !== "placeholder-client-id"
      ? `https://${cleanDomain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(baseUrl)}`
      : baseUrl;

  const response = NextResponse.redirect(auth0LogoutUrl);

  // Clear all request cookies and known session cookies
  req.cookies.getAll().forEach((c) => {
    response.cookies.delete(c.name);
    response.cookies.set(c.name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  });

  const knownCookies = [
    "__session",
    "__session__0",
    "__session__1",
    "__session__2",
    "__session__3",
    "__session.0",
    "__session.1",
    "__session.2",
    "__session.3",
    "appSession",
    "auth0.is.authenticated",
    "paayh_active_tab",
  ];

  knownCookies.forEach((name) => {
    response.cookies.delete(name);
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  });

  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
