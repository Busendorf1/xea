import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Share2, ArrowLeft } from "lucide-react";
import styles from "./AdCard.module.css";
import AdInteractionHandler from "./AdInteractionHandler";
import { InteractionData } from "@/lib/hooks/useFeedActions";
import Avatar from "./Avatar";
import HighlightCard from "./HighlightCard";
import AdOptionsMenu, { type AdReportType } from "./AdOptionsMenu";
import MediaCarousel, { isVideoUrl } from "./MediaCarousel";
import AdvertiserHoverCard, { AdvertiserProfileData } from "./AdvertiserHoverCard";
import VerifiedBadge from "./VerifiedBadge";
import RoleStarBadges from "./RoleStarBadges";
import { AdMediaLightboxModal, AdTextReaderModal } from "./AdCardModals";
import { AdCardActionBar } from "./AdCardActionBar";
import {
  preloadCallbacks,
  playCallbacks,
  getSharedPreloadObserver,
  getSharedPlayObserver,
  getHref,
  formatTimestamp,
  type BaseAd,
  type VideoAd,
  type CarouselAd,
  type TextAd,
  type AdUnion,
  type Ad,
} from "./adCardUtils";
import { getAdActionIcon as getIcon, attachAdCardSlots } from "./adCardSlots";

export type { BaseAd, VideoAd, CarouselAd, TextAd, AdUnion, Ad };

const FullscreenVideoPlayer = dynamic(() => import("@/components/MyAds/FullscreenVideoPlayer"), { ssr: false });

interface AdCardProps {
  ad: Ad;
  userEmail: string;
  advertiserProfiles: Record<string, AdvertiserProfileData>;
  viewerProfile: {
    balance: number;
    mutual_count: number;
    mutuals: string[];
    monetized: boolean;
    suspended_until?: string | null;
    cooldown_until?: string | null;
    cooldown_type?: "pacing_15m" | "review_hours" | null;
  } | null;
  seenAds: string[];
  processingAds: string[];
  onAdEarn: (ad: Ad, interactionData?: InteractionData) => Promise<boolean>;
  onAdMutual: (ad: Ad) => Promise<boolean>;
  onMarkSeen: (ad: Ad) => Promise<boolean>;
  onShare: (id: string) => void;
  onDismiss: (adId: string, advertiserEmail?: string, reportType?: AdReportType) => void;
  style?: React.CSSProperties;
}

import { formatCurrency } from "@/lib/utils/currency";

function AdCard({
  ad,
  userEmail,
  advertiserProfiles,
  viewerProfile,
  seenAds,
  processingAds,
  onAdEarn,
  onAdMutual,
  onMarkSeen,
  onShare,
  onDismiss: _onDismiss,
  style,
}: AdCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isCardVisible, setIsCardVisible] = useState(false);
  const [isPreloadWarm, setIsPreloadWarm] = useState(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isLightboxClosing, setIsLightboxClosing] = useState(false);
  const [showLightboxMenu, setShowLightboxMenu] = useState(false);
  const [isTextReaderOpen, setIsTextReaderOpen] = useState(false);
  const [isTextReaderClosing, setIsTextReaderClosing] = useState(false);
  const [showReaderMenu, setShowReaderMenu] = useState(false);

  const [lightboxSwipeOffsetY, setLightboxSwipeOffsetY] = useState(0);

  const closeLightbox = useCallback(() => {
    if (isLightboxClosing) return;
    setIsLightboxClosing(true);
    setTimeout(() => {
      setLightboxIndex(null);
      setIsLightboxClosing(false);
      setShowLightboxMenu(false);
      setLightboxSwipeOffsetY(0);
    }, 220);
  }, [isLightboxClosing]);

  const openLightbox = useCallback((idx: number) => {
    setIsLightboxClosing(false);
    setLightboxSwipeOffsetY(0);
    setLightboxIndex(idx);
  }, []);

  const closeTextReader = useCallback(() => {
    if (isTextReaderClosing) return;
    setIsTextReaderClosing(true);
    setTimeout(() => {
      setIsTextReaderOpen(false);
      setIsTextReaderClosing(false);
      setShowReaderMenu(false);
    }, 220);
  }, [isTextReaderClosing]);

  const openTextReader = useCallback(() => {
    setIsTextReaderClosing(false);
    setIsTextReaderOpen(true);
  }, []);
  const [interactionSecondsLeft, setInteractionSecondsLeft] = useState(16);
  const [interactionStage, setInteractionStage] = useState<"countdown" | "challenge" | "unlocked">("countdown");
  const lightboxTouchStartXRef = useRef<number | null>(null);
  const lightboxTouchStartYRef = useRef<number | null>(null);
  const lightboxPointerDownRef = useRef(false);

  const [activeAction, setActiveAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [successAction, setSuccessAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  const mediaUrls = useMemo(() => {
    return ad.ad_media
      ? ad.ad_media.split(",").map((url) => url.trim()).filter(Boolean)
      : [];
  }, [ad.ad_media]);

  const isTextOnlyAd = mediaUrls.length === 0 && !ad.hls_url;

  const formattedAdContent = useMemo(() => {
    if (!ad.ad_content) return "";
    const trimmed = ad.ad_content.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
  }, [ad.ad_content]);

  const adWordCount = useMemo(() => {
    return formattedAdContent ? formattedAdContent.split(/\s+/).length : 0;
  }, [formattedAdContent]);

  const isLongTextAd = useMemo(() => {
    return Boolean(
      ad.ad_type !== "product_sales" &&
        (ad.ad_action_buttons?.includes("read_more") || formattedAdContent.length > 220)
    );
  }, [ad.ad_type, ad.ad_action_buttons, formattedAdContent.length]);

  const canOpenTextReader = useMemo(() => {
    return Boolean(
      ad.ad_type !== "product_sales" &&
        formattedAdContent.length > 0 &&
        (isTextOnlyAd || isLongTextAd)
    );
  }, [ad.ad_type, formattedAdContent.length, isTextOnlyAd, isLongTextAd]);

  useEffect(() => {
    if (lightboxIndex !== null || isTextReaderOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [lightboxIndex, isTextReaderOpen]);

  useEffect(() => {
    if (lightboxIndex === null && !isTextReaderOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxIndex !== null) closeLightbox();
        if (isTextReaderOpen) closeTextReader();
      } else if (lightboxIndex !== null && e.key === "ArrowLeft" && mediaUrls.length > 1) {
        setLightboxIndex((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      } else if (lightboxIndex !== null && e.key === "ArrowRight" && mediaUrls.length > 1) {
        setLightboxIndex((prev) => (prev !== null ? Math.min(mediaUrls.length - 1, prev + 1) : null));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, isTextReaderOpen, mediaUrls.length, closeLightbox, closeTextReader]);

  const handleDismiss = useCallback(
    (adId: string, advertiserEmail?: string, reportType?: AdReportType) => {
      setLightboxIndex(null);
      setShowLightboxMenu(false);
      setIsTextReaderOpen(false);
      setShowReaderMenu(false);
      setIsDismissing(true);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        _onDismiss(adId, advertiserEmail, reportType);
      }, 380);
    },
    [_onDismiss]
  );

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: msg } }));
    }
  }, []);

  const cardRef = useRef<HTMLDivElement>(null);

  // Two-tiered shared IntersectionObserver pool:
  // Tier 1: 1400px rootMargin pre-warms video buffer/first-frame in background ahead of viewport
  // Tier 2: 0.15 threshold triggers smooth autoplay the instant card enters visible view
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    // Detect if inside an overflow-y: auto container (<main>) that is genuinely scrollable; fallback to window viewport (null)
    const candidateRoot = el.closest("main") || null;
    const isScrollable = Boolean(
      candidateRoot &&
      typeof window !== "undefined" &&
      window.getComputedStyle(candidateRoot).overflowY.match(/(auto|scroll)/i) &&
      candidateRoot.scrollHeight > candidateRoot.clientHeight
    );
    const scrollRoot = isScrollable ? candidateRoot : null;
    const preloadObs = getSharedPreloadObserver(scrollRoot);
    const playObs = getSharedPlayObserver(scrollRoot);

    preloadCallbacks.set(el, setIsPreloadWarm);
    playCallbacks.set(el, setIsCardVisible);

    preloadObs?.observe(el);
    playObs?.observe(el);

    return () => {
      preloadObs?.unobserve(el);
      playObs?.unobserve(el);
      preloadCallbacks.delete(el);
      playCallbacks.delete(el);
    };
  }, []);

  useEffect(() => {
    const onOtherVideoUnmute = (e: Event) => {
      const customEvent = e as CustomEvent<{ adId: string }>;
      if (customEvent.detail?.adId && customEvent.detail.adId !== ad.id) {
        setIsMuted(true);
      }
    };
    window.addEventListener("xea:feed-video-unmute", onOtherVideoUnmute);
    return () => window.removeEventListener("xea:feed-video-unmute", onOtherVideoUnmute);
  }, [ad.id]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (!next && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("xea:feed-video-unmute", { detail: { adId: ad.id } }));
      }
      return next;
    });
  }, [ad.id]);

  const handleToggleMenu = useCallback((show: boolean) => {
    setShowThreeDotMenu(show);
  }, []);

  const handleAction = useCallback(async (type: "seen" | "earn" | "mutual", fn: () => Promise<boolean>) => {
    if (activeAction) return;
    setActiveAction(type);
    try {
      const success = await fn();
      if (success) {
        setSuccessAction(type);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error("Action error:", err);
    } finally {
      setActiveAction(null);
      setSuccessAction(null);
    }
  }, [activeAction]);

  const isOwner = useMemo(() => {
    return Boolean(userEmail && ad.user_email && ad.user_email.toLowerCase() === userEmail.toLowerCase());
  }, [userEmail, ad.user_email]);

  const isPlatformPost = useMemo(() => {
    const emailLower = (ad.user_email || "").toLowerCase().trim();
    const isPlatformAdmin =
      emailLower === "admin@paayh.com" ||
      emailLower === "system@paayh.com" ||
      ad.ad_type === "admin_broadcast";
    // An ad is an unpaid platform post if it is an admin/platform campaign or has no pay-per-impression reward / budget
    return Boolean(
      isPlatformAdmin ||
      ad.is_admin_post ||
      !ad.cost_per_impression ||
      Number(ad.cost_per_impression) <= 0 ||
      !ad.impressions ||
      Number(ad.impressions) <= 0
    );
  }, [ad.user_email, ad.ad_type, ad.is_admin_post, ad.cost_per_impression, ad.impressions]);

  // Automatic viewability tracking for platform / zero-budget posts:
  // When viewed continuously in the active viewport for 1.5 seconds, automatically register as seen
  // so the post records impression in ClickHouse / DB and is filtered on feed refresh.
  useEffect(() => {
    if (!isPlatformPost || !isCardVisible || seenAds.includes(ad.id)) return;

    const timer = setTimeout(() => {
      onMarkSeen(ad).catch((err) => console.error("Auto seen tracking error:", err));
    }, 1500);

    return () => clearTimeout(timer);
  }, [isPlatformPost, isCardVisible, seenAds, ad, onMarkSeen]);

  const handleCtaClick = useCallback(
    (clickType: string) => {
      fetch("/api/campaigns/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: ad.id, clickType }),
      }).catch((err) => console.error("Failed to log CTA click:", err));

      if (isPlatformPost && !seenAds.includes(ad.id)) {
        onMarkSeen(ad).catch(() => {});
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("xea:click-increment", { detail: { delta: 1 } }));
      }
    },
    [ad, isPlatformPost, seenAds, onMarkSeen]
  );

  const advertiserProfile = useMemo(() => {
    return ad.user_email ? advertiserProfiles[ad.user_email.toLowerCase()] : null;
  }, [ad.user_email, advertiserProfiles]);

  const brandName = useMemo(() => {
    if (ad.custom_sponsor_name && ad.custom_sponsor_name.trim() !== "") {
      return ad.custom_sponsor_name.trim();
    }
    if (advertiserProfile?.business_name && advertiserProfile.business_name.trim() !== "") {
      return advertiserProfile.business_name.trim();
    }
    if (advertiserProfile?.firstName && advertiserProfile.firstName.trim() !== "") {
      const full = `${advertiserProfile.firstName} ${advertiserProfile.lastName || ""}`.trim();
      return full || advertiserProfile.firstName.trim();
    }
    if (advertiserProfile?.username && advertiserProfile.username.trim() !== "") {
      return advertiserProfile.username.trim();
    }
    if (ad.custom_sponsor_handle && ad.custom_sponsor_handle.trim() !== "") {
      return ad.custom_sponsor_handle.trim().replace(/^@/, "");
    }
    if ((ad as any).publisher_name && (ad as any).publisher_name.trim() !== "") {
      return (ad as any).publisher_name.trim();
    }
    if ((ad as any).publisher_handle && (ad as any).publisher_handle.trim() !== "") {
      return (ad as any).publisher_handle.replace(/^@/, "").trim();
    }
    if (ad.product_name && ad.product_name.trim() !== "") {
      return ad.product_name.trim();
    }
    if (ad.title && ad.title.trim() !== "") {
      return ad.title.trim();
    }
    if (ad.user_email) {
      const emailLower = ad.user_email.toLowerCase();
      if (emailLower === "admin@paayh.com" || emailLower === "system@paayh.com" || ad.ad_type === "admin_broadcast") {
        return "Paayh";
      }
      return ad.user_email.split("@")[0] || "Advertiser";
    }
    return "Paayh";
  }, [ad, advertiserProfile]);

  const targetLink = useMemo(() => {
    if (ad.action_website) return getHref("action_website", ad.action_website, ad);
    if (ad.action_whatsapp) return getHref("action_whatsapp", ad.action_whatsapp, ad);
    if (ad.action_phone) return getHref("action_phone", ad.action_phone, ad);
    if (ad.action_email) return getHref("action_email", ad.action_email, ad);
    if (ad.product_cta_link) {
      return ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`;
    }
    if (ad.action_ios) return getHref("action_ios", ad.action_ios, ad);
    if (ad.action_android) return getHref("action_android", ad.action_android, ad);
    if (ad.action_watch_now) return getHref("action_watch_now", ad.action_watch_now, ad);
    return "#";
  }, [ad]);

  const brandHandle = useMemo(() => {
    const raw =
      (ad.custom_sponsor_handle && ad.custom_sponsor_handle.trim()) ||
      (advertiserProfile?.username && advertiserProfile.username.trim()) ||
      ((ad as any).publisher_handle && String((ad as any).publisher_handle).trim()) ||
      "";
    const cleaned = raw.replace(/^@+/, "").trim();
    if (!cleaned) return "";
    if (cleaned.toLowerCase() === brandName.replace(/^@+/, "").trim().toLowerCase()) {
      return "";
    }
    return `@${cleaned}`;
  }, [ad, advertiserProfile?.username, brandName]);

  const getAdvertiserName = useCallback((_adItem: Ad): string => {
    return brandName;
  }, [brandName]);

  const actionButtons = useMemo(() => {
    return [
      "action_phone",
      "action_whatsapp",
      "action_email",
      "action_website",
      "action_ios",
      "action_android",
      "action_watch_now",
      ...(ad.ad_action_buttons?.includes("read_more") || isLongTextAd ? ["action_read_more"] : []),
    ].filter((key) => key === "action_read_more" || ad[key as keyof Ad]) as string[];
  }, [ad, isLongTextAd]);

  const isVerified = useMemo(() => {
    return seenAds.includes(ad.id) || ad.user_email?.toLowerCase() === userEmail.toLowerCase() || isPlatformPost;
  }, [seenAds, ad.id, ad.user_email, userEmail, isPlatformPost]);

  const isProcessing = useMemo(() => processingAds.includes(ad.id), [processingAds, ad.id]);

  const isMutualTarget = useMemo(() => {
    return (ad.mutual_targets ?? [])
      .map((e: string) => e.toLowerCase())
      .includes(userEmail.toLowerCase());
  }, [ad.mutual_targets, userEmail]);

  const isAlreadyMutual = useMemo(() => {
    return (viewerProfile?.mutuals ?? [])
      .map((m: string) => m.toLowerCase())
      .includes((ad.user_email ?? "").toLowerCase());
  }, [viewerProfile?.mutuals, ad.user_email]);

  const isSuspended = useMemo(() => {
    return viewerProfile?.suspended_until
      ? new Date(viewerProfile.suspended_until).getTime() > Date.now()
      : false;
  }, [viewerProfile?.suspended_until]);

  if (ad.is_highlight) {
    return <HighlightCard ad={ad} style={style} formatTimestamp={formatTimestamp} />;
  }

  return (
    <div
      ref={cardRef}
      key={ad.id}
      className={`${styles.card} ${isDismissing ? styles.cardDismissing : ""} ${showThreeDotMenu ? styles.cardMenuOpen : ""}`}
      style={{ ...style, position: "relative", zIndex: showThreeDotMenu ? 99999 : 1, overflow: "visible" }}
    >
      {/* Left Column: Avatar */}
      <div className={styles.avatarCol}>
        <AdvertiserHoverCard
          profile={advertiserProfile}
          customName={ad.custom_sponsor_name}
          customHandle={ad.custom_sponsor_handle}
          customLogo={ad.custom_sponsor_logo}
          isPlatformPost={isPlatformPost}
          userEmail={ad.user_email}
        >
          <div className={styles.avatar}>
            <Avatar
              src={ad.custom_sponsor_logo || advertiserProfile?.profileImage}
              name={brandName}
              email={ad.user_email}
              size={40}
              alt={brandName}
              gender={advertiserProfile?.gender || (ad as any).gender || null}
            />
          </div>
        </AdvertiserHoverCard>
      </div>

      {/* Right Column: Tweet Content */}
      <div className={styles.contentCol}>
        {/* Header Information */}
        <div className={styles.tweetHeader}>
          <div className={styles.headerLeft}>
            <AdvertiserHoverCard
              profile={advertiserProfile}
              customName={ad.custom_sponsor_name}
              customHandle={ad.custom_sponsor_handle}
              customLogo={ad.custom_sponsor_logo}
              isPlatformPost={isPlatformPost}
              userEmail={ad.user_email}
            >
              <div className={styles.sponsorNameWrapper}>
                <span className={styles.sponsorName}>{getAdvertiserName(ad)}</span>
                {Boolean(isPlatformPost || advertiserProfile?.monetized) && (
                  <VerifiedBadge size={14} title="Verified Account" />
                )}
                {brandHandle && (
                  <span className={styles.sponsorHandle}>{brandHandle}</span>
                )}
              </div>
            </AdvertiserHoverCard>
            {(ad.is_ai_content || (ad as any).is_ai || (ad as any).isAiContent) && (
              <span className={styles.aiBadge} title="AI-generated or AI-assisted content">
                AI
              </span>
            )}
          </div>

          <div className={styles.headerRightContainer}>
            <span className={styles.sponsorLabel}>
              {(() => {
                if (isMutualTarget || isAlreadyMutual) return "Mutual Ad";
                const category = (ad.ad_type || (Array.isArray(ad.industry) ? ad.industry[0] : ad.industry) || "").toLowerCase();
                if (category === "politics") return "Politics Ad";
                if (category === "religion") return "Religious Ad";
                return "Ad";
              })()}
            </span>

            {/* Three Dot Options Menu */}
            <AdOptionsMenu
              adId={ad.id}
              advertiserEmail={ad.user_email}
              showThreeDotMenu={showThreeDotMenu}
              onToggleMenu={handleToggleMenu}
              onDismiss={handleDismiss}
              onShowToast={showToast}
            />
          </div>
        </div>

        {/* Product Name & Description (if product sales) */}
        {ad.ad_type === "product_sales" && (
          <>
            {ad.product_name && <h4 className={styles.productNameTitle}>{ad.product_name}</h4>}
            {ad.ad_content && (
              <p className={styles.productDescriptionText}>
                {ad.ad_content.trim().charAt(0).toUpperCase() + ad.ad_content.trim().slice(1)}
              </p>
            )}
          </>
        )}

        {/* Content Message (if NOT product sales) */}
        {ad.ad_type !== "product_sales" && (
          <p
            className={`${styles.adText} ${canOpenTextReader || mediaUrls.length > 0 ? styles.adTextClickable : ""}`}
            onClick={(e) => {
              if (canOpenTextReader) {
                e.stopPropagation();
                openTextReader();
                handleCtaClick("read_more");
              } else if (mediaUrls.length > 0) {
                e.stopPropagation();
                openLightbox(0);
              }
            }}
            title={canOpenTextReader ? "Click to read full post" : mediaUrls.length > 0 ? "Click to view media" : undefined}
          >
            {formattedAdContent.length > 220 && !isExpanded
              ? `${formattedAdContent.slice(0, 220)}...`
              : formattedAdContent}
            {(formattedAdContent.length > 220 || ad.ad_action_buttons?.includes("read_more")) && (
              <button
                type="button"
                className={styles.inlineReadMoreBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  openTextReader();
                  handleCtaClick("read_more");
                }}
              >
                Read more
              </button>
            )}
          </p>
        )}

        {/* Media Section */}
        <MediaCarousel
          adMedia={ad.ad_media}
          hlsUrl={ad.hls_url}
          isCardVisible={isCardVisible && lightboxIndex === null && !isTextReaderOpen}
          isPreloadWarm={isPreloadWarm}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onMediaClick={(idx) => openLightbox(idx)}
        />

        {/* Action bar */}
        <AdCardActionBar
          ad={ad}
          userEmail={userEmail}
          brandName={brandName}
          targetLink={targetLink}
          actionButtons={actionButtons}
          isPlatformPost={isPlatformPost}
          isOwner={isOwner}
          isVerified={isVerified}
          isMutualTarget={isMutualTarget}
          isAlreadyMutual={isAlreadyMutual}
          viewerProfile={viewerProfile}
          isProcessing={isProcessing}
          isSuspended={isSuspended}
          seenAds={seenAds}
          activeAction={activeAction}
          successAction={successAction}
          interactionSecondsLeft={interactionSecondsLeft}
          setInteractionSecondsLeft={setInteractionSecondsLeft}
          interactionStage={interactionStage}
          setInteractionStage={setInteractionStage}
          isTextReaderOpen={isTextReaderOpen}
          setIsTextReaderOpen={setIsTextReaderOpen}
          handleAction={handleAction}
          handleCtaClick={handleCtaClick}
          onMarkSeen={onMarkSeen}
          onAdEarn={onAdEarn}
          onAdMutual={onAdMutual}
          onShare={onShare}
          showToast={showToast}
          getIcon={getIcon}
          getHref={getHref}
        />
      </div>

      {/* X (Twitter)-Style Media Lightbox: Modal on Desktop, Full-Screen on Mobile */}
      {lightboxIndex !== null && mediaUrls[lightboxIndex] && (
        <AdMediaLightboxModal
          ad={ad}
          userEmail={userEmail}
          brandName={brandName}
          targetLink={targetLink}
          actionButtons={actionButtons}
          isPlatformPost={isPlatformPost}
          isOwner={isOwner}
          isMutualTarget={isMutualTarget}
          isAlreadyMutual={isAlreadyMutual}
          viewerProfile={viewerProfile}
          isProcessing={isProcessing}
          isSuspended={isSuspended}
          seenAds={seenAds}
          activeAction={activeAction}
          successAction={successAction}
          interactionSecondsLeft={interactionSecondsLeft}
          setInteractionSecondsLeft={setInteractionSecondsLeft}
          interactionStage={interactionStage}
          setInteractionStage={setInteractionStage}
          handleAction={handleAction}
          onMarkSeen={onMarkSeen}
          onAdEarn={onAdEarn}
          onAdMutual={onAdMutual}
          onShare={onShare}
          handleCtaClick={handleCtaClick}
          handleDismiss={handleDismiss}
          showToast={showToast}
          getHref={getHref}
          getIcon={getIcon}
          lightboxIndex={lightboxIndex}
          setLightboxIndex={setLightboxIndex}
          mediaUrls={mediaUrls}
          isLightboxClosing={isLightboxClosing}
          closeLightbox={closeLightbox}
          showLightboxMenu={showLightboxMenu}
          setShowLightboxMenu={setShowLightboxMenu}
          lightboxSwipeOffsetY={lightboxSwipeOffsetY}
          setLightboxSwipeOffsetY={setLightboxSwipeOffsetY}
        />
      )}

      {/* X (Twitter)-Style Long-Form Text Reader: Modal on Desktop, Full-Screen on Mobile */}
      {isTextReaderOpen && (
        <AdTextReaderModal
          ad={ad}
          userEmail={userEmail}
          brandName={brandName}
          targetLink={targetLink}
          actionButtons={actionButtons}
          isPlatformPost={isPlatformPost}
          isOwner={isOwner}
          isMutualTarget={isMutualTarget}
          isAlreadyMutual={isAlreadyMutual}
          viewerProfile={viewerProfile}
          isProcessing={isProcessing}
          isSuspended={isSuspended}
          seenAds={seenAds}
          activeAction={activeAction}
          successAction={successAction}
          interactionSecondsLeft={interactionSecondsLeft}
          setInteractionSecondsLeft={setInteractionSecondsLeft}
          interactionStage={interactionStage}
          setInteractionStage={setInteractionStage}
          handleAction={handleAction}
          onMarkSeen={onMarkSeen}
          onAdEarn={onAdEarn}
          onAdMutual={onAdMutual}
          onShare={onShare}
          handleCtaClick={handleCtaClick}
          handleDismiss={handleDismiss}
          showToast={showToast}
          getHref={getHref}
          getIcon={getIcon}
          isTextReaderClosing={isTextReaderClosing}
          closeTextReader={closeTextReader}
          adWordCount={adWordCount}
          showReaderMenu={showReaderMenu}
          setShowReaderMenu={setShowReaderMenu}
          advertiserProfile={advertiserProfile}
          formattedAdContent={formattedAdContent}
          formatTimestamp={formatTimestamp}
        />
      )}
    </div>
  );
}

const MemoizedAdCard = attachAdCardSlots(React.memo(AdCard));

export default MemoizedAdCard;
