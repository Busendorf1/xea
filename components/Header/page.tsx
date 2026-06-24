"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@auth0/nextjs-auth0";
import styles from "../Header/page.module.css";
import { useTheme } from "../ThemeProvider";
import { Sun, Moon, Contrast, Bell } from "lucide-react";

export default function Header() {
  const [menuActive, setMenuActive] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const { user, isLoading } = useUser();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const earnAdsXea = urlParams.get("Earn Ads by Xea");
      const blurb = urlParams.get("blurb");
      const adId = urlParams.get("adId");
      
      const targetParam = earnAdsXea || blurb;
      if (targetParam) {
        try {
          const decodedId = atob(targetParam);
          localStorage.setItem("sharedAdId", decodedId);
          console.log("Captured and decoded sharedAdId from Earn Ads by Xea / blurb:", decodedId);
        } catch (e) {
          console.error("Failed to decode parameter:", e);
        }
      } else if (adId) {
        localStorage.setItem("sharedAdId", adId);
        console.log("Captured sharedAdId:", adId);
      }
    }

    return () => window.removeEventListener("resize", handleResize);
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

  const renderThemeSwitcher = () => (
    <div className={styles.themeSwitcher}>
      <button
        onClick={() => setTheme("white")}
        className={`${styles.themeBtn} ${theme === "white" ? styles.themeBtnActive : ""}`}
        title="White Mode"
        aria-label="Switch to White Mode"
      >
        <Sun size={15} />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`${styles.themeBtn} ${theme === "dark" ? styles.themeBtnActive : ""}`}
        title="Dark Mode"
        aria-label="Switch to Dark Mode"
      >
        <Moon size={15} />
      </button>
      <button
        onClick={() => setTheme("semi-dark")}
        className={`${styles.themeBtn} ${theme === "semi-dark" ? styles.themeBtnActive : ""}`}
        title="Semi Dark Mode"
        aria-label="Switch to Semi Dark Mode"
      >
        <Contrast size={15} />
      </button>
    </div>
  );

  return (
    <header className={styles.navbarContainer}>
      <div className={styles.navbar}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoText}>Xea</span>
          <span className={styles.logoDot}>.</span>
        </Link>

        {isSmallScreen ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {user && renderNotificationBell()}
              {renderThemeSwitcher()}
              <button 
                className={`${styles.hamburger} ${menuActive ? styles.hamburgerActive : ""}`} 
                onClick={toggleMenu}
                aria-label="Toggle Navigation Menu"
              >
                <span className={styles.bar}></span>
                <span className={styles.bar}></span>
                <span className={styles.bar}></span>
              </button>
            </div>

            <nav className={`${styles.mobileNav} ${menuActive ? styles.showMenu : ""}`}>
              {!isLoading && user ? (
                <>
                  <Link href="/user/dashboard" className={styles.navLink} onClick={toggleMenu}>
                    Dashboard
                  </Link>
                  <a href="/auth/logout" className={`${styles.navLink} ${styles.logoutBtn}`}>
                    Sign Out
                  </a>
                </>
              ) : (
                <a href="/auth/login?connection=google-oauth2" className={`${styles.navLink} ${styles.signInBtn}`}>
                  Sign In
                </a>
              )}
              <Link href="/help" className={styles.navLink} onClick={toggleMenu}>
                Help Center
              </Link>
              <Link href="/about" className={styles.navLink} onClick={toggleMenu}>
                About
              </Link>
            </nav>
          </>
        ) : (
          <nav className={styles.desktopNav}>
            <Link href="/about" className={styles.navLink}>
              About
            </Link>
            <Link href="/help" className={styles.navLink}>
              Help Center
            </Link>
            {user && renderNotificationBell()}
            {renderThemeSwitcher()}
            {!isLoading && user ? (
              <>
                <Link href="/user/dashboard" className={styles.dashboardBtn}>
                  Dashboard
                </Link>
                <a href="/auth/logout" className={styles.signOutBtn}>
                  Sign Out
                </a>
              </>
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



