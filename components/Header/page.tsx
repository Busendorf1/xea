"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useUser } from "@auth0/nextjs-auth0";
import styles from "../Header/page.module.css";
import { useTheme } from "../ThemeProvider";
import { Sun, Moon, Contrast, Bell, ArrowUpRight, ArrowDownLeft, Wallet, ShieldAlert, CheckCircle2, Trash2 } from "lucide-react";
import SidebarMenu from "@/components/SidebarToggle/page";

export default function Header() {
  const [menuActive, setMenuActive] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const { user, isLoading } = useUser();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const [selectedNotifs, setSelectedNotifs] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDeletingNotifs, setIsDeletingNotifs] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  const stripEmoji = (str: string) => {
    if (!str) return "";
    return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, "").trim();
  };

  const getNotificationIcon = (title: string, message: string) => {
    const t = (title + " " + message).toLowerCase();
    if (t.includes("sent") || t.includes("transfer_sent") || t.includes("money sent")) {
      return <ArrowUpRight size={15} color="#10b981" />;
    }
    if (t.includes("received") || t.includes("transfer_received") || t.includes("money received")) {
      return <ArrowDownLeft size={15} color="#6366f1" />;
    }
    if (t.includes("withdrawal") || t.includes("payout") || t.includes("bank")) {
      return <Wallet size={15} color="#3b82f6" />;
    }
    if (t.includes("limit") || t.includes("holding") || t.includes("suspended") || t.includes("alert")) {
      return <ShieldAlert size={15} color="#f59e0b" />;
    }
    if (t.includes("threshold") || t.includes("unlocked") || t.includes("completed") || t.includes("success")) {
      return <CheckCircle2 size={15} color="#10b981" />;
    }
    return <Bell size={15} color="var(--primary)" />;
  };

  // Close hamburger dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (hamburgerRef.current && !hamburgerRef.current.contains(event.target as Node)) {
        setMenuActive(false);
      }
    };
    if (menuActive) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuActive]);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    let lastScrollPos = 0;
    const handleScrollEvent = (scrollTop: number) => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile) {
        setShowHeader(true);
        return;
      }
      if (scrollTop > lastScrollPos && scrollTop > 30) {
        setShowHeader(false);
      } else if (scrollTop < lastScrollPos || scrollTop <= 15) {
        setShowHeader(true);
      }
      lastScrollPos = scrollTop;
    };

    const onWindowScroll = () => handleScrollEvent(window.scrollY);
    window.addEventListener("scroll", onWindowScroll, { passive: true });

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const earnAdsPaayh = urlParams.get("Earn Ads by Paayh");
      const blurb = urlParams.get("blurb");
      const adId = urlParams.get("adId");
      
      const targetParam = earnAdsPaayh || blurb;
      if (targetParam) {
        try {
          const decodedId = atob(targetParam);
          localStorage.setItem("sharedAdId", decodedId);
          console.log("Captured and decoded sharedAdId from Earn Ads by Paayh / blurb:", decodedId);
        } catch (e) {
          console.error("Failed to decode parameter:", e);
        }
      } else if (adId) {
        localStorage.setItem("sharedAdId", adId);
        console.log("Captured sharedAdId:", adId);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", onWindowScroll);
    };
  }, []);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      }
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

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

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
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

  const handleSelectAllNotifs = () => {
    if (selectedNotifs.length === notifications.length) {
      setSelectedNotifs([]);
    } else {
      setSelectedNotifs(notifications.map((n) => n.id));
    }
  };

  const handleToggleSelectNotif = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNotifs((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedNotifs = async () => {
    if (selectedNotifs.length === 0) return;
    setIsDeletingNotifs(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: selectedNotifs }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => !selectedNotifs.includes(n.id)));
        setSelectedNotifs([]);
      }
    } catch (e) {
      console.error("Failed to delete selected notifications:", e);
    } finally {
      setIsDeletingNotifs(false);
    }
  };

  const handleDeleteAllNotifs = async () => {
    if (!window.confirm("Are you sure you want to delete all notifications?")) return;
    setIsDeletingNotifs(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setNotifications([]);
        setSelectedNotifs([]);
      }
    } catch (e) {
      console.error("Failed to delete all notifications:", e);
    } finally {
      setIsDeletingNotifs(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderNotificationBell = () => (
    <div className={styles.notificationContainer}>
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
        <div className={styles.notificationDropdown} style={{ width: "380px", maxWidth: "92vw" }}>
          <div className={styles.notificationHeader} style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <h4 style={{ margin: 0 }}>Notifications</h4>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {unreadCount > 0 && !isSelectionMode && (
                  <button onClick={handleMarkAllAsRead} className={styles.markAllBtn} style={{ fontSize: "0.75rem", padding: "3px 8px" }}>
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
                    style={{
                      background: isSelectionMode ? "rgba(239, 68, 68, 0.12)" : "transparent",
                      border: isSelectionMode ? "1px solid rgba(239, 68, 68, 0.3)" : "none",
                      color: isSelectionMode ? "#ef4444" : "var(--text-muted)",
                      cursor: "pointer",
                      padding: "4px 6px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    <Trash2 size={15} />
                    {isSelectionMode && <span>Cancel</span>}
                  </button>
                )}
              </div>
            </div>

            {/* Selection and Deletion Controls - Only visible when in Selection Mode */}
            {isSelectionMode && notifications.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.76rem", paddingTop: "6px", borderTop: "1px solid var(--card-border)" }}>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleDeleteSelectedNotifs();
                    if (notifications.length <= selectedNotifs.length) {
                      setIsSelectionMode(false);
                    }
                  }}
                  disabled={selectedNotifs.length === 0 || isDeletingNotifs}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    backgroundColor: selectedNotifs.length > 0 ? "rgba(239, 68, 68, 0.15)" : "transparent",
                    border: selectedNotifs.length > 0 ? "1px solid rgba(239, 68, 68, 0.35)" : "1px solid transparent",
                    color: selectedNotifs.length > 0 ? "#ef4444" : "var(--text-muted)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: selectedNotifs.length > 0 ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    opacity: selectedNotifs.length > 0 ? 1 : 0.5,
                  }}
                >
                  <Trash2 size={12} /> Delete ({selectedNotifs.length})
                </button>

                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleDeleteAllNotifs();
                    setIsSelectionMode(false);
                  }}
                  disabled={isDeletingNotifs}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    backgroundColor: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete All
                </button>
              </div>
            )}
          </div>

          <div className={styles.notificationList} style={{ maxHeight: "360px", overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div className={styles.emptyNotifications}>No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkAsRead(n.id)}
                  className={`${styles.notificationItem} ${!n.read ? styles.notificationItemUnread : ""}`}
                  style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
                >
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedNotifs.includes(n.id)}
                      onClick={(e) => handleToggleSelectNotif(n.id, e)}
                      onChange={() => {}}
                      style={{ marginTop: "3px", cursor: "pointer", width: "14px", height: "14px", flexShrink: 0 }}
                    />
                  )}
                  <div className={styles.notificationIconWrapper} style={{ flexShrink: 0 }}>
                    {getNotificationIcon(n.title || "", n.message || "")}
                  </div>
                  <div className={styles.notificationContent} style={{ flexGrow: 1 }}>
                    <div className={styles.notificationTitle}>{stripEmoji(n.title)}</div>
                    <div className={styles.notificationMsg}>{stripEmoji(n.message)}</div>
                    <span className={styles.notificationTime}>
                      {new Date(n.created_at).toLocaleDateString()} at {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

  const toggleMenu = () => {
    setMenuActive(!menuActive);
  };

  const renderThemeSwitcher = () => {
    const cycleTheme = () => {
      if (theme === "white") {
        setTheme("dark");
      } else {
        setTheme("white");
      }
    };

    return (
      <div className={styles.themeSwitcher}>
        <button
          onClick={cycleTheme}
          className={`${styles.themeBtn} ${styles.themeBtnActive}`}
          title={theme === "white" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label="Toggle Theme"
        >
          {theme === "white" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    );
  };

  return (
    <header className={`${styles.navbarContainer} ${showHeader ? "" : styles.headerHidden}`}>
      <div className={styles.navbar}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoText}>Paayh</span>
          <span className={styles.logoDot}>.</span>
        </Link>

        {isSmallScreen ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SidebarMenu />
            {user && renderNotificationBell()}
            {renderThemeSwitcher()}
            <div className={styles.hamburgerContainer} ref={hamburgerRef}>
              <button 
                type="button"
                className={`${styles.hamburger} ${menuActive ? styles.hamburgerActive : ""}`} 
                onClick={toggleMenu}
                aria-label="Toggle Navigation Menu"
              >
                <span className={styles.bar}></span>
                <span className={styles.bar}></span>
                <span className={styles.bar}></span>
              </button>

              {menuActive && (
                <div className={styles.mobileNav}>
                  {isLoading ? (
                    <div style={{ height: 36 }} />
                  ) : user ? (
                    <a href="/auth/logout" className={styles.dropdownItem} onClick={() => setMenuActive(false)}>
                      Sign Out
                    </a>
                  ) : (
                    <a href="/auth/login?connection=google-oauth2" className={styles.dropdownItem} onClick={() => setMenuActive(false)}>
                      Sign In
                    </a>
                  )}
                  <Link href="/help" className={styles.dropdownItem} onClick={() => setMenuActive(false)}>
                    Help Center
                  </Link>
                  <Link href="/about" className={styles.dropdownItem} onClick={() => setMenuActive(false)}>
                    About
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : (
          <nav className={styles.desktopNav}>
            <Link href="/about" className={styles.navLink}>
              About
            </Link>
            <Link href="/help" className={styles.navLink}>
              Help Center
            </Link>
            <SidebarMenu />
            {user && renderNotificationBell()}
            {renderThemeSwitcher()}
            {isLoading ? (
              <div style={{ width: 80, height: 36 }} />
            ) : user ? (
              <a href="/auth/logout" className={styles.signOutBtn}>
                Sign Out
              </a>
            ) : (
              <a href="/auth/login?connection=google-oauth2" className={styles.ctaBtn}>
                Sign In
              </a>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}




