import { NextRequest, NextResponse } from "next/server";
import redisConnection from "@/lib/redis";
import { verifyAdminUser } from "@/lib/authHelper";
import { z } from "zod";

import {
  handleGetUserDetails,
  handleGetAgentsList,
  handleGetFollowersList,
  handleGetAffiliatesList,
  handleGetStats,
  handleGetUsersList,
} from "@/lib/admin/adminUsersQueryHandlers";

import {
  handleSuspendUser,
  handleAdjustUserBalance,
  handleDeleteUser,
  handleAdAccountAction,
  handleDeactivateAccount,
} from "@/lib/admin/adminUserSecurityActions";

import {
  handleToggleMonetization,
  handleResetClicks,
  handleUpdateUserProfile,
  handleUpdateSpecialRoles,
  handleToggleAgent,
  handleBanAgent,
} from "@/lib/admin/adminUserRoleActions";

import {
  handleRemoveFollower,
  handleRemoveAllFollowers,
  handleDetachUplineAgent,
} from "@/lib/admin/adminUserNetworkActions";

export const dynamic = "force-dynamic";

// Zod validation schema for POST actions
const adminActionSchema = z.object({
  action: z.enum([
    "toggle_monetization",
    "suspend",
    "adjust_balance",
    "delete",
    "ad_account_action",
    "update_profile",
    "update_special_roles",
    "toggle_agent",
    "deactivate_account",
    "reset_clicks",
    "ban_agent",
    "remove_follower",
    "remove_all_followers",
    "detach_upline_agent",
  ]),
  userId: z.string().min(1, "userId is required"),
  payload: z.record(z.string(), z.any()).optional(),
});

export async function GET(req: NextRequest) {
  const admin = await verifyAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type") || "list";

    if (type === "user_details") {
      return await handleGetUserDetails(searchParams);
    } else if (type === "agents_list") {
      return await handleGetAgentsList(searchParams);
    } else if (type === "followers_list") {
      return await handleGetFollowersList(searchParams);
    } else if (type === "affiliates_list") {
      return await handleGetAffiliatesList(searchParams);
    } else if (type === "stats") {
      return await handleGetStats();
    } else {
      return await handleGetUsersList(searchParams);
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in GET /api/admin/users:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const rawBody = await req.json();
    const parseResult = adminActionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid input payload", details: parseResult.error.format() }, { status: 400 });
    }

    const { action, userId, payload } = parseResult.data;
    const adminEmail = admin.email.toLowerCase();

    // Invalidate cached overview stats and user pages in Redis whenever an admin modifies user balances, status, or deletes users
    await redisConnection.del("admin:overview_stats").catch(() => {});
    await redisConnection.del("admin:overview:stats").catch(() => {});
    try {
      const { scanDeletePattern } = await import("@/lib/redis");
      await scanDeletePattern("admin:users:list:*");
    } catch {}

    switch (action) {
      case "toggle_monetization":
        return await handleToggleMonetization(adminEmail, userId, payload);
      case "suspend":
        return await handleSuspendUser(adminEmail, userId, payload);
      case "adjust_balance":
        return await handleAdjustUserBalance(adminEmail, userId, payload);
      case "delete":
        return await handleDeleteUser(adminEmail, userId);
      case "ad_account_action":
        return await handleAdAccountAction(adminEmail, userId, payload);
      case "update_profile":
        return await handleUpdateUserProfile(adminEmail, userId, payload);
      case "update_special_roles":
        return await handleUpdateSpecialRoles(adminEmail, userId, payload);
      case "toggle_agent":
        return await handleToggleAgent(adminEmail, userId, payload);
      case "ban_agent":
        return await handleBanAgent(adminEmail, userId, payload);
      case "remove_follower":
        return await handleRemoveFollower(adminEmail, userId, payload);
      case "remove_all_followers":
        return await handleRemoveAllFollowers(adminEmail, userId, payload);
      case "detach_upline_agent":
        return await handleDetachUplineAgent(adminEmail, userId, payload);
      case "deactivate_account":
        return await handleDeactivateAccount(adminEmail, userId, payload);
      case "reset_clicks":
        return await handleResetClicks(adminEmail, userId, payload);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/users:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
