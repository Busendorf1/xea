import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function StatementRoute() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "statement", { path: "/", maxAge: 604800 });
  redirect("/logged-in?view=statement");
}
