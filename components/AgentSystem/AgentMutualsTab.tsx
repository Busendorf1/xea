"use client";

import React from "react";
import Avatar from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import AdvertiserHoverCard from "@/components/ui/AdvertiserHoverCard";
import type { MutualUserItem } from "@/lib/agentSystem";
import styles from "./AgentSystem.module.css";

export interface AgentMutualsTabProps {
  mutualList: MutualUserItem[];
}

export default function AgentMutualsTab({ mutualList }: AgentMutualsTabProps) {
  if (mutualList.length === 0) {
    return <div className={styles.emptyState}>No mutuals yet.</div>;
  }

  return (
    <>
      {mutualList.map((mutual: MutualUserItem, idx: number) => (
        <div key={`${mutual.username}-${idx}`} className={styles.userRow}>
          <div className={styles.userRowMain}>
            <div className={styles.userInfoLeft}>
              <AdvertiserHoverCard
                profile={mutual.profile}
                customName={mutual.displayName}
                customHandle={mutual.username}
                customLogo={mutual.profileImage || undefined}
              >
                <span className={styles.avatarTrigger}>
                  <Avatar
                    src={mutual.profileImage}
                    name={mutual.displayName}
                    size={26}
                    alt={mutual.username}
                  />
                </span>
              </AdvertiserHoverCard>

              <div className={styles.nameWithBadge}>
                <span className={styles.selectableNameBtn}>@{mutual.username}</span>
                {mutual.profile?.monetized && (
                  <VerifiedBadge size={13} title="Monetized Account" />
                )}
                <RoleStarBadges
                  email={mutual.profile?.email}
                  isCareer={mutual.profile?.is_career}
                  isAffiliate={mutual.profile?.is_affiliate}
                  affiliateRole={mutual.profile?.affiliate_role}
                  size={13}
                  variant="compact"
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
