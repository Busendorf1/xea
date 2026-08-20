import { useState, useCallback, useEffect } from "react";

export interface ViewerProfileState {
  balance: number;
  monetization_clicks: number;
  mutual_count: number;
  mutuals: string[];
  monetized: boolean;
  suspended_until?: string | null;
  cooldown_until?: string | null;
  cooldown_type?: "pacing_15m" | "review_hours" | null;
  interest?: string[] | string | null;
}

export interface InitialProfileInput {
  balance?: number | string | null;
  monetization_clicks?: number | null;
  mutual_count?: number | null;
  mutuals?: string[] | null;
  monetized?: boolean | string | null;
  monetized_until?: string | null;
  suspended_until?: string | null;
  cooldown_until?: string | null;
  cooldown_type?: "pacing_15m" | "review_hours" | null;
  interest?: string[] | string | null;
}

export function useViewerProfile(userEmail: string, initialProfile?: InitialProfileInput) {
  const [viewerProfile, setViewerProfile] = useState<ViewerProfileState | null>(() => {
    if (initialProfile) {
      const clicks = initialProfile.monetization_clicks ?? 0;
      return {
        balance: parseFloat(String(initialProfile.balance ?? 0)),
        monetization_clicks: clicks,
        mutual_count: initialProfile.mutual_count ?? 0,
        mutuals: Array.isArray(initialProfile.mutuals) ? initialProfile.mutuals : [],
        monetized:
          ((initialProfile.monetized === "yes" ||
            initialProfile.monetized === "true" ||
            initialProfile.monetized === true ||
            clicks >= 300)) &&
          (!initialProfile.monetized_until ||
            new Date(initialProfile.monetized_until).getTime() > Date.now()),
        suspended_until: initialProfile.suspended_until || null,
        cooldown_until: initialProfile.cooldown_until || null,
        cooldown_type: initialProfile.cooldown_type || null,
        interest: initialProfile.interest || null,
      };
    }
    return null;
  });

  const fetchViewerProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setViewerProfile((prev) => {
          const currentClicks = prev?.monetization_clicks ?? 0;
          const currentBalance = prev?.balance ?? 0;
          const currentMutualCount = prev?.mutual_count ?? 0;
          const clicks = Math.max(currentClicks, Number(data.monetization_clicks) || 0);
          const balance = Math.max(currentBalance, Number(data.balance) || 0);
          const mutualCount = Math.max(currentMutualCount, Number(data.mutual_count) || 0);
          const isMonetized =
            ((data.monetized === "yes" || data.monetized === "true" || data.monetized === true || clicks >= 300)) &&
            (!data.monetized_until || new Date(data.monetized_until).getTime() > Date.now());

          return {
            balance,
            monetization_clicks: clicks,
            mutual_count: mutualCount,
            mutuals: Array.isArray(data.mutuals) ? data.mutuals : (prev?.mutuals || []),
            monetized: isMonetized,
            suspended_until: data.suspended_until || null,
            cooldown_until: data.cooldown_until || null,
            cooldown_type: data.cooldown_type || null,
            interest: data.interest || null,
          };
        });
      }
    } catch (e) {
      console.error("❌ useViewerProfile error:", e);
    }
  }, []);

  useEffect(() => {
    if (userEmail && !viewerProfile) {
      fetchViewerProfile();
    }
  }, [userEmail, viewerProfile, fetchViewerProfile]);

  const updateBalance = useCallback((amountDelta: number) => {
    setViewerProfile((prev) => (prev ? { ...prev, balance: prev.balance + amountDelta } : null));
  }, []);

  const incrementClicks = useCallback((delta = 1) => {
    setViewerProfile((prev) => {
      if (!prev) return null;
      const nextClicks = (prev.monetization_clicks || 0) + delta;
      const isNowMonetized = nextClicks >= 300 ? true : prev.monetized;
      return {
        ...prev,
        monetization_clicks: nextClicks,
        monetized: isNowMonetized,
      };
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("xea:click-increment", { detail: { delta } }));
    }
  }, []);

  const addMutual = useCallback((targetEmail: string) => {
    setViewerProfile((prev) => {
      if (!prev) return null;
      const current = prev.mutuals || [];
      if (!current.map((m) => m.toLowerCase()).includes(targetEmail.toLowerCase())) {
        const updated = [...current, targetEmail];
        return { ...prev, mutuals: updated, mutual_count: updated.length };
      }
      return prev;
    });
  }, []);

  const suspendAccount = useCallback((hours = 2) => {
    setViewerProfile((prev) =>
      prev
        ? {
            ...prev,
            suspended_until: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
          }
        : null
    );
  }, []);

  return {
    viewerProfile,
    setViewerProfile,
    fetchViewerProfile,
    updateBalance,
    incrementClicks,
    addMutual,
    suspendAccount,
  };
}
