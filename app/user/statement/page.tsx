import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function StatementPage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "statement", { path: "/" });
  redirect("/user/logged-in");
}
