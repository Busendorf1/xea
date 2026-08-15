import { useState, useCallback, useEffect } from "react";

export interface ViewerProfileState {
  balance: number;
  mutual_count: number;
  mutuals: string[];
  monetized: boolean;
  suspended_until?: string | null;
  interest?: string[] | string | null;
}

export interface InitialProfileInput {
  balance?: number | string | null;
  mutual_count?: number | null;
  mutuals?: string[] | null;
  monetized?: boolean | string | null;
  monetized_until?: string | null;
  suspended_until?: string | null;
  interest?: string[] | string | null;
}

export function useViewerProfile(userEmail: string, initialProfile?: InitialProfileInput) {
  const [viewerProfile, setViewerProfile] = useState<ViewerProfileState | null>(() => {
    if (initialProfile) {
      return {
        balance: parseFloat(String(initialProfile.balance ?? 0)),
        mutual_count: initialProfile.mutual_count ?? 0,
        mutuals: Array.isArray(initialProfile.mutuals) ? initialProfile.mutuals : [],
        monetized:
          (initialProfile.monetized === "yes" ||
            initialProfile.monetized === "true" ||
            initialProfile.monetized === true) &&
          (!initialProfile.monetized_until ||
            new Date(initialProfile.monetized_until).getTime() > Date.now()),
        suspended_until: initialProfile.suspended_until || null,
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
        setViewerProfile({
          balance: parseFloat(String(data.balance ?? 0)),
          mutual_count: data.mutual_count ?? 0,
          mutuals: Array.isArray(data.mutuals) ? data.mutuals : [],
          monetized:
            (data.monetized === "yes" || data.monetized === "true" || data.monetized === true) &&
            (!data.monetized_until || new Date(data.monetized_until).getTime() > Date.now()),
          suspended_until: data.suspended_until || null,
          interest: data.interest || null,
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
    addMutual,
    suspendAccount,
  };
}
