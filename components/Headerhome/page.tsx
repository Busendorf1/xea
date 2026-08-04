"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useUser } from "@auth0/nextjs-auth0";
import styles from "../Headerhome/page.module.css";
import { useTheme } from "../ThemeProvider";
import { Sun, Moon, Contrast, Bell } from "lucide-react";
import SidebarMenu from "@/components/SidebarToggle/page";

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
          <div className={styles.notificationHeader}>
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} className={styles.markAllBtn}>
                Mark all as read
              </button>
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
            {/* <SidebarMenu /> */}
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




