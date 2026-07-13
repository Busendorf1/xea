"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import supabase from "@/lib/utils/db";
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
  Bell
} from "lucide-react";
import styles from "./page.module.css";
import { v4 as uuidv4 } from "uuid";

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

type Tab = "overview" | "accounts" | "ad-approvals" | "highlight-approvals" | "active-ads" | "active-highlights" | "direct-post" | "help-center" | "send-notifications";

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

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

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
    clickRate: 0
  });

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
  const industriesList = [
    "Technology", "Healthcare", "Finance", "Education", "Retail", 
    "Construction", "Real Estate", "Hospitality", "Transportation", 
    "Media", "Entertainment", "Telecommunications", "Energy", "Legal", 
    "Marketing", "Insurance", "Government", "Nonprofit", "Manufacturing", 
    "Logistics", "Security", "Consulting", "Design", "Agriculture", 
    "Automotive", "Mining", "Politics", "Religion", "NGO", "Environmental"
  ];
  
  const interestsList = [
    "Jobs", "Business", "Investing", "Fashion", "Fitness", "Sports", 
    "Health", "Travel", "Education", "Tech", "Gaming", "Politics", 
    "Religion", "Movies", "Music", "Lifestyle", "Shopping", "Books", 
    "Beauty", "Home Decor", "Parenting", "Spirituality", "Cars", 
    "Cooking", "Photography", "Volunteering", "Environment", "Dating"
  ];

  // ----------------------------------------------------
  // DATA FETCHING & TELEMETRY
  // ----------------------------------------------------

  const fetchOverviewStats = async () => {
    try {
      // 1. Total users stats
      const statsRes = await fetch("/api/admin/users?type=stats");
      if (!statsRes.ok) throw new Error("Failed to fetch admin stats");
      const usersStats = await statsRes.json();

      // 2. Pending ads count
      const { count: pAdsCount } = await supabase
        .from("adds")
        .select("*", { count: 'exact', head: true });

      // 3. Active ads count
      const { count: aAdsCount } = await supabase
        .from("addsactive")
        .select("*", { count: 'exact', head: true });

      // 4. Pending highlights count
      const { count: pHighlightsCount } = await supabase
        .from("news")
        .select("*", { count: 'exact', head: true });

      // 5. Active highlights count
      const { count: aHighlightsCount } = await supabase
        .from("newsactive")
        .select("*", { count: 'exact', head: true });

      // 6. Clicks & Mutuals stats from active ads
      const { data: activeAdsStats } = await supabase.from('addsactive').select('impression_count, mutual_adds_count, impressions');
      const { data: pendingAdsStats } = await supabase.from('adds').select('impression_count, mutual_adds_count, impressions');

      const resolvedActiveAds = activeAdsStats || [];
      const resolvedPendingAds = pendingAdsStats || [];

      // Clicks calculations
      const activeImpressions = resolvedActiveAds.reduce((sum, ad) => sum + parseInt(ad.impression_count || 0), 0);
      const pendingImpressions = resolvedPendingAds.reduce((sum, ad) => sum + parseInt(ad.impression_count || 0), 0);
      const activeMutuals = resolvedActiveAds.reduce((sum, ad) => sum + parseInt(ad.mutual_adds_count || 0), 0);
      const pendingMutuals = resolvedPendingAds.reduce((sum, ad) => sum + parseInt(ad.mutual_adds_count || 0), 0);

      const totalTargetImpressions = [...resolvedActiveAds, ...resolvedPendingAds].reduce((sum, ad) => sum + parseInt(ad.impressions || 0), 0);
      const totalClicks = activeImpressions + pendingImpressions + activeMutuals + pendingMutuals;
      const clickRate = totalTargetImpressions > 0 ? (totalClicks / totalTargetImpressions) * 100 : 0;

      setStats({
        totalUsers: usersStats.totalUsers,
        monetizedUsers: usersStats.monetizedUsers,
        suspendedUsers: usersStats.suspendedUsers,
        totalBalance: usersStats.totalBalance,
        totalWithdrawal: usersStats.totalWithdrawal,
        pendingAdsCount: pAdsCount || 0,
        activeAdsCount: aAdsCount || 0,
        pendingHighlightsCount: pHighlightsCount || 0,
        activeHighlightsCount: aHighlightsCount || 0,
        totalClicks,
        totalMutuals: usersStats.totalMutuals,
        clickRate
      });

    } catch (e) {
      console.error("Error fetching overview stats:", e);
    }
  };

  const fetchUsersTab = async (page: number, search: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error("Failed to fetch admin users");
      const { users: resolvedUsers, count } = await res.json();
      
      setUsersCount(count || 0);

      // Fetch user ad and highlight stats to enrich list
      if (resolvedUsers.length > 0) {
        const emails = resolvedUsers.map((u: any) => u.email.toLowerCase());
        
        const [adsRes, activeAdsRes, newsRes, activeNewsRes] = await Promise.all([
          supabase.from("adds").select("user_email, impression_count, mutual_adds_count").in("user_email", emails),
          supabase.from("addsactive").select("user_email, impression_count, mutual_adds_count").in("user_email", emails),
          supabase.from("news").select("user_email").in("user_email", emails),
          supabase.from("newsactive").select("user_email").in("user_email", emails)
        ]);
        
        const adsData = adsRes.data || [];
        const activeAdsData = activeAdsRes.data || [];
        const newsData = newsRes.data || [];
        const activeNewsData = activeNewsRes.data || [];
        
        const enriched = resolvedUsers.map((user: any) => {
          const emailLower = user.email.toLowerCase();
          
          const reviewAds = adsData.filter(ad => ad.user_email?.toLowerCase() === emailLower);
          const activeAds = activeAdsData.filter(ad => ad.user_email?.toLowerCase() === emailLower);
          
          const reviewHighlights = newsData.filter(h => h.user_email?.toLowerCase() === emailLower).length;
          const activeHighlights = activeNewsData.filter(h => h.user_email?.toLowerCase() === emailLower).length;
          
          const adImpressionsCount = [...reviewAds, ...activeAds].reduce((sum, ad) => sum + parseInt(ad.impression_count || 0), 0);
          const adMutualsCount = [...reviewAds, ...activeAds].reduce((sum, ad) => sum + parseInt(ad.mutual_adds_count || 0), 0);
          const totalClicksOnAds = adImpressionsCount + adMutualsCount;
          
          return {
            ...user,
            totalClicksOnAds,
            reviewAdsCount: reviewAds.length,
            activeAdsCount: activeAds.length,
            reviewHighlightsCount: reviewHighlights,
            activeHighlightsCount: activeHighlights
          };
        });
        
        setUsers(enriched);
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.error("Error fetching users page:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingAdsTab = async (page: number) => {
    setLoading(true);
    try {
      const { data, count, error } = await supabase
        .from("adds")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);
      if (error) throw error;
      setPendingAds(data || []);
      setPendingAdsCount(count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveAdsTab = async (page: number, search: string) => {
    setLoading(true);
    try {
      let query = supabase.from("addsactive").select("*", { count: "exact" });
      if (search) {
        query = query.or(`ad_content.ilike.%${search}%,user_email.ilike.%${search}%,ad_type.ilike.%${search}%`);
      }
      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);
      if (error) throw error;
      setActiveAds(data || []);
      setActiveAdsCount(count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingHighlightsTab = async (page: number) => {
    setLoading(true);
    try {
      const { data, count, error } = await supabase
        .from("news")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);
      if (error) throw error;
      setPendingHighlights(data || []);
      setPendingHighlightsCount(count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveHighlightsTab = async (page: number, search: string) => {
    setLoading(true);
    try {
      let query = supabase.from("newsactive").select("*", { count: "exact" });
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%,user_email.ilike.%${search}%,interest.ilike.%${search}%`);
      }
      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);
      if (error) throw error;
      setActiveHighlights(data || []);
      setActiveHighlightsCount(count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Synchronize loading on state changes
  useEffect(() => {
    if (activeTab === "overview") {
      fetchOverviewStats();
    } else if (activeTab === "accounts") {
      fetchUsersTab(usersPage, searchQuery);
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
    }
  }, [activeTab, usersPage, pendingAdsPage, activeAdsPage, pendingHighlightsPage, activeHighlightsPage, searchQuery, helpTicketsPage, helpTicketSearch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (activeTab === "overview") {
      await fetchOverviewStats();
    } else if (activeTab === "accounts") {
      await fetchUsersTab(usersPage, searchQuery);
    } else if (activeTab === "ad-approvals") {
      await fetchPendingAdsTab(pendingAdsPage);
    } else if (activeTab === "active-ads") {
      await fetchActiveAdsTab(activeAdsPage, searchQuery);
    } else if (activeTab === "highlight-approvals") {
      await fetchPendingHighlightsTab(pendingHighlightsPage);
    } else if (activeTab === "active-highlights") {
      await fetchActiveHighlightsTab(activeHighlightsPage, searchQuery);
    } else if (activeTab === "help-center") {
      await fetchHelpTickets(helpTicketsPage, helpTicketSearch);
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

  const fetchHelpTickets = async (page: number, search: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from("help_tickets")
        .select("*", { count: "exact" });

      if (search) {
        query = query.or(
          `user_email.ilike.%${search}%,subject.ilike.%${search}%,category.ilike.%${search}%`
        );
      }

      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);

      if (error) throw error;
      setHelpTickets(data || []);
      setHelpTicketsCount(count || 0);
    } catch (e) {
      console.error("Error fetching help tickets:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleReplyTicket = async (ticketId: string) => {
    if (!replyText.trim()) return;
    setReplyLoading(true);
    try {
      const { error } = await supabase
        .from("help_tickets")
        .update({
          admin_reply: replyText.trim(),
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (error) throw error;
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

  const handleCloseTicket = async (ticketId: string) => {
    const { error } = await supabase
      .from("help_tickets")
      .update({ status: "closed" })
      .eq("id", ticketId);
    if (error) {
      alert("Failed to close ticket: " + error.message);
    } else {
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm("Delete this ticket permanently?")) return;
    const { error } = await supabase
      .from("help_tickets")
      .delete()
      .eq("id", ticketId);
    if (error) {
      alert("Failed to delete ticket: " + error.message);
    } else {
      fetchHelpTickets(helpTicketsPage, helpTicketSearch);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotificationSuccessMsg("");
    setNotificationErrorMsg("");

    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      setNotificationErrorMsg("Title and Message are required.");
      return;
    }

    if (notificationTarget === "user" && !notificationTargetEmail.trim()) {
      setNotificationErrorMsg("Please enter the target user email address.");
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
    }
  };

  const handleSuspendUser = async (user: any, hours: number) => {
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
    }
  };

  const handleAdjustBalance = async (user: any, amount: number) => {
    if (isNaN(amount) || amount === 0) return;
    const newBalance = Math.max(0, parseFloat(user.balance || 0) + amount);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_balance",
          userId: user.id,
          payload: { newBalance }
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
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!confirm(`⚠️ WARNING: Are you sure you want to delete @${user.username} (${user.email}) permanently?`)) {
      return;
    }

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
    }
  };

  // ----------------------------------------------------
  // AD APPROVALS & OPERATIONS
  // ----------------------------------------------------

  const handleApproveAd = async (ad: any) => {
    try {
      const cleanAd = { ...ad, is_paused: false };
      const { error: insertError } = await supabase
        .from("addsactive")
        .insert([cleanAd]);

      if (insertError) {
        alert(`Failed to insert into active ads: ${insertError.message}`);
        return;
      }

      const { error: deleteError } = await supabase
        .from("adds")
        .delete()
        .eq("id", ad.id);

      if (deleteError) {
        alert(`Ad activated, but failed to remove from review queue: ${deleteError.message}`);
      } else {
        alert("Ad campaign approved and published!");
      }
      handleRefresh();
    } catch (e: any) {
      alert(`Error approving ad: ${e.message}`);
    }
  };

  const handleRejectAd = async (ad: any) => {
    if (!confirm("Are you sure you want to permanently delete this Ad campaign?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("adds")
        .delete()
        .eq("id", ad.id);

      if (error) {
        alert(`Failed to delete campaign: ${error.message}`);
      } else {
        alert("Ad campaign rejected and deleted permanently.");
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error rejecting campaign: ${e.message}`);
    }
  };

  const handleTogglePauseAd = async (ad: any) => {
    const targetState = !ad.is_paused;
    try {
      const { error: errorActive } = await supabase
        .from("addsactive")
        .update({ is_paused: targetState })
        .eq("id", ad.id);

      if (errorActive) {
        alert(`Failed to update campaign state: ${errorActive.message}`);
      } else {
        alert(`Ad campaign successfully ${targetState ? "paused" : "resumed"}!`);
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error pausing/resuming campaign: ${e.message}`);
    }
  };

  const handleSaveAdEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdData || !editAdData.id) return;

    try {
      const { id, created_at, ...updatedFields } = editAdData;

      const { error: activeErr } = await supabase
        .from("addsactive")
        .update(updatedFields)
        .eq("id", id);

      const { error: reviewErr } = await supabase
        .from("adds")
        .update(updatedFields)
        .eq("id", id);

      if (activeErr || reviewErr) {
        alert(`Failed to save edits: ${activeErr?.message || reviewErr?.message}`);
      } else {
        alert("Ad campaign details updated successfully!");
        setEditAdData(null);
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error updating campaign details: ${e.message}`);
    }
  };

  const handleDeleteAd = async (ad: any) => {
    if (!confirm("Are you sure you want to PERMANENTLY delete this Ad?")) {
      return;
    }

    try {
      const { error: errActive } = await supabase.from("addsactive").delete().eq("id", ad.id);
      const { error: errQueue } = await supabase.from("adds").delete().eq("id", ad.id);

      if (activeTab === "active-ads" ? errActive : errQueue) {
        alert("Failed to delete ad campaign.");
      } else {
        alert("Ad campaign deleted successfully!");
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error deleting ad: ${e.message}`);
    }
  };

  // ----------------------------------------------------
  // HIGHLIGHT APPROVALS & OPERATIONS
  // ----------------------------------------------------

  const handleApproveHighlight = async (highlight: any) => {
    try {
      const cleanHighlight = {
        id: highlight.id,
        title: highlight.title,
        content: highlight.content,
        image_url: highlight.image_url,
        interest: highlight.interest,
        user_id: highlight.user_id,
        user_email: highlight.user_email,
        created_at: new Date().toISOString(),
        is_paused: false
      };

      const { error: insertError } = await supabase
        .from("newsactive")
        .insert([cleanHighlight]);

      if (insertError) {
        alert(`Failed to copy to active highlights: ${insertError.message}`);
        return;
      }

      const { error: deleteError } = await supabase
        .from("news")
        .delete()
        .eq("id", highlight.id);

      if (deleteError) {
        alert(`Highlight approved, but failed to delete from pending queue: ${deleteError.message}`);
      } else {
        alert("Highlight approved and published successfully!");
      }
      handleRefresh();
    } catch (e: any) {
      alert(`Error approving highlight: ${e.message}`);
    }
  };

  const handleRejectHighlight = async (highlight: any) => {
    if (!confirm("Are you sure you want to permanently delete this highlight?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("news")
        .delete()
        .eq("id", highlight.id);

      if (error) {
        alert(`Failed to delete highlight: ${error.message}`);
      } else {
        alert("Highlight deleted permanently.");
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error deleting highlight: ${e.message}`);
    }
  };

  const handleTogglePauseHighlight = async (highlight: any) => {
    const targetState = !highlight.is_paused;
    try {
      const { error: errActive } = await supabase
        .from("newsactive")
        .update({ is_paused: targetState })
        .eq("id", highlight.id);

      if (errActive) {
        alert(`Failed to update status: ${errActive.message}`);
      } else {
        alert(`Highlight successfully ${targetState ? "paused" : "resumed"}!`);
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error updating highlight: ${e.message}`);
    }
  };

  const handleSaveHighlightEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHighlightData || !editHighlightData.id) return;

    try {
      const { id, created_at, ...updatedFields } = editHighlightData;

      const { error: activeErr } = await supabase
        .from("newsactive")
        .update(updatedFields)
        .eq("id", id);

      const { error: reviewErr } = await supabase
        .from("news")
        .update(updatedFields)
        .eq("id", id);

      if (activeErr || reviewErr) {
        alert(`Failed to save edits: ${activeErr?.message || reviewErr?.message}`);
      } else {
        alert("Highlight details updated successfully!");
        setEditHighlightData(null);
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error saving highlight: ${e.message}`);
    }
  };

  const handleDeleteHighlight = async (highlight: any) => {
    if (!confirm("Are you sure you want to PERMANENTLY delete this highlight?")) {
      return;
    }

    try {
      const { error: activeErr } = await supabase.from("newsactive").delete().eq("id", highlight.id);
      const { error: reviewErr } = await supabase.from("news").delete().eq("id", highlight.id);

      if (activeTab === "active-highlights" ? activeErr : reviewErr) {
        alert("Failed to delete highlight.");
      } else {
        alert("Highlight deleted successfully!");
        handleRefresh();
      }
    } catch (e: any) {
      alert(`Error deleting highlight: ${e.message}`);
    }
  };

  // ----------------------------------------------------
  // DIRECT POST CREATORS (ADMIN BYPASS)
  // ----------------------------------------------------

  const handlePostAdDirect = async (e: React.FormEvent) => {
    e.preventDefault();
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
          const file = adFormFiles[i];
          const sanitizedFileName = file.name.replace(/[^\w.-]/g, "_");
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
        mediaUrlString = mediaUrls.join(",");
      }

      // 2. Insert Campaign Directly into public.addsactive
      const newAd = {
        id: adId,
        ad_type: adForm.adType,
        industry: adForm.industry,
        interest: adForm.interest,
        age_range: [18, 65],
        impressions: adForm.impressions,
        campaign_days: adForm.campaignDays,
        daily_impression_cap: Math.ceil(adForm.impressions / adForm.campaignDays),
        daily_impression_count: 0,
        user_frequency_cap: adForm.userFrequencyCap,
        country: adForm.country,
        state: adForm.state,
        gender: adForm.gender,
        employment_status: adForm.employmentStatus,
        ad_media_type: adForm.adMediaType,
        ad_content: adForm.adContent,
        ad_media_url: mediaUrlString,
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
        user_email: adForm.userEmail.toLowerCase(),
        created_at: new Date().toISOString(),
        is_paused: false,
        impression_count: 0,
        seen_users: []
      };

      const response = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ad", payload: newAd })
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Ad creation failed: ${errorData.error || "Server error"}`);
      } else {
        alert("Ad campaign creation enqueued successfully!");
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
      }
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
      // 1. Upload cover image to Supabase Storage Bucket
      const file = highlightFormFile;
      const sanitizedFileName = file.name.replace(/[^\w.-]/g, "_");
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

      // 2. Insert Highlight Directly into public.newsactive
      const newHighlight = {
        id: highlightId,
        title: highlightForm.title,
        content: highlightForm.content,
        image_url: mediaUrl,
        interest: highlightForm.interest,
        user_email: highlightForm.userEmail.toLowerCase(),
        created_at: new Date().toISOString(),
        is_paused: false
      };

      const response = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "highlight", payload: newHighlight })
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Highlight posting failed: ${errorData.error || "Server error"}`);
      } else {
        alert("Business highlight creation enqueued successfully!");
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
  
  const renderPagination = (currentPage: number, setCurrentPage: (p: number) => void, totalCount: number) => {
    const totalPages = Math.ceil(totalCount / 10);
    if (totalPages <= 1) return null;
    
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        marginTop: "1.5rem",
        padding: "1rem 0",
        borderTop: "1px solid var(--card-border)"
      }}>
        <button 
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          className={styles.btnAction}
        >
          Previous
        </button>
        <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "var(--text-muted)" }}>
          Page {currentPage + 1} of {totalPages} ({totalCount} items)
        </span>
        <button 
          onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
          disabled={currentPage >= totalPages - 1}
          className={styles.btnAction}
        >
          Next
        </button>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDER DETAILED REGISTRATION FIELDS
  // ----------------------------------------------------

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
            <div style={{ display: "flex", backgroundColor: "var(--sidebar-bg)", border: "1px solid var(--card-border)", borderRadius: "99px", padding: "2px" }}>
              <button onClick={() => setTheme("white")} style={{ background: "transparent", border: "none", width: "24px", height: "24px", color: theme === "white" ? "var(--primary)" : "var(--text-muted)", cursor: "pointer" }}><Sun size={14} /></button>
              <button onClick={() => setTheme("dark")} style={{ background: "transparent", border: "none", width: "24px", height: "24px", color: theme === "dark" ? "var(--primary)" : "var(--text-muted)", cursor: "pointer" }}><Moon size={14} /></button>
              <button onClick={() => setTheme("semi-dark")} style={{ background: "transparent", border: "none", width: "24px", height: "24px", color: theme === "semi-dark" ? "var(--primary)" : "var(--text-muted)", cursor: "pointer" }}><Contrast size={14} /></button>
            </div>

            <Link href="/user/dashboard">
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
            <Layers size={18} />
            <span>Overview & Stats</span>
          </button>
          
          <button onClick={() => handleTabChange("accounts")} className={`${styles.tabButton} ${activeTab === "accounts" ? styles.tabButtonActive : ""}`}>
            <Users size={18} />
            <span>User Accounts ({stats.totalUsers})</span>
          </button>

          <button onClick={() => handleTabChange("ad-approvals")} className={`${styles.tabButton} ${activeTab === "ad-approvals" ? styles.tabButtonActive : ""}`}>
            <CheckCircle size={18} />
            <span>Ad Approvals ({stats.pendingAdsCount})</span>
          </button>

          <button onClick={() => handleTabChange("highlight-approvals")} className={`${styles.tabButton} ${activeTab === "highlight-approvals" ? styles.tabButtonActive : ""}`}>
            <Compass size={18} />
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
            <Bell size={18} />
            <span>Send Announcements</span>
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
                <div className={styles.loadingText}>Syncing metrics with Supabase...</div>
              ) : (
                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <Users className={styles.statIcon} size={48} />
                    <span className={styles.statLabel}>Total Registrations</span>
                    <span className={styles.statValue}>{stats.totalUsers}</span>
                    <span className={styles.statDesc}>{stats.monetizedUsers} Monetized profiles</span>
                  </div>

                  <div className={styles.statCard}>
                    <TrendingUp className={styles.statIcon} size={48} />
                    <span className={styles.statLabel}>Adverts Campaigns</span>
                    <span className={styles.statValue}>{stats.activeAdsCount}</span>
                    <span className={styles.statDesc}>{stats.pendingAdsCount} awaiting admin approval</span>
                  </div>

                  <div className={styles.statCard}>
                    <Compass className={styles.statIcon} size={48} />
                    <span className={styles.statLabel}>Daily Highlights</span>
                    <span className={styles.statValue}>{stats.activeHighlightsCount}</span>
                    <span className={styles.statDesc}>{stats.pendingHighlightsCount} awaiting admin approval</span>
                  </div>

                  <div className={styles.statCard}>
                    <DollarSign className={styles.statIcon} size={48} />
                    <span className={styles.statLabel}>Wallet Liability</span>
                    <span className={styles.statValue}>{formatCurrency(stats.totalBalance)}</span>
                    <span className={styles.statDesc}>{formatCurrency(stats.totalWithdrawal)} in withdrawals processing</span>
                  </div>

                  <div className={styles.statCard}>
                    <Eye className={styles.statIcon} size={48} />
                    <span className={styles.statLabel}>Total Ad Clicks / Views</span>
                    <span className={styles.statValue}>{stats.totalClicks}</span>
                    <span className={styles.statDesc}>Clicks CTR Rate: {stats.clickRate.toFixed(2)}%</span>
                  </div>

                  <div className={styles.statCard}>
                    <Users className={styles.statIcon} size={48} />
                    <span className={styles.statLabel}>Aggregated Mutuals</span>
                    <span className={styles.statValue}>{stats.totalMutuals}</span>
                    <span className={styles.statDesc}>Mutual bonds active across profiles</span>
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
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Profile Details</th>
                          <th className={styles.th}>Wallet</th>
                          <th className={styles.th}>Ad / Highlight Registry</th>
                          <th className={styles.th}>Ad Views / Clicks</th>
                          <th className={styles.th}>Monetization</th>
                          <th className={styles.th}>Suspension</th>
                          <th className={styles.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(user => {
                          const isMonetized = user.monetized === "yes" || user.monetized === true;
                          const isSuspended = user.suspended_until && new Date(user.suspended_until).getTime() > Date.now();
                          const hasBusiness = user.business_name && user.business_name.trim() !== "";
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
                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>@{user.username.split("@")[0]}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", wordBreak: "break-all" }}>{user.email}</div>
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
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination(usersPage, setUsersPage, usersCount)}
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
                  <div className={styles.queueGrid}>
                    {pendingAds.map(ad => (
                      <div key={ad.id} className={styles.card}>
                        <div style={{ position: "relative" }}>
                          <AdminAdMediaBox adMedia={ad.ad_media} adMediaType={ad.ad_media_type} />
                          <span className={styles.badgeCategory}>{ad.ad_type}</span>
                          <span className={styles.badgeStatus} style={{ backgroundColor: "#ef4444", color: "#fff" }}>Pending Review</span>
                        </div>
                        
                        <div className={styles.cardBody}>
                          <p className={styles.cardText} style={{ fontWeight: "700", color: "var(--foreground)", fontSize: "0.95rem" }}>{ad.ad_content}</p>
                          
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Publisher: <span style={{ fontWeight: "700" }}>{ad.user_email}</span>
                          </div>

                          {renderAdDetails(ad)}
                        </div>

                        <div className={styles.cardFooterActions}>
                          <button onClick={() => handleApproveAd(ad)} className={styles.btnSubmit} style={{ flex: 1, padding: "0.5rem" }}>
                            Approve Campaign
                          </button>
                          <button onClick={() => handleRejectAd(ad)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ padding: "0.5rem 1rem" }}>
                            Reject / Delete
                          </button>
                        </div>
                      </div>
                    ))}
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
                    {pendingHighlights.map(highlight => (
                      <div key={highlight.id} className={styles.card}>
                        <div className={styles.mediaBox}>
                          <img src={highlight.image_url} alt="Highlight cover" />
                          <span className={styles.badgeCategory}>{highlight.interest}</span>
                          <span className={styles.badgeStatus} style={{ backgroundColor: "#ef4444", color: "#fff" }}>In Review</span>
                        </div>
                        
                        <div className={styles.cardBody}>
                          <h4 className={styles.cardTitle}>{highlight.title}</h4>
                          <p className={styles.cardText} style={{ fontSize: "0.9rem" }}>{highlight.content}</p>
                          
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem", borderTop: "1px solid var(--card-border)", paddingTop: "0.5rem" }}>
                            Posted by: <span style={{ fontWeight: "700" }}>{highlight.user_email}</span>
                          </div>
                        </div>

                        <div className={styles.cardFooterActions}>
                          <button onClick={() => handleApproveHighlight(highlight)} className={styles.btnSubmit} style={{ flex: 1, padding: "0.5rem" }}>
                            Approve Highlight
                          </button>
                          <button onClick={() => handleRejectHighlight(highlight)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ padding: "0.5rem 1rem" }}>
                            Reject / Delete
                          </button>
                        </div>
                      </div>
                    ))}
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
                  <div className={styles.queueGrid}>
                    {activeAds.map(ad => {
                      const isCompleted = ad.completed_at || (ad.impression_count >= ad.impressions);
                      return (
                        <div key={ad.id} className={styles.card} style={{ opacity: ad.is_paused ? 0.7 : 1 }}>
                          <div style={{ position: "relative" }}>
                            <AdminAdMediaBox adMedia={ad.ad_media} adMediaType={ad.ad_media_type} />
                            <span className={styles.badgeCategory}>{ad.ad_type}</span>
                            
                            {isCompleted ? (
                              <span className={styles.badgeStatus} style={{ backgroundColor: "#10b981", color: "#fff" }}>Completed</span>
                            ) : ad.is_paused ? (
                              <span className={styles.badgeStatus} style={{ backgroundColor: "#f59e0b", color: "#fff" }}>Paused</span>
                            ) : (
                              <span className={styles.badgeStatus} style={{ backgroundColor: "#2563eb", color: "#fff" }}>Live</span>
                            )}
                          </div>

                          <div className={styles.cardBody}>
                            <p className={styles.cardText} style={{ fontWeight: "700", color: "var(--foreground)", fontSize: "0.95rem" }}>{ad.ad_content}</p>
                            
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                              Publisher: <span style={{ fontWeight: "700" }}>{ad.user_email}</span>
                            </div>

                            {renderAdDetails(ad)}
                          </div>

                          <div className={styles.cardFooterActions}>
                            <button 
                              onClick={() => handleTogglePauseAd(ad)} 
                              disabled={isCompleted}
                              className={styles.btnAction} 
                              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}
                            >
                              {ad.is_paused ? <Play size={14} /> : <Pause size={14} />}
                              <span>{ad.is_paused ? "Resume" : "Pause"}</span>
                            </button>
                            <button onClick={() => setEditAdData(ad)} className={styles.btnAction} style={{ padding: "0.5rem" }} title="Edit campaign text/settings">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDeleteAd(ad)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ padding: "0.5rem" }} title="Delete campaign permanently">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
                    {activeHighlights.map(highlight => (
                      <div key={highlight.id} className={styles.card} style={{ opacity: highlight.is_paused ? 0.7 : 1 }}>
                        <div className={styles.mediaBox}>
                          <img src={highlight.image_url} alt="Highlight cover" />
                          <span className={styles.badgeCategory}>{highlight.interest}</span>
                          
                          {highlight.is_paused ? (
                            <span className={styles.badgeStatus} style={{ backgroundColor: "#f59e0b", color: "#fff" }}>Paused</span>
                          ) : (
                            <span className={styles.badgeStatus} style={{ backgroundColor: "#2563eb", color: "#fff" }}>Live</span>
                          )}
                        </div>

                        <div className={styles.cardBody}>
                          <h4 className={styles.cardTitle}>{highlight.title}</h4>
                          <p className={styles.cardText} style={{ fontSize: "0.9rem" }}>{highlight.content}</p>
                          
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem", borderTop: "1px solid var(--card-border)", paddingTop: "0.5rem" }}>
                            Publisher: <span style={{ fontWeight: "700" }}>{highlight.user_email}</span>
                          </div>
                        </div>

                        <div className={styles.cardFooterActions}>
                          <button 
                            onClick={() => handleTogglePauseHighlight(highlight)} 
                            className={styles.btnAction} 
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}
                          >
                            {highlight.is_paused ? <Play size={14} /> : <Pause size={14} />}
                            <span>{highlight.is_paused ? "Resume" : "Pause"}</span>
                          </button>
                          <button onClick={() => setEditHighlightData(highlight)} className={styles.btnAction} style={{ padding: "0.5rem" }}>
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => handleDeleteHighlight(highlight)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ padding: "0.5rem" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
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
                  {uploading ? "Uploading media & publishing..." : "Publish Ad Directly"}
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
                  {uploading ? "Uploading cover image & publishing..." : "Publish Highlight Directly"}
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
                                background: ticket.status === "replied" ? "rgba(52,211,153,0.15)" : ticket.status === "closed" ? "rgba(156,163,175,0.15)" : "rgba(251,191,36,0.15)",
                                color: ticket.status === "replied" ? "#34d399" : ticket.status === "closed" ? "#9ca3af" : "#fbbf24"
                              }}>
                                {ticket.status}
                              </span>
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" as const }}>{ticket.category}</span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {new Date(ticket.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
                            {ticket.status !== "closed" && (
                              <button onClick={() => handleCloseTicket(ticket.id)} className={styles.btnAction} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                <CheckCircle size={13} /> Close
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
                            <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "0.3rem" }}>⚡ Admin Reply</p>
                            <p style={{ fontSize: "0.875rem", color: "var(--foreground)", lineHeight: 1.5 }}>{ticket.admin_reply}</p>
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
              <h1 className={styles.sectionTitle}>Send Announcements & Payouts Notifications</h1>
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

        </main>
      </div>

      {/* ==================================================== */}
      {/* MODAL: USER DETAILED PROFILE OPERATIONS */}
      {/* ==================================================== */}
      {selectedUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Manage Profile: @{selectedUser.username.split("@")[0]}</h3>
              <button onClick={() => setSelectedUser(null)} className={styles.btnClose}>
                <XCircle size={24} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Profile Details */}
              <div className={styles.gridTwoCol}>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Full / Business Name</span>
                  <span className={styles.fieldValue}>
                    {selectedUser.business_name && selectedUser.business_name.trim() !== "" 
                      ? `${selectedUser.business_name} (Rep: ${selectedUser.firstName} ${selectedUser.lastName})`
                      : `${selectedUser.firstName} ${selectedUser.lastName}`
                    }
                  </span>
                </div>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Email</span>
                  <span className={styles.fieldValue} style={{ wordBreak: "break-all" }}>{selectedUser.email}</span>
                </div>
              </div>

              <div className={styles.gridTwoCol}>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Country / State</span>
                  <span className={styles.fieldValue}>{selectedUser.state ? `${selectedUser.state}, ` : ""}{selectedUser.country}</span>
                </div>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Phone Number</span>
                  <span className={styles.fieldValue}>{selectedUser.phone}</span>
                </div>
              </div>

              <div className={styles.gridTwoCol}>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Wallet Balance</span>
                  <span className={styles.fieldValue} style={{ color: "#10b981", fontSize: "1.1rem" }}>{formatCurrency(selectedUser.balance || 0)}</span>
                </div>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Pending Withdrawal</span>
                  <span className={styles.fieldValue} style={{ color: "#3b82f6" }}>{formatCurrency(selectedUser.withdrawal || 0)}</span>
                </div>
              </div>

              {/* Adjust Balance Section */}
              <div style={{ padding: "1rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)" }}>
                <span className={styles.fieldLabel} style={{ display: "block", marginBottom: "0.5rem" }}>Adjust Wallet Balance</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => handleAdjustBalance(selectedUser, 1000)} className={styles.btnAction} style={{ color: "#10b981" }}>+₦1,000</button>
                  <button onClick={() => handleAdjustBalance(selectedUser, 5000)} className={styles.btnAction} style={{ color: "#10b981" }}>+₦5,000</button>
                  <button onClick={() => handleAdjustBalance(selectedUser, -1000)} className={styles.btnAction} style={{ color: "#ef4444" }}>-₦1,000</button>
                  <button onClick={() => {
                    const customAmt = parseFloat(prompt("Enter amount to add (positive number) or subtract (negative number):") || "0");
                    handleAdjustBalance(selectedUser, customAmt);
                  }} className={styles.btnAction}>Custom Adjustment</button>
                </div>
              </div>

              {/* Suspend / Ban Section */}
              <div style={{ padding: "1rem", backgroundColor: "rgba(239, 68, 68, 0.05)", borderRadius: "12px", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
                <span className={styles.fieldLabel} style={{ display: "block", marginBottom: "0.5rem", color: "#ef4444" }}>Suspension Controls</span>
                
                {selectedUser.suspended_until && new Date(selectedUser.suspended_until).getTime() > Date.now() ? (
                  <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                    🔴 Account currently locked until: <strong style={{ color: "#ef4444" }}>{new Date(selectedUser.suspended_until).toLocaleString()}</strong>
                  </div>
                ) : (
                  <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "#10b981" }}>
                    🟢 Account active and unsuspended.
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button onClick={() => handleSuspendUser(selectedUser, 2)} className={styles.btnAction} style={{ color: "#ef4444" }}>Suspend 2 Hrs</button>
                  <button onClick={() => handleSuspendUser(selectedUser, 24)} className={styles.btnAction} style={{ color: "#ef4444" }}>Suspend 24 Hrs</button>
                  <button onClick={() => handleSuspendUser(selectedUser, 168)} className={styles.btnAction} style={{ color: "#ef4444" }}>Suspend 7 Days</button>
                  <button onClick={() => handleSuspendUser(selectedUser, -1)} className={`${styles.btnAction} ${styles.btnDanger}`}>PERMANENT BAN</button>
                  {selectedUser.suspended_until && (
                    <button onClick={() => handleSuspendUser(selectedUser, 0)} className={styles.btnAction} style={{ color: "#10b981", border: "1px solid #10b981" }}>Remove Suspension</button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button onClick={() => handleDeleteUser(selectedUser)} className={`${styles.btnAction} ${styles.btnDanger}`} style={{ marginRight: "auto" }}>
                Delete Account Permanently
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
    </div>
  );
}
