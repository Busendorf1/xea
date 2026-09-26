import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function NewsRoute() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "news", { path: "/", maxAge: 604800 });
  redirect("/logged-in?view=news");
}
