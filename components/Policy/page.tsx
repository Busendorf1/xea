"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Privacy &amp; Data Protection Policy</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: September 12, 2026 | Effective Date: September 12, 2026</em>
        </p>

        <div style={{ backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderLeft: "4px solid var(--primary)", borderRadius: "8px", padding: "1.25rem", color: "var(--foreground)", fontSize: "0.95rem" }}>
          This Privacy Policy explains how Paayh collects, uses, encrypts, and protects your personal data in compliance with the
          <strong> Nigeria Data Protection Act (NDPA 2023)</strong> and global privacy frameworks (including GDPR). For contractual terms governing platform access, content posting, and attention monetization, please review our dedicated{" "}
          <Link href="/terms" style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}>
            Terms of Service
          </Link>.
        </div>

        <hr className={styles.divider} />

        {/* SECTION 1 */}
        <section id="introduction">
          <h2 className={styles.heading}>I. Data Controller &amp; Scope</h2>
          <p>
            Paayh (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates an attention exchange and digital content platform. We are committed to processing your personal data lawfully, transparently, and securely. This policy applies to all registered listeners, creators, businesses, and platform visitors.
          </p>
        </section>

        {/* SECTION 2 */}
        <section id="data-collected">
          <h2 className={styles.heading}>II. Information We Collect</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Authentication Data:</strong> When you sign up or log in via Google OAuth through Auth0, we receive basic identity attributes: your verified email address and display name. Paayh does not import or store your external Google profile photo URL; profile images and business logos are uploaded manually by users directly to their profile settings if they choose. We do not access your Gmail inbox, Google Drive files, calendar, or private Google account data.
            </li>
            <li className={styles.listItem}>
              <strong>Profile &amp; Demographic Preferences:</strong> Voluntary user details including country, state, gender, date of birth / age bracket, and selected interest categories used solely to deliver relevant feed content.
            </li>
            <li className={styles.listItem}>
              <strong>Engagement &amp; Attention Metrics:</strong> Timestamps of verified ad interactions, verification challenge outcomes (swipe, hold, tap), dwell time, and ATW score progression.
            </li>
            <li className={styles.listItem}>
              <strong>Settlement &amp; Payout Information:</strong> When requesting a payout, you submit your registered phone number, settlement bank name, and account number. These details are transmitted via encrypted TLS connections directly to our regulated payment infrastructure partner (Paystack) to process disbursements. Paayh does not permanently store bank account numbers on your user profile record.
            </li>
          </ol>
        </section>

        {/* SECTION 3 */}
        <section id="encryption">
          <h2 className={styles.heading}>III. Advanced Security &amp; Application Layer Encryption</h2>
          <p>
            Paayh implements multi layered data security:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Application Layer Field Encryption:</strong> Highly sensitive personal attributes (including settlement details and security credentials) are encrypted at the application layer prior to storage in database records. In the unlikely event of underlying infrastructure access, stored ciphertext remains mathematically unreadable.
            </li>
            <li className={styles.listItem}>
              <strong>Encrypted Network Transmission:</strong> All data in transit is protected using modern Transport Layer Security (TLS 1.3) protocols.
            </li>
          </ul>
        </section>

        {/* SECTION 4 */}
        <section id="data-use">
          <h2 className={styles.heading}>IV. How We Use Your Data</h2>
          <p>We process personal data strictly for legitimate operational purposes:</p>
          <ol className={styles.list}>
            <li className={styles.listItem}>To authenticate your account session and maintain account security.</li>
            <li className={styles.listItem}>To deliver relevant sponsored content and calculate earned promotional incentive credits.</li>
            <li className={styles.listItem}>To audit transactions for fraud prevention, sybil prevention, and anti money laundering (AML) compliance under Nigerian law.</li>
            <li className={styles.listItem}>To disburse verified settlement payouts through licensed payment processors.</li>
            <li className={styles.listItem}>We do <strong>NOT</strong> sell, rent, or trade your personal information to third party data brokers.</li>
          </ol>
        </section>

        {/* SECTION 5 */}
        <section id="cookies">
          <h2 className={styles.heading}>V. Cookies &amp; Tracking Technologies</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Essential Session Cookies:</strong> We utilize encrypted HTTP only session cookies to authenticate logged in users, prevent cross site request forgery (CSRF), and maintain UI preferences (dark or light theme).
            </li>
            <li className={styles.listItem}>
              <strong>Impression Tracking:</strong> Ephemeral browser tokens are used to prevent duplicate ad deliveries and record single view impression confirmations.
            </li>
            <li className={styles.listItem}>
              <strong>Cookie Control:</strong> You can manage or disable cookies via your browser settings; however, disabling essential session cookies will prevent login and dashboard access.
            </li>
          </ol>
        </section>

        {/* SECTION 6 */}
        <section id="user-rights">
          <h2 className={styles.heading}>VI. User Privacy Rights (NDPA 2023 &amp; GDPR)</h2>
          <p>Under the Nigeria Data Protection Act 2023 and applicable international regulations, you possess the right to:</p>
          <ul className={styles.list}>
            <li className={styles.listItem}><strong>Right of Access:</strong> Review the personal data held on your profile.</li>
            <li className={styles.listItem}><strong>Right to Rectification:</strong> Update inaccurate account or contact information.</li>
            <li className={styles.listItem}><strong>Right to Erasure (Account Deletion):</strong> Request the permanent deletion of your account and associated personal data via your dashboard or our Help Center.</li>
            <li className={styles.listItem}><strong>Right to Revoke OAuth Permissions:</strong> Revoke Paayh&apos;s access to your Google account at any time via your Google Account Security Settings.</li>
            <li className={styles.listItem}><strong>Sovereignty of Engagement &amp; Voluntary Participation:</strong> You retain complete freedom over whether to engage with or patronize any commercial advertiser. You are never obligated to make purchases, and any transaction entered into with an advertiser is solely between you and that third party.</li>
          </ul>
        </section>

        {/* SECTION 7 */}
        <section id="retention">
          <h2 className={styles.heading}>VII. Data Retention &amp; Inactivity Policy</h2>
          <p>
            Personal data is retained only for as long as necessary to provide services and fulfill statutory accounting obligations. Inactivity resets and balance expirations are strictly enforced in accordance with our{" "}
            <Link href="/terms#inactivity-guidelines" style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}>
              Platform Inactivity Management Guidelines
            </Link>:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>7 Day Inactivity:</strong> Inactivity for 7 consecutive days resets monetization status; personal account data and wallet balances remain intact.
            </li>
            <li className={styles.listItem}>
              <strong>60 Day Dormant Account Expiration:</strong> Inactive accounts with zero engagement or login for 60 consecutive days forfeit unclaimed promotional incentive credits.
            </li>
            <li className={styles.listItem}>
              <strong>Deleted Accounts:</strong> When an account is deleted, personal data is permanently purged from active operational databases.
            </li>
          </ul>
        </section>

        {/* SECTION 8 */}
        <section id="contact">
          <h2 className={styles.heading}>VIII. Contact Our Data Protection Team</h2>
          <p>
            For questions, data access requests, or regulatory inquiries, contact our Data Protection and Compliance team:
          </p>
          <p>
            Email: <code>privacy@paayh.com</code> or <code>legal@paayh.com</code>
            <br />
            Support Portal: <Link href="/help" className={styles.link}>Paayh Help Center</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
