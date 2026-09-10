import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import FrontText from "@/components/FrontText/page";
import Header from "@/components/Headerhome/page";
import styles from "./page.module.css";
import DashboardClient from "@/components/DashboardClient/page";
import { getUserProfileForDashboard } from "@/lib/getUserProfileForDashboard";

export default async function Home() {
  const session = await auth0.getSession();

  // If user is authenticated, render the production feed directly at root (https://paayh.com/)
  if (session?.user?.email) {
    const profileResult = await getUserProfileForDashboard(session);

    if (profileResult.redirectUrl) {
      redirect(profileResult.redirectUrl);
    }

    if (profileResult.user && profileResult.parsedInterest && profileResult.email) {
      return (
        <DashboardClient
          user={profileResult.user}
          parsedInterest={profileResult.parsedInterest}
          email={profileResult.email}
          initialAds={profileResult.initialAds}
          initialProfiles={profileResult.initialProfiles}
        />
      );
    }
  }

  // Guest users visiting https://paayh.com see the public landing page
  return (
    <div className={styles.page}>
      <Header />
      <FrontText />
    </div>
  );
}
