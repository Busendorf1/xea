import { redirect } from "next/navigation";

export default function AdPageRoute() {
  redirect("/logged-in?view=adPage");
}
