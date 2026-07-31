# Expo Mobile App (xea-mobile) Ads Render Service Specification

This document details the **TypeScript / Expo React Native** data models, API functions, `@shopify/flash-list` dismissal handlers, and retargeting integration for the **`xea-mobile`** codebase located at `C:\Users\USER\Desktop\xea-mobile`.

---

## 1. Tech Stack Overview (`xea-mobile`)

- **Framework**: Expo ~54.0.0 (React Native 0.81.5, Expo Router ~6.0.24)
- **Language**: TypeScript (~5.9.2)
- **UI Components**: `@shopify/flash-list`, `expo-blur`, `expo-video`, `lucide-react-native`
- **Networking**: `lib/api.ts` communicating with Next.js App Router API endpoints (`/api/feed`, `/api/seen`, `/api/earn`, `/api/monetize`)

---

## 2. Core Business & Retargeting Rules in `xea-mobile`

1. **Immediate Dismissal via `CollapsibleCardWrapper`**:
   - In `app/(tabs)/feed.tsx`, clicking **Seen**, **Earn**, **Mutual**, or a **CTA Button** triggers `setDismissingAdIds((prev) => [...prev, adId])`.
   - The card animates height and opacity to `0` over 350ms, then invokes `onAnimationComplete` to remove the ad from local FlashList state.
   - Concurrently, `recordAdSeenApi(adId)` or `earnAdPayout()` is invoked, adding the `adId` to the user's active `seen:ads:${email}` Redis Set on the server.
2. **Single-Fetch Uniqueness (No Duplicates in One Batch)**:
   - `getFeedAds(limit, offset, refresh)` fetches unique candidate ads from `/api/feed`.
   - Guaranteed single-fetch ad ID uniqueness across all pagination slices.
3. **Multi-Occasion Retargeting Engine**:
   - If an ad has `user_frequency_cap = 3`:
     - **Occasion 1**: The user sees the ad in Expo `feed.tsx` and clicks a button. The ad is hidden for the session (`view_count = 1`).
     - **Occasion 2 (Retargeted)**: On a subsequent fresh fetch (e.g. next day / pull-to-refresh), the backend checks `view_count < user_frequency_cap` ($1 < 3$). The ad is delivered again for impression #2.
     - **Occasion 3 (Final Impression)**: Delivered for impression #3.
     - **Post-Cap Exclusion**: Once `view_count >= 3`, the server permanently excludes the ad from future feed queries.

---

## 3. Expo TypeScript Integration Code Snippets (`lib/api.ts`)

```typescript
// 1. Fetch Feed Ads
export async function getFeedAds(limit = 15, offset = 0, refresh = false) {
  const apiRes = await apiRequest(`/api/feed?limit=${limit}&offset=${offset}&refresh=${refresh}`);
  if (apiRes) return apiRes;
  throw new Error("Unable to fetch feed ads: API connection failed.");
}

// 2. Record Ad Impression / Dismissal
export async function recordAdSeenApi(adId: string) {
  const apiRes = await apiRequest("/api/seen", {
    method: "POST",
    body: JSON.stringify({ adId })
  });
  if (apiRes) return apiRes;
  throw new Error("Unable to record ad impression: API connection failed.");
}

// 3. Claim Earn Payout
export async function earnAdPayout(email: string, adId: string, token?: string, servedAt?: string) {
  if (token && servedAt) {
    const apiRes = await apiRequest("/api/earn", {
      method: "POST",
      body: JSON.stringify({
        adId,
        token,
        servedAt: servedAt.toString(),
        type: "earn"
      })
    });
    if (apiRes) return apiRes;
  }
  throw new Error("Please refresh");
}
```

---

## 4. `CollapsibleCardWrapper` in Expo `app/(tabs)/feed.tsx`

```tsx
function CollapsibleCardWrapper({
  children,
  isDismissing,
  onAnimationComplete,
  itemId
}: {
  children: React.ReactNode;
  isDismissing: boolean;
  onAnimationComplete: () => void;
  itemId: string;
}) {
  const heightAnim = useRef(new Animated.Value(450)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isDismissing) {
      Animated.parallel([
        Animated.timing(heightAnim, { toValue: 0, duration: 350, useNativeDriver: false }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        onAnimationComplete();
      });
    }
  }, [isDismissing]);

  return (
    <Animated.View style={isDismissing ? { height: heightAnim, overflow: "hidden" } : undefined}>
      <Animated.View style={{ opacity: opacityAnim }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}
```
