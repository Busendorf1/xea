import Link from "next/link";
import styles from "./page.module.css";
import NewsletterForm from "./NewsletterForm";
import FooterFaq from "./FooterFaq";

const faqs = [
  {
    question: "Know More About Us",
    answer:
      "Paayh is a fair attention economy and community discovery platform. We deliver promotional content with high deliverability and transparency, where members voluntarily discover offers and earn attention rewards for verified human focus.",
  },
  {
    question: "What is UBI?",
    answer:
      "UBI (Universal Basic Income) is the concept of regular economic participation. Paayh embraces this vision through a transparent attention economy, empowering members to earn fair attention rewards for their verified focus.",
  },
  {
    question: "Why Shared Revenue?",
    answer:
      "We believe audiences deserve a transparent share of the advertising budget their attention generates. Advertisers connect with genuine human audiences, creating a sustainable, human-centered economic model.",
  },
  {
    question: "How Long is Monetization?",
    answer:
      "Once you qualify, monetization begins instantly and continues indefinitely as long as you remain active and follow community guidelines.",
  },
  {
    question: "Who is Eligible?",
    answer:
      "Anyone above the age of 18 with a valid Google account or Apple ID can use Paayh. Monetization becomes available once you meet basic engagement and authenticity checks.",
  },
  {
    question: "Where Services are Available?",
    answer:
      "Paayh is accessible globally. Monetization features are rolling out regionally, starting in countries with reliable digital payment systems.",
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        {/* OUR SERVICES */}
        <div className={styles.section}>
          <h4 className={styles.heading}>Our Services</h4>
          <ul className={styles.linkList}>
            <li>
              <Link href="/logged-in" className={styles.link}>
                Advert
              </Link>
            </li>
            <li>
              <Link href="/logged-in" className={styles.link}>
                Monetization
              </Link>
            </li>
            <li><Link href="/business-update" className={styles.link}>Business Update</Link></li>
          </ul>
        </div>

        {/* FAQ - EXPANDABLE */}
        <div className={styles.section}>
          <h4 className={styles.heading}>
            <Link href="/faq" className={styles.link}>Frequently Asked Questions</Link>
          </h4>
          <FooterFaq faqs={faqs} />
        </div>

        {/* POLICIES */}
        <div className={styles.section}>
          <h4 className={styles.heading}>Policies</h4>
          <ul className={styles.linkList}>
            <li><Link href="/terms" className={styles.link}>Terms of Service</Link></li>
            <li><Link href="/privacy" className={styles.link}>Privacy Policy</Link></li>
            <li><Link href="/cookies" className={styles.link}>Cookie Policy</Link></li>
            <li><Link href="/advertiser-guidelines" className={styles.link}>Advertising Guidelines</Link></li>
            <li><Link href="/terms#inactivity-guidelines" className={styles.link}>Inactivity Guidelines</Link></li>
            <li><Link href="/privacy#user-rights" className={styles.link}>User Rights (NDPA)</Link></li>
            <li><Link href="/terms" className={styles.link}>AML &amp; Anti-Fraud</Link></li>
          </ul>
        </div>

        {/* HELP CENTER */}
        <div className={styles.section}>
          <h4 className={styles.heading}><Link href="/help" className={styles.link}>Help Center</Link></h4>
          <ul className={styles.linkList}>
            <li><Link href="/help" className={styles.link}>Contact and Support</Link></li>
            <li><Link href="/help?category=Suspended+Account" className={styles.link}>Suspended Account</Link></li>
            <li><Link href="/careers" className={styles.link}>Careers</Link></li>
            <li><Link href="/help?category=Collaboration" className={styles.link}>Collaboration</Link></li>
            <li><Link href="/help?category=Ad+or+Highlight+Problem" className={styles.link}>Report Account or Ads</Link></li>
            <li><Link href="/help?category=Information+Request" className={styles.link}>Request for Information</Link></li>
          </ul>
        </div>

        {/* NEWSLETTER SIGNUP */}
        <div className={styles.section}>
          <h4 className={styles.heading}>Newsletter</h4>
          <p className={styles.newsletterText}>
            Subscribe to receive product updates, earning opportunities, and platform announcements.
          </p>
          <NewsletterForm />
        </div>
      </div>

      <div className={styles.madeForHumans}>
        Made on earth for humans
      </div>

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Paayh by East Sixties Limited. All Rights Reserved.
      </div>
    </footer>
  );
}
