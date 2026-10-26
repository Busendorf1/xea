import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  Phone,
  MessageCircle,
  Globe,
  Mail,
  Share2,
  Play,
  Apple,
  ChevronDown,
  Video,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import styles from "./AdCard.module.css";
import AdInteractionHandler from "./AdInteractionHandler";
import { InteractionData } from "@/lib/hooks/useFeedActions";
import Avatar from "./Avatar";
import HighlightCard from "./HighlightCard";
import AdOptionsMenu from "./AdOptionsMenu";
import MediaCarousel, { isVideoUrl } from "./MediaCarousel";
import AdvertiserHoverCard from "./AdvertiserHoverCard";
import VerifiedBadge from "./VerifiedBadge";

const HlsVideoPlayer = dynamic(() => import("./HlsVideoPlayer"), { ssr: false });
const FullscreenVideoPlayer = dynamic(() => import("@/components/MyAds/FullscreenVideoPlayer"), { ssr: false });

// Shared pooled IntersectionObservers for 1000+ card feed scrolling without per-card observer GC overhead
const preloadCallbacks = new WeakMap<Element, (intersecting: boolean) => void>();
const playCallbacks = new WeakMap<Element, (intersecting: boolean) => void>();
let sharedPreloadObserver: IntersectionObserver | null = null;
let sharedPlayObserver: IntersectionObserver | null = null;

function getSharedPreloadObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  if (!sharedPreloadObserver) {
    sharedPreloadObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          preloadCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: "800px 0px 800px 0px", threshold: 0 }
    );
  }
  return sharedPreloadObserver;
}

function getSharedPlayObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  if (!sharedPlayObserver) {
    sharedPlayObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          playCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: "0px 0px 0px 0px", threshold: 0.35 }
    );
  }
  return sharedPlayObserver;
}

export type BaseAd = {
  id: string;
  ad_content: string;
  impressions: number;
  cost_per_impression?: number | null;
  created_at?: string | null;
  user_email?: string;
  title?: string;
  is_highlight?: boolean;
  [key: string]: any;
};

export type VideoAd = BaseAd & {
  ad_type?: "video";
  hls_url?: string | null;
  ad_media: string;
};

export type CarouselAd = BaseAd & {
  ad_type?: "carousel";
  ad_media: string;
};

export type TextAd = BaseAd & {
  ad_type?: "text";
  ad_media: null;
};

export type AdUnion = VideoAd | CarouselAd | TextAd;

export interface Ad {
  id: string;
  ad_media: string | null;
  hls_url?: string | null;

  ad_content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
  action_ios?: string;
  action_android?: string;
  action_watch_now?: string;
  ad_action_buttons?: string[];
  ad_action_button?: string;
  interest: string[] | string | null;
  industry: string[] | string | null;
  behavior: string[] | string | null;
  lifestyle: string[] | string | null;
  personality: string[] | string | null;
  country: string | null;
  state: string | null;
  gender: string | null;
  employment_status: string | null;
  age_range: string[] | string | null;
  province: string | null;
  impressions: number;
  impression_count?: number | null;
  seen_users?: string[];
  campaign_days?: number;
  daily_impression_cap?: number;
  daily_impression_count?: number;
  last_reset_date?: string;
  user_frequency_cap?: number;
  completed_at?: string | null;
  user_email?: string;
  display_mutual_button?: boolean | null;
  mutual_targets?: string[] | null;
  mutual_adds_count?: number | null;
  cost_per_impression?: number | null;
  created_at?: string | null;
  targeting_all?: boolean;
  is_admin_post?: boolean;
  custom_sponsor_name?: string;
  custom_sponsor_handle?: string;
  custom_sponsor_logo?: string;
  is_highlight?: boolean;
  title?: string;
  verification_token?: string;
  served_at?: number;
  ad_type?: string;
  product_name?: string | null;
  product_price?: number | null;
  product_cta_type?: string | null;
  product_cta_link?: string | null;
  clicks_product_cta?: number | null;
  is_ai_content?: boolean;
}

interface AdCardProps {
  ad: Ad;
  userEmail: string;
  advertiserProfiles: Record<
    string,
    {
      business_name?: string;
      firstName?: string;
      lastName?: string;
      profileImage?: string;
      username?: string;
      bio?: string;
      location?: string;
      country?: string;
      monetized?: boolean;
      created_at?: string;
      gender?: string | null;
    }
  >;
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
  onDismiss: (adId: string) => void;
  style?: React.CSSProperties;
}

const getHref = (type: string, value: string, ad?: Ad) => {
  if (type === "action_whatsapp") {
    const cleanPhone = value.replace(/[^0-9+]/g, "");
    const previewText = ad?.ad_content ? ad.ad_content.slice(0, 45).trim() + "..." : "Ad";
    const text = `Hello, I saw your ad on Paayh: "${previewText}"\nhttps://paayh.com`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }
  const map: Record<string, string> = {
    action_phone: `tel:${value}`,
    action_email: `mailto:${value}`,
    action_website: value.startsWith("http") ? value : `https://${value}`,
    action_ios: value.startsWith("http") ? value : `https://${value}`,
    action_android: value.startsWith("http") ? value : `https://${value}`,
    action_watch_now: value.startsWith("http") ? value : `https://${value}`,
  };
  return map[type] || "#";
};

const getIcon = (type: string): React.ReactNode => {
  const icons: Record<string, React.ReactNode> = {
    action_phone: <Phone size={14} strokeWidth={1.5} />,
    action_whatsapp: <MessageCircle size={14} strokeWidth={1.5} />,
    action_website: <Globe size={14} strokeWidth={1.5} />,
    action_email: <Mail size={14} strokeWidth={1.5} />,
    action_ios: <Apple size={14} strokeWidth={1.5} />,
    action_android: <Play size={14} strokeWidth={1.5} />,
    action_watch_now: <Video size={14} strokeWidth={1.5} />,
    action_read_more: <ChevronDown size={14} strokeWidth={1.5} />,
  };
  return icons[type] || null;
};

const formatTimestamp = (timestamp: string | null | undefined): string => {
  if (!timestamp) return "Just now";
  try {
    const created = new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - created.getTime()) / 1000;

    if (isNaN(diff)) return "Just now";
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return "1d";
    return created.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Just now";
  }
};

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

  const handleDismiss = useCallback((adId: string) => {
    setLightboxIndex(null);
    setShowLightboxMenu(false);
    setIsTextReaderOpen(false);
    setShowReaderMenu(false);
    setIsDismissing(true);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      _onDismiss(adId);
    }, 380);
  }, [_onDismiss]);

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
  // Tier 1: 800px rootMargin pre-warms video buffer/first-frame in background
  // Tier 2: Active viewport threshold triggers autoplay with zero latency
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const preloadObs = getSharedPreloadObserver();
    const playObs = getSharedPlayObserver();

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

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

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
    // An ad is an unpaid platform post if it is an admin post or has no pay-per-impression reward / budget
    return Boolean(
      ad.is_admin_post ||
      !ad.cost_per_impression ||
      Number(ad.cost_per_impression) <= 0 ||
      !ad.impressions ||
      Number(ad.impressions) <= 0
    );
  }, [ad.is_admin_post, ad.cost_per_impression, ad.impressions]);

  // Automatic viewability tracking for platform / zero-budget posts or own ads:
  // When viewed continuously in the active viewport for 1.5 seconds, automatically register as seen
  // so the post records impression in ClickHouse / DB and is filtered on feed refresh.
  useEffect(() => {
    if ((!isPlatformPost && !isOwner) || !isCardVisible || seenAds.includes(ad.id)) return;

    const timer = setTimeout(() => {
      onMarkSeen(ad).catch((err) => console.error("Auto seen tracking error:", err));
    }, 1500);

    return () => clearTimeout(timer);
  }, [isPlatformPost, isOwner, isCardVisible, seenAds, ad, onMarkSeen]);

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
      // Never expose raw user email prefix publicly if username/name is unset
      return "Sponsored";
    }
    return "Paayh";
  }, [ad, advertiserProfile]);

  const targetLink = useMemo(() => {
    if (ad.action_website) return getHref("action_website", ad.action_website);
    if (ad.action_whatsapp) return getHref("action_whatsapp", ad.action_whatsapp);
    if (ad.action_phone) return getHref("action_phone", ad.action_phone);
    if (ad.action_email) return getHref("action_email", ad.action_email);
    if (ad.product_cta_link) {
      return ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`;
    }
    if (ad.action_ios) return getHref("action_ios", ad.action_ios);
    if (ad.action_android) return getHref("action_android", ad.action_android);
    if (ad.action_watch_now) return getHref("action_watch_now", ad.action_watch_now);
    return "#";
  }, [ad.action_website, ad.action_whatsapp, ad.action_phone, ad.action_email, ad.product_cta_link, ad.action_ios, ad.action_android, ad.action_watch_now]);

  const getAdvertiserName = useCallback((_adItem: Ad): string => {
    return brandName.slice(0, 25);
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
            >
              <div className={styles.sponsorNameWrapper}>
                <span className={styles.sponsorName}>{getAdvertiserName(ad)}</span>
                {Boolean(isPlatformPost || advertiserProfile?.monetized) && (
                  <VerifiedBadge size={14} title="Verified Account" />
                )}
              </div>
            </AdvertiserHoverCard>
            <span className={styles.dot}></span>
            <span className={styles.adTime}>{formatTimestamp(ad.created_at)}</span>
            {(ad.is_ai_content || (ad as any).is_ai || (ad as any).isAiContent) && (
              <>
                <span className={styles.dot}></span>
                <span className={styles.aiBadge} title="AI-generated or AI-assisted content">
                  AI Content
                </span>
              </>
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
        {ad.ad_type === "product_sales" ? (
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
                ) : (
                  !seenAds.includes(ad.id) || activeAction !== null || successAction !== null ? (
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
                  )
                )}
              </div>
            )}
          </div>
        ) : (
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
        )}
      </div>

      {/* X (Twitter)-Style Media Lightbox: Modal on Desktop, Full-Screen on Mobile */}
      {lightboxIndex !== null &&
        mediaUrls[lightboxIndex] &&
        typeof document !== "undefined" &&
        createPortal(
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
                  transition: lightboxSwipeOffsetY === 0 ? "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease" : "none",
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
                        setLightboxIndex((prev) =>
                          prev !== null ? Math.max(0, prev - 1) : null
                        );
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
                      setLightboxIndex((prev) =>
                        prev !== null ? Math.max(0, prev - 1) : null
                      );
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
        )}

      {/* X (Twitter)-Style Long-Form Text Reader: Modal on Desktop, Full-Screen on Mobile */}
      {isTextReaderOpen &&
        typeof document !== "undefined" &&
        createPortal(
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
        )}
    </div>
  );
}

const MemoizedAdCard = (React.memo(AdCard) as unknown) as typeof AdCard & {
  Root: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  Header: React.FC<{ advertiserName?: string; timestamp?: string | null; sponsorLabel?: string }>;
  Media: React.FC<{ adMedia?: string | null; hlsUrl?: string | null; isMuted?: boolean; onToggleMute?: () => void }>;
  Body: React.FC<{ content?: string; isExpanded?: boolean; onToggleExpand?: () => void }>;
  Actions: React.FC<{ children?: React.ReactNode }>;
};

MemoizedAdCard.Root = function AdCardRoot({ children, className, ...props }: any) {
  return <div className={`${styles.card} ${className || ""}`} {...props}>{children}</div>;
};

MemoizedAdCard.Header = function AdCardHeader({ advertiserName, timestamp, sponsorLabel }: any) {
  return (
    <div className={styles.tweetHeader}>
      <div className={styles.headerLeft}>
        <span className={styles.sponsorName}>{advertiserName}</span>
        {timestamp && <><span className={styles.dot}></span><span className={styles.adTime}>{timestamp}</span></>}
      </div>
      {sponsorLabel && (
        <div className={styles.headerRightContainer}>
          <span className={styles.sponsorLabel}>{sponsorLabel}</span>
        </div>
      )}
    </div>
  );
};

MemoizedAdCard.Media = function AdCardMedia({ adMedia, hlsUrl, isMuted = true, onToggleMute }: any) {
  return (
    <MediaCarousel
      adMedia={adMedia || null}
      hlsUrl={hlsUrl}
      isCardVisible={true}
      isMuted={isMuted}
      onToggleMute={onToggleMute || (() => {})}
    />
  );
};

MemoizedAdCard.Body = function AdCardBody({ content }: any) {
  return <p className={styles.adText}>{content}</p>;
};

MemoizedAdCard.Actions = function AdCardActions({ children }: any) {
  return <div className={styles.actionButtons}>{children}</div>;
};

export default MemoizedAdCard;
