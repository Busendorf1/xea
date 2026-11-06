"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import styles from "@/app/faq/page.module.css";

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqs: FaqItem[] = [
  {
    question: "What is Paayh and how does it work?",
    answer:
      "Paayh is an attention exchange and digital content platform that rewards users with promotional incentive rewards in exchange for genuine human attention. Advertisers achieve an industry leading target deliverability of up to 99.99% to real active users, and monetized users can earn a dynamic share ranging up to 50% of net advertising revenue generated from confirmed human impressions."
  },
  {
    question: "Can I post both Ads and Highlights?",
    answer:
      "Yes. Users and businesses can post standard Adverts, Highlights, or both. Highlights are short flash promotions that appear every 10 minutes and are automatically removed after 24 hours. They are ideal for flash sales, quick updates, or time sensitive visibility."
  },
  {
    question: "How does bidding for attention work?",
    answer:
      "Promoters and advertisers can submit competitive bids for attention to prioritize their campaigns, reach targeted audiences faster, and bypass queue wait times. For listeners, campaigns with higher bids pay out proportionately higher cash rewards directly into their Paayh wallet upon completing the 16 second focus countdown and clicking the Earn button."
  },
  {
    question: "How do I become monetized?",
    answer:
      "Monetization is completely free, with no subscriptions, fees, or charges. To qualify, your account must demonstrate clear and consistent activity, or you must accumulate at least 300 verified interactions (\"Seen\" or \"Mutual\"). Once you meet either condition, you become eligible to start earning."
  },
  {
    question: "How does ad viewing and impression tracking work?",
    answer:
      "When you view an ad card, scroll past it in your feed, or click \"Seen,\" \"Earn,\" or \"Mutual,\" that counts as a verified impression confirming the promotion was successfully served to a real person. After the impression is recorded, the ad is cleared from your active feed. Each ad is only shown to you once per campaign, unless you are retargeted."
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
      "If you do not use Paayh for 7 consecutive days, your monetization status is automatically revoked and click progress resets (you can requalify at any time, and your existing wallet balance remains untouched). However, if an account remains completely dormant with zero login or activity for 60 consecutive days, all unclaimed incentive balances, including accumulated Follower and Agent earnings, are permanently forfeited to the platform to cover ledger maintenance."
  },
  {
    question: "When can I withdraw my earnings?",
    answer:
      "You can withdraw your earnings once your balance meets the minimum withdrawal threshold of ₦10,000 (or localized equivalent). You may withdraw any amount from ₦10,000 up to your full available balance (including withdrawing 100% of incentives down to ₦0.00), leaving any remainder in your wallet for future payouts. Withdrawals are authenticated via your verified registered phone number, and Paayh does not lock you to a single static bank account."
  },
  {
    question: "Why should I withdraw my earnings promptly and what is the ATW ceiling?",
    answer:
      "Paayh is an advertising and attention exchange, not a bank or savings vault. To safeguard users from unforeseen technical issues or ledger anomalies, we strongly advise users to maintain minimal balances and withdraw promptly once reaching ₦10,000. Furthermore, wallets are governed by ATW tier holding caps (up to ₦90,000 at ATW3). Any earnings generated while at your tier ceiling are voluntarily surrendered to platform liquidity and do not accumulate until you withdraw."
  },
  {
    question: "Can I get a refund on advertising campaigns or deposited funds?",
    answer:
      "No. In strict compliance with Nigerian Anti Money Laundering regulations (Money Laundering (Prevention and Prohibition) Act 2022) and to prevent financial fraud, all payments for campaigns and Highlights represent consumable infrastructure fees and are strictly non refundable under any circumstance. Users are encouraged to test campaigns with modest budgets."
  },
  {
    question: "How does the Followers, Invites & Agent program work, and is anything deducted from my earnings?",
    answer:
      "The program is a voluntary follower reward sharing system designed to maximize user earnings. When you become an Agent for free and share your invite link, people who join through your link appear in your Followers list under Invites, and you appear in their Following tab. Once a follower is monetized, 1% of their promotional earnings is deducted and credited to the Agent who invited them (leaving 99% to the follower). If that follower also becomes an Agent, which allows them to invite others and earn from their own followers too, the deduction for the Agent who brought them becomes 2% (marked with an asterisk * beside their earnings, e.g., ₦0.00*). Participation is completely voluntary: if you do not want 1% or 2% deducted for the person who invited you, you can request to Unfollow them (with their permission) or click Opt Out to immediately disconnect, though opting out removes both your referrer and any followers you invited. As long as you remain active and do not violate our platform rules or 7 day or 60 day inactivity policy, your followers' earnings will continue filling your wallet automatically."
  },
  {
    question: "How old do I have to be to use Paayh?",
    answer:
      "You must be at least 18 years old to create an account and use Paayh."
  },
  {
    question: "Where can I learn more about privacy, terms, and security?",
    answer:
      "Your data is safe with Paayh. We never sell or misuse personal information. You can review our full Terms of Service at /terms and our Privacy Policy at /privacy."
  }
];

export default function FaqAccordion({ faqs: items = faqs }: { faqs?: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className={styles.faqList}>
      {items.map((item, index) => (
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
  );
}
