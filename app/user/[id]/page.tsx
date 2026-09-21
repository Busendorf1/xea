import { redirect } from "next/navigation";

export default async function UserPage() {
  redirect("/logged-in");
}
