"use client";

import React from "react";
import { formatCurrency as globalFormatCurrency } from "@/lib/utils/currency";

const formatCurrency = (amount: number | string, country?: string | null) =>
  globalFormatCurrency(amount, country);

export interface AdminUserManagementParams {
  userActionSubmitting: boolean;
  setUserActionSubmitting: (v: boolean) => void;
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  setActiveActionId: (id: string | null) => void;
  handleRefresh: () => void;
  alertDialog: (message: string, title?: string) => Promise<boolean | void>;
  confirmDialog: (message: string, title?: string, isDestructive?: boolean) => Promise<boolean>;
}

export function useAdminUserManagementActions(params: AdminUserManagementParams) {
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

  return {
    handleToggleMonetization,
    handleSuspendUser,
    handleAdjustBalance,
    handleDeleteUser,
    handleUpdateUserProfile,
    handleDeactivateAccount,
    handleResetClicks,
  };
}
