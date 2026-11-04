"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Video, Image as ImageIcon, Megaphone, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import FullscreenVideoPlayer from "./FullscreenVideoPlayer";
import AsymmetricMediaGrid from "@/components/ui/AsymmetricMediaGrid";
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
  const [fsSwipeOffsetY, setFsSwipeOffsetY] = useState(0);
  const [fsSwipeOffsetX, setFsSwipeOffsetX] = useState(0);

  const inlineContainerRef = useRef<HTMLDivElement | null>(null);
  const inlineSlideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inlineScrollRafRef = useRef<number | null>(null);
  const inlineStartXRef = useRef<number>(0);
  const inlineScrollLeftRef = useRef<number>(0);
  const inlinePointerDownRef = useRef(false);
  const inlineDraggedRef = useRef(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const fsPointerDownRef = useRef(false);
  const fsSwipeAxisRef = useRef<"x" | "y" | null>(null);
  const fsWheelCooldownRef = useRef<number>(0);

  const closeFullscreen = useCallback(() => {
    if (isClosingFullscreen) return;
    setIsClosingFullscreen(true);
    setTimeout(() => {
      setFullscreenIndex(null);
      setIsClosingFullscreen(false);
      setFsSwipeOffsetY(0);
      setFsSwipeOffsetX(0);
    }, 220);
  }, [isClosingFullscreen]);

  const openFullscreen = useCallback((index: number) => {
    setIsClosingFullscreen(false);
    setFsSwipeOffsetY(0);
    setFsSwipeOffsetX(0);
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

  const scrollToInlineSlide = (targetIdx: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const clampedIdx = Math.max(0, Math.min(mediaList.length - 1, targetIdx));
    const container = inlineContainerRef.current;
    const slide = inlineSlideRefs.current[clampedIdx];
    if (!container || !slide) return;

    let targetLeft = 0;
    if (clampedIdx === 0) {
      targetLeft = 0;
    } else if (clampedIdx === mediaList.length - 1) {
      targetLeft = container.scrollWidth - container.clientWidth;
    } else {
      targetLeft = slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2;
    }
    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: "smooth",
    });
    setCurrentIndex(clampedIdx);
  };

  const handleInlineScroll = () => {
    if (mediaList.length <= 1 || inlineScrollRafRef.current !== null) return;
    inlineScrollRafRef.current = requestAnimationFrame(() => {
      inlineScrollRafRef.current = null;
      const container = inlineContainerRef.current;
      if (!container) return;
      const center = container.scrollLeft + container.clientWidth / 2;
      let closestIdx = 0;
      let minDist = Infinity;
      inlineSlideRefs.current.forEach((slide, idx) => {
        if (!slide) return;
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const dist = Math.abs(center - slideCenter);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      });
      setCurrentIndex((prev) => (prev === closestIdx ? prev : closestIdx));
    });
  };

  const handleInlineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    inlineDraggedRef.current = false;
    if (!inlineContainerRef.current || mediaList.length <= 1) return;
    inlinePointerDownRef.current = true;
    inlineStartXRef.current = e.clientX;
    inlineScrollLeftRef.current = inlineContainerRef.current.scrollLeft;
  };

  const handleInlineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!inlinePointerDownRef.current || !inlineContainerRef.current) return;
    const dx = e.clientX - inlineStartXRef.current;
    if (Math.abs(dx) > 8) {
      inlineDraggedRef.current = true;
      inlineContainerRef.current.style.scrollSnapType = "none";
      inlineContainerRef.current.scrollLeft = inlineScrollLeftRef.current - dx;
    }
  };

  const handleInlineMouseUpOrLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!inlinePointerDownRef.current) return;
    inlinePointerDownRef.current = false;
    if (inlineContainerRef.current) {
      inlineContainerRef.current.style.scrollSnapType = "x mandatory";
    }
    if (inlineDraggedRef.current && mediaList.length > 1) {
      const dx = e.clientX - inlineStartXRef.current;
      if (Math.abs(dx) > 28) {
        const nextIdx = dx < 0 ? currentIndex + 1 : currentIndex - 1;
        scrollToInlineSlide(nextIdx);
      } else {
        scrollToInlineSlide(currentIndex);
      }
      setTimeout(() => {
        inlineDraggedRef.current = false;
      }, 40);
    }
  };

  const renderSlideMedia = (url: string, idx: number) => {
    const isVid =
      (adMediaType === "video" && mediaList.length === 1) ||
      /\.(mp4|webm|mov|avi|mkv|3gp|m3u8)$/i.test(url.split("?")[0]);
    const isActiveSlide = idx === currentIndex && fullscreenIndex === null;

    if (isVid) {
      return (
        <div
          style={{ width: "100%", height: "100%", position: "relative", cursor: "zoom-in" }}
        >
          <video
            ref={(el) => {
              if (!el) return;
              el.muted = true;
              el.defaultMuted = true;
              if (isActiveSlide) {
                el.play().catch(() => {});
              } else if (!el.paused) {
                el.pause();
              }
            }}
            src={url}
            autoPlay={isActiveSlide}
            loop
            muted
            playsInline
            controls={false}
            preload="metadata"
            className={styles.mediaVideo}
            style={{ pointerEvents: "none", width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
        </div>
      );
    }

    return (
      <img
        src={url}
        alt={`Slide ${idx + 1}`}
        className={styles.adImgElement}
        draggable={false}
        style={{ cursor: "zoom-in", userSelect: "none", width: "100%", height: "100%", objectFit: "cover" }}
        onError={() => setImgError(true)}
      />
    );
  };

  return (
    <>
      <div className={styles.carouselContainer} style={{ position: "relative" }}>
        {mediaList.length > 1 ? (
          <AsymmetricMediaGrid
            variant="compact"
            mediaUrls={mediaList}
            activeIndex={currentIndex}
            containerRef={inlineContainerRef}
            isVideoUrl={(u) => /\.(mp4|webm|mov|avi|mkv|3gp|m3u8)$/i.test(u.split("?")[0])}
            onScroll={handleInlineScroll}
            onMouseDown={handleInlineMouseDown}
            onMouseMove={handleInlineMouseMove}
            onMouseUpOrLeave={handleInlineMouseUpOrLeave}
            onScrollToSlide={scrollToInlineSlide}
            cellRefCallback={(idx, el) => {
              inlineSlideRefs.current[idx] = el;
            }}
            onCellClick={(idx, e) => {
              e.preventDefault();
              e.stopPropagation();
              if (inlineDraggedRef.current) return;
              openFullscreen(idx);
            }}
            renderCellContent={(cell) => renderSlideMedia(cell.url, cell.index)}
          />
        ) : (
          <div className={styles.carouselWrapper}>
            <div ref={inlineContainerRef} className={styles.carouselTrack}>
              <div
                ref={(el) => {
                  inlineSlideRefs.current[0] = el;
                }}
                className={`${styles.carouselSlide} ${styles.carouselSlideSingle}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openFullscreen(0);
                }}
                style={{ cursor: "zoom-in" }}
                title="Click to view full screen"
              >
                {renderSlideMedia(mediaList[0], 0)}
              </div>
            </div>
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
              {/* Top Bar: Back Button + Top-Left Off-White Line Indicator */}
              <div className={styles.lightboxTopBar}>
                <div className={styles.lightboxTopLeftGroup}>
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
                    <div
                      className={styles.lightboxLineIndicators}
                      aria-label={`Slide ${fullscreenIndex + 1} of ${mediaList.length}`}
                    >
                      {mediaList.map((_: string, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          className={`${styles.topLineSegment} ${
                            idx === fullscreenIndex ? styles.topLineSegmentActive : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullscreenIndex(idx);
                          }}
                          aria-label={`Slide ${idx + 1} of ${mediaList.length}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Center Media Stage with Smooth Horizontal Track & Vertical Swipe-to-Dismiss */}
              <div
                className={styles.lightboxStage}
                style={{
                  transform:
                    fsSwipeOffsetY !== 0
                      ? `translate3d(0, ${fsSwipeOffsetY}px, 0) scale(${Math.max(
                          0.86,
                          1 - Math.abs(fsSwipeOffsetY) / 900
                        )})`
                      : undefined,
                  opacity:
                    fsSwipeOffsetY !== 0 ? Math.max(0.35, 1 - Math.abs(fsSwipeOffsetY) / 380) : 1,
                  transition:
                    fsSwipeOffsetY === 0
                      ? "transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease"
                      : "none",
                }}
                onWheel={(e) => {
                  if (mediaList.length <= 1) return;
                  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 22) {
                    const now = Date.now();
                    if (now - fsWheelCooldownRef.current < 420) return;
                    fsWheelCooldownRef.current = now;
                    if (e.deltaX > 0) {
                      setFullscreenIndex((prev) =>
                        prev !== null ? Math.min(mediaList.length - 1, prev + 1) : null
                      );
                    } else {
                      setFullscreenIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
                    }
                  }
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    touchStartXRef.current = e.touches[0].clientX;
                    touchStartYRef.current = e.touches[0].clientY;
                    fsSwipeAxisRef.current = null;
                  }
                }}
                onTouchMove={(e) => {
                  if (
                    touchStartXRef.current !== null &&
                    touchStartYRef.current !== null &&
                    e.touches.length === 1
                  ) {
                    const dx = e.touches[0].clientX - touchStartXRef.current;
                    const dy = e.touches[0].clientY - touchStartYRef.current;
                    if (!fsSwipeAxisRef.current) {
                      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                        fsSwipeAxisRef.current =
                          Math.abs(dx) >= Math.abs(dy) && mediaList.length > 1 ? "x" : "y";
                      }
                    }
                    if (fsSwipeAxisRef.current === "x") {
                      const isAtEdge =
                        (fullscreenIndex === 0 && dx > 0) ||
                        (fullscreenIndex === mediaList.length - 1 && dx < 0);
                      setFsSwipeOffsetX(isAtEdge ? dx * 0.28 : dx);
                    } else if (fsSwipeAxisRef.current === "y" && Math.abs(dy) > 10) {
                      setFsSwipeOffsetY(dy);
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  if (
                    touchStartXRef.current !== null &&
                    touchStartYRef.current !== null &&
                    e.changedTouches.length > 0
                  ) {
                    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
                    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
                    const axis = fsSwipeAxisRef.current;
                    touchStartXRef.current = null;
                    touchStartYRef.current = null;
                    fsSwipeAxisRef.current = null;

                    if ((axis === "y" || (!axis && Math.abs(deltaY) > Math.abs(deltaX))) && Math.abs(deltaY) > 65) {
                      setFsSwipeOffsetX(0);
                      closeFullscreen();
                      return;
                    }
                    setFsSwipeOffsetY(0);
                    setFsSwipeOffsetX(0);

                    if (
                      mediaList.length > 1 &&
                      (axis === "x" || Math.abs(deltaX) >= Math.abs(deltaY)) &&
                      Math.abs(deltaX) > 36
                    ) {
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
                onMouseDown={(e) => {
                  fsPointerDownRef.current = true;
                  touchStartXRef.current = e.clientX;
                  touchStartYRef.current = e.clientY;
                  fsSwipeAxisRef.current = null;
                }}
                onMouseMove={(e) => {
                  if (
                    !fsPointerDownRef.current ||
                    touchStartXRef.current === null ||
                    touchStartYRef.current === null
                  ) {
                    return;
                  }
                  const dx = e.clientX - touchStartXRef.current;
                  const dy = e.clientY - touchStartYRef.current;
                  if (!fsSwipeAxisRef.current) {
                    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                      fsSwipeAxisRef.current =
                        Math.abs(dx) >= Math.abs(dy) && mediaList.length > 1 ? "x" : "y";
                    }
                  }
                  if (fsSwipeAxisRef.current === "x") {
                    const isAtEdge =
                      (fullscreenIndex === 0 && dx > 0) ||
                      (fullscreenIndex === mediaList.length - 1 && dx < 0);
                    setFsSwipeOffsetX(isAtEdge ? dx * 0.28 : dx);
                  } else if (fsSwipeAxisRef.current === "y" && Math.abs(dy) > 12) {
                    setFsSwipeOffsetY(dy);
                  }
                }}
                onMouseUp={(e) => {
                  if (
                    !fsPointerDownRef.current ||
                    touchStartXRef.current === null ||
                    touchStartYRef.current === null
                  ) {
                    return;
                  }
                  fsPointerDownRef.current = false;
                  const deltaX = e.clientX - touchStartXRef.current;
                  const deltaY = e.clientY - touchStartYRef.current;
                  const axis = fsSwipeAxisRef.current;
                  touchStartXRef.current = null;
                  touchStartYRef.current = null;
                  fsSwipeAxisRef.current = null;

                  if ((axis === "y" || (!axis && Math.abs(deltaY) > Math.abs(deltaX))) && Math.abs(deltaY) > 70) {
                    setFsSwipeOffsetX(0);
                    closeFullscreen();
                    return;
                  }
                  setFsSwipeOffsetY(0);
                  setFsSwipeOffsetX(0);

                  if (
                    mediaList.length > 1 &&
                    (axis === "x" || Math.abs(deltaX) >= Math.abs(deltaY)) &&
                    Math.abs(deltaX) > 40
                  ) {
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
                }}
                onMouseLeave={() => {
                  if (fsPointerDownRef.current) {
                    fsPointerDownRef.current = false;
                    touchStartXRef.current = null;
                    touchStartYRef.current = null;
                    fsSwipeAxisRef.current = null;
                    setFsSwipeOffsetY(0);
                    setFsSwipeOffsetX(0);
                  }
                }}
              >
                <div
                  className={styles.lightboxTrack}
                  style={{
                    transform: `translate3d(calc(${-fullscreenIndex * 100}% + ${fsSwipeOffsetX}px), 0, 0)`,
                    transition:
                      fsSwipeOffsetX === 0
                        ? "transform 0.44s cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                  }}
                >
                  {mediaList.map((url: string, idx: number) => {
                    const isSlideActive = idx === fullscreenIndex;
                    const isVid =
                      adMediaType === "video" ||
                      /\.(mp4|webm|mov|avi|mkv|3gp|m3u8)$/i.test(url.split("?")[0]);
                    return (
                      <div
                        key={`myads-fs-slide-${idx}-${url}`}
                        className={`${styles.lightboxSlide} ${
                          isSlideActive
                            ? styles.lightboxSlideActive
                            : styles.lightboxSlideInactive
                        }`}
                      >
                        {isVid ? (
                          <div
                            className={styles.lightboxVideoPlayerWrap}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FullscreenVideoPlayer
                              key={`myads-fs-${idx}-${url}`}
                              src={url}
                              autoPlay={isSlideActive}
                            />
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={`Ad preview ${idx + 1}`}
                            className={styles.lightboxMediaImage}
                            draggable={false}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
