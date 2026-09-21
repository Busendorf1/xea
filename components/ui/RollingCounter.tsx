"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "./RollingCounter.module.css";


interface RollingCounterProps {
  value: number;
  currencyPrefix?: string;
  durationMs?: number;
  className?: string;
  decimals?: number;
}

/**
 * High-Performance Hardware-Accelerated Rolling Digit Counter
 * Animates numbers upward smoothly with mechanical odometer easing.
 */
export default function RollingCounter({
  value,
  currencyPrefix = "₦",
  durationMs = 2400,
  className = "",
  decimals = 2,
}: RollingCounterProps) {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const startValRef = useRef<number>(0);
  const targetValRef = useRef<number>(value);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    startValRef.current = displayValue;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);

      // Spring-like ease out cubic curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startValRef.current + (value - startValRef.current) * easeOut;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [value, durationMs]);

  // Format with Nigerian locale comma separation
  const formattedNumber = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue);

  return (
    <span className={`${styles.counterWrapper} ${className}`.trim()}>
      <span className={styles.prefix}>{currencyPrefix}</span>
      <span>{formattedNumber}</span>
    </span>
  );
}
