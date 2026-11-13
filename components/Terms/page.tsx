import React from "react";
import Link from "next/link";
import styles from "./page.module.css";
import TermsEligibilityAndEarnSections from "./TermsEligibilityAndEarnSections";
import TermsSafetyAndLegalSections from "./TermsSafetyAndLegalSections";

export default function TermsPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Terms of Service</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: November 12, 2026 | Effective Date: November 12, 2026</em>
        </p>

        <div className={styles.noticeBox}>
          <strong>PLEASE READ THESE TERMS CAREFULLY.</strong> By accessing or using Paayh, creating an account,
          publishing promotional content, or participating in attention monetization, you agree to be bound by these
          Terms of Service and all incorporated policies, including our{" "}
          <Link href="/privacy" className={styles.link}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/cookies" className={styles.link}>
            Cookie Policy
          </Link>
          . If you do not agree to these Terms, you must not access or use our Services.
        </div>

        <hr className={styles.divider} />

        <TermsEligibilityAndEarnSections />
        <TermsSafetyAndLegalSections />
      </main>
    </div>
  );
}
