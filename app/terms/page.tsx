import Footer from "@/components/Footer/page";
import TermsPage from "@/components/Terms/page";
import styles from "../join/page.module.css";
import Header from "@/components/Headerhome/page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Paayh",
  description: "Terms of Service governing the use of Paayh attention exchange, advertising, and content platform.",
};

export default function Terms() {
  return (
    <div className={styles.page}>
      <Header />
      <TermsPage />
      <Footer />
    </div>
  );
}
