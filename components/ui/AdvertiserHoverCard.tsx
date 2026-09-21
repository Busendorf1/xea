"use client";

import React, { useState, useRef, ReactNode } from "react";
import styles from "./AdvertiserHoverCard.module.css";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen((prev) => !prev);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

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

  return (
    <div
      ref={wrapperRef}
      className={`${styles.hoverCardWrapper} ${isOpen ? styles.hoverCardWrapperOpen : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}

      {isOpen && (
        <div
          className={styles.hoverCardPopover}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Avatar and Names */}
          <div className={styles.popoverHeader}>
            <div className={styles.popoverAvatar}>
              <Avatar
                src={avatarSrc}
                name={displayName}
                email={profile?.email}
                size={48}
                alt={displayName}
                gender={profile?.gender}
              />
            </div>
            <div className={styles.popoverNames}>
              <div className={styles.popoverDisplayNameRow}>
                <span className={styles.popoverDisplayName}>{displayName}</span>
                {isVerified && (
                  <VerifiedBadge size={16} title="Verified Account" />
                )}
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
                  <MapPin size={13} />
                  <span>{locationText}</span>
                </div>
              )}
              {joinedText && (
                <div className={styles.metaItem}>
                  <Calendar size={13} />
                  <span>{joinedText}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
