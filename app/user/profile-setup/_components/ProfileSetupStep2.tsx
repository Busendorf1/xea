"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import CustomSelect from "@/components/ui/CustomSelect";
import {
  ALL_INDUSTRIES as industries,
  ALL_INTERESTS as interests,
  ALL_BEHAVIORS as behaviors,
  ALL_LIFESTYLES as lifestyles,
  ALL_PERSONALITY_TRAITS as personalityTraits,
} from "@/lib/categoryTargetingMap";
import styles from "../page.module.css";
import { DropdownKey, OpenDropdownsState, ProfileFormData } from "./types";

interface ProfileSetupStep2Props {
  formData: ProfileFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  openDropdowns: OpenDropdownsState;
  toggleDropdown: (key: DropdownKey) => void;
  handleCheckboxChange: (name: string, value: string, checked: boolean) => void;
  handleSelectAll: (name: string, options: string[]) => void;
  handleClearAll: (name: string) => void;
  loading: boolean;
  onLogout: () => void;
  onBack: () => void;
}

export default function ProfileSetupStep2({
  formData,
  setFormData,
  openDropdowns,
  toggleDropdown,
  handleCheckboxChange,
  handleSelectAll,
  handleClearAll,
  loading,
  onLogout,
  onBack,
}: ProfileSetupStep2Props) {
  const renderMultiSelect = (label: string, name: DropdownKey, options: string[]) => {
    const selectedArr = (formData[name] as string[]) || [];
    const isAllSelected = options.length > 0 && selectedArr.length === options.length;
    return (
      <div className={styles.dropdownContainer}>
        <label className={styles.inputLabel}>{label}</label>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={Boolean(openDropdowns[name])}
          aria-label={`Select ${label}`}
          className={styles.dropdownHeader}
          onClick={() => toggleDropdown(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleDropdown(name);
            }
          }}
        >
          <span>{selectedArr.length > 0 ? `${selectedArr.length} selected` : `Select ${label}`}</span>
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
                  >
                    Clear ({selectedArr.length})
                  </button>
                )}
              </div>
              {options.map((opt, i) => (
                <motion.label
                  key={i}
                  className={styles.checkboxLabel}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <input
                    type="checkbox"
                    checked={selectedArr.includes(opt)}
                    onChange={(e) => handleCheckboxChange(name, opt, e.target.checked)}
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
    <div className={styles.formStep}>
      <div className={styles.dropdownsGrid}>
        {renderMultiSelect("Industries", "industry", industries)}
        {renderMultiSelect("Interests", "interest", interests)}
        {renderMultiSelect("Behaviors", "behavior", behaviors)}
        {renderMultiSelect("Lifestyles", "lifestyle", lifestyles)}
        {renderMultiSelect("Personality Traits", "personality", personalityTraits)}
      </div>

      <div className={styles.grid2}>
        <div className={styles.inputGroup}>
          <label htmlFor="intlTravel" className={styles.inputLabel}>
            International Traveller?
          </label>
          <CustomSelect
            id="intlTravel"
            name="intlTravel"
            value={formData.intlTravel || "no"}
            onChange={(val) => setFormData((prev) => ({ ...prev, intlTravel: val }))}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
          />
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="localTravel" className={styles.inputLabel}>
            Local Air Traveller?
          </label>
          <CustomSelect
            id="localTravel"
            name="localTravel"
            value={formData.localTravel || "no"}
            onChange={(val) => setFormData((prev) => ({ ...prev, localTravel: val }))}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
          />
        </div>
      </div>

      <div className={styles.buttonGroup}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 450, damping: 25 }}
          type="button"
          onClick={onLogout}
          className={styles.backBtn}
          style={{ marginRight: "auto" }}
          disabled={loading}
        >
          Logout
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 450, damping: 25 }}
          type="button"
          onClick={onBack}
          className={styles.backBtn}
          disabled={loading}
        >
          Back
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 450, damping: 25 }}
          type="submit"
          className={styles.submitBtn}
          disabled={loading}
        >
          {loading ? "Saving..." : "Complete Setup"}
        </motion.button>
      </div>
    </div>
  );
}
