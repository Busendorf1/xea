"use client";

import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function TermsPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Terms of Service</h1>
        <p className={styles.updatedDate}>
          <em>Last Updated: September 12, 2026 | Effective Date: September 12, 2026</em>
        </p>

        <div className={styles.noticeBox}>
          <strong>PLEASE READ THESE TERMS CAREFULLY.</strong> By accessing or using Paayh, creating an account,
          publishing promotional content, or participating in attention monetization, you agree to be bound by these
          Terms of Service and all incorporated policies, including our{" "}
          <Link href="/privacy" className={styles.link}>
            Privacy Policy
          </Link>
          . If you do not agree to these Terms, you must not access or use our Services.
        </div>

        <hr className={styles.divider} />

        {/* SECTION 1 */}
        <section>
          <h2 className={styles.heading}>1. Eligibility and Account Management</h2>
          <p>
            <strong>1.1 Legal Capacity:</strong> You may use the Services only if you have the legal capacity to form a
            binding contract with Paayh and are not barred from receiving services under applicable law. You must be at
            least <strong>18 years of age</strong> to register an account, launch campaigns, or earn attention rewards.
          </p>
          <p>
            <strong>1.2 Account Security:</strong> Paayh utilizes federated authentication (including Google OAuth via
            Auth0). You agree to provide accurate registration information and are strictly prohibited from operating
            multiple accounts to inflate monetization metrics. You are solely responsible for maintaining the
            confidentiality of your credentials and session. Paayh bears zero liability for disbursements or actions
            executed through an authenticated session.
          </p>
          <p>
            <strong>1.3 Non Transferability:</strong> Accounts, credentials, and accrued incentive balances are personal
            and non transferable without Paayh&apos;s express prior written consent.
          </p>
        </section>

        {/* SECTION 2 */}
        <section>
          <h2 className={styles.heading}>2. The Paayh Platform: Intermediary Content &amp; Attention Exchange</h2>
          <p>
            Paayh operates as an <strong>intermediary digital technology and content delivery platform</strong> that
            connects commercial businesses and content creators with real users who voluntarily choose to provide their
            focused human attention.
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Neutral Intermediary Status:</strong> Paayh is not an advertising agency, publisher of record, or
              media production house. All creative assets, feed promotions, banners, links, and highlights submitted by
              users or businesses constitute <strong>User Generated Promotional Content and Sponsored Posts</strong>.
            </li>
            <li className={styles.listItem}>
              <strong>No Endorsement:</strong> Paayh does not author, verify, endorse, or guarantee the claims, safety,
              or quality of any promoted goods, services, or links.
            </li>
            <li className={styles.listItem}>
              <strong>Good Faith Attention &amp; Consumer Sovereignty (Right Not to Patronize):</strong> Users contract and agree
              to view and evaluate promotional content with genuine goodwill and focused human attention in exchange for earning
              incentive credits. However, users maintain absolute, sovereign freedom of choice: you are under zero obligation,
              compulsion, or requirement to patronize, purchase from, subscribe to, or transact with any advertiser. Patronage is
              entirely voluntary; you may choose to patronize an advertiser if an offer resonates with you, or choose not to
              patronize for any reason whatsoever.
            </li>
            <li className={styles.listItem}>
              <strong>Advertiser Non Recourse &amp; Disclaimer of Platform Liability:</strong> Commercial advertisers and content
              publishers explicitly agree that users shall never be held liable, answerable, or subject to grievance for choosing
              not to purchase, convert, or engage beyond initial attention, nor for their personal level of interest in any creative.
              If a user voluntarily transacts with or purchases from an advertiser, that agreement and commercial relationship exists
              strictly and exclusively between the user and the advertiser. Users are strongly advised and urged to independently
              read and review the advertiser&apos;s separate terms of service, privacy policy, refund policy, and credentials before
              transacting, paying, or patronizing them. Paayh is not a party to any resulting transaction and shall have zero
              responsibility, warranty, or liability for product quality, fulfillment, refunds, merchant misrepresentations, or transaction outcomes.
            </li>
          </ul>
        </section>

        {/* SECTION 3 */}
        <section>
          <h2 className={styles.heading}>3. Attention Monetization, Incentive Credits &amp; Payout Terms</h2>
          <p>
            <strong>3.1 Voluntary Participation &amp; Interaction Tracking:</strong> Monetization is completely optional
            and free of any subscription fees. To activate monetization, an account must demonstrate clear, consistent
            engagement or accumulate at least <strong>300 verified interactions (&quot;Seen&quot; or &quot;Mutual&quot;)</strong>.
            For clarity, a verified &quot;Seen&quot; interaction is registered whenever promotional content or an ad card
            is rendered within your active viewport or scrolled past in the feed during regular human browsing.
          </p>
          <p>
            <strong>3.2 Legal Nature of Earnings: Discretionary Promotional Incentive Credits:</strong> All earnings,
            wallet figures, and monetary amounts displayed on your dashboard represent{" "}
            <strong>conditional, unvested promotional incentive credits</strong> granted solely at Paayh&apos;s discretion,
            and NOT legal tender, fiat currency, personal property, bank deposits, escrow balances, wages, or debt obligations
            owed to you. Credits remain the conditional promotional property of the platform until a redemption payout is
            formally approved, processed, and disbursed by Paayh.
          </p>
          <p>
            <strong>3.2.1 Unilateral Discretion to Withhold, Adjust, or Cancel Credits:</strong> To protect platform integrity
            and solvency against unforeseen technical failures or fraud, Paayh reserves the absolute, unilateral discretion
            to withhold, freeze, recalculate, adjust, or cancel unredeemed credits at any time without prior notice, liability,
            or obligation to pay compensation. This includes, without limitation: instances of bot or invalid traffic, unexplained
            accounting or ledger anomalies, catastrophic database failures, unexpected liquidity shortfalls, security incidents,
            or terms violations. Paayh is under no legal obligation to disclose internal forensics, proprietary fraud detection
            algorithms, or investigation details to users.
          </p>
          <div className={styles.noticeBox} style={{ margin: "1rem 0" }}>
            <strong>MANDATORY PARTICIPATION CONDITION:</strong> The accrual, holding, and redemption of promotional incentive
            credits is entirely conditional and subject to platform solvency and verification. IF YOU DO NOT AGREE TO THESE
            TERMS, INCLUDING PAAYH&apos;S UNILATERAL DISCRETION REGARDING PROMOTIONAL INCENTIVE CREDITS, YOU MAY NOT USE OR
            PARTICIPATE IN THE SERVICES.
          </div>
          <p>
            <strong>3.3 Revenue Share, Attention Worth Tier (ATW) Engine &amp; Overflow Forfeiture:</strong>
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              Eligible monetized users earn a dynamic variable revenue share ranging up to <strong>sixty percent (60%)</strong> of
              the net promotional revenue directly generated by confirmed, genuine human impressions. Revenue share
              percentages are dynamic and not fixed; they may adjust based on platform liquidity, advertiser campaign budgets,
              and network health. Paayh retains the remainder to cover digital hosting infrastructure, payment processor gateway
              fees, and administrative operations.
            </li>
            <li className={styles.listItem}>
              <strong>Prompt Redemption Mandate &amp; Anti Hoarding Directive:</strong> Paayh is NOT a bank, electronic wallet,
              savings depository, or store of value. Users are strongly urged, instructed, and warned to always withdraw their
              incentives promptly as soon as the minimum settlement threshold (₦10,000) is reached and to maintain minimal balances
              at all times. Maintaining low balances is your primary personal safeguard against unforeseen technical anomalies,
              system resets, or security events.
            </li>
            <li className={styles.listItem}>
              <strong>ATW Tier Ceiling &amp; Voluntary Overflow Forfeiture:</strong> Paayh maintains a strict <strong>Attention
              Worth Tier (ATW) Engine</strong> (scaled from Level 1 &quot;ATW1&quot; to Level 3 &quot;ATW3&quot;) with hard balance
              holding caps: <strong>₦30,000 [approx. $20 USD] at ATW1</strong>, <strong>₦60,000 [approx. $40 USD] at ATW2</strong>,
              and a maximum cap of <strong>₦90,000 [approx. $60 USD] at ATW3</strong>. <em>(Note: The ATW tier structure exists
              exclusively to enforce wallet balance holding caps and ensure users maintain low balances to protect platform solvency).</em>
              If an account reaches its ATW holding cap and incentives are not withdrawn, any subsequent impressions, clicks, or
              engagement are <strong>voluntarily surrendered and permanently forfeited to platform liquidity</strong>. Forfeited
              overflow does not queue, accrue, or back credit. Balance accumulation resumes only after a withdrawal is executed
              to reduce the wallet below the ATW ceiling.
            </li>
            <li className={styles.listItem}>
              <strong>User Assumption of Risk for Unredeemed Credits:</strong> Paayh explicitly operates to facilitate rapid,
              continuous redemptions. If unredeemed incentive credits are adjusted, reduced, or lost due to technical anomalies,
              ledger corruption, database recovery events, or discretionary platform actions for which Paayh elects not to provide
              forensic disclosures, users who neglected to execute prompt withdrawals assume full personal risk and agree that
              Paayh shall bear zero liability or obligation to reinstate such unredeemed credits, having been expressly notified
              and warned.
            </li>
          </ul>
          <p>
            <strong>3.4 Withdrawal Mechanics &amp; Security:</strong>
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Minimum Settlement Threshold &amp; Currency Localization:</strong> Incentive credits may be redeemed
              for fiat payout once an account reaches the minimum threshold of <strong>Ten Thousand Nigerian Naira (₦10,000.00 NGN)</strong>.
              All monetary thresholds, incentive balances, and withdrawal options automatically adjust and localize to your
              geographical jurisdiction and local currency equivalents based on prevailing international exchange rates.
            </li>
            <li className={styles.listItem}>
              <strong>Flexible Balance Withdrawals:</strong> Users may withdraw any amount from ₦10,000 up to their full
              available balance (including withdrawing 100% of accumulated incentives down to ₦0.00). Requested amounts are
              deducted from the wallet balance, leaving any remainder preserved for future redemptions.
            </li>
            <li className={styles.listItem}>
              <strong>Phone Verification &amp; Account Security:</strong> To prevent fraud and ensure authorized disbursements,
              withdrawals require entering a phone number strictly matching the verified phone registered to your account
              profile. Paayh does not permanently store banking details on user profile records and does not restrict
              withdrawals to a single static bank account, granting users flexibility across verified accounts. You agree to
              keep all account login credentials and personal devices secure; Paayh shall not be held liable for payouts
              disbursed to banking details submitted through an authenticated account session.
            </li>
          </ul>
        {/* PLATFORM INACTIVITY MANAGEMENT GUIDELINES */}
        <section id="inactivity-guidelines" style={{ scrollMarginTop: "2rem" }}>
          <h3 className={styles.subheading} style={{ fontSize: "1.25rem", color: "var(--primary)" }}>
            3.5 Platform Inactivity Management Guidelines &amp; Dormant Credit Expiration
          </h3>
          <div className={styles.noticeBox} style={{ margin: "0.75rem 0" }}>
            <strong>OFFICIAL GUIDELINE:</strong> Paayh enforces automated platform inactivity management protocols to
            maintain active listener pools for advertisers, prevent stale ledger buildup, and reallocate unserved ad
            queues to verified active users.
          </div>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>7 Day Monetization Reset:</strong> If an account records zero engagement for seven (7) consecutive
              calendar days, monetization status is automatically revoked and monetization clicks reset to zero.
              Unserved campaign queues allocated to inactive accounts are dynamically reassigned to active listeners.
              Accrued wallet balances remain fully untouched and preserved. The user may requalify under prevailing
              criteria at any time.
            </li>
            <li className={styles.listItem}>
              <strong>60 Day Dormant Account &amp; Credit Forfeiture:</strong> Accounts that remain completely dormant
              with zero login or interaction events for sixty (60) consecutive calendar days shall forfeit all unclaimed
              incentive credits and rewards, and the account balance will be automatically zeroed out to cover dormant
              ledger maintenance and platform resource reservation. Because incentive credits are unvested promotional
              units and not deposited property or legal tender, no conversion, escheatment, or property claim arises
              from their expiration.
            </li>
            <li className={styles.listItem}>
              <strong>In App Tracking &amp; Notice:</strong> Paayh provides real time in app dashboard indicators and
              warning notices displaying ongoing inactivity days, affording users ample opportunity to log in, view
              content, or initiate a withdrawal before the 60 day threshold is reached.
            </li>
          </ul>
        </section>
        </section>

        {/* SECTION 4 */}
        <section>
          <h2 className={styles.heading}>
            4. Promotional Content, Regulatory Notice and Takedown &amp; Strict Non Refundable Policy
          </h2>
          <p>
            <strong>4.1 Campaign Delivery &amp; Highlights:</strong> Advertisers and creators may publish standard
            interactive feed posts (supporting text, media, and video) or short flash &quot;Highlights&quot;
            (which rotate every 10 minutes and expire automatically 24 hours following launch).
          </p>
          <p>
            <strong>4.2 Regulatory Compliance (ARCON &amp; Consumer Laws):</strong> Users publishing promotional content
            represent and warrant that their creatives comply with all applicable laws, including the Advertising
            Regulatory Council of Nigeria (ARCON) Act 2022, consumer protection regulations, and intellectual property
            statutes.
          </p>
          <p>
            <strong>4.3 Notice and Takedown Protocol:</strong> Paayh operates as an intermediary content hosting
            service. If ARCON, an authorized government regulator, or a third party rights holder submits a valid
            infringement or regulatory complaint regarding any content, Paayh reserves the absolute right to
            immediately throttle, suspend, or permanently remove the creative without prior notice or liability.
          </p>
          <p>
            <strong>4.4 Strict Non Refundable Policy (Infrastructure Compensation):</strong>
          </p>
          <div className={styles.warningBox}>
            ALL PAYMENTS MADE TO PAAYH FOR ADVERTISING CAMPAIGNS, PROMOTIONAL SLOTS, OR HIGHLIGHTS CONSTITUTE
            CONSUMABLE SERVICE FEES FOR IMMEDIATE DIGITAL INFRASTRUCTURE PROVISIONING, BANDWIDTH CONSUMPTION, ALGORITHMIC
            QUEUE PLACEMENT, AND SYSTEM RESERVATION. ALL CAMPAIGN PAYMENTS ARE 100% STRICTLY NON REFUNDABLE UNDER ANY
            AND ALL CIRCUMSTANCES, INCLUDING CAMPAIGN CANCELLATION, REGULATORY TAKEDOWN (BY ARCON OR OTHER AUTHORITIES),
            OR ACCOUNT SUSPENSION. USERS AND ADVERTISERS ARE EXPRESSLY ADVISED TO TEST PROMOTIONS WITH SMALL AMOUNTS
            THEY CAN COMFORTABLY AFFORD BEFORE COMMITTING LARGER BUDGETS.
          </div>
          <p style={{ marginTop: "1rem" }}>
            <strong>4.5 Prohibited Content Categories:</strong> You agree not to upload, promote, or link to deceptive
            schemes, counterfeit goods, adult/pornographic content, firearms/weapons, illegal substances, unapproved
            pharmaceuticals, unlicensed betting solicitations, malware, phishing links, or hate speech.
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
            assets on the Services, you grant Paayh a worldwide, non exclusive, royalty free, transferable, sublicensable
            license to host, store, cache, format, distribute, and display such materials across our web and mobile
            infrastructure solely for the operation and promotion of the Services.
          </p>
        </section>

        {/* SECTION 6 */}
        <section>
          <h2 className={styles.heading}>6. Platform Integrity &amp; Abuse Prevention Standards</h2>
          <p>
            Paayh maintains automated heuristics and manual oversight to safeguard platform integrity. The following
            actions constitute actionable civil fraud against Paayh:
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>Automated Viewing:</strong> Utilizing bots, headless browsers, automated scripts, auto clickers, or
              emulators to simulate attention or solve verification challenges.
            </li>
            <li className={styles.listItem}>
              <strong>Click Farming:</strong> Participating in coordinated engagement rings, incentivized mutual traffic
              groups, or sybil networks.
            </li>
            <li className={styles.listItem}>
              <strong>Circumvention:</strong> Tampering with session tokens, request headers, application encryption, or
              impression verification endpoints.
            </li>
            <li className={styles.listItem}>
              <strong>Cloning, Scraping &amp; Reverse Engineering:</strong> Decompiling, reverse engineering, disassembling,
              scraping, cloning, mirroring, copying, or reproducing any portion of Paayh&apos;s user interface, source code,
              APIs, the ATW Engine, or proprietary systems.
            </li>
            <li className={styles.listItem}>
              <strong>Service Disruption &amp; Traffic Diversion:</strong> Intentionally diverting traffic, spoofing DNS or
              network headers, executing Denial of Service (DoS/DDoS) attacks, injecting unauthorized scripts or advertisements,
              or otherwise interfering with, overloading, or disrupting the normal operation and performance of Paayh services.
            </li>
          </ul>
          <p>
            Any violation results in immediate, permanent account termination, cancellation of active promotions, and
            complete forfeiture of all unredeemed incentive credits.
          </p>
        </section>

        {/* SECTION 7 */}
        <section>
          <h2 className={styles.heading}>7. Account Deletion &amp; Termination</h2>
          <p>
            You may deactivate or request deletion of your account at any time through your dashboard settings or the{" "}
            <Link href="/help" className={styles.link}>
              Help Center
            </Link>
            . If you authenticated using Google OAuth, you may also revoke token permissions via Google Security
            Settings. Upon deletion, your personal data will be purged in accordance with our{" "}
            <Link href="/privacy" className={styles.link}>
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        {/* SECTION 8 */}
        <section>
          <h2 className={styles.heading}>8. Disclaimers of Warranties</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES, MONETIZATION TOOLS, WALLET INTERFACES, AND THE ATW
            ENGINE ARE PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY
            KIND.
          </p>
          <p>
            PAAYH EMPLOYS COMMERCIALLY REASONABLE EFFORTS TO DELIVER VERIFIED HUMAN ENGAGEMENT, WITH AN OPERATIONAL TARGET
            DELIVERABILITY OF UP TO 99.99% TO REAL ACTIVE USERS. HOWEVER, PAAYH EXPRESSLY DISCLAIMS ALL WARRANTIES,
            WHETHER STATUTORY, EXPRESS, OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE, AND NON INFRINGEMENT. PAAYH DOES NOT WARRANT THAT PROMOTIONAL CAMPAIGNS WILL PRODUCE SPECIFIC SALES,
            CONVERSIONS, OR COMMERCIAL ROI, OR THAT THE PLATFORM WILL OPERATE UNINTERRUPTED OR ERROR FREE.
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
            CONNECTION WITH THESE TERMS OR THE SERVICES, PAAYH&apos;S TOTAL, AGGREGATE, AND CUMULATIVE MONETARY
            LIABILITY SHALL BE STRICTLY LIMITED TO LIQUIDATED DAMAGES NOT EXCEEDING THE LESSER OF: (A) THE TOTAL FEES
            ACTUALLY PAID BY YOU TO PAAYH IN THE THREE (3) MONTHS PRECEDING THE CLAIM; OR (B) FIFTY UNITED STATES
            DOLLARS ($50.00 USD) OR ITS DIRECT EQUIVALENT IN NIGERIAN NAIRA OF SEVENTY FIVE THOUSAND NAIRA (₦75,000.00
            NGN).
            <br />
            <br />
            BY ACCESSING THE SERVICES, YOU EXPRESSLY AGREE THAT THIS LIQUIDATED DAMAGES CAP IS FAIR AND COMMERCIALLY
            REASONABLE, AND YOU IRREVOCABLY WAIVE AND FORFEIT ANY RIGHT TO CLAIM DAMAGES IN EXCESS OF THIS MAXIMUM
            AMOUNT. IF YOU DO NOT AGREE TO THIS LIMITATION, YOU MUST CEASE ALL ACCESS TO AND USE OF PAAYH IMMEDIATELY.
          </div>
        </section>

        {/* SECTION 10 */}
        <section>
          <h2 className={styles.heading}>10. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless Paayh, its officers, directors, employees, and agents
            against any and all claims, liabilities, damages, losses, and expenses (including reasonable legal fees)
            arising out of or in any way connected with: (a) your use or misuse of the Services; (b) promotional
            content, links, or media uploaded by your account; (c) any violation of third party intellectual property or
            advertising laws (including the ARCON Act 2022); or (d) any regulatory fines levied against Paayh due to
            your content.
          </p>
        </section>

        {/* SECTION 11 */}
        <section>
          <h2 className={styles.heading}>11. Dispute Resolution, Governing Law &amp; Binding Arbitration</h2>
          <p>
            <strong>11.1 Informal Resolution:</strong> Before initiating formal proceedings, you and Paayh agree to
            attempt in good faith to resolve any dispute informally. Written notice detailing the dispute must be
            submitted to <code>legal@paayh.com</code>. Paayh will endeavor to resolve the issue within thirty (30)
            business days.
          </p>
          <p>
            <strong>11.2 Governing Law:</strong> These Terms and all disputes shall be governed by, construed, and
            enforced under the substantive laws of the Federal Republic of Nigeria, without regard to conflict of law
            principles.
          </p>
          <p>
            <strong>11.3 Binding Individual Arbitration:</strong> If unresolved informally, disputes shall be settled
            exclusively by final and binding individual arbitration administered under the Arbitration and Mediation Act
            2023 of Nigeria (AMA 2023). The seat of arbitration shall be Abuja (Federal Capital Territory), Nigeria,
            conducted in English by a single independent arbitrator mutually appointed, or, failing agreement, appointed
            by the Chairman of the Chartered Institute of Arbitrators (CIArb, Nigeria Branch).
          </p>
          <p>
            <strong>11.4 Class Action Waiver:</strong> YOU AND PAAYH AGREE THAT CLAIMS MAY BE BROUGHT ONLY IN AN
            INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS, CONSOLIDATED, OR REPRESENTATIVE
            PROCEEDING.
          </p>
          <p>
            <strong>11.5 Jurisdiction &amp; Small Claims Exception:</strong> The courts of competent jurisdiction
            located in Abuja (Federal Capital Territory), Nigeria, shall have exclusive judicial jurisdiction over any
            permitted court actions, enforcement of arbitral awards, or claims. Notwithstanding Section 11.3, either
            party may file an individual action in a Small Claims Court of competent jurisdiction in Abuja (Federal
            Capital Territory), Nigeria, for claims falling within that court&apos;s monetary jurisdictional limits.
          </p>
        </section>

        {/* SECTION 12 */}
        <section>
          <h2 className={styles.heading}>
            12. Anti Money Laundering (AML), Counter Terrorist Financing (CFT), Sanctions &amp; KYC Compliance
          </h2>
          <p>
            <strong>12.1 Regulatory Framework:</strong> Paayh strictly complies with the Money Laundering (Prevention
            and Prohibition) Act 2022, the Terrorism (Prevention and Prohibition) Act 2022, the Special Control Unit
            against Money Laundering (SCUML), the Nigerian Financial Intelligence Unit (NFIU), and applicable Central
            Bank of Nigeria (CBN) regulations.
          </p>
          <p>
            <strong>12.2 Strict Prohibition on Deposit to Withdraw &amp; Refund Schemes:</strong>
          </p>
          <div className={styles.noticeBox}>
            Paayh is an attention and content exchange platform, NOT a banking institution, deposit taking entity, or
            remittance service. You are strictly prohibited from depositing funds with the intention of withdrawing
            them, paying for promotions and requesting refunds, or cancelling campaigns to extract capital. To prevent
            micro structuring, capital laundering, and illicit fund layering, funds paid for promotions can NEVER be
            withdrawn as cash or refunded to bank accounts under any circumstance.
          </div>
          <p style={{ marginTop: "1rem" }}>
            <strong>12.3 Separation of Payouts &amp; Transfer Restrictions:</strong>
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              All withdrawable funds on Paayh must strictly originate from verified attention incentive rewards earned
              through active human engagement with content.
            </li>
            <li className={styles.listItem}>
              Withdrawable earnings may be disbursed only to the user&apos;s verified Nigerian settlement bank account, or
              transferred internally to another registered user inside the platform via verified user email. Accrued
              balances can NEVER be transferred to external third party bank accounts or utilized for third party
              settlement.
            </li>
          </ul>
          <p>
            <strong>12.4 Know Your Customer (KYC) Audits:</strong> Paayh and its settlement gateway partners reserve the
            right to require satisfactory identity verification (such as BVN match, NIN, or government issued ID) prior
            to approving withdrawals. Paayh reserves the unconditioned right to freeze balances, halt payouts, and
            report suspicious financial activity to the NFIU and law enforcement agencies without prior notice or
            liability.
          </p>
          <p>
            <strong>12.5 Global Economic Sanctions:</strong> You warrant that you are not listed on national or
            international sanctions lists (including OFAC, UN Security Council, EU, UK, or Nigerian Sanctions Lists).
          </p>
        </section>

        {/* SECTION 13 */}
        <section>
          <h2 className={styles.heading}>13. General Provisions</h2>
          <p>
            <strong>13.1 Modifications:</strong> Paayh reserves the right to update these Terms at any time. Continued
            use of the Services following posted updates constitutes your binding acceptance.
          </p>
          <p>
            <strong>13.2 Entire Agreement:</strong> These Terms, along with our{" "}
            <Link href="/privacy" className={styles.link}>
              Privacy Policy
            </Link>
            , constitute the entire, exclusive agreement between you and Paayh regarding the Services.
          </p>
          <p>
            <strong>13.3 Contact &amp; Legal Notices:</strong> Formal legal notices must be submitted to{" "}
            <code>legal@paayh.com</code> or via our{" "}
            <Link href="/help" className={styles.link}>
              Help Center
            </Link>
            .
          </p>
        </section>

        <div className={styles.warningBox}>
          <strong>NOTICE REGARDING DISPUTE RESOLUTION &amp; LIABILITY LIMITATION:</strong> Section 10 contains an
          exclusive aggregate liability cap limiting Paayh&apos;s maximum cumulative liability to Fifty United States
          Dollars ($50.00 USD) or its direct equivalent in Nigerian Naira (₦75,000.00 NGN). Section 11 contains a
          mandatory individual arbitration agreement and class action waiver under the Arbitration and Mediation Act
          2023 of Nigeria.
        </div>
      </main>
    </div>
  );
}
