"use client";

import { useState, useEffect } from "react";
import supabase from "@/lib/utils/db"; // Adjust path to your Supabase client
import styles from "../News/page.module.css";
import HeaderJoin from "../HeaderJoin/page";

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
const interests = [
  "Jobs", "Business", "Investing", "Fashion", "Fitness", "Sports",
  "Health", "Travel", "Education", "Tech", "Gaming", "Politics",
  "Religion", "Movies", "Music", "Lifestyle", "Shopping", "Books",
  "Beauty", "Home Decor", "Parenting", "Spirituality", "Cars", "Cooking",
  "Photography", "Volunteering", "Environment", "Dating", "Finance",
  "Online Courses"
];
const steps = ["Media", "Title", "Content", "Interest", "Preview"];

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function News({ session }: NewsProps) {
  const [step, setStep] = useState(0);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [interest, setInterest] = useState("");
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

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith("image/")) {
        if (file.size > 5 * 1024 * 1024) {
          alert("Cover image must be smaller than 5MB.");
          return;
        }
        setMediaType("image");
      } else if (file.type.startsWith("video/")) {
        if (file.size > 60 * 1024 * 1024) {
          alert("Cover video must be smaller than 60MB.");
          return;
        }
        setMediaType("video");
      } else {
        alert("Invalid file format. Only images and videos are allowed.");
        return;
      }
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const capitalizeFirst = (txt: string) =>
    txt.charAt(0).toUpperCase() + txt.slice(1);

  const isFormComplete = () => mediaFile && title && content && interest;

  const handleSubmit = async () => {
    if (!session || !session.user?.email) {
      alert('User not authenticated. Please log in.');
      return;
    }

    if (!isFormComplete()) return alert("Complete all fields.");

    if (paymentMethod === "wallet" && balance < 1000) {
      alert(`❌ Insufficient wallet balance. Your balance is ${formatCurrency(balance)} but highlights cost ${formatCurrency(1000)}.`);
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
          amount: 1000,
          metadata: {
            type: "highlight",
            user_email: session.user.email?.toLowerCase(),
            title: capitalizeFirst(title.trim()),
            content: content.trim(),
            image_url: urlData.publicUrl,
            interest
          },
          callbackUrl: `${window.location.origin}/user/statement`
        })
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(paymentData.error || "Failed to process payment");
      }

      if (paymentMethod === "wallet") {
        alert("Success! Your news highlight has been paid using your wallet balance and submitted for review.");
        window.location.href = "/user/statement";
      } else {
        alert("Redirecting to Paystack to complete payment for your Highlight...");
        window.location.href = paymentData.authorization_url;
      }
      
      // reset
      setStep(0);
      setMediaFile(null);
      setMediaPreview(null);
      setTitle("");
      setContent("");
      setInterest("");
    } catch (err: any) {
      console.error(err);
      // Clean up orphaned storage object
      if (uploadedFilename) {
        await supabase.storage.from("news").remove([uploadedFilename]);
      }
      alert("Submission failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <HeaderJoin />
      <main className={styles.pageWapper}>
        <h1>Post Highlights</h1>
        <div className={styles.pageWrapper}>
          {/* Progress Step Tracker */}
          <div className={styles.progressContainer}>
            {steps.map((s, index) => (
              <div
                key={s}
                className={`${styles.progressStep} ${
                  index <= step ? styles.activeStep : ""
                }`}
              >
                <span className={styles.stepNumber}>{index + 1}</span>
                <span className={styles.stepLabel}>{s}</span>
                {index < steps.length - 1 && <div className={styles.stepLine} />}
              </div>
            ))}
          </div>

          <div className={styles.adFormContainer}>
            {/* Step 0: Media Upload */}
            {step === 0 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Upload Cover Image or Video</label>
                <label className={styles.uploadZone}>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleMediaChange}
                    className={styles.fileInput}
                  />
                  <div className={styles.uploadPlaceholder}>
                    <svg
                      className={styles.uploadIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>
                      {mediaFile ? mediaFile.name : "Choose an image/video or drag it here"}
                    </span>
                    <span className={styles.uploadSubtext}>
                      Supports JPG, PNG, WEBP (Max 5MB) or MP4, WEBM (Max 60MB)
                    </span>
                  </div>
                </label>
                {mediaPreview && (
                  <div className={styles.imagePreviewContainer}>
                    {mediaType === "image" ? (
                      <img
                        src={mediaPreview}
                        alt="News Preview Image"
                        className={styles.fullPreviewImg}
                      />
                    ) : (
                      <video
                        src={mediaPreview}
                        controls
                        className={styles.fullPreviewImg}
                        style={{ maxHeight: "300px", background: "#000" }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Title Input */}
            {step === 1 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Title (60 chars max)</label>
                <input
                  type="text"
                  className={styles.inputBox}
                  maxLength={60}
                  placeholder="Give your highlight a captivating title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className={styles.fieldFooter}>
                  <span className={styles.infoText}>Make it short, clear and engaging.</span>
                  <span className={styles.charCount}>{title.length}/60</span>
                </div>
              </div>
            )}

            {/* Step 2: Content Input */}
            {step === 2 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Content (100 chars max)</label>
                <textarea
                  className={styles.textareaBox}
                  maxLength={100}
                  placeholder="What is this business highlight about?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                />
                <div className={styles.fieldFooter}>
                  <span className={styles.infoText}>Provide a brief summary of the key message.</span>
                  <span className={styles.charCount}>{content.length}/100</span>
                </div>
              </div>
            )}

            {/* Step 3: Select Interest */}
            {step === 3 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Select Target Interest</label>
                <div className={styles.selectWrapper}>
                  <select
                    className={styles.selectBox}
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                  >
                    <option value="">-- Choose target audience interest --</option>
                    {interests.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <span className={styles.infoText}>
                  We will display this highlight to users interested in this topic.
                </span>
              </div>
            )}

            {/* Step 4: Preview & Summary */}
            {step === 4 && (
              <div className={styles.previewSection}>
                <div className={styles.cardPreviewWrapper}>
                  <div className={styles.previewLabel}>LIVE PREVIEW</div>
                  <div className={styles.newsCard}>
                    {mediaPreview && (
                      <div className={styles.newsCardImageContainer}>
                        {mediaType === "image" ? (
                          <img
                            src={mediaPreview}
                            alt="Preview"
                            className={styles.newsCardImgFull}
                          />
                        ) : (
                          <video
                            src={mediaPreview}
                            controls
                            className={styles.newsCardImgFull}
                            style={{ maxHeight: "250px", background: "#000" }}
                          />
                        )}
                        <span className={styles.newsCardCategory}>{interest}</span>
                      </div>
                    )}
                    <div className={styles.newsCardBody}>
                      <div className={styles.newsCardMeta}>
                        <span className={styles.newsCardSource}>Business Highlight</span>
                        <span className={styles.newsCardDot}>•</span>
                        <span className={styles.newsCardTime}>Just now</span>
                      </div>
                      <h2 className={styles.newsCardTitle}>
                        {capitalizeFirst(title) || "Untitled Highlight"}
                      </h2>
                      <p className={styles.newsCardDescription}>
                        {content || "No content summary provided yet."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.pricingSummary}>
                  <div className={styles.summaryTitle}>Highlights Pricing Details</div>
                  <div className={styles.summaryRow}>
                    <span>Publishing Fee</span>
                    <span className={styles.summaryValue}>{formatCurrency(1000)}</span>
                  </div>
                  <div className={styles.summaryDivider} />
                  <div className={styles.summaryRowTotal}>
                    <span>Total Due</span>
                    <span>{formatCurrency(1000)}</span>
                  </div>
                  <div className={styles.checklist}>
                    <div className={styles.checkItem}>
                      <svg
                        className={styles.checkIcon}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      High-quality cover image uploaded
                    </div>
                    <div className={styles.checkItem}>
                      <svg
                        className={styles.checkIcon}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Captivating short title
                    </div>
                    <div className={styles.checkItem}>
                      <svg
                        className={styles.checkIcon}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Target interest audience set
                    </div>
                  </div>
                  <div className={styles.submitNotice}>
                    <svg
                      className={styles.noticeIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className={styles.noticeText}>
                      Your news highlight will be placed in the review queue. Please check the <strong>"My Ads"</strong> page under your profile to see when it becomes active and starts delivering.
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: "1.5rem", padding: "1.5rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)" }}>
                  <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: "700", fontSize: "0.9rem" }}>Payment Method</label>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "0.5rem 1rem", border: "1px solid var(--card-border)", borderRadius: "8px", backgroundColor: paymentMethod === "card" ? "rgba(255,255,255,0.05)" : "transparent" }}>
                      <input type="radio" name="pay_method" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} />
                      <span>Paystack (Card/Bank)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "0.5rem 1rem", border: "1px solid var(--card-border)", borderRadius: "8px", backgroundColor: paymentMethod === "wallet" ? "rgba(255,255,255,0.05)" : "transparent" }}>
                      <input type="radio" name="pay_method" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} />
                      <span>Wallet Balance ({formatCurrency(balance)})</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Form Step Buttons */}
            <div className={styles.buttonGroup}>
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              )}
              {step < 4 && (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 0 && !mediaFile) return alert("Please upload a cover image or video.");
                    if (step === 1 && !title) return alert("Please fill in the title.");
                    if (step === 2 && !content) return alert("Please enter the content.");
                    if (step === 3 && !interest) return alert("Choose one interest.");
                    setStep(step + 1);
                  }}
                >
                  Next
                </button>
              )}
              {step === 4 && (
                <button
                  className={styles.submitButton}
                  type="button"
                  disabled={!isFormComplete() || isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? "Submitting..." : `Pay ${formatCurrency(1000)} & Submit`}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
