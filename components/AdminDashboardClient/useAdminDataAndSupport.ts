"use client";

import React, { useEffect, useCallback, useRef } from "react";
import {
  adminNotificationSchema,
  adminTicketReplySchema,
} from "@/lib/validationSchemas";
import type { AdminTab } from "./AdminLayoutAndCampaignTabs";

export function useAdminDataAndSupport(params: {
  activeTab: AdminTab;
  setActiveTab: (t: AdminTab) => void;
  setLoading: (l: boolean) => void;
  setRefreshing: (r: boolean) => void;
  setStats: (s: any) => void;
  setPendingSubscribersCount: (c: number) => void;
  users: any[];
  setUsers: (u: any[]) => void;
  usersPage: number;
  setUsersPage: (p: number) => void;
  usersLimit: number;
  setUsersCount: (c: number) => void;
  pendingAds: any[];
  setPendingAds: (a: any[]) => void;
  pendingAdsPage: number;
  setPendingAdsPage: (p: number) => void;
  setPendingAdsCount: (c: number) => void;
  activeAds: any[];
  setActiveAds: (a: any[]) => void;
  activeAdsPage: number;
  setActiveAdsPage: (p: number) => void;
  setActiveAdsCount: (c: number) => void;
  pendingHighlights: any[];
  setPendingHighlights: (h: any[]) => void;
  pendingHighlightsPage: number;
  setPendingHighlightsPage: (p: number) => void;
  setPendingHighlightsCount: (c: number) => void;
  activeHighlights: any[];
  setActiveHighlights: (h: any[]) => void;
  activeHighlightsPage: number;
  setActiveHighlightsPage: (p: number) => void;
  setActiveHighlightsCount: (c: number) => void;
  reportedAds: any[];
  setReportedAds: (r: any[]) => void;
  reportedAdsPage: number;
  reportedAdsSearch: string;
  setReportedAdsCount: (c: number) => void;
  setInspectLoading: (l: boolean) => void;
  setInspectingAd: (a: any) => void;
  adActionLoading: string | null;
  setAdActionLoading: (l: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setDlqLoading: (l: boolean) => void;
  setDlqJobs: (j: any[]) => void;
  setDlqCount: (c: number) => void;
  setDlqActionStatus: (s: string) => void;
  helpTickets: any[];
  setHelpTickets: React.Dispatch<React.SetStateAction<any[]>>;
  helpTicketsPage: number;
  setHelpTicketsPage: React.Dispatch<React.SetStateAction<number>>;
  helpTicketSearch: string;
  setHelpTicketSearch: (s: string) => void;
  setHelpTicketsCount: (c: number) => void;
  replyText: string;
  setReplyText: (s: string) => void;
  setReplyingTicket: (t: any) => void;
  setReplyLoading: (l: boolean) => void;
  notificationTarget: "all" | "monetized" | "user";
  notificationTargetEmail: string;
  setNotificationTargetEmail: (s: string) => void;
  notificationTitle: string;
  setNotificationTitle: (s: string) => void;
  notificationMessage: string;
  setNotificationMessage: (s: string) => void;
  setNotificationLoading: (l: boolean) => void;
  setNotificationSuccessMsg: (s: string) => void;
  setNotificationErrorMsg: (s: string) => void;
}) {
  const {
    activeTab,
    setActiveTab,
    setLoading,
    setRefreshing,
    setStats,
    setPendingSubscribersCount,
    users,
    setUsers,
    usersPage,
    setUsersPage,
    usersLimit,
    setUsersCount,
    pendingAds,
    setPendingAds,
    pendingAdsPage,
    setPendingAdsPage,
    setPendingAdsCount,
    activeAds,
    setActiveAds,
    activeAdsPage,
    setActiveAdsPage,
    setActiveAdsCount,
    pendingHighlights,
    setPendingHighlights,
    pendingHighlightsPage,
    setPendingHighlightsPage,
    setPendingHighlightsCount,
    activeHighlights,
    setActiveHighlights,
    activeHighlightsPage,
    setActiveHighlightsPage,
    setActiveHighlightsCount,
    reportedAds,
    setReportedAds,
    reportedAdsPage,
    reportedAdsSearch,
    setReportedAdsCount,
    setInspectLoading,
    setInspectingAd,
    adActionLoading,
    setAdActionLoading,
    searchQuery,
    setSearchQuery,
    setDlqLoading,
    setDlqJobs,
    setDlqCount,
    setDlqActionStatus,
    helpTickets,
    setHelpTickets,
    helpTicketsPage,
    setHelpTicketsPage,
    helpTicketSearch,
    setHelpTicketSearch,
    setHelpTicketsCount,
    replyText,
    setReplyText,
    setReplyingTicket,
    setReplyLoading,
    notificationTarget,
    notificationTargetEmail,
    setNotificationTargetEmail,
    notificationTitle,
    setNotificationTitle,
    notificationMessage,
    setNotificationMessage,
    setNotificationLoading,
    setNotificationSuccessMsg,
    setNotificationErrorMsg,
  } = params;

  const fetchOverviewStats = async (fresh = false) => {
    try {
      const [res, subRes] = await Promise.all([
        fetch(`/api/admin/stats${fresh ? "?fresh=true" : ""}`),
        fetch(`/api/admin/subscribers?limit=1${fresh ? "&fresh=true" : ""}`).catch(() => null),
      ]);

      if (res.ok) {
        const statsData = await res.json();
        const nextStats = {
          totalUsers: statsData.totalUsers || 0,
          monetizedUsers: statsData.monetizedUsers || 0,
          suspendedUsers: statsData.suspendedUsers || 0,
          totalBalance: statsData.totalBalance || 0,
          totalWithdrawal: statsData.totalWithdrawal || 0,
          pendingAdsCount: statsData.pendingAdsCount || 0,
          activeAdsCount: statsData.activeAdsCount || 0,
          pendingHighlightsCount: statsData.pendingHighlightsCount || 0,
          activeHighlightsCount: statsData.activeHighlightsCount || 0,
          totalClicks: statsData.totalClicks || 0,
          totalMutuals: statsData.totalMutuals || 0,
          clickRate: statsData.clickRate || 0,
          reportedCount: statsData.reportedCount || 0,
          helpTicketsCount: statsData.helpTicketsCount || 0,
          pausedAdsCount: statsData.pausedAdsCount || 0,
        };
        setStats(nextStats);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("paayh_admin_stats_cache", JSON.stringify(nextStats));
          } catch {}
        }
      }

      if (subRes && subRes.ok) {
        const subData = await subRes.json().catch(() => null);
        if (subData?.metrics && typeof subData.metrics.pending === "number") {
          setPendingSubscribersCount(subData.metrics.pending);
        }
      }
    } catch (e) {
      console.error("Error fetching overview stats:", e);
    }
  };

  const fetchUsersTab = async (page: number, search: string, limit: number = usersLimit, fresh = false) => {
    if (users.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search || "")}${
          fresh ? "&fresh=true" : ""
        }`
      );
      if (!res.ok) throw new Error("Failed to fetch admin users");
      const { users: resolvedUsers, count } = await res.json();

      setUsersCount(count || 0);
      setUsers(resolvedUsers || []);
    } catch (e) {
      console.error("Error fetching users page:", e);
      if (users.length === 0) setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingAdsTab = async (page: number) => {
    if (pendingAds.length === 0) setLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns?tab=ad-approvals&page=${page}&limit=10`);
      if (!res.ok) throw new Error("Failed to fetch pending ads");
      const json = await res.json();
      setPendingAds(json.data || []);
      setPendingAdsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching pending ads:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveAdsTab = async (page: number, search: string) => {
    if (activeAds.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns?tab=active-ads&page=${page}&limit=10&search=${encodeURIComponent(
          search || ""
        )}`
      );
      if (!res.ok) throw new Error("Failed to fetch active ads");
      const json = await res.json();
      setActiveAds(json.data || []);
      setActiveAdsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching active ads:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingHighlightsTab = async (page: number) => {
    if (pendingHighlights.length === 0) setLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns?tab=highlight-approvals&page=${page}&limit=10`);
      if (!res.ok) throw new Error("Failed to fetch pending highlights");
      const json = await res.json();
      setPendingHighlights(json.data || []);
      setPendingHighlightsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching pending highlights:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveHighlightsTab = async (page: number, search: string) => {
    if (activeHighlights.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns?tab=active-highlights&page=${page}&limit=10&search=${encodeURIComponent(
          search || ""
        )}`
      );
      if (!res.ok) throw new Error("Failed to fetch active highlights");
      const json = await res.json();
      setActiveHighlights(json.data || []);
      setActiveHighlightsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching active highlights:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportedAds = async (page: number, search: string = "", fresh = false) => {
    if (reportedAds.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reports?page=${page}&search=${encodeURIComponent(search)}${
          fresh ? "&fresh=true" : ""
        }`
      );
      const json = await res.json();
      if (res.ok && json.reports) {
        setReportedAds(json.reports);
        setReportedAdsCount(json.count || 0);
      } else if (reportedAds.length === 0) {
        setReportedAds([]);
        setReportedAdsCount(0);
      }
    } catch (e) {
      console.error("Error fetching reported ads:", e);
      if (reportedAds.length === 0) setReportedAds([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInspectAd = async (adId: string) => {
    if (!adId) return;
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/admin/ad-details?id=${encodeURIComponent(adId.trim())}`);
      const json = await res.json();
      if (res.ok && json.ad) {
        setInspectingAd(json.ad);
      } else {
        alert(json.error || `Ad campaign with ID '${adId}' was not found in database.`);
      }
    } catch (e: any) {
      alert("Failed to fetch ad details: " + e.message);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleDeactivateReportedAd = async (adId: string, reportId: string) => {
    if (adActionLoading) return;
    if (!confirm(`Are you sure you want to deactivate ad ${adId} for all users?`)) return;
    const statement = prompt(
      "Reason for deactivating this ad (visible to advertiser):",
      "Deactivated by Admin due to user content reports"
    );
    if (statement === null) return;

    setAdActionLoading(`deactivate-${reportId || adId}`);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_ad",
          adId,
          reportId,
          statement,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      alert(json.message || "Ad campaign deactivated successfully for all users!");
      fetchReportedAds(reportedAdsPage, searchQuery, true);
    } catch (e: any) {
      alert("Failed to deactivate ad: " + e.message);
    } finally {
      setAdActionLoading(null);
    }
  };

  const handleBlockReportedAdvertiser = async (advertiserEmail: string, reportId: string) => {
    if (adActionLoading) return;
    if (!advertiserEmail) return alert("No advertiser email associated with this report.");
    if (
      !confirm(
        `Are you sure you want to deactivate all active ads created by advertiser ${advertiserEmail} and permanently ban this advertiser account?`
      )
    )
      return;
    const statement = prompt(
      "Reason for banning advertiser and deactivating campaigns (visible to advertiser):",
      "Account suspended by Admin due to multiple content safety reports"
    );
    if (statement === null) return;

    setAdActionLoading(`block-${reportId || advertiserEmail}`);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "block_advertiser",
          advertiserEmail,
          reportId,
          statement,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      alert(
        json.message ||
          `All ads created by advertiser ${advertiserEmail} have been deactivated and the account has been banned.`
      );
      fetchReportedAds(reportedAdsPage, searchQuery, true);
    } catch (e: any) {
      alert("Failed to block advertiser: " + e.message);
    } finally {
      setAdActionLoading(null);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    if (adActionLoading) return;
    setAdActionLoading(`dismiss-${reportId}`);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss_report",
          reportId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      alert("Report dismissed successfully.");
      fetchReportedAds(reportedAdsPage, searchQuery, true);
    } catch (e: any) {
      alert("Failed to dismiss report: " + e.message);
    } finally {
      setAdActionLoading(null);
    }
  };

  const fetchDlqJobs = useCallback(async () => {
    try {
      setDlqLoading(true);
      const res = await fetch("/api/admin/queues");
      if (res.ok) {
        const data = await res.json();
        setDlqJobs(data.jobs || []);
        setDlqCount(data.count || 0);
      }
    } catch (err: any) {
      console.error("Error fetching DLQ jobs:", err);
    } finally {
      setDlqLoading(false);
    }
  }, []);

  const handleRetryDlqAll = async () => {
    setDlqActionStatus("Retrying all failed jobs...");
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_all" }),
      });
      if (res.ok) {
        const data = await res.json();
        setDlqActionStatus(`Successfully re-queued ${data.retriedCount || 0} failed jobs!`);
        fetchDlqJobs();
      }
    } catch (err: any) {
      setDlqActionStatus(`Retry failed: ${err.message}`);
    }
  };

  const handleRetryDlqSingle = async (jobId: string) => {
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_job", jobId }),
      });
      if (res.ok) {
        fetchDlqJobs();
      }
    } catch (err: any) {
      console.error("Single job retry failed:", err);
    }
  };

  const handleClearDlqAll = async () => {
    if (!confirm("Are you sure you want to clear all DLQ records?")) return;
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all" }),
      });
      if (res.ok) {
        fetchDlqJobs();
      }
    } catch (err: any) {
      console.error("Clear DLQ failed:", err);
    }
  };

  const fetchHelpTickets = async (page: number, search: string, fresh = false) => {
    if (helpTickets.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/help-tickets?page=${page}&limit=10&search=${encodeURIComponent(search || "")}${
          fresh ? "&fresh=true" : ""
        }`
      );
      if (!res.ok) throw new Error("Failed to fetch help tickets");
      const json = await res.json();
      setHelpTickets(json.tickets || []);
      setHelpTicketsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching help tickets:", e);
      if (helpTickets.length === 0) {
        setHelpTickets([]);
        setHelpTicketsCount(0);
      }
    } finally {
      setLoading(false);
    }
  };

  const prevTabRef = useRef<AdminTab>(activeTab);
  useEffect(() => {
    const isTabSwitch = prevTabRef.current !== activeTab;
    prevTabRef.current = activeTab;

    const hasActiveSearch =
      (activeTab === "accounts" && Boolean(searchQuery)) ||
      (activeTab === "active-ads" && Boolean(searchQuery)) ||
      (activeTab === "active-highlights" && Boolean(searchQuery)) ||
      (activeTab === "help-center" && Boolean(helpTicketSearch)) ||
      (activeTab === "reported-ads" && Boolean(reportedAdsSearch));

    const runTabFetch = () => {
      if (activeTab === "overview") {
        fetchOverviewStats();
      } else if (activeTab === "accounts") {
        fetchUsersTab(usersPage, searchQuery, usersLimit);
      } else if (activeTab === "ad-approvals") {
        fetchPendingAdsTab(pendingAdsPage);
      } else if (activeTab === "active-ads") {
        fetchActiveAdsTab(activeAdsPage, searchQuery);
      } else if (activeTab === "highlight-approvals") {
        fetchPendingHighlightsTab(pendingHighlightsPage);
      } else if (activeTab === "active-highlights") {
        fetchActiveHighlightsTab(activeHighlightsPage, searchQuery);
      } else if (activeTab === "help-center") {
        fetchHelpTickets(helpTicketsPage, helpTicketSearch);
      } else if (activeTab === "reported-ads") {
        fetchReportedAds(reportedAdsPage, reportedAdsSearch);
      } else if (activeTab === "queues") {
        fetchDlqJobs();
      }
    };

    if (!isTabSwitch && hasActiveSearch) {
      const debounceTimer = setTimeout(runTabFetch, 220);
      return () => clearTimeout(debounceTimer);
    }

    runTabFetch();
  }, [
    activeTab,
    usersPage,
    usersLimit,
    pendingAdsPage,
    activeAdsPage,
    pendingHighlightsPage,
    activeHighlightsPage,
    searchQuery,
    helpTicketsPage,
    helpTicketSearch,
    reportedAdsPage,
    reportedAdsSearch,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pendingAds.length === 0) fetchPendingAdsTab(0);
      if (pendingHighlights.length === 0) fetchPendingHighlightsTab(0);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === "overview") {
      await fetchOverviewStats(true);
    } else if (activeTab === "accounts") {
      await fetchUsersTab(usersPage, searchQuery, usersLimit, true);
    } else if (activeTab === "ad-approvals") {
      await fetchPendingAdsTab(pendingAdsPage);
    } else if (activeTab === "active-ads") {
      await fetchActiveAdsTab(activeAdsPage, searchQuery);
    } else if (activeTab === "highlight-approvals") {
      await fetchPendingHighlightsTab(pendingHighlightsPage);
    } else if (activeTab === "active-highlights") {
      await fetchActiveHighlightsTab(activeHighlightsPage, searchQuery);
    } else if (activeTab === "help-center") {
      await fetchHelpTickets(helpTicketsPage, helpTicketSearch, true);
    } else if (activeTab === "reported-ads") {
      await fetchReportedAds(reportedAdsPage, reportedAdsSearch, true);
    }
    setRefreshing(false);
  };

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setUsersPage(0);
    setPendingAdsPage(0);
    setActiveAdsPage(0);
    setPendingHighlightsPage(0);
    setActiveHighlightsPage(0);
    setHelpTicketsPage(0);
    setHelpTicketSearch("");
    setReplyingTicket(null);
    setReplyText("");
  };

  const handleReplyTicket = async (ticketId: string) => {
    const validation = adminTicketReplySchema.safeParse({ ticketId, replyText });
    if (!validation.success) {
      alert(validation.error.issues[0]?.message || "Invalid ticket reply text.");
      return;
    }
    setReplyLoading(true);
    try {
      const res = await fetch("/api/admin/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", ticketId, replyText: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to send reply");

      alert("Reply sent successfully!");
      setReplyingTicket(null);
      setReplyText("");
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    } catch (e: any) {
      alert("Failed to send reply: " + e.message);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleCloseTicket = async (ticket: any) => {
    const ticketId = typeof ticket === "string" ? ticket : ticket.id;
    const now = new Date().toISOString();

    setHelpTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: "closed", resolved_at: now } : t))
    );

    try {
      const res = await fetch("/api/admin/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", ticketId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to close ticket");

      alert("Ticket marked as CLOSED! Notification sent to user. Ticket will auto-delete in 24 hours.");
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    } catch (e: any) {
      alert("Failed to close ticket: " + e.message);
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm("Delete this ticket permanently?")) return;
    try {
      const res = await fetch("/api/admin/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ticketId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to delete ticket");

      setHelpTickets((prev) => prev.filter((t) => t.id !== ticketId));
      alert("Ticket deleted successfully.");
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    } catch (e: any) {
      alert("Failed to delete ticket: " + e.message);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotificationSuccessMsg("");
    setNotificationErrorMsg("");

    const validation = adminNotificationSchema.safeParse({
      title: notificationTitle,
      message: notificationMessage,
      target: notificationTarget,
      targetEmail: notificationTargetEmail,
    });

    if (!validation.success) {
      setNotificationErrorMsg(validation.error.issues[0]?.message || "Invalid notification input.");
      return;
    }

    setNotificationLoading(true);
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: notificationTarget,
          title: notificationTitle,
          message: notificationMessage,
          targetEmail: notificationTarget === "user" ? notificationTargetEmail : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotificationSuccessMsg(`Broadcast sent successfully!`);
        setNotificationTitle("");
        setNotificationMessage("");
        setNotificationTargetEmail("");
      } else {
        setNotificationErrorMsg(data.error || "Failed to send notifications.");
      }
    } catch (err: any) {
      setNotificationErrorMsg(err.message || "Failed to send notifications.");
    } finally {
      setNotificationLoading(false);
    }
  };

  return {
    fetchOverviewStats,
    fetchUsersTab,
    handleInspectAd,
    handleDeactivateReportedAd,
    handleBlockReportedAdvertiser,
    handleDismissReport,
    handleRetryDlqAll,
    handleRetryDlqSingle,
    handleClearDlqAll,
    handleRefresh,
    handleTabChange,
    handleReplyTicket,
    handleCloseTicket,
    handleDeleteTicket,
    handleSendNotification,
  };
}
