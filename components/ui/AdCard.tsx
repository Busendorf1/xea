import React, { useState, useRef, useEffect } from "react";
import {
  Phone,
  MessageCircle,
  Globe,
  Mail,
  Share2,
  Eye,
  Coins,
  UserPlus,
  Check,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import styles from "./AdCard.module.css";
import AdInteractionHandler from "./AdInteractionHandler";


export interface Ad {
  id: string;
  ad_media: string | null;
  ad_content: string;
  action_phone?: string;
  action_whatsapp?: string;
  action_email?: string;
  action_website?: string;
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
  onDismiss,
  style,
}: AdCardProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [avatarError, setAvatarError] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [mediaAspectRatios, setMediaAspectRatios] = useState<Record<number, number>>({});

  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const [activeAction, setActiveAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [successAction, setSuccessAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  const ADMIN_EMAILS = ["admin@xea.com", "nonsom019@gmail.com", "nonsom2023@gmail.com"];
  const isPlatformPost = ad.user_email ? ADMIN_EMAILS.includes(ad.user_email.toLowerCase()) : false;
  const advertiserProfile = ad.user_email ? advertiserProfiles[ad.user_email.toLowerCase()] : null;
  const brandName = advertiserProfile?.business_name || advertiserProfile?.firstName || "Xea";

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
        setIsDismissing(true);
        await new Promise((resolve) => setTimeout(resolve, 400));
        onDismiss(ad.id);
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
    };
    return icons[type] || null;
  };

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
    const aIsVideo = /\.(mp4|webm|mov|avi)$/i.test(a);
    const bIsVideo = /\.(mp4|webm|mov|avi)$/i.test(b);
    if (aIsVideo && !bIsVideo) return 1;
    if (!aIsVideo && bIsVideo) return -1;
    return 0;
  });
  const currentUrl = mediaUrls[currentMediaIndex] || "";
  // Detect type per individual URL so mixed ads (images + video) render correctly
  const mediaType = /\.(mp4|webm|mov|avi)$/i.test(currentUrl) ? "video" : "image";
  const activeAspectRatio = Math.max(0.75, (mediaAspectRatios[0] || 16 / 9) * 0.85);

  const touchStartX = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    const threshold = 50;

    if (diff > threshold) {
      setCurrentMediaIndex((prev) => (prev + 1) % mediaUrls.length);
    } else if (diff < -threshold) {
      setCurrentMediaIndex((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length);
    }
    touchStartX.current = null;
  };

  const handleMediaClick = (e: React.MouseEvent) => {
    if (mediaType === "video") return;
    e.stopPropagation();
    setCurrentMediaIndex((prev) => (prev + 1) % mediaUrls.length);
  };

  const actionButtons = [
    "action_phone",
    "action_whatsapp",
    "action_email",
    "action_website",
  ].filter((key) => ad[key as keyof Ad]) as string[];

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
    <div key={ad.id} className={`${styles.card} ${isDismissing ? styles.cardDismissing : ""}`} style={style}>
      {/* Left Column: Avatar */}
      <div className={styles.avatarCol}>
        <div className={styles.avatar}>
          {(() => {
            const profile = ad.user_email
              ? advertiserProfiles[ad.user_email.toLowerCase()]
              : null;
            const hasImage =
              !avatarError &&
              profile?.profileImage &&
              profile.profileImage.trim() !== "";
            if (hasImage) {
              return (
                <img
                  src={profile!.profileImage}
                  alt="Advertiser"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                  onError={() => setAvatarError(true)}
                />
              );
            }
            // Text initials fallback
            if (profile) {
              const name =
                profile.business_name && profile.business_name.trim() !== ""
                  ? profile.business_name
                  : profile.firstName;
              if (name && name.trim() !== "") {
                return name.slice(0, 2).toUpperCase();
              }
            }
            return ad.user_email
              ? ad.user_email.slice(0, 2).toUpperCase()
              : "AD";
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
          <span className={styles.sponsorLabel}>Sponsored</span>
        </div>

        {/* Content Message */}
        <p className={styles.adText}>{ad.ad_content}</p>

        {/* Media Section */}
        {mediaUrls.length > 0 && !mediaError && (
          <div 
            className={styles.mediaBox}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={handleMediaClick}
            style={{ 
              aspectRatio: activeAspectRatio,
              cursor: mediaType === "image" ? "pointer" : "default" 
            }}
          >
            <div 
              className={styles.mediaTrack}
              style={{
                transform: `translateX(-${currentMediaIndex * 100}%)`,
              }}
            >
              {mediaUrls.map((url, index) => {
                const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
                return (
                  <div key={index} className={styles.mediaWrapper}>
                    {isVideo ? (
                      <div className={styles.webVideoContainer} onClick={(e) => e.stopPropagation()}>
                        <video 
                          ref={videoRef}
                          key={url}
                          src={url} 
                          loop
                          autoPlay
                          playsInline
                          muted={isMuted}
                          className={styles.mediaVideo} 
                          onClick={togglePlay}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onLoadedMetadata={(e) => {
                            const { videoWidth, videoHeight } = e.currentTarget;
                            if (videoWidth && videoHeight) {
                              setMediaAspectRatios((prev) => ({
                                ...prev,
                                [index]: videoWidth / videoHeight,
                              }));
                            }
                          }}
                        />

                        {/* Custom sleek play/pause overlays */}
                        <div className={styles.webVideoClickable} onClick={togglePlay}>
                          {!isPlaying && (
                            <div className={styles.webPlayButtonOverlay}>
                              <Play size={24} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
                            </div>
                          )}
                        </div>

                        {/* Custom sleek mute/unmute overlay */}
                        <button 
                          type="button"
                          className={styles.webMuteButtonOverlay} 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMute();
                          }}
                        >
                          {isMuted ? <VolumeX size={14} color="#fff" /> : <Volume2 size={14} color="#fff" />}
                        </button>
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt="Ad Media"
                        className={styles.adImgElement}
                        onError={() => setMediaError(true)}
                        onLoad={(e) => {
                          const { naturalWidth, naturalHeight } = e.currentTarget;
                          if (naturalWidth && naturalHeight) {
                            setMediaAspectRatios((prev) => ({
                              ...prev,
                              [index]: naturalWidth / naturalHeight,
                            }));
                          }
                        }}
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
        {/* Action bar */}
        <div className={styles.actionButtons}>
          {/* Contact / link buttons */}
          {actionButtons.map((type) => (
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
          ))}

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
      </div>
    </div>
  );
}
