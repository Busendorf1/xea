import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdPage(props: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const params = await props.searchParams;
  const id = params?.id;
  const cookieStore = await cookies();
  cookieStore.set("paayh_active_tab", "adPage", { path: "/", maxAge: 60 });
  if (id) {
    cookieStore.set("paayh_edit_ad_id", id, { path: "/", maxAge: 60 });
  }
  redirect("/logged-in");
}
