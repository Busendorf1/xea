import React from "react";
import styles from "./Skeleton.module.css";

interface SkeletonProps {
  variant?: "text" | "title" | "avatar" | "rect";
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Skeleton({
  variant = "rect",
  width,
  height,
  className = "",
  style
}: SkeletonProps) {
  const customStyles: React.CSSProperties = {
    width,
    height,
    ...style
  };

  const skeletonClasses = [
    styles.skeleton,
    styles[variant],
    className
  ].filter(Boolean).join(" ");

  return <div className={skeletonClasses} style={customStyles} />;
}
