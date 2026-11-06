"use client";

import React from "react";
import { Download, Check, Edit2, ExternalLink } from "lucide-react";
import styles from "./page.module.css";
import AdminUserSuiteSpecialRolesCard from "./AdminUserSuiteSpecialRolesCard";

export interface AdminUserSuiteProfileTabProps {
  activeUser: any;
  isEditingProfile: boolean;
  setIsEditingProfile: (v: boolean) => void;
  profileFormData: any;
  setProfileFormData: (data: any) => void;
  savingProfile: boolean;
  userActionSubmitting: boolean;
  handleDownloadUserData: () => void;
  handleSaveProfile: () => void;
  specialCareer: boolean;
  setSpecialCareer: (v: boolean) => void;
  specialAffiliate: boolean;
  setSpecialAffiliate: (v: boolean) => void;
  specialAffiliateRole: string;
  setSpecialAffiliateRole: (r: string) => void;
  editingSpecialRoles: boolean;
  setEditingSpecialRoles: (v: boolean) => void;
  handleUpdateSpecialRoles?: (
    user: any,
    roles: { isCareer: boolean; isAffiliate: boolean; affiliateRole?: string | null }
  ) => void;
  expandedCampaignType: "ads" | "activeAds" | "news" | "activeNews" | null;
  setExpandedCampaignType: (t: "ads" | "activeAds" | "news" | "activeNews" | null) => void;
  userCampaigns: {
    ads: any[];
    activeAds: any[];
    news: any[];
    activeNews: any[];
  };
  setInspectingCampaignItem: (item: { item: any; type: "ad" | "highlight" } | null) => void;
}

export function AdminUserSuiteProfileTab({
  activeUser,
  isEditingProfile,
  setIsEditingProfile,
  profileFormData,
  setProfileFormData,
  savingProfile,
  userActionSubmitting,
  handleDownloadUserData,
  handleSaveProfile,
  specialCareer,
  setSpecialCareer,
  specialAffiliate,
  setSpecialAffiliate,
  specialAffiliateRole,
  setSpecialAffiliateRole,
  editingSpecialRoles,
  setEditingSpecialRoles,
  handleUpdateSpecialRoles,
  expandedCampaignType,
  setExpandedCampaignType,
  userCampaigns,
  setInspectingCampaignItem,
}: AdminUserSuiteProfileTabProps) {
  return (
    <>
      <div className={styles.flexBetweenCenter}>
        <h4 className={`${styles.modalSectionTitle} ${styles.m0Bold}`}>
          User Account Information
        </h4>
        <div className={styles.flexRowWrapGapSm}>
          <button
            onClick={handleDownloadUserData}
            className={`${styles.btnAction} ${styles.subTabActionBtn}`}
            title="Export complete user registration, traits, ledger statement and network in JSON format"
          >
            <Download size={14} />
            Export Data (JSON)
          </button>
          {isEditingProfile ? (
            <div className={styles.flexGapSm}>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile || userActionSubmitting}
                className={`${styles.btnAction} ${styles.btnSuccess}`}
              >
                <Check size={14} className={styles.iconSmallSpacing} />
                {savingProfile ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setIsEditingProfile(false)}
                disabled={savingProfile}
                className={styles.btnAction}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingProfile(true)}
              className={`${styles.btnAction} ${styles.btnSuccess}`}
            >
              <Edit2 size={14} className={styles.iconSmallSpacing} />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {isEditingProfile ? (
        <div className={styles.gridTwoCol}>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>First Name</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.firstName || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, firstName: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Last Name</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.lastName || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, lastName: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Business / Rep Name</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.business_name || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, business_name: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Phone Number</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.phone || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, phone: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Country</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.country || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, country: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>State</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.state || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, state: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Specific Location</span>
            <input
              type="text"
              className={styles.profileInput}
              value={profileFormData.location || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, location: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Gender</span>
            <select
              className={styles.profileInput}
              value={profileFormData.gender || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, gender: e.target.value })}
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Employment</span>
            <input
              type="text"
              className={styles.profileInput}
              placeholder="e.g. Employed, Self-employed, Student"
              value={profileFormData.employment || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, employment: e.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>ATW Tier</span>
            <input
              type="text"
              className={styles.profileInput}
              placeholder="e.g. Bronze, Silver, Gold, Platinum"
              value={profileFormData.atw_tier || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, atw_tier: e.target.value })}
            />
          </div>
          <div className={`${styles.fieldGroup} ${styles.colSpanFull}`}>
            <span className={styles.fieldLabel}>Bio</span>
            <textarea
              className={styles.profileTextarea}
              value={profileFormData.bio || ""}
              onChange={(e) => setProfileFormData({ ...profileFormData, bio: e.target.value })}
              placeholder="User profile biography..."
            />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.gridTwoCol}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Full Name</span>
              <span className={styles.fieldValue}>
                {`${activeUser.firstName || ""} ${activeUser.lastName || ""}`.trim() || "Not set"}
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Business / Rep Name</span>
              <span className={styles.fieldValue}>{activeUser.business_name || "None"}</span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Phone Number</span>
              <span className={styles.fieldValue}>{activeUser.phone || "Not set"}</span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Country &amp; State</span>
              <span className={styles.fieldValue}>
                {activeUser.state ? `${activeUser.state}, ` : ""}{activeUser.country || "Not set"}
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Detailed Location</span>
              <span className={styles.fieldValue}>{activeUser.location || "Not specified"}</span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Gender &amp; Employment</span>
              <span className={styles.fieldValue}>
                {activeUser.gender || "Unspecified"} &bull; {activeUser.employment || "Unspecified"}
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Registered Date</span>
              <span className={styles.fieldValue}>
                {activeUser.created_at
                  ? new Date(activeUser.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Unknown"}
              </span>
            </div>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Attention Worth (ATW)</span>
              <span className={styles.fieldValue}>
                Tier: {activeUser.atw_tier || "Standard"} &bull; Score: {activeUser.attention_worth_score || 0}
              </span>
            </div>
          </div>

          {activeUser.bio && (
            <div className={`${styles.modalSectionCard} ${styles.mtSm}`}>
              <span className={styles.fieldLabel}>Profile Bio</span>
              <p className={styles.bioParagraph}>
                {activeUser.bio}
              </p>
            </div>
          )}

          {/* SPECIAL ROLES & BADGES (CAREER & AFFILIATE) */}
          <AdminUserSuiteSpecialRolesCard
            activeUser={activeUser}
            specialCareer={specialCareer}
            setSpecialCareer={setSpecialCareer}
            specialAffiliate={specialAffiliate}
            setSpecialAffiliate={setSpecialAffiliate}
            specialAffiliateRole={specialAffiliateRole}
            setSpecialAffiliateRole={setSpecialAffiliateRole}
            editingSpecialRoles={editingSpecialRoles}
            setEditingSpecialRoles={setEditingSpecialRoles}
            userActionSubmitting={userActionSubmitting}
            handleUpdateSpecialRoles={handleUpdateSpecialRoles}
          />

          <div className={styles.modalSectionCard}>
            <div className={styles.flexBetweenCenter}>
              <h5 className={`${styles.fieldLabel} ${styles.m0Bold}`}>
                Ad &amp; Activity Overview (Click to Inspect Campaigns)
              </h5>
              {expandedCampaignType && (
                <button
                  onClick={() => setExpandedCampaignType(null)}
                  className={styles.closeViewBtn}
                >
                  ✕ Close View
                </button>
              )}
            </div>
            <div className={styles.campaignChipsRow}>
              <button
                type="button"
                onClick={() => setExpandedCampaignType(expandedCampaignType === "activeAds" ? null : "activeAds")}
                className={`${styles.clickableOverviewChip} ${expandedCampaignType === "activeAds" ? styles.clickableOverviewChipActive : ""}`}
                title="Click to view and inspect active ads"
              >
                <strong>Active Ads:</strong> {activeUser.activeAdsCount ?? 0} {expandedCampaignType === "activeAds" ? "▲" : "▼"}
              </button>
              <button
                type="button"
                onClick={() => setExpandedCampaignType(expandedCampaignType === "ads" ? null : "ads")}
                className={`${styles.clickableOverviewChip} ${expandedCampaignType === "ads" ? styles.clickableOverviewChipActive : ""}`}
                title="Click to view and inspect review/pending ads"
              >
                <strong>Review Ads:</strong> {activeUser.reviewAdsCount ?? 0} {expandedCampaignType === "ads" ? "▲" : "▼"}
              </button>
              <button
                type="button"
                onClick={() => setExpandedCampaignType(expandedCampaignType === "activeNews" ? null : "activeNews")}
                className={`${styles.clickableOverviewChip} ${expandedCampaignType === "activeNews" ? styles.clickableOverviewChipActive : ""}`}
                title="Click to view and inspect active highlights"
              >
                <strong>Active Highlights:</strong> {activeUser.activeHighlightsCount ?? 0} {expandedCampaignType === "activeNews" ? "▲" : "▼"}
              </button>
              <button
                type="button"
                onClick={() => setExpandedCampaignType(expandedCampaignType === "news" ? null : "news")}
                className={`${styles.clickableOverviewChip} ${expandedCampaignType === "news" ? styles.clickableOverviewChipActive : ""}`}
                title="Click to view and inspect review highlights"
              >
                <strong>Review Highlights:</strong> {activeUser.reviewHighlightsCount ?? 0} {expandedCampaignType === "news" ? "▲" : "▼"}
              </button>
              <span className={styles.clickableOverviewChip}>
                <strong>Total Ad Clicks:</strong> {activeUser.totalClicksOnAds ?? 0}
              </span>
              <span className={styles.clickableOverviewChip}>
                <strong>Mutual Followers:</strong> {activeUser.mutual_count ?? 0} / 50
              </span>
            </div>

            {expandedCampaignType && (
              <div className={styles.campaignExpandedArea}>
                <div className={styles.flexBetweenCenter}>
                  <span className={styles.campaignExpandedLabel}>
                    {expandedCampaignType === "activeAds"
                      ? `Active Ads (${userCampaigns.activeAds.length})`
                      : expandedCampaignType === "ads"
                      ? `Review Ads (${userCampaigns.ads.length})`
                      : expandedCampaignType === "activeNews"
                      ? `Active Highlights (${userCampaigns.activeNews.length})`
                      : `Review Highlights (${userCampaigns.news.length})`}
                  </span>
                </div>
                {userCampaigns[expandedCampaignType]?.length === 0 ? (
                  <div className={styles.campaignEmptyNote}>
                    No items found in this section for this user.
                  </div>
                ) : (
                  <div className={styles.campaignMiniTableScroll}>
                    <table className={styles.miniTable}>
                      <thead>
                        <tr>
                          <th>Campaign Title</th>
                          <th>Delivered / Target</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userCampaigns[expandedCampaignType].map((c: any) => {
                          const isHighlight = expandedCampaignType === "activeNews" || expandedCampaignType === "news";
                          const itemTitle = isHighlight
                            ? (c.title || "Untitled Highlight")
                            : (c.product_name || c.title || (c.ad_content ? (c.ad_content.length > 50 ? c.ad_content.slice(0, 50) + "..." : c.ad_content) : ("Campaign " + (c.id?.slice(0, 8) || ""))));

                          return (
                            <tr key={c.id}>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => setInspectingCampaignItem({ item: c, type: isHighlight ? "highlight" : "ad" })}
                                  className={styles.campaignInspectBtn}
                                  title={isHighlight ? "Click to view and inspect highlight" : "Click to view and inspect campaign"}
                                >
                                  <span>{itemTitle}</span>
                                  <ExternalLink size={12} className={styles.iconSmallSpacing} />
                                </button>
                                <div className={styles.campaignMetaSubtext}>
                                  ID: {c.id?.slice(0, 8)}... • {isHighlight ? "Highlight" : (c.ad_type || "Ad")}
                                </div>
                              </td>
                              <td>
                                {c.impressions !== undefined ? `${c.impression_count ?? 0} / ${c.impressions || "∞"}` : (c.interest || "Highlight")}
                              </td>
                              <td>
                                {c.is_paused ? (
                                  <span className={`${styles.userBadge} ${styles.btnWarning} ${styles.fontXs}`}>Paused</span>
                                ) : (
                                  <span className={`${styles.userBadge} ${styles.monetizedYes} ${styles.fontXs}`}>Live</span>
                                )}
                              </td>
                              <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : "N/A"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default AdminUserSuiteProfileTab;
