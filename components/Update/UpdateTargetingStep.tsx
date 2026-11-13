"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./page.module.css";
import {
  ALL_INDUSTRIES as industries,
  ALL_INTERESTS as interests,
  ALL_BEHAVIORS as behaviors,
  ALL_LIFESTYLES as lifestyles,
  ALL_PERSONALITY_TRAITS as personalityTraits,
} from "@/lib/categoryTargetingMap";

export interface UpdateTargetingStepProps {
  dbProfile: any;
  formData: any;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  openDropdowns: {
    industry: boolean;
    interest: boolean;
    behavior: boolean;
    lifestyle: boolean;
    personality: boolean;
  };
  toggleDropdown: (key: keyof UpdateTargetingStepProps["openDropdowns"]) => void;
  handleSelectAll: (name: "industry" | "interest" | "behavior" | "lifestyle" | "personality", options: string[]) => void;
  handleClearAll: (name: "industry" | "interest" | "behavior" | "lifestyle" | "personality") => void;
  isFormDisabled: boolean;
  timeRemaining: number | null;
}

export function UpdateTargetingStep({
  dbProfile,
  formData,
  handleChange,
  openDropdowns,
  toggleDropdown,
  handleSelectAll,
  handleClearAll,
  isFormDisabled,
  timeRemaining,
}: UpdateTargetingStepProps) {
  const isLocked = isFormDisabled;

  const renderDropdown = (
    label: string,
    name: "industry" | "interest" | "behavior" | "lifestyle" | "personality",
    options: string[]
  ) => {
    const selectedArr = formData[name] || [];
    const isAllSelected = options.length > 0 && selectedArr.length === options.length;

    return (
      <div className={styles.dropdownContainer}>
        <div
          className={styles.dropdownHeader}
          onClick={() => toggleDropdown(name)}
        >
          <span>{selectedArr.length > 0 ? `${selectedArr.length} ${label} selected` : `Select ${label}`}</span>
          <span>{openDropdowns[name] ? "▲" : "▼"}</span>
        </div>
        <AnimatePresence>
          {openDropdowns[name] && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={styles.checkboxGroup}
            >
              <div className={styles.dropdownActionsBar}>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isAllSelected) {
                      handleClearAll(name);
                    } else {
                      handleSelectAll(name, options);
                    }
                  }}
                  disabled={isLocked}
                >
                  {isAllSelected ? "Deselect All" : "Select All"}
                </button>
                {selectedArr.length > 0 && (
                  <button
                    type="button"
                    className={styles.quickActionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearAll(name);
                    }}
                    disabled={isLocked}
                  >
                    Clear ({selectedArr.length})
                  </button>
                )}
              </div>
              {options.map((opt) => (
                <motion.label
                  key={opt}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <input
                    type="checkbox"
                    name={name}
                    value={opt}
                    checked={formData[name]?.includes(opt) || false}
                    onChange={handleChange}
                    disabled={isLocked}
                  />
                  <span>{opt}</span>
                </motion.label>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className={styles.formSection}>
      <p className={styles.stepSectionIntro}>
        Select your relevant industries and interests to receive targeted ads and business highlights.
      </p>

      {renderDropdown("Industries (Required)", "industry", industries)}
      {renderDropdown("Interests (Required)", "interest", interests)}
      {renderDropdown("Behaviors", "behavior", behaviors)}
      {renderDropdown("Lifestyles", "lifestyle", lifestyles)}
      {renderDropdown("Personality Traits", "personality", personalityTraits)}

      <div className={styles.bioGroup}>
        <label className={styles.bioLabel}>
          Bio / Tagline
        </label>
        <textarea
          name="bio"
          placeholder={dbProfile.bio || "Short Bio (max 90 characters)"}
          maxLength={90}
          value={formData.bio || ""}
          onChange={handleChange}
          disabled={isFormDisabled}
          className={styles.textbo}
        />
      </div>
    </div>
  );
}

export default UpdateTargetingStep;
