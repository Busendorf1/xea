import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function MyAdsPage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "myads", { path: "/" });
  redirect("/user/logged-in");
}
