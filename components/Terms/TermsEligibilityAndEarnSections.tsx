import React from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function TermsEligibilityAndEarnSections() {
  return (
    <>
      {/* SECTION 1 */}
      <section>
        <h2 className={styles.heading}>1. Eligibility and Account Management</h2>
        <p>
          <strong>1.1 Legal Capacity:</strong> You may use the Services only if you have the legal capacity to form a
          binding contract with Paayh and are not barred from receiving services under applicable law. You must be at
          least <strong>18 years of age</strong> to register an account, launch campaigns, or earn attention rewards.
        </p>
        <p>
          <strong>1.2 Account Security, Public Handles &amp; Email Privacy:</strong> Paayh utilizes federated
          authentication (including Google OAuth and Sign in with Apple via Auth0, with full support for Apple Private
          Relay addresses). Your registered account email address is kept strictly private for session authentication,
          peer-to-peer wallet routing, and settlement notifications, and is never publicly displayed to other users on
          the promotional feed. Conversely, your chosen <code>@username</code> and optional business name operate as
          your public, unencrypted display handle visible across the platform.{" "}
          <strong>Your @username is what people see on the feed. Keep your email private and never use it as your username.</strong>{" "}
          Sensitive profile fields (such as your phone number and legal first/last name) are encrypted at the
          application layer (<code>AES-256-GCM</code>), while your 4-digit Wallet PIN is irreversibly one-way hashed.{" "}
          <strong>
            You must never share your 4-digit Wallet PIN, OAuth login credentials, or sensitive account recovery details
            (such as your registered email and phone number combination) with any third party.
          </strong>{" "}
          Official Paayh personnel will never ask you for your Wallet PIN. You agree to provide accurate registration
          information, are strictly prohibited from operating multiple accounts to inflate monetization metrics, and
          remain solely responsible for maintaining the confidentiality of your credentials, PIN, and session. Paayh
          bears zero liability for disbursements or actions executed through an authenticated session or resulting from
          your voluntary disclosure of sensitive account details or PINs.
        </p>
        <div className={`${styles.noticeBox} ${styles.noticeBoxMargin}`}>
          <strong>MANDATORY USERNAME ADVISORY &amp; TOTAL LIABILITY DISCLAIMER:</strong> Your{" "}
          <code>@username</code> is what people see on the feed. Keep your email private and never use it as your
          username. It is strongly advised and a strict security requirement that all users choose a unique, pseudonymous{" "}
          <code>@username</code> completely different and decoupled from their registered email address, legal name, or
          personal contact details. Users are explicitly instructed to keep their email concealed and hidden from
          database records, public feeds, community interactions, and third-party web indexes by avoiding any
          correlation between their public handle and their email address. If you choose a username that mirrors,
          contains, resembles, or correlates with your email address or personal identity, or if your email is revealed
          or discovered through your chosen username or public actions,{" "}
          <strong>
            Paayh, its parent entity East Sixties Limited, founders, officers, directors, employees, affiliates, and
            contractors are completely and unconditionally removed and released from all liability, claims, damages,
            losses, or legal recourse of any kind
          </strong>{" "}
          (including but not limited to spam, phishing, identity exposure, doxxing, harassment, cyber-attacks, account
          targeting, or unauthorized third-party disclosures). You assume full, sole, and exclusive responsibility for
          your username selection and the confidentiality of your email.
        </div>
        <p>
          <strong>1.3 Non-Transferability:</strong> Accounts, credentials, and accrued incentive balances are personal
          and non-transferable without Paayh&apos;s express prior written consent.
        </p>
        <p>
          <strong>1.4 Device Location Permissions, Community Geographic Matching &amp; Payout Verification:</strong>{" "}
          Device location processing is utilized to match and deliver physically relevant community content, support
          local businesses, verify regional payout eligibility, and connect commercial sponsors with real audience
          members present in targeted geographical zones. Granting device location permissions is{" "}
          <strong>voluntary</strong> to register and hold an account; however, because sponsored campaigns and local
          community offers are strictly targeted by geographical jurisdiction, state, and city, if you skip or disable
          location permissions, our system cannot match or deliver localized content to your feed (your feed will remain
          empty until location verification is enabled) and regional monetization/settlement verification cannot
          complete. When permitted, Paayh requests device location verification during onboarding and periodically
          recalibrates locality when you travel to ensure accurate regional delivery. Members agree not to employ
          virtual private networks (VPNs), proxies, or spoofing applications to misrepresent geographic location.
        </p>
        <div className={`${styles.noticeBox} ${styles.noticeBoxMargin}`}>
          <strong>LOCATION PERMISSIONS ADVISORY:</strong> Location permissions are voluntary to access account settings
          and profile pages; however, verified geographic location is required to view localized campaigns in your feed
          and qualify for geo-verified monetization and regional payouts.
        </div>
        <p>
          <strong>1.5 Zero Cross-App Tracking &amp; Operating System Tracking Disclaimers (Apple ATT &amp; Google Advertising ID):</strong>{" "}
          Paayh does not engage in cross-app or cross-site tracking, nor do we track your activity across external
          applications or the web to offer you our services. Any tracking permission requested by your device operating
          system (such as Apple&apos;s App Tracking Transparency framework or Google Advertising identifiers) is granted
          voluntarily by you at the device OS level and operates independently of Paayh; it has nothing to do with our
          platform. Feed targeting and ad curation within Paayh are driven strictly by the first-party interest
          categories, voluntary device location, and demographic preferences you voluntarily selected during account
          onboarding, ensuring you only receive content matching your chosen interests. If you enable or permit
          third-party cross-app tracking on your mobile device for other applications, you acknowledge that such tracking
          is strictly between you and those third parties, and Paayh, its directors, and affiliates shall bear zero
          liability or responsibility for any third-party tracking, profiling, or external ad targeting.
        </p>
      </section>

      {/* SECTION 2 */}
      <section>
        <h2 className={styles.heading}>2. The Paayh Platform: Intermediary Content &amp; Attention Exchange</h2>
        <p>
          Paayh operates as an <strong>intermediary digital technology and content discovery platform</strong> that
          connects commercial businesses, creators, and community members:
          <br />
          <strong>(a) Voluntary Promotional Posting &amp; Service Charges:</strong> Submitting promotional content,
          business campaigns, or highlights is completely voluntary. Standard consumable service fees are required to
          cover algorithmic queueing, digital infrastructure provisioning, and audience distribution.
          <br />
          <strong>(b) Voluntary Content Discovery &amp; Attention Rewards:</strong> Viewing content is voluntary, for
          fun, entertainment, and the discovery of products, services, and local community updates. Participating in
          rewards is completely voluntary: users who choose not to claim rewards can freely browse and participate in
          viewing content purely for discovery, while members who voluntarily choose to provide verified human focus
          can receive transparent promotional reward credits funded from the advertiser&apos;s campaign budget.
          <br />
          <strong>(c) Advertiser Awareness &amp; Mutual Understanding:</strong> Commercial advertisers explicitly
          understand and agree that audience members receive a transparent share of the campaign budget for their
          verified attention.
          <br />
          <strong>(d) Absolute Consumer Sovereignty:</strong> Users are never forced, compelled, or obligated to click
          promotional links, patronize advertisers, or make any purchase. Viewing and purchasing decisions remain 100%
          voluntary at all times.
        </p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <strong>Neutral Intermediary Status:</strong> Paayh is not an advertising agency, publisher of record, or
            media production house. All creative assets, feed promotions, banners, links, and highlights submitted by
            users or businesses constitute <strong>User-Generated Promotional Content and Sponsored Posts</strong>.
          </li>
          <li className={styles.listItem}>
            <strong>No Endorsement:</strong> Paayh does not author, verify, endorse, or guarantee the claims, safety, or
            quality of any promoted goods, services, or links.
          </li>
          <li className={styles.listItem}>
            <strong>Good Faith Attention &amp; Consumer Sovereignty (Right Not to Patronize):</strong> Users contract
            and agree to view and evaluate promotional content with genuine goodwill and focused human attention in
            exchange for earning incentive credits. However, users maintain absolute, sovereign freedom of choice: you
            are under zero obligation, compulsion, or requirement to patronize, purchase from, subscribe to, or transact
            with any advertiser. Patronage is entirely voluntary; you may choose to patronize an advertiser if an offer
            resonates with you, or choose not to patronize for any reason whatsoever.
          </li>
          <li className={styles.listItem}>
            <strong>Advertiser Non-Recourse &amp; Disclaimer of Platform Liability:</strong> Commercial advertisers and
            content publishers explicitly agree that users shall never be held liable, answerable, or subject to
            grievance for choosing not to purchase, convert, or engage beyond initial attention, nor for their personal
            level of interest in any creative. If a user voluntarily transacts with or purchases from an advertiser, that
            agreement and commercial relationship exists strictly and exclusively between the user and the advertiser.
            Users are strongly advised and urged to independently read and review the advertiser&apos;s separate terms of
            service, privacy policy, refund policy, and credentials before transacting, paying, or patronizing them.
            Paayh is not a party to any resulting transaction and shall have zero responsibility, warranty, or liability
            for product quality, fulfillment, refunds, merchant misrepresentations, or transaction outcomes.
          </li>
        </ul>
      </section>

      {/* SECTION 3 */}
      <section>
        <h2 className={styles.heading}>3. Attention Monetization, Incentive Credits &amp; Payout Terms</h2>
        <p>
          <strong>3.1 Voluntary Participation &amp; Interaction Tracking:</strong> Monetization and earning rewards are
          completely optional and free of any subscription fees. Users who choose not to earn rewards can freely browse,
          view, and enjoy content across the feed for discovery without participating in monetization or claiming
          credits. To activate monetization, an account must voluntarily choose to participate and accumulate at least{" "}
          <strong>300 verified interactions (&quot;Seen&quot; or &quot;Mutual&quot;)</strong> (or meet authorized
          eligibility criteria). For clarity, a verified &quot;Seen&quot; interaction is registered whenever promotional
          content or an ad card is rendered within your active viewport or interacted with during regular human
          engagement.
        </p>
        <p>
          <strong>3.1.1 Non-Monetized Content Exclusions:</strong> Users cannot earn cash incentives from viewing mutual
          content, official platform updates, platform jingles, special promotional offers, or business daily
          highlights. Mutual content represents reciprocal, unbudgeted free attention slots arranged between members.
          Official platform announcements, system updates, brand jingles, and business daily highlights carry zero
          advertiser impression budget, so no cash credits accrue from them.
        </p>
        <p>
          <strong>3.1.2 Voluntary Monetization Cancellation, Continued Feed Browsing &amp; Reapplication Rules:</strong>{" "}
          Users may voluntarily cancel or opt out of monetization at any time directly from the Monetization settings
          dashboard without penalty or fee. Because platform participation is built entirely around user choice, opting
          out operates under the following rules:
        </p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <strong>Uninterrupted Feed Services &amp; Full Balance Preservation:</strong> You retain complete,
            unrestricted access to browse, discover community promotions, view media, and enjoy all feed services. Any
            promotional incentive balance previously earned and accumulated in your wallet is fully preserved and remains
            accessible for withdrawal in accordance with standard settlement guidelines.
          </li>
          <li className={styles.listItem}>
            <strong>Continuation of Seen Interactions:</strong> While your account remains opted out of monetization,
            your feed interaction (&quot;Seen&quot;) count continues to increment normally as you view content for
            discovery curation, feed refreshing, and history tracking.
          </li>
          <li className={styles.listItem}>
            <strong>No Automatic Remonetization at 300 Seens:</strong> Accumulating three hundred (300) or more seen
            interactions will <strong>NEVER</strong> automatically re-monetize an account that was manually opted out.
            Once cancelled, your account strictly remains unmonetized to honor and protect your choice.
          </li>
          <li className={styles.listItem}>
            <strong>Explicit Reapplication &amp; Fresh 300 Seen Reset:</strong> If an opted-out user subsequently
            decides to resume earning attention rewards, they must return to the Monetization settings dashboard and
            explicitly submit a reapplication. Upon reapplication, verified click progress resets to zero (`0`), ATW tier
            resets to `ATW1`, attention-worth score resets to baseline (`0.1000`), and the user must complete a fresh{" "}
            <strong>three hundred (300) verified human interactions</strong> before monetization rewards reactivate.
          </li>
        </ul>
        <p>
          <strong>3.2 Legal Nature of Earnings: Discretionary Promotional Incentive Credits:</strong> All earnings, wallet
          figures, and monetary amounts displayed on your dashboard represent{" "}
          <strong>conditional, unvested promotional incentive credits</strong> granted solely at Paayh&apos;s discretion,
          and NOT legal tender, fiat currency, personal property, bank deposits, escrow balances, wages, or debt
          obligations owed to you. Credits remain the conditional promotional property of the platform until a
          redemption payout is formally approved, processed, and disbursed by Paayh.
        </p>
        <p>
          <strong>3.2.1 Unilateral Discretion to Withhold, Adjust, or Cancel Credits:</strong> To protect platform
          integrity and solvency against unforeseen technical failures or fraud, Paayh reserves the absolute, unilateral
          discretion to withhold, freeze, recalculate, adjust, or cancel unredeemed credits at any time without prior
          notice, liability, or obligation to pay compensation. This includes, without limitation: confirmed instances
          of bot or invalid traffic, forensic ledger anomalies, technical infrastructure failures, security incidents, or
          documented terms violations. Paayh is under no legal obligation to disclose internal forensics, proprietary
          fraud detection algorithms, or investigation details to users.
        </p>
        <div className={`${styles.noticeBox} ${styles.noticeBoxMargin}`}>
          <strong>MANDATORY PARTICIPATION CONDITION:</strong> The accrual, holding, and redemption of promotional
          incentive credits is entirely conditional and subject to platform solvency and verification. IF YOU DO NOT
          AGREE TO THESE TERMS, INCLUDING PAAYH&apos;S UNILATERAL DISCRETION REGARDING PROMOTIONAL INCENTIVE CREDITS,
          YOU MAY NOT USE OR PARTICIPATE IN THE SERVICES.
        </div>
        <p>
          <strong>3.3 Revenue Share, Attention Worth Tier (ATW) Engine &amp; Overflow Forfeiture:</strong>
        </p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <strong>Attention-Duration-Based Dynamic Revenue Share (30% Base to 50% Max via Second Countdown):</strong>{" "}
            Eligible monetized users earn a dynamic variable revenue share ranging from{" "}
            <strong>thirty percent (30%) up to fifty percent (50%)</strong> of the net promotional revenue directly
            generated by confirmed, genuine human impressions. Attention duration is measured using a transparent
            two-stage countdown system:
            <ul className={styles.list} style={{ marginTop: "0.5rem" }}>
              <li className={styles.listItem}>
                <strong>The First Countdown (Baseline 30% Qualification):</strong> An initial 16-second human
                verification focus timer must first be completed. When this timer expires and the human verification
                action (swipe, hold, or tap) is performed, the action buttons (&quot;Seen,&quot; &quot;Earn+,&quot; and
                &quot;Mutual+&quot;) unlock, establishing qualification for the baseline{" "}
                <strong>thirty percent (30%)</strong> revenue share of the campaign cost-per-impression (CPI).
              </li>
              <li className={styles.listItem}>
                <strong>The Second Countdown (Determines Earning Up to 50%):</strong> Once the buttons unlock, a{" "}
                <strong>second countdown timer</strong> appears beside the Earn+ button, counting down from 16 seconds
                to 0 seconds (displaying clean numerical seconds on the ad card). Tapping &quot;Earn+&quot; early cancels
                the timer and calculates a prorated share between 30% and 50%; allowing the full second countdown to reach
                0s (32 seconds total verified focus) qualifies for the maximum <strong>fifty percent (50%)</strong>{" "}
                revenue share.
              </li>
            </ul>
            Revenue share percentages are dynamic and not fixed; they may adjust based on platform liquidity, advertiser
            campaign budgets, and network health. Paayh retains the remainder to cover digital hosting infrastructure,
            payment processor gateway fees, and administrative operations.
          </li>
          <li className={styles.listItem}>
            <strong>Competitive Attention Bidding &amp; Dynamic Audience Delivery:</strong> Advertisers and promoters may
            submit competitive bids for human attention to prioritize campaign queueing, outpace commercial rivals, and
            reach targeted audience demographics faster. Listeners receiving higher-bidded promotional campaigns earn
            proportionately higher direct incentive rewards in their wallet for verified human focus. All bids are
            subject to industry floor rates and platform capacity.
          </li>
          <li className={styles.listItem}>
            <strong>Prompt Redemption Mandate &amp; Anti-Hoarding Directive:</strong> Paayh is NOT a bank, electronic
            wallet, savings depository, or store of value. Users are strongly urged, instructed, and warned to always
            withdraw their incentives promptly as soon as the minimum settlement threshold (₦10,000 [approx. $6.67 USD])
            is reached and to maintain minimal balances at all times.
          </li>
          <li className={styles.listItem}>
            <strong>ATW Tier Ceiling (ATW1–ATW14), Advertiser Rating Boosts &amp; Overflow Forfeiture:</strong> Paayh
            enforces a unified <strong>Attention Worth Tier (ATW) Engine</strong> scaling from{" "}
            <strong>Level 1 (&quot;ATW1&quot;) up to Level 14 (&quot;ATW14&quot;)</strong>. Each ATW level increases
            your maximum wallet holding cap by <strong>₦30,000 [approx. $20 USD]</strong>: starting at{" "}
            <strong>₦30,000 [approx. $20 USD] at ATW1</strong>, <strong>₦60,000 [approx. $40 USD] at ATW2</strong>,
            and scaling in ₦30,000 steps up to a maximum cap of{" "}
            <strong>₦420,000 [approx. $280 USD] at ATW14</strong> (unless your account holds verified affiliate,
            career, or administrative exemption). Your ATW level advances through both:
            <br />
            (i) verified interaction milestones (each <strong>300 verified clicks</strong> raises effective tier level);
            and
            <br />
            (ii) <strong>verified advertiser star ratings (1–5 stars)</strong> on campaign engagement, which increment your{" "}
            <code>attention_worth_score</code> (baseline <code>0.1000</code>, adding <code>+0.01</code> to{" "}
            <code>+0.05</code> per 1–5 star rating; every <code>+1.00</code> score above <code>0.1000</code> contributes{" "}
            <code>300</code> bonus click-equivalents toward higher ATW levels).
            <br />
            If an account reaches its active ATW holding cap and incentives are not withdrawn, any subsequent overflow
            amount above the ceiling is <strong>voluntarily surrendered and forfeited to platform liquidity</strong>{" "}
            (when net credited amount is capped to ₦0.00, zero referral commission accrues; partial credits scale
            proportionally). Balance accumulation resumes only after a withdrawal reduces the wallet below the ATW
            ceiling.
          </li>
          <li className={styles.listItem}>
            <strong>User Assumption of Risk for Unredeemed Credits:</strong> If unredeemed incentive credits are
            adjusted, reduced, or lost due to technical anomalies, ledger corruption, database recovery events, or
            discretionary platform actions, users who neglected to execute prompt withdrawals assume full personal risk
            and agree that Paayh shall bear zero liability or obligation to reinstate such unredeemed credits.
          </li>
        </ul>
        <p>
          <strong>3.4 Withdrawal Mechanics &amp; Security:</strong>
        </p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <strong>Minimum Settlement Threshold &amp; Currency Localization:</strong> Incentive credits may be redeemed
            for fiat payout once an account reaches the minimum threshold of{" "}
            <strong>Ten Thousand Nigerian Naira (₦10,000.00 NGN [approx. $6.67 USD])</strong>. All monetary thresholds,
            incentive balances, and withdrawal options automatically adjust and localize to your geographical jurisdiction
            and local currency equivalents based on prevailing international exchange rates.
          </li>
          <li className={styles.listItem}>
            <strong>Flexible Balance Withdrawals:</strong> Users may withdraw any amount from ₦10,000 [approx. $6.67 USD]
            up to their full available balance (including withdrawing 100% of accumulated incentives down to ₦0.00).
          </li>
          <li className={styles.listItem}>
            <strong>Regulatory Third-Party Gateway Transfer Fees &amp; Net Settlement:</strong> All payouts and
            withdrawals are disbursed via licensed, regulated payment infrastructure partners:{" "}
            <strong>Paystack Payments Limited</strong> and <strong>Korapay Technologies Limited (Kora)</strong>.
            Statutory interbank electronic transfer charges imposed by the selected disbursement rail are deducted
            directly from your withdrawal payout:
            <br />• <strong>Paystack Fee Schedule:</strong> <strong>₦10.75</strong> for transfers up to ₦5,000;{" "}
            <strong>₦26.88</strong> for transfers from ₦5,001 to ₦50,000; and <strong>₦53.75</strong> for transfers
            exceeding ₦50,000.
            <br />• <strong>Korapay (Kora) Fee Schedule:</strong> <strong>₦15.00</strong> for transfers up to ₦5,000;{" "}
            <strong>₦25.00</strong> for transfers from ₦5,001 to ₦50,000; and <strong>₦35.00</strong> for transfers
            exceeding ₦50,000.
            <br />
            Because minimum payouts begin at ₦10,000.00, active user withdrawals incur the applicable ₦5,001–₦50,000 or
            &gt;₦50,000 rail fee for the processor executing the transfer. Paayh retains zero portion of gateway transfer
            fees.
          </li>
          <li className={styles.listItem}>
            <strong>Dual Gateway Settlement Resilience:</strong> To guarantee high availability and protect against
            gateway downtime or network switch outages, Paayh operates automated multi-gateway failover routing across
            Paystack and Korapay.
          </li>
          <li className={styles.listItem}>
            <strong>Mandatory Registered Phone Verification &amp; Account Security:</strong> To prevent fraud and ensure
            authorized disbursements, every withdrawal strictly requires entering the phone number matching the verified
            phone registered on your account profile. Paayh does not permanently store banking details on user profile
            records and does not restrict withdrawals to a single static bank account.
          </li>
          <li className={styles.listItem}>
            <strong>Mandatory 4-Digit Wallet PIN, 5-Minute Auto-Lock &amp; 45-Minute Security Lockout:</strong> To
            safeguard your dashboard balance, peer-to-peer transfers, and bank payouts, Paayh enforces a mandatory{" "}
            <strong>4-digit Wallet PIN</strong>. Accounts without a configured PIN must complete PIN setup before
            unlocking balances, transferring funds, or withdrawing; transaction endpoints fail closed if a valid 4-digit
            Wallet PIN is missing or invalid. Once unlocked, your wallet visibility remains open until you manually
            close it or until <strong>five (5) minutes</strong> elapse, after which it automatically relocks. To defend
            against brute-force attacks, <strong>five (5) consecutive incorrect PIN attempts</strong> automatically enforce
            a <strong>forty-five (45) minute security lockout</strong>. Resetting a forgotten PIN strictly requires
            verifying both your exact registered account email address and your registered profile phone number. Your
            PIN is irreversibly hashed (<code>PBKDF2-HMAC-SHA256</code>) and can never be viewed or retrieved by Paayh
            personnel.
          </li>
        </ul>

        {/* PLATFORM INACTIVITY MANAGEMENT GUIDELINES */}
        <section id="inactivity-guidelines" className={styles.inactivitySection}>
          <h3 className={`${styles.subheading} ${styles.inactivitySubheading}`}>
            3.5 Platform Inactivity Management Guidelines &amp; Dormant Account Policy
          </h3>
          <div className={`${styles.noticeBox} ${styles.noticeBoxSmallMargin}`}>
            <strong>OFFICIAL GUIDELINE:</strong> Paayh enforces automated platform inactivity management protocols to
            maintain active listener pools for advertisers, prevent stale ledger buildup, and reallocate unserved ad
            queues to verified active users.
          </div>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>7-Day Monetization Reset:</strong> If an account records zero engagement for seven (7) consecutive
              calendar days, monetization status is automatically revoked and monetization clicks reset to zero. Unserved
              campaign queues allocated to inactive accounts are dynamically reassigned to active listeners. Accrued
              wallet balances remain fully untouched and preserved. The user may requalify under prevailing criteria
              at any time.
            </li>
            <li className={styles.listItem}>
              <strong>60-Day Dormant Account Deactivation &amp; Credit Forfeiture:</strong> Accounts that remain
              completely dormant with zero login or interaction events for sixty (60) consecutive calendar days are
              automatically deactivated and forfeit all unclaimed promotional incentive credits and rewards (including
              all accumulated Follower and Agent earnings) to the platform, zeroing out any remaining wallet balance (all
              60+ day dormant accounts are deactivated regardless of balance). Because incentive credits are unvested
              promotional units and not deposited property or legal tender, no conversion, escheatment, or property claim
              arises from their expiration.
            </li>
            <li className={styles.listItem}>
              <strong>In-App Tracking &amp; Notice:</strong> Paayh provides real-time in-app dashboard indicators and
              warning notices displaying ongoing inactivity days, affording users ample opportunity to log in, view
              content, or initiate a withdrawal before the 60-day threshold is reached.
            </li>
          </ul>
        </section>

        {/* FOLLOWERS, INVITES & AGENT PROGRAM */}
        <section id="followers-agent-program" className={styles.inactivitySection}>
          <h3 className={`${styles.subheading} ${styles.inactivitySubheading}`}>
            3.6 Followers, Invites &amp; Agent Program (Strict Direct-Only 1% / 2% Commission Rules)
          </h3>
          <p>
            Registered users may voluntarily participate in the <strong>Followers, Invites &amp; Agent Program</strong> at
            zero registration cost. The program operates as a strict{" "}
            <strong>single-tier direct referral reward sharing system</strong> between the inviting Agent (
            <strong>Following</strong>) and the users they directly introduce onto Paayh (<strong>Followers</strong>).
            <strong>Strict Single-Tier Policy:</strong> A &quot;referral&quot; exclusively means inviting a personal
            contact via your personal invite link to join <strong>Paayh directly</strong>. Referral commissions (1% from
            standard monetized followers and 2% from verified Agent followers) are earned strictly and exclusively from
            the direct campaign earnings of individuals you personally introduced, and only when the follower&apos;s net
            credited earn delta is positive (<code>&gt; 0</code>) and the referrer remains active and monetized. You do
            NOT earn commissions from any second-degree contacts or users whom your followers invite (zero multi-level,
            downline, or pyramid tiers).
          </p>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <strong>How You Earn When You Invite People (1% Follower / 2% Agent Direct-Only):</strong> Activating
              Agent status via <strong>Become an Agent</strong> (<code>/agent</code>) or <strong>Invites</strong>{" "}
              provides a unique invite link (<code>?ref=CODE</code>). Once an invited follower unlocks monetization
              (300+ verified interactions) and receives positive net campaign earnings, you earn{" "}
              <strong>one percent (1%)</strong> from their direct campaign earnings. If that follower also activates
              verified Agent status, your direct commission from their own direct promotional earnings upgrades to{" "}
              <strong>two percent (2%)</strong> (marked with an asterisk <code>*</code>). The 2% applies exclusively to
              that follower&apos;s own direct campaign earnings—never to commissions they earn from their own followers.
              If a follower&apos;s earn is capped to ₦0 by an ATW limit or the referrer is unmonetized/deactivated, zero
              commission is credited.
            </li>
            <li className={styles.listItem}>
              <strong>Deduction From Your Gross Direct Earnings:</strong> If you joined through an invite link, once
              monetized, <strong>1%</strong> (or <strong>2%</strong> if you activate Agent status) of each positive
              direct campaign earning is routed to your direct referrer, leaving <strong>99%</strong> (or{" "}
              <strong>98%</strong>) in your wallet.
            </li>
            <li className={styles.listItem}>
              <strong>100% Voluntary Participation (Consent-Based Unfollow &amp; Unilateral Opt-Out):</strong> Under{" "}
              <strong>Invites</strong>, either party may request an <strong>Unfollow</strong> (with <strong>Undo</strong>{" "}
              before acceptance), or you may execute an immediate, unilateral <strong>Opt Out</strong> at any time without
              anyone&apos;s permission to stop all future deductions and remove upline/downline associations.
            </li>
            <li className={styles.listItem}>
              <strong>Three-Column Transparency &amp; Strict Policy Compliance:</strong> Clicking{" "}
              <strong>Invites</strong> or <strong>Mutuals</strong> opens a three-column view of your{" "}
              <strong>Followers</strong>, <strong>Following</strong>, and <strong>Mutuals (X/50)</strong> using public
              handles only. All Agent earnings remain subject to Section 3.5 inactivity rules, ATW caps (Section 3.3),
              anti-fraud rules (Section 6), and permanent deletion balance purge (Section 7).
            </li>
          </ul>
        </section>
      </section>
    </>
  );
}
