import { redirect } from "next/navigation";

export default function MonetizeRoutePage() {
  redirect("/logged-in?view=monetize");
}
