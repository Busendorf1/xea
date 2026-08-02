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
          <Link href="/user/profile" className={styles.menuButton} onClick={() => setShowMenu(false)}>Update Profile</Link>
          <Link href="/user/myads" className={styles.menuButton} onClick={() => setShowMenu(false)}>My Ads</Link>
          <Link href="/user/news" className={styles.menuButton} onClick={() => setShowMenu(false)}>Post Highlights</Link>
          <Link href="/user/adPage" className={styles.menuButton} onClick={() => setShowMenu(false)}>Post Advert</Link>
          <Link href="/user/monetize" className={styles.menuButton} onClick={() => setShowMenu(false)}>Monetize Account</Link>
          <Link href="/user/logout" className={styles.menuButton} onClick={() => setShowMenu(false)}>Logout</Link>
          <Link href="/user/deactivate" className={styles.menuButtonDanger} onClick={() => setShowMenu(false)}>Deactivate Account</Link>
        </div>
      )}
    </div>
  );
}

