"use client";

import React, { useState, useEffect } from "react";
import { MapPin, X, AlertCircle, Plus } from "lucide-react";
import { countryList, locationData } from "@/lib/utils/locations";
import { detectGpsLocation } from "@/lib/utils/locationHelper";

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

  useEffect(() => {
    if (country || state || location) {
      setIsToggled(true);
    }
  }, [country, state, location]);

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsToggled(checked);
    if (!checked) {
      setGpsStatus(null);
      onChange({ country: "", state: "", location: "" });
    } else {
      setGpsLoading(true);
      setGpsStatus("Detecting location via GPS...");
      const res = await detectGpsLocation();
      setGpsLoading(false);
      if (res.error) {
        setGpsStatus(`⚠️ ${res.error}`);
      } else {
        onChange({ country: res.country, state: res.state, location: res.location });
        setGpsStatus(`✓ Location Detected: ${res.location ? res.location + ", " : ""}${res.state}, ${res.country}`);
      }
    }
  };

  const isReadOnly = gpsEnforced;
  const showFields = !gpsEnforced || (isToggled && (Boolean(country || state || location) || gpsLoading));

  const isPredefinedCountry = countryList.includes(country);
  const selectedCountryOption = country ? (isPredefinedCountry ? country : "Other") : "";

  const statesList = isPredefinedCountry ? locationData[country] : [];
  const isPredefinedState = statesList.some((s) => s.name === state);
  const selectedStateOption = state ? (isPredefinedState ? state : "Other") : "";

  const citiesList = isPredefinedState ? statesList.find((s) => s.name === state)?.cities || [] : [];
  const isPredefinedCity = citiesList.includes(location);
  const selectedCityOption = location ? (isPredefinedCity ? location : "Other") : "";

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "Other") {
      onChange({ country: "", state: "", location: "" });
    } else {
      onChange({ country: val, state: "", location: "" });
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "Other") {
      onChange({ country, state: "", location: "", multiLocations });
    } else {
      onChange({ country, state: val, location: "", multiLocations });
    }
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "Other") {
      onChange({ country, state, location: "", multiLocations });
    } else {
      onChange({ country, state, location: val, multiLocations });
    }
  };

  return (
    <>
      {gpsEnforced && (
        <div style={{ gridColumn: "1 / -1", marginBottom: "0.75rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.65rem", cursor: disabled || gpsLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={isToggled}
              onChange={handleToggle}
              disabled={disabled || gpsLoading}
              style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer" }}
            />
            <span>Auto-detect location</span>
          </label>
          {gpsStatus && (
            <p style={{
              fontSize: "0.83rem",
              marginTop: "0.4rem",
              fontWeight: 500,
              color: gpsStatus.startsWith("✓") ? "#16a34a" : gpsStatus.startsWith("⚠️") ? "#dc2626" : "#475569"
            }}>
              {gpsStatus}
            </p>
          )}
        </div>
      )}

      {showFields && (
        <>
          {/* If GPS Enforced, render read-only text inputs */}
          {gpsEnforced ? (
            <>
              <div className={groupClass}>
                {showLabels && <label className={labelClass}>Country</label>}
                <input
                  type="text"
                  placeholder="Country"
                  value={country}
                  readOnly
                  disabled
                  className={inputClass}
                  style={{ width: "100%", opacity: 0.85, cursor: "not-allowed" }}
                  required
                />
              </div>

              <div className={groupClass}>
                {showLabels && <label className={labelClass}>State</label>}
                <input
                  type="text"
                  placeholder="State"
                  value={state}
                  readOnly
                  disabled
                  className={inputClass}
                  style={{ width: "100%", opacity: 0.85, cursor: "not-allowed" }}
                  required
                />
              </div>

              <div className={cityGroupClass || groupClass}>
                {showLabels && <label className={labelClass}>{cityLabel}</label>}
                <input
                  type="text"
                  placeholder={cityLabel}
                  value={location}
                  readOnly
                  disabled
                  className={inputClass}
                  style={{ width: "100%", opacity: 0.85, cursor: "not-allowed" }}
                  required
                />
              </div>
            </>
          ) : (
            /* Standard Manual Selectors for Advertisers on /adPage */
            <>
              {/* Country Select */}
              <div className={groupClass}>
                {showLabels && <label className={labelClass} style={{ display: "block", marginBottom: "0.35rem" }}>Country</label>}
                <select
                  value={selectedCountryOption}
                  onChange={handleCountryChange}
                  className={inputClass}
                  style={{ width: "100%" }}
                  disabled={disabled}
                  required={!multiLocation}
                >
                  <option value="">Select Country</option>
                  {countryList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="Other">Other (Type custom)</option>
                </select>
                {selectedCountryOption === "Other" && (
                  <input
                    type="text"
                    placeholder="Type Country Name"
                    value={isPredefinedCountry ? "" : country}
                    onChange={(e) =>
                      onChange({ country: e.target.value, state: "", location: "", multiLocations })
                    }
                    className={inputClass}
                    style={{ width: "100%", marginTop: "0.5rem" }}
                    disabled={disabled}
                    required={!multiLocation}
                  />
                )}
              </div>

              {/* State Select */}
              <div className={groupClass} style={{ marginTop: "1rem" }}>
                {showLabels && <label className={labelClass} style={{ display: "block", marginBottom: "0.35rem" }}>State</label>}
                {isPredefinedCountry && selectedCountryOption !== "Other" ? (
                  <>
                    <select
                      value={selectedStateOption}
                      onChange={handleStateChange}
                      className={inputClass}
                      style={{ width: "100%" }}
                      disabled={disabled}
                      required={!multiLocation}
                    >
                      <option value="">Select State</option>
                      {statesList.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                      <option value="Other">Other (Type custom)</option>
                    </select>
                    {selectedStateOption === "Other" && (
                      <input
                        type="text"
                        placeholder="Type State Name"
                        value={isPredefinedState ? "" : state}
                        onChange={(e) =>
                          onChange({ country, state: e.target.value, location: "", multiLocations })
                        }
                        className={inputClass}
                        style={{ width: "100%", marginTop: "0.5rem" }}
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
                    className={inputClass}
                    style={{ width: "100%" }}
                    disabled={disabled}
                    required={!multiLocation}
                  />
                )}
              </div>

              {/* City/Location Select */}
              <div className={cityGroupClass || groupClass} style={{ marginTop: "1rem" }}>
                {showLabels && <label className={labelClass} style={{ display: "block", marginBottom: "0.35rem" }}>{cityLabel}</label>}
                {isPredefinedState && selectedStateOption !== "Other" ? (
                  <>
                    <select
                      value={selectedCityOption}
                      onChange={handleCityChange}
                      className={inputClass}
                      style={{ width: "100%" }}
                      disabled={disabled}
                      required={!multiLocation}
                    >
                      <option value="">Select {cityLabel}</option>
                      {citiesList.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                      <option value="Other">Other (Type custom)</option>
                    </select>
                    {selectedCityOption === "Other" && (
                      <input
                        type="text"
                        placeholder={`Type ${cityLabel}`}
                        value={isPredefinedCity ? "" : location}
                        onChange={(e) =>
                          onChange({ country, state, location: e.target.value, multiLocations })
                        }
                        className={inputClass}
                        style={{ width: "100%", marginTop: "0.5rem" }}
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
                    className={inputClass}
                    style={{ width: "100%" }}
                    disabled={disabled}
                    required={!multiLocation}
                  />
                )}
              </div>

              {/* Multi-Location Add Button & Selected Pills */}
              {multiLocation && (
                <div style={{ gridColumn: "1 / -1", marginTop: "0.5rem" }}>
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
                    style={{
                      backgroundColor: (multiLocations?.length || 0) >= 30 ? "rgba(148, 163, 184, 0.2)" : "rgba(29, 155, 240, 0.12)",
                      border: `1px solid ${(multiLocations?.length || 0) >= 30 ? "#64748b" : "rgba(29, 155, 240, 0.3)"}`,
                      color: (multiLocations?.length || 0) >= 30 ? "#94a3b8" : "#1d9bf0",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: (multiLocations?.length || 0) >= 30 ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <Plus size={14} /> Add Target Location
                  </button>

                  {(multiLocations?.length || 0) >= 30 && (
                    <p style={{ fontSize: "0.78rem", color: "#f59e0b", marginTop: "0.4rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                      <AlertCircle size={14} /> Maximum 30 target locations reached. For broader audience reach across multiple regions, we recommend targeting by Country or State instead.
                    </p>
                  )}

                  {multiLocations && multiLocations.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "0.6rem" }}>
                      {multiLocations.map((loc, idx) => (
                        <span
                          key={`${loc}-${idx}`}
                          style={{
                            backgroundColor: "var(--sidebar-bg)",
                            border: "1px solid var(--card-border)",
                            padding: "4px 10px",
                            borderRadius: "16px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: "var(--foreground)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                        >
                          <MapPin size={12} color="#1d9bf0" /> {loc}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = multiLocations.filter((_, i) => i !== idx);
                              onChange({ country, state, location, multiLocations: updated });
                            }}
                            style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: 0 }}
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
      )}
    </>
  );
}
