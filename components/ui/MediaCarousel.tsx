import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import styles from "./AdCard.module.css";
import HlsVideoPlayer from "./HlsVideoPlayer";
import VideoControlBar from "./VideoControlBar";

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
  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(() => {
    if (firstUrl && mediaAspectRatioCache.has(firstUrl)) {
      return mediaAspectRatioCache.get(firstUrl)!;
    }
    return 16 / 9;
  });

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
                        if (firstUrl) mediaAspectRatioCache.set(firstUrl, clamped);
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
                        if (firstUrl) mediaAspectRatioCache.set(firstUrl, clamped);
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
