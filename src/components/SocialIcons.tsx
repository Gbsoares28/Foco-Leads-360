import React from 'react';

export type SocialNetworkKey = 'instagram' | 'tiktok' | 'youtube' | 'facebook';

export function InstagramLogo({ className = 'w-4 h-4 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function TikTokLogo({ className = 'w-4 h-4 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
    </svg>
  );
}

export function YouTubeLogo({ className = 'w-4 h-4 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.54 12 3.54 12 3.54s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.19 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.81zM9.75 15.62V8.38L16 12l-6.25 3.62z" />
    </svg>
  );
}

export function FacebookLogo({ className = 'w-4 h-4 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M13.5 22v-8.2h2.75l.41-3.2H13.5V8.56c0-.93.26-1.56 1.59-1.56h1.7V4.14c-.29-.04-1.31-.14-2.49-.14-2.46 0-4.15 1.5-4.15 4.26v2.34H7.35v3.2h2.8V22h3.35z" />
    </svg>
  );
}

export function renderSocialBrandLogo(
  network: SocialNetworkKey | string,
  className = 'w-4 h-4 shrink-0'
) {
  switch (network) {
    case 'instagram':
    case 'botao_instagram':
      return <InstagramLogo className={className} />;
    case 'tiktok':
    case 'botao_tiktok':
      return <TikTokLogo className={className} />;
    case 'youtube':
    case 'botao_youtube':
      return <YouTubeLogo className={className} />;
    case 'facebook':
    case 'botao_facebook':
      return <FacebookLogo className={className} />;
    default:
      return null;
  }
}

export function normalizeSocialUrl(network: SocialNetworkKey, rawValue: string): string {
  const val = rawValue.trim();
  if (!val) return '#';
  if (/^https?:\/\//i.test(val)) return val;
  if (/^(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com)\//i.test(val)) {
    return `https://${val}`;
  }
  const handle = val.replace(/^@+/, '').replace(/^\/+/, '');
  if (!handle) return '#';
  switch (network) {
    case 'instagram':
      return `https://instagram.com/${handle}`;
    case 'tiktok':
      return `https://tiktok.com/@${handle}`;
    case 'youtube':
      return handle.startsWith('channel/') || handle.startsWith('c/')
        ? `https://youtube.com/${handle}`
        : `https://youtube.com/@${handle}`;
    case 'facebook':
      return `https://facebook.com/${handle}`;
  }
}
