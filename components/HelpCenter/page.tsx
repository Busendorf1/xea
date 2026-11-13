"use client";

import React, { useState, useEffect } from "react";
import styles from "./page.module.css";
import { MessageCircle, Send, Inbox, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { helpSchema } from "@/lib/validationSchemas";

interface HelpCenterProps {
  session: {
    user?: {
      email?: string | null;
      name?: string | null;
    };
  } | null;
}

const CATEGORIES = [
  "Account Issue",
  "Ad or Highlight Problem",
  "Payment / Earnings",
  "Suspended Account",
  "Bug Report",
  "Collaboration",
  "Information Request",
  "Other",
];

export default function HelpCenter({ session }: HelpCenterProps) {
  const userEmail = session?.user?.email ?? null;

  const [form, setForm] = useState({
    name: session?.user?.name ?? "",
    email: userEmail ?? "",
    category: CATEGORIES[0],
    subject: "",
    message: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Fetch user profile username from DB
  useEffect(() => {
    if (!userEmail) return;
    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          if (data.username) {
            const formatted = `@${data.username.replace(/^@/, '')}`;
            setForm((prev) => ({
              ...prev,
              email: formatted,
              name: prev.name || data.username,
            }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch profile for HelpCenter:", err);
      }
    };
    fetchProfile();
  }, [userEmail]);

  // Fetch existing tickets for logged-in user via secure API route
  useEffect(() => {
    if (!userEmail) return;
    const fetchTickets = async () => {
      setLoadingTickets(true);
      try {
        const res = await fetch("/api/helpcenter");
        if (res.ok) {
          const json = await res.json();
          const data = json?.tickets || [];
          const validTickets = data.filter((t: any) => {
            if (t.status === "resolved" || t.status === "closed") {
              if (t.resolved_at) {
                const resolvedTime = new Date(t.resolved_at).getTime();
                const twentyFourHours = 24 * 60 * 60 * 1000;
                if (Date.now() - resolvedTime > twentyFourHours) return false;
              }
            }
            return true;
          });
          setTickets(validTickets);
        }
      } catch (err) {
        console.error("Failed to fetch tickets:", err);
      } finally {
        setLoadingTickets(false);
      }
    };
    fetchTickets();
  }, [userEmail, success]);

  // Auto-select category and pre-fill report details from URL query parameters
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get("category");
      const reportAdId = params.get("reportAdId");
      const advertiserEmail = params.get("advertiserEmail");
      const reportType = params.get("type");
      const alreadyReported = params.get("reported") === "1";

      if (reportAdId) {
        const subjectText = reportType === "advertiser"
          ? `Report Advertiser: ${advertiserEmail || "Unknown"} (Ad ID: ${reportAdId})`
          : reportType === "dont_show"
          ? `Don't Show This Ad Again (Ad ID: ${reportAdId})`
          : `Report Ad ID: ${reportAdId}`;

        const defaultMessage = reportType === "dont_show"
          ? `Reason for hiding this ad from my feed: `
          : alreadyReported
          ? `This ${reportType === "advertiser" ? "advertiser" : "ad"} has already been blocked from my feed. Additional details: `
          : `Reason for reporting this ${reportType === "advertiser" ? "advertiser" : "ad"}: `;

        setForm((prev) => ({
          ...prev,
          category: "Ad or Highlight Problem",
          subject: subjectText,
          message: prev.message || defaultMessage,
        }));
      } else if (cat && CATEGORIES.includes(cat)) {
        setForm((prev) => ({ ...prev, category: cat }));
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setError("");

    const result = helpSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as string;
        if (!errs[key]) errs[key] = issue.message;
      });
      setFieldErrors(errs);
      setError("Please fix the errors below before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/helpcenter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const resData = await response.json();
      if (!response.ok) {
        setError(resData.error || "Failed to submit. Please try again.");
      } else {
        // Also persist report / detailed reason in ad_reports if reporting an ad from Help Center
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const reportAdId = params.get("reportAdId");
          const alreadyReported = params.get("reported") === "1";
          const trimmedReason = form.message.trim();
          const hasCustomDetails =
            !trimmedReason.endsWith("Additional details:") &&
            !trimmedReason.endsWith("Reason for reporting this ad:") &&
            !trimmedReason.endsWith("Reason for reporting this advertiser:");

          if (reportAdId && (!alreadyReported || hasCustomDetails)) {
            await fetch("/api/campaigns/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                adId: reportAdId,
                advertiserEmail: params.get("advertiserEmail") || "",
                reportType: params.get("type") || "ad",
                reason: trimmedReason,
              }),
            }).catch((err) => console.error("Failed to update report reason:", err));
          }
        }

        setSuccess(true);
        setForm({
          name: session?.user?.name ?? "",
          email: userEmail ?? "",
          category: CATEGORIES[0],
          subject: "",
          message: "",
        });
        if (typeof window !== "undefined" && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        setTimeout(() => setSuccess(false), 5000);
      }
    } catch (insertErr: any) {
      setError("Failed to submit. Please check your connection and try again.");
      console.error(insertErr);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "resolved" || status === "closed") return styles.badgeClosed;
    if (status === "replied") return styles.badgeReplied;
    return styles.badgeOpen;
  };

  const getStatusLabel = (status: string) => {
    if (status === "resolved" || status === "closed") return "RESOLVED (Deletes in 24h)";
    if (status === "replied") return "REPLIED";
    return "OPEN";
  };

  return (
    <div className={styles.container}>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <MessageCircle size={28} color="#fff" />
        </div>
        <h1 className={styles.heroTitle}>Help Center</h1>
        <p className={styles.heroSubtitle}>
          Have a problem or question? Send us a message below. We'll respond
          and you'll see our reply right here.
        </p>
      </div>

      {/* Submit Form */}
      <div className={styles.formCard}>
        <h2>
          <Send size={18} className={styles.headerPrimaryIcon} />
          Submit a Request
        </h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Your Name</label>
              <input
                type="text"
                className={styles.inputField}
                placeholder="Full name"
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Username / Handle *</label>
              <input
                type="text"
                required
                className={styles.inputField}
                placeholder="@username"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                readOnly={!!userEmail}
              />
              {fieldErrors.email && <span className={styles.fieldError}>{fieldErrors.email}</span>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Category</label>
              <select
                className={styles.selectField}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Subject *</label>
              <input
                type="text"
                required
                maxLength={150}
                className={styles.inputField}
                placeholder="Brief description of your issue"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
              {fieldErrors.subject && <span className={styles.fieldError}>{fieldErrors.subject}</span>}
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.formLabel}>Message *</label>
              <textarea
                required
                maxLength={2000}
                className={styles.textareaField}
                placeholder="Describe your issue in detail..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
              {fieldErrors.message && <span className={styles.fieldError}>{fieldErrors.message}</span>}
            </div>
          </div>

          {error && (
            <div className={styles.errorBanner} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className={styles.successBanner} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>Your request was submitted! We&apos;ll get back to you soon.</span>
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            className={styles.submitBtn}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Send Message"}
          </motion.button>
        </form>
      </div>

      {/* My Tickets */}
      <div className={styles.ticketsCard}>
        <h2>
          <Inbox size={18} className={styles.headerPrimaryIcon} />
          My Submitted Requests
        </h2>

        {!userEmail ? (
          <div className={styles.loginPrompt}>
            <p>
              <a href="/auth/login?connection=google-oauth2">Sign in</a> to see
              your submitted requests and replies.
            </p>
          </div>
        ) : loadingTickets ? (
          <div className={styles.emptyState}>Loading your tickets...</div>
        ) : tickets.length === 0 ? (
          <div className={styles.emptyState}>
            No requests submitted yet. Use the form above to get help.
          </div>
        ) : (
          tickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={styles.ticketItem}
            >
              <div className={styles.ticketHeader}>
                <span className={styles.ticketSubject}>{ticket.subject}</span>
                <div className={styles.ticketMeta}>
                  <span className={`${styles.badge} ${statusBadge(ticket.status)}`}>
                    {getStatusLabel(ticket.status)}
                  </span>
                  <span className={styles.ticketDate}>
                    {new Date(ticket.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <span className={styles.ticketCategory}>
                {ticket.category}
              </span>
              <p className={styles.ticketMessage}>{ticket.message}</p>

              {ticket.admin_reply && (
                <div className={styles.responseBox}>
                  <div className={styles.responseLabel} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <ShieldCheck size={14} />
                    <span>Admin Response</span>
                  </div>
                  <p className={styles.responseText}>{ticket.admin_reply}</p>
                  {ticket.replied_at && (
                    <p className={styles.ticketRepliedAt}>
                      Replied{" "}
                      {new Date(ticket.replied_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
