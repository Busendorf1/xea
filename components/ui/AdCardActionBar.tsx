"use client";

import React from "react";
import { Share2 } from "lucide-react";
import styles from "./AdCard.module.css";
import { formatCurrency } from "@/lib/utils/currency";
import AdInteractionHandler from "@/components/ui/AdInteractionHandler";
import type { Ad } from "@/components/ui/AdCard";
import type { InteractionData } from "@/lib/hooks/useFeedActions";

export interface AdCardActionBarProps {
  ad: Ad;
  userEmail: string;
  brandName: string;
  targetLink: string;
  actionButtons: string[];
  isPlatformPost: boolean;
  isOwner: boolean;
  isVerified: boolean;
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
  isTextReaderOpen: boolean;
  setIsTextReaderOpen: (open: boolean) => void;
  handleAction: (type: "seen" | "earn" | "mutual", fn: () => Promise<boolean>) => Promise<void>;
  handleCtaClick: (actionType: string) => void;
  onMarkSeen: (ad: Ad) => Promise<boolean>;
  onAdEarn: (ad: Ad, interactionData?: InteractionData) => Promise<boolean>;
  onAdMutual: (ad: Ad) => Promise<boolean>;
  onShare: (adId: string) => void;
  showToast: (msg: string) => void;
  getIcon: (type: string) => React.ReactNode;
  getHref: (type: string, value: string, adItem?: Ad) => string;
}

export const AdCardActionBar: React.FC<AdCardActionBarProps> = React.memo(function AdCardActionBar({
  ad,
  userEmail,
  brandName,
  targetLink,
  actionButtons,
  isPlatformPost,
  isOwner,
  isVerified,
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
  isTextReaderOpen,
  setIsTextReaderOpen,
  handleAction,
  handleCtaClick,
  onMarkSeen,
  onAdEarn,
  onAdMutual,
  onShare,
  showToast,
  getIcon,
  getHref,
}) {
  if (ad.ad_type === "product_sales") {
    return (
      <div className={styles.productSalesActionBar}>
        <div className={styles.ctaButtonsGroup}>
          <span className={styles.productPriceText}>
            {formatCurrency(ad.product_price || 0, isPlatformPost ? undefined : ad.country)}
          </span>
          <a
            href={ad.product_cta_link ? (ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`) : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.productCtaButton}
            onClick={() => handleCtaClick((ad.product_cta_type || "Buy").toLowerCase().replace(/\s+/g, "_"))}
          >
            {ad.product_cta_type || "Buy"}
          </a>

          {actionButtons.map((type) => {
            const isReadMore = type === "action_read_more";
            if (isReadMore) {
              return (
                <button
                  key={`${type}-${ad.id}`}
                  type="button"
                  className={`${styles.iconButton} ${isTextReaderOpen ? styles.expandedButton : ""}`}
                  title="Read Full Post"
                  onClick={() => {
                    setIsTextReaderOpen(true);
                    handleCtaClick("read_more");
                  }}
                >
                  {getIcon(type)}
                </button>
              );
            }
            return (
              <a
                key={`${type}-${ad.id}`}
                href={getHref(type, ad[type as keyof Ad] as string, ad)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.iconButton}
                title={type.replace("action_", "")}
                onClick={() => handleCtaClick(type.replace("action_", ""))}
              >
                {getIcon(type)}
              </a>
            );
          })}

          <button
            title="Share Ad"
            className={styles.iconButton}
            type="button"
            onClick={() => {
              try {
                const encodedId = btoa(ad.id.toString());
                const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
                navigator.clipboard.writeText(shareUrl).then(() => {
                  showToast("Link copied to clipboard");
                }).catch(() => {
                  onShare(ad.id);
                });
              } catch {
                onShare(ad.id);
              }
            }}
          >
            <Share2 size={14} strokeWidth={1.5} />
          </button>
        </div>

        {!isPlatformPost && (
          <div className={styles.productRightGroup}>
            {isOwner ? (
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
                  <span className={styles.fromBrandText}>
                    Visit {brandName}
                  </span>
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
                  <span className={styles.fromBrandText}>
                    Visit {brandName}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.actionButtons}>
      <div className={styles.ctaButtonsGroup}>
        {ad.product_cta_link && (
          <a
            href={ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.productCtaButton}
            onClick={() => handleCtaClick((ad.product_cta_type || "Comment").toLowerCase().replace(/\s+/g, "_"))}
          >
            {ad.product_cta_type || "Comment"}
          </a>
        )}
        {actionButtons.map((type) => {
          const isReadMore = type === "action_read_more";
          if (!isReadMore && !isVerified) return null;

          if (isReadMore) {
            return (
              <button
                key={`${type}-${ad.id}`}
                type="button"
                className={`${styles.iconButton} ${isTextReaderOpen ? styles.expandedButton : ""}`}
                title="Read Full Post"
                onClick={() => {
                  setIsTextReaderOpen(true);
                  handleCtaClick("read_more");
                }}
              >
                {getIcon(type)}
              </button>
            );
          }

          return (
            <a
              key={`${type}-${ad.id}`}
              href={getHref(type, ad[type as keyof Ad] as string, ad)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.iconButton}
              title={type.replace("action_", "")}
              onClick={() => handleCtaClick(type.replace("action_", ""))}
            >
              {getIcon(type)}
            </a>
          );
        })}

        <button
          title="Share Ad"
          className={styles.iconButton}
          type="button"
          onClick={() => {
            try {
              const encodedId = btoa(ad.id.toString());
              const shareUrl = `${window.location.origin}/login?view&Earn Ads by Paayh=${encodedId}`;
              navigator.clipboard.writeText(shareUrl).then(() => {
                showToast("Link copied to clipboard");
              }).catch(() => {
                onShare(ad.id);
              });
            } catch {
              onShare(ad.id);
            }
          }}
        >
          <Share2 size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className={styles.interactionButtonGroup}>
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
              <span className={styles.fromBrandText}>
                Visit {brandName}
              </span>
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
              <span className={styles.fromBrandText}>
                Visit {brandName}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
