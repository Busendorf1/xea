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
      "Paayh is a platform that rewards users with a share of ad revenue in exchange for genuine attention. Advertisers receive 99.99% ad deliverability, and users earn 60% of the revenue generated from each verified ad impression."
  },
  {
    question: "Can I post both Ads and Highlights?",
    answer:
      "Yes. Users and businesses can post standard Adverts, Highlights, or both. Highlights are short flash promotions that appear every 10 minutes and are automatically removed after 24 hours. They are ideal for flash sales, quick updates, or time-sensitive visibility."
  },
  {
    question: "How do I become monetized?",
    answer:
      "Monetization is completely free, with no subscriptions, fees, or charges. To qualify, your account must demonstrate clear and consistent activity, or you must accumulate at least 300 verified clicks (\"Seen\" or \"Mutual\"). Once you meet either condition, you become eligible to start earning."
  },
  {
    question: "How does ad viewing and impression tracking work?",
    answer:
      "When you watch an ad and click \"Seen,\" \"Earn,\" or \"Mutual,\" that counts as one impression, confirming the ad was successfully delivered to a real person. After the impression is recorded, the ad is removed from your feed. Each ad is only shown to you once per campaign, unless  you are retargetted."
  },
  {
    question: "Do I have to watch ads?",
    answer:
      "No, watching ads is not mandatory. However, clicking \"Seen,\" \"Earn,\" or \"Mutual\" is how you generate income and how advertisers confirm delivery. Even if you are not interested in earning, we encourage clicking \"Seen\" so the ad registers as delivered and is cleared from your feed."
  },
  {
    question: "What is the Earn button?",
    answer:
      "The Earn button is only visible to monetized users. If you are not yet monetized, you will only see the \"Seen\" and \"Mutual\" buttons on each ad card."
  },
  {
    question: "What happens to inactive accounts?",
    answer:
      "If you do not use Paayh for 7 consecutive days, your monetization status will be revoked and you will need to re-qualify. Ads are always redirected to active users, even while you are offline, to ensure advertisers receive their guaranteed delivery."
  },
  {
    question: "When can I withdraw my earnings?",
    answer:
      "You can withdraw your earnings at any time, provided your balance meets the minimum withdrawal amount of ₦30,000. Upon withdrawal, your balance resets to ₦0 and earnings begin accumulating again from zero. You must have active monetization status to request a withdrawal."
  },
  {
    question: "Is referral allowed?",
    answer:
      "Yes, you are welcome to invite others to join Paayh. However, there are currently no referral bonuses or incentives attached to this feature."
  },
  {
    question: "How old do I have to be to use Paayh?",
    answer:
      "You must be at least 18 years old to create an account and use Paayh."
  },
  {
    question: "Where can I learn more about privacy and security?",
    answer:
      "Your data is safe with Paayh. We never sell or misuse personal information. You can learn more on our Privacy Policy page."
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
