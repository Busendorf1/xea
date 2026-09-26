import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import LoggedInClientContainer, { TabKey } from "@/app/user/logged-in/LoggedInClientContainer";
import DashboardClient from "@/components/DashboardClient/page";
import { getUserProfileForDashboard } from "@/lib/getUserProfileForDashboard";
import { isAdminEmail } from "@/lib/authHelper";

import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ view?: string; id?: string }>;
}

const SETTINGS_TABS = ["adPage", "monetize", "myads", "profile", "statement", "news", "deactivate"];

export default async function LoggedInPage({ searchParams }: PageProps) {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  const email = session.user.email.toLowerCase().trim();
  const isAdmin = isAdminEmail(email);
  (session.user as any).isAdmin = isAdmin;

  let profileResult;
  try {
    profileResult = await getUserProfileForDashboard(session);
  } catch (err: any) {
    console.error("❌ [LoggedInPage] Failed to fetch profile:", err?.message || err);
    redirect("/user/profile-setup");
  }

  if (profileResult.redirectUrl) {
    redirect(profileResult.redirectUrl);
  }

  if (!profileResult.user || !profileResult.parsedInterest || !profileResult.email) {
    redirect("/");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const tabCookie = cookieStore.get("paayh_active_tab")?.value as TabKey | undefined;
  const requestedView = (resolvedParams?.view || tabCookie || "feed") as TabKey;

  const clicks = Number(profileResult.user.monetization_clicks) || 0;
  const invites = Number(profileResult.user.referral_downloads_count) || 0;
  const initialAtwTier = profileResult.user.atw_tier || "ATW1";
  const initialMonetized = Boolean(
    profileResult.user.monetized === true ||
    profileResult.user.monetized === "true" ||
    profileResult.user.monetized === "yes" ||
    clicks >= 300 ||
    invites >= 12
  );

  return (
    <LoggedInClientContainer 
      session={session} 
      initialMonetized={initialMonetized}
      initialClicks={clicks}
      initialAtwTier={initialAtwTier}
      initialTab={requestedView}
      user={profileResult.user}
      parsedInterest={profileResult.parsedInterest}
      email={profileResult.email}
      initialAds={profileResult.initialAds}
      initialProfiles={profileResult.initialProfiles}
    />
  );
}
