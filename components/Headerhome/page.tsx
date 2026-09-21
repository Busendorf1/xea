"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useUser } from "@auth0/nextjs-auth0";
import styles from "../Headerhome/page.module.css";
import { useTheme } from "../ThemeProvider";
import { Sun, Moon, Bell, Trash2 } from "lucide-react";

export default function Header() {
  const [menuActive, setMenuActive] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const { user, isLoading } = useUser();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const hamburgerRef = useRef<HTMLDivElement>(null);

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

  const [selectedNotifs, setSelectedNotifs] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDeletingNotifs, setIsDeletingNotifs] = useState(false);

  const handleToggleSelectNotif = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNotifs((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllNotifs = () => {
    if (selectedNotifs.length === notifications.length) {
      setSelectedNotifs([]);
    } else {
      setSelectedNotifs(notifications.map((n) => n.id));
    }
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
        setNotifications((prev) => {
          const remaining = prev.filter((n) => !selectedNotifs.includes(n.id));
          if (remaining.length === 0) setIsSelectionMode(false);
          return remaining;
        });
        setSelectedNotifs([]);
      }
    } catch (err) {
      console.error("Failed to delete notifications:", err);
    } finally {
      setIsDeletingNotifs(false);
    }
  };

  const handleDeleteAllNotifs = async () => {
    if (notifications.length === 0) return;
    if (!confirm("Are you sure you want to delete ALL notifications?")) return;
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
        setIsSelectionMode(false);
      }
    } catch (err) {
      console.error("Failed to delete all notifications:", err);
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
        <div className={styles.notificationDropdown}>
          <div className={`${styles.notificationHeader} ${styles.notificationHeaderColumn}`}>
            <div className={styles.notifTitleRow}>
              <h4>Notifications</h4>
              <div className={styles.notifActionsRow}>
                {unreadCount > 0 && !isSelectionMode && (
                  <button onClick={handleMarkAllAsRead} className={styles.markAllBtn}>
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
                    className={`${styles.notifDeleteToggleBtn} ${isSelectionMode ? styles.notifDeleteToggleBtnActive : ""}`}
                  >
                    <Trash2 size={15} />
                    {isSelectionMode && <span>Cancel</span>}
                  </button>
                )}
              </div>
            </div>

            {/* Selection and Deletion Controls - Only visible when in Selection Mode */}
            {isSelectionMode && notifications.length > 0 && (
              <div className={styles.notifSelectionBar}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllNotifs();
                  }}
                  className={`${styles.notifSelectAllBtn} ${selectedNotifs.length === notifications.length ? styles.notifSelectAllBtnActive : ""}`}
                >
                  {selectedNotifs.length === notifications.length ? "Deselect All" : "Select All"}
                </button>

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
                  className={`${styles.notifDeleteSelectedBtn} ${selectedNotifs.length > 0 ? styles.notifDeleteSelectedBtnActive : ""}`}
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
                  onClick={() => handleMarkAsRead(n.id)}
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
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationTitle}>{n.title}</div>
                    <div className={styles.notificationMsg}>{n.message}</div>
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
          <div className={styles.mobileRightBar}>
            {/* <SidebarMenu /> */}
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
                    <div className={styles.authPlaceholderMobile} />
                  ) : user ? (
                    <a href="/auth/logout" className={styles.dropdownItem} onClick={() => setMenuActive(false)}>
                      Sign Out
                    </a>
                  ) : (
                    <a href="/auth/login" className={styles.dropdownItem} onClick={() => setMenuActive(false)}>
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
            {/* <SidebarMenu /> */}
            {user && renderNotificationBell()}
            {renderThemeSwitcher()}
            {isLoading ? (
              <div className={styles.authPlaceholderDesktop} />
            ) : user ? (
              <a href="/auth/logout" className={styles.signOutBtn}>
                Sign Out
              </a>
            ) : (
              <a href="/auth/login" className={styles.ctaBtn}>
                Sign In
              </a>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}




