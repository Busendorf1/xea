import Footer from "@/components/Footer/page";
import CookiesPage from "@/components/Cookies/page";
import styles from "../join/page.module.css";
import Header from "@/components/Headerhome/page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy | Paayh",
  description: "Learn how Paayh uses cookies and browser storage technologies to provide and secure our services.",
};

export default function Cookies() {
  return (
    <div className={styles.page}>
      <Header />
      <CookiesPage />
      <Footer />
    </div>
  );
}
