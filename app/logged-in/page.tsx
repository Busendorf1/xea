import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import LoggedInClientContainer, { TabKey } from "@/app/user/logged-in/LoggedInClientContainer";
import { getUserProfileForDashboard } from "@/lib/getUserProfileForDashboard";
import { isAdminEmail } from "@/lib/authHelper";
import { extractSharedAdIdFromSearchParams } from "@/lib/utils/adShare";
import { resolveSharedAdForFeed } from "@/lib/feed/sharedAdResolver";
import { signAdImpressionToken } from "@/lib/targetingEngine";
import { transformMediaUrlsToCdn } from "@/lib/utils/cdnUrl";

import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoggedInPage({ searchParams }: PageProps) {
  const [session, resolvedParams, cookieStore] = await Promise.all([
    auth0.getSession(),
    searchParams ? searchParams : Promise.resolve({} as Record<string, string | string[] | undefined>),
    cookies(),
  ]);

  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(resolvedParams || {})) {
    if (typeof v === "string") urlParams.set(k, v);
    else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") urlParams.set(k, v[0]);
  }
  const sharedAdId = extractSharedAdIdFromSearchParams(urlParams);
  const isUnavailableStatus = urlParams.get("adStatus") === "unavailable";

  if (!session || !session.user?.email) {
    if (sharedAdId) {
      redirect(`/ad/${encodeURIComponent(sharedAdId)}`);
    }
    if (isUnavailableStatus) {
      redirect("/?adStatus=unavailable");
    }
    redirect("/");
  }

  const rawView = urlParams.get("view") || undefined;
  const rawRetry = urlParams.get("retry") || undefined;

  if ((sharedAdId || isUnavailableStatus) && rawView !== "feed") {
    const forward = new URLSearchParams({ view: "feed" });
    if (sharedAdId) forward.set("sharedAdId", sharedAdId);
    if (isUnavailableStatus) forward.set("adStatus", "unavailable");
    redirect(`/logged-in?${forward.toString()}`);
  }

  const email = session.user.email.toLowerCase().trim();
  const isAdmin = isAdminEmail(email);
  (session.user as any).isAdmin = isAdmin;

  let profileResult;
  try {
    profileResult = await getUserProfileForDashboard(session);
  } catch (err: any) {
    console.warn("⚠️ [LoggedInPage] Initial profile fetch error, retrying:", err?.message || err);
    try {
      await new Promise((r) => setTimeout(r, 600));
      profileResult = await getUserProfileForDashboard(session);
    } catch (retryErr: any) {
      console.error("❌ [LoggedInPage] Persistent profile fetch failure:", retryErr?.message || retryErr);
      // Only retry once via redirect to avoid infinite reload loops on persistent DB outages
      if (!rawRetry) {
        const retryParams = new URLSearchParams({ view: "feed", retry: "1" });
        if (sharedAdId) retryParams.set("sharedAdId", sharedAdId);
        if (isUnavailableStatus) retryParams.set("adStatus", "unavailable");
        redirect(`/logged-in?${retryParams.toString()}`);
      }
      redirect("/user/profile-setup");
    }
  }

  if (profileResult.redirectUrl) {
    redirect(profileResult.redirectUrl);
  }

  if (!profileResult.user || !profileResult.parsedInterest || !profileResult.email) {
    redirect("/user/profile-setup");
  }

  const isSharedAdMode = Boolean(sharedAdId || isUnavailableStatus);
  const tabCookie = cookieStore.get("paayh_active_tab")?.value as TabKey | undefined;
  const requestedView = (isSharedAdMode ? "feed" : (rawView || tabCookie || "feed")) as TabKey;

  let resolvedSharedAdId: string | null = sharedAdId;
  let resolvedSharedAdUnavailable = Boolean(isUnavailableStatus);
  let resolvedSharedAd: any = null;
  let resolvedSharedAdProfiles: Record<string, any> = {};

  if (sharedAdId && !isUnavailableStatus) {
    const sharedResult = await resolveSharedAdForFeed({
      sharedAdId,
      offset: 0,
      pageAds: [],
      profilesMap: {},
    });
    if (sharedResult.sharedAdUnavailable || sharedResult.pageAds.length === 0) {
      resolvedSharedAdId = null;
      resolvedSharedAdUnavailable = true;
    } else {
      const rawAd = sharedResult.pageAds[0];
      const servedAt = Date.now();
      const isPlatformPost = Boolean(
        rawAd.is_admin_post ||
          isAdminEmail(rawAd.user_email || (rawAd as any).email) ||
          !rawAd.cost_per_impression ||
          Number(rawAd.cost_per_impression) <= 0 ||
          !rawAd.impressions ||
          Number(rawAd.impressions) <= 0
      );
      const token = signAdImpressionToken(String(rawAd.id), email, servedAt);
      resolvedSharedAdId = String(rawAd.id);
      resolvedSharedAd = {
        ...rawAd,
        ad_media: transformMediaUrlsToCdn(rawAd.ad_media, "https://paayh.com"),
        is_admin_post: isPlatformPost,
        cost_per_impression: isPlatformPost ? 0 : Number(rawAd.cost_per_impression || 0),
        impressions: isPlatformPost ? 0 : Number(rawAd.impressions || 0),
        _token: token,
        _served_at: servedAt,
        verification_token: token,
        served_at: servedAt,
      };
      resolvedSharedAdProfiles = sharedResult.profilesMap || {};
    }
  }

  const clicks = Number(profileResult.user.monetization_clicks) || 0;
  const initialAtwTier = profileResult.user.atw_tier || "ATW1";
  const isExemptAccount = isAdmin || Boolean(profileResult.user.is_career || profileResult.user.is_affiliate);
  const initialHasCancelled = Boolean(profileResult.user.has_cancelled_monetization);
  const initialMonetized = Boolean(
    !initialHasCancelled &&
    (isExemptAccount || clicks >= 500)
  );

  return (
    <LoggedInClientContainer 
      session={session} 
      initialMonetized={initialMonetized}
      initialHasCancelled={initialHasCancelled}
      initialClicks={clicks}
      initialAtwTier={initialAtwTier}
      initialTab={requestedView}
      user={profileResult.user}
      parsedInterest={profileResult.parsedInterest}
      email={profileResult.email}
      initialAds={isSharedAdMode ? undefined : profileResult.initialAds}
      initialProfiles={isSharedAdMode ? {} : profileResult.initialProfiles}
      initialHighlights={isSharedAdMode ? [] : profileResult.initialHighlights}
      initialSharedAdId={resolvedSharedAdId}
      initialSharedAdUnavailable={resolvedSharedAdUnavailable}
      initialSharedAd={resolvedSharedAd}
      initialSharedAdProfiles={resolvedSharedAdProfiles}
    />
  );
}
