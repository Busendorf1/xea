import { redirect } from "next/navigation";

export default async function NewsPage() {
  redirect("/user/logged-in?view=news");
}
