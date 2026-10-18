"use client";

import { useEffect, useRef } from "react";
import { detectGpsLocation } from "@/lib/utils/locationHelper";

interface UseLocationRecalibrationOptions {
  userCountry?: string;
  userState?: string;
  userLocation?: string;
  enabled?: boolean;
}

export function useLocationRecalibration({
  userCountry,
  userState,
  userLocation,
  enabled = true,
}: UseLocationRecalibrationOptions = {}) {
  const isExecutingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const lastCheckStr = localStorage.getItem("paayh_last_geo_recalibrate");
    const lastCheckTime = lastCheckStr ? Number(lastCheckStr) : 0;
    const now = Date.now();

    // Enforce once-a-day execution: skip if checked within last 24 hours
    if (now - lastCheckTime < TWENTY_FOUR_HOURS_MS || isExecutingRef.current) return;

    isExecutingRef.current = true;

    const recalibrate = async () => {
      try {
        // Defer 5 seconds so initial feed, animations, and critical assets load with 0 network contention
        await new Promise((r) => setTimeout(r, 5000));

        const res = await detectGpsLocation();
        localStorage.setItem("paayh_last_geo_recalibrate", String(Date.now()));

        if (!res.country) return;

        const normCurrentCountry = (userCountry || "").trim().toLowerCase();
        const normCurrentState = (userState || "").trim().toLowerCase();
        const normCurrentLoc = (userLocation || "").trim().toLowerCase();

        const normDetectedCountry = (res.country || "").trim().toLowerCase();
        const normDetectedState = (res.state || "").trim().toLowerCase();
        const normDetectedLoc = (res.location || "").trim().toLowerCase();

        // Check if there is any difference between current and detected location
        const hasChanged =
          normCurrentCountry !== normDetectedCountry ||
          normCurrentState !== normDetectedState ||
          (normDetectedLoc && normCurrentLoc !== normDetectedLoc);

        if (hasChanged) {
          const apiRes = await fetch("/api/user/recalibrate-location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              country: res.country,
              state: res.state,
              location: res.location,
              source: res.source || "gps",
            }),
          });

          if (apiRes.ok) {
            const data = await apiRes.json();
            if (data.updated) {
              window.dispatchEvent(
                new CustomEvent("paayh:location_recalibrated", {
                  detail: data,
                })
              );
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ [LocationRecalibration] Background check notice:", err);
      } finally {
        isExecutingRef.current = false;
      }
    };

    recalibrate();
  }, [userCountry, userState, userLocation, enabled]);
}
