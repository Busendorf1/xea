"use client";

import { useEffect, useState } from "react";
import { FaPhone, FaWhatsapp, FaGlobe, FaEnvelope, FaVideo, FaApple, FaAndroid } from "react-icons/fa";
import { Eye, Coins, UserPlus } from "lucide-react";
import styles from "../Adreview/page.module.css"; // Your CSS module

interface AdPreviewCardProps {
  mediaFiles: File[];
  mediaType: "text" | "image" | "video" | "mixed" | "";
  existingMedia?: string;
  actionButtons: string[];
  actionDetails: Record<string, string>;
  adContent: string;
  displayMutualButton?: boolean;
  adType?: string;
  productName?: string;
  productPrice?: string | number;
  productCtaType?: string;
  productCtaLink?: string;
}

const AdPreviewCard: React.FC<AdPreviewCardProps> = ({
  mediaFiles = [],
  mediaType = "text",
  existingMedia = "",
  actionButtons = [],
  actionDetails = {},
  adContent = "",
  displayMutualButton = false,
  adType = "",
  productName = "",
  productPrice = "",
  productCtaType = "Buy",
  productCtaLink = "",
}) => {
  const [mediaURLs, setMediaURLs] = useState<string[]>([]);

  useEffect(() => {
    if (mediaFiles && mediaFiles.length > 0) {
      const urls = mediaFiles.map((file) => URL.createObjectURL(file));
      setMediaURLs(urls);

      return () => {
        urls.forEach((url) => URL.revokeObjectURL(url));
      };
    } else if (existingMedia && existingMedia.trim() && existingMedia.toLowerCase() !== "text") {
      setMediaURLs(existingMedia.split(",").map((s) => s.trim()).filter(Boolean));
    } else {
      setMediaURLs([]);
    }
  }, [mediaFiles, existingMedia]);

  const getIcon = (type: string) => {
    switch (type) {
      case "phone":
        return <FaPhone />;
      case "whatsapp":
        return <FaWhatsapp />;
      case "website":
        return <FaGlobe />;
      case "email":
        return <FaEnvelope />;
      case "ios":
        return <FaApple />;
      case "android":
        return <FaAndroid />;
      case "watch_now":
        return <FaVideo />;
      default:
        return null;
    }
  };

  const getHref = (type: string) => {
    switch (type) {
      case "phone":
        return `tel:${actionDetails?.[type] || ""}`;
      case "whatsapp":
        return `https://wa.me/${actionDetails?.[type] || ""}`;
      case "email":
        return `mailto:${actionDetails?.[type] || ""}`;
      case "website":
      case "ios":
      case "android":
      case "watch_now": {
        const val = actionDetails?.[type] || "";
        return val ? (val.startsWith("http") ? val : `https://${val}`) : "#";
      }
      default:
        return "#";
    }
  };

  const formatCurrency = (amount: number | string) => {
    const val = typeof amount === "string" ? parseFloat(amount) : amount;
    return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isFirstVideo = Boolean(
    mediaFiles[0]
      ? mediaFiles[0].type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(mediaFiles[0].name)
      : (mediaURLs[0] && /\.(mp4|webm|mov|avi|mkv|3gp|m3u8)$/i.test(mediaURLs[0]))
  );
  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(() => (isFirstVideo ? 16 / 9 : 1.0));

  return (
    <div className={styles.card}>
      {/* Product Name & Description (if product sales) */}
      {adType === "product_sales" && (
        <>
          <h4 className={styles.productNameTitle}>{productName || "Product Name"}</h4>
          {adContent && (
            <p className={styles.productDescriptionText}>
              {adContent}
            </p>
          )}
        </>
      )}

      {/* Media Preview (only if there are media URLs) */}
      {mediaURLs.length > 0 && (
        <div
          className={styles.mediaRowContainer}
          style={{
            aspectRatio: `${baseAspectRatio}`,
          }}
        >
          {mediaURLs.map((url, index) => {
            const file = mediaFiles[index];
            const isItemVideo = file
              ? file.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(file.name)
              : /\.(mp4|webm|mov|avi|mkv|3gp|m3u8)$/i.test(url);

            return (
              <div key={`${url}-${index}`} className={styles.mediaRowItem}>
                {isItemVideo ? (
                  <video
                    src={url}
                    controls
                    playsInline
                    onLoadedMetadata={(e) => {
                      if (index === 0) {
                        const v = e.currentTarget;
                        if (v.videoWidth && v.videoHeight) {
                          const rawRatio = v.videoWidth / v.videoHeight;
                          const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
                          setBaseAspectRatio(clamped);
                        }
                      }
                    }}
                  />
                ) : (
                  <img
                    src={url}
                    alt={adContent || "Ad Preview"}
                    onLoad={(e) => {
                      if (index === 0) {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) {
                          const rawRatio = img.naturalWidth / img.naturalHeight;
                          const clamped = Math.min(Math.max(rawRatio, 0.8), 1.777);
                          setBaseAspectRatio(clamped);
                        }
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Product Description / Ad Content (if NOT product sales) */}
      {adType !== "product_sales" && (
        <p className={styles.adText}>{adContent || "Ad Message"}</p>
      )}

      {/* Action Bar / Buttons */}
      {adType === "product_sales" ? (
        <div className={styles.productSalesActionBar}>
          {/* Left side: Price & CTA button */}
          <div className={styles.productLeftGroup}>
            <span className={styles.productPriceText}>
              {formatCurrency(productPrice || 0)}
            </span>
            <a
              href={productCtaLink ? (productCtaLink.startsWith("http") ? productCtaLink : `https://${productCtaLink}`) : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.productCtaButton}
            >
              {productCtaType || "Buy"}
            </a>
          </div>

          {/* Middle: Secondary buttons */}
          <div className={styles.productMiddleGroup}>
            {actionButtons.map((type) => (
              <a
                key={`${type}-${actionDetails?.[type] || ""}`}
                href={getHref(type)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.productActionButton}
                aria-label={`Contact via ${type}`}
                title={type}
              >
                {getIcon(type)}
              </a>
            ))}
          </div>

          {/* Right Group: Live Preview interaction buttons */}
          <div className={styles.productRightGroup}>
            <button className={styles.seenBtn} type="button">
              <Eye size={11} strokeWidth={2} />
              <span>Seen</span>
            </button>
            <button className={styles.earnBtn} type="button" disabled>
              <Coins size={11} strokeWidth={2} />
              <span>Earn+</span>
            </button>
            {displayMutualButton && (
              <button className={styles.mutualBtn} type="button" disabled>
                <UserPlus size={11} strokeWidth={2} />
                <span>Mutual+</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.actionButtons}>
            {productCtaLink && (
              <a
                href={productCtaLink.startsWith("http") ? productCtaLink : `https://${productCtaLink}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.productCtaButton} ${styles.productCtaButtonMargin}`}
              >
                {productCtaType || "Comment"}
              </a>
            )}
            {actionButtons.map((type) => (
              <a
                key={`${type}-${actionDetails?.[type] || ""}`}
                href={getHref(type)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.iconButton}
                aria-label={`Contact via ${type}`}
                title={type}
              >
                {getIcon(type)}
              </a>
            ))}
          </div>

          {/* Mutual+ Button Preview */}
          {adType !== "product_sales" && displayMutualButton && (
            <div className={styles.mutualPreview}>
              <button className={styles.mutualPreviewBtn} type="button">
                Mutual+
              </button>
              <span className={styles.mutualPreviewNote}>
                Viewers will see this button and can add you as a mutual
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdPreviewCard;
