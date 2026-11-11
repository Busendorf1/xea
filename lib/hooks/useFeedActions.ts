import { useState, useRef, useCallback } from "react";
import { Ad } from "@/components/ui/AdCard";
import { ViewerProfileState } from "./useViewerProfile";
import { KinematicVector } from "@/lib/security/kinematicsEvaluator";
import { computeAtwTierDetails } from "@/lib/attentionTierEngine";
import { isExemptFromBarriersAndInactivity } from "@/lib/adminHelper";

export interface InteractionData {
  telemetry?: KinematicVector[];
  turnstileToken?: string;
  bonusSeconds?: number;
  focusDurationSeconds?: number;
}

interface UseFeedActionsProps {
  userEmail: string;
  viewerProfile: ViewerProfileState | null;
  setViewerProfile?: React.Dispatch<React.SetStateAction<ViewerProfileState | null>>;
  updateBalance: (delta: number) => void;
  incrementClicks?: (delta?: number) => void;
  addMutual: (targetEmail: string) => void;
  suspendAccount: (hours?: number) => void;
  onEarnSuccess?: (earnedAmount?: number, newBalance?: number, newClicks?: number) => void;
  onMutualSuccess?: () => void;
}

export function useFeedActions({
  userEmail,
  viewerProfile,
  setViewerProfile,
  updateBalance,
  incrementClicks,
  addMutual,
  suspendAccount,
  onEarnSuccess,
  onMutualSuccess,
}: UseFeedActionsProps) {
  const [seenAds, setSeenAds] = useState<string[]>([]);
  const [processingAds, setProcessingAds] = useState<string[]>([]);
  const processingRef = useRef<Set<string>>(new Set());

  // Record Seen click
  const handleAdSeen = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id) return false;
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);
      setSeenAds((prev) => [...prev, ad.id]);
      const isPlatform = Boolean(
        ad.is_admin_post ||
        !ad.cost_per_impression ||
        Number(ad.cost_per_impression) <= 0 ||
        !ad.impressions ||
        Number(ad.impressions) <= 0
      );
      if (!isPlatform) {
        incrementClicks?.(1);
      }

      try {
        const response = await fetch("/api/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adId: ad.id,
            token: ad.verification_token || (ad as any)._token,
            servedAt: ad.served_at || (ad as any)._served_at,
          }),
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 429) {
            return true;
          }
          console.warn("⚠️ Non-critical status recording ad seen:", response.status);
          return true;
        }

        try {
          const data = await response.json();
          if (data && typeof data.clicksCount === "number") {
            const isNowMonetized = Boolean(data.isMonetized || data.clicksCount >= 300);

            if (setViewerProfile) {
              setViewerProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      monetization_clicks: data.clicksCount,
                      monetized: isNowMonetized || prev.monetized,
                    }
                  : null
              );
            }

            try {
              const existing = localStorage.getItem("paayh_monetize_cache_v2");
              const parsed = existing ? JSON.parse(existing) : {};
              const isExempt = isExemptFromBarriersAndInactivity(userEmail);
              const details = computeAtwTierDetails(data.clicksCount, data.atwTier || parsed.atwTier, isExempt);
              const updatedCache = {
                ...parsed,
                email: userEmail ? userEmail.toLowerCase() : parsed.email,
                clicksCount: data.clicksCount,
                clicksRemaining: details.clicksRemaining,
                isMonetized: isNowMonetized || isExempt,
                atwTier: details.tierCode,
              };
              const serialized = JSON.stringify(updatedCache);
              localStorage.setItem("paayh_monetize_cache_v2", serialized);
              sessionStorage.setItem("paayh_monetize_cache_v2", serialized);
            } catch {}

            if (typeof window !== "undefined") {
              const isExempt = isExemptFromBarriersAndInactivity(userEmail);
              const details = computeAtwTierDetails(data.clicksCount, data.atwTier, isExempt);
              window.dispatchEvent(
                new CustomEvent("xea:click-increment", {
                  detail: {
                    delta: 1,
                    totalClicks: data.clicksCount,
                    isMonetized: isNowMonetized || isExempt,
                    atwTier: details.tierCode,
                  },
                })
              );
            }
          }
        } catch {}

        return true;
      } catch (e) {
        console.warn("⚠️ Non-critical error recording ad seen:", e);
        return true;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [incrementClicks, setViewerProfile]
  );

  // Claim Earn reward
  const handleAdEarn = useCallback(
    async (ad: Ad, interactionData?: InteractionData): Promise<boolean> => {
      if (!ad || !ad.id) return false;
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);

      const rawCpi = ad.cost_per_impression && Number(ad.cost_per_impression) > 0 ? Number(ad.cost_per_impression) : 25;
      const bonusSecs = Math.min(16, Math.max(0, interactionData?.bonusSeconds ?? 0));
      const shareRate = 0.30 + (bonusSecs / 16.0) * 0.20;
      const expectedRate = Math.round(rawCpi * shareRate * 100) / 100;

      // 1. INSTANT OPTIMISTIC UI: Only monetized users receive balance increment
      const isExempt = isExemptFromBarriersAndInactivity(userEmail);
      const isMonetized = Boolean(isExempt || viewerProfile?.monetized === true || (viewerProfile?.monetization_clicks || 0) >= 300);
      const effectiveRate = isMonetized ? expectedRate : 0;

      if (effectiveRate > 0) {
        updateBalance(effectiveRate);
        onEarnSuccess?.(effectiveRate);
      }
      incrementClicks?.(1);
      setSeenAds((prev) => [...prev, ad.id]);

      try {
        const response = await fetch("/api/earn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adId: ad.id,
            token: ad.verification_token || (ad as any)._token,
            servedAt: ad.served_at || (ad as any)._served_at,
            type: "earn",
            telemetry: interactionData?.telemetry || [],
            turnstileToken: interactionData?.turnstileToken || undefined,
            bonusSeconds: bonusSecs,
            focusDurationSeconds: 16 + bonusSecs,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error("❌ Earn API rejected claim:", response.status, errData);
          if (effectiveRate > 0) {
            updateBalance(-effectiveRate);
            onEarnSuccess?.(-effectiveRate);
          }
          if (errData?.code === "ALREADY_EARNED" || (errData?.error && String(errData.error).includes("already been claimed"))) {
            setSeenAds((prev) => (prev.includes(ad.id) ? prev : [...prev, ad.id]));
            return false;
          }
          if (errData?.code === "COOLDOWN_ACTIVE" || errData?.code === "USER_SUSPENDED") {
            setSeenAds((prev) => prev.filter((id) => id !== ad.id));
            if (setViewerProfile) {
              const fallbackUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
              setViewerProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      cooldown_until: errData.cooldownUntil || prev.suspended_until || fallbackUntil,
                      cooldown_type: errData.cooldownType || (errData.code === "USER_SUSPENDED" ? "review_hours" : "pacing_15m"),
                    }
                  : null
              );
            }
            return false;
          }
          if (errData?.code === "POH_RETRY") {
            setSeenAds((prev) => prev.filter((id) => id !== ad.id));
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("xea:toast", {
                  detail: {
                    message: "Verification incomplete. Please retry or listen again.",
                    type: "warning",
                  },
                })
              );
            }
            return false;
          }
          setSeenAds((prev) => prev.filter((id) => id !== ad.id));
          return false;
        }

        const resData = await response.json();

        if (resData.code === "COOLDOWN_ACTIVE") {
          setSeenAds((prev) => prev.filter((id) => id !== ad.id));
          if (effectiveRate > 0) {
            updateBalance(-effectiveRate);
            onEarnSuccess?.(-effectiveRate);
          }
          if (setViewerProfile) {
            setViewerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    cooldown_until: resData.cooldownUntil,
                    cooldown_type: resData.cooldownType || "pacing_15m",
                  }
                : null
            );
          }
          return false;
        }

        const rate =
          resData.result !== undefined
            ? parseFloat(String(resData.result ?? 0))
            : expectedRate;

        if (rate === -1 || rate === -2) {
          if (effectiveRate > 0) {
            updateBalance(-effectiveRate);
            onEarnSuccess?.(-effectiveRate);
          }
          suspendAccount(2);
          return false;
        }

        if (rate !== expectedRate) {
          const diff = isMonetized ? rate - expectedRate : 0;
          if (diff !== 0) {
            updateBalance(diff);
            onEarnSuccess?.(diff);
          }
        }

        if (typeof resData.balance === "number" && !isNaN(resData.balance)) {
          const authBal = resData.balance;
          const authClicks = typeof resData.clicks === "number" ? resData.clicks : undefined;

          if (setViewerProfile) {
            setViewerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    balance: authBal,
                    monetization_clicks: typeof authClicks === "number" ? authClicks : prev.monetization_clicks,
                    monetized: (typeof authClicks === "number" && authClicks >= 300) || prev.monetized,
                  }
                : null
            );
          }

          // Authoritative sync to DashboardClient user state and live balance listeners
          onEarnSuccess?.(undefined, authBal, authClicks);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("xea:live-balance-sync", {
                detail: { newBalance: authBal, clicks: authClicks },
              })
            );
          }

          if (typeof window !== "undefined") {
            if (typeof authClicks === "number") {
              const isExempt = isExemptFromBarriersAndInactivity(userEmail);
              const details = computeAtwTierDetails(authClicks, resData.atwTier, isExempt);
              try {
                const existing = localStorage.getItem("paayh_monetize_cache_v2");
                const parsed = existing ? JSON.parse(existing) : {};
                const updatedCache = {
                  ...parsed,
                  email: userEmail ? userEmail.toLowerCase() : parsed.email,
                  clicksCount: authClicks,
                  clicksRemaining: details.clicksRemaining,
                  isMonetized: isExempt || authClicks >= 300 || Boolean(parsed.isMonetized),
                  atwTier: details.tierCode,
                };
                const serialized = JSON.stringify(updatedCache);
                localStorage.setItem("paayh_monetize_cache_v2", serialized);
                sessionStorage.setItem("paayh_monetize_cache_v2", serialized);
              } catch {}

              window.dispatchEvent(
                new CustomEvent("xea:click-increment", {
                  detail: {
                    delta: 1,
                    totalClicks: authClicks,
                    isMonetized: isExempt || authClicks >= 300,
                    atwTier: details.tierCode,
                  },
                })
              );
            }

            window.dispatchEvent(
              new CustomEvent("xea:live-balance-sync", {
                detail: { newBalance: authBal, clicks: authClicks, earnedAmount: rate },
              })
            );
          }

          onEarnSuccess?.(rate, authBal, authClicks);
        }

        return true;
      } catch (e: unknown) {
        if (expectedRate > 0) {
          updateBalance(-expectedRate);
          onEarnSuccess?.(-expectedRate);
        }
        console.error("❌ Unexpected error in handleAdEarn:", e);
        return false;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [updateBalance, incrementClicks, suspendAccount, onEarnSuccess, setViewerProfile]
  );

  // Add Mutual (Real-time optimistic addition + server sync)
  const handleAdMutual = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id) return false;
      const publisherEmail = String(ad.user_email || ad.custom_sponsor_handle || "").toLowerCase().trim();

      if (viewerProfile && viewerProfile.mutual_count >= 50) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Mutual limit reached (50 max)" } }));
        }
        return false;
      }
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);

      // Optimistic 0ms mutual + click increment
      if (publisherEmail) {
        addMutual(publisherEmail);
      }
      incrementClicks?.(1);
      setSeenAds((prev) => [...prev, ad.id]);

      try {
        const response = await fetch("/api/earn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adId: ad.id,
            token: ad.verification_token || (ad as any)._token,
            servedAt: ad.served_at || (ad as any)._served_at,
            type: "mutual",
            turnstileToken: "no-turnstile-script",
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 401) {
            console.warn("⚠️ Session expired or unauthorized in handleAdMutual");
            return false;
          }
          if (errData?.code === "COOLDOWN_ACTIVE" && setViewerProfile) {
            setViewerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    cooldown_until: errData.cooldownUntil,
                    cooldown_type: errData.cooldownType || "pacing_15m",
                  }
                : null
            );
          }
          throw new Error(errData?.error || "Failed to add mutual");
        }

        const resData = await response.json();
        if (resData.code === "COOLDOWN_ACTIVE") {
          if (setViewerProfile) {
            setViewerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    cooldown_until: resData.cooldownUntil,
                    cooldown_type: resData.cooldownType || "pacing_15m",
                  }
                : null
            );
          }
          return false;
        }
        const mutualResult = resData.result !== undefined ? resData.result : 1;

        if (mutualResult === -1 || mutualResult === -2) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Clicking suspended: Rate limit reached" } }));
          }
          suspendAccount(2);
          return false;
        }

        if (typeof resData.clicks === "number" && typeof window !== "undefined") {
          const authClicks = resData.clicks;
          const isExempt = isExemptFromBarriersAndInactivity(userEmail);
          const details = computeAtwTierDetails(authClicks, resData.atwTier, isExempt);
          try {
            const existing = localStorage.getItem("paayh_monetize_cache_v2");
            const parsed = existing ? JSON.parse(existing) : {};
            const updatedCache = {
              ...parsed,
              email: userEmail ? userEmail.toLowerCase() : parsed.email,
              clicksCount: authClicks,
              clicksRemaining: details.clicksRemaining,
              isMonetized: isExempt || authClicks >= 300 || Boolean(parsed.isMonetized),
              atwTier: details.tierCode,
            };
            const serialized = JSON.stringify(updatedCache);
            localStorage.setItem("paayh_monetize_cache_v2", serialized);
            sessionStorage.setItem("paayh_monetize_cache_v2", serialized);
          } catch {}

          window.dispatchEvent(
            new CustomEvent("xea:click-increment", {
              detail: {
                delta: 1,
                totalClicks: authClicks,
                isMonetized: isExempt || authClicks >= 300,
                atwTier: details.tierCode,
              },
            })
          );
        }

        onMutualSuccess?.();
        return true;
      } catch (e: unknown) {
        console.error("❌ Unexpected error in handleAdMutual:", e);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: (e as Error).message || "Action failed" } }));
        }
        return false;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [viewerProfile, addMutual, incrementClicks, suspendAccount, onMutualSuccess, setViewerProfile]
  );

  // Ad Sharing
  const handleShare = useCallback((adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Link copied to clipboard" } }));
        })
        .catch((err) => console.error("❌ Failed to copy link:", err));
    }
  }, []);

  return {
    seenAds,
    setSeenAds,
    processingAds,
    handleAdSeen,
    handleAdEarn,
    handleAdMutual,
    handleShare,
  };
}
