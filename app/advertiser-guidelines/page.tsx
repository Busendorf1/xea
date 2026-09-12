import Footer from "@/components/Footer/page";
import AdvertiserGuidelinesPage from "@/components/AdvertiserGuidelines/page";
import styles from "../join/page.module.css";
import Header from "@/components/Headerhome/page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertising & Content Guidelines | Paayh",
  description: "Review Paayh commercial advertising standards, ARCON compliance, prohibited categories, and non-refund policies.",
};

export default function AdvertiserGuidelines() {
  return (
    <div className={styles.page}>
      <Header />
      <AdvertiserGuidelinesPage />
      <Footer />
    </div>
  );
}
