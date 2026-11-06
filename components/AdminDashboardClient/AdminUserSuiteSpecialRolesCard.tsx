"use client";

import React from "react";
import { Edit2, Check } from "lucide-react";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import styles from "./page.module.css";

export interface AdminUserSuiteSpecialRolesCardProps {
  activeUser: any;
  specialCareer: boolean;
  setSpecialCareer: (v: boolean) => void;
  specialAffiliate: boolean;
  setSpecialAffiliate: (v: boolean) => void;
  specialAffiliateRole: string;
  setSpecialAffiliateRole: (r: string) => void;
  editingSpecialRoles: boolean;
  setEditingSpecialRoles: (v: boolean) => void;
  userActionSubmitting: boolean;
  handleUpdateSpecialRoles?: (
    user: any,
    roles: { isCareer: boolean; isAffiliate: boolean; affiliateRole?: string | null }
  ) => void;
}

export function AdminUserSuiteSpecialRolesCard({
  activeUser,
  specialCareer,
  setSpecialCareer,
  specialAffiliate,
  setSpecialAffiliate,
  specialAffiliateRole,
  setSpecialAffiliateRole,
  editingSpecialRoles,
  setEditingSpecialRoles,
  userActionSubmitting,
  handleUpdateSpecialRoles,
}: AdminUserSuiteSpecialRolesCardProps) {
  return (
    <div className={`${styles.modalSectionCard} ${styles.mtSm}`}>
      <div className={styles.flexBetweenCenter}>
        <div className={styles.flexRowWrapGapSm}>
          <h5 className={`${styles.fieldLabel} ${styles.m0Bold}`}>
            Special Roles &amp; Badges (Career &amp; Affiliate)
          </h5>
          <RoleStarBadges
            email={activeUser.email}
            isCareer={specialCareer}
            isAffiliate={specialAffiliate}
            affiliateRole={specialAffiliateRole}
            variant="profile"
          />
        </div>
        {!editingSpecialRoles ? (
          <button
            type="button"
            onClick={() => setEditingSpecialRoles(true)}
            className={`${styles.btnAction} ${styles.fontSm}`}
          >
            <Edit2 size={12} className={styles.iconSmallSpacing} />
            Edit Badges
          </button>
        ) : (
          <div className={styles.flexGapSm}>
            <button
              type="button"
              disabled={userActionSubmitting}
              onClick={async () => {
                if (handleUpdateSpecialRoles) {
                  await handleUpdateSpecialRoles(activeUser, {
                    isCareer: specialCareer,
                    isAffiliate: specialAffiliate,
                    affiliateRole: specialAffiliateRole,
                  });
                  setEditingSpecialRoles(false);
                }
              }}
              className={`${styles.btnAction} ${styles.btnSuccess} ${styles.fontSm}`}
            >
              <Check size={12} className={styles.iconSmallSpacing} />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSpecialCareer(Boolean(activeUser.is_career));
                setSpecialAffiliate(Boolean(activeUser.is_affiliate));
                setSpecialAffiliateRole(activeUser.affiliate_role || "");
                setEditingSpecialRoles(false);
              }}
              className={`${styles.btnAction} ${styles.fontSm}`}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!editingSpecialRoles ? (
        <div className={`${styles.gridTwoCol} ${styles.gap10}`}>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Career Badge (Purple Star)</span>
            <span className={styles.fieldValue}>
              {specialCareer ? "Active (Purple Star)" : "None"}
            </span>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Affiliate Badge (Yellow Star)</span>
            <span className={styles.fieldValue}>
              {specialAffiliate ? `Active: ${specialAffiliateRole || "Platform Affiliate"}` : "None"}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.roleEditorForm}>
          <label className={styles.roleCheckboxLabel}>
            <input
              type="checkbox"
              checked={specialCareer}
              onChange={(e) => setSpecialCareer(e.target.checked)}
            />
            <span><strong>Career Badge</strong> (Purple Star icon — 0% earn)</span>
          </label>
          <label className={styles.roleCheckboxLabel}>
            <input
              type="checkbox"
              checked={specialAffiliate}
              onChange={(e) => setSpecialAffiliate(e.target.checked)}
            />
            <span><strong>Affiliate Badge</strong> (Yellow Star icon — earns 10% on every platform earn from its 50%)</span>
          </label>
          {specialAffiliate && (
            <div className={`${styles.fieldGroup} ${styles.mtXs}`}>
              <span className={styles.fieldLabel}>Affiliate Role Title (What they do for the platform)</span>
              <input
                type="text"
                className={styles.profileInput}
                placeholder="e.g. Affiliate Developer, Affiliate First Agent"
                value={specialAffiliateRole}
                onChange={(e) => setSpecialAffiliateRole(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminUserSuiteSpecialRolesCard;
