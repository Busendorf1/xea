"use client";

import React from "react";
import supabase from "@/lib/utils/db";
import { v4 as uuidv4 } from "uuid";
import { adminDirectAdSchema } from "@/lib/validationSchemas";
import { resizeImageToMax1080p } from "@/lib/utils/mediaOptimizer";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";
import type { AdminTab } from "./AdminLayoutAndCampaignTabs";
import { useAdminDialog } from "@/components/ui/AdminDialog";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export function useAdminCampaignAndUserActions(params: {
  userActionSubmitting: boolean;
  setUserActionSubmitting: (v: boolean) => void;
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  campaignActionLoading: string | null;
  setCampaignActionLoading: (v: string | null) => void;
  editAdData: any;
  setEditAdData: (d: any) => void;
  editHighlightData: any;
  setEditHighlightData: (d: any) => void;
  setPendingAds: React.Dispatch<React.SetStateAction<any[]>>;
  setActiveAds: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingAdsCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveAdsCount: React.Dispatch<React.SetStateAction<number>>;
  setPendingHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  setActiveHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  setPendingHighlightsCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveHighlightsCount: React.Dispatch<React.SetStateAction<number>>;
  adForm: any;
  setAdForm: React.Dispatch<React.SetStateAction<any>>;
  adFormFiles: File[];
  setAdFormFiles: React.Dispatch<React.SetStateAction<File[]>>;
  highlightForm: any;
  setHighlightForm: React.Dispatch<React.SetStateAction<any>>;
  highlightFormFile: File | null;
  setHighlightFormFile: React.Dispatch<React.SetStateAction<File | null>>;
  setUploading: (u: boolean) => void;
  handleRefresh: () => void;
  fetchOverviewStats: (fresh?: boolean) => void;
  handleTabChange: (tab: AdminTab) => void;
}) {
  const {
    userActionSubmitting,
    setUserActionSubmitting,
    selectedUser,
    setSelectedUser,
    campaignActionLoading,
    setCampaignActionLoading,
    editAdData,
    setEditAdData,
    editHighlightData,
    setEditHighlightData,
    setPendingAds,
    setActiveAds,
    setPendingAdsCount,
    setActiveAdsCount,
    setPendingHighlights,
    setActiveHighlights,
    setPendingHighlightsCount,
    setActiveHighlightsCount,
    adForm,
    setAdForm,
    adFormFiles,
    setAdFormFiles,
    highlightForm,
    setHighlightForm,
    highlightFormFile,
    setHighlightFormFile,
    setUploading,
    handleRefresh,
    fetchOverviewStats,
    handleTabChange,
  } = params;

  const { alertDialog, confirmDialog } = useAdminDialog();
  const [activeActionId, setActiveActionId] = React.useState<string | null>(null);

  const handleToggleMonetization = async (user: any) => {
    if (userActionSubmitting) return;
    const isCurrentlyMonetized = user.monetized === "yes" || user.monetized === true;
    const confirmed = await confirmDialog(
      `Are you sure you want to ${isCurrentlyMonetized ? "DEACTIVATE" : "ACTIVATE"} monetization earnings for @${user.username || user.email}?`,
      isCurrentlyMonetized ? "Deactivate Monetization" : "Activate Monetization",
      isCurrentlyMonetized
    );
    if (!confirmed) return;

    const actionId = `toggle-monetize-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    const nextMonetizedVal = isCurrentlyMonetized ? "no" : "yes";
    const nextMonetizedType = null;
    const nextMonetizedUntil = null;

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_monetization",
          userId: user.id,
          payload: {
            nextMonetizedVal,
            nextMonetizedType,
            nextMonetizedUntil,
            isCurrentlyMonetized,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to update monetization: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(
          `Successfully ${isCurrentlyMonetized ? "deactivated" : "activated"} monetization for @${user.username}`,
          "Monetization Updated"
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({
            ...selectedUser,
            monetized: nextMonetizedVal,
            monetization_type: nextMonetizedType,
            monetized_until: nextMonetizedUntil,
            monetized_at: isCurrentlyMonetized ? null : new Date().toISOString(),
          });
        }
      }
    } catch (e: any) {
      await alertDialog(`Error updating monetization: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleSuspendUser = async (user: any, hours: number) => {
    if (userActionSubmitting) return;
    const desc = hours === -1 ? "permanently suspend" : hours === 0 ? "lift the suspension for" : `temporarily suspend @${user.username} for ${hours} hours`;
    const confirmed = await confirmDialog(
      `Are you sure you want to ${desc}?`,
      hours === 0 ? "Lift Suspension" : "Account Suspension",
      hours !== 0
    );
    if (!confirmed) return;

    const actionId = `suspend-${user.id}-${hours}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    let suspendedUntil: string | null = null;
    if (hours > 0) {
      suspendedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    } else if (hours === -1) {
      suspendedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suspend",
          userId: user.id,
          payload: { suspendedUntil },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to suspend account: ${err.error || "Server error"}`, "Error");
      } else {
        const descApplied = hours === -1 ? "permanently suspended" : hours === 0 ? "unsuspended" : `suspended for ${hours} hours`;
        await alertDialog(`Successfully ${descApplied} user @${user.username}`, "Suspension Updated");
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({ ...selectedUser, suspended_until: suspendedUntil });
        }
      }
    } catch (e: any) {
      await alertDialog(`Error setting suspension: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleAdjustBalance = async (user: any, amount: number) => {
    if (isNaN(amount) || amount === 0 || userActionSubmitting) return;
    const reason = prompt(
      `Reason for adjusting balance for @${user.username} by ${formatCurrency(amount)}:`,
      "Administrative balance adjustment"
    );
    if (reason === null) return;

    const newBalance = Math.max(0, parseFloat(user.balance || 0) + amount);
    const confirmed = await confirmDialog(
      `Are you sure you want to adjust the wallet balance for @${user.username} by ${formatCurrency(amount)}?\n\nNew Balance: ${formatCurrency(newBalance)}\nReason: "${reason.trim()}"`,
      "Confirm Wallet Adjustment",
      amount < 0
    );
    if (!confirmed) return;

    const actionId = `adjust-balance-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_balance",
          userId: user.id,
          payload: { newBalance, reason: reason.trim() },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to update balance: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(
          `Wallet balance adjusted by ${formatCurrency(amount)}. New Balance: ${formatCurrency(newBalance)}`,
          "Wallet Adjusted"
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser({ ...selectedUser, balance: newBalance });
        }
      }
    } catch (e: any) {
      await alertDialog(`Error adjusting wallet: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (userActionSubmitting) return;
    const userHandle = user.username
      ? `@${user.username}`
      : user.email
      ? `@${user.email.split("@")[0]}`
      : "this user";

    const confirmed = await confirmDialog(
      `WARNING: Are you sure you want to delete ${userHandle} (${user.email}) permanently?\n\nThis action cannot be undone and will permanently wipe this account, active campaigns, and ledger records from the database.`,
      "Delete Account Permanently",
      true
    );
    if (!confirmed) {
      return;
    }

    const actionId = `delete-user-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          userId: user.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to delete account: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(`Account for ${userHandle} deleted permanently.`, "Account Deleted");
        setSelectedUser(null);
        handleRefresh();
      }
    } catch (e: any) {
      await alertDialog(`Error deleting user: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };


  const handleUpdateUserProfile = async (user: any, updatedFields: Record<string, any>) => {
    if (userActionSubmitting) return false;
    const actionId = `update-profile-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          userId: user.id,
          payload: updatedFields,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to update profile: ${err.error || "Server error"}`, "Error");
        return false;
      } else {
        await alertDialog(`Profile for @${user.username} updated successfully.`, "Profile Saved");
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({ ...prev, ...updatedFields }));
        }
        return true;
      }
    } catch (e: any) {
      await alertDialog(`Error updating profile: ${e.message}`, "Error");
      return false;
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleToggleAgent = async (user: any, makeAgent: boolean) => {
    if (userActionSubmitting) return;
    const confirmed = await confirmDialog(
      makeAgent
        ? `Are you sure you want to grant official Agent status to @${user.username}?\n\nThis will generate an agent code, allow them to recruit followers, and earn commissions.`
        : `Are you sure you want to REVOKE official Agent status from @${user.username}?\n\nThey will no longer earn agent commissions or register new followers.`,
      makeAgent ? "Grant Agent Status" : "Revoke Agent Status",
      !makeAgent
    );
    if (!confirmed) return;

    const actionId = `toggle-agent-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_agent",
          userId: user.id,
          payload: { makeAgent },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to update agent status: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(
          `Successfully ${makeAgent ? "granted" : "revoked"} Agent status for @${user.username}`,
          "Agent Status Updated"
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({ ...prev, is_agent: makeAgent }));
        }
      }
    } catch (e: any) {
      await alertDialog(`Error updating agent status: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleUpdateSpecialRoles = async (
    user: any,
    roles: { isCareer: boolean; isAffiliate: boolean; affiliateRole?: string | null }
  ) => {
    if (userActionSubmitting) return;
    const actionId = `special-roles-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_special_roles",
          userId: user.id,
          payload: roles,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to update special roles: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(
          `Successfully updated Career and Affiliate badges for @${user.username || user.email}`,
          "Badges Updated"
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({
            ...prev,
            is_career: roles.isCareer,
            is_affiliate: roles.isAffiliate,
            affiliate_role: roles.isAffiliate ? roles.affiliateRole : null,
          }));
        }
      }
    } catch (e: any) {
      await alertDialog(`Error updating special roles: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleBanAgent = async (
    user: any,
    options: {
      banType: "temp" | "perm" | "unban";
      days?: number;
      customUntil?: string;
      reason: string;
      detachFollowers?: boolean;
    }
  ) => {
    if (userActionSubmitting) return;
    const isUnban = options.banType === "unban";
    const confirmPrompt = isUnban
      ? `Are you sure you want to lift the agency ban for @${user.username}? The user will be permitted to register as an agent again.`
      : `Are you sure you want to ${options.banType === "perm" ? "PERMANENTLY ban" : `temporarily ban (for ${options.days || 30} days)`} @${user.username} from being an Agent?\n\nReason: "${options.reason}"${options.detachFollowers ? "\n\n⚠️ Also detaching all active followers from this agent." : ""}`;

    const confirmed = await confirmDialog(confirmPrompt, isUnban ? "Lift Agency Ban" : "Confirm Agency Ban", !isUnban);
    if (!confirmed) return;

    const actionId = `ban-agent-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban_agent",
          userId: user.id,
          payload: options,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to update agency ban: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(
          isUnban
            ? `Agency privileges successfully restored for @${user.username}.`
            : `Agency privileges successfully banned for @${user.username}.`,
          "Agency Status Updated"
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({
            ...prev,
            is_agent: false,
            is_agent_banned: !isUnban,
            agent_banned_until: options.banType === "perm" ? "2099-12-31T23:59:59.000Z" : options.customUntil || null,
            agent_ban_reason: isUnban ? null : options.reason,
          }));
        }
      }
    } catch (e: any) {
      await alertDialog(`Error updating agency ban: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleRemoveFollower = async (user: any, refereeEmail: string, followerLabel?: string) => {
    if (userActionSubmitting) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to remove follower ${followerLabel || refereeEmail} from @${user.username}'s referral network?\n\nThis will sever the referral link immediately.`,
      "Remove Specific Follower",
      true
    );
    if (!confirmed) return;

    const actionId = `remove-follower-${refereeEmail}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_follower",
          userId: user.id,
          payload: { refereeEmail },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to remove follower: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(`Follower ${followerLabel || refereeEmail} detached from @${user.username}.`, "Follower Removed");
        handleRefresh();
      }
    } catch (e: any) {
      await alertDialog(`Error removing follower: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleRemoveAllFollowers = async (user: any) => {
    if (userActionSubmitting) return;
    const confirmed = await confirmDialog(
      `WARNING: Are you sure you want to remove ALL followers from @${user.username}'s referral network?\n\nThis will immediately disconnect all downline referees.`,
      "Remove All Followers",
      true
    );
    if (!confirmed) return;

    const actionId = `purge-followers-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_all_followers",
          userId: user.id,
          payload: { reason: "Admin bulk follower detachment" },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to remove followers: ${err.error || "Server error"}`, "Error");
      } else {
        const data = await response.json();
        await alertDialog(data.message || `All followers detached from @${user.username}.`, "Followers Purged");
        handleRefresh();
      }
    } catch (e: any) {
      await alertDialog(`Error removing all followers: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleDetachUplineAgent = async (user: any, uplineLabel?: string) => {
    if (userActionSubmitting) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to detach upline agent ${uplineLabel || ""} from @${user.username}?\n\nThis user will no longer be referred by that agent, and no further commissions will be deducted.`,
      "Detach Upline Agent",
      true
    );
    if (!confirmed) return;

    const actionId = `detach-upline-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "detach_upline_agent",
          userId: user.id,
          payload: { reason: "Admin detached upline agent on complaint or violation" },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to detach upline agent: ${err.error || "Server error"}`, "Error");
      } else {
        const data = await response.json();
        await alertDialog(data.message || `Upline agent detached from @${user.username}.`, "Upline Agent Detached");
        handleRefresh();
      }
    } catch (e: any) {
      await alertDialog(`Error detaching upline agent: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleDeactivateAccount = async (user: any, deactivated: boolean) => {
    if (userActionSubmitting) return;
    const confirmMsg = deactivated
      ? `Are you sure you want to DEACTIVATE the account for @${user.username}? The user will not be able to run ads or monetize.`
      : `Reactivate account for @${user.username}?`;
    const confirmed = await confirmDialog(confirmMsg, deactivated ? "Deactivate Account" : "Reactivate Account", deactivated);
    if (!confirmed) return;

    const actionId = `deactivate-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_account",
          userId: user.id,
          payload: { deactivated },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to change account state: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(`Account for @${user.username} is now ${deactivated ? "deactivated" : "active"}.`, "Account Status Updated");
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({
            ...prev,
            ad_account_status: deactivated ? "deactivated" : "active",
          }));
        }
      }
    } catch (e: any) {
      await alertDialog(`Error: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleResetClicks = async (user: any, clicks: number) => {
    if (userActionSubmitting) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to override monetization clicks for @${user.username} to ${clicks}?`,
      "Override Ad Clicks",
      false
    );
    if (!confirmed) return;

    const actionId = `reset-clicks-${user.id}`;
    setActiveActionId(actionId);
    setUserActionSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_clicks",
          userId: user.id,
          payload: { clicks },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to set clicks: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(`Monetization ad clicks for @${user.username} set to ${clicks}.`, "Clicks Overridden");
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({
            ...prev,
            monetization_clicks: clicks,
          }));
        }
      }
    } catch (e: any) {
      await alertDialog(`Error updating clicks: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleApproveAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to APPROVE this Ad campaign ("${ad.headline || ad.ad_content?.slice(0, 40) || ad.id}")? It will go live immediately.`,
      "Approve Ad Campaign",
      false
    );
    if (!confirmed) return;

    setCampaignActionLoading(`approve-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_ad", id: ad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setPendingAds((prev) =>
        prev.map((a) =>
          a.id === ad.id ? { ...a, admin_statement: `APPROVED:${new Date().toISOString()}` } : a
        )
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error approving ad: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleRejectAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const feedback = prompt(
      "Enter a reason or feedback for rejecting this Ad (the advertiser will see this to adjust their campaign):"
    );
    if (feedback === null) return;

    const confirmed = await confirmDialog(
      `Are you sure you want to REJECT this Ad campaign?\n\nReason to advertiser: "${feedback}"`,
      "Reject Ad Campaign",
      true
    );
    if (!confirmed) return;

    setCampaignActionLoading(`reject-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_ad",
          id: ad.id,
          payload: { statement: feedback, reason: feedback },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      setPendingAds((prev) =>
        prev.map((a) => (a.id === ad.id ? { ...a, admin_statement: `REJECTED:${feedback}` } : a))
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error rejecting campaign: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const targetState = !ad.is_paused;
    let statement: string | null = null;
    if (targetState) {
      statement = prompt("Enter a reason or statement for pausing this ad campaign (visible to the advertiser):");
      if (statement === null) return;
    }

    const confirmed = await confirmDialog(
      `Are you sure you want to ${targetState ? "PAUSE" : "RESUME"} this Ad campaign?`,
      targetState ? "Pause Campaign" : "Resume Campaign",
      targetState
    );
    if (!confirmed) return;

    setCampaignActionLoading(`pause-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetState ? "pause_ad" : "resume_ad",
          id: ad.id,
          payload: { statement },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      await alertDialog(`Ad campaign successfully ${targetState ? "paused" : "resumed"}!`, "Campaign Updated");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error pausing/resuming campaign: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeactivateAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const reason = prompt(
      "Enter a reason or statement for deactivating this ad campaign (visible to the advertiser):"
    );
    if (reason === null) return;

    const confirmed = await confirmDialog(
      `Are you sure you want to DEACTIVATE this Ad campaign? It will be stopped permanently.\n\nReason: "${reason}"`,
      "Deactivate Campaign",
      true
    );
    if (!confirmed) return;

    setCampaignActionLoading(`deactivate-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_ad",
          id: ad.id,
          payload: { statement: reason },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deactivation failed");

      await alertDialog("Ad campaign deactivated successfully!", "Campaign Deactivated");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error deactivating campaign: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleSaveAdEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdData || !editAdData.id || campaignActionLoading) return;

    setCampaignActionLoading(`edit-ad-${editAdData.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_ad_edit",
          id: editAdData.id,
          payload: editAdData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      await alertDialog("Ad campaign details updated successfully!", "Campaign Saved");
      setEditAdData(null);
      handleRefresh();
    } catch (e: any) {
      await alertDialog(`Error updating campaign details: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteAd = async (ad: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog("Are you sure you want to PERMANENTLY delete this Ad?", "Delete Ad Campaign", true);
    if (!confirmed) {
      return;
    }

    setCampaignActionLoading(`delete-ad-${ad.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_ad", id: ad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");

      setPendingAds((prev) => prev.filter((a) => a.id !== ad.id));
      setActiveAds((prev) => prev.filter((a) => a.id !== ad.id));
      setPendingAdsCount((c) => Math.max(0, c - 1));
      setActiveAdsCount((c) => Math.max(0, c - 1));

      await alertDialog("Ad campaign deleted permanently.", "Ad Deleted");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error deleting ad: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleApproveHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to APPROVE this Highlight ("${highlight.title || highlight.id}")? It will go live immediately.`,
      "Approve Highlight",
      false
    );
    if (!confirmed) return;

    setCampaignActionLoading(`approve-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_highlight", id: highlight.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setPendingHighlights((prev) =>
        prev.map((h) =>
          h.id === highlight.id ? { ...h, admin_statement: `APPROVED:${new Date().toISOString()}` } : h
        )
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error approving highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleRejectHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const feedback = prompt(
      "Enter a reason or feedback for rejecting this Highlight (visible to the user to adjust):"
    );
    if (feedback === null) return;

    const confirmed = await confirmDialog(
      `Are you sure you want to REJECT this Highlight?\n\nReason to user: "${feedback}"`,
      "Reject Highlight",
      true
    );
    if (!confirmed) return;

    setCampaignActionLoading(`reject-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_highlight",
          id: highlight.id,
          payload: { statement: feedback, reason: feedback },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      setPendingHighlights((prev) =>
        prev.map((h) => (h.id === highlight.id ? { ...h, admin_statement: `REJECTED:${feedback}` } : h))
      );

      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error rejecting highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleTogglePauseHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const targetState = !highlight.is_paused;
    const confirmed = await confirmDialog(
      `Are you sure you want to ${targetState ? "PAUSE" : "RESUME"} this Highlight?`,
      targetState ? "Pause Highlight" : "Resume Highlight",
      targetState
    );
    if (!confirmed) return;

    setCampaignActionLoading(`pause-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: targetState ? "pause_highlight" : "resume_highlight",
          id: highlight.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toggle failed");

      await alertDialog(`Highlight successfully ${targetState ? "paused" : "resumed"}!`, "Highlight Updated");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error updating highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleSaveHighlightEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHighlightData || !editHighlightData.id || campaignActionLoading) return;

    setCampaignActionLoading(`edit-hl-${editHighlightData.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_highlight_edit",
          id: editHighlightData.id,
          payload: editHighlightData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update highlight");

      await alertDialog("Highlight details updated successfully!", "Highlight Saved");
      setEditHighlightData(null);
      handleRefresh();
    } catch (e: any) {
      await alertDialog(`Error saving highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handleDeleteHighlight = async (highlight: any) => {
    if (campaignActionLoading) return;
    const confirmed = await confirmDialog("Are you sure you want to PERMANENTLY delete this highlight?", "Delete Highlight", true);
    if (!confirmed) {
      return;
    }

    setCampaignActionLoading(`delete-hl-${highlight.id}`);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_highlight",
          id: highlight.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete highlight");

      setPendingHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      setActiveHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
      setPendingHighlightsCount((c) => Math.max(0, c - 1));
      setActiveHighlightsCount((c) => Math.max(0, c - 1));

      await alertDialog("Highlight deleted permanently.", "Highlight Deleted");
      handleRefresh();
      fetchOverviewStats(true);
    } catch (e: any) {
      await alertDialog(`Error deleting highlight: ${e.message}`, "Error");
    } finally {
      setCampaignActionLoading(null);
    }
  };

  const handlePostAdDirect = async (e: React.FormEvent) => {
    e.preventDefault();

    const adValidation = adminDirectAdSchema.safeParse({
      headline: adForm.adContent.slice(0, 50) || "Direct Admin Ad",
      content: adForm.adContent || "Admin direct ad content",
      ctaLink: adForm.actionWebsite || "https://xea.app",
      impressions: adForm.impressions,
      campaignDays: adForm.campaignDays,
      userEmail: adForm.userEmail,
    });

    if (!adValidation.success) {
      alert(adValidation.error.issues[0]?.message || "Invalid ad form submission.");
      return;
    }

    if (adForm.adMediaType !== "text" && adFormFiles.length === 0) {
      alert("Please select at least one media file to upload.");
      return;
    }

    setUploading(true);
    const adId = uuidv4();
    const costPerImpression = 0;
    const totalCost = 0;

    try {
      let mediaUrlString: string | null = null;

      if (adFormFiles.length > 0) {
        const mediaUrls: string[] = [];
        for (let i = 0; i < adFormFiles.length; i++) {
          const rawFile = adFormFiles[i];
          const file = rawFile.type.startsWith("image/") ? await resizeImageToMax1080p(rawFile) : rawFile;
          const sanitizedFileName = rawFile.name.replace(/[^\w.-]/g, "_");
          const uniqueFileName = `${adId}_${i}_${sanitizedFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("ad-media")
            .upload(uniqueFileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from("ad-media")
            .getPublicUrl(uniqueFileName);

          if (publicUrlData?.publicUrl) {
            mediaUrls.push(publicUrlData.publicUrl);
          }
        }
        mediaUrlString = JSON.stringify(mediaUrls);
      }

      const adPayload = {
        id: adId,
        user_email: adForm.userEmail.toLowerCase().trim(),
        headline: adForm.adContent.slice(0, 50) || "Direct Admin Ad",
        content: adForm.adContent,
        cta_link: adForm.actionWebsite || "https://xea.app",
        cta_button_text: "Learn More",
        ad_type: adForm.adType,
        ad_media_type: adForm.adMediaType,
        media_url: mediaUrlString,
        impressions: adForm.impressions,
        impressions_remaining: adForm.impressions,
        campaign_days: adForm.campaignDays,
        daily_impression_cap: Math.ceil(adForm.impressions / adForm.campaignDays),
        daily_impression_count: 0,
        user_frequency_cap: adForm.userFrequencyCap,
        ad_media: mediaUrlString,
        ad_action_buttons: [
          adForm.actionPhone && "phone",
          adForm.actionWhatsapp && "whatsapp",
          adForm.actionWebsite && "website",
          adForm.actionEmail && "email",
        ].filter(Boolean) as string[],
        action_phone: adForm.actionPhone || null,
        action_whatsapp: adForm.actionWhatsapp || null,
        action_website: adForm.actionWebsite || null,
        action_email: adForm.actionEmail || null,
        cost_per_impression: costPerImpression,
        total_cost: totalCost,
        impression_count: 0,
        seen_users: [],
      };

      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct_post_ad", payload: adPayload }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to publish ad directly");
      }

      alert("Ad published directly to active feed!");
      setAdForm({
        adType: "business",
        industry: [],
        interest: [],
        impressions: 1000,
        campaignDays: 5,
        userFrequencyCap: 1,
        country: "Nigeria",
        state: "",
        gender: "both",
        employmentStatus: "employed",
        adMediaType: "text",
        adContent: "",
        actionPhone: "",
        actionWhatsapp: "",
        actionWebsite: "",
        actionEmail: "",
        costPerImpression: 25,
        userEmail: "admin@paayh.com",
      });
      setAdFormFiles([]);
      handleTabChange("active-ads");
    } catch (e: any) {
      alert(`Unexpected direct posting error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePostHighlightDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!highlightFormFile) {
      alert("Please select a cover image file to upload.");
      return;
    }

    setUploading(true);
    const highlightId = uuidv4();

    try {
      const rawFile = highlightFormFile;
      const file = rawFile.type.startsWith("image/") ? await resizeImageToMax1080p(rawFile) : rawFile;
      const sanitizedFileName = rawFile.name.replace(/[^\w.-]/g, "_");
      const uniqueFileName = `${highlightId}_${sanitizedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("news")
        .upload(uniqueFileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("news")
        .getPublicUrl(uniqueFileName);

      const mediaUrl = publicUrlData?.publicUrl || "";

      const newHighlight = {
        id: highlightId,
        title: highlightForm.title,
        content: highlightForm.content,
        image_url: mediaUrl,
        interest: highlightForm.interest,
        user_email: highlightForm.userEmail.toLowerCase().trim(),
      };

      const response = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "direct_post_highlight", payload: newHighlight }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Highlight posting failed: ${errorData.error || "Server error"}`);
      } else {
        alert("Business highlight published directly to active feed!");
        setHighlightForm({
          title: "",
          content: "",
          interest: "Business",
          userEmail: "admin@paayh.com",
        });
        setHighlightFormFile(null);
        handleTabChange("active-highlights");
      }
    } catch (e: any) {
      alert(`Unexpected direct posting error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const toggleIndustryFormSelection = (item: string) => {
    setAdForm((prev: any) => {
      const list = prev.industry;
      const updated = list.includes(item) ? list.filter((v: string) => v !== item) : [...list, item];
      return { ...prev, industry: updated };
    });
  };

  const toggleInterestFormSelection = (item: string) => {
    setAdForm((prev: any) => {
      const list = prev.interest;
      const updated = list.includes(item) ? list.filter((v: string) => v !== item) : [...list, item];
      return { ...prev, interest: updated };
    });
  };

  return {
    activeActionId,
    handleToggleMonetization,
    handleSuspendUser,
    handleAdjustBalance,
    handleDeleteUser,
    handleUpdateUserProfile,
    handleUpdateSpecialRoles,
    handleToggleAgent,
    handleBanAgent,
    handleRemoveFollower,
    handleRemoveAllFollowers,
    handleDetachUplineAgent,
    handleDeactivateAccount,
    handleResetClicks,
    handleApproveAd,
    handleRejectAd,
    handleTogglePauseAd,
    handleDeactivateAd,
    handleSaveAdEdit,
    handleDeleteAd,
    handleApproveHighlight,
    handleRejectHighlight,
    handleTogglePauseHighlight,
    handleSaveHighlightEdit,
    handleDeleteHighlight,
    handlePostAdDirect,
    handlePostHighlightDirect,
    toggleIndustryFormSelection,
    toggleInterestFormSelection,
  };
}
