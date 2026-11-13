import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { resolvePublicAdAvailability, resolvePublicSharedAdDetail } from "@/lib/ads/publicAdResolver";
import { decodeSharedAdParam } from "@/lib/utils/adShare";
import PublicSharedAdView from "./PublicSharedAdView";

export const dynamic = "force-dynamic";

/**
 * Canonical Shared Ad & Deep Link Handler (/ad/[id]).
 * - Authenticated users redirect directly into the feed single-ad view (/logged-in?view=feed&sharedAdId=...).
 * - Unauthenticated users render ONLY that single public-safe ad (no full landing wall, no other ads).
 * - Expired / completed / missing ads NEVER show 404 or silently show the full feed.
 */
export default async function SharedAdDeepLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  let uriDecoded = rawId || "";
  try {
    uriDecoded = decodeURIComponent(uriDecoded);
  } catch {
    uriDecoded = rawId || "";
  }
  const decodedId = decodeSharedAdParam(uriDecoded);

  let isAuthenticated = false;
  try {
    const session = await auth0.getSession();
    isAuthenticated = Boolean(session?.user?.email);
  } catch {
    isAuthenticated = false;
  }

  if (isAuthenticated) {
    if (!decodedId) {
      redirect("/logged-in?view=feed&adStatus=unavailable");
    }
    const resolution = await resolvePublicAdAvailability(decodedId);
    if (!resolution.available) {
      redirect("/logged-in?view=feed&adStatus=unavailable");
    }
    redirect(`/logged-in?view=feed&sharedAdId=${encodeURIComponent(resolution.adId)}`);
  }

  if (!decodedId) {
    return <PublicSharedAdView unavailable reason="invalid_id" />;
  }

  const detail = await resolvePublicSharedAdDetail(decodedId);
  if (!detail.available) {
    return <PublicSharedAdView unavailable reason={detail.reason} adId={decodedId} />;
  }

  return <PublicSharedAdView ad={detail.ad} profile={detail.profile} adId={detail.ad.id} />;
}
