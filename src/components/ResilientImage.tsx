import React, { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import {
  DEFAULT_FALLBACK_IMAGE_URI,
  getCachedImageSync,
  validateImageUrl,
} from '../lib/image-cache';
import { useImageCache } from '../hooks/useImageCache';

export interface ResilientImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  skeletonClassName?: string;
  fallback?: React.ReactNode;
  fallbackLabel?: string;
  variant?: 'cover' | 'gallery' | 'avatar' | 'thumb';
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  loading?: 'eager' | 'lazy';
  onLoadSuccess?: (resolvedSrc: string) => void;
  onLoadError?: () => void;
}

export function ResilientImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  style,
  skeletonClassName = '',
  fallback,
  fallbackLabel,
  variant = 'gallery',
  referrerPolicy = 'no-referrer',
  loading = 'eager',
  onLoadSuccess,
  onLoadError,
}: ResilientImageProps) {
  const validUrl = validateImageUrl(src);

  // SSR / static render path (keeps renderToStaticMarkup clean and deterministic)
  if (typeof window === 'undefined') {
    if (!validUrl) {
      if (fallback) return <>{fallback}</>;
      return (
        <img
          src={DEFAULT_FALLBACK_IMAGE_URI}
          alt={fallbackLabel || alt || 'Imagem padrão'}
          className={className}
          style={style}
        />
      );
    }
    return (
      <img
        src={validUrl}
        alt={alt}
        referrerPolicy={referrerPolicy}
        className={className}
        style={style}
      />
    );
  }

  return (
    <ClientResilientImage
      validUrl={validUrl}
      alt={alt}
      className={className}
      style={style}
      skeletonClassName={skeletonClassName}
      fallback={fallback}
      fallbackLabel={fallbackLabel}
      variant={variant}
      referrerPolicy={referrerPolicy}
      loading={loading}
      onLoadSuccess={onLoadSuccess}
      onLoadError={onLoadError}
    />
  );
}

function ClientResilientImage({
  validUrl,
  alt,
  className,
  style,
  skeletonClassName,
  fallback,
  fallbackLabel,
  variant,
  referrerPolicy,
  loading,
  onLoadSuccess,
  onLoadError,
}: {
  validUrl: string | null;
  alt: string;
  className: string;
  style?: React.CSSProperties;
  skeletonClassName: string;
  fallback?: React.ReactNode;
  fallbackLabel?: string;
  variant: 'cover' | 'gallery' | 'avatar' | 'thumb';
  referrerPolicy: React.HTMLAttributeReferrerPolicy;
  loading: 'eager' | 'lazy';
  onLoadSuccess?: (resolvedSrc: string) => void;
  onLoadError?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldStartLoading, setShouldStartLoading] = useState<boolean>(
    () => loading !== 'lazy' || Boolean(validUrl && getCachedImageSync(validUrl))
  );
  const [runtimeFailed, setRuntimeFailed] = useState(false);

  useEffect(() => {
    setRuntimeFailed(false);
  }, [validUrl]);

  useEffect(() => {
    if (loading !== 'lazy' || shouldStartLoading) return;
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldStartLoading(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldStartLoading(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, shouldStartLoading]);

  const { src: resolvedSrc, status } = useImageCache(validUrl, {
    enabled: shouldStartLoading,
  });

  const onLoadSuccessRef = useRef(onLoadSuccess);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadSuccessRef.current = onLoadSuccess;
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    if (status === 'loaded' && resolvedSrc) {
      onLoadSuccessRef.current?.(resolvedSrc);
    } else if (status === 'error') {
      onLoadErrorRef.current?.();
    }
  }, [status, resolvedSrc]);

  if (status === 'error' || runtimeFailed) {
    if (fallback) {
      return <>{fallback}</>;
    }
    const isCompact = variant === 'avatar' || variant === 'thumb';
    if (isCompact) {
      return (
        <div
          className={`${className} bg-slate-100 flex items-center justify-center text-slate-400 select-none overflow-hidden`}
          style={style}
          role="img"
          aria-label={fallbackLabel || alt || 'Imagem indisponível'}
        >
          <ImageOff className="w-4 h-4 shrink-0" />
        </div>
      );
    }

    return (
      <div
        className={`relative overflow-hidden bg-slate-100 flex flex-col items-center justify-center text-center select-none ${className}`}
        style={style}
        role="img"
        aria-label={fallbackLabel || alt || 'Imagem indisponível'}
      >
        <img
          src={DEFAULT_FALLBACK_IMAGE_URI}
          alt={fallbackLabel || alt || 'Imagem padrão'}
          className="w-full h-full object-cover opacity-80"
        />
        {fallbackLabel && (
          <span className="absolute bottom-2 px-2 py-0.5 rounded bg-white/90 text-[10px] font-medium text-slate-500 shadow-xs">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  if (status === 'idle' || status === 'loading' || !resolvedSrc) {
    return (
      <div
        ref={hostRef}
        className={`${className} animate-pulse bg-slate-200/80 flex items-center justify-center overflow-hidden ${skeletonClassName}`}
        style={style}
        aria-busy="true"
        aria-label={`Carregando ${alt || 'imagem'}`}
      >
        <div className="w-6 h-6 rounded-md bg-slate-300/70" />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy={referrerPolicy}
      className={className}
      style={style}
      onError={() => {
        setRuntimeFailed(true);
        onLoadError?.();
      }}
    />
  );
}
