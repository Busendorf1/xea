"use client";

import React from "react";
import styles from "./page.module.css";

export default function PolicyPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Paayh Policies and Terms of Service</h1>
        <p className={styles.updatedDate}><em>Last Updated: June 22, 2025</em></p>

        <hr className={styles.divider} />

        <section>
          <h2 className={styles.heading}>I. Introduction</h2>
          <p>
            Welcome to Paayh, a digital advertising platform designed to fairly connect advertisers with genuine human attention.
            By using our platform, you agree to abide by the policies, conditions, and terms outlined herein.
            These policies apply to all users—advertisers, content viewers, and business partners. The document includes our comprehensive terms of service, platform usage policies, privacy commitments, content rules, and legal protections.
            If you do not agree to these terms, please refrain from using Paayh.
          </p>
        </section>

        <section>
          <h2 className={styles.heading}>II. Definitions</h2>
          <ul className={styles.list}>
            <li className={styles.listItem} ><strong>"Paayh"</strong>: the digital platform, its legal entity, services, domains, trademarks, and content.</li>
            <li className={styles.listItem}><strong>"Advertiser"</strong>: any individual or organization posting promotional content or campaigns.</li>
            <li className={styles.listItem}><strong>"User"</strong>: anyone registered to view content or interact with services.</li>
            <li className={styles.listItem}><strong>"Highlights"</strong>: flash content displayed every 10 minutes, expiring after 24 hours.</li>
            <li className={styles.listItem}><strong>"Monetization"</strong>: the feature enabling users to earn from ad views.</li>
            <li className={styles.listItem}><strong>"Impression"</strong>: a verified user view that results in a “Seen” click.</li>
          </ul>
        </section>

        <section>
          <h2 className={styles.heading}>III. General Platform Usage</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Paayh provides space for advertisers to post ads and for users to interact with them.</li>
            <li className={styles.listItem}>Users agree not to exploit or manipulate impression tracking or monetization mechanisms.</li>
            <li className={styles.listItem}>Advertisements must not contain misleading information, deceptive offers, harmful content, or violate any law.</li>
            <li className={styles.listItem}>Each impression is user-specific. Ads are never shown more than once to the same user per campaign.</li>
            <li className={styles.listItem}>Users are required to click "Seen" to verify genuine viewing of an ad. Failure to comply may result in suspension.</li>
            <li className={styles.listItem}>All ads appear on a clean slate and are not embedded within unrelated content.</li>
            <li className={styles.listItem}>Users agree not to use automation, bots, or spoofing tools on Paayh.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>IV. Eligibility and Account Management</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Users must be at least 16 years old or the legal age of majority in their jurisdiction.</li>
            <li className={styles.listItem}>Monetization eligibility requires 30 days of active participation on the platform.</li>
            <li className={styles.listItem}>Inactivity exceeding 48 hours results in automatic account suspension. Suspended accounts may lose monetization privileges.</li>
            <li className={styles.listItem}>Referral is permitted, but no financial or reward-based incentive is attached at this time.</li>
            <li className={styles.listItem}>Upon monetization, user earnings are reset to zero for accurate tracking.</li>

          </ol>
        </section>

        <section id="advertiser-terms">
          <h2 className={styles.heading}>V. Advertiser Terms, Ads, and Highlights</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Advertisers are guaranteed 100% ad deliverability to active, verified users.</li>
            <li className={styles.listItem} id="misleading-ads">Each ad or highlight must promote a legitimate product, service, or cause. Misleading ads will be removed immediately and may result in campaign suspension.</li>
            <li className={styles.listItem}><strong>Creating Campaigns</strong>: Advertisers can create standard interactive feed Ads supporting text, images, and videos, or select sidebar flash Highlights.</li>
            <li className={styles.listItem}><strong>Highlights System</strong>: Highlights are short promotional assets displayed on the sidebar/mobile overlay interfaces. Highlights rotate every 10 minutes and automatically expire 24 hours after launch.</li>
            <li className={styles.listItem}>Content must be honest, respectful, and compliant with local laws. Banned content includes:
              <ul className={styles.list}>
                <li className={styles.listItem}>False endorsements or misleading claims</li>
                <li className={styles.listItem}>Counterfeit goods or pirated services</li>
                <li className={styles.listItem}>Adult, explicit, or sexually suggestive material</li>
                <li className={styles.listItem}>Weapons, ammunition, and related paraphernalia</li>
                <li className={styles.listItem}>Illegal substances, unverified pharmaceuticals, or gambling solicitations</li>
              </ul>
            </li>
            <li className={styles.listItem}>Ad creatives must be optimized for attention, engagement, and compliance.</li>
            <li className={styles.listItem}>Advertisers agree to honor all offers or claims made in ads.</li>
          </ol>
        </section>

        <section id="monetization">
          <h2 className={styles.heading}>VI. Monetization and Payouts</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}><strong>Adoption Paths</strong>: There are two paths to activate account monetization:
              <ul className={styles.list}>
                <li className={styles.listItem}><em>Standard Monetization</em>: Automatically unlocked for free after 90 days of active account age and engagement.</li>
                <li className={styles.listItem}><em>Instant Monetization</em>: Available immediately for an activation subscription fee of ₦60,000, payable via card or direct wallet balance deduction.</li>
              </ul>
            </li>
            <li className={styles.listItem}><strong>Mandatory Ad-Watching Requirement</strong>: To deliver on the 100% genuine human attention promise we guarantee to our advertisers, monetized users are mandatorily required to watch and verify (click "Seen" or "Earn" or "Mutual" on) the ads presented in their feed.</li>
            <li className={styles.listItem}>Users earn 60% of ad revenue per valid impression.</li>
            <li className={styles.listItem}>No minimum withdrawal threshold. Verified earnings can be requested for withdrawal anytime, subject to active monetization status.</li>
            <li className={styles.listItem}>Attempts to manipulate or bypass ad views using automation, click bots, or spoofing will result in immediate bans and forfeited funds.</li>
          </ol>
        </section>

        <section id="privacy">
          <h2 className={styles.heading}>VII. Privacy and Data Security</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Commitment to Privacy:</strong> Paayh does <strong>not</strong> sell, rent, trade, or exploit user personal data. We collect and process data solely to manage your profile, secure your account, track ad impressions, and calculate payouts.
            </li>
            <li className={styles.listItem}>
              <strong>Google Account and OAuth Data Collection:</strong> If you sign up or log in using your Google account via our secure authentication provider (Auth0), we request only basic, non-sensitive profile permissions (specifically <code>openid</code>, <code>email</code>, and <code>profile</code>). The specific Google user data we collect and store includes:
              <ul className={styles.list}>
                <li className={styles.listItem}>Your Gmail/Google email address (used for account authentication and communications).</li>
                <li className={styles.listItem}>Your Google display name (used to set up your public profile name).</li>
                <li className={styles.listItem}>Your Google profile picture URL (used as your display avatar).</li>
              </ul>
              We do not request, access, or store any sensitive Google data (such as emails, files, or calendar events).
            </li>
            <li className={styles.listItem}>
              <strong>Use of Google OAuth Data:</strong> Your Google OAuth data is used strictly for authentication, account management, and profile display purposes. We do not use this data for marketing or any other secondary purpose, and we never share it with unauthorized third parties.
            </li>
            <li className={styles.listItem}>
              <strong>Third-Party Service Disclosures:</strong> We share and process personal data only with trusted service providers essential to running our platform under strict confidentiality agreements:
              <ul className={styles.list}>
                <li className={styles.listItem}><strong>Auth0</strong> (for secure authentication, login system, and identity management).</li>
                <li className={styles.listItem}><strong>Database services</strong> (for secure cloud database storage and user profiles).</li>
                <li className={styles.listItem}><strong>Third-party payment services</strong> (for processing monetization subscriptions and bank/wallet payouts).</li>
                <li className={styles.listItem}><strong>Task queuing services</strong> (for managing background application jobs).</li>
              </ul>
            </li>
            <li className={styles.listItem}>
              <strong>GDPR Data Protection Rights:</strong> If you are a user in the European Economic Area (EEA) or the United Kingdom, you have the following rights under the General Data Protection Regulation (GDPR):
              <ul className={styles.list}>
                <li className={styles.listItem}>The right to access, update, or rectify the personal data we hold about you.</li>
                <li className={styles.listItem}>The right to request erasure ("right to be forgotten") of your personal data.</li>
                <li className={styles.listItem}>The right to object to or restrict processing of your data.</li>
                <li className={styles.listItem}>The right to data portability (receiving a copy of your data in a structured, readable format).</li>
                <li className={styles.listItem}>The right to withdraw your consent to data processing at any time.</li>
                <li className={styles.listItem}>The right to lodge a complaint with a Data Protection Authority if you believe your rights have been violated.</li>
              </ul>
            </li>
            <li className={styles.listItem}>
              <strong>Data Deletion and Consent Revocation:</strong> Users can request the complete deletion of their account and all associated personal data at any time by submitting a deletion request through deactivation option or via the Help Center. Additionally, you can revoke Paayh's access to your Google account at any time via your Google Security Settings page.
            </li>
            <li className={styles.listItem}>
              <strong>Data Retention:</strong> We retain your personal data only for as long as necessary to provide our services and satisfy legal obligations. Once your account is deleted or terminated, all associated data is permanently erased from our active database and authentication records.
            </li>
          </ol>
        </section>

        <section id="cookies">
          <h2 className={styles.heading}>VIII. Cookies and Tracking</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>
              <strong>Use of Cookies:</strong> We use cookies and similar tracking technologies to maintain secure user sessions, track ad impressions (essential for monetization payouts), and save your theme/preference configurations.
            </li>
            <li className={styles.listItem}>
              <strong>Managing Cookies:</strong> You can manage or disable cookies through your browser settings. However, please note that disabling essential session cookies will prevent you from logging in, navigating the dashboard, or completing monetization activities.
            </li>
            <li className={styles.listItem}>
              <strong>Personal Information:</strong> The cookies we use for tracking impressions and sessions do not store unencrypted Personally Identifiable Information (PII) on your device.
            </li>
          </ol>
        </section>

        <section id="infringement">
          <h2 className={styles.heading} id="copyright">IX. Infringement and Intellectual Property</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Users must respect copyright and intellectual property laws.</li>
            <li className={styles.listItem}>Only original or licensed content may be uploaded.</li>
            <li className={styles.listItem}>Reported infringements will be investigated and may lead to takedown.</li>
            <li className={styles.listItem}>Paayh reserves the right to suspend violators.</li>
          </ol>
        </section>

        <section id="abuse">
          <h2 className={styles.heading}>X. Abuse, Fraud, and Platform Integrity</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Fraud includes:
              <ul className={styles.list}>
                <li className={styles.listItem}>Click farming</li>
                <li className={styles.listItem}>Automated ad viewing</li>
                <li className={styles.listItem}>Multiple account abuse</li>
                <li className={styles.listItem}>Fake testimonials</li>
                <li className={styles.listItem}>Fake or false or illegal Adverts</li>
              </ul>
            </li>
            <li className={styles.listItem}>Paayh uses AI and moderators to detect abuse.</li>
            <li className={styles.listItem}>Violators will be banned and may face legal consequences.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XI. Suspension and Termination</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Accounts may be suspended for policy violations, inactivity, or fraud.</li>
            <li className={styles.listItem}>Users may appeal suspensions via the Help Center.</li>
            <li className={styles.listItem}>Terminated accounts forfeit any pending earnings.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XII. Limitation of Liability</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Paayh is not liable for:
              <ul className={styles.list}>
                <li className={styles.listItem}>Loss of earnings due to technical issues</li>
                <li className={styles.listItem}>Suspension from inactivity</li>
                <li className={styles.listItem}>Third-party payment failures</li>
                <li className={styles.listItem}>Advertiser misconduct</li>
              </ul>
            </li>
            <li className={styles.listItem}>Our total liability is limited to a user’s last 30 days of verified earnings.</li>
          </ol>
        </section>

        <section id="terms">
          <h2 className={styles.heading}>XIII. Dispute Resolution and Terms of Service</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>All disputes must first be reported to Paayh’s support team.</li>
            <li className={styles.listItem}>Unresolved disputes within 30 days may proceed to arbitration.</li>
            <li className={styles.listItem}>The governing law is that of the Federal Republic of Nigeria, or where Paayh operates officially.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XIV. Changes to These Terms</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}>Paayh may update these policies at any time.</li>
            <li className={styles.listItem}>We will notify users of material changes.</li>
            <li className={styles.listItem}>Continued use implies acceptance of new terms.</li>
          </ol>
        </section>

        <section id="help-center">
          <h2 className={styles.heading}>XV. Help Center Policy</h2>
          <ol className={styles.list}>
            <li className={styles.listItem}><strong>Support Ticket Requests</strong>: Users can submit support tickets for specific issues, including Account Issues, Ad/Highlight Problems, Payment/Earnings, Suspensions, Bug Reports, and Collaboration requests.</li>
            <li className={styles.listItem}><strong>Response Times</strong>: Tickets are processed sequentially. We aim to respond to all valid support queries within 24-48 business hours.</li>
            <li className={styles.listItem}><strong>Integrity and Respect</strong>: Users are expected to maintain respectful, honest communication. Spamming tickets, filing fraudulent complaints, or harassing support agents will lead to account suspension.</li>
          </ol>
        </section>

        <section>
          <h2 className={styles.heading}>XVI. Contact</h2>
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
