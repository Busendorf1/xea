"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Gauge,
  Check,
  Maximize,
} from "lucide-react";
import styles from "./FullscreenVideoPlayer.module.css";
import HlsVideoPlayer from "@/components/ui/HlsVideoPlayer";

interface FullscreenVideoPlayerProps {
  src: string;
  hlsSrc?: string | null;
  poster?: string;
  autoPlay?: boolean;
  initialTime?: number;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function FullscreenVideoPlayer({
  src,
  hlsSrc,
  poster,
  autoPlay = true,
  initialTime = 0,
}: FullscreenVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasFirstFrame, setHasFirstFrame] = useState<boolean>(() => Boolean(poster));
  const [isBuffering, setIsBuffering] = useState<boolean>(() => !Boolean(poster));
  const [currentTime, setCurrentTime] = useState<number>(initialTime > 0 ? initialTime : 0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialSeekAppliedRef = useRef<boolean>(false);
  const initialTimeRef = useRef<number>(initialTime);
  initialTimeRef.current = initialTime;

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (isPlaying) {
      hideTimeoutRef.current = setTimeout(() => {
        if (!isSpeedMenuOpen) {
          setShowControls(false);
        }
      }, 3500);
    }
  }, [isPlaying, isSpeedMenuOpen]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [resetHideTimer]);

  const applyInitialSeek = useCallback((vid: HTMLVideoElement | null) => {
    if (!vid || initialSeekAppliedRef.current || initialTimeRef.current <= 0.15) return;
    const dur = vid.duration || 0;
    if (vid.readyState < 1 && !(Number.isFinite(dur) && dur > 0)) return;
    initialSeekAppliedRef.current = true;
    try {
      const clamped =
        Number.isFinite(dur) && dur > 0
          ? Math.min(initialTimeRef.current, Math.max(0, dur - 0.25))
          : initialTimeRef.current;
      vid.currentTime = clamped;
      setCurrentTime(clamped);
    } catch {}
  }, []);

  // Reset source-scoped media readiness only when the underlying stream changes (NOT on autoPlay toggle)
  useEffect(() => {
    const vid = videoRef.current;
    initialSeekAppliedRef.current = false;
    const readyNow = Boolean(poster || (vid && vid.readyState >= 2));
    setHasFirstFrame(readyNow);
    setIsBuffering(!readyNow);
    setShowControls(true);
    if (!vid) return;

    vid.muted = false;
    vid.volume = 1;
    setIsMuted(false);
    setVolume(1);

    if (vid.readyState >= 1) {
      applyInitialSeek(vid);
    }
  }, [src, hlsSrc, poster, applyInitialSeek]);

  // Coordinated play/pause lifecycle: preserves hasFirstFrame & mute state during lightbox close transitions
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    let cancelled = false;

    const startPlayback = () => {
      if (cancelled || !vid) return;
      applyInitialSeek(vid);
      const playPromise = vid.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            if (!cancelled) {
              setIsPlaying(true);
              setIsBuffering(false);
              setHasFirstFrame(true);
            }
          })
          .catch((err) => {
            if (cancelled || err?.name === "AbortError") return;
            vid.muted = true;
            setIsMuted(true);
            vid
              .play()
              .then(() => {
                if (!cancelled) {
                  setIsPlaying(true);
                  setIsBuffering(false);
                  setHasFirstFrame(true);
                }
              })
              .catch(() => {
                if (!cancelled) {
                  setIsPlaying(false);
                  setIsBuffering(false);
                }
              });
          });
      }
    };

    if (!autoPlay) {
      vid.pause();
      setIsPlaying(false);
      setIsBuffering(false);
      return;
    }

    if (vid.readyState >= 1) {
      applyInitialSeek(vid);
    }

    if (vid.readyState >= 2) {
      setHasFirstFrame(true);
      startPlayback();
      return () => {
        cancelled = true;
      };
    }

    const onReady = () => {
      vid.removeEventListener("canplay", onReady);
      vid.removeEventListener("loadeddata", onReady);
      setHasFirstFrame(true);
      setIsBuffering(false);
      startPlayback();
    };
    vid.addEventListener("canplay", onReady);
    vid.addEventListener("loadeddata", onReady);
    return () => {
      cancelled = true;
      vid.removeEventListener("canplay", onReady);
      vid.removeEventListener("loadeddata", onReady);
    };
  }, [src, hlsSrc, autoPlay, applyInitialSeek]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbing) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const dur = vid.duration || 0;
    setDuration(dur);
    applyInitialSeek(vid);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetHideTimer();
  };

  const handleSeek = (secondsOffset: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + secondsOffset));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    resetHideTimer();
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !videoRef.current || duration === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percentage * duration;
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    resetHideTimer();
  };

  const handleSpeedSelect = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
    setIsSpeedMenuOpen(false);
    resetHideTimer();
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    resetHideTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      const muted = newVol === 0;
      videoRef.current.muted = muted;
      setIsMuted(muted);
    }
    resetHideTimer();
  };

  const handleFullscreenNative = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={styles.playerContainer}
      onMouseMove={resetHideTimer}
      onClick={togglePlay}
    >
      <HlsVideoPlayer
        ref={videoRef}
        src={src}
        hlsSrc={hlsSrc ?? undefined}
        poster={poster}
        playsInline
        preload="auto"
        muted={isMuted}
        className={`${styles.videoElement} ${hasFirstFrame ? styles.videoElementReady : ""}`}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => {
          applyInitialSeek(videoRef.current);
          setHasFirstFrame(true);
          setIsBuffering(false);
        }}
        onCanPlay={() => {
          applyInitialSeek(videoRef.current);
          setHasFirstFrame(true);
          setIsBuffering(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setHasFirstFrame(true);
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onError={() => {
          setHasFirstFrame(true);
          setIsBuffering(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Buffering / First-Frame Reveal Spinner */}
      {(isBuffering || !hasFirstFrame) && (
        <div className={styles.centerOverlay} aria-label="Loading video">
          <div className={styles.bufferingSpinner} />
        </div>
      )}

      {/* Center Big Play/Pause indicator when paused */}
      {hasFirstFrame && !isBuffering && !isPlaying && (
        <div className={styles.centerOverlay}>
          <div className={styles.centerPlayBtn}>
            <Play size={28} fill="#ffffff" style={{ marginLeft: "4px" }} />
          </div>
        </div>
      )}

      {/* Control Bar Overlay */}
      <div
        className={`${styles.controlsOverlay} ${showControls ? styles.controlsVisible : styles.controlsHidden}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Timeline Scrubber */}
        <div className={styles.timelineRow}>
          <div
            ref={progressBarRef}
            className={styles.progressBarContainer}
            onClick={handleProgressBarClick}
            title="Click to seek"
          >
            <div
              className={styles.progressBarFill}
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className={styles.progressScrubberHead}
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Buttons Row */}
        <div className={styles.buttonsRow}>
          {/* Left Controls: Play, Rewind 10s, Fastforward 10s, Time Display */}
          <div className={styles.leftControls}>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={togglePlay}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} fill="#ffffff" />}
            </button>

            {/* Backforward 10s */}
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.jumpBtn}`}
              onClick={() => handleSeek(-10)}
              title="Rewind 10 seconds"
              aria-label="Rewind 10 seconds"
            >
              <RotateCcw size={16} />
              <span>-10s</span>
            </button>

            {/* Fastforward 10s */}
            <button
              type="button"
              className={`${styles.ctrlBtn} ${styles.jumpBtn}`}
              onClick={() => handleSeek(10)}
              title="Fast forward 10 seconds"
              aria-label="Fast forward 10 seconds"
            >
              <RotateCw size={16} />
              <span>+10s</span>
            </button>

            {/* Time / Duration */}
            <span className={styles.timeDisplay}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls: Volume, Speed Selector, Fullscreen */}
          <div className={styles.rightControls}>
            {/* Volume Control */}
            <div className={styles.volumeWrapper}>
              <button
                type="button"
                className={styles.ctrlBtn}
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
                title="Volume"
                aria-label="Volume"
              />
            </div>

            {/* Playback Speed Menu */}
            <div className={styles.speedSelectorWrapper}>
              <button
                type="button"
                className={styles.speedBadgeBtn}
                onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
                title="Change playback speed"
                aria-label="Playback speed"
              >
                {playbackSpeed}x
              </button>

              {isSpeedMenuOpen && (
                <div className={styles.speedMenu}>
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={`${styles.speedMenuItem} ${
                        playbackSpeed === speed ? styles.speedMenuItemActive : ""
                      }`}
                      onClick={() => handleSpeedSelect(speed)}
                    >
                      <span>{speed}x</span>
                      {playbackSpeed === speed && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Expand */}
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={handleFullscreenNative}
              title="Toggle Fullscreen"
              aria-label="Fullscreen"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
