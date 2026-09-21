import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function LegacyUserLoggedInPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; id?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  if (resolved?.view) {
    cookieStore.set("paayh_active_tab", resolved.view, { path: "/", maxAge: 60 });
  }
  if (resolved?.id) {
    cookieStore.set("paayh_edit_ad_id", resolved.id, { path: "/", maxAge: 60 });
  }
  redirect("/logged-in");
}
