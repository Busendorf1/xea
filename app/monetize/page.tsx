import { redirect } from "next/navigation";

export default async function MonetizeRoutePage() {
  redirect("/user/logged-in?view=monetize");
}
