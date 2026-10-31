"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
import dynamic from "next/dynamic";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";

const AdminPayoutsTab = dynamic(() => import("./AdminPayoutsTab"), { ssr: false });
const AdminMasterStatementTab = dynamic(() => import("./AdminMasterStatementTab"), { ssr: false });
const AdminReconciliationTab = dynamic(() => import("./AdminReconciliationTab"), { ssr: false });
const AdminOverviewTab = dynamic(() => import("./AdminOverviewTab"), { ssr: false });
const AdminDirectPostTab = dynamic(() => import("./AdminDirectPostTab"), { ssr: false });
const AdminSendNotificationsTab = dynamic(() => import("./AdminSendNotificationsTab"), { ssr: false });
const AdminQueuesTab = dynamic(() => import("./AdminQueuesTab"), { ssr: false });
const AdminBrandSubscribersTab = dynamic(() => import("./AdminBrandSubscribersTab"), { ssr: false });

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

import { AdminAdMediaBox, AdminDashboardModals } from "./AdminDashboardModals";
import { AdminAdCard, AdminHighlightCard } from "./AdminCampaignCards";
import { AdminAccountsTab, AdminHelpCenterTab, AdminReportedAdsTab } from "./AdminCoreTabs";
import { AdminHeader, AdminSidebar, AdminCampaignQueueOrActiveSection } from "./AdminLayoutAndCampaignTabs";
import { useAdminCampaignAndUserActions } from "./useAdminCampaignAndUserActions";
import { useAdminDataAndSupport } from "./useAdminDataAndSupport";
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
  const {
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
  } = useAdminDataAndSupport({
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
  });

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

  const {
    handleToggleMonetization,
    handleSuspendUser,
    handleAdjustBalance,
    handleDeleteUser,
    handleApproveAd,
    handleRejectAd,
    handleTogglePauseAd,
    handleDeactivateAd,
    handleSaveAdEdit,
    handleDeleteAd,
    handleApproveHighlight,
    handleRejectHighlight,
    handleTogglePauseHighlight,
    handleSaveHighlightEdit,
    handleDeleteHighlight,
    handlePostAdDirect,
    handlePostHighlightDirect,
    toggleIndustryFormSelection,
    toggleInterestFormSelection,
  } = useAdminCampaignAndUserActions({
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
    handleRefresh,
    fetchOverviewStats,
    handleTabChange,
  });

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

  const renderAdminAdCard = (ad: any, isQueue = false) => (
    <AdminAdCard
      key={ad.id}
      ad={ad}
      isQueue={isQueue}
      campaignActionLoading={campaignActionLoading}
      handleApproveAd={handleApproveAd}
      handleRejectAd={handleRejectAd}
      handleDeleteAd={handleDeleteAd}
      handleTogglePauseAd={handleTogglePauseAd}
      handleDeactivateAd={handleDeactivateAd}
      setEditAdData={setEditAdData}
    />
  );

  const renderAdminHighlightCard = (highlight: any, isQueue = false) => (
    <AdminHighlightCard
      key={highlight.id}
      highlight={highlight}
      isQueue={isQueue}
      campaignActionLoading={campaignActionLoading}
      handleApproveHighlight={handleApproveHighlight}
      handleRejectHighlight={handleRejectHighlight}
      handleDeleteHighlight={handleDeleteHighlight}
      handleTogglePauseHighlight={handleTogglePauseHighlight}
      setEditHighlightData={setEditHighlightData}
    />
  );

  return (
    <div className={styles.adminWrapper}>
      <AdminHeader
        email={session.user?.email}
        theme={theme}
        setTheme={setTheme}
        mounted={mounted}
      />

      <div className={styles.dashboardContent}>
        <AdminSidebar
          activeTab={activeTab}
          handleTabChange={handleTabChange}
          stats={stats}
          helpTicketsCount={helpTicketsCount}
          reportedAdsCount={reportedAdsCount}
          pendingSubscribersCount={pendingSubscribersCount}
          handleRefresh={handleRefresh}
          refreshing={refreshing}
          loading={loading}
        />

        {/* Main Content Area */}
        <main className={styles.mainPanel}>
          
          {/* 1. OVERVIEW TAB */}
          {activeTab === "overview" && (
            <AdminOverviewTab
              loading={loading}
              stats={stats}
              showAdminBalance={showAdminBalance}
              toggleAdminBalance={toggleAdminBalance}
              formatCurrency={formatCurrency}
            />
          )}

          {/* 2. ACCOUNTS TAB */}
          {activeTab === "accounts" && (
            <AdminAccountsTab
              loading={loading}
              users={users}
              usersPage={usersPage}
              setUsersPage={setUsersPage}
              usersCount={usersCount}
              usersLimit={usersLimit}
              setUsersLimit={setUsersLimit}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              renderPagination={renderPagination}
              setSelectedUser={setSelectedUser}
              handleToggleMonetization={handleToggleMonetization}
              setBanModalUser={setBanModalUser}
              setBanModalStatus={setBanModalStatus}
              setBanModalReason={setBanModalReason}
            />
          )}

          {/* 3-6. CAMPAIGN QUEUES & ACTIVE REGISTRIES */}
          {(activeTab === "ad-approvals" ||
            activeTab === "highlight-approvals" ||
            activeTab === "active-ads" ||
            activeTab === "active-highlights") && (
            <AdminCampaignQueueOrActiveSection
              mode={activeTab}
              loading={loading}
              items={
                activeTab === "ad-approvals"
                  ? pendingAds
                  : activeTab === "highlight-approvals"
                  ? pendingHighlights
                  : activeTab === "active-ads"
                  ? activeAds
                  : activeHighlights
              }
              count={
                activeTab === "ad-approvals"
                  ? pendingAdsCount
                  : activeTab === "highlight-approvals"
                  ? pendingHighlightsCount
                  : activeTab === "active-ads"
                  ? activeAdsCount
                  : activeHighlightsCount
              }
              page={
                activeTab === "ad-approvals"
                  ? pendingAdsPage
                  : activeTab === "highlight-approvals"
                  ? pendingHighlightsPage
                  : activeTab === "active-ads"
                  ? activeAdsPage
                  : activeHighlightsPage
              }
              setPage={
                activeTab === "ad-approvals"
                  ? setPendingAdsPage
                  : activeTab === "highlight-approvals"
                  ? setPendingHighlightsPage
                  : activeTab === "active-ads"
                  ? setActiveAdsPage
                  : setActiveHighlightsPage
              }
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              renderCard={
                activeTab === "ad-approvals" || activeTab === "active-ads"
                  ? renderAdminAdCard
                  : renderAdminHighlightCard
              }
              renderPagination={renderPagination}
            />
          )}

          {/* 7. DIRECT POST TAB */}
          {activeTab === "direct-post" && (
            <AdminDirectPostTab
              adForm={adForm}
              setAdForm={setAdForm}
              adFormFiles={adFormFiles}
              setAdFormFiles={setAdFormFiles}
              highlightForm={highlightForm}
              setHighlightForm={setHighlightForm}
              highlightFormFile={highlightFormFile}
              setHighlightFormFile={setHighlightFormFile}
              industriesList={industriesList}
              interestsList={interestsList}
              toggleIndustryFormSelection={toggleIndustryFormSelection}
              toggleInterestFormSelection={toggleInterestFormSelection}
              handlePostAdDirect={handlePostAdDirect}
              handlePostHighlightDirect={handlePostHighlightDirect}
              uploading={uploading}
            />
          )}

          {/* 8. HELP CENTER TAB */}
          {activeTab === "help-center" && (
            <AdminHelpCenterTab
              loading={loading}
              helpTickets={helpTickets}
              helpTicketsCount={helpTicketsCount}
              helpTicketsPage={helpTicketsPage}
              setHelpTicketsPage={setHelpTicketsPage}
              helpTicketSearch={helpTicketSearch}
              setHelpTicketSearch={setHelpTicketSearch}
              setReplyingTicket={setReplyingTicket}
              setReplyText={setReplyText}
              handleCloseTicket={handleCloseTicket}
              handleDeleteTicket={handleDeleteTicket}
            />
          )}

          {/* 9. SEND ANNOUNCEMENTS / NOTIFICATIONS TAB */}
          {activeTab === "send-notifications" && (
            <AdminSendNotificationsTab
              notificationTarget={notificationTarget}
              setNotificationTarget={setNotificationTarget}
              notificationTargetEmail={notificationTargetEmail}
              setNotificationTargetEmail={setNotificationTargetEmail}
              notificationTitle={notificationTitle}
              setNotificationTitle={setNotificationTitle}
              notificationMessage={notificationMessage}
              setNotificationMessage={setNotificationMessage}
              notificationSuccessMsg={notificationSuccessMsg}
              notificationErrorMsg={notificationErrorMsg}
              notificationLoading={notificationLoading}
              handleSendNotification={handleSendNotification}
            />
          )}

          {/* 10. REPORTED ADS / AD GUARD TAB */}
          {activeTab === "reported-ads" && (
            <AdminReportedAdsTab
              loading={loading}
              reportedAds={reportedAds}
              reportedAdsCount={reportedAdsCount}
              reportedAdsPage={reportedAdsPage}
              setReportedAdsPage={setReportedAdsPage}
              reportedAdsSearch={reportedAdsSearch}
              setReportedAdsSearch={setReportedAdsSearch}
              adActionLoading={adActionLoading}
              handleInspectAd={handleInspectAd}
              handleDeactivateReportedAd={handleDeactivateReportedAd}
              handleBlockReportedAdvertiser={handleBlockReportedAdvertiser}
              handleDismissReport={handleDismissReport}
              renderPagination={renderPagination}
            />
          )}

          {/* 11. FAILED QUEUES / DLQ TAB */}
          {activeTab === "queues" && (
            <AdminQueuesTab
              dlqJobs={dlqJobs}
              dlqCount={dlqCount}
              dlqLoading={dlqLoading}
              dlqActionStatus={dlqActionStatus}
              handleRetryDlqAll={handleRetryDlqAll}
              handleClearDlqAll={handleClearDlqAll}
              handleRetryDlqSingle={handleRetryDlqSingle}
            />
          )}

          {/* 11. PAYOUTS & QUEUE MANAGER TAB */}
          {activeTab === "payout-management" && (
            <>
              <div>
                <h1 className={styles.sectionTitle}>Payouts & Queue Manager</h1>
                <p className={styles.sectionSubtitle}>
                  Float monitoring, batch execution, and retry controls.
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
                  Platform transactions, ledger records, and statement export.
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

      <AdminDashboardModals
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        userActionSubmitting={userActionSubmitting}
        handleAdjustBalance={handleAdjustBalance}
        handleSuspendUser={handleSuspendUser}
        handleDeleteUser={handleDeleteUser}
        editAdData={editAdData}
        setEditAdData={setEditAdData}
        handleSaveAdEdit={handleSaveAdEdit}
        editHighlightData={editHighlightData}
        setEditHighlightData={setEditHighlightData}
        handleSaveHighlightEdit={handleSaveHighlightEdit}
        interestsList={interestsList}
        replyingTicket={replyingTicket}
        setReplyingTicket={setReplyingTicket}
        replyText={replyText}
        setReplyText={setReplyText}
        replyLoading={replyLoading}
        handleReplyTicket={handleReplyTicket}
        inspectingAd={inspectingAd}
        setInspectingAd={setInspectingAd}
        handleDeactivateReportedAd={handleDeactivateReportedAd}
        banModalUser={banModalUser}
        setBanModalUser={setBanModalUser}
        banModalStatus={banModalStatus}
        setBanModalStatus={setBanModalStatus}
        banModalDays={banModalDays}
        setBanModalDays={setBanModalDays}
        banModalReason={banModalReason}
        setBanModalReason={setBanModalReason}
        banSubmitting={banSubmitting}
        handleExecuteAdBan={handleExecuteAdBan}
      />

    </div>
  );
}
