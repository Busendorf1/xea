import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function NewsPage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "news", { path: "/" });
  redirect("/user/logged-in");
}
