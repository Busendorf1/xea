import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/utils/dbAdmin";
import redisConnection from "@/lib/redis";
import { recordAdminAudit } from "./adminAudit";

export async function handleToggleMonetization(adminEmail: string, userId: string, payload: any) {
  const { nextMonetizedVal, nextMonetizedType, nextMonetizedUntil, isCurrentlyMonetized } = payload || {};
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      monetized: nextMonetizedVal,
      monetization_type: null,
      monetized_until: null,
      monetized_at: isCurrentlyMonetized ? null : new Date().toISOString()
    })
    .eq("id", userId);

  if (error) throw error;

  await recordAdminAudit(
    adminEmail,
    "toggle_monetization",
    userId,
    "user",
    null,
    null,
    { monetized: nextMonetizedVal, monetization_type: nextMonetizedType }
  );

  return NextResponse.json({ success: true });
}

export async function handleResetClicks(adminEmail: string, userId: string, payload: any) {
  const clicks = Math.max(0, parseInt(payload?.clicks ?? 0, 10));
  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("monetization_clicks, email")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("users")
    .update({ monetization_clicks: clicks })
    .eq("id", userId);

  if (error) throw error;

  if (previousUser?.email) {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(previousUser.email).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    "reset_monetization_clicks",
    userId,
    "user",
    `Monetization clicks updated to ${clicks}`,
    previousUser,
    { monetization_clicks: clicks }
  );

  return NextResponse.json({ success: true, clicks });
}

export async function handleUpdateUserProfile(adminEmail: string, userId: string, payload: any) {
  const {
    firstName,
    lastName,
    business_name,
    phone,
    state,
    country,
    location,
    bio,
    industry,
    interest,
    lifestyle,
    behavior,
    personality,
    gender,
    employment,
    atw_tier,
  } = payload || {};

  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!previousUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  if (firstName !== undefined) updates.firstName = firstName?.trim() || null;
  if (lastName !== undefined) updates.lastName = lastName?.trim() || null;
  if (business_name !== undefined) updates.business_name = business_name?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (state !== undefined) updates.state = state?.trim() || null;
  if (country !== undefined) updates.country = country?.trim() || null;
  if (location !== undefined) updates.location = location?.trim() || null;
  if (bio !== undefined) updates.bio = bio?.trim() || null;
  if (industry !== undefined) updates.industry = industry || null;
  if (interest !== undefined) updates.interest = interest || null;
  if (lifestyle !== undefined) updates.lifestyle = lifestyle || null;
  if (behavior !== undefined) updates.behavior = behavior || null;
  if (personality !== undefined) updates.personality = personality || null;
  if (gender !== undefined) updates.gender = gender || null;
  if (employment !== undefined) updates.employment = employment || null;
  if (atw_tier !== undefined) updates.atw_tier = atw_tier || null;

  const { error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error) throw error;

  if (previousUser.email) {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(previousUser.email).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    "update_user_profile",
    userId,
    "user",
    "Admin updated user profile fields",
    previousUser,
    updates
  );

  return NextResponse.json({ success: true, updated: updates });
}

export async function handleUpdateSpecialRoles(adminEmail: string, userId: string, payload: any) {
  const { isCareer, isAffiliate, affiliateRole } = payload || {};
  const { data: previousUser } = await supabaseAdmin
    .from("users")
    .select("id, email, is_career, is_affiliate, affiliate_role, monetized")
    .eq("id", userId)
    .maybeSingle();

  if (!previousUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {
    is_career: Boolean(isCareer),
    is_affiliate: Boolean(isAffiliate),
    affiliate_role: isAffiliate ? String(affiliateRole || "Platform Affiliate").trim() : null,
  };

  if (updates.is_career || updates.is_affiliate) {
    updates.monetized = "true";
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (previousUser.email) {
    const { invalidateCachedProfile } = await import("@/lib/utils/cache");
    await invalidateCachedProfile(previousUser.email).catch(() => {});
  }

  await recordAdminAudit(
    adminEmail,
    "update_special_roles",
    userId,
    "user",
    `Updated special roles: Career=${updates.is_career}, Affiliate=${updates.is_affiliate} (${updates.affiliate_role})`,
    previousUser,
    updates
  );

  return NextResponse.json({ success: true, updated: updates });
}

export async function handleToggleAgent(adminEmail: string, userId: string, payload: any) {
  const { makeAgent } = payload || {};
  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("email, username")
    .eq("id", userId)
    .maybeSingle();

  if (!targetUser?.email) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const userEmail = targetUser.email.toLowerCase().trim();
  const shouldBeAgent = Boolean(makeAgent);

  if (shouldBeAgent) {
    const { registerUserAsAgent } = await import("@/lib/agentSystem");
    await registerUserAsAgent(userEmail);
  } else {
    const { isRedisReady } = await import("@/lib/redis");
    if (isRedisReady()) {
      await redisConnection.set(
        `agent:status:${userEmail}`,
        JSON.stringify({ isAgent: false, registeredAt: null }),
        "EX",
        86400 * 365
      ).catch(() => {});
      await redisConnection.del(`agent:network:${userEmail}`).catch(() => {});
    }
    try {
      await supabaseAdmin
        .from("users")
        .update({ is_agent: false, agent_registered_at: null })
        .ilike("email", userEmail);
    } catch {}
  }

  await recordAdminAudit(
    adminEmail,
    shouldBeAgent ? "grant_agent_status" : "revoke_agent_status",
    userId,
    "user",
    null,
    null,
    { is_agent: shouldBeAgent }
  );

  return NextResponse.json({ success: true, is_agent: shouldBeAgent });
}

export async function handleBanAgent(adminEmail: string, userId: string, payload: any) {
  const { banType, days, customUntil, reason, detachFollowers } = payload || {};
  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("email, username")
    .eq("id", userId)
    .maybeSingle();

  if (!targetUser?.email) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const userEmail = targetUser.email.toLowerCase().trim();
  const { setAgentBan, removeAllAgentFollowers } = await import("@/lib/agentSystem");

  let computedBannedUntil: string | null = null;
  if (banType === "perm") {
    computedBannedUntil = "2099-12-31T23:59:59.000Z";
  } else if (banType === "temp") {
    if (customUntil) {
      computedBannedUntil = new Date(customUntil).toISOString();
    } else {
      const d = Number(days) || 30;
      computedBannedUntil = new Date(Date.now() + d * 86400000).toISOString();
    }
  }

  await setAgentBan({
    email: userEmail,
    banType: banType || "perm",
    bannedUntil: computedBannedUntil,
    reason: reason || "Violation of agency policies or user complaints",
  });

  if (detachFollowers && banType !== "unban") {
    await removeAllAgentFollowers({
      agentEmail: userEmail,
      reason: `Agency ban enacted: ${reason || "Violation"}`,
    });
  }

  await recordAdminAudit(
    adminEmail,
    banType === "unban" ? "lift_agent_ban" : "ban_agent",
    userId,
    "user",
    null,
    null,
    { banType, bannedUntil: computedBannedUntil, reason, detachFollowers }
  );

  return NextResponse.json({
    success: true,
    banned: banType !== "unban",
    banType,
    bannedUntil: computedBannedUntil,
  });
}
