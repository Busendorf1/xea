import { countryList, locationData } from "./locations";

export interface GpsLocationResult {
  country: string;
  state: string;
  location: string;
  rawAddress?: any;
  error?: string;
}

/**
 * Clean and normalize state/region names.
 * Removes common suffixes like "State", "Province", "Region", "Governorate", etc.
 */
export function normalizeStateName(rawState: string, country: string): string {
  if (!rawState) return "";
  let clean = rawState.replace(/\s+(State|Province|Region|Governorate|Department|District|Territory)$/i, "").trim();

  // If country is in locationData, check for case-insensitive match in predefined states
  const statesInCountry = locationData[country];
  if (statesInCountry) {
    const matched = statesInCountry.find(
      (s) => s.name.toLowerCase() === clean.toLowerCase() || s.name.toLowerCase() === rawState.toLowerCase()
    );
    if (matched) return matched.name;
  }
  return clean || rawState;
}

/**
 * Clean and normalize city/locality names.
 */
export function normalizeCityName(rawCity: string, country: string, state: string): string {
  if (!rawCity) return "";
  let clean = rawCity.trim();

  const statesInCountry = locationData[country];
  if (statesInCountry) {
    const stateObj = statesInCountry.find((s) => s.name.toLowerCase() === state.toLowerCase());
    if (stateObj) {
      const matchedCity = stateObj.cities.find((c) => c.toLowerCase() === clean.toLowerCase());
      if (matchedCity) return matchedCity;
    }
  }
  return clean;
}

/**
 * Request GPS location from browser, reverse geocode coordinates, and match against database options.
 */
export async function detectGpsLocation(): Promise<GpsLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return { country: "", state: "", location: "", error: "Geolocation is not supported by your browser." };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          // Free CORS-friendly reverse geocoding API
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
          );

          if (!res.ok) {
            throw new Error("Reverse geocoding server responded with error.");
          }

          const data = await res.json();

          const rawCountry = data.countryName || "";
          // Match country to countryList if available
          const matchedCountry = countryList.find((c) => c.toLowerCase() === rawCountry.toLowerCase()) || rawCountry;

          const rawState = data.principalSubdivision || data.localityInfo?.administrative?.[1]?.name || "";
          const matchedState = normalizeStateName(rawState, matchedCountry);

          const rawCity =
            data.city ||
            data.locality ||
            data.localityInfo?.locality?.[0]?.name ||
            data.localityInfo?.administrative?.[2]?.name ||
            "";
          const matchedCity = normalizeCityName(rawCity, matchedCountry, matchedState);

          resolve({
            country: matchedCountry,
            state: matchedState,
            location: matchedCity,
            rawAddress: data,
          });
        } catch (err: any) {
          console.error("GPS Reverse Geocoding Error:", err);
          resolve({
            country: "",
            state: "",
            location: "",
            error: err.message || "Failed to reverse geocode GPS location.",
          });
        }
      },
      (geoError) => {
        let msg = "Failed to access device location.";
        if (geoError.code === geoError.PERMISSION_DENIED) {
          msg = "Location permission denied by user.";
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          msg = "Location position unavailable.";
        } else if (geoError.code === geoError.TIMEOUT) {
          msg = "Location request timed out.";
        }
        resolve({ country: "", state: "", location: "", error: msg });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
