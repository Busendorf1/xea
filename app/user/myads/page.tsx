import { redirect } from "next/navigation";

export default async function MyAdsPage() {
  redirect("/user/logged-in?view=myads");
}
