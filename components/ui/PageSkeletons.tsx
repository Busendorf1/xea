import React from "react";
import Skeleton from "./Skeleton";
import styles from "./FeedSkeleton.module.css";

/**
 * High-performance Page Skeletons for seamless Suspense fallbacks.
 * Replaces all generic loaders/spinners across page and tab transitions.
 */

export function MonetizeSkeleton() {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.5rem 1rem", width: "100%" }} aria-busy="true" aria-label="Loading monetization status">
      {/* Header Skeleton */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Skeleton variant="title" width={220} height={32} />
        <Skeleton variant="text" width="60%" height={16} style={{ marginTop: 8 }} />
      </div>

      {/* Main Status Hero Card */}
      <div style={{
        borderRadius: 16,
        padding: "1.5rem",
        border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
        backgroundColor: "var(--card-bg, rgba(255,255,255,0.02))",
        marginBottom: "1.25rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Skeleton variant="rect" width={52} height={52} style={{ borderRadius: "50%" }} />
            <div>
              <Skeleton variant="title" width={180} height={22} />
              <Skeleton variant="text" width={280} height={14} style={{ marginTop: 6 }} />
            </div>
          </div>
          <Skeleton variant="rect" width={120} height={36} style={{ borderRadius: 9999 }} />
        </div>
      </div>

      {/* Progress & Milestone Card */}
      <div style={{
        borderRadius: 16,
        padding: "1.5rem",
        border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
        backgroundColor: "var(--card-bg, rgba(255,255,255,0.02))",
        marginBottom: "1.25rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Skeleton variant="title" width={160} height={20} />
          <Skeleton variant="rect" width={60} height={24} style={{ borderRadius: 8 }} />
        </div>
        <Skeleton variant="text" width="90%" height={14} />
        <Skeleton variant="text" width="70%" height={14} style={{ marginTop: 6 }} />
        <div style={{ marginTop: 20 }}>
          <Skeleton variant="rect" width="100%" height={10} style={{ borderRadius: 9999 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <Skeleton variant="text" width={100} height={14} />
          <Skeleton variant="text" width={100} height={14} />
        </div>
      </div>

      {/* Policy Card */}
      <div style={{
        borderRadius: 16,
        padding: "1.25rem",
        border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
        backgroundColor: "var(--card-bg, rgba(255,255,255,0.02))",
      }}>
        <Skeleton variant="title" width={140} height={18} />
        <Skeleton variant="text" width="95%" height={13} style={{ marginTop: 8 }} />
        <Skeleton variant="text" width="85%" height={13} style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem 1rem", width: "100%" }} aria-busy="true" aria-label="Loading form">
      <Skeleton variant="title" width={240} height={28} />
      <Skeleton variant="text" width="50%" height={16} style={{ marginTop: 8, marginBottom: 24 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <Skeleton variant="text" width={120} height={14} style={{ marginBottom: 8 }} />
          <Skeleton variant="rect" width="100%" height={46} style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Skeleton variant="text" width={140} height={14} style={{ marginBottom: 8 }} />
          <Skeleton variant="rect" width="100%" height={110} style={{ borderRadius: 10 }} />
        </div>
        <div>
          <Skeleton variant="text" width={110} height={14} style={{ marginBottom: 8 }} />
          <Skeleton variant="rect" width="100%" height={160} style={{ borderRadius: 12 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
          <Skeleton variant="rect" width={100} height={42} style={{ borderRadius: 10 }} />
          <Skeleton variant="rect" width={140} height={42} style={{ borderRadius: 10 }} />
        </div>
      </div>
    </div>
  );
}

export function PublicationsSkeleton() {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.5rem 1rem", width: "100%" }} aria-busy="true" aria-label="Loading publications">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Skeleton variant="title" width={180} height={30} />
        <Skeleton variant="rect" width={160} height={38} style={{ borderRadius: 9999 }} />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <Skeleton variant="rect" width={90} height={32} style={{ borderRadius: 8 }} />
        <Skeleton variant="rect" width={90} height={32} style={{ borderRadius: 8 }} />
        <Skeleton variant="rect" width={90} height={32} style={{ borderRadius: 8 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            style={{
              borderRadius: 14,
              padding: "1.25rem",
              border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
              backgroundColor: "var(--card-bg, rgba(255,255,255,0.02))",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Skeleton variant="title" width={140} height={18} />
              <Skeleton variant="rect" width={70} height={22} style={{ borderRadius: 6 }} />
            </div>
            <Skeleton variant="text" width="85%" height={14} />
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <Skeleton variant="text" width={80} height={12} />
              <Skeleton variant="text" width={80} height={12} />
              <Skeleton variant="text" width={80} height={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatementSkeleton() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem", width: "100%" }} aria-busy="true" aria-label="Loading statement history">
      {/* Header & Balance Skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Skeleton variant="title" width={220} height={28} />
          <Skeleton variant="text" width={160} height={14} style={{ marginTop: 6 }} />
        </div>
        <Skeleton variant="rect" width={110} height={36} style={{ borderRadius: 9999 }} />
      </div>

      {/* 4 Stat Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              borderRadius: 14,
              padding: "1.1rem",
              border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
              backgroundColor: "var(--card-bg, rgba(255,255,255,0.02))",
            }}
          >
            <Skeleton variant="rect" width={32} height={32} style={{ borderRadius: 8, marginBottom: 12 }} />
            <Skeleton variant="text" width={90} height={13} style={{ marginBottom: 6 }} />
            <Skeleton variant="title" width={130} height={22} />
          </div>
        ))}
      </div>

      {/* Filter Tabs Skeleton */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {[80, 100, 90, 85, 95].map((w, idx) => (
          <Skeleton key={idx} variant="rect" width={w} height={32} style={{ borderRadius: 8, flexShrink: 0 }} />
        ))}
      </div>

      {/* Statement Transaction Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4, 5].map((row) => (
          <div
            key={row}
            style={{
              borderRadius: 12,
              padding: "1rem 1.25rem",
              border: "1px solid var(--card-border, rgba(255,255,255,0.06))",
              backgroundColor: "var(--card-bg, rgba(255,255,255,0.02))",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Skeleton variant="rect" width={38} height={38} style={{ borderRadius: 10 }} />
              <div>
                <Skeleton variant="title" width={140} height={16} />
                <Skeleton variant="text" width={100} height={12} style={{ marginTop: 6 }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <Skeleton variant="title" width={90} height={18} />
              <Skeleton variant="rect" width={60} height={18} style={{ borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem 1rem", width: "100%" }} aria-busy="true" aria-label="Loading profile">
      {/* Banner & Avatar */}
      <Skeleton variant="rect" width="100%" height={120} style={{ borderRadius: 14, marginBottom: -40 }} />
      <div style={{ paddingLeft: "1.5rem", marginBottom: 20 }}>
        <Skeleton variant="avatar" width={80} height={80} style={{ borderRadius: "50%", border: "4px solid var(--background)" }} />
      </div>
      <Skeleton variant="title" width={200} height={24} style={{ marginBottom: 8 }} />
      <Skeleton variant="text" width={120} height={14} style={{ marginBottom: 16 }} />
      <Skeleton variant="text" width="80%" height={14} style={{ marginBottom: 24 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[1, 2, 3].map((n) => (
          <div key={n} style={{ display: "flex", gap: 16 }}>
            <Skeleton variant="rect" width="50%" height={44} style={{ borderRadius: 10 }} />
            <Skeleton variant="rect" width="50%" height={44} style={{ borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeedPageSkeleton() {
  return (
    <div className={styles.feedSkeletonContainer} aria-busy="true" aria-label="Loading page">
      {[1, 2, 3].map((index) => (
        <div key={index} className={styles.cardSkeleton}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Skeleton variant="avatar" width={42} height={42} style={{ borderRadius: "50%" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Skeleton variant="title" width={120} height={16} />
              <Skeleton variant="text" width={80} height={12} />
            </div>
            <Skeleton variant="rect" width={64} height={24} style={{ borderRadius: 9999 }} />
          </div>
          <Skeleton variant="text" width="94%" height={14} style={{ marginBottom: 6 }} />
          <Skeleton variant="text" width="82%" height={14} style={{ marginBottom: 12 }} />
          <Skeleton variant="rect" width="100%" height={240} style={{ borderRadius: 12, marginBottom: 12 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Skeleton variant="rect" width={32} height={32} style={{ borderRadius: 8 }} />
              <Skeleton variant="rect" width={32} height={32} style={{ borderRadius: 8 }} />
              <Skeleton variant="rect" width={32} height={32} style={{ borderRadius: 8 }} />
            </div>
            <Skeleton variant="rect" width={90} height={32} style={{ borderRadius: 9999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GeneralPageSkeleton() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem", width: "100%" }} aria-busy="true" aria-label="Loading">
      <Skeleton variant="title" width={260} height={32} style={{ marginBottom: 12 }} />
      <Skeleton variant="text" width="55%" height={16} style={{ marginBottom: 28 }} />
      <FeedPageSkeleton />
    </div>
  );
}
