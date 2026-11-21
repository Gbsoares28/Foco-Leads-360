const ALLOWED_SAME_ORIGIN_PREFIXES = [
  '/api/google/place-photo',
  '/uploads/',
  '/assets/',
];

const DATA_IMAGE_REGEX =
  /^data:image\/(?:jpeg|jpg|png|webp|gif|svg\+xml);(?:charset=[^;,]+;)?(?:base64,)?[a-z0-9+/=,%._\-\s]+$/i;

// Crisp inline SVG fallback image (never fails offline or under quota exhaustion)
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
  <rect width="320" height="200" fill="#F1F5F9"/>
  <rect x="116" y="64" width="88" height="66" rx="12" fill="#E2E8F0" stroke="#CBD5F1" stroke-width="2"/>
  <circle cx="140" cy="86" r="7" fill="#94A3B8"/>
  <path d="M124 120 L148 96 L166 112 L180 100 L196 120 Z" fill="#94A3B8"/>
</svg>`;

export const DEFAULT_FALLBACK_IMAGE_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  FALLBACK_SVG
)}`;

export interface PreloadResult {
  ok: boolean;
  src: string | null;
  fromCache?: boolean;
  reason?:
    | 'invalid_url'
    | 'quota_exceeded'
    | 'http_error'
    | 'invalid_content_type'
    | 'empty_body'
    | 'load_error';
  status?: number;
}

interface CachedImageEntry {
  src: string;
  isBlobUrl: boolean;
  expiresAt: number;
}

interface FailedImageEntry {
  reason: NonNullable<PreloadResult['reason']>;
  status?: number;
  retryAfter: number;
}

interface LocalStorageImageEntry {
  dataUrl: string;
  expiresAt: number;
  updatedAt: number;
}

interface IndexedDbImageRecord {
  key: string;
  blob: Blob;
  mimeType: string;
  expiresAt: number;
  updatedAt: number;
}

const MAX_CACHE_ENTRIES = 80;
const MAX_IDB_ENTRIES = 50;
const MAX_LOCALSTORAGE_IMAGE_BYTES = 64 * 1024;
const MAX_LOCALSTORAGE_ENTRIES = 20;
const LS_ITEM_PREFIX = 'foco_img_cache_v1:';
const LS_INDEX_KEY = 'foco_img_cache_index_v1';
const IDB_NAME = 'foco-leads-image-cache';
const IDB_STORE = 'images';
const IDB_VERSION = 1;

const GOOGLE_PHOTO_CACHE_TTL_MS = 30 * 60 * 1000;
const STATIC_IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TRANSIENT_FAILURE_COOLDOWN_MS = 25 * 1000;
const QUOTA_FAILURE_COOLDOWN_MS = 60 * 1000;

const resolvedImageCache = new Map<string, CachedImageEntry>();
const failedImageCache = new Map<string, FailedImageEntry>();
const inFlightPreloads = new Map<string, Promise<PreloadResult>>();

let idbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Validates whether an image URL returned by the API or stored in a minisite
 * is structurally safe and well-formed before rendering an <img>.
 */
export function validateImageUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'about:blank' ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    (lower.startsWith('data:') && !DATA_IMAGE_REGEX.test(trimmed))
  ) {
    return null;
  }

  if (DATA_IMAGE_REGEX.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) {
      return validateImageUrl(`https:${trimmed}`);
    }
    const matchesAllowedPrefix = ALLOWED_SAME_ORIGIN_PREFIXES.some((prefix) =>
      trimmed.startsWith(prefix)
    );
    if (!matchesAllowedPrefix) {
      return null;
    }
    if (trimmed.startsWith('/api/google/place-photo')) {
      try {
        const parsed = new URL(trimmed, 'http://localhost');
        const placeId = (parsed.searchParams.get('placeId') || '').trim();
        const photoName = (parsed.searchParams.get('name') || '').trim();
        if (!placeId && !photoName) {
          return null;
        }
      } catch {
        return null;
      }
    }
    if (trimmed.startsWith('/uploads/') && trimmed.length <= '/uploads/'.length) {
      return null;
    }
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getCanonicalImageCacheKey(validUrl: string): string {
  if (
    validUrl.startsWith('/api/google/place-photo') ||
    validUrl.includes('/api/google/place-photo?')
  ) {
    try {
      const parsed = new URL(validUrl, 'http://localhost');
      const placeId = (parsed.searchParams.get('placeId') || '').trim();
      const idx = (parsed.searchParams.get('idx') || '0').trim();
      const photoName = (parsed.searchParams.get('name') || '').trim();
      if (placeId) {
        return `gplace:${placeId}:${idx}`;
      }
      if (photoName) {
        return `gname:${photoName}:${idx}`;
      }
    } catch {
      // fallback to raw url key
    }
  }
  return `url:${validUrl}`;
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // ignore SecurityError in restricted iframes
  }
  return null;
}

function getIndexedDbFactory(): IDBFactory | null {
  try {
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB) {
      return globalThis.indexedDB;
    }
  } catch {
    // ignore
  }
  return null;
}

function openImageDb(): Promise<IDBDatabase | null> {
  const factory = getIndexedDbFactory();
  if (!factory) return Promise.resolve(null);
  if (idbPromise) return idbPromise;

  idbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = factory.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          idbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        idbPromise = null;
        resolve(null);
      };
    } catch {
      idbPromise = null;
      resolve(null);
    }
  });

  return idbPromise;
}

function readLocalStorageIndex(storage: Storage): string[] {
  try {
    const raw = storage.getItem(LS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocalStorageIndex(storage: Storage, keys: string[]) {
  try {
    storage.setItem(LS_INDEX_KEY, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

export function readLocalStorageCachedImageSync(cacheKey: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${LS_ITEM_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalStorageImageEntry>;
    if (
      typeof parsed?.dataUrl !== 'string' ||
      !DATA_IMAGE_REGEX.test(parsed.dataUrl) ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    ) {
      storage.removeItem(`${LS_ITEM_PREFIX}${cacheKey}`);
      const nextIdx = readLocalStorageIndex(storage).filter((k) => k !== cacheKey);
      writeLocalStorageIndex(storage, nextIdx);
      return null;
    }
    return parsed.dataUrl;
  } catch {
    return null;
  }
}

function writeLocalStorageCachedImage(cacheKey: string, dataUrl: string, ttlMs: number) {
  const storage = getStorage();
  if (!storage || !DATA_IMAGE_REGEX.test(dataUrl)) return;
  try {
    const entry: LocalStorageImageEntry = {
      dataUrl,
      expiresAt: Date.now() + ttlMs,
      updatedAt: Date.now(),
    };
    const index = readLocalStorageIndex(storage).filter((k) => k !== cacheKey);
    while (index.length >= MAX_LOCALSTORAGE_ENTRIES) {
      const oldest = index.shift();
      if (oldest) {
        storage.removeItem(`${LS_ITEM_PREFIX}${oldest}`);
      }
    }
    index.push(cacheKey);
    storage.setItem(`${LS_ITEM_PREFIX}${cacheKey}`, JSON.stringify(entry));
    writeLocalStorageIndex(storage, index);
  } catch {
    // QuotaExceededError or private mode: evict half and retry once silently
    try {
      const index = readLocalStorageIndex(storage);
      const removeCount = Math.max(1, Math.ceil(index.length / 2));
      const evicted = index.splice(0, removeCount);
      for (const k of evicted) {
        storage.removeItem(`${LS_ITEM_PREFIX}${k}`);
      }
      writeLocalStorageIndex(storage, index);
    } catch {
      // ignore storage quota errors
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (typeof FileReader === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

async function readIndexedDbCachedImage(cacheKey: string): Promise<{ src: string; isBlobUrl: boolean; expiresAt: number } | null> {
  const db = await openImageDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(cacheKey);
      req.onsuccess = async () => {
        const record = req.result as IndexedDbImageRecord | undefined;
        if (!record || typeof record.expiresAt !== 'number' || record.expiresAt <= Date.now()) {
          if (record) {
            try {
              const delTx = db.transaction(IDB_STORE, 'readwrite');
              delTx.objectStore(IDB_STORE).delete(cacheKey);
            } catch {
              // ignore cleanup errors
            }
          }
          resolve(null);
          return;
        }
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && record.blob) {
          const objectUrl = URL.createObjectURL(record.blob);
          resolve({
            src: objectUrl,
            isBlobUrl: true,
            expiresAt: record.expiresAt,
          });
          return;
        }
        if (record.blob) {
          const dataUrl = await blobToDataUrl(record.blob);
          if (dataUrl) {
            resolve({
              src: dataUrl,
              isBlobUrl: false,
              expiresAt: record.expiresAt,
            });
            return;
          }
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIndexedDbCachedImage(cacheKey: string, blob: Blob, ttlMs: number): Promise<void> {
  const db = await openImageDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const record: IndexedDbImageRecord = {
        key: cacheKey,
        blob,
        mimeType: blob.type || 'image/jpeg',
        expiresAt: Date.now() + ttlMs,
        updatedAt: Date.now(),
      };
      store.put(record);

      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_IDB_ENTRIES) {
          const idx = store.index('updatedAt');
          const excess = countReq.result - MAX_IDB_ENTRIES;
          let removed = 0;
          const cursorReq = idx.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor && removed < excess) {
              cursor.delete();
              removed += 1;
              cursor.continue();
            }
          };
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function setResolvedCacheEntry(key: string, entry: CachedImageEntry) {
  if (resolvedImageCache.has(key)) {
    const prev = resolvedImageCache.get(key);
    if (prev && prev.isBlobUrl && prev.src !== entry.src && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(prev.src);
      } catch {
        // ignore revoke failures
      }
    }
    resolvedImageCache.delete(key);
  }
  while (resolvedImageCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = resolvedImageCache.keys().next().value;
    if (!oldestKey) break;
    const evicted = resolvedImageCache.get(oldestKey);
    resolvedImageCache.delete(oldestKey);
    if (evicted?.isBlobUrl && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(evicted.src);
      } catch {
        // ignore
      }
    }
  }
  resolvedImageCache.set(key, entry);
}

export function getCachedImageSync(rawUrl: string | null | undefined): string | null {
  const validUrl = validateImageUrl(rawUrl);
  if (!validUrl) return null;
  if (validUrl.startsWith('data:image/') || validUrl.startsWith('blob:')) {
    return validUrl;
  }
  const key = getCanonicalImageCacheKey(validUrl);
  const cached = resolvedImageCache.get(key);
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      resolvedImageCache.delete(key);
      if (cached.isBlobUrl && typeof URL !== 'undefined') {
        try {
          URL.revokeObjectURL(cached.src);
        } catch {
          // ignore
        }
      }
    } else {
      return cached.src;
    }
  }

  // Synchronous localStorage hit promotes entry immediately into memory for instant frame-0 render
  const lsDataUrl = readLocalStorageCachedImageSync(key);
  if (lsDataUrl) {
    const ttlMs = validUrl.startsWith('/api/google/place-photo')
      ? GOOGLE_PHOTO_CACHE_TTL_MS
      : STATIC_IMAGE_CACHE_TTL_MS;
    setResolvedCacheEntry(key, {
      src: lsDataUrl,
      isBlobUrl: false,
      expiresAt: Date.now() + ttlMs,
    });
    return lsDataUrl;
  }

  return null;
}

function isSameOriginApiMediaUrl(validUrl: string): boolean {
  return (
    validUrl.startsWith('/api/google/place-photo') ||
    validUrl.startsWith('/uploads/') ||
    validUrl.startsWith('/assets/')
  );
}

function decodeImageElement(src: string, referrerPolicy?: ReferrerPolicy): Promise<boolean> {
  if (typeof Image === 'undefined') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const img = new Image();
    if (referrerPolicy) {
      img.referrerPolicy = referrerPolicy;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      finish(true);
    }
  });
}

async function readPersistedStorageBeforeFetch(
  key: string,
  ttlMs: number
): Promise<CachedImageEntry | null> {
  // 1. Check localStorage
  const lsDataUrl = readLocalStorageCachedImageSync(key);
  if (lsDataUrl) {
    const entry: CachedImageEntry = {
      src: lsDataUrl,
      isBlobUrl: false,
      expiresAt: Date.now() + ttlMs,
    };
    setResolvedCacheEntry(key, entry);
    return entry;
  }

  // 2. Check IndexedDB
  const idbEntry = await readIndexedDbCachedImage(key);
  if (idbEntry) {
    const decoded = await decodeImageElement(idbEntry.src);
    if (decoded) {
      const entry: CachedImageEntry = {
        src: idbEntry.src,
        isBlobUrl: idbEntry.isBlobUrl,
        expiresAt: idbEntry.expiresAt,
      };
      setResolvedCacheEntry(key, entry);
      return entry;
    }
    if (idbEntry.isBlobUrl && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(idbEntry.src);
      } catch {
        // ignore
      }
    }
  }

  return null;
}

export async function preloadImage(
  rawUrl: string | null | undefined,
  options?: { forceRefresh?: boolean }
): Promise<PreloadResult> {
  const validUrl = validateImageUrl(rawUrl);
  if (!validUrl) {
    return { ok: false, src: null, reason: 'invalid_url' };
  }

  if (validUrl.startsWith('data:image/') || validUrl.startsWith('blob:')) {
    return { ok: true, src: validUrl, fromCache: true };
  }

  const key = getCanonicalImageCacheKey(validUrl);
  const now = Date.now();
  const ttlMs = validUrl.startsWith('/api/google/place-photo')
    ? GOOGLE_PHOTO_CACHE_TTL_MS
    : STATIC_IMAGE_CACHE_TTL_MS;

  if (!options?.forceRefresh) {
    const existing = getCachedImageSync(validUrl);
    if (existing) {
      return { ok: true, src: existing, fromCache: true };
    }

    const failed = failedImageCache.get(key);
    if (failed && failed.retryAfter > now) {
      return {
        ok: false,
        src: null,
        reason: failed.reason,
        status: failed.status,
      };
    }
    if (failed) {
      failedImageCache.delete(key);
    }
  } else {
    failedImageCache.delete(key);
    resolvedImageCache.delete(key);
  }

  const pending = inFlightPreloads.get(key);
  if (pending) {
    return pending;
  }

  const task = (async (): Promise<PreloadResult> => {
    try {
      // Always inspect localStorage / IndexedDB before firing any network fetch
      if (!options?.forceRefresh) {
        const persisted = await readPersistedStorageBeforeFetch(key, ttlMs);
        if (persisted) {
          return { ok: true, src: persisted.src, fromCache: true };
        }
      }

      if (isSameOriginApiMediaUrl(validUrl) && typeof fetch === 'function') {
        const res = await fetch(validUrl, {
          credentials: 'same-origin',
        });

        if (res.status === 429) {
          const errJson = await res.json().catch(() => ({}));
          if (
            typeof window !== 'undefined' &&
            (errJson?.code === 'GMP_QUOTA_EXCEEDED' || res.status === 429)
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          failedImageCache.set(key, {
            reason: 'quota_exceeded',
            status: 429,
            retryAfter: Date.now() + QUOTA_FAILURE_COOLDOWN_MS,
          });
          return {
            ok: false,
            src: null,
            reason: 'quota_exceeded',
            status: 429,
          };
        }

        if (!res.ok) {
          failedImageCache.set(key, {
            reason: 'http_error',
            status: res.status,
            retryAfter: Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS,
          });
          return {
            ok: false,
            src: null,
            reason: 'http_error',
            status: res.status,
          };
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
          failedImageCache.set(key, {
            reason: 'invalid_content_type',
            status: res.status,
            retryAfter: Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS,
          });
          return {
            ok: false,
            src: null,
            reason: 'invalid_content_type',
            status: res.status,
          };
        }

        const blob = await res.blob();
        if (!blob || blob.size === 0) {
          failedImageCache.set(key, {
            reason: 'empty_body',
            retryAfter: Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS,
          });
          return { ok: false, src: null, reason: 'empty_body' };
        }

        const finalSrc =
          typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(blob)
            : validUrl;
        const isBlobUrl = finalSrc.startsWith('blob:');

        const decoded = await decodeImageElement(finalSrc);
        if (!decoded) {
          if (isBlobUrl && typeof URL !== 'undefined') {
            URL.revokeObjectURL(finalSrc);
          }
          failedImageCache.set(key, {
            reason: 'load_error',
            retryAfter: Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS,
          });
          return { ok: false, src: null, reason: 'load_error' };
        }

        setResolvedCacheEntry(key, {
          src: finalSrc,
          isBlobUrl,
          expiresAt: Date.now() + ttlMs,
        });

        // Persist in IndexedDB (full blobs) and localStorage (compact assets <= 64KB)
        void writeIndexedDbCachedImage(key, blob, ttlMs);
        if (blob.size <= MAX_LOCALSTORAGE_IMAGE_BYTES) {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl) {
            writeLocalStorageCachedImage(key, dataUrl, ttlMs);
          }
        }

        return { ok: true, src: finalSrc, fromCache: false };
      }

      // External https:// or non-same-origin image: preload via browser Image()
      const decoded = await decodeImageElement(validUrl, 'no-referrer');
      if (!decoded) {
        failedImageCache.set(key, {
          reason: 'load_error',
          retryAfter: Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS,
        });
        return { ok: false, src: null, reason: 'load_error' };
      }

      setResolvedCacheEntry(key, {
        src: validUrl,
        isBlobUrl: false,
        expiresAt: Date.now() + ttlMs,
      });
      return { ok: true, src: validUrl, fromCache: false };
    } catch {
      failedImageCache.set(key, {
        reason: 'load_error',
        retryAfter: Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS,
      });
      return { ok: false, src: null, reason: 'load_error' };
    } finally {
      inFlightPreloads.delete(key);
    }
  })();

  inFlightPreloads.set(key, task);
  return task;
}

export async function preloadImageBatch(
  urls: Array<string | null | undefined>,
  concurrency = 3
): Promise<void> {
  const uniqueUrls: string[] = [];
  const seenKeys = new Set<string>();

  for (const raw of urls) {
    const valid = validateImageUrl(raw);
    if (!valid) continue;
    const key = getCanonicalImageCacheKey(valid);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueUrls.push(valid);
  }

  if (uniqueUrls.length === 0) return;

  const limit = Math.max(1, Math.min(6, concurrency));
  let cursor = 0;

  const worker = async () => {
    while (cursor < uniqueUrls.length) {
      const idx = cursor++;
      await preloadImage(uniqueUrls[idx]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, uniqueUrls.length) }, () => worker()));
}

export function clearMemoryImageCacheOnly() {
  for (const entry of resolvedImageCache.values()) {
    if (entry.isBlobUrl && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(entry.src);
      } catch {
        // ignore
      }
    }
  }
  resolvedImageCache.clear();
  failedImageCache.clear();
  inFlightPreloads.clear();
}

export function clearImageCacheForPlace(placeId: string) {
  const prefix = `gplace:${placeId}:`;
  for (const [k, entry] of resolvedImageCache.entries()) {
    if (k.startsWith(prefix)) {
      resolvedImageCache.delete(k);
      if (entry.isBlobUrl && typeof URL !== 'undefined') {
        try {
          URL.revokeObjectURL(entry.src);
        } catch {
          // ignore
        }
      }
    }
  }
  for (const k of failedImageCache.keys()) {
    if (k.startsWith(prefix)) {
      failedImageCache.delete(k);
    }
  }
  const storage = getStorage();
  if (storage) {
    const index = readLocalStorageIndex(storage);
    const kept: string[] = [];
    for (const k of index) {
      if (k.startsWith(prefix)) {
        storage.removeItem(`${LS_ITEM_PREFIX}${k}`);
      } else {
        kept.push(k);
      }
    }
    writeLocalStorageIndex(storage, kept);
  }
  void openImageDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
    } catch {
      // ignore
    }
  });
}

export function clearAllImageCache() {
  clearMemoryImageCacheOnly();
  const storage = getStorage();
  if (storage) {
    const index = readLocalStorageIndex(storage);
    for (const k of index) {
      storage.removeItem(`${LS_ITEM_PREFIX}${k}`);
    }
    storage.removeItem(LS_INDEX_KEY);
  }
  const activeDbPromise = idbPromise;
  idbPromise = null;
  if (activeDbPromise) {
    void activeDbPromise.then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
      } catch {
        // ignore
      }
    });
  } else {
    void openImageDb().then((db) => {
      if (!db) return;
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
      } catch {
        // ignore
      } finally {
        idbPromise = null;
      }
    });
  }
}
