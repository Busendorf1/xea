"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "../HeaderJoin/page.module.css";
import { useTheme } from "../ThemeProvider";
import { Sun, Moon } from "lucide-react";
import SidebarMenu from "../SidebarToggle/page";

export default function HeaderJoin() {
  const [menuActive, setMenuActive] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [showHeader, setShowHeader] = useState(true);
  const headerRef = useRef<HTMLHeadingElement>(null);

  // Close hamburger dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
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

  // Detect screen size and scroll position to hide header banner on mobile scroll down
  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= 991);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    let lastScrollPos = 0;
    const handleScroll = () => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile) {
        setShowHeader(true);
        return;
      }
      const currentScroll = window.scrollY;
      if (currentScroll > lastScrollPos && currentScroll > 25) {
        setShowHeader(false);
      } else if (currentScroll < lastScrollPos || currentScroll <= 15) {
        setShowHeader(true);
      }
      lastScrollPos = currentScroll;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

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
          console.log("Captured and decoded sharedAdId (HeaderJoin) from Earn Ads by Paayh / blurb:", decodedId);
        } catch (e) {
          console.error("Failed to decode parameter:", e);
        }
      } else if (adId) {
        localStorage.setItem("sharedAdId", adId);
        console.log("Captured sharedAdId (HeaderJoin):", adId);
      }
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const toggleMenu = () => {
    if (isSmallScreen) {
      setMenuActive((prev) => !prev);
    }
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
          {theme === "white" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    );
  };

  return (
    <header ref={headerRef} className={`${styles.header} ${showHeader ? "" : styles.headerHidden}`}>
      <Link href={"/"}>
        <div className={styles.name}>
          <p className={styles.baggyt}>Paayh</p>
          <span className={styles.bag}>Your feeds are ads</span>
        </div>
      </Link>
      {isSmallScreen ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", order: 3 }}>
            {renderThemeSwitcher()}
            <SidebarMenu />
            <div className={styles.menu}>
              <div
                className={styles.hamburger}
                onClick={toggleMenu}
              >
                <div className={styles.bar}></div>
                <div className={styles.bar}></div>
                <div className={styles.bar}></div>
              </div>
            </div>
          </div>
          <div
            className={`${styles.end} ${
              menuActive ? styles.showMenu : ""
            }`}
            style={{ order: 4 }}
          >
            <div className={styles.create}>
              <Link href={"/"} onClick={() => setMenuActive(false)}>Home</Link>
            </div>
            <div className={styles.create}>
              <Link href={"/../privacy"} onClick={() => setMenuActive(false)}>Policies</Link>
            </div>
            <div className={styles.create}>
              <Link href={"/../faq"} onClick={() => setMenuActive(false)}>Faq</Link>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.end}>
          <div className={styles.create}>
            <Link href={"/"}>Home</Link>
          </div>
          <div className={styles.create}>
            <Link href={"/../privacy"}>Policies</Link>
          </div>
          <div className={styles.create}>
            <Link href={"/../faq"}>Faq</Link>
          </div>
          <SidebarMenu />
          {renderThemeSwitcher()}
        </div>
      )}
    </header>
  );
}





