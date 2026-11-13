"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  MessageCircle,
  Phone,
  Globe,
  Mail,
  Smartphone,
  PlayCircle,
  BookOpen,
} from "lucide-react";
import { AdFormSelections } from "./types";
import styles from "./page.module.css";

interface Step3ContactButtonsSectionProps {
  formSelections: AdFormSelections;
  setFormSelections: React.Dispatch<React.SetStateAction<AdFormSelections>>;
  adType: string;
}

interface ButtonMeta {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  previewLabel: string;
  inputType: string;
  placeholder: string;
}

const BUTTON_META_MAP: Record<string, ButtonMeta> = {
  whatsapp: {
    title: "WhatsApp Direct",
    subtitle: "Direct WhatsApp chat",
    icon: <MessageCircle size={18} />,
    previewLabel: "WhatsApp",
    inputType: "tel",
    placeholder: "e.g. 234904567890 (no plus or spaces)",
  },
  phone: {
    title: "Direct Phone Call",
    subtitle: "Direct phone call",
    icon: <Phone size={18} />,
    previewLabel: "Call Now",
    inputType: "tel",
    placeholder: "e.g. 234904567890",
  },
  website: {
    title: "External Website",
    subtitle: "External website",
    icon: <Globe size={18} />,
    previewLabel: "Website",
    inputType: "url",
    placeholder: "e.g. https://yourwebsite.com",
  },
  email: {
    title: "Email Inquiry",
    subtitle: "Direct email",
    icon: <Mail size={18} />,
    previewLabel: "Email Us",
    inputType: "email",
    placeholder: "e.g. hello@yourbrand.com",
  },
  ios: {
    title: "Install iOS App",
    subtitle: "Apple App Store",
    icon: <Smartphone size={18} />,
    previewLabel: "App Store",
    inputType: "url",
    placeholder: "e.g. https://apps.apple.com/app/...",
  },
  android: {
    title: "Install Android App",
    subtitle: "Google Play Store",
    icon: <Smartphone size={18} />,
    previewLabel: "Play Store",
    inputType: "url",
    placeholder: "e.g. https://play.google.com/store/apps/details?id=...",
  },
  watch_now: {
    title: "Watch Video",
    subtitle: "Watch video",
    icon: <PlayCircle size={18} />,
    previewLabel: "Watch Now",
    inputType: "url",
    placeholder: "e.g. https://youtube.com/watch?v=...",
  },
  read_more: {
    title: "Read More (Full-Screen Reader)",
    subtitle: "Full-screen reader",
    icon: <BookOpen size={18} />,
    previewLabel: "Read More",
    inputType: "none",
    placeholder: "",
  },
};

export default function Step3ContactButtonsSection({
  formSelections,
  setFormSelections,
  adType,
}: Step3ContactButtonsSectionProps) {
  const hasPrimaryCta = Boolean(formSelections.productCtaLink?.trim()) || adType === "product_sales";
  const maxButtons = hasPrimaryCta ? 2 : 3;

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

  return (
    <div className={styles.modernSectionCard}>
      <div className={styles.modernSectionHeader}>
        <span className={styles.modernSectionTitle}>Contact Buttons</span>
        <span className={styles.modernSectionBadge}>
          {formSelections.adActionButtons.length}/{maxButtons} active
        </span>
      </div>
      <div className={styles.modernSectionBody}>
        {hasPrimaryCta && (
          <p className={styles.actionSubHint}>
            Max {maxButtons} action buttons for mobile layout.
          </p>
        )}

        <div className={styles.actionMeterRow}>
          <span className={styles.actionMeterText}>Interactive Feed CTAs</span>
          <span className={styles.actionMeterBadge}>
            {formSelections.adActionButtons.length} of {maxButtons} Selected
            {formSelections.adActionButtons.length >= maxButtons && " (Max Limit)"}
          </span>
        </div>

        <div className={styles.actionDeckGrid}>
          {baseButtons.map((type) => {
            const isSelected = formSelections.adActionButtons.includes(type as any);
            const isLimitReached =
              !isSelected && formSelections.adActionButtons.length >= maxButtons;
            const meta = BUTTON_META_MAP[type] || {
              title: type.toUpperCase().replace("_", " "),
              subtitle: "Custom interactive action",
              icon: <Globe size={18} />,
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
                <div
                  role="button"
                  tabIndex={isLimitReached && !isSelected ? -1 : 0}
                  aria-pressed={isSelected}
                  aria-disabled={isLimitReached && !isSelected}
                  aria-label={`Toggle ${meta.title}`}
                  className={styles.actionCardHeader}
                  onClick={toggleButton}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleButton();
                    }
                  }}
                >
                  <div className={styles.actionIconWrapper}>{meta.icon}</div>

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
                        <span className={styles.actionInputLeadingIcon}>{meta.icon}</span>
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
                      <span>Preview:</span>
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
          })}
        </div>
      </div>
    </div>
  );
}
