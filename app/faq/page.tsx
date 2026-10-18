import type { Metadata } from "next";
import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";
import FaqAccordion, { faqs } from "@/components/FaqAccordion";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Frequently Asked Questions | Paayh",
  description: "Find answers to frequently asked questions about Paayh attention exchange, advertising deliverability, campaigns, and monetization.",
};

export default function FAQPage() {
  return (
    <>
      <HeaderJoin />
      <div className={styles.container}>
        <h1 className={styles.title}>Frequently Asked Questions</h1>
        <FaqAccordion faqs={faqs} />
      </div>
      <Footer />
    </>
  );
}
