import { redirect } from "next/navigation";

export default function LogoutRoute() {
  redirect("/user/logout");
}
