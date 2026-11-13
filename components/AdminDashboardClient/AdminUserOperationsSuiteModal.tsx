"use client";

import React from "react";
import {
  XCircle,
  User,
  Wallet,
  Shield,
  Users,
} from "lucide-react";
import styles from "./page.module.css";
import { useAdminDialog } from "@/components/ui/AdminDialog";
import RoleStarBadges from "@/components/ui/RoleStarBadges";
import { AdminUserSuiteDownlineCard } from "./AdminUserSuiteDownlineCard";
import { AdminUserSuiteProfileTab } from "./AdminUserSuiteProfileTab";
import { AdminUserSuiteStatementTab } from "./AdminUserSuiteStatementTab";
import { AdminUserSuiteSecurityTab } from "./AdminUserSuiteSecurityTab";
import { AdminUserSuiteCampaignInspectorModal } from "./AdminUserSuiteCampaignInspectorModal";
import { AdminUserSuiteAgencyBanModal } from "./AdminUserSuiteAgencyBanModal";

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

      <AdminUserSuiteCampaignInspectorModal
        inspectingCampaignItem={inspectingCampaignItem}
        onClose={() => setInspectingCampaignItem(null)}
      />

      <AdminUserSuiteAgencyBanModal
        open={showAgencyBanDialog}
        onClose={() => setShowAgencyBanDialog(false)}
        activeUser={activeUser}
        agencyBanType={agencyBanType}
        setAgencyBanType={setAgencyBanType}
        agencyBanDays={agencyBanDays}
        setAgencyBanDays={setAgencyBanDays}
        agencyBanReason={agencyBanReason}
        setAgencyBanReason={setAgencyBanReason}
        agencyBanDetachFollowers={agencyBanDetachFollowers}
        setAgencyBanDetachFollowers={setAgencyBanDetachFollowers}
        followersCount={userNetwork?.invites?.length || userReferrals.length}
        userActionSubmitting={userActionSubmitting}
        onAlertMissingReason={async () => {
          await alertDialog("Please enter a reason or complaint note for this ban.", "Reason Required");
        }}
        onConfirmBan={() => {
          setShowAgencyBanDialog(false);
          handleBanAgent &&
            handleBanAgent(activeUser, {
              banType: agencyBanType,
              days: agencyBanDays,
              reason: agencyBanReason.trim(),
              detachFollowers: agencyBanDetachFollowers,
            });
        }}
      />
    </>
  );
}

export default AdminUserOperationsSuiteModal;
