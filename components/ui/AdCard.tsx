import React, { useState, useRef, useEffect } from "react";
import {
  Phone,
  MessageCircle,
  Globe,
  Mail,
  Share2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Apple,
  ChevronDown,
  Video,
  MoreVertical,
  ShieldAlert,
  UserX,
  EyeOff,
} from "lucide-react";
import styles from "./AdCard.module.css";
import AdInteractionHandler from "./AdInteractionHandler";
import HlsVideoPlayer from "./HlsVideoPlayer";
import UserAvatar from "./UserAvatar";

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
}

interface AdCardProps {
  ad: Ad;
  userEmail: string;
  advertiserProfiles: Record<
    string,
    { business_name?: string; firstName?: string; profileImage?: string }
  >;
  viewerProfile: {
    balance: number;
    mutual_count: number;
    mutuals: string[];
    monetized: boolean;
    suspended_until?: string | null;
  } | null;
  seenAds: string[];
  processingAds: string[];
  onAdEarn: (ad: Ad) => Promise<boolean>;
  onAdMutual: (ad: Ad) => Promise<boolean>;
  onMarkSeen: (ad: Ad) => Promise<boolean>;
  onShare: (id: string) => void;
  onDismiss: (adId: string) => void;
  style?: React.CSSProperties;
}

const getHref = (type: string, value: string) => {
  const map: Record<string, string> = {
    action_phone: `tel:${value}`,
    action_whatsapp: `https://wa.me/${value}`,
    action_email: `mailto:${value}`,
    action_website: value.startsWith("http") ? value : `https://${value}`,
    action_ios: value.startsWith("http") ? value : `https://${value}`,
    action_android: value.startsWith("http") ? value : `https://${value}`,
    action_watch_now: value.startsWith("http") ? value : `https://${value}`,
  };
  return map[type] || "#";
};

export default function AdCard({
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
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const isSwiping = useRef<boolean>(false);
  const isScrollLocked = useRef<boolean>(false);
  const isDragging = useRef<boolean>(false);
  const [isCardVisible, setIsCardVisible] = useState(false);

  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowThreeDotMenu(false);
      }
    };
    if (showThreeDotMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showThreeDotMenu]);

  const formatVideoTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatCurrency = (amount: number | string) => {
    const val = typeof amount === "string" ? parseFloat(amount) : amount;
    return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const togglePlay = () => {
    const activeVideo = videoRefs.current[currentMediaIndex];
    if (activeVideo) {
      if (isPlaying) {
        activeVideo.pause();
        setIsPlaying(false);
      } else {
        activeVideo.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRefs.current.forEach((video) => {
      if (video) video.muted = nextMuted;
    });
  };

  const handleBlockAndReportAd = () => {
    setShowThreeDotMenu(false);
    if (typeof window !== "undefined") {
      window.location.href = `/help?reportAdId=${encodeURIComponent(ad.id)}&type=ad`;
    }
  };

  const handleBlockAndReportAdvertiser = () => {
    setShowThreeDotMenu(false);
    if (typeof window !== "undefined") {
      window.location.href = `/help?reportAdId=${encodeURIComponent(ad.id)}&advertiserEmail=${encodeURIComponent(ad.user_email || "")}&type=advertiser`;
    }
  };

  const handleDontShowAgain = () => {
    setShowThreeDotMenu(false);
    if (typeof window !== "undefined") {
      window.location.href = `/help?reportAdId=${encodeURIComponent(ad.id)}&type=dont_show`;
    }
  };

  const [activeAction, setActiveAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [successAction, setSuccessAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isPlatformPost = ad.user_email ? ADMIN_EMAILS.includes(ad.user_email.toLowerCase()) : false;
  const advertiserProfile = ad.user_email ? advertiserProfiles[ad.user_email.toLowerCase()] : null;
  const brandName = advertiserProfile?.business_name || advertiserProfile?.firstName || "Paayh";

  let targetLink = "#";
  if (ad.action_website) {
    targetLink = getHref("action_website", ad.action_website);
  } else if (ad.action_whatsapp) {
    targetLink = getHref("action_whatsapp", ad.action_whatsapp);
  } else if (ad.action_phone) {
    targetLink = getHref("action_phone", ad.action_phone);
  } else if (ad.action_email) {
    targetLink = getHref("action_email", ad.action_email);
  }

  const handleAction = async (type: "seen" | "earn" | "mutual", fn: () => Promise<boolean>) => {
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
  };

  // Reset media error whenever the user navigates to a different item in the carousel
  React.useEffect(() => {
    setMediaError(false);
  }, [currentMediaIndex]);

  // Track card visibility in viewport
  React.useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsCardVisible(entry.isIntersecting && entry.intersectionRatio >= 0.65);
        });
      },
      { threshold: [0.6, 0.65, 0.75] }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // Play/pause active video based on visibility and active slide index
  React.useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (!video) return;
      if (idx === currentMediaIndex && isCardVisible) {
        video.play().catch(() => {});
        setIsPlaying(true);
      } else {
        video.pause();
        if (idx === currentMediaIndex) {
          setIsPlaying(false);
        }
      }
    });
  }, [currentMediaIndex, isCardVisible]);



  const isSuspended = viewerProfile?.suspended_until
    ? new Date(viewerProfile.suspended_until).getTime() > Date.now()
    : false;

  const getAdvertiserName = (ad: Ad): string => {
    const profile = ad.user_email
      ? advertiserProfiles[ad.user_email.toLowerCase()]
      : null;
    let displayName = "";
    if (profile) {
      if (profile.business_name && profile.business_name.trim() !== "") {
        displayName = profile.business_name;
      } else if (profile.firstName && profile.firstName.trim() !== "") {
        displayName = profile.firstName;
      }
    }

    if (!displayName && ad.user_email) {
      displayName = ad.user_email.split("@")[0];
    }

    if (!displayName) {
      displayName = "Sponsored";
    }

    return displayName.slice(0, 25);
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

  React.useEffect(() => {
    if (ad.is_highlight && ad.id) {
      const recordedKey = `hl_impression_${ad.id}`;
      if (typeof window !== "undefined" && !sessionStorage.getItem(recordedKey)) {
        sessionStorage.setItem(recordedKey, "1");
        fetch("/api/highlights/impression", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ highlightId: ad.id }),
        }).catch((err) => console.error("Failed to record highlight impression:", err));
      }
    }
  }, [ad.is_highlight, ad.id]);

  if (ad.is_highlight) {
    return (
      <div key={`hl-${ad.id}`} className={styles.card} style={style}>
        {/* Left Column: Avatar Icon */}
        <div className={styles.avatarCol}>
          <div
            className={styles.avatar}
            style={{
              backgroundColor: "var(--primary)",
              color: "#ffffff",
              fontWeight: "800",
            }}
          >
            HL
          </div>
        </div>

        {/* Right Column: Content */}
        <div className={styles.contentCol}>
          <div className={styles.tweetHeader}>
            <div className={styles.headerLeft}>
              <span className={styles.sponsorName}>{ad.title}</span>
              <span className={styles.dot}>·</span>
              <span className={styles.adTime}>
                {formatTimestamp(ad.created_at)}
              </span>
            </div>
            <span
              className={styles.sponsorLabel}
              style={{ color: "var(--primary)", fontWeight: "700" }}
            >
              Highlight
            </span>
          </div>

          <p className={styles.adText}>{ad.ad_content}</p>

          {ad.ad_media && (
            <div className={styles.mediaBox}>
              <img
                src={ad.ad_media}
                alt="Highlight Cover"
                className={styles.adImgElement}
              />
            </div>
          )}
        </div>
      </div>
    );
  }


  const rawMediaUrls = ad.ad_media
    ? ad.ad_media.split(",").map((url) => url.trim()).filter(Boolean)
    : [];
  // Sort media: images first, videos last
  const mediaUrls = [...rawMediaUrls].sort((a, b) => {
    const aIsVideo = /\.(mp4|webm|mov|avi|m3u8)$/i.test(a);
    const bIsVideo = /\.(mp4|webm|mov|avi|m3u8)$/i.test(b);
    if (aIsVideo && !bIsVideo) return 1;
    if (!aIsVideo && bIsVideo) return -1;
    return 0;
  });
  const currentUrl = mediaUrls[currentMediaIndex] || "";
  // Detect type per individual URL so mixed ads (images + video) render correctly
  const mediaType = /\.(mp4|webm|mov|avi|m3u8)$/i.test(currentUrl) ? "video" : "image";

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mediaUrls.length <= 1) return;

    // Ignore clicks on buttons or control bars inside mediaBox
    const targetEl = e.target as HTMLElement;
    if (
      targetEl.closest("button") ||
      targetEl.closest(`.${styles.videoControlBar}`) ||
      targetEl.closest(`.${styles.dotsContainer}`)
    ) {
      return;
    }

    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    isSwiping.current = false;
    isScrollLocked.current = false;
    isDragging.current = true;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback if setPointerCapture is unsupported
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || dragStartX.current === null || dragStartY.current === null) return;

    const deltaX = e.clientX - dragStartX.current;
    const deltaY = e.clientY - dragStartY.current;

    if (!isSwiping.current && !isScrollLocked.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 5) {
        isScrollLocked.current = true;
        return;
      }
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
        isSwiping.current = true;
      }
    }

    if (isScrollLocked.current) return;

    if (isSwiping.current && trackRef.current) {
      trackRef.current.style.transition = "none";
      const containerWidth = trackRef.current.offsetWidth || 1;
      let adjustedDeltaX = deltaX;
      if (
        (currentMediaIndex === 0 && deltaX > 0) ||
        (currentMediaIndex === mediaUrls.length - 1 && deltaX < 0)
      ) {
        adjustedDeltaX = deltaX * 0.25;
      }
      const basePercent = -currentMediaIndex * 100;
      const offsetPercent = (adjustedDeltaX / containerWidth) * 100;
      trackRef.current.style.transform = `translate3d(${basePercent + offsetPercent}%, 0, 0)`;
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Fallback
    }

    if (isSwiping.current && dragStartX.current !== null && trackRef.current) {
      const deltaX = e.clientX - dragStartX.current;
      const threshold = 35;

      let targetIndex = currentMediaIndex;
      if (deltaX < -threshold && currentMediaIndex < mediaUrls.length - 1) {
        targetIndex = currentMediaIndex + 1;
      } else if (deltaX > threshold && currentMediaIndex > 0) {
        targetIndex = currentMediaIndex - 1;
      }

      trackRef.current.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      trackRef.current.style.transform = `translate3d(-${targetIndex * 100}%, 0, 0)`;

      if (targetIndex !== currentMediaIndex) {
        setCurrentMediaIndex(targetIndex);
      }
    } else if (trackRef.current) {
      trackRef.current.style.transition = "transform 0.2s ease-out";
      trackRef.current.style.transform = `translate3d(-${currentMediaIndex * 100}%, 0, 0)`;
    }

    dragStartX.current = null;
    dragStartY.current = null;
    isSwiping.current = false;
    isScrollLocked.current = false;
  };

  const actionButtons = [
    "action_phone",
    "action_whatsapp",
    "action_email",
    "action_website",
    "action_ios",
    "action_android",
    "action_watch_now",
    ...(ad.ad_action_buttons?.includes("read_more") ? ["action_read_more"] : []),
  ].filter((key) => key === "action_read_more" || ad[key as keyof Ad]) as string[];

  const isVerified = seenAds.includes(ad.id) || ad.user_email?.toLowerCase() === userEmail.toLowerCase() || isPlatformPost;

  const isProcessing = processingAds.includes(ad.id);

  // Is this viewer one of the mutual targets (gets a free impression, no Earn+)?
  const isMutualTarget = (ad.mutual_targets ?? [])
    .map((e: string) => e.toLowerCase())
    .includes(userEmail.toLowerCase());

  // Has this viewer already added the advertiser to their mutuals?
  const isAlreadyMutual = (viewerProfile?.mutuals ?? [])
    .map((m: string) => m.toLowerCase())
    .includes((ad.user_email ?? "").toLowerCase());

  return (
    <div ref={cardRef} key={ad.id} className={`${styles.card} ${isDismissing ? styles.cardDismissing : ""} ${showThreeDotMenu ? styles.cardMenuOpen : ""}`} style={{ ...style, position: "relative", zIndex: showThreeDotMenu ? 99999 : 1, overflow: "visible" }}>
      {/* Left Column: Avatar */}
      <div className={styles.avatarCol}>
        <div className={styles.avatar}>
          {(() => {
            const profile = ad.user_email
              ? advertiserProfiles[ad.user_email.toLowerCase()]
              : null;
            return (
              <UserAvatar
                src={profile?.profileImage}
                fallbackText={brandName}
                size={40}
                alt={brandName}
                className={styles.avatarImg}
              />
            );
          })()}
        </div>
      </div>

      {/* Right Column: Tweet Content */}
      <div className={styles.contentCol}>
        {/* Header Information */}
        <div className={styles.tweetHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.sponsorName}>{getAdvertiserName(ad)}</span>
            <span className={styles.sponsorHandle}>
              {(() => {
                const profile = ad.user_email
                  ? advertiserProfiles[ad.user_email.toLowerCase()]
                  : null;
                if (
                  profile &&
                  profile.firstName &&
                  profile.firstName.trim() !== ""
                ) {
                  return `@${profile.firstName
                    .toLowerCase()
                    .replace(/\s+/g, "")}`.slice(0, 25);
                }
                return ad.user_email
                  ? `@${ad.user_email.split("@")[0]}`
                  : "@xea_sponsor";
              })()}
            </span>
            <span className={styles.dot}></span>
            <span className={styles.adTime}>
              {formatTimestamp(ad.created_at)}
            </span>
          </div>

          <div className={styles.headerRightContainer}>
            <span className={styles.sponsorLabel}>
              {(() => {
                const category = (ad.ad_type || (Array.isArray(ad.industry) ? ad.industry[0] : ad.industry) || "").toLowerCase();
                if (category === "politics") return "Politics Ad";
                if (category === "religion") return "Religious Ad";
                return "Ad";
              })()}
            </span>

            {/* Three Dot Icon & Dropdown Menu */}
            <div className={styles.threeDotMenuWrapper} ref={menuRef}>
              <button
                type="button"
                className={styles.threeDotBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowThreeDotMenu(!showThreeDotMenu);
                }}
                title="Ad Options"
                aria-label="Ad options menu"
              >
                <MoreVertical size={15} />
              </button>

              {showThreeDotMenu && (
                <div className={styles.adCardDropdown} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.dropdownOption}
                    onClick={handleBlockAndReportAd}
                  >
                    <ShieldAlert size={14} className={styles.dropdownIconDanger} />
                    <span>Block & report Ad</span>
                  </button>

                  <button
                    type="button"
                    className={styles.dropdownOption}
                    onClick={handleBlockAndReportAdvertiser}
                  >
                    <UserX size={14} className={styles.dropdownIconDanger} />
                    <span>Block & report Advertiser</span>
                  </button>

                  <button
                    type="button"
                    className={styles.dropdownOption}
                    onClick={handleDontShowAgain}
                  >
                    <EyeOff size={14} className={styles.dropdownIconMuted} />
                    <span>Don&apos;t show this Ad again</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Name & Description (if product sales) */}
        {ad.ad_type === "product_sales" && (
          <>
            {ad.product_name && (
              <h4 className={styles.productNameTitle}>{ad.product_name}</h4>
            )}
            {ad.ad_content && (
              <p className={styles.productDescriptionText} style={{ marginTop: "4px", marginBottom: "12px", fontSize: "0.92rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                {ad.ad_content.trim().charAt(0).toUpperCase() + ad.ad_content.trim().slice(1)}
              </p>
            )}
          </>
        )}

        {/* Content Message (if NOT product sales) */}
        {ad.ad_type !== "product_sales" && (
          <p className={styles.adText}>
            {(() => {
              const formattedContent = ad.ad_content ? ad.ad_content.trim().charAt(0).toUpperCase() + ad.ad_content.trim().slice(1) : "";
              return ad.ad_action_buttons?.includes("read_more") && !isExpanded
                ? formattedContent.slice(0, 220) + "..."
                : formattedContent;
            })()}
          </p>
        )}

        {/* Media Section */}
        {mediaUrls.length > 0 && !mediaError && (
          <div
            className={styles.mediaBox}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            {/* Media Counter Badge */}
            {mediaUrls.length > 1 && (
              <div className={styles.mediaBadge}>
                {currentMediaIndex + 1} / {mediaUrls.length}
              </div>
            )}

            <div
              ref={trackRef}
              className={styles.mediaTrack}
              style={{
                transform: `translate3d(-${currentMediaIndex * 100}%, 0, 0)`,
              }}
            >
              {mediaUrls.map((url, index) => {
                const isVideo = /\.(mp4|webm|mov|avi|m3u8)$/i.test(url);
                return (
                  <div key={index} className={styles.mediaWrapper}>
                    {isVideo ? (
                      <div className={styles.webVideoContainer} onClick={(e) => e.stopPropagation()}>
                        <HlsVideoPlayer
                          ref={(el) => {
                            videoRefs.current[index] = el;
                          }}
                          key={url}
                          src={url}
                          hlsSrc={ad.hls_url || (url.endsWith(".m3u8") ? url : undefined)}
                          loop
                          autoPlay={index === currentMediaIndex && isCardVisible}
                          muted={isMuted}
                          controls={false}
                          className={styles.mediaVideo}
                          onClick={togglePlay}
                          onPlay={() => {
                            if (index === currentMediaIndex) setIsPlaying(true);
                          }}
                          onPause={() => {
                            if (index === currentMediaIndex) setIsPlaying(false);
                          }}
                          onTimeUpdate={(e) => {
                            if (index === currentMediaIndex && e.currentTarget.currentTime) {
                              setVideoCurrentTime(e.currentTarget.currentTime);
                            }
                          }}
                          onLoadedMetadata={(e) => {
                            if (index === currentMediaIndex && e.currentTarget.duration) {
                              setVideoDuration(e.currentTarget.duration);
                            }
                          }}
                        />

                        {/* Sleek Bottom Control Bar */}
                        <div className={styles.videoControlBar} onClick={(e) => e.stopPropagation()}>
                          {/* Left: Countdown Duration Badge */}
                          <div className={styles.videoDurationBadge} title="Remaining duration">
                            {formatVideoTime(Math.max(0, (videoDuration || 0) - (videoCurrentTime || 0)))}
                          </div>

                          {/* Right: Mic Unmute/Mute Button */}
                          <button
                            type="button"
                            className={styles.videoMuteBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMute();
                            }}
                            title={isMuted ? "Unmute sound" : "Mute sound"}
                          >
                            {isMuted ? <VolumeX size={15} color="#fff" /> : <Volume2 size={15} color="#fff" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt="Ad Media"
                        className={styles.adImgElement}
                        draggable={false}
                        onError={() => setMediaError(true)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {mediaUrls.length > 1 && (
              <div className={styles.dotsContainer} onClick={(e) => e.stopPropagation()}>
                {mediaUrls.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`${styles.dot} ${index === currentMediaIndex ? styles.dotActive : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentMediaIndex(index);
                    }}
                    aria-label={`Go to media ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        {ad.ad_type === "product_sales" ? (
          <div className={styles.productSalesActionBar}>
            {isPlatformPost ? (
              <>
                {/* Admin Ad: Price, CTA, and action buttons in a row */}
                <div className={styles.adminRowGroup}>
                  <span className={styles.productPriceText}>
                    {formatCurrency(ad.product_price || 0)}
                  </span>
                  <a
                    href={ad.product_cta_link ? (ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`) : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.productCtaButton}
                    onClick={() => {
                      const clickType = (ad.product_cta_type || "Buy Now").toLowerCase().replace(/\s+/g, "_");
                      fetch("/api/campaigns/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ adId: ad.id, clickType })
                      }).catch(err => console.error("Failed to log CTA click:", err));
                    }}
                  >
                    {ad.product_cta_type || "Buy Now"}
                  </a>
                </div>

                {/* Middle side: Secondary action buttons (up to 2) */}
                <div className={styles.productMiddleGroup}>
                  {actionButtons.map((type) => (
                    <a
                      key={`${type}-${ad.id}`}
                      href={getHref(type, ad[type as keyof Ad] as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.productActionButton}
                      title={type.replace("action_", "")}
                      onClick={() => {
                        const clickType = type.replace("action_", "");
                        fetch("/api/campaigns/click", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ adId: ad.id, clickType })
                        }).catch(err => console.error("Failed to log click:", err));
                      }}
                    >
                      {getIcon(type)}
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Standard User Ad: Price stacked on top of CTA button */}
                <div className={styles.productLeftGroup}>
                  <span className={styles.productPriceText}>
                    {formatCurrency(ad.product_price || 0)}
                  </span>
                  <a
                    href={ad.product_cta_link ? (ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`) : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.productCtaButton}
                    onClick={() => {
                      const clickType = (ad.product_cta_type || "Buy Now").toLowerCase().replace(/\s+/g, "_");
                      fetch("/api/campaigns/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ adId: ad.id, clickType })
                      }).catch(err => console.error("Failed to log CTA click:", err));
                    }}
                  >
                    {ad.product_cta_type || "Buy Now"}
                  </a>
                </div>

                {/* Middle Group: Secondary buttons */}
                <div className={styles.productMiddleGroup}>
                  {actionButtons.map((type) => (
                    <a
                      key={`${type}-${ad.id}`}
                      href={getHref(type, ad[type as keyof Ad] as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.productActionButton}
                      title={type.replace("action_", "")}
                      onClick={() => {
                        const clickType = type.replace("action_", "");
                        fetch("/api/campaigns/click", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ adId: ad.id, clickType })
                        }).catch(err => console.error("Failed to log click:", err));
                      }}
                    >
                      {getIcon(type)}
                    </a>
                  ))}
                </div>

                {/* Right Group: Unlocked Interaction buttons */}
                <div className={styles.productRightGroup}>
                  {ad.user_email?.toLowerCase() !== userEmail.toLowerCase() && (
                    !seenAds.includes(ad.id) && (
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
                      />
                    )
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.actionButtons}>
            {/* Contact / link buttons */}
            {actionButtons.map((type) => {
              const isReadMore = type === "action_read_more";
              if (!isReadMore && !isVerified) return null;

              if (isReadMore) {
                return (
                  <button
                    key={`${type}-${ad.id}`}
                    type="button"
                    className={`${styles.iconButton} ${isExpanded ? styles.expandedButton : ""}`}
                    title="Read More"
                    onClick={() => {
                      setIsExpanded(!isExpanded);
                      fetch("/api/campaigns/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ adId: ad.id, clickType: "read_more" })
                      }).catch(err => console.error("Failed to log click:", err));
                    }}
                  >
                    {getIcon(type)}
                  </button>
                );
              }

              return (
                <a
                  key={`${type}-${ad.id}`}
                  href={getHref(type, ad[type as keyof Ad] as string)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.iconButton}
                  title={type.replace("action_", "")}
                  onClick={() => {
                    const clickType = type.replace("action_", "");
                    fetch("/api/campaigns/click", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ adId: ad.id, clickType })
                    }).catch(err => console.error("Failed to log click:", err));
                  }}
                >
                  {getIcon(type)}
                </a>
              );
            })}

            {/* Share */}
            <button
              title="Share Ad"
              className={styles.iconButton}
              type="button"
              onClick={() => onShare(ad.id)}
            >
              <Share2 size={14} strokeWidth={1.5} />
            </button>

            {/* Interaction buttons – only for non-owners and unseen ads */}
            {ad.user_email?.toLowerCase() === userEmail.toLowerCase() ? null : (
              !seenAds.includes(ad.id) && (
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
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
