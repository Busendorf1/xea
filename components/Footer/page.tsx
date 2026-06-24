"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";

const faqs = [
  {
    question: "Know More About Us",
    answer:
      "Xea is a platform that turns your attention into income. We deliver ads with 100% deliverability & transparency, and you earn for engaging with content you actually care about.",
  },
  {
    question: "What is UBI?",
    answer:
      "UBI (Universal Basic Income) is a consistent income provided to all individuals regardless of status. At Xea, we simulate this by rewarding users for their time and attention.",
  },
  {
    question: "Why Shared Revenue?",
    answer:
      "We believe viewers deserve a share of the advertising revenue their attention generates. It's a fair, human-centered economic model.",
  },
  {
    question: "How Long is Monetization?",
    answer:
      "Once you qualify, monetization begins instantly and continues indefinitely as long as you remain active and follow community guidelines.",
  },
  {
    question: "Who is Eligible?",
    answer:
      "Anyone above the age of 18 with a valid email can use Xea. Monetization becomes available once you meet basic engagement and authenticity checks.",
  },
  {
    question: "Where Services are Available?",
    answer:
      "Xea is accessible globally. Monetization features are rolling out regionally, starting in countries with reliable digital payment systems.",
  },
];

export default function Footer() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        {/* OUR SERVICES */}
        <div className={styles.section}>
          <h4 className={styles.heading}>Our Services</h4>
          <ul className={styles.linkList}>
            <li><Link href="/advert" className={styles.link}>Advert</Link></li>
            <li><Link href="/monetize" className={styles.link}>Monetization</Link></li>
            <li><Link href="/business-update" className={styles.link}>Business Update</Link></li>
            <li><Link href="/market-value" className={styles.link}>Real Time Market Value</Link></li>
          </ul>
        </div>

        {/* FAQ - EXPANDABLE */}
        <div className={styles.section}>
          <h4 className={styles.heading}> <Link href="/faq" className={styles.link}>Frequently Asked Questions</Link></h4>
          <ul className={styles.linkList}>
            {faqs.map((faq, index) => (
              <li key={index} className={styles.faqItem}>
                <button
                  onClick={() => toggleFAQ(index)}
                  className={styles.faqQuestion}
                  aria-expanded={openIndex === index}
                >
                  {faq.question}
                </button>
                {openIndex === index && (
                  <div className={styles.faqAnswer}>
                    {faq.answer}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* POLICIES */}
        <div className={styles.section}>
          <h4 className={styles.heading}>Policies</h4>
          <ul className={styles.linkList}>
            <li><Link href="/privacy" className={styles.link}>Privacy</Link></li>
            <li><Link href="/policy/infringement" className={styles.link}>Infringement</Link></li>
            <li><Link href="/policy/stealing" className={styles.link}>Stealing</Link></li>
            <li><Link href="/policy/misleading-ads" className={styles.link}>Misleading Advert</Link></li>
            <li><Link href="/policy/cookies" className={styles.link}>Cookies</Link></li>
            <li><Link href="/terms" className={styles.link}>Terms of Service</Link></li>
            <li><Link href="/policy/copyright" className={styles.link}>Copyrights</Link></li>
          </ul>
        </div>

        {/* HELP CENTER */}
        <div className={styles.section}>
          <h4 className={styles.heading}><Link href="/help" className={styles.link}>Help Center</Link></h4>
          <ul className={styles.linkList}>
            <li><Link href="/help" className={styles.link}>Contact & Support</Link></li>
            <li><Link href="/help" className={styles.link}>Suspended Account</Link></li>
            <li><Link href="/careers" className={styles.link}>Careers</Link></li>
            <li><Link href="/help" className={styles.link}>Collaboration</Link></li>
            <li><Link href="/help" className={styles.link}>Report Account or Ads</Link></li>
            <li><Link href="/help" className={styles.link}>Request for Information</Link></li>
          </ul>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "10px 0", fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic", opacity: 0.55 }}>
        Made on earth by humans &amp; AI will do a lot but humans will buy.
      </div>

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Xea! All rights reserved.
      </div>
    </footer>
  );
}
