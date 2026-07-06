"use client";

import { useEffect, useState } from "react";
import { FaPhone, FaWhatsapp, FaGlobe, FaEnvelope } from "react-icons/fa";
import styles from "../Adreview/page.module.css"; // Your CSS module

interface AdPreviewCardProps {
  mediaFiles: File[];
  mediaType: "text" | "image" | "video" | "mixed" | "";
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
  actionButtons = [],
  actionDetails = {},
  adContent = "",
  displayMutualButton = false,
  adType = "",
  productName = "",
  productPrice = "",
  productCtaType = "Buy Now",
  productCtaLink = "",
}) => {
  const [mediaURLs, setMediaURLs] = useState<string[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState<number>(0);

  useEffect(() => {
    if (mediaFiles && mediaFiles.length > 0) {
      const urls = mediaFiles.map((file) => URL.createObjectURL(file));
      setMediaURLs(urls);
      setCurrentMediaIndex(0);

      return () => {
        urls.forEach((url) => URL.revokeObjectURL(url));
      };
    } else {
      setMediaURLs([]);
    }
  }, [mediaFiles]);

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
        return actionDetails?.[type] || "#";
      default:
        return "#";
    }
  };

  const formatCurrency = (amount: number | string) => {
    const val = typeof amount === "string" ? parseFloat(amount) : amount;
    return isNaN(val) ? "₦0.00" : "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const currentFile = mediaFiles[currentMediaIndex];
  const isVideo = currentFile
    ? currentFile.type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(currentFile.name)
    : false;

  return (
    <div className={styles.card}>
      {/* Product Name (if product sales) */}
      {adType === "product_sales" && (
        <h4 className={styles.productNameTitle}>{productName || "Product Name"}</h4>
      )}

      {/* Media Preview (only if there are media URLs) */}
      {mediaURLs.length > 0 && (
        <div className={styles.mediaBox}>
          {isVideo ? (
            <video key={mediaURLs[currentMediaIndex]} src={mediaURLs[currentMediaIndex]} controls playsInline />
          ) : (
            <img src={mediaURLs[currentMediaIndex]} alt={adContent || "Ad Preview"} />
          )}

          {mediaURLs.length > 1 && (
            <button
              type="button"
              className={styles.arrowBtn}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentMediaIndex((prev) => (prev + 1) % mediaURLs.length);
              }}
              title="Next Media"
            >
              &gt;
            </button>
          )}
        </div>
      )}

      {/* Product Description / Ad Content */}
      <p className={styles.adText}>{adContent || (adType === "product_sales" ? "Product Description" : "Ad Message")}</p>

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
              {productCtaType || "Buy Now"}
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
                className={styles.iconButton}
                aria-label={`Contact via ${type}`}
                title={type}
              >
                {getIcon(type)}
              </a>
            ))}
          </div>

          {/* Right: Mutual Preview */}
          {displayMutualButton && (
            <div className={styles.productRightGroup}>
              <button className={styles.mutualPreviewBtn} type="button">
                Mutual+
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.actionButtons}>
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
          {displayMutualButton && (
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
