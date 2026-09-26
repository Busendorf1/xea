"use client";

import React, { useState, useEffect } from "react";
import { MapPin, X, AlertCircle, Plus, Navigation, Check } from "lucide-react";
import { countryList, locationData } from "@/lib/utils/locations";
import { detectGpsLocation } from "@/lib/utils/locationHelper";
import CustomSelect from "@/components/ui/CustomSelect";
import AppleSpinner from "@/components/ui/AppleSpinner";
import styles from "./LocationSelector.module.css";

interface LocationSelectorProps {
  country: string;
  state: string;
  location: string;
  onChange: (updates: { country: string; state: string; location: string; multiLocations?: string[] }) => void;
  inputClass?: string;
  labelClass?: string;
  groupClass?: string;
  cityGroupClass?: string; // e.g. custom layout for city/province wrapper
  cityLabel?: string; // e.g. "Province" or "City/Location details"
  showLabels?: boolean;
  disabled?: boolean;
  gpsEnforced?: boolean; // When true: hide fields until toggled ON, autofill via GPS, and make fields read-only
  multiLocation?: boolean;
  multiLocations?: string[];
}

export default function LocationSelector({
  country,
  state,
  location,
  onChange,
  inputClass = "",
  labelClass = "",
  groupClass = "",
  cityGroupClass = "",
  cityLabel = "Province",
  showLabels = true,
  disabled = false,
  gpsEnforced = false,
  multiLocation = false,
  multiLocations = [],
}: LocationSelectorProps) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [isToggled, setIsToggled] = useState<boolean>(Boolean(country || state || location));
  const [manualFallback, setManualFallback] = useState(false);

  useEffect(() => {
    if (country || state || location) {
      setIsToggled(true);
      if (!gpsStatus) setGpsStatus("success");
    }
  }, [country, state, location]);

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsToggled(checked);
    if (!checked) {
      setGpsStatus(null);
      setManualFallback(false);
      onChange({ country: "", state: "", location: "" });
    } else {
      setGpsLoading(true);
      setGpsStatus("detecting");
      const res = await detectGpsLocation();
      setGpsLoading(false);
      if (res.country) {
        onChange({ country: res.country, state: res.state, location: res.location });
        setGpsStatus("success");
      } else {
        setManualFallback(true);
        setGpsStatus("error");
      }
    }
  };

  const isReadOnly = gpsEnforced && !manualFallback;
  const showFields = !gpsEnforced || manualFallback || (isToggled && (Boolean(country || state || location) || gpsLoading));

  const isPredefinedCountry = countryList.includes(country);
  const selectedCountryOption = country ? (isPredefinedCountry ? country : "Other") : "";

  const statesList = isPredefinedCountry ? locationData[country] : [];
  const isPredefinedState = statesList.some((s) => s.name === state);
  const selectedStateOption = state ? (isPredefinedState ? state : "Other") : "";

  const citiesList = isPredefinedState ? statesList.find((s) => s.name === state)?.cities || [] : [];
  const isPredefinedCity = citiesList.includes(location);
  const selectedCityOption = location ? (isPredefinedCity ? location : "Other") : "";

  const countryOptions = [
    ...countryList.map((c) => ({ value: c, label: c })),
    { value: "Other", label: "Other (Type custom)" },
  ];

  const stateOptions = [
    ...statesList.map((s) => ({ value: s.name, label: s.name })),
    { value: "Other", label: "Other (Type custom)" },
  ];

  const cityOptions = [
    ...citiesList.map((city) => ({ value: city, label: city })),
    { value: "Other", label: "Other (Type custom)" },
  ];

  const handleCountryChange = (val: string) => {
    if (val === "Other") {
      onChange({ country: "", state: "", location: "" });
    } else {
      onChange({ country: val, state: "", location: "" });
    }
  };

  const handleStateChange = (val: string) => {
    if (val === "Other") {
      onChange({ country, state: "", location: "", multiLocations });
    } else {
      onChange({ country, state: val, location: "", multiLocations });
    }
  };

  const handleCityChange = (val: string) => {
    if (val === "Other") {
      onChange({ country, state, location: "", multiLocations });
    } else {
      onChange({ country, state, location: val, multiLocations });
    }
  };

  return (
    <>
      {gpsEnforced && (
        <div className={styles.appleLocationCard}>
          <div className={styles.appleLocationRow}>
            {/* Left: Apple Navigation Icon & Location Text Stack */}
            <div className={styles.appleInfoGroup}>
              <div className={`${styles.appleIconSquircle} ${isToggled ? styles.appleIconSquircleActive : ""}`}>
                <Navigation size={17} className={isToggled ? styles.appleNavActive : styles.appleNavInactive} />
              </div>
              <div className={styles.appleTextStack}>
                <span className={styles.appleTitle}>Auto-detect Location</span>
                {isToggled && (location || state || country) ? (
                  <span className={styles.appleSubtitle}>
                    <MapPin size={11} className={styles.applePinIcon} />
                    {[location, state, country].filter(Boolean).join(", ")}
                  </span>
                ) : gpsLoading ? (
                  <span className={styles.appleSubtitleMuted}>Locating network position...</span>
                ) : (
                  <span className={styles.appleSubtitleMuted}>
                    {manualFallback ? "Auto-detect unavailable. Manual entry enabled." : "Precise regional location"}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Apple Status Pill & iOS Toggle Switch */}
            <div className={styles.appleActionsGroup}>
              {/* Status Pill Badge */}
              {gpsLoading ? (
                <div className={styles.appleStatusPillLoading}>
                  <AppleSpinner size={12} />
                  <span>Locating...</span>
                </div>
              ) : gpsStatus === "success" || ((location || state || country) && isToggled) ? (
                <div className={styles.appleStatusPillSuccess}>
                  <Check size={12} strokeWidth={2.6} />
                  <span>Detected</span>
                </div>
              ) : gpsStatus === "error" || manualFallback ? (
                <div className={styles.appleStatusPillError}>
                  <AlertCircle size={12} strokeWidth={2.4} />
                  <span>Unavailable</span>
                </div>
              ) : null}

              {/* iOS Switch Toggle */}
              <label className={`${styles.appleSwitch} ${disabled || gpsLoading ? styles.appleSwitchDisabled : ""}`}>
                <input
                  type="checkbox"
                  checked={isToggled}
                  onChange={handleToggle}
                  disabled={disabled || gpsLoading}
                  className={styles.appleSwitchInput}
                  aria-label="Auto-detect location toggle"
                />
                <span className={styles.appleSwitchTrack}>
                  <span className={styles.appleSwitchKnob} />
                </span>
              </label>
            </div>
          </div>

          {/* Hidden inputs to preserve form submission values without occupying 3 columns */}
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="location" value={location} />
        </div>
      )}

      {showFields && !gpsEnforced && (
        <>
          {/* Standard Manual Selectors for Advertisers on /adPage */}
          {/* Country Select */}
              <div className={groupClass}>
                {showLabels && <label className={`${labelClass} ${styles.labelBlock}`}>Country</label>}
                <CustomSelect
                  value={selectedCountryOption}
                  onChange={handleCountryChange}
                  options={countryOptions}
                  placeholder="Select Country"
                  disabled={disabled}
                />
                {selectedCountryOption === "Other" && (
                  <input
                    type="text"
                    placeholder="Type Country Name"
                    value={isPredefinedCountry ? "" : country}
                    onChange={(e) =>
                      onChange({ country: e.target.value, state: "", location: "", multiLocations })
                    }
                    className={`${inputClass} ${styles.customInput}`}
                    disabled={disabled}
                    required={!multiLocation}
                  />
                )}
              </div>

              {/* State Select */}
              <div className={`${groupClass} ${styles.groupTopMargin}`}>
                {showLabels && <label className={`${labelClass} ${styles.labelBlock}`}>State</label>}
                {isPredefinedCountry && selectedCountryOption !== "Other" ? (
                  <>
                    <CustomSelect
                      value={selectedStateOption}
                      onChange={handleStateChange}
                      options={stateOptions}
                      placeholder="Select State"
                      disabled={disabled}
                    />
                    {selectedStateOption === "Other" && (
                      <input
                        type="text"
                        placeholder="Type State Name"
                        value={isPredefinedState ? "" : state}
                        onChange={(e) =>
                          onChange({ country, state: e.target.value, location: "", multiLocations })
                        }
                        className={`${inputClass} ${styles.customInput}`}
                        disabled={disabled}
                        required={!multiLocation}
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    placeholder="Type State Name"
                    value={state}
                    onChange={(e) =>
                      onChange({ country, state: e.target.value, location: "", multiLocations })
                    }
                    className={`${inputClass} ${styles.fullWidth}`}
                    disabled={disabled}
                    required={!multiLocation}
                  />
                )}
              </div>

              {/* City/Location Select */}
              <div className={`${cityGroupClass || groupClass} ${styles.groupTopMargin}`}>
                {showLabels && <label className={`${labelClass} ${styles.labelBlock}`}>{cityLabel}</label>}
                {isPredefinedState && selectedStateOption !== "Other" ? (
                  <>
                    <CustomSelect
                      value={selectedCityOption}
                      onChange={handleCityChange}
                      options={cityOptions}
                      placeholder={`Select ${cityLabel}`}
                      disabled={disabled}
                    />
                    {selectedCityOption === "Other" && (
                      <input
                        type="text"
                        placeholder={`Type ${cityLabel}`}
                        value={isPredefinedCity ? "" : location}
                        onChange={(e) =>
                          onChange({ country, state, location: e.target.value, multiLocations })
                        }
                        className={`${inputClass} ${styles.customInput}`}
                        disabled={disabled}
                        required={!multiLocation}
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    placeholder={`Type ${cityLabel}`}
                    value={location}
                    onChange={(e) =>
                      onChange({ country, state, location: e.target.value, multiLocations })
                    }
                    className={`${inputClass} ${styles.fullWidth}`}
                    disabled={disabled}
                    required={!multiLocation}
                  />
                )}
              </div>

              {/* Multi-Location Add Button & Selected Pills */}
              {multiLocation && (
                <div className={styles.multiLocationWrapper}>
                  <button
                    type="button"
                    onClick={() => {
                      const targetLoc = location || state || country;
                      if (!targetLoc) return;
                      const parts = [location, state, country].filter(Boolean);
                      const newLoc = parts.join(", ");
                      const current = multiLocations || [];
                      if (current.length >= 30) {
                        alert("Maximum 30 target locations reached. For broader audience reach across multiple regions, we recommend targeting by Country or State instead.");
                        return;
                      }
                      if (!current.includes(newLoc)) {
                        const updated = [...current, newLoc];
                        onChange({ country, state, location: "", multiLocations: updated });
                      }
                    }}
                    className={`${styles.addLocationBtn} ${(multiLocations?.length || 0) >= 30 ? styles.addLocationBtnDisabled : ""}`}
                  >
                    <Plus size={14} /> Add Target Location
                  </button>

                  {(multiLocations?.length || 0) >= 30 && (
                    <p className={styles.maxLocationWarning}>
                      <AlertCircle size={14} /> Maximum 30 target locations reached. For broader audience reach across multiple regions, we recommend targeting by Country or State instead.
                    </p>
                  )}

                  {multiLocations && multiLocations.length > 0 && (
                    <div className={styles.pillsContainer}>
                      {multiLocations.map((loc, idx) => (
                        <span
                          key={`${loc}-${idx}`}
                          className={styles.locationPill}
                        >
                          <MapPin size={12} color="#1d9bf0" /> {loc}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = multiLocations.filter((_, i) => i !== idx);
                              onChange({ country, state, location, multiLocations: updated });
                            }}
                            className={styles.removePillBtn}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      );
    }
