"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FileText,
  Image as ImageIcon,
  Video,
  Layers,
  Crown,
  Zap,
  MessageCircle,
  Phone,
  Globe,
  Mail,
  Smartphone,
  PlayCircle,
  BookOpen,
} from "lucide-react";
import CustomSelect from "@/components/ui/CustomSelect";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import {
  AdFormSelections,
  AdMediaType,
  getCtaIcon,
  containsLink,
  isSubsidizedLink,
} from "./types";
import styles from "./page.module.css";

interface Step3CreativeProps {
  formSelections: AdFormSelections;
  setFormSelections: React.Dispatch<React.SetStateAction<AdFormSelections>>;
  adType: string;
  isAdmin: boolean;
}

export default function Step3Creative({
  formSelections,
  setFormSelections,
  adType,
  isAdmin,
}: Step3CreativeProps) {
  return (
    <>
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Ad Media &amp; Visual Assets</span>
          <span className={styles.modernSectionBadge}>
            {formSelections.adMediaType ? formSelections.adMediaType.toUpperCase() : "Select Format"}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <div className={styles.formGroup}>
            <label className={styles.fieldLabelBold}>Ad Media Format &amp; Visual Asset Type</label>
            <div className={styles.mediaTypeGrid}>
              {[
                {
                  value: "text",
                  title: "Text Only",
                  badge: "Up to 1,500 Words",
                  desc: "Long-form copy & stories (up to 1,500 words) with full-screen reader.",
                  icon: <FileText size={15} color="var(--foreground)" />,
                },
                {
                  value: "image",
                  title: "Image(s)",
                  badge: "Up to 4 Photos",
                  desc: "High-resolution photos & banners (JPG, PNG, max 5MB each).",
                  icon: <ImageIcon size={15} color="var(--foreground)" />,
                },
                {
                  value: "video",
                  title: "Video Only",
                  badge: "Max 60 Mins",
                  desc: "High-impact video storytelling (MP4, MOV, up to 60 mins / 500MB).",
                  icon: <Video size={15} color="var(--foreground)" />,
                },
                {
                  value: "mixed",
                  title: "Mixed Media",
                  badge: "Images + Video",
                  desc: "Up to 3 high-res images and 1 video (up to 60 mins) for maximum engagement.",
                  icon: <Layers size={15} color="var(--foreground)" />,
                },
              ].map((format) => {
                const isSelected = formSelections.adMediaType === format.value;
                return (
                  <div
                    key={format.value}
                    onClick={() =>
                      setFormSelections((prev) => ({
                        ...prev,
                        adMediaType: format.value as AdMediaType,
                        adMediaFiles: [],
                      }))
                    }
                    className={`${styles.mediaTypeCard} ${isSelected ? styles.mediaTypeCardActive : ""}`}
                  >
                    <div className={styles.mediaTypeCardHeader}>
                      <div className={styles.mediaTypeCardIcon}>{format.icon}</div>
                      <span className={styles.mediaTypeCardBadge}>{format.badge}</span>
                    </div>
                    <h4 className={styles.mediaTypeCardTitle}>{format.title}</h4>
                    <p className={styles.mediaTypeCardDesc}>{format.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {formSelections.adMediaType && formSelections.adMediaType !== "text" && (
            <div className={styles.formGroup}>
              <label className={styles.fieldLabelBold}>Upload Files</label>
              <input
                type="file"
                multiple={formSelections.adMediaType !== "video"}
                accept={
                  formSelections.adMediaType === "video"
                    ? "video/*"
                    : formSelections.adMediaType === "image"
                    ? "image/*"
                    : "image/*,video/*"
                }
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  const fileArray = Array.from(files);

                  const images = fileArray.filter(
                    (f) => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name)
                  );
                  const videos = fileArray.filter(
                    (f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(f.name)
                  );

                  if (formSelections.adMediaType === "image") {
                    if (videos.length > 0) {
                      showAppleAlert("Only images are allowed for this type.", "warning");
                      e.target.value = "";
                      return;
                    }
                    if (images.length > 4) {
                      showAppleAlert("You can select up to 4 images only.", "warning");
                      e.target.value = "";
                      return;
                    }
                  } else if (formSelections.adMediaType === "video") {
                    if (images.length > 0) {
                      showAppleAlert("Only videos are allowed for this type.", "warning");
                      e.target.value = "";
                      return;
                    }
                    if (videos.length > 1) {
                      showAppleAlert("You can select only 1 video.", "warning");
                      e.target.value = "";
                      return;
                    }
                  } else if (formSelections.adMediaType === "mixed") {
                    if (videos.length > 1) {
                      showAppleAlert("You can select at most 1 video.", "warning");
                      e.target.value = "";
                      return;
                    }
                    if (images.length > 3) {
                      showAppleAlert("You can select at most 3 images.", "warning");
                      e.target.value = "";
                      return;
                    }
                    if (images.length + videos.length > 4) {
                      showAppleAlert("Total number of files cannot exceed 4.", "warning");
                      e.target.value = "";
                      return;
                    }
                  }

                  const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB for up to 60-minute videos
                  const MAX_VIDEO_DURATION_SECONDS = 3600; // 60 minutes

                  for (const file of fileArray) {
                    const isImage =
                      file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
                    const isVideo =
                      file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(file.name);

                    if (isImage) {
                      if (file.size > 5 * 1024 * 1024) {
                        showAppleAlert(`Image ${file.name} exceeds 5MB limit.`, "warning");
                        e.target.value = "";
                        return;
                      }
                    } else if (isVideo) {
                      if (file.size > MAX_VIDEO_BYTES) {
                        showAppleAlert(`Video ${file.name} exceeds 500MB limit.`, "warning");
                        e.target.value = "";
                        return;
                      }
                      let durationOk = true;
                      try {
                        durationOk = await new Promise<boolean>((resolve) => {
                          const videoEl = document.createElement("video");
                          videoEl.preload = "metadata";
                          const objectUrl = URL.createObjectURL(file);
                          const timer = setTimeout(() => {
                            URL.revokeObjectURL(objectUrl);
                            resolve(file.size <= MAX_VIDEO_BYTES);
                          }, 5000);

                          videoEl.onloadedmetadata = () => {
                            clearTimeout(timer);
                            URL.revokeObjectURL(objectUrl);
                            resolve(videoEl.duration <= MAX_VIDEO_DURATION_SECONDS);
                          };
                          videoEl.onerror = () => {
                            clearTimeout(timer);
                            URL.revokeObjectURL(objectUrl);
                            resolve(file.size <= MAX_VIDEO_BYTES);
                          };
                          videoEl.src = objectUrl;
                        });
                      } catch {
                        durationOk = file.size <= MAX_VIDEO_BYTES;
                      }

                      if (!durationOk) {
                        showAppleAlert(`Video ${file.name} must be less than or equal to 60 minutes.`, "warning");
                        e.target.value = "";
                        return;
                      }
                    }
                  }

                  setFormSelections((prev) => ({
                    ...prev,
                    adMediaFiles: fileArray,
                  }));
                }}
                className={styles.inputBox}
              />
              {formSelections.adMediaFiles.length > 0 && (
                <div className={styles.selectedFilesHint}>
                  Selected: {formSelections.adMediaFiles.map((f) => f.name).join(", ")}
                </div>
              )}
              {formSelections.existingMedia && formSelections.adMediaFiles.length === 0 && (
                <div className={styles.selectedFilesHint}>
                  Current campaign media preserved. Choose new file(s) above if you wish to replace it.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Copy & Interactive Actions */}
      <div className={styles.adCreativeSection}>
        {isAdmin && (
          <div className={`${styles.modernSectionCard} ${styles.adminPrivilegeCard}`}>
            <div className={`${styles.modernSectionHeader} ${styles.adminPrivilegeHeader}`}>
              <span className={`${styles.modernSectionTitle} ${styles.adminPrivilegeTitle}`}>
                <Crown size={16} color="var(--primary)" /> Admin Privilege: Custom Branding
              </span>
              <span className={`${styles.modernSectionBadge} ${styles.adminPrivilegeBadge}`}>
                Free Publishing Active
              </span>
            </div>
            <div className={styles.modernSectionBody}>
              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>Custom Sponsor Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ABC Ltd (defaults to Sponsored)"
                  value={formSelections.customSponsorName}
                  onChange={(e) => setFormSelections((prev) => ({ ...prev, customSponsorName: e.target.value }))}
                  className={styles.inputBox}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>Custom Handle (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. @abc_ltd (defaults to @Sponsored)"
                  value={formSelections.customSponsorHandle}
                  onChange={(e) => setFormSelections((prev) => ({ ...prev, customSponsorHandle: e.target.value }))}
                  className={styles.inputBox}
                />
              </div>
            </div>
          </div>
        )}

        {adType === "product_sales" ? (
          <div className={styles.modernSectionCard}>
            <div className={styles.modernSectionHeader}>
              <span className={styles.modernSectionTitle}>Product Offer &amp; Primary Action</span>
              <span className={styles.modernSectionBadge}>{formSelections.productCtaType || "Buy"}</span>
            </div>
            <div className={styles.modernSectionBody}>
              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>
                  Product Name{" "}
                  <span className={styles.charCount}>{formSelections.productName.length}/80</span>
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={formSelections.productName}
                  placeholder="Enter product name (max 80 characters)"
                  onChange={(e) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      productName: e.target.value,
                    }))
                  }
                  className={styles.inputBox}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>Product Price (₦)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formSelections.productPrice}
                  placeholder="Enter product price in Naira"
                  onChange={(e) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      productPrice: e.target.value,
                    }))
                  }
                  className={styles.inputBox}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>Primary CTA Button Text (Select 1 CTA)</label>
                <CustomSelect
                  value={formSelections.productCtaType || "Buy"}
                  onChange={(val) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      productCtaType: val,
                    }))
                  }
                  options={[
                    "Buy",
                    "Shop",
                    "Order",
                    "Book",
                    "Reserve",
                    "Apply",
                    "Comment",
                    "Join",
                    "Learn More",
                    "Visit Website",
                  ].map((cta) => ({
                    value: cta,
                    label: cta,
                    icon: getCtaIcon(cta),
                  }))}
                  placeholder="Select Primary CTA"
                />
                <div className={styles.ctaPreviewRow}>
                  <span className={styles.ctaPreviewLabel}>Live Feed Button:</span>
                  <span className={styles.ctaPreviewBtn}>
                    {getCtaIcon(formSelections.productCtaType || "Buy")}
                    <span>{formSelections.productCtaType || "Buy"}</span>
                  </span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.ctaLabelRow}>
                  <label className={styles.fieldLabelBold}>Primary CTA Link (Secure HTTPS)</label>
                  <Link href="/business/subscribe" className={styles.premiumLink}>
                    E-commerce platform? Become a Premium Subscriber
                  </Link>
                </div>
                <input
                  type="text"
                  value={formSelections.productCtaLink}
                  placeholder="https://yourwebsite.com/product-page"
                  onChange={(e) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      productCtaLink: e.target.value,
                    }))
                  }
                  className={`${styles.inputBox} ${
                    formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://")
                      ? styles.inputError
                      : ""
                  }`}
                />
                {formSelections.productCtaLink && isSubsidizedLink(formSelections.productCtaLink) && (
                  <div className={styles.subsidyBanner}>
                    <span>Baggyt is a premium subscriber, 30% Off your ad cost applies.</span>
                  </div>
                )}
                {formSelections.productCtaLink && !formSelections.productCtaLink.startsWith("https://") && (
                  <p className={styles.error}>The link must be a secure link starting with https://</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.modernSectionCard}>
            <div className={styles.modernSectionHeader}>
              <span className={styles.modernSectionTitle}>Action &amp; Engagement CTA</span>
              <span className={styles.modernSectionBadge}>{formSelections.productCtaType || "Comment"}</span>
            </div>
            <div className={styles.modernSectionBody}>
              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>Action &amp; Engagement CTA (Select 1 CTA)</label>
                <CustomSelect
                  value={formSelections.productCtaType || "Comment"}
                  onChange={(val) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      productCtaType: val,
                    }))
                  }
                  options={[
                    "Comment",
                    "Vote",
                    "Donate",
                    "Volunteer",
                    "Book",
                    "Reserve",
                    "Apply",
                    "Order",
                    "Buy",
                    "Shop",
                    "Join",
                    "Learn More",
                    "Visit Website",
                  ].map((cta) => ({
                    value: cta,
                    label: cta,
                    icon: getCtaIcon(cta),
                  }))}
                  placeholder="Select Engagement Action"
                />
                <div className={styles.ctaPreviewRow}>
                  <span className={styles.ctaPreviewLabel}>Live Feed Button:</span>
                  <span className={styles.ctaPreviewBtn}>
                    {getCtaIcon(formSelections.productCtaType || "Comment")}
                    <span>{formSelections.productCtaType || "Comment"}</span>
                  </span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.fieldLabelBold}>
                  CTA Target Link (WhatsApp, Chat App, Email or Website)
                </label>
                <input
                  type="text"
                  value={formSelections.productCtaLink}
                  placeholder="e.g. https://wa.me/234... or https://chat.whatsapp.com/... or https://yourlink.com"
                  onChange={(e) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      productCtaLink: e.target.value,
                    }))
                  }
                  className={`${styles.inputBox} ${
                    formSelections.productCtaLink &&
                    !formSelections.productCtaLink.startsWith("https://") &&
                    !formSelections.productCtaLink.startsWith("http://") &&
                    !formSelections.productCtaLink.startsWith("mailto:")
                      ? styles.inputError
                      : ""
                  }`}
                />
                <span className={styles.inputHelperText}>
                  {(() => {
                    const cta = formSelections.productCtaType || "Comment";
                    switch (cta) {
                      case "Comment":
                        return "Directs viewers to drop opinions, comments, or leave feedback outside the app.";
                      case "Vote":
                        return "Directs viewers to voter registration, polling info, or campaign voting portals.";
                      case "Donate":
                        return "Directs viewers to contribute securely to your campaign or cause.";
                      case "Volunteer":
                        return "Directs viewers to sign up as a campaign volunteer, grassroots agent, or supporter.";
                      case "Book":
                        return "Directs viewers to book an appointment, session, ticket, or consultation outside the app.";
                      case "Reserve":
                        return "Directs viewers to make a reservation for a table, seat, or event outside the app.";
                      case "Apply":
                        return "Directs viewers to submit an application for a job, program, or offer outside the app.";
                      case "Order":
                        return "Directs viewers to place an order directly on your linked store, menu, or chat.";
                      case "Buy":
                      case "Shop":
                        return "Directs viewers to purchase your product or service on your linked store.";
                      case "Join":
                        return "Directs viewers to join your community, channel, group, or membership.";
                      case "Learn More":
                      case "Visit Website":
                      default:
                        return "Directs viewers to your external link to explore, learn more, or connect.";
                    }
                  })()}
                </span>
                {formSelections.productCtaLink &&
                  !formSelections.productCtaLink.startsWith("https://") &&
                  !formSelections.productCtaLink.startsWith("http://") &&
                  !formSelections.productCtaLink.startsWith("mailto:") && (
                    <p className={styles.error}>
                      Please enter a valid link starting with https:// or mailto:
                    </p>
                  )}
              </div>
            </div>
          </div>
        )}

        <div className={styles.modernSectionCard}>
          {(() => {
            const isLongFormAllowed =
              adType !== "product_sales" &&
              (formSelections.adMediaType === "text" ||
                formSelections.adActionButtons.includes("read_more"));

            const clampToMaxWords = (rawText: string, maxWords: number) => {
              const regex = /\S+/g;
              let match: RegExpExecArray | null;
              let count = 0;
              let cutIndex = rawText.length;
              let exceeded = false;

              while ((match = regex.exec(rawText)) !== null) {
                count++;
                if (count === maxWords) {
                  cutIndex = match.index + match[0].length;
                } else if (count > maxWords) {
                  exceeded = true;
                  break;
                }
              }

              if (exceeded) {
                return { text: rawText.slice(0, cutIndex), wordCount: maxWords };
              }
              if (count === maxWords && rawText.length > cutIndex + 1) {
                return { text: rawText.slice(0, cutIndex + 1), wordCount: maxWords };
              }
              return { text: rawText, wordCount: count };
            };

            const wordMatches = formSelections.adContent.trim().match(/\S+/g);
            const wordCount = wordMatches ? wordMatches.length : 0;
            const charLimit = adType === "product_sales" ? 200 : 220;

            return (
              <>
                <div className={styles.modernSectionHeader}>
                  <span className={styles.modernSectionTitle}>
                    {adType === "product_sales" ? "Product Description" : "Ad Message Copy"}
                  </span>
                  <span className={styles.modernSectionBadge}>
                    {isLongFormAllowed
                      ? `${wordCount.toLocaleString()} / 1,500 words`
                      : `${formSelections.adContent.length} / ${charLimit} chars`}
                  </span>
                </div>
                <div className={styles.modernSectionBody}>
                  <div className={styles.formGroup}>
                    <div className={styles.textareaContainerWithCounter}>
                      <textarea
                        maxLength={isLongFormAllowed ? undefined : charLimit}
                        rows={isLongFormAllowed ? 5 : 3}
                        value={formSelections.adContent}
                        placeholder={
                          adType === "product_sales"
                            ? "Write product description here (no links allowed)"
                            : isLongFormAllowed
                            ? "Ad message here"
                            : "Ad message here"
                        }
                        onChange={(e) => {
                          let nextVal = e.target.value;
                          if (isLongFormAllowed) {
                            const clamped = clampToMaxWords(nextVal, 1500);
                            nextVal = clamped.text;
                          } else if (nextVal.length > charLimit) {
                            nextVal = nextVal.slice(0, charLimit);
                          }
                          setFormSelections((prev) => ({
                            ...prev,
                            adContent: nextVal,
                          }));
                        }}
                        className={`${styles.inputBox} ${styles.textareaAutoResize} ${
                          containsLink(formSelections.adContent) ? styles.inputError : ""
                        }`}
                      />
                      {/* <span
                        className={`${styles.textareaWordCounter} ${
                          isLongFormAllowed
                            ? wordCount >= 1500
                              ? styles.textareaWordCounterLimit
                              : ""
                            : formSelections.adContent.length >= charLimit
                            ? styles.textareaWordCounterLimit
                            : ""
                        }`}
                      >
                        {isLongFormAllowed
                          ? `${wordCount.toLocaleString()} / 1,500 words${wordCount >= 1500 ? " (Max)" : ""}`
                          : `${formSelections.adContent.length} / ${charLimit} chars`}
                      </span> */}
                    </div>
                    {containsLink(formSelections.adContent) && (
                      <p className={styles.error}>Links are not allowed in the ad content.</p>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className={styles.modernSectionCard}>
          {(() => {
            const hasPrimaryCta = Boolean(formSelections.productCtaLink?.trim()) || adType === "product_sales";
            const maxButtons = hasPrimaryCta ? 2 : 3;

            return (
              <>
                <div className={styles.modernSectionHeader}>
                  <span className={styles.modernSectionTitle}>Interactive Action Buttons</span>
                  <span className={styles.modernSectionBadge}>
                    {formSelections.adActionButtons.length}/{maxButtons} active
                  </span>
                </div>
                <div className={styles.modernSectionBody}>
                  {hasPrimaryCta && (
                    <p className={styles.actionSubHint}>
                      Reduced to max {maxButtons} buttons to ensure clean mobile card spacing alongside &quot;
                      {formSelections.productCtaType || "Comment"}&quot;.
                    </p>
                  )}

                  <div className={styles.actionMeterRow}>
                    <span className={styles.actionMeterText}>
                      <Zap size={15} color="var(--primary)" /> Interactive Feed CTAs
                    </span>
                    <span className={styles.actionMeterBadge}>
                      {formSelections.adActionButtons.length} of {maxButtons} Selected
                      {formSelections.adActionButtons.length >= maxButtons && " (Max Limit)"}
                    </span>
                  </div>

                  <div className={styles.actionDeckGrid}>
                    {(() => {
                      const baseButtons: string[] = ["whatsapp", "phone", "website", "email"];
                      if (adType === "business" || adType === "government") {
                        baseButtons.push("ios", "android");
                      }
                      if (
                        adType === "business" ||
                        adType === "government" ||
                        formSelections.adMediaType === "video"
                      ) {
                        baseButtons.push("watch_now");
                      }
                      if (adType !== "product_sales") {
                        baseButtons.push("read_more");
                      }

                      const buttonMetaMap: Record<
                        string,
                        {
                          title: string;
                          subtitle: string;
                          icon: React.ReactNode;
                          previewLabel: string;
                          inputType: string;
                          placeholder: string;
                        }
                      > = {
                        whatsapp: {
                          title: "WhatsApp Direct",
                          subtitle: "Direct 1-tap chat with your WhatsApp number",
                          icon: <MessageCircle size={18} />,
                          previewLabel: "WhatsApp",
                          inputType: "tel",
                          placeholder: "e.g. 234904567890 (no plus or spaces)",
                        },
                        phone: {
                          title: "Direct Phone Call",
                          subtitle: "Immediate phone dialer prompt on user device",
                          icon: <Phone size={18} />,
                          previewLabel: "Call Now",
                          inputType: "tel",
                          placeholder: "e.g. 234904567890",
                        },
                        website: {
                          title: "External Website",
                          subtitle: "Directs audience to your target web address",
                          icon: <Globe size={18} />,
                          previewLabel: "Website",
                          inputType: "url",
                          placeholder: "e.g. https://yourwebsite.com",
                        },
                        email: {
                          title: "Email Inquiry",
                          subtitle: "Opens email composer with your recipient address",
                          icon: <Mail size={18} />,
                          previewLabel: "Email Us",
                          inputType: "email",
                          placeholder: "e.g. hello@yourbrand.com",
                        },
                        ios: {
                          title: "Install iOS App",
                          subtitle: "App Store link for iPhone and iPad devices",
                          icon: <Smartphone size={18} />,
                          previewLabel: "App Store",
                          inputType: "url",
                          placeholder: "e.g. https://apps.apple.com/app/...",
                        },
                        android: {
                          title: "Install Android App",
                          subtitle: "Google Play Store listing link for Android users",
                          icon: <Smartphone size={18} />,
                          previewLabel: "Play Store",
                          inputType: "url",
                          placeholder: "e.g. https://play.google.com/store/apps/details?id=...",
                        },
                        watch_now: {
                          title: "Watch Video",
                          subtitle: "Direct link to video premiere, stream, or channel",
                          icon: <PlayCircle size={18} />,
                          previewLabel: "Watch Now",
                          inputType: "url",
                          placeholder: "e.g. https://youtube.com/watch?v=...",
                        },
                        read_more: {
                          title: "Read More (Full-Screen Reader)",
                          subtitle: "Unlocks up to 1,500 words of rich copy & full-screen reader modal",
                          icon: <BookOpen size={18} />,
                          previewLabel: "Read More",
                          inputType: "none",
                          placeholder: "",
                        },
                      };

                      return baseButtons.map((type) => {
                        const isSelected = formSelections.adActionButtons.includes(type as any);
                        const isLimitReached =
                          !isSelected && formSelections.adActionButtons.length >= maxButtons;
                        const meta = buttonMetaMap[type] || {
                          title: type.toUpperCase().replace("_", " "),
                          subtitle: "Custom interactive action",
                          icon: <Zap size={18} />,
                          previewLabel: type,
                          inputType: "text",
                          placeholder: "",
                        };

                        const isEmail = type === "email";
                        const value =
                          type !== "read_more"
                            ? formSelections.actionDetails[
                                type as keyof typeof formSelections.actionDetails
                              ] || ""
                            : "";
                        const isEmailInvalid = isEmail && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

                        const toggleButton = () => {
                          if (isLimitReached) return;
                          setFormSelections((prev) => {
                            const updated = [...prev.adActionButtons];
                            if (!isSelected && updated.length < maxButtons) {
                              updated.push(type as any);
                            } else if (isSelected) {
                              const idx = updated.indexOf(type as any);
                              if (idx !== -1) updated.splice(idx, 1);
                            }
                            return {
                              ...prev,
                              adActionButtons: updated,
                            };
                          });
                        };

                        return (
                          <div
                            key={type}
                            className={`${styles.actionCard} ${isSelected ? styles.actionCardActive : ""} ${
                              isLimitReached ? styles.actionCardDisabled : ""
                            }`}
                          >
                            <div className={styles.actionCardHeader} onClick={toggleButton}>
                              <div className={styles.actionIconWrapper}>
                                {meta.icon}
                              </div>

                              <div className={styles.actionTextCol}>
                                <div className={styles.actionCardTitle}>
                                  <span>{meta.title}</span>
                                </div>
                                <span className={styles.actionCardSubtitle}>{meta.subtitle}</span>
                              </div>

                              <div
                                className={`${styles.actionToggleSwitch} ${
                                  isSelected ? styles.actionToggleSwitchActive : ""
                                }`}
                              >
                                <motion.span
                                  layout
                                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                  className={styles.actionToggleThumb}
                                  style={{
                                    marginLeft: isSelected ? "auto" : "0",
                                  }}
                                />
                              </div>
                            </div>

                            {isSelected && (
                              <div className={styles.actionConfigDrawer}>
                                {type !== "read_more" && (
                                  <div className={styles.actionInputContainer}>
                                    <span className={styles.actionInputLeadingIcon}>
                                      {meta.icon}
                                    </span>
                                    <input
                                      type={isEmail ? "email" : meta.inputType}
                                      placeholder={meta.placeholder}
                                      value={value}
                                      onChange={(e) =>
                                        setFormSelections((prev) => ({
                                          ...prev,
                                          actionDetails: {
                                            ...prev.actionDetails,
                                            [type]: e.target.value,
                                          },
                                        }))
                                      }
                                      className={`${styles.inputBox} ${styles.actionInputStyled} ${
                                        isEmailInvalid ? styles.inputError : ""
                                      }`}
                                    />
                                  </div>
                                )}

                                <div className={styles.actionPreviewChip}>
                                  <span>Feed Button Preview:</span>
                                  <span className={styles.actionPreviewButton}>
                                    {meta.icon}
                                    <span>{meta.previewLabel}</span>
                                  </span>
                                </div>

                                {isEmailInvalid && (
                                  <p className={styles.error}>Please enter a valid email address.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}
