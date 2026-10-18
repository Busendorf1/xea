// Shared Client-Side Campaigns Fetcher with In-Flight Request Deduplication & Synchronous SWR Caching

let inFlightCampaignsPromise: Promise<any> | null = null;
let inFlightEmail: string | null = null;
const memoryCache = new Map<string, { timestamp: number; data: any }>();

export function readUserCampaignsSyncCache(email?: string | null): any | null {
  if (!email) return null;
  const emailLower = email.toLowerCase().trim();
  const mem = memoryCache.get(emailLower);
  if (mem?.data) return mem.data;

  if (typeof window !== "undefined") {
    try {
      const cacheKey = `my_campaigns_data_${emailLower}`;
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.data) {
          memoryCache.set(emailLower, { timestamp: cached.timestamp || Date.now(), data: cached.data });
          return cached.data;
        }
      }
    } catch {}
  }
  return null;
}

export async function fetchUserCampaignsShared(email: string, bypassCache: boolean = false): Promise<any> {
  const emailLower = email.toLowerCase().trim();
  const cacheKey = `my_campaigns_data_${emailLower}`;
  const THIRTY_SECONDS = 30 * 1000;

  // 1. Check in-memory and sessionStorage cache unless explicitly bypassing
  if (!bypassCache) {
    const mem = memoryCache.get(emailLower);
    if (mem && Date.now() - mem.timestamp < THIRTY_SECONDS) {
      return mem.data;
    }
    if (typeof window !== "undefined") {
      try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.timestamp && Date.now() - cached.timestamp < THIRTY_SECONDS) {
            memoryCache.set(emailLower, cached);
            return cached.data;
          }
        }
      } catch {
        // sessionStorage failure fallback
      }
    }
  }

  // 2. Request deduplication: If a request is already in-flight for this email, reuse the promise
  if (inFlightCampaignsPromise && inFlightEmail === emailLower && !bypassCache) {
    return inFlightCampaignsPromise;
  }

  inFlightEmail = emailLower;
  inFlightCampaignsPromise = (async () => {
    try {
      const fetchUrl = bypassCache ? "/api/campaigns?refresh=true" : "/api/campaigns";
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`Campaigns API error: ${res.status}`);
      const data = await res.json();

      const entry = { timestamp: Date.now(), data };
      memoryCache.set(emailLower, entry);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(entry));
        } catch {}
      }
      return data;
    } finally {
      inFlightCampaignsPromise = null;
      inFlightEmail = null;
    }
  })();

  return inFlightCampaignsPromise;
}

export function clearUserCampaignsCache(email: string) {
  if (!email) return;
  const emailLower = email.toLowerCase().trim();
  memoryCache.delete(emailLower);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(`my_campaigns_data_${emailLower}`);
      sessionStorage.removeItem(`my_ads_cache_${emailLower}`);
    } catch {}
  }
}

