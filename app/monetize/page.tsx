import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function MonetizeRoutePage() {
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "monetize", { path: "/", maxAge: 604800 });
  redirect("/logged-in?view=monetize");
}
