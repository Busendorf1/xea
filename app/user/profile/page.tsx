import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "profile", { path: "/" });
  redirect("/user/logged-in");
}
