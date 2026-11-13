import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { resolvePublicAdAvailability } from "@/lib/ads/publicAdResolver";
import { decodeSharedAdParam } from "@/lib/utils/adShare";

export const dynamic = "force-dynamic";

/**
 * Canonical Shared Ad & Deep Link Handler (/ad/[id]).
 * - On devices with the Paayh app installed, Universal Links / App Links open this URL natively in the app.
 * - On devices without the app (or fallback web view):
 *   - Active ads redirect cleanly into the web feed with sharedAdId preserved.
 *   - Expired / completed / missing ads NEVER show 404; they redirect to web with ?adStatus=unavailable
 *     so the user sees the 5-second auto-dismissing "This ad is no longer available" notice.
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

  if (!decodedId) {
    redirect(isAuthenticated ? "/logged-in?view=feed&adStatus=unavailable" : "/?adStatus=unavailable");
  }

  const resolution = await resolvePublicAdAvailability(decodedId);

  if (!resolution.available) {
    redirect(isAuthenticated ? "/logged-in?view=feed&adStatus=unavailable" : "/?adStatus=unavailable");
  }

  const encodedId = encodeURIComponent(resolution.adId);
  redirect(
    isAuthenticated
      ? `/logged-in?view=feed&sharedAdId=${encodedId}`
      : `/?sharedAdId=${encodedId}`
  );
}
