"use client";

import React, { useState, useRef, ReactNode } from "react";
import styles from "./AdvertiserHoverCard.module.css";
import UserAvatar from "./UserAvatar";
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
      className={styles.hoverCardWrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
              <UserAvatar
                src={avatarSrc}
                fallbackText={displayName}
                size={48}
                alt={displayName}
              />
            </div>
            <div className={styles.popoverNames}>
              <div className={styles.popoverDisplayNameRow}>
                <span className={styles.popoverDisplayName}>{displayName}</span>
                {isVerified && (
                  <span className={styles.verifiedBadge} title="Verified Account">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.99-3.818-3.99-.48 0-.941.1-1.358.275C14.77 2.57 13.5 1.75 12 1.75s-2.77.82-3.412 2.035c-.417-.175-.878-.275-1.358-.275-2.108 0-3.818 1.78-3.818 3.99 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.71 3.99 3.818 3.99.48 0 .941-.1 1.358-.275C9.23 20.43 10.5 21.25 12 21.25s2.77-.82 3.412-2.035c.417.175.878.275 1.358.275 2.108 0 3.818-1.78 3.818-3.99 0-.495-.084-.965-.238-1.4 1.273-.65 2.148-2.02 2.148-3.6zm-12.72 3.39l-3.21-3.21 1.41-1.41 1.8 1.8 4.67-4.67 1.41 1.41-6.08 6.08z" />
                    </svg>
                  </span>
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
