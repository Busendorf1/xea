import React from "react";
import {
  Phone,
  MessageCircle,
  Globe,
  Mail,
  Play,
  Apple,
  ChevronDown,
  Video,
} from "lucide-react";
import styles from "./AdCard.module.css";
import MediaCarousel from "./MediaCarousel";

export const getAdActionIcon = (type: string): React.ReactNode => {
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

export interface AdCardCompoundSlots {
  Root: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  Header: React.FC<{ advertiserName?: string; timestamp?: string | null; sponsorLabel?: string }>;
  Media: React.FC<{ adMedia?: string | null; hlsUrl?: string | null; isMuted?: boolean; onToggleMute?: () => void }>;
  Body: React.FC<{ content?: string; isExpanded?: boolean; onToggleExpand?: () => void }>;
  Actions: React.FC<{ children?: React.ReactNode }>;
}

export function attachAdCardSlots<T extends object>(component: T): T & AdCardCompoundSlots {
  const target = component as T & AdCardCompoundSlots;

  target.Root = function AdCardRoot({ children, className, ...props }: any) {
    return (
      <div className={`${styles.card} ${className || ""}`} {...props}>
        {children}
      </div>
    );
  };

  target.Header = function AdCardHeader({ advertiserName, sponsorLabel }: any) {
    return (
      <div className={styles.tweetHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.sponsorName}>{advertiserName}</span>
        </div>
        {sponsorLabel && (
          <div className={styles.headerRightContainer}>
            <span className={styles.sponsorLabel}>{sponsorLabel}</span>
          </div>
        )}
      </div>
    );
  };

  target.Media = function AdCardMedia({ adMedia, hlsUrl, isMuted = true, onToggleMute }: any) {
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

  target.Body = function AdCardBody({ content }: any) {
    return <p className={styles.adText}>{content}</p>;
  };

  target.Actions = function AdCardActions({ children }: any) {
    return <div className={styles.actionButtons}>{children}</div>;
  };

  return target;
}
