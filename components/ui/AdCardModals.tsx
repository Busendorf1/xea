"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ArrowLeft, Share2 } from "lucide-react";
import styles from "./AdCard.module.css";
import AdOptionsMenu from "./AdOptionsMenu";
import AdInteractionHandler from "./AdInteractionHandler";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
import { isVideoUrl } from "./MediaCarousel";
import { formatCurrency } from "@/lib/utils/currency";
import type { Ad } from "./AdCard";
import type { InteractionData } from "@/lib/hooks/useFeedActions";

const FullscreenVideoPlayer = dynamic(() => import("@/components/MyAds/FullscreenVideoPlayer"), {
  ssr: false,
});

interface SharedModalProps {
  ad: Ad;
  userEmail: string;
  brandName: string;
  targetLink: string;
  actionButtons: string[];
  isPlatformPost: boolean;
  isOwner: boolean;
  isMutualTarget: boolean;
  isAlreadyMutual: boolean;
  viewerProfile: any;
  isProcessing: boolean;
  isSuspended: boolean;
  seenAds: string[];
  activeAction: "seen" | "earn" | "mutual" | null;
  successAction: "seen" | "earn" | "mutual" | null;
  interactionSecondsLeft: number;
  setInteractionSecondsLeft: React.Dispatch<React.SetStateAction<number>>;
  interactionStage: "countdown" | "challenge" | "unlocked";
  setInteractionStage: React.Dispatch<React.SetStateAction<"countdown" | "challenge" | "unlocked">>;
  handleAction: (type: "seen" | "earn" | "mutual", fn: () => Promise<boolean>) => Promise<void>;
  onMarkSeen: (ad: Ad) => Promise<boolean>;
  onAdEarn: (ad: Ad, interactionData?: InteractionData) => Promise<boolean>;
  onAdMutual: (ad: Ad) => Promise<boolean>;
  onShare: (id: string) => void;
  handleCtaClick: (clickType: string) => void;
  handleDismiss: (adId: string) => void;
  showToast: (msg: string) => void;
  getHref: (type: string, value: string, ad?: Ad) => string;
  getIcon: (type: string) => React.ReactNode;
}

export interface AdMediaLightboxModalProps extends SharedModalProps {
  lightboxIndex: number;
  setLightboxIndex: React.Dispatch<React.SetStateAction<number | null>>;
  mediaUrls: string[];
  isLightboxClosing: boolean;
  closeLightbox: () => void;
  showLightboxMenu: boolean;
  setShowLightboxMenu: (show: boolean) => void;
  lightboxSwipeOffsetY: number;
  setLightboxSwipeOffsetY: React.Dispatch<React.SetStateAction<number>>;
}

export const AdMediaLightboxModal = React.memo(function AdMediaLightboxModal({
  ad,
  userEmail,
  brandName,
  targetLink,
  actionButtons,
  isPlatformPost,
  isOwner,
  isMutualTarget,
  isAlreadyMutual,
  viewerProfile,
  isProcessing,
  isSuspended,
  seenAds,
  activeAction,
  successAction,
  interactionSecondsLeft,
  setInteractionSecondsLeft,
  interactionStage,
  setInteractionStage,
  handleAction,
  onMarkSeen,
  onAdEarn,
  onAdMutual,
  onShare,
  handleCtaClick,
  handleDismiss,
  showToast,
  getHref,
  getIcon,
  lightboxIndex,
  setLightboxIndex,
  mediaUrls,
  isLightboxClosing,
  closeLightbox,
  showLightboxMenu,
  setShowLightboxMenu,
  lightboxSwipeOffsetY,
  setLightboxSwipeOffsetY,
}: AdMediaLightboxModalProps) {
  const lightboxTouchStartXRef = useRef<number | null>(null);
  const lightboxTouchStartYRef = useRef<number | null>(null);
  const lightboxPointerDownRef = useRef(false);

  if (typeof document === "undefined" || !mediaUrls[lightboxIndex]) return null;

  return createPortal(
    <div
      className={`${styles.lightboxOverlay} ${isLightboxClosing ? styles.lightboxOverlayExiting : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Media view"
      onClick={closeLightbox}
    >
      <div
        className={`${styles.lightboxDialog} ${isLightboxClosing ? styles.lightboxDialogExiting : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar: Back Arrow (Left) + Top-Left Line Indicators + Report Ad Menu (Right) */}
        <div className={styles.lightboxTopBar}>
          <div className={styles.lightboxTopLeftGroup}>
            <button
              type="button"
              className={styles.lightboxIconBtn}
              onClick={closeLightbox}
              aria-label="Back to feed"
              title="Back"
            >
              <ArrowLeft size={20} strokeWidth={2.2} />
            </button>

            {mediaUrls.length > 1 && (
              <div
                className={styles.lightboxLineIndicators}
                aria-label={`Slide ${lightboxIndex + 1} of ${mediaUrls.length}`}
              >
                {mediaUrls.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`${styles.topLineSegment} ${
                      idx === lightboxIndex ? styles.topLineSegmentActive : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(idx);
                    }}
                    aria-label={`Go to media ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={styles.lightboxMenuContainer}>
            <AdOptionsMenu
              adId={ad.id}
              advertiserEmail={ad.user_email}
              showThreeDotMenu={showLightboxMenu}
              onToggleMenu={setShowLightboxMenu}
              onDismiss={handleDismiss}
            />
          </div>
        </div>

        {/* Center Media Stage with Horizontal Swipe & Vertical Swipe-to-Dismiss */}
        <div
          className={styles.lightboxStage}
          style={{
            transform:
              lightboxSwipeOffsetY !== 0
                ? `translate3d(0, ${lightboxSwipeOffsetY}px, 0) scale(${Math.max(
                    0.86,
                    1 - Math.abs(lightboxSwipeOffsetY) / 900
                  )})`
                : undefined,
            opacity:
              lightboxSwipeOffsetY !== 0
                ? Math.max(0.35, 1 - Math.abs(lightboxSwipeOffsetY) / 380)
                : 1,
            transition:
              lightboxSwipeOffsetY === 0
                ? "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease"
                : "none",
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              lightboxTouchStartXRef.current = e.touches[0].clientX;
              lightboxTouchStartYRef.current = e.touches[0].clientY;
            }
          }}
          onTouchMove={(e) => {
            if (
              lightboxTouchStartXRef.current !== null &&
              lightboxTouchStartYRef.current !== null &&
              e.touches.length === 1
            ) {
              const deltaX = e.touches[0].clientX - lightboxTouchStartXRef.current;
              const deltaY = e.touches[0].clientY - lightboxTouchStartYRef.current;
              if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
                setLightboxSwipeOffsetY(deltaY);
              }
            }
          }}
          onTouchEnd={(e) => {
            if (
              lightboxTouchStartXRef.current !== null &&
              lightboxTouchStartYRef.current !== null &&
              e.changedTouches.length > 0
            ) {
              const deltaX = e.changedTouches[0].clientX - lightboxTouchStartXRef.current;
              const deltaY = e.changedTouches[0].clientY - lightboxTouchStartYRef.current;
              lightboxTouchStartXRef.current = null;
              lightboxTouchStartYRef.current = null;

              if (Math.abs(deltaY) > 65 && Math.abs(deltaY) > Math.abs(deltaX)) {
                closeLightbox();
                return;
              }
              setLightboxSwipeOffsetY(0);

              if (mediaUrls.length > 1 && Math.abs(deltaX) > 40 && Math.abs(deltaX) >= Math.abs(deltaY)) {
                if (deltaX < 0) {
                  setLightboxIndex((prev) =>
                    prev !== null ? Math.min(mediaUrls.length - 1, prev + 1) : null
                  );
                } else {
                  setLightboxIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
                }
              }
            }
          }}
          onMouseDown={(e) => {
            lightboxPointerDownRef.current = true;
            lightboxTouchStartXRef.current = e.clientX;
            lightboxTouchStartYRef.current = e.clientY;
          }}
          onMouseMove={(e) => {
            if (
              !lightboxPointerDownRef.current ||
              lightboxTouchStartXRef.current === null ||
              lightboxTouchStartYRef.current === null
            ) {
              return;
            }
            const deltaX = e.clientX - lightboxTouchStartXRef.current;
            const deltaY = e.clientY - lightboxTouchStartYRef.current;
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 12) {
              setLightboxSwipeOffsetY(deltaY);
            }
          }}
          onMouseUp={(e) => {
            if (
              !lightboxPointerDownRef.current ||
              lightboxTouchStartXRef.current === null ||
              lightboxTouchStartYRef.current === null
            ) {
              return;
            }
            lightboxPointerDownRef.current = false;
            const deltaX = e.clientX - lightboxTouchStartXRef.current;
            const deltaY = e.clientY - lightboxTouchStartYRef.current;
            lightboxTouchStartXRef.current = null;
            lightboxTouchStartYRef.current = null;

            if (Math.abs(deltaY) > 70 && Math.abs(deltaY) > Math.abs(deltaX)) {
              closeLightbox();
              return;
            }
            setLightboxSwipeOffsetY(0);

            if (mediaUrls.length > 1 && Math.abs(deltaX) > 45 && Math.abs(deltaX) >= Math.abs(deltaY)) {
              if (deltaX < 0) {
                setLightboxIndex((prev) =>
                  prev !== null ? Math.min(mediaUrls.length - 1, prev + 1) : null
                );
              } else {
                setLightboxIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
              }
            }
          }}
          onMouseLeave={() => {
            if (lightboxPointerDownRef.current) {
              lightboxPointerDownRef.current = false;
              lightboxTouchStartXRef.current = null;
              lightboxTouchStartYRef.current = null;
              setLightboxSwipeOffsetY(0);
            }
          }}
        >
          {(() => {
            const activeUrl = mediaUrls[lightboxIndex];
            const isVid = isVideoUrl(activeUrl) || (lightboxIndex === 0 && !!ad.hls_url);
            const itemHlsSrc = activeUrl.includes(".m3u8")
              ? activeUrl
              : lightboxIndex === 0 && ad.hls_url
              ? ad.hls_url
              : undefined;

            if (isVid) {
              return (
                <div className={styles.lightboxVideoPlayerWrap} onClick={(e) => e.stopPropagation()}>
                  <FullscreenVideoPlayer
                    key={`lightbox-${activeUrl}`}
                    src={activeUrl}
                    hlsSrc={itemHlsSrc}
                    autoPlay={true}
                  />
                </div>
              );
            }
            return (
              <img
                src={activeUrl}
                alt={`${brandName} media ${lightboxIndex + 1}`}
                className={styles.lightboxMediaImage}
                draggable={false}
              />
            );
          })()}
        </div>

        {/* Bottom Bar: CTA Buttons + Mutual / Seen / Earn Interaction Handler */}
        <div className={styles.lightboxBottomBar}>
          <div className={styles.lightboxCtaGroup}>
            {ad.ad_type === "product_sales" && ad.product_price ? (
              <span className={styles.productPriceText}>
                {formatCurrency(ad.product_price || 0, ad.country)}
              </span>
            ) : null}

            {ad.product_cta_link && (
              <a
                href={
                  ad.product_cta_link.startsWith("http")
                    ? ad.product_cta_link
                    : `https://${ad.product_cta_link}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className={styles.productCtaButton}
                onClick={() =>
                  handleCtaClick(
                    (ad.product_cta_type || (ad.ad_type === "product_sales" ? "Buy" : "Comment"))
                      .toLowerCase()
                      .replace(/\s+/g, "_")
                  )
                }
              >
                {ad.product_cta_type || (ad.ad_type === "product_sales" ? "Buy" : "Comment")}
              </a>
            )}

            {actionButtons
              .filter((type) => type !== "action_read_more")
              .map((type) => (
                <a
                  key={`lb-${type}-${ad.id}`}
                  href={getHref(type, ad[type as keyof Ad] as string, ad)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.lightboxActionBtn}
                  title={type.replace("action_", "")}
                  onClick={() => handleCtaClick(type.replace("action_", ""))}
                >
                  {getIcon(type)}
                </a>
              ))}

            <button
              title="Share Ad"
              className={styles.lightboxActionBtn}
              type="button"
              onClick={() => {
                try {
                  const encodedId = btoa(ad.id.toString());
                  const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
                  navigator.clipboard
                    .writeText(shareUrl)
                    .then(() => {
                      showToast("Link copied to clipboard");
                    })
                    .catch(() => {
                      onShare(ad.id);
                    });
                } catch {
                  onShare(ad.id);
                }
              }}
            >
              <Share2 size={15} strokeWidth={1.7} />
            </button>
          </div>

          <div className={styles.lightboxInteractionGroup}>
            {isPlatformPost || isOwner ? (
              <div className={styles.fromBrandContainer}>
                {targetLink && targetLink !== "#" ? (
                  <a
                    href={targetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fromBrandBtn}
                    title={`Visit ${brandName}`}
                    onClick={() => handleCtaClick("brand_visit")}
                  >
                    Visit {brandName}
                  </a>
                ) : (
                  <span className={styles.fromBrandText}>Visit {brandName}</span>
                )}
              </div>
            ) : !seenAds.includes(ad.id) || activeAction !== null || successAction !== null ? (
              <AdInteractionHandler
                ad={ad}
                userEmail={userEmail}
                isPlatformPost={isPlatformPost}
                isMutualTarget={isMutualTarget}
                isAlreadyMutual={isAlreadyMutual}
                viewerProfile={viewerProfile}
                isProcessing={isProcessing}
                isSuspended={isSuspended}
                successAction={successAction}
                activeAction={activeAction}
                handleAction={handleAction}
                onMarkSeen={onMarkSeen}
                onAdEarn={onAdEarn}
                onAdMutual={onAdMutual}
                brandName={brandName}
                targetLink={targetLink}
                forceInView={true}
                externalSecondsLeft={interactionSecondsLeft}
                onSecondsLeftChange={setInteractionSecondsLeft}
                externalStage={interactionStage}
                onStageChange={setInteractionStage}
              />
            ) : (
              <div className={styles.fromBrandContainer}>
                {targetLink && targetLink !== "#" ? (
                  <a
                    href={targetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fromBrandBtn}
                    title={`Visit ${brandName}`}
                    onClick={() => handleCtaClick("brand_visit")}
                  >
                    Visit {brandName}
                  </a>
                ) : (
                  <span className={styles.fromBrandText}>Visit {brandName}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});

export interface AdTextReaderModalProps extends SharedModalProps {
  isTextReaderClosing: boolean;
  closeTextReader: () => void;
  adWordCount: number;
  showReaderMenu: boolean;
  setShowReaderMenu: (show: boolean) => void;
  advertiserProfile: any;
  formattedAdContent: string;
  formatTimestamp: (timestamp: string | null | undefined) => string;
}

export const AdTextReaderModal = React.memo(function AdTextReaderModal({
  ad,
  userEmail,
  brandName,
  targetLink,
  actionButtons,
  isPlatformPost,
  isOwner,
  isMutualTarget,
  isAlreadyMutual,
  viewerProfile,
  isProcessing,
  isSuspended,
  seenAds,
  activeAction,
  successAction,
  interactionSecondsLeft,
  setInteractionSecondsLeft,
  interactionStage,
  setInteractionStage,
  handleAction,
  onMarkSeen,
  onAdEarn,
  onAdMutual,
  onShare,
  handleCtaClick,
  handleDismiss,
  showToast,
  getHref,
  getIcon,
  isTextReaderClosing,
  closeTextReader,
  adWordCount,
  showReaderMenu,
  setShowReaderMenu,
  advertiserProfile,
  formattedAdContent,
  formatTimestamp,
}: AdTextReaderModalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`${styles.lightboxOverlay} ${isTextReaderClosing ? styles.lightboxOverlayExiting : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Full post reader"
      onClick={closeTextReader}
    >
      <div
        className={`${styles.textReaderDialog} ${isTextReaderClosing ? styles.textReaderDialogExiting : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar: Back Arrow (Left) + Word Count / Read Time (Center) + Report Ad Menu (Right) */}
        <div className={styles.textReaderTopBar}>
          <button
            type="button"
            className={styles.lightboxIconBtn}
            onClick={closeTextReader}
            aria-label="Back to feed"
            title="Back"
          >
            <ArrowLeft size={20} strokeWidth={2.2} />
          </button>

          <span className={styles.lightboxSlideCounter}>
            {adWordCount.toLocaleString()} {adWordCount === 1 ? "word" : "words"} •{" "}
            {Math.max(1, Math.ceil(adWordCount / 200))} min read
          </span>

          <div className={styles.lightboxMenuContainer}>
            <AdOptionsMenu
              adId={ad.id}
              advertiserEmail={ad.user_email}
              showThreeDotMenu={showReaderMenu}
              onToggleMenu={setShowReaderMenu}
              onDismiss={handleDismiss}
            />
          </div>
        </div>

        {/* Scrollable Full-Text Reader Body */}
        <div className={styles.textReaderBody}>
          <div className={styles.textReaderAuthorRow}>
            <Avatar
              src={ad.custom_sponsor_logo || advertiserProfile?.profileImage}
              name={brandName}
              email={ad.user_email}
              size={42}
              alt={brandName}
              gender={advertiserProfile?.gender || (ad as any).gender || null}
            />
            <div className={styles.textReaderAuthorMeta}>
              <div className={styles.textReaderAuthorNameRow}>
                <span>{brandName}</span>
                {Boolean(isPlatformPost || advertiserProfile?.monetized) && (
                  <VerifiedBadge size={14} title="Verified Account" />
                )}
                {(ad.is_ai_content || (ad as any).is_ai || (ad as any).isAiContent) && (
                  <span className={styles.aiBadge} title="AI-generated or AI-assisted content">
                    AI Content
                  </span>
                )}
              </div>
              <span className={styles.textReaderAuthorSub}>
                {formatTimestamp(ad.created_at)} · Sponsored Post
              </span>
            </div>
          </div>

          <p className={styles.textReaderContent}>{formattedAdContent}</p>
        </div>

        {/* Bottom Bar: CTA Buttons + Mutual / Seen / Earn Interaction Handler */}
        <div className={styles.lightboxBottomBar}>
          <div className={styles.lightboxCtaGroup}>
            {ad.product_cta_link && (
              <a
                href={
                  ad.product_cta_link.startsWith("http")
                    ? ad.product_cta_link
                    : `https://${ad.product_cta_link}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className={styles.productCtaButton}
                onClick={() =>
                  handleCtaClick(
                    (ad.product_cta_type || "Comment").toLowerCase().replace(/\s+/g, "_")
                  )
                }
              >
                {ad.product_cta_type || "Comment"}
              </a>
            )}

            {actionButtons
              .filter((type) => type !== "action_read_more")
              .map((type) => (
                <a
                  key={`reader-${type}-${ad.id}`}
                  href={getHref(type, ad[type as keyof Ad] as string, ad)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.lightboxActionBtn}
                  title={type.replace("action_", "")}
                  onClick={() => handleCtaClick(type.replace("action_", ""))}
                >
                  {getIcon(type)}
                </a>
              ))}

            <button
              title="Share Ad"
              className={styles.lightboxActionBtn}
              type="button"
              onClick={() => {
                try {
                  const encodedId = btoa(ad.id.toString());
                  const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
                  navigator.clipboard
                    .writeText(shareUrl)
                    .then(() => {
                      showToast("Link copied to clipboard");
                    })
                    .catch(() => {
                      onShare(ad.id);
                    });
                } catch {
                  onShare(ad.id);
                }
              }}
            >
              <Share2 size={15} strokeWidth={1.7} />
            </button>
          </div>

          <div className={styles.lightboxInteractionGroup}>
            {isPlatformPost || isOwner ? (
              <div className={styles.fromBrandContainer}>
                {targetLink && targetLink !== "#" ? (
                  <a
                    href={targetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fromBrandBtn}
                    title={`Visit ${brandName}`}
                    onClick={() => handleCtaClick("brand_visit")}
                  >
                    Visit {brandName}
                  </a>
                ) : (
                  <span className={styles.fromBrandText}>Visit {brandName}</span>
                )}
              </div>
            ) : !seenAds.includes(ad.id) || activeAction !== null || successAction !== null ? (
              <AdInteractionHandler
                ad={ad}
                userEmail={userEmail}
                isPlatformPost={isPlatformPost}
                isMutualTarget={isMutualTarget}
                isAlreadyMutual={isAlreadyMutual}
                viewerProfile={viewerProfile}
                isProcessing={isProcessing}
                isSuspended={isSuspended}
                successAction={successAction}
                activeAction={activeAction}
                handleAction={handleAction}
                onMarkSeen={onMarkSeen}
                onAdEarn={onAdEarn}
                onAdMutual={onAdMutual}
                brandName={brandName}
                targetLink={targetLink}
                forceInView={true}
                externalSecondsLeft={interactionSecondsLeft}
                onSecondsLeftChange={setInteractionSecondsLeft}
                externalStage={interactionStage}
                onStageChange={setInteractionStage}
              />
            ) : (
              <div className={styles.fromBrandContainer}>
                {targetLink && targetLink !== "#" ? (
                  <a
                    href={targetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fromBrandBtn}
                    title={`Visit ${brandName}`}
                    onClick={() => handleCtaClick("brand_visit")}
                  >
                    Visit {brandName}
                  </a>
                ) : (
                  <span className={styles.fromBrandText}>Visit {brandName}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});
