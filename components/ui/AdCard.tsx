import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
} from "lucide-react";
import styles from "./AdCard.module.css";
import AdInteractionHandler from "./AdInteractionHandler";
import UserAvatar from "./UserAvatar";
import HighlightCard from "./HighlightCard";
import AdOptionsMenu from "./AdOptionsMenu";
import MediaCarousel from "./MediaCarousel";

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
}

interface AdCardProps {
  ad: Ad;
  userEmail: string;
  advertiserProfiles: Record<
    string,
    { business_name?: string; firstName?: string; profileImage?: string; username?: string }
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

const formatCurrency = (amount: number | string) => {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);

  const [activeAction, setActiveAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [successAction, setSuccessAction] = useState<"seen" | "earn" | "mutual" | null>(null);
  const [isDismissing] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver to observe card visibility
  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsCardVisible(entry.isIntersecting && entry.intersectionRatio >= 0.30);
        });
      },
      { threshold: [0.2, 0.3, 0.5] }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
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

  const ADMIN_EMAILS = useMemo(() => {
    return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  const isPlatformPost = useMemo(() => {
    return ad.user_email ? ADMIN_EMAILS.includes(ad.user_email.toLowerCase()) : false;
  }, [ad.user_email, ADMIN_EMAILS]);

  const advertiserProfile = useMemo(() => {
    return ad.user_email ? advertiserProfiles[ad.user_email.toLowerCase()] : null;
  }, [ad.user_email, advertiserProfiles]);

  const brandName = useMemo(() => {
    return advertiserProfile?.business_name || advertiserProfile?.firstName || "Paayh";
  }, [advertiserProfile]);

  const targetLink = useMemo(() => {
    if (ad.action_website) return getHref("action_website", ad.action_website);
    if (ad.action_whatsapp) return getHref("action_whatsapp", ad.action_whatsapp);
    if (ad.action_phone) return getHref("action_phone", ad.action_phone);
    if (ad.action_email) return getHref("action_email", ad.action_email);
    return "#";
  }, [ad.action_website, ad.action_whatsapp, ad.action_phone, ad.action_email]);

  const getAdvertiserName = useCallback((adItem: Ad): string => {
    if (adItem.custom_sponsor_name && adItem.custom_sponsor_name.trim() !== "") {
      return adItem.custom_sponsor_name.trim().slice(0, 25);
    }
    const profile = adItem.user_email ? advertiserProfiles[adItem.user_email.toLowerCase()] : null;
    let displayName = "";
    if (profile) {
      if (profile.business_name && profile.business_name.trim() !== "") {
        displayName = profile.business_name;
      } else if (profile.firstName && profile.firstName.trim() !== "") {
        displayName = profile.firstName;
      } else if (profile.username && profile.username.trim() !== "") {
        displayName = profile.username;
      }
    }
    if (!displayName) {
      displayName = "Sponsored";
    }
    return displayName.slice(0, 25);
  }, [advertiserProfiles]);

  const actionButtons = useMemo(() => {
    return [
      "action_phone",
      "action_whatsapp",
      "action_email",
      "action_website",
      "action_ios",
      "action_android",
      "action_watch_now",
      ...(ad.ad_action_buttons?.includes("read_more") ? ["action_read_more"] : []),
    ].filter((key) => key === "action_read_more" || ad[key as keyof Ad]) as string[];
  }, [ad]);

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
        <div className={styles.avatar}>
          <UserAvatar
            src={ad.custom_sponsor_logo || advertiserProfile?.profileImage}
            fallbackText={brandName}
            size={40}
            alt={brandName}
            className={styles.avatarImg}
          />
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
                if (ad.custom_sponsor_handle && ad.custom_sponsor_handle.trim() !== "") {
                  const cleanHandle = ad.custom_sponsor_handle.trim().replace(/^@/, "");
                  return `@${cleanHandle}`.slice(0, 25);
                }
                if (advertiserProfile?.username && advertiserProfile.username.trim() !== "") {
                  return `@${advertiserProfile.username.toLowerCase().replace(/\s+/g, "")}`.slice(0, 25);
                }
                if (advertiserProfile?.firstName && advertiserProfile.firstName.trim() !== "") {
                  return `@${advertiserProfile.firstName.toLowerCase().replace(/\s+/g, "")}`.slice(0, 25);
                }
                return "@Sponsored";
              })()}
            </span>
            <span className={styles.dot}></span>
            <span className={styles.adTime}>{formatTimestamp(ad.created_at)}</span>
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

            {/* Three Dot Options Menu */}
            <AdOptionsMenu
              adId={ad.id}
              advertiserEmail={ad.user_email}
              showThreeDotMenu={showThreeDotMenu}
              onToggleMenu={handleToggleMenu}
            />
          </div>
        </div>

        {/* Product Name & Description (if product sales) */}
        {ad.ad_type === "product_sales" && (
          <>
            {ad.product_name && <h4 className={styles.productNameTitle}>{ad.product_name}</h4>}
            {ad.ad_content && (
              <p
                className={styles.productDescriptionText}
                style={{
                  marginTop: "4px",
                  marginBottom: "12px",
                  fontSize: "0.92rem",
                  color: "var(--text-secondary)",
                  lineHeight: "1.4",
                }}
              >
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
        <MediaCarousel
          adMedia={ad.ad_media}
          hlsUrl={ad.hls_url}
          isCardVisible={isCardVisible}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />

        {/* Action bar */}
        {ad.ad_type === "product_sales" ? (
          <div className={styles.productSalesActionBar}>
            {isPlatformPost ? (
              <>
                <div className={styles.adminRowGroup}>
                  <span className={styles.productPriceText}>{formatCurrency(ad.product_price || 0)}</span>
                  <a
                    href={ad.product_cta_link ? (ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`) : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.productCtaButton}
                    onClick={() => {
                      const clickType = (ad.product_cta_type || "Buy").toLowerCase().replace(/\s+/g, "_");
                      fetch("/api/campaigns/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ adId: ad.id, clickType }),
                      }).catch((err) => console.error("Failed to log CTA click:", err));
                    }}
                  >
                    {ad.product_cta_type || "Buy"}
                  </a>
                </div>

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
                          body: JSON.stringify({ adId: ad.id, clickType }),
                        }).catch((err) => console.error("Failed to log click:", err));
                      }}
                    >
                      {getIcon(type)}
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={styles.productLeftGroup}>
                  <span className={styles.productPriceText}>{formatCurrency(ad.product_price || 0)}</span>
                  <a
                    href={ad.product_cta_link ? (ad.product_cta_link.startsWith("http") ? ad.product_cta_link : `https://${ad.product_cta_link}`) : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.productCtaButton}
                    onClick={() => {
                      const clickType = (ad.product_cta_type || "Buy").toLowerCase().replace(/\s+/g, "_");
                      fetch("/api/campaigns/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ adId: ad.id, clickType }),
                      }).catch((err) => console.error("Failed to log CTA click:", err));
                    }}
                  >
                    {ad.product_cta_type || "Buy"}
                  </a>
                </div>

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
                          body: JSON.stringify({ adId: ad.id, clickType }),
                        }).catch((err) => console.error("Failed to log click:", err));
                      }}
                    >
                      {getIcon(type)}
                    </a>
                  ))}
                </div>

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
                        body: JSON.stringify({ adId: ad.id, clickType: "read_more" }),
                      }).catch((err) => console.error("Failed to log click:", err));
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
                      body: JSON.stringify({ adId: ad.id, clickType }),
                    }).catch((err) => console.error("Failed to log click:", err));
                  }}
                >
                  {getIcon(type)}
                </a>
              );
            })}

            <button
              title="Share Ad"
              className={styles.iconButton}
              type="button"
              onClick={() => onShare(ad.id)}
            >
              <Share2 size={14} strokeWidth={1.5} />
            </button>

            {ad.user_email?.toLowerCase() === userEmail.toLowerCase() || ad.is_admin_post || ad.cost_per_impression === 0 ? null : (
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

export default React.memo(AdCard);
