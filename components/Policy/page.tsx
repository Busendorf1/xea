import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Privacy &amp; Data Protection Policy</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: November 5, 2026 | Effective Date: November 5, 2026</em>
        </p>

        <div className={styles.policyBanner}>
          This Privacy Policy explains how Paayh collects, uses, encrypts, and protects your personal data in compliance with the
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
              <strong>Precise GPS Location Coordinates &amp; Ongoing Recalibration:</strong> During profile setup and onboarding, we request device location permissions to auto detect your country, state, and city via browser GPS coordinates. Furthermore, during active authenticated sessions and upon login, the platform periodically reverifies geographic locality (via browser GPS if permitted, or network IP geolocation fallback) to recalibrate your location when traveling or relocating. These geographic fields are locked as read only to prevent manual fabrication, ensuring advertisers connect with authentic listeners physically present in designated campaign zones.
            </li>
            <li className={styles.listItem}>
              <strong>Engagement, Attention &amp; Followers Network Metrics:</strong> Timestamps of verified ad interactions, verification challenge outcomes (swipe, hold, tap), dwell time, ATW score progression, Mutual connections (up to 50 mutuals), and Followers / Agent referral records (your unique invite code, Agent status, invited followers, upline referrer, and aggregate promotional earnings credited from monetized followers).
            </li>
            <li className={styles.listItem}>
              <strong>Settlement &amp; Payout Information:</strong> When requesting a payout, you submit your registered phone number, settlement bank name, and account number. These details are transmitted via encrypted TLS connections directly to our regulated payment infrastructure partners (<strong>Paystack Payments Limited</strong> and <strong>Korapay Technologies Limited</strong>) to execute disbursements. Paayh does not permanently store raw banking numbers on your public user profile record.
            </li>
          </ol>
        </section>

        {/* SECTION 3 */}
        <section id="encryption">
          <h2 className={styles.heading}>III. Advanced Security, Irreversible Hashing &amp; Application Layer Encryption</h2>
          <p>
            In strict compliance with <strong>Section 24(1)(f) and Section 39 of the Nigeria Data Protection Act (NDPA 2023)</strong> and <strong>Articles 25 and 32 of the GDPR (Data Protection by Design and by Default)</strong>, Paayh implements multi layered cryptographic security so that even in the event of unauthorized infrastructure access, personal data is mathematically unreadable:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Truly Irreversible One Way Hashing &amp; Discarded Attributes (PBKDF2 HMAC SHA256 / HMAC SHA256 / SHA 256):</strong>{" "}
              Your 4 digit Wallet PIN (`pin:v1:...` derived via 100,000-iteration salted `PBKDF2 HMAC SHA256`), cryptographic blind lookup indexes (`email_hash`, `phone_hash`), and device/telemetry verification signatures are processed through irreversible one way peppered cryptographic hashing that is never decrypted in application code. Furthermore, when you submit your date of birth to verify `18+` age eligibility, Paayh immediately coarsens the record to your birth year only (`YYYY-01-01`) and permanently discards your exact calendar month and day of birth.
            </li>
            <li className={styles.listItem}>
              <strong>Authenticated Application Layer Encryption at Rest (AES 256 GCM):</strong> Operational profile fields that must be displayed back to you in your private settings or transmitted to licensed payment processors during a payout (specifically your contact phone number, legal first name, and legal last name) are encrypted at the application layer prior to database storage using 256-bit `AES 256 GCM` with unique 96-bit initialization vectors (`enc:v1:...`). In the event of unauthorized database table access, stored ciphertext remains unreadable without the isolated application-tier cryptographic key, while your authenticated session can still display your profile and process payouts seamlessly.
            </li>
            <li className={styles.listItem}>
              <strong>Private Operational Account Email vs. Public `@username` Handle:</strong> Your registered account email address (as well as any email submitted to our newsletter) is stored on access-controlled databases protected by Row-Level Security (RLS) policies, encrypted disk storage, and a paired cryptographic `email_hash` index. Your email is maintained in queryable form strictly to power federated OAuth authentication, peer to peer wallet transfers, internal referral attribution, regulated payment processor routing, and security alerts, and is <strong>never publicly displayed to other users on the feed or inside the Invites (Followers, Following, and Mutuals) modals</strong>. Conversely, your chosen `@username` and optional `business_name` serve as your public display identity across the platform (including on your Advertiser Info card, where your uploaded profile logo can be viewed, and in Followers, Following, and Mutuals lists); they are intentionally unencrypted and visible to other users, so you should avoid placing private email addresses or sensitive personal data inside your `@username`.
            </li>
            <li className={styles.listItem}>
              <strong>Strict Confidentiality of Your Wallet PIN &amp; Sensitive Account Details:</strong> You must <strong>never share your 4 digit Wallet PIN, session tokens, or sensitive account recovery details (such as your registered email and phone number combination)</strong> with any person, advertiser, or third party. Paayh staff and support representatives will never ask for your Wallet PIN, and you are solely responsible for safeguarding these credentials on your personal devices.
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
            <li className={styles.listItem}>To deliver relevant, localized sponsored content and calculate earned promotional incentive credits, including real time Follower and Agent commissions (1% from standard monetized followers and 2% from followers who have become Agents, marked with <code>*</code> beside their earnings) that automatically credit your wallet to maximize your earnings. Geographic recalibration ensures you receive commercial offers, retail specials, and events physically accessible to you where you currently are, preventing wasted sponsor ad spend and location spoofing. For clarity, cash credits accrue strictly on paid commercial campaigns where the sponsor allocated an impression budget; reciprocal mutual posts, platform updates, brand jingles, special offers, and business daily highlights carry zero cash incentive.</li>
            <li className={styles.listItem}>To audit transactions for fraud prevention, sybil prevention, and anti money laundering (AML) compliance under Nigerian law.</li>
            <li className={styles.listItem}>To disburse verified settlement payouts through licensed payment processors (Paystack and Korapay) with pass through regulated interbank transfer fee accounting.</li>
            <li className={styles.listItem}>We do <strong>NOT</strong> sell, rent, or trade your personal information to third party data brokers.</li>
          </ol>
        </section>

        {/* SECTION 5 */}
        <section id="cookies">
          <h2 className={styles.heading}>V. Cookies &amp; Tracking Technologies</h2>
          <p className={styles.subParagraph}>
            For a comprehensive breakdown of our storage mechanisms, token lifecycle, and category disclosures, please inspect our standalone{" "}
            <Link href="/cookies" className={styles.policyLink}>
              Cookie Policy
            </Link>.
          </p>
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
          <h2 className={styles.heading}>VI. User Privacy Rights &amp; Data Access Limitations (NDPA 2023 &amp; GDPR Art. 11)</h2>
          <p>Under the Nigeria Data Protection Act 2023 and applicable international regulations (including GDPR), you possess statutory privacy rights subject to technical cryptographic safeguards:</p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Why Raw Hashed Data Cannot Be Retrieved Upon Request (GDPR Article 11 &amp; NDPA Section 39):</strong> Because Paayh hashes your 4 digit Wallet PIN, personal lookup identifiers, and verification tokens using one way cryptographic functions (`PBKDF2 HMAC SHA256` / `HMAC SHA256` / `SHA 256`) and discards exact calendar birthdays upon `18+` verification to protect you against data breaches, <strong>requesting a raw, unhashed reconstruction of one way hashed data, historical GPS coordinates, or de-identified impression logs is technically and mathematically impossible</strong>. Pursuant to <strong>GDPR Article 11 (Processing which does not require identification)</strong> and <strong>NDPA 2023 data minimization mandates</strong>, Paayh is not obligated to maintain, acquire, or retain unhashed raw personal identifiers solely to fulfill a data export request.
            </li>
            <li className={styles.listItem}>
              <strong>What Is Obtainable (Right of Access):</strong> You can access and review all obtainable operational profile data directly inside your authenticated Paayh dashboard or by submitting a verified request to <code>privacy@paayh.com</code>. Obtainable records consist of: (a) your public display handle (`@username`) and business name, (b) your selected demographic and interest categories, (c) your coarsened birth year (`YYYY`), (d) your current wallet balance and masked transaction reference history, and (e) your <strong>Invites</strong> network data, specifically your referral invite code, Agent status, public `@username` list of <strong>Followers</strong> (with per-follower promotional earnings and `*` Agent indicator), your <strong>Following</strong> referrer, and your <strong>Mutuals (X/50)</strong> list, plus controls to request <strong>Unfollow</strong> (with <strong>Undo</strong>) or execute a full <strong>Opt Out</strong> at any time.
            </li>
            <li className={styles.listItem}><strong>Right to Rectification:</strong> Update inaccurate account preferences or contact information via your profile settings (subject to platform anti fraud cooldown intervals).</li>
            <li className={styles.listItem}><strong>Right to Erasure (Account Deletion):</strong> Request the permanent deletion of your account and associated cryptographic hash records via your dashboard or our Help Center.</li>
            <li className={styles.listItem}><strong>Right to Revoke OAuth Permissions:</strong> Revoke Paayh&apos;s access to your Google account at any time via your Google Account Security Settings.</li>
            <li className={styles.listItem}><strong>Sovereignty of Engagement &amp; Voluntary Participation:</strong> You retain complete freedom over whether to engage with or patronize any commercial advertiser. You are never obligated to make purchases, and any transaction entered into with an advertiser is solely between you and that third party.</li>
          </ul>
        </section>

        {/* SECTION 7 */}
        <section id="retention">
          <h2 className={styles.heading}>VII. Data Retention &amp; Inactivity Policy</h2>
          <p>
            Personal data is retained only for as long as necessary to provide services and fulfill statutory accounting obligations. Inactivity resets and balance expirations are strictly enforced in accordance with our{" "}
            <Link href="/terms#inactivity-guidelines" className={styles.policyLink}>
              Platform Inactivity Management Guidelines
            </Link>:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>7 Day Inactivity:</strong> Inactivity for 7 consecutive days resets monetization status; personal account data and wallet balances remain intact.
            </li>
            <li className={styles.listItem}>
              <strong>60 Day Dormant Account Expiration:</strong> Inactive accounts with zero engagement or login for 60 consecutive days forfeit all unclaimed promotional incentive credits (including any accumulated Follower and Agent earnings in the wallet) to the platform.
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
