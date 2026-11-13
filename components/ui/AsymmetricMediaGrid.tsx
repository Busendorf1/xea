import React, { useMemo } from "react";
import styles from "./AdCard.module.css";
import {
  MediaCollageCell,
  MediaCollageMode,
  resolveMediaCollageLayout,
} from "@/lib/utils/mediaCollageLayout";

export interface AsymmetricMediaGridProps {
  mediaUrls: string[];
  activeIndex?: number;
  variant?: "feed" | "compact";
  getAspectRatio?: (url: string) => number | undefined;
  isVideoUrl?: (url: string) => boolean;
  onCellClick?: (index: number, e: React.MouseEvent) => void;
  onScroll?: () => void;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUpOrLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onScrollToSlide?: (targetIdx: number, e?: React.MouseEvent) => void;
  cellRefCallback?: (index: number, el: HTMLDivElement | null) => void;
  renderCellContent: (cell: MediaCollageCell) => React.ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function getBentoGridClass(mode: MediaCollageMode): string {
  switch (mode) {
    case "ratio_1_3":
      return `${styles.mediaBentoGrid} ${styles.mediaBento2Ratio1to3}`;
    case "ratio_1_2":
      return `${styles.mediaBentoGrid} ${styles.mediaBento2Ratio1to2}`;
    case "ratio_1_1_2":
      return `${styles.mediaBentoGrid} ${styles.mediaBento3Ratio112}`;
    case "ratio_2_1_1_1":
    default:
      return `${styles.mediaBentoGrid} ${styles.mediaBento4Ratio2111}`;
  }
}

function getBentoCellPositionClass(mode: MediaCollageMode, idx: number): string {
  if (mode === "ratio_1_1_2") {
    if (idx === 0) return styles.mediaBento3Cell0;
    if (idx === 1) return styles.mediaBento3Cell1;
    return styles.mediaBento3Cell2;
  }
  if (mode === "ratio_2_1_1_1") {
    if (idx === 0) return styles.mediaBento4Cell0;
    if (idx === 1) return styles.mediaBento4Cell1;
    if (idx === 2) return styles.mediaBento4Cell2;
    return styles.mediaBento4Cell3;
  }
  return "";
}

/**
 * Reusable Asymmetric Multi-Media Grid & Smooth Horizontal Scroll Strip Component.
 * - Supports static Bento Grids (1:2, 1:3, 1:1:2, 2:1:1:1)
 * - Supports smooth Left-to-Right Horizontal Scroll Strips in equal (1:1:1...) or
 *   asymmetric (1:2, 2:1:1, 2:1:1:1) card width ratios.
 */
const AsymmetricMediaGrid: React.FC<AsymmetricMediaGridProps> = ({
  mediaUrls,
  activeIndex = 0,
  variant = "feed",
  getAspectRatio,
  isVideoUrl,
  onCellClick,
  onScroll,
  onMouseDown,
  onMouseMove,
  onMouseUpOrLeave,
  onScrollToSlide,
  cellRefCallback,
  renderCellContent,
  containerRef,
}) => {
  const isCompact = variant === "compact";
  const layout = useMemo(
    () =>
      resolveMediaCollageLayout(mediaUrls, {
        getAspectRatio,
        isVideoUrl,
      }),
    [mediaUrls, getAspectRatio, isVideoUrl]
  );

  // Horizontal Left-to-Right Scroll Strip Mode (equal or asymmetric card widths)
  if (layout.isHorizontalScroll) {
    return (
      <>
        <div
          className={styles.topLineIndicators}
          aria-label="Media slides indicator"
        >
          {layout.cells.map((cell) => (
            <button
              key={`seg-${cell.index}`}
              type="button"
              className={`${styles.topLineSegment} ${
                cell.index === activeIndex ? styles.topLineSegmentActive : ""
              }`}
              onClick={(e) => onScrollToSlide?.(cell.index, e)}
              aria-label={`Go to media ${cell.index + 1} of ${layout.cells.length}`}
            />
          ))}
        </div>

        <div
          ref={containerRef as React.RefObject<HTMLDivElement>}
          className={`${styles.mediaRowContainer} ${
            isCompact ? "" : styles.mediaRowContainerMulti
          }`}
          style={
            isCompact
              ? {
                  width: "100%",
                  height: "100%",
                  flex: 1,
                  minHeight: 0,
                  margin: 0,
                  padding: 0,
                  scrollPaddingLeft: 0,
                  scrollPaddingRight: 0,
                  gap: "3px",
                }
              : undefined
          }
          data-ratio-layout={layout.ratioLabel}
          onScroll={onScroll}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUpOrLeave}
          onMouseLeave={onMouseUpOrLeave}
        >
          {layout.cells.map((cell) => {
            const widthPct = cell.scrollWidthPercent;
            return (
              <div
                key={`${cell.url}-${cell.index}`}
                ref={(el) => cellRefCallback?.(cell.index, el)}
                className={`${styles.mediaRowItem} ${
                  isCompact ? "" : styles.mediaRowItemMulti
                }`}
                style={{
                  flex: `0 0 ${widthPct}%`,
                  width: `${widthPct}%`,
                  height: isCompact ? "100%" : undefined,
                  minWidth: isCompact
                    ? `${Math.max(96, Math.round(widthPct * 1.45))}px`
                    : `${Math.max(165, Math.round(widthPct * 2.5))}px`,
                  maxWidth: isCompact
                    ? `${Math.min(220, Math.round(widthPct * 2.4))}px`
                    : `${Math.min(360, Math.round(widthPct * 4.4))}px`,
                  cursor: onCellClick ? "zoom-in" : undefined,
                }}
                onClick={(e) => onCellClick?.(cell.index, e)}
              >
                {renderCellContent(cell)}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Static Asymmetric Bento Grid Mode (1:2, 1:3, 1:1:2, 2:1:1:1)
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={getBentoGridClass(layout.mode)}
      style={
        isCompact
          ? {
              width: "100%",
              height: "100%",
              maxHeight: "100%",
              aspectRatio: "unset",
              flex: 1,
              minHeight: 0,
            }
          : undefined
      }
      data-ratio-layout={layout.ratioLabel}
    >
      {layout.cells.map((cell) => (
        <div
          key={`${cell.url}-${cell.index}`}
          ref={(el) => cellRefCallback?.(cell.index, el)}
          className={`${styles.mediaBentoCell} ${getBentoCellPositionClass(
            layout.mode,
            cell.index
          )}`}
          style={{ cursor: onCellClick ? "zoom-in" : undefined }}
          onClick={(e) => onCellClick?.(cell.index, e)}
        >
          {renderCellContent(cell)}
          {cell.showMoreBadge && cell.extraCount > 0 && (
            <div className={styles.mediaMoreOverlay}>+{cell.extraCount}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default React.memo(AsymmetricMediaGrid);
