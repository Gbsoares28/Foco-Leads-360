import { useCallback, useEffect, useState } from 'react';
import {
  getCachedImageSync,
  preloadImage,
  validateImageUrl,
  type PreloadResult,
} from '../lib/image-cache';

export interface UseImageCacheOptions {
  enabled?: boolean;
  forceRefresh?: boolean;
}

export interface UseImageCacheResult {
  src: string | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  fromCache: boolean;
  errorReason: PreloadResult['reason'] | null;
  retry: () => void;
}

/**
 * Custom hook that resolves and validates minisite images against in-memory cache,
 * localStorage, and IndexedDB before executing any network fetch, enabling instant
 * display of previously loaded photos without flicker or layout shift.
 */
export function useImageCache(
  rawUrl: string | null | undefined,
  options?: UseImageCacheOptions
): UseImageCacheResult {
  const enabled = options?.enabled ?? true;
  const forceRefreshOpt = options?.forceRefresh ?? false;
  const validUrl = validateImageUrl(rawUrl);

  const [retryCount, setRetryCount] = useState(0);

  const syncCached = validUrl && !forceRefreshOpt ? getCachedImageSync(validUrl) : null;

  const [state, setState] = useState<{
    src: string | null;
    status: 'idle' | 'loading' | 'loaded' | 'error';
    fromCache: boolean;
    errorReason: PreloadResult['reason'] | null;
  }>(() => {
    if (!validUrl) {
      return {
        src: null,
        status: 'error',
        fromCache: false,
        errorReason: 'invalid_url',
      };
    }
    if (syncCached) {
      return {
        src: syncCached,
        status: 'loaded',
        fromCache: true,
        errorReason: null,
      };
    }
    return {
      src: null,
      status: enabled ? 'loading' : 'idle',
      fromCache: false,
      errorReason: null,
    };
  });

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!validUrl) {
      setState({
        src: null,
        status: 'error',
        fromCache: false,
        errorReason: 'invalid_url',
      });
      return;
    }

    const shouldForce = forceRefreshOpt || retryCount > 0;
    if (!shouldForce) {
      const immediate = getCachedImageSync(validUrl);
      if (immediate) {
        setState({
          src: immediate,
          status: 'loaded',
          fromCache: true,
          errorReason: null,
        });
        return;
      }
    }

    if (!enabled) {
      setState((prev) =>
        prev.status === 'idle' && prev.src === null
          ? prev
          : {
              src: null,
              status: 'idle',
              fromCache: false,
              errorReason: null,
            }
      );
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      src: prev.src,
      status: 'loading',
      fromCache: false,
      errorReason: null,
    }));

    void preloadImage(validUrl, { forceRefresh: shouldForce }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.src) {
        setState({
          src: res.src,
          status: 'loaded',
          fromCache: Boolean(res.fromCache),
          errorReason: null,
        });
      } else {
        setState({
          src: null,
          status: 'error',
          fromCache: false,
          errorReason: res.reason ?? 'load_error',
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [validUrl, enabled, forceRefreshOpt, retryCount]);

  return {
    ...state,
    retry,
  };
}
