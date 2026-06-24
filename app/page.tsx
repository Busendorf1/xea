import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import FrontText from "@/components/FrontText/page";
import Header from "@/components/Header/page";
import styles from "./page.module.css";

export default async function Home() {
  const session = await auth0.getSession();

  if (session?.user) {
    redirect("/user/dashboard");
  }

  return (
    <div className={styles.page}>
      <Header />
      <FrontText />
    </div>
  );
}

