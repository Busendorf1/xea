"use client";

import React from "react";

export interface AdminUserNetworkParams {
  userActionSubmitting: boolean;
  setUserActionSubmitting: (v: boolean) => void;
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  setActiveActionId: (id: string | null) => void;
  handleRefresh: () => void;
  alertDialog: (message: string, title?: string) => Promise<boolean | void>;
  confirmDialog: (message: string, title?: string, isDestructive?: boolean) => Promise<boolean>;
}

export function useAdminUserNetworkActions(params: AdminUserNetworkParams) {
  const {
    userActionSubmitting,
    setUserActionSubmitting,
    selectedUser,
    setSelectedUser,
    setActiveActionId,
    handleRefresh,
    alertDialog,
    confirmDialog,
  } = params;

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
        await alertDialog(`Failed to execute agency ban: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(
          isUnban
            ? `Agency ban lifted for @${user.username}.`
            : `Agency privileges restricted for @${user.username}.${options.detachFollowers ? " Followers detached." : ""}`,
          "Agency Action Completed"
        );
        handleRefresh();
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser((prev: any) => ({
            ...prev,
            is_agent: isUnban,
            agent_banned_until: isUnban ? null : options.customUntil || new Date().toISOString(),
          }));
        }
      }
    } catch (e: any) {
      await alertDialog(`Error setting agency ban: ${e.message}`, "Error");
    } finally {
      setUserActionSubmitting(false);
      setActiveActionId(null);
    }
  };

  const handleRemoveFollower = async (user: any, refereeEmail: string, followerLabel?: string) => {
    if (userActionSubmitting) return;
    const confirmed = await confirmDialog(
      `Are you sure you want to detach follower ${followerLabel || refereeEmail} from agent @${user.username}?\n\nThis will remove them from the agent's network and set upline to direct.`,
      "Detach Follower",
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
          payload: {
            agentEmail: user.email,
            refereeEmail,
            reason: "Admin detached follower on dispute or policy review",
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to remove follower: ${err.error || "Server error"}`, "Error");
      } else {
        await alertDialog(`Follower detached successfully from @${user.username}.`, "Follower Detached");
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
      `CRITICAL ACTION:\nAre you sure you want to detach ALL active followers from agent @${user.username}?\n\nAll downline edges will be disconnected and their commissions set to direct.`,
      "Detach All Followers",
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
          payload: {
            agentEmail: user.email,
            reason: "Admin purged all agent followers on sanction",
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        await alertDialog(`Failed to purge followers: ${err.error || "Server error"}`, "Error");
      } else {
        const data = await response.json();
        await alertDialog(
          `Detached ${data.count ?? "all"} followers from agent @${user.username}.`,
          "All Followers Detached"
        );
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

  return {
    handleToggleAgent,
    handleUpdateSpecialRoles,
    handleBanAgent,
    handleRemoveFollower,
    handleRemoveAllFollowers,
    handleDetachUplineAgent,
  };
}
