"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./backgrounds.module.css";

const CROWN_MESSAGES = [
  // "Your Attention has value",
  // "Give your Attention to Brands",
  "Advertise your brand",
  "Boost your content",
  "Your first 10,000 reach is on us",
];

export default function FloatingBadgesBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [messageIndex, setMessageIndex] = useState<number>(0);
  const [isFading, setIsFading] = useState<boolean>(false);

  // Interval timer: show one message at a time at Crown 1 for 4 seconds, easing like butter
  useEffect(() => {
    const timer = setInterval(() => {
      // 1. Butter ease-off
      setIsFading(true);

      // 2. Switch message mid-fade when invisible
      setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % CROWN_MESSAGES.length);
        // 3. Butter ease-on
        setIsFading(false);
      }, 420);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  // Mouse parallax tracking
  useEffect(() => {
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let animId: number;

    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      targetX = (e.clientX - centerX) * 0.015;
      targetY = (e.clientY - centerY) * 0.015;
    };

    const animate = () => {
      currentX += (targetX - currentX) * 0.04;
      currentY += (targetY - currentY) * 0.04;
      if (containerRef.current) {
        containerRef.current.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
      animId = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  const currentMessage = CROWN_MESSAGES[messageIndex];

  return (
    <div className={styles.backgroundLayer} aria-hidden="true">
      <div ref={containerRef} className={styles.badgesWrapper}>
        {/* Center-Bottom Crown 1: One message at a time */}
        <div className={`${styles.crownWrapper} ${styles.crownSlot1}`}>
          <div
            className={`${styles.badge} ${
              isFading ? styles.crownFading : styles.crownVisible
            }`}
          >
            <span className={styles.badgeDot} />
            <span>{currentMessage}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
