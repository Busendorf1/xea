import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient/page";
import { getUserProfileForDashboard } from "@/lib/getUserProfileForDashboard";

export default async function UserPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params?.id;

  // Legacy /user/dashboard seamlessly redirects to the clean production root (https://paayh.com/)
  if (!id || id === "dashboard") {
    redirect("/");
  }

  const session = await auth0.getSession();
  if (!session || !session.user) {
    redirect("/");
  }

  const profileResult = await getUserProfileForDashboard(session);

  if (profileResult.redirectUrl) {
    redirect(profileResult.redirectUrl);
  }

  if (!profileResult.user || !profileResult.parsedInterest || !profileResult.email) {
    redirect("/");
  }

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
