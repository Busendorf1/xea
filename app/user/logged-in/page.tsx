import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import LoggedInClientContainer from "./LoggedInClientContainer";

export default async function LoggedInPage() {
  const session = await auth0.getSession();

  if (!session || !session.user?.email) {
    redirect("/");
  }

  return <LoggedInClientContainer session={session} />;
}
