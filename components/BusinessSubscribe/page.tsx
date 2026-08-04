"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@auth0/nextjs-auth0";
import { useRouter } from "next/navigation";
import { CheckCircle2, Globe, ShieldCheck, Sparkles, Building2, ArrowRight, Lock } from "lucide-react";
import styles from "./page.module.css";

export default function BusinessSubscribeComponent() {
  const { user: authUser, isLoading: authLoading } = useUser();
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [domain, setDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.push("/auth/login?connection=google-oauth2");
    }
  }, [authUser, authLoading, router]);

  const MONTHLY_RATE = 45000;
  const totalPrice = durationMonths * MONTHLY_RATE;

  if (authLoading) {
    return (
      <div className={styles.loadingContainer}>
        <p>Loading session...</p>
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
          contact_email: contactEmail,
          duration_months: durationMonths,
          total_price: totalPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit domain application");
      }

      setSuccessMsg(
        data.message ||
          `Domain Application Submitted! Your application for ${domain} has been received. Our team will review your business and contact you if deemed eligible. Response might take awhile.`
      );
      setBusinessName("");
      setDomain("");
      setContactEmail("");
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

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
            No complicated API keys required for sellers. Paayh's ad builder automatically detects
            your domain in CTA links and applies the discount live.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.purple}`}>
            <ShieldCheck size={22} color="#a855f7" />
          </div>
          <h3 className={styles.featureTitle}>Ecosystem Growth</h3>
          <p className={styles.featureDesc}>
            Attract more merchants and boost sales conversion rates by giving your vendors an
            exclusive advertising edge over competitors.
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className={styles.formCard}>
        <h2 className={styles.formTitle}>Register Your Business Domain</h2>

        {successMsg && (
          <div className={styles.successAlert}>
            <CheckCircle2 size={22} color="#34d399" className={styles.successIcon} />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className={styles.errorAlert}>⚠️ {errorMsg}</div>
        )}

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

          {/* Duration Selector */}
          {/* <div className={styles.formGroup}>
            <label className={styles.label}>
              Intended Subscription Duration (₦45,000 / month)
            </label>
            <div className={styles.durationGrid}>
              {[1, 3, 6].map((months) => (
                <button
                  key={months}
                  type="button"
                  onClick={() => setDurationMonths(months)}
                  className={`${styles.durationBtn} ${durationMonths === months ? styles.active : ""}`}
                >
                  <span>{months} Month{months > 1 ? "s" : ""}</span>
                  <span className={styles.durationPrice}>
                    ₦{(months * MONTHLY_RATE).toLocaleString("en-NG")}
                  </span>
                </button>
              ))}
            </div>
          </div> */}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? (
              "Submitting Application..."
            ) : (
              <>
                <Building2 size={18} /> Submit Application <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <p className={styles.formFooter}>
          Questions? Contact our team at{" "}
          <a href="mailto:partners@paayh.com">partners@paayh.com</a>.
        </p>
      </div>
    </div>
  );
}
