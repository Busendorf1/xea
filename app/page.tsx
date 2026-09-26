import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import ModalLandingPage from "@/components/ModalLanding/page";
import DashboardClient from "@/components/DashboardClient/page";
import { getUserProfileForDashboard } from "@/lib/getUserProfileForDashboard";

import { cookies } from "next/headers";

export default async function Home() {
  const session = await auth0.getSession();

  // If user is authenticated, redirect directly to home feed
  if (session?.user?.email) {
    const cookieStore = await cookies();
    cookieStore.set("paayh_active_tab", "feed", { path: "/", maxAge: 604800 });
    redirect("/logged-in?view=feed");
  }

  // Guest users visiting https://paayh.com see the dialogue concierge landing experience
  return <ModalLandingPage />;
}
