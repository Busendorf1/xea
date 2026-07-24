"use client";

import React, { useState } from "react";
import { countryList, locationData } from "@/lib/utils/locations";
import { detectGpsLocation } from "@/lib/utils/locationHelper";


interface LocationSelectorProps {
  country: string;
  state: string;
  location: string;
  onChange: (updates: { country: string; state: string; location: string }) => void;
  inputClass?: string;
  labelClass?: string;
  groupClass?: string;
  cityGroupClass?: string; // e.g. custom layout for city/province wrapper
  cityLabel?: string; // e.g. "Province" or "City/Location details"
  showLabels?: boolean;
  disabled?: boolean;
  showGpsButton?: boolean;
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
  cityLabel = "City/Location details",
  showLabels = true,
  disabled = false,
  showGpsButton = false,
}: LocationSelectorProps) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const handleDetectGps = async () => {
    setGpsLoading(true);
    setGpsStatus("Detecting location via GPS...");
    const res = await detectGpsLocation();
    setGpsLoading(false);
    if (res.error) {
      setGpsStatus(`⚠️ ${res.error}`);
    } else {
      onChange({ country: res.country, state: res.state, location: res.location });
      setGpsStatus(`✓ GPS Location Detected: ${res.location ? res.location + ", " : ""}${res.state}, ${res.country}`);
    }
  };

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
      onChange({ country, state: "", location: "" });
    } else {
      onChange({ country, state: val, location: "" });
    }
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "Other") {
      onChange({ country, state, location: "" });
    } else {
      onChange({ country, state, location: val });
    }
  };

  return (
    <>
      {showGpsButton && (
        <div style={{ gridColumn: "1 / -1", marginBottom: "0.75rem" }}>
          <button
            type="button"
            onClick={handleDetectGps}
            disabled={disabled || gpsLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.65rem 1.25rem",
              borderRadius: "8px",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              color: "#2563eb",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: disabled || gpsLoading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease"
            }}
          >
            📍 {gpsLoading ? "Detecting GPS Location..." : "Auto-Detect Location (GPS)"}
          </button>
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

      {/* Country Select */}
      <div className={groupClass}>
        {showLabels && <label className={labelClass}>Country</label>}
        <select
          value={selectedCountryOption}
          onChange={handleCountryChange}
          className={inputClass}
          style={{ width: "100%" }}
          disabled={disabled}
          required
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
              onChange({ country: e.target.value, state: "", location: "" })
            }
            className={inputClass}
            style={{ width: "100%", marginTop: "0.5rem" }}
            disabled={disabled}
            required
          />
        )}
      </div>

      {/* State Select */}
      <div className={groupClass}>
        {showLabels && <label className={labelClass}>State</label>}
        {isPredefinedCountry && selectedCountryOption !== "Other" ? (
          <>
            <select
              value={selectedStateOption}
              onChange={handleStateChange}
              className={inputClass}
              style={{ width: "100%" }}
              disabled={disabled}
              required
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
                  onChange({ country, state: e.target.value, location: "" })
                }
                className={inputClass}
                style={{ width: "100%", marginTop: "0.5rem" }}
                disabled={disabled}
                required
              />
            )}
          </>
        ) : (
          <input
            type="text"
            placeholder="Type State Name"
            value={state}
            onChange={(e) =>
              onChange({ country, state: e.target.value, location: "" })
            }
            className={inputClass}
            style={{ width: "100%" }}
            disabled={disabled}
            required
          />
        )}
      </div>

      {/* City/Location Select */}
      <div className={cityGroupClass || groupClass}>
        {showLabels && <label className={labelClass}>{cityLabel}</label>}
        {isPredefinedState && selectedStateOption !== "Other" ? (
          <>
            <select
              value={selectedCityOption}
              onChange={handleCityChange}
              className={inputClass}
              style={{ width: "100%" }}
              disabled={disabled}
              required
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
                  onChange({ country, state, location: e.target.value })
                }
                className={inputClass}
                style={{ width: "100%", marginTop: "0.5rem" }}
                disabled={disabled}
                required
              />
            )}
          </>
        ) : (
          <input
            type="text"
            placeholder={`Type ${cityLabel}`}
            value={location}
            onChange={(e) =>
              onChange({ country, state, location: e.target.value })
            }
            className={inputClass}
            style={{ width: "100%" }}
            disabled={disabled}
            required
          />
        )}
      </div>
    </>
  );
}
