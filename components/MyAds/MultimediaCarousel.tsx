"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Video, Image as ImageIcon, Megaphone, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./page.module.css";

interface MultimediaCarouselProps {
  rawMedia?: string | null;
  adMediaType?: string | null;
}

export default function MultimediaCarousel({ rawMedia, adMediaType }: MultimediaCarouselProps) {
  const [mounted, setMounted] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [isClosingFullscreen, setIsClosingFullscreen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const closeFullscreen = useCallback(() => {
    if (isClosingFullscreen) return;
    setIsClosingFullscreen(true);
    setTimeout(() => {
      setFullscreenIndex(null);
      setIsClosingFullscreen(false);
    }, 220);
  }, [isClosingFullscreen]);

  const openFullscreen = useCallback((index: number) => {
    setIsClosingFullscreen(false);
    setFullscreenIndex(index);
  }, []);

  useEffect(() => {
    if (fullscreenIndex === null) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFullscreen();
      } else if (e.key === "ArrowLeft" && mediaList.length > 1) {
        setFullscreenIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      } else if (e.key === "ArrowRight" && mediaList.length > 1) {
        setFullscreenIndex((prev) => (prev !== null ? Math.min(mediaList.length - 1, prev + 1) : null));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenIndex, mediaList.length, closeFullscreen]);

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
    <>
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
                <div
                  key={idx}
                  className={styles.carouselSlide}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openFullscreen(idx);
                  }}
                  style={{ cursor: "zoom-in" }}
                  title="Click to view full screen"
                >
                  {isVid ? (
                    <div
                      style={{ width: "100%", height: "100%", position: "relative", cursor: "zoom-in" }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openFullscreen(idx);
                      }}
                    >
                      <video
                        src={url}
                        muted
                        playsInline
                        preload="metadata"
                        className={styles.mediaVideo}
                        style={{ pointerEvents: "none", width: "100%", height: "100%", objectFit: "cover" }}
                        onError={() => setImgError(true)}
                      />
                    </div>
                  ) : (
                    <img
                      src={url}
                      alt={`Slide ${idx + 1}`}
                      className={styles.adImgElement}
                      draggable={false}
                      style={{ cursor: "zoom-in", userSelect: "none" }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openFullscreen(idx);
                      }}
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

      {/* Fullscreen Media Modal: Modal on Desktop, Full-Screen on Mobile, NO CTAs at the bottom */}
      {mounted &&
        fullscreenIndex !== null &&
        mediaList[fullscreenIndex] &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`${styles.lightboxOverlay} ${isClosingFullscreen ? styles.lightboxOverlayExiting : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Full screen media preview"
            onClick={closeFullscreen}
          >
            <div
              className={`${styles.lightboxDialog} ${isClosingFullscreen ? styles.lightboxDialogExiting : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Bar: Back Button (Top Left) + Optional Slide Counter */}
              <div className={styles.lightboxTopBar}>
                <button
                  type="button"
                  className={styles.lightboxBackBtn}
                  onClick={closeFullscreen}
                  aria-label="Back"
                  title="Back"
                >
                  <ArrowLeft size={20} strokeWidth={2.2} />
                </button>

                {mediaList.length > 1 && (
                  <span className={styles.lightboxSlideCounter}>
                    {fullscreenIndex + 1} / {mediaList.length}
                  </span>
                )}

                {mediaList.length > 1 && <div className={styles.lightboxSpacer} />}
              </div>

              {/* Center Media Stage */}
              <div
                className={styles.lightboxStage}
                onTouchStart={(e) => {
                  if (mediaList.length > 1 && e.touches.length === 1) {
                    touchStartXRef.current = e.touches[0].clientX;
                  }
                }}
                onTouchEnd={(e) => {
                  if (
                    mediaList.length > 1 &&
                    touchStartXRef.current !== null &&
                    e.changedTouches.length > 0
                  ) {
                    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
                    touchStartXRef.current = null;
                    if (Math.abs(deltaX) > 45) {
                      if (deltaX < 0) {
                        setFullscreenIndex((prev) =>
                          prev !== null ? Math.min(mediaList.length - 1, prev + 1) : null
                        );
                      } else {
                        setFullscreenIndex((prev) =>
                          prev !== null ? Math.max(0, prev - 1) : null
                        );
                      }
                    }
                  }
                }}
              >
                {mediaList.length > 1 && fullscreenIndex > 0 && (
                  <button
                    type="button"
                    className={`${styles.lightboxNavArrow} ${styles.lightboxNavPrev}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
                    }}
                    aria-label="Previous media"
                  >
                    <ChevronLeft size={24} strokeWidth={2.5} />
                  </button>
                )}

                {(() => {
                  const activeUrl = mediaList[fullscreenIndex];
                  const isVid = adMediaType === "video" || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(activeUrl);
                  if (isVid) {
                    return (
                      <video
                        key={`myads-fs-${activeUrl}`}
                        src={activeUrl}
                        controls
                        autoPlay
                        playsInline
                        className={styles.lightboxMediaVideo}
                      />
                    );
                  }
                  return (
                    <img
                      key={`myads-fs-${activeUrl}`}
                      src={activeUrl}
                      alt={`Ad preview ${fullscreenIndex + 1}`}
                      className={styles.lightboxMediaImage}
                      draggable={false}
                    />
                  );
                })()}

                {mediaList.length > 1 && fullscreenIndex < mediaList.length - 1 && (
                  <button
                    type="button"
                    className={`${styles.lightboxNavArrow} ${styles.lightboxNavNext}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenIndex((prev) => (prev !== null ? Math.min(mediaList.length - 1, prev + 1) : null));
                    }}
                    aria-label="Next media"
                  >
                    <ChevronRight size={24} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
