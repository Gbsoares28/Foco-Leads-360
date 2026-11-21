import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  clearAllImageCache,
  clearImageCacheForPlace,
  clearMemoryImageCacheOnly,
  DEFAULT_FALLBACK_IMAGE_URI,
  getCachedImageSync,
  getCanonicalImageCacheKey,
  preloadImage,
  readLocalStorageCachedImageSync,
  validateImageUrl,
} from '../src/lib/image-cache.ts';
import { useImageCache } from '../src/hooks/useImageCache.ts';
import { ResilientImage } from '../src/components/ResilientImage.tsx';

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

function createMemoryIndexedDb(): { factory: IDBFactory; storeMap: Map<string, any> } {
  const storeMap = new Map<string, any>();

  const makeReq = <T>(executor: (req: any) => void) => {
    const req: any = {
      result: undefined as T | undefined,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => executor(req));
    return req;
  };

  const makeObjectStore = (pendingOps: Promise<void>[]) => {
    const objectStore: any = {
      keyPath: 'key',
      createIndex() {
        return {};
      },
      get(key: string) {
        return makeReq((req) => {
          req.result = storeMap.get(key);
          req.onsuccess?.({ target: req });
        });
      },
      put(record: any) {
        const p = Promise.resolve().then(() => {
          storeMap.set(record.key, record);
        });
        pendingOps.push(p);
        return makeReq((req) => {
          req.result = record.key;
          req.onsuccess?.({ target: req });
        });
      },
      delete(key: string) {
        const p = Promise.resolve().then(() => {
          storeMap.delete(key);
        });
        pendingOps.push(p);
        return makeReq((req) => {
          req.result = undefined;
          req.onsuccess?.({ target: req });
        });
      },
      clear() {
        const p = Promise.resolve().then(() => {
          storeMap.clear();
        });
        pendingOps.push(p);
        return makeReq((req) => {
          req.onsuccess?.({ target: req });
        });
      },
      count() {
        return makeReq((req) => {
          req.result = storeMap.size;
          req.onsuccess?.({ target: req });
        });
      },
      index() {
        return {
          openCursor() {
            const keys = Array.from(storeMap.keys());
            let idx = 0;
            const req: any = { result: null, onsuccess: null, onerror: null };
            const advance = () => {
              queueMicrotask(() => {
                if (idx >= keys.length) {
                  req.result = null;
                  req.onsuccess?.({ target: req });
                  return;
                }
                const currentKey = keys[idx++];
                req.result = {
                  key: currentKey,
                  value: storeMap.get(currentKey),
                  delete() {
                    storeMap.delete(currentKey);
                  },
                  continue() {
                    advance();
                  },
                };
                req.onsuccess?.({ target: req });
              });
            };
            advance();
            return req;
          },
        };
      },
      openCursor() {
        return this.index().openCursor();
      },
    };
    return objectStore;
  };

  const db: any = {
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore() {
      return makeObjectStore([]);
    },
    close() {},
    transaction() {
      const pendingOps: Promise<void>[] = [];
      const tx: any = {
        oncomplete: null,
        onerror: null,
        objectStore() {
          return makeObjectStore(pendingOps);
        },
      };
      queueMicrotask(async () => {
        await Promise.all(pendingOps);
        tx.oncomplete?.();
      });
      return tx;
    },
  };

  const factory: any = {
    open() {
      const req: any = {
        result: db,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };

  return { factory: factory as IDBFactory, storeMap };
}

test('validateImageUrl accepts valid API/upload/HTTPS/data URLs and blocks invalid or unsafe URLs', () => {
  assert.equal(
    validateImageUrl('/api/google/place-photo?placeId=ChIJ123&idx=0&w=960'),
    '/api/google/place-photo?placeId=ChIJ123&idx=0&w=960'
  );
  assert.equal(validateImageUrl('/uploads/logo-123.png'), '/uploads/logo-123.png');
  assert.equal(validateImageUrl('https://cdn.example.com/foto.jpg'), 'https://cdn.example.com/foto.jpg');
  assert.equal(
    validateImageUrl('data:image/png;base64,iVBORw0KGgo='),
    'data:image/png;base64,iVBORw0KGgo='
  );

  // Blocked / invalid URLs
  assert.equal(validateImageUrl(''), null);
  assert.equal(validateImageUrl('   '), null);
  assert.equal(validateImageUrl(null), null);
  assert.equal(validateImageUrl(undefined), null);
  assert.equal(validateImageUrl('undefined'), null);
  assert.equal(validateImageUrl('javascript:alert(1)'), null);
  assert.equal(validateImageUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(validateImageUrl('/api/google/place-photo?w=960'), null);
  assert.equal(validateImageUrl('/uploads/'), null);
  assert.equal(validateImageUrl('not-a-valid-url'), null);
});

test('getCanonicalImageCacheKey shares cache across width variants of the same Google place photo', () => {
  const k240 = getCanonicalImageCacheKey('/api/google/place-photo?placeId=P1&idx=2&w=240');
  const k640 = getCanonicalImageCacheKey('/api/google/place-photo?placeId=P1&idx=2&w=640');
  const k960 = getCanonicalImageCacheKey('/api/google/place-photo?placeId=P1&idx=2&w=960');
  const k1080 = getCanonicalImageCacheKey('/api/google/place-photo?placeId=P1&idx=2&w=1080');
  assert.equal(k240, 'gplace:P1:2');
  assert.equal(k640, k240);
  assert.equal(k960, k240);
  assert.equal(k1080, k240);
});

test('preloadImage coalesces concurrent requests, caches valid responses, and blocks non-image/error payloads', async () => {
  clearAllImageCache();
  const originalFetch = globalThis.fetch;

  let fetchCalls = 0;
  try {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      return new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const url1 = '/api/google/place-photo?placeId=PlaceCoalesce&idx=0&w=240';
    const url2 = '/api/google/place-photo?placeId=PlaceCoalesce&idx=0&w=960';

    const [r1, r2] = await Promise.all([preloadImage(url1), preloadImage(url2)]);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(fetchCalls, 1, 'Expected concurrent loads across widths to coalesce into 1 fetch');
    assert.ok(getCachedImageSync(url2));

    // Subsequent call hits cache with 0 additional fetches
    const r3 = await preloadImage(url2);
    assert.equal(r3.ok, true);
    assert.equal(r3.fromCache, true);
    assert.equal(fetchCalls, 1);

    // Non-image content type (e.g. accidental HTML/JSON) fails safely
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'broken' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const badCt = await preloadImage('/uploads/corrupted.jpg');
    assert.equal(badCt.ok, false);
    assert.equal(badCt.reason, 'invalid_content_type');

    // HTTP 429 quota exceeded fails cleanly
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'quota', code: 'GMP_QUOTA_EXCEEDED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const quotaRes = await preloadImage('/api/google/place-photo?placeId=QuotaPlace&idx=0&w=960');
    assert.equal(quotaRes.ok, false);
    assert.equal(quotaRes.reason, 'quota_exceeded');
    assert.equal(quotaRes.status, 429);
  } finally {
    globalThis.fetch = originalFetch;
    clearAllImageCache();
  }
});

test('localStorage hit resolves synchronously and skips fetch, while expired entries are purged and refetched', async () => {
  clearAllImageCache();
  const originalLocalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;

  const ls = createMemoryLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls,
    configurable: true,
    writable: true,
  });

  let fetchCalls = 0;
  try {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    ls.setItem(
      'foco_img_cache_v1:gplace:LS1:0',
      JSON.stringify({
        dataUrl: sampleDataUrl,
        expiresAt: Date.now() + 60_000,
        updatedAt: Date.now(),
      })
    );
    ls.setItem('foco_img_cache_index_v1', JSON.stringify(['gplace:LS1:0']));

    globalThis.fetch = (async () => {
      fetchCalls += 1;
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      return new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    // Synchronous frame-0 check hits localStorage immediately
    const syncSrc = getCachedImageSync('/api/google/place-photo?placeId=LS1&idx=0&w=240');
    assert.equal(syncSrc, sampleDataUrl);

    // Clear RAM only -> preloadImage checks localStorage BEFORE fetch
    clearMemoryImageCacheOnly();
    const preloadRes = await preloadImage('/api/google/place-photo?placeId=LS1&idx=0&w=960');
    assert.equal(preloadRes.ok, true);
    assert.equal(preloadRes.fromCache, true);
    assert.equal(preloadRes.src, sampleDataUrl);
    assert.equal(fetchCalls, 0, 'Expected 0 fetch calls when image exists in localStorage');

    // Expired localStorage entry must be evicted and trigger fetch
    clearMemoryImageCacheOnly();
    ls.setItem(
      'foco_img_cache_v1:gplace:LSExpired:0',
      JSON.stringify({
        dataUrl: sampleDataUrl,
        expiresAt: Date.now() - 1_000,
        updatedAt: Date.now() - 10_000,
      })
    );
    ls.setItem('foco_img_cache_index_v1', JSON.stringify(['gplace:LS1:0', 'gplace:LSExpired:0']));

    assert.equal(readLocalStorageCachedImageSync('gplace:LSExpired:0'), null);
    assert.equal(ls.getItem('foco_img_cache_v1:gplace:LSExpired:0'), null);

    const refetched = await preloadImage('/api/google/place-photo?placeId=LSExpired&idx=0&w=960');
    assert.equal(refetched.ok, true);
    assert.equal(refetched.fromCache, false);
    assert.equal(fetchCalls, 1);

    // Place-specific invalidation clears localStorage entries for that placeId
    clearImageCacheForPlace('LS1');
    assert.equal(ls.getItem('foco_img_cache_v1:gplace:LS1:0'), null);
  } finally {
    clearAllImageCache();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  }
});

test('IndexedDB hit resolves without fetch after RAM cache is cleared', async () => {
  clearAllImageCache();
  const originalIndexedDb = globalThis.indexedDB;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  const { factory, storeMap } = createMemoryIndexedDb();
  Object.defineProperty(globalThis, 'indexedDB', {
    value: factory,
    configurable: true,
    writable: true,
  });

  let blobCounter = 0;
  URL.createObjectURL = () => `blob:mock-image-${++blobCounter}`;
  URL.revokeObjectURL = () => {};

  let fetchCalls = 0;
  try {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      return new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }) as typeof fetch;

    const url = '/api/google/place-photo?placeId=IDBPlace&idx=3&w=960';
    const first = await preloadImage(url);
    assert.equal(first.ok, true);
    assert.equal(first.fromCache, false);
    assert.equal(fetchCalls, 1);

    // Allow microtask async IDB write to complete
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(storeMap.has('gplace:IDBPlace:3'), true);

    // Wipe RAM cache completely; next preloadImage must read from IndexedDB with 0 fetches
    clearMemoryImageCacheOnly();
    const second = await preloadImage('/api/google/place-photo?placeId=IDBPlace&idx=3&w=240');
    assert.equal(second.ok, true);
    assert.equal(second.fromCache, true);
    assert.match(second.src || '', /^blob:mock-image-/);
    assert.equal(fetchCalls, 1, 'Expected 0 additional fetch calls on IndexedDB hit');
  } finally {
    clearAllImageCache();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDb,
      configurable: true,
      writable: true,
    });
  }
});

test('useImageCache hook is exported and ResilientImage handles invalid and valid URLs cleanly', () => {
  assert.equal(typeof useImageCache, 'function');

  const invalidHtml = renderToStaticMarkup(
    React.createElement(ResilientImage, {
      src: 'javascript:alert(1)',
      alt: 'Foto quebrada',
      className: 'w-20 h-14 rounded-lg object-cover',
    })
  );
  assert.ok(invalidHtml.includes(DEFAULT_FALLBACK_IMAGE_URI.slice(0, 40)));
  assert.doesNotMatch(invalidHtml, /javascript:alert/);

  const customFallbackHtml = renderToStaticMarkup(
    React.createElement(ResilientImage, {
      src: '',
      alt: 'Logo vazia',
      fallback: React.createElement('div', { className: 'badge-fallback' }, 'NP'),
    })
  );
  assert.match(customFallbackHtml, /class="badge-fallback">NP<\/div>/);

  const validHtml = renderToStaticMarkup(
    React.createElement(ResilientImage, {
      src: '/api/google/place-photo?placeId=P1&idx=0&w=960',
      alt: 'Foto válida',
      className: 'w-14 h-14 rounded-xl object-cover',
    })
  );
  assert.match(validHtml, /src="\/api\/google\/place-photo\?placeId=P1&amp;idx=0&amp;w=960"/);
  assert.match(validHtml, /class="w-14 h-14 rounded-xl object-cover"/);
});
