import React, { useState } from "react";
import {
  FaPhone,
  FaWhatsapp,
  FaGlobe,
  FaEnvelope,
  FaShareAlt,
  FaEye,
  FaCoins,
  FaUserPlus,
  FaCheck,
} from "react-icons/fa";
import styles from "./AdCard.module.css";


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

  const [activeAction, setActiveAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [successAction, setSuccessAction] = useState<"seen" | "earn" | "mutual" | null>(null);

  const isPlatformPost = !ad.cost_per_impression || Number(ad.cost_per_impression) === 0;
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
        await new Promise((resolve) => setTimeout(resolve, 1500));
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
      action_phone: <FaPhone />,
      action_whatsapp: <FaWhatsapp />,
      action_website: <FaGlobe />,
      action_email: <FaEnvelope />,
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
    <div key={ad.id} className={styles.card} style={style}>
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
            <span className={styles.dot}>·</span>
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
          <div className={styles.mediaBox}>
            {mediaType === "image" ? (
              <img
                src={currentUrl}
                alt="Ad Media"
                className={styles.adImgElement}
                onError={() => setMediaError(true)}
              />
            ) : (
              <video key={currentUrl} src={currentUrl} controls className={styles.mediaVideo} />
            )}

            {mediaUrls.length > 1 && (
              <button
                type="button"
                className={styles.arrowBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentMediaIndex((prev) => (prev + 1) % mediaUrls.length);
                }}
                title="Next Media"
              >
                &gt;
              </button>
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
            <FaShareAlt />
          </button>

          {/* Interaction buttons – only for non-owners */}
          {ad.user_email?.toLowerCase() === userEmail.toLowerCase() ? null : (
            isPlatformPost ? (
              <div className={styles.earnContainer}>
                <a
                  href={targetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.visitBrandBtn}
                >
                  Visit {brandName}
                </a>
              </div>
            ) : (
              !seenAds.includes(ad.id) && (
                isSuspended ? (
                  <div className={styles.suspendedBadge}>Suspended</div>
                ) : (
                  <div className={styles.earnContainer}>
                    {/* Seen / Dismiss – always visible to non-owners */}
                    <button
                      className={`${styles.seenBtn} ${successAction === "seen" ? styles.successBtn : ""}`}
                      type="button"
                      disabled={isProcessing || !!activeAction}
                      onClick={() => handleAction("seen", () => onMarkSeen(ad))}
                      title="Dismiss this ad"
                    >
                      {successAction === "seen" ? (
                        <>
                          <FaCheck className={styles.tickIcon} />
                          <span>Dismissed</span>
                        </>
                      ) : (
                        <>
                          <FaEye />
                          <span>Seen</span>
                        </>
                      )}
                    </button>

                    {/* Earn+ – hidden for mutual targets (they get a free impression) */}
                    {!isMutualTarget && (
                      <button
                        className={`${styles.earnBtn} ${successAction === "earn" ? styles.successBtn : ""}`}
                        type="button"
                        disabled={isProcessing || !!activeAction}
                        onClick={() => handleAction("earn", () => onAdEarn(ad))}
                        title="Earn from this ad"
                      >
                        {successAction === "earn" ? (
                          <>
                            <FaCheck className={styles.tickIcon} />
                            <span>Earned</span>
                          </>
                        ) : (
                          <>
                            <FaCoins />
                            <span>Earn+</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Mutual+ – only when advertiser enabled it and user hasn't mutualised them yet */}
                    {ad.display_mutual_button === true && !isAlreadyMutual && (
                      <button
                        className={
                          viewerProfile && viewerProfile.mutual_count >= 50
                            ? styles.mutualBtnDisabled
                            : `${styles.mutualBtn} ${successAction === "mutual" ? styles.successBtn : ""}`
                        }
                        type="button"
                        disabled={isProcessing || !!activeAction}
                        onClick={() => {
                          if (viewerProfile && viewerProfile.mutual_count >= 50) {
                            alert(
                              "⚠️ Mutual Limit Reached\nYou have reached the maximum limit of 50 mutuals."
                            );
                          } else {
                            handleAction("mutual", () => onAdMutual(ad));
                          }
                        }}
                        title="Add advertiser to mutuals"
                      >
                        {successAction === "mutual" ? (
                          <>
                            <FaCheck className={styles.tickIcon} />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <FaUserPlus />
                            <span>Mutual+</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
