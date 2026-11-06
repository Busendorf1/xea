"use client";

import React from "react";
import MultimediaCarousel from "@/components/MyAds/MultimediaCarousel";
import styles from "./page.module.css";

export function AdminAdMediaBox({ adMedia, adMediaType }: { adMedia: string; adMediaType?: string }) {
  const mediaUrls = adMedia
    ? adMedia
        .split(",")
        .map((u) => u.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== "text" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined")
    : [];
  if (mediaUrls.length === 0) {
    return <div className={styles.adminCls_1}>Text Only Ad</div>;
  }

  return (
    <div className={styles.adminCls_2}>
      <MultimediaCarousel rawMedia={adMedia} adMediaType={adMediaType} />
    </div>
  );
}

export default AdminAdMediaBox;
