"use client";

import React from "react";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Xea Policies and Terms of Service</h1>
        <p className={styles.updatedDate}><em>Last Updated: June 22, 2025</em></p>

        <hr className={styles.divider} />

        <section>
          <h2 className={styles.heading}>I. Introduction</h2>
          <p>
            Welcome to Xea, a digital advertising platform designed to fairly connect advertisers with genuine human attention.
            By using our platform, you agree to abide by the policies, conditions, and terms outlined herein.
            These policies apply to all users—advertisers, content viewers, and business partners. The document includes our comprehensive terms of service, platform usage policies, privacy commitments, content rules, and legal protections.
            If you do not agree to these terms, please refrain from using Xea.
          </p>
        </section>

        <section>
          <h2 className={styles.heading}>II. Definitions</h2>
          <ul className={styles.list}>
            <li className={styles.listItem} ><strong>"Xea"</strong>: the digital platform, its legal entity, services, domains, trademarks, and content.</li>
            <li className={styles.listItem}><strong>"Advertiser"</strong>: any individual or organization posting promotional content or campaigns.</li>
            <li className={styles.listItem}><strong>"User"</strong>: anyone registered to view content or interact with services.</li>
            <li className={styles.listItem}><strong>"Highlights"</strong>: flash content displayed every 10 minutes, expiring after 24 hours.</li>
            <li className={styles.listItem}><strong>"Monetization"</strong>: the feature enabling users to earn from ad views.</li>
            <li className={styles.listItem}><strong>"Impression"</strong>: a verified user view that results in a “Seen” click.</li>
          </ul>
        </section>

        <section>
          <h2 className={styles.heading}>III. General Platform Usage</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Xea provides space for advertisers to post ads and for users to interact with them.</li>
            <li className={styles.listItem}>Users agree not to exploit or manipulate impression tracking or monetization mechanisms.</li>
            <li className={styles.listItem}>Advertisements must not contain misleading information, deceptive offers, harmful content, or violate any law.</li>
            <li className={styles.listItem}>Each impression is user-specific. Ads are never shown more than once to the same user per campaign.</li>
            <li className={styles.listItem}>Users are required to click "Seen" to verify genuine viewing of an ad. Failure to comply may result in suspension.</li>
            <li className={styles.listItem}>All ads appear on a clean slate and are not embedded within unrelated content.</li>
            <li className={styles.listItem}>Users agree not to use automation, bots, or spoofing tools on Xea.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>IV. Eligibility and Account Management</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Users must be at least 16 years old or the legal age of majority in their jurisdiction.</li>
            <li className={styles.listItem}>Monetization eligibility requires 30 days of active participation on the platform.</li>
            <li className={styles.listItem}>Inactivity exceeding 48 hours results in automatic account suspension. Suspended accounts may lose monetization privileges.</li>
            <li className={styles.listItem}>Referral is permitted, but no financial or reward-based incentive is attached at this time.</li>
            <li className={styles.listItem}>Upon monetization, user earnings are reset to zero for accurate tracking.</li>

          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>V. Advertiser Terms</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Advertisers are guaranteed 100% ad deliverability to active, verified users.</li>
            <li className={styles.listItem}>Each ad must promote a legitimate product, service, or cause.</li>
            <li className={styles.listItem}>Content must be honest, respectful, and compliant with laws.</li>
            <li className={styles.listItem}>Banned content includes:
              <ul className={styles.list}>
                <li className={styles.listItem}>False endorsements</li>
                <li className={styles.listItem}>Counterfeit goods</li>
                <li className={styles.listItem}>Adult or explicit material</li>
                <li className={styles.listItem}>Weapons and related paraphernalia</li>
                <li className={styles.listItem}>Gambling solicitations (unless permitted by law)</li>
              </ul>
            </li>
            <li className={styles.listItem}>Ad creatives must be optimized for attention, engagement, and compliance.</li>
            <li className={styles.listItem}>Advertisers agree to honor all offers or claims made in ads.</li>
            <li className={styles.listItem}>Misleading ads will be removed and may result in legal action.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>VI. Monetization and Payouts</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Monetization is free. No subscription or payment is required to earn.</li>
            <li className={styles.listItem}>Users earn 40% of ad revenue per valid impression.</li>
            <li className={styles.listItem}>No minimum withdrawal threshold. Withdrawals are allowed anytime.</li>
            <li className={styles.listItem}>Earnings are transparently processed and tracked.</li>
            <li className={styles.listItem}>Attempts to manipulate the system will result in bans and forfeited funds.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>VII. Privacy and Data Security</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Xea does <strong>not</strong> sell, trade, or exploit user data.</li>
            <li className={styles.listItem}>Data is used only for operations, analytics, and service improvements.</li>
            <li className={styles.listItem}>Behavioral and interest-based data match users with relevant ads.</li>
            <li className={styles.listItem}>See our <a href="/privacy">Privacy Policy</a> for full details.</li>
            <li className={styles.listItem}>Users can request data audits or deletion anytime.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>VIII. Cookies and Tracking</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>We use cookies to:
              <ul className={styles.list}>
                <li className={styles.listItem}>Maintain session security</li>
                <li className={styles.listItem}>Track ad impressions</li>
                <li className={styles.listItem}>Customize content and ads</li>
              </ul>
            </li>
            <li className={styles.listItem}>You may disable cookies, but it may affect functionality.</li>
            <li className={styles.listItem}>Cookies do not store personal identifiable information (PII).</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>IX. Infringement and Intellectual Property</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Users must respect copyright and intellectual property laws.</li>
            <li className={styles.listItem}>Only original or licensed content may be uploaded.</li>
            <li className={styles.listItem}>Reported infringements will be investigated and may lead to takedown.</li>
            <li className={styles.listItem}>Xea reserves the right to suspend violators.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>X. Abuse, Fraud, and Platform Integrity</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Fraud includes:
              <ul className={styles.list}>
                <li className={styles.listItem}>Click farming</li>
                <li className={styles.listItem}>Automated ad viewing</li>
                <li className={styles.listItem}>Multiple account abuse</li>
                <li className={styles.listItem}>Fake testimonials</li>
              </ul>
            </li>
            <li className={styles.listItem}>Xea uses AI and moderators to detect abuse.</li>
            <li className={styles.listItem}>Violators will be banned and may face legal consequences.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XI. Suspension and Termination</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Accounts may be suspended for policy violations, inactivity, or fraud.</li>
            <li className={styles.listItem}>Users may appeal suspensions via the Help Center.</li>
            <li className={styles.listItem}>Terminated accounts forfeit any pending earnings.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XII. Limitation of Liability</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Xea is not liable for:
              <ul className={styles.list}>
                <li className={styles.listItem}>Loss of earnings due to technical issues</li>
                <li className={styles.listItem}>Suspension from inactivity</li>
                <li className={styles.listItem}>Third-party payment failures</li>
                <li className={styles.listItem}>Advertiser misconduct</li>
              </ul>
            </li>
            <li className={styles.listItem}>Our total liability is limited to a user’s last 30 days of verified earnings.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XIII. Dispute Resolution</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>All disputes must first be reported to Xea’s support team.</li>
            <li className={styles.listItem}>Unresolved disputes within 30 days may proceed to arbitration.</li>
            <li className={styles.listItem}>The governing law is that of the Federal Republic of Nigeria, or where Xea operates officially.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XIV. Changes to These Terms</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Xea may update these policies at any time.</li>
            <li className={styles.listItem}>We will notify users of material changes.</li>
            <li className={styles.listItem}>Continued use implies acceptance of new terms.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XV. Contact</h2>
          <p>
            For questions or clarifications, please visit our <a href="/help">Help Center</a>.
          </p>
          <p className={styles.acknowledgment}>
            <strong>By using Xea, you acknowledge that you have read, understood, and agree to be bound by these policies and terms.</strong>
          </p>
        </section>
      </main>
    </div>
  );
}
