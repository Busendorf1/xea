"use client";

import { useCallback, useEffect, useState } from "react";

export interface AdCapacityAssessment {
  telemetryAvailable: boolean;
  allowed: boolean;
  status: "optimal" | "broadened_needed" | "capped" | "unavailable";
  requestedImpressions: number;
  maxOrderableImpressions: number;
  strictTierImpressions: number;
  broadeningApplied: boolean;
  message: string;
}

export interface UseAdCapacityParams {
  enabled: boolean;
  impressions: number;
  minImpressions?: number;
  campaignDays: number;
  userFrequencyCap: number;
  targetingAll?: boolean;
  country?: string | null;
  state?: string | null;
  province?: string | null;
  gender?: string | string[] | null;
  ageRange?: number[] | string[] | string | null;
  employmentStatus?: string | string[] | null;
  industry?: string[] | string | null;
  interest?: string[] | string | null;
  lifestyle?: string[] | string | null;
  behavior?: string[] | string | null;
  personality?: string[] | string | null;
}

function buildUnavailableAssessment(requestedImpressions: number, message: string): AdCapacityAssessment {
  return {
    telemetryAvailable: false,
    allowed: true,
    status: "unavailable",
    requestedImpressions,
    maxOrderableImpressions: 5_000_000,
    strictTierImpressions: 5_000_000,
    broadeningApplied: false,
    message,
  };
}

export function useAdCapacityCheck(params: UseAdCapacityParams) {
  const [capacity, setCapacity] = useState<AdCapacityAssessment | null>(null);
  const [checkingCapacity, setCheckingCapacity] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const retryCapacityCheck = useCallback(() => {
    setCapacity(null);
    setRetryTick((t) => t + 1);
  }, []);

  const minImpressions = Math.max(1, Math.floor(Number(params.minImpressions ?? 100)));
  const requestedImpressions = Math.max(0, Math.floor(Number(params.impressions || 0)));

  const payloadKey = JSON.stringify({
    impressions: requestedImpressions,
    campaignDays: Number(params.campaignDays || 1),
    userFrequencyCap: Number(params.userFrequencyCap || 1),
    targetingAll: Boolean(params.targetingAll),
    country: params.country || "",
    state: params.state || "",
    province: params.province || "",
    gender: params.gender || "",
    ageRange: params.ageRange || [18, 65],
    employmentStatus: params.employmentStatus || [],
    industry: params.industry || [],
    interest: params.interest || [],
    lifestyle: params.lifestyle || [],
    behavior: params.behavior || [],
    personality: params.personality || [],
  });

  useEffect(() => {
    if (!params.enabled || requestedImpressions < minImpressions) {
      setCapacity(null);
      setCheckingCapacity(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setCheckingCapacity(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/campaigns/capacity-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payloadKey,
          signal: controller.signal,
        });
        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 401 || res.status === 403) {
              setCapacity(
                buildUnavailableAssessment(
                  requestedImpressions,
                  "Session expired — sign in again to verify delivery capacity."
                )
              );
            } else if (res.status === 429) {
              setCapacity(
                buildUnavailableAssessment(
                  requestedImpressions,
                  "Too many capacity checks. Wait a moment and try again."
                )
              );
            } else {
              setCapacity(
                buildUnavailableAssessment(
                  requestedImpressions,
                  "Delivery capacity check unavailable right now. Server will verify on submit."
                )
              );
            }
          }
          return;
        }
        const data = (await res.json()) as AdCapacityAssessment;
        if (!cancelled) {
          setCapacity(data);
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== "AbortError") {
          setCapacity(
            buildUnavailableAssessment(
              requestedImpressions,
              "Delivery capacity check unavailable right now. Server will verify on submit."
            )
          );
        }
      } finally {
        if (!cancelled) {
          setCheckingCapacity(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [params.enabled, requestedImpressions, minImpressions, payloadKey, retryTick]);

  return { capacity, checkingCapacity, retryCapacityCheck };
}
