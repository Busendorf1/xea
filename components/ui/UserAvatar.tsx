"use client";

import React, { useState } from "react";

export const DEFAULT_AVATAR_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="%231e293b"/><circle cx="50" cy="38" r="18" fill="%2394a3b8"/><path d="M50 62c-18 0-32 10-34 22 4 10 16 16 34 16s30-6 34-16c-2-12-16-22-34-22z" fill="%2394a3b8"/></svg>`;

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
}

export default function UserAvatar({
  src,
  alt = "User Profile",
  size = 40,
  className = "",
  style = {},
  fallbackText,
}: UserAvatarProps) {
  const [error, setError] = useState(false);

  const isValidSrc =
    !error &&
    src &&
    typeof src === "string" &&
    src.trim() !== "" &&
    src !== "undefined" &&
    src !== "null" &&
    src !== "PLACEHOLDER";

  if (!isValidSrc) {
    if (fallbackText && fallbackText.trim().length > 0) {
      const initials = fallbackText.trim().slice(0, 2).toUpperCase();
      return (
        <div
          className={className}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            backgroundColor: "var(--primary, #1d9bf0)",
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: Math.max(12, Math.floor(size * 0.38)),
            userSelect: "none",
            flexShrink: 0,
            ...style,
          }}
        >
          {initials}
        </div>
      );
    }

    return (
      <img
        src={DEFAULT_AVATAR_SVG}
        alt={alt}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
