import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import LoggedInClientContainer, { TabKey } from "@/app/user/logged-in/LoggedInClientContainer";
import { getUserProfileForDashboard } from "@/lib/getUserProfileForDashboard";
import { isAdminEmail } from "@/lib/authHelper";
import { extractSharedAdIdFromSearchParams } from "@/lib/utils/adShare";

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

  const clicks = Number(profileResult.user.monetization_clicks) || 0;
  const initialAtwTier = profileResult.user.atw_tier || "ATW1";
  const isExemptAccount = isAdmin || Boolean(profileResult.user.is_career || profileResult.user.is_affiliate);
  const initialHasCancelled = Boolean(profileResult.user.has_cancelled_monetization);
  const initialMonetized = Boolean(
    !initialHasCancelled &&
    (isExemptAccount || clicks >= 300)
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
    />
  );
}
