"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
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
  muted = false,
  controls = true,
  className = "",
  poster,
  ...restProps
}, ref) => {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useImperativeHandle(ref, () => internalVideoRef.current as HTMLVideoElement);

  const targetSource = hlsSrc || (src.includes(".m3u8") ? src : null);
  const fallbackSource = src.includes(".m3u8") ? undefined : src;

  // Sync muted property directly on DOM element
  useEffect(() => {
    if (internalVideoRef.current) {
      internalVideoRef.current.muted = !!muted;
      internalVideoRef.current.defaultMuted = !!muted;
    }
  }, [muted]);

  // Handle play/pause state changes without destroying HLS instance
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    if (autoPlay) {
      video.muted = !!muted;
      const p = video.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [autoPlay, muted]);

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
          video.muted = !!muted;
          video.play().catch(() => {});
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
          if (autoPlay && internalVideoRef.current) {
            internalVideoRef.current.muted = !!muted;
            internalVideoRef.current.play().catch(() => {});
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
                video.muted = !!muted;
                video.play().catch(() => {});
              }
            }
          }
        });
      } else if (fallbackSource) {
        video.src = fallbackSource;
        if (autoPlay) {
          video.muted = !!muted;
          video.play().catch(() => {});
        }
      }
    } else if (fallbackSource) {
      video.src = fallbackSource;
      if (autoPlay) {
        video.muted = !!muted;
        video.play().catch(() => {});
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [targetSource, fallbackSource]);

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
