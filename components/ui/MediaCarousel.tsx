import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Play } from "lucide-react";
import styles from "./AdCard.module.css";
import HlsVideoPlayer from "./HlsVideoPlayer";
import VideoControlBar from "./VideoControlBar";

interface MediaCarouselProps {
  adMedia: string | null;
  hlsUrl?: string | null;
  isCardVisible: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const isVideoUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
  return (
    /\.(mp4|webm|mov|avi|m3u8|m4v|ogv)$/i.test(cleanUrl) ||
    url.includes("/video/upload/") ||
    url.includes(".m3u8")
  );
};

const MediaCarousel: React.FC<MediaCarouselProps> = ({
  adMedia,
  hlsUrl,
  isCardVisible,
  isMuted,
  onToggleMute,
}) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const isSwiping = useRef<boolean>(false);
  const isScrollLocked = useRef<boolean>(false);
  const isDragging = useRef<boolean>(false);

  const rawMediaUrls = useMemo(() => {
    return adMedia
      ? adMedia.split(",").map((url) => url.trim()).filter(Boolean)
      : [];
  }, [adMedia]);

  const mediaUrls = React.useMemo(() => {
    return [...rawMediaUrls].sort((a, b) => {
      const aIsVideo = isVideoUrl(a);
      const bIsVideo = isVideoUrl(b);
      if (aIsVideo && !bIsVideo) return -1; // Videos come FIRST so they autoplay immediately in feed!
      if (!aIsVideo && bIsVideo) return 1;
      return 0;
    });
  }, [rawMediaUrls]);

  useEffect(() => {
    setMediaError(false);
  }, [currentMediaIndex]);

  // Helper to attempt playing a video safely when ready
  const attemptPlay = useCallback((idx: number) => {
    const video = videoRefs.current[idx];
    if (!video) return;

    video.muted = isMuted;
    video.defaultMuted = isMuted;
    
    const tryPlay = () => {
      video.muted = isMuted;
      video.defaultMuted = isMuted;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (idx === currentMediaIndex) {
              setIsPlaying(true);
              if (video.duration && !isNaN(video.duration)) {
                setVideoDuration(video.duration);
              }
            }
          })
          .catch((err) => {
            console.warn("⚠️ Autoplay attempt notice:", err);
            if (idx === currentMediaIndex) {
              setIsPlaying(false);
            }
          });
      }
    };

    if (video.readyState >= 2) {
      tryPlay();
    } else {
      const handleReady = () => {
        video.removeEventListener("canplay", handleReady);
        video.removeEventListener("loadeddata", handleReady);
        tryPlay();
      };
      video.addEventListener("canplay", handleReady);
      video.addEventListener("loadeddata", handleReady);
    }
  }, [currentMediaIndex, isMuted]);

  // Keep React isFullscreen state in sync with native fullscreen changes
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
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
    };
  }, []);

  // Robust Autoplay handler when card is in view or when swiped to
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (!video) return;
      if (idx === currentMediaIndex && isCardVisible) {
        attemptPlay(idx);
      } else {
        video.pause();
        if (idx === currentMediaIndex) {
          setIsPlaying(false);
        }
      }
    });
  }, [currentMediaIndex, isCardVisible, isMuted, attemptPlay]);

  const togglePlay = useCallback(() => {
    const activeVideo = videoRefs.current[currentMediaIndex];
    if (activeVideo) {
      if (activeVideo.paused) {
        activeVideo.muted = isMuted;
        activeVideo.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        activeVideo.pause();
        setIsPlaying(false);
      }
    }
  }, [currentMediaIndex, isMuted]);

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
          }
        });
        setIsFullscreen(true);
      } else if ((video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
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

  const formatVideoTime = useCallback((seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (mediaUrls.length <= 1) return;

    const targetEl = e.target as HTMLElement;
    if (
      targetEl.closest("button") ||
      targetEl.closest(`.${styles.videoControlBar}`) ||
      targetEl.closest(`.${styles.dotsContainer}`)
    ) {
      return;
    }

    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    isSwiping.current = false;
    isScrollLocked.current = false;
    isDragging.current = true;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }
  }, [mediaUrls.length]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || dragStartX.current === null || dragStartY.current === null) return;

    const deltaX = e.clientX - dragStartX.current;
    const deltaY = e.clientY - dragStartY.current;

    if (!isSwiping.current && !isScrollLocked.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) {
        isScrollLocked.current = true;
        return;
      }
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
        isSwiping.current = true;
      }
    }

    if (isScrollLocked.current) return;

    if (isSwiping.current && trackRef.current) {
      trackRef.current.style.transition = "none";
      const containerWidth = trackRef.current.offsetWidth || 1;
      let adjustedDeltaX = deltaX;
      if (
        (currentMediaIndex === 0 && deltaX > 0) ||
        (currentMediaIndex === mediaUrls.length - 1 && deltaX < 0)
      ) {
        adjustedDeltaX = deltaX * 0.25;
      }
      const basePercent = -currentMediaIndex * 100;
      const offsetPercent = (adjustedDeltaX / containerWidth) * 100;
      trackRef.current.style.transform = `translate3d(${basePercent + offsetPercent}%, 0, 0)`;
    }
  }, [currentMediaIndex, mediaUrls.length]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Fallback
    }

    if (isSwiping.current && dragStartX.current !== null && trackRef.current) {
      const deltaX = e.clientX - dragStartX.current;
      const threshold = 35;

      let targetIndex = currentMediaIndex;
      if (deltaX < -threshold && currentMediaIndex < mediaUrls.length - 1) {
        targetIndex = currentMediaIndex + 1;
      } else if (deltaX > threshold && currentMediaIndex > 0) {
        targetIndex = currentMediaIndex - 1;
      }

      trackRef.current.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      trackRef.current.style.transform = `translate3d(-${targetIndex * 100}%, 0, 0)`;

      if (targetIndex !== currentMediaIndex) {
        setCurrentMediaIndex(targetIndex);
      }
    } else if (trackRef.current) {
      trackRef.current.style.transition = "transform 0.2s ease-out";
      trackRef.current.style.transform = `translate3d(-${currentMediaIndex * 100}%, 0, 0)`;
    }

    dragStartX.current = null;
    dragStartY.current = null;
    isSwiping.current = false;
    isScrollLocked.current = false;
  }, [currentMediaIndex, mediaUrls.length]);

  if (mediaUrls.length === 0 || mediaError) return null;

  return (
    <div
      className={styles.mediaBox}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Media Counter Badge */}
      {mediaUrls.length > 1 && (
        <div className={styles.mediaBadge}>
          {currentMediaIndex + 1} / {mediaUrls.length}
        </div>
      )}

      <div
        ref={trackRef}
        className={styles.mediaTrack}
        style={{
          transform: `translate3d(-${currentMediaIndex * 100}%, 0, 0)`,
        }}
      >
        {mediaUrls.map((url, index) => {
          const isVideo = isVideoUrl(url) || (index === 0 && !!hlsUrl);
          return (
            <div key={index} className={styles.mediaWrapper}>
              {isVideo ? (
                <div className={styles.webVideoContainer} onClick={togglePlay} style={{ cursor: "pointer", position: "relative" }}>
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
                    hlsSrc={hlsUrl || (url.endsWith(".m3u8") ? url : undefined)}
                    loop
                    autoPlay={index === currentMediaIndex && isCardVisible}
                    muted={isMuted}
                    controls={false}
                    className={styles.mediaVideo}
                    onCanPlay={() => {
                      if (index === currentMediaIndex && isCardVisible) {
                        attemptPlay(index);
                      }
                    }}
                    onLoadedData={() => {
                      if (index === currentMediaIndex && isCardVisible) {
                        attemptPlay(index);
                      }
                    }}
                    onPlay={() => {
                      if (index === currentMediaIndex) setIsPlaying(true);
                    }}
                    onPause={() => {
                      if (index === currentMediaIndex) setIsPlaying(false);
                    }}
                    onTimeUpdate={(e) => {
                      if (index === currentMediaIndex) {
                        const cur = e.currentTarget.currentTime || 0;
                        if (Math.abs(cur - videoCurrentTime) >= 0.5) {
                          setVideoCurrentTime(cur);
                        }
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      if (e.currentTarget.duration && !isNaN(e.currentTarget.duration)) {
                        setVideoDuration(e.currentTarget.duration);
                      }
                    }}
                    onDurationChange={(e) => {
                      if (e.currentTarget.duration && !isNaN(e.currentTarget.duration)) {
                        setVideoDuration(e.currentTarget.duration);
                      }
                    }}
                  />

                  {/* Play Button Center Overlay when paused */}
                  {!isPlaying && index === currentMediaIndex && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        backgroundColor: "rgba(0, 0, 0, 0.55)",
                        borderRadius: "50%",
                        padding: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        zIndex: 10,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Play size={28} color="#ffffff" fill="#ffffff" style={{ marginLeft: "3px" }} />
                    </div>
                  )}

                  {/* Sleek Bottom Control Bar */}
                  <VideoControlBar
                    index={index}
                    isPlaying={isPlaying}
                    isMuted={isMuted}
                    isFullscreen={isFullscreen}
                    videoDuration={videoDuration}
                    videoCurrentTime={videoCurrentTime}
                    onTogglePlay={togglePlay}
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
                  onError={() => setMediaError(true)}
                />
              )}
            </div>
          );
        })}
      </div>

      {mediaUrls.length > 1 && (
        <div className={styles.dotsContainer} onClick={(e) => e.stopPropagation()}>
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.dot} ${index === currentMediaIndex ? styles.dotActive : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentMediaIndex(index);
              }}
              aria-label={`Go to media ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MediaCarousel);
