import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function TermsSafetyAndLegalSections() {
  return (
    <>
      {/* SECTION 4 */}
      <section>
        <h2 className={styles.heading}>
          4. Content Standards, EULA, Pre-Screening Review, 24-Hour Moderation SLA &amp; Non-Refundable Service Fees
        </h2>
        <p>
          <strong>4.1 Campaign Delivery &amp; Configurable Highlights (1–90 Days &amp; Scheduled Expiry):</strong>{" "}
          Advertisers and creators may publish standard interactive feed posts (supporting text, media, and video) or
          promotional &quot;Highlights.&quot; Highlights support configurable active durations between{" "}
          <strong>one (1) and ninety (90) days</strong> (<code>campaign_days</code>), as well as optional scheduled
          start and expiration windows (<code>scheduled_start_at</code>, <code>scheduled_end_at</code>, and{" "}
          <code>expires_at</code>). Active Highlights rotate periodically in the Highlights rail and expire
          automatically when their scheduled end timestamp or configured campaign duration elapses.
        </p>
        <p>
          <strong>4.2 End User License Agreement (EULA) &amp; Zero Tolerance for Objectionable Content:</strong> Paayh
          enforces a strict zero-tolerance policy against objectionable content, harassment, hate speech, pornography,
          violence, or abusive behavior (aligned with Apple Guideline 1.2 &amp; Google Play UGC Policy). All
          user-submitted content undergoes automated and human pre-screening filtering before going live on the platform.
        </p>
        <p>
          <strong>4.2.1 Working In-Feed 3-Dot Reporting &amp; Content Blocking Mechanisms:</strong> Users have continuous
          access to real-time moderation and feed control tools via the three-dot menu (<code>...</code>) on every ad
          card:
        </p>
        <ul className={styles.list} style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
          <li className={styles.listItem}>
            <strong>Block &amp; Report Ad:</strong> Immediately records a report against the specific campaign, permanently
            hides that ad from your feed, removes it immediately from your active feed view, and links you directly to
            our Help Center if you wish to add further review details.
          </li>
          <li className={styles.listItem}>
            <strong>Block &amp; Report Advertiser:</strong> Immediately blocks the advertiser, removes all campaigns from
            that advertiser from your feed view, logs the report for review, and opens an optional detailed complaint
            form.
          </li>
          <li className={styles.listItem}>
            <strong>Don&apos;t Show This Ad Again:</strong> Immediately persists a dismissal record and removes the
            selected ad from your feed without requiring a support ticket. (Fair-use rate limits apply to prevent
            reporting spam.)
          </li>
          <li className={styles.listItem}>
            <strong>24-Hour Moderation Action SLA:</strong> Paayh&apos;s compliance team investigates user reports and
            acts within <strong>twenty-four (24) hours</strong> to remove offending material and eject abusive accounts.
          </li>
        </ul>
        <p>
          <strong>4.2.2 Regulatory Compliance:</strong> Users publishing promotional content warrant compliance with the
          Advertising Regulatory Council of Nigeria (ARCON) Act 2022 and applicable consumer protection statutes.
        </p>
        <p>
          <strong>4.3 Notice and Takedown Protocol:</strong> Paayh operates as an intermediary content hosting service.
          If ARCON, an authorized government regulator, or a third-party rights holder submits a valid infringement or
          regulatory complaint regarding any content, Paayh reserves the absolute right to immediately throttle,
          suspend, or permanently remove the creative without prior notice or liability.
        </p>
        <p>
          <strong>4.4 Strict Non-Refundable Policy (Infrastructure Compensation):</strong>
        </p>
        <div className={styles.warningBox}>
          ALL PAYMENTS MADE TO PAAYH FOR ADVERTISING CAMPAIGNS, PROMOTIONAL SLOTS, OR HIGHLIGHTS CONSTITUTE CONSUMABLE
          SERVICE FEES FOR IMMEDIATE DIGITAL INFRASTRUCTURE PROVISIONING, BANDWIDTH CONSUMPTION, ALGORITHMIC QUEUE
          PLACEMENT, AND SYSTEM RESERVATION. ALL CAMPAIGN PAYMENTS ARE 100% STRICTLY NON-REFUNDABLE UNDER ANY AND ALL
          CIRCUMSTANCES, INCLUDING CAMPAIGN CANCELLATION, REGULATORY TAKEDOWN (BY ARCON OR OTHER AUTHORITIES), OR ACCOUNT
          SUSPENSION. USERS AND ADVERTISERS ARE EXPRESSLY ADVISED TO TEST PROMOTIONS WITH SMALL AMOUNTS THEY CAN
          COMFORTABLY AFFORD BEFORE COMMITTING LARGER BUDGETS.
        </div>
        <p className={styles.paragraphTopMargin}>
          <strong>4.5 Prohibited Content Categories &amp; Ban on Incentivized App Downloads:</strong> You agree not to
          upload, promote, or link to deceptive schemes, counterfeit goods, adult/pornographic content,
          firearms/weapons, illegal substances, unapproved pharmaceuticals, unlicensed betting solicitations, malware,
          phishing links, or hate speech.
          <br />
          <strong>Strict Ban on Incentivized App Downloads &amp; Store Chart Manipulation:</strong> Advertisers and
          promoters are strictly prohibited from publishing campaigns that offer financial rewards, credits, or
          incentives to users for downloading third-party applications, posting reviews/ratings on the Apple App Store or
          Google Play Store, or manipulating marketplace rankings. Any campaign violating this rule is rejected
          immediately without refund.
        </p>
      </section>

      {/* SECTION 5 */}
      <section>
        <h2 className={styles.heading}>5. Intellectual Property &amp; Platform License</h2>
        <p>
          <strong>5.1 Paayh IP:</strong> All rights, title, and interest in and to the Services, including source code,
          algorithms, visual designs, logos, the ATW Engine, and impression tracking architecture, are the exclusive
          property of Paayh and its licensors.
        </p>
        <p>
          <strong>5.2 License Granted by You:</strong> By uploading or displaying creatives, text, media, or profile
          assets on the Services, you grant Paayh a worldwide, non-exclusive, royalty-free, transferable, sublicensable
          license to host, store, cache, format, distribute, and display such materials across our web and mobile
          infrastructure solely for the operation and promotion of the Services.
        </p>
      </section>

      {/* SECTION 6 */}
      <section>
        <h2 className={styles.heading}>6. Proof of Human (PoH) Verification, Platform Integrity &amp; Abuse Prevention</h2>
        <p>
          <strong>6.1 Condition of Commercial Earning &amp; Proof of Human (PoH):</strong> Paayh&apos;s monetization
          model is funded by commercial advertisers who contract exclusively for genuine, focused human attention.
          Consequently, participation in attention rewards is strictly conditioned upon real-time authentication of
          authentic human presence through Proof of Human (&quot;PoH&quot;) validation protocols.
        </p>
        <p>
          <strong>6.1.1 Ephemeral Interaction Telemetry &amp; Privacy Compliance:</strong> During ad views and
          verification interactions (gestures, swipes, or taps), the platform processes ephemeral interaction telemetry in
          volatile memory solely for real-time anti-bot defense in strict compliance with the Nigeria Data Protection Act
          2023 (NDPA). Paayh does not collect, record, or retain persistent biometric identifiers (such as fingerprints,
          retinal scans, or facial geometry).
        </p>
        <p>
          <strong>6.1.2 Proprietary Security Heuristics &amp; Trade Secret Protection:</strong> Fraud detection
          methodologies, kinematic evaluation algorithms, interaction scoring matrices, and security heuristics constitute
          confidential intellectual property of Paayh, and Paayh is under no obligation to disclose internal forensics or
          scoring thresholds.
        </p>
        <p>
          <strong>6.1.3 Unilateral Evaluation Discretion &amp; Disclaimer of Liability:</strong> Paayh reserves sole
          discretion to evaluate, throttle, apply pacing cooldowns, or reject any interaction or reward claim triggering
          synthetic risk indicators without liability.
        </p>
        <p>
          <strong>6.1.4 Inherent Public Internet Realities:</strong> While Paayh deploys multi-layered anti-abuse
          defenses, nothing on the public internet is 100% impervious to adversarial anomalies, and users and advertisers
          accept these operational realities.
        </p>
        <p>
          <strong>6.2 Actionable Prohibited Abusive Activities:</strong> Automated viewing (bots, emulators, auto-clickers),
          click farming, API/token replay attacks, scraping or reverse engineering, and traffic disruption/DDoS attacks
          constitute actionable civil fraud against Paayh.
        </p>
        <p>
          <strong>6.3 Sanctions &amp; Forfeiture:</strong> Any violation of this Section results in immediate, permanent
          account termination, cancellation of active promotions, permanent exclusion from the platform, and complete
          forfeiture of all unredeemed promotional incentive credits without prior notice.
        </p>
      </section>

      {/* SECTION 7 */}
      <section>
        <h2 className={styles.heading}>7. Permanent Account Deletion, Data Purge &amp; No Silent Reactivation</h2>
        <p>
          You may permanently delete your account at any time through your in-app account settings (using the 2-second
          hold-to-confirm deletion flow, accessible to all members including Sign in with Apple Private Relay users) or
          via our{" "}
          <Link href="/help" className={styles.link}>
            Help Center
          </Link>
          . If you authenticated via Google OAuth or Sign in with Apple, you may also revoke permissions via your Google
          Security Settings or iOS device settings (<code>Settings &gt; Apple ID &gt; Sign in with Apple &gt; Paayh &gt; Stop using Apple ID</code>).
        </p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <strong>Irreversible Deletion &amp; No Silent Reactivation:</strong> Account deletion is{" "}
            <strong>permanent and irreversible</strong>. Upon deletion, an atomic deactivation lock scrubs your personal
            profile fields, media objects, follower/following/mutual links, active ad/highlight listings, and
            authentication provider records, and writes an irreversible deactivation tombstone so that deleted accounts can{" "}
            <strong>never be silently reactivated</strong> by signing back in with OAuth.
          </li>
          <li className={styles.listItem}>
            <strong>Balance Withdrawal Prerequisite:</strong> Deleting your account forfeits and wipes any remaining
            unredeemed promotional incentive balance; you must withdraw all eligible funds prior to confirming deletion.
          </li>
          <li className={styles.listItem}>
            <strong>5-Year Statutory AML Audit Pseudonymisation:</strong> In compliance with Nigerian Anti-Money
            Laundering (AML) and SCUML/CBN financial recordkeeping mandates, settled payment, payout, and audit
            reference records are pseudonymised (stripped of personal profile PII) and retained solely for statutory
            financial compliance for up to five (5) years.
          </li>
        </ul>
      </section>

      {/* SECTION 8 */}
      <section>
        <h2 className={styles.heading}>8. Disclaimers of Warranties</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES, MONETIZATION TOOLS, WALLET INTERFACES, AND THE ATW ENGINE
          ARE PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. PAAYH
          DOES NOT WARRANT THAT CAMPAIGNS WILL PRODUCE SPECIFIC SALES OR ROI OR THAT THE PLATFORM WILL BE UNINTERRUPTED.
        </p>
      </section>

      {/* SECTION 9 */}
      <section>
        <h2 className={styles.heading}>
          9. Limitation of Liability &amp; Liquidated Damages Cap ($50 USD / ₦75,000 NGN)
        </h2>
        <div className={styles.warningBox}>
          TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE LAW, IN NO EVENT SHALL PAAYH, ITS FOUNDERS, DIRECTORS,
          OFFICERS, EMPLOYEES, AFFILIATES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, SPECIAL, INCIDENTAL,
          CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES (INCLUDING LOSS OF PROFITS, ANTICIPATED EARNINGS, DATA,
          GOODWILL, OR BUSINESS INTERRUPTION).
          <br />
          <br />
          IF A COURT OR TRIBUNAL OF COMPETENT JURISDICTION FINDS PAAYH LIABLE FOR ANY REASON ARISING OUT OF OR IN
          CONNECTION WITH THESE TERMS OR THE SERVICES, PAAYH&apos;S TOTAL, AGGREGATE, AND CUMULATIVE MONETARY LIABILITY
          SHALL BE STRICTLY LIMITED TO LIQUIDATED DAMAGES NOT EXCEEDING THE LESSER OF: (A) THE TOTAL FEES ACTUALLY PAID
          BY YOU TO PAAYH IN THE THREE (3) MONTHS PRECEDING THE CLAIM; OR (B) FIFTY UNITED STATES DOLLARS ($50.00 USD)
          OR ITS DIRECT EQUIVALENT IN NIGERIAN NAIRA OF SEVENTY FIVE THOUSAND NAIRA (₦75,000.00 NGN).
          <br />
          <br />
          SPECIFIC DISCLAIMER REGARDING USERNAMES &amp; EMAIL PRIVACY: YOUR @USERNAME IS WHAT PEOPLE SEE ON THE FEED. YOU
          ARE STRICTLY ADVISED TO CHOOSE A USERNAME ENTIRELY DIFFERENT FROM YOUR EMAIL ADDRESS TO SHIELD YOUR EMAIL FROM
          PUBLIC CORRELATION. UNDER NO CIRCUMSTANCES SHALL PAAYH BE LIABLE FOR ANY EXPOSURE OR COMPROMISE RESULTING FROM
          CHOOSING AN EMAIL OR PERSONAL IDENTIFIER AS YOUR USERNAME.
        </div>
      </section>

      {/* SECTION 10 */}
      <section>
        <h2 className={styles.heading}>10. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless Paayh, its officers, directors, employees, and agents against
          any claims, liabilities, damages, losses, and legal fees arising out of: (a) your use or misuse of the
          Services; (b) promotional content, links, or media uploaded by your account; (c) any violation of third-party
          intellectual property or advertising laws (including the ARCON Act 2022); or (d) any regulatory fines levied
          against Paayh due to your content.
        </p>
      </section>

      {/* SECTION 11 */}
      <section>
        <h2 className={styles.heading}>11. Dispute Resolution, Governing Law &amp; Binding Arbitration</h2>
        <p>
          <strong>11.1 Informal Resolution:</strong> Before initiating formal proceedings, you and Paayh agree to attempt
          in good faith to resolve any dispute informally via written notice to <code>legal@paayh.com</code> within
          thirty (30) business days.
        </p>
        <p>
          <strong>11.2 Governing Law:</strong> These Terms and all disputes shall be governed by the laws of the Federal
          Republic of Nigeria, without regard to conflict of law principles.
        </p>
        <p>
          <strong>11.3 Binding Individual Arbitration:</strong> Unresolved disputes shall be settled exclusively by
          final and binding individual arbitration under the Arbitration and Mediation Act 2023 of Nigeria (AMA 2023)
          seated in Abuja (FCT), Nigeria, in English.
        </p>
        <p>
          <strong>11.4 Class Action Waiver &amp; Jurisdiction:</strong> Claims may be brought only in an individual
          capacity and not in any class or representative proceeding. Courts of competent jurisdiction in Abuja (FCT),
          Nigeria, hold exclusive jurisdiction over permitted court actions, award enforcement, and qualifying Small
          Claims Court filings.
        </p>
      </section>

      {/* SECTION 12 */}
      <section id="aml-policy">
        <h2 className={styles.heading}>
          12. Anti-Money Laundering (AML), Counter-Terrorist Financing (CFT), Sanctions &amp; KYC Compliance
        </h2>
        <p>
          <strong>12.1 Regulatory Framework:</strong> Paayh strictly complies with the Money Laundering (Prevention and
          Prohibition) Act 2022, the Terrorism (Prevention and Prohibition) Act 2022, SCUML, NFIU, and applicable CBN
          regulations.
        </p>
        <div className={styles.noticeBox}>
          <strong>12.2 Strict Prohibition on Deposit-to-Withdraw &amp; Refund Schemes:</strong> Paayh is an attention and
          content exchange platform, NOT a banking institution or remittance service. Funds paid for promotions can NEVER
          be withdrawn as cash or refunded to bank accounts under any circumstance.
        </div>
        <ul className={styles.list} style={{ marginTop: "0.75rem" }}>
          <li className={styles.listItem}>
            All withdrawable funds must strictly originate from verified attention incentive rewards earned through active
            human engagement or authorized direct referral rewards.
          </li>
          <li className={styles.listItem}>
            Withdrawable earnings may be disbursed only to a verified Nigerian settlement bank account (NUBAN) via
            Paystack or Korapay, or transferred peer-to-peer inside the platform using your mandatory 4-digit Wallet PIN.
          </li>
          <li className={styles.listItem}>
            <strong>Multi-Currency Display &amp; Nigerian Settlement Rails:</strong> International balances display in USD
            at the reference rate ($1.00 USD = ₦1,500 NGN), while all underlying ledgers and payouts settle in NGN
            through Paystack or Korapay clearing rails.
          </li>
        </ul>
        <p>
          <strong>12.3 KYC Audits &amp; Economic Sanctions:</strong> Paayh and its settlement partners may require
          identity verification prior to approving payouts, freeze suspicious balances, report activity to the NFIU, and
          bar sanctioned persons (OFAC, UN, EU, UK, Nigeria).
        </p>
      </section>

      {/* SECTION 13 */}
      <section>
        <div className={styles.noticeBox} style={{ marginBottom: "1.5rem" }}>
          <strong>APPLE INC. &amp; GOOGLE LLC NON-AFFILIATION DISCLAIMER:</strong> Neither Apple Inc. nor Google LLC
          (Alphabet Inc.) is a sponsor of, affiliated with, or responsible for administering or maintaining the Paayh
          application, rewards, promotions, campaigns, or payouts.
        </div>
        <h2 className={styles.heading}>13. General Provisions</h2>
        <p>
          <strong>13.1 Modifications &amp; Entire Agreement:</strong> Paayh may update these Terms at any time; continued
          use constitutes acceptance. Together with our{" "}
          <Link href="/privacy" className={styles.link}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/cookies" className={styles.link}>
            Cookie Policy
          </Link>
          , these Terms form the entire agreement. Formal legal notices may be sent to <code>legal@paayh.com</code> or
          our{" "}
          <Link href="/help" className={styles.link}>
            Help Center
          </Link>
          .
        </p>
      </section>

      <div className={styles.warningBox}>
        <strong>NOTICE REGARDING DISPUTE RESOLUTION &amp; LIABILITY LIMITATION:</strong> Section 9 contains an exclusive
        aggregate liability cap limiting Paayh&apos;s maximum cumulative liability to Fifty United States Dollars ($50.00
        USD) or Seventy Five Thousand Naira (₦75,000.00 NGN). Section 11 contains a mandatory individual arbitration
        agreement and class action waiver under AMA 2023.
      </div>
    </>
  );
}
