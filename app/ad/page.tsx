import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { extractSharedAdIdFromSearchParams } from "@/lib/utils/adShare";
import PublicSharedAdView from "./[id]/PublicSharedAdView";

export const dynamic = "force-dynamic";

/**
 * Fallback handler for /ad (without a path segment) so shared or malformed links
 * never hit a 404 screen and always resolve into single-ad mode.
 */
export default async function SharedAdIndexPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(resolved)) {
    if (typeof v === "string") urlParams.set(k, v);
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") urlParams.set(k, v[0]);
  }

  const sharedAdId = extractSharedAdIdFromSearchParams(urlParams) || urlParams.get("id");
  if (sharedAdId) {
    redirect(`/ad/${encodeURIComponent(sharedAdId)}`);
  }

  let isAuthenticated = false;
  try {
    const session = await auth0.getSession();
    isAuthenticated = Boolean(session?.user?.email);
  } catch {
    isAuthenticated = false;
  }

  if (isAuthenticated) {
    redirect("/logged-in?view=feed&adStatus=unavailable");
  }

  return <PublicSharedAdView unavailable reason="invalid_id" />;
}
