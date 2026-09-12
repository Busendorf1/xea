import { useState, useRef, useCallback } from "react";
import { Ad } from "@/components/ui/AdCard";
import { ViewerProfileState } from "./useViewerProfile";

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
      const isOwner = Boolean(userEmail && ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase());
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
      if (!isPlatform && !isOwner) {
        incrementClicks?.(1);
      }

      try {
        const response = await fetch("/api/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adId: ad.id }),
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 429) {
            return true;
          }
          console.warn("⚠️ Non-critical status recording ad seen:", response.status);
          return true;
        }
        return true;
      } catch (e) {
        console.warn("⚠️ Non-critical error recording ad seen:", e);
        return true;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [userEmail, incrementClicks]
  );

  // Claim Earn reward
  const handleAdEarn = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id) return false;
      if (ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase()) {
        return false;
      }
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);

      const rawCpi = ad.cost_per_impression && Number(ad.cost_per_impression) > 0 ? Number(ad.cost_per_impression) : 25;
      const expectedRate = Math.round(rawCpi * 0.60 * 100) / 100;

      console.log(`🟢 [EARN CLICKED] Ad: ${ad.id}, Base CPI: ₦${rawCpi}, crediting 60% (₦${expectedRate}) immediately to balance...`);

      // 1. INSTANT OPTIMISTIC UI: Trigger balance & click progress update immediately (0ms delay)
      if (expectedRate > 0) {
        updateBalance(expectedRate);
        onEarnSuccess?.(expectedRate);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("xea:live-balance-sync", {
              detail: { delta: expectedRate, earnedAmount: expectedRate },
            })
          );
          window.dispatchEvent(
            new CustomEvent("xea:live-balance-earned", {
              detail: { delta: expectedRate, earnedAmount: expectedRate },
            })
          );
        }
      }
      incrementClicks?.(1);
      setSeenAds((prev) => [...prev, ad.id]);

      try {
        const response = await fetch("/api/earn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adId: ad.id,
            token: ad.verification_token,
            servedAt: ad.served_at,
            type: "earn",
            turnstileToken: "no-turnstile-script",
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error("❌ Earn API rejected claim:", response.status, errData);
          // Rollback on server error
          if (expectedRate > 0) {
            updateBalance(-expectedRate);
            onEarnSuccess?.(-expectedRate);
          }
          if (errData?.code === "ALREADY_EARNED" || (errData?.error && String(errData.error).includes("already been claimed"))) {
            setSeenAds((prev) => (prev.includes(ad.id) ? prev : [...prev, ad.id]));
            return false;
          }
          return false;
        }

        const resData = await response.json();

        // Handle Active Earning Cooldown (Pacing 15m or Review 48h)
        if (resData.code === "COOLDOWN_ACTIVE") {
          if (expectedRate > 0) {
            updateBalance(-expectedRate);
            onEarnSuccess?.(-expectedRate);
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

        // Legacy suspension handling
        if (rate === -1 || rate === -2) {
          if (expectedRate > 0) {
            updateBalance(-expectedRate);
            onEarnSuccess?.(-expectedRate);
          }
          suspendAccount(2);
          return false;
        }

        // If returned rate differed from optimistic rate, reconcile difference
        if (rate !== expectedRate) {
          const diff = rate - expectedRate;
          updateBalance(diff);
          onEarnSuccess?.(diff);
        }

        // Sync with authoritative balance and clicks from server response
        if (typeof resData.balance === "number" && !isNaN(resData.balance)) {
          const authBal = resData.balance;
          const authClicks = typeof resData.clicks === "number" ? resData.clicks : undefined;

          if (setViewerProfile) {
            setViewerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    balance: authBal,
                    monetization_clicks: typeof authClicks === "number" ? Math.max(prev.monetization_clicks, authClicks) : prev.monetization_clicks,
                    monetized: (typeof authClicks === "number" && authClicks >= 300) || prev.monetized,
                  }
                : null
            );
          }

          if (typeof window !== "undefined") {
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
    [userEmail, viewerProfile, updateBalance, incrementClicks, suspendAccount, onEarnSuccess, setViewerProfile]
  );

  // Add Mutual
  const handleAdMutual = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id || !ad.user_email) return false;
      const publisherEmail = ad.user_email.toLowerCase();

      if (publisherEmail === userEmail.toLowerCase()) {
        return false;
      }
      if (viewerProfile && viewerProfile.mutual_count >= 50) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Mutual limit reached (50 max)" } }));
        }
        return false;
      }
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);
      incrementClicks?.(1);
      setSeenAds((prev) => [...prev, ad.id]);

      try {
        const response = await fetch("/api/earn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adId: ad.id,
            token: ad.verification_token,
            servedAt: ad.served_at,
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
          throw new Error(errData?.error || "Failed to add mutual");
        }

        const resData = await response.json();
        const mutualResult = resData.result !== undefined ? resData.result : 1;

        if (mutualResult === -1 || mutualResult === -2) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: "Clicking suspended: Rate limit reached" } }));
          }
          suspendAccount(2);
          return false;
        }

        if (mutualResult === 1) {
          addMutual(publisherEmail);
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
    [userEmail, viewerProfile, addMutual, incrementClicks, suspendAccount, onMutualSuccess]
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
