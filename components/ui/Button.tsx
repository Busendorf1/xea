import React from "react";
import styles from "./Button.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = "primary",
  isLoading = false,
  fullWidth = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const btnClasses = [
    styles.btn,
    styles[variant],
    isLoading ? styles.loading : "",
    fullWidth ? styles.fullWidth : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <button
      className={btnClasses}
      disabled={disabled || isLoading}
      {...props}
    >
      <span className={isLoading ? styles.hiddenText : ""}>{children}</span>
      {isLoading && (
        <span className={styles.spinnerWrapper}>
          <svg className={styles.spinner} viewBox="0 0 24 24">
            <circle
              className={styles.spinnerPath}
              cx="12"
              cy="12"
              r="10"
              fill="none"
              strokeWidth="3"
            />
          </svg>
        </span>
      )}
    </button>
  );
}
