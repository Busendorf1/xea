import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function CookiesPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Device Storage, Security Tokens &amp; Tracking Policy</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: November 5, 2026 | Effective Date: November 5, 2026</em>
        </p>

        <div className={styles.noticeBox}>
          This Policy explains how Paayh uses local device storage, secure session tokens, and caching technologies to provide,
          secure, and improve our mobile and web services. For broader information regarding our data protection standards and user agreements, please read
          our{" "}
          <Link href="/privacy" className={styles.link}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className={styles.link}>
            Terms of Service
          </Link>
          . You can also review our interactive onboarding terms via the{" "}
          <Link href="/modal" className={styles.link}>
            Paayh Concierge Modal
          </Link>
          .
        </div>

        <hr className={styles.divider} />

        <section>
          <h2 className={styles.heading}>1. What Are Cookies and Local Storage?</h2>
          <p>
            Modern applications utilize secure session tokens, local device storage, and cryptographic keys to maintain authenticated sessions, store user preferences, verify human attention, and prevent fraud without relying on invasive third-party tracking.
          </p>
        </section>

        <section>
          <h2 className={styles.heading}>2. Categories of Cookies We Use</h2>

          <h3 className={styles.subheading}>A. Strictly Necessary &amp; Authentication Cookies</h3>
          <p>
            These cookies are essential for the operation of Paayh. Without them, core functions such as logging in,
            navigating the dashboard, verifying security challenges, and managing wallet transactions cannot function.
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Auth0 &amp; Session Tokens:</strong> Cryptographically signed HTTP only cookies used to identify
              your authenticated account session and protect against Cross Site Request Forgery (CSRF).
            </li>
            <li className={styles.listItem}>
              <strong>Security Tokens:</strong> Session cookies that authenticate API requests and prevent automated
              bot injection.
            </li>
            <li className={styles.listItem}>
              <strong>Real Time Telemetry &amp; Server Sent Events (SSE):</strong> Persistent, multiplexed HTTP streaming
              connections that securely broadcast wallet balance adjustments and notification updates
              in real time without third party tracking cookies.
            </li>
          </ul>

          <h3 className={styles.subheading}>B. Impression Tracking, Verification &amp; Geographic Tokens</h3>
          <p>
            Because Paayh operates an attention based digital ecosystem, we utilize lightweight, encrypted browser tokens
            to accurately measure engagement and calibrate localized delivery:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Single Impression Deduplication:</strong> Tracks whether an ad has been delivered or marked as
              &quot;Seen&quot; to prevent repeat deliveries and advance your feed queue.
            </li>
            <li className={styles.listItem}>
              <strong>Challenge Verification State:</strong> Ephemeral tokens that record human verification interactions
              (such as swipe, hold, or tap) before unlocking monetization rewards.
            </li>
            <li className={styles.listItem}>
              <strong>Geo Locality Caching Tokens (`paayh_location_calibrated`):</strong> Session level browser tokens that
              record when device GPS/IP location has been checked for the active session, preventing redundant background
              requeries on page transitions and conserving your mobile device battery and network bandwidth.
            </li>
          </ul>

          <h3 className={styles.subheading}>C. Preference &amp; Functionality Cookies</h3>
          <p>
            These cookies remember your interface preferences to provide an optimal visual experience:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Theme &amp; Display State:</strong> Saves your dark or light mode preference across browser
              sessions.
            </li>
            <li className={styles.listItem}>
              <strong>Sidebar State:</strong> Remembers active dashboard tab selections.
            </li>
            <li className={styles.listItem}>
              <strong>First Party Invite Attribution &amp; Followers Cache (`paayh_ref_code` / `paayh_agent_net_v1`):</strong>{" "}
              When you arrive on Paayh through an Agent&apos;s invite link (<code>?ref=CODE</code>), a first party cookie
              and local storage key temporarily preserve the referral code during sign up and profile setup so your
              account is accurately connected to your referrer&apos;s <strong>Followers</strong> list. Short lived
              session storage also caches your <strong>Invites</strong> (Followers, Following, and Mutuals) summary for
              instant dashboard rendering without redundant server requests.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={styles.heading}>3. What We Do NOT Do</h2>
          <div className={styles.noticeBox}>
            <strong>NO THIRD PARTY DATA BROKER TRACKING:</strong> Paayh operates strictly on a first-party basis. We do NOT track you across third-party apps or external websites, nor do we sell your personal data or device identifiers to third-party data brokers. We fully respect Apple's App Tracking Transparency (ATT) framework.
          </div>
        </section>

        <section>
          <h2 className={styles.heading}>4. How to Control and Manage Storage &amp; Permissions</h2>
          <p>
            You can review, manage, or clear local application storage and device permissions (such as Location) directly through your operating system settings:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Apple iOS Devices:</strong> Settings &gt; Paayh (or Settings &gt; Privacy &amp; Security &gt; Location Services &gt; Paayh).
            </li>
            <li className={styles.listItem}>
              <strong>Google Android Devices:</strong> Settings &gt; Apps &gt; Paayh &gt; Permissions &amp; Storage.
            </li>
            <li className={styles.listItem}>
              <strong>Web Browsers (Desktop &amp; Mobile Website):</strong>
              <ul className={styles.list} style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
                <li className={styles.listItem}><strong>Google Chrome:</strong> Settings &gt; Privacy and Security &gt; Third-party cookies &amp; Site data.</li>
                <li className={styles.listItem}><strong>Apple Safari:</strong> Preferences / Settings &gt; Privacy &gt; Manage Website Data.</li>
                <li className={styles.listItem}><strong>Mozilla Firefox:</strong> Settings &gt; Privacy &amp; Security &gt; Cookies and Site Data.</li>
                <li className={styles.listItem}><strong>Microsoft Edge:</strong> Settings &gt; Cookies and Site Permissions.</li>
              </ul>
            </li>
          </ul>
          <p>
            <em>
              Please note: Because our session cookies are essential for authentication and fraud prevention, disabling
              or blocking them will prevent you from signing in, viewing ads, or earning attention rewards.
            </em>
          </p>
        </section>

        <section>
          <h2 className={styles.heading}>5. Updates to This Policy</h2>
          <p>
            We may update this Cookie Policy from time to time to reflect technological or legal requirements. When
            material changes are made, we will update the &quot;Last Updated&quot; date at the top of this page.
          </p>
        </section>

        <section>
          <h2 className={styles.heading}>6. Contact Us</h2>
          <p>
            If you have questions regarding our use of cookies or tracking technologies, please contact our Data
            Protection team at:
          </p>
          <p>
            Email: <code>privacy@paayh.com</code>
            <br />
            Help Center:{" "}
            <Link href="/help" className={styles.link}>
              Paayh Help Center
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
