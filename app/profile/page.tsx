import { redirect } from "next/navigation";

export default function ProfileRoute() {
  redirect("/logged-in?view=profile");
}
