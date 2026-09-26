import { redirect } from "next/navigation";

export default function NewsPage() {
  redirect("/logged-in?view=news");
}
