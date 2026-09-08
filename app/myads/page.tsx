import { redirect } from "next/navigation";

export default async function RootMyAdsPage() {
  redirect("/user/logged-in?view=myads");
}

