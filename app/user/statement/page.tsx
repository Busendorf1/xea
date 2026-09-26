import { redirect } from "next/navigation";

export default function StatementPage() {
  redirect("/logged-in?view=statement");
}
