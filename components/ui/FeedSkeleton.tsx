import React from "react";
import Skeleton from "./Skeleton";
import styles from "./FeedSkeleton.module.css";

interface FeedSkeletonProps {
  count?: number;
}

export default function FeedSkeleton({ count = 3 }: FeedSkeletonProps) {
  return (
    <div className={styles.feedSkeletonContainer} aria-busy="true" aria-label="Loading attention feed">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={styles.cardSkeleton}>
          {/* Left: Avatar */}
          <div className={styles.avatarColumn}>
            <Skeleton variant="avatar" width={40} height={40} />
          </div>

          {/* Right: Ad Content */}
          <div className={styles.bodyColumn}>
            {/* Header: Name, handle, badge, spacer, pill */}
            <div className={styles.headerRow}>
              <div className={styles.headerTitles}>
                <Skeleton variant="title" width={110} height={15} style={{ marginBottom: 0 }} />
                <Skeleton variant="text" width={75} height={12} style={{ marginBottom: 0 }} />
              </div>
              <div className={styles.headerSpacer} />
              <Skeleton variant="rect" width={52} height={22} style={{ borderRadius: 9999 }} />
            </div>

            {/* Text description lines */}
            <div className={styles.textLines}>
              <Skeleton variant="text" width="94%" height={13} style={{ marginBottom: 6 }} />
              <Skeleton variant="text" width="86%" height={13} style={{ marginBottom: 6 }} />
              <Skeleton variant="text" width="62%" height={13} style={{ marginBottom: 0 }} />
            </div>

            {/* Media preview block */}
            <div className={styles.mediaSkeleton}>
              <Skeleton variant="rect" width="100%" height={220} style={{ borderRadius: 14 }} />
            </div>

            {/* Bottom action icons bar */}
            <div className={styles.actionsRow}>
              <div className={styles.actionIconsGroup}>
                <Skeleton variant="rect" width={26} height={26} style={{ borderRadius: 6 }} />
                <Skeleton variant="rect" width={26} height={26} style={{ borderRadius: 6 }} />
                <Skeleton variant="rect" width={26} height={26} style={{ borderRadius: 6 }} />
              </div>
              <div className={styles.headerSpacer} />
              <Skeleton variant="rect" width={84} height={26} style={{ borderRadius: 9999 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
