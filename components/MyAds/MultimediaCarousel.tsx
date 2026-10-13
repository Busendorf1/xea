"use client";

import React, { useState, useMemo } from "react";
import { Video, Image as ImageIcon, Megaphone } from "lucide-react";
import styles from "./page.module.css";

interface MultimediaCarouselProps {
  rawMedia?: string | null;
  adMediaType?: string | null;
}

export default function MultimediaCarousel({ rawMedia, adMediaType }: MultimediaCarouselProps) {
  const [imgError, setImgError] = useState(false);
  const mediaList = useMemo(() => {
    if (
      !rawMedia ||
      typeof rawMedia !== "string" ||
      rawMedia.trim() === "" ||
      rawMedia.toLowerCase() === "text" ||
      rawMedia.toLowerCase() === "null"
    ) {
      return [];
    }
    return rawMedia
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.toLowerCase() !== "text" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined");
  }, [rawMedia]);

  const [currentIndex, setCurrentIndex] = useState(0);

  if (mediaList.length === 0 || imgError) {
    return (
      <div className={styles.textOnlyBadge}>
        {adMediaType === "video" ? (
          <>
            <Video size={28} color="#1d9bf0" />
            <span className={styles.textCampaignLabel}>Video Ad</span>
          </>
        ) : adMediaType === "image" ? (
          <>
            <ImageIcon size={28} color="#1d9bf0" />
            <span className={styles.textCampaignLabel}>Image Ad</span>
          </>
        ) : (
          <>
            <Megaphone size={28} color="#1d9bf0" />
            <span className={styles.textCampaignLabel}>Text Campaign</span>
          </>
        )}
      </div>
    );
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < mediaList.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carouselWrapper}>
        <div
          className={styles.carouselTrack}
          style={{
            transform: `translate3d(calc(-${currentIndex} * (100% + 10px)), 0, 0)`,
          }}
        >
          {mediaList.map((url: string, idx: number) => {
            const isVid = adMediaType === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(url);
            return (
              <div key={idx} className={styles.carouselSlide}>
                {isVid ? (
                  <video
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className={styles.mediaVideo}
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <img
                    src={url}
                    alt={`Slide ${idx + 1}`}
                    className={styles.adImgElement}
                    onError={() => setImgError(true)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {mediaList.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className={`${styles.carouselBtn} ${styles.carouselBtnLeft}`}
                aria-label="Previous"
              >
                ‹
              </button>
            )}
            {currentIndex < mediaList.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className={`${styles.carouselBtn} ${styles.carouselBtnRight}`}
                aria-label="Next"
              >
                ›
              </button>
            )}
          </>
        )}
      </div>

      {mediaList.length > 1 && (
        <div className={styles.carouselDotsOutside}>
          {mediaList.map((_: string, idx: number) => (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`${styles.carouselDot} ${idx === currentIndex ? styles.carouselDotActive : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
