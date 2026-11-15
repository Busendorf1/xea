"use client";

import React, { useEffect, useState } from "react";
import { Info, AlertCircle } from "lucide-react";
import LocationSelector from "../LocationSelector";
import CustomSelect from "@/components/ui/CustomSelect";
import type { AdCapacityAssessment } from "@/lib/hooks/useAdCapacityCheck";
import {
  FREQUENCY_CAP_PRESETS,
  FREQUENCY_CAP_SLIDER_MAX_POS,
  MAX_FREQUENCY_CAP,
  MIN_FREQUENCY_CAP,
  SLIDER_MAX_FREQUENCY_CAP,
  clampFrequencyCap,
  computeAudienceDailyViewSummary,
  freqCapToSliderPos,
  sliderPosToFreqCap,
} from "@/lib/ads/frequencyCap";
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
  capacity?: AdCapacityAssessment | null;
  checkingCapacity?: boolean;
}

export default function Step2Budget({
  formSelections,
  setFormSelections,
  userProfile,
  toggleEmploymentStatus,
  capacity,
  checkingCapacity,
}: Step2BudgetProps) {
  const [freqInputText, setFreqInputText] = useState<string>(
    String(clampFrequencyCap(formSelections.userFrequencyCap, 1))
  );

  useEffect(() => {
    const normalized = clampFrequencyCap(formSelections.userFrequencyCap, 1);
    setFreqInputText((prev) => {
      const parsed = parseInt(prev, 10);
      return Number.isFinite(parsed) && parsed === normalized ? prev : String(normalized);
    });
  }, [formSelections.userFrequencyCap]);

  const dailySummary = computeAudienceDailyViewSummary(
    formSelections.impressions,
    formSelections.campaignDays,
    formSelections.userFrequencyCap
  );

  const handleSetFrequencyCap = (nextCap: number) => {
    const normalized = clampFrequencyCap(nextCap, 1);
    setFreqInputText(String(normalized));
    setFormSelections((prev) => ({
      ...prev,
      userFrequencyCap: normalized,
    }));
  };

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
                { value: "", label: "All Genders" },
                { value: "male", label: "Male Only" },
                { value: "female", label: "Female Only" },
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
            {formSelections.impressions.toLocaleString()} attentions · {formSelections.campaignDays}d
          </span>
        </div>
        <div className={styles.modernSectionBody}>
          <div className={styles.formGroup}>
            <label htmlFor="impression-input" className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
              Target Attentions
            </label>
            <div className={styles.impressionStack}>
              <input
                type="range"
                id="impression"
                min={100}
                max={10000}
                step={1}
                value={Math.max(100, Math.min(10000, formSelections.impressions || 100))}
                onChange={(e) =>
                  setFormSelections((prev) => ({
                    ...prev,
                    impressions: parseInt(e.target.value, 10) || 100,
                  }))
                }
                className={styles.impressionSliderFull}
              />
              <div className={styles.impressionInputRow}>
                <input
                  type="number"
                  id="impression-input"
                  min={100}
                  max={5000000}
                  value={formSelections.impressions || ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setFormSelections((prev) => ({ ...prev, impressions: 0 }));
                      return;
                    }
                    let val = parseInt(raw, 10);
                    if (isNaN(val)) val = 0;
                    if (val > 5000000) val = 5000000;
                    setFormSelections((prev) => ({
                      ...prev,
                      impressions: val,
                    }));
                  }}
                  className={styles.impressionInput}
                />
              </div>
              <p className={styles.hintText}>
                Minimum 100 attentions.
              </p>
              {checkingCapacity && (
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-flex",
                    width: "fit-content",
                    maxWidth: "100%",
                    alignSelf: "flex-start",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <Info size={14} />
                  <span>Checking capacity...</span>
                </div>
              )}
              {!checkingCapacity && capacity && (capacity.telemetryAvailable || capacity.status === "unavailable") && (() => {
                const isUnavailable = !capacity.telemetryAvailable || capacity.status === "unavailable";
                return (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${
                      isUnavailable
                        ? "var(--card-border, rgba(148, 163, 184, 0.35))"
                        : capacity.status === "capped"
                        ? "rgba(239, 68, 68, 0.35)"
                        : capacity.status === "broadened_needed"
                        ? "rgba(245, 158, 11, 0.35)"
                        : "rgba(16, 185, 129, 0.3)"
                    }`,
                    background:
                      isUnavailable
                        ? "rgba(148, 163, 184, 0.08)"
                        : capacity.status === "capped"
                        ? "rgba(239, 68, 68, 0.08)"
                        : capacity.status === "broadened_needed"
                        ? "rgba(245, 158, 11, 0.08)"
                        : "rgba(16, 185, 129, 0.08)",
                    display: "inline-flex",
                    width: "fit-content",
                    maxWidth: "100%",
                    alignSelf: "flex-start",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: "0.78rem",
                    color: isUnavailable ? "var(--text-muted)" : "var(--foreground)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                    {isUnavailable ? (
                      <Info size={15} color="var(--text-muted, #94a3b8)" style={{ flexShrink: 0, marginTop: 2 }} />
                    ) : capacity.status === "capped" ? (
                      <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                    ) : capacity.status === "broadened_needed" ? (
                      <Info size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                    ) : null}
                    <span>{capacity.message}</span>
                  </div>
                  {capacity.status === "capped" && capacity.maxOrderableImpressions >= 100 && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormSelections((prev) => ({
                          ...prev,
                          impressions: capacity.maxOrderableImpressions,
                        }))
                      }
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--foreground)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Use {capacity.maxOrderableImpressions.toLocaleString()}
                    </button>
                  )}
                </div>
                );
              })()}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`}>
              Duration (Days)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={formSelections.campaignDays}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                const nextDays = isNaN(val) || val < 1 ? 1 : Math.min(90, val);
                setFormSelections((prev) => ({
                  ...prev,
                  campaignDays: nextDays,
                }));
              }}
              className={styles.inputBox}
              placeholder="e.g. 5"
            />
            <p className={styles.hintText}>
              Daily pace: ~{Math.ceil((formSelections.impressions || 0) / formSelections.campaignDays).toLocaleString()} attentions/day
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
            <div className={styles.freqHeaderRow}>
              <label className={`${styles.labelBlock} ${styles.fieldLabelBold}`} style={{ marginBottom: 0 }}>
                Frequency Cap
              </label>
              <span className={styles.freqValueBadge}>
                {formSelections.userFrequencyCap.toLocaleString()}x / user
              </span>
            </div>

            <div className={styles.impressionStack}>
              <input
                type="range"
                min={0}
                max={FREQUENCY_CAP_SLIDER_MAX_POS}
                step={1}
                value={freqCapToSliderPos(formSelections.userFrequencyCap)}
                onChange={(e) => handleSetFrequencyCap(sliderPosToFreqCap(Number(e.target.value)))}
                className={styles.impressionSliderFull}
                aria-label="Frequency cap slider"
              />

              <div className={styles.freqPresetRow}>
                {FREQUENCY_CAP_PRESETS.map((preset) => {
                  const active = formSelections.userFrequencyCap === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSetFrequencyCap(preset)}
                      className={`${styles.freqPresetBtn} ${active ? styles.freqPresetBtnActive : ""}`}
                    >
                      {preset.toLocaleString()}x
                    </button>
                  );
                })}
              </div>

              <div className={styles.impressionInputRow}>
                <span className={styles.impressionInputLabel}>
                  Or enter manually (up to {MAX_FREQUENCY_CAP.toLocaleString()}x)
                </span>
                <input
                  type="number"
                  min={MIN_FREQUENCY_CAP}
                  max={MAX_FREQUENCY_CAP}
                  value={freqInputText}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setFreqInputText(raw);
                    if (!raw) return;
                    const parsed = parseInt(raw, 10);
                    if (Number.isFinite(parsed) && parsed >= MIN_FREQUENCY_CAP) {
                      setFormSelections((prev) => ({
                        ...prev,
                        userFrequencyCap: clampFrequencyCap(parsed, 1),
                      }));
                    }
                  }}
                  onBlur={() => {
                    const parsed = parseInt(freqInputText, 10);
                    handleSetFrequencyCap(Number.isFinite(parsed) ? parsed : formSelections.userFrequencyCap);
                  }}
                  className={styles.impressionInput}
                  placeholder="e.g. 25"
                />
              </div>
            </div>

            <div className={styles.freqSummaryPanel}>
              <div className={styles.freqSummaryHeader}>
                <span className={styles.freqSummaryHeading}>Approximate Daily View</span>
                <span className={styles.freqSummaryContext}>
                  {dailySummary.targetAttentions.toLocaleString()} attentions · {dailySummary.campaignDays}d · {dailySummary.frequencyCap.toLocaleString()}x cap
                </span>
              </div>
              <div className={styles.freqSummaryGrid}>
                <div className={styles.freqSummaryItem}>
                  <span className={styles.freqSummaryLabel}>Est. daily delivery</span>
                  <span className={styles.freqSummaryValue}>
                    ~{dailySummary.approxDailyAttentions.toLocaleString()}/day
                  </span>
                </div>
                <div className={styles.freqSummaryItem}>
                  <span className={styles.freqSummaryLabel}>Max per viewer</span>
                  <span className={styles.freqSummaryValue}>
                    ~{dailySummary.maxViewsPerViewerPerDay.toLocaleString()}/day
                  </span>
                </div>
                <div className={styles.freqSummaryItem}>
                  <span className={styles.freqSummaryLabel}>Min. unique audience</span>
                  <span className={styles.freqSummaryValue}>
                    ~{dailySummary.minUniqueAudience.toLocaleString()} viewers
                  </span>
                </div>
              </div>
            </div>

            <p className={styles.hintText}>
              Slide from 1x to {SLIDER_MAX_FREQUENCY_CAP.toLocaleString()}x or type higher manually; spaced across {formSelections.campaignDays}d (auto-broadens at 80% duration if needed).
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
                  {(formSelections.impressions + userProfile.mutual_count).toLocaleString()} attentions
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
