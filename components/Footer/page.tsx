"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";
import { newsletterSchema } from "@/lib/validationSchemas";
import { Info } from "lucide-react";

const faqs = [
  {
    question: "Know More About Us",
    answer:
      "Paayh is a platform that turns your attention into earnings. We deliver ads with 99.99% deliverability and transparency, and you earn for engaging with content you actually care about.",
  },
  {
    question: "What is UBI?",
    answer:
      "UBI (Universal Basic Income) is a consistent income provided to all individuals regardless of status. At Paayh, we contribute to this by rewarding users for their time and attention.",
  },
  {
    question: "Why Shared Revenue?",
    answer:
      "We believe viewers deserve a share of the advertising revenue their attention generates. It's a fair, human-centered economic model.",
  },
  {
    question: "How Long is Monetization?",
    answer:
      "Once you qualify, monetization begins instantly and continues indefinitely as long as you remain active and follow community guidelines.",
  },
  {
    question: "Who is Eligible?",
    answer:
      "Anyone above the age of 18 with a valid email can use Paayh. Monetization becomes available once you meet basic engagement and authenticity checks.",
  },
  {
    question: "Where Services are Available?",
    answer:
      "Paayh is accessible globally. Monetization features are rolling out regionally, starting in countries with reliable digital payment systems.",
  },
];

export default function Footer() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  const toggleFAQ = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        {/* OUR SERVICES */}
        <div className={styles.section}>
          <h4 className={styles.heading}>Our Services</h4>
          <ul className={styles.linkList}>
            <li>
              <Link
                href="/logged-in"
                className={styles.link}
                onClick={() => {
                  sessionStorage.setItem("paayh_active_tab", "adPage");
                  if (typeof window !== "undefined") window.dispatchEvent(new Event("paayh_tab_change"));
                }}
              >
                Advert
              </Link>
            </li>
            <li>
              <Link
                href="/logged-in"
                className={styles.link}
                onClick={() => {
                  sessionStorage.setItem("paayh_active_tab", "monetize");
                  if (typeof window !== "undefined") window.dispatchEvent(new Event("paayh_tab_change"));
                }}
              >
                Monetization
              </Link>
            </li>
            <li><Link href="/business-update" className={styles.link}>Business Update</Link></li>
          </ul>
        </div>

        {/* FAQ - EXPANDABLE */}
        <div className={styles.section}>
          <h4 className={styles.heading}> <Link href="/faq" className={styles.link}>Frequently Asked Questions</Link></h4>
          <ul className={styles.linkList}>
            {faqs.map((faq, index) => (
              <li key={index} className={styles.faqItem}>
                <button
                  onClick={() => toggleFAQ(index)}
                  className={styles.faqQuestion}
                  aria-expanded={openIndex === index}
                >
                  {faq.question}
                </button>
                {openIndex === index && (
                  <div className={styles.faqAnswer}>
                    {faq.answer}
                  </div>
                )}
              </li>
            ))}
          </ul>
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
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (newsletterSubmitting) return;
              const form = e.currentTarget;
              const emailInput = form.elements.namedItem("newsletterEmail") as HTMLInputElement;
              const rawEmail = emailInput?.value || "";

              const parseResult = newsletterSchema.safeParse({ email: rawEmail });
              if (!parseResult.success) {
                alert(parseResult.error.issues[0]?.message || "Please enter a valid email address.");
                return;
              }

              setNewsletterSubmitting(true);
              try {
                const res = await fetch("/api/newsletter/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: parseResult.data.email }),
                });
                const data = await res.json();
                if (data.error) {
                  alert(data.error);
                } else if (data.message) {
                  alert(data.message);
                  if (emailInput) emailInput.value = "";
                }
              } catch {
                alert("Subscribed to newsletter updates.");
              } finally {
                setNewsletterSubmitting(false);
              }
            }}
            className={styles.newsletterForm}
          >
            <input
              type="email"
              name="newsletterEmail"
              placeholder="Enter your email"
              required
              disabled={newsletterSubmitting}
              className={styles.newsletterInput}
            />
            <button
              type="submit"
              disabled={newsletterSubmitting}
              className={styles.newsletterBtn}
            >
              {newsletterSubmitting ? "Subscribing..." : "Subscribe"}
            </button>

            <div className={styles.newsletterPrivacy}>
              <Info size={14} color="#6366f1" className={styles.newsletterPrivacyIcon} />
              <span>
                <strong>Privacy Notice:</strong> Subscribing constitutes sharing your email.
                </span>
            </div>
          </form>
        </div>
      </div>

      <div className={styles.madeForHumans}>
        Made on earth for humans
      </div>

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Paayh! All rights reserved.
      </div>
    </footer>
  );
}
