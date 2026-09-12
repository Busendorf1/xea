"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function AdvertiserGuidelinesPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Advertising &amp; Content Guidelines</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: September 12, 2026 | Effective Date: September 12, 2026</em>
        </p>

        <div className={styles.noticeBox}>
          These Advertising &amp; Content Guidelines govern all commercial campaigns, interactive feed ads, promotional
          links, and sidebar Highlights published on Paayh. By submitting a campaign, you agree to comply with these
          standards and our{" "}
          <Link href="/terms" className={styles.link}>
            Terms of Service
          </Link>
          .
        </div>

        <div className={styles.warningBox}>
          <strong>IMPORTANT NOTICE ON FEES &amp; REGULATORY COMPLIANCE:</strong> All campaign payments represent
          non-refundable digital infrastructure, queue distribution, and hosting fees. Paayh operates as an
          intermediary platform and enforces a strict notice-and-takedown protocol under the Advertising Regulatory
          Council of Nigeria (ARCON) Act 2022.
        </div>

        <hr className={styles.divider} />

        {/* SECTION 1 */}
        <section>
          <h2 className={styles.heading}>1. Platform Role: Neutral Intermediary</h2>
          <p>
            Paayh is an attention exchange technology platform that provides algorithmic delivery channels connecting
            publishers with real users. Paayh is not an advertising agency, creative production studio, or co-sponsor of
            advertiser offerings.
          </p>
          <p>
            All creatives, images, copy, links, and products submitted by advertisers are classified as{" "}
            <strong>User-Generated Promotional Content and Sponsored Posts</strong>. Advertisers bear sole legal
            responsibility for the truthfulness, legality, and claims made within their materials.
          </p>
        </section>

        {/* SECTION 2 */}
        <section>
          <h2 className={styles.heading}>2. Regulatory Standards &amp; ARCON Compliance</h2>
          <p>
            All promotional content directed at users in Nigeria must strictly conform to:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>The Advertising Regulatory Council of Nigeria (ARCON) Act 2022;</li>
            <li className={styles.listItem}>The Nigerian Code of Advertising Practice, Sales Promotion and Other Rights;</li>
            <li className={styles.listItem}>The Federal Competition and Consumer Protection Act (FCCPA 2018); and</li>
            <li className={styles.listItem}>All applicable sectoral consumer protection laws and standards.</li>
          </ul>
          <p>
            Advertisers represent and warrant that all required statutory approvals, permits, and clearances have been
            obtained prior to campaign launch, and agree to produce copies of such permits upon request by Paayh or
            regulatory authorities.
          </p>
        </section>

        {/* SECTION 3 */}
        <section>
          <h2 className={styles.heading}>3. Strictly Prohibited Content Categories</h2>
          <p>
            Paayh maintains a zero-tolerance policy toward harmful, unlawful, or deceptive content. The following
            categories are <strong>strictly prohibited</strong>:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Deceptive &amp; Fraudulent Schemes:</strong> False promises of guaranteed returns, Ponzi/pyramid
              schemes, fabricated customer reviews, fake celebrity endorsements, or deceptive MLM solicitations.
            </li>
            <li className={styles.listItem}>
              <strong>Counterfeits &amp; IP Infringement:</strong> Knockoff luxury items, unauthorized replicas, pirated
              media, stolen software keys, or trademark infringement.
            </li>
            <li className={styles.listItem}>
              <strong>Adult &amp; Sexually Explicit Material:</strong> Pornography, escort services, sexually provocative
              imagery, or explicit dating solicitations.
            </li>
            <li className={styles.listItem}>
              <strong>Weapons &amp; Explosives:</strong> Firearms, ammunition, tactical combat knives, fireworks,
              explosives, or weapon modification kits.
            </li>
            <li className={styles.listItem}>
              <strong>Illegal &amp; Unapproved Substances:</strong> Illicit narcotics, prescription medications without
              valid regulatory approval (e.g. NAFDAC), non-compliant dietary supplements making unsubstantiated medical
              cures, or drug paraphernalia.
            </li>
            <li className={styles.listItem}>
              <strong>Unlicensed Betting &amp; Predatory Lending:</strong> Unlicensed sports betting, illegal casino
              solicitations, loan-sharking apps, or predatory credit schemes.
            </li>
            <li className={styles.listItem}>
              <strong>Malware &amp; Phishing:</strong> Links redirecting to spyware, credential harvesting sites, auto-download
              malware, or unauthorized browser hijackers.
            </li>
            <li className={styles.listItem}>
              <strong>Hate Speech &amp; Violence:</strong> Content promoting discrimination, ethnic bigotry, terrorism,
              harassment, or violent extremism.
            </li>
          </ul>
        </section>

        {/* SECTION 4 */}
        <section>
          <h2 className={styles.heading}>4. Restricted &amp; Regulated Categories</h2>
          <p>
            The following categories may be run on Paayh only if the advertiser holds valid statutory licenses and
            provides verifiable proof of compliance:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Financial Services &amp; FinTech:</strong> Must be licensed by the Central Bank of Nigeria (CBN),
              SEC, or relevant banking regulator.
            </li>
            <li className={styles.listItem}>
              <strong>Healthcare &amp; Pharmaceuticals:</strong> Must hold valid NAFDAC certification and appropriate
              pre-vetting approval.
            </li>
            <li className={styles.listItem}>
              <strong>Political Content:</strong> Must clearly disclose the sponsoring committee or candidate and
              strictly observe statutory campaign blackout periods.
            </li>
          </ul>
        </section>

        {/* SECTION 5 */}
        <section>
          <h2 className={styles.heading}>5. Fast Notice-and-Takedown Protocol</h2>
          <p>
            Paayh acts swiftly upon receiving formal notice from ARCON, consumer protection agencies (FCCPC), law
            enforcement, or intellectual property rights holders:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Immediate Suspension:</strong> Violating campaigns will be throttled or removed immediately from
              the active delivery queue without prior warning.
            </li>
            <li className={styles.listItem}>
              <strong>No Liability to Advertiser:</strong> Paayh bears zero liability to the advertiser for lost
              impressions, sales, or business interruption arising from good-faith compliance with regulatory takedown
              demands.
            </li>
          </ul>
        </section>

        {/* SECTION 6 */}
        <section>
          <h2 className={styles.heading}>6. Non-Refundable Infrastructure Compensation Policy</h2>
          <div className={styles.warningBox}>
            <strong>STRICT NO-REFUND POLICY:</strong> All payments made to Paayh for interactive feed campaigns, clicks,
            impressions, or 24-hour Highlights represent consumable service fees for digital infrastructure
            provisioning, algorithmic audience placement, and server capacity already consumed upon campaign launch.
            <br />
            <br />
            Campaign fees are 100% strictly non-refundable under all circumstances, including voluntary campaign
            cancellation, advertiser error, or regulatory takedown. Advertisers are advised to test creatives with small,
            affordable amounts before scaling up their advertising budget.
          </div>
        </section>

        {/* SECTION 7 */}
        <section>
          <h2 className={styles.heading}>7. Advertiser Indemnification</h2>
          <p>
            Advertisers agree to defend, indemnify, and hold harmless Paayh, its founders, and affiliates from and against
            all claims, damages, liabilities, and expenses (including reasonable legal fees and regulatory fines levied
            by ARCON or other authorities) resulting directly or indirectly from their promotional content.
          </p>
        </section>

        {/* SECTION 8 */}
        <section>
          <h2 className={styles.heading}>8. Reporting Non-Compliant Ads</h2>
          <p>
            Users and regulatory bodies can report violating campaigns directly to:
          </p>
          <p>
            Email: <code>ad-compliance@paayh.com</code> or <code>legal@paayh.com</code>
            <br />
            Help Desk:{" "}
            <Link href="/help" className={styles.link}>
              Report an Ad via Help Center
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
