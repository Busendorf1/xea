"use client";

import React, { useState } from "react";
import styles from "./page.module.css";
import { newsletterSchema } from "@/lib/validationSchemas";
import { Info } from "lucide-react";
import { showAppleAlert } from "@/components/ui/AppleAlert";

export default function NewsletterForm() {
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (newsletterSubmitting) return;
        const form = e.currentTarget;
        const emailInput = form.elements.namedItem("newsletterEmail") as HTMLInputElement;
        const rawEmail = emailInput?.value || "";

        const parseResult = newsletterSchema.safeParse({ email: rawEmail });
        if (!parseResult.success) {
          showAppleAlert(parseResult.error.issues[0]?.message || "Please enter a valid email address.", "warning");
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
            showAppleAlert(data.error, "error");
          } else if (data.message) {
            showAppleAlert(data.message, "success", "Subscribed");
            if (emailInput) emailInput.value = "";
          }
        } catch {
          showAppleAlert("Subscribed to newsletter updates.", "success", "Subscribed");
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
  );
}
