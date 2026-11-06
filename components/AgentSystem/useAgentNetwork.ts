"use client";

import { useState, useEffect, useCallback } from "react";
import type { AgentNetworkPayload } from "@/lib/agentSystem";

export type OptOutActionType =
  | "request"
  | "cancel_request"
  | "accept"
  | "reject"
  | "agent_request"
  | "agent_cancel"
  | "referee_accept"
  | "referee_reject"
  | "force";

export const EMPTY_NETWORK: AgentNetworkPayload = {
  isAgent: false,
  agentRegisteredAt: null,
  referralCode: "",
  totalAgentEarned: 0,
  invitesCount: 0,
  uplineAgentsCount: 0,
  mutualsCount: 0,
  pendingOptOutRequestsCount: 0,
  invites: [],
  uplineAgent: null,
  mutuals: [],
};

export function formatCompactCount(count: number): string {
  if (!count || count < 1000) return String(count || 0);
  if (count >= 1_000_000) {
    const val = (count / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${val}M`;
  }
  const val = (count / 1_000).toFixed(1).replace(/\.0$/, "");
  return `${val}K`;
}

let cachedNetworkData: AgentNetworkPayload | null = null;
let cachedAt = 0;
let inflightFetch: Promise<AgentNetworkPayload | null> | null = null;
const CACHE_TTL_MS = 20000;

function applyOptimisticTransform(
  snapshot: AgentNetworkPayload,
  optOutAction: OptOutActionType,
  cleanRef: string
): AgentNetworkPayload {
  if (optOutAction === "accept" && cleanRef) {
    const remaining = snapshot.invites.filter((i) => i.refereeKey !== cleanRef);
    return {
      ...snapshot,
      invites: remaining,
      invitesCount: Math.max(0, snapshot.invitesCount - 1),
      pendingOptOutRequestsCount: Math.max(0, snapshot.pendingOptOutRequestsCount - 1),
    };
  }
  if (optOutAction === "reject" && cleanRef) {
    return {
      ...snapshot,
      invites: snapshot.invites.map((i) =>
        i.refereeKey === cleanRef ? { ...i, optOutStatus: "rejected" } : i
      ),
      pendingOptOutRequestsCount: Math.max(0, snapshot.pendingOptOutRequestsCount - 1),
    };
  }
  if (optOutAction === "agent_request" && cleanRef) {
    return {
      ...snapshot,
      invites: snapshot.invites.map((i) =>
        i.refereeKey === cleanRef ? { ...i, optOutStatus: "agent_requested" } : i
      ),
    };
  }
  if (optOutAction === "agent_cancel" && cleanRef) {
    return {
      ...snapshot,
      invites: snapshot.invites.map((i) =>
        i.refereeKey === cleanRef ? { ...i, optOutStatus: "none" } : i
      ),
    };
  }
  if (optOutAction === "request" && snapshot.uplineAgent) {
    return {
      ...snapshot,
      uplineAgent: {
        ...snapshot.uplineAgent,
        optOutStatus: "requested",
      },
    };
  }
  if (optOutAction === "cancel_request" && snapshot.uplineAgent) {
    return {
      ...snapshot,
      uplineAgent: {
        ...snapshot.uplineAgent,
        optOutStatus: "none",
      },
    };
  }
  if (optOutAction === "referee_accept") {
    return {
      ...snapshot,
      uplineAgent: null,
      uplineAgentsCount: 0,
      pendingOptOutRequestsCount: Math.max(0, snapshot.pendingOptOutRequestsCount - 1),
    };
  }
  if (optOutAction === "referee_reject" && snapshot.uplineAgent) {
    return {
      ...snapshot,
      uplineAgent: {
        ...snapshot.uplineAgent,
        optOutStatus: "none",
      },
      pendingOptOutRequestsCount: Math.max(0, snapshot.pendingOptOutRequestsCount - 1),
    };
  }
  if (optOutAction === "force") {
    return {
      ...snapshot,
      isAgent: false,
      agentRegisteredAt: null,
      invites: [],
      invitesCount: 0,
      uplineAgent: null,
      uplineAgentsCount: 0,
      pendingOptOutRequestsCount: 0,
    };
  }
  return snapshot;
}

export function useAgentNetwork() {
  const [data, setData] = useState<AgentNetworkPayload>(() => cachedNetworkData || EMPTY_NETWORK);
  const [loading, setLoading] = useState<boolean>(() => !cachedNetworkData);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const broadcastUpdate = useCallback((nextData: AgentNetworkPayload) => {
    cachedNetworkData = nextData;
    cachedAt = Date.now();
    setData(nextData);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("paayh:agent_network_loaded", { detail: nextData }));
    }
  }, []);

  const refreshNetwork = useCallback(
    async (force = false) => {
      const now = Date.now();
      const hasPendingRef =
        typeof window !== "undefined" && Boolean(localStorage.getItem("paayh_ref_code")?.trim());

      if (!force && !hasPendingRef && cachedNetworkData && now - cachedAt < CACHE_TTL_MS) {
        setData(cachedNetworkData);
        setLoading(false);
        return;
      }

      if (inflightFetch && !force) {
        const shared = await inflightFetch;
        if (shared) setData(shared);
        setLoading(false);
        return;
      }

      inflightFetch = (async () => {
        try {
          const params = new URLSearchParams();
          if (force) params.set("fresh", "1");
          if (typeof window !== "undefined") {
            const storedRef = localStorage.getItem("paayh_ref_code")?.trim();
            if (storedRef) {
              params.set("bindRef", storedRef);
            }
          }
          const qs = params.toString();
          const url = qs ? `/api/agent?${qs}` : "/api/agent";
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            if (json && json.success) {
              if (typeof window !== "undefined") {
                localStorage.removeItem("paayh_ref_code");
              }
              broadcastUpdate(json);
              return json as AgentNetworkPayload;
            }
          }
        } catch {}
        return null;
      })();

      try {
        await inflightFetch;
      } finally {
        inflightFetch = null;
        setLoading(false);
      }
    },
    [broadcastUpdate]
  );

  useEffect(() => {
    refreshNetwork(false);

    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<AgentNetworkPayload>;
      if (custom.detail && typeof custom.detail.invitesCount === "number") {
        cachedNetworkData = custom.detail;
        cachedAt = Date.now();
        setData(custom.detail);
        setLoading(false);
      }
    };

    const handleFocus = () => {
      refreshNetwork(true);
    };

    window.addEventListener("paayh:agent_network_loaded", handleSync);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("paayh:agent_network_loaded", handleSync);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshNetwork]);

  const registerAgent = async () => {
    setActionLoading(true);
    setActiveActionKey("register");
    setFeedback(null);
    const snapshot = cachedNetworkData || data;

    try {
      const [res] = await Promise.all([
        fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register" }),
        }),
        new Promise((resolve) => setTimeout(resolve, 340)),
      ]);
      const json = await res.json();
      if (res.ok && json.success) {
        broadcastUpdate(json);
        setFeedback("Agent status active.");
      } else {
        setFeedback(json.error || "Could not register.");
      }
    } catch {
      broadcastUpdate({
        ...snapshot,
        isAgent: true,
        agentRegisteredAt: snapshot.agentRegisteredAt || new Date().toISOString(),
      });
      setFeedback("Network error.");
    } finally {
      setActionLoading(false);
      setActiveActionKey(null);
    }
  };

  const triggerOptOutAction = async (optOutAction: OptOutActionType, refereeEmail?: string) => {
    const cleanRef = (refereeEmail || "").toLowerCase().trim();
    const actionKey = cleanRef ? `${optOutAction}:${cleanRef}` : optOutAction;
    setActionLoading(true);
    setActiveActionKey(actionKey);
    setFeedback(null);
    const snapshot = cachedNetworkData || data;
    const optimisticNext = applyOptimisticTransform(snapshot, optOutAction, cleanRef);

    try {
      const [res] = await Promise.all([
        fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "opt_out",
            optOutAction,
            refereeEmail: cleanRef || undefined,
          }),
        }),
        new Promise((resolve) => setTimeout(resolve, 340)),
      ]);
      const json = await res.json();
      if (res.ok && json.success) {
        broadcastUpdate(json);
        setFeedback(json.message || "Updated.");
      } else {
        setFeedback(json.error || "Action failed.");
      }
    } catch {
      broadcastUpdate(optimisticNext);
      setFeedback("Network error.");
    } finally {
      setActionLoading(false);
      setActiveActionKey(null);
    }
  };

  return {
    data,
    loading,
    actionLoading,
    activeActionKey,
    feedback,
    setFeedback,
    refreshNetwork,
    registerAgent,
    triggerOptOutAction,
  };
}
