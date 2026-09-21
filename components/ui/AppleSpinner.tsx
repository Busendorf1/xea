"use client";

import React from "react";
import styles from "./AppleSpinner.module.css";

export default function AppleSpinner({ size = 36, color }: { size?: number; color?: string }) {
  return (
    <div className={styles.spinnerContainer}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 38 38"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.spinnerSvg}
      >
        <defs>
          <linearGradient x1="8.042%" y1="0%" x2="65.682%" y2="23.865%" id="appleSpinnerGrad">
            <stop stopColor={color || "var(--primary, #2563eb)"} stopOpacity="0" offset="0%" />
            <stop stopColor={color || "var(--primary, #2563eb)"} stopOpacity=".631" offset="63.14%" />
            <stop stopColor={color || "var(--primary, #2563eb)"} offset="100%" />
          </linearGradient>
        </defs>
        <g fill="none" fillRule="evenodd">
          <g transform="translate(1 1)">
            <path
              d="M36 18c0-9.94-8.06-18-18-18"
              id="Oval-2"
              stroke="url(#appleSpinnerGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle fill={color || "var(--primary, #2563eb)"} cx="36" cy="18" r="2" />
          </g>
        </g>
      </svg>
    </div>
  );
}
