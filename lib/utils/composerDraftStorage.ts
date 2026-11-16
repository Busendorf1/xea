export const AD_DRAFT_STORAGE_PREFIX = "paayh_draft_ad_v2";
export const LEGACY_AD_DRAFT_KEY = "paayh_draft_ad_v1";

export const NEWS_DRAFT_STORAGE_PREFIX = "paayh_draft_news_v2";
export const LEGACY_NEWS_DRAFT_KEY = "paayh_draft_news_v1";

const DRAFT_MEDIA_DB_NAME = "paayh_composer_drafts_v1";
const DRAFT_MEDIA_STORE_NAME = "draft_media";
const DRAFT_MEDIA_DB_VERSION = 1;

interface SerializedDraftMediaItem {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

interface SerializedDraftMediaRecord {
  files: SerializedDraftMediaItem[];
  updatedAt: number;
}

// Synchronous in-memory fallback and instant-hit store for SPA tab switches
// and environments where IndexedDB is unavailable (e.g., SSR, private browsing, Vitest).
const memoryMediaStore = new Map<string, File[]>();
const mediaOpQueue = new Map<string, Promise<unknown>>();

function enqueueMediaOp<T>(scopeId: string, op: () => Promise<T>): Promise<T> {
  const previous = mediaOpQueue.get(scopeId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(op);
  const tracked = next.catch(() => undefined);
  mediaOpQueue.set(scopeId, tracked);
  tracked.finally(() => {
    if (mediaOpQueue.get(scopeId) === tracked) {
      mediaOpQueue.delete(scopeId);
    }
  });
  return next;
}

export function normalizeDraftEmail(email?: string | null): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

export function getScopedDraftStorageKey(prefix: string, email?: string | null): string {
  const clean = normalizeDraftEmail(email);
  return `${prefix}:${clean || "__anonymous__"}`;
}

export function getScopedMediaId(kind: "ad" | "news", email?: string | null): string {
  const clean = normalizeDraftEmail(email);
  return `${kind}:${clean || "__anonymous__"}`;
}

/**
 * Reads a user-scoped JSON draft from localStorage.
 * If the user has a resolved email and no scoped draft yet, migrates and deletes any legacy global draft key
 * once so legacy drafts cannot leak across accounts.
 */
export function readScopedJsonDraft<T = Record<string, unknown>>(
  prefix: string,
  legacyKey: string,
  email?: string | null
): { draft: T | null; fromLegacy: boolean } {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return { draft: null, fromLegacy: false };
  }

  const scopedKey = getScopedDraftStorageKey(prefix, email);
  try {
    const rawScoped = localStorage.getItem(scopedKey);
    if (rawScoped) {
      return { draft: JSON.parse(rawScoped) as T, fromLegacy: false };
    }

    const cleanEmail = normalizeDraftEmail(email);
    if (cleanEmail && legacyKey) {
      const rawLegacy = localStorage.getItem(legacyKey);
      if (rawLegacy) {
        const parsedLegacy = JSON.parse(rawLegacy) as T;
        try {
          localStorage.setItem(scopedKey, JSON.stringify(parsedLegacy));
          localStorage.removeItem(legacyKey);
        } catch {}
        return { draft: parsedLegacy, fromLegacy: true };
      }
    }
  } catch {
    return { draft: null, fromLegacy: false };
  }

  return { draft: null, fromLegacy: false };
}

export function writeScopedJsonDraft<T = Record<string, unknown>>(
  prefix: string,
  email: string | null | undefined,
  draft: T
): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return false;
  }
  const scopedKey = getScopedDraftStorageKey(prefix, email);
  try {
    localStorage.setItem(scopedKey, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeScopedJsonDraft(
  prefix: string,
  legacyKey: string,
  email?: string | null
): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  const scopedKey = getScopedDraftStorageKey(prefix, email);
  try {
    localStorage.removeItem(scopedKey);
  } catch {}
  if (legacyKey) {
    try {
      localStorage.removeItem(legacyKey);
    } catch {}
  }
}

function openDraftMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DRAFT_MEDIA_DB_NAME, DRAFT_MEDIA_DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(DRAFT_MEDIA_STORE_NAME)) {
            db.createObjectStore(DRAFT_MEDIA_STORE_NAME);
          }
        } catch {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function reconstructDraftFile(item: SerializedDraftMediaItem): File | null {
  try {
    if (!item?.blob) return null;
    if (typeof File !== "undefined") {
      return new File([item.blob], item.name || "draft-media", {
        type: item.type || item.blob.type || "application/octet-stream",
        lastModified: Number(item.lastModified) || Date.now(),
      });
    }
    return item.blob as unknown as File;
  } catch {
    return null;
  }
}

/**
 * Persists draft media files synchronously in memory and asynchronously in IndexedDB
 * so files survive both rapid tab switches and full browser reloads without overflowing localStorage.
 */
export async function saveDraftMediaFiles(scopeId: string, files: File[]): Promise<void> {
  if (!scopeId) return;
  const cleanFiles = Array.isArray(files) ? files.filter(Boolean) : [];

  if (cleanFiles.length > 0) {
    memoryMediaStore.set(scopeId, [...cleanFiles]);
  } else {
    memoryMediaStore.delete(scopeId);
  }

  return enqueueMediaOp(scopeId, async () => {
    const db = await openDraftMediaDb();
    if (!db) return;

    try {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(DRAFT_MEDIA_STORE_NAME, "readwrite");
          const store = tx.objectStore(DRAFT_MEDIA_STORE_NAME);
          if (cleanFiles.length === 0) {
            store.delete(scopeId);
          } else {
            const record: SerializedDraftMediaRecord = {
              files: cleanFiles.map((f) => ({
                blob: f,
                name: f.name || "draft-media",
                type: f.type || "application/octet-stream",
                lastModified: f.lastModified || Date.now(),
              })),
              updatedAt: Date.now(),
            };
            store.put(record, scopeId);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    } finally {
      try {
        db.close();
      } catch {}
    }
  });
}

export async function loadDraftMediaFiles(scopeId: string): Promise<File[]> {
  if (!scopeId) return [];

  return enqueueMediaOp(scopeId, async () => {
    const db = await openDraftMediaDb();
    if (db) {
      try {
        const record = await new Promise<SerializedDraftMediaRecord | null>((resolve) => {
          try {
            const tx = db.transaction(DRAFT_MEDIA_STORE_NAME, "readonly");
            const store = tx.objectStore(DRAFT_MEDIA_STORE_NAME);
            const req = store.get(scopeId);
            req.onsuccess = () => resolve((req.result as SerializedDraftMediaRecord) || null);
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });

        if (record && Array.isArray(record.files) && record.files.length > 0) {
          const restored = record.files
            .map(reconstructDraftFile)
            .filter((f): f is File => Boolean(f));
          if (restored.length > 0) {
            memoryMediaStore.set(scopeId, restored);
            return restored;
          }
        }
      } finally {
        try {
          db.close();
        } catch {}
      }
    }

    const mem = memoryMediaStore.get(scopeId);
    return mem ? [...mem] : [];
  });
}

export async function clearDraftMediaFiles(scopeId: string): Promise<void> {
  if (!scopeId) return;
  memoryMediaStore.delete(scopeId);

  return enqueueMediaOp(scopeId, async () => {
    const db = await openDraftMediaDb();
    if (!db) return;

    try {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(DRAFT_MEDIA_STORE_NAME, "readwrite");
          const store = tx.objectStore(DRAFT_MEDIA_STORE_NAME);
          store.delete(scopeId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    } finally {
      try {
        db.close();
      } catch {}
    }
  });
}

/** Internal utility for deterministic unit testing of memory media fallback. */
export function _resetDraftMediaMemoryCacheForTests(): void {
  memoryMediaStore.clear();
}
