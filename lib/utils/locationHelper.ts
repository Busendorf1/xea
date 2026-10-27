import { countryList, locationData } from "./locations";

export interface GpsLocationResult {
  country: string;
  state: string;
  location: string;
  latitude?: number;
  longitude?: number;
  rawAddress?: Record<string, unknown>;
  error?: string;
  permissionDenied?: boolean;
  source?: "gps" | "ip";
}

export const PROOF_OF_LOCATION_KEY_PREFIX = "paayh_proof_of_location_v1_";
export const MANUAL_LOCATION_PENDING_KEY = "paayh_manual_location_pending";

export function markWebManualLocationSelected(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MANUAL_LOCATION_PENDING_KEY, "true");
    window.dispatchEvent(new CustomEvent("paayh:manual_location_selected"));
  } catch {}
}

export function recordWebGpsProofVerified(
  email: string | null | undefined,
  coords: { country: string; state: string; location: string; latitude?: number; longitude?: number }
): void {
  if (typeof window === "undefined") return;
  try {
    const cleanEmail = (email || "").toLowerCase().trim();
    const payload = {
      verified: true,
      agreed: true,
      source: "gps",
      country: coords.country,
      state: coords.state,
      location: coords.location,
      latitude: coords.latitude,
      longitude: coords.longitude,
      verifiedAt: Date.now(),
    };
    if (cleanEmail) {
      localStorage.setItem(`${PROOF_OF_LOCATION_KEY_PREFIX}${cleanEmail}`, JSON.stringify(payload));
    }
    localStorage.setItem(`${PROOF_OF_LOCATION_KEY_PREFIX}active`, JSON.stringify(payload));
    localStorage.removeItem(MANUAL_LOCATION_PENDING_KEY);
  } catch {}
}

/**
 * Fast, permission-free IP-based geolocation fallback.
 * Uses BigDataCloud client-side IP lookup when browser GPS is blocked, denied, or unavailable.
 */
export async function detectIpLocation(): Promise<GpsLocationResult> {
  try {
    const res = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en");
    if (!res.ok) throw new Error("IP Geolocation service error");
    const data = await res.json();

    const rawCountry = data.countryName || "";
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

    if (matchedCountry) {
      return {
        country: matchedCountry,
        state: matchedState,
        location: matchedCity,
        rawAddress: data,
        source: "ip",
      };
    }
    throw new Error("Unable to determine region from IP");
  } catch (err: unknown) {
    return {
      country: "",
      state: "",
      location: "",
      error: (err as Error)?.message || "IP location detection failed.",
    };
  }
}

/**
 * Clean and normalize state/region names.
 * Removes common suffixes like "State", "Province", "Region", "Governorate", etc.
 */
export function normalizeStateName(rawState: string, country: string): string {
  if (!rawState) return "";
  const clean = rawState.replace(/\s+(State|Province|Region|Governorate|Department|District|Territory)$/i, "").trim();

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
  const clean = rawCity.trim();

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
 * If user denies permission or browser blocks GPS, seamlessly falls back to IP geolocation.
 */
export async function detectGpsLocation(): Promise<GpsLocationResult> {
  if (typeof window === "undefined") {
    return { country: "", state: "", location: "", error: "Geolocation requires browser environment." };
  }

  // If geolocation API is not supported, silently use IP geolocation
  if (!navigator.geolocation) {
    return detectIpLocation();
  }

  // Pre-check permission if Permissions API is available to avoid aggressive browser prompts if already denied
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (status.state === "denied") {
        // Permission was previously denied by user; immediately fall back to IP without prompting or failing
        const ipRes = await detectIpLocation();
        if (ipRes.country) return ipRes;
      }
    } catch {}
  }

  return new Promise((resolve) => {
    let resolved = false;

    // Fast 6s timeout safety guard that falls back to IP
    const timeoutTimer = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        const ipRes = await detectIpLocation();
        resolve(ipRes.country ? ipRes : { country: "", state: "", location: "", error: "Location request timed out. You may enter manually." });
      }
    }, 7000);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

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
            source: "gps",
          });
        } catch (err: unknown) {
          console.warn("GPS reverse geocoding failed, trying IP fallback...", err);
          const ipFallback = await detectIpLocation();
          resolve(ipFallback.country ? ipFallback : {
            country: "",
            state: "",
            location: "",
            error: "Unable to detect exact location. You may enter it manually.",
          });
        }
      },
      async (_geoError) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        // On ANY GPS denial or failure, seamlessly fall back to IP geolocation
        const ipRes = await detectIpLocation();
        if (ipRes.country) {
          resolve(ipRes);
        } else {
          resolve({
            country: "",
            state: "",
            location: "",
            error: "Location auto-detection unavailable. Please select your region below.",
          });
        }
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  });
}

/**
 * Strict Hardware/Browser GPS Authentication for Proof of Location Enforcement.
 * Does NOT fall back to IP geolocation. Requires explicit user GPS permission grant.
 */
export async function authenticateStrictGpsLocation(): Promise<GpsLocationResult> {
  if (typeof window === "undefined") {
    return { country: "", state: "", location: "", error: "Geolocation requires a browser environment." };
  }

  if (!navigator.geolocation) {
    return {
      country: "",
      state: "",
      location: "",
      error: "Your browser does not support GPS Geolocation. Please use a modern GPS-capable browser or device.",
    };
  }

  return new Promise((resolve) => {
    let resolved = false;

    const timeoutTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          country: "",
          state: "",
          location: "",
          error: "GPS signal timed out. Please ensure Location Services are enabled on your device and try again.",
        });
      }
    }, 12000);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
          );

          if (!res.ok) {
            throw new Error("Reverse geocoding service unavailable.");
          }

          const data = await res.json();
          const rawCountry = data.countryName || "";
          const matchedCountry =
            countryList.find((c) => c.toLowerCase() === rawCountry.toLowerCase()) || rawCountry;
          const rawState = data.principalSubdivision || data.localityInfo?.administrative?.[1]?.name || "";
          const matchedState = normalizeStateName(rawState, matchedCountry);

          const rawCity =
            data.city ||
            data.locality ||
            data.localityInfo?.locality?.[0]?.name ||
            data.localityInfo?.administrative?.[2]?.name ||
            "";
          const matchedCity = normalizeCityName(rawCity, matchedCountry, matchedState);

          if (!matchedCountry) {
            resolve({
              country: "",
              state: "",
              location: "",
              error: "Could not resolve your country from GPS coordinates. Please try again.",
            });
            return;
          }

          resolve({
            country: matchedCountry,
            state: matchedState,
            location: matchedCity || matchedState,
            latitude: lat,
            longitude: lon,
            rawAddress: data,
            source: "gps",
          });
        } catch (err: unknown) {
          resolve({
            country: "",
            state: "",
            location: "",
            error: (err as Error)?.message || "Failed to reverse-geocode GPS coordinates. Please try again.",
          });
        }
      },
      (geoError) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        const isDenied = geoError.code === geoError.PERMISSION_DENIED;
        resolve({
          country: "",
          state: "",
          location: "",
          permissionDenied: isDenied,
          error: isDenied
            ? "GPS location permission was denied. You must allow Location access in your browser site settings to complete Proof of Location and continue."
            : "Unable to acquire high-accuracy GPS position. Please enable Location Services on your device and try again.",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}
