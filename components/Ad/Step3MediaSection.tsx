"use client";

import React from "react";
import { FileText, Image as ImageIcon, Video, Layers } from "lucide-react";
import { showAppleAlert } from "@/components/ui/AppleAlert";
import { AdFormSelections, AdMediaType } from "./types";
import styles from "./page.module.css";

interface Step3MediaSectionProps {
  formSelections: AdFormSelections;
  setFormSelections: React.Dispatch<React.SetStateAction<AdFormSelections>>;
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB per video (matches Supabase Storage bucket limit)
const MAX_VIDEO_DURATION_SECONDS = 3600; // 60 minutes

const isImageFile = (f: File) =>
  f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name);

const isVideoFile = (f: File) =>
  f.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(f.name);

async function checkVideoDuration(file: File): Promise<boolean> {
  try {
    return await new Promise<boolean>((resolve) => {
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      const timer = setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        resolve(file.size <= MAX_VIDEO_BYTES);
      }, 5000);

      videoEl.onloadedmetadata = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);
        resolve(videoEl.duration <= MAX_VIDEO_DURATION_SECONDS);
      };
      videoEl.onerror = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);
        resolve(file.size <= MAX_VIDEO_BYTES);
      };
      videoEl.src = objectUrl;
    });
  } catch {
    return file.size <= MAX_VIDEO_BYTES;
  }
}

export default function Step3MediaSection({
  formSelections,
  setFormSelections,
}: Step3MediaSectionProps) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newlyPicked = Array.from(files);
    const combinedFiles = [...formSelections.adMediaFiles, ...newlyPicked];

    const images = combinedFiles.filter(isImageFile);
    const videos = combinedFiles.filter(isVideoFile);

    if (combinedFiles.length > 4) {
      showAppleAlert("Total media files cannot exceed 4 combinations.", "warning");
      e.target.value = "";
      return;
    }

    if (formSelections.adMediaType === "image") {
      if (videos.length > 0) {
        showAppleAlert(
          "Only images are allowed for Image(s) mode. Switch to Mixed Media to combine images and videos.",
          "warning"
        );
        e.target.value = "";
        return;
      }
      if (images.length > 4) {
        showAppleAlert("You can select up to 4 images only.", "warning");
        e.target.value = "";
        return;
      }
    } else if (formSelections.adMediaType === "video") {
      if (images.length > 0) {
        showAppleAlert(
          "Only videos are allowed for Video(s) mode. Switch to Mixed Media to combine images and videos.",
          "warning"
        );
        e.target.value = "";
        return;
      }
      if (videos.length > 2) {
        showAppleAlert("You can upload at most 2 videos (up to 60 minutes each).", "warning");
        e.target.value = "";
        return;
      }
    } else if (formSelections.adMediaType === "mixed") {
      if (videos.length > 2) {
        showAppleAlert("You can upload at most 2 videos (up to 60 minutes each).", "warning");
        e.target.value = "";
        return;
      }
      if (images.length > 3) {
        showAppleAlert(
          "In Mixed Media mode, you can select at most 3 images (with 1 video) or 2 images (with 2 videos), up to 4 files total.",
          "warning"
        );
        e.target.value = "";
        return;
      }
      if (images.length + videos.length > 4) {
        showAppleAlert(
          "Total number of media files cannot exceed 4 (e.g., 1 img + 2 vid, 2 img + 1 vid, 2 img + 2 vid, or 3 img + 1 vid).",
          "warning"
        );
        e.target.value = "";
        return;
      }
    }

    for (const file of newlyPicked) {
      if (isImageFile(file)) {
        if (file.size > 5 * 1024 * 1024) {
          showAppleAlert(`Image ${file.name} exceeds 5MB limit.`, "warning");
          e.target.value = "";
          return;
        }
      } else if (isVideoFile(file)) {
        if (file.size > MAX_VIDEO_BYTES) {
          showAppleAlert(`Video ${file.name} exceeds 50MB limit.`, "warning");
          e.target.value = "";
          return;
        }
        const durationOk = await checkVideoDuration(file);
        if (!durationOk) {
          showAppleAlert(`Video ${file.name} must be 60 minutes or less.`, "warning");
          e.target.value = "";
          return;
        }
      }
    }

    setFormSelections((prev) => ({
      ...prev,
      adMediaFiles: combinedFiles,
    }));
    e.target.value = "";
  };

  const mediaFormats = [
    {
      value: "text",
      title: "Text Only",
      badge: "Up to 1,500 Words",
      desc: "Up to 1,500 words with full reader.",
      icon: <FileText size={15} color="var(--foreground)" />,
    },
    {
      value: "image",
      title: "Image(s)",
      badge: "Up to 4 Photos",
      desc: "1–4 photos (JPG, PNG · max 5MB).",
      icon: <ImageIcon size={15} color="var(--foreground)" />,
    },
    {
      value: "video",
      title: "Video(s)",
      badge: "1–2 Videos (≤60m)",
      desc: "1–2 videos (MP4, MOV · max 50MB).",
      icon: <Video size={15} color="var(--foreground)" />,
    },
    {
      value: "mixed",
      title: "Mixed Media",
      badge: "Max 4 (≤2 Videos)",
      desc: "Up to 4 files (max 2 videos).",
      icon: <Layers size={15} color="var(--foreground)" />,
    },
  ];

  return (
    <div className={styles.modernSectionCard}>
      <div className={styles.modernSectionHeader}>
        <span className={styles.modernSectionTitle}>Media Assets</span>
        <span className={styles.modernSectionBadge}>
          {formSelections.adMediaType ? formSelections.adMediaType.toUpperCase() : "Select Format"}
        </span>
      </div>
      <div className={styles.modernSectionBody}>
        <div className={styles.formGroup}>
          <div className={styles.mediaTypeGrid}>
            {mediaFormats.map((format) => {
              const isSelected = formSelections.adMediaType === format.value;
              return (
                <div
                  key={format.value}
                  onClick={() =>
                    setFormSelections((prev) => ({
                      ...prev,
                      adMediaType: format.value as AdMediaType,
                      adMediaFiles: [],
                    }))
                  }
                  className={`${styles.mediaTypeCard} ${isSelected ? styles.mediaTypeCardActive : ""}`}
                >
                  <div className={styles.mediaTypeCardHeader}>
                    <div className={styles.mediaTypeCardIcon}>{format.icon}</div>
                    <span className={styles.mediaTypeCardBadge}>{format.badge}</span>
                  </div>
                  <h4 className={styles.mediaTypeCardTitle}>{format.title}</h4>
                  <p className={styles.mediaTypeCardDesc}>{format.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {formSelections.adMediaType && formSelections.adMediaType !== "text" && (
          <div className={styles.formGroup}>
            <label className={styles.fieldLabelBold}>
              Upload Files{" "}
              <span className={styles.charCount}>
                ({formSelections.adMediaFiles.length}/4 selected • max 2 videos, up to 60 mins each)
              </span>
            </label>
            <input
              type="file"
              multiple
              accept={
                formSelections.adMediaType === "video"
                  ? "video/*"
                  : formSelections.adMediaType === "image"
                  ? "image/*"
                  : "image/*,video/*"
              }
              onChange={handleFileChange}
              className={styles.inputBox}
            />
            {formSelections.adMediaFiles.length > 0 && (
              <div
                className={styles.selectedFilesHint}
                style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginTop: "8px" }}
              >
                {formSelections.adMediaFiles.map((f, idx) => {
                  const isVid = isVideoFile(f);
                  return (
                    <span
                      key={`${f.name}-${idx}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        background: "var(--sidebar-bg)",
                        border: "1px solid var(--card-border)",
                        fontSize: "0.78rem",
                        color: "var(--foreground)",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                        {isVid ? <Video size={13} /> : <ImageIcon size={13} />}
                        {isVid ? "Video:" : "Image:"}
                      </span>{" "}
                      {f.name}
                      <button
                        type="button"
                        onClick={() =>
                          setFormSelections((prev) => ({
                            ...prev,
                            adMediaFiles: prev.adMediaFiles.filter((_, i) => i !== idx),
                          }))
                        }
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontWeight: 700,
                          padding: "0 2px",
                          fontSize: "0.85rem",
                          lineHeight: 1,
                        }}
                        title="Remove file"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                {formSelections.adMediaFiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormSelections((prev) => ({
                        ...prev,
                        adMediaFiles: [],
                      }))
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      textDecoration: "underline",
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
            {formSelections.existingMedia && formSelections.adMediaFiles.length === 0 && (
              <div className={styles.selectedFilesHint}>
                Current campaign media preserved. Choose new file(s) above if you wish to replace it.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
