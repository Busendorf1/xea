import { redirect } from "next/navigation";

export default function MonetizedRoutePage() {
  redirect("/logged-in?view=monetize");
}
