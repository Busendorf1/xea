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
        <RefreshCw size={24} className={`spin ${styles.spinIcon}`} />
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
          <strong className={styles.accent}>Paayh Premium Subscriber</strong>. Whenever any
          merchant advertises a product link from your domain on Paayh, they instantly unlock a{" "}
          <strong className={styles.green}>30% ad discount!</strong>
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
        <div className={`${styles.successAlert} ${styles.alertBox}`}>
          <CheckCircle2 size={22} color="#34d399" className={styles.successIcon} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className={`${styles.errorAlert} ${styles.alertBox}`}>
          <AlertCircle size={20} color="#ef4444" className={styles.alertIcon} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SECTION 1: PENDING APPLICATION STATUS */}
      {subscriber && subscriber.status === "pending" && !showReapplyForm && (
        <div className={styles.formCard}>
          <div className={styles.statusIconCircle}>
            <Clock size={28} color="var(--primary)" />
          </div>
          <h2 className={`${styles.formTitle} ${styles.formTitleMargin}`}>
            Application Under Review
          </h2>
          <p className={styles.statusText}>
            Your brand application for <strong className={styles.textPrimary}>{subscriber.domain}</strong> ({subscriber.business_name}) has been submitted to platform administrators for review.
          </p>

          <div className={styles.statusSummaryBox}>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Registered Domain:</span>
              <strong className={styles.textPrimary}>{subscriber.domain}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Business / Platform Name:</span>
              <strong>{subscriber.business_name}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Review Status:</span>
              <span className={styles.badgePending}>
                Pending Admin Approval
              </span>
            </div>
            <div className={styles.summaryRowLast}>
              <span className={styles.textMuted}>Activation Fee Upon Approval:</span>
              <strong className={styles.textSuccess}>{subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`}</strong>
            </div>
          </div>

          <p className={styles.statusHint}>
            Once approved, you will be able to complete payment right here to activate your brand&apos;s 30% ad subsidy.
          </p>
        </div>
      )}

      {/* SECTION 2: APPROVED APPLICATION - COMPLETE PAYMENT IN THIS SAME SECTION */}
      {subscriber && subscriber.status === "approved" && subscriber.payment_status !== "paid" && (
        <div className={`${styles.formCard} ${styles.formCardSuccess}`}>
          <div className={styles.statusIconCircle}>
            <CheckCircle2 size={28} color="var(--success)" />
          </div>
          <h2 className={`${styles.formTitle} ${styles.formTitleSuccess}`}>
            Application Approved!
          </h2>
          <p className={styles.statusText}>
            Your application for <strong className={styles.textPrimary}>{subscriber.domain}</strong> has been approved by administrators. Complete payment to activate your brand&apos;s 30% discount subsidy.
          </p>

          <div className={styles.statusSummaryBox}>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Domain:</span>
              <strong className={styles.textPrimary}>{subscriber.domain}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Business Name:</span>
              <strong>{subscriber.business_name}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Status:</span>
              <span className={styles.badgeApproved}>
                APPROVED (AWAITING PAYMENT)
              </span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Subscription Amount:</span>
              <strong className={`${styles.textSuccess} ${styles.textLarge}`}>
                {subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`}
              </strong>
            </div>
            <div className={styles.summaryRowLast}>
              <span className={styles.textMuted}>Your Wallet Balance:</span>
              <strong className={walletBalance >= Number(subscriber.amount || 150000) ? styles.textSuccess : styles.textDanger}>
                {currency === "NGN" ? `₦${walletBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : `$${walletBalance.toFixed(2)}`}
              </strong>
            </div>
          </div>

          <div className={styles.paymentButtons}>
            <button
              type="button"
              onClick={handleWalletPayment}
              disabled={paymentLoading}
              className={`${styles.submitBtn} ${styles.payWalletBtn}`}
            >
              <Wallet size={18} />
              {paymentLoading ? "Processing Payment..." : `Pay ${subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`} from Wallet Balance`}
            </button>

            <button
              type="button"
              onClick={handleCardPayment}
              disabled={paymentLoading}
              className={`${styles.submitBtn} ${styles.payCardBtn}`}
            >
              <CreditCard size={18} />
              Pay with Card / Bank (Paystack)
            </button>
          </div>
        </div>
      )}

      {/* SECTION 3: ACTIVE VERIFIED SUBSCRIBER */}
      {subscriber && subscriber.status === "active" && (
        <div className={`${styles.formCard} ${styles.formCardActive}`}>
          <div className={`${styles.statusIconCircle} ${styles.statusIconCircleSuccess}`}>
            <ShieldCheck size={32} color="#10b981" />
          </div>
          <h2 className={`${styles.formTitle} ${styles.formTitleActive}`}>
            Verified Premium Subscriber Brand
          </h2>
          <p className={styles.statusText}>
            <strong className={styles.accentText}>{subscriber.domain}</strong> ({subscriber.business_name}) is actively verified. Whenever any merchant promotes a link with your domain, they automatically receive a <strong className={styles.greenText}>30% ad creation discount</strong>.
          </p>

          <div className={`${styles.statusSummaryBox} ${styles.statusSummaryBoxNoMargin}`}>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Brand Domain:</span>
              <strong className={styles.accentText}>{subscriber.domain}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Discount Subsidy:</span>
              <strong className={styles.greenText}>{subscriber.discount_percentage || 30}% OFF on every ad</strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.textMuted}>Standing:</span>
              <span className={styles.badgeActivePaid}>
                ACTIVE &amp; PAID
              </span>
            </div>
            {subscriber.payment_reference && (
              <div className={styles.summaryRowLast}>
                <span className={styles.textMuted}>Reference:</span>
                <code>{subscriber.payment_reference}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: REJECTED APPLICATION */}
      {subscriber && subscriber.status === "rejected" && !showReapplyForm && (
        <div className={`${styles.formCard} ${styles.formCardDanger}`}>
          <div className={`${styles.statusIconCircle} ${styles.statusIconCircleDanger}`}>
            <AlertCircle size={28} color="#ef4444" />
          </div>
          <h2 className={`${styles.formTitle} ${styles.formTitleDanger}`}>
            Application Not Approved
          </h2>
          <p className={`${styles.statusText} ${styles.statusTextCompact}`}>
            Your application for <strong>{subscriber.domain}</strong> was reviewed and not approved at this time.
          </p>
          {subscriber.rejection_reason && (
            <div className={styles.rejectionFeedbackBox}>
              <strong>Admin Feedback:</strong> {subscriber.rejection_reason}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowReapplyForm(true)}
            className={styles.submitBtn}
          >
            Submit Corrected Application <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* SECTION 5: REGISTRATION FORM (When user has no existing application or clicked Reapply) */}
      {(!subscriber || showReapplyForm) && (
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>Register Your Business Domain</h2>

          <div className={styles.feeNoticeBanner}>
            <span>Annual Subscription Fee:</span>
            <strong className={styles.feePrice}>{formattedSubPrice}</strong>
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
