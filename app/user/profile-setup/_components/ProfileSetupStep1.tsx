"use client";

import React from "react";
import { CheckCircle2, AlertCircle, Loader2, XCircle, Info } from "lucide-react";
import { motion } from "framer-motion";
import LocationSelector from "@/components/LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import TermsAgreementCheckbox from "@/components/ui/TermsAgreementCheckbox/TermsAgreementCheckbox";
import styles from "../page.module.css";
import { ProfileFormData } from "./types";

interface ProfileSetupStep1Props {
  formData: ProfileFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  checkingUsername: boolean;
  usernameAvailable: boolean | null;
  usernameStatus: string | null;
  goodwillAgreed: boolean;
  setGoodwillAgreed: React.Dispatch<React.SetStateAction<boolean>>;
  termsError: string | null;
  setTermsError: React.Dispatch<React.SetStateAction<string | null>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  onLogout: () => void;
  onNext: () => void;
}

export default function ProfileSetupStep1({
  formData,
  setFormData,
  fieldErrors,
  setFieldErrors,
  checkingUsername,
  usernameAvailable,
  usernameStatus,
  goodwillAgreed,
  setGoodwillAgreed,
  termsError,
  setTermsError,
  setErrorMessage,
  handleInputChange,
  onLogout,
  onNext,
}: ProfileSetupStep1Props) {
  return (
    <div className={styles.formStep}>
      <div className={styles.grid}>
        <div className={styles.inputGroup} style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="username" className={styles.inputLabel}>
            Username
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              id="username"
              name="username"
              placeholder="e.g. alex_dev"
              required
              maxLength={30}
              value={formData.username}
              onChange={handleInputChange}
              className={styles.inputField}
              style={{
                paddingLeft: "32px",
                borderColor:
                  usernameAvailable === true
                    ? "var(--primary)"
                    : usernameAvailable === false
                    ? "#ef4444"
                    : undefined,
              }}
            />
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              @
            </span>
          </div>

          {checkingUsername && (
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--primary)",
                marginTop: "6px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 500,
              }}
            >
              <Loader2 size={14} className="animate-spin" color="var(--primary)" />
              <span>Checking availability...</span>
            </p>
          )}

          {!checkingUsername && usernameStatus && (
            <p
              style={{
                fontSize: "0.78rem",
                marginTop: "6px",
                fontWeight: 600,
                color: usernameAvailable ? "var(--primary)" : "#ef4444",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {usernameAvailable ? (
                <CheckCircle2 size={14} color="var(--primary)" />
              ) : (
                <XCircle size={14} color="#ef4444" />
              )}
              <span>{usernameStatus}</span>
            </p>
          )}

          <div className={styles.privacyNotice}>
            <Info size={15} color="var(--primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>
              <strong>Public Handle Advisory:</strong> Your <code>@username</code> is what people
              see on the feed. Keep your email private and never use it as your username. Always
              set a username completely different from your email to keep your email hidden from
              databases and public feeds. Paayh is removed from all liability if you use your email
              or personal details as your username.
            </span>
          </div>

          {fieldErrors.username && <span className={styles.fieldError}>{fieldErrors.username}</span>}
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="dob" className={styles.inputLabel}>
            Date of Birth
          </label>
          <input
            type="date"
            id="dob"
            name="dob"
            required
            value={formData.dob}
            onChange={handleInputChange}
            className={styles.inputField}
          />
          {fieldErrors.dob && <span className={styles.fieldError}>{fieldErrors.dob}</span>}
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="phone" className={styles.inputLabel}>
            Phone Number
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            placeholder="e.g. +2348012345678"
            required
            maxLength={20}
            value={formData.phone}
            onChange={handleInputChange}
            className={styles.inputField}
          />
          {fieldErrors.phone && <span className={styles.fieldError}>{fieldErrors.phone}</span>}
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="gender" className={styles.inputLabel}>
            Gender
          </label>
          <CustomSelect
            id="gender"
            name="gender"
            value={formData.gender}
            onChange={(val) => {
              setFormData((prev) => ({ ...prev, gender: val }));
              if (fieldErrors.gender) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.gender;
                  return next;
                });
              }
            }}
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
            placeholder="Select Gender"
          />
          {fieldErrors.gender && <span className={styles.fieldError}>{fieldErrors.gender}</span>}
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="employment" className={styles.inputLabel}>
            Employment Status
          </label>
          <CustomSelect
            id="employment"
            name="employment"
            value={formData.employment}
            onChange={(val) => {
              setFormData((prev) => ({ ...prev, employment: val }));
              if (fieldErrors.employment) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.employment;
                  return next;
                });
              }
            }}
            options={[
              { value: "employed", label: "Employed" },
              { value: "student", label: "Student" },
              { value: "unemployed", label: "Unemployed" },
              { value: "freelancer", label: "Freelancer" },
              { value: "entrepreneur", label: "Entrepreneur" },
              { value: "retired", label: "Retired" },
            ]}
            placeholder="Select Employment"
          />
        </div>

        <div className={styles.inputGroupFull}>
          <LocationSelector
            country={formData.country}
            state={formData.state}
            location={formData.location}
            onChange={({ country, state, location }) =>
              setFormData((prev) => ({ ...prev, country, state, location }))
            }
            inputClass={styles.inputField}
            labelClass={styles.inputLabel}
            groupClass={styles.inputGroup}
            cityGroupClass={styles.inputGroupFull}
            cityLabel="City/Location details"
            gpsEnforced={true}
          />
          {(!formData.country || !formData.state || !formData.location) && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                marginTop: "8px",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.28)",
                color: "#d97706",
                fontSize: "0.78rem",
                lineHeight: 1.45,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>
                <strong>Optional at Setup:</strong> You can continue without enabling GPS auto-detect
                right now. However, location verification is important for localized campaigns, and
                you may not be able to earn or use Paayh Pay until verified via the Proof of
                Location prompt in the app.
              </span>
            </div>
          )}
        </div>

        <div className={styles.inputGroupFull}>
          <label htmlFor="businessName" className={styles.inputLabel}>
            Business Name (Optional)
          </label>
          <input
            type="text"
            id="businessName"
            name="businessName"
            placeholder="e.g. ABC Ltd"
            maxLength={25}
            value={formData.businessName}
            onChange={handleInputChange}
            className={styles.inputField}
          />
        </div>

        <div className={styles.inputGroupFull}>
          <label htmlFor="bio" className={styles.inputLabel}>
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            placeholder="Tell us a bit about yourself..."
            maxLength={90}
            value={formData.bio}
            onChange={handleInputChange}
            className={styles.textareaField}
          />
        </div>
      </div>

      <TermsAgreementCheckbox
        id="profile-setup-terms"
        checked={goodwillAgreed}
        onChange={(checked) => {
          setGoodwillAgreed(checked);
          if (checked) {
            setTermsError(null);
            setErrorMessage(null);
          }
        }}
        instruction="Please read and review the terms and policies below, and tick the box if you accept:"
        terms={[
          { label: "Terms of Service", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Good Will & Community Guidelines", href: "/terms" },
        ]}
        checkboxLabel="I have read, reviewed, and accept the Terms of Service & Privacy Policy, and pledge to participate in good will and fair attention exchange."
        errorMessage={termsError}
        required
      />

      <div className={styles.buttonGroup}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 450, damping: 25 }}
          type="button"
          onClick={onLogout}
          className={styles.backBtn}
          style={{ marginRight: "auto" }}
        >
          Logout
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 450, damping: 25 }}
          type="button"
          onClick={onNext}
          className={styles.nextBtn}
        >
          Next Step
        </motion.button>
      </div>
    </div>
  );
}
