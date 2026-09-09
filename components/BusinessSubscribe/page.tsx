"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@auth0/nextjs-auth0";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Globe,
  ShieldCheck,
  Sparkles,
  Building2,
  ArrowRight,
  Lock,
  Clock,
  AlertCircle,
  CreditCard,
  Wallet,
  RefreshCw,
} from "lucide-react";
import styles from "./page.module.css";

export default function BusinessSubscribeComponent() {
  const { user: authUser, isLoading: authLoading } = useUser();
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [domain, setDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingSub, setFetchingSub] = useState(true);
  const [subscriber, setSubscriber] = useState<any | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("NGN");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showReapplyForm, setShowReapplyForm] = useState(false);

  const fetchStatusAndBalance = async (email: string) => {
    try {
      setFetchingSub(true);
      const [subRes, profileRes] = await Promise.all([
        fetch(`/api/business/subscribe?email=${encodeURIComponent(email)}`),
        fetch("/api/profile"),
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscriber(subData.subscriber || null);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setWalletBalance(parseFloat(profileData.user?.balance || profileData.balance || "0"));
        const country = (profileData.user?.country || profileData.country || "").toLowerCase();
        const isNigeria = !country || ["nigeria", "ng", "ngn"].includes(country);
        setCurrency(isNigeria ? "NGN" : "USD");
      }
    } catch (err) {
      console.error("Error fetching subscriber standing:", err);
    } finally {
      setFetchingSub(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/auth/login?connection=google-oauth2");
    } else if (authUser?.email) {
      fetchStatusAndBalance(authUser.email);
      setContactEmail(authUser.email);
    }
  }, [authUser, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/business/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          domain,
          contact_email: contactEmail || authUser?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit domain application");
      }

      setSuccessMsg(data.message || "Domain application submitted for admin review!");
      setSubscriber(data.subscriber || null);
      setShowReapplyForm(false);
      setBusinessName("");
      setDomain("");
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletPayment = async () => {
    if (!subscriber) return;
    const requiredAmount = Number(subscriber.amount || (currency === "NGN" ? 150000 : 100));
    const formattedReq = currency === "NGN" ? `₦${requiredAmount.toLocaleString()}` : `$${requiredAmount}`;
    const formattedBal = currency === "NGN" ? `₦${walletBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : `$${walletBalance.toFixed(2)}`;

    if (walletBalance < requiredAmount) {
      setErrorMsg(`Insufficient wallet balance. You have ${formattedBal}, but ${formattedReq} is required. Please fund your wallet or pay with card.`);
      return;
    }

    if (!confirm(`Confirm payment of ${formattedReq} from your wallet balance to activate the 30% discount subsidy for ${subscriber.domain}?`)) {
      return;
    }

    setPaymentLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/business/subscribe/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_id: subscriber.id,
          payment_method: "wallet",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to process wallet payment.");
      }

      setSuccessMsg(data.message || "Payment successful! Your brand subscription is now active.");
      setSubscriber(data.subscriber);
      if (typeof data.new_balance === "number") {
        setWalletBalance(data.new_balance);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Payment failed. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCardPayment = async () => {
    if (!subscriber) return;
    setPaymentLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/business/subscribe/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_id: subscriber.id,
          payment_method: "card",
          callback_url: window.location.href,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to initialize card checkout.");
      }

      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        throw new Error("Missing payment authorization URL.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to initialize card checkout. Please use wallet balance or try again.");
      setPaymentLoading(false);
    }
  };

  if (authLoading || fetchingSub) {
    return (
      <div className={styles.loadingContainer}>
        <RefreshCw size={24} className="spin" style={{ marginRight: 10 }} />
        <p>Loading brand subscription status...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className={styles.loginRequiredCard}>
        <Lock size={36} color="#3b82f6" />
        <h2>Login Required</h2>
        <p>You must be signed in to register your business domain as a Paayh Premium Subscriber.</p>
        <a href="/auth/login?connection=google-oauth2" className={styles.submitBtn}>
          Sign in to Continue <ArrowRight size={18} />
        </a>
      </div>
    );
  }

  const subPrice = currency === "NGN" ? 150000 : 100;
  const formattedSubPrice = currency === "NGN" ? "₦150,000" : "$100 USD";

  return (
    <div className={styles.page}>
      {/* Hero */}
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Discount Ad Costs for Sellers on Your Platform
        </h1>
        <p className={styles.heroSubtitle}>
          Register your website domain as a{" "}
          <strong style={{ color: "#38bdf8" }}>Paayh Premium Subscriber</strong>. Whenever any
          merchant advertises a product link from your domain on Paayh, they instantly unlock a{" "}
          <strong style={{ color: "#10b981" }}>30% ad discount!</strong>
        </p>
      </div>

      {/* Feature Grid */}
      <div className={styles.featureGrid}>
        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.green}`}>
            <Sparkles size={22} color="#10b981" />
          </div>
          <h3 className={styles.featureTitle}>30% Cost Reduction</h3>
          <p className={styles.featureDesc}>
            Ad creation fees for your domain drop by 30% per view, incentivizing more sellers to
            list and advertise items from your platform.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.blue}`}>
            <Globe size={22} color="#3b82f6" />
          </div>
          <h3 className={styles.featureTitle}>Automatic Domain Matching</h3>
          <p className={styles.featureDesc}>
            No complicated API keys required for sellers. Paayh automatically detects
            your registered domain in campaign CTA links and applies the discount live.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.purple}`}>
            <ShieldCheck size={22} color="#a855f7" />
          </div>
          <h3 className={styles.featureTitle}>Admin-Verified Standing</h3>
          <p className={styles.featureDesc}>
            Applications undergo administrator review. Once verified and activated with your subscription fee ({formattedSubPrice}), your 30% subsidy is guaranteed live.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className={styles.successAlert} style={{ maxWidth: "680px", margin: "0 auto 1.5rem auto" }}>
          <CheckCircle2 size={22} color="#34d399" className={styles.successIcon} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className={styles.errorAlert} style={{ maxWidth: "680px", margin: "0 auto 1.5rem auto" }}>
          <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SECTION 1: PENDING APPLICATION STATUS */}
      {subscriber && subscriber.status === "pending" && !showReapplyForm && (
        <div className={styles.formCard} style={{ borderColor: "var(--card-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 12, backgroundColor: "var(--sidebar-bg)", margin: "0 auto 1.25rem auto" }}>
            <Clock size={28} color="var(--primary)" />
          </div>
          <h2 className={styles.formTitle} style={{ marginBottom: "0.5rem" }}>
            Application Under Review
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Your brand application for <strong style={{ color: "var(--primary)" }}>{subscriber.domain}</strong> ({subscriber.business_name}) has been submitted to platform administrators for review.
          </p>

          <div style={{ backgroundColor: "var(--background)", borderRadius: 8, padding: "1.25rem", border: "1px solid var(--card-border)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Registered Domain:</span>
              <strong style={{ color: "var(--primary)" }}>{subscriber.domain}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Business / Platform Name:</span>
              <strong>{subscriber.business_name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Review Status:</span>
              <span style={{ color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", fontSize: "0.8rem", backgroundColor: "var(--sidebar-bg)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--card-border)" }}>
                Pending Admin Approval
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Activation Fee Upon Approval:</span>
              <strong style={{ color: "var(--success)" }}>{subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`}</strong>
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Once approved, you will be able to complete payment right here to activate your brand's 30% ad subsidy.
          </p>
        </div>
      )}

      {/* SECTION 2: APPROVED APPLICATION - COMPLETE PAYMENT IN THIS SAME SECTION */}
      {subscriber && subscriber.status === "approved" && subscriber.payment_status !== "paid" && (
        <div className={styles.formCard} style={{ borderColor: "var(--success)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 12, backgroundColor: "var(--sidebar-bg)", margin: "0 auto 1.25rem auto" }}>
            <CheckCircle2 size={28} color="var(--success)" />
          </div>
          <h2 className={styles.formTitle} style={{ color: "var(--success)", marginBottom: "0.5rem" }}>
            Application Approved!
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Your application for <strong style={{ color: "var(--primary)" }}>{subscriber.domain}</strong> has been approved by administrators. Complete payment to activate your brand's 30% discount subsidy.
          </p>

          <div style={{ backgroundColor: "var(--background)", borderRadius: 8, padding: "1.25rem", border: "1px solid var(--card-border)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Domain:</span>
              <strong style={{ color: "var(--primary)" }}>{subscriber.domain}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Business Name:</span>
              <strong>{subscriber.business_name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Status:</span>
              <span style={{ color: "var(--success)", fontWeight: 700, fontSize: "0.8rem", backgroundColor: "var(--sidebar-bg)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--card-border)" }}>
                APPROVED (AWAITING PAYMENT)
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Subscription Amount:</span>
              <strong style={{ color: "var(--success)", fontSize: "1.1rem" }}>
                {subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Your Wallet Balance:</span>
              <strong style={{ color: walletBalance >= Number(subscriber.amount || 150000) ? "var(--success)" : "var(--danger)" }}>
                {currency === "NGN" ? `₦${walletBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : `$${walletBalance.toFixed(2)}`}
              </strong>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              type="button"
              onClick={handleWalletPayment}
              disabled={paymentLoading}
              className={styles.submitBtn}
              style={{ backgroundColor: "#10b981" }}
            >
              <Wallet size={18} />
              {paymentLoading ? "Processing Payment..." : `Pay ${subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`} from Wallet Balance`}
            </button>

            <button
              type="button"
              onClick={handleCardPayment}
              disabled={paymentLoading}
              className={styles.submitBtn}
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--foreground)", border: "1px solid var(--card-border)" }}
            >
              <CreditCard size={18} />
              Pay with Card / Bank (Paystack)
            </button>
          </div>
        </div>
      )}

      {/* SECTION 3: ACTIVE VERIFIED SUBSCRIBER */}
      {subscriber && subscriber.status === "active" && (
        <div className={styles.formCard} style={{ borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 12, backgroundColor: "rgba(16,185,129,0.2)", margin: "0 auto 1.25rem auto" }}>
            <ShieldCheck size={32} color="#10b981" />
          </div>
          <h2 className={styles.formTitle} style={{ color: "#10b981", marginBottom: "0.5rem" }}>
            Verified Premium Subscriber Brand
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            <strong style={{ color: "#38bdf8" }}>{subscriber.domain}</strong> ({subscriber.business_name}) is actively verified. Whenever any merchant promotes a link with your domain, they automatically receive a <strong style={{ color: "#10b981" }}>30% ad creation discount</strong>.
          </p>

          <div style={{ backgroundColor: "var(--background)", borderRadius: 8, padding: "1.25rem", border: "1px solid var(--card-border)", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Brand Domain:</span>
              <strong style={{ color: "#38bdf8" }}>{subscriber.domain}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Discount Subsidy:</span>
              <strong style={{ color: "#10b981" }}>{subscriber.discount_percentage || 30}% OFF on every ad</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Standing:</span>
              <span style={{ color: "#10b981", fontWeight: 700, fontSize: "0.8rem", backgroundColor: "rgba(16,185,129,0.15)", padding: "2px 8px", borderRadius: 4 }}>
                ACTIVE &amp; PAID
              </span>
            </div>
            {subscriber.payment_reference && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Reference:</span>
                <code>{subscriber.payment_reference}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: REJECTED APPLICATION */}
      {subscriber && subscriber.status === "rejected" && !showReapplyForm && (
        <div className={styles.formCard} style={{ borderColor: "#ef4444" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.15)", margin: "0 auto 1.25rem auto" }}>
            <AlertCircle size={28} color="#ef4444" />
          </div>
          <h2 className={styles.formTitle} style={{ color: "#ef4444", marginBottom: "0.5rem" }}>
            Application Not Approved
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1rem" }}>
            Your application for <strong>{subscriber.domain}</strong> was reviewed and not approved at this time.
          </p>
          {subscriber.rejection_reason && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "10px 14px", fontSize: "0.9rem", color: "#f87171", marginBottom: "1.5rem" }}>
              <strong>Admin Feedback:</strong> {subscriber.rejection_reason}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowReapplyForm(true)}
            className={styles.submitBtn}
            style={{ backgroundColor: "var(--primary)" }}
          >
            Submit Corrected Application <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* SECTION 5: REGISTRATION FORM (When user has no existing application or clicked Reapply) */}
      {(!subscriber || showReapplyForm) && (
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>Register Your Business Domain</h2>

          <div style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: "1.5rem", fontSize: "0.88rem", color: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Annual Subscription Fee:</span>
            <strong style={{ color: "#10b981", fontSize: "1.05rem" }}>{formattedSubPrice}</strong>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Business / Platform Name</label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. MyStore Nigeria"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Website Domain</label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. mystore.ng"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Contact Email</label>
              <input
                type="email"
                className={styles.input}
                placeholder="e.g. partner@mystore.ng"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                "Submitting Application..."
              ) : (
                <>
                  <Building2 size={18} /> Submit Application for Review <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className={styles.formFooter}>
            Questions? Contact our team at{" "}
            <a href="mailto:partners@paayh.com">partners@paayh.com</a>.
          </p>
        </div>
      )}
    </div>
  );
}
