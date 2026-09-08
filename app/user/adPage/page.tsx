import { redirect } from "next/navigation";

export default async function AdPage(props: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const params = await props.searchParams;
  const id = params?.id;
  if (id) {
    redirect(`/user/logged-in?view=adPage&id=${encodeURIComponent(id)}`);
  }
  redirect("/user/logged-in?view=adPage");
}
