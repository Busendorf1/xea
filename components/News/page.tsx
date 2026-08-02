"use client";

import { useState, useEffect } from "react";
import supabase from "@/lib/utils/db";
import styles from "../News/page.module.css";
import HeaderJoin from "../HeaderJoin/page";
import LocationSelector from "../LocationSelector";
import { Zap, Calendar } from "lucide-react";
import { ALL_INTERESTS as interests } from "@/lib/categoryTargetingMap";

interface Session {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}

type NewsProps = {
  session: Session;
};

const steps = ["Media", "Title", "Content", "Targeting & Bidding", "Preview"];

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function News({ session }: NewsProps) {
  const [step, setStep] = useState(0);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [interest, setInterest] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [state, setState] = useState("");
  const [province, setProvince] = useState("");
  const [campaignDays, setCampaignDays] = useState(1);
  const [isBiddingEnabled, setIsBiddingEnabled] = useState(false);
  const [bidPrice, setBidPrice] = useState(1500);
  const [highestBid, setHighestBid] = useState<number>(1000);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");

  useEffect(() => {
    const fetchBalance = async () => {
      if (session?.user?.email) {
        try {
          const res = await fetch("/api/profile");
          if (res.ok) {
            const data = await res.json();
            setBalance(data.balance ?? 0);
          }
        } catch (e) {
          console.error("Failed to fetch profile balance:", e);
        }
      }
    };
    fetchBalance();
  }, [session]);

  useEffect(() => {
    if (!interest) return;
    const fetchTopBid = async () => {
      try {
        const res = await fetch(`/api/highlights?highestBid=true&interest=${encodeURIComponent(interest)}`);
        if (res.ok) {
          const data = await res.json();
          setHighestBid(data.highestBid || 1000);
          if (data.highestBid && data.highestBid >= bidPrice) {
            setBidPrice(data.highestBid + 200);
          }
        }
      } catch (e) {}
    };
    fetchTopBid();
  }, [interest]);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith("image/")) {
        if (file.size > 5 * 1024 * 1024) {
          alert("Cover image must be smaller than 5MB.");
          return;
        }
      } else {
        alert("Only image files are allowed for highlights (videos are not permitted).");
        return;
      }
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const capitalizeFirst = (txt: string) =>
    txt.trim() ? txt.trim().charAt(0).toUpperCase() + txt.trim().slice(1) : "";

  const isFormComplete = () => mediaFile && title && content && interest;

  const totalCost = isBiddingEnabled ? (bidPrice * campaignDays) : (1000 * campaignDays);

  const handleSubmit = async () => {
    if (!session || !session.user?.email) {
      alert("User not authenticated. Please log in.");
      return;
    }

    if (!isFormComplete()) return alert("Please complete all fields.");

    if (paymentMethod === "wallet" && balance < totalCost) {
      alert(`Insufficient wallet balance. Your balance is ${formatCurrency(balance)} but this highlight costs ${formatCurrency(totalCost)}.`);
      return;
    }

    setIsSubmitting(true);

    let uploadedFilename: string | null = null;

    try {
      const filename = `${Date.now()}_${mediaFile!.name.replace(
        /[^\w.-]/g,
        "_"
      )}`;
      
      const { error: uploadError } = await supabase.storage
        .from("news")
        .upload(filename, mediaFile!);

      if (uploadError) throw uploadError;
      uploadedFilename = filename;

      const { data: urlData } = supabase.storage
        .from("news")
        .getPublicUrl(filename);
        
      let paymentUrl = "/api/payments/initialize";
      if (paymentMethod === "wallet") {
        paymentUrl = "/api/payments/wallet-pay";
      }

      const paymentResponse = await fetch(paymentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "highlight",
          amount: totalCost,
          metadata: {
            type: "highlight",
            user_email: session.user.email?.toLowerCase(),
            title: capitalizeFirst(title),
            content: content.trim(),
            image_url: urlData.publicUrl,
            interest,
            country,
            state: state || null,
            province: province || null,
            campaign_days: campaignDays,
            is_bidded: isBiddingEnabled,
            bid_price: isBiddingEnabled ? bidPrice : null
          },
          callbackUrl: `${window.location.origin}/user/statement`
        })
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.error || "Failed to process payment");
      }

      if (paymentMethod === "wallet") {
        alert("Success! Your Daily Highlight has been paid using your wallet balance and submitted for review.");
        window.location.href = "/user/statement";
      } else {
        alert("Redirecting to Paystack to complete payment for your Highlight...");
        window.location.href = paymentData.authorization_url;
      }
      
      setStep(0);
      setMediaFile(null);
      setMediaPreview(null);
      setTitle("");
      setContent("");
      setInterest("");
    } catch (err: any) {
      console.error(err);
      if (uploadedFilename) {
        await supabase.storage.from("news").remove([uploadedFilename]);
      }
      alert(err.message || "An error occurred while submitting highlight.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <HeaderJoin />
      <div className={styles.pageWapper}>
        <div className={styles.pageWrapper}>
          {/* Progress Step Tracker */}
          <div className={styles.progressContainer}>
            {steps.map((label, idx) => (
              <div
                key={label}
                className={`${styles.progressStep} ${
                  idx === step ? styles.activeStep : idx < step ? styles.completedStep : ""
                }`}
              >
                <div className={styles.stepNumber}>{idx < step ? "✓" : idx + 1}</div>
                <span className={styles.stepLabel}>{label}</span>
                {idx < steps.length - 1 && <div className={styles.stepLine} />}
              </div>
            ))}
          </div>

          <h1>Post Daily Highlight</h1>

          <div className={styles.adFormContainer}>
            {/* STEP 0: MEDIA */}
            {step === 0 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Cover Image (Required)</label>
                {mediaPreview ? (
                  <div style={{ textAlign: "center" }}>
                    <img src={mediaPreview} alt="Cover Preview" style={{ maxWidth: "100%", maxHeight: "280px", borderRadius: "12px", border: "1px solid var(--card-border)", objectFit: "contain" }} />
                    <div style={{ marginTop: "0.75rem" }}>
                      <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid #ef4444", color: "#ef4444", background: "transparent", cursor: "pointer", fontWeight: 600 }}>Remove Image</button>
                    </div>
                  </div>
                ) : (
                  <label className={styles.uploadZone}>
                    <input type="file" accept="image/*" onChange={handleMediaChange} hidden />
                    <p style={{ fontWeight: 600, color: "var(--primary)" }}>Click to select cover image file</p>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Supports PNG, JPG, WEBP (Max 5MB)</p>
                  </label>
                )}
                <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                  <button disabled={!mediaFile} onClick={() => setStep(1)} style={{ padding: "0.85rem 1.75rem", borderRadius: "12px", border: "none", backgroundColor: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Continue to Title →</button>
                </div>
              </div>
            )}

            {/* STEP 1: TITLE */}
            {step === 1 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Highlight Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Grand Opening Sale 50% Off" className={styles.inputBox} maxLength={80} />
                <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between" }}>
                  <button onClick={() => setStep(0)} style={{ padding: "0.85rem 1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "transparent", color: "var(--foreground)", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                  <button disabled={!title.trim()} onClick={() => setStep(2)} style={{ padding: "0.85rem 1.75rem", borderRadius: "12px", border: "none", backgroundColor: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Continue to Content →</button>
                </div>
              </div>
            )}

            {/* STEP 2: CONTENT */}
            {step === 2 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Highlight Details & Story</label>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Share full details of your highlight announcement..." className={styles.textareaBox} rows={6} maxLength={1000} />
                <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between" }}>
                  <button onClick={() => setStep(1)} style={{ padding: "0.85rem 1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "transparent", color: "var(--foreground)", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                  <button disabled={!content.trim()} onClick={() => setStep(3)} style={{ padding: "0.85rem 1.75rem", borderRadius: "12px", border: "none", backgroundColor: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Continue to Targeting & Bidding →</button>
                </div>
              </div>
            )}

            {/* STEP 3: TARGETING, LOCATION & BIDDING */}
            {step === 3 && (
              <div className={styles.formGroup} style={{ gap: "1.5rem" }}>
                {/* Category Card */}
                <div style={{ padding: "1.25rem 1.5rem", backgroundColor: "var(--sidebar-bg)", borderRadius: "14px", border: "1px solid var(--card-border)" }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: "0.5rem", display: "block" }}>Category & Interest</label>
                  <div className={styles.selectWrapper}>
                    <select value={interest} onChange={(e) => setInterest(e.target.value)} className={styles.selectBox}>
                      <option value="">-- Select Target Category --</option>
                      {interests.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target Location Card */}
                <div style={{ padding: "1.25rem 1.5rem", backgroundColor: "var(--sidebar-bg)", borderRadius: "14px", border: "1px solid var(--card-border)" }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: "0.75rem", display: "block", fontSize: "0.9rem", fontWeight: 700 }}>
                    Target Location
                  </label>
                  <LocationSelector
                    country={country}
                    state={state}
                    location={province}
                    inputClass={styles.inputBox}
                    labelClass={styles.fieldLabel}
                    groupClass={styles.formGroup}
                    cityLabel="Province"
                    onChange={({ country: c, state: s, location: loc }) => {
                      setCountry(c);
                      setState(s);
                      setProvince(loc);
                    }}
                  />
                </div>

                {/* Duration Selector Card */}
                <div style={{ padding: "1.25rem 1.5rem", backgroundColor: "var(--sidebar-bg)", borderRadius: "14px", border: "1px solid var(--card-border)" }}>
                  <label className={styles.fieldLabel} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                    <Calendar size={16} color="var(--primary)" /> Duration (Max 5 Days)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCampaignDays(num)}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "10px",
                          border: `1px solid ${campaignDays === num ? "var(--primary)" : "var(--card-border)"}`,
                          backgroundColor: campaignDays === num ? "var(--primary)" : "var(--background)",
                          color: campaignDays === num ? "#fff" : "var(--foreground)",
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        {num} {num === 1 ? "Day" : "Days"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bidding Card */}
                <div style={{ padding: "1.5rem", backgroundColor: "rgba(245, 158, 11, 0.06)", borderRadius: "14px", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "#f59e0b", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Zap size={16} color="#f59e0b" /> Contest for Top Highlight Position (Bidding)
                      </strong>
                      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
                        Highest bids stay at the top of the highlights carousel. Current top bid for {interest || "this category"}: <strong>{formatCurrency(highestBid)}/day</strong>.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isBiddingEnabled}
                      onChange={(e) => setIsBiddingEnabled(e.target.checked)}
                      style={{ width: 22, height: 22, cursor: "pointer", flexShrink: 0 }}
                    />
                  </div>

                  {isBiddingEnabled && (
                    <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px dashed rgba(245, 158, 11, 0.3)" }}>
                      <label className={styles.fieldLabel} style={{ marginBottom: "0.5rem", display: "block" }}>Your Bid Price Per Day (₦)</label>
                      <input
                        type="number"
                        min={highestBid + 100}
                        step={100}
                        value={bidPrice}
                        onChange={(e) => setBidPrice(parseFloat(e.target.value) || 1000)}
                        className={styles.inputBox}
                      />
                      <p style={{ fontSize: "0.78rem", color: "#f59e0b", marginTop: "6px", fontWeight: 600 }}>
                        Total Bidded Cost: {formatCurrency(bidPrice * campaignDays)} for {campaignDays} days. Higher bids overtake lower bids at top position.
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between" }}>
                  <button onClick={() => setStep(2)} style={{ padding: "0.85rem 1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "transparent", color: "var(--foreground)", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                  <button disabled={!interest} onClick={() => setStep(4)} style={{ padding: "0.85rem 1.75rem", borderRadius: "12px", border: "none", backgroundColor: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Continue to Preview →</button>
                </div>
              </div>
            )}

            {/* STEP 4: PREVIEW & PAYMENT */}
            {step === 4 && (
              <div className={styles.formGroup}>
                <div style={{ borderRadius: "16px", border: "1px solid var(--card-border)", overflow: "hidden", backgroundColor: "var(--card-bg)" }}>
                  {mediaPreview && <img src={mediaPreview} alt="Preview" style={{ width: "100%", maxHeight: "240px", objectFit: "contain", background: "#000" }} />}
                  <div style={{ padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", backgroundColor: "var(--sidebar-bg)", padding: "3px 8px", borderRadius: "6px" }}>{interest}</span>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: "0.5rem", color: "var(--foreground)" }}>{capitalizeFirst(title)}</h3>
                    <p style={{ fontSize: "0.9rem", color: "var(--foreground)", lineHeight: 1.5, marginTop: "0.5rem" }}>{content}</p>
                    <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Targeting: {country} {state ? `· ${state}` : ""} · {campaignDays} Days {isBiddingEnabled ? `· Bidded (₦${bidPrice}/day)` : ""}
                    </div>
                  </div>
                </div>

                {/* Payment selector */}
                <div style={{ marginTop: "1.5rem", padding: "1.25rem", backgroundColor: "var(--sidebar-bg)", borderRadius: "12px", border: "1px solid var(--card-border)" }}>
                  <h4 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--foreground)" }}>Select Payment Method</h4>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600 }}>
                      <input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Paystack (Card/Bank/Transfer)
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600 }}>
                      <input type="radio" name="pay" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} /> Pay from Wallet Balance ({formatCurrency(balance)})
                    </label>
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--primary)" }}>
                    Total Payment: {formatCurrency(totalCost)}
                  </div>
                </div>

                <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between" }}>
                  <button onClick={() => setStep(3)} style={{ padding: "0.85rem 1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "transparent", color: "var(--foreground)", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                  <button disabled={isSubmitting} onClick={handleSubmit} style={{ padding: "0.85rem 1.75rem", borderRadius: "12px", border: "none", backgroundColor: "var(--primary)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    {isSubmitting ? "Processing Submission..." : `Pay ${formatCurrency(totalCost)} & Submit`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
