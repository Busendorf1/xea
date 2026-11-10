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
      "Paayh is an attention and content discovery platform where viewing content is voluntary, for fun, entertainment, and product discovery. Claiming rewards is completely voluntary: members who choose to provide verified human focus receive decent promotional rewards you won’t wanna miss, while users who prefer not to earn can freely explore content purely for discovery. Sponsoring content is voluntary, requiring standard service charges for queue placement. Advertisers achieve high target deliverability to real active users, knowing their budget directly rewards audience attention."
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
    question: "Do I have to claim rewards or watch ads?",
    answer:
      "No. Both viewing content and claiming rewards are 100% voluntary. You can freely browse and enjoy content purely for discovery, entertainment, and community updates without claiming rewards or participating in monetization. If you choose to earn, you can voluntarily complete the verified focus countdown to claim rewards funded from the advertiser's campaign budget. Clicking \"Seen\" simply clears the ad from your feed."
  },
  {
    question: "Can I cancel or opt out of monetization, and what happens if I do?",
    answer:
      "Yes, monetization is 100% voluntary and you can cancel or opt out at any time from your Monetization settings dashboard. When you cancel, your account switches to browsing-only mode: you can continue discovering and enjoying feed content without restriction, and your existing wallet balance is completely preserved for withdrawal. Your feed \"Seen\" interaction count will continue to increment normally as you browse, but you will NOT be automatically re-monetized upon reaching 300 seens. If you ever wish to earn rewards again, simply return to the Monetization dashboard, click \"Reapply for Monetization\", and complete 300 fresh verified seen interactions."
  },
  {
    question: "What is the Earn button and how are attention rewards calculated?",
    answer:
      "The Earn+ button is available exclusively to monetized users, and your revenue share is determined by a transparent two-stage countdown system:\n\n1. The First Countdown (Baseline 30%): When you view a sponsored campaign, an initial 16-second human verification focus countdown begins. Completing this first 16 seconds and finishing the verification challenge unlocks the action buttons and establishes your qualification for the baseline 30% revenue share of the ad budget.\n\n2. The Second Countdown (Determines Earning Up to 50%): As soon as the buttons unlock, a second countdown timer appears right beside the Earn+ button, counting down from 16 seconds to 0 seconds. This second countdown timer is what directly measures and determines your qualification to earn up to the maximum 50% revenue share:\n- On the ad card, only the clean numerical seconds (counting down from 16s down to 0s) are displayed; percentages are not displayed on the ad card.\n- If you tap \"Earn+\" while this second countdown is running, the timer cancels immediately, and the seconds spent during this second countdown are used to calculate your earning (prorated between 30% and 50%).\n- If you let this second countdown run all the way to 0s (spending double the baseline time, or 32 seconds total focus on the ad), you qualify for the maximum 50% revenue share."
  },
  {
    question: "What happens to inactive accounts?",
    answer:
      "If you do not use Paayh for 7 consecutive days, your monetization status is automatically revoked and click progress resets (you can requalify at any time, and your existing wallet balance remains untouched). However, if an account remains completely dormant with zero login or activity for 60 consecutive days, all unclaimed incentive balances, including accumulated Follower and Agent earnings, are permanently forfeited to the platform to cover ledger maintenance."
  },
  {
    question: "When can I withdraw my earnings?",
    answer:
      "You can withdraw your earnings once your balance meets the minimum withdrawal threshold of ₦10,000 [approx. $6.67 USD] (or localized equivalent). You may withdraw any amount from ₦10,000 [approx. $6.67 USD] up to your full available balance, leaving any remainder in your wallet for future payouts. Disbursements are cleared in Nigerian Naira (₦ NGN) via licensed Nigerian banking rails (Paystack/Korapay). Global members viewing estimated balances in US Dollars ($ USD, reference rate $1.00 USD = ₦1,500 NGN) will receive their payouts to a verified Nigerian bank account (NUBAN). If any banking error or settlement anomaly occurs, please verify your details or try using a valid Nigerian bank account. There are zero account maintenance fees, and withdrawals are authenticated via your verified registered phone number."
  },
  {
    question: "Why should I withdraw my earnings promptly and what is the ATW ceiling?",
    answer:
      "Paayh is an advertising and attention exchange, not a bank or savings vault. To safeguard users from unforeseen technical issues or ledger anomalies, we strongly advise users to maintain minimal balances and withdraw promptly once reaching ₦10,000 [approx. $6.67 USD]. Furthermore, wallets are governed by ATW tier holding caps (up to ₦90,000 [approx. $60 USD] at ATW3). Any earnings generated while at your tier ceiling are voluntarily surrendered to platform liquidity and do not accumulate until you withdraw."
  },
  {
    question: "Can I get a refund on advertising campaigns or deposited funds?",
    answer:
      "No. In strict compliance with Nigerian Anti Money Laundering regulations (Money Laundering (Prevention and Prohibition) Act 2022) and to prevent financial fraud, all payments for campaigns and Highlights represent consumable infrastructure fees and are strictly non refundable under any circumstance. Users are encouraged to test campaigns with modest budgets."
  },
  {
    question: "How does the Followers, Invites & Agent program work, and is anything deducted from my earnings?",
    answer:
      "The program is a voluntary single-tier direct referral reward sharing system. A \"referral\" strictly and exclusively means when you use your personal invite link to invite a personal friend, family member, or trusted member of your close social circle to join the Paayh platform directly, and never applies to any other external platform or application. When you share your invite link, people who join directly through your link become your Followers. Once a follower is monetized, 1% of their promotional earnings is credited to the Agent who directly invited them (leaving 99% to the follower). If that follower also becomes an Agent, the direct referral reward becomes 2% (marked with an asterisk *; this 2% applies strictly and solely to that follower's own direct campaign earnings, and never includes any commissions they earn from their own followers). This applies strictly to single-tier direct referrals; you do not earn from anyone whom your referrals bring (no multi-level or downlines). Participation is completely voluntary: you can Unfollow or Opt Out at any time."
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
    question: "Are Apple Inc. or Google LLC affiliated with or sponsoring Paayh rewards?",
    answer:
      "No. Neither Apple Inc. nor Google LLC (Alphabet Inc.) is a sponsor of, affiliated with, or responsible for administering or maintaining this application, nor are they involved in any manner with the rewards, promotions, campaigns, or payouts offered on Paayh."
  },
  {
    question: "Does Paayh track me across other apps or websites?",
    answer:
      "No. Paayh does not engage in cross-app or cross-site tracking, nor do we sell data to third-party data brokers. If your device operating system displays an Apple App Tracking Transparency (ATT) or Google tracking prompt, granting that permission is voluntary at the OS level and has nothing to do with Paayh. Content targeting on Paayh is strictly first-party: promotions are matched solely from the interest categories, coarse location, and demographic preferences you voluntarily chose during onboarding so you only see what you chose to be interested in. If you enable third-party cross-app tracking for other applications on your device, Paayh is not to be held responsible or legally liable."
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
