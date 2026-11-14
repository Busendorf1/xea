"use client";

import { useEffect, useState } from "react";

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

export function useAdCapacityCheck(params: UseAdCapacityParams) {
  const [capacity, setCapacity] = useState<AdCapacityAssessment | null>(null);
  const [checkingCapacity, setCheckingCapacity] = useState(false);

  const payloadKey = JSON.stringify({
    impressions: Number(params.impressions || 0),
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
    if (!params.enabled || Number(params.impressions || 0) < 100) {
      setCapacity(null);
      setCheckingCapacity(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setCapacity(null);
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
          if (!cancelled) setCapacity(null);
          return;
        }
        const data = (await res.json()) as AdCapacityAssessment;
        if (!cancelled) {
          setCapacity(data);
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== "AbortError") {
          setCapacity(null);
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
  }, [params.enabled, params.impressions, payloadKey]);

  return { capacity, checkingCapacity };
}
