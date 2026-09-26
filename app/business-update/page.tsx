import { redirect } from "next/navigation";

export default function BusinessUpdatePage() {
  redirect("/logged-in?view=news");
}
