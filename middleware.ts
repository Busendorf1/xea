import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // For public static or informative pages, bypass Auth0 middleware to eliminate discovery timeouts
  const isPublicPage = 
    pathname === "/" || 
    pathname === "/about" || 
    pathname === "/help" || 
    pathname === "/advert" || 
    pathname === "/privacy" ||
    pathname.startsWith("/api/feed") ||
    pathname.startsWith("/api/highlights");

  if (isPublicPage) {
    return NextResponse.next();
  }

  try {
    return await auth0.middleware(request);
  } catch (error: any) {
    console.warn("Auth0 middleware discovery timeout bypassed:", error?.message || error);
    
    // For logout requests during Auth0 discovery outages, cleanly clear cookies and redirect home
    if (pathname.includes("/logout")) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete("appSession");
      response.cookies.delete("auth0.is.authenticated");
      return response;
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
