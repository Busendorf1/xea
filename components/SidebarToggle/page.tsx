'use client';

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react"; // Optional: Replace with any SVG/icon

import styles from "../SidebarToggle/page.module.css";

export default function SidebarMenu() {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <aside className={styles.leftSidebar}>
      <div className={styles.settingsToggle}>
        <button onClick={() => setShowMenu(!showMenu)} className={styles.toggleBtn}>
          <Settings size={20} />
        </button>
        <h3 className={styles.menuTitle}>Account Menu</h3>
      </div>
      {showMenu && (
        <div className={styles.menuButtonGroup}>
          <Link href="/user/profile" className={styles.menuButton}>Update Profile</Link>
          <Link href="/user/myads" className={styles.menuButton}>My Ads</Link>
          <Link href="/user/news" className={styles.menuButton}>Post Highlights</Link>
          <Link href="/user/adPage" className={styles.menuButton}>Post Advert</Link>
          <Link href="/user/monetize" className={styles.menuButton}>Monetize Account</Link>
          <Link href="/user/logout" className={styles.menuButton}>Logout</Link>
          <Link href="/user/deactivate" className={styles.menuButtonDanger}>Deactivate Account</Link>
        </div>
      )}
    </aside>
  );
}
