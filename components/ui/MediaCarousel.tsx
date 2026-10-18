import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AppleSpinner from "@/components/ui/AppleSpinner";
import styles from "./AdCard.module.css";
import VideoControlBar from "./VideoControlBar";

const HlsVideoPlayer = dynamic(() => import("./HlsVideoPlayer"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--card-bg)" }}>
      <AppleSpinner size={28} />
    </div>
  ),
});

interface MediaCarouselProps {
  adMedia: string | null;
  hlsUrl?: string | null;
  isCardVisible: boolean;
  isPreloadWarm?: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onMediaClick?: (index: number) => void;
}

export const isVideoUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
  return (
    /\.(mp4|webm|mov|avi|m3u8|m4v|ogv|mkv)$/i.test(cleanUrl) ||
    url.includes("/video/upload/") ||
    url.includes("/ads_videos/") ||
    url.includes("/storage/v1/object/public/ads/video") ||
    url.includes(".m3u8")
  );
};

// Global in-memory aspect ratio cache to preserve exact media dimensions across virtual scroll recycling
const mediaAspectRatioCache = new Map<string, number>();

// Hydrate cache from sessionStorage on client
if (typeof window !== "undefined") {
  try {
    const saved = sessionStorage.getItem("xea_media_aspect_ratios");
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === "number" && !isNaN(v)) {
          mediaAspectRatioCache.set(k, v);
        }
      });
    }
  } catch {}
}

const saveRatioToCache = (url: string, ratio: number) => {
  if (!url || !ratio || isNaN(ratio)) return;
  mediaAspectRatioCache.set(url, ratio);
  if (typeof window !== "undefined") {
    try {
      const saved = sessionStorage.getItem("xea_media_aspect_ratios");
      const parsed = saved ? JSON.parse(saved) : {};
      parsed[url] = ratio;
      const keys = Object.keys(parsed);
      if (keys.length > 150) {
        delete parsed[keys[0]];
      }
      sessionStorage.setItem("xea_media_aspect_ratios", JSON.stringify(parsed));
    } catch {}
  }
};

const MediaCarousel: React.FC<MediaCarouselProps> = ({
  adMedia,
  hlsUrl,
  isCardVisible,
  isPreloadWarm = true,
  isMuted,
  onToggleMute,
  onMediaClick,
}) => {
  const [mediaError, setMediaError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingStates, setPlayingStates] = useState<Record<number, boolean>>({});
  const [videoDurations, setVideoDurations] = useState<Record<number, number>>({});
  const [videoCurrentTimes, setVideoCurrentTimes] = useState<Record<number, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState<Record<number, boolean>>({});
  const hideControlsTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const firstImgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  const formatVideoTime = useCallback((seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const showControlsTemporarily = useCallback((idx: number) => {
    setControlsVisible((prev) => ({ ...prev, [idx]: true }));
    if (hideControlsTimers.current[idx]) {
      clearTimeout(hideControlsTimers.current[idx]);
    }
    hideControlsTimers.current[idx] = setTimeout(() => {
      const video = videoRefs.current[idx];
      if (video && !video.paused) {
        setControlsVisible((prev) => ({ ...prev, [idx]: false }));
      }
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(hideControlsTimers.current).forEach((timer) => clearTimeout(timer));
      hideControlsTimers.current = {};
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const toggleFullscreen = useCallback((index: number) => {
    if (onMediaClick) {
      onMediaClick(index);
      return;
    }
    const video = videoRefs.current[index];
    if (!video) return;

    const isCurrentlyFS = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (isCurrentlyFS) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
      setIsFullscreen(false);
    } else {
      if (video.requestFullscreen) {
        video.requestFullscreen().catch(() => {
          if ((video as any).webkitEnterFullscreen) {
            (video as any).webkitEnterFullscreen();
            setIsFullscreen(true);
          }
        });
        setIsFullscreen(true);
      } else if ((video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
        setIsFullscreen(true);
      } else if ((video as any).msRequestFullscreen) {
        (video as any).msRequestFullscreen();
        setIsFullscreen(true);
      }
    }
  }, [onMediaClick]);

  useEffect(() => {
    const handleFSChange = () => {
      const isFS = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFS);
    };
    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("webkitfullscreenchange", handleFSChange);
    document.addEventListener("mozfullscreenchange", handleFSChange);
    document.addEventListener("MSFullscreenChange", handleFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
      document.removeEventListener("mozfullscreenchange", handleFSChange);
      document.removeEventListener("MSFullscreenChange", handleFSChange);
    };
  }, []);

  const mediaUrls = useMemo(() => {
    return adMedia
      ? adMedia.split(",").map((url) => url.trim()).filter(Boolean)
      : [];
  }, [adMedia]);

  const firstUrl = mediaUrls[0];
  const isFirstVideo = Boolean(
    firstUrl && (isVideoUrl(firstUrl) || firstUrl.includes(".m3u8") || !!hlsUrl)
  );
  const fallbackRatio = isFirstVideo ? 16 / 9 : 1.0;

  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(() => {
    if (firstUrl && mediaAspectRatioCache.has(firstUrl)) {
      return mediaAspectRatioCache.get(firstUrl)!;
    }
    return fallbackRatio;
  });

  useEffect(() => {
    if (!firstUrl) return;

    if (mediaAspectRatioCache.has(firstUrl)) {
      const cached = mediaAspectRatioCache.get(firstUrl)!;
      setBaseAspectRatio((prev) => (prev === cached ? prev : cached));
      return;
    }

    if (isFirstVideo) {
      const v = videoRefs.current[0];
      if (v && v.videoWidth && v.videoHeight) {
        const rawRatio = v.videoWidth / v.videoHeight;
        const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
        saveRatioToCache(firstUrl, clamped);
        setBaseAspectRatio(clamped);
      }
      return;
    }

    const applyRatio = (w: number, h: number) => {
      if (w > 0 && h > 0) {
        const rawRatio = w / h;
        const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
        saveRatioToCache(firstUrl, clamped);
        setBaseAspectRatio((prev) => (prev === clamped ? prev : clamped));
        return true;
      }
      return false;
    };

    if (firstImgRef.current && firstImgRef.current.complete) {
      if (applyRatio(firstImgRef.current.naturalWidth, firstImgRef.current.naturalHeight)) {
        return;
      }
    }

    const probe = new Image();
    probe.src = firstUrl;
    if (probe.complete) {
      applyRatio(probe.naturalWidth, probe.naturalHeight);
    } else {
      probe.onload = () => {
        applyRatio(probe.naturalWidth, probe.naturalHeight);
      };
    }
  }, [firstUrl, isFirstVideo]);

  // Only play the currently active slide's video when the card is visible; pause all non-active slides
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (!video) return;
      if (isCardVisible && idx === activeIndex) {
        video.muted = isMuted;
        video.defaultMuted = isMuted;
        const p = video.play();
        if (p !== undefined) {
          p.then(() => {
            setPlayingStates((prev) => ({ ...prev, [idx]: true }));
            showControlsTemporarily(idx);
          }).catch(() => {
            setPlayingStates((prev) => ({ ...prev, [idx]: false }));
          });
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
        setPlayingStates((prev) => (prev[idx] ? { ...prev, [idx]: false } : prev));
      }
    });
  }, [isCardVisible, activeIndex, isMuted, showControlsTemporarily]);

  const togglePlayVideo = useCallback((idx: number) => {
    const video = videoRefs.current[idx];
    if (!video) return;
    showControlsTemporarily(idx);
    if (video.paused) {
      video.muted = isMuted;
      video.play().then(() => {
        setPlayingStates((prev) => ({ ...prev, [idx]: true }));
      }).catch(() => {});
    } else {
      video.pause();
      setPlayingStates((prev) => ({ ...prev, [idx]: false }));
    }
  }, [isMuted, showControlsTemporarily]);

  // Track active slide index on horizontal scroll using requestAnimationFrame
  const handleCarouselScroll = useCallback(() => {
    if (mediaUrls.length <= 1 || scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = containerRef.current;
      if (!container) return;

      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closestIdx = 0;
      let minDistance = Infinity;

      slideRefs.current.forEach((slide, idx) => {
        if (!slide) return;
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const dist = Math.abs(containerCenter - slideCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      setActiveIndex((prev) => (prev === closestIdx ? prev : closestIdx));
    });
  }, [mediaUrls.length]);

  const scrollToSlide = useCallback(
    (targetIdx: number, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      const clampedIdx = Math.max(0, Math.min(mediaUrls.length - 1, targetIdx));
      const container = containerRef.current;
      const slide = slideRefs.current[clampedIdx];
      if (!container || !slide) return;

      const targetLeft = slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: "smooth",
      });
      setActiveIndex(clampedIdx);
    },
    [mediaUrls.length]
  );

  // Desktop mouse drag-to-scroll support without interfering with vertical feed scroll or click-to-open
  const isMouseDown = useRef(false);
  const dragMovedRef = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragMovedRef.current = false;
    if (!containerRef.current || mediaUrls.length <= 1) return;
    isMouseDown.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDown.current || !containerRef.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    if (Math.abs(x - startX.current) > 8) {
      dragMovedRef.current = true;
    }
    const walk = (x - startX.current) * 1.2;
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isMouseDown.current = false;
  };

  const handleItemActivate = useCallback(
    (index: number, e?: React.MouseEvent) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      if (e) {
        e.stopPropagation();
      }
      if (onMediaClick) {
        onMediaClick(index);
      }
    },
    [onMediaClick]
  );

  if (mediaUrls.length === 0 || mediaError) return null;

  const isMulti = mediaUrls.length > 1;

  return (
    <div className={styles.carouselOuterWrapper}>
      {isMulti && (
        <div className={styles.mediaBadge} aria-label={`Slide ${activeIndex + 1} of ${mediaUrls.length}`}>
          {activeIndex + 1} / {mediaUrls.length}
        </div>
      )}

      {isMulti && activeIndex > 0 && (
        <button
          type="button"
          className={`${styles.carouselNavBtn} ${styles.carouselNavBtnPrev}`}
          onClick={(e) => scrollToSlide(activeIndex - 1, e)}
          aria-label="Previous media"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
      )}

      {isMulti && activeIndex < mediaUrls.length - 1 && (
        <button
          type="button"
          className={`${styles.carouselNavBtn} ${styles.carouselNavBtnNext}`}
          onClick={(e) => scrollToSlide(activeIndex + 1, e)}
          aria-label="Next media"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      )}

      <div
        ref={containerRef}
        className={styles.mediaRowContainer}
        onScroll={isMulti ? handleCarouselScroll : undefined}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      >
        {mediaUrls.map((url, index) => {
          const isVideo = isVideoUrl(url) || (index === 0 && !!hlsUrl);
          const itemHlsSrc = url.includes(".m3u8") ? url : (index === 0 && hlsUrl ? hlsUrl : undefined);
          const shouldEagerLoad = index === 0 || index === activeIndex || index === activeIndex + 1;

          return (
            <div
              key={`${url}-${index}`}
              ref={(el) => {
                slideRefs.current[index] = el;
              }}
              className={`${styles.mediaRowItem} ${mediaUrls.length === 1 ? styles.mediaRowItemSingle : styles.mediaRowItemMulti}`}
              style={{
                aspectRatio: `${baseAspectRatio}`,
                cursor: onMediaClick ? "pointer" : undefined,
              }}
              onClick={(e) => handleItemActivate(index, e)}
            >
              {isVideo ? (
                <div
                  className={styles.webVideoContainer}
                  style={{ cursor: onMediaClick ? "pointer" : undefined }}
                  onClick={(e) => {
                    if (onMediaClick) {
                      handleItemActivate(index, e);
                    } else {
                      e.stopPropagation();
                      togglePlayVideo(index);
                    }
                  }}
                  onPointerMove={() => showControlsTemporarily(index)}
                  onTouchStart={() => showControlsTemporarily(index)}
                  onMouseEnter={() => showControlsTemporarily(index)}
                >
                  <HlsVideoPlayer
                    ref={(el) => {
                      if (el) {
                        videoRefs.current[index] = el;
                      } else {
                        delete videoRefs.current[index];
                      }
                    }}
                    key={url}
                    src={url}
                    hlsSrc={itemHlsSrc}
                    loop
                    playsInline
                    autoPlay={isCardVisible && index === activeIndex}
                    preload={isPreloadWarm && shouldEagerLoad ? "auto" : "metadata"}
                    muted={isMuted}
                    controls={false}
                    className={styles.mediaVideo}
                    onPlay={() => {
                      setPlayingStates((prev) => ({ ...prev, [index]: true }));
                      showControlsTemporarily(index);
                    }}
                    onPause={() => {
                      setPlayingStates((prev) => ({ ...prev, [index]: false }));
                      setControlsVisible((prev) => ({ ...prev, [index]: true }));
                    }}
                    onTimeUpdate={(e) => {
                      const cur = e.currentTarget.currentTime || 0;
                      setVideoCurrentTimes((prev) => {
                        if (Math.abs((prev[index] || 0) - cur) >= 0.5) {
                          return { ...prev, [index]: cur };
                        }
                        return prev;
                      });
                    }}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.duration && !isNaN(v.duration)) {
                        setVideoDurations((prev) => ({ ...prev, [index]: v.duration }));
                      }
                      if (index === 0 && v.videoWidth && v.videoHeight) {
                        const rawRatio = v.videoWidth / v.videoHeight;
                        const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
                        if (firstUrl) saveRatioToCache(firstUrl, clamped);
                        setBaseAspectRatio((prev) => (mediaAspectRatioCache.has(firstUrl) ? prev : clamped));
                      }
                    }}
                    onDurationChange={(e) => {
                      const d = e.currentTarget.duration;
                      if (d && !isNaN(d)) {
                        setVideoDurations((prev) => ({ ...prev, [index]: d }));
                      }
                    }}
                  />

                  <VideoControlBar
                    index={index}
                    isPlaying={playingStates[index] ?? (isCardVisible && index === activeIndex)}
                    isMuted={isMuted}
                    isFullscreen={isFullscreen}
                    showControls={controlsVisible[index] ?? true}
                    videoDuration={videoDurations[index] || 0}
                    videoCurrentTime={videoCurrentTimes[index] || 0}
                    onTogglePlay={() => togglePlayVideo(index)}
                    onToggleMute={onToggleMute}
                    onToggleFullscreen={toggleFullscreen}
                    formatVideoTime={formatVideoTime}
                  />
                </div>
              ) : (
                <img
                  ref={index === 0 ? firstImgRef : undefined}
                  src={url}
                  alt={`Ad media ${index + 1} of ${mediaUrls.length}`}
                  className={styles.adImgElement}
                  style={{ cursor: onMediaClick ? "zoom-in" : undefined }}
                  draggable={false}
                  loading={shouldEagerLoad ? "eager" : "lazy"}
                  decoding="async"
                  onClick={(e) => handleItemActivate(index, e)}
                  onLoad={(e) => {
                    if (index === 0 && firstUrl && !mediaAspectRatioCache.has(firstUrl)) {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        const rawRatio = img.naturalWidth / img.naturalHeight;
                        const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
                        saveRatioToCache(firstUrl, clamped);
                        setBaseAspectRatio(clamped);
                      }
                    }
                  }}
                  onError={() => {
                    if (mediaUrls.length === 1) setMediaError(true);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(MediaCarousel);
