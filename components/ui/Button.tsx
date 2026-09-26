"use client";

import React, { ButtonHTMLAttributes } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import styles from "./Button.module.css";
import AppleSpinner from "./AppleSpinner";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof HTMLMotionProps<"button">> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "shimmer";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  shimmer?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  loading = false,
  shimmer = false,
  className = "",
  disabled = false,
  type = "button",
  onClick,
  ...props
}: ButtonProps) {
  const variantClass = styles[variant] || styles.primary;
  const sizeClass = styles[size] || styles.md;
  const isActuallyDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      className={`${styles.button} ${variantClass} ${sizeClass} ${shimmer ? styles.shimmerBtn : ""} ${className}`}
      disabled={isActuallyDisabled}
      onClick={onClick}
      whileTap={{ scale: isActuallyDisabled ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      {...(props as any)}
    >
      {/* Non-layout shifting loading overlay */}
      {loading && (
        <span className={styles.loadingOverlay}>
          <AppleSpinner
            size={size === "sm" ? 14 : size === "lg" ? 20 : 16}
            color={variant === "primary" ? "var(--background)" : "var(--primary)"}
          />
        </span>
      )}
      <span className={`${styles.contentWrapper} ${loading ? styles.contentHidden : ""}`}>
        {icon && <span className={styles.iconWrapper}>{icon}</span>}
        <span>{children}</span>
      </span>
      {shimmer && <span className={styles.shimmerSweep} />}
    </motion.button>
  );
}
