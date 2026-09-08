// Shared Client-Side Campaigns Fetcher with In-Flight Request Deduplication & SessionStorage Caching

let inFlightCampaignsPromise: Promise<any> | null = null;
let inFlightEmail: string | null = null;

export async function fetchUserCampaignsShared(email: string, bypassCache: boolean = false): Promise<any> {
  const emailLower = email.toLowerCase().trim();
  const cacheKey = `my_campaigns_data_${emailLower}`;
  const TWO_MINUTES = 2 * 60 * 1000;

  // 1. Check client sessionStorage cache unless explicitly bypassing
  if (!bypassCache && typeof window !== "undefined") {
    try {
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && cached.timestamp && Date.now() - cached.timestamp < TWO_MINUTES) {
          return cached.data;
        }
      }
    } catch {
      // sessionStorage failure fallback
    }
  }

  // 2. Request deduplication: If a request is already in-flight for this email, reuse the promise
  if (inFlightCampaignsPromise && inFlightEmail === emailLower && !bypassCache) {
    return inFlightCampaignsPromise;
  }

  inFlightEmail = emailLower;
  inFlightCampaignsPromise = (async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error(`Campaigns API error: ${res.status}`);
      const data = await res.json();

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ timestamp: Date.now(), data })
          );
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
  if (typeof window !== "undefined" && email) {
    try {
      sessionStorage.removeItem(`my_campaigns_data_${email.toLowerCase().trim()}`);
      sessionStorage.removeItem(`my_ads_cache_${email.toLowerCase().trim()}`);
    } catch {}
  }
}

