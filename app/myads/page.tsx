import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function RootMyAdsPage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "myads", { path: "/", maxAge: 604800 });
  redirect("/logged-in?view=myads");
}
