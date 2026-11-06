import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import { recordAdminAudit } from "./adminAudit";

export async function handleRemoveFollower(adminEmail: string, userId: string, payload: any) {
  const { refereeEmail, reason } = payload || {};
  if (!refereeEmail) {
    return NextResponse.json({ error: "refereeEmail is required" }, { status: 400 });
  }

  let agentEmail = payload?.agentEmail ? String(payload.agentEmail).toLowerCase().trim() : "";
  if (!agentEmail && userId) {
    const { data: targetUser } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (targetUser?.email) agentEmail = targetUser.email.toLowerCase().trim();
  }

  if (!agentEmail) {
    return NextResponse.json({ error: "Agent email or target user not found" }, { status: 404 });
  }
  const { removeAgentFollower } = await import("@/lib/agentSystem");

  const result = await removeAgentFollower({
    agentEmail,
    refereeEmail: String(refereeEmail).toLowerCase().trim(),
    reason,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to remove follower" }, { status: 500 });
  }

  await recordAdminAudit(
    adminEmail,
    "remove_agent_follower",
    userId,
    "user",
    null,
    null,
    { agentEmail, refereeEmail, reason }
  );

  return NextResponse.json({ success: true, message: `Follower ${refereeEmail} removed from agent list.` });
}

export async function handleRemoveAllFollowers(adminEmail: string, userId: string, payload: any) {
  const { reason } = payload || {};
  let agentEmail = payload?.agentEmail ? String(payload.agentEmail).toLowerCase().trim() : "";
  if (!agentEmail && userId) {
    const { data: targetUser } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (targetUser?.email) agentEmail = targetUser.email.toLowerCase().trim();
  }

  if (!agentEmail) {
    return NextResponse.json({ error: "Agent email or target user not found" }, { status: 404 });
  }

  const { removeAllAgentFollowers } = await import("@/lib/agentSystem");

  const result = await removeAllAgentFollowers({
    agentEmail,
    reason,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to remove followers" }, { status: 500 });
  }

  await recordAdminAudit(
    adminEmail,
    "remove_all_agent_followers",
    userId,
    "user",
    null,
    null,
    { agentEmail, count: result.count, reason }
  );

  return NextResponse.json({
    success: true,
    message: `Detached all ${result.count} followers from ${agentEmail}.`,
    count: result.count,
  });
}

export async function handleDetachUplineAgent(adminEmail: string, userId: string, payload: any) {
  const { reason } = payload || {};
  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (!targetUser?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userEmail = targetUser.email.toLowerCase().trim();
  const { detachUplineAgent } = await import("@/lib/agentSystem");

  const result = await detachUplineAgent({
    refereeEmail: userEmail,
    reason,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to detach upline agent" }, { status: 500 });
  }

  await recordAdminAudit(
    adminEmail,
    "detach_upline_agent",
    userId,
    "user",
    null,
    null,
    { userEmail, uplineEmail: result.uplineEmail, reason }
  );

  return NextResponse.json({
    success: true,
    message: result.uplineEmail
      ? `Successfully detached upline agent ${result.uplineEmail}.`
      : "Detached from upline agent.",
  });
}
