import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import ModalLandingPage from "@/components/ModalLanding/page";

export default async function Home() {
  const session = await auth0.getSession();

  // If user is authenticated, redirect directly to home feed
  if (session?.user?.email) {
    redirect("/logged-in?view=feed");
  }

  // Guest users visiting https://paayh.com see the dialogue concierge landing experience
  return <ModalLandingPage />;
}
