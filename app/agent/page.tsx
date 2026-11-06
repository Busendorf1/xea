import { redirect } from "next/navigation";

export default function AgentRoute() {
  redirect("/logged-in?view=agent");
}
