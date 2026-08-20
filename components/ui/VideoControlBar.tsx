import React from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import styles from "./AdCard.module.css";

interface VideoControlBarProps {
  index: number;
  isPlaying: boolean;
  isMuted: boolean;
  isFullscreen: boolean;
  showControls?: boolean;
  videoDuration: number;
  videoCurrentTime: number;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: (index: number) => void;
  formatVideoTime: (seconds: number) => string;
}

const VideoControlBar: React.FC<VideoControlBarProps> = ({
  index,
  isPlaying,
  isMuted,
  isFullscreen,
  showControls = true,
  videoDuration,
  videoCurrentTime,
  onTogglePlay,
  onToggleMute,
  onToggleFullscreen,
  formatVideoTime,
}) => {
  return (
    <div className={styles.videoControlBar} onClick={(e) => e.stopPropagation()}>
      {/* Left: Duration Counter Badge */}
      <div className={styles.videoDurationBadge} title="Video duration timer">
        {videoDuration > 0
          ? formatVideoTime(Math.max(0, videoDuration - videoCurrentTime))
          : formatVideoTime(videoCurrentTime)}
      </div>

      {/* Right: Controls (Auto-hides after some seconds, reappears on touch/interaction) */}
      <div
        className={`${styles.videoControlsResponsiveGroup} ${
          showControls ? styles.controlsVisible : styles.controlsHidden
        }`}
      >
        {/* Play/Pause Button */}
        <button
          type="button"
          className={styles.videoMuteBtn}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          title={isPlaying ? "Pause video" : "Play video"}
          aria-label={isPlaying ? "Pause video" : "Play video"}
        >
          {isPlaying ? <Pause size={15} color="#fff" /> : <Play size={15} color="#fff" />}
        </button>

        {/* Mute Button */}
        <button
          type="button"
          className={styles.videoMuteBtn}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          title={isMuted ? "Unmute sound" : "Mute sound"}
          aria-label={isMuted ? "Unmute sound" : "Mute sound"}
        >
          {isMuted ? <VolumeX size={15} color="#fff" /> : <Volume2 size={15} color="#fff" />}
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          className={styles.videoFullscreenBtn}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFullscreen(index);
          }}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Video"}
          aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Video"}
        >
          {isFullscreen ? <Minimize size={15} color="#fff" /> : <Maximize size={15} color="#fff" />}
        </button>
      </div>
    </div>
  );
};

export default React.memo(VideoControlBar);
