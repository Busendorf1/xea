import { redirect } from "next/navigation";

export default async function ProfilePage() {
  redirect("/user/logged-in?view=profile");
}
