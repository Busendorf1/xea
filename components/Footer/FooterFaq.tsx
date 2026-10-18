"use client";

import React, { useState } from "react";
import styles from "./page.module.css";

interface FaqItem {
  question: string;
  answer: string;
}

export default function FooterFaq({ faqs }: { faqs: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
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
  );
}
