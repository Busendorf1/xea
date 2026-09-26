import { redirect } from "next/navigation";

export default async function LegacyUserLoggedInPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; id?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const target = resolved?.view 
    ? `/logged-in?view=${resolved.view}${resolved.id ? `&id=${resolved.id}` : ""}` 
    : "/logged-in";
  redirect(target);
}
