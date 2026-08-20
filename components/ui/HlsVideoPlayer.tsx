"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import Hls from "hls.js";

export interface HlsVideoPlayerProps
  extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  hlsSrc?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  className?: string;
  poster?: string;
}

export const HlsVideoPlayer = forwardRef<HTMLVideoElement, HlsVideoPlayerProps>(({
  src,
  hlsSrc,
  autoPlay = false,
  loop = false,
  muted = true,
  controls = true,
  className = "",
  poster,
  ...restProps
}, ref) => {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useImperativeHandle(ref, () => internalVideoRef.current as HTMLVideoElement);

  const targetSource = hlsSrc || (src && src.includes(".m3u8") ? src : null);
  const fallbackSource = src && src.includes(".m3u8") ? undefined : src;
  const autoPlayRef = useRef(autoPlay);
  const mutedRef = useRef(muted);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Safe play helper adhering to Google Web Video Autoplay Policy
  const safePlay = useCallback(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    // Enforce muted property for autoplay compliance across iOS & Android
    video.muted = !!mutedRef.current;
    video.defaultMuted = !!mutedRef.current;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        // If blocked by browser user gesture policy, unlock on first touch/scroll
        if (err.name === "NotAllowedError" || err.name === "AbortError") {
          const unlockGesture = () => {
            if (internalVideoRef.current && autoPlayRef.current) {
              internalVideoRef.current.muted = true;
              internalVideoRef.current.play().catch(() => {});
            }
            window.removeEventListener("touchstart", unlockGesture);
            window.removeEventListener("click", unlockGesture);
            window.removeEventListener("scroll", unlockGesture);
          };

          window.addEventListener("touchstart", unlockGesture, { once: true, passive: true });
          window.addEventListener("click", unlockGesture, { once: true, passive: true });
          window.addEventListener("scroll", unlockGesture, { once: true, passive: true });
        }
      });
    }
  }, []);

  // Sync muted and playsinline property directly on DOM element
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    video.muted = !!muted;
    video.defaultMuted = !!muted;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x5-playsinline", "true");
  }, [muted]);

  // Handle play/pause state transitions strictly when autoPlay changes
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    if (autoPlay) {
      if (video.readyState >= 2) {
        safePlay();
      } else {
        const handleReady = () => {
          video.removeEventListener("canplay", handleReady);
          video.removeEventListener("loadeddata", handleReady);
          safePlay();
        };
        video.addEventListener("canplay", handleReady);
        video.addEventListener("loadeddata", handleReady);
        return () => {
          video.removeEventListener("canplay", handleReady);
          video.removeEventListener("loadeddata", handleReady);
        };
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [autoPlay, safePlay]);

  // HLS stream setup — runs ONLY when media targetSource/fallbackSource changes
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (targetSource) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = targetSource;
        if (autoPlay) {
          safePlay();
        }
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferHole: 0.5,
          backBufferLength: 90,
        });

        hlsRef.current = hls;
        hls.loadSource(targetSource);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (autoPlay) {
            safePlay();
          }
        });

        hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
          if (data.fatal) {
            console.warn("⚠️ HLS playback error encountered, falling back to MP4:", data.type);
            hls.destroy();
            hlsRef.current = null;
            if (fallbackSource) {
              video.src = fallbackSource;
              if (autoPlay) {
                safePlay();
              }
            }
          }
        });
      } else if (fallbackSource) {
        video.src = fallbackSource;
        if (autoPlay) {
          safePlay();
        }
      }
    } else if (fallbackSource) {
      video.src = fallbackSource;
      if (autoPlay) {
        safePlay();
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [targetSource, fallbackSource, autoPlay, safePlay]);

  return (
    <video
      ref={internalVideoRef}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      controls={controls}
      playsInline
      preload="auto"
      className={className}
      poster={poster}
      {...restProps}
    />
  );
});

HlsVideoPlayer.displayName = "HlsVideoPlayer";

export default HlsVideoPlayer;
