import { useState, useRef, useCallback } from "react";
import { Ad } from "@/components/ui/AdCard";
import { ViewerProfileState } from "./useViewerProfile";

interface UseFeedActionsProps {
  userEmail: string;
  viewerProfile: ViewerProfileState | null;
  setViewerProfile?: React.Dispatch<React.SetStateAction<ViewerProfileState | null>>;
  updateBalance: (delta: number) => void;
  addMutual: (targetEmail: string) => void;
  suspendAccount: (hours?: number) => void;
  onEarnSuccess?: (earnedAmount?: number) => void;
  onMutualSuccess?: () => void;
}

export function useFeedActions({
  userEmail,
  viewerProfile,
  setViewerProfile,
  updateBalance,
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
      if (ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase()) {
        alert("This is your own ad. Seen action is disabled.");
        return false;
      }
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);
      setSeenAds((prev) => [...prev, ad.id]);

      try {
        const response = await fetch("/api/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adId: ad.id }),
        });
        if (!response.ok) throw new Error("Failed to record ad seen via API");
        return true;
      } catch (e) {
        console.error("❌ Error recording ad seen via queue API:", e);
        return false;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [userEmail]
  );

  // Claim Earn reward
  const handleAdEarn = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id) return false;
      if (ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase()) {
        alert("This is your own ad. Earning is disabled.");
        return false;
      }
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);

      const expectedRate = ad.cost_per_impression && ad.cost_per_impression > 0 ? ad.cost_per_impression : 25;

      // 1. INSTANT OPTIMISTIC UI: Trigger balance & counter update immediately (0ms delay)
      updateBalance(expectedRate);
      onEarnSuccess?.(expectedRate);
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
          const errData = await response.json();
          // Rollback on server error
          updateBalance(-expectedRate);
          onEarnSuccess?.(-expectedRate);
          throw new Error(errData.error || "Failed to claim earnings");
        }

        const resData = await response.json();

        // Handle Active Earning Cooldown (Pacing 15m or Review 48h)
        if (resData.code === "COOLDOWN_ACTIVE") {
          updateBalance(-expectedRate);
          onEarnSuccess?.(-expectedRate);
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
          updateBalance(-expectedRate);
          onEarnSuccess?.(-expectedRate);
          suspendAccount(2);
          return false;
        }

        // If returned rate differed from optimistic rate, reconcile difference
        if (rate !== expectedRate && rate > 0) {
          const diff = rate - expectedRate;
          updateBalance(diff);
          onEarnSuccess?.(diff);
        }

        return true;
      } catch (e: unknown) {
        console.error("❌ Unexpected error in handleAdEarn:", e);
        return false;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [userEmail, updateBalance, suspendAccount, onEarnSuccess, setViewerProfile]
  );

  // Add Mutual
  const handleAdMutual = useCallback(
    async (ad: Ad): Promise<boolean> => {
      if (!ad || !ad.id || !ad.user_email) return false;
      const publisherEmail = ad.user_email.toLowerCase();

      if (publisherEmail === userEmail.toLowerCase()) {
        alert("This is your own ad. You cannot add yourself to mutuals.");
        return false;
      }
      if (viewerProfile && viewerProfile.mutual_count >= 50) {
        alert("⚠️ Mutual Limit Reached\nYou have reached the maximum limit of 50 mutuals.");
        return false;
      }
      if (processingRef.current.has(ad.id)) return false;
      processingRef.current.add(ad.id);
      setProcessingAds((prev) => [...prev, ad.id]);

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
          const errData = await response.json();
          throw new Error(errData.error || "Failed to add mutual");
        }

        const resData = await response.json();
        const mutualResult = resData.result !== undefined ? resData.result : 1;

        if (mutualResult === -1 || mutualResult === -2) {
          alert("Clicking suspended: You are clicking too fast! Clicking is suspended for 2 hours.");
          suspendAccount(2);
          return false;
        }

        setSeenAds((prev) => [...prev, ad.id]);

        if (mutualResult === 1) {
          addMutual(publisherEmail);
        }
        onMutualSuccess?.();
        return true;
      } catch (e: unknown) {
        console.error("❌ Unexpected error in handleAdMutual:", e);
        alert((e as Error).message || "An unexpected error occurred. Please try again.");
        return false;
      } finally {
        processingRef.current.delete(ad.id);
        setProcessingAds((prev) => prev.filter((id) => id !== ad.id));
      }
    },
    [userEmail, viewerProfile, addMutual, suspendAccount, onMutualSuccess]
  );

  // Ad Sharing
  const handleShare = useCallback((adId: string) => {
    if (typeof window !== "undefined") {
      const encodedId = btoa(adId.toString());
      const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => alert("Ad share link copied to clipboard."))
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
