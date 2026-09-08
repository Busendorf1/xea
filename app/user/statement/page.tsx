import { redirect } from "next/navigation";

export default async function StatementPage() {
  redirect("/user/logged-in?view=statement");
}
