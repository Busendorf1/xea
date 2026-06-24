import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Monetize from "@/components/Monetize/page";
import Header from "@/components/Header/page";

export default async function MonetizePage() {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  return (
    <div>
      <Header />
      <br />
      <br />
      <br />
      <Monetize session={session} />
    </div>
  );
}
