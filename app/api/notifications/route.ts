import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

const USER_NOTIF_TTL_SECONDS = 20;
const GLOBAL_ANN_TTL_SECONDS = 60;
const GLOBAL_ANN_CACHE_KEY = "notifications:global_announcements:v1";

function getUserNotifCacheKey(emailLower: string): string {
  return `notifications:user:${emailLower}`;
}

async function invalidateUserNotifCache(emailLower: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redisConnection.del(getUserNotifCacheKey(emailLower));
  } catch {
    // Non-blocking cache invalidation
  }
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const userCacheKey = getUserNotifCacheKey(emailLower);

    // 0. Fast-path Redis L1 cache hit (absorbs 30s header polling across millions of tabs)
    if (isRedisReady()) {
      try {
        const cachedPayload = await redisConnection.get(userCacheKey);
        if (cachedPayload) {
          return NextResponse.json(JSON.parse(cachedPayload));
        }
      } catch {
        // Fallback to DB on cache read failure
      }
    }

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch user info, private notifications, read logs, and cached global announcements in parallel
    const [userRes, privRes, readLogsRes, cachedGlobalStr] = await Promise.all([
      supabaseReadOnly
        .from("users")
        .select("created_at, monetized")
        .eq("email", emailLower)
        .maybeSingle(),
      supabaseReadOnly
        .from("notifications")
        .select("*")
        .eq("user_email", emailLower)
        .gte("created_at", fifteenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseReadOnly
        .from("read_announcements")
        .select("announcement_id")
        .eq("user_email", emailLower),
      isRedisReady()
        ? redisConnection.get(GLOBAL_ANN_CACHE_KEY).catch(() => null)
        : Promise.resolve(null),
    ]);

    const user = userRes.data;
    if (userRes.error || !user) {
      console.warn(
        "⚠️ User profile info query warning in /api/notifications:",
        userRes.error?.message || "User not found"
      );
      return NextResponse.json([]);
    }

    if (privRes.error) {
      console.error("❌ Error fetching private notifications:", privRes.error);
      return NextResponse.json({ error: privRes.error.message }, { status: 500 });
    }

    if (readLogsRes.error) {
      console.error("❌ Error fetching read announcements logs:", readLogsRes.error);
      return NextResponse.json({ error: readLogsRes.error.message }, { status: 500 });
    }

    // 2. Resolve 15-day global announcements (shared 60s Redis cache across all users)
    let rawGlobalAnnouncements: any[] | null = null;
    if (cachedGlobalStr) {
      try {
        rawGlobalAnnouncements = JSON.parse(cachedGlobalStr);
      } catch {
        rawGlobalAnnouncements = null;
      }
    }

    if (!rawGlobalAnnouncements) {
      const { data: dbGlobalAnns, error: annErr } = await supabaseReadOnly
        .from("global_announcements")
        .select("*")
        .gte("created_at", fifteenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      if (annErr) {
        console.error("❌ Error fetching global announcements:", annErr);
        return NextResponse.json({ error: annErr.message }, { status: 500 });
      }

      rawGlobalAnnouncements = dbGlobalAnns || [];
      if (isRedisReady()) {
        redisConnection
          .set(GLOBAL_ANN_CACHE_KEY, JSON.stringify(rawGlobalAnnouncements), "EX", GLOBAL_ANN_TTL_SECONDS)
          .catch(() => {});
      }
    }

    const userSignupTime = user.created_at ? new Date(user.created_at).getTime() : 0;
    const isMonetized = user.monetized === "yes" || user.monetized === true;

    const globalAnnouncements = rawGlobalAnnouncements.filter((ga) => {
      const gaTime = ga.created_at ? new Date(ga.created_at).getTime() : 0;
      if (userSignupTime > 0 && gaTime < userSignupTime) return false;
      if (isMonetized) {
        return ga.target === "all" || ga.target === "monetized";
      }
      return ga.target === "all";
    });

    const readAnnIds = new Set((readLogsRes.data || []).map((log) => log.announcement_id));

    // 3. Merge and format results
    const formattedPrivate = (privRes.data || []).map((n) => ({
      id: n.id,
      user_email: n.user_email,
      title: n.title,
      message: n.message,
      read: n.read,
      created_at: n.created_at,
      is_global: false,
    }));

    const formattedGlobal = globalAnnouncements.map((ga) => ({
      id: ga.id,
      user_email: emailLower,
      title: ga.title,
      message: ga.message,
      read: readAnnIds.has(ga.id),
      created_at: ga.created_at,
      is_global: true,
    }));

    const merged = [...formattedPrivate, ...formattedGlobal].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Deduplicate: ensure unique by id and unique by content (title + message + date)
    const seenIds = new Set<string>();
    const seenContentKeys = new Set<string>();
    const deduplicated: typeof merged = [];

    for (const item of merged) {
      if (!item || !item.id) continue;
      const strId = String(item.id);
      if (seenIds.has(strId)) continue;
      seenIds.add(strId);

      const normTitle = (item.title || "").trim().toLowerCase();
      const normMsg = (item.message || "").trim().toLowerCase();
      const dateKey = item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : "";
      const contentKey = `${normTitle}:::${normMsg}:::${dateKey}`;

      if (seenContentKeys.has(contentKey)) {
        continue;
      }
      seenContentKeys.add(contentKey);

      deduplicated.push(item);
    }

    if (isRedisReady()) {
      redisConnection
        .set(userCacheKey, JSON.stringify(deduplicated), "EX", USER_NOTIF_TTL_SECONDS)
        .catch(() => {});
    }

    return NextResponse.json(deduplicated);
  } catch (err: any) {
    console.warn("⚠️ Error in GET /api/notifications:", err?.message || err);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();
    const body = await req.json();
    const { notificationId, all } = body;

    if (all) {
      // 1. Mark all private notifications as read and fetch user info concurrently
      const [, userRes] = await Promise.all([
        supabaseAdmin
          .from("notifications")
          .update({ read: true })
          .eq("user_email", emailLower),
        supabaseAdmin
          .from("users")
          .select("created_at, monetized")
          .eq("email", emailLower)
          .maybeSingle(),
      ]);

      const user = userRes.data;
      if (user) {
        const userSignupDate = user.created_at;
        const isMonetized = user.monetized === "yes" || user.monetized === true;

        let annQuery = supabaseAdmin
          .from("global_announcements")
          .select("id")
          .gte("created_at", userSignupDate);

        if (isMonetized) {
          annQuery = annQuery.in("target", ["all", "monetized"]);
        } else {
          annQuery = annQuery.eq("target", "all");
        }

        const { data: activeAnns } = await annQuery;

        if (activeAnns && activeAnns.length > 0) {
          const upsertPayload = activeAnns.map((a) => ({
            user_email: emailLower,
            announcement_id: a.id,
          }));

          await supabaseAdmin
            .from("read_announcements")
            .upsert(upsertPayload, { onConflict: "user_email,announcement_id" });
        }
      }

      await invalidateUserNotifCache(emailLower);
      return NextResponse.json({ success: true, message: "All notifications marked as read." });
    } else if (notificationId) {
      // Check if it's a global announcement
      const { data: isGlobal } = await supabaseAdmin
        .from("global_announcements")
        .select("id")
        .eq("id", notificationId)
        .maybeSingle();

      if (isGlobal) {
        await supabaseAdmin
          .from("read_announcements")
          .upsert(
            { user_email: emailLower, announcement_id: notificationId },
            { onConflict: "user_email,announcement_id" }
          );
      } else {
        await supabaseAdmin
          .from("notifications")
          .update({ read: true })
          .eq("id", notificationId)
          .eq("user_email", emailLower);
      }

      await invalidateUserNotifCache(emailLower);
      return NextResponse.json({ success: true, message: "Notification marked as read." });
    } else {
      return NextResponse.json({ error: "Missing notificationId or all parameters" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in POST /api/notifications:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { notificationIds, all } = body;

    const emailLower = email.toLowerCase().trim();

    if (all) {
      const { error: delErr } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("user_email", emailLower);

      if (delErr) {
        console.error("❌ Error deleting all notifications:", delErr);
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await invalidateUserNotifCache(emailLower);
      return NextResponse.json({ success: true, message: "All notifications deleted successfully." });
    } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("user_email", emailLower)
        .in("id", notificationIds);

      if (delErr) {
        console.error("❌ Error deleting selected notifications:", delErr);
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await invalidateUserNotifCache(emailLower);
      return NextResponse.json({
        success: true,
        message: `${notificationIds.length} notification(s) deleted successfully.`,
      });
    } else {
      return NextResponse.json({ error: "Missing notificationIds or all flag." }, { status: 400 });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in DELETE /api/notifications:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


