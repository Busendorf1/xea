"use client";

import React, { useEffect, useRef } from "react";
import type { AdminTab } from "./AdminLayoutAndCampaignTabs";
import { useAdminReportedAndDlqActions } from "./useAdminReportedAndDlqActions";
import { useAdminSupportAndNotifications } from "./useAdminSupportAndNotifications";

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
  usersFilter?: string;
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
    usersFilter = "",
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

  const {
    fetchReportedAds,
    handleInspectAd,
    handleDeactivateReportedAd,
    handleBlockReportedAdvertiser,
    handleDismissReport,
    fetchDlqJobs,
    handleRetryDlqAll,
    handleRetryDlqSingle,
    handleClearDlqAll,
  } = useAdminReportedAndDlqActions({
    reportedAds,
    setReportedAds,
    reportedAdsPage,
    setReportedAdsCount,
    setLoading,
    setInspectLoading,
    setInspectingAd,
    adActionLoading,
    setAdActionLoading,
    searchQuery,
    setDlqLoading,
    setDlqJobs,
    setDlqCount,
    setDlqActionStatus,
  });

  const {
    fetchHelpTickets,
    handleReplyTicket,
    handleCloseTicket,
    handleDeleteTicket,
    handleSendNotification,
  } = useAdminSupportAndNotifications({
    setLoading,
    helpTickets,
    setHelpTickets,
    helpTicketsPage,
    helpTicketSearch,
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
  });

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

  const fetchUsersTab = async (
    page: number,
    search: string,
    limit: number = usersLimit,
    fresh = false,
    filter = usersFilter
  ) => {
    if (users.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search || "")}${
          filter ? `&filter=${encodeURIComponent(filter)}` : ""
        }${fresh ? "&fresh=true" : ""}`
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Failed to fetch admin users (${res.status})`);
      }
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

  const fetchPendingAdsTab = async (page: number, fresh = false) => {
    if (pendingAds.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns?tab=ad-approvals&page=${page}&limit=10${fresh ? "&fresh=true" : ""}`,
        { cache: "no-store" }
      );
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

  const fetchActiveAdsTab = async (page: number, search: string, fresh = false) => {
    if (activeAds.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns?tab=active-ads&page=${page}&limit=10&search=${encodeURIComponent(
          search || ""
        )}${fresh ? "&fresh=true" : ""}`,
        { cache: "no-store" }
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

  const fetchPendingHighlightsTab = async (page: number, fresh = false) => {
    if (pendingHighlights.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns?tab=highlight-approvals&page=${page}&limit=10${fresh ? "&fresh=true" : ""}`,
        { cache: "no-store" }
      );
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

  const fetchActiveHighlightsTab = async (page: number, search: string, fresh = false) => {
    if (activeHighlights.length === 0) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns?tab=active-highlights&page=${page}&limit=10&search=${encodeURIComponent(
          search || ""
        )}${fresh ? "&fresh=true" : ""}`,
        { cache: "no-store" }
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
        fetchUsersTab(usersPage, searchQuery, usersLimit, false, usersFilter);
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
    usersFilter,
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
      await fetchPendingAdsTab(pendingAdsPage, true);
    } else if (activeTab === "active-ads") {
      await fetchActiveAdsTab(activeAdsPage, searchQuery, true);
    } else if (activeTab === "highlight-approvals") {
      await fetchPendingHighlightsTab(pendingHighlightsPage, true);
    } else if (activeTab === "active-highlights") {
      await fetchActiveHighlightsTab(activeHighlightsPage, searchQuery, true);
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
