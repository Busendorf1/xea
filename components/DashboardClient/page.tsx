"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  User,
  TrendingUp,
  Compass,
  FileText,
  UserCheck,
  Wallet,
  LogOut,
  Trash2,
  Settings,
  Clock,
} from "lucide-react";
import { useTheme } from "../ThemeProvider";
import supabase from "@/lib/utils/db";
import Newsdisplay from "@/components/Newsdisplay/page";
import InviteLink from "@/components/InviteLink/page";
import FeedSkeleton from "@/components/ui/FeedSkeleton";
import Collapsible from "../ui/Collapsible";
import Footer from "../Footers/page";
import TransferSuccessModal, { TransferSuccessData } from "@/components/ui/TransferSuccessModal";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

import { UserProfile, DashboardClientProps, parseToArray } from "./types";
import DashboardHeader from "./DashboardHeader";
import DashboardProfileCard from "./DashboardProfileCard";
import DashboardWalletCard from "./DashboardWalletCard";
import PersonaDrawer from "./PersonaDrawer";
import WithdrawalModal from "./WithdrawalModal";
import SendMoneyModal from "./SendMoneyModal";
import styles from "./page.module.css";

import Feed from "@/components/Feed/page";

export type { UserProfile };

export default function DashboardClient({
  user: initialUser,
  parsedInterest,
  email,
  initialAds,
  initialProfiles,
  initialHighlights,
}: DashboardClientProps) {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<UserProfile>(initialUser);

  const formatCurrency = (amount: number | string) => globalFormatCurrency(amount, user?.country);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  // Modal display states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false);
  const [transferSuccessData, setTransferSuccessData] = useState<TransferSuccessData | null>(null);

  // Inactivity warning state (initialized deterministically for SSR parity, hydrated on mount)
  const [inactivityDismissed, setInactivityDismissed] = useState(false);

  // Balance visibility toggle (initialized deterministically for SSR parity, hydrated on mount)
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("paayh_inactivity_dismissed") === "true") {
        setInactivityDismissed(true);
      }
      const savedBalance = localStorage.getItem("paayh_show_balance");
      if (savedBalance !== null) {
        setShowBalance(savedBalance === "true");
      }
    } catch {}
  }, []);

  const toggleShowBalance = () => {
    setShowBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("paayh_show_balance", String(next));
      } catch {}
      return next;
    });
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape key closes open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowWithdrawModal(false);
        setShowSendMoneyModal(false);
      }
    };
    if (showWithdrawModal || showSendMoneyModal) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [showWithdrawModal, showSendMoneyModal]);

  const handleDismissInactivity = () => {
    setInactivityDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("paayh_inactivity_dismissed", "true");
    }
  };

  const refreshProfileQuietly = async () => {
    try {
      const pRes = await fetch("/api/profile");
      if (pRes.ok) {
        const data = await pRes.json();
        const liveClicks = data.monetization_clicks ?? 0;
        const isMonetized = data.monetized;
        if (data && !data.error && data.email) {
          setUser((prev) => ({
            ...data,
            monetization_clicks: Math.max(prev.monetization_clicks || 0, liveClicks),
            mutual_count: Math.max(prev.mutual_count || 0, Number(data.mutual_count) || 0),
            monetized: isMonetized ?? prev.monetized,
            balance:
              typeof data.balance !== "undefined" && !isNaN(Number(data.balance))
                ? Math.max(prev.balance || 0, Number(data.balance))
                : prev.balance || 0,
          }));
        }
      }
    } catch {
      // Quiet background error catch
    }
  };

  // Notification states
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showEarnFeedback, setShowEarnFeedback] = useState(false);
  const [showMutualFeedback, setShowMutualFeedback] = useState(false);

  const triggerEarnFeedback = () => {
    setShowEarnFeedback(true);
    setTimeout(() => setShowEarnFeedback(false), 2500);
  };

  const triggerMutualFeedback = () => {
    setShowMutualFeedback(true);
    setTimeout(() => setShowMutualFeedback(false), 2500);
  };

  const handleEarnSuccess = (earnedAmount?: number, newBalance?: number, newClicks?: number) => {
    if (typeof newBalance === "number" && !isNaN(newBalance)) {
      setUser((prev) => ({
        ...prev,
        balance: newBalance,
        monetization_clicks:
          typeof newClicks === "number" ? Math.max(prev.monetization_clicks || 0, newClicks) : prev.monetization_clicks,
        monetized: (typeof newClicks === "number" && newClicks >= 300) || prev.monetized,
      }));
      return;
    }

    const delta = typeof earnedAmount === "number" ? earnedAmount : 15;
    if (delta !== 0) {
      setUser((prev) => ({
        ...prev,
        balance: Math.max(0, Math.round(((prev.balance || 0) + delta) * 100) / 100),
      }));
      if (delta > 0) {
        triggerEarnFeedback();
      }
    }
  };

  const handleMutualSuccess = () => {
    setUser((prev) => ({
      ...prev,
      mutual_count: Math.min(50, (prev.mutual_count || 0) + 1),
    }));
    triggerMutualFeedback();
  };

  const fetchNotifications = async () => {
    if (!email) return;
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : [];
        const seen = new Set<string>();
        const unique = rawList.filter((n: any) => {
          if (!n || !n.id) return false;
          const k = `${n.id}:::${(n.title || "").trim().toLowerCase()}:::${(n.message || "").trim().toLowerCase()}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setNotifications(unique);
      }
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const initialQuietTimeout = setTimeout(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshProfileQuietly();
    }, 3000);

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchNotifications();
      refreshProfileQuietly();
    }, 20000);

    return () => {
      clearTimeout(initialQuietTimeout);
      clearInterval(interval);
    };
  }, []);

  // Synchronize monetization status to client storage so /monetize opens instantly with 0ms flicker
  useEffect(() => {
    if (typeof window !== "undefined" && user?.email) {
      try {
        const isMon = Boolean(
          user.monetized === true ||
            user.monetized === "yes" ||
            user.monetized === "true" ||
            (user.monetization_clicks ?? 0) >= 300
        );
        const cachePayload = JSON.stringify({
          isMonetized: isMon,
          clicksCount: user.monetization_clicks ?? 0,
          clicksRemaining: Math.max(0, 300 - (user.monetization_clicks ?? 0)),
          atwTier: (user as any)?.atw_tier || "ATW1",
          daysInactive: 0,
        });
        localStorage.setItem("paayh_monetize_cache", cachePayload);
        sessionStorage.setItem("paayh_monetize_cache", cachePayload);
      } catch {}
    }
  }, [user.monetized, user.monetization_clicks, user.email]);

  // Supabase Real-Time Cross-Device Synchronization
  useEffect(() => {
    if (!email) return;

    const emailLower = email.toLowerCase().trim();
    const channelName = `realtime-dashboard-balance-${emailLower}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `email=eq.${emailLower}`,
        },
        (payload) => {
          if (payload.new) {
            const newRow = payload.new as any;
            const newBalance = Number(newRow.balance);
            const newClicks = Number(newRow.monetization_clicks);
            const newMutualCount = Number(newRow.mutual_count);

            setUser((prev) => {
              const prevBal = prev?.balance ?? 0;
              const updatedBalance = !isNaN(newBalance) ? newBalance : prevBal;
              const updatedClicks = !isNaN(newClicks)
                ? Math.max(prev.monetization_clicks || 0, newClicks)
                : prev.monetization_clicks || 0;
              const updatedMutualCount = !isNaN(newMutualCount)
                ? Math.max(prev.mutual_count || 0, newMutualCount)
                : prev.mutual_count || 0;

              if (updatedBalance > prevBal) {
                triggerEarnFeedback();
              }

              return {
                ...prev,
                balance: updatedBalance,
                monetization_clicks: updatedClicks,
                mutual_count: updatedMutualCount,
                monetized:
                  newRow.monetized === "yes" ||
                  newRow.monetized === "true" ||
                  newRow.monetized === true ||
                  updatedClicks >= 300,
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  useEffect(() => {
    const onFocus = () => {
      refreshProfileQuietly();
      fetchNotifications();
    };

    const handleClickIncrement = (e: Event) => {
      const customEvent = e as CustomEvent;
      const delta = customEvent.detail?.delta || 1;
      setUser((prev) => {
        const current = prev.monetization_clicks || 0;
        const nextClicks = current + delta;
        const nextMonetized = nextClicks >= 300 ? true : prev.monetized;
        return {
          ...prev,
          monetization_clicks: nextClicks,
          monetized: nextMonetized,
        };
      });
    };

    const handleLiveBalanceSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { newBalance, delta, clicks, earnedAmount } = customEvent.detail || {};
      setUser((prev) => {
        let updatedBal = prev.balance;
        if (typeof newBalance === "number" && !isNaN(newBalance)) {
          updatedBal = newBalance;
        } else if (typeof delta === "number" && !isNaN(delta)) {
          updatedBal = Math.max(0, Math.round(((prev.balance || 0) + delta) * 100) / 100);
        } else if (typeof earnedAmount === "number" && !isNaN(earnedAmount)) {
          updatedBal = Math.max(0, Math.round(((prev.balance || 0) + earnedAmount) * 100) / 100);
        }
        const updatedClicks =
          typeof clicks === "number" ? Math.max(prev.monetization_clicks || 0, clicks) : prev.monetization_clicks;
        const updatedMonetized = (typeof clicks === "number" && clicks >= 300) || prev.monetized;
        return {
          ...prev,
          balance: updatedBal,
          monetization_clicks: updatedClicks,
          monetized: updatedMonetized,
        };
      });
      triggerEarnFeedback();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("xea:click-increment", handleClickIncrement);
    window.addEventListener("xea:live-balance-sync", handleLiveBalanceSync);
    window.addEventListener("xea:live-balance-earned", handleLiveBalanceSync);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("xea:click-increment", handleClickIncrement);
      window.removeEventListener("xea:live-balance-sync", handleLiveBalanceSync);
      window.removeEventListener("xea:live-balance-earned", handleLiveBalanceSync);
    };
  }, [email]);

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSelectedNotifs = async (ids: string[]) => {
    const res = await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: ids }),
    });
    if (res.ok) {
      setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    }
  };

  const handleDeleteAllNotifs = async () => {
    const res = await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setNotifications([]);
    }
  };

  const feedAreaRef = useRef<HTMLElement>(null);
  const highlightsRef = useRef<HTMLDivElement>(null);

  // Toggles for Tablet and Mobile views
  const [showProfileTablet, setShowProfileTablet] = useState(false);
  const [showProfileMobile, setShowProfileMobile] = useState(false);
  const [showHighlightsMobile, setShowHighlightsMobile] = useState(false);
  const [showAccountMenuLeft, setShowAccountMenuLeft] = useState(false);

  // Responsive device state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showHeader, setShowHeader] = useState(true);

  // Sync window size state
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width <= 768);
      setIsTablet(width > 768 && width <= 1024);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Lock body scroll when mobile side menu is open
  useEffect(() => {
    if (isMobile && (showProfileMobile || showHighlightsMobile)) {
      const originalOverflow = document.body.style.overflow;
      const originalHeight = document.body.style.height;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalHtmlHeight = document.documentElement.style.height;

      document.body.style.overflow = "hidden";
      document.body.style.height = "100%";
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.height = "100%";

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.height = originalHeight;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.documentElement.style.height = originalHtmlHeight;
      };
    }
  }, [isMobile, showProfileMobile, showHighlightsMobile]);

  // Highlights remain visible
  useEffect(() => {
    if (highlightsRef.current) {
      highlightsRef.current.style.opacity = "1";
      highlightsRef.current.style.pointerEvents = "auto";
    }
  }, []);

  const closeAllToggles = () => {
    setShowProfileMobile(false);
    setShowHighlightsMobile(false);
  };

  const selectTab = (tab: string) => {
    sessionStorage.setItem("paayh_active_tab", tab);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("paayh_tab_change"));
    }
  };

  const renderAccountLinks = () => (
    <div className={styles.menuButtonGroup}>
      <Link href="/logged-in" onClick={() => selectTab("profile")} className={styles.menuButton}>
        <User size={16} />
        <span>Profile</span>
      </Link>
      <Link href="/logged-in" onClick={() => selectTab("myads")} className={styles.menuButton}>
        <TrendingUp size={16} />
        <span>My Ads</span>
      </Link>
      <Link href="/logged-in" onClick={() => selectTab("news")} className={styles.menuButton}>
        <Compass size={16} />
        <span>Create Highlight</span>
      </Link>
      <Link href="/logged-in" onClick={() => selectTab("adPage")} className={styles.menuButton}>
        <FileText size={16} />
        <span>Create Ad</span>
      </Link>
      <Link href="/logged-in" onClick={() => selectTab("monetize")} className={styles.menuButton}>
        <UserCheck size={16} />
        <span>Monetization</span>
      </Link>
      <Link href="/logged-in" onClick={() => selectTab("statement")} className={styles.menuButton}>
        <Wallet size={16} />
        <span>Statement</span>
      </Link>
      <Link href="/user/logout" className={styles.menuButton}>
        <LogOut size={16} />
        <span>Logout</span>
      </Link>
      <Link href="/logged-in" onClick={() => selectTab("deactivate")} className={styles.menuButtonDanger}>
        <Trash2 size={16} />
        <span>Deactivate Account</span>
      </Link>
    </div>
  );

  return (
    <div className={styles.appWrapper}>
      {/* 1. Header Section */}
      <DashboardHeader
        theme={theme}
        onCycleTheme={() => setTheme(theme === "white" ? "dark" : "white")}
        isMobile={isMobile}
        isTablet={isTablet}
        showHeader={showHeader}
        showProfileTablet={showProfileTablet}
        onToggleProfileTablet={() => setShowProfileTablet(!showProfileTablet)}
        showHighlightsMobile={showHighlightsMobile}
        showProfileMobile={showProfileMobile}
        onToggleHighlightsMobile={() => {
          const current = showHighlightsMobile;
          closeAllToggles();
          setShowHighlightsMobile(!current);
        }}
        onToggleProfileMobile={() => {
          const current = showProfileMobile;
          closeAllToggles();
          setShowProfileMobile(!current);
        }}
        onCloseAllToggles={closeAllToggles}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onDeleteSelectedNotifs={handleDeleteSelectedNotifs}
        onDeleteAllNotifs={handleDeleteAllNotifs}
        showEarnFeedback={showEarnFeedback}
        showMutualFeedback={showMutualFeedback}
      />

      {/* 2. Main Dashboard Layout Area */}
      <div className={`${styles.dashboardContainer} ${showHeader ? "" : styles.dashboardContainerHeaderHidden}`}>
        {/* 30-Day Inactive Account Warning Modal */}
        {(() => {
          if (inactivityDismissed) return null;
          const daysInactive =
            user.daysInactive ??
            (user.last_active_at
              ? Math.floor((Date.now() - new Date(user.last_active_at).getTime()) / (86400 * 1000))
              : 0);
          if (daysInactive < 30) return null;
          return (
            <div className={styles.inactivityModalBackdrop}>
              <div className={styles.inactivityModalCard}>
                <div className={styles.inactivityModalIcon}>
                  <Clock size={26} />
                </div>
                <div>
                  <h3 className={styles.inactivityModalTitle}>Inactive Account ({daysInactive} Days)</h3>
                  <p className={styles.inactivityModalText}>
                    Withdraw balance or view feed ads to keep your wallet active. Unclaimed balances forfeit after 60
                    days of inactivity.
                  </p>
                </div>
                <button type="button" onClick={handleDismissInactivity} className={styles.inactivityModalBtn}>
                  Got it
                </button>
              </div>
            </div>
          );
        })()}

        {/* Left Sidebar: Highlights Section */}
        <aside
          className={`${styles.leftSidebar} ${isTablet && showProfileTablet ? styles.hiddenTablet : ""} ${
            isMobile ? (showHighlightsMobile ? styles.showMobileFull : styles.hideMobileFull) : ""
          }`}
        >
          <div className={styles.sidebarContent}>
            <div
              className={styles.desktopLeftHeader}
              onClick={() => setShowAccountMenuLeft(!showAccountMenuLeft)}
              title="Toggle Account Menu"
            >
              <button
                type="button"
                className={`${styles.leftSettingsToggle} ${!showAccountMenuLeft ? styles.rotated : ""}`}
              >
                <Settings size={18} />
              </button>
              <h3 className={styles.menuTitle}>Account Menu</h3>
            </div>
            <Collapsible isOpen={showAccountMenuLeft}>{renderAccountLinks()}</Collapsible>
            <div ref={highlightsRef} className={styles.highlightsWrap}>
              <p className={styles.offerArea}>Daily Business Highlights:</p>
              <Newsdisplay userInterest={parsedInterest} initialHighlights={initialHighlights} />
            </div>
          </div>
        </aside>

        {/* Main Feed Area */}
        <main
          ref={feedAreaRef}
          className={`${styles.feedArea} ${
            isMobile && (showProfileMobile || showHighlightsMobile) ? styles.feedAreaLocked : ""
          }`}
        >
          <Suspense fallback={<FeedSkeleton count={3} />}>
            <Feed
              userEmail={email}
              initialProfile={user}
              initialAds={initialAds}
              initialProfiles={initialProfiles}
              initialHighlights={initialHighlights}
              onEarnSuccess={handleEarnSuccess}
              onMutualSuccess={handleMutualSuccess}
            />
          </Suspense>
          <Footer />
        </main>

        {/* Right Sidebar: Profile and Wallet details */}
        <aside
          className={`${styles.rightSidebar} ${isTablet && !showProfileTablet ? styles.hiddenTablet : ""} ${
            isMobile ? (showProfileMobile ? styles.showMobileFull : styles.hideMobileFull) : ""
          }`}
        >
          <div className={styles.sidebarContent}>
            <DashboardProfileCard user={user} formatCurrency={formatCurrency} onSelectTab={selectTab} />

            <InviteLink username={user.username} />

            <DashboardWalletCard
              user={user}
              showBalance={showBalance}
              onToggleShowBalance={toggleShowBalance}
              formatCurrency={formatCurrency}
              onOpenWithdrawModal={() => setShowWithdrawModal(true)}
              onOpenSendMoneyModal={() => setShowSendMoneyModal(true)}
              onSelectTab={selectTab}
            />

            <PersonaDrawer
              interest={parseToArray(user.interest)}
              industry={parseToArray(user.industry)}
              behavior={parseToArray(user.behavior)}
              lifestyle={parseToArray(user.lifestyle)}
              personality={parseToArray(user.personality)}
            />

            {isMobile && (
              <div className={styles.mobileAccountLinksContainer}>
                <h4 className={styles.mobileAccountLinksHeader}>Account Menu</h4>
                {renderAccountLinks()}
              </div>
            )}
          </div>
        </aside>

        {/* Backdrop overlay for Mobile side menus */}
        {isMobile && (showProfileMobile || showHighlightsMobile) && (
          <div className={styles.backdrop} onClick={closeAllToggles} />
        )}

        {/* Modals rendered directly to document.body */}
        {mounted &&
          typeof document !== "undefined" &&
          createPortal(
            <>
              <WithdrawalModal
                isOpen={showWithdrawModal}
                onClose={() => setShowWithdrawModal(false)}
                user={user}
                formatCurrency={formatCurrency}
                onSuccess={(data) => setTransferSuccessData(data)}
                onUpdateBalance={(finalBal, finalWithdrawal) =>
                  setUser((prev) => ({ ...prev, balance: finalBal, withdrawal: finalWithdrawal }))
                }
                onRefreshProfile={refreshProfileQuietly}
                onFetchNotifications={fetchNotifications}
              />

              <SendMoneyModal
                isOpen={showSendMoneyModal}
                onClose={() => setShowSendMoneyModal(false)}
                user={user}
                currentUserEmail={email}
                formatCurrency={formatCurrency}
                onSuccess={(data) => setTransferSuccessData(data)}
                onUpdateBalance={(finalBal) => setUser((prev) => ({ ...prev, balance: finalBal }))}
                onRefreshProfile={refreshProfileQuietly}
                onFetchNotifications={fetchNotifications}
              />

              <TransferSuccessModal
                data={transferSuccessData}
                onClose={() => setTransferSuccessData(null)}
                formatCurrency={formatCurrency}
              />
            </>,
            document.body
          )}
      </div>
    </div>
  );
}