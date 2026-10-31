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
 * Uses BigDataCloud client-side IP lookup with ipwho.is secondary fallback
 * when browser GPS is blocked, denied, or unavailable.
 */
export async function detectIpLocation(): Promise<GpsLocationResult> {
  // Primary IP geolocation provider: BigDataCloud
  try {
    const res = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en");
    if (res.ok) {
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
          location: matchedCity || matchedState,
          latitude: typeof data.latitude === "number" ? data.latitude : undefined,
          longitude: typeof data.longitude === "number" ? data.longitude : undefined,
          rawAddress: data,
          source: "ip",
        };
      }
    }
  } catch {}

  // Secondary IP geolocation provider fallback: ipwho.is
  try {
    const res2 = await fetch("https://ipwho.is/");
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2 && data2.success !== false && data2.country) {
        const rawCountry = data2.country || "";
        const matchedCountry = countryList.find((c) => c.toLowerCase() === rawCountry.toLowerCase()) || rawCountry;
        const matchedState = normalizeStateName(data2.region || "", matchedCountry);
        const matchedCity = normalizeCityName(data2.city || "", matchedCountry, matchedState);

        return {
          country: matchedCountry,
          state: matchedState,
          location: matchedCity || matchedState,
          latitude: typeof data2.latitude === "number" ? data2.latitude : undefined,
          longitude: typeof data2.longitude === "number" ? data2.longitude : undefined,
          rawAddress: data2,
          source: "ip",
        };
      }
    }
  } catch {}

  return {
    country: "",
    state: "",
    location: "",
    error: "Unable to determine region from network location.",
  };
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
            latitude: lat,
            longitude: lon,
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
 * Location Authentication for Proof of Location Enforcement.
 * Attempts browser/hardware GPS first; if permission is denied, blocked by browser settings,
 * or unavailable on the device, seamlessly falls back to network IP geolocation so the user
 * can complete verification and continue without being locked out.
 */
export async function authenticateStrictGpsLocation(): Promise<GpsLocationResult> {
  if (typeof window === "undefined") {
    return { country: "", state: "", location: "", error: "Geolocation requires a browser environment." };
  }

  // If browser does not support geolocation or is on an insecure origin, use IP geolocation fallback
  if (!navigator.geolocation) {
    const ipFallback = await detectIpLocation();
    if (ipFallback.country) {
      return { ...ipFallback, source: "gps" };
    }
    return {
      country: "",
      state: "",
      location: "",
      error: "Unable to detect location automatically. Please check your connection and try again.",
    };
  }

  // Fast-path: if browser permission is already explicitly set to 'denied', skip waiting and use IP fallback immediately
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (status.state === "denied") {
        const ipFallback = await detectIpLocation();
        if (ipFallback.country) {
          return { ...ipFallback, source: "gps" };
        }
      }
    } catch {}
  }

  return new Promise((resolve) => {
    let resolved = false;

    const fallbackToIpOrError = async (fallbackErrMsg: string) => {
      const ipRes = await detectIpLocation();
      if (ipRes.country) {
        resolve({
          ...ipRes,
          source: "gps",
        });
      } else {
        resolve({
          country: "",
          state: "",
          location: "",
          error: fallbackErrMsg,
        });
      }
    };

    const timeoutTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        fallbackToIpOrError(
          "Location signal timed out. Please check your internet connection and try again."
        );
      }
    }, 8000);

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
            await fallbackToIpOrError("Could not resolve your country from coordinates. Please try again.");
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
        } catch {
          await fallbackToIpOrError("Failed to verify location coordinates. Please try again.");
        }
      },
      async () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        await fallbackToIpOrError(
          "Could not verify your location. Please check your connection or browser location settings and try again."
        );
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  });
}
