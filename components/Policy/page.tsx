import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Privacy &amp; Data Protection Policy</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: November 12, 2026 | Effective Date: November 12, 2026</em>
        </p>

        <div className={styles.policyBanner}>
          This Privacy Policy explains how Paayh collects, uses, encrypts, retains, and permanently purges your personal data in compliance with the
          <strong> Nigeria Data Protection Act (NDPA 2023)</strong> and global privacy frameworks (including GDPR). For contractual terms governing platform access, content posting, and attention monetization, please review our dedicated{" "}
          <Link href="/terms" className={styles.policyLink}>
            Terms of Service
          </Link>.
        </div>

        <hr className={styles.divider} />

        {/* SECTION 1 */}
        <section id="introduction">
          <h2 className={styles.heading}>I. Data Controller &amp; Scope</h2>
          <p>
            Paayh (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates an attention exchange and digital content platform. We are committed to processing your personal data lawfully, transparently, and securely. This policy applies to all registered community members, creators, businesses, and platform visitors.
          </p>
        </section>

        {/* SECTION 2 */}
        <section id="data-collected">
          <h2 className={styles.heading}>II. Information We Collect</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Authentication Data:</strong> When you register or sign in using federated identity providers (Google OAuth or Sign in with Apple through Auth0), we receive core authentication attributes: your display name and email address. When authenticating with <strong>Sign in with Apple</strong>, you may choose to share your personal Apple ID email address or generate an anonymous, encrypted relay address using Apple&apos;s <em>&quot;Hide My Email&quot;</em> service (<code>@privaterelay.appleid.com</code>). Paayh fully supports Private Relay addresses for session verification, peer-to-peer wallet routing, and settlement notifications. Apple provides a unique, persistent pairwise identifier (<code>sub</code>) and does not track your application activity. Profile pictures and business logos are uploaded manually by users directly in profile settings if they choose. We do not access external private account data, inboxes, drive files, or calendar data.
            </li>
            <li className={styles.listItem}>
              <strong>Profile &amp; Demographic Preferences:</strong> Voluntary user details including country, state, gender, date of birth / age bracket, and selected interest categories used solely to deliver relevant feed content.
            </li>
            <li className={styles.listItem}>
              <strong>Device Location Permissions &amp; Geographic Matching:</strong> During profile setup and onboarding, you may voluntarily grant device location permissions to auto-detect your country, state, and city via device location services. Granting location access is voluntary to open settings; however, because commercial campaigns and community offers are strictly targeted to physical jurisdictions and payouts require regional locality verification, skipping or disabling device location permissions leaves your feed empty until location is enabled. When location permissions are granted, the platform periodically recalibrates geographic locality (via device location permissions if permitted, or network IP fallback) when traveling or relocating. These geographic fields are locked as read-only to prevent manual fabrication.
            </li>
            <li className={styles.listItem}>
              <strong>Engagement, Attention &amp; Followers Network Metrics:</strong> Timestamps of verified ad interactions, verification challenge outcomes (swipe, hold, tap), dwell time, verified advertiser 1–5 star ratings (<code>attention_worth_score</code>), ATW1–ATW14 tier progression (₦30,000–₦420,000 holding caps), Mutual connections (up to 50 mutuals), and strict single-tier direct Followers / Agent referral records (your unique invite code, Agent status, invited followers, direct upline referrer, and aggregate promotional earnings credited solely when net follower earnings are positive). There are zero multi-tier or downline commissions.
            </li>
            <li className={styles.listItem}>
              <strong>Settlement, Wallet PIN &amp; Payout Verification Information:</strong> Every balance unlock, peer-to-peer transfer, and bank withdrawal strictly requires your <strong>4-digit Wallet PIN</strong> (subject to a <strong>45-minute security lockout</strong> after 5 consecutive failed attempts) and, for bank withdrawals, your <strong>registered profile phone number</strong> alongside your settlement bank name and NUBAN account number. Payout instructions are transmitted via encrypted TLS connections to our regulated payment infrastructure partners (<strong>Paystack Payments Limited</strong> and <strong>Korapay Technologies Limited [Kora]</strong>), applying the selected rail&apos;s statutory transfer fees (Paystack: ₦10.75/₦26.88/₦53.75; Kora: ₦15/₦25/₦35). Paayh does not permanently store raw banking numbers on your public user profile record.
            </li>
            <li className={styles.listItem}>
              <strong>Device Interaction Signals &amp; Touch Telemetry (Ephemeral Kinematics):</strong> During interaction with sponsored content and Proof of Human challenges, the application evaluates ephemeral touch and pointer telemetry in volatile memory in real time solely to distinguish authentic human engagement from bots, emulators, or macros. Paayh does <strong>NOT</strong> collect, record, or retain persistent biometric templates (fingerprints, facial geometry, or retinal scans), and telemetry is never sold or linked to cross-app tracking profiles.
            </li>
          </ol>
        </section>

        {/* SECTION 3 */}
        <section id="encryption">
          <h2 className={styles.heading}>III. Advanced Security, Irreversible Hashing &amp; Application-Layer Encryption</h2>
          <p>
            In strict compliance with <strong>Section 24(1)(f) and Section 39 of the Nigeria Data Protection Act (NDPA 2023)</strong> and <strong>Articles 25 and 32 of the GDPR</strong>, Paayh implements multi-layered cryptographic security:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Irreversible One-Way Hashing &amp; Discarded Attributes (PBKDF2-HMAC-SHA256 / HMAC-SHA256 / SHA-256):</strong>{" "}
              Your 4-digit Wallet PIN, personal lookup identifiers, and verification signatures are processed through irreversible salted cryptographic hashing and never stored in plaintext. Five (5) incorrect PIN attempts trigger a <strong>45-minute lockout</strong>. Exact calendar birth month/day are discarded immediately after <code>18+</code> age verification, keeping birth year only (<code>YYYY-01-01</code>).
            </li>
            <li className={styles.listItem}>
              <strong>Authenticated Application-Layer Encryption at Rest (AES-256-GCM):</strong> Operational profile fields needed for private settings and payout phone verification (contact phone number, legal first name, and legal last name) are encrypted at rest with 256-bit authenticated encryption.
            </li>
            <li className={styles.listItem}>
              <strong>Private Operational Account Email vs. Public <code>@username</code> Handle:</strong> Your <code>@username</code> is what people see on the feed; keep your email private and never use it as your username. Your email is stored strictly for federated authentication, wallet transfers, internal attribution, and alerts, and is never displayed publicly on the feed or inside Invites modals.
            </li>
            <li className={styles.listItem}>
              <strong>Strict Confidentiality of Your Wallet PIN &amp; Recovery Credentials:</strong> Never share your 4-digit Wallet PIN, session tokens, or registered email + phone recovery combination with anyone. Paayh staff will never request your PIN.
            </li>
            <li className={styles.listItem}>
              <strong>Encrypted Network Transmission:</strong> All data in transit is protected using TLS 1.3.
            </li>
          </ul>
        </section>

        {/* SECTION 4 */}
        <section id="data-use">
          <h2 className={styles.heading}>IV. How We Use Your Data</h2>
          <p>We process personal data strictly for legitimate operational purposes:</p>
          <ol className={styles.list}>
            <li className={styles.listItem}>To authenticate your account session, protect wallet transactions with your mandatory 4-digit PIN, and maintain account security.</li>
            <li className={styles.listItem}>To deliver localized sponsored content, configurable-duration Highlights (1–90 days / scheduled expiry), and calculate voluntary promotional attention rewards (30% baseline after initial 16s focus up to 50% max across the second 16s countdown) and single-tier direct-only referral commissions (1% follower / 2% Agent on positive direct earn credits).</li>
            <li className={styles.listItem}>To process 3-dot feed safety reports (<code>Block &amp; report Ad</code>, <code>Block &amp; report Advertiser</code>, <code>Don&apos;t show this Ad again</code>) so blocked campaigns and advertisers are immediately excluded from your feed.</li>
            <li className={styles.listItem}>To audit transactions for fraud prevention, sybil defense, and Nigerian Anti-Money Laundering (AML) compliance.</li>
            <li className={styles.listItem}>To disburse verified settlement payouts in NGN through Paystack or Korapay (Kora) with statutory pass-through rail fees and verified Nigerian bank accounts (NUBAN). We do <strong>NOT</strong> sell, rent, or trade your personal information to third-party data brokers.</li>
          </ol>
        </section>

        {/* SECTION 5 */}
        <section id="cookies">
          <h2 className={styles.heading}>V. Storage, Device Tokens &amp; App Tracking Transparency</h2>
          <p className={styles.subParagraph}>
            For a full breakdown of our storage mechanisms and token lifecycle, inspect our standalone{" "}
            <Link href="/cookies" className={styles.policyLink}>
              Cookie Policy
            </Link>.
          </p>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Essential Session Cookies:</strong> HTTP-only session cookies authenticate logged-in users, prevent CSRF, and preserve UI preferences.
            </li>
            <li className={styles.listItem}>
              <strong>Zero Cross-App Tracking &amp; Voluntary OS Tracking Prompts (Apple ATT &amp; Google Advertising ID):</strong> Paayh does NOT engage in cross-app or cross-site tracking. Any OS tracking prompt applies strictly to external apps and services managed at the OS level. All feed matching on Paayh is strictly first-party.
            </li>
            <li className={styles.listItem}>
              <strong>Cookie &amp; Location Control:</strong> You can manage local storage and Location permissions directly in device or browser settings.
            </li>
          </ol>
        </section>

        {/* SECTION 6 */}
        <section id="user-rights">
          <h2 className={styles.heading}>VI. User Privacy Rights &amp; Data Access Limitations (NDPA 2023 &amp; GDPR Art. 11)</h2>
          <p>Under the Nigeria Data Protection Act 2023 and GDPR, you hold statutory privacy rights subject to cryptographic safeguards:</p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Why Raw Hashed Data Cannot Be Retrieved (GDPR Art. 11 &amp; NDPA Sec. 39):</strong> One-way cryptographic hashes (Wallet PINs, verification signatures, discarded birth dates) cannot be reversed or reconstructed.
            </li>
            <li className={styles.listItem}>
              <strong>Right of Access &amp; Rectification:</strong> Review obtainable profile, ATW tier/score, wallet history, and Invites data inside your dashboard or via <code>privacy@paayh.com</code>, and update eligible preferences in settings.
            </li>
            <li className={styles.listItem}>
              <strong>Right to Permanent Erasure (Account Deletion — No Silent Reactivation):</strong> Delete your account permanently via in-app settings (2-second hold-to-confirm) or our Help Center. Permanent deletion executes an atomic purge across profile, storage media, follow/mutual graphs, and auth identities, writes a permanent deactivation tombstone preventing silent reactivation on future OAuth logins, and scrubs unredeemed promotional credits.
            </li>
            <li className={styles.listItem}>
              <strong>Right to Revoke OAuth &amp; Apple ID Permissions &amp; Monetization Opt-Out:</strong> Revoke Google/Apple sign-in permissions at the provider level or opt out of monetization anytime while keeping feed browsing access and accrued wallet balance.
            </li>
          </ul>
        </section>

        {/* SECTION 7 */}
        <section id="retention">
          <h2 className={styles.heading}>VII. Data Retention, Statutory 5-Year AML Audit Retention &amp; Inactivity Policy</h2>
          <p>
            Personal data is retained only as long as necessary to provide services and fulfill statutory Nigerian legal obligations under our{" "}
            <Link href="/terms#inactivity-guidelines" className={styles.policyLink}>
              Platform Inactivity Management Guidelines
            </Link>:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>7-Day Inactivity:</strong> Inactivity for 7 consecutive days resets monetization status and clicks to zero; account data and wallet balances remain intact.
            </li>
            <li className={styles.listItem}>
              <strong>60-Day Dormant Account Deactivation &amp; Credit Forfeiture:</strong> Accounts inactive for 60 consecutive days are deactivated (regardless of balance) and forfeit any remaining unclaimed promotional credits (including Follower and Agent earnings) to platform liquidity.
            </li>
            <li className={styles.listItem}>
              <strong>Deleted Accounts &amp; 5-Year AML Financial Pseudonymisation:</strong> Active profile PII, media assets, social graphs, and auth logins are permanently purged upon deletion with no silent reactivation. Financial settlement, withdrawal, and compliance audit ledgers are pseudonymised and retained for five (5) years strictly as mandated by Nigerian AML/SCUML financial recordkeeping laws.
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
          <div className={styles.policyBanner} style={{ marginTop: "1.5rem" }}>
            <strong>Apple Inc. &amp; Google LLC Non-Affiliation Disclaimer:</strong> Neither Apple Inc. nor Google LLC (Alphabet Inc.) is a sponsor of, affiliated with, or responsible for administering or maintaining the Paayh application, rewards, promotions, campaigns, or payouts.
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground, #888)", marginTop: "1rem" }}>
            Aggregate platform liability is subject to the uniform liability cap of Fifty United States Dollars ($50.00 USD) or Seventy Five Thousand Naira (₦75,000.00 NGN) set forth in our Terms of Service.
          </p>
        </section>
      </main>
    </div>
  );
}
