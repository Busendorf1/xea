import { redirect } from "next/navigation";

export default function StatementRoute() {
  redirect("/logged-in?view=statement");
}
