import { redirect } from "next/navigation";

export default async function MonetizePage() {
  redirect("/user/logged-in?view=monetize");
}
