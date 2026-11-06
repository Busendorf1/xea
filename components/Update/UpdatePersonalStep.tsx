"use client";

import React from "react";
import { Info } from "lucide-react";
import styles from "./page.module.css";
import LocationSelector from "../LocationSelector";

export interface UpdatePersonalStepProps {
  dbProfile: any;
  formData: any;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  isFormDisabled: boolean;
}

export function UpdatePersonalStep({
  dbProfile,
  formData,
  handleChange,
  setFormData,
  isFormDisabled,
}: UpdatePersonalStepProps) {
  return (
    <div className={styles.formSection}>
      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.colSpanFull}`}>
          <label>Username / Handle</label>
          <input
            name="username"
            placeholder={dbProfile.username || "e.g. alex_dev or user@example.com"}
            value={formData.username || ""}
            onChange={handleChange}
            disabled={isFormDisabled}
          />
          <div className={styles.privacyNoticeBox}>
            <Info size={15} color="#6366f1" className={styles.privacyNoticeIcon} />
            <span>
              <strong>Public Handle vs. Private Email:</strong> Your <code>@username</code> is publicly visible across the platform and not encrypted, whereas your account email remains private (used only for login, notifications, and wallet activities) and is never displayed on the feed.
            </span>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>First Name</label>
          <input
            name="firstName"
            placeholder={dbProfile.firstName || "First Name"}
            value={formData.firstName || ""}
            onChange={handleChange}
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Last Name</label>
          <input
            name="lastName"
            placeholder={dbProfile.lastName || "Last Name"}
            value={formData.lastName || ""}
            onChange={handleChange}
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Date of Birth</label>
          <input
            type="date"
            name="dob"
            value={formData.dob || ""}
            onChange={handleChange}
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Phone Number</label>
          <input
            name="phone"
            type="tel"
            placeholder={dbProfile.phone || "Phone"}
            value={formData.phone || ""}
            onChange={handleChange}
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Email Address</label>
          <input
            name="email"
            type="email"
            placeholder={dbProfile.email || "Email"}
            value={dbProfile.email || formData.email || ""}
            readOnly
            disabled
            title="Account email address cannot be modified"
          />
        </div>

        <div className={styles.formGroup}>
          <label>Business Name (Optional)</label>
          <input
            name="business_name"
            placeholder={dbProfile.business_name || "Business Name"}
            maxLength={25}
            value={formData.business_name || ""}
            onChange={handleChange}
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.colSpanFull}>
          <LocationSelector
            country={formData.country !== undefined ? formData.country : (dbProfile.country || "")}
            state={formData.state !== undefined ? formData.state : (dbProfile.state || "")}
            location={formData.location !== undefined ? formData.location : (dbProfile.location || "")}
            onChange={({ country, state, location }) =>
              setFormData((prev: any) => ({ ...prev, country, state, location }))
            }
            showLabels={true}
            groupClass={styles.formGroup}
            cityGroupClass={styles.formGroup}
            cityLabel="City/Location"
            disabled={isFormDisabled}
            gpsEnforced={true}
          />
        </div>
      </div>
    </div>
  );
}

export default UpdatePersonalStep;
