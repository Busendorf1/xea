import { redirect } from "next/navigation";

export default async function AdPage(props: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const params = await props.searchParams;
  const id = params?.id;
  const target = id ? `/logged-in?view=adPage&id=${id}` : "/logged-in?view=adPage";
  redirect(target);
}
