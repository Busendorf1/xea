'use client';

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";

import styles from "./page.module.css";

export default function SidebarMenu() {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu]);

  const selectTab = (tab: string) => {
    sessionStorage.setItem("paayh_active_tab", tab);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("paayh_tab_change"));
    }
    setShowMenu(false);
  };

  return (
    <div className={styles.accountMenuContainer} ref={menuRef}>
      <button 
        type="button"
        onClick={() => setShowMenu(!showMenu)} 
        className={styles.toggleBtn}
        aria-label="Account Settings"
        title="Account Menu"
      >
        <Settings size={20} />
      </button>
      {showMenu && (
        <div className={styles.menuButtonGroup}>
          <Link href="/user/logged-in" className={styles.menuButton} onClick={() => selectTab("profile")}>Update Profile</Link>
          <Link href="/user/logged-in" className={styles.menuButton} onClick={() => selectTab("myads")}>My Ads</Link>
          <Link href="/user/logged-in" className={styles.menuButton} onClick={() => selectTab("news")}>Post Highlights</Link>
          <Link href="/user/logged-in" className={styles.menuButton} onClick={() => selectTab("adPage")}>Post Advert</Link>
          <Link href="/user/logged-in" className={styles.menuButton} onClick={() => selectTab("monetize")}>Monetize Account</Link>
          <Link href="/user/logged-in" className={styles.menuButton} onClick={() => selectTab("statement")}>Account Statement</Link>
          <Link href="/user/logout" className={styles.menuButton} onClick={() => setShowMenu(false)}>Logout</Link>
          <Link href="/user/logged-in" className={styles.menuButtonDanger} onClick={() => selectTab("deactivate")}>Deactivate Account</Link>
        </div>
      )}
    </div>
  );
}
