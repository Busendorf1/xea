"use client";

import React, { useState, useEffect, useMemo } from "react";
import styles from "./Avatar.module.css";
import { isDefaultProviderAvatar } from "@/lib/utils/avatar";

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  gender?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  bordered?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function Avatar({
  src,
  name,
  size = 40,
  gender,
  alt,
  className = "",
  style = {},
  bordered = false,
  onClick,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  // Normalize image source URL
  const normalizedSrc = useMemo(() => {
    if (!src || typeof src !== "string") return "";
    let trimmed = src.trim();
    if (trimmed.startsWith("//")) {
      trimmed = `https:${trimmed}`;
    } else if (
      trimmed.startsWith("http://") &&
      !trimmed.includes("localhost") &&
      !trimmed.includes("127.0.0.1")
    ) {
      trimmed = trimmed.replace(/^http:\/\//, "https://");
    }
    return trimmed;
  }, [src]);

  // Determine if image source is genuine and valid
  const hasValidImage = useMemo(() => {
    if (imageFailed || !normalizedSrc) return false;
    return !isDefaultProviderAvatar(normalizedSrc);
  }, [imageFailed, normalizedSrc]);

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    maxWidth: `${size}px`,
    maxHeight: `${size}px`,
    ...style,
  };

  const containerClasses = `${styles.avatar} ${bordered ? styles.avatarBordered : ""} ${className}`.trim();

  // 1. Genuine manual image uploaded by user/advertiser
  if (hasValidImage) {
    return (
      <div className={containerClasses} style={containerStyle} onClick={onClick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={normalizedSrc}
          alt={alt || name || "Avatar"}
          className={styles.image}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  // 2. Default Silhouette Avatar (always shown when user has not set a photo/logo manually)
  const normalizedGender = gender ? gender.trim().toLowerCase() : "";
  const isMale = normalizedGender === "male" || normalizedGender === "m";
  const isFemale = normalizedGender === "female" || normalizedGender === "f";

  const silhouetteBg = isMale ? "#172554" : isFemale ? "#4c0519" : "#1e293b";
  const silhouetteInk = isMale ? "#60a5fa" : isFemale ? "#fb7185" : "#94a3b8";

  return (
    <div
      className={containerClasses}
      style={{
        ...containerStyle,
        backgroundColor: silhouetteBg,
      }}
      onClick={onClick}
      aria-label={alt || name || "Default avatar"}
      title={name || "Default avatar"}
    >
      <div className={styles.silhouetteWrapper}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.silhouetteSvg}
        >
          {isMale ? (
            <>
              <circle cx="50" cy="50" r="50" fill="rgba(37, 99, 235, 0.25)" />
              <circle cx="50" cy="38" r="16" fill={silhouetteInk} fillOpacity={0.92} />
              <path
                d="M34 38c0-9 7.2-16.5 16-16.5s16 7.5 16 16.5c-3-2.5-7.5-4-16-4s-13 1.5-16 4z"
                fill={silhouetteInk}
              />
              <path
                d="M50 60c-18 0-33 9.5-35.5 22.5 5 10 18 17.5 35.5 17.5s30.5-7.5 35.5-17.5C83 69.5 68 60 50 60z"
                fill={silhouetteInk}
                fillOpacity={0.92}
              />
            </>
          ) : isFemale ? (
            <>
              <circle cx="50" cy="50" r="50" fill="rgba(225, 29, 72, 0.25)" />
              <path
                d="M31 40c0-11 8.5-20 19-20s19 9 19 20c0 14-3.5 24-7 27-2-6-4.5-9-12-9s-10 3-12 9c-3.5-3-7-13-7-27z"
                fill={silhouetteInk}
                fillOpacity={0.95}
              />
              <circle cx="50" cy="39" r="12" fill="rgba(225, 29, 72, 0.25)" />
              <circle cx="50" cy="39" r="10.5" fill={silhouetteInk} fillOpacity={0.9} />
              <path
                d="M50 62c-15 0-27.5 8-31.5 19 5.5 11 17.5 19 31.5 19s26-8 31.5-19C77.5 70 65 62 50 62z"
                fill={silhouetteInk}
                fillOpacity={0.92}
              />
            </>
          ) : (
            <>
              <circle cx="50" cy="50" r="50" fill="rgba(100, 116, 139, 0.3)" />
              <circle cx="50" cy="38" r="17" fill={silhouetteInk} fillOpacity={0.9} />
              <path
                d="M50 61c-17 0-31 9.5-34 22 4.5 10 16.5 17 34 17s29.5-7 34-17c-3-12.5-17-22-34-22z"
                fill={silhouetteInk}
                fillOpacity={0.9}
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
