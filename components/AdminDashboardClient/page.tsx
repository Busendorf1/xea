"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import supabase from "@/lib/utils/db";
import {
  adminNotificationSchema,
  adminDirectAdSchema,
  adminDirectHighlightSchema,
  adminTicketReplySchema,
} from "@/lib/validationSchemas";
import { useTheme } from "../ThemeProvider";
import { 
  Users, 
  TrendingUp, 
  Compass, 
  Layers, 
  CheckCircle, 
  XCircle, 
  Pause, 
  Play, 
  Edit3, 
  Trash2, 
  Search, 
  DollarSign, 
  PlusCircle, 
  RefreshCw, 
  Sliders, 
  ShieldAlert,
  UserCheck,
  UserX,
  LogOut,
  Sun,
  Moon,
  Contrast,
  Plus,
  Eye,
  EyeOff,
  MessageCircle,
  Reply,
  Bell,
  Video,
  Image as ImageIcon,
  Megaphone,
  Clock,
  Zap,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  PauseCircle,
  ShieldCheck,
  Sparkles,
  BarChart3,
  Wallet,
  LayoutGrid,
  Shield,
  Activity,
  Radio,
  FileCheck2,
  FolderLock,
  Building2,
  CheckCircle2,
  Globe,
  Check,
  X
} from "lucide-react";
import styles from "./page.module.css";
import { v4 as uuidv4 } from "uuid";
import { ALL_INDUSTRIES, ALL_INTERESTS } from "@/lib/categoryTargetingMap";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import AdminPayoutsTab from "./AdminPayoutsTab";
import AdminMasterStatementTab from "./AdminMasterStatementTab";
import AdminReconciliationTab from "./AdminReconciliationTab";
import AdminBrandSubscribersTab from "./AdminBrandSubscribersTab";

interface AdminDashboardClientProps {
  session: {
    user?: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  };
  adminEmails: string[];
}

type Tab = "overview" | "accounts" | "ad-approvals" | "highlight-approvals" | "active-ads" | "active-highlights" | "direct-post" | "help-center" | "send-notifications" | "reported-ads" | "queues" | "payout-management" | "master-statement" | "reconciliation" | "brand-subscribers";

function AdminAdMediaBox({ adMedia, adMediaType }: { adMedia: string; adMediaType?: string }) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const mediaUrls = adMedia ? adMedia.split(",").map(u => u.trim()).filter(Boolean) : [];
  if (mediaUrls.length === 0) {
    return (
      <div className={styles.adminCls_1}>
        Text Only Ad
      </div>
    );
  }

  const currentUrl = mediaUrls[currentMediaIndex];
  const isVideo = adMediaType === "video" || /\.(mp4|webm)$/i.test(currentUrl);

  return (
    <div className={styles.adminCls_2}>
      {isVideo ? (
        <video key={currentUrl} src={currentUrl} controls className={styles.adminCls_3} />
      ) : (
        <img src={currentUrl} alt="Campaign cover" className={styles.adminCls_3} />
      )}
      
      {mediaUrls.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentMediaIndex((prev) => (prev + 1) % mediaUrls.length);
          }}
          className={styles.adminCls_4}
          title="Next Media"
        >
          &gt;
        </button>
      )}
    </div>
  );
}

import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const formatCurrency = (amount: number | string, country?: string | null) => globalFormatCurrency(amount, country);

export default function AdminDashboardClient({ session, adminEmails }: AdminDashboardClientProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  
  const [showAdminBalance, setShowAdminBalance] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_show_balance");
      if (saved !== null) return saved === "true";
    }
    return true;
  });

  const toggleAdminBalance = () => {
    setShowAdminBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin_show_balance", String(next));
      } catch {}
      return next;
    });
  };
  
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

  const handleExecuteAdBan = async () => {
    if (!banModalUser) return;
    if (banModalStatus !== "active" && !banModalReason.trim()) {
      alert("Please provide a reason for this ad account restriction.");
      return;
    }
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
      alert(`Ad account status updated for ${banModalUser.email}`);
      setBanModalUser(null);
      setBanModalReason("");
      fetchUsersTab(usersPage, searchQuery);
    } catch (e: any) {
      alert(e.message || "Error updating ad account status");
    } finally {
      setBanSubmitting(false);
    }
  };
  const [editAdData, setEditAdData] = useState<any | null>(null);
  const [editHighlightData, setEditHighlightData] = useState<any | null>(null);

  // Quick Stats State
  const [stats, setStats] = useState({
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
    pausedAdsCount: 0
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
    userEmail: "admin@paayh.com"
  });
  const [adFormFiles, setAdFormFiles] = useState<File[]>([]);

  const [highlightForm, setHighlightForm] = useState({
    title: "",
    content: "",
    interest: "Business",
    userEmail: "admin@paayh.com"
  });
  const [highlightFormFile, setHighlightFormFile] = useState<File | null>(null);

  // Database lists for categories
  const industriesList = ALL_INDUSTRIES;
  const interestsList = ALL_INTERESTS;


  // ----------------------------------------------------
  // DATA FETCHING & TELEMETRY
  // ----------------------------------------------------

  const fetchOverviewStats = async (fresh = false) => {
    try {
      const res = await fetch(`/api/admin/stats${fresh ? "?fresh=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch admin stats");
      const statsData = await res.json();

      setStats({
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
        pausedAdsCount: statsData.pausedAdsCount || 0
      });

      // Fetch subscriber metrics
      try {
        const subRes = await fetch(`/api/admin/subscribers?limit=1${fresh ? "&fresh=true" : ""}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          if (subData.metrics && typeof subData.metrics.pending === "number") {
            setPendingSubscribersCount(subData.metrics.pending);
          }
        }
      } catch (subErr) {}
    } catch (e) {
      console.error("Error fetching overview stats:", e);
    }
  };

  const fetchUsersTab = async (page: number, search: string, limit: number = usersLimit, fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search || "")}${fresh ? "&fresh=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch admin users");
      const { users: resolvedUsers, count } = await res.json();
      
      setUsersCount(count || 0);
      setUsers(resolvedUsers || []);
    } catch (e) {
      console.error("Error fetching users page:", e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingAdsTab = async (page: number) => {
    setLoading(true);
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
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns?tab=active-ads&page=${page}&limit=10&search=${encodeURIComponent(search || "")}`);
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
    setLoading(true);
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
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns?tab=active-highlights&page=${page}&limit=10&search=${encodeURIComponent(search || "")}`);
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
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?page=${page}&search=${encodeURIComponent(search)}${fresh ? "&fresh=true" : ""}`);
      const json = await res.json();
      if (res.ok && json.reports) {
        setReportedAds(json.reports);
        setReportedAdsCount(json.count || 0);
      } else {
        setReportedAds([]);
        setReportedAdsCount(0);
      }
    } catch (e) {
      console.error("Error fetching reported ads:", e);
      setReportedAds([]);
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
    const statement = prompt("Reason for deactivating this ad (visible to advertiser):", "Deactivated by Admin due to user content reports");
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
          statement
        })
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
    if (!confirm(`Are you sure you want to deactivate all active ads created by advertiser ${advertiserEmail} and permanently ban this advertiser account?`)) return;
    const statement = prompt("Reason for banning advertiser and deactivating campaigns (visible to advertiser):", "Account suspended by Admin due to multiple content safety reports");
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
          statement
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      alert(json.message || `All ads created by advertiser ${advertiserEmail} have been deactivated and the account has been banned.`);
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
          reportId
        })
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

  // Synchronize loading on state changes
  useEffect(() => {
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
  }, [activeTab, usersPage, usersLimit, pendingAdsPage, activeAdsPage, pendingHighlightsPage, activeHighlightsPage, searchQuery, helpTicketsPage, helpTicketSearch, reportedAdsPage, reportedAdsSearch]);

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

  // Reset page parameters on query change or tab change
  const handleTabChange = (tab: Tab) => {
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

  // ----------------------------------------------------
  // HELP CENTER TICKET MANAGEMENT
  // ----------------------------------------------------

  const fetchHelpTickets = async (page: number, search: string, fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/help-tickets?page=${page}&limit=10&search=${encodeURIComponent(search || "")}${fresh ? "&fresh=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch help tickets");
      const json = await res.json();
      setHelpTickets(json.tickets || []);
      setHelpTicketsCount(json.count || 0);
    } catch (e) {
      console.error("Error fetching help tickets:", e);
      setHelpTickets([]);
      setHelpTicketsCount(0);
    } finally {
      setLoading(false);
    }
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

    // Optimistically update UI so CLOSED reflects immediately
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

  // ----------------------------------------------------
  // ACCOUNT ACTIONS
  // ----------------------------------------------------

  const handleToggleMonetization = async (user: any) => {
    if (userActionSubmitting) return;
    setUserActionSubmitting(true);
    const isCurrentlyMonetized = user.monetized === "yes" || user.monetized === true;
    const nextMonetizedVal = isCurrentlyMonetized ? "no" : "yes";
    const nextMonetizedType = null;
    const nextMonetizedUntil = null;

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_monetization",
          userId: user.id,
          payload: {
            nextMonetizedVal,
            nextMonetizedType,
            nextMonetizedUntil,
            isCurrentlyMonetized
          }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to update monetization: ${err.error || "Server error"}`);
      } else {
        alert(`Successfully ${isCurrentlyMonetized ? "deactivated" : "activated"} monetization for @${user.username}`);
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({
            ...selectedUser,
            monetized: nextMonetizedVal,
            monetization_type: nextMonetizedType,
            monetized_until: nextMonetizedUntil,
            monetized_at: isCurrentlyMonetized ? null : new Date().toISOString()
          });
        }
      }
    } catch (e: any) {
      alert(`Error updating monetization: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleSuspendUser = async (user: any, hours: number) => {
    if (userActionSubmitting) return;
    setUserActionSubmitting(true);
    let suspendedUntil: string | null = null;
    if (hours > 0) {
      suspendedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    } else if (hours === -1) {
      suspendedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suspend",
          userId: user.id,
          payload: { suspendedUntil }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to suspend account: ${err.error || "Server error"}`);
      } else {
        const desc = hours === -1 ? "permanently" : hours === 0 ? "unsuspended" : `for ${hours} hours`;
        alert(`Successfully ${desc} user @${user.username}`);
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({ ...selectedUser, suspended_until: suspendedUntil });
        }
      }
    } catch (e: any) {
      alert(`Error setting suspension: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleAdjustBalance = async (user: any, amount: number) => {
    if (isNaN(amount) || amount === 0 || userActionSubmitting) return;
    const reason = prompt(`Reason for adjusting balance for @${user.username} by ${formatCurrency(amount)}:`, "Administrative balance adjustment");
    if (reason === null) return;

    setUserActionSubmitting(true);
    const newBalance = Math.max(0, parseFloat(user.balance || 0) + amount);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_balance",
          userId: user.id,
          payload: { newBalance, reason: reason.trim() }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to update balance: ${err.error || "Server error"}`);
      } else {
        alert(`Wallet balance adjusted by ${formatCurrency(amount)}. New Balance: ${formatCurrency(newBalance)}`);
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({ ...selectedUser, balance: newBalance });
        }
      }
    } catch (e: any) {
      alert(`Error adjusting wallet: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (userActionSubmitting) return;
    if (!confirm(`WARNING: Are you sure you want to delete @${user.username} (${user.email}) permanently?`)) {
      return;
    }

    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          userId: user.id
        })
      });

      if (!response.ok) {
        const err = await response.json();
        alert(`Failed to delete account: ${err.error || "Server error"}`);
      } else {
        alert(`Account for @${user.username} deleted permanently.`);
        setSelectedUser(null);
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error deleting user: ${e.message}`);
    } finally {
      setUserActionSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // AD APPROVALS & OPERATIONS
  // ----------------------------------------------------

  const handleApproveAd = async (ad: any) => {
    if (campaignActionLoading) return;
    setCampaignActionLoading(`approve-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_ad", id: ad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      alert("Ad campaign approved and published!");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error approving ad: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleRejectAd = async (ad: any) => {
    if (campaignActionLoading) return;
    if (!confirm("Are you sure you want to permanently reject this Ad campaign?")) {
      return;
    }

    setCampaignActionLoading(`reject-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_ad", id: ad.id, payload: { refund: true } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      alert("Ad campaign rejected and deleted permanently.");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error rejecting campaign: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const targetState = !ad.is_paused;
    let statement: string | null = null;
    if (targetState) {
      statement = prompt("Enter a reason or statement for pausing this ad campaign (visible to the advertiser):");
      if (statement === null) return;
    }

    setCampaignActionLoading(`pause-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetState ? "pause_ad" : "resume_ad",
          id: ad.id,
          payload: { statement },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      alert(`Ad campaign successfully ${targetState ? "paused" : "resumed"}!`);
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error pausing/resuming campaign: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeactivateAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const reason = prompt("Enter a reason or statement for deactivating this ad campaign (visible to the advertiser):");
    if (reason === null) return;

    setCampaignActionLoading(`deactivate-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_ad",
          id: ad.id,
          payload: { statement: reason },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deactivation failed");

      alert("Ad campaign deactivated successfully!");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deactivating campaign: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleSaveAdEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdData || !editAdData.id || campaignActionLoading) return;

    setCampaignActionLoading(`edit-ad-${editAdData.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_ad_edit",
          id: editAdData.id,
          payload: editAdData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      alert("Ad campaign details updated successfully!");
      setEditAdData(null);
      handleRefresh();
    } catch (e: any) {
      alert(`Error updating campaign details: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteAd = async (ad: any) => {
    if (campaignActionLoading) return;
    if (!confirm("Are you sure you want to PERMANENTLY delete this Ad?")) {
      return;
    }

    setCampaignActionLoading(`delete-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_ad", id: ad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");

      alert("Ad campaign deleted successfully!");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deleting ad: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  // ----------------------------------------------------
  // HIGHLIGHT APPROVALS & OPERATIONS
  // ----------------------------------------------------

  const handleApproveHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    setCampaignActionLoading(`approve-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_highlight", id: highlight.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      alert("Highlight approved and published successfully!");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error approving highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleRejectHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    if (!confirm("Are you sure you want to permanently delete this highlight?")) {
      return;
    }

    setCampaignActionLoading(`reject-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_highlight", id: highlight.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      alert("Highlight deleted permanently.");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deleting highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const targetState = !highlight.is_paused;
    setCampaignActionLoading(`pause-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetState ? "pause_highlight" : "resume_highlight",
          id: highlight.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toggle failed");

      alert(`Highlight successfully ${targetState ? "paused" : "resumed"}!`);
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error updating highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleSaveHighlightEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHighlightData || !editHighlightData.id || campaignActionLoading) return;

    setCampaignActionLoading(`edit-hl-${editHighlightData.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_highlight_edit",
          id: editHighlightData.id,
          payload: editHighlightData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update highlight");

      alert("Highlight details updated successfully!");
      setEditHighlightData(null);
      handleRefresh();
    } catch (e: any) {
      alert(`Error saving highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    if (!confirm("Are you sure you want to PERMANENTLY delete this highlight?")) {
      return;
    }

    setCampaignActionLoading(`delete-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_highlight",
          id: highlight.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete highlight");

      alert("Highlight deleted successfully!");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      alert(`Error deleting highlight: ${e.message}`);
    } finally {
      setCampaignActionLoading(null);
    }
  };


  // ----------------------------------------------------
  // DIRECT POST CREATORS (ADMIN BYPASS)
  // ----------------------------------------------------

  const handlePostAdDirect = async (e: React.FormEvent) => {
    e.preventDefault();

    const adValidation = adminDirectAdSchema.safeParse({
      headline: adForm.adContent.slice(0, 50) || "Direct Admin Ad",
      content: adForm.adContent || "Admin direct ad content",
      ctaLink: adForm.actionWebsite || "https://xea.app",
      impressions: adForm.impressions,
      campaignDays: adForm.campaignDays,
      userEmail: adForm.userEmail,
    });

    if (!adValidation.success) {
      alert(adValidation.error.issues[0]?.message || "Invalid ad form submission.");
      return;
    }

    if (adForm.adMediaType !== "text" && adFormFiles.length === 0) {
      alert("Please select at least one media file to upload.");
      return;
    }

    setUploading(true);
    const adId = uuidv4();
    const costPerImpression = 0;
    const totalCost = 0;

    try {
      let mediaUrlString: string | null = null;

      if (adFormFiles.length > 0) {
        const mediaUrls: string[] = [];
        for (let i = 0; i < adFormFiles.length; i++) {
          const rawFile = adFormFiles[i];
          const file = rawFile.type.startsWith("image/") ? await resizeImageToMax1080p(rawFile) : rawFile;
          const sanitizedFileName = rawFile.name.replace(/[^\w.-]/g, "_");
          const uniqueFileName = `${adId}_${i}_${sanitizedFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("ad-media")
            .upload(uniqueFileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from("ad-media")
            .getPublicUrl(uniqueFileName);

          if (publicUrlData?.publicUrl) {
            mediaUrls.push(publicUrlData.publicUrl);
          }
        }
        mediaUrlString = JSON.stringify(mediaUrls);
      }

      // 2. Direct insert bypass into active 'addsactive' table via Admin API
      const adPayload = {
        id: adId,
        user_email: adForm.userEmail.toLowerCase().trim(),
        headline: adForm.adContent.slice(0, 50) || "Direct Admin Ad",
        content: adForm.adContent,
        cta_link: adForm.actionWebsite || "https://xea.app",
        cta_button_text: "Learn More",
        ad_type: adForm.adType,
        ad_media_type: adForm.adMediaType,
        media_url: mediaUrlString,
        impressions: adForm.impressions,
        impressions_remaining: adForm.impressions,
        campaign_days: adForm.campaignDays,
        daily_impression_cap: Math.ceil(adForm.impressions / adForm.campaignDays),
        daily_impression_count: 0,
        user_frequency_cap: adForm.userFrequencyCap,
        ad_media: mediaUrlString,
        ad_action_buttons: [
          adForm.actionPhone && "phone",
          adForm.actionWhatsapp && "whatsapp",
          adForm.actionWebsite && "website",
          adForm.actionEmail && "email"
        ].filter(Boolean) as string[],
        action_phone: adForm.actionPhone || null,
        action_whatsapp: adForm.actionWhatsapp || null,
        action_website: adForm.actionWebsite || null,
        action_email: adForm.actionEmail || null,
        cost_per_impression: costPerImpression,
        total_cost: totalCost,
        impression_count: 0,
        seen_users: []
      };

      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct_post_ad", payload: adPayload })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to publish ad directly");
      }

      alert("Ad published directly to active feed!");
      setAdForm({
          adType: "business",
          industry: [],
          interest: [],
          impressions: 1000,
          campaignDays: 5,
          userFrequencyCap: 1,
          country: "Nigeria",
          state: "",
          gender: "both",
          employmentStatus: "employed",
          adMediaType: "text",
          adContent: "",
          actionPhone: "",
          actionWhatsapp: "",
          actionWebsite: "",
          actionEmail: "",
          costPerImpression: 25,
          userEmail: "admin@paayh.com"
        });
        setAdFormFiles([]);
        handleTabChange("active-ads");
    } catch (e: any) {
      alert(`Unexpected direct posting error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePostHighlightDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!highlightFormFile) {
      alert("Please select a cover image file to upload.");
      return;
    }

    setUploading(true);
    const highlightId = uuidv4();

    try {
      // 1. Upload cover image to Supabase Storage Bucket with 1080p capping
      const rawFile = highlightFormFile;
      const file = rawFile.type.startsWith("image/") ? await resizeImageToMax1080p(rawFile) : rawFile;
      const sanitizedFileName = rawFile.name.replace(/[^\w.-]/g, "_");
      const uniqueFileName = `${highlightId}_${sanitizedFileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("news")
        .upload(uniqueFileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("news")
        .getPublicUrl(uniqueFileName);

      const mediaUrl = publicUrlData?.publicUrl || "";

      // 2. Insert Highlight Directly into public.newsactive via /api/admin/campaigns
      const newHighlight = {
        id: highlightId,
        title: highlightForm.title,
        content: highlightForm.content,
        image_url: mediaUrl,
        interest: highlightForm.interest,
        user_email: highlightForm.userEmail.toLowerCase().trim(),
      };

      const response = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct_post_highlight", payload: newHighlight })
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Highlight posting failed: ${errorData.error || "Server error"}`);
      } else {
        alert("Business highlight published directly to active feed!");
        setHighlightForm({
          title: "",
          content: "",
          interest: "Business",
          userEmail: "admin@paayh.com"
        });
        setHighlightFormFile(null);
        handleTabChange("active-highlights");
      }
    } catch (e: any) {
      alert(`Unexpected direct posting error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const toggleIndustryFormSelection = (item: string) => {
    setAdForm(prev => {
      const list = prev.industry;
      const updated = list.includes(item) ? list.filter(v => v !== item) : [...list, item];
      return { ...prev, industry: updated };
    });
  };

  const toggleInterestFormSelection = (item: string) => {
    setAdForm(prev => {
      const list = prev.interest;
      const updated = list.includes(item) ? list.filter(v => v !== item) : [...list, item];
      return { ...prev, interest: updated };
    });
  };

  // ----------------------------------------------------
  // PAGINATION CONTROLLER RENDERING
  // ----------------------------------------------------
  
  const renderPagination = (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    totalCount: number,
    limit: number = 10,
    setLimit?: (l: number) => void
  ) => {
    const totalPages = Math.ceil(totalCount / limit);
    if (totalCount === 0) return null;

    const fromItem = totalCount > 0 ? currentPage * limit + 1 : 0;
    const toItem = Math.min((currentPage + 1) * limit, totalCount);

    const pages: number[] = [];
    const maxVisible = 5;
    let startPage = Math.max(0, currentPage - 2);
    const endPage = Math.min(totalPages - 1, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(0, endPage - maxVisible + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className={styles.paginationContainer}>
        <div className={styles.paginationLeft}>
          <span className={styles.paginationInfo}>
            Showing <strong>{fromItem}–{toItem}</strong> of <strong>{totalCount}</strong>
          </span>
          {setLimit && (
            <div className={styles.pageSizeSelector}>
              <span>Per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setCurrentPage(0);
                }}
                className={styles.selectLimit}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className={styles.paginationGroup}>
            <button 
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className={`${styles.btnAction} ${styles.paginationBtn}`}
            >
              Prev
            </button>

            {startPage > 0 && (
              <>
                <button onClick={() => setCurrentPage(0)} className={`${styles.btnAction} ${styles.paginationNumBtn}`}>
                  1
                </button>
                {startPage > 1 && <span className={styles.paginationEllipsis}>…</span>}
              </>
            )}

            {pages.map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`${styles.btnAction} ${styles.paginationNumBtn} ${p === currentPage ? styles.paginationNumActive : ""}`}
              >
                {p + 1}
              </button>
            ))}

            {endPage < totalPages - 1 && (
              <>
                {endPage < totalPages - 2 && <span className={styles.paginationEllipsis}>…</span>}
                <button onClick={() => setCurrentPage(totalPages - 1)} className={`${styles.btnAction} ${styles.paginationNumBtn}`}>
                  {totalPages}
                </button>
              </>
            )}

            <button 
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className={`${styles.btnAction} ${styles.paginationBtn}`}
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDER HORIZONTAL INFORMATION-RICH ADMIN AD CARD
  // ----------------------------------------------------

  const renderAdminAdCard = (ad: any, isQueue = false) => {
    const seenCount = ad.impression_count ?? 0;
    const targetImpressions = ad.impressions ?? 1000;
    const deliveryPercent = Math.min(100, Math.round((seenCount / targetImpressions) * 100));
    const isCompleted = !!ad.completed_at || seenCount >= targetImpressions;

    const mediaUrls = ad.ad_media ? ad.ad_media.split(",").map((u: string) => u.trim()).filter(Boolean) : [];
    const hasMedia = mediaUrls.length > 0;
    const isVideo = ad.ad_media_type === "video" || (hasMedia && /\.(mp4|webm)$/i.test(mediaUrls[0]));

    return (
      <div 
        key={ad.id} 
        className={styles.card}
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: "1.25rem",
          padding: "1.25rem",
          borderRadius: "14px",
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          opacity: ad.is_paused ? 0.82 : 1,
          marginBottom: "1.25rem"
        }}
      >
        {/* Left Column: Media Box */}
        <div className={styles.adminCls_5}>
          <AdminAdMediaBox adMedia={ad.ad_media} adMediaType={ad.ad_media_type} />
        </div>

        {/* Right Main Column: Info, Analytics & Controls */}
        <div className={styles.adminCls_6}>
          
          {/* Top Tag Pills Row */}
          <div className={styles.adminCls_7}>
            {/* Media Type Tag Pill */}
            <span className={styles.adminCls_8}>
              {hasMedia ? (isVideo ? <Video size={13} /> : <ImageIcon size={13} />) : <Megaphone size={13} />}
              {hasMedia ? (isVideo ? "Video Ad" : "Image Ad") : "Text Only Ad"}
            </span>

            {/* Status Tag Pill */}
            {isQueue ? (
              <span className={styles.adminCls_9}>
                <Clock size={13} /> Pending Review
              </span>
            ) : isCompleted ? (
              <span className={styles.adminCls_10}>
                Completed
              </span>
            ) : ad.is_paused ? (
              <span className={styles.adminCls_11}>
                Paused
              </span>
            ) : (
              <span className={styles.adminCls_12}>
                Live
              </span>
            )}

            {/* Category Tag Pill */}
            <span className={styles.adminCls_13}>
              {ad.ad_type}
            </span>

            {/* Priority Bidded / Boosted Tag Pill */}
            {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
              <span className={styles.adminCls_14}>
                <Zap size={13} color="#f59e0b" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} (₦{ad.cost_per_impression || ad.impression || 25}/view)
              </span>
            )}
          </div>

          {/* Ad Content */}
          <p className={styles.adminCls_15}>
            {ad.ad_content}
          </p>

          {/* Publisher Metadata */}
          <div className={styles.adminCls_16}>
            <span>
              Publisher: <strong className={styles.textForeground}>
                {ad.publisher_name ? `${ad.publisher_name} (` : ""}
                {ad.publisher_handle || ad.custom_sponsor_handle || (ad.user_email ? `@${ad.user_email.split('@')[0]}` : "@user")}
                {ad.publisher_name ? ")" : ""}
              </strong>
              {ad.user_email && (
                <span className={styles.adminCls_17}>• {ad.user_email}</span>
              )}
            </span>
            <span>ID: <code className={styles.adminCls_18}>{ad.id}</code></span>
            <span>Created: {ad.created_at ? new Date(ad.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}</span>
          </div>

          {/* Delivery Progress Bar */}
          <div className={styles.adminCls_19}>
            <div className={styles.adminCls_20}>
              <span>Delivery Progress</span>
              <span>{deliveryPercent}% ({seenCount} / {targetImpressions} views)</span>
            </div>
            <div className={styles.adminCls_21}>
              <div style={{ height: "100%", backgroundColor: "#1d9bf0", width: `${deliveryPercent}%`, borderRadius: "3px" }} />
            </div>
          </div>

          {/* Admin Statement / Reason Callout Banner if present */}
          {ad.admin_statement && (
            <div className={styles.adminCls_22}>
              <strong className={styles.adminCls_23}>
                <AlertTriangle size={14} /> Admin Statement / Reason:
              </strong>
              {ad.admin_statement}
            </div>
          )}

          {/* Comprehensive Target Specs */}
          {renderAdDetails(ad)}

          {/* Action Control Panel */}
          <div className={styles.adminCls_24}>
            {isQueue ? (
              <>
                <button
                  onClick={() => handleApproveAd(ad)}
                  disabled={!!campaignActionLoading}
                  className={styles.btnSubmit}
                  style={{ padding: "0.45rem 1.25rem", fontSize: "0.82rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                >
                  {campaignActionLoading === `approve-ad-${ad.id}` ? "Approving..." : "Approve Campaign"}
                </button>
                <button
                  onClick={() => handleRejectAd(ad)}
                  disabled={!!campaignActionLoading}
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 1rem", fontSize: "0.82rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                  title="Permanently reject campaign and refund balance"
                >
                  <Trash2 size={14} />
                  <span>{campaignActionLoading === `reject-ad-${ad.id}` ? "Rejecting..." : "Reject / Delete"}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleTogglePauseAd(ad)}
                  disabled={isCompleted || !!campaignActionLoading}
                  className={styles.btnAction}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem", opacity: isCompleted || campaignActionLoading ? 0.7 : 1 }}
                >
                  {ad.is_paused ? <Play size={14} /> : <Pause size={14} />}
                  <span>{campaignActionLoading === `pause-ad-${ad.id}` ? "Updating..." : (ad.is_paused ? "Resume" : "Pause")}</span>
                </button>

                <button
                  onClick={() => handleDeactivateAd(ad)}
                  disabled={isCompleted || !!campaignActionLoading}
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem", backgroundColor: "rgba(239, 68, 68, 0.12)", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)", opacity: isCompleted || campaignActionLoading ? 0.7 : 1 }}
                  title="Deactivate campaign and set statement for advertiser"
                >
                  <AlertCircle size={14} />
                  <span>{campaignActionLoading === `deactivate-ad-${ad.id}` ? "Deactivating..." : "Deactivate Ad"}</span>
                </button>

                <button onClick={() => setEditAdData(ad)} disabled={!!campaignActionLoading} className={`${styles.btnAction} ${styles.adminCls_25}`} title="Edit campaign settings" >
                  <Edit3 size={14} />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => handleDeleteAd(ad)}
                  disabled={!!campaignActionLoading}
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                  title="Permanently delete campaign"
                >
                  <Trash2 size={14} />
                  <span>{campaignActionLoading === `delete-ad-${ad.id}` ? "Deleting..." : "Delete"}</span>
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    );
  };

  const renderAdminHighlightCard = (highlight: any, isQueue = false) => {
    return (
      <div key={highlight.id} className={styles.card} style={{ opacity: highlight.is_paused ? 0.75 : 1 }}>
        <div className={styles.mediaBox}>
          <img
            src={highlight.image_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"}
            alt="Highlight cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60";
            }}
          />
          <span className={styles.badgeCategory}>{highlight.interest}</span>
          
          {isQueue ? (
            <span className={`${styles.badgeStatus} ${styles.adminCls_26}`} >In Review</span>
          ) : highlight.is_paused ? (
            <span className={`${styles.badgeStatus} ${styles.adminCls_27}`} >Paused</span>
          ) : (
            <span className={`${styles.badgeStatus} ${styles.adminCls_28}`} >Live</span>
          )}
        </div>

        <div className={styles.cardBody}>
          <div className={styles.adminCls_29}>
            <h4 className={`${styles.cardTitle} ${styles.mZero}`} >{highlight.title}</h4>
            {(!!highlight.is_bidded || Number(highlight.bid_price || 0) > 1000) && (
              <span className={styles.adminCls_30}>
                <Zap size={10} color="#f59e0b" /> ₦{highlight.bid_price || 1500}/day
              </span>
            )}
          </div>
          <p className={`${styles.cardText} ${styles.adminCls_31}`} >{highlight.content}</p>

          {/* Admin Statement */}
          {highlight.admin_statement && (
            <div className={styles.adminCls_32}>
              <strong>Important Notice:</strong> {highlight.admin_statement}
            </div>
          )}

          <div className={styles.adminCls_33}>
            <span>
              Publisher: <strong className={styles.textForeground}>
                {highlight.publisher_name ? `${highlight.publisher_name} (` : ""}
                {highlight.publisher_handle || highlight.custom_sponsor_handle || (highlight.user_email ? `@${highlight.user_email.split('@')[0]}` : "@user")}
                {highlight.publisher_name ? ")" : ""}
              </strong>
              {highlight.user_email && (
                <span className={styles.adminCls_17}>• {highlight.user_email}</span>
              )}
            </span>
            <span>{highlight.created_at ? `Created: ${new Date(highlight.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""} · {highlight.country || "Global"} {highlight.state ? `(${highlight.state}${highlight.province ? `, ${highlight.province}` : ""})` : ""}</span>
          </div>
        </div>

        <div className={styles.cardFooterActions}>
          {isQueue ? (
            <>
              <button
                onClick={() => handleApproveHighlight(highlight)}
                disabled={!!campaignActionLoading}
                className={styles.btnSubmit}
                style={{ flex: 1, padding: "0.5rem", opacity: campaignActionLoading ? 0.7 : 1 }}
              >
                {campaignActionLoading === `approve-hl-${highlight.id}` ? "Approving..." : "Approve Highlight"}
              </button>
              <button
                onClick={() => handleRejectHighlight(highlight)}
                disabled={!!campaignActionLoading}
                className={`${styles.btnAction} ${styles.btnDanger}`}
                style={{ padding: "0.5rem 1rem", opacity: campaignActionLoading ? 0.7 : 1 }}
              >
                {campaignActionLoading === `reject-hl-${highlight.id}` ? "Rejecting..." : "Reject / Delete"}
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => handleTogglePauseHighlight(highlight)} 
                disabled={!!campaignActionLoading}
                className={styles.btnAction} 
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", opacity: campaignActionLoading ? 0.7 : 1 }}
              >
                {highlight.is_paused ? <Play size={14} /> : <Pause size={14} />}
                <span>{campaignActionLoading === `pause-hl-${highlight.id}` ? "Updating..." : (highlight.is_paused ? "Resume" : "Pause")}</span>
              </button>
              <button onClick={() => setEditHighlightData(highlight)} disabled={!!campaignActionLoading} className={`${styles.btnAction} ${styles.adminCls_34}`} title="Edit highlight" >
                <Edit3 size={14} />
              </button>
              <button
                onClick={() => handleDeleteHighlight(highlight)}
                disabled={!!campaignActionLoading}
                className={`${styles.btnAction} ${styles.btnDanger}`}
                style={{ padding: "0.5rem", opacity: campaignActionLoading ? 0.7 : 1 }}
                title="Delete highlight"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAdDetails = (ad: any) => {
    const formatList = (val: any) => {
      if (!val) return "None";
      if (Array.isArray(val)) return val.join(", ");
      return val.toString();
    };

    return (
      <div className={styles.adminCls_35}>
        <div className={styles.adminCls_36}>
          <div><strong>Category Type:</strong> <span className={styles.textForeground}>{ad.ad_type}</span></div>
          <div><strong>Frequency Cap:</strong> <span className={styles.textForeground}>{ad.user_frequency_cap || 1} view(s)/user</span></div>
          <div><strong>Target Views:</strong> <span className={styles.textForeground}>{ad.impressions}</span></div>
          <div><strong>Views Delivered:</strong> <span className={styles.textForeground}>{ad.impression_count ?? 0}</span></div>
          <div><strong>Campaign Duration:</strong> <span className={styles.textForeground}>{ad.campaign_days || 5} Days</span></div>
          <div><strong>Cost/Impression:</strong> <span className={styles.textForeground}>{formatCurrency(ad.cost_per_impression || ad.impression || 0)}</span></div>
          <div><strong>Total Budget:</strong> <span className={styles.textForeground}>{formatCurrency(ad.total_cost || ad.cost || 0)}</span></div>
          <div><strong>Gained Mutuals:</strong> <span className={styles.textForeground}>{ad.mutual_adds_count ?? 0}</span></div>
          <div><strong>Display Mutual+:</strong> <span style={{ color: ad.display_mutual_button ? "#10b981" : "#ef4444" }}>{ad.display_mutual_button ? "Enabled" : "Disabled"}</span></div>
          <div><strong>Target Gender:</strong> <span className={styles.textForeground}>{ad.gender || "Both"}</span></div>
        </div>

        <div className={styles.adminCls_37}>
          <div><strong>Targeting Age:</strong> <span className={styles.textForeground}>{ad.age_range ? `${ad.age_range[0]} - ${ad.age_range[1]} years` : "18 - 65 years"}</span></div>
          <div><strong>Targeting Geo:</strong> <span className={styles.textForeground}>{[ad.province, ad.state, ad.country].filter(Boolean).join(", ") || "Global"}</span></div>
          <div><strong>Targeting Employment:</strong> <span className={styles.textForeground}>{formatList(ad.employment_status)}</span></div>
          <div><strong>Targeting Industries:</strong> <span className={styles.textForeground}>{formatList(ad.industry)}</span></div>
          <div><strong>Targeting Interests:</strong> <span className={styles.textForeground}>{formatList(ad.interest)}</span></div>
          <div><strong>Targeting Lifestyle:</strong> <span className={styles.textForeground}>{formatList(ad.lifestyle)}</span></div>
          <div><strong>Targeting Behavior:</strong> <span className={styles.textForeground}>{formatList(ad.behavior)}</span></div>
          <div><strong>Targeting Personality:</strong> <span className={styles.textForeground}>{formatList(ad.personality)}</span></div>
          {ad.mutual_targets && ad.mutual_targets.length > 0 && (
            <div><strong>Mutual Targets:</strong> <span className={styles.textForeground}>{ad.mutual_targets.join(", ")}</span></div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.adminWrapper}>
      {/* HEADER BAR */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoGroup}>
            <div className={styles.logoIcon}>X</div>
            <span className={styles.appName}>Paayh Admin Portal</span>
            <span className={styles.badgeAdmin}>Database Controller</span>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              <span className={styles.userEmail}>{session.user?.email}</span>
            </div>
            
            {/* Theme Swapper */}
            <button
              onClick={() => setTheme(theme === "white" ? "dark" : "white")}
              title={mounted && theme === "white" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              aria-label="Toggle Theme"
              className={styles.adminCls_38}
            >
              {mounted && theme === "white" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <Link href="/">
              <button className={styles.btnExit}>
                <LogOut size={16} />
                <span>Exit Admin</span>
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* DASHBOARD PANELS */}
      <div className={styles.dashboardContent}>
        {/* Navigation Sidebar */}
        <aside className={styles.sidebar}>
          <button onClick={() => handleTabChange("overview")} className={`${styles.tabButton} ${activeTab === "overview" ? styles.tabButtonActive : ""}`}>
            <LayoutGrid size={18} />
            <span>Overview and Stats</span>
          </button>
          
          <button onClick={() => handleTabChange("accounts")} className={`${styles.tabButton} ${activeTab === "accounts" ? styles.tabButtonActive : ""}`}>
            <Users size={18} />
            <span>User Accounts ({stats.totalUsers})</span>
          </button>

          <button onClick={() => handleTabChange("ad-approvals")} className={`${styles.tabButton} ${activeTab === "ad-approvals" ? styles.tabButtonActive : ""}`}>
            <FileCheck2 size={18} />
            <span>Ad Approvals ({stats.pendingAdsCount})</span>
          </button>

          <button onClick={() => handleTabChange("highlight-approvals")} className={`${styles.tabButton} ${activeTab === "highlight-approvals" ? styles.tabButtonActive : ""}`}>
            <Sparkles size={18} />
            <span>Highlight Approvals ({stats.pendingHighlightsCount})</span>
          </button>

          <button onClick={() => handleTabChange("active-ads")} className={`${styles.tabButton} ${activeTab === "active-ads" ? styles.tabButtonActive : ""}`}>
            <TrendingUp size={18} />
            <span>Active Ads ({stats.activeAdsCount})</span>
          </button>

          <button onClick={() => handleTabChange("active-highlights")} className={`${styles.tabButton} ${activeTab === "active-highlights" ? styles.tabButtonActive : ""}`}>
            <Compass size={18} />
            <span>Active Highlights ({stats.activeHighlightsCount})</span>
          </button>

          <button onClick={() => handleTabChange("direct-post")} className={`${styles.tabButton} ${activeTab === "direct-post" ? styles.tabButtonActive : ""}`}>
            <PlusCircle size={18} />
            <span>Direct Posting Panel</span>
          </button>

          <button onClick={() => handleTabChange("help-center")} className={`${styles.tabButton} ${activeTab === "help-center" ? styles.tabButtonActive : ""}`}>
            <MessageCircle size={18} />
            <span>Help Center ({helpTicketsCount})</span>
          </button>

          <button onClick={() => handleTabChange("send-notifications")} className={`${styles.tabButton} ${activeTab === "send-notifications" ? styles.tabButtonActive : ""}`}>
            <Radio size={18} />
            <span>Send Announcements</span>
          </button>

          <button onClick={() => handleTabChange("reported-ads")} className={`${styles.tabButton} ${activeTab === "reported-ads" ? styles.tabButtonActive : ""}`}>
            <ShieldAlert size={18} />
            <span>Ad Guard / Reports ({reportedAdsCount})</span>
          </button>

          <button onClick={() => handleTabChange("queues")} className={`${styles.tabButton} ${activeTab === "queues" ? styles.tabButtonActive : ""}`}>
            <AlertCircle size={18} />
            <span>Failed Queues / DLQ</span>
          </button>

          <button onClick={() => handleTabChange("payout-management")} className={`${styles.tabButton} ${activeTab === "payout-management" ? styles.tabButtonActive : ""}`}>
            <Wallet size={18} />
            <span>Payouts & Queue Manager</span>
          </button>

          <button onClick={() => handleTabChange("master-statement")} className={`${styles.tabButton} ${activeTab === "master-statement" ? styles.tabButtonActive : ""}`}>
            <BarChart3 size={18} />
            <span>Master Statement</span>
          </button>

          <button onClick={() => handleTabChange("reconciliation")} className={`${styles.tabButton} ${activeTab === "reconciliation" ? styles.tabButtonActive : ""}`}>
            <FolderLock size={18} />
            <span>Financial Reconciliation</span>
          </button>

          <button onClick={() => handleTabChange("brand-subscribers")} className={`${styles.tabButton} ${activeTab === "brand-subscribers" ? styles.tabButtonActive : ""}`}>
            <Building2 size={18} />
            <span>Brand Subscribers {pendingSubscribersCount > 0 ? `(${pendingSubscribersCount})` : ""}</span>
          </button>

          <div className={styles.adminCls_39}>
            <button onClick={handleRefresh} disabled={refreshing || loading} className={`${styles.btnAction} ${styles.adminCls_40}`} >
              <RefreshCw size={14} className={refreshing ? "spin" : ""} />
              <span>{refreshing ? "Syncing..." : "Sync Database"}</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className={styles.mainPanel}>
          
          {/* 1. OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>System Performance</h1>
                <p className={styles.sectionSubtitle}>Real-time telemetry and database operational metrics.</p>
              </div>

              {loading ? (
                <div className={styles.loadingText}>Syncing metrics with database...</div>
              ) : (
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Total Registrations</span>
                      <div className={styles.statIconBox}><Users size={16} color="var(--primary)" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.totalUsers}</span>
                    <span className={styles.statDesc}>{stats.monetizedUsers} Monetized profiles</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Adverts Campaigns</span>
                      <div className={styles.statIconBox}><TrendingUp size={16} color="#3b82f6" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.activeAdsCount}</span>
                    <span className={styles.statDesc}>{stats.pendingAdsCount} awaiting admin approval</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Daily Highlights</span>
                      <div className={styles.statIconBox}><Sparkles size={16} color="#f59e0b" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.activeHighlightsCount}</span>
                    <span className={styles.statDesc}>{stats.pendingHighlightsCount} awaiting admin approval</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Wallet Liability</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={toggleAdminBalance}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: "2px",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                          title={showAdminBalance ? "Hide balance figures" : "Show balance figures"}
                          aria-label={showAdminBalance ? "Hide balance figures" : "Show balance figures"}
                        >
                          {showAdminBalance ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <div className={styles.statIconBox}><Wallet size={16} color="#10b981" /></div>
                      </div>
                    </div>
                    <span className={styles.statValue}>{showAdminBalance ? formatCurrency(stats.totalBalance) : "₦••••••••"}</span>
                    <span className={styles.statDesc}>{showAdminBalance ? formatCurrency(stats.totalWithdrawal) : "₦••••••••"} in withdrawals processing</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Total Ad Views</span>
                      <div className={styles.statIconBox}><Activity size={16} color="#6366f1" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.totalClicks}</span>
                    <span className={styles.statDesc}>Clicks CTR Rate: {stats.clickRate.toFixed(2)}%</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Aggregated Mutuals</span>
                      <div className={styles.statIconBox}><Users size={16} color="#06b6d4" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.totalMutuals}</span>
                    <span className={styles.statDesc}>Mutual bonds active across profiles</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Ad Guard and Reports</span>
                      <div className={styles.statIconBox}><ShieldAlert size={16} color="#ef4444" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.reportedCount}</span>
                    <span className={styles.statDesc}>Reported ads, advertisers and hidden items</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Help Center Complaints</span>
                      <div className={styles.statIconBox}><MessageCircle size={16} color="#8b5cf6" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.helpTicketsCount}</span>
                    <span className={styles.statDesc}>Total user tickets and complaints filed</span>
                  </div>

                  <div className={styles.statCard}>
                    <div className={styles.statHeader}>
                      <span className={styles.statLabel}>Paused Ad Campaigns</span>
                      <div className={styles.statIconBox}><Pause size={16} color="#eab308" /></div>
                    </div>
                    <span className={styles.statValue}>{stats.pausedAdsCount}</span>
                    <span className={styles.statDesc}>Campaigns currently paused</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 2. ACCOUNTS TAB */}
          {activeTab === "accounts" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>User Registry</h1>
                <p className={styles.sectionSubtitle}>View user profiles, adjust wallet balances, toggle monetization, and manage suspensions.</p>
              </div>

              <div className={styles.searchBar}>
                <input 
                  type="text" 
                  placeholder="Search accounts by username, email, phone, business name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setUsersPage(0);
                  }}
                  className={styles.inputSearch}
                />
              </div>

              {loading ? (
                <div className={styles.loadingText}>Loading accounts...</div>
              ) : users.length === 0 ? (
                <div className={styles.emptyText}>No registered users found matching query.</div>
              ) : (
                <>
                  {renderPagination(usersPage, setUsersPage, usersCount, usersLimit, setUsersLimit)}
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Profile Details</th>
                          <th className={styles.th}>Wallet</th>
                          <th className={styles.th}>Ad / Highlight Registry</th>
                          <th className={styles.th}>Ad Views / Clicks</th>
                          <th className={styles.th}>Monetization</th>
                          <th className={styles.th}>Ad Account Status</th>
                          <th className={styles.th}>Suspension</th>
                          <th className={styles.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(user => {
                          const isMonetized = user.monetized === "yes" || user.monetized === true;
                          const isSuspended = user.suspended_until && new Date(user.suspended_until).getTime() > Date.now();
                          const hasBusiness = user.business_name && user.business_name.trim() !== "";
                          
                          const isAdTempBanned = user.ad_account_status === "temp_banned" && user.ad_ban_until && new Date(user.ad_ban_until).getTime() > Date.now();
                          const isAdPermBanned = user.ad_account_status === "perm_banned";
                          const isAdDeactivated = user.ad_account_status === "deactivated";

                          const getAdBanCountdown = (untilStr: string | null) => {
                            if (!untilStr) return "";
                            const diffMs = new Date(untilStr).getTime() - Date.now();
                            if (diffMs <= 0) return "Expired";
                            const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
                            return `${days} day${days > 1 ? "s" : ""} left`;
                          };

                          return (
                            <tr key={user.id} className={styles.tr}>
                              <td className={styles.td}>
                                {hasBusiness ? (
                                  <>
                                    <div className={styles.adminCls_41}>{user.business_name}</div>
                                    <div className={styles.adminCls_42}>{user.firstName} {user.lastName}</div>
                                  </>
                                ) : (
                                  <div className={styles.fw700}>{user.firstName} {user.lastName}</div>
                                )}
                                <div className={styles.adminCls_43}>@{user.username?.replace(/^@/, "") || "user"}</div>
                                {user.created_at && (
                                  <div className={styles.adminCls_44}>
                                    Joined: {new Date(user.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                              </td>
                              <td className={styles.td}>
                                <div className={styles.fw800}>{formatCurrency(user.balance || 0)}</div>
                                <div className={styles.adminCls_45}>Pending: {formatCurrency(user.withdrawal || 0)}</div>
                              </td>
                              <td className={styles.td}>
                                <div><strong>Ads:</strong> {user.activeAdsCount} active / {user.reviewAdsCount} review</div>
                                <div><strong>Highlights:</strong> {user.activeHighlightsCount} active / {user.reviewHighlightsCount} review</div>
                              </td>
                              <td className={styles.td}>
                                <div><strong>Ad Clicks:</strong> {user.totalClicksOnAds ?? 0} clicks</div>
                                <div><strong>Mutuals:</strong> {user.mutual_count ?? 0} / 50</div>
                              </td>
                              <td className={styles.td}>
                                <span className={`${styles.userBadge} ${isMonetized ? styles.monetizedYes : ""}`}>
                                  {isMonetized ? "Monetized" : "Free Tier"}
                                </span>
                              </td>
                              <td className={styles.td}>
                                {isAdTempBanned ? (
                                  <div>
                                    <span className={`${styles.userBadge} ${styles.adminCls_46}`} >
                                      TEMP BANNED ({getAdBanCountdown(user.ad_ban_until)})
                                    </span>
                                    {user.ad_ban_reason && <div className={styles.adminCls_47}>Reason: {user.ad_ban_reason}</div>}
                                  </div>
                                ) : isAdPermBanned ? (
                                  <div>
                                    <span className={`${styles.userBadge} ${styles.adminCls_48}`} >
                                      PERM BANNED
                                    </span>
                                    {user.ad_ban_reason && <div className={styles.adminCls_47}>Reason: {user.ad_ban_reason}</div>}
                                  </div>
                                ) : isAdDeactivated ? (
                                  <div>
                                    <span className={`${styles.userBadge} ${styles.adminCls_49}`} >
                                      DEACTIVATED
                                    </span>
                                    {user.ad_ban_reason && <div className={styles.adminCls_47}>Reason: {user.ad_ban_reason}</div>}
                                  </div>
                                ) : (
                                  <span className={`${styles.userBadge} ${styles.adminCls_50}`} >
                                    ACTIVE
                                  </span>
                                )}
                              </td>
                              <td className={styles.td}>
                                {isSuspended ? (
                                  <span className={`${styles.userBadge} ${styles.suspendedYes}`} title={`Until: ${new Date(user.suspended_until).toLocaleString()}`}>
                                    Suspended
                                  </span>
                                ) : (
                                  <span className={styles.userBadge}>Active</span>
                                )}
                              </td>
                              <td className={styles.td}>
                                <div className={styles.actionsCell}>
                                  <button onClick={() => setSelectedUser(user)} className={styles.btnAction}>
                                    Manage Profile
                                  </button>
                                  <button 
                                    onClick={() => handleToggleMonetization(user)} 
                                    className={`${styles.btnAction} ${isMonetized ? styles.btnDanger : styles.btnSuccess}`}
                                  >
                                    {isMonetized ? "Disable Earn" : "Enable Earn"}
                                  </button>
                                  <button onClick={() => { setBanModalUser(user); setBanModalStatus(user.ad_account_status || "temp_banned"); setBanModalReason(user.ad_ban_reason || ""); }} className={`${styles.btnAction} ${styles.adminCls_51}`} >
                                    Ad Ban / Restrict
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(usersPage, setUsersPage, usersCount, usersLimit, setUsersLimit)}
                </>
              )}
            </>
          )}

          {/* 3. AD APPROVALS TAB */}
          {activeTab === "ad-approvals" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Advert Approvals Queue ({pendingAdsCount})</h1>
                <p className={styles.sectionSubtitle}>Verify and activate submitted ad campaigns. Rejected campaigns are permanently deleted.</p>
              </div>

              {loading ? (
                <div className={styles.loadingText}>Syncing review queue...</div>
              ) : pendingAds.length === 0 ? (
                <div className={styles.emptyText}>
                  <CheckCircle size={32} className={styles.adminCls_52} />
                  <span>No campaigns in the review queue. All caught up!</span>
                </div>
              ) : (
                <>
                  <div className={styles.adminCls_53}>
                    {pendingAds.map(ad => renderAdminAdCard(ad, true))}
                  </div>
                  {renderPagination(pendingAdsPage, setPendingAdsPage, pendingAdsCount)}
                </>
              )}
            </>
          )}

          {/* 4. HIGHLIGHT APPROVALS TAB */}
          {activeTab === "highlight-approvals" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Highlights Approvals Queue ({pendingHighlightsCount})</h1>
                <p className={styles.sectionSubtitle}>Approve business highlights for 24-hour flash feeds. Rejected highlights are permanently deleted.</p>
              </div>

              {loading ? (
                <div className={styles.loadingText}>Syncing news queue...</div>
              ) : pendingHighlights.length === 0 ? (
                <div className={styles.emptyText}>
                  <CheckCircle size={32} className={styles.adminCls_52} />
                  <span>No highlights in the review queue. All caught up!</span>
                </div>
              ) : (
                <>
                  <div className={styles.queueGrid}>
                    {pendingHighlights.map(highlight => renderAdminHighlightCard(highlight, true))}
                  </div>
                  {renderPagination(pendingHighlightsPage, setPendingHighlightsPage, pendingHighlightsCount)}
                </>
              )}
            </>
          )}

          {/* 5. ACTIVE ADS TAB */}
          {activeTab === "active-ads" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Active Adverts Registry ({activeAdsCount})</h1>
                <p className={styles.sectionSubtitle}>Monitor live campaigns, track views, toggle pauses, edit details, and suspend campaigns.</p>
              </div>

              <div className={styles.searchBar}>
                <input 
                  type="text" 
                  placeholder="Filter active ads by publisher, content, category..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setActiveAdsPage(0);
                  }}
                  className={styles.inputSearch}
                />
              </div>

              {loading ? (
                <div className={styles.loadingText}>Loading active campaigns...</div>
              ) : activeAds.length === 0 ? (
                <div className={styles.emptyText}>No active campaigns found matching filters.</div>
              ) : (
                <>
                  <div className={styles.adminCls_53}>
                    {activeAds.map(ad => renderAdminAdCard(ad, false))}
                  </div>
                  {renderPagination(activeAdsPage, setActiveAdsPage, activeAdsCount)}
                </>
              )}
            </>
          )}

          {/* 6. ACTIVE HIGHLIGHTS TAB */}
          {activeTab === "active-highlights" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Active Highlights Registry ({activeHighlightsCount})</h1>
                <p className={styles.sectionSubtitle}>Monitor live business highlights, edit contents, and suspend highlights from the feeds.</p>
              </div>

              <div className={styles.searchBar}>
                <input 
                  type="text" 
                  placeholder="Filter active highlights by title, publisher, category..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setActiveHighlightsPage(0);
                  }}
                  className={styles.inputSearch}
                />
              </div>

              {loading ? (
                <div className={styles.loadingText}>Loading active highlights...</div>
              ) : activeHighlights.length === 0 ? (
                <div className={styles.emptyText}>No active business highlights found matching filters.</div>
              ) : (
                <>
                  <div className={styles.queueGrid}>
                    {activeHighlights.map(highlight => renderAdminHighlightCard(highlight, false))}
                  </div>
                  {renderPagination(activeHighlightsPage, setActiveHighlightsPage, activeHighlightsCount)}
                </>
              )}
            </>
          )}

          {/* 7. DIRECT POST TAB */}
          {activeTab === "direct-post" && (
            <div className={styles.adminCls_54}>
              {/* Direct Ad Form */}
              <form onSubmit={handlePostAdDirect} className={`${styles.form} ${styles.adminCls_55}`} >
                <h2 className={styles.adminCls_56}>
                  <PlusCircle size={20} className={styles.textPrimary} />
                  <span>Directly Post approved Ad</span>
                </h2>
                <p className={styles.adminCls_57}>Upload file and set parameters. Posted ads bypass the review queues.</p>
                
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Publisher Email</label>
                  <input 
                    type="email" 
                    required 
                    value={adForm.userEmail}
                    onChange={(e) => setAdForm({...adForm, userEmail: e.target.value})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Ad Category Type</label>
                    <select value={adForm.adType} onChange={(e) => setAdForm({...adForm, adType: e.target.value})} className={styles.selectField}>
                      <option value="business">Business</option>
                      <option value="individual">Individual</option>
                      <option value="politics">Politics</option>
                      <option value="religion">Religion</option>
                      <option value="government">Government</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Media Type</label>
                    <select value={adForm.adMediaType} onChange={(e) => { setAdForm({...adForm, adMediaType: e.target.value}); setAdFormFiles([]); }} className={styles.selectField}>
                      <option value="text">Text Only</option>
                      <option value="image">Image(s) (Up to 4)</option>
                      <option value="video">Video Only (Max 1)</option>
                      <option value="mixed">Mixed (Up to 3 Images + 1 Video)</option>
                    </select>
                  </div>
                </div>

                {adForm.adMediaType !== "text" && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Select Files</label>
                    <input 
                      type="file" 
                      required
                      multiple={adForm.adMediaType !== "video"}
                      accept={
                        adForm.adMediaType === "video"
                          ? "video/*"
                          : adForm.adMediaType === "image"
                          ? "image/*"
                          : "image/*,video/*"
                      }
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files) return;
                        const fileArray = Array.from(files);

                        // Validation
                        const images = fileArray.filter(f => f.type.startsWith("image/"));
                        const videos = fileArray.filter(f => f.type.startsWith("video/"));

                        if (adForm.adMediaType === "image") {
                          if (videos.length > 0) {
                            alert("Only images are allowed for this type.");
                            e.target.value = "";
                            return;
                          }
                          if (images.length > 4) {
                            alert("You can select up to 4 images only.");
                            e.target.value = "";
                            return;
                          }
                        } else if (adForm.adMediaType === "video") {
                          if (images.length > 0) {
                            alert("Only videos are allowed for this type.");
                            e.target.value = "";
                            return;
                          }
                          if (videos.length > 1) {
                            alert("You can select only 1 video.");
                            e.target.value = "";
                            return;
                          }
                        } else if (adForm.adMediaType === "mixed") {
                          if (videos.length > 1) {
                            alert("You can select at most 1 video.");
                            e.target.value = "";
                            return;
                          }
                          if (images.length > 3) {
                            alert("You can select at most 3 images.");
                            e.target.value = "";
                            return;
                          }
                          if (images.length + videos.length > 4) {
                            alert("Total number of files cannot exceed 4.");
                            e.target.value = "";
                            return;
                          }
                        }

                        setAdFormFiles(fileArray);
                      }}
                      className={styles.adminCls_58}
                    />
                    {adFormFiles.length > 0 && (
                      <div className={styles.adminCls_59}>
                        Selected: {adFormFiles.map(f => f.name).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Targeting Industry (Select multiple)</label>
                  <div className={styles.optionsGrid}>
                    {industriesList.map(ind => (
                      <label key={ind} className={styles.optionLabel}>
                        <input 
                          type="checkbox" 
                          checked={adForm.industry.includes(ind)}
                          onChange={() => toggleIndustryFormSelection(ind)}
                        />
                        <span>{ind}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Targeting Interests (Select multiple)</label>
                  <div className={styles.optionsGrid}>
                    {interestsList.map(int => (
                      <label key={int} className={styles.optionLabel}>
                        <input 
                          type="checkbox" 
                          checked={adForm.interest.includes(int)}
                          onChange={() => toggleInterestFormSelection(int)}
                        />
                        <span>{int}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Target Impressions</label>
                    <input 
                      type="number" 
                      required 
                      min="100"
                      value={adForm.impressions}
                      onChange={(e) => setAdForm({...adForm, impressions: parseInt(e.target.value) || 0})}
                      className={styles.inputField} 
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Campaign Days</label>
                    <input 
                      type="number" 
                      required 
                      min="1"
                      value={adForm.campaignDays}
                      onChange={(e) => setAdForm({...adForm, campaignDays: parseInt(e.target.value) || 1})}
                      className={styles.inputField} 
                    />
                  </div>
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Frequency Cap (Views per User)</label>
                    <select 
                      value={adForm.userFrequencyCap} 
                      onChange={(e) => setAdForm({...adForm, userFrequencyCap: parseInt(e.target.value) || 1})} 
                      className={styles.selectField}
                    >
                      {[1,2,3,4,5,6,7,8,9,10].map(val => (
                        <option key={val} value={val}>{val} view(s)</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Cost per Impression (₦)</label>
                    <input type="number" disabled value="0" className={`${styles.inputField} ${styles.adminCls_60}`} />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ad content text (No links allowed)</label>
                  <textarea 
                    required 
                    placeholder="Write ad description text..." 
                    value={adForm.adContent}
                    onChange={(e) => setAdForm({...adForm, adContent: e.target.value})}
                    className={styles.textareaField}
                  />
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Phone Link</label>
                    <input 
                      type="text" 
                      placeholder="+234..." 
                      value={adForm.actionPhone}
                      onChange={(e) => setAdForm({...adForm, actionPhone: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Whatsapp Link</label>
                    <input 
                      type="text" 
                      placeholder="+234..." 
                      value={adForm.actionWhatsapp}
                      onChange={(e) => setAdForm({...adForm, actionWhatsapp: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Website Link</label>
                    <input 
                      type="text" 
                      placeholder="https://..." 
                      value={adForm.actionWebsite}
                      onChange={(e) => setAdForm({...adForm, actionWebsite: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Email Link</label>
                    <input 
                      type="email" 
                      placeholder="business@paayh.com" 
                      value={adForm.actionEmail}
                      onChange={(e) => setAdForm({...adForm, actionEmail: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>
                </div>

                <button type="submit" disabled={uploading} className={styles.btnSubmit}>
                  {uploading ? "Uploading media and publishing..." : "Publish Ad Directly"}
                </button>
              </form>

              {/* Direct Highlight Form */}
              <form onSubmit={handlePostHighlightDirect} className={`${styles.form} ${styles.adminCls_61}`} >
                <h2 className={styles.adminCls_56}>
                  <PlusCircle size={20} className={styles.textPrimary} />
                  <span>Directly Post approved Highlight</span>
                </h2>
                <p className={styles.adminCls_57}>Upload cover image and post highlight directly to live feeds.</p>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Publisher Email</label>
                  <input 
                    type="email" 
                    required 
                    value={highlightForm.userEmail}
                    onChange={(e) => setHighlightForm({...highlightForm, userEmail: e.target.value})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Highlight Title</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Enter highlight title..." 
                    value={highlightForm.title}
                    onChange={(e) => setHighlightForm({...highlightForm, title: e.target.value})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Category Interest</label>
                  <select value={highlightForm.interest} onChange={(e) => setHighlightForm({...highlightForm, interest: e.target.value})} className={styles.selectField}>
                    {interestsList.map(int => (
                      <option key={int} value={int}>{int}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Cover Image</label>
                  <input 
                    type="file" 
                    required
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setHighlightFormFile(file);
                    }}
                    className={styles.adminCls_58}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Highlight Details</label>
                  <textarea 
                    required 
                    placeholder="Write details content..." 
                    value={highlightForm.content}
                    onChange={(e) => setHighlightForm({...highlightForm, content: e.target.value})}
                    className={styles.textareaField}
                  />
                </div>

                <button type="submit" disabled={uploading} className={styles.btnSubmit}>
                  {uploading ? "Uploading cover image and publishing..." : "Publish Highlight Directly"}
                </button>
              </form>
            </div>
          )}

          {/* 8. HELP CENTER TAB */}
          {activeTab === "help-center" && (
            <>
              <h1 className={styles.sectionTitle}>Help Center — User Tickets</h1>
              <p className={styles.sectionSubtitle}>View and reply to user-submitted support requests.</p>

              {/* Search */}
              <div className={styles.adminCls_62}>
                <div className={styles.adminCls_63}>
                  <Search size={15} className={styles.adminCls_64} />
                  <input type="text" placeholder="Search by email, subject, or category..." value={helpTicketSearch} onChange={(e) => { setHelpTicketSearch(e.target.value); setHelpTicketsPage(0); }} className={`${styles.inputField} ${styles.adminCls_65}`} />
                </div>
              </div>

              {loading ? (
                <p className={styles.adminCls_66}>Loading tickets...</p>
              ) : helpTickets.length === 0 ? (
                <p className={styles.adminCls_66}>No tickets found.</p>
              ) : (
                <>
                  <div className={styles.adminCls_53}>
                    {helpTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className={styles.adminCls_67}
                      >
                        {/* Ticket header */}
                        <div className={styles.adminCls_68}>
                          <div>
                            <span className={styles.adminCls_69}>{ticket.subject}</span>
                            <div className={styles.adminCls_70}>
                              <span style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "0.15rem 0.6rem",
                                borderRadius: "99px",
                                textTransform: "uppercase" as const,
                                background: ticket.status === "closed" || ticket.status === "resolved" ? "rgba(16,185,129,0.15)" : ticket.status === "replied" ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)",
                                color: ticket.status === "closed" || ticket.status === "resolved" ? "#10b981" : ticket.status === "replied" ? "#34d399" : "#fbbf24"
                              }}>
                                {ticket.status === "closed" || ticket.status === "resolved" ? "CLOSED (Deletes in 24h)" : ticket.status.toUpperCase()}
                              </span>
                              <span className={styles.adminCls_71}>{ticket.category}</span>
                              <span className={styles.adminCls_72}>
                                {new Date(ticket.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                          {/* Actions */}
                          <div className={styles.adminCls_73}>
                            <button onClick={() => { setReplyingTicket(ticket); setReplyText(ticket.admin_reply || ""); }} className={`${styles.btnAction} ${styles.adminCls_74}`} >
                              <Reply size={13} /> Reply
                            </button>
                            {ticket.status !== "resolved" && ticket.status !== "closed" && (
                              <button onClick={() => handleCloseTicket(ticket)} className={`${styles.btnAction} ${styles.adminCls_75}`} >
                                <CheckCircle size={13} /> Mark as Closed
                              </button>
                            )}
                            <button onClick={() => handleDeleteTicket(ticket.id)} className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_76}`} >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <p className={styles.adminCls_77}>
                          <strong className={styles.textForeground}>From:</strong> {ticket.name ? `${ticket.name} — ` : ""}{ticket.user_email}
                        </p>
                        <p className={styles.adminCls_78}>{ticket.message}</p>

                        {/* Existing reply */}
                        {ticket.admin_reply && (
                          <div className={styles.adminCls_79}>
                            <div className={styles.adminCls_80}>
                              <p className={styles.adminCls_81}>Admin Reply</p>
                              {ticket.replied_at && (
                                <span className={styles.adminCls_82}>
                                  Replied: {new Date(ticket.replied_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </div>
                            <p className={styles.adminCls_83}>{ticket.admin_reply}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  <div className={styles.adminCls_84}>
                    <button
                      onClick={() => setHelpTicketsPage((p) => Math.max(0, p - 1))}
                      disabled={helpTicketsPage === 0}
                      className={styles.btnAction}
                    >
                      Prev
                    </button>
                    <span className={styles.adminCls_85}>
                      Page {helpTicketsPage + 1} of {Math.max(1, Math.ceil(helpTicketsCount / 10))} ({helpTicketsCount} total)
                    </span>
                    <button
                      onClick={() => setHelpTicketsPage((p) => p + 1)}
                      disabled={(helpTicketsPage + 1) * 10 >= helpTicketsCount}
                      className={styles.btnAction}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* 9. SEND ANNOUNCEMENTS / NOTIFICATIONS TAB */}
          {activeTab === "send-notifications" && (
            <>
              <h1 className={styles.sectionTitle}>Send Announcements and Payouts Notifications</h1>
              <p className={styles.sectionSubtitle}>Broadcast push notifications directly to user segments or specific accounts.</p>

              <div className={styles.adminCls_86}>
                <form onSubmit={handleSendNotification} className={styles.adminCls_87}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Notification Target Segment</label>
                    <select value={notificationTarget} onChange={(e: any) => setNotificationTarget(e.target.value)} className={`${styles.selectField} ${styles.wFull}`} >
                      <option value="all">All Registered Users</option>
                      <option value="monetized">Monetized Users Only</option>
                      <option value="user">Specific User by Email</option>
                    </select>
                  </div>

                  {notificationTarget === "user" && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Target User Email Address</label>
                      <input type="email" required placeholder="user@example.com" value={notificationTargetEmail} onChange={(e) => setNotificationTargetEmail(e.target.value)} className={`${styles.inputField} ${styles.wFull}`} />
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Message Title</label>
                    <input type="text" required placeholder="e.g. Account Update" value={notificationTitle} onChange={(e) => setNotificationTitle(e.target.value)} className={`${styles.inputField} ${styles.wFull}`} />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Message Body Content</label>
                    <textarea required rows={5} placeholder="Write your announcement details here..." value={notificationMessage} onChange={(e) => setNotificationMessage(e.target.value)} className={`${styles.textareaField} ${styles.adminCls_88}`} />
                  </div>

                  {notificationSuccessMsg && (
                    <div className={styles.adminCls_89}>
                      {notificationSuccessMsg}
                    </div>
                  )}

                  {notificationErrorMsg && (
                    <div className={styles.adminCls_90}>
                      {notificationErrorMsg}
                    </div>
                  )}

                  <button type="submit" disabled={notificationLoading} className={`${styles.btnSubmit} ${styles.adminCls_91}`} >
                    {notificationLoading ? "Broadcasting message..." : "Broadcast Announcement"}
                  </button>
                </form>
              </div>
            </>
          )}

          {/* 10. REPORTED ADS / AD GUARD TAB */}
          {activeTab === "reported-ads" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Ad Guard and Content Reports</h1>
                <p className={styles.sectionSubtitle}>Review user-reported ads and advertisers. Take instant action to remove ad campaigns or block advertiser accounts.</p>
              </div>

              <div className={styles.reportSearchBarContainer}>
                <Search className={styles.reportSearchIcon} size={18} />
                <input
                  type="text"
                  placeholder="Search reports by Ad ID, reporter email, advertiser email, or reason..."
                  value={reportedAdsSearch}
                  onChange={(e) => {
                    setReportedAdsSearch(e.target.value);
                    setReportedAdsPage(0);
                  }}
                  className={styles.reportSearchInput}
                />
              </div>

              {loading ? (
                <div className={styles.loadingText}>Fetching reported ads from database...</div>
              ) : reportedAds.length === 0 ? (
                <div className={styles.emptyState}>No ad or advertiser reports found.</div>
              ) : (
                <>
                  <div className={styles.cardsGrid}>
                    {reportedAds.map((report) => (
                      <div key={report.id} className={styles.cardItem}>
                        <div className={styles.cardHeader}>
                          <div>
                            <h3 className={styles.cardTitle}>Report ID: {report.id.slice(0, 8)}</h3>
                            <span className={styles.cardMeta}>
                              Reported by: <strong className={styles.textForeground}>{report.reporter_email}</strong> · Reported on {new Date(report.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <span style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: "99px",
                            backgroundColor: report.status === "action_taken" ? "rgba(239,68,68,0.15)" : report.status === "dismissed" ? "rgba(255,255,255,0.05)" : "rgba(245,158,11,0.15)",
                            color: report.status === "action_taken" ? "#ef4444" : report.status === "dismissed" ? "var(--text-muted)" : "#f59e0b",
                            border: `1px solid ${report.status === "action_taken" ? "rgba(239,68,68,0.3)" : report.status === "dismissed" ? "var(--card-border)" : "rgba(245,158,11,0.3)"}`
                          }}>
                            {report.status.toUpperCase()}
                          </span>
                        </div>

                        <div className={`${styles.cardBody} ${styles.adminCls_92}`} >
                          <div><strong>Report Type:</strong> <span style={{ color: report.report_type === "advertiser" ? "#ef4444" : "#2563eb", fontWeight: 600 }}>{report.report_type === "advertiser" ? "Block and Report Advertiser" : "Block and Report Ad"}</span></div>
                          <div className={styles.adminCls_93}>
                            <strong>Target Ad ID:</strong>
                            <button
                              type="button"
                              onClick={() => handleInspectAd(report.ad_id)}
                              title="Click to inspect full ad details"
                              className={styles.inspectAdLink}
                            >
                              <span>{report.ad_id}</span>
                              <span>(Inspect Ad Details)</span>
                            </button>
                          </div>
                          {report.advertiser_email && <div><strong>Advertiser Email:</strong> <code className={styles.adminCls_94}>{report.advertiser_email}</code></div>}
                          {report.reason && (
                            <div className={styles.reportReasonBox}>
                              <strong className={styles.textForeground}>User Reason:</strong> {report.reason}
                            </div>
                          )}
                        </div>

                        <div className={`${styles.cardFooter} ${styles.adminCls_95}`} >
                          <button
                            onClick={() => handleInspectAd(report.ad_id)}
                            className={styles.inspectAdLink}
                          >
                            Inspect Ad Details
                          </button>
                          <button
                            onClick={() => handleDeactivateReportedAd(report.ad_id, report.id)}
                            disabled={adActionLoading === `deactivate-${report.id || report.ad_id}`}
                            className={`${styles.btnAction} ${styles.btnDanger}`}
                          >
                            {adActionLoading === `deactivate-${report.id || report.ad_id}` ? "Deactivating..." : "Deactivate Ad for All Users"}
                          </button>
                          {report.advertiser_email && (
                            <button
                              onClick={() => handleBlockReportedAdvertiser(report.advertiser_email, report.id)}
                              disabled={adActionLoading === `block-${report.id || report.advertiser_email}`}
                              className={`${styles.btnAction} ${styles.btnDanger}`}
                            >
                              {adActionLoading === `block-${report.id || report.advertiser_email}` ? "Blocking..." : "Block Advertiser Account"}
                            </button>
                          )}
                          {report.status === "pending" && (
                            <button
                              onClick={() => handleDismissReport(report.id)}
                              disabled={adActionLoading === `dismiss-${report.id}`}
                              className={styles.btnAction}
                            >
                              {adActionLoading === `dismiss-${report.id}` ? "Dismissing..." : "Dismiss Report"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {renderPagination(reportedAdsPage, setReportedAdsPage, reportedAdsCount)}
                </>
              )}
            </>
          )}

          {/* 11. FAILED QUEUES / DLQ TAB */}
          {activeTab === "queues" && (
            <>
              <div className={styles.adminCls_96}>
                <div>
                  <h1 className={styles.sectionTitle}>Failed Queues and Dead Letter Queue (DLQ)</h1>
                  <p className={styles.sectionSubtitle}>Inspect background queue jobs that failed maximum retries. Manually trigger retries or clear stale queue entries.</p>
                </div>
                <div className={styles.adminCls_97}>
                  <button onClick={handleRetryDlqAll} disabled={dlqLoading || dlqJobs.length === 0} className={`${styles.btnAction} ${styles.adminCls_98}`} >
                    <RefreshCw size={14} className={dlqLoading ? "spin" : ""} />
                    <span>Retry All Failed Jobs ({dlqCount})</span>
                  </button>
                  <button
                    onClick={handleClearDlqAll}
                    disabled={dlqLoading || dlqJobs.length === 0}
                    className={`${styles.btnAction} ${styles.btnDanger}`}
                  >
                    Clear DLQ
                  </button>
                </div>
              </div>

              {dlqActionStatus && (
                <div className={styles.adminCls_99}>
                  {dlqActionStatus}
                </div>
              )}

              {dlqLoading ? (
                <div className={styles.loadingText}>Fetching DLQ entries from Redis...</div>
              ) : dlqJobs.length === 0 ? (
                <div className={styles.emptyState}>No failed background queue jobs. All systems operational!</div>
              ) : (
                <div className={styles.cardsGrid}>
                  {dlqJobs.map((job) => (
                    <div key={job.id} className={styles.cardItem}>
                      <div className={styles.cardHeader}>
                        <div>
                          <h3 className={styles.cardTitle}>Job: {job.name || job.id}</h3>
                          <span className={styles.cardMeta}>
                            Failed at: {job.failedAt ? new Date(job.failedAt).toLocaleString() : "Unknown"}
                          </span>
                        </div>
                        <span className={styles.adminCls_100}>
                          FAILED
                        </span>
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.adminCls_101}>
                          <strong>Reason:</strong> {job.failedReason || "Exhausted retry limits"}
                        </div>
                        <pre className={styles.adminCls_102}>
                          {JSON.stringify(job.data || job.rawPayload || {}, null, 2)}
                        </pre>
                      </div>

                      <div className={styles.cardFooter}>
                        <button onClick={() => handleRetryDlqSingle(job.id)} className={`${styles.btnAction} ${styles.adminCls_103}`} >
                          Retry Job
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 11. PAYOUTS & QUEUE MANAGER TAB */}
          {activeTab === "payout-management" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Payouts & Queue Manager</h1>
                <p className={styles.sectionSubtitle}>
                  Real-time float monitoring, manual batch payout execution, and single or bulk payout retry engine.
                </p>
              </div>
              <AdminPayoutsTab />
            </>
          )}

          {/* 12. MASTER PLATFORM STATEMENT TAB */}
          {activeTab === "master-statement" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Platform Master Statement</h1>
                <p className={styles.sectionSubtitle}>
                  Unified platform transaction ledger with indexed multi-criteria filtering, aggregated financial flows, and instant CSV export.
                </p>
              </div>
              <AdminMasterStatementTab />
            </>
          )}

          {/* 13. FINANCIAL RECONCILIATION & SECURITY AUDITS TAB */}
          {activeTab === "reconciliation" && (
            <AdminReconciliationTab renderPagination={renderPagination} />
          )}

          {/* 14. BRAND SUBSCRIBERS / PREMIUM SUBSCRIBERS TAB */}
          {activeTab === "brand-subscribers" && (
            <AdminBrandSubscribersTab renderPagination={renderPagination} />
          )}

        </main>
      </div>

      {/* ==================================================== */}
      {/* MODAL: USER DETAILED PROFILE OPERATIONS */}
      {/* ==================================================== */}
      {selectedUser && (
        <div className={styles.modalOverlay} onClick={() => setSelectedUser(null)}>
          <div className={`${styles.modalContent} ${styles.adminCls_159}`} onClick={(e) => e.stopPropagation()} >
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_160}>
                <div className={styles.adminCls_161}>
                  {selectedUser.firstName ? selectedUser.firstName.slice(0, 2).toUpperCase() : "US"}
                </div>
                <div>
                  <h3 className={`${styles.modalTitle} ${styles.mZero}`} >
                    {selectedUser.business_name || `${selectedUser.firstName} ${selectedUser.lastName}`}
                  </h3>
                  <div className={styles.adminCls_162}>
                    @{selectedUser.username.split("@")[0]} &bull; {selectedUser.email}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className={styles.btnClose}>
                <XCircle size={22} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Profile Overview Card */}
              <div className={styles.modalSectionCard}>
                <h4 className={styles.modalSectionTitle}>Account and Contact Details</h4>
                <div className={styles.gridTwoCol}>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Full Name</span>
                    <span className={styles.fieldValue}>{selectedUser.firstName} {selectedUser.lastName}</span>
                  </div>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Business / Rep Name</span>
                    <span className={styles.fieldValue}>{selectedUser.business_name || "N/A"}</span>
                  </div>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Country and State</span>
                    <span className={styles.fieldValue}>{selectedUser.state ? `${selectedUser.state}, ` : ""}{selectedUser.country || "Not set"}</span>
                  </div>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Phone Number</span>
                    <span className={styles.fieldValue}>{selectedUser.phone || "Not set"}</span>
                  </div>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Registration Date and Time</span>
                    <span className={styles.fieldValue}>
                      {selectedUser.created_at
                        ? new Date(selectedUser.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "Not recorded"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Wallet Summary & Quick Adjust */}
              <div className={styles.modalSectionCard}>
                <h4 className={styles.modalSectionTitle}>Wallet and Balance Adjustments</h4>
                <div className={`${styles.gridTwoCol} ${styles.adminCls_163}`} >
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Available Balance</span>
                    <span className={`${styles.metricValue} ${styles.textSuccess}`} >{formatCurrency(selectedUser.balance || 0)}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Pending Withdrawal</span>
                    <span className={`${styles.metricValue} ${styles.textInfo}`} >{formatCurrency(selectedUser.withdrawal || 0)}</span>
                  </div>
                </div>

                <div className={styles.quickAdjustRow}>
                  <button disabled={userActionSubmitting} onClick={() => handleAdjustBalance(selectedUser, 1000)} className={`${styles.btnAction} ${styles.btnSuccess}`}>+₦1,000</button>
                  <button disabled={userActionSubmitting} onClick={() => handleAdjustBalance(selectedUser, 5000)} className={`${styles.btnAction} ${styles.btnSuccess}`}>+₦5,000</button>
                  <button disabled={userActionSubmitting} onClick={() => handleAdjustBalance(selectedUser, -1000)} className={`${styles.btnAction} ${styles.btnDanger}`}>-₦1,000</button>
                  <button disabled={userActionSubmitting} onClick={() => {
                    const customAmt = parseFloat(prompt("Enter amount to add (positive) or subtract (negative):") || "0");
                    if (!isNaN(customAmt) && customAmt !== 0) {
                      handleAdjustBalance(selectedUser, customAmt);
                    }
                  }} className={styles.btnAction}>Custom Adjustment</button>
                </div>
              </div>

              {/* Suspension Controls */}
              <div className={`${styles.modalSectionCard} ${styles.adminCls_164}`} >
                <h4 className={`${styles.modalSectionTitle} ${styles.adminCls_165}`} >User Account Suspension Controls</h4>
                
                {selectedUser.suspended_until && new Date(selectedUser.suspended_until) > new Date() ? (
                  <div className={styles.statusAlertDanger}>
                    Account currently locked until: <strong>{new Date(selectedUser.suspended_until).toLocaleString()}</strong>
                  </div>
                ) : (
                  <div className={styles.statusAlertSuccess}>
                    Account status is active and unsuspended.
                  </div>
                )}

                <div className={styles.suspensionButtonGroup}>
                  <button disabled={userActionSubmitting} onClick={() => handleSuspendUser(selectedUser, 2)} className={`${styles.btnAction} ${styles.btnDanger}`}>Suspend 2 Hrs</button>
                  <button disabled={userActionSubmitting} onClick={() => handleSuspendUser(selectedUser, 24)} className={`${styles.btnAction} ${styles.btnDanger}`}>Suspend 24 Hrs</button>
                  <button disabled={userActionSubmitting} onClick={() => handleSuspendUser(selectedUser, 168)} className={`${styles.btnAction} ${styles.btnDanger}`}>Suspend 7 Days</button>
                  <button disabled={userActionSubmitting} onClick={() => handleSuspendUser(selectedUser, -1)} className={`${styles.btnAction} ${styles.btnDanger}`}>PERMANENT BAN</button>
                  {selectedUser.suspended_until && (
                    <button disabled={userActionSubmitting} onClick={() => handleSuspendUser(selectedUser, 0)} className={`${styles.btnAction} ${styles.btnSuccess}`}>Remove Suspension</button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button disabled={userActionSubmitting} onClick={() => handleDeleteUser(selectedUser)} className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_166}`} >
                {userActionSubmitting ? "Processing..." : "Delete Account Permanently"}
              </button>
              <button onClick={() => setSelectedUser(null)} className={styles.btnAction}>
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT ACTIVE AD */}
      {/* ==================================================== */}
      {editAdData && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.adminCls_167}`} >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Ad Campaign Details</h3>
              <button onClick={() => setEditAdData(null)} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveAdEdit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Target Impressions</label>
                  <input 
                    type="number" 
                    required
                    value={editAdData.impressions || 1000} 
                    onChange={(e) => setEditAdData({...editAdData, impressions: parseInt(e.target.value) || 0})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Campaign Duration (Days)</label>
                  <input 
                    type="number" 
                    required
                    value={editAdData.campaign_days || 5} 
                    onChange={(e) => setEditAdData({...editAdData, campaign_days: parseInt(e.target.value) || 0})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Frequency Cap (Views per User)</label>
                  <select 
                    value={editAdData.user_frequency_cap || 1} 
                    onChange={(e) => setEditAdData({...editAdData, user_frequency_cap: parseInt(e.target.value) || 1})} 
                    className={styles.selectField}
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(val => (
                      <option key={val} value={val}>{val} view(s)</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ad Content Text</label>
                  <textarea 
                    required
                    value={editAdData.ad_content || ""} 
                    onChange={(e) => setEditAdData({...editAdData, ad_content: e.target.value})}
                    className={styles.textareaField} 
                  />
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Phone Link</label>
                    <input 
                      type="text" 
                      value={editAdData.action_phone || ""} 
                      onChange={(e) => setEditAdData({...editAdData, action_phone: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Whatsapp Link</label>
                    <input 
                      type="text" 
                      value={editAdData.action_whatsapp || ""} 
                      onChange={(e) => setEditAdData({...editAdData, action_whatsapp: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>
                </div>

                <div className={styles.gridTwoCol}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Website Link</label>
                    <input 
                      type="text" 
                      value={editAdData.action_website || ""} 
                      onChange={(e) => setEditAdData({...editAdData, action_website: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Email Link</label>
                    <input 
                      type="email" 
                      value={editAdData.action_email || ""} 
                      onChange={(e) => setEditAdData({...editAdData, action_email: e.target.value})}
                      className={styles.inputField} 
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setEditAdData(null)} className={styles.btnAction}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit}>
                  Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT ACTIVE HIGHLIGHT */}
      {/* ==================================================== */}
      {editHighlightData && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.adminCls_168}`} >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Business Highlight</h3>
              <button onClick={() => setEditHighlightData(null)} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveHighlightEdit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Highlight Title</label>
                  <input 
                    type="text" 
                    required
                    value={editHighlightData.title || ""} 
                    onChange={(e) => setEditHighlightData({...editHighlightData, title: e.target.value})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Interest Category</label>
                  <select 
                    value={editHighlightData.interest || "Business"} 
                    onChange={(e) => setEditHighlightData({...editHighlightData, interest: e.target.value})} 
                    className={styles.selectField}
                  >
                    {interestsList.map(int => (
                      <option key={int} value={int}>{int}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Cover Image URL</label>
                  <input 
                    type="text" 
                    required
                    value={editHighlightData.image_url || ""} 
                    onChange={(e) => setEditHighlightData({...editHighlightData, image_url: e.target.value})}
                    className={styles.inputField} 
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Details Content</label>
                  <textarea 
                    required
                    value={editHighlightData.content || ""} 
                    onChange={(e) => setEditHighlightData({...editHighlightData, content: e.target.value})}
                    className={styles.textareaField} 
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={() => setEditHighlightData(null)} className={styles.btnAction}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnSubmit}>
                  Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: REPLY TO HELP TICKET */}
      {/* ==================================================== */}
      {replyingTicket && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Reply to: {replyingTicket.subject}</h3>
              <button onClick={() => { setReplyingTicket(null); setReplyText(""); }} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.adminCls_169}>
                <strong className={styles.textForeground}>From:</strong> {replyingTicket.name ? `${replyingTicket.name} — ` : ""}{replyingTicket.user_email}
              </p>
              <p className={styles.adminCls_170}>
                {replyingTicket.message}
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Your Reply</label>
                <textarea className={`${styles.textareaField} ${styles.adminCls_171}`} rows={5} placeholder="Type your reply here..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" onClick={() => { setReplyingTicket(null); setReplyText(""); }} className={styles.btnAction}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReplyTicket(replyingTicket.id)}
                disabled={replyLoading || !replyText.trim()}
                className={styles.btnSubmit}
              >
                {replyLoading ? "Sending..." : "Send Reply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: INSPECT AD DETAILS */}
      {/* ==================================================== */}
      {inspectingAd && (
        <div className={styles.modalOverlay} onClick={() => setInspectingAd(null)}>
          <div className={`${styles.modalContent} ${styles.adminCls_159}`} onClick={(e) => e.stopPropagation()} >
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_172}>
                <Megaphone size={20} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Ad Details Inspector</h3>
              </div>
              <button className={styles.btnClose} onClick={() => setInspectingAd(null)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <AdminAdMediaBox adMedia={inspectingAd.ad_media || inspectingAd.ad_media_url || ""} adMediaType={inspectingAd.ad_media_type} />

              <div className={styles.adminCls_173}>
                <div><strong>Ad ID:</strong> <code className={styles.breakAll}>{inspectingAd.id}</code></div>
                <div><strong>Ad Type:</strong> <span className={styles.adminCls_174}>{inspectingAd.ad_type}</span></div>
                <div><strong>Advertiser Email:</strong> <code className={styles.breakAll}>{inspectingAd.user_email || inspectingAd.email}</code></div>
                <div><strong>Status:</strong> <span style={{ fontWeight: "700", color: inspectingAd.is_paused ? "#ef4444" : "#10b981" }}>{inspectingAd.is_paused ? "Paused / Deactivated" : "Active"}</span></div>
                <div><strong>Impressions:</strong> <span>{inspectingAd.impression_count || 0} / {inspectingAd.impressions || 0}</span></div>
                <div><strong>Mutual Attention:</strong> <span>{inspectingAd.mutual_adds_count || 0}</span></div>
                <div><strong>Bid / Cost:</strong> <span>₦{inspectingAd.cost_per_impression || 25} / attention</span></div>
                <div><strong>Created:</strong> <span>{inspectingAd.created_at ? new Date(inspectingAd.created_at).toLocaleString() : "N/A"}</span></div>
              </div>

              {inspectingAd.ad_content && (
                <div className={styles.adminCls_175}>
                  <strong className={styles.adminCls_85}>Ad Headline / Content:</strong>
                  <p className={styles.adminCls_176}>{inspectingAd.ad_content}</p>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                onClick={() => {
                  setInspectingAd(null);
                  handleDeactivateReportedAd(inspectingAd.id, "");
                }}
                className={`${styles.btnAction} ${styles.btnDanger}`}
              >
                Deactivate Ad Campaign
              </button>
              <button onClick={() => setInspectingAd(null)} className={`${styles.btnAction} ${styles.adminCls_177}`} >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADVERTISER BAN & DEACTIVATION MANAGEMENT */}
      {/* ==================================================== */}
      {banModalUser && (
        <div className={styles.modalOverlay} onClick={() => setBanModalUser(null)}>
          <div className={`${styles.modalContent} ${styles.adminCls_178}`} onClick={(e) => e.stopPropagation()} >
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_160}>
                <ShieldAlert size={22} color="#f59e0b" />
                <h3 className={styles.modalTitle}>Manage Advertiser Access</h3>
              </div>
              <button className={styles.btnClose} onClick={() => setBanModalUser(null)}>
                <XCircle size={22} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.userBannerBox}>
                <span className={styles.userBannerLabel}>Target Account:</span>
                <span className={styles.userBannerEmail}>{banModalUser.email}</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Restriction Status</label>
                <select
                  value={banModalStatus}
                  onChange={(e: any) => setBanModalStatus(e.target.value)}
                  className={styles.selectField}
                >
                  <option value="active">Active — Full Advertiser Access</option>
                  <option value="temp_banned">Temporary Ban — Timed Restriction</option>
                  <option value="perm_banned">Permanent Ban — Indefinite Restriction</option>
                  <option value="deactivated">Deactivated — Admin Deactivation</option>
                </select>
              </div>

              {banModalStatus === "temp_banned" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ban Duration (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={banModalDays}
                    onChange={(e) => setBanModalDays(Number(e.target.value))}
                    className={styles.inputField}
                  />
                  <span className={styles.formHelperText}>
                    Account will be automatically unbanned after {banModalDays} day{banModalDays > 1 ? "s" : ""}.
                  </span>
                </div>
              )}

              {banModalStatus !== "active" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reason for Decision (Required)</label>
                  <textarea
                    rows={3}
                    placeholder="Enter reason e.g., Policy violation, misleading advertising content..."
                    value={banModalReason}
                    onChange={(e) => setBanModalReason(e.target.value)}
                    className={styles.textareaField}
                  />
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button type="button" onClick={() => setBanModalUser(null)} className={styles.btnAction}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAdBan}
                disabled={banSubmitting}
                className={`${styles.btnAction} ${banModalStatus === "active" ? styles.btnSuccess : styles.btnDanger}`}
              >
                {banSubmitting ? "Updating..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
