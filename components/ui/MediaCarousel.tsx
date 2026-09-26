import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
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
  } catch (e) {}
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
    } catch (e) {}
  }
};

const MediaCarousel: React.FC<MediaCarouselProps> = ({
  adMedia,
  hlsUrl,
  isCardVisible,
  isPreloadWarm = true,
  isMuted,
  onToggleMute,
}) => {
  const [mediaError, setMediaError] = useState(false);
  const [playingStates, setPlayingStates] = useState<Record<number, boolean>>({});
  const [videoDurations, setVideoDurations] = useState<Record<number, number>>({});
  const [videoCurrentTimes, setVideoCurrentTimes] = useState<Record<number, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState<Record<number, boolean>>({});
  const hideControlsTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const firstImgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const formatVideoTime = useCallback((seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
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

  const toggleFullscreen = useCallback((index: number) => {
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
  }, []);

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
  // Default to 1.0 (standard 1:1 feed square) for images so they never start compressed in a 16:9 letterbox.
  // Videos fallback to 16:9.
  const fallbackRatio = isFirstVideo ? 16 / 9 : 1.0;

  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(() => {
    if (firstUrl && mediaAspectRatioCache.has(firstUrl)) {
      return mediaAspectRatioCache.get(firstUrl)!;
    }
    return fallbackRatio;
  });

  // Synchronously probe image/video to apply true aspect ratio on initial load without requiring a refresh
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

    // If DOM img element is already complete (from browser cache)
    if (firstImgRef.current && firstImgRef.current.complete) {
      if (applyRatio(firstImgRef.current.naturalWidth, firstImgRef.current.naturalHeight)) {
        return;
      }
    }

    // Pre-probe with new Image() to bypass React synthetic onLoad race conditions
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

  // Keep first video playing when card is in view
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (!video) return;
      if (isCardVisible) {
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
        video.pause();
        setPlayingStates((prev) => ({ ...prev, [idx]: false }));
      }
    });
  }, [isCardVisible, isMuted, showControlsTemporarily]);

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

  // Desktop mouse drag-to-scroll support without interfering with vertical feed scroll
  const isMouseDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || mediaUrls.length <= 1) return;
    isMouseDown.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDown.current || !containerRef.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isMouseDown.current = false;
  };

  if (mediaUrls.length === 0 || mediaError) return null;

  return (
    <div className={styles.carouselOuterWrapper}>
      <div
        ref={containerRef}
        className={styles.mediaRowContainer}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      >
        {mediaUrls.map((url, index) => {
          const isVideo = isVideoUrl(url) || (index === 0 && !!hlsUrl);
          const itemHlsSrc = url.includes(".m3u8") ? url : (index === 0 && hlsUrl ? hlsUrl : undefined);

          return (
            <div
              key={`${url}-${index}`}
              className={`${styles.mediaRowItem} ${mediaUrls.length === 1 ? styles.mediaRowItemSingle : styles.mediaRowItemMulti}`}
              style={{
                aspectRatio: `${baseAspectRatio}`,
              }}
            >
              {isVideo ? (
                <div
                  className={styles.webVideoContainer}
                  onClick={() => togglePlayVideo(index)}
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
                    autoPlay={isCardVisible && index === 0}
                    preload={isPreloadWarm ? "auto" : "metadata"}
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
                        setBaseAspectRatio(clamped);
                      }
                    }}
                    onDurationChange={(e) => {
                      const d = e.currentTarget.duration;
                      if (d && !isNaN(d)) {
                        setVideoDurations((prev) => ({ ...prev, [index]: d }));
                      }
                    }}
                  />

                  {/* Video Control Bar: duration display, pause/play, mute, fullscreen */}
                  <VideoControlBar
                    index={index}
                    isPlaying={playingStates[index] ?? (isCardVisible && index === 0)}
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
                  alt="Ad Media"
                  className={styles.adImgElement}
                  draggable={false}
                  loading={index === 0 ? "eager" : "lazy"}
                  onLoad={(e) => {
                    if (index === 0) {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        const rawRatio = img.naturalWidth / img.naturalHeight;
                        const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
                        if (firstUrl) saveRatioToCache(firstUrl, clamped);
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
