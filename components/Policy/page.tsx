"use client";

import React from "react";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Policies and Terms of Service</h1>
        <p className={styles.updatedDate}><em>Last Updated: July 25, 2025</em></p>

        <hr className={styles.divider} />

        <section>
          <h2 className={styles.heading}>I. Introduction</h2>
          <p>
            Welcome to Paayh. Paayh is a digital advertising platform that connects advertisers with real users and rewards those users for their genuine attention. By accessing or using Paayh, you agree to comply with the policies, conditions, and terms outlined in this document. These terms apply to all participants, including advertisers, viewers, and business partners. If you do not agree with these terms, please do not use Paayh.
          </p>
        </section>

        <section>
          <h2 className={styles.heading}>II. Definitions</h2>
          <p>The following terms are used throughout this document:</p>
          <ul className={styles.list}>
            <li className={styles.listItem}><strong>&quot;Paayh&quot;</strong> refers to the platform, we, including the application, website, and all associated services.</li>
            <li className={styles.listItem}><strong>&quot;Advertiser&quot;</strong> refers to any individual or organisation that posts an advertisement or promotional campaign on Paayh.</li>
            <li className={styles.listItem}><strong>&quot;User&quot;</strong> (also referred to as &quot;Listener&quot;) refers to any registered individual who views or interacts with content on the platform.</li>
            <li className={styles.listItem}><strong>&quot;Highlights&quot;</strong> are short promotional ads that appear every 10 minutes and automatically expire after 24 hours.</li>
            <li className={styles.listItem}><strong>&quot;Monetization&quot;</strong> is the feature that enables eligible users to earn real income from verified ad interactions.</li>
            <li className={styles.listItem}><strong>&quot;Impression&quot;</strong> is a verified ad view, recorded when a user watches an ad and clicks &quot;Seen&quot;, &quot;Earn&quot;, or &quot;Mutual.&quot; Each impression confirms that the ad was delivered to a real person.</li>
          <li className={styles.listItem}><strong>&quot;Attention&quot;</strong> Attention is a person&apos;s focused awareness and engagement with an ad for a period of time. Attention is a scarce resource that companies compete for. Users provide their attention by intentionally viewing ads.</li>
        
          </ul></section>

        <section>
          <h2 className={styles.heading}>III. General Platform Usage</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Paayh serves as a marketplace where advertisers post campaigns and users engage with them.</li>
            <li className={styles.listItem}>Users must not attempt to exploit, manipulate, or game the impression tracking or monetization systems.</li>
            <li className={styles.listItem}>All advertisements must be truthful, lawful, and free from harmful content.</li>
            <li className={styles.listItem}>Each ad is typically shown to a user only once per campaign. Once you click &quot;Seen,&quot; &quot;Earn,&quot; or &quot;Mutual,&quot; that ad is removed from your feed.</li>
            <li className={styles.listItem}>Clicking &quot;Seen,&quot; &quot;Earn,&quot; or &quot;Mutual&quot; confirms that you have viewed the ad. We encourage all users to do this, even if not monetized, because it registers the ad as delivered and clears it from your feed.</li>
            <li className={styles.listItem}>Ads are presented independently and are never embedded within unrelated content.</li>
            <li className={styles.listItem}>The use of bots, automation tools, or spoofing methods is strictly prohibited and will result in an immediate ban.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>IV. Eligibility and Account Management</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}><strong>Age Requirement:</strong> You must be at least <strong>18 years old</strong> to use Paayh.</li>
            <li className={styles.listItem}><strong>Monetization Eligibility:</strong> To activate monetization, your account must demonstrate clear and consistent activity, or you must accumulate at least <strong>300 verified clicks</strong> (&quot;Seen&quot; or &quot;Mutual&quot;). Monetization is entirely free, with no fees or subscriptions required.</li>
            <li className={styles.listItem}><strong>Inactivity Policy:</strong> If your account remains inactive for <strong>7 consecutive days</strong>, your monetization status will be revoked and you will need to re-qualify. Ads assigned to inactive users are automatically redirected to active users, even while you are offline, to ensure advertisers receive their promised delivery.</li>
            <li className={styles.listItem}><strong>Referrals:</strong> You are welcome to invite others to join Paayh. However, there are currently no referral bonuses or incentives attached to this feature.</li>
          </ol>
        </section>

        <section id="advertiser-terms">
          <h2 className={styles.heading}>V. Advertiser Terms, Ads, and Highlights</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Paayh guarantees <strong>99.99% ad deliverability</strong> to active, verified users, meaning virtually every ad paid for will reach a real person.</li>
            <li className={styles.listItem} id="misleading-ads">Every advertisement or highlight must promote a legitimate product, service, or cause. Misleading content will be removed immediately and may result in campaign suspension.</li>
            <li className={styles.listItem}><strong>Creating Campaigns:</strong> Advertisers can create standard interactive feed Ads (supporting text, images, and video) or sidebar flash Highlights.</li>
            <li className={styles.listItem}><strong>Highlights System:</strong> Highlights are short promotional assets displayed on the sidebar or mobile overlay. They rotate every 10 minutes and automatically expire 24 hours after going live.</li>
            <li className={styles.listItem}>All ad content must be honest, respectful, and compliant with applicable laws. The following categories are <strong>strictly prohibited</strong>:
              <ul className={styles.list}>
                <li className={styles.listItem}>False endorsements or misleading claims</li>
                <li className={styles.listItem}>Counterfeit goods or pirated services</li>
                <li className={styles.listItem}>Adult, explicit, or sexually suggestive material</li>
                <li className={styles.listItem}>Weapons, ammunition, and related paraphernalia</li>
                <li className={styles.listItem}>Illegal substances, unverified pharmaceuticals, or gambling solicitations</li>
              </ul>
            </li>
            <li className={styles.listItem}>Advertisers should optimise their creatives for maximum attention and engagement.</li>
            <li className={styles.listItem}>All offers or claims made within an advertisement must be honoured by the advertiser.</li>
            <li className={styles.listItem}>
              <strong>Advertiser Liability:</strong> The advertiser is solely and fully responsible for all content submitted to Paayh. Paayh operates as a digital advertising medium and does not create, endorse, or assume responsibility for any advertisement. If an ad violates any law or regulation, including the ARCON Act 2022 and the Nigerian Code of Advertising Practice, the advertiser bears full legal liability. The advertiser agrees to indemnify and hold Paayh harmless from any claims, damages, or legal actions arising from their advertising content.
            </li>
          </ol>
        </section>

        <section id="monetization">
          <h2 className={styles.heading}>VI. Monetization and Payouts</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}><strong>Activating Monetization:</strong> Monetization is completely free. Once your account demonstrates consistent activity or you have accumulated at least <strong>300 verified clicks</strong> (&quot;Seen&quot; or &quot;Mutual&quot;), you become eligible. There are no subscriptions or hidden fees.</li>
            <li className={styles.listItem}><strong>Revenue Share:</strong> Monetized users earn <strong>60% of the ad revenue</strong> generated by each valid impression. The remaining 40% supports platform operations, growth, and innovation.</li>
            <li className={styles.listItem}><strong>The Earn Button:</strong> The Earn button is only visible to monetized users. If you are not yet monetized, you will see the &quot;Seen&quot; and &quot;Mutual&quot; buttons only.</li>
            <li className={styles.listItem}><strong>Voluntary Ad Engagement:</strong> Watching ads is not mandatory. However, clicking &quot;Seen,&quot; &quot;Earn,&quot; or &quot;Mutual&quot; is how you generate income and how advertisers confirm their ads were delivered. Even if you choose not to earn, we encourage clicking &quot;Seen&quot; so the ad registers as delivered and is removed from your feed.</li>
            <li className={styles.listItem}><strong>Withdrawals:</strong> Earnings can be withdrawn at any time, provided the amount meets the <strong>minimum withdrawal threshold of ₦30,000</strong>. Upon withdrawal, your balance resets to ₦0 and earnings begin accumulating again from zero.</li>
            <li className={styles.listItem}><strong>Anti-Fraud Policy:</strong> Any attempt to manipulate ad views through bots, click farms, automation, or similar methods will result in an immediate permanent ban and forfeiture of all earnings.</li>
          </ol>
        </section>

        <section id="privacy">
          <h2 className={styles.heading}>VII. Privacy and Data Security</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Zero-Trust Searchable Field-Level Encryption:</strong> All personal data—including user email addresses, phone numbers, security passphrases, and banking credentials—are encrypted at the application level using <strong>CipherStash Zero-Trust Searchable Field-Level Encryption</strong> before being stored. Even in the event of a database compromise, security breach, or server leak, plaintext personal data cannot be viewed, harvested, or decrypted by unauthorized third parties or database administrators.
            </li>
            <li className={styles.listItem}>
              <strong>Google Account Authentication:</strong> If you sign up or log in using your Google account via Auth0, we request only basic, non-sensitive profile permissions (<code>openid</code>, <code>email</code>, and <code>profile</code>). The data we collect includes your email address, display name, and profile picture URL. We do not access your emails, files, calendar, or any other Google services.
            </li>
            <li className={styles.listItem}>
              <strong>Use of Google OAuth Data:</strong> Your Google data is used strictly for authentication, profile setup, and account management. It is never used for marketing purposes and is never shared with unauthorised third parties.
            </li>
            <li className={styles.listItem}>
              <strong>Third Party Service Providers:</strong> We share data with the following trusted service providers under strict confidentiality agreements:
              <ul className={styles.list}>
                <li className={styles.listItem}><strong>Auth0</strong>, for secure authentication and identity management.</li>
                <li className={styles.listItem}><strong>Database services</strong>, for secure cloud storage of user profiles and data.</li>
                <li className={styles.listItem}><strong>Payment services</strong>, for processing withdrawals and payouts.</li>
                <li className={styles.listItem}><strong>Task queuing services</strong>, for managing background platform operations.</li>
              </ul>
            </li>
            <li className={styles.listItem}>
              <strong>GDPR Rights:</strong> Users located in the European Economic Area or the United Kingdom have the following rights under the General Data Protection Regulation:
              <ul className={styles.list}>
                <li className={styles.listItem}>The right to access, update, or rectify your personal data.</li>
                <li className={styles.listItem}>The right to request erasure of your data (&quot;right to be forgotten&quot;).</li>
                <li className={styles.listItem}>The right to object to or restrict processing of your data.</li>
                <li className={styles.listItem}>The right to data portability in a structured, readable format.</li>
                <li className={styles.listItem}>The right to withdraw consent at any time.</li>
                <li className={styles.listItem}>The right to lodge a complaint with a Data Protection Authority.</li>
              </ul>
            </li>
            <li className={styles.listItem}>
              <strong>Account Deletion:</strong> You may request complete deletion of your account and all associated data at any time via the deactivation option or the Help Center. You may also revoke Paayh&apos;s access to your Google account through your Google Security Settings.
            </li>
            <li className={styles.listItem}>
              <strong>Data Retention:</strong> Personal data is retained only for as long as necessary to provide our services and meet legal obligations. Once your account is deleted, all associated data is permanently erased from our systems.
            </li>
          </ol>
        </section>

        <section id="cookies">
          <h2 className={styles.heading}>VIII. Cookies and Tracking</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Use of Cookies:</strong> We use cookies and similar tracking technologies to maintain secure user sessions, track ad impressions for monetization purposes, and save your theme and preference settings.
            </li>
            <li className={styles.listItem}>
              <strong>Managing Cookies:</strong> You may manage or disable cookies through your browser settings. However, disabling essential cookies will prevent you from logging in, using the dashboard, or completing monetization activities.
            </li>
            <li className={styles.listItem}>
              <strong>Privacy Assurance:</strong> The cookies we use do not store unencrypted personally identifiable information on your device. All tracking data is encrypted.
            </li>
          </ol>
        </section>

        <section id="infringement">
          <h2 className={styles.heading} id="copyright">IX. Infringement and Intellectual Property</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Users must respect copyright and intellectual property laws at all times.</li>
            <li className={styles.listItem}>Only original or properly licensed content may be uploaded to the platform.</li>
            <li className={styles.listItem}>Reported infringements will be investigated and may result in content removal.</li>
            <li className={styles.listItem}>Repeat offenders will have their accounts suspended or terminated.</li>
          </ol>
        </section>

        <section id="abuse">
          <h2 className={styles.heading}>X. Abuse, Fraud, and Platform Integrity</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>The following activities constitute fraud on Paayh:
              <ul className={styles.list}>
                <li className={styles.listItem}>Click farming or coordinated fake engagement</li>
                <li className={styles.listItem}>Automated ad viewing through bots or scripts</li>
                <li className={styles.listItem}>Operating multiple accounts to inflate earnings</li>
                <li className={styles.listItem}>Posting fabricated reviews or testimonials</li>
                <li className={styles.listItem}>Submitting fraudulent, false, or illegal advertisements</li>
              </ul>
            </li>
            <li className={styles.listItem}>Paayh employs both automated systems and human moderators to detect and prevent abuse.</li>
            <li className={styles.listItem}>Violators will be permanently banned and may face legal action.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XI. Suspension and Termination</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Accounts may be suspended for policy violations, prolonged inactivity (7 or more consecutive days), or fraudulent activity.</li>
            <li className={styles.listItem}>Users may appeal suspensions through the Help Center.</li>
            <li className={styles.listItem}>Terminated accounts forfeit any pending or unclaimed earnings.</li>
          </ol>
        </section>

        <section>
  <h2 className={styles.heading}>XII. Limitation of Liability</h2>
  <p>Paayh is <strong>not</strong> liable for the following:</p>
  <ol className={styles.list}>
    <li className={styles.listItem}>
      <ul className={styles.list}>
        <li className={styles.listItem}>Loss of earnings due to technical issues or service outages</li>
        <li className={styles.listItem}>Account suspension resulting from user inactivity</li>
        <li className={styles.listItem}>Payment failures caused by third-party service providers</li>
        <li className={styles.listItem}>Advertiser misconduct or misrepresentation</li>
        <li className={styles.listItem}>Any loss of earnings due to the above reasons or any other circumstances, which will not be refunded or paid out to users</li>
      </ul>
    </li>
    <li className={styles.listItem}>
      Payouts are strictly compensatory rewards for viewing advertisements. Paayh reserves the right to suspend, withdraw, or alter these rewards at any time at its sole discretion, and is not bound by any mandatory payment obligations.
    </li>
    {/* <li className={styles.listItem}>
      Paayh&apos;s total liability to any user is limited to that user&apos;s last 30 days of verified earnings.
    </li> */}
  </ol>
</section>


        <section id="terms">
          <h2 className={styles.heading}>XIII. Dispute Resolution</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>All disputes must first be reported to Paayh&apos;s support team through the Help Center.</li>
            <li className={styles.listItem}>Disputes unresolved within 30 days may be report again via our Help Center.</li>
            {/* <li className={styles.listItem}>These terms are governed by the laws of the Federal Republic of Nigeria, or the jurisdiction in which Paayh officially operates.</li> */}
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XIV. Changes to These Terms</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Paayh reserves the right to update these terms at any time.</li>
            <li className={styles.listItem}>Users may be notified of any material changes to the terms.</li>
            <li className={styles.listItem}>Continued use of the platform after a change constitutes acceptance of the revised terms.</li>
          </ol>
        </section>

        <section id="help-center">
          <h2 className={styles.heading}>XV. Help Center Policy</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}><strong>Support Tickets:</strong> Users can submit support tickets for account issues, ad or highlight problems, payment and earnings queries, suspensions, bug reports, or collaboration requests.</li>
            <li className={styles.listItem}><strong>Response Times:</strong> Tickets are processed sequentially. We aim to respond to all valid support queries within 24 to 48 business hours.</li>
            <li className={styles.listItem}><strong>Conduct:</strong> Users are expected to communicate honestly and respectfully. Spamming tickets, filing fraudulent complaints, or harassing support staff will result in account suspension.</li>
          </ol>
        </section>

        <section id="arcon-compliance">
  <h2 className={styles.heading}>XVI. Advertising Regulatory Compliance (ARCON)</h2>
  <p>This section applies to advertising content directed at or exposed to the Nigerian market:</p>
  <ol className={styles.list}>
    <li className={styles.listItem}>
      <strong>Regulatory Acknowledgment:</strong> Paayh recognises the Advertising Regulatory Council of Nigeria (ARCON), established under the ARCON Act 2022, as the apex regulatory body for advertising in Nigeria. All advertising activities conducted on Paayh that target the Nigerian market are subject to the ARCON Act 2022 and the Nigerian Code of Advertising Practice.
    </li>
    <li className={styles.listItem}>
      <strong>Content Compliance and Takedowns:</strong> Paayh reserves the right to immediately remove, suspend, or reject any advertisement that is found to be non-compliant with ARCON regulations, is directed to be taken down by ARCON, or otherwise violates applicable advertising laws. No refund shall be issued for campaigns removed due to regulatory non-compliance by the advertiser.
    </li>
    <li className={styles.listItem}>
      <strong>Reporting and Removal Protocol:</strong> In the event that an advertisement violates regulatory provisions or applicable laws, ARCON or any other authoritative regulatory body may report the violation and request removal. All such reports and takedown requests must be submitted formally to Paayh via our official email address. Upon receipt of a valid regulatory notice, Paayh will promptly review and remove the violating advertisement.
    </li>
    <li className={styles.listItem}>
      <strong>Political Advertising:</strong> Political advertisements are available as a distinct advertiser category on Paayh. Users may opt in or out of viewing political ads through their interest preferences. All political advertisements must comply with ARCON regulations and applicable electoral advertising laws. The advertiser assumes sole responsibility for ensuring compliance of political ad content.
    </li>
  </ol>
</section>

        <section>
          <h2 className={styles.heading}>XVII. Contact</h2>
          <p>
            For questions or clarifications, please visit our <a href="/help">Help Center</a>.
          </p>
          <p className={styles.acknowledgment}>
            <strong>By using Paayh, you acknowledge that you have read, understood, and agree to be bound by these policies and terms.</strong>
          </p>
        </section>
      </main>
    </div>
  );
}
