"use client";

import { useState, useEffect } from "react";
import { useTheme } from "../ThemeProvider";
import { ALL_INDUSTRIES, ALL_INTERESTS } from "@/lib/categoryTargetingMap";
import type { AdminTab } from "./AdminLayoutAndCampaignTabs";
import { useAdminCampaignAndUserActions } from "./useAdminCampaignAndUserActions";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import { useAdminDataAndSupport } from "./useAdminDataAndSupport";

export function useAdminDashboardState() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [showAdminBalance, setShowAdminBalance] = useState(true);
  const { alertDialog, confirmDialog } = useAdminDialog();

  // Data States
  const [users, setUsers] = useState<any[]>([]);
  const [pendingAds, setPendingAds] = useState<any[]>([]);
  const [activeAds, setActiveAds] = useState<any[]>([]);
  const [pendingHighlights, setPendingHighlights] = useState<any[]>([]);
  const [activeHighlights, setActiveHighlights] = useState<any[]>([]);

  // Pagination States
  const [usersPage, setUsersPage] = useState(0);
  const [usersLimit, setUsersLimit] = useState(10);
  const [pendingAdsPage, setPendingAdsPage] = useState(0);
  const [activeAdsPage, setActiveAdsPage] = useState(0);
  const [pendingHighlightsPage, setPendingHighlightsPage] = useState(0);
  const [activeHighlightsPage, setActiveHighlightsPage] = useState(0);

  // Pagination Count States
  const [usersCount, setUsersCount] = useState(0);
  const [pendingAdsCount, setPendingAdsCount] = useState(0);
  const [activeAdsCount, setActiveAdsCount] = useState(0);
  const [pendingHighlightsCount, setPendingHighlightsCount] = useState(0);
  const [activeHighlightsCount, setActiveHighlightsCount] = useState(0);

  // Help Center Tickets State
  const [helpTickets, setHelpTickets] = useState<any[]>([]);
  const [helpTicketsCount, setHelpTicketsCount] = useState(0);
  const [helpTicketsPage, setHelpTicketsPage] = useState(0);
  const [helpTicketSearch, setHelpTicketSearch] = useState("");
  const [replyingTicket, setReplyingTicket] = useState<any | null>(null);
  const [pendingSubscribersCount, setPendingSubscribersCount] = useState(0);

  // Help ticket reply state
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

  // Reported Ads State
  const [reportedAds, setReportedAds] = useState<any[]>([]);
  const [reportedAdsCount, setReportedAdsCount] = useState(0);
  const [reportedAdsPage, setReportedAdsPage] = useState(0);
  const [reportedAdsSearch, setReportedAdsSearch] = useState("");
  const [inspectingAd, setInspectingAd] = useState<any | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Notification States
  const [notificationTarget, setNotificationTarget] = useState<"all" | "monetized" | "user">("all");
  const [notificationTargetEmail, setNotificationTargetEmail] = useState("");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSuccessMsg, setNotificationSuccessMsg] = useState("");
  const [notificationErrorMsg, setNotificationErrorMsg] = useState("");

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Search Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [usersFilter, setUsersFilter] = useState("");

  // Modal / Detail States
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userActionSubmitting, setUserActionSubmitting] = useState(false);
  const [banModalUser, setBanModalUser] = useState<any | null>(null);
  const [banModalStatus, setBanModalStatus] = useState<"temp_banned" | "perm_banned" | "deactivated" | "active">("temp_banned");
  const [banModalDays, setBanModalDays] = useState<number>(7);
  const [banModalReason, setBanModalReason] = useState<string>("");
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [adActionLoading, setAdActionLoading] = useState<string | null>(null);
  const [campaignActionLoading, setCampaignActionLoading] = useState<string | null>(null);

  const [editAdData, setEditAdData] = useState<any | null>(null);
  const [editHighlightData, setEditHighlightData] = useState<any | null>(null);

  // Quick Stats State (hydrated synchronously from sessionStorage for 0ms Overview load)
  const [stats, setStats] = useState(() => {
    const fallback = {
      totalUsers: 0,
      monetizedUsers: 0,
      suspendedUsers: 0,
      totalBalance: 0,
      totalWithdrawal: 0,
      pendingAdsCount: 0,
      activeAdsCount: 0,
      pendingHighlightsCount: 0,
      activeHighlightsCount: 0,
      totalClicks: 0,
      totalMutuals: 0,
      clickRate: 0,
      reportedCount: 0,
      helpTicketsCount: 0,
      pausedAdsCount: 0,
    };
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("paayh_admin_stats_cache");
        if (cached) return { ...fallback, ...JSON.parse(cached) };
      } catch {}
    }
    return fallback;
  });

  // DLQ Queues state
  const [dlqJobs, setDlqJobs] = useState<any[]>([]);
  const [dlqCount, setDlqCount] = useState<number>(0);
  const [dlqLoading, setDlqLoading] = useState<boolean>(false);
  const [dlqActionStatus, setDlqActionStatus] = useState<string>("");

  // Direct posting form states
  const [adForm, setAdForm] = useState({
    adType: "business",
    industry: [] as string[],
    interest: [] as string[],
    impressions: 1000,
    campaignDays: 5,
    userFrequencyCap: 1,
    country: "Nigeria",
    state: "",
    gender: "both",
    employmentStatus: "employed",
    adMediaType: "image",
    adContent: "",
    actionPhone: "",
    actionWhatsapp: "",
    actionWebsite: "",
    actionEmail: "",
    costPerImpression: 25,
    userEmail: "admin@paayh.com",
  });
  const [adFormFiles, setAdFormFiles] = useState<File[]>([]);

  const [highlightForm, setHighlightForm] = useState({
    title: "",
    content: "",
    interest: "Business",
    userEmail: "admin@paayh.com",
  });
  const [highlightFormFile, setHighlightFormFile] = useState<File | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const cached = sessionStorage.getItem("admin_quick_stats");
      if (cached) setStats(JSON.parse(cached));
    } catch {}
    try {
      const savedBalance = localStorage.getItem("admin_show_balance");
      if (savedBalance !== null) setShowAdminBalance(savedBalance === "true");
    } catch {}
  }, []);

  const toggleAdminBalance = () => {
    setShowAdminBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin_show_balance", String(next));
      } catch {}
      return next;
    });
  };

  const dataAndSupport = useAdminDataAndSupport({
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
    usersFilter,
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
  });

  const handleExecuteAdBan = async () => {
    if (!banModalUser) return;
    if (banModalStatus !== "active" && !banModalReason.trim()) {
      await alertDialog("Please provide a reason for this ad account restriction.", "Validation Error");
      return;
    }

    const confirmed = await confirmDialog(
      banModalStatus === "active"
        ? `Are you sure you want to restore full advertiser access for ${banModalUser.email}?`
        : `Are you sure you want to apply ${banModalStatus.toUpperCase()} to advertiser ${banModalUser.email}?\n\nReason: "${banModalReason.trim()}"`,
      "Confirm Advertiser Restriction",
      banModalStatus !== "active"
    );
    if (!confirmed) return;

    setBanSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ad_account_action",
          userId: banModalUser.id,
          payload: {
            adStatus: banModalStatus,
            banDays: banModalDays,
            banReason: banModalReason.trim(),
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update ad account status");
      }
      await alertDialog(`Ad account status updated for ${banModalUser.email}`, "Access Updated");
      setBanModalUser(null);
      setBanModalReason("");
      dataAndSupport.fetchUsersTab(usersPage, searchQuery);
    } catch (e: any) {
      await alertDialog(e.message || "Error updating ad account status", "Error");
    } finally {
      setBanSubmitting(false);
    }
  };

  const campaignAndUserActions = useAdminCampaignAndUserActions({
    userActionSubmitting,
    setUserActionSubmitting,
    selectedUser,
    setSelectedUser,
    campaignActionLoading,
    setCampaignActionLoading,
    editAdData,
    setEditAdData,
    editHighlightData,
    setEditHighlightData,
    setPendingAds,
    setActiveAds,
    setPendingAdsCount,
    setActiveAdsCount,
    setPendingHighlights,
    setActiveHighlights,
    setPendingHighlightsCount,
    setActiveHighlightsCount,
    adForm,
    setAdForm,
    adFormFiles,
    setAdFormFiles,
    highlightForm,
    setHighlightForm,
    highlightFormFile,
    setHighlightFormFile,
    setUploading,
    handleRefresh: dataAndSupport.handleRefresh,
    fetchOverviewStats: dataAndSupport.fetchOverviewStats,
    handleTabChange: dataAndSupport.handleTabChange,
  });

  return {
    theme,
    setTheme,
    mounted,
    activeTab,
    showAdminBalance,
    toggleAdminBalance,
    users,
    pendingAds,
    activeAds,
    pendingHighlights,
    activeHighlights,
    usersPage,
    setUsersPage,
    usersLimit,
    setUsersLimit,
    pendingAdsPage,
    setPendingAdsPage,
    activeAdsPage,
    setActiveAdsPage,
    pendingHighlightsPage,
    setPendingHighlightsPage,
    activeHighlightsPage,
    setActiveHighlightsPage,
    usersCount,
    pendingAdsCount,
    activeAdsCount,
    pendingHighlightsCount,
    activeHighlightsCount,
    helpTickets,
    helpTicketsCount,
    helpTicketsPage,
    setHelpTicketsPage,
    helpTicketSearch,
    setHelpTicketSearch,
    replyingTicket,
    setReplyingTicket,
    pendingSubscribersCount,
    replyText,
    setReplyText,
    replyLoading,
    reportedAds,
    reportedAdsCount,
    reportedAdsPage,
    setReportedAdsPage,
    reportedAdsSearch,
    setReportedAdsSearch,
    inspectingAd,
    setInspectingAd,
    inspectLoading,
    notificationTarget,
    setNotificationTarget,
    notificationTargetEmail,
    setNotificationTargetEmail,
    notificationTitle,
    setNotificationTitle,
    notificationMessage,
    setNotificationMessage,
    notificationLoading,
    notificationSuccessMsg,
    notificationErrorMsg,
    loading,
    refreshing,
    uploading,
    searchQuery,
    setSearchQuery,
    usersFilter,
    setUsersFilter,
    selectedUser,
    setSelectedUser,
    userActionSubmitting,
    banModalUser,
    setBanModalUser,
    banModalStatus,
    setBanModalStatus,
    banModalDays,
    setBanModalDays,
    banModalReason,
    setBanModalReason,
    banSubmitting,
    adActionLoading,
    campaignActionLoading,
    editAdData,
    setEditAdData,
    editHighlightData,
    setEditHighlightData,
    stats,
    dlqJobs,
    dlqCount,
    dlqLoading,
    dlqActionStatus,
    adForm,
    setAdForm,
    adFormFiles,
    setAdFormFiles,
    highlightForm,
    setHighlightForm,
    highlightFormFile,
    setHighlightFormFile,
    industriesList: ALL_INDUSTRIES,
    interestsList: ALL_INTERESTS,
    handleExecuteAdBan,
    ...dataAndSupport,
    ...campaignAndUserActions,
  };
}
