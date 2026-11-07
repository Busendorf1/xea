import { redirect } from "next/navigation";

export default function MonetizationPage() {
  redirect("/logged-in?view=monetize");
}
