import React from "react";
import Skeleton from "./Skeleton";
import FeedSkeleton from "./FeedSkeleton";
import styles from "./PaayhShellSkeleton.module.css";

interface PaayhShellSkeletonProps {
  feedCardsCount?: number;
}

export default function PaayhShellSkeleton({ feedCardsCount = 3 }: PaayhShellSkeletonProps) {
  return (
    <div className={styles.shellWrapper} aria-busy="true" aria-label="Loading Paayh dashboard">
      {/* Sticky Top Header matching DashboardHeader across Mobile, Tablet, and Desktop */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.brandGroup}>
            <div className={styles.brandTextBlock}>
              <span className={styles.appName}>Paayh</span>
              <span className={styles.appSub}>Your feeds are ads</span>
            </div>
          </div>

          {/* Desktop & Tablet Controls */}
          <div className={styles.headerRightDesktop}>
            <div className={styles.tabletBtnPlaceholder}>
              <Skeleton variant="rect" width={116} height={32} className={styles.pill} />
            </div>
            <div className={styles.navLinksRow}>
              <Skeleton variant="text" width={42} height={13} className={`${styles.noMargin} ${styles.compactRadius}`} />
              <Skeleton variant="text" width={44} height={13} className={`${styles.noMargin} ${styles.compactRadius}`} />
              <Skeleton variant="text" width={48} height={13} className={`${styles.noMargin} ${styles.compactRadius}`} />
              <Skeleton variant="text" width={30} height={13} className={`${styles.noMargin} ${styles.compactRadius}`} />
            </div>
            <div className={styles.headerIconsGroup}>
              <Skeleton variant="avatar" width={32} height={32} />
              <Skeleton variant="rect" width={32} height={24} className={styles.pill} />
            </div>
          </div>

          {/* Mobile Header Icon Strip (Highlights, Profile, Bell, Theme) */}
          <div className={styles.mobileControls}>
            <Skeleton variant="avatar" width={34} height={34} />
            <Skeleton variant="avatar" width={34} height={34} />
            <Skeleton variant="avatar" width={34} height={34} />
            <Skeleton variant="rect" width={30} height={24} className={styles.pill} />
          </div>
        </div>
      </header>

      {/* Main 3-Column Responsive Workspace */}
      <div className={styles.dashboardContainer}>
        {/* Left Sidebar: Account Menu + Daily Business Highlights */}
        <aside className={styles.leftSidebar}>
          <div className={styles.leftSidebarInner}>
            <div className={styles.accountMenuHeader}>
              <div className={styles.accountMenuLeft}>
                <Skeleton variant="avatar" width={24} height={24} />
                <Skeleton variant="title" width={112} height={16} className={styles.noMargin} />
              </div>
              <Skeleton variant="rect" width={18} height={18} className={styles.compactRadius} />
            </div>

            <div className={styles.highlightsBlock}>
              <div className={styles.sectionHeadingRow}>
                <Skeleton variant="text" width={168} height={14} className={styles.noMargin} />
                <Skeleton variant="rect" width={46} height={18} className={styles.pill} />
              </div>

              {[1, 2, 3].map((idx) => (
                <div key={idx} className={styles.highlightCard}>
                  <div className={styles.highlightTopRow}>
                    <div className={styles.highlightSponsor}>
                      <Skeleton variant="avatar" width={24} height={24} />
                      <Skeleton variant="text" width={88} height={12} className={styles.noMargin} />
                    </div>
                    <Skeleton variant="rect" width={44} height={18} className={styles.pill} />
                  </div>
                  <Skeleton variant="title" width="82%" height={15} className={styles.noMargin} />
                  <Skeleton variant="text" width="96%" height={12} className={styles.noMargin} />
                  <Skeleton variant="text" width="68%" height={12} className={styles.noMargin} />
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Attention Feed */}
        <main className={styles.feedArea}>
          <div className={styles.feedTopStrip}>
            <div className={styles.feedFilterPills}>
              <Skeleton variant="rect" width={72} height={28} className={styles.pill} />
              <Skeleton variant="rect" width={92} height={28} className={styles.pill} />
              <Skeleton variant="rect" width={78} height={28} className={styles.pill} />
            </div>
            <Skeleton variant="rect" width={64} height={24} className={styles.pill} />
          </div>
          <FeedSkeleton count={feedCardsCount} />
        </main>

        {/* Right Sidebar: Profile Card + Invite Card + Wallet Card + Persona Tags */}
        <aside className={styles.rightSidebar}>
          <div className={styles.profileSection}>
            <div className={styles.profileIdentityRow}>
              <Skeleton variant="avatar" width={54} height={54} />
              <div className={styles.profileNameCol}>
                <Skeleton variant="title" width="72%" height={18} className={styles.noMargin} />
                <Skeleton variant="text" width="48%" height={13} className={styles.noMargin} />
              </div>
            </div>
            <Skeleton variant="text" width="92%" height={12} className={styles.noMargin} />
            <Skeleton variant="text" width="66%" height={12} className={styles.noMargin} />
            <div className={styles.profileStatsRow}>
              <Skeleton variant="text" width={74} height={14} className={styles.noMargin} />
              <Skeleton variant="text" width={58} height={14} className={styles.noMargin} />
              <Skeleton variant="text" width={64} height={14} className={styles.noMargin} />
            </div>
          </div>

          <div className={styles.inviteCard}>
            <Skeleton variant="title" width="46%" height={15} className={styles.noMargin} />
            <div className={styles.inviteInputRow}>
              <Skeleton variant="rect" width="100%" height={34} className={styles.compactRadius} />
              <Skeleton variant="rect" width={64} height={34} className={styles.pill} />
            </div>
          </div>

          <div className={styles.walletCard}>
            <div className={styles.walletHeaderRow}>
              <Skeleton variant="text" width={88} height={13} className={styles.noMargin} />
              <Skeleton variant="rect" width={48} height={20} className={styles.pill} />
            </div>
            <Skeleton variant="title" width="56%" height={28} className={styles.noMargin} />
            <div className={styles.walletButtonsRow}>
              <Skeleton variant="rect" width="100%" height={36} className={styles.pill} />
              <Skeleton variant="rect" width="100%" height={36} className={styles.pill} />
            </div>
          </div>

          <div className={styles.personaRow}>
            <Skeleton variant="rect" width={76} height={26} className={styles.pill} />
            <Skeleton variant="rect" width={94} height={26} className={styles.pill} />
            <Skeleton variant="rect" width={68} height={26} className={styles.pill} />
            <Skeleton variant="rect" width={82} height={26} className={styles.pill} />
          </div>
        </aside>
      </div>
    </div>
  );
}
