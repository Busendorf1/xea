import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdPage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "adPage", { path: "/" });
  redirect("/user/logged-in");
}
