import Footer from "@/components/Footer/page";
import PolicyPage from "@/components/Policy/page";
import styles from "../join/page.module.css";
import Header from "@/components/Headerhome/page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Paayh",
  description: "Paayh Privacy Policy detailing data collection, device telemetry disclosures, Sign in with Apple, and member rights.",
};

export default function Home() {
  return (
    <div className={styles.page}>
      <Header />
      <PolicyPage />
      <Footer />
    </div>
  );
}
