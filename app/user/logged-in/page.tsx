import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import LoggedInClientContainer, { TabKey } from "./LoggedInClientContainer";

interface PageProps {
  searchParams?: Promise<{ view?: string; id?: string }>;
}

const VALID_TABS = ["adPage", "monetize", "myads", "profile", "statement", "news", "deactivate"];

export default async function LoggedInPage({ searchParams }: PageProps) {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const requestedView = resolvedParams?.view as TabKey | undefined;
  const initialTab: TabKey = (requestedView && VALID_TABS.includes(requestedView)) ? requestedView : "monetize";

  const email = session.user.email.toLowerCase().trim();
  let initialMonetized = true; // Default to true as requested: show monetized first
  let initialClicks = 0;
  let initialAtwTier = "ATW1";

  try {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("monetized, monetization_clicks, referral_downloads_count, atw_tier")
      .ilike("email", email)
      .maybeSingle();

    if (user) {
      const clicks = Number(user.monetization_clicks) || 0;
      const invites = Number(user.referral_downloads_count) || 0;
      initialClicks = clicks;
      initialAtwTier = user.atw_tier || "ATW1";
      initialMonetized = Boolean(
        user.monetized === true ||
        user.monetized === "true" ||
        user.monetized === "yes" ||
        clicks >= 300 ||
        invites >= 12
      );
    }
  } catch (err) {
    console.warn("⚠️ Server-side monetization check warning in LoggedInPage:", err);
  }

  return (
    <LoggedInClientContainer 
      session={session} 
      initialMonetized={initialMonetized}
      initialClicks={initialClicks}
      initialAtwTier={initialAtwTier}
      initialTab={initialTab}
    />
  );
}
