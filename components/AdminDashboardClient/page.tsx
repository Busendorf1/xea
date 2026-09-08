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
  X
} from "lucide-react";
import styles from "./page.module.css";
import { v4 as uuidv4 } from "uuid";
import { ALL_INDUSTRIES, ALL_INTERESTS } from "@/lib/categoryTargetingMap";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";


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

type Tab = "overview" | "accounts" | "ad-approvals" | "highlight-approvals" | "active-ads" | "active-highlights" | "direct-post" | "help-center" | "send-notifications" | "reported-ads" | "queues" | "reconciliation" | "brand-subscribers";

function AdminAdMediaBox({ adMedia, adMediaType }: { adMedia: string; adMediaType?: string }) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const mediaUrls = adMedia ? adMedia.split(",").map(u => u.trim()).filter(Boolean) : [];
  if (mediaUrls.length === 0) {
    return (
      <div style={{
        width: "100%",
        height: "150px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--sidebar-bg)",
        color: "var(--text-muted)",
        fontSize: "0.85rem",
        borderBottom: "1px solid var(--card-border)"
      }}>
        Text Only Ad
      </div>
    );
  }

  const currentUrl = mediaUrls[currentMediaIndex];
  const isVideo = adMediaType === "video" || /\.(mp4|webm)$/i.test(currentUrl);

  return (
    <div style={{ position: "relative", width: "100%", height: "200px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--sidebar-bg)" }}>
      {isVideo ? (
        <video key={currentUrl} src={currentUrl} controls style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      ) : (
        <img src={currentUrl} alt="Campaign cover" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      )}
      
      {mediaUrls.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentMediaIndex((prev) => (prev + 1) % mediaUrls.length);
          }}
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(0, 0, 0, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "50%",
            color: "#fff",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "0.85rem",
            zIndex: 10
          }}
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
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  
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

  // Financial Reconciliation State
  const [reconciliationData, setReconciliationData] = useState<{
    transfersPaused: boolean;
    metrics: { total_sent_naira: number; total_received_naira: number; variance_naira: number; status: string };
    logs: any[];
    forfeitedBalances?: any[];
    forfeituresPagination?: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      status: string;
    };
    platformTreasury?: { balance: number; total_forfeited_absorbed: number };
    pendingForfeituresCount?: number;
    pendingForfeituresTotal?: number;
  } | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationActionLoading, setReconciliationActionLoading] = useState(false);
  const [reconciliationMsg, setReconciliationMsg] = useState<string | null>(null);

  // Forfeitures Queue Pagination & Filter State
  const [forfeitedPage, setForfeitedPage] = useState(0);
  const [forfeitedLimit, setForfeitedLimit] = useState(10);
  const [forfeitedStatusFilter, setForfeitedStatusFilter] = useState<"ALL" | "PENDING" | "RESOLVED">("ALL");
  const [forfeitedSearch, setForfeitedSearch] = useState("");

  // Brand Subscribers State
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [subscribersPage, setSubscribersPage] = useState(0);
  const [subscribersLimit, setSubscribersLimit] = useState(10);
  const [subscribersStatus, setSubscribersStatus] = useState<"all" | "pending" | "approved" | "active" | "rejected">("all");
  const [subscribersSearch, setSubscribersSearch] = useState("");
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscribersMetrics, setSubscribersMetrics] = useState({ total: 0, pending: 0, active: 0, approved: 0, rejected: 0 });
  const [subscriberActionLoading, setSubscriberActionLoading] = useState<string | null>(null);

  const fetchSubscribers = async (
    page = subscribersPage,
    limit = subscribersLimit,
    status = subscribersStatus,
    search = subscribersSearch,
    fresh = false
  ) => {
    setSubscribersLoading(true);
    try {
      const res = await fetch(`/api/admin/subscribers?page=${page}&limit=${limit}&status=${status}&search=${encodeURIComponent(search || "")}${fresh ? "&fresh=true" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch subscribers");
      const data = await res.json();
      setSubscribers(data.subscribers || []);
      setSubscribersCount(data.count || 0);
      if (data.metrics) setSubscribersMetrics(data.metrics);
    } catch (e) {
      console.error("Error fetching subscribers:", e);
    } finally {
      setSubscribersLoading(false);
    }
  };

  const handleApproveSubscriber = async (subscriber: any) => {
    const formattedAmount = subscriber.currency === "NGN" ? `₦${Number(subscriber.amount || 150000).toLocaleString()}` : `$${subscriber.amount || 100}`;
    if (!confirm(`Are you sure you want to APPROVE the brand subscription for ${subscriber.domain} (${subscriber.business_name})?\n\nOnce approved, the user can complete payment of ${formattedAmount} to activate their 30% discount subsidy.`)) {
      return;
    }
    setSubscriberActionLoading(subscriber.id);
    try {
      const res = await fetch("/api/admin/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_subscriber", subscriber_id: subscriber.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to approve subscriber");
      alert(data.message || "Application approved successfully!");
      await fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true);
    } catch (e: any) {
      alert("Error approving subscriber: " + e.message);
    } finally {
      setSubscriberActionLoading(null);
    }
  };

  const handleRejectSubscriber = async (subscriber: any) => {
    const reason = prompt(`Enter reason for REJECTING ${subscriber.domain} (${subscriber.business_name}):`, "Domain or business information could not be verified.");
    if (reason === null) return;
    setSubscriberActionLoading(subscriber.id);
    try {
      const res = await fetch("/api/admin/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_subscriber", subscriber_id: subscriber.id, rejection_reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to reject subscriber");
      alert(data.message || "Application rejected.");
      await fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true);
    } catch (e: any) {
      alert("Error rejecting subscriber: " + e.message);
    } finally {
      setSubscriberActionLoading(null);
    }
  };

  const fetchReconciliationData = async (
    fresh = false,
    page = forfeitedPage,
    limit = forfeitedLimit,
    status = forfeitedStatusFilter,
    search = forfeitedSearch
  ) => {
    if (reconciliationLoading) return;
    setReconciliationLoading(true);
    try {
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "true");
      params.set("forfeitPage", String(page + 1));
      params.set("forfeitLimit", String(limit));
      params.set("forfeitStatus", status);
      if (search.trim()) params.set("forfeitSearch", search.trim());

      const res = await fetch(`/api/admin/reconciliation?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReconciliationData(data);
      }
    } catch (err) {
      console.error("Failed to fetch reconciliation data:", err);
    } finally {
      setReconciliationLoading(false);
    }
  };

  const handleToggleEmergencyPause = async () => {
    if (reconciliationActionLoading) return;
    setReconciliationActionLoading(true);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_pause" }),
      });
      if (res.ok) {
        const data = await res.json();
        setReconciliationMsg(data.message);
        // Instantly reflect toggled circuit breaker status without waiting on database audit scan
        setReconciliationData((prev) =>
          prev
            ? { ...prev, transfersPaused: data.transfersPaused }
            : {
                transfersPaused: data.transfersPaused,
                metrics: { total_sent_naira: 0, total_received_naira: 0, variance_naira: 0, status: "HEALTHY" },
                logs: [],
              }
        );
        setTimeout(() => setReconciliationMsg(null), 5000);
      }
    } catch (err: any) {
      setReconciliationMsg(err.message || "Failed to toggle emergency pause.");
    } finally {
      setReconciliationActionLoading(false);
    }
  };

  const handleResolveReconciliationLog = async (logId: string) => {
    if (reconciliationActionLoading) return;
    const notes = prompt("Enter audit notes or resolution details for this discrepancy:");
    if (!notes) return;

    setReconciliationActionLoading(true);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_issue", logId, notes }),
      });
      if (res.ok) {
        await fetchReconciliationData();
      }
    } catch (err) {
      console.error("Failed to resolve reconciliation issue:", err);
    } finally {
      setReconciliationActionLoading(false);
    }
  };

  const [forfeitureActionLoading, setForfeitureActionLoading] = useState<string | null>(null);

  const handleResolveForfeiture = async (forfeitureId: string, amount: number) => {
    if (forfeitureActionLoading) return;
    const formattedAmount = `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
    const notes = prompt(`Enter resolution audit note for ${formattedAmount} forfeited balance:`, "Resolved to platform treasury by admin");
    if (notes === null) return; // User cancelled

    setForfeitureActionLoading(forfeitureId);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_forfeiture", forfeitureId, notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resolve forfeited balance.");
      }
      alert(data.message || `Forfeited balance of ${formattedAmount} successfully credited to platform balance.`);
      await fetchReconciliationData(true);
    } catch (err: any) {
      alert(`Error: ${err.message || "Failed to resolve forfeited balance."}`);
    } finally {
      setForfeitureActionLoading(null);
    }
  };

  // Transfer Reversals & Dual Authorization State
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseRef, setReverseRef] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState("");

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState(false);
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);

  // Dual-Auth Requests Pagination & Filter State
  const [pendingRequestsPage, setPendingRequestsPage] = useState(0);
  const [pendingRequestsLimit, setPendingRequestsLimit] = useState(10);
  const [pendingRequestsStatusFilter, setPendingRequestsStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [pendingRequestsSearch, setPendingRequestsSearch] = useState("");
  const [pendingRequestsPagination, setPendingRequestsPagination] = useState<{
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    status: string;
  } | null>(null);
  const [pendingRequestsSummary, setPendingRequestsSummary] = useState<{
    pending_count: number;
    approved_count: number;
    rejected_count: number;
    total_count: number;
  }>({ pending_count: 0, approved_count: 0, rejected_count: 0, total_count: 0 });

  const fetchPendingRequests = async (
    fresh = false,
    page = pendingRequestsPage,
    limit = pendingRequestsLimit,
    status = pendingRequestsStatusFilter,
    search = pendingRequestsSearch
  ) => {
    try {
      setPendingRequestsLoading(true);
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "true");
      params.set("page", String(page + 1));
      params.set("limit", String(limit));
      params.set("status", status);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.requests || []);
        if (data.pagination) setPendingRequestsPagination(data.pagination);
        if (data.summary) setPendingRequestsSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch pending admin requests:", err);
    } finally {
      setPendingRequestsLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (approvingRequestId) return;
    setApprovingRequestId(requestId);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", requestId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Failed to approve request.");
        return;
      }
      setReconciliationMsg(data.message || "Request approved and executed.");
      setTimeout(() => setReconciliationMsg(null), 5000);
      fetchPendingRequests();
      fetchReconciliationData(true);
    } catch {
      alert("Network error approving request.");
    } finally {
      setApprovingRequestId(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (approvingRequestId) return;
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    setApprovingRequestId(requestId);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", requestId, rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Failed to reject request.");
        return;
      }
      fetchPendingRequests();
    } catch {
      alert("Network error rejecting request.");
    } finally {
      setApprovingRequestId(null);
    }
  };

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reversalLoading) return;
    setReversalError("");

    if (!reverseRef.trim()) {
      setReversalError("Please enter the transaction reference (e.g. trf_...).");
      return;
    }
    if (reverseReason.trim().length < 5) {
      setReversalError("Please provide an audit reason (at least 5 characters).");
      return;
    }

    setReversalLoading(true);
    try {
      const res = await fetch("/api/admin/transfers/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reverseRef.trim(), reason: reverseReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setReversalError(data.error || "Transfer reversal failed.");
        return;
      }

      setReconciliationMsg(data.message);
      setTimeout(() => setReconciliationMsg(null), 5000);
      setShowReverseModal(false);
      setReverseRef("");
      setReverseReason("");
      fetchPendingRequests();
      fetchReconciliationData(true);
    } catch (err: any) {
      setReversalError(err.message || "Network error executing reversal.");
    } finally {
      setReversalLoading(false);
    }
  };

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
          if (subData.metrics) setSubscribersMetrics(subData.metrics);
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
    } else if (activeTab === "reconciliation") {
      fetchReconciliationData();
      fetchPendingRequests();
    } else if (activeTab === "brand-subscribers") {
      fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch);
    }
  }, [activeTab, usersPage, usersLimit, pendingAdsPage, activeAdsPage, pendingHighlightsPage, activeHighlightsPage, searchQuery, helpTicketsPage, helpTicketSearch, reportedAdsPage, reportedAdsSearch, subscribersPage, subscribersLimit, subscribersStatus]);

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
    } else if (activeTab === "reconciliation") {
      await Promise.all([fetchReconciliationData(true), fetchPendingRequests()]);
    } else if (activeTab === "brand-subscribers") {
      await fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true);
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
    if (tab === "brand-subscribers") {
      fetchSubscribers(0, subscribersLimit, "all", "", true);
    }
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
    const nextMonetizedType = isCurrentlyMonetized ? null : "standard";
    const nextMonetizedUntil = isCurrentlyMonetized ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

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
    if (!confirm(`⚠️ WARNING: Are you sure you want to delete @${user.username} (${user.email}) permanently?`)) {
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
              ← Prev
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
              Next →
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
        <div style={{ flex: "0 0 240px", width: "240px", minWidth: "240px", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--card-border)" }}>
          <AdminAdMediaBox adMedia={ad.ad_media} adMediaType={ad.ad_media_type} />
        </div>

        {/* Right Main Column: Info, Analytics & Controls */}
        <div style={{ flex: "1 1 320px", minWidth: "280px", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          
          {/* Top Tag Pills Row */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {/* Media Type Tag Pill */}
            <span style={{ backgroundColor: "rgba(99, 102, 241, 0.12)", color: "#818cf8", border: "1px solid rgba(99, 102, 241, 0.3)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {hasMedia ? (isVideo ? <Video size={13} /> : <ImageIcon size={13} />) : <Megaphone size={13} />}
              {hasMedia ? (isVideo ? "Video Ad" : "Image Ad") : "Text Only Ad"}
            </span>

            {/* Status Tag Pill */}
            {isQueue ? (
              <span style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.4)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Clock size={13} /> Pending Review
              </span>
            ) : isCompleted ? (
              <span style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.4)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700" }}>
                Completed
              </span>
            ) : ad.is_paused ? (
              <span style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.4)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700" }}>
                Paused
              </span>
            ) : (
              <span style={{ backgroundColor: "rgba(37, 99, 235, 0.15)", color: "#3b82f6", border: "1px solid rgba(37, 99, 235, 0.4)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700" }}>
                Live
              </span>
            )}

            {/* Category Tag Pill */}
            <span style={{ backgroundColor: "var(--sidebar-bg)", border: "1px solid var(--card-border)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600", color: "var(--foreground)" }}>
              {ad.ad_type}
            </span>

            {/* Priority Bidded / Boosted Tag Pill */}
            {(!!ad.is_bidded || Number(ad.cost_per_impression || 0) > 25) && (
              <span style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "3px 9px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Zap size={13} color="#f59e0b" /> {ad.is_bidded ? "Bidded Priority" : "Boosted"} (₦{ad.cost_per_impression || ad.impression || 25}/view)
              </span>
            )}
          </div>

          {/* Ad Content */}
          <p style={{ fontWeight: "700", color: "var(--foreground)", fontSize: "0.95rem", margin: 0, lineHeight: "1.4" }}>
            {ad.ad_content}
          </p>

          {/* Publisher Metadata */}
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <span>
              Publisher: <strong style={{ color: "var(--foreground)" }}>
                {ad.publisher_name ? `${ad.publisher_name} (` : ""}
                {ad.publisher_handle || ad.custom_sponsor_handle || (ad.user_email ? `@${ad.user_email.split('@')[0]}` : "@user")}
                {ad.publisher_name ? ")" : ""}
              </strong>
              {ad.user_email && (
                <span style={{ marginLeft: "4px", color: "var(--text-muted)" }}>• {ad.user_email}</span>
              )}
            </span>
            <span>ID: <code style={{ fontSize: "0.72rem", backgroundColor: "var(--sidebar-bg)", padding: "2px 6px", borderRadius: "4px" }}>{ad.id}</code></span>
            <span>Created: {ad.created_at ? new Date(ad.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}</span>
          </div>

          {/* Delivery Progress Bar */}
          <div style={{ marginTop: "0.2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "4px", fontWeight: "600" }}>
              <span>Delivery Progress</span>
              <span>{deliveryPercent}% ({seenCount} / {targetImpressions} views)</span>
            </div>
            <div style={{ height: "6px", width: "100%", backgroundColor: "var(--sidebar-bg)", borderRadius: "3px", overflow: "hidden", border: "1px solid var(--card-border)" }}>
              <div style={{ height: "100%", backgroundColor: "#1d9bf0", width: `${deliveryPercent}%`, borderRadius: "3px" }} />
            </div>
          </div>

          {/* Admin Statement / Reason Callout Banner if present */}
          {ad.admin_statement && (
            <div style={{
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              borderRadius: "8px",
              padding: "0.5rem 0.75rem",
              color: "#f59e0b",
              fontSize: "0.82rem"
            }}>
              <strong style={{ display: "flex", alignItems: "center", gap: "4px", color: "#fbbf24", marginBottom: "2px" }}>
                <AlertTriangle size={14} /> Admin Statement / Reason:
              </strong>
              {ad.admin_statement}
            </div>
          )}

          {/* Comprehensive Target Specs */}
          {renderAdDetails(ad)}

          {/* Action Control Panel */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "0.5rem", paddingTop: "0.75rem", borderTop: "1px solid var(--card-border)" }}>
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

                <button
                  onClick={() => setEditAdData(ad)}
                  disabled={!!campaignActionLoading}
                  className={styles.btnAction}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0.45rem 0.85rem", fontSize: "0.82rem" }}
                  title="Edit campaign settings"
                >
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
            <span className={styles.badgeStatus} style={{ backgroundColor: "#ef4444", color: "#fff" }}>In Review</span>
          ) : highlight.is_paused ? (
            <span className={styles.badgeStatus} style={{ backgroundColor: "#f59e0b", color: "#fff" }}>Paused</span>
          ) : (
            <span className={styles.badgeStatus} style={{ backgroundColor: "#2563eb", color: "#fff" }}>Live</span>
          )}
        </div>

        <div className={styles.cardBody}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <h4 className={styles.cardTitle} style={{ margin: 0 }}>{highlight.title}</h4>
            {(!!highlight.is_bidded || Number(highlight.bid_price || 0) > 1000) && (
              <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                <Zap size={10} color="#f59e0b" /> ₦{highlight.bid_price || 1500}/day
              </span>
            )}
          </div>
          <p className={styles.cardText} style={{ fontSize: "0.9rem" }}>{highlight.content}</p>

          {/* Admin Statement */}
          {highlight.admin_statement && (
            <div style={{ padding: "0.4rem 0.6rem", backgroundColor: "rgba(245, 158, 11, 0.12)", borderRadius: "6px", border: "1px solid rgba(245, 158, 11, 0.4)", color: "#f59e0b", fontSize: "0.78rem", marginTop: "0.4rem" }}>
              <strong>Important Notice:</strong> {highlight.admin_statement}
            </div>
          )}

          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem", borderTop: "1px solid var(--card-border)", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <span>
              Publisher: <strong style={{ color: "var(--foreground)" }}>
                {highlight.publisher_name ? `${highlight.publisher_name} (` : ""}
                {highlight.publisher_handle || highlight.custom_sponsor_handle || (highlight.user_email ? `@${highlight.user_email.split('@')[0]}` : "@user")}
                {highlight.publisher_name ? ")" : ""}
              </strong>
              {highlight.user_email && (
                <span style={{ marginLeft: "4px", color: "var(--text-muted)" }}>• {highlight.user_email}</span>
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
              <button
                onClick={() => setEditHighlightData(highlight)}
                disabled={!!campaignActionLoading}
                className={styles.btnAction}
                style={{ padding: "0.5rem" }}
                title="Edit highlight"
              >
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
      <div style={{
        marginTop: "1rem", 
        borderTop: "1px solid var(--card-border)", 
        paddingTop: "1rem",
        fontSize: "0.8rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        color: "var(--text-muted)"
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <div><strong>Category Type:</strong> <span style={{ color: "var(--foreground)" }}>{ad.ad_type}</span></div>
          <div><strong>Frequency Cap:</strong> <span style={{ color: "var(--foreground)" }}>{ad.user_frequency_cap || 1} view(s)/user</span></div>
          <div><strong>Target Views:</strong> <span style={{ color: "var(--foreground)" }}>{ad.impressions}</span></div>
          <div><strong>Views Delivered:</strong> <span style={{ color: "var(--foreground)" }}>{ad.impression_count ?? 0}</span></div>
          <div><strong>Campaign Duration:</strong> <span style={{ color: "var(--foreground)" }}>{ad.campaign_days || 5} Days</span></div>
          <div><strong>Cost/Impression:</strong> <span style={{ color: "var(--foreground)" }}>{formatCurrency(ad.cost_per_impression || ad.impression || 0)}</span></div>
          <div><strong>Total Budget:</strong> <span style={{ color: "var(--foreground)" }}>{formatCurrency(ad.total_cost || ad.cost || 0)}</span></div>
          <div><strong>Gained Mutuals:</strong> <span style={{ color: "var(--foreground)" }}>{ad.mutual_adds_count ?? 0}</span></div>
          <div><strong>Display Mutual+:</strong> <span style={{ color: ad.display_mutual_button ? "#10b981" : "#ef4444" }}>{ad.display_mutual_button ? "Enabled" : "Disabled"}</span></div>
          <div><strong>Target Gender:</strong> <span style={{ color: "var(--foreground)" }}>{ad.gender || "Both"}</span></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", borderTop: "1px dashed var(--card-border)", paddingTop: "0.5rem" }}>
          <div><strong>Targeting Age:</strong> <span style={{ color: "var(--foreground)" }}>{ad.age_range ? `${ad.age_range[0]} - ${ad.age_range[1]} years` : "18 - 65 years"}</span></div>
          <div><strong>Targeting Geo:</strong> <span style={{ color: "var(--foreground)" }}>{[ad.province, ad.state, ad.country].filter(Boolean).join(", ") || "Global"}</span></div>
          <div><strong>Targeting Employment:</strong> <span style={{ color: "var(--foreground)" }}>{formatList(ad.employment_status)}</span></div>
          <div><strong>Targeting Industries:</strong> <span style={{ color: "var(--foreground)" }}>{formatList(ad.industry)}</span></div>
          <div><strong>Targeting Interests:</strong> <span style={{ color: "var(--foreground)" }}>{formatList(ad.interest)}</span></div>
          <div><strong>Targeting Lifestyle:</strong> <span style={{ color: "var(--foreground)" }}>{formatList(ad.lifestyle)}</span></div>
          <div><strong>Targeting Behavior:</strong> <span style={{ color: "var(--foreground)" }}>{formatList(ad.behavior)}</span></div>
          <div><strong>Targeting Personality:</strong> <span style={{ color: "var(--foreground)" }}>{formatList(ad.personality)}</span></div>
          {ad.mutual_targets && ad.mutual_targets.length > 0 && (
            <div><strong>Mutual Targets:</strong> <span style={{ color: "var(--foreground)" }}>{ad.mutual_targets.join(", ")}</span></div>
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
              title={theme === "white" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              aria-label="Toggle Theme"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "var(--primary)",
                border: "1px solid var(--card-border)",
                color: "#ffffff",
                cursor: "pointer",
                boxShadow: "0 0 10px var(--primary-glow)",
                transition: "all 0.2s ease",
                padding: 0,
                flexShrink: 0,
              }}
            >
              {theme === "white" ? <Sun size={15} /> : <Moon size={15} />}
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

          <button onClick={() => handleTabChange("reconciliation")} className={`${styles.tabButton} ${activeTab === "reconciliation" ? styles.tabButtonActive : ""}`}>
            <FolderLock size={18} />
            <span>Financial Reconciliation</span>
          </button>

          <button onClick={() => handleTabChange("brand-subscribers")} className={`${styles.tabButton} ${activeTab === "brand-subscribers" ? styles.tabButtonActive : ""}`}>
            <Building2 size={18} />
            <span>Brand Subscribers {subscribersMetrics.pending > 0 ? `(${subscribersMetrics.pending})` : ""}</span>
          </button>

          <div style={{ marginTop: "auto", padding: "1rem", borderTop: "1px solid var(--card-border)" }}>
            <button onClick={handleRefresh} disabled={refreshing || loading} className={styles.btnAction} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
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
                      <div className={styles.statIconBox}><Wallet size={16} color="#10b981" /></div>
                    </div>
                    <span className={styles.statValue}>{formatCurrency(stats.totalBalance)}</span>
                    <span className={styles.statDesc}>{formatCurrency(stats.totalWithdrawal)} in withdrawals processing</span>
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
                                    <div style={{ fontWeight: "800", color: "var(--primary)" }}>{user.business_name}</div>
                                    <div style={{ fontSize: "0.85rem", fontWeight: "600" }}>{user.firstName} {user.lastName}</div>
                                  </>
                                ) : (
                                  <div style={{ fontWeight: "700" }}>{user.firstName} {user.lastName}</div>
                                )}
                                <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--primary)" }}>@{user.username?.replace(/^@/, "") || "user"}</div>
                                {user.created_at && (
                                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                    Joined: {new Date(user.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                )}
                              </td>
                              <td className={styles.td}>
                                <div style={{ fontWeight: "800" }}>{formatCurrency(user.balance || 0)}</div>
                                <div style={{ fontSize: "0.75rem", color: "#3b82f6" }}>Pending: {formatCurrency(user.withdrawal || 0)}</div>
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
                                    <span className={styles.userBadge} style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>
                                      TEMP BANNED ({getAdBanCountdown(user.ad_ban_until)})
                                    </span>
                                    {user.ad_ban_reason && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "3px" }}>Reason: {user.ad_ban_reason}</div>}
                                  </div>
                                ) : isAdPermBanned ? (
                                  <div>
                                    <span className={styles.userBadge} style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                                      PERM BANNED
                                    </span>
                                    {user.ad_ban_reason && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "3px" }}>Reason: {user.ad_ban_reason}</div>}
                                  </div>
                                ) : isAdDeactivated ? (
                                  <div>
                                    <span className={styles.userBadge} style={{ background: "rgba(156,163,175,0.15)", color: "#9ca3af", border: "1px solid rgba(156,163,175,0.3)" }}>
                                      DEACTIVATED
                                    </span>
                                    {user.ad_ban_reason && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "3px" }}>Reason: {user.ad_ban_reason}</div>}
                                  </div>
                                ) : (
                                  <span className={styles.userBadge} style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
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
                                  <button
                                    onClick={() => {
                                      setBanModalUser(user);
                                      setBanModalStatus(user.ad_account_status || "temp_banned");
                                      setBanModalReason(user.ad_ban_reason || "");
                                    }}
                                    className={styles.btnAction}
                                    style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.4)" }}
                                  >
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
                  <CheckCircle size={32} style={{ color: "#10b981", marginBottom: "0.5rem" }} />
                  <span>No campaigns in the review queue. All caught up!</span>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
                  <CheckCircle size={32} style={{ color: "#10b981", marginBottom: "0.5rem" }} />
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
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              {/* Direct Ad Form */}
              <form onSubmit={handlePostAdDirect} className={styles.form} style={{ flex: "1 1 45%" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: "800", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <PlusCircle size={20} style={{ color: "var(--primary)" }} />
                  <span>Directly Post approved Ad</span>
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "-0.5rem" }}>Upload file and set parameters. Posted ads bypass the review queues.</p>
                
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
                      style={{
                        padding: "0.5rem 0",
                        fontSize: "0.88rem"
                      }}
                    />
                    {adFormFiles.length > 0 && (
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
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
                    <input 
                      type="number" 
                      disabled
                      value="0"
                      className={styles.inputField} 
                      style={{ opacity: 0.7, cursor: "not-allowed" }}
                    />
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
              <form onSubmit={handlePostHighlightDirect} className={styles.form} style={{ flex: "1 1 45%", height: "fit-content" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: "800", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <PlusCircle size={20} style={{ color: "var(--primary)" }} />
                  <span>Directly Post approved Highlight</span>
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "-0.5rem" }}>Upload cover image and post highlight directly to live feeds.</p>

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
                    style={{
                      padding: "0.5rem 0",
                      fontSize: "0.88rem"
                    }}
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
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search by email, subject, or category..."
                    value={helpTicketSearch}
                    onChange={(e) => {
                      setHelpTicketSearch(e.target.value);
                      setHelpTicketsPage(0);
                    }}
                    className={styles.inputField}
                    style={{ paddingLeft: "2rem", width: "100%" }}
                  />
                </div>
              </div>

              {loading ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading tickets...</p>
              ) : helpTickets.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No tickets found.</p>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {helpTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        style={{
                          background: "var(--card-bg)",
                          border: "1px solid var(--card-border)",
                          borderRadius: "14px",
                          padding: "1.25rem",
                          transition: "border-color 0.2s"
                        }}
                      >
                        {/* Ticket header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                          <div>
                            <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>{ticket.subject}</span>
                            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
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
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" as const }}>{ticket.category}</span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {new Date(ticket.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                          {/* Actions */}
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            <button
                              onClick={() => { setReplyingTicket(ticket); setReplyText(ticket.admin_reply || ""); }}
                              className={styles.btnAction}
                              style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
                            >
                              <Reply size={13} /> Reply
                            </button>
                            {ticket.status !== "resolved" && ticket.status !== "closed" && (
                              <button onClick={() => handleCloseTicket(ticket)} className={styles.btnAction} style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "#10b981", borderColor: "rgba(16,185,129,0.4)" }}>
                                <CheckCircle size={13} /> Mark as Closed
                              </button>
                            )}
                            <button onClick={() => handleDeleteTicket(ticket.id)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.4rem 0.6rem" }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 0.25rem" }}>
                          <strong style={{ color: "var(--foreground)" }}>From:</strong> {ticket.name ? `${ticket.name} — ` : ""}{ticket.user_email}
                        </p>
                        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{ticket.message}</p>

                        {/* Existing reply */}
                        {ticket.admin_reply && (
                          <div style={{
                            marginTop: "0.75rem",
                            background: "linear-gradient(135deg, rgba(138,43,226,0.06), rgba(79,172,254,0.06))",
                            border: "1px solid var(--primary)",
                            borderRadius: "10px",
                            padding: "0.75rem"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: 0 }}>Admin Reply</p>
                              {ticket.replied_at && (
                                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                  Replied: {new Date(ticket.replied_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: "0.875rem", color: "var(--foreground)", lineHeight: 1.5, margin: 0 }}>{ticket.admin_reply}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1.25rem" }}>
                    <button
                      onClick={() => setHelpTicketsPage((p) => Math.max(0, p - 1))}
                      disabled={helpTicketsPage === 0}
                      className={styles.btnAction}
                    >
                      ← Prev
                    </button>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Page {helpTicketsPage + 1} of {Math.max(1, Math.ceil(helpTicketsCount / 10))} ({helpTicketsCount} total)
                    </span>
                    <button
                      onClick={() => setHelpTicketsPage((p) => p + 1)}
                      disabled={(helpTicketsPage + 1) * 10 >= helpTicketsCount}
                      className={styles.btnAction}
                    >
                      Next →
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

              <div style={{
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "16px",
                padding: "2rem",
                maxWidth: "640px",
                marginTop: "1.5rem"
              }}>
                <form onSubmit={handleSendNotification} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Notification Target Segment</label>
                    <select
                      value={notificationTarget}
                      onChange={(e: any) => setNotificationTarget(e.target.value)}
                      className={styles.selectField}
                      style={{ width: "100%" }}
                    >
                      <option value="all">All Registered Users</option>
                      <option value="monetized">Monetized Users Only</option>
                      <option value="user">Specific User by Email</option>
                    </select>
                  </div>

                  {notificationTarget === "user" && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Target User Email Address</label>
                      <input
                        type="email"
                        required
                        placeholder="user@example.com"
                        value={notificationTargetEmail}
                        onChange={(e) => setNotificationTargetEmail(e.target.value)}
                        className={styles.inputField}
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Message Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Account Update 📢"
                      value={notificationTitle}
                      onChange={(e) => setNotificationTitle(e.target.value)}
                      className={styles.inputField}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Message Body Content</label>
                    <textarea
                      required
                      rows={5}
                      placeholder="Write your announcement details here..."
                      value={notificationMessage}
                      onChange={(e) => setNotificationMessage(e.target.value)}
                      className={styles.textareaField}
                      style={{ width: "100%", resize: "vertical", minHeight: "100px" }}
                    />
                  </div>

                  {notificationSuccessMsg && (
                    <div style={{ color: "#34d399", fontSize: "0.875rem", background: "rgba(52,211,153,0.1)", padding: "0.75rem", borderRadius: "8px", border: "1px solid rgba(52,211,153,0.2)" }}>
                      {notificationSuccessMsg}
                    </div>
                  )}

                  {notificationErrorMsg && (
                    <div style={{ color: "#f87171", fontSize: "0.875rem", background: "rgba(248,113,113,0.1)", padding: "0.75rem", borderRadius: "8px", border: "1px solid rgba(248,113,113,0.2)" }}>
                      {notificationErrorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={notificationLoading}
                    className={styles.btnSubmit}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
                  >
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
                              Reported by: <strong style={{ color: "var(--foreground)" }}>{report.reporter_email}</strong> · Reported on {new Date(report.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
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

                        <div className={styles.cardBody} style={{ fontSize: "0.85rem", color: "var(--foreground)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <div><strong>Report Type:</strong> <span style={{ color: report.report_type === "advertiser" ? "#ef4444" : "#2563eb", fontWeight: 600 }}>{report.report_type === "advertiser" ? "Block and Report Advertiser" : "Block and Report Ad"}</span></div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                            <strong>Target Ad ID:</strong>
                            <button
                              type="button"
                              onClick={() => handleInspectAd(report.ad_id)}
                              title="Click to inspect full ad details"
                              className={styles.inspectAdLink}
                            >
                              <span>{report.ad_id}</span>
                              <span>(Inspect Ad Details 🔍)</span>
                            </button>
                          </div>
                          {report.advertiser_email && <div><strong>Advertiser Email:</strong> <code style={{ fontSize: "0.85rem" }}>{report.advertiser_email}</code></div>}
                          {report.reason && (
                            <div className={styles.reportReasonBox}>
                              <strong style={{ color: "var(--foreground)" }}>User Reason:</strong> {report.reason}
                            </div>
                          )}
                        </div>

                        <div className={styles.cardFooter} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem", alignItems: "center" }}>
                          <button
                            onClick={() => handleInspectAd(report.ad_id)}
                            className={styles.inspectAdLink}
                          >
                            🔍 Inspect Ad Details
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h1 className={styles.sectionTitle}>Failed Queues and Dead Letter Queue (DLQ)</h1>
                  <p className={styles.sectionSubtitle}>Inspect background queue jobs that failed maximum retries. Manually trigger retries or clear stale queue entries.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleRetryDlqAll}
                    disabled={dlqLoading || dlqJobs.length === 0}
                    className={styles.btnAction}
                    style={{ backgroundColor: "#10b981", color: "#fff", display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
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
                <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", backgroundColor: "#1e293b", color: "#38bdf8", marginBottom: "1rem", fontSize: "0.85rem" }}>
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
                        <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "4px", backgroundColor: "#ef444422", color: "#ef4444", fontWeight: 700 }}>
                          FAILED
                        </span>
                      </div>

                      <div className={styles.cardBody}>
                        <div style={{ fontSize: "0.85rem", color: "#f87171", marginBottom: "0.5rem" }}>
                          <strong>Reason:</strong> {job.failedReason || "Exhausted retry limits"}
                        </div>
                        <pre style={{ fontSize: "0.75rem", backgroundColor: "#090d16", padding: "0.75rem", borderRadius: "6px", overflowX: "auto", color: "#94a3b8" }}>
                          {JSON.stringify(job.data || job.rawPayload || {}, null, 2)}
                        </pre>
                      </div>

                      <div className={styles.cardFooter}>
                        <button
                          onClick={() => handleRetryDlqSingle(job.id)}
                          className={styles.btnAction}
                          style={{ backgroundColor: "#3b82f6", color: "#fff" }}
                        >
                          Retry Job
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 12. FINANCIAL RECONCILIATION & SECURITY AUDITS TAB */}
          {activeTab === "reconciliation" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Financial Reconciliation and Security Audits</h1>
                <p className={styles.sectionSubtitle}>
                  Real-time double-entry ledger audits, nightly variance detection, and emergency P2P transfer circuit breaker controls.
                </p>
              </div>

              {/* Emergency Control Bar & Action Buttons */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: reconciliationData?.transfersPaused ? "rgba(239, 68, 68, 0.15)" : "var(--card-bg)",
                border: `1px solid ${reconciliationData?.transfersPaused ? "rgba(239, 68, 68, 0.3)" : "var(--card-border)"}`,
                padding: "1.25rem",
                borderRadius: "12px",
                gap: "1rem",
                flexWrap: "wrap",
                marginBottom: "1.5rem"
              }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: reconciliationData?.transfersPaused ? "#ef4444" : "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {reconciliationData?.transfersPaused ? (
                      <>
                        <ShieldAlert size={20} style={{ color: "#ef4444" }} />
                        <span>EMERGENCY P2P TRANSFERS PAUSED</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={20} style={{ color: "#10b981" }} />
                        <span>System P2P Transfers Active</span>
                      </>
                    )}
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                    {reconciliationData?.transfersPaused
                      ? "P2P transfer processing is currently frozen to contain financial variance."
                      : "System double-entry ledger is operating normally without balance drift."}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleToggleEmergencyPause}
                    disabled={reconciliationActionLoading || reconciliationLoading}
                    className={styles.btnAction}
                    style={{
                      backgroundColor: reconciliationData?.transfersPaused ? "#10b981" : "#ef4444",
                      color: "#fff",
                      fontWeight: 700,
                      padding: "0.6rem 1.2rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      opacity: (reconciliationActionLoading || reconciliationLoading) ? 0.65 : 1,
                      cursor: (reconciliationActionLoading || reconciliationLoading) ? "not-allowed" : "pointer",
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {reconciliationActionLoading ? (
                      <>
                        <RefreshCw size={15} className={styles.spin} />
                        <span>{reconciliationData?.transfersPaused ? "Unpausing Transfers..." : "Pausing Transfers..."}</span>
                      </>
                    ) : reconciliationData?.transfersPaused ? (
                      <>
                        <Play size={15} />
                        <span>Unpause P2P Transfers</span>
                      </>
                    ) : (
                      <>
                        <Pause size={15} />
                        <span>Emergency Pause Transfers</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => fetchReconciliationData(true)}
                    disabled={reconciliationLoading || reconciliationActionLoading}
                    className={styles.btnAction}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      opacity: (reconciliationLoading || reconciliationActionLoading) ? 0.65 : 1,
                      cursor: (reconciliationLoading || reconciliationActionLoading) ? "not-allowed" : "pointer",
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {reconciliationLoading ? (
                      <>
                        <RefreshCw size={15} className={styles.spin} />
                        <span>Running Audit Scan...</span>
                      </>
                    ) : (
                      <>
                        <Search size={15} />
                        <span>Run Audit Scan</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReversalError("");
                      setShowReverseModal(true);
                    }}
                    disabled={reconciliationLoading || reconciliationActionLoading || reversalLoading}
                    className={styles.btnAction}
                    style={{
                      backgroundColor: "#6366f1",
                      color: "#fff",
                      fontWeight: 700,
                      padding: "0.6rem 1.2rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      opacity: (reconciliationLoading || reconciliationActionLoading || reversalLoading) ? 0.65 : 1,
                      cursor: (reconciliationLoading || reconciliationActionLoading || reversalLoading) ? "not-allowed" : "pointer",
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    <RefreshCw size={15} />
                    <span>Reverse a Transfer</span>
                  </button>
                </div>
              </div>

              {reconciliationMsg && (
                <div style={{ color: "#34d399", fontSize: "0.875rem", background: "rgba(52,211,153,0.1)", padding: "0.75rem", borderRadius: "8px", border: "1px solid rgba(52,211,153,0.2)", marginBottom: "1.5rem" }}>
                  {reconciliationMsg}
                </div>
              )}

              {/* Health Metrics Grid */}
              <div className={styles.statsGrid} style={{ marginBottom: "2rem" }}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Ledger Audit Status</span>
                  <div style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    marginTop: "0.5rem",
                    color: reconciliationData?.metrics?.status === "HEALTHY" ? "#10b981" : "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}>
                    {reconciliationData?.metrics?.status === "HEALTHY" ? (
                      <>
                        <CheckCircle size={18} />
                        <span>HEALTHY (0.00 Variance)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={18} />
                        <span>FLAGGED (Discrepancy)</span>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total Sent Money</span>
                  <div className={styles.statValue}>
                    ₦{(reconciliationData?.metrics?.total_sent_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total Received Money</span>
                  <div className={styles.statValue}>
                    ₦{(reconciliationData?.metrics?.total_received_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Net Variance Difference</span>
                  <div className={styles.statValue} style={{ color: reconciliationData?.metrics?.variance_naira === 0 ? "#10b981" : "#ef4444" }}>
                    ₦{(reconciliationData?.metrics?.variance_naira || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Platform Treasury Balance</span>
                  <div className={styles.statValue} style={{ color: "#10b981" }}>
                    ₦{(Number(reconciliationData?.platformTreasury?.balance || 0)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>
                    +₦{(Number(reconciliationData?.platformTreasury?.total_forfeited_absorbed || 0)).toLocaleString("en-NG", { minimumFractionDigits: 2 })} absorbed from deactivations
                  </span>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Pending Forfeited Balances</span>
                  <div className={styles.statValue} style={{ color: (reconciliationData?.pendingForfeituresCount || 0) > 0 ? "#f59e0b" : "var(--foreground)" }}>
                    ₦{(reconciliationData?.pendingForfeituresTotal || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: (reconciliationData?.pendingForfeituresCount || 0) > 0 ? "#f59e0b" : "var(--text-muted, #94a3b8)", marginTop: "4px" }}>
                    {reconciliationData?.pendingForfeituresCount || 0} deactivated account(s) pending
                  </span>
                </div>
              </div>

              {/* Pending Dual-Authorization Requests (Four-Eyes Principle) */}
              <div style={{ marginBottom: "2.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 className={styles.cardTitle} style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <ShieldCheck size={18} color="#6366f1" />
                      <span>Pending Dual-Authorization Queue (Four-Eyes Principle)</span>
                    </h3>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>
                      Actions over ₦50,000 or sensitive modifications require explicit secondary peer admin review.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchPendingRequests(true, pendingRequestsPage, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch)}
                    disabled={pendingRequestsLoading}
                    className={styles.btnAction}
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <RefreshCw size={13} className={pendingRequestsLoading ? styles.spin : ""} />
                    <span>{pendingRequestsLoading ? "Refreshing..." : "Refresh Queue"}</span>
                  </button>
                </div>

                {/* Filter Tabs & Search Controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingRequestsStatusFilter("PENDING");
                        setPendingRequestsPage(0);
                        fetchPendingRequests(false, 0, pendingRequestsLimit, "PENDING", pendingRequestsSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: pendingRequestsStatusFilter === "PENDING" ? "#f59e0b" : "transparent",
                        color: pendingRequestsStatusFilter === "PENDING" ? "#fff" : "var(--foreground)",
                        borderColor: pendingRequestsStatusFilter === "PENDING" ? "#f59e0b" : "var(--card-border)",
                      }}
                    >
                      Pending ({pendingRequestsSummary.pending_count})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingRequestsStatusFilter("APPROVED");
                        setPendingRequestsPage(0);
                        fetchPendingRequests(false, 0, pendingRequestsLimit, "APPROVED", pendingRequestsSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: pendingRequestsStatusFilter === "APPROVED" ? "#10b981" : "transparent",
                        color: pendingRequestsStatusFilter === "APPROVED" ? "#fff" : "var(--foreground)",
                        borderColor: pendingRequestsStatusFilter === "APPROVED" ? "#10b981" : "var(--card-border)",
                      }}
                    >
                      Approved ({pendingRequestsSummary.approved_count})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingRequestsStatusFilter("REJECTED");
                        setPendingRequestsPage(0);
                        fetchPendingRequests(false, 0, pendingRequestsLimit, "REJECTED", pendingRequestsSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: pendingRequestsStatusFilter === "REJECTED" ? "#ef4444" : "transparent",
                        color: pendingRequestsStatusFilter === "REJECTED" ? "#fff" : "var(--foreground)",
                        borderColor: pendingRequestsStatusFilter === "REJECTED" ? "#ef4444" : "var(--card-border)",
                      }}
                    >
                      Rejected ({pendingRequestsSummary.rejected_count})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingRequestsStatusFilter("ALL");
                        setPendingRequestsPage(0);
                        fetchPendingRequests(false, 0, pendingRequestsLimit, "ALL", pendingRequestsSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: pendingRequestsStatusFilter === "ALL" ? "var(--primary)" : "transparent",
                        color: pendingRequestsStatusFilter === "ALL" ? "#fff" : "var(--foreground)",
                        borderColor: pendingRequestsStatusFilter === "ALL" ? "var(--primary)" : "var(--card-border)",
                      }}
                    >
                      All Records ({pendingRequestsSummary.total_count})
                    </button>
                  </div>

                  {/* Search box */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", position: "relative", minWidth: "220px" }}>
                    <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)" }} />
                    <input
                      type="text"
                      placeholder="Search requests..."
                      value={pendingRequestsSearch}
                      onChange={(e) => setPendingRequestsSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setPendingRequestsPage(0);
                          fetchPendingRequests(false, 0, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
                        }
                      }}
                      style={{
                        paddingLeft: "30px",
                        paddingRight: "10px",
                        paddingTop: "6px",
                        paddingBottom: "6px",
                        fontSize: "0.82rem",
                        borderRadius: "8px",
                        border: "1px solid var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--foreground)",
                        outline: "none",
                        width: "100%",
                      }}
                    />
                    {pendingRequestsSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingRequestsSearch("");
                          setPendingRequestsPage(0);
                          fetchPendingRequests(false, 0, pendingRequestsLimit, pendingRequestsStatusFilter, "");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                          padding: "2px 4px",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {pendingRequestsLoading ? (
                  <div className={styles.loadingText}>Loading authorization queue...</div>
                ) : pendingRequests.length === 0 ? (
                  <div className={styles.emptyState} style={{ padding: "1.2rem", background: "rgba(99,102,241,0.04)", border: "1px dashed rgba(99,102,241,0.2)" }}>
                    No authorizations found matching criteria. All clear!
                  </div>
                ) : (
                  <>
                    <div className={styles.cardsGrid}>
                      {pendingRequests.map((req: any) => {
                        const isPending = req.status === "PENDING";
                        const isApproved = req.status === "APPROVED";
                        const borderColor = isPending ? "#f59e0b" : isApproved ? "#10b981" : "#ef4444";
                        const badgeBg = isPending ? "rgba(245,158,11,0.15)" : isApproved ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)";
                        const badgeColor = isPending ? "#f59e0b" : isApproved ? "#10b981" : "#ef4444";

                        return (
                          <div key={req.id} className={styles.cardItem} style={{ borderLeft: `4px solid ${borderColor}` }}>
                            <div className={styles.cardHeader}>
                              <div>
                                <h3 className={styles.cardTitle} style={{ textTransform: "capitalize" }}>
                                  {req.action_type.replace(/_/g, " ")}
                                </h3>
                                <span className={styles.cardMeta}>
                                  Requested by <strong>{req.requested_by}</strong> on {new Date(req.created_at).toLocaleString()}
                                </span>
                              </div>
                              <span style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "99px",
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeColor}40`
                              }}>
                                {req.status}
                              </span>
                            </div>

                            <div className={styles.cardDetails} style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                              {req.amount_kobo > 0 && (
                                <div>
                                  <strong>Amount:</strong> ₦{(req.amount_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                                </div>
                              )}
                              {req.amount_naira > 0 && (
                                <div>
                                  <strong>Amount:</strong> ₦{Number(req.amount_naira).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                                </div>
                              )}
                              {req.target_reference && (
                                <div>
                                  <strong>Reference:</strong> <code>{req.target_reference}</code>
                                </div>
                              )}
                              {req.target_identifier && (
                                <div>
                                  <strong>Target:</strong> <code>{req.target_identifier}</code>
                                </div>
                              )}
                              {req.target_user_email && (
                                <div>
                                  <strong>Target User:</strong> {req.target_user_email}
                                </div>
                              )}
                              {req.reason && (
                                <div className={styles.reportReasonBox} style={{ marginTop: "0.5rem" }}>
                                  <strong>Reason:</strong> {req.reason}
                                </div>
                              )}
                              {req.approved_by && (
                                <div style={{ fontSize: "0.8rem", color: "#10b981", marginTop: "0.4rem" }}>
                                  <strong>Approved By:</strong> {req.approved_by}
                                </div>
                              )}
                              {req.rejected_by && (
                                <div style={{ fontSize: "0.8rem", color: "#ef4444", marginTop: "0.4rem" }}>
                                  <strong>Rejected By:</strong> {req.rejected_by} ({req.rejection_reason || "No reason given"})
                                </div>
                              )}
                            </div>

                            {isPending && (
                              <div className={styles.cardFooter} style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                                <button
                                  type="button"
                                  onClick={() => handleApproveRequest(req.id)}
                                  disabled={approvingRequestId === req.id}
                                  className={`${styles.btnAction} ${styles.btnSuccess}`}
                                  style={{ flex: 1, padding: "0.5rem 0.8rem", fontSize: "0.85rem", fontWeight: 700 }}
                                >
                                  {approvingRequestId === req.id ? "Approving..." : "Approve and Execute"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectRequest(req.id)}
                                  disabled={approvingRequestId === req.id}
                                  className={`${styles.btnAction} ${styles.btnDanger}`}
                                  style={{ flex: 1, padding: "0.5rem 0.8rem", fontSize: "0.85rem", fontWeight: 700 }}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {renderPagination(
                      pendingRequestsPage,
                      (newPage) => {
                        setPendingRequestsPage(newPage);
                        fetchPendingRequests(false, newPage, pendingRequestsLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
                      },
                      pendingRequestsPagination?.totalCount ?? 0,
                      pendingRequestsLimit,
                      (newLimit) => {
                        setPendingRequestsLimit(newLimit);
                        setPendingRequestsPage(0);
                        fetchPendingRequests(false, 0, newLimit, pendingRequestsStatusFilter, pendingRequestsSearch);
                      }
                    )}
                  </>
                )}
              </div>

              {/* Deactivated Account Forfeitures (Treasury Absorption Queue) */}
              <div style={{ marginBottom: "2.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 className={styles.cardTitle} style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Building2 size={18} color="#10b981" />
                      <span>Deactivated Account Forfeited Balances (Treasury Absorption Queue)</span>
                    </h3>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>
                      When users deactivate accounts with balances below withdrawal thresholds and forfeit funds, review and resolve them to platform balance with an immutable audit log trace.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchReconciliationData(true, forfeitedPage, forfeitedLimit, forfeitedStatusFilter, forfeitedSearch)}
                    disabled={reconciliationLoading}
                    className={styles.btnAction}
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <RefreshCw size={13} />
                    <span>{reconciliationLoading ? "Refreshing..." : "Refresh Queue"}</span>
                  </button>
                </div>

                {/* Filter Tabs & Search Controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setForfeitedStatusFilter("ALL");
                        setForfeitedPage(0);
                        fetchReconciliationData(false, 0, forfeitedLimit, "ALL", forfeitedSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: forfeitedStatusFilter === "ALL" ? "var(--primary)" : "transparent",
                        color: forfeitedStatusFilter === "ALL" ? "#fff" : "var(--foreground)",
                        borderColor: forfeitedStatusFilter === "ALL" ? "var(--primary)" : "var(--card-border)",
                      }}
                    >
                      All Records
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForfeitedStatusFilter("PENDING");
                        setForfeitedPage(0);
                        fetchReconciliationData(false, 0, forfeitedLimit, "PENDING", forfeitedSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: forfeitedStatusFilter === "PENDING" ? "#f59e0b" : "transparent",
                        color: forfeitedStatusFilter === "PENDING" ? "#fff" : "var(--foreground)",
                        borderColor: forfeitedStatusFilter === "PENDING" ? "#f59e0b" : "var(--card-border)",
                      }}
                    >
                      Pending ({reconciliationData?.pendingForfeituresCount ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForfeitedStatusFilter("RESOLVED");
                        setForfeitedPage(0);
                        fetchReconciliationData(false, 0, forfeitedLimit, "RESOLVED", forfeitedSearch);
                      }}
                      className={styles.btnAction}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 12px",
                        backgroundColor: forfeitedStatusFilter === "RESOLVED" ? "#10b981" : "transparent",
                        color: forfeitedStatusFilter === "RESOLVED" ? "#fff" : "var(--foreground)",
                        borderColor: forfeitedStatusFilter === "RESOLVED" ? "#10b981" : "var(--card-border)",
                      }}
                    >
                      Resolved
                    </button>
                  </div>

                  {/* Search box */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", position: "relative", minWidth: "220px" }}>
                    <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)" }} />
                    <input
                      type="text"
                      placeholder="Filter by email or user..."
                      value={forfeitedSearch}
                      onChange={(e) => setForfeitedSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setForfeitedPage(0);
                          fetchReconciliationData(false, 0, forfeitedLimit, forfeitedStatusFilter, forfeitedSearch);
                        }
                      }}
                      style={{
                        paddingLeft: "30px",
                        paddingRight: "10px",
                        paddingTop: "6px",
                        paddingBottom: "6px",
                        fontSize: "0.82rem",
                        borderRadius: "8px",
                        border: "1px solid var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--foreground)",
                        outline: "none",
                        width: "100%",
                      }}
                    />
                    {forfeitedSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setForfeitedSearch("");
                          setForfeitedPage(0);
                          fetchReconciliationData(false, 0, forfeitedLimit, forfeitedStatusFilter, "");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                          padding: "2px 4px",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {!reconciliationData?.forfeitedBalances || reconciliationData.forfeitedBalances.length === 0 ? (
                  <div className={styles.emptyState} style={{ padding: "1.2rem", background: "rgba(16,185,129,0.04)", border: "1px dashed rgba(16,185,129,0.2)" }}>
                    No forfeited balances matching criteria. All records clean!
                  </div>
                ) : (
                  <>
                    <div className={styles.cardsGrid}>
                      {reconciliationData.forfeitedBalances.map((item: any) => {
                        const isPending = item.status === "PENDING";
                        const amountFormatted = `₦${(parseFloat(item.amount) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

                        return (
                          <div key={item.id} className={styles.cardItem}>
                            <div className={styles.cardHeader}>
                              <div>
                                <h3 className={styles.cardTitle} style={{ fontSize: "0.95rem" }}>
                                  {item.username ? `@${item.username}` : item.user_email}
                                </h3>
                                <span className={styles.cardMeta}>
                                  Deactivated: {new Date(item.created_at).toLocaleString()}
                                </span>
                              </div>
                              <span style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                padding: "4px 10px",
                                borderRadius: "99px",
                                backgroundColor: isPending ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                                color: isPending ? "#f59e0b" : "#10b981",
                                border: `1px solid ${isPending ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`
                              }}>
                                {item.status}
                              </span>
                            </div>

                            <div className={styles.cardBody} style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                              <div><strong>Account Email:</strong> <span style={{ color: "var(--foreground)" }}>{item.user_email}</span></div>
                              <div>
                                <strong>Forfeited Amount:</strong>{" "}
                                <span style={{ color: "#10b981", fontWeight: 800, fontSize: "1rem" }}>
                                  {amountFormatted}
                                </span>
                              </div>
                              <div><strong>Reason:</strong> <span style={{ color: "var(--text-muted)" }}>{item.reason}</span></div>

                              {!isPending && item.resolved_by && (
                                <div style={{
                                  marginTop: "0.5rem",
                                  padding: "8px 10px",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(16,185,129,0.08)",
                                  border: "1px solid rgba(16,185,129,0.2)",
                                  fontSize: "0.8rem",
                                }}>
                                  <div><strong>Resolved By:</strong> {item.resolved_by}</div>
                                  {item.resolved_at && <div><strong>Resolved At:</strong> {new Date(item.resolved_at).toLocaleString()}</div>}
                                  {item.resolution_notes && <div><strong>Audit Note:</strong> {item.resolution_notes}</div>}
                                </div>
                              )}
                            </div>

                            {isPending && (
                              <div className={styles.cardFooter}>
                                <button
                                  type="button"
                                  onClick={() => handleResolveForfeiture(item.id, parseFloat(item.amount) || 0)}
                                  disabled={forfeitureActionLoading === item.id || reconciliationLoading}
                                  className={styles.btnAction}
                                  style={{
                                    backgroundColor: "#10b981",
                                    color: "#fff",
                                    fontWeight: 700,
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "0.4rem",
                                    opacity: (forfeitureActionLoading === item.id || reconciliationLoading) ? 0.65 : 1,
                                    cursor: (forfeitureActionLoading === item.id || reconciliationLoading) ? "not-allowed" : "pointer",
                                  }}
                                >
                                  <Zap size={14} />
                                  <span>{forfeitureActionLoading === item.id ? "Resolving..." : "Resolve to Platform Balance"}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {renderPagination(
                      forfeitedPage,
                      (newPage) => {
                        setForfeitedPage(newPage);
                        fetchReconciliationData(false, newPage, forfeitedLimit, forfeitedStatusFilter, forfeitedSearch);
                      },
                      reconciliationData?.forfeituresPagination?.totalCount ?? 0,
                      forfeitedLimit,
                      (newLimit) => {
                        setForfeitedLimit(newLimit);
                        setForfeitedPage(0);
                        fetchReconciliationData(false, 0, newLimit, forfeitedStatusFilter, forfeitedSearch);
                      }
                    )}
                  </>
                )}
              </div>

              {/* Reconciliation Logs Table */}
              <div>
                <h3 className={styles.cardTitle} style={{ marginBottom: "1rem" }}>System Audit and Reconciliation Log History</h3>
                {reconciliationLoading ? (
                  <div className={styles.loadingText}>Fetching reconciliation logs...</div>
                ) : !reconciliationData?.logs || reconciliationData.logs.length === 0 ? (
                  <div className={styles.emptyState}>No audit logs found. Run a nightly reconciliation scan.</div>
                ) : (
                  <div className={styles.cardsGrid}>
                    {reconciliationData.logs.map((log: any) => (
                      <div key={log.id} className={styles.cardItem}>
                        <div className={styles.cardHeader}>
                          <div>
                            <h3 className={styles.cardTitle}>Audit Log #{log.id.slice(0, 8)}</h3>
                            <span className={styles.cardMeta}>
                              Run at: {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <span style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: "99px",
                            backgroundColor: log.status === "HEALTHY" ? "rgba(16,185,129,0.15)" : log.status === "FLAGGED" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
                            color: log.status === "HEALTHY" ? "#10b981" : log.status === "FLAGGED" ? "#ef4444" : "#3b82f6",
                            border: `1px solid ${log.status === "HEALTHY" ? "rgba(16,185,129,0.3)" : log.status === "FLAGGED" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`
                          }}>
                            {log.status}
                          </span>
                        </div>

                        <div className={styles.cardBody} style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          <div><strong>Total Sent:</strong> ₦{(log.total_debits_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div>
                          <div><strong>Total Received:</strong> ₦{(log.total_credits_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div>
                          <div><strong>Variance:</strong> ₦{(log.variance_kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</div>
                          {log.notes && (
                            <div className={styles.reportReasonBox}>
                              <strong>Audit Note:</strong> {log.notes}
                            </div>
                          )}
                        </div>

                        {log.status === "FLAGGED" && (
                          <div className={styles.cardFooter}>
                            <button
                              type="button"
                              onClick={() => handleResolveReconciliationLog(log.id)}
                              disabled={reconciliationActionLoading || reconciliationLoading}
                              className={styles.btnAction}
                              style={{
                                backgroundColor: "#3b82f6",
                                color: "#fff",
                                opacity: (reconciliationActionLoading || reconciliationLoading) ? 0.65 : 1,
                                cursor: (reconciliationActionLoading || reconciliationLoading) ? "not-allowed" : "pointer",
                              }}
                            >
                              Mark Resolved and Add Audit Note
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 13. BRAND SUBSCRIBERS / PREMIUM SUBSCRIBERS TAB */}
          {activeTab === "brand-subscribers" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Brand Registrations and Premium Subscribers</h1>
                <p className={styles.sectionSubtitle}>
                  Review business domain applications, authorize 30% ad subsidy approvals, and monitor activation payment records.
                </p>
              </div>

              {/* Metrics Summary Cards */}
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statHeader}>
                    <span className={styles.statLabel}>Total Applications</span>
                    <Building2 size={18} color="#3b82f6" />
                  </div>
                  <div className={styles.statValue}>{subscribersMetrics.total}</div>
                </div>

                <div className={styles.statCard}>
                  <div className={styles.statHeader}>
                    <span className={styles.statLabel}>Pending Review</span>
                    <Clock size={18} color="#f59e0b" />
                  </div>
                  <div className={styles.statValue} style={{ color: "#f59e0b" }}>{subscribersMetrics.pending}</div>
                </div>

                <div className={styles.statCard}>
                  <div className={styles.statHeader}>
                    <span className={styles.statLabel}>Approved (Awaiting Payment)</span>
                    <ShieldCheck size={18} color="#60a5fa" />
                  </div>
                  <div className={styles.statValue} style={{ color: "#60a5fa" }}>{subscribersMetrics.approved}</div>
                </div>

                <div className={styles.statCard}>
                  <div className={styles.statHeader}>
                    <span className={styles.statLabel}>Active Subscribers (Paid)</span>
                    <CheckCircle2 size={18} color="#10b981" />
                  </div>
                  <div className={styles.statValue} style={{ color: "#10b981" }}>{subscribersMetrics.active}</div>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                margin: "1.5rem 0 1rem 0",
              }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(["all", "pending", "approved", "active", "rejected"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setSubscribersStatus(st);
                        setSubscribersPage(0);
                        fetchSubscribers(0, subscribersLimit, st, subscribersSearch, true);
                      }}
                      className={styles.btnAction}
                      style={{
                        padding: "6px 14px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        textTransform: "capitalize",
                        backgroundColor: subscribersStatus === st ? "var(--primary, #3b82f6)" : "var(--card-bg, #0f172a)",
                        color: subscribersStatus === st ? "#fff" : "var(--text-muted, #94a3b8)",
                        border: subscribersStatus === st ? "1px solid var(--primary, #3b82f6)" : "1px solid var(--card-border, rgba(255,255,255,0.1))",
                      }}
                    >
                      {st === "all" ? "All Applications" : st === "approved" ? "Approved (Unpaid)" : st === "active" ? "Active (Paid)" : st}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Search domain, business, or email..."
                    value={subscribersSearch}
                    onChange={(e) => setSubscribersSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSubscribersPage(0);
                        fetchSubscribers(0, subscribersLimit, subscribersStatus, subscribersSearch, true);
                      }
                    }}
                    className={styles.modalInput}
                    style={{ minWidth: "260px", padding: "6px 12px", fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSubscribersPage(0);
                      fetchSubscribers(0, subscribersLimit, subscribersStatus, subscribersSearch, true);
                    }}
                    className={styles.btnAction}
                    style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchSubscribers(subscribersPage, subscribersLimit, subscribersStatus, subscribersSearch, true)}
                    disabled={subscribersLoading}
                    className={styles.btnAction}
                    style={{ padding: "6px 12px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <RefreshCw size={13} className={subscribersLoading ? "spin" : ""} />
                    <span>Sync</span>
                  </button>
                </div>
              </div>

              {/* Subscribers List */}
              {subscribersLoading ? (
                <div className={styles.loadingText}>Fetching brand subscriber records...</div>
              ) : subscribers.length === 0 ? (
                <div className={styles.emptyState}>
                  No brand applications found matching the selected criteria.
                </div>
              ) : (
                <div className={styles.cardsGrid}>
                  {subscribers.map((sub: any) => {
                    const isPending = sub.status === "pending";
                    const isApproved = sub.status === "approved";
                    const isActive = sub.status === "active";
                    const isRejected = sub.status === "rejected";

                    const badgeBg = isPending
                      ? "rgba(245,158,11,0.15)"
                      : isApproved
                      ? "rgba(96,165,250,0.15)"
                      : isActive
                      ? "rgba(16,185,129,0.15)"
                      : "rgba(239,68,68,0.15)";
                    const badgeColor = isPending
                      ? "#f59e0b"
                      : isApproved
                      ? "#60a5fa"
                      : isActive
                      ? "#10b981"
                      : "#ef4444";

                    const formattedAmount = sub.currency === "NGN"
                      ? `₦${Number(sub.amount || 150000).toLocaleString()}`
                      : `$${sub.amount || 100}`;

                    return (
                      <div
                        key={sub.id}
                        className={styles.cardItem}
                        style={{
                          borderLeft: `4px solid ${badgeColor}`,
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.75rem",
                        }}
                      >
                        <div className={styles.cardHeader}>
                          <div>
                            <h3 className={styles.cardTitle} style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "6px" }}>
                              <Building2 size={16} color={badgeColor} />
                              <span>{sub.business_name}</span>
                            </h3>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                              <Globe size={13} color="var(--primary, #3b82f6)" />
                              <strong style={{ color: "var(--primary, #3b82f6)", fontSize: "0.9rem" }}>{sub.domain}</strong>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                padding: "4px 10px",
                                borderRadius: "99px",
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeColor}40`,
                                textTransform: "uppercase",
                              }}
                            >
                              {sub.status}
                            </span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted, #94a3b8)" }}>
                              Payment: <strong style={{ color: sub.payment_status === "paid" ? "#10b981" : "#f59e0b" }}>{sub.payment_status || "unpaid"}</strong>
                            </span>
                          </div>
                        </div>

                        <div className={styles.cardBody} style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <div>
                            <strong>Applicant Email:</strong>{" "}
                            <span style={{ color: "var(--foreground)" }}>{sub.user_email || sub.contact_email || "Not specified"}</span>
                          </div>
                          {sub.contact_email && sub.contact_email !== sub.user_email && (
                            <div>
                              <strong>Contact Email:</strong>{" "}
                              <span style={{ color: "var(--foreground)" }}>{sub.contact_email}</span>
                            </div>
                          )}
                          <div>
                            <strong>Subscription Fee:</strong>{" "}
                            <span style={{ color: "#10b981", fontWeight: 700 }}>{formattedAmount}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #94a3b8)", marginLeft: "6px" }}>
                              ({sub.discount_percentage || 30}% discount subsidy on ads)
                            </span>
                          </div>
                          <div>
                            <strong>Submitted:</strong>{" "}
                            <span style={{ color: "var(--text-muted, #94a3b8)" }}>{new Date(sub.created_at).toLocaleString()}</span>
                          </div>
                          {sub.reviewed_by && (
                            <div>
                              <strong>Reviewed By:</strong>{" "}
                              <span style={{ color: "var(--text-muted, #94a3b8)" }}>{sub.reviewed_by} ({sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleDateString() : "date unknown"})</span>
                            </div>
                          )}
                          {sub.rejection_reason && (
                            <div style={{ color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", padding: "6px 8px", borderRadius: "6px", marginTop: "4px" }}>
                              <strong>Rejection Reason:</strong> {sub.rejection_reason}
                            </div>
                          )}
                          {sub.payment_reference && (
                            <div>
                              <strong>Payment Ref:</strong> <code>{sub.payment_reference}</code>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons for Admins */}
                        <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "0.5rem", borderTop: "1px solid var(--card-border, rgba(255,255,255,0.08))" }}>
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveSubscriber(sub)}
                                disabled={subscriberActionLoading === sub.id}
                                className={styles.btnAction}
                                style={{
                                  flex: 1,
                                  backgroundColor: "#10b981",
                                  color: "#fff",
                                  padding: "8px 12px",
                                  fontSize: "0.85rem",
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                }}
                              >
                                <CheckCircle2 size={14} />
                                {subscriberActionLoading === sub.id ? "Approving..." : "Approve Application"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectSubscriber(sub)}
                                disabled={subscriberActionLoading === sub.id}
                                className={`${styles.btnAction} ${styles.btnDanger}`}
                                style={{
                                  padding: "8px 14px",
                                  fontSize: "0.85rem",
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <X size={14} />
                                Reject
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
                              <span style={{ fontSize: "0.8rem", color: "#60a5fa" }}>
                                ⏳ Approved — awaiting brand owner payment of {formattedAmount}.
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRejectSubscriber(sub)}
                                disabled={subscriberActionLoading === sub.id}
                                className={`${styles.btnAction} ${styles.btnDanger}`}
                                style={{ padding: "5px 10px", fontSize: "0.75rem" }}
                              >
                                Revoke / Reject
                              </button>
                            </div>
                          )}

                          {isActive && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
                              <span style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 600 }}>
                                ✓ Active Verified Subscriber (30% Discount Live)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRejectSubscriber(sub)}
                                disabled={subscriberActionLoading === sub.id}
                                className={`${styles.btnAction} ${styles.btnDanger}`}
                                style={{ padding: "5px 10px", fontSize: "0.75rem" }}
                              >
                                Suspend Brand
                              </button>
                            </div>
                          )}

                          {isRejected && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
                              <span style={{ fontSize: "0.8rem", color: "#ef4444" }}>
                                Rejected
                              </span>
                              <button
                                type="button"
                                onClick={() => handleApproveSubscriber(sub)}
                                disabled={subscriberActionLoading === sub.id}
                                className={styles.btnAction}
                                style={{ backgroundColor: "#10b981", color: "#fff", padding: "5px 10px", fontSize: "0.75rem" }}
                              >
                                Re-approve
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {renderPagination(
                subscribersPage,
                (newPage) => {
                  setSubscribersPage(newPage);
                  fetchSubscribers(newPage, subscribersLimit, subscribersStatus, subscribersSearch);
                },
                subscribersCount,
                subscribersLimit,
                (newLimit) => {
                  setSubscribersLimit(newLimit);
                  setSubscribersPage(0);
                  fetchSubscribers(0, newLimit, subscribersStatus, subscribersSearch);
                }
              )}
            </>
          )}

        </main>
      </div>

      {/* ==================================================== */}
      {/* MODAL: USER DETAILED PROFILE OPERATIONS */}
      {/* ==================================================== */}
      {selectedUser && (
        <div className={styles.modalOverlay} onClick={() => setSelectedUser(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  backgroundColor: "var(--primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "700",
                  fontSize: "1rem"
                }}>
                  {selectedUser.firstName ? selectedUser.firstName.slice(0, 2).toUpperCase() : "US"}
                </div>
                <div>
                  <h3 className={styles.modalTitle} style={{ margin: 0 }}>
                    {selectedUser.business_name || `${selectedUser.firstName} ${selectedUser.lastName}`}
                  </h3>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
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
                <div className={styles.gridTwoCol} style={{ marginBottom: "0.5rem" }}>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Available Balance</span>
                    <span className={styles.metricValue} style={{ color: "#10b981" }}>{formatCurrency(selectedUser.balance || 0)}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Pending Withdrawal</span>
                    <span className={styles.metricValue} style={{ color: "#3b82f6" }}>{formatCurrency(selectedUser.withdrawal || 0)}</span>
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
              <div className={styles.modalSectionCard} style={{ borderColor: "rgba(239, 68, 68, 0.2)" }}>
                <h4 className={styles.modalSectionTitle} style={{ color: "#f85149" }}>User Account Suspension Controls</h4>
                
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
              <button disabled={userActionSubmitting} onClick={() => handleDeleteUser(selectedUser)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ marginRight: "auto" }}>
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
          <div className={styles.modalContent} style={{ maxWidth: "550px" }}>
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
          <div className={styles.modalContent} style={{ maxWidth: "500px" }}>
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
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                <strong style={{ color: "var(--foreground)" }}>From:</strong> {replyingTicket.name ? `${replyingTicket.name} — ` : ""}{replyingTicket.user_email}
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.5, background: "var(--sidebar-bg)", padding: "0.75rem", borderRadius: "8px" }}>
                {replyingTicket.message}
              </p>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Your Reply</label>
                <textarea
                  className={styles.textareaField}
                  rows={5}
                  placeholder="Type your reply here..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{ width: "100%", resize: "vertical", minHeight: "120px" }}
                />
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
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Megaphone size={20} color="var(--primary)" />
                <h3 className={styles.modalTitle}>Ad Details Inspector</h3>
              </div>
              <button className={styles.btnClose} onClick={() => setInspectingAd(null)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <AdminAdMediaBox adMedia={inspectingAd.ad_media || inspectingAd.ad_media_url || ""} adMediaType={inspectingAd.ad_media_type} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", backgroundColor: "var(--sidebar-bg)", padding: "1.1rem", borderRadius: "10px", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
                <div><strong>Ad ID:</strong> <code style={{ wordBreak: "break-all" }}>{inspectingAd.id}</code></div>
                <div><strong>Ad Type:</strong> <span style={{ textTransform: "capitalize", fontWeight: "700", color: "var(--primary)" }}>{inspectingAd.ad_type}</span></div>
                <div><strong>Advertiser Email:</strong> <code style={{ wordBreak: "break-all" }}>{inspectingAd.user_email || inspectingAd.email}</code></div>
                <div><strong>Status:</strong> <span style={{ fontWeight: "700", color: inspectingAd.is_paused ? "#ef4444" : "#10b981" }}>{inspectingAd.is_paused ? "Paused / Deactivated" : "Active"}</span></div>
                <div><strong>Impressions:</strong> <span>{inspectingAd.impression_count || 0} / {inspectingAd.impressions || 0}</span></div>
                <div><strong>Mutual Attention:</strong> <span>{inspectingAd.mutual_adds_count || 0}</span></div>
                <div><strong>Bid / Cost:</strong> <span>₦{inspectingAd.cost_per_impression || 25} / attention</span></div>
                <div><strong>Created:</strong> <span>{inspectingAd.created_at ? new Date(inspectingAd.created_at).toLocaleString() : "N/A"}</span></div>
              </div>

              {inspectingAd.ad_content && (
                <div style={{ backgroundColor: "var(--sidebar-bg)", padding: "1.1rem", borderRadius: "10px", border: "1px solid var(--card-border)" }}>
                  <strong style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Ad Headline / Content:</strong>
                  <p style={{ marginTop: "0.35rem", fontSize: "0.95rem", color: "var(--foreground)", whiteSpace: "pre-wrap" }}>{inspectingAd.ad_content}</p>
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
              <button
                onClick={() => setInspectingAd(null)}
                className={styles.btnAction}
                style={{ backgroundColor: "var(--sidebar-bg)", color: "var(--foreground)", border: "1px solid var(--card-border)" }}
              >
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
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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

      {/* ==================================================== */}
      {/* MODAL: REVERSE USER TRANSFER */}
      {/* ==================================================== */}
      {showReverseModal && (
        <div className={styles.modalOverlay} onClick={() => !reversalLoading && setShowReverseModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(99,102,241,0.15)",
                  color: "#6366f1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "700"
                }}>
                  <RefreshCw size={20} />
                </div>
                <div>
                  <h3 className={styles.modalTitle} style={{ margin: 0 }}>Reverse User Transfer</h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>
                    Claw back funds from recipient and refund sender atomically.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => !reversalLoading && setShowReverseModal(false)}
                disabled={reversalLoading}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteReversal}>
              <div className={styles.modalBody}>
                {reversalError && (
                  <div style={{
                    color: "#ef4444",
                    fontSize: "0.85rem",
                    background: "rgba(239,68,68,0.1)",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(239,68,68,0.2)",
                    marginBottom: "1rem"
                  }}>
                    {reversalError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Transaction Reference (Required)</label>
                  <input
                    type="text"
                    placeholder="e.g. trf_1725619200000_abc123"
                    value={reverseRef}
                    onChange={(e) => setReverseRef(e.target.value)}
                    required
                    disabled={reversalLoading}
                    className={styles.inputField}
                    style={{ fontFamily: "monospace" }}
                  />
                  <span className={styles.formHelperText}>
                    Enter the original debit or credit transaction reference recorded on the ledger.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Audit Reason / Notes (Required)</label>
                  <textarea
                    rows={3}
                    placeholder="Explain reason for transfer reversal (e.g., Reported user compromise, accidental duplicate transfer)..."
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    required
                    disabled={reversalLoading}
                    className={styles.textareaField}
                  />
                  <span className={styles.formHelperText}>
                    Transactions exceeding ₦50,000 will be routed to the Dual-Authorization Queue for second-party review.
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  disabled={reversalLoading}
                  className={styles.btnAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversalLoading}
                  className={styles.btnAction}
                  style={{
                    backgroundColor: "#6366f1",
                    color: "#fff",
                    fontWeight: 700,
                    opacity: reversalLoading ? 0.65 : 1,
                    cursor: reversalLoading ? "not-allowed" : "pointer"
                  }}
                >
                  {reversalLoading ? "Executing Reversal..." : "Execute Reversal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
