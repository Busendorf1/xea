"use client";

import React from "react";
import { Clock } from "lucide-react";
import styles from "./page.module.css";
import TermsAgreementCheckbox from "@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox";
import { hasManualAvatar } from "@/lib/utils/avatar";

export interface UpdateReviewStepProps {
  dbProfile: any;
  formData: any;
  imageFile: File | null;
  goodwillAgreed: boolean;
  setGoodwillAgreed: (agreed: boolean) => void;
  termsError: string | null;
  setTermsError: (err: string | null) => void;
  setStatus: (s: string | null) => void;
}

export function UpdateReviewStep({
  dbProfile,
  formData,
  imageFile,
  goodwillAgreed,
  setGoodwillAgreed,
  termsError,
  setTermsError,
  setStatus,
}: UpdateReviewStepProps) {
  return (
    <div className={styles.formSection}>
      <p className={styles.stepSectionIntro}>
        Please review your updated profile information before saving.
      </p>

      <div className={styles.reviewGrid}>
        <div className={styles.reviewCard}>
          <div className={styles.reviewCardTitle}>Personal</div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Username:</span>
            <span className={styles.reviewValue}>{formData.username || dbProfile.username || "None"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Name:</span>
            <span className={styles.reviewValue}>
              {`${formData.firstName || dbProfile.firstName || ""} ${formData.lastName || dbProfile.lastName || ""}`.trim() || "None"}
            </span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Email:</span>
            <span className={styles.reviewValue}>{formData.email || dbProfile.email || "None"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Phone:</span>
            <span className={styles.reviewValue}>{formData.phone || dbProfile.phone || "None"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Location:</span>
            <span className={styles.reviewValue}>
              {formData.location || dbProfile.location
                ? `${formData.location || dbProfile.location}, ${formData.state || dbProfile.state}, ${formData.country || dbProfile.country}`
                : "None"}
            </span>
          </div>
        </div>

        <div className={styles.reviewCard}>
          <div className={styles.reviewCardTitle}>Demographics</div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Gender:</span>
            <span className={styles.reviewValue}>{formData.gender || dbProfile.gender || "None"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Employment:</span>
            <span className={styles.reviewValue}>{formData.employment || dbProfile.employment || "None"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Intl Traveller:</span>
            <span className={styles.reviewValue}>{formData.intlTravel || "no"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Local Flight Traveller:</span>
            <span className={styles.reviewValue}>{formData.localTravel || "no"}</span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Profile Picture:</span>
            <span className={styles.reviewValue}>
              {imageFile ? `New file (${imageFile.name})` : hasManualAvatar(dbProfile.profileImage) ? "Active" : "None"}
            </span>
          </div>
        </div>

        <div className={`${styles.reviewCard} ${styles.colSpanFull}`}>
          <div className={styles.reviewCardTitle}>Selected Targeting</div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Industries:</span>
            <span className={styles.reviewValue}>
              {(formData.industry?.length ? formData.industry : dbProfile.industry || []).join(", ") || "None"}
            </span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Interests:</span>
            <span className={styles.reviewValue}>
              {(formData.interest?.length ? formData.interest : dbProfile.interest || []).join(", ") || "None"}
            </span>
          </div>
          <div className={styles.reviewItem}>
            <span className={styles.reviewLabel}>Bio:</span>
            <span className={styles.reviewValue}>{formData.bio || dbProfile.bio || "None"}</span>
          </div>
        </div>
      </div>

      {dbProfile && !dbProfile.has_updated_profile && (
        <p className={styles.cooldownWarningNote}>
          <Clock size={15} className={styles.flexShrink0} />
          <span>Note: Once confirmed, you can only update your profile once every 30 days.</span>
        </p>
      )}

      <TermsAgreementCheckbox
        id="profile-update-terms"
        checked={goodwillAgreed}
        onChange={(checked) => {
          setGoodwillAgreed(checked);
          if (checked) {
            setTermsError(null);
            setStatus(null);
          }
        }}
        instruction="Please read and review the terms and policies below, and tick the box if you accept:"
        terms={[
          { label: "Terms of Service", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Good Will & Community Guidelines", href: "/terms" },
        ]}
        checkboxLabel="I confirm that I have read, reviewed, and accept the Terms of Service & Privacy Policy, and pledge to participate in good will."
        errorMessage={termsError}
        required
      />
    </div>
  );
}

export default UpdateReviewStep;
