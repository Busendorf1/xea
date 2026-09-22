"use client";

import React, { useEffect, useRef } from "react";
import styles from "./backgrounds.module.css";

export default function DotMatrixBackground() {
  const flashlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!flashlightRef.current) return;
      flashlightRef.current.style.setProperty("--mouse-x", `${e.clientX}px`);
      flashlightRef.current.style.setProperty("--mouse-y", `${e.clientY}px`);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div className={styles.backgroundLayer} aria-hidden="true">
      <div className={styles.dotMatrix} />
      <div ref={flashlightRef} className={styles.flashlight} />
    </div>
  );
}
