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
      "Paayh is a platform that turns your attention into income. We deliver ads with 100% deliverability & transparency, and you earn for engaging with content you actually care about.",
  },
  {
    question: "What is UBI?",
    answer:
      "UBI (Universal Basic Income) is a consistent income provided to all individuals regardless of status. At Paayh, we simulate this by rewarding users for their time and attention.",
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
                href="/user/logged-in"
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
                href="/user/logged-in"
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
            <li><Link href="/privacy#privacy" className={styles.link}>Privacy</Link></li>
            <li><Link href="/privacy#infringement" className={styles.link}>Infringement</Link></li>
            <li><Link href="/privacy#abuse" className={styles.link}>Stealing / Abuse</Link></li>
            <li><Link href="/privacy#misleading-ads" className={styles.link}>Misleading Advert</Link></li>
            <li><Link href="/privacy#cookies" className={styles.link}>Cookies</Link></li>
            <li><Link href="/privacy#terms" className={styles.link}>Terms of Service</Link></li>
            <li><Link href="/privacy#copyright" className={styles.link}>Copyrights</Link></li>
          </ul>
        </div>

        {/* HELP CENTER */}
        <div className={styles.section}>
          <h4 className={styles.heading}><Link href="/help" className={styles.link}>Help Center</Link></h4>
          <ul className={styles.linkList}>
            <li><Link href="/help" className={styles.link}>Contact & Support</Link></li>
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
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "10px", lineHeight: "1.3" }}>
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
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <input
              type="email"
              name="newsletterEmail"
              placeholder="Enter your email"
              required
              disabled={newsletterSubmitting}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
                background: "rgba(0,0,0,0.2)",
                color: "#fff",
                fontSize: "0.82rem",
                outline: "none",
                opacity: newsletterSubmitting ? 0.6 : 1,
              }}
            />
            <button
              type="submit"
              disabled={newsletterSubmitting}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                background: newsletterSubmitting ? "#4b5563" : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.82rem",
                border: "none",
                cursor: newsletterSubmitting ? "not-allowed" : "pointer",
                opacity: newsletterSubmitting ? 0.7 : 1,
              }}
            >
              {newsletterSubmitting ? "Subscribing..." : "Subscribe"}
            </button>

            <div style={{
              marginTop: "8px",
              padding: "6px 10px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              lineHeight: "1.35",
              display: "flex",
              alignItems: "flex-start",
              gap: "6px"
            }}>
              <Info size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>
                <strong>Privacy Notice:</strong> Subscribing constitutes sharing your email.
                </span>
            </div>
          </form>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "10px 0", fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic", opacity: 0.55 }}>
        Made on earth for humans
      </div>

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Paayh! All rights reserved.
      </div>
    </footer>
  );
}
