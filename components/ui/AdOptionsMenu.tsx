import React, { useEffect, useRef } from "react";
import { MoreVertical, ShieldAlert, UserX, EyeOff } from "lucide-react";
import styles from "./AdCard.module.css";

interface AdOptionsMenuProps {
  adId: string;
  advertiserEmail?: string;
  showThreeDotMenu: boolean;
  onToggleMenu: (show: boolean) => void;
}

const AdOptionsMenu: React.FC<AdOptionsMenuProps> = ({
  adId,
  advertiserEmail,
  showThreeDotMenu,
  onToggleMenu,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleBlockAndReportAd = () => {
    onToggleMenu(false);
    if (typeof window !== "undefined") {
      window.location.href = `/help?reportAdId=${encodeURIComponent(adId)}&type=ad`;
    }
  };

  const handleBlockAndReportAdvertiser = () => {
    onToggleMenu(false);
    if (typeof window !== "undefined") {
      window.location.href = `/help?reportAdId=${encodeURIComponent(adId)}&advertiserEmail=${encodeURIComponent(advertiserEmail || "")}&type=advertiser`;
    }
  };

  const handleDontShowAgain = () => {
    onToggleMenu(false);
    if (typeof window !== "undefined") {
      window.location.href = `/help?reportAdId=${encodeURIComponent(adId)}&type=dont_show`;
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
  );
};

export default React.memo(AdOptionsMenu);
