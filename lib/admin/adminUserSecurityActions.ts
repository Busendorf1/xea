import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { recordAdminAudit } from "./adminAudit";

export async function handleSuspendUser(adminEmail: string, userId: string, payload: any) {
  const { suspendedUntil, reason } = payload || {};
  const { error } = await supabaseAdmin
    .from("users")
    .update({ suspended_until: suspendedUntil })
    .eq("id", userId);

  if (error) throw error;

  await recordAdminAudit(
    adminEmail,
    "suspend_user",
    userId,
    "user",
    reason || "Admin suspension",
    null,
    { suspended_until: suspendedUntil }
  );

  return NextResponse.json({ success: true });
}

export async function handleAdjustUserBalance(adminEmail: string, userId: string, payload: any) {
  const { newBalance, reason } = payload || {};
  const parsedNewBalance = Number(newBalance);
  if (!Number.isFinite(parsedNewBalance) || parsedNewBalance < 0) {
    return NextResponse.json({ error: "Invalid balance amount" }, { status: 400 });
  }

  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("balance, email")
    .eq("id", userId)
    .maybeSingle();

  if (!previousUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const prevBalance = Number(previousUser.balance || 0);
  const deltaAmount = Math.abs(parsedNewBalance - prevBalance);

  const {
    checkAdminVelocityLimit,
    requiresDualApproval,
    createPendingAdminRequest,
  } = await import("@/lib/security/adminGuard");

  const velocityCheck = await checkAdminVelocityLimit(adminEmail, deltaAmount);
  if (!velocityCheck.allowed) {
    return NextResponse.json({ error: velocityCheck.reason }, { status: 403 });
  }

  if (requiresDualApproval(deltaAmount)) {
    const pendingReq = await createPendingAdminRequest({
      actionType: "balance_adjustment",
      requestedBy: adminEmail,
      targetIdentifier: previousUser.email || userId,
      amountNaira: deltaAmount,
      payload: {
        userId,
        userEmail: previousUser.email,
        previousBalance: prevBalance,
        newBalance: parsedNewBalance,
      },
      reason: reason || "Manual administrative balance adjustment",
    });

    return NextResponse.json({
      success: true,
      requiresDualApproval: true,
      requestId: pendingReq.id,
      message: `Balance adjustment of ₦${deltaAmount.toLocaleString("en-NG")} exceeds ₦50,000 threshold and has been queued for dual-admin approval.`,
    });
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ balance: parsedNewBalance })
    .eq("id", userId);

  if (error) throw error;

  if (previousUser.email) {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(previousUser.email).catch(() => {});
    await supabaseAdmin.from("payments").insert({
      user_email: previousUser.email.toLowerCase().trim(),
      reference: `admin_adj_${Date.now()}_${userId.substring(0, 6)}`,
      amount: deltaAmount,
      status: "success",
      type: "admin_adjustment",
      description: reason || `Admin balance adjustment (${prevBalance} -> ${parsedNewBalance})`,
      metadata: {
        admin_email: adminEmail,
        previous_balance: prevBalance,
        new_balance: parsedNewBalance,
        reason: reason || "Manual administrative adjustment",
      },
    }).then(() => {}, () => {});
  }

  await recordAdminAudit(
    adminEmail,
    "adjust_user_balance",
    userId,
    "user",
    reason || "Manual administrative adjustment",
    { balance: prevBalance, email: previousUser.email },
    { balance: parsedNewBalance }
  );

  return NextResponse.json({ success: true });
}

export async function handleDeleteUser(adminEmail: string, userId: string) {
  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("email, username")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("users")
    .delete()
    .eq("id", userId);

  if (error) throw error;

  await recordAdminAudit(
    adminEmail,
    "delete_user",
    userId,
    "user",
    null,
    previousUser,
    null
  );

  return NextResponse.json({ success: true });
}

export async function handleAdAccountAction(adminEmail: string, userId: string, payload: any) {
  const { adStatus, banDays, banReason } = payload || {};
  let adBanUntil = null;
  if (adStatus === "temp_banned") {
    const days = parseInt(banDays || "7", 10);
    adBanUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (adStatus === "perm_banned") {
    adBanUntil = new Date("2099-12-31T23:59:59Z").toISOString();
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      ad_account_status: adStatus,
      ad_ban_until: adBanUntil,
      ad_ban_reason: banReason || null
    })
    .eq("id", userId);

  if (error) throw error;

  await recordAdminAudit(
    adminEmail,
    "update_ad_account_status",
    userId,
    "user",
    banReason || null,
    null,
    { adStatus, adBanUntil, banReason }
  );

  return NextResponse.json({ success: true });
}

export async function handleDeactivateAccount(adminEmail: string, userId: string, payload: any) {
  const { deactivated, reason } = payload || {};
  const isDeactivated = Boolean(deactivated);

  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("ad_account_status, email")
    .eq("id", userId)
    .maybeSingle();

  const adStatus = isDeactivated ? "deactivated" : "active";
  const banReason = reason || (isDeactivated ? "Account deactivated by admin" : null);

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      ad_account_status: adStatus,
      ad_ban_reason: banReason,
    })
    .eq("id", userId);

  if (error) throw error;

  if (previousUser?.email) {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(previousUser.email).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    isDeactivated ? "deactivate_account" : "reactivate_account",
    userId,
    "user",
    banReason,
    previousUser,
    { ad_account_status: adStatus }
  );

  return NextResponse.json({ success: true, deactivated: isDeactivated });
}
