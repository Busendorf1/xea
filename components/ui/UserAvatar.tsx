"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

export function DefaultAvatarPlaceholder({
  size = 40,
  className = "",
  style = {},
  gender,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  gender?: string | null;
}) {
  const normalizedGender = gender ? gender.trim().toLowerCase() : "";
  const isMale = normalizedGender === "male" || normalizedGender === "m";
  const isFemale = normalizedGender === "female" || normalizedGender === "f";

  // Male: Gentle slate blue tone
  // Female: Gentle warm rose tone
  // Neutral: Subtle neutral slate surface with crisp, visible silhouette
  const bg = isMale
    ? "rgba(59, 130, 246, 0.16)"
    : isFemale
    ? "rgba(244, 63, 94, 0.16)"
    : "rgba(148, 163, 184, 0.22)";

  const ink = isMale
    ? "#2563eb"
    : isFemale
    ? "#e11d48"
    : "var(--text-muted, #64748b)";

  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    aspectRatio: "1 / 1",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: bg,
    color: ink,
    overflow: "hidden",
    boxSizing: "border-box",
    ...style,
  };

  if (isMale) {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={baseStyle}
        aria-label="Male profile placeholder"
      >
        <circle cx="50" cy="50" r="50" style={{ fill: bg }} />
        {/* Male head */}
        <circle cx="50" cy="38" r="16" style={{ fill: ink, fillOpacity: 0.88 }} />
        {/* Short cropped hair */}
        <path
          d="M34 38c0-9 7.2-16.5 16-16.5s16 7.5 16 16.5c-3-2.5-7.5-4-16-4s-13 1.5-16 4z"
          style={{ fill: ink }}
        />
        {/* Male shoulders */}
        <path
          d="M50 60c-18 0-33 9.5-35.5 22.5 5 10 18 17.5 35.5 17.5s30.5-7.5 35.5-17.5C83 69.5 68 60 50 60z"
          style={{ fill: ink, fillOpacity: 0.88 }}
        />
      </svg>
    );
  }

  if (isFemale) {
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={baseStyle}
        aria-label="Female profile placeholder"
      >
        <circle cx="50" cy="50" r="50" style={{ fill: bg }} />
        {/* Soft flowing hair silhouette */}
        <path
          d="M31 40c0-11 8.5-20 19-20s19 9 19 20c0 14-3.5 24-7 27-2-6-4.5-9-12-9s-10 3-12 9c-3.5-3-7-13-7-27z"
          style={{ fill: ink, fillOpacity: 0.95 }}
        />
        {/* Female face/head */}
        <circle cx="50" cy="39" r="12" style={{ fill: bg }} />
        <circle cx="50" cy="39" r="10.5" style={{ fill: ink, fillOpacity: 0.85 }} />
        {/* Female graceful shoulders */}
        <path
          d="M50 62c-15 0-27.5 8-31.5 19 5.5 11 17.5 19 31.5 19s26-8 31.5-19C77.5 70 65 62 50 62z"
          style={{ fill: ink, fillOpacity: 0.88 }}
        />
      </svg>
    );
  }

  // Neutral / default placeholder
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={baseStyle}
      aria-label="Profile placeholder"
    >
      <circle cx="50" cy="50" r="50" style={{ fill: bg }} />
      <circle cx="50" cy="38" r="17" style={{ fill: ink, fillOpacity: 0.82 }} />
      <path
        d="M50 61c-17 0-31 9.5-34 22 4.5 10 16.5 17 34 17s29.5-7 34-17c-3-12.5-17-22-34-22z"
        style={{ fill: ink, fillOpacity: 0.82 }}
      />
    </svg>
  );
}

export const DEFAULT_AVATAR_SVG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzFlMjkzYiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzgiIHI9IjE4IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTUwIDYyYy0xOCAwLTMyIDEwLTM0IDIyIDQgMTAgMTYgMTYgMzQgMTZzMzAtNiAzNC0xNmMtMi0xMi0xNi0yMi0zNC0yMnoiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4=";

import { isDefaultProviderAvatar } from "@/lib/utils/avatar";

export { isDefaultProviderAvatar };

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
  gender?: string | null;
}

export default function UserAvatar({
  src,
  alt = "User Profile",
  size = 40,
  className = "",
  style = {},
  fallbackText,
  gender,
}: UserAvatarProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  const isValidSrc =
    !error &&
    src &&
    typeof src === "string" &&
    !isDefaultProviderAvatar(src);

  if (!isValidSrc) {
    return (
      <DefaultAvatarPlaceholder
        size={size}
        className={className}
        style={style}
        gender={gender}
      />
    );
  }

  return (
    <Image
      src={src!}
      alt={alt}
      className={className}
      width={size}
      height={size}
      unoptimized
      onError={() => setError(true)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
        aspectRatio: "1 / 1",
        borderRadius: "50%",
        objectFit: "cover",
        display: "block",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
