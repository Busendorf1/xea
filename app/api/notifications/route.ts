import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/authHelper";
import supabaseAdmin, { supabaseReadOnly } from "@/lib/utils/dbAdmin";
import redisConnection, { isRedisReady } from "@/lib/redis";
import { getCachedProfile } from "@/lib/utils/cache";

export const dynamic = "force-dynamic";

const USER_NOTIF_TTL_SECONDS = 25;
const GLOBAL_ANN_TTL_SECONDS = 60;
const GLOBAL_ANN_CACHE_KEY = "notifications:global_announcements:v1";

// L1 In-Memory Caches (absorbs 30s header polling in <0.1ms even when Redis is over quota)
const l1UserNotifCache = new Map<string, { data: any[]; expiresAt: number }>();
const MAX_L1_NOTIF_USERS = 3000;
let l1GlobalAnnCache: { data: any[]; expiresAt: number } | null = null;
let inFlightGlobalAnnPromise: Promise<any[]> | null = null;

function getUserNotifCacheKey(emailLower: string): string {
  return `notifications:user:${emailLower}`;
}

function setL1UserNotif(emailLower: string, data: any[]) {
  if (l1UserNotifCache.size >= MAX_L1_NOTIF_USERS && !l1UserNotifCache.has(emailLower)) {
    const firstKey = l1UserNotifCache.keys().next().value;
    if (firstKey) l1UserNotifCache.delete(firstKey);
  }
  l1UserNotifCache.set(emailLower, {
    data,
    expiresAt: Date.now() + USER_NOTIF_TTL_SECONDS * 1000,
  });
}

async function invalidateUserNotifCache(emailLower: string): Promise<void> {
  l1UserNotifCache.delete(emailLower);
  if (!isRedisReady()) return;
  try {
    await redisConnection.del(getUserNotifCacheKey(emailLower));
  } catch {
    // Non-blocking cache invalidation
  }
}

async function loadGlobalAnnouncements(fifteenDaysAgo: string): Promise<any[]> {
  if (l1GlobalAnnCache && Date.now() < l1GlobalAnnCache.expiresAt) {
    return l1GlobalAnnCache.data;
  }
  if (inFlightGlobalAnnPromise) {
    return inFlightGlobalAnnPromise;
  }

  inFlightGlobalAnnPromise = (async () => {
    try {
      if (isRedisReady()) {
        try {
          const cachedGlobalStr = await redisConnection.get(GLOBAL_ANN_CACHE_KEY);
          if (cachedGlobalStr) {
            const parsed = JSON.parse(cachedGlobalStr);
            if (Array.isArray(parsed)) {
              l1GlobalAnnCache = { data: parsed, expiresAt: Date.now() + GLOBAL_ANN_TTL_SECONDS * 1000 };
              return parsed;
            }
          }
        } catch {}
      }

      const { data: dbGlobalAnns, error: annErr } = await supabaseReadOnly
        .from("global_announcements")
        .select("*")
        .gte("created_at", fifteenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      if (annErr) {
        console.error("❌ Error fetching global announcements:", annErr);
        return l1GlobalAnnCache?.data || [];
      }

      const rows = dbGlobalAnns || [];
      l1GlobalAnnCache = { data: rows, expiresAt: Date.now() + GLOBAL_ANN_TTL_SECONDS * 1000 };

      if (isRedisReady()) {
        redisConnection
          .set(GLOBAL_ANN_CACHE_KEY, JSON.stringify(rows), "EX", GLOBAL_ANN_TTL_SECONDS)
          .catch(() => {});
      }
      return rows;
    } finally {
      inFlightGlobalAnnPromise = null;
    }
  })();

  return inFlightGlobalAnnPromise;
}

export async function GET(req: NextRequest) {
  try {
    const email = await getAuthenticatedEmail(req);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailLower = email.toLowerCase().trim();

    // 0a. Ultra-fast L1 In-Memory cache hit (<0.1ms)
    const l1Hit = l1UserNotifCache.get(emailLower);
    if (l1Hit && Date.now() < l1Hit.expiresAt) {
      return NextResponse.json(l1Hit.data);
    }

    const userCacheKey = getUserNotifCacheKey(emailLower);

    // 0b. Fast-path L2 Redis cache hit
    if (isRedisReady()) {
      try {
        const cachedPayload = await redisConnection.get(userCacheKey);
        if (cachedPayload) {
          const parsed = JSON.parse(cachedPayload);
          setL1UserNotif(emailLower, parsed);
          return NextResponse.json(parsed);
        }
      } catch {}
    }

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Resolve user profile from L1/L2 cache first before touching Supabase
    const cachedProf = await getCachedProfile<any>(emailLower);

    const [user, privRes, readLogsRes, rawGlobalAnnouncements] = await Promise.all([
      (async () => {
        if (cachedProf && (cachedProf.created_at !== undefined || cachedProf.monetized !== undefined)) {
          return cachedProf;
        }
        const { data } = await supabaseReadOnly
          .from("users")
          .select("created_at, monetized")
          .eq("email", emailLower)
          .maybeSingle();
        return data;
      })(),
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
        .eq("user_email", emailLower)
        .limit(200),
      loadGlobalAnnouncements(fifteenDaysAgo),
    ]);

    if (!user) {
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

    const userSignupTime = user.created_at ? new Date(user.created_at).getTime() : 0;
    const isMonetized = user.monetized === "yes" || user.monetized === "true" || user.monetized === true;

    const globalAnnouncements = (rawGlobalAnnouncements || []).filter((ga) => {
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

    setL1UserNotif(emailLower, deduplicated);

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
