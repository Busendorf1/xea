import React, { useRef, useState, useEffect } from "react";
import styles from "./Collapsible.module.css";

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function Collapsible({
  isOpen,
  children,
  className = ""
}: CollapsibleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string | number>(isOpen ? "none" : 0);

  useEffect(() => {
    if (!containerRef.current) return;
    if (isOpen) {
      const height = containerRef.current.scrollHeight;
      setMaxHeight(height);
      const timer = setTimeout(() => {
        setMaxHeight("none");
      }, 400);
      return () => clearTimeout(timer);
    } else {
      const height = containerRef.current.scrollHeight;
      setMaxHeight(height);
      const frame = requestAnimationFrame(() => {
        setMaxHeight(0);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  const classes = [
    styles.collapsible,
    isOpen ? styles.expanded : styles.collapsed,
    className
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={containerRef}
      className={classes}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
