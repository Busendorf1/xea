/**
 * Shared L1 In-Memory & L2 Redis Notification Cache across Next.js Route Handlers.
 * Allows milestone, support, campaign, and admin notification writers to immediately
 * evict stale per-user and global announcement payloads (even when Redis is offline).
 */

const USER_NOTIF_L1_TTL_MS = 25 * 1000;
const GLOBAL_ANN_L1_TTL_MS = 60 * 1000;
const MAX_L1_NOTIF_USERS = 3000;

export const GLOBAL_ANN_CACHE_KEY = "notifications:global_announcements:v1";

const l1UserNotifCache = new Map<string, { data: unknown[]; expiresAt: number }>();
let l1GlobalAnnCache: { data: unknown[]; expiresAt: number } | null = null;

export function getUserNotifCacheKey(emailLower: string): string {
  return `notifications:user:${emailLower}`;
}

export function getL1UserNotif<T = unknown>(emailLower: string): T[] | null {
  const clean = String(emailLower || "").toLowerCase().trim();
  if (!clean) return null;
  const hit = l1UserNotifCache.get(clean);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    l1UserNotifCache.delete(clean);
    return null;
  }
  return hit.data as T[];
}

export function setL1UserNotif(emailLower: string, data: unknown[]): void {
  const clean = String(emailLower || "").toLowerCase().trim();
  if (!clean) return;
  if (l1UserNotifCache.size >= MAX_L1_NOTIF_USERS && !l1UserNotifCache.has(clean)) {
    const firstKey = l1UserNotifCache.keys().next().value;
    if (firstKey) l1UserNotifCache.delete(firstKey);
  }
  l1UserNotifCache.set(clean, {
    data,
    expiresAt: Date.now() + USER_NOTIF_L1_TTL_MS,
  });
}

export function invalidateL1UserNotif(emailLower: string): void {
  const clean = String(emailLower || "").toLowerCase().trim();
  if (!clean) return;
  l1UserNotifCache.delete(clean);
}

export function getL1GlobalAnnouncements<T = unknown>(): T[] | null {
  if (!l1GlobalAnnCache) return null;
  if (Date.now() >= l1GlobalAnnCache.expiresAt) {
    l1GlobalAnnCache = null;
    return null;
  }
  return l1GlobalAnnCache.data as T[];
}

export function setL1GlobalAnnouncements(data: unknown[]): void {
  l1GlobalAnnCache = {
    data,
    expiresAt: Date.now() + GLOBAL_ANN_L1_TTL_MS,
  };
}

export function invalidateL1GlobalAnnouncements(): void {
  l1GlobalAnnCache = null;
}

export async function invalidateUserNotificationCaches(email: string): Promise<void> {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return;
  invalidateL1UserNotif(clean);
  try {
    const { default: redisConnection, isRedisReady } = await import("../redis");
    if (!isRedisReady()) return;
    await Promise.allSettled([
      redisConnection.del(getUserNotifCacheKey(clean)),
      redisConnection.del(`notifications:${clean}`),
    ]);
  } catch {
    // Non-blocking cache invalidation
  }
}

export async function invalidateGlobalAnnouncementsCaches(): Promise<void> {
  invalidateL1GlobalAnnouncements();
  try {
    const { default: redisConnection, isRedisReady } = await import("../redis");
    if (!isRedisReady()) return;
    await redisConnection.del(GLOBAL_ANN_CACHE_KEY);
  } catch {
    // Non-blocking cache invalidation
  }
}
