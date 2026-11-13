import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function buildAppleAppSiteAssociation() {
  const teamId = (process.env.APPLE_TEAM_ID || "").trim();
  const bundleId = (process.env.IOS_BUNDLE_ID || "com.paayh.app").trim();
  const appId = teamId ? `${teamId}.${bundleId}` : bundleId;

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: appId,
          appIDs: [appId],
          paths: ["NOT /api/*", "NOT /_next/*", "NOT /monitoring*", "/*", "/ad/*", "/share/*", "/logged-in*", "/"],
          components: [
            { "/": "/api/*", exclude: true },
            { "/": "/_next/*", exclude: true },
            { "/": "/monitoring*", exclude: true },
            { "/": "/ad/*" },
            { "/": "/share/*" },
            { "/": "/logged-in*" },
            { "/": "/*" },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appId],
    },
  };
}

export async function GET() {
  return NextResponse.json(buildAppleAppSiteAssociation(), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
