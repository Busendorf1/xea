"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTheme } from "../ThemeProvider";
import supabase from "@/lib/utils/db";
import { 
  Sun, 
  Moon, 
  Contrast, 
  User, 
  Settings, 
  Compass, 
  ArrowLeft,
  LogOut,
  UserCheck,
  TrendingUp,
  FileText,
  Trash2,
  X,
  Bell,
  Coins,
  Plus,
  Home
} from "lucide-react";
import Newsdisplay from "@/components/Newsdisplay/page";
import InviteLink from "@/components/InviteLink/page";
import Feed from "@/components/Feed/page";
import Collapsible from "../ui/Collapsible";
import styles from "./page.module.css";
import Footer from "../Footers/page";

interface UserProfile {
  id: string;
  profileImage: string | null;
  username: string;
  firstName: string;
  lastName: string;
  lastUpdated: string | null;
  bio: string | null;
  interest: string[] | string;
  email: string;
  industry: string[] | string;
  behavior: string[] | string;
  lifestyle: string[] | string;
  personality: string[] | string;
  monetized: boolean | string;
  monetized_at: string | null;
  created_at: string;
  monetized_until?: string | null;
  monetization_type?: string | null;
  country: string | null;
  state: string | null;
  location: string | null;
  phone: string;
  business_name: string | null;
  passphrase: string;
  mutual_count: number;
  balance: number;
  withdrawal: number;
  bvn_hash?: string | null;
}

interface DashboardClientProps {
  user: UserProfile;
  parsedInterest: string[];
  email: string;
}

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function DashboardClient({ user, parsedInterest, email }: DashboardClientProps) {
  const { theme, setTheme } = useTheme();
  const [monetizing, setMonetizing] = useState(false);

  // Withdrawal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [resolvedAccountName, setResolvedAccountName] = useState("");
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState("");

  // Notification states
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Custom header feedback states
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

  const fetchNotifications = async () => {
    if (!email) return;
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
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [email]);

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
    <div className={styles.notificationContainer} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      {showEarnFeedback && (
        <span style={{ display: "flex", alignItems: "center", paddingRight: "4px" }} title="Earnings enqueued">
          <Coins size={18} color="#f59e0b" style={{ animation: "fadeIn 0.2s" }} />
        </span>
      )}
      {showMutualFeedback && (
        <span style={{ display: "flex", alignItems: "center", paddingRight: "4px" }} title="Mutual connected">
          <Plus size={18} color="#6366f1" style={{ animation: "fadeIn 0.2s" }} />
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

  useEffect(() => {
    if (showWithdrawModal) {
      setWithdrawAmount(user.balance.toString());
      setWithdrawPhone("");
      setWithdrawalError("");
    }
  }, [showWithdrawModal, user.balance]);

  useEffect(() => {
    if (showWithdrawModal && banks.length === 0) {
      const fetchBanks = async () => {
        try {
          const res = await fetch("/api/withdrawals/banks");
          if (res.ok) {
            const data = await res.json();
            setBanks(data || []);
          }
        } catch (e) {
          console.error("Failed to fetch banks:", e);
        }
      };
      fetchBanks();
    }
  }, [showWithdrawModal, banks]);

  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      const resolveAccount = async () => {
        setResolvingAccount(true);
        setWithdrawalError("");
        setResolvedAccountName("");
        try {
          const res = await fetch("/api/withdrawals/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountNumber, bankCode: selectedBank }),
          });
          const data = await res.json();
          if (res.ok) {
            setResolvedAccountName(data.account_name);
          } else {
            setWithdrawalError(data.error || "Could not resolve account details");
          }
        } catch (e: any) {
          setWithdrawalError(e.message || "Error resolving account details");
        } finally {
          setResolvingAccount(false);
        }
      };
      resolveAccount();
    } else {
      setResolvedAccountName("");
    }
  }, [accountNumber, selectedBank]);

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawalError("");
    
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setWithdrawalError("Please enter a valid amount");
      return;
    }

    if (amountNum < 30000) {
      setWithdrawalError(`Minimum withdrawal threshold is ${formatCurrency(30000)}`);
      return;
    }

    if (amountNum !== user.balance) {
      setWithdrawalError("Withdrawals must deplete your account to zero. You must withdraw your entire balance.");
      return;
    }

    if (!withdrawPhone.trim()) {
      setWithdrawalError("Please enter your registered phone number");
      return;
    }

    if (!resolvedAccountName) {
      setWithdrawalError("Please resolve bank account details before submitting");
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const bank = banks.find((b) => b.code === selectedBank);
      const res = await fetch("/api/withdrawals/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankCode: selectedBank,
          bankName: bank?.name || "Unknown Bank",
          accountNumber,
          amount: amountNum,
          phone: withdrawPhone,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert("Success! Your withdrawal request has been queued for the next batch.");
        setShowWithdrawModal(false);
        window.location.reload();
      } else {
        setWithdrawalError(data.error || "Failed to process withdrawal");
      }
    } catch (e: any) {
      setWithdrawalError(e.message || "Failed to process withdrawal");
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const handleStandardMonetize = async () => {
    setMonetizing(true);
    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "monetization_standard",
          amount: 28000,
          metadata: {
            type: "monetization_standard",
            user_email: email.toLowerCase()
          },
          callbackUrl: `${window.location.origin}/user/statement`
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(`Failed to initialize payment: ${data.error || "Server error"}`);
      } else {
        alert("Redirecting to Paystack to complete your Standard Monetization subscription payment...");
        window.location.href = data.authorization_url;
      }
    } catch (e: any) {
      alert(`An error occurred: ${e.message}`);
    } finally {
      setMonetizing(false);
    }
  };

  const handleStandardMonetizeWallet = async () => {
    if (user.balance < 28000) {
      alert("Insufficient wallet balance. You need at least ₦28,000.00 to renew via wallet.");
      return;
    }
    if (!confirm(`Deduct ${formatCurrency(28000)} from your wallet balance to renew your Standard Monetization subscription?`)) return;
    setMonetizing(true);
    try {
      const response = await fetch("/api/payments/wallet-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "monetization_standard",
          amount: 28000,
          metadata: { type: "monetization_standard", user_email: email.toLowerCase() }
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(`Payment failed: ${data.error || "Server error"}`);
      } else {
        alert("✅ Subscription renewed! Your Standard Monetization is now active.");
        window.location.reload();
      }
    } catch (e: any) {
      alert(`An error occurred: ${e.message}`);
    } finally {
      setMonetizing(false);
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

  // Mobile Header scroll behavior states
  const [showHeader, setShowHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

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

  // Handle header scroll show/hide behavior on mobile
  useEffect(() => {
    if (!isMobile) {
      setShowHeader(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Scroll down hides header, scroll up (opposite direction) shows header
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        setShowHeader(false);
      } else if (currentScrollY < lastScrollY) {
        setShowHeader(true);
      }
      
      // Keep it visible at the very top
      if (currentScrollY <= 15) {
        setShowHeader(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY, isMobile]);

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

  // Handle highlights fade behavior on scroll
  useEffect(() => {
    const feedEl = feedAreaRef.current;
    
    const updateOpacity = () => {
      const scrollTop = feedEl ? feedEl.scrollTop : window.scrollY;
      const threshold = 200; // pixels to fade in completely
      const opacity = Math.min(1, Math.max(0, scrollTop / threshold));

      if (highlightsRef.current) {
        highlightsRef.current.style.opacity = opacity.toString();
        highlightsRef.current.style.pointerEvents = opacity === 0 ? "none" : "auto";
      }
    };

    // Run once on mount to set correct initial opacity
    updateOpacity();

    window.addEventListener("scroll", updateOpacity, { passive: true });
    if (feedEl) {
      feedEl.addEventListener("scroll", updateOpacity, { passive: true });
    }

    return () => {
      window.removeEventListener("scroll", updateOpacity);
      if (feedEl) {
        feedEl.removeEventListener("scroll", updateOpacity);
      }
    };
  }, []);

  // Close all mobile sidebars
  const closeAllToggles = () => {
    setShowProfileMobile(false);
    setShowHighlightsMobile(false);
  };

  const parseToArray = (val: string[] | string | null | undefined): string[] => {
    if (!val) return [];
    return Array.isArray(val) ? val : val.split(",").map((v) => v.trim());
  };

  const ago = user.lastUpdated
    ? `${Math.floor((Date.now() - new Date(user.lastUpdated).getTime()) / (1000 * 60 * 60 * 24))} day(s) ago`
    : "Never";

  const renderThemeSwitcher = () => {
    const cycleTheme = () => {
      if (theme === "white") {
        setTheme("semi-dark");
      } else if (theme === "semi-dark") {
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
          title={
            theme === "white"
              ? "Switch to Dim Mode"
              : theme === "semi-dark"
              ? "Switch to Dark Mode"
              : "Switch to Light Mode"
          }
          aria-label="Toggle Theme"
        >
          {theme === "white" && <Sun size={14} />}
          {theme === "semi-dark" && <Contrast size={14} />}
          {theme === "dark" && <Moon size={14} />}
        </button>
      </div>
    );
  };

  const renderAccountLinks = () => (
    <div className={styles.menuButtonGroup}>
      <Link href="/user/profile" className={styles.menuButton}>
        <User size={16} />
        <span>Update Profile</span>
      </Link>
      <Link href="/user/myads" className={styles.menuButton}>
        <TrendingUp size={16} />
        <span>My Ads</span>
      </Link>
      <Link href="/user/news" className={styles.menuButton}>
        <Compass size={16} />
        <span>Post Highlights</span>
      </Link>
      <Link href="/user/adPage" className={styles.menuButton}>
        <FileText size={16} />
        <span>Post Advert</span>
      </Link>
      <Link href="/user/monetize" className={styles.menuButton}>
        <UserCheck size={16} />
        <span>Monetize Account</span>
      </Link>
      <Link href="/user/logout" className={styles.menuButton}>
        <LogOut size={16} />
        <span>Logout</span>
      </Link>
      <Link href="/user/deactivate" className={styles.menuButtonDanger}>
        <Trash2 size={16} />
        <span>Deactivate Account</span>
      </Link>
    </div>
  );

  return (
    <div className={styles.appWrapper}>
      {/* 1. Header Section */}
      <header className={`${styles.header} ${showHeader ? styles.headerVisible : styles.headerHidden}`}>
        <div className={styles.headerContent}>
          {/* Logo / App Name */}
          <div 
            className={styles.logoGroup}
            onClick={() => {
              if (isMobile) {
                closeAllToggles();
              } else if (isTablet) {
                setShowProfileTablet(!showProfileTablet);
              }
            }}
            title={isMobile ? "Go to Feed" : isTablet ? "Toggle Profile View" : undefined}
          >
            <div className={styles.nameBlock}>
              <span className={styles.appName}>Paayh</span>
              {!isMobile && <span className={styles.appSub}>Your feeds are ads</span>}
            </div>
          </div>

          {/* Minimalist Controls - Only visible on Mobile */}
          {isMobile ? (
            <div className={styles.mobileControls}>
              <button 
                onClick={() => {
                  closeAllToggles();
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }} 
                className={`${styles.controlBtn} ${(!showHighlightsMobile && !showProfileMobile) ? styles.controlBtnActive : ""}`}
                title="Home Feed"
              >
                <Home size={20} />
              </button>
              <button 
                onClick={() => {
                  const current = showHighlightsMobile;
                  closeAllToggles();
                  setShowHighlightsMobile(!current);
                }} 
                className={`${styles.controlBtn} ${showHighlightsMobile ? styles.controlBtnActive : ""}`}
                title="Campaigns"
              >
                <Compass size={20} />
              </button>
              <button 
                onClick={() => {
                  closeAllToggles();
                  setShowProfileMobile(true);
                  setTimeout(() => {
                    const el = document.querySelector(`.${styles.walletCard}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }, 300);
                }} 
                className={styles.controlBtn}
                title="Monetization"
              >
                <Coins size={20} />
              </button>
              <button 
                onClick={() => {
                  const current = showProfileMobile;
                  closeAllToggles();
                  setShowProfileMobile(!current);
                }} 
                className={`${styles.controlBtn} ${showProfileMobile ? styles.controlBtnActive : ""}`}
                title="My Profile"
              >
                <User size={20} />
              </button>
              {renderNotificationBell()}
              {renderThemeSwitcher()}
            </div>
          ) : (
            // Desktop/Tablet Right Header Controls
            <div className={styles.headerRight}>
              {isTablet && (
                <button 
                  onClick={() => setShowProfileTablet(!showProfileTablet)} 
                  className={`${styles.tabletToggleBtn} ${showProfileTablet ? styles.tabletToggleBtnActive : ""}`}
                >
                  <User size={16} />
                  <span>{showProfileTablet ? "View Highlights" : "View Profile"}</span>
                </button>
              )}
              <div className={styles.desktopNav}>
                <Link href="/">Home</Link>
                <Link href="/privacy">Policies</Link>
                <Link href="/faq">FAQ</Link>
              </div>
              {renderNotificationBell()}
              {renderThemeSwitcher()}
            </div>
          )}
        </div>
      </header>

      {/* 2. Main Dashboard Layout Area */}
      <div className={styles.dashboardContainer}>
        {/* Left Sidebar - Highlights Section */}
        {/* On tablet: hidden if profile is toggled. On mobile: hidden by default, slides in full screen. */}
        <aside className={`${styles.leftSidebar} ${
          isTablet && showProfileTablet ? styles.hiddenTablet : ""
        } ${
          isMobile ? (showHighlightsMobile ? styles.showMobileFull : styles.hideMobileFull) : ""
        }`}>
          {isMobile && (
            <div className={styles.sidebarMobileHeader}>
              <button onClick={closeAllToggles} className={styles.backBtn}>
                <ArrowLeft size={20} />
                <span>Back to Feed</span>
              </button>
              <h3 className={styles.mobilePanelTitle}>Daily Highlights</h3>
            </div>
          )}
          
          <div className={styles.sidebarContent}>
            <div className={styles.desktopLeftHeader}>
              <button
                onClick={() => setShowAccountMenuLeft(!showAccountMenuLeft)}
                className={`${styles.leftSettingsToggle} ${!showAccountMenuLeft ? styles.rotated : ""}`}
                title="Toggle Account Menu"
              >
                <Settings size={18} />
              </button>
              <h3 className={styles.menuTitle}>Account Menu</h3>
            </div>
            <Collapsible isOpen={showAccountMenuLeft}>
              {renderAccountLinks()}
            </Collapsible>
            <div 
              ref={highlightsRef} 
              style={{ 
                opacity: 0,
                transition: "opacity 0.15s ease-out", 
                willChange: "opacity",
                pointerEvents: "none"
              }}
            >
              <p className={styles.offerArea}>Daily Business Highlights:</p>
              <Newsdisplay userInterest={parsedInterest} />
            </div>
          </div>
        </aside>

        <main 
          ref={feedAreaRef}
          className={`${styles.feedArea} ${
            isMobile && (showProfileMobile || showHighlightsMobile) ? styles.feedAreaLocked : ""
          }`}
        >
          <Feed 
            userEmail={email} 
            initialProfile={user} 
            onEarnSuccess={triggerEarnFeedback} 
            onMutualSuccess={triggerMutualFeedback} 
          />
        </main>

        {/* Right Sidebar - Profile & Wallet details */}
        {/* On tablet: hidden by default, slides in if profile is toggled. On mobile: hidden by default, slides in full screen. */}
        <aside className={`${styles.rightSidebar} ${
          isTablet && !showProfileTablet ? styles.hiddenTablet : ""
        } ${
          isMobile ? (showProfileMobile ? styles.showMobileFull : styles.hideMobileFull) : ""
        }`}>
          {isMobile && (
            <div className={styles.sidebarMobileHeader}>
              <button onClick={closeAllToggles} className={styles.backBtn}>
                <ArrowLeft size={20} />
                <span>Back to Feed</span>
              </button>
              <h3 className={styles.mobilePanelTitle}>My Profile</h3>
            </div>
          )}

          <div className={styles.sidebarContent}>
            {/* Profile Card */}
            <div className={styles.profileCard}>
              <div className={styles.profileBanner}></div>
              <div className={styles.avatarRow}>
                <div className={styles.profileImgContainer}>
                  {user.profileImage ? (
                    <img
                      src={user.profileImage}
                      alt="Profile picture"
                      className={styles.profileImg}
                    />
                  ) : (
                    <div className={styles.profileAvatarPlaceholder}>
                      {user.firstName ? user.firstName.slice(0, 2).toUpperCase() : "US"}
                    </div>
                  )}
                </div>
                <Link href="/user/profile" className={styles.editProfileBtn}>
                  Edit profile
                </Link>
              </div>

              <div className={styles.profileInfo}>
                <h4 className={styles.profileName}>
                  {user.business_name && user.business_name.trim() !== "" ? user.business_name : `${user.firstName} ${user.lastName}`}
                </h4>
                <p className={styles.usernameText}>@{user.username.split("@")[0]}</p>

                {user.business_name && user.business_name.trim() !== "" && (
                  <p className={styles.detailItem} style={{ marginBottom: "0.5rem", fontSize: "0.78rem" }}>
                    Representative: {user.firstName} {user.lastName}
                  </p>
                )}

                <p className={styles.profileBio}>{user.bio || "No bio set yet."}</p>

                <div className={styles.profileDetails}>
                  <div className={styles.detailItem}>
                    <svg viewBox="0 0 24 24" className={styles.detailIcon}>
                      <path d="M19.708 7.375c-.11-.58-.345-1.13-.683-1.605l.015.018c-.675-.86-1.72-1.39-2.89-1.39h-8.3c-1.17 0-2.215.53-2.89 1.39l.015-.018c-.338.475-.573 1.025-.683 1.605l-.015-.008v9.25c0 1.93 1.57 3.5 3.5 3.5h8.3c1.93 0 3.5-1.57 3.5-3.5v-9.25l-.015.008zM9.15 5.88h5.7c.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25h-5.7c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25zm6.55 12.24h-7.4c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25h7.4c.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25zm0-3.5h-7.4c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25h7.4c.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25z" fill="currentColor"/>
                    </svg>
                    <span>Last updated: {ago}</span>
                  </div>
                  {user.country && user.country !== "PLACEHOLDER" && (
                    <div className={styles.detailItem}>
                      <svg viewBox="0 0 24 24" className={styles.detailIcon}>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
                      </svg>
                      <span>{user.state ? `${user.state}, ` : ""}{user.country}</span>
                    </div>
                  )}
                  <div className={styles.detailItem}>
                    <svg viewBox="0 0 24 24" className={styles.detailIcon}>
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor"/>
                    </svg>
                    <span>Mutuals: {user.mutual_count} / 50</span>
                  </div>
                </div>

                {(() => {
                  const hasEverSubscribed = !!(
                    user.monetized === "yes" || user.monetized === "true" || user.monetized === true ||
                    user.monetized_at || user.monetization_type
                  );
                  const isExpired = hasEverSubscribed &&
                    user.monetized_until != null &&
                    new Date(user.monetized_until).getTime() <= Date.now();
                  const isActive = !!(
                    (user.monetized === "yes" || user.monetized === "true" || user.monetized === true) &&
                    (!user.monetized_until || new Date(user.monetized_until).getTime() > Date.now())
                  );
                  const accountAgeInDays = user.created_at
                    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;

                  if (isActive) {
                    // Active subscription — show badge + faint renew button only
                    const planType = user.monetization_type === "instant" ? "instant" : "standard";
                    const renewalAmount = planType === "instant" ? 60000 : 28000;
                    const planLabel = planType === "instant" ? "Instant subscription active" : "Standard subscription active";
                    return (
                      <div className={styles.renewalSection}>
                        <div className={styles.monetizedBadge}>
                          <svg viewBox="0 0 24 24" className={styles.verifiedIcon}>
                            <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.99-3.818-3.99-.48 0-.941.1-1.358.275C14.77 2.57 13.5 1.75 12 1.75s-2.77.82-3.412 2.035c-.417-.175-.878-.275-1.358-.275-2.108 0-3.818 1.78-3.818 3.99 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.71 3.99 3.818 3.99.48 0 .941-.1 1.358-.275C9.23 20.43 10.5 21.25 12 21.25s2.77-.82 3.412-2.035c.417.175.878.275 1.358.275 2.108 0 3.818-1.78 3.818-3.99 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6zm-12.72 3.39l-3.21-3.21 1.41-1.41 1.8 1.8 4.67-4.67 1.41 1.41-6.08 6.08z" fill="currentColor"/>
                          </svg>
                          <span>
                            {planLabel}
                            {user.monetized_until && (
                              <> · Expires {new Date(user.monetized_until).toLocaleDateString()}</>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled
                          className={styles.renewBtnFaint}
                        >
                          Renew Subscription ({formatCurrency(renewalAmount)} / month)
                        </button>
                      </div>
                    );
                  } else if (isExpired) {
                    // Subscription has lapsed — always show Renew button
                    return (
                      <div className={styles.renewalSection}>
                        <p className={styles.renewalExpiredText}>
                          ⚠️ Your subscription expired on{" "}
                          <strong>{new Date(user.monetized_until!).toLocaleDateString()}</strong>.
                          Renew to keep earning from ads.
                        </p>
                        <button
                          type="button"
                          disabled={monetizing}
                          onClick={handleStandardMonetize}
                          className={styles.renewBtn}
                        >
                          {monetizing ? "Processing..." : `Renew via Card/Bank (${formatCurrency(28000)} / month)`}
                        </button>
                        {user.balance >= 28000 && (
                          <button
                            type="button"
                            disabled={monetizing}
                            onClick={handleStandardMonetizeWallet}
                            className={styles.renewBtn}
                            style={{ marginTop: "0.5rem", background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                          >
                            {monetizing ? "Processing..." : `Renew with Wallet Balance (${formatCurrency(28000)})`}
                          </button>
                        )}
                      </div>
                    );
                  } else if (accountAgeInDays >= 90) {
                    // Never subscribed, account old enough — show first-time subscribe button
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                        <button
                          type="button"
                          disabled={monetizing}
                          onClick={handleStandardMonetize}
                          className={styles.profileMonetizeBtn}
                        >
                          {monetizing ? "Activating..." : `Monetize via Card/Bank (${formatCurrency(28000)} / month)`}
                        </button>
                        {user.balance >= 28000 && (
                          <button
                            type="button"
                            disabled={monetizing}
                            onClick={handleStandardMonetizeWallet}
                            className={styles.profileMonetizeBtn}
                            style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                          >
                            {monetizing ? "Activating..." : `Monetize with Wallet Balance (${formatCurrency(28000)})`}
                          </button>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <InviteLink username={user.username} />

            <div className={styles.walletCard}>
              <h4 className={styles.walletHeader}>Wallet Balance</h4>
              <p className={styles.walletBalance}>{formatCurrency(user.balance ?? 0)}</p>
              {user.withdrawal > 0 && (
                <p style={{ fontSize: "0.75rem", color: "#3b82f6", marginBottom: "0.5rem" }}>
                  Pending Withdrawal: {formatCurrency(user.withdrawal)}
                </p>
              )}
              <button
                onClick={() => setShowWithdrawModal(true)}
                className={styles.withdrawBtn}
                disabled={
                  !((user.monetized === "yes" || user.monetized === "true" || user.monetized === true) &&
                    (!user.monetized_until || new Date(user.monetized_until).getTime() > Date.now()))
                }
              >
                {(user.monetized === "yes" || user.monetized === "true" || user.monetized === true) &&
                (!user.monetized_until || new Date(user.monetized_until).getTime() > Date.now())
                  ? "Request Withdrawal"
                  : "Monetize to withdraw earnings"}
              </button>
              <Link href="/user/statement" className={styles.statementLink}>
                View Account Statement
              </Link>
            </div>

            <div className={styles.tagsCard}>
              <TagGroup label="Interest" items={parseToArray(user.interest)} />
              <TagGroup label="Industry" items={parseToArray(user.industry)} />
              <TagGroup label="Behavior" items={parseToArray(user.behavior)} />
              <TagGroup label="Lifestyle" items={parseToArray(user.lifestyle)} />
              <TagGroup label="Personality" items={parseToArray(user.personality)} />
            </div>

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

        {/* Withdrawal Modal */}
        {showWithdrawModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContainer}>
              <div className={styles.modalHeader}>
                <h3>Request Bank Withdrawal</h3>
                <button onClick={() => setShowWithdrawModal(false)} className={styles.closeBtn}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleWithdrawSubmit} className={styles.modalBody}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  <span>Available Balance:</span>
                  <span style={{ fontWeight: "700", color: "#10b981" }}>{formatCurrency(user.balance ?? 0)}</span>
                </div>
                
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Bank</label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    required
                    className={styles.formInput}
                  >
                    <option value="">-- Choose Your Bank --</option>
                    {banks.map((b, index) => (
                      <option key={`${b.code}-${index}`} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Account Number</label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="10-digit Account Number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                    required
                    className={styles.formInput}
                  />
                </div>

                {resolvingAccount && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Verifying account details with bank...
                  </div>
                )}

                {resolvedAccountName && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Account Name</label>
                    <div className={styles.resolvedName}>{resolvedAccountName}</div>
                  </div>
                )}

                 <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Amount (₦)</label>
                  <input
                    type="text"
                    readOnly
                    value={formatCurrency(withdrawAmount)}
                    className={styles.formInput}
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", cursor: "not-allowed" }}
                  />
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    Note: Withdrawals must deplete your wallet to zero. Minimum threshold is {formatCurrency(30000)}.
                  </span>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Registered Phone Number</label>
                  <input
                    type="text"
                    placeholder="Enter registered phone number"
                    value={withdrawPhone}
                    onChange={(e) => setWithdrawPhone(e.target.value)}
                    required
                    className={styles.formInput}
                  />
                </div>



                {withdrawalError && <div className={styles.errorText}>{withdrawalError}</div>}

                <button
                  type="submit"
                  disabled={submittingWithdrawal || !resolvedAccountName}
                  className={styles.submitBtn}
                >
                  {submittingWithdrawal ? "Processing Withdrawal..." : "Withdraw Funds"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      
    <Footer />
    </div>
  );
}

function TagGroup({
  label,
  items,
}: {
  label: string;
  items?: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <>
    <div className={styles.tagGroup}>
      <h5>{label}:</h5>
      <div className={styles.tagsContainer}>
        {items.map((item) => (
          <span key={item} className={styles.tag}>
            {item}
          </span>
        ))}
      </div>
    </div>
    </>
  );
}
