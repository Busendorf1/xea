import { redirect } from "next/navigation";

export default async function DeactivatePage() {
  redirect("/user/logged-in?view=deactivate");
}
