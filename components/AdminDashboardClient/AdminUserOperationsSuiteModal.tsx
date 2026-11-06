"use client";

import React from "react";
import {
  XCircle,
  Megaphone,
  ShieldAlert,
  User,
  Wallet,
  Shield,
  Users,
  ExternalLink,
  Sparkles,
  Globe,
} from "lucide-react";
import styles from "./page.module.css";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import { AdminAdMediaBox } from "./AdminAdMediaBox";
import { AdminUserSuiteSpecialRolesCard } from "./AdminUserSuiteSpecialRolesCard";
import { AdminUserSuiteDownlineCard } from "./AdminUserSuiteDownlineCard";
import { AdminUserSuiteProfileTab } from "./AdminUserSuiteProfileTab";
import { AdminUserSuiteStatementTab } from "./AdminUserSuiteStatementTab";
import { AdminUserSuiteSecurityTab } from "./AdminUserSuiteSecurityTab";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export interface AdminUserOperationsSuiteModalProps {
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  userActionSubmitting: boolean;
  handleAdjustBalance: (user: any, amount: number) => void;
  handleSuspendUser: (user: any, hours: number) => void;
  handleDeleteUser: (user: any) => void;
  handleToggleMonetization?: (user: any) => void;
  handleUpdateUserProfile?: (user: any, updatedFields: Record<string, any>) => Promise<boolean>;
  handleUpdateSpecialRoles?: (user: any, roles: { isCareer: boolean; isAffiliate: boolean; affiliateRole?: string | null }) => void;
  handleToggleAgent?: (user: any, makeAgent: boolean) => void;
  handleBanAgent?: (
    user: any,
    options: {
      banType: "temp" | "perm" | "unban";
      days?: number;
      customUntil?: string;
      reason: string;
      detachFollowers?: boolean;
    }
  ) => void;
  handleRemoveFollower?: (user: any, refereeEmail: string, followerLabel?: string) => void;
  handleRemoveAllFollowers?: (user: any) => void;
  handleDetachUplineAgent?: (user: any, uplineLabel?: string) => void;
  handleDeactivateAccount?: (user: any, deactivated: boolean) => void;
  handleResetClicks?: (user: any, clicks: number) => void;
  setBanModalUser: (u: any) => void;
  setBanModalStatus: (s: "active" | "temp_banned" | "perm_banned" | "deactivated") => void;
  setBanModalReason: (r: string) => void;
  activeActionId?: string | null;
}

export function AdminUserOperationsSuiteModal({
  selectedUser,
  setSelectedUser,
  userActionSubmitting,
  activeActionId,
  handleAdjustBalance,
  handleSuspendUser,
  handleDeleteUser,
  handleToggleMonetization,
  handleUpdateUserProfile,
  handleUpdateSpecialRoles,
  handleToggleAgent,
  handleBanAgent,
  handleRemoveFollower,
  handleRemoveAllFollowers,
  handleDetachUplineAgent,
  handleDeactivateAccount,
  handleResetClicks,
  setBanModalUser,
  setBanModalStatus,
  setBanModalReason,
}: AdminUserOperationsSuiteModalProps) {
  const [activeTab, setActiveTab] = React.useState<"profile" | "statement" | "network" | "security">((selectedUser?.initialTab as any) || "profile");
  const [userDetails, setUserDetails] = React.useState<any>(null);
  const [userStatement, setUserStatement] = React.useState<any[]>([]);
  const [userNetwork, setUserNetwork] = React.useState<any>(null);
  const [userReferrals, setUserReferrals] = React.useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [profileFormData, setProfileFormData] = React.useState<any>({});
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [userCampaigns, setUserCampaigns] = React.useState<{
    ads: any[];
    activeAds: any[];
    news: any[];
    activeNews: any[];
  }>({ ads: [], activeAds: [], news: [], activeNews: [] });
  const [expandedCampaignType, setExpandedCampaignType] = React.useState<"ads" | "activeAds" | "news" | "activeNews" | null>(null);
  const [customSuspensionDateTime, setCustomSuspensionDateTime] = React.useState("");
  const [inspectingCampaignItem, setInspectingCampaignItem] = React.useState<{ item: any; type: "ad" | "highlight" } | null>(null);
  const [showAgencyBanDialog, setShowAgencyBanDialog] = React.useState(false);
  const [agencyBanType, setAgencyBanType] = React.useState<"temp" | "perm" | "unban">("temp");
  const [agencyBanDays, setAgencyBanDays] = React.useState(30);
  const [agencyBanReason, setAgencyBanReason] = React.useState("");
  const [agencyBanDetachFollowers, setAgencyBanDetachFollowers] = React.useState(true);
  const [editingSpecialRoles, setEditingSpecialRoles] = React.useState(false);
  const [specialCareer, setSpecialCareer] = React.useState(false);
  const [specialAffiliate, setSpecialAffiliate] = React.useState(false);
  const [specialAffiliateRole, setSpecialAffiliateRole] = React.useState("");
  const { alertDialog } = useAdminDialog();

  const fetchDetails = React.useCallback((userId: string) => {
    setLoadingDetails(true);
    fetch(`/api/admin/users?type=user_details&userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUserDetails(data.user);
          setSpecialCareer(Boolean(data.user.is_career));
          setSpecialAffiliate(Boolean(data.user.is_affiliate));
          setSpecialAffiliateRole(data.user.affiliate_role || "");
          setProfileFormData({
            firstName: data.user.firstName || "",
            lastName: data.user.lastName || "",
            business_name: data.user.business_name || "",
            phone: data.user.phone || "",
            state: data.user.state || "",
            country: data.user.country || "",
            location: data.user.location || "",
            bio: data.user.bio || "",
            industry: data.user.industry || "",
            interest: data.user.interest || "",
            lifestyle: data.user.lifestyle || "",
            behavior: data.user.behavior || "",
            personality: data.user.personality || "",
            gender: data.user.gender || "",
            employment: data.user.employment || "",
            atw_tier: data.user.atw_tier || "",
          });
        }
        if (data.statement) setUserStatement(data.statement);
        if (data.network) setUserNetwork(data.network);
        if (data.referrals) setUserReferrals(data.referrals);
        if (data.campaigns) setUserCampaigns(data.campaigns);
      })
      .catch((err) => console.error("Error fetching user details in admin modal:", err))
      .finally(() => setLoadingDetails(false));
  }, []);

  React.useEffect(() => {
    if (!selectedUser) {
      setUserDetails(null);
      setUserStatement([]);
      setUserNetwork(null);
      setUserReferrals([]);
      setIsEditingProfile(false);
      setActiveTab("profile");
      return;
    }

    setProfileFormData({
      firstName: selectedUser.firstName || "",
      lastName: selectedUser.lastName || "",
      business_name: selectedUser.business_name || "",
      phone: selectedUser.phone || "",
      state: selectedUser.state || "",
      country: selectedUser.country || "",
      location: selectedUser.location || "",
      bio: selectedUser.bio || "",
      industry: selectedUser.industry || "",
      interest: selectedUser.interest || "",
      lifestyle: selectedUser.lifestyle || "",
      behavior: selectedUser.behavior || "",
      personality: selectedUser.personality || "",
      gender: selectedUser.gender || "",
      employment: selectedUser.employment || "",
      atw_tier: selectedUser.atw_tier || "",
    });

    setSpecialCareer(Boolean(selectedUser.is_career));
    setSpecialAffiliate(Boolean(selectedUser.is_affiliate));
    setSpecialAffiliateRole(selectedUser.affiliate_role || "");
    setEditingSpecialRoles(false);

    if (selectedUser.initialTab) {
      setActiveTab(selectedUser.initialTab);
    }
    fetchDetails(selectedUser.id);
  }, [selectedUser?.id, selectedUser?.initialTab, fetchDetails]);

  if (!selectedUser) return null;

  const activeUser = userDetails || selectedUser;
  const handleDownloadUserData = () => {
    const payload = {
      exportVersion: "1.0",
      exportDate: new Date().toISOString(),
      platform: "XEA",
      userProfile: {
        id: activeUser.id,
        username: activeUser.username,
        email: activeUser.email,
        phone: activeUser.phone,
        firstName: activeUser.firstName,
        lastName: activeUser.lastName,
        business_name: activeUser.business_name,
        gender: activeUser.gender,
        employment: activeUser.employment,
        country: activeUser.country,
        state: activeUser.state,
        location: activeUser.location,
        bio: activeUser.bio,
        traits: {
          industry: activeUser.industry,
          interest: activeUser.interest,
          lifestyle: activeUser.lifestyle,
          behavior: activeUser.behavior,
          personality: activeUser.personality,
        },
        monetization: {
          monetized: activeUser.monetized,
          monetized_at: activeUser.monetized_at,
          monetization_clicks: activeUser.monetization_clicks,
          atw_tier: activeUser.atw_tier,
          attention_worth_score: activeUser.attention_worth_score,
        },
        financials: {
          balance: activeUser.balance,
          withdrawal: activeUser.withdrawal,
        },
        accountStatus: {
          ad_account_status: activeUser.ad_account_status,
          suspended_until: activeUser.suspended_until,
          created_at: activeUser.created_at,
        },
        agency: {
          is_agent: activeUser.is_agent,
          referral_code: activeUser.referral_code,
          referred_by: activeUser.referred_by,
        },
      },
      financialStatement: userStatement,
      agencyNetwork: userNetwork,
      referrals: userReferrals,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xea-user-data-${activeUser.username?.replace(/^@/, "") || activeUser.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getBanRemainingText = (untilStr: string | null) => {
    if (!untilStr) return null;
    const diffMs = new Date(untilStr).getTime() - Date.now();
    if (diffMs <= 0) return "Expired (Ready to restore)";
    const totalMinutes = Math.floor(diffMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (days > 365) return "Permanent Ban Active";
    if (days > 0) return `${days} day${days > 1 ? "s" : ""}, ${remHours} hr${remHours !== 1 ? "s" : ""} remaining`;
    return `${hours} hr${hours !== 1 ? "s" : ""}, ${minutes} min remaining`;
  };

  const handleCustomSuspend = () => {
    if (!customSuspensionDateTime) {
      alertDialog("Please select an exact date and time for when the ban expires.", "Validation Error");
      return;
    }
    const targetMs = new Date(customSuspensionDateTime).getTime();
    const diffHours = (targetMs - Date.now()) / (1000 * 60 * 60);
    if (diffHours <= 0) {
      alertDialog("Selected expiration date must be in the future.", "Validation Error");
      return;
    }
    handleSuspendUser(activeUser, Math.round(diffHours));
  };

  const isMonetized = activeUser.monetized === "yes" || activeUser.monetized === true;
  const isSuspended = activeUser.suspended_until && new Date(activeUser.suspended_until).getTime() > Date.now();
  const isDeactivated = activeUser.ad_account_status === "deactivated";
  const isAgentBanned = Boolean(
    activeUser.is_agent_banned ||
    (activeUser.agent_banned_until && new Date(activeUser.agent_banned_until).getTime() > Date.now())
  );
  const isAgent = Boolean(activeUser.is_agent) && !isAgentBanned;

  const handleSaveProfile = async () => {
    if (!handleUpdateUserProfile) return;
    setSavingProfile(true);
    const success = await handleUpdateUserProfile(activeUser, profileFormData);
    setSavingProfile(false);
    if (success) {
      setIsEditingProfile(false);
      setUserDetails((prev: any) => ({ ...prev, ...profileFormData }));
    }
  };

  return (
    <>
      <div role="presentation" className={styles.modalOverlay} onClick={() => setSelectedUser(null)}>
        <div
          className={`${styles.modalContent} ${styles.userSuiteModal}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* MODAL HEADER */}
          <div className={styles.modalHeader}>
            <div className={styles.adminCls_160}>
              <div className={styles.adminCls_161} style={{ overflow: "hidden" }}>
                {activeUser.profileImage ? (
                  <img
                    src={activeUser.profileImage}
                    alt={activeUser.username || "User avatar"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  activeUser.firstName ? activeUser.firstName.slice(0, 2).toUpperCase() : "US"
                )}
              </div>
              <div>
                <h3 className={`${styles.modalTitle} ${styles.mZero}`}>
                  {activeUser.business_name || `${activeUser.firstName || ""} ${activeUser.lastName || ""}`.trim() || activeUser.username}
                </h3>
                <div className={styles.adminCls_162} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span>@{activeUser.username?.replace(/^@/, "")} &bull; {activeUser.email}</span>
                  <RoleStarBadges
                    email={activeUser.email}
                    isCareer={activeUser.is_career}
                    isAffiliate={activeUser.is_affiliate}
                    affiliateRole={activeUser.affiliate_role}
                    variant="profile"
                  />
                </div>
                <div className={styles.suiteBadgesRow} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  {isMonetized ? (
                    <span className={styles.suiteBadgeMonetized}>Monetized</span>
                  ) : (
                    <span className={styles.suiteBadgeNeutral}>Not Monetized</span>
                  )}
                  {isAgentBanned ? (
                    <span
                      className={styles.suiteBadgeDanger}
                      style={{ cursor: "pointer" }}
                      onClick={() => setActiveTab("network")}
                      title={`Agency Privileges Banned: ${activeUser.agent_ban_reason || ""}`}
                    >
                      Agent Banned
                    </span>
                  ) : isAgent ? (
                    <span className={styles.suiteBadgeAgent}>Agent</span>
                  ) : (
                    <span className={styles.suiteBadgeNeutral}>Standard User</span>
                  )}
                  {isDeactivated ? (
                    <span className={styles.suiteBadgeDanger}>Deactivated</span>
                  ) : isSuspended ? (
                    <span className={styles.suiteBadgeDanger}>Suspended</span>
                  ) : (
                    <span className={styles.suiteBadgeMonetized}>Active</span>
                  )}

                  {/* QUICK AGENT TOGGLE BUTTON */}
                  <div style={{ marginLeft: "auto", display: "inline-flex", gap: "4px" }}>
                    {isAgentBanned ? (
                      <button
                        type="button"
                        disabled={userActionSubmitting}
                        onClick={() => handleBanAgent && handleBanAgent(activeUser, { banType: "unban", reason: "Administrative reinstatement" })}
                        className={`${styles.btnAction} ${styles.btnSuccess}`}
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                        title="Lift agency ban"
                      >
                        {activeActionId === `ban-agent-${activeUser.id}` && <span className={styles.btnSpinner} />}
                        {activeActionId === `ban-agent-${activeUser.id}` ? "Lifting..." : "Lift Ban"}
                      </button>
                    ) : isAgent ? (
                      <button
                        type="button"
                        disabled={userActionSubmitting}
                        onClick={() => handleToggleAgent && handleToggleAgent(activeUser, false)}
                        className={`${styles.btnAction} ${styles.btnWarning}`}
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                        title="Revoke agent status (revert to standard user)"
                      >
                        {activeActionId === `toggle-agent-${activeUser.id}` && <span className={styles.btnSpinner} />}
                        {activeActionId === `toggle-agent-${activeUser.id}` ? "Revoking..." : "Revoke Agent"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={userActionSubmitting}
                        onClick={() => handleToggleAgent && handleToggleAgent(activeUser, true)}
                        className={`${styles.btnAction} ${styles.btnSuccess}`}
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                        title="Make this user an official platform Agent"
                      >
                        {activeActionId === `toggle-agent-${activeUser.id}` && <span className={styles.btnSpinner} />}
                        {activeActionId === `toggle-agent-${activeUser.id}` ? "Activating..." : "+ Make Agent"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedUser(null)} className={styles.btnClose}>
              <XCircle size={22} />
            </button>
          </div>

          {/* TAB NAVIGATION BAR */}
          <div className={styles.userSuiteTabs}>
            <button
              onClick={() => setActiveTab("profile")}
              className={`${styles.userSuiteTab} ${activeTab === "profile" ? styles.userSuiteTabActive : ""}`}
            >
              <User size={16} />
              Profile & Details
            </button>
            <button
              onClick={() => setActiveTab("statement")}
              className={`${styles.userSuiteTab} ${activeTab === "statement" ? styles.userSuiteTabActive : ""}`}
            >
              <Wallet size={16} />
              Wallet & Statement ({userStatement.length})
            </button>
            <button
              onClick={() => setActiveTab("network")}
              className={`${styles.userSuiteTab} ${activeTab === "network" ? styles.userSuiteTabActive : ""}`}
            >
              <Users size={16} />
              Agent & Followers ({userNetwork?.invitesCount ?? userReferrals.length})
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`${styles.userSuiteTab} ${activeTab === "security" ? styles.userSuiteTabActive : ""}`}
            >
              <Shield size={16} />
              Security & Ban Controls
            </button>
          </div>

          {/* TAB CONTENTS */}
          <div className={styles.userSuiteContent}>
            {/* TAB 1: PROFILE & EDIT */}
            {activeTab === "profile" && (
              <AdminUserSuiteProfileTab
                activeUser={activeUser}
                isEditingProfile={isEditingProfile}
                setIsEditingProfile={setIsEditingProfile}
                profileFormData={profileFormData}
                setProfileFormData={setProfileFormData}
                savingProfile={savingProfile}
                userActionSubmitting={userActionSubmitting}
                handleDownloadUserData={handleDownloadUserData}
                handleSaveProfile={handleSaveProfile}
                specialCareer={specialCareer}
                setSpecialCareer={setSpecialCareer}
                specialAffiliate={specialAffiliate}
                setSpecialAffiliate={setSpecialAffiliate}
                specialAffiliateRole={specialAffiliateRole}
                setSpecialAffiliateRole={setSpecialAffiliateRole}
                editingSpecialRoles={editingSpecialRoles}
                setEditingSpecialRoles={setEditingSpecialRoles}
                handleUpdateSpecialRoles={handleUpdateSpecialRoles}
                expandedCampaignType={expandedCampaignType}
                setExpandedCampaignType={setExpandedCampaignType}
                userCampaigns={userCampaigns}
                setInspectingCampaignItem={setInspectingCampaignItem}
              />
            )}

            {/* TAB 2: WALLET & STATEMENT */}
            {activeTab === "statement" && (
              <AdminUserSuiteStatementTab
                activeUser={activeUser}
                userStatement={userStatement}
                loadingDetails={loadingDetails}
                userActionSubmitting={userActionSubmitting}
                activeActionId={activeActionId}
                fetchDetails={fetchDetails}
                handleAdjustBalance={handleAdjustBalance}
              />
            )}

            {/* TAB 3: AGENT & FOLLOWERS */}
            {activeTab === "network" && (
              <AdminUserSuiteDownlineCard
                activeUser={activeUser}
                userNetwork={userNetwork}
                userReferrals={userReferrals}
                isAgent={isAgent}
                isAgentBanned={isAgentBanned}
                userActionSubmitting={userActionSubmitting}
                handleBanAgent={handleBanAgent}
                handleToggleAgent={handleToggleAgent}
                handleRemoveFollower={handleRemoveFollower}
                handleRemoveAllFollowers={handleRemoveAllFollowers}
                handleDetachUplineAgent={handleDetachUplineAgent}
                setAgencyBanType={setAgencyBanType}
                setAgencyBanDays={setAgencyBanDays}
                setAgencyBanReason={setAgencyBanReason}
                setAgencyBanDetachFollowers={setAgencyBanDetachFollowers}
                setShowAgencyBanDialog={setShowAgencyBanDialog}
              />
            )}

            {/* TAB 4: SECURITY & ACCESS CONTROLS */}
            {activeTab === "security" && (
              <AdminUserSuiteSecurityTab
                activeUser={activeUser}
                isMonetized={isMonetized}
                isSuspended={isSuspended}
                isDeactivated={isDeactivated}
                isAgent={isAgent}
                isAgentBanned={isAgentBanned}
                userActionSubmitting={userActionSubmitting}
                activeActionId={activeActionId}
                customSuspensionDateTime={customSuspensionDateTime}
                setCustomSuspensionDateTime={setCustomSuspensionDateTime}
                getBanRemainingText={getBanRemainingText}
                handleToggleMonetization={handleToggleMonetization}
                handleResetClicks={handleResetClicks}
                handleSuspendUser={handleSuspendUser}
                handleCustomSuspend={handleCustomSuspend}
                setBanModalUser={setBanModalUser}
                setBanModalStatus={setBanModalStatus}
                setBanModalReason={setBanModalReason}
                handleDeactivateAccount={handleDeactivateAccount}
                handleBanAgent={handleBanAgent}
                handleToggleAgent={handleToggleAgent}
                handleRemoveAllFollowers={handleRemoveAllFollowers}
                userNetwork={userNetwork}
                userReferrals={userReferrals}
                setAgencyBanType={setAgencyBanType}
                setAgencyBanDays={setAgencyBanDays}
                setAgencyBanReason={setAgencyBanReason}
                setAgencyBanDetachFollowers={setAgencyBanDetachFollowers}
                setShowAgencyBanDialog={setShowAgencyBanDialog}
              />
            )}
          </div>

          {/* MODAL FOOTER */}
          <div className={styles.modalFooter}>
            <button
              disabled={userActionSubmitting}
              onClick={() => handleDeleteUser(activeUser)}
              className={`${styles.btnAction} ${styles.btnDanger} ${styles.adminCls_166}`}
            >
              {activeActionId === `delete-user-${activeUser.id}` && <span className={styles.btnSpinner} />}
              {activeActionId === `delete-user-${activeUser.id}`
                ? "Deleting Permanently..."
                : userActionSubmitting ? "Processing..." : "Delete Account Permanently"}
            </button>
            <button onClick={() => setSelectedUser(null)} className={styles.btnAction}>
              Close Panel
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: CAMPAIGN / HIGHLIGHT INSPECTOR */}
      {inspectingCampaignItem && (
        <div
          role="presentation"
          className={styles.modalOverlay}
          style={{ zIndex: 1100 }}
          onClick={() => setInspectingCampaignItem(null)}
        >
          <div
            className={`${styles.modalContent} ${styles.adminCls_159}`}
            style={{ maxWidth: 660, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_172}>
                {inspectingCampaignItem.type === "ad" ? (
                  <Megaphone size={20} color="var(--primary)" />
                ) : (
                  <Sparkles size={20} color="#f59e0b" />
                )}
                <h3 className={styles.modalTitle}>
                  {inspectingCampaignItem.type === "ad" ? "Ad Campaign Details" : "Business Highlight Details"}
                </h3>
              </div>
              <button
                type="button"
                className={styles.btnClose}
                onClick={() => setInspectingCampaignItem(null)}
                title="Close"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className={styles.modalBody} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Creative / Media */}
              {inspectingCampaignItem.type === "ad" ? (
                <AdminAdMediaBox
                  adMedia={inspectingCampaignItem.item.ad_media || inspectingCampaignItem.item.ad_media_url || ""}
                  adMediaType={inspectingCampaignItem.item.ad_media_type}
                />
              ) : (
                <div style={{ borderRadius: 10, overflow: "hidden", maxHeight: 260, background: "var(--card-border, #000)", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <img
                    src={inspectingCampaignItem.item.image_url || inspectingCampaignItem.item.media || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60"}
                    alt={inspectingCampaignItem.item.title || "Highlight cover"}
                    style={{ maxHeight: 260, width: "100%", objectFit: "cover" }}
                    onError={(e: any) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60";
                    }}
                  />
                </div>
              )}

              {/* Title */}
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
                  {inspectingCampaignItem.type === "ad" ? "Campaign / Product Title" : "Highlight Title"}
                </span>
                <h4 style={{ margin: "4px 0 0", fontSize: "1.15rem", fontWeight: 700, color: "var(--foreground)" }}>
                  {inspectingCampaignItem.type === "ad"
                    ? (inspectingCampaignItem.item.product_name || inspectingCampaignItem.item.title || "Ad Campaign")
                    : (inspectingCampaignItem.item.title || "Business Highlight")}
                </h4>
              </div>

              {/* Details Grid */}
              <div className={styles.adminCls_173}>
                <div><strong>ID:</strong> <code className={styles.breakAll}>{inspectingCampaignItem.item.id}</code></div>
                <div><strong>Status:</strong> <span style={{ fontWeight: 700, color: inspectingCampaignItem.item.is_paused ? "#ef4444" : "#10b981" }}>{inspectingCampaignItem.item.is_paused ? "Paused" : "Live / Active"}</span></div>
                <div><strong>Creator / Email:</strong> <code className={styles.breakAll}>{inspectingCampaignItem.item.user_email}</code></div>
                {inspectingCampaignItem.type === "ad" ? (
                  <>
                    <div><strong>Ad Type:</strong> <span className={styles.adminCls_174}>{inspectingCampaignItem.item.ad_type || "Standard"}</span></div>
                    <div><strong>Views Delivered:</strong> <span>{inspectingCampaignItem.item.impression_count || 0} / {inspectingCampaignItem.item.impressions || "∞"}</span></div>
                    <div><strong>Mutual Attention:</strong> <span>{inspectingCampaignItem.item.mutual_adds_count || 0}</span></div>
                    <div><strong>Bid / Cost:</strong> <span>₦{inspectingCampaignItem.item.cost_per_impression || 25} / view</span></div>
                    <div><strong>Duration:</strong> <span>{inspectingCampaignItem.item.campaign_days || 5} Days</span></div>
                    <div><strong>Frequency Cap:</strong> <span>{inspectingCampaignItem.item.user_frequency_cap || 1} view(s)/user</span></div>
                  </>
                ) : (
                  <>
                    <div><strong>Category / Interest:</strong> <span className={styles.adminCls_174}>{inspectingCampaignItem.item.interest || "General"}</span></div>
                    <div><strong>Publisher Handle:</strong> <span>{inspectingCampaignItem.item.publisher_handle || (inspectingCampaignItem.item.user_email ? `@${inspectingCampaignItem.item.user_email.split("@")[0]}` : "@user")}</span></div>
                    {inspectingCampaignItem.item.publisher_name && (
                      <div><strong>Publisher Name:</strong> <span>{inspectingCampaignItem.item.publisher_name}</span></div>
                    )}
                    <div><strong>Target Region:</strong> <span>{inspectingCampaignItem.item.country || "Global"}{inspectingCampaignItem.item.state ? ` (${inspectingCampaignItem.item.state})` : ""}</span></div>
                    <div><strong>Daily Rate:</strong> <span>₦{inspectingCampaignItem.item.bid_price || 1500}/day</span></div>
                  </>
                )}
                <div><strong>Created:</strong> <span>{inspectingCampaignItem.item.created_at ? new Date(inspectingCampaignItem.item.created_at).toLocaleString() : "N/A"}</span></div>
              </div>

              {/* Text Content */}
              {(inspectingCampaignItem.item.content || inspectingCampaignItem.item.ad_content) && (
                <div className={styles.adminCls_175}>
                  <strong className={styles.adminCls_85}>
                    {inspectingCampaignItem.type === "ad" ? "Ad Copy / Content:" : "Highlight Story / Content:"}
                  </strong>
                  <p className={styles.adminCls_176} style={{ whiteSpace: "pre-line" }}>
                    {inspectingCampaignItem.item.content || inspectingCampaignItem.item.ad_content}
                  </p>
                </div>
              )}

              {/* Website / Destination Link */}
              {(inspectingCampaignItem.item.destination_url || inspectingCampaignItem.item.link_url || inspectingCampaignItem.item.target_url || inspectingCampaignItem.item.link || inspectingCampaignItem.item.website) && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <Globe size={16} color="var(--primary)" />
                    <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Target URL:</span>
                    <a
                      href={inspectingCampaignItem.item.destination_url || inspectingCampaignItem.item.link_url || inspectingCampaignItem.item.target_url || inspectingCampaignItem.item.link || inspectingCampaignItem.item.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: 600, textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {inspectingCampaignItem.item.destination_url || inspectingCampaignItem.item.link_url || inspectingCampaignItem.item.target_url || inspectingCampaignItem.item.link || inspectingCampaignItem.item.website}
                    </a>
                  </div>
                  <a
                    href={inspectingCampaignItem.item.destination_url || inspectingCampaignItem.item.link_url || inspectingCampaignItem.item.target_url || inspectingCampaignItem.item.link || inspectingCampaignItem.item.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnAction}
                    style={{ padding: "4px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                  >
                    <span>Visit Link</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {/* Admin Statement */}
              {inspectingCampaignItem.item.admin_statement && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", fontSize: "0.82rem" }}>
                  <strong style={{ color: "#f59e0b" }}>Admin Statement / Note:</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--foreground)" }}>{inspectingCampaignItem.item.admin_statement}</p>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setInspectingCampaignItem(null)}
                className={`${styles.btnAction} ${styles.adminCls_177}`}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AGENCY BAN & SANCTIONS DIALOG */}
      {showAgencyBanDialog && (
        <div
          role="presentation"
          className={styles.modalOverlay}
          style={{ zIndex: 1200 }}
          onClick={() => setShowAgencyBanDialog(false)}
        >
          <div
            className={`${styles.modalContent} ${styles.adminCls_159}`}
            style={{ maxWidth: 560, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.adminCls_172}>
                <ShieldAlert size={22} color="#ef4444" />
                <h3 className={styles.modalTitle}>
                  {agencyBanType === "perm" ? "Permanent Agency Ban" : "Temporary Agency Ban"}
                </h3>
              </div>
              <button
                type="button"
                className={styles.btnClose}
                onClick={() => setShowAgencyBanDialog(false)}
                title="Close"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className={styles.modalBody} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ background: "rgba(239, 68, 68, 0.08)", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--foreground)" }}>
                  Target User: <strong>@{activeUser.username}</strong> ({activeUser.email})
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                  This sanction restricts the user from earning agency commissions, revokes agency status, and prevents registration as an agent.
                </div>
              </div>

              {/* Ban Scope Selector */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ban Duration / Type</label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => { setAgencyBanType("temp"); setAgencyBanDays(7); }}
                    className={`${styles.btnAction} ${agencyBanType === "temp" && agencyBanDays === 7 ? styles.btnDanger : ""}`}
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAgencyBanType("temp"); setAgencyBanDays(30); }}
                    className={`${styles.btnAction} ${agencyBanType === "temp" && agencyBanDays === 30 ? styles.btnDanger : ""}`}
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAgencyBanType("temp"); setAgencyBanDays(90); }}
                    className={`${styles.btnAction} ${agencyBanType === "temp" && agencyBanDays === 90 ? styles.btnDanger : ""}`}
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    90 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAgencyBanType("perm"); }}
                    className={`${styles.btnAction} ${agencyBanType === "perm" ? styles.btnDanger : ""}`}
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    Permanent Ban
                  </button>
                </div>
              </div>

              {agencyBanType === "temp" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Days of Agency Ban</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={agencyBanDays}
                    onChange={(e) => setAgencyBanDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={styles.inputField}
                  />
                </div>
              )}

              {/* Reason for Complaint / Violation */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Reason / Complaint Note (Required)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g., User dispute, spamming referral link in prohibited forums, fraudulent referral chain..."
                  value={agencyBanReason}
                  onChange={(e) => setAgencyBanReason(e.target.value)}
                  className={styles.textareaField}
                />
                <span className={styles.formHelperText}>
                  This reason will be logged in the admin audit history and visible in the user's security profile.
                </span>
              </div>

              {/* Detach Followers Checkbox */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", cursor: "pointer", background: "var(--card-bg)", padding: "10px", borderRadius: 8, border: "1px solid var(--card-border)" }}>
                <input
                  type="checkbox"
                  checked={agencyBanDetachFollowers}
                  onChange={(e) => setAgencyBanDetachFollowers(e.target.checked)}
                  style={{ marginTop: 3, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                    Purge & Detach Existing Followers ({userNetwork?.invites?.length || userReferrals.length})
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Releases downline users from this agent so they are no longer subject to commission deductions.
                  </div>
                </div>
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setShowAgencyBanDialog(false)}
                className={styles.btnAction}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={userActionSubmitting || !agencyBanReason.trim()}
                onClick={async () => {
                  if (!agencyBanReason.trim()) {
                    await alertDialog("Please enter a reason or complaint note for this ban.", "Reason Required");
                    return;
                  }
                  setShowAgencyBanDialog(false);
                  handleBanAgent &&
                    handleBanAgent(activeUser, {
                      banType: agencyBanType,
                      days: agencyBanDays,
                      reason: agencyBanReason.trim(),
                      detachFollowers: agencyBanDetachFollowers,
                    });
                }}
                className={`${styles.btnAction} ${styles.btnDanger}`}
              >
                {userActionSubmitting ? "Applying Ban..." : "Apply Agency Ban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminUserOperationsSuiteModal;
