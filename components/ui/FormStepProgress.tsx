"use client";

import React from "react";
import styles from "./FormStepProgress.module.css";

export interface FormStepProgressProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export default function FormStepProgress({
  steps,
  currentStep,
  onStepClick,
  className = "",
}: FormStepProgressProps) {
  return (
    <nav
      className={`${styles.progressContainer} ${className}`}
      aria-label="Progress tracker"
    >
      {steps.map((label, idx) => {
        const isActive = idx === currentStep;
        const isCompleted = idx < currentStep;
        const isClickable = isCompleted && typeof onStepClick === "function";

        return (
          <div
            key={label}
            className={`${styles.progressStep} ${
              isActive ? styles.activeStep : isCompleted ? styles.completedStep : ""
            } ${isClickable ? styles.clickableStep : ""}`}
            onClick={() => {
              if (isClickable) {
                onStepClick(idx);
              }
            }}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onStepClick(idx);
              }
            }}
            aria-current={isActive ? "step" : undefined}
            title={label}
          >
            <div className={styles.stepNumber}>
              {isCompleted ? "✓" : idx + 1}
            </div>
            <span className={styles.stepLabel}>{label}</span>
            {idx < steps.length - 1 && <div className={styles.stepLine} />}
          </div>
        );
      })}
    </nav>
  );
}
