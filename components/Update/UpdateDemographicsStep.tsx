"use client";

import React from "react";
import styles from "./page.module.css";
import CustomSelect from "@/components/ui/CustomSelect";
import { hasManualAvatar } from "@/lib/utils/avatar";

export interface UpdateDemographicsStepProps {
  dbProfile: any;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  isFormDisabled: boolean;
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
}

export function UpdateDemographicsStep({
  dbProfile,
  formData,
  setFormData,
  isFormDisabled,
  imageFile,
  setImageFile,
}: UpdateDemographicsStepProps) {
  return (
    <div className={styles.formSection}>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label>Gender</label>
          <CustomSelect
            value={formData.gender || ""}
            onChange={(val) => setFormData((prev: any) => ({ ...prev, gender: val }))}
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
            placeholder="Select Gender"
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Employment Status</label>
          <CustomSelect
            value={formData.employment || ""}
            onChange={(val) => setFormData((prev: any) => ({ ...prev, employment: val }))}
            options={[
              { value: "employed", label: "Employed" },
              { value: "student", label: "Student" },
              { value: "unemployed", label: "Unemployed" },
              { value: "freelancer", label: "Freelancer" },
              { value: "entrepreneur", label: "Entrepreneur" },
              { value: "retired", label: "Retired" },
            ]}
            placeholder="Select Employment"
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>International Traveller?</label>
          <CustomSelect
            value={formData.intlTravel || "no"}
            onChange={(val) => setFormData((prev: any) => ({ ...prev, intlTravel: val }))}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
            disabled={isFormDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Local Traveller by Air?</label>
          <CustomSelect
            value={formData.localTravel || "no"}
            onChange={(val) => setFormData((prev: any) => ({ ...prev, localTravel: val }))}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
            disabled={isFormDisabled}
          />
        </div>

        <div className={`${styles.formGroup} ${styles.colSpanFull}`}>
          <label>
            Profile Picture / Brand Logo <span className={styles.optionalLabelText}>(Optional)</span>
          </label>
          <label className={`${styles.fileUpload} ${isFormDisabled ? styles.fileUploadDisabled : ""}`}>
            {imageFile ? `Selected: ${imageFile.name}` : "Choose Profile Picture or Brand Logo (Optional)"}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImageFile(file);
              }}
              disabled={isFormDisabled}
            />
          </label>
          {hasManualAvatar(dbProfile.profileImage) ? (
            <p className={styles.uploadHelperText}>
              Choose profile photo/logo.
            </p>
          ) : (
            <p className={styles.uploadHelperText}>
              Optional. If no photo or logo is uploaded, a default silhouette avatar will be displayed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpdateDemographicsStep;
