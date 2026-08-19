"use client";

import React, { useEffect, useState, useRef } from "react";

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
    const target = Math.max(0, Number(value) || 0);
    const start = displayValue;
    startValRef.current = start;
    targetValRef.current = target;
    startTimeRef.current = null;

    if (start === target) return;

    /**
     * Fashionable Luxury Deceleration Curve
     * Rolls smoothly with mechanical momentum, then dramatically slows down
     * at the last ending digits so you can watch each final number click into place.
     */
    const luxuryEaseOut = (t: number): number => {
      // 4.5 power quartic-quintic curve provides an ultra-satisfying ending glide
      return 1 - Math.pow(1 - t, 4.5);
    };

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      const easedProgress = luxuryEaseOut(progress);

      const current = startValRef.current + (targetValRef.current - startValRef.current) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValRef.current);
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
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.02em",
      }}
    >
      <span style={{ marginRight: "2px", opacity: 0.9 }}>{currencyPrefix}</span>
      <span>{formattedNumber}</span>
    </span>
  );
}
