import { redirect } from "next/navigation";

export default function MyAdsPage() {
  redirect("/logged-in?view=myads");
}
