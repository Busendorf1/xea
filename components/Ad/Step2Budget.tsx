"use client";

import React from "react";
import { Users, User, UserCheck } from "lucide-react";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import { AdFormSelections } from "./types";
import styles from "./page.module.css";

interface Step2BudgetProps {
  formSelections: AdFormSelections;
  setFormSelections: React.Dispatch<React.SetStateAction<AdFormSelections>>;
  userProfile: {
    mutual_count: number;
    mutuals: string[];
    last_mutual_spent?: string;
    balance: number;
  } | null;
  toggleEmploymentStatus: (val: string) => void;
}

export default function Step2Budget({
  formSelections,
  setFormSelections,
  userProfile,
  toggleEmploymentStatus,
}: Step2BudgetProps) {
  return (
    <>
      {/* Audience Demographics */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Demographics</span>
          <span className={styles.modernSectionBadge}>
            {formSelections.ageRange[0]}–{formSelections.ageRange[1]} yrs ·{" "}
            {formSelections.gender
              ? formSelections.gender.charAt(0).toUpperCase() + formSelections.gender.slice(1)
              : "All genders"}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <div className={styles.formGroup}>
            <label className={styles.fieldLabelBold}>Gender</label>
            <div className={styles.genderSegmentGroup}>
              {[
                { value: "", label: "All Genders", icon: <Users size={14} /> },
                { value: "male", label: "Male Only", icon: <User size={14} /> },
                { value: "female", label: "Female Only", icon: <UserCheck size={14} /> },
              ].map((g) => {
                const isSelected = formSelections.gender === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() =>
                      setFormSelections((prev) => ({
                        ...prev,
                        gender: g.value,
                      }))
                    }
                    className={`${styles.genderSegmentBtn} ${isSelected ? styles.genderSegmentBtnActive : ""}`}
                  >
                    {g.icon}
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.ageRangeRow}>
            <div className={styles.ageRangeField}>
              <label className={`${styles.ageRangeLabel} ${styles.fieldLabelBold}`}>Min Age</label>
              <CustomSelect
                value={String(formSelections.ageRange[0])}
                onChange={(val) => {
                  const min = parseInt(val, 10);
                  setFormSelections((prev) => {
                    const max = Math.max(min, prev.ageRange[1]);
                    return {
                      ...prev,
                      ageRange: [min, max],
                    };
                  });
                }}
                options={Array.from({ length: 83 }, (_, i) => ({
                  value: String(i + 18),
                  label: `${i + 18} years`,
                }))}
                placeholder="Min Age"
              />
            </div>
            <div className={styles.ageRangeField}>
              <label className={`${styles.ageRangeLabel} ${styles.fieldLabelBold}`}>Max Age</label>
              <CustomSelect
                value={String(formSelections.ageRange[1])}
                onChange={(val) => {
                  const max = parseInt(val, 10);
                  setFormSelections((prev) => {
                    const min = Math.min(max, prev.ageRange[0]);
                    return {
                      ...prev,
                      ageRange: [min, max],
                    };
                  });
                }}
                options={Array.from({ length: 83 }, (_, i) => ({
                  value: String(i + 18),
                  label: `${i + 18} years`,
                }))}
                placeholder="Max Age"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.fieldLabelBold}>Employment Status (max 4)</label>
            <div className={styles.checkboxGroup}>
              {[
                { value: "employed", label: "Employed" },
                { value: "unemployed", label: "Unemployed" },
                { value: "student", label: "Student" },
                { value: "entrepreneur", label: "Entrepreneur" },
                { value: "freelancer", label: "Freelancer" },
                { value: "retired", label: "Retired" },
              ].map((option) => {
                const currentList = Array.isArray(formSelections.employmentStatus)
                  ? formSelections.employmentStatus
                  : formSelections.employmentStatus
                  ? (formSelections.employmentStatus as string).split(",").map((s) => s.trim())
                  : [];
                const isChecked = currentList.includes(option.value);
                return (
                  <label key={option.value} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleEmploymentStatus(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Budget & Delivery */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Budget &amp; Delivery</span>
          <span className={styles.modernSectionBadge}>
            {formSelections.impressions.toLocaleString()} views · {formSelections.campaignDays}d
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <div className={styles.formGroup}>
            <label htmlFor="impression-input" className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
              Target Views
            </label>
            <div className={styles.impressionStack}>
              <input
                type="range"
                id="impression"
                min={1}
                max={10000}
                step={1}
                value={formSelections.impressions}
                onChange={(e) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    impressions: parseInt(e.target.value) || 1,
                  }))
                }
                className={styles.impressionSliderFull}
              />
              <div className={styles.impressionInputRow}>
                <input
                  type="number"
                  id="impression-input"
                  min={1}
                  max={5000000}
                  value={formSelections.impressions}
                  onChange={(e) => {
                    let val = parseInt(e.target.value);
                    if (isNaN(val)) val = 1;
                    if (val > 5000000) val = 5000000;
                    setFormSelections((prev) => ({
                      ...prev,
                      impressions: val,
                    }));
                  }}
                  className={styles.impressionInput}
                />
              </div>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
              Duration (Days)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={formSelections.campaignDays}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                const nextDays = isNaN(val) || val < 1 ? 1 : Math.min(365, val);
                setFormSelections((prev) => ({
                  ...prev,
                  campaignDays: nextDays,
                }));
              }}
              className={styles.inputBox}
              placeholder="e.g. 5"
            />
            <p className={styles.hintText}>
              Daily pace: ~{Math.ceil(formSelections.impressions / formSelections.campaignDays).toLocaleString()} views/day
            </p>
          </div>

          <div className={styles.formGroup}>
            <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
              When Ad Should Start
            </label>
            <div className={styles.genderSegmentGroup} style={{ marginBottom: formSelections.scheduledStartAt ? 10 : 0 }}>
              <button
                type="button"
                onClick={() =>
                  setFormSelections((prev) => ({
                    ...prev,
                    scheduledStartAt: "",
                  }))
                }
                className={`${styles.genderSegmentBtn} ${!formSelections.scheduledStartAt ? styles.genderSegmentBtnActive : ""}`}
              >
                <span>Start Upon Approval</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaultStart = new Date().toISOString().slice(0, 10);
                  setFormSelections((prev) => ({
                    ...prev,
                    scheduledStartAt: prev.scheduledStartAt ? prev.scheduledStartAt.slice(0, 10) : defaultStart,
                  }));
                }}
                className={`${styles.genderSegmentBtn} ${Boolean(formSelections.scheduledStartAt) ? styles.genderSegmentBtnActive : ""}`}
              >
                <span>Pick Start Date (Calendar)</span>
              </button>
            </div>
            {formSelections.scheduledStartAt && (
              <div style={{ marginTop: 8 }}>
                <label className={`${styles.ageRangeLabel} ${styles.fieldLabelBold}`} style={{ display: "block", marginBottom: 4 }}>
                  Start Day
                </label>
                <input
                  type="date"
                  value={formSelections.scheduledStartAt.slice(0, 10)}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) =>
                    setFormSelections((prev) => ({
                      ...prev,
                      scheduledStartAt: e.target.value,
                    }))
                  }
                  className={styles.inputBox}
                />
              </div>
            )}
            {(() => {
              const daysCount = Math.max(1, Number(formSelections.campaignDays) || 1);
              const startBase = formSelections.scheduledStartAt
                ? new Date(`${formSelections.scheduledStartAt.slice(0, 10)}T00:00:00`)
                : new Date();
              const validStart = isNaN(startBase.getTime()) ? new Date() : startBase;
              const endDate = new Date(validStart.getTime() + daysCount * 86_400_000);
              const fmt = (d: Date) =>
                d.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
              return (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                    fontSize: "0.82rem",
                    color: "var(--foreground)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div>
                    <strong>Start Day:</strong>{" "}
                    {formSelections.scheduledStartAt ? fmt(validStart) : `${fmt(validStart)} (Upon Approval)`}
                  </div>
                  <div>
                    <strong>Ends On:</strong>{" "}
                    <span style={{ color: "var(--primary)", fontWeight: 700 }}>{fmt(endDate)}</span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      ({daysCount} {daysCount === 1 ? "day" : "days"} duration)
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className={styles.formGroup}>
            <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
              Frequency Cap
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={formSelections.userFrequencyCap}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setFormSelections((prev) => ({
                  ...prev,
                  userFrequencyCap: isNaN(val) || val < 1 ? 1 : val,
                }));
              }}
              className={styles.inputBox}
              placeholder="e.g. 3"
            />
            <p className={styles.hintText}>
              Max views per user (strictly enforced &amp; evenly spaced across {formSelections.campaignDays}d; auto-broadens reach at 80% duration if needed).
            </p>
          </div>
        </div>
      </div>

      {/* Mutual Network */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Mutual Network</span>
          <span className={styles.modernSectionBadge}>
            {formSelections.displayMutualButton ? "Mutual+ Enabled" : "Optional"}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <label className={styles.mutualLabel}>
            <input
              type="checkbox"
              checked={formSelections.displayMutualButton}
              onChange={(e) =>
                setFormSelections((prev) => ({
                  ...prev,
                  displayMutualButton: e.target.checked,
                }))
              }
            />
            <span>Enable &quot;Mutual+&quot; button on this ad (allow viewers to add you as mutual)</span>
          </label>

          {formSelections.displayMutualButton && userProfile && userProfile.mutual_count > 0 && (
            <div className={styles.mutualActivatedBox}>
              <strong className={styles.mutualActivatedTitle}>Free Mutuals Applied</strong>
              <span className={styles.mutualActivatedHint}>
                Includes <strong>{userProfile.mutual_count.toLocaleString()} mutuals</strong> free. Total target:{" "}
                <strong>
                  {(formSelections.impressions + userProfile.mutual_count).toLocaleString()} views
                </strong>.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Target Location */}
      <div className={styles.modernSectionCard}>
        <div className={styles.modernSectionHeader}>
          <span className={styles.modernSectionTitle}>Target Location</span>
          <span className={styles.modernSectionBadge}>
            {formSelections.targetLocations && formSelections.targetLocations.length > 0
              ? `${formSelections.targetLocations.length} locations`
              : formSelections.state || formSelections.country || "All locations"}
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <LocationSelector
            country={formSelections.country}
            state={formSelections.state}
            location={formSelections.province}
            multiLocation={true}
            multiLocations={formSelections.targetLocations || []}
            onChange={({ country, state, location, multiLocations }) =>
              setFormSelections((prev) => ({
                ...prev,
                country: country || "",
                state: state || "",
                province:
                  multiLocations && multiLocations.length > 0
                    ? multiLocations.join("; ")
                    : location || "",
                targetLocations: multiLocations || [],
              }))
            }
            cityLabel="Province"
          />
        </div>
      </div>
    </>
  );
}
