import { redirect } from "next/navigation";

export default function DeactivatePage() {
  redirect("/logged-in?view=deactivate");
}
