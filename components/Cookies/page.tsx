"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function CookiesPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Cookie Policy</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: September 12, 2026 | Effective Date: September 12, 2026</em>
        </p>

        <div className={styles.noticeBox}>
          This Cookie Policy explains how Paayh uses cookies, local storage, and similar web technologies to provide,
          secure, and improve our Services. For broader information regarding our data protection standards, please read
          our{" "}
          <Link href="/privacy" className={styles.link}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className={styles.link}>
            Terms of Service
          </Link>
          .
        </div>

        <hr className={styles.divider} />

        <section>
          <h2 className={styles.heading}>1. What Are Cookies and Local Storage?</h2>
          <p>
            Cookies are small text files placed on your computer or mobile device when you access websites. Local
            storage and session storage are modern browser-based storage mechanisms that allow web applications to store
            data locally within your browser. Paayh uses these technologies to maintain secure sessions, remember
            preferences, prevent fraud, and verify human attention.
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
              <strong>Auth0 &amp; Session Tokens:</strong> Cryptographically signed HTTP-only cookies used to identify
              your authenticated account session and protect against Cross-Site Request Forgery (CSRF).
            </li>
            <li className={styles.listItem}>
              <strong>Security Tokens:</strong> Session cookies that authenticate API requests and prevent automated
              bot injection.
            </li>
          </ul>

          <h3 className={styles.subheading}>B. Impression Tracking &amp; Verification Tokens</h3>
          <p>
            Because Paayh operates an attention-based digital ecosystem, we utilize lightweight, encrypted browser tokens
            to accurately measure engagement:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Single-Impression Deduplication:</strong> Tracks whether an ad has been delivered or marked as
              &quot;Seen&quot; to prevent repeat deliveries and advance your feed queue.
            </li>
            <li className={styles.listItem}>
              <strong>Challenge Verification State:</strong> Ephemeral tokens that record human verification interactions
              (such as swipe, hold, or tap) before unlocking monetization rewards.
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
          </ul>
        </section>

        <section>
          <h2 className={styles.heading}>3. What We Do NOT Do</h2>
          <div className={styles.noticeBox}>
            <strong>NO THIRD-PARTY DATA BROKER TRACKING:</strong> Paayh does NOT use third-party behavioral advertising
            cookies that track you across external websites. We do not sell your browsing history, clicks, or device
            identifiers to third-party ad networks, telemetry trackers, or data brokers.
          </div>
        </section>

        <section>
          <h2 className={styles.heading}>4. How to Control and Manage Cookies</h2>
          <p>
            Most modern web browsers allow you to manage or block cookies through browser settings. You can review and
            delete cookies stored on your device:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Google Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies and other site data.
            </li>
            <li className={styles.listItem}>
              <strong>Apple Safari:</strong> Preferences &gt; Privacy &gt; Manage Website Data.
            </li>
            <li className={styles.listItem}>
              <strong>Mozilla Firefox:</strong> Options &gt; Privacy &amp; Security &gt; Cookies and Site Data.
            </li>
            <li className={styles.listItem}>
              <strong>Microsoft Edge:</strong> Settings &gt; Cookies and Site Permissions.
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
