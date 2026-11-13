import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import ModalLandingPage from "@/components/ModalLanding/page";
import PublicSharedAdView from "@/app/ad/[id]/PublicSharedAdView";
import { extractSharedAdIdFromSearchParams } from "@/lib/utils/adShare";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session: Awaited<ReturnType<typeof auth0.getSession>> = null;
  try {
    session = await auth0.getSession();
  } catch {
    session = null;
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(resolvedParams)) {
    if (typeof v === "string") urlParams.set(k, v);
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") urlParams.set(k, v[0]);
  }

  const sharedAdId = extractSharedAdIdFromSearchParams(urlParams);
  const isUnavailableStatus = urlParams.get("adStatus") === "unavailable";

  // If user is authenticated, redirect directly to home feed while preserving shared ad state
  if (session?.user?.email) {
    const forward = new URLSearchParams({ view: "feed" });
    if (sharedAdId) forward.set("sharedAdId", sharedAdId);
    if (isUnavailableStatus) forward.set("adStatus", "unavailable");
    redirect(`/logged-in?${forward.toString()}`);
  }

  // Unauthenticated shared ad links must render ONLY the shared ad (not the landing modal)
  if (sharedAdId) {
    redirect(`/ad/${encodeURIComponent(sharedAdId)}`);
  }

  if (isUnavailableStatus) {
    return <PublicSharedAdView unavailable />;
  }

  // Guest users visiting https://paayh.com see the dialogue concierge landing experience
  return <ModalLandingPage />;
}
