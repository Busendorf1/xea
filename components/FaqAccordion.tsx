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
      "Paayh is an attention and content discovery platform where viewing content is voluntary, for fun, entertainment, and product discovery. Claiming rewards is completely voluntary: members who choose to provide verified human focus receive decent promotional rewards funded from the advertiser's campaign budget, while users who prefer not to earn can freely explore content purely for discovery. Sponsoring content is voluntary, requiring standard service charges for queue placement."
  },
  {
    question: "Can I post both Ads and Highlights, and how long do Highlights run?",
    answer:
      "Yes. Users and businesses can post standard Adverts, Highlights, or both. Highlights are short flash promotions that rotate periodically in the Highlights rail and support configurable campaign durations from 1 to 90 days, plus optional scheduled start/end times (`scheduled_start_at`, `scheduled_end_at`, and `expires_at`), expiring automatically when their scheduled end or selected campaign duration completes."
  },
  {
    question: "How does bidding for attention work?",
    answer:
      "Promoters and advertisers can submit competitive bids for attention to prioritize their campaigns and reach targeted audiences faster. For viewers, campaigns with higher bids pay out proportionately higher rewards directly into their Paayh wallet upon completing the human verification focus countdown and clicking the Earn+ button."
  },
  {
    question: "How do I become monetized?",
    answer:
      "Monetization is completely free, with no subscriptions, fees, or charges. To qualify, your account must accumulate at least 300 verified interactions (\"Seen\" or \"Mutual\") or meet authorized eligibility criteria. Once monetized, you can start earning attention rewards."
  },
  {
    question: "How does ad viewing and impression tracking work?",
    answer:
      "When you view an ad card, scroll past it in your feed, or click \"Seen,\" \"Earn+,\" or \"Mutual+,\" that counts as a verified impression confirming the promotion was successfully served to a real person. After the impression is recorded, the ad is cleared from your active feed."
  },
  {
    question: "Do I have to claim rewards or watch ads?",
    answer:
      "No. Both viewing content and claiming rewards are 100% voluntary. You can freely browse and enjoy content purely for discovery, entertainment, and community updates without claiming rewards or participating in monetization. Clicking \"Seen\" simply clears the ad from your feed."
  },
  {
    question: "Can I cancel or opt out of monetization, and what happens if I do?",
    answer:
      "Yes, monetization is 100% voluntary and you can cancel or opt out at any time from your Monetization settings dashboard. When you cancel, your account switches to browsing-only mode: you can continue discovering feed content without restriction, and your existing wallet balance is completely preserved for withdrawal. Your feed \"Seen\" interaction count continues to increment normally, and you will NEVER be automatically re-monetized at 300 seens. If you ever wish to earn again, return to Monetization settings, click \"Reapply for Monetization\" (which resets clicks to 0, ATW tier to ATW1, and score to 0.1000), and complete 300 fresh verified interactions."
  },
  {
    question: "What is the Earn+ button and how are attention rewards calculated?",
    answer:
      "The Earn+ button is available exclusively to monetized users, and your revenue share is determined by a two-stage countdown system:\n\n1. First Countdown (Baseline 30%): Completing the initial 16-second human verification countdown and challenge unlocks the action buttons and qualifies you for the baseline 30% revenue share.\n\n2. Second Countdown (Up to 50% Max): Once unlocked, a second 16-second countdown (counting down from 16s to 0s) appears beside Earn+. Tapping Earn+ early calculates a prorated share between 30% and 50%; letting it run to 0s (32 seconds total focus) qualifies for the maximum 50% share."
  },
  {
    question: "What happens to inactive or deleted accounts?",
    answer:
      "If you record zero engagement for 7 consecutive days, your monetization status is revoked and click progress resets to zero (you can requalify anytime, and your wallet balance remains untouched). However, if an account remains completely dormant with zero login or activity for 60 consecutive days, the account is permanently deactivated and any unclaimed wallet balance (including accumulated Follower and Agent earnings) is forfeited to platform liquidity.\n\nIf you choose to permanently delete your account in settings, deletion is irreversible with NO silent reactivation: your profile data, media, follow/mutual graph, and unredeemed balance are purged (withdraw eligible funds first), while settled financial ledgers are pseudonymised for 5 years strictly for Nigerian AML audit compliance."
  },
  {
    question: "When can I withdraw my earnings, what security checks apply, and what are the transfer fees?",
    answer:
      "You can withdraw once your balance reaches the minimum threshold of ₦10,000 [approx. $6.67 USD]. Every withdrawal strictly requires your mandatory 4-digit Wallet PIN (with 5 consecutive incorrect attempts locking PIN verification for 45 minutes) and matching your registered profile phone number.\n\nDisbursements settle in Nigerian Naira (₦ NGN) via Paystack or Korapay (Kora) to a verified Nigerian bank account (NUBAN). Statutory third-party rail fees depend on the processor handling your payout:\n- Paystack: ₦10.75 (<= ₦5,000), ₦26.88 (₦5,001–₦50,000), ₦53.75 (> ₦50,000)\n- Korapay (Kora): ₦15.00 (<= ₦5,000), ₦25.00 (₦5,001–₦50,000), ₦35.00 (> ₦50,000)"
  },
  {
    question: "Why should I withdraw promptly and how do ATW tiers (ATW1–ATW14) and star ratings work?",
    answer:
      "Paayh is an attention exchange, not a bank or savings vault, so we strongly advise withdrawing promptly once reaching ₦10,000 [approx. $6.67 USD]. Wallets are governed by unified Attention Worth Tiers scaling from ATW1 (₦30,000 cap) up to ATW14 (₦420,000 max cap, increasing by ₦30,000 per level). Both verified interactions (300 clicks per level) and verified 1–5 star advertiser ratings (boosting your attention-worth score above baseline 0.1000) advance your ATW tier. Any earnings above your current ATW ceiling are forfeited to platform liquidity until you withdraw."
  },
  {
    question: "Can I get a refund on advertising campaigns or deposited funds?",
    answer:
      "No. In strict compliance with Nigerian Anti-Money Laundering regulations (Money Laundering (Prevention and Prohibition) Act 2022) and to prevent financial fraud, all payments for campaigns and Highlights represent consumable infrastructure fees and are strictly non-refundable under any circumstance. Users are encouraged to test campaigns with modest budgets."
  },
  {
    question: "How does the Followers, Invites & Agent program work?",
    answer:
      "The program is a voluntary single-tier direct-only referral sharing system. A \"referral\" exclusively means inviting someone via your personal link to join Paayh directly. Once an invited follower is monetized and earns positive net campaign credits, 1% of their direct campaign earnings goes to the Agent who directly invited them (or 2% if that follower also activates Agent status, marked with *). The 2% applies strictly to that follower's own direct campaign earnings—never to commissions they earn from their own followers (zero downlines). If an earn is capped to ₦0 by an ATW limit, no commission accrues. You can Unfollow or Opt Out unilaterally at any time."
  },
  {
    question: "How old do I have to be to use Paayh?",
    answer:
      "You must be at least 18 years old to create an account and use Paayh."
  },
  {
    question: "How do the 3-dot ad reporting and blocking buttons work?",
    answer:
      "Every ad card has a three-dot menu (...) with three working controls: 'Block & report Ad', 'Block & report Advertiser', and 'Don't show this Ad again'. Selecting any option submits the block/dismissal to the server, immediately removes that ad (or all ads from that advertiser) from your feed, and lets you add optional review details in the Help Center for 'Block & report' actions. Our compliance team reviews reports within 24 hours."
  },
  {
    question: "Are Apple Inc. or Google LLC affiliated with or sponsoring Paayh rewards?",
    answer:
      "No. Neither Apple Inc. nor Google LLC (Alphabet Inc.) is a sponsor of, affiliated with, or responsible for administering or maintaining this application, nor are they involved in any manner with the rewards, promotions, campaigns, or payouts offered on Paayh."
  },
  {
    question: "Does Paayh track me across other apps or websites?",
    answer:
      "No. Paayh does not engage in cross-app or cross-site tracking, nor do we sell data to third-party data brokers. If your device operating system displays an Apple ATT or Google tracking prompt, that permission applies to other OS-level apps and has nothing to do with Paayh. Content targeting on Paayh is strictly first-party based on your chosen categories, demographic preferences, and coarse location."
  },
  {
    question: "Can advertisers pay users to download apps or write reviews?",
    answer:
      "No. Paayh strictly prohibits any campaign that incentivizes downloading third-party apps, posting app store ratings or reviews, or manipulating app store charts. Violating campaigns are rejected without refund and offending accounts face termination."
  },
  {
    question: "Is location required to use Paayh?",
    answer:
      "Location permissions are optional when browsing account settings, but verified geographic location IS required to match and display localized campaigns in your feed and verify regional payout eligibility. If you skip or disable location, your feed remains empty with an 'Enable Location' prompt until verified."
  },
  {
    question: "Where can I learn more about privacy, terms, and security?",
    answer:
      "You can review our full Terms of Service at /terms and our Privacy Policy at /privacy."
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
