"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sun,
  Moon,
  Compass,
  User,
  Bell,
  Coins,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import styles from "./page.module.css";

interface DashboardHeaderProps {
  theme: string;
  onCycleTheme: () => void;
  isMobile: boolean;
  isTablet: boolean;
  showHeader: boolean;
  showProfileTablet: boolean;
  onToggleProfileTablet: () => void;
  showHighlightsMobile: boolean;
  showProfileMobile: boolean;
  onToggleHighlightsMobile: () => void;
  onToggleProfileMobile: () => void;
  onCloseAllToggles: () => void;
  notifications: any[];
  onMarkAsRead: (id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDeleteSelectedNotifs: (ids: string[]) => Promise<void>;
  onDeleteAllNotifs: () => Promise<void>;
  showEarnFeedback: boolean;
  showMutualFeedback: boolean;
}

const stripEmoji = (str: string) => {
  if (!str) return "";
  return str
    .replace(/approved by admin(istrators?)?/gi, "approved")
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu,
      ""
    )
    .trim();
};

const getNotificationIcon = (title: string, message: string) => {
  const t = (title + " " + message).toLowerCase();
  if (t.includes("sent") || t.includes("transfer_sent") || t.includes("money sent")) {
    return <ArrowUpRight size={15} color="var(--success)" />;
  }
  if (t.includes("received") || t.includes("transfer_received") || t.includes("money received")) {
    return <ArrowDownLeft size={15} color="var(--success)" />;
  }
  if (t.includes("withdrawal") || t.includes("payout") || t.includes("bank")) {
    return <Wallet size={15} color="var(--primary)" />;
  }
  if (t.includes("limit") || t.includes("holding") || t.includes("suspended") || t.includes("alert")) {
    return <ShieldAlert size={15} color="var(--danger)" />;
  }
  if (t.includes("threshold") || t.includes("unlocked") || t.includes("completed") || t.includes("success")) {
    return <CheckCircle2 size={15} color="var(--success)" />;
  }
  return <Bell size={15} color="var(--primary)" />;
};

export default function DashboardHeader({
  theme,
  onCycleTheme,
  isMobile,
  isTablet,
  showHeader,
  showProfileTablet,
  onToggleProfileTablet,
  showHighlightsMobile,
  showProfileMobile,
  onToggleHighlightsMobile,
  onToggleProfileMobile,
  onCloseAllToggles,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteSelectedNotifs,
  onDeleteAllNotifs,
  showEarnFeedback,
  showMutualFeedback,
}: DashboardHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNotifs, setSelectedNotifs] = useState<string[]>([]);
  const [isDeletingNotifs, setIsDeletingNotifs] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showNotifications && !target.closest(`.${styles.notificationContainer}`)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [showNotifications]);

  const handleToggleSelectNotif = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNotifs((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAllNotifs = () => {
    if (selectedNotifs.length === notifications.length) {
      setSelectedNotifs([]);
    } else {
      setSelectedNotifs(notifications.map((n) => n.id));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedNotifs.length === 0) return;
    if (!confirm(`Delete ${selectedNotifs.length} selected notification(s)?`)) return;
    setIsDeletingNotifs(true);
    try {
      await onDeleteSelectedNotifs(selectedNotifs);
      setSelectedNotifs([]);
      if (notifications.length <= selectedNotifs.length) {
        setIsSelectionMode(false);
      }
    } finally {
      setIsDeletingNotifs(false);
    }
  };

  const handleDeleteAll = async () => {
    if (notifications.length === 0) return;
    if (!confirm("Are you sure you want to delete ALL notifications?")) return;
    setIsDeletingNotifs(true);
    try {
      await onDeleteAllNotifs();
      setSelectedNotifs([]);
      setIsSelectionMode(false);
    } finally {
      setIsDeletingNotifs(false);
    }
  };

  const renderNotificationBell = () => (
    <div className={`${styles.notificationContainer} ${styles.notificationRow}`}>
      {showEarnFeedback && (
        <span className={styles.feedbackIconWrap} title="Earnings enqueued">
          <Coins size={18} color="var(--success)" className={styles.feedbackIcon} />
        </span>
      )}
      {showMutualFeedback && (
        <span className={styles.feedbackIconWrap} title="Mutual connected">
          <Plus size={18} color="var(--primary)" className={styles.feedbackIcon} />
        </span>
      )}
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className={styles.notificationBell}
        title="Notifications"
        aria-label="Toggle notifications panel"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className={styles.notificationBadge}>{unreadCount}</span>}
      </button>

      {showNotifications && (
        <div className={styles.notificationDropdown}>
          <div className={styles.notificationHeader}>
            <div className={styles.notificationHeaderTop}>
              <h4>Notifications</h4>
              <div className={styles.notificationActionsGroup}>
                {unreadCount > 0 && !isSelectionMode && (
                  <button onClick={onMarkAllAsRead} className={styles.markAllBtn}>
                    Mark all as read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSelectionMode((prev) => {
                        if (prev) setSelectedNotifs([]);
                        return !prev;
                      });
                    }}
                    title={isSelectionMode ? "Cancel selection" : "Delete notifications"}
                    className={`${styles.notifToggleSelectionBtn} ${
                      isSelectionMode ? styles.notifToggleSelectionBtnActive : ""
                    }`}
                  >
                    <Trash2 size={15} />
                    {isSelectionMode && <span>Cancel</span>}
                  </button>
                )}
              </div>
            </div>

            {isSelectionMode && notifications.length > 0 && (
              <div className={styles.notifSelectionBar}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllNotifs();
                  }}
                  className={`${styles.notifSelectAllBtn} ${
                    selectedNotifs.length === notifications.length ? styles.notifSelectAllBtnActive : ""
                  }`}
                >
                  {selectedNotifs.length === notifications.length ? "Deselect All" : "Select All"}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSelected();
                  }}
                  disabled={selectedNotifs.length === 0 || isDeletingNotifs}
                  className={`${styles.notifDeleteSelectedBtn} ${
                    selectedNotifs.length === 0 || isDeletingNotifs ? styles.notifDeleteSelectedBtnDisabled : ""
                  }`}
                >
                  <Trash2 size={12} /> Delete ({selectedNotifs.length})
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAll();
                  }}
                  disabled={isDeletingNotifs}
                  className={styles.notifDeleteAllBtn}
                >
                  Delete All
                </button>
              </div>
            )}
          </div>

          <div className={styles.notificationList}>
            {notifications.length === 0 ? (
              <div className={styles.emptyNotifications}>No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => onMarkAsRead(n.id)}
                  className={`${styles.notificationItem} ${!n.read ? styles.notificationItemUnread : ""}`}
                >
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedNotifs.includes(n.id)}
                      onClick={(e) => handleToggleSelectNotif(n.id, e)}
                      onChange={() => {}}
                      className={styles.notifCheckbox}
                    />
                  )}
                  <div className={styles.notificationIconWrapper}>
                    {getNotificationIcon(n.title || "", n.message || "")}
                  </div>
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationTitle}>{stripEmoji(n.title)}</div>
                    <div className={styles.notificationMsg}>{stripEmoji(n.message)}</div>
                    <span className={styles.notificationTime}>
                      {new Date(n.created_at).toLocaleDateString()} at{" "}
                      {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {!n.read && <span className={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderThemeSwitcher = () => (
    <div className={styles.themeSwitcher}>
      <button
        onClick={onCycleTheme}
        className={`${styles.themeBtn} ${styles.themeBtnActive}`}
        title={theme === "white" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        aria-label="Toggle Theme"
      >
        {theme === "white" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </div>
  );

  return (
    <header className={`${styles.header} ${showHeader ? styles.headerVisible : styles.headerHidden}`}>
      <div className={styles.headerContent}>
        {/* Logo / App Name */}
        <div
          className={styles.logoGroup}
          onClick={() => {
            if (isMobile) {
              onCloseAllToggles();
            } else if (isTablet) {
              onToggleProfileTablet();
            } else {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("paayh_active_tab", "feed");
                document.cookie = "paayh_active_tab=feed; path=/; max-age=604800; SameSite=Lax";
                window.dispatchEvent(new CustomEvent("paayh_tab_change", { detail: { tab: "feed" } }));
              }
            }
          }}
          title={isMobile ? "Go to Feed" : isTablet ? "Toggle Profile View" : "Go to Home Feed"}
        >
          <div className={styles.nameBlock}>
            <span className={styles.appName}>Paayh</span>
            {!isMobile && <span className={styles.appSub}>Your feeds are ads</span>}
          </div>
        </div>

        {/* Minimalist Controls: Only visible on Mobile */}
        {isMobile ? (
          <div className={styles.mobileControls}>
            <button
              onClick={onToggleHighlightsMobile}
              className={`${styles.controlBtn} ${showHighlightsMobile ? styles.controlBtnActive : ""}`}
              title="Campaigns"
            >
              <Compass size={20} />
            </button>
            <button
              onClick={onToggleProfileMobile}
              className={`${styles.controlBtn} ${showProfileMobile ? styles.controlBtnActive : ""}`}
              title="My Profile"
            >
              <User size={20} />
            </button>
            {renderNotificationBell()}
            {renderThemeSwitcher()}
          </div>
        ) : (
          <div className={styles.headerRight}>
            {isTablet && (
              <button
                onClick={onToggleProfileTablet}
                className={`${styles.tabletToggleBtn} ${showProfileTablet ? styles.tabletToggleBtnActive : ""}`}
              >
                <User size={16} />
                <span>{showProfileTablet ? "View Highlights" : "View Profile"}</span>
              </button>
            )}
            <div className={styles.desktopNav}>
              <Link
                href="/logged-in?view=feed"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("paayh_active_tab", "feed");
                    document.cookie = "paayh_active_tab=feed; path=/; max-age=604800; SameSite=Lax";
                    window.dispatchEvent(new CustomEvent("paayh_tab_change", { detail: { tab: "feed" } }));
                  }
                }}
              >
                Home
              </Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/faq">FAQ</Link>
            </div>
            {renderNotificationBell()}
            {renderThemeSwitcher()}
          </div>
        )}
      </div>
    </header>
  );
}
