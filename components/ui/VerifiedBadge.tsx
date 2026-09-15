import React from "react";

interface VerifiedBadgeProps {
  size?: number;
  color?: string; // fill color of the rosette, default #d4af37 (Gold)
  checkColor?: string; // checkmark stroke color, default #ffffff
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * Standard 16-point scalloped / zig-zag circular rosette verification badge.
 * Used consistently across user profile, ad card business info modal, and monetization indicators.
 */
export default function VerifiedBadge({
  size = 18,
  color = "#d4af37",
  checkColor = "#ffffff",
  className = "",
  style = {},
  title = "Verified",
}: VerifiedBadgeProps) {
  return (
    <span
      className={className}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        flexShrink: 0,
        verticalAlign: "middle",
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={title}
      >
        <path
          d="M12 1.5L13.68 3.57L16.02 2.3L16.78 4.85L19.42 4.58L19.15 7.22L21.7 7.98L20.43 10.32L22.5 12L20.43 13.68L21.7 16.02L19.15 16.78L19.42 19.42L16.78 19.15L16.02 21.7L13.68 20.43L12 22.5L10.32 20.43L7.98 21.7L7.22 19.15L4.58 19.42L4.85 16.78L2.3 16.02L3.57 13.68L1.5 12L3.57 10.32L2.3 7.98L4.85 7.22L4.58 4.58L7.22 4.85L7.98 2.3L10.32 3.57Z"
          fill={color}
        />
        <path
          d="M8.8 12.4L11 14.6L15.6 9.6"
          stroke={checkColor}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
