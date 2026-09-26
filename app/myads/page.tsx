import { redirect } from "next/navigation";

export default function RootMyAdsPage() {
  redirect("/logged-in?view=myads");
}
