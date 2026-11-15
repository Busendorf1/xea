"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import Hls from "hls.js";

const appendFirstFrameHint = (url: string | undefined, poster?: string): string | undefined => {
  if (!url || poster) return url;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.includes("#") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:") ||
    trimmed.includes(".m3u8")
  ) {
    return url;
  }
  return `${trimmed}#t=0.001`;
};

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
  controls = false,
  className = "",
  poster,
  preload: callerPreload,
  onLoadedMetadata: callerOnLoadedMetadata,
  onError: callerOnError,
  ...passThroughProps
}, ref) => {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fallbackTriedRef = useRef<boolean>(false);

  useImperativeHandle(ref, () => internalVideoRef.current as HTMLVideoElement);

  const targetSource = hlsSrc || (src && src.includes(".m3u8") ? src : null);
  const fallbackSource = src && !src.includes(".m3u8") ? src : undefined;
  const autoPlayRef = useRef(autoPlay);
  const mutedRef = useRef(muted);
  const preloadRef = useRef(callerPreload);
  const posterRef = useRef(poster);
  const hlsStartedLoadRef = useRef(false);
  const callerOnLoadedMetadataRef = useRef(callerOnLoadedMetadata);
  const callerOnErrorRef = useRef(callerOnError);

  autoPlayRef.current = autoPlay;
  posterRef.current = poster;

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    preloadRef.current = callerPreload;
  }, [callerPreload]);

  useEffect(() => {
    callerOnLoadedMetadataRef.current = callerOnLoadedMetadata;
  }, [callerOnLoadedMetadata]);

  useEffect(() => {
    callerOnErrorRef.current = callerOnError;
  }, [callerOnError]);

  // Safe play helper adhering to Google Web Video Autoplay Policy
  const safePlay = useCallback(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    if (hlsRef.current && !hlsStartedLoadRef.current) {
      hlsStartedLoadRef.current = true;
      hlsRef.current.startLoad();
    }

    // Enforce muted property for autoplay compliance across iOS & Android
    video.muted = !!mutedRef.current;
    video.defaultMuted = !!mutedRef.current;

    if (!video.paused) return;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (err.name === "AbortError") return; // Handled: harmless race when switching or scrubbing
        if (err.name === "NotAllowedError") {
          // Autoplay with sound prohibited: instantly enforce muted playback
          video.muted = true;
          video.defaultMuted = true;
          video.play().catch(() => {
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
          });
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

  const safePlayRef = useRef(safePlay);
  useEffect(() => {
    safePlayRef.current = safePlay;
  }, [safePlay]);

  // Fallback to direct MP4 source if HLS fails
  const triggerFallback = useCallback(() => {
    const video = internalVideoRef.current;
    if (!video || fallbackTriedRef.current) return;
    fallbackTriedRef.current = true;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const hintedFallback = appendFirstFrameHint(fallbackSource, posterRef.current) || fallbackSource;
    if (hintedFallback && video.src !== hintedFallback) {
      video.src = hintedFallback;
      video.load();
      if (autoPlayRef.current) {
        safePlayRef.current();
      }
    }
  }, [fallbackSource]);

  const triggerFallbackRef = useRef(triggerFallback);
  useEffect(() => {
    triggerFallbackRef.current = triggerFallback;
  }, [triggerFallback]);

  // Video error handler on the DOM element
  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = internalVideoRef.current;
      if (video) {
        console.warn("⚠️ Native video error on source:", video.src, "- attempting fallback...");
        triggerFallbackRef.current();
      }
      callerOnErrorRef.current?.(e);
    },
    []
  );

  // HLS stream setup — runs ONLY when media targetSource/fallbackSource changes
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    fallbackTriedRef.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (targetSource) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = targetSource;
        if (autoPlayRef.current) {
          safePlayRef.current();
        }
      } else if (Hls.isSupported()) {
        const shouldStartImmediately = preloadRef.current !== "none" || Boolean(autoPlayRef.current);
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          startFragPrefetch: true,
          maxBufferLength: 8,
          maxMaxBufferLength: 15,
          maxBufferHole: 0.5,
          backBufferLength: 0,
          capLevelToPlayerSize: true,
          autoStartLoad: shouldStartImmediately,
        });

        hlsRef.current = hls;
        hlsStartedLoadRef.current = shouldStartImmediately;
        hls.loadSource(targetSource);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (autoPlayRef.current) {
            safePlayRef.current();
          }
        });

        hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
          if (data.fatal) {
            console.warn("⚠️ HLS playback fatal error encountered, falling back to MP4:", data.type);
            triggerFallbackRef.current();
          }
        });
      } else if (fallbackSource) {
        const directFallback = appendFirstFrameHint(fallbackSource, posterRef.current) || fallbackSource;
        video.src = directFallback;
        if (autoPlayRef.current) {
          safePlayRef.current();
        }
      }
    } else if (fallbackSource || src) {
      const baseDirectSrc = fallbackSource || src;
      const directSrc = appendFirstFrameHint(baseDirectSrc, posterRef.current) || baseDirectSrc;
      const currentSrc = video.currentSrc || video.src || "";
      const currentBase = currentSrc.split("#")[0];
      const expectedBase = (baseDirectSrc || "").split("#")[0];
      const isSameSrc =
        currentSrc === directSrc ||
        currentSrc === baseDirectSrc ||
        (directSrc && currentSrc.endsWith(directSrc)) ||
        (expectedBase && currentBase === expectedBase) ||
        (directSrc && typeof window !== "undefined" && currentSrc === new URL(directSrc, window.location.href).href);

      if (!isSameSrc) {
        video.src = directSrc;
      }
      if (autoPlayRef.current) {
        safePlayRef.current();
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      hlsStartedLoadRef.current = false;
    };
  }, [targetSource, fallbackSource, src]);

  useEffect(() => {
    if (hlsRef.current && !hlsStartedLoadRef.current && (callerPreload !== "none" || autoPlay)) {
      hlsStartedLoadRef.current = true;
      hlsRef.current.startLoad();
    }

    const video = internalVideoRef.current;
    if (!video) return;

    if (autoPlay) {
      if (video.readyState >= 2 || (hlsStartedLoadRef.current && video.readyState >= 1) || (!targetSource && video.paused)) {
        safePlayRef.current();
      }
      if (video.readyState < 2 && typeof video.addEventListener === "function") {
        const handleReady = () => {
          video.removeEventListener("canplay", handleReady);
          video.removeEventListener("loadeddata", handleReady);
          if (autoPlayRef.current && video.paused) {
            safePlayRef.current();
          }
        };
        video.addEventListener("canplay", handleReady);
        video.addEventListener("loadeddata", handleReady);
        return () => {
          video.removeEventListener("canplay", handleReady);
          video.removeEventListener("loadeddata", handleReady);
        };
      }
    } else if (!video.paused) {
      video.pause();
    }
  }, [callerPreload, autoPlay, targetSource]);

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      callerOnLoadedMetadataRef.current?.(e);
    },
    []
  );

  const hintedDirectSrc = appendFirstFrameHint(fallbackSource || src, poster);

  return (
    <video
      {...passThroughProps}
      ref={internalVideoRef}
      src={targetSource ? undefined : hintedDirectSrc}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      controls={false}
      playsInline
      preload={callerPreload || "metadata"}
      className={className}
      poster={poster}
      onError={handleVideoError}
      onLoadedMetadata={handleLoadedMetadata}
      disablePictureInPicture
      controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        backgroundColor: "#000000",
        ...passThroughProps.style,
      }}
    />
  );
});

HlsVideoPlayer.displayName = "HlsVideoPlayer";

export default HlsVideoPlayer;
