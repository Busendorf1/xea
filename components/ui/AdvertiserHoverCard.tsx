"use client";

import React, { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./AdvertiserHoverCard.module.css";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
import RoleStarBadges from "./RoleStarBadges";
import { Calendar, MapPin } from "lucide-react";

export interface AdvertiserProfileData {
  email?: string;
  business_name?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  profileImage?: string;
  bio?: string;
  location?: string;
  country?: string;
  monetized?: boolean;
  created_at?: string;
  gender?: string | null;
  is_career?: boolean;
  is_affiliate?: boolean;
  affiliate_role?: string | null;
}

interface AdvertiserHoverCardProps {
  children: ReactNode;
  profile?: AdvertiserProfileData | null;
  customName?: string;
  customHandle?: string;
  customLogo?: string;
  customBio?: string;
  isPlatformPost?: boolean;
}

export default function AdvertiserHoverCard({
  children,
  profile,
  customName,
  customHandle,
  customLogo,
  customBio,
  isPlatformPost = false,
}: AdvertiserHoverCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoZoomed, setIsLogoZoomed] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const zoomTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleAvatarMouseEnter = () => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      return;
    }
    if (zoomTimerRef.current) {
      clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }
    setIsLogoZoomed(true);
  };

  const handleAvatarMouseLeave = () => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      return;
    }
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => {
      setIsLogoZoomed(false);
    }, 90);
  };

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current || typeof window === "undefined") return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const popWidth = popoverRef.current?.offsetWidth || 236;
    const popHeight = popoverRef.current?.offsetHeight || 145;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 10;

    // Horizontal clamping so popover never overflows viewport
    let left = rect.left;
    if (left + popWidth > vw - margin) {
      left = Math.max(margin, vw - popWidth - margin);
    }
    if (left < margin) {
      left = margin;
    }

    // Vertical placement: prefer below, flip above if it would overflow bottom
    let top = rect.bottom + 6;
    if (top + popHeight > vh - margin) {
      const aboveTop = rect.top - popHeight - 6;
      top = aboveTop >= margin ? aboveTop : Math.max(margin, vh - popHeight - margin);
    }

    setCoords({ top, left });
  }, []);

  const handleMouseEnter = () => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsLogoZoomed(false);
    }, 180);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    updatePosition();
    setIsOpen((prev) => {
      if (prev) setIsLogoZoomed(false);
      return !prev;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        setIsOpen(false);
        setIsLogoZoomed(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick, { passive: true });
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Determine display values
  const displayName = (() => {
    if (customName && customName.trim() !== "") return customName.trim();
    if (profile?.business_name && profile.business_name.trim() !== "") return profile.business_name;
    if (profile?.firstName && profile.firstName.trim() !== "") {
      return `${profile.firstName} ${profile.lastName || ""}`.trim();
    }
    if (profile?.username && profile.username.trim() !== "") return profile.username;
    if (isPlatformPost) return "Paayh";
    return "Advertiser";
  })();

  const handleText = (() => {
    if (customHandle && customHandle.trim() !== "") {
      const clean = customHandle.trim().replace(/^@/, "");
      return `@${clean}`;
    }
    if (profile?.username && profile.username.trim() !== "") {
      return `@${profile.username.toLowerCase().replace(/\s+/g, "")}`;
    }
    if (profile?.firstName && profile.firstName.trim() !== "") {
      return `@${profile.firstName.toLowerCase().replace(/\s+/g, "")}`;
    }
    if (isPlatformPost) return "@paayh";
    return "@Sponsored";
  })();

  const avatarSrc = customLogo || profile?.profileImage || null;

  const bioText = (() => {
    if (customBio && customBio.trim() !== "") return customBio.trim();
    if (profile?.bio && profile.bio.trim() !== "") return profile.bio.trim();
    if (isPlatformPost) {
      return "The decentralized attention & reward network. Get paid for your attention on high-value campaigns.";
    }
    return "";
  })();

  const locationText = (() => {
    const parts = [profile?.location, profile?.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  })();

  const joinedText = (() => {
    if (profile?.created_at) {
      try {
        const d = new Date(profile.created_at);
        return `Joined ${d.toLocaleString("default", { month: "short", year: "numeric" })}`;
      } catch {}
    }
    return null;
  })();

  const isVerified = isPlatformPost || !!profile?.monetized;

  const popoverNode =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            className={styles.hoverCardPopover}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Expandable Logo inside the Modal (Hover on Desktop / Click on Mobile) */}
            <div className={styles.popoverHeader}>
              <div
                className={`${styles.popoverAvatar} ${isLogoZoomed ? styles.popoverAvatarZoomed : ""}`}
                onMouseEnter={handleAvatarMouseEnter}
                onMouseLeave={handleAvatarMouseLeave}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (zoomTimerRef.current) {
                    clearTimeout(zoomTimerRef.current);
                    zoomTimerRef.current = null;
                  }
                  setIsLogoZoomed((prev) => !prev);
                }}
                title="View logo"
                role="button"
                tabIndex={0}
              >
                <Avatar
                  src={avatarSrc}
                  name={displayName}
                  email={profile?.email}
                  size={88}
                  alt={displayName}
                  gender={profile?.gender}
                  shape="rounded-rect"
                  style={{
                    width: "100%",
                    height: "100%",
                    minWidth: "100%",
                    minHeight: "100%",
                    maxWidth: "100%",
                    maxHeight: "100%",
                  }}
                />
              </div>
              <div className={styles.popoverNames}>
                <div className={styles.popoverDisplayNameRow}>
                  <span className={styles.popoverDisplayName}>{displayName}</span>
                  {isVerified && <VerifiedBadge size={14} title="Verified Account" />}
                  <RoleStarBadges
                    email={profile?.email}
                    isCareer={profile?.is_career}
                    isAffiliate={profile?.is_affiliate}
                    affiliateRole={profile?.affiliate_role}
                    size={14}
                    variant="compact"
                  />
                </div>
                <div className={styles.popoverHandle}>{handleText}</div>
              </div>
            </div>

            {/* User Bio Section */}
            <div className={styles.popoverBio}>
              {bioText ? bioText : <span className={styles.emptyBio}>No bio provided.</span>}
            </div>

            {/* Metadata Footer */}
            {(locationText || joinedText) && (
              <div className={styles.popoverMetaRow}>
                {locationText && (
                  <div className={styles.metaItem}>
                    <MapPin size={12} />
                    <span>{locationText}</span>
                  </div>
                )}
                {joinedText && (
                  <div className={styles.metaItem}>
                    <Calendar size={12} />
                    <span>{joinedText}</span>
                  </div>
                )}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={wrapperRef}
      className={`${styles.hoverCardWrapper} ${isOpen ? styles.hoverCardWrapperOpen : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}
      {popoverNode}
    </div>
  );
}
