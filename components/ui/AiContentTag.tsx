"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./AiContentTag.module.css";

interface AiContentTagProps {
  className?: string;
  placement?: "top" | "bottom";
}

export default function AiContentTag({ className, placement = "top" }: AiContentTagProps) {
  const [hovered, setHovered] = useState(false);
  const [clickedOpen, setClickedOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  const isVisible = hovered || clickedOpen;

  useEffect(() => {
    if (!clickedOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setClickedOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClickedOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [clickedOpen]);

  return (
    <span
      ref={wrapperRef}
      className={styles.wrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`${styles.badgeButton}${className ? ` ${className}` : ""}`}
        aria-label="Content made with AI"
        aria-expanded={clickedOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setClickedOpen((prev) => !prev);
        }}
      >
        AI
      </button>
      {isVisible && (
        <span
          role="tooltip"
          className={`${styles.tooltip}${placement === "bottom" ? ` ${styles.tooltipBelow}` : ""}`}
        >
          Content made with AI
        </span>
      )}
    </span>
  );
}
