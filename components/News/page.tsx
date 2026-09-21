"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import supabase from "@/lib/utils/db";
import styles from "../News/page.module.css";
import LocationSelector from "../LocationSelector";
import { Zap, Calendar, ShieldAlert, Crown, Rocket } from "lucide-react";
import { ALL_INTERESTS as interests } from "@/lib/categoryTargetingMap";
import { newsSchema } from "@/lib/validationSchemas";
import { isAdminEmail } from "@/lib/adminHelper";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { clearUserCampaignsCache } from "@/lib/campaignsClient";

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

import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const steps = ["Media", "Title", "Content", "Targeting & Bidding", "Preview"];

export default function News({ session }: NewsProps) {
  const isAdmin = useMemo(() => {
    return Boolean((session?.user as any)?.isAdmin ?? isAdminEmail(session?.user?.email));
  }, [session?.user]);
  const [customSponsorName, setCustomSponsorName] = useState("");
  const [customSponsorHandle, setCustomSponsorHandle] = useState("");

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
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [isAiContent, setIsAiContent] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [stepError, setStepError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [adAccountRestriction, setAdAccountRestriction] = useState<{
    restricted: boolean;
    status: string;
    reason: string;
    until: string | null;
  }>({ restricted: false, status: "", reason: "", until: null });

  const formatCurrency = (amount: number | string) => globalFormatCurrency(amount, country);

  useEffect(() => {
    const fetchBalance = async () => {
      if (session?.user?.email) {
        try {
          const res = await fetch("/api/profile");
          if (res.ok) {
            const data = await res.json();
            setBalance(data.balance ?? 0);

            const status = data.ad_account_status;
            const until = data.ad_ban_until;
            const reason = data.ad_ban_reason || "";
            const isTempBanned = status === "temp_banned" && until && new Date(until).getTime() > Date.now();
            const isPermBanned = status === "perm_banned";
            const isDeactivated = status === "deactivated";

            if (isTempBanned || isPermBanned || isDeactivated) {
              setAdAccountRestriction({
                restricted: true,
                status: isTempBanned ? "temp_banned" : isPermBanned ? "perm_banned" : "deactivated",
                reason,
                until,
              });
            }
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
      } catch {}
    };
    fetchTopBid();
  }, [interest]);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStepError(null);
    const file = e.target.files?.[0];
    if (file) {
      const isImage = file.type.startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
      if (isImage) {
        if (file.size > 8 * 1024 * 1024) {
          setStepError("Cover image must be smaller than 8MB.");
          return;
        }
      } else {
        setStepError("Only image files are allowed for highlights (videos are not permitted).");
        return;
      }
      setMediaFile(file);
      try {
        setMediaPreview(URL.createObjectURL(file));
      } catch {
        const reader = new FileReader();
        reader.onload = () => setMediaPreview(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  };

  const capitalizeFirst = (txt: string) =>
    txt.trim() ? txt.trim().charAt(0).toUpperCase() + txt.trim().slice(1) : "";

  const totalCost = isBiddingEnabled ? (bidPrice * campaignDays) : (1000 * campaignDays);

  const handleSubmit = async () => {
    setStepError(null);
    setStatusNotice(null);
    if (!session || !session.user?.email) {
      setStepError("User not authenticated. Please log in.");
      return;
    }

    const validationResult = newsSchema.safeParse({
      title,
      content,
      interest,
      country,
      campaignDays,
      bidPrice: isBiddingEnabled ? bidPrice : undefined,
    });

    if (!mediaFile || !validationResult.success) {
      const errorMsg = !mediaFile
        ? "Please select a cover image for your highlight."
        : validationResult.error?.issues[0]?.message || "Please check your highlight form fields.";
      setStepError(errorMsg);
      return;
    }

    if (!isAdmin && paymentMethod === "wallet" && balance < totalCost) {
      setStepError(`Insufficient wallet balance. Your balance is ${formatCurrency(balance)} but this highlight costs ${formatCurrency(totalCost)}.`);
      return;
    }

    setIsSubmitting(true);
    let uploadedFilename: string | null = null;

    try {
      const filename = `${Date.now()}_${mediaFile!.name.replace(
        /[^\w.-]/g,
        "_"
      )}`;
      
      // 1080p Standard Dimension Cap: Scale down high-resolution images
      let optimizedFile: Blob | File = mediaFile!;
      if (mediaFile instanceof File) {
        try {
          optimizedFile = await resizeImageToMax1080p(mediaFile);
        } catch (optErr) {
          console.warn("Highlight cover 1080p optimization notice:", optErr);
        }
      }

      // Force WebKit / iOS to resolve full iCloud asset download into memory buffer
      let fileData: Blob | File = optimizedFile;
      try {
        const buffer = await optimizedFile.arrayBuffer();
        fileData = new Blob([buffer], { type: mediaFile!.type || "image/jpeg" });
      } catch (e) {
        console.warn("ArrayBuffer fallback for news image:", e);
      }

      const { error: uploadError } = await supabase.storage
        .from("news")
        .upload(filename, fileData, {
          cacheControl: "3600",
          upsert: false,
          contentType: mediaFile!.type || "image/jpeg",
        });

      if (uploadError) throw uploadError;
      uploadedFilename = filename;

      const { data: urlData } = supabase.storage
        .from("news")
        .getPublicUrl(filename);
        
      let paymentUrl = "/api/payments/initialize";
      if (isAdmin || paymentMethod === "wallet") {
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
            bid_price: isBiddingEnabled ? bidPrice : null,
            is_admin_post: false,
            custom_sponsor_name: customSponsorName || null,
            custom_sponsor_handle: customSponsorHandle || null,
            is_ai_content: isAiContent,
            isAiContent: isAiContent,
          },
          callbackUrl: `${window.location.origin}/logged-in`
        })
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok || (!paymentData.success && !paymentData.status)) {
        throw new Error(paymentData.error || "Failed to process payment");
      }

      sessionStorage.setItem("paayh_active_tab", "statement");
      clearUserCampaignsCache(session?.user?.email || "");

      const authUrl = paymentData.authorization_url || paymentData.data?.authorization_url;
      if (isAdmin || paymentMethod === "wallet") {
        setStatusNotice("Your Daily Highlight has been submitted for review. Redirecting to your statement...");
        setTimeout(() => {
          window.location.href = "/logged-in";
        }, 800);
      } else if (authUrl) {
        setStatusNotice("Redirecting to Paystack to complete payment for your Highlight...");
        window.location.href = authUrl;
      } else {
        window.location.href = "/logged-in";
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
      setStepError(err.message || "An error occurred while submitting highlight.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (adAccountRestriction.restricted) {
    const getCountdownStr = (untilStr: string | null) => {
      if (!untilStr) return "";
      const diffMs = new Date(untilStr).getTime() - Date.now();
      if (diffMs <= 0) return "Expired";
      const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      return `${days} day${days > 1 ? "s" : ""}`;
    };

    return (
      <div className={styles.disabledAccountCard}>
          <div className={styles.disabledAccountIcon}>
            <ShieldAlert size={32} />
          </div>
          <h2 className={styles.disabledAccountTitle}>
            Advertising & Highlight Account Disabled
          </h2>
          <p className={styles.disabledAccountDesc}>
            {adAccountRestriction.status === "temp_banned" ? (
              <>Your highlight account is temporarily suspended for <strong>{getCountdownStr(adAccountRestriction.until)}</strong>.</>
            ) : adAccountRestriction.status === "perm_banned" ? (
              <>Your highlight account has been permanently suspended due to policy violations.</>
            ) : (
              <>Your highlight account has been deactivated by administration.</>
            )}
          </p>
          {adAccountRestriction.reason && (
            <div className={styles.disabledAccountReason}>
              <strong>Reason for decision:</strong> {adAccountRestriction.reason}
            </div>
          )}
          <p className={styles.disabledAccountNote}>
            If you believe this restriction is an error, you may submit an appeal to our Help Center support team.
          </p>
          <a
            href="/help?category=Suspended%20Account&subject=Appeal%20Highlight%20Account%20Suspension"
            className={styles.disabledAccountBtn}
          >
            Appeal via Help Center
          </a>
        </div>
    );
  }

  return (
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

          {stepError && (
            <div className={styles.errorAlert}>
              {stepError}
            </div>
          )}

          {statusNotice && (
            <div className={styles.statusAlert}>
              {statusNotice}
            </div>
          )}

          <div className={styles.adFormContainer}>
            {/* STEP 0: MEDIA */}
            {step === 0 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Cover Image (Required)</label>
                {mediaPreview ? (
                  <div className={styles.mediaPreviewContainer}>
                    <img src={mediaPreview} alt="Cover Preview" className={styles.mediaPreviewImage} />
                    <div className={styles.removeBtnContainer}>
                      <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} className={styles.removeBtn}>Remove Image</button>
                    </div>
                  </div>
                ) : (
                  <label className={styles.uploadZone}>
                    <input type="file" accept="image/*" onChange={handleMediaChange} hidden />
                    <p className={styles.uploadTitle}>Click to select cover image file</p>
                    <p className={styles.uploadSubtext}>Supports PNG, JPG, WEBP (Max 5MB)</p>
                  </label>
                )}
                <div className={styles.stepActionsEnd}>
                  <button disabled={!mediaFile} onClick={() => setStep(1)} className={styles.primaryNavBtn}>Continue to Title →</button>
                </div>
              </div>
            )}

            {/* STEP 1: TITLE */}
            {step === 1 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Highlight Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Grand Opening Sale 50% Off" className={styles.inputBox} maxLength={80} />
                <div className={styles.stepActionsBetween}>
                  <button onClick={() => setStep(0)} className={styles.secondaryNavBtn}>Back</button>
                  <button disabled={!title.trim()} onClick={() => setStep(2)} className={styles.primaryNavBtn}>Continue to Content →</button>
                </div>
              </div>
            )}

            {/* STEP 2: CONTENT */}
            {step === 2 && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Highlight Details & Story</label>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Share full details of your highlight announcement..." className={styles.textareaBox} rows={6} maxLength={1000} />
                <div className={styles.stepActionsBetween}>
                  <button onClick={() => setStep(1)} className={styles.secondaryNavBtn}>Back</button>
                  <button disabled={!content.trim()} onClick={() => setStep(3)} className={styles.primaryNavBtn}>Continue to Targeting & Bidding →</button>
                </div>
              </div>
            )}

            {/* STEP 3: TARGETING, LOCATION & BIDDING */}
            {step === 3 && (
              <div className={`${styles.formGroup} ${styles.targetingGroup}`}>
                {isAdmin && (
                  <div className={`${styles.modernSectionCard} ${styles.adminSectionCard}`}>
                    <div className={`${styles.modernSectionHeader} ${styles.adminSectionHeader}`}>
                      <span className={`${styles.modernSectionTitle} ${styles.adminSectionTitle}`}>
                        <Crown size={16} color="var(--primary)" /> Admin Privilege: Custom Branding
                      </span>
                      <span className={`${styles.modernSectionBadge} ${styles.adminSectionBadge}`}>
                        Free Publishing Active
                      </span>
                    </div>
                    <div className={styles.modernSectionBody}>
                      <div className={styles.formGroup}>
                        <label className={styles.adminFieldLabel}>Custom Sponsor Name (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. ABC News (defaults to Sponsored)"
                          value={customSponsorName}
                          onChange={(e) => setCustomSponsorName(e.target.value)}
                          className={styles.inputBox}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.adminFieldLabel}>Custom Handle (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. @abc_news (defaults to @Sponsored)"
                          value={customSponsorHandle}
                          onChange={(e) => setCustomSponsorHandle(e.target.value)}
                          className={styles.inputBox}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Category Card */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Category and Interest</span>
                    <span className={styles.modernSectionBadge}>
                      {interest || "Select Category"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <p className={styles.sectionDescription}>
                      Choose the specific topic or interest sector for your sponsored news piece.
                    </p>
                    <div className={styles.selectWrapper}>
                      <select value={interest} onChange={(e) => setInterest(e.target.value)} className={styles.selectBox}>
                        <option value="">-- Select Target Category --</option>
                        {interests.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Target Location Card */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>Target Location &amp; Coverage</span>
                    <span className={styles.modernSectionBadge}>
                      {province || state || country || "All Locations"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
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
                </div>

                {/* Duration Selector Card */}
                <div className={styles.modernSectionCard}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>
                      <Calendar size={16} color="var(--primary)" /> Campaign Duration
                    </span>
                    <span className={styles.modernSectionBadge}>
                      {campaignDays} {campaignDays === 1 ? "Day" : "Days"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <p className={styles.sectionDescription}>
                      Select how long your news article should remain live and actively highlighted (up to 5 days).
                    </p>
                    <div className={styles.durationContainer}>
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setCampaignDays(num)}
                          className={`${styles.durationBtn} ${campaignDays === num ? styles.durationBtnActive : ""}`}
                        >
                          {num} {num === 1 ? "Day" : "Days"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bidding Card */}
                <div className={`${styles.modernSectionCard} ${isBiddingEnabled ? styles.biddingCardActive : ""}`}>
                  <div className={styles.modernSectionHeader}>
                    <span className={styles.modernSectionTitle}>
                      <Zap size={16} color="var(--primary)" /> Top Highlight Position (Bidding)
                    </span>
                    <span className={`${styles.modernSectionBadge} ${isBiddingEnabled ? styles.biddingBadgeActive : ""}`}>
                      {isBiddingEnabled ? "Bidding Active" : "Standard Placement"}
                    </span>
                  </div>
                  <div className={styles.modernSectionBody}>
                    <div className={styles.biddingHeaderRow}>
                      <div>
                        <p className={styles.biddingTitle}>
                          Contest for the #1 Top Highlight Carousel
                        </p>
                        <p className={styles.biddingSubtitle}>
                          Highest bids stay at the top of the news highlights carousel. Current top bid for {interest || "this category"}: <strong>{formatCurrency(highestBid)}/day</strong>.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={isBiddingEnabled}
                        onChange={(e) => setIsBiddingEnabled(e.target.checked)}
                        className={styles.biddingCheckbox}
                      />
                    </div>

                    {isBiddingEnabled && (
                      <div className={styles.biddingContent}>
                        <div className={styles.formGroup}>
                          <label className={styles.fieldLabelSub}>Your Bid Price Per Day (₦)</label>
                          <input
                            type="number"
                            min={highestBid + 100}
                            step={100}
                            value={bidPrice}
                            onChange={(e) => setBidPrice(parseFloat(e.target.value) || 1000)}
                            className={styles.inputBox}
                          />
                          <p className={styles.biddingCostNote}>
                            Total Bidded Cost: {formatCurrency(bidPrice * campaignDays)} for {campaignDays} {campaignDays === 1 ? "day" : "days"}. Higher bids overtake lower bids at top position.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.stepActionsBetweenTight}>
                  <button onClick={() => setStep(2)} className={styles.secondaryNavBtn}>Back</button>
                  <button disabled={!interest} onClick={() => setStep(4)} className={styles.primaryNavBtn}>Continue to Preview →</button>
                </div>
              </div>
            )}

            {/* STEP 4: PREVIEW & PAYMENT */}
            {step === 4 && (
              <div className={styles.formGroup}>
                <div className={styles.previewCard}>
                  {mediaPreview && <img src={mediaPreview} alt="Preview" className={styles.previewImage} />}
                  <div className={styles.previewContent}>
                    <span className={styles.previewBadge}>{interest}</span>
                    <h3 className={styles.previewTitle}>{capitalizeFirst(title)}</h3>
                    <p className={styles.previewText}>{content}</p>
                    <div className={styles.previewTargeting}>
                      Targeting: {country} {state ? `· ${state}` : ""} · {campaignDays} {campaignDays === 1 ? "Day" : "Days"} {isBiddingEnabled ? `· Bidded (₦${bidPrice}/day)` : ""}
                    </div>
                  </div>
                </div>

                {/* Payment selector */}
                {isAdmin ? (
                  <div className={styles.adminPrivilegeBox}>
                    <h4 className={styles.adminPrivilegeHeading}>
                      <Crown size={18} color="var(--primary)" /> Admin Privilege: 100% Free Highlight Publishing (₦0.00 Total)
                    </h4>
                    <p className={styles.adminPrivilegeSubtext}>
                      No payment gateway or wallet balance deduction required.
                    </p>
                  </div>
                ) : (
                  <div className={styles.paymentBox}>
                    <h4 className={styles.paymentBoxHeading}>Select Payment Method</h4>
                    <div className={styles.paymentMethodOptions}>
                      <label className={styles.paymentOptionLabel}>
                        <input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Paystack (Card/Bank/Transfer)
                      </label>
                      <label className={styles.paymentOptionLabel}>
                        <input type="radio" name="pay" checked={paymentMethod === "wallet"} onChange={() => setPaymentMethod("wallet")} /> Pay from Wallet Balance ({formatCurrency(balance)})
                      </label>
                    </div>
                    <div className={styles.paymentTotalCost}>
                      Total Payment: {formatCurrency(totalCost)}
                    </div>
                  </div>
                )}

                {/* AI Content Disclosure Toggle */}
                <div className={styles.aiDisclosureBox}>
                  <div className={styles.aiDisclosureTextContainer}>
                    <span className={styles.aiDisclosureTitle}>
                      AI-generated content
                    </span>
                    <span className={styles.aiDisclosureDesc}>
                      Turn this on if your highlight contains media or text generated or altered using AI tools.
                    </span>
                  </div>
                  <label className={styles.aiSwitch}>
                    <input
                      type="checkbox"
                      checked={isAiContent}
                      onChange={(e) => setIsAiContent(e.target.checked)}
                      className={styles.aiSwitchInput}
                    />
                    <span className={`${styles.aiSwitchSlider} ${isAiContent ? styles.aiSwitchSliderActive : ""}`}>
                      <span className={`${styles.aiSwitchThumb} ${isAiContent ? styles.aiSwitchThumbActive : ""}`} />
                    </span>
                  </label>
                </div>

                <div className={styles.termsPolicyBox}>
                  <input
                    type="checkbox"
                    id="newsTermsPolicyCheckbox"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                    className={styles.termsCheckbox}
                  />
                  <label htmlFor="newsTermsPolicyCheckbox" className={styles.termsLabel}>
                    I have reviewed my highlight details and agree to Paayh&apos;s{" "}
                    <Link href="/terms" target="_blank" className={styles.termsLink}>
                      Terms of Service
                    </Link>,{" "}
                    <Link href="/advertiser-guidelines" target="_blank" className={styles.termsLink}>
                      Advertising Guidelines
                    </Link>, and{" "}
                    <Link href="/privacy" target="_blank" className={styles.termsLink}>
                      Privacy Policy
                    </Link>.
                  </label>
                </div>

                <div className={styles.stepActionsBetween}>
                  <button onClick={() => setStep(3)} className={styles.secondaryNavBtn}>Back</button>
                  <button disabled={isSubmitting || !agreedToPolicy} onClick={handleSubmit} className={styles.primaryNavBtn}>
                    {isSubmitting ? (
                      "Processing Submission..."
                    ) : isAdmin ? (
                      <>
                        <Rocket size={16} /> Publish Highlight Free (Admin)
                      </>
                    ) : (
                      `Pay ${formatCurrency(totalCost)} & Submit`
                    )}
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
