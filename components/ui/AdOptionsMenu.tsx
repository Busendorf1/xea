import React, { useEffect, useRef, useState } from "react";
import { MoreVertical, ShieldAlert, UserX, EyeOff } from "lucide-react";
import styles from "./AdCard.module.css";

export type AdReportType = "ad" | "advertiser" | "dont_show";

interface AdOptionsMenuProps {
  adId: string;
  advertiserEmail?: string;
  showThreeDotMenu: boolean;
  onToggleMenu: (show: boolean) => void;
  onDismiss?: (adId: string, advertiserEmail?: string, reportType?: AdReportType) => void;
  onShowToast?: (msg: string) => void;
}

const AdOptionsMenu: React.FC<AdOptionsMenuProps> = ({
  adId,
  advertiserEmail,
  showThreeDotMenu,
  onToggleMenu,
  onDismiss,
  onShowToast,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submittingType, setSubmittingType] = useState<AdReportType | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggleMenu(false);
      }
    };
    if (showThreeDotMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showThreeDotMenu, onToggleMenu]);

  const notifyUser = (msg: string) => {
    if (onShowToast) {
      onShowToast(msg);
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message: msg } }));
    }
  };

  const handleReportAction = async (reportType: AdReportType) => {
    if (submittingType) return;
    if (reportType === "advertiser" && !advertiserEmail) {
      onToggleMenu(false);
      notifyUser("Unable to block this advertiser: advertiser identifier missing.");
      return;
    }

    setSubmittingType(reportType);
    try {
      const response = await fetch("/api/campaigns/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          adId,
          advertiserEmail: advertiserEmail || "",
          reportType,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        onToggleMenu(false);
        notifyUser(data?.error || "Unable to complete that action right now.");
        return;
      }

      onToggleMenu(false);
      onDismiss?.(adId, advertiserEmail, reportType);

      if (reportType === "dont_show") {
        notifyUser("Ad hidden from your feed.");
        return;
      }

      if (typeof window !== "undefined") {
        const helpUrl =
          reportType === "advertiser"
            ? `/help?reportAdId=${encodeURIComponent(adId)}&advertiserEmail=${encodeURIComponent(
                advertiserEmail || ""
              )}&type=advertiser&reported=1`
            : `/help?reportAdId=${encodeURIComponent(adId)}&type=ad&reported=1`;
        setTimeout(() => {
          window.location.href = helpUrl;
        }, 250);
      }
    } catch {
      onToggleMenu(false);
      notifyUser("Network error while submitting report. Please try again.");
    } finally {
      setSubmittingType(null);
    }
  };

  return (
    <div className={styles.threeDotMenuWrapper} ref={menuRef}>
      <button
        type="button"
        className={styles.threeDotBtn}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu(!showThreeDotMenu);
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
            disabled={submittingType !== null}
            onClick={() => handleReportAction("ad")}
          >
            <ShieldAlert size={14} className={styles.dropdownIconDanger} />
            <span>{submittingType === "ad" ? "Blocking Ad..." : "Block & report Ad"}</span>
          </button>

          <button
            type="button"
            className={styles.dropdownOption}
            disabled={submittingType !== null}
            onClick={() => handleReportAction("advertiser")}
          >
            <UserX size={14} className={styles.dropdownIconDanger} />
            <span>
              {submittingType === "advertiser" ? "Blocking Advertiser..." : "Block & report Advertiser"}
            </span>
          </button>

          <button
            type="button"
            className={styles.dropdownOption}
            disabled={submittingType !== null}
            onClick={() => handleReportAction("dont_show")}
          >
            <EyeOff size={14} className={styles.dropdownIconMuted} />
            <span>{submittingType === "dont_show" ? "Hiding Ad..." : "Don\u2019t show this Ad again"}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(AdOptionsMenu);
