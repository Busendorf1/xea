import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import FrontText from "@/components/FrontText/page";
import Header from "@/components/Headerhome/page";
import styles from "@/app/page.module.css";

export const dynamic = "force-dynamic";

export default async function ModalPage() {
  const session = await auth0.getSession();
  if (session?.user?.email) {
    redirect("/logged-in?view=feed");
  }

  return (
    <div className={styles.page}>
      <Header />
      <FrontText />
    </div>
  );
}
