"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

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
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  useImperativeHandle(ref, () => internalVideoRef.current as HTMLVideoElement);

  const targetSource = hlsSrc || (src.includes(".m3u8") ? src : null);
  const fallbackSource = src.includes(".m3u8") ? undefined : src;

  // Sync muted property directly on DOM element when muted prop changes
  useEffect(() => {
    if (internalVideoRef.current) {
      internalVideoRef.current.muted = !!muted;
    }
  }, [muted]);

  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    // Cleanup previous Hls instance if it exists
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (targetSource) {
      // 1. Native HLS support (Safari iOS / macOS / Native WebViews)
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = targetSource;
      } else {
        // 2. hls.js for Chrome, Firefox, Edge, Android Browsers
        import("hls.js")
          .then((HlsModule) => {
            const Hls = HlsModule.default;
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90,
              });

              hlsRef.current = hls;
              hls.loadSource(targetSource);
              hls.attachMedia(video);

              hls.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; type?: string }) => {
                if (data.fatal) {
                  console.warn("⚠️ HLS playback error encountered, falling back to MP4:", data.type);
                  hls.destroy();
                  hlsRef.current = null;
                  if (fallbackSource) {
                    video.src = fallbackSource;
                  }
                }
              });
            } else if (fallbackSource) {
              video.src = fallbackSource;
            }
          })
          .catch(() => {
            if (fallbackSource) {
              video.src = fallbackSource;
            }
          });
      }
    } else if (fallbackSource) {
      video.src = fallbackSource;
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
      className={className}
      poster={poster}
      {...restProps}
    />
  );
});

HlsVideoPlayer.displayName = "HlsVideoPlayer";

export default HlsVideoPlayer;
