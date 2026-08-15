import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function MonetizePage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "monetize", { path: "/" });
  redirect("/user/logged-in");
}
