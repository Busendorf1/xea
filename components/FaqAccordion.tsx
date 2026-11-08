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
      "Paayh is an attention and content discovery platform where viewing content is voluntary, for fun, entertainment, and product discovery, with members receiving decent promotional rewards you won’t wanna miss for verified human focus. Sponsoring content is voluntary, requiring standard service charges for queue placement. Advertisers achieve high target deliverability to real active users, knowing their budget directly rewards audience attention."
  },
  {
    question: "Can I post both Ads and Highlights?",
    answer:
      "Yes. Users and businesses can post standard Adverts, Highlights, or both. Highlights are short flash promotions that appear every 10 minutes and are automatically removed after 24 hours. They are ideal for flash sales, quick updates, or time sensitive visibility."
  },
  {
    question: "How does bidding for attention work?",
    answer:
      "Promoters and advertisers can submit competitive bids for attention to prioritize their campaigns and reach targeted audiences faster. For viewers, campaigns with higher bids pay out proportionately higher rewards directly into their Paayh wallet upon completing the 16-second focus countdown and clicking the Earn button."
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
      "You can withdraw your earnings once your balance meets the minimum withdrawal threshold of ₦10,000 (or localized equivalent). You may withdraw any amount from ₦10,000 up to your full available balance, leaving any remainder in your wallet for future payouts. There are zero account maintenance fees. When you initiate a withdrawal, standard statutory payment processor interbank transfer fees apply with zero platform markup. Withdrawals are authenticated via your verified registered phone number."
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
      "The program is a voluntary single-tier direct referral reward sharing system. When you share your invite link, people who join directly through your link become your Followers. Once a follower is monetized, 1% of their promotional earnings is credited to the Agent who directly invited them (leaving 99% to the follower). If that follower also becomes an Agent, the direct referral reward becomes 2% (marked with an asterisk *). This applies strictly to single-tier direct referrals; you do not earn from anyone whom your referrals bring (no multi-level or downlines). Participation is completely voluntary: you can Unfollow or Opt Out at any time."
  },
  {
    question: "How old do I have to be to use Paayh?",
    answer:
      "You must be at least 18 years old to create an account and use Paayh."
  },
  {
    question: "How does Paayh handle objectionable content or abusive users?",
    answer:
      "Paayh enforces a strict zero-tolerance End User License Agreement (EULA) against objectionable content and abusive users. All promotions undergo automated and human quality filtering before going live. If you encounter any objectionable material, you can click the three dots (...) on any ad card to select 'Block & report Ad' or 'Block & report Advertiser', or choose 'Don't show this Ad again' to remove it from your feed immediately. Our moderation team reviews and acts on reports within 24 hours to remove violating content and permanently eject offending accounts."
  },
  {
    question: "Is Apple Inc. affiliated with or sponsoring Paayh rewards?",
    answer:
      "No. Apple Inc. is not a sponsor of, affiliated with, or responsible for administering or maintaining this application, nor is it involved in any rewards, promotions, or payouts offered on Paayh."
  },
  {
    question: "Can advertisers pay users to download apps or write reviews?",
    answer:
      "No. In strict compliance with mobile platform guidelines, Paayh explicitly prohibits any campaign that incentivizes downloading third-party apps, posting app store ratings or reviews, or attempting to manipulate app store charts. Such campaigns are rejected and violators face immediate account termination."
  },
  {
    question: "Is location mandatory to use Paayh?",
    answer:
      "Location permissions are voluntary and optional to register and hold an account. However, because sponsored offers and community promotions are strictly localized to physical jurisdictions, disabling device location permissions means our system cannot serve matching content to your feed. If location is disabled, your feed will display an 'Enable Location' button so you can activate it whenever you wish to view content."
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
