"use client";

import { useState } from "react";
import styles from "../faq/page.module.css";
import { AnimatePresence, motion } from "framer-motion";
import HeaderJoin from "@/components/HeaderJoin/page";
import Footer from "@/components/Footer/page";

const faqs = [
  {
    question: "What is Paayh and how does it work?",
    answer:
      "Paayh is a platform that rewards users with a share of ad revenue in exchange for their genuine attention. Advertisers receive 100% ad deliverability, and users are paid for viewing ads aligned with their interests."
  },
  {
    question: "Can I post both Ads and Highlights?",
    answer:
      "Yes, users and businesses can post standard Adverts and/or Highlights. Highlights appear every 10 minutes and are automatically deleted after 24 hours. They’re great for flash sales, quick updates, or timely visibility."
  },
  {
    question: "How long before I’m eligible for monetization?",
    answer:
      "To ensure trust and platform integrity, accounts must have 30 days of consistent activity before monetization eligibility."
  },
  {
    question: "How does ad viewing and impression tracking work?",
    answer:
      "When a user clicks 'Seen' after watching an ad, it counts as an impression and that ad disappears for that user. Each ad is shown only once per user per campaign."
  },
  {
    question: "Is monetization free?",
    answer:
      "Yes. Monetization is 100% free. There are no subscriptions, hidden fees, or premium charges."
  },
  {
    question: "What happens to inactive accounts?",
    answer:
      "Accounts inactive for more than 48 hours are suspended and their ad slots are redirected to active users to preserve deliverability guarantees."
  },
  {
    question: "When can I withdraw my earnings?",
    answer:
      "You can withdraw your earnings anytime, no minimum balance required."
  },
  {
    question: "Why is my balance reset when monetization starts?",
    answer:
      "Balances reset to ₦0 when monetization begins to accurately track earnings post-eligibility."
  },
  {
    question: "Do I need to interact with ads to earn?",
    answer:
      "Yes. All users must watch the ad and then click 'Seen' for it to count. Skipping or ignoring ads won't generate revenue."
  },
  {
    question: "Is referral allowed?",
    answer:
      "Yes, you can refer others to join. However, we currently do not offer referral incentives."
  },

  {
    question: "Where can I learn more about privacy and security?",
    answer:
      "Your data is safe with Paayh. We never sell or misuse user data. Learn more on our Privacy Policy page."
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <>
    <HeaderJoin />
    <div className={styles.container}>
      <h1 className={styles.title}>Frequently Asked Questions</h1>
      <div className={styles.faqList}>
        {faqs.map((item, index) => (
          <div key={index} className={styles.faqItem}>
            <button className={styles.question} onClick={() => toggle(index)}>
              {item.question}
              <span className={styles.icon}>{openIndex === index ? "−" : "+"}</span>
            </button>
            <AnimatePresence initial={false}>
              {openIndex === index && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className={styles.answer}
                >
                  {item.answer}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
    <Footer />
    </>
  );
}
