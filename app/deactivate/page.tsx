import { redirect } from "next/navigation";

export default function DeactivateRoute() {
  redirect("/logged-in?view=deactivate");
}
