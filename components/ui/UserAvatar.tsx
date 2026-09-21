"use client";

import React from "react";
import Avatar, { AvatarProps } from "./Avatar";
import { getInitials, getAvatarColors, isDefaultProviderAvatar } from "@/lib/utils/avatar";

export { getInitials, getAvatarColors, isDefaultProviderAvatar, Avatar };
export type { AvatarProps };

export interface UserAvatarProps {
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
  return (
    <Avatar
      src={src}
      alt={alt}
      size={size}
      name={fallbackText}
      gender={gender}
      className={className}
      style={style}
    />
  );
}
