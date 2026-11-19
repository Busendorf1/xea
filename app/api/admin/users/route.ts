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
  handleBlockUser,
  handleUnblockUser,
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
    "block_user",
    "unblock_user",
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

    let response: NextResponse;
    switch (action) {
      case "toggle_monetization":
        response = await handleToggleMonetization(adminEmail, userId, payload);
        break;
      case "suspend":
        response = await handleSuspendUser(adminEmail, userId, payload);
        break;
      case "block_user":
        response = await handleBlockUser(adminEmail, userId, payload);
        break;
      case "unblock_user":
        response = await handleUnblockUser(adminEmail, userId, payload);
        break;
      case "adjust_balance":
        response = await handleAdjustUserBalance(adminEmail, userId, payload);
        break;
      case "delete":
        response = await handleDeleteUser(adminEmail, userId);
        break;
      case "ad_account_action":
        response = await handleAdAccountAction(adminEmail, userId, payload);
        break;
      case "update_profile":
        response = await handleUpdateUserProfile(adminEmail, userId, payload);
        break;
      case "update_special_roles":
        response = await handleUpdateSpecialRoles(adminEmail, userId, payload);
        break;
      case "toggle_agent":
        response = await handleToggleAgent(adminEmail, userId, payload);
        break;
      case "ban_agent":
        response = await handleBanAgent(adminEmail, userId, payload);
        break;
      case "remove_follower":
        response = await handleRemoveFollower(adminEmail, userId, payload);
        break;
      case "remove_all_followers":
        response = await handleRemoveAllFollowers(adminEmail, userId, payload);
        break;
      case "detach_upline_agent":
        response = await handleDetachUplineAgent(adminEmail, userId, payload);
        break;
      case "deactivate_account":
        response = await handleDeactivateAccount(adminEmail, userId, payload);
        break;
      case "reset_clicks":
        response = await handleResetClicks(adminEmail, userId, payload);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Invalidate cached overview stats and bump O(1) version key instead of running Redis SCAN loops
    if (response.status >= 200 && response.status < 300) {
      try {
        await Promise.allSettled([
          redisConnection.del("admin:overview_stats"),
          redisConnection.del("admin:overview:stats"),
          redisConnection.incr("admin:lists:version"),
        ]);
      } catch {}
    }

    return response;
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/admin/users:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
