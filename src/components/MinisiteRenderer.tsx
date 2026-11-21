import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Link2,
  MapPin,
  MessageCircle,
  Phone,
  QrCode,
  Send,
  ShoppingBag,
  Star,
  Utensils,
  Wifi,
} from 'lucide-react';
import {
  FONT_STYLE_OPTIONS,
  getRelativeLuminance,
  mixHexColors,
  pickReadableTextColor,
  type GalleryPhotoItem,
  type GoogleReviewItem,
  type MinisiteBlockData,
  type MinisiteTheme,
} from '../lib/minisite-types';
import { groupWeekdayHours } from '../lib/minisite-builder';
import { preloadImageBatch } from '../lib/image-cache';
import { PlaceMap } from './PlaceMap';
import { ResilientImage } from './ResilientImage';
import {
  FacebookLogo,
  InstagramLogo,
  normalizeSocialUrl,
  TikTokLogo,
  YouTubeLogo,
  type SocialNetworkKey,
} from './SocialIcons';

export interface RenderableMinisite {
  id?: number;
  title: string;
  slug: string;
  status?: string;
  templateId?: string;
  theme: MinisiteTheme;
  seo?: {
    title?: string;
    description?: string;
    noIndex?: boolean;
  };
  business: {
    name?: string;
    category?: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    website?: string;
    instagram?: string;
    googleMapsUrl?: string | null;
  };
  blocks: MinisiteBlockData[];
}

function renderLinkIcon(iconName?: string) {
  switch (iconName) {
    case 'instagram':
      return <InstagramLogo className="w-4 h-4 shrink-0" />;
    case 'tiktok':
      return <TikTokLogo className="w-4 h-4 shrink-0" />;
    case 'youtube':
      return <YouTubeLogo className="w-4 h-4 shrink-0" />;
    case 'facebook':
      return <FacebookLogo className="w-4 h-4 shrink-0" />;
    case 'globe':
      return <Globe className="w-4 h-4 shrink-0" />;
    case 'calendar':
      return <Calendar className="w-4 h-4 shrink-0" />;
    case 'shopping_bag':
      return <ShoppingBag className="w-4 h-4 shrink-0" />;
    case 'utensils':
      return <Utensils className="w-4 h-4 shrink-0" />;
    default:
      return <Link2 className="w-4 h-4 shrink-0" />;
  }
}

function getButtonRadiusClass(radius?: string) {
  if (radius === 'md') return 'rounded-lg';
  if (radius === 'xl') return 'rounded-2xl';
  return 'rounded-full';
}

function getResolvedFontStack(fontFamily?: string) {
  if (!fontFamily) return undefined;
  const found = FONT_STYLE_OPTIONS.find(
    (f) => f.id.toLowerCase() === fontFamily.toLowerCase() || f.label.toLowerCase() === fontFamily.toLowerCase()
  );
  return found ? found.cssValue : `'${fontFamily}', sans-serif`;
}

function isDarkHex(hex?: string): boolean {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  return getRelativeLuminance(hex) < 0.35;
}

export function MinisiteRenderer({
  minisite,
  compact = false,
}: {
  minisite: RenderableMinisite;
  compact?: boolean;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formState, setFormState] = useState({ name: '', message: '' });

  const theme: MinisiteTheme = minisite.theme || {};
  const primaryColor = theme.primaryColor || '#C2410C';
  const secondaryColor = theme.secondaryColor || '#FACC15';
  const accentColor = theme.accentColor || '#EC4899';
  const backgroundColor = theme.backgroundColor || '#FAF5ED';
  const surfaceColor = theme.surfaceColor || '#FFFFFF';
  const darkTheme = isDarkHex(backgroundColor) || isDarkHex(surfaceColor);
  const textColor = theme.textColor || (darkTheme ? '#F8FAFC' : '#1E1B18');
  const buttonTextColor = theme.buttonTextColor || pickReadableTextColor(primaryColor);
  const mutedTextColor = darkTheme ? 'rgba(248,250,252,0.72)' : '#64748B';

  const serviceCardBg =
    theme.serviceCardBg && /^#[0-9a-fA-F]{6}$/.test(theme.serviceCardBg)
      ? theme.serviceCardBg
      : mixHexColors(surfaceColor, primaryColor, darkTheme ? 0.16 : 0.14);

  const siteStyle = theme.siteStyle || 'vibrante';
  const isClassicOrShowcase = siteStyle === 'classico' || siteStyle === 'vitrine';
  const inkBorder = darkTheme
    ? siteStyle === 'luxo'
      ? `${primaryColor}55`
      : 'rgba(255,255,255,0.2)'
    : isClassicOrShowcase
      ? 'rgba(15,23,42,0.12)'
      : '#1E1B18';
  const tactileShadow = darkTheme
    ? '0 4px 14px rgba(0,0,0,0.45)'
    : isClassicOrShowcase
      ? '0 2px 10px rgba(15,23,42,0.06)'
      : '3px 3px 0 #1E1B18';

  const cardStyle: React.CSSProperties = {
    backgroundColor: surfaceColor,
    borderColor: inkBorder,
    borderWidth: '1.5px',
    borderStyle: 'solid',
    boxShadow: tactileShadow,
  };

  const getActionButtonStyle = (overrideBg?: string): React.CSSProperties => {
    const bg = overrideBg || primaryColor;
    const fg = overrideBg ? '#FFFFFF' : buttonTextColor;
    if (theme.buttonStyle === 'outline') {
      return {
        backgroundColor: surfaceColor,
        borderColor: overrideBg || primaryColor,
        borderWidth: '1.5px',
        borderStyle: 'solid',
        color: bg,
        boxShadow: tactileShadow,
      };
    }
    if (theme.buttonStyle === 'soft' && !overrideBg) {
      return {
        backgroundColor: mixHexColors(surfaceColor, primaryColor, darkTheme ? 0.25 : 0.16),
        borderColor: mixHexColors(surfaceColor, primaryColor, 0.35),
        borderWidth: '1.5px',
        borderStyle: 'solid',
        color: darkTheme ? '#F8FAFC' : primaryColor,
        boxShadow: 'none',
      };
    }
    if (theme.buttonStyle === 'gradient' && !overrideBg) {
      return {
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        borderColor: inkBorder,
        borderWidth: '1.5px',
        borderStyle: 'solid',
        color: fg,
        boxShadow: tactileShadow,
      };
    }
    return {
      backgroundColor: bg,
      borderColor: inkBorder,
      borderWidth: '1.5px',
      borderStyle: 'solid',
      color: fg,
      boxShadow: tactileShadow,
    };
  };

  const radiusClass = getButtonRadiusClass(theme.buttonRadius);

  const coverBlock = minisite.blocks.find((b) => b.blockType === 'capa');
  const coverImage = theme.coverImage || String(coverBlock?.content?.image || '');
  const coverVideo = theme.coverVideo || '';
  const logoImage = theme.logoImage || '';
  const heroTitle = minisite.title || String(coverBlock?.content?.title || 'Empresa');
  const heroSubtitle = String(
    coverBlock?.content?.subtitle || minisite.business?.category || ''
  );

  useEffect(() => {
    const galleryBlock = minisite.blocks.find((b) => b.blockType === 'galeria' && b.visible);
    const galleryUrls = Array.isArray(galleryBlock?.content?.images)
      ? (galleryBlock.content.images as GalleryPhotoItem[]).map((g) => g.url)
      : [];
    void preloadImageBatch([coverImage, logoImage, ...galleryUrls], 3);
  }, [coverImage, logoImage, minisite.blocks]);

  const whatsappBlock = minisite.blocks.find((b) => b.blockType === 'whatsapp' && b.visible);
  const rawWhatsappDigits = String(
    minisite.business?.whatsapp || whatsappBlock?.content?.phone || minisite.business?.phone || ''
  ).replace(/\D/g, '');
  const whatsappDefaultMessage = String(
    theme.whatsappDefaultMessage ||
      whatsappBlock?.content?.message ||
      `Olá! Vim pelo minisite de ${heroTitle}.`
  );
  const whatsappHref = rawWhatsappDigits
    ? `https://wa.me/${rawWhatsappDigits}?text=${encodeURIComponent(whatsappDefaultMessage)}`
    : null;

  const handleCopy = (id: string, value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const visibleBlocks = minisite.blocks.filter((b) => b.blockType !== 'capa' && b.visible);

  // Group consecutive `produto_servico` blocks into a clean 2-column grid
  type RenderChunk =
    | { kind: 'single'; block: MinisiteBlockData; idx: number }
    | { kind: 'service_grid'; items: Array<{ block: MinisiteBlockData; idx: number }> };

  const chunks: RenderChunk[] = [];
  for (let i = 0; i < visibleBlocks.length; i++) {
    const blk = visibleBlocks[i];
    if (blk.blockType === 'produto_servico') {
      const last = chunks[chunks.length - 1];
      if (last && last.kind === 'service_grid') {
        last.items.push({ block: blk, idx: i });
      } else {
        chunks.push({ kind: 'service_grid', items: [{ block: blk, idx: i }] });
      }
    } else {
      chunks.push({ kind: 'single', block: blk, idx: i });
    }
  }

  const hasHeroMedia = Boolean(coverVideo || coverImage);
  const heroBgColor =
    theme.heroStyle === 'minimal' && !hasHeroMedia ? surfaceColor : primaryColor;
  const heroInkColor = hasHeroMedia
    ? '#FFFFFF'
    : pickReadableTextColor(heroBgColor);
  const heroSubInkColor =
    heroInkColor === '#FFFFFF' ? 'rgba(255,255,255,0.92)' : mutedTextColor;

  return (
    <div
      className="relative flex flex-col min-h-full"
      style={{
        backgroundColor,
        color: textColor,
        fontFamily: getResolvedFontStack(theme.fontFamily),
      }}
    >
      {/* Unified Hero Cover Card with Upper-Left Logo, Name & Description */}
      <div className={compact ? 'p-3 pb-1' : 'p-4 pb-2'}>
        <div
          className={`relative rounded-3xl overflow-hidden border flex flex-col justify-between ${
            hasHeroMedia ? 'min-h-[245px]' : 'min-h-[168px]'
          } ${compact ? 'p-4' : 'p-5'}`}
          style={{
            borderColor: inkBorder,
            backgroundColor: heroBgColor,
            boxShadow: tactileShadow,
          }}
        >
          {coverVideo ? (
            <video
              src={coverVideo}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : coverImage ? (
            <ResilientImage
              src={coverImage}
              alt={heroTitle}
              variant="cover"
              fallbackLabel="Imagem indisponível"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : null}

          {hasHeroMedia && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(180deg, ${primaryColor}9E 0%, ${primaryColor}CC 52%, ${primaryColor}EB 100%)`,
              }}
            />
          )}

          <div className="relative z-10 flex flex-col items-start gap-2.5">
            {theme.showOpenBadge && theme.openBadgeText && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-xs"
                style={{
                  backgroundColor: secondaryColor,
                  color: pickReadableTextColor(secondaryColor),
                }}
              >
                {/aberto/i.test(theme.openBadgeText) ? (
                  <Flame className="w-3 h-3 shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 shrink-0" />
                )}
                <span>{theme.openBadgeText}</span>
              </span>
            )}

            {logoImage && (
              <ResilientImage
                src={logoImage}
                alt={heroTitle}
                variant="avatar"
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl object-cover border-2 border-white shrink-0 bg-white shadow-sm"
                fallback={
                  <div
                    className="w-14 h-14 rounded-xl border-2 border-white shrink-0 flex items-center justify-center text-base font-extrabold shadow-sm"
                    style={{
                      backgroundColor: surfaceColor,
                      color: primaryColor,
                    }}
                  >
                    {heroTitle.slice(0, 2).toUpperCase()}
                  </div>
                }
              />
            )}

            <div className="space-y-1.5 w-full">
              <h1
                className="text-2xl sm:text-[26px] font-extrabold leading-tight tracking-tight"
                style={{ color: heroInkColor }}
              >
                {heroTitle}
              </h1>

              {heroSubtitle && (
                <p
                  className="text-xs sm:text-[13px] leading-relaxed"
                  style={{ color: heroSubInkColor }}
                >
                  {heroSubtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ordered Content Blocks */}
      <div
        className={
          compact
            ? 'px-3 py-3 space-y-3 flex-1 pb-20'
            : 'px-4 py-4 space-y-3.5 flex-1 pb-24'
        }
      >
        {chunks.map((chunk, chunkIdx) => {
          if (chunk.kind === 'service_grid') {
            const isCarousel = theme.servicesLayout === 'carousel';
            return (
              <div
                key={`svc-grid-${chunkIdx}`}
                className={
                  isCarousel
                    ? 'flex gap-3 overflow-x-auto snap-x pb-1.5 pt-0.5'
                    : 'grid grid-cols-2 gap-3 pt-0.5'
                }
              >
                {chunk.items.map(({ block, idx }) => {
                  const c = block.content || {};
                  const key = block.id ?? block.clientKey ?? `svc-${idx}`;
                  const image = String(c.image || '');
                  const price = String(c.price || '');
                  const serviceName = String(c.name || 'Serviço');
                  const initial = serviceName.trim().charAt(0).toUpperCase() || 'S';
                  return (
                    <div
                      key={key}
                      className={`rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 ${
                        isCarousel ? 'w-[195px] shrink-0 snap-start' : ''
                      }`}
                      style={{
                        backgroundColor: serviceCardBg,
                        borderColor: inkBorder,
                        borderWidth: '1.5px',
                        borderStyle: 'solid',
                        boxShadow: tactileShadow,
                      }}
                    >
                      <div className="space-y-2">
                        {image ? (
                          <ResilientImage
                            src={image}
                            alt={serviceName}
                            variant="thumb"
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-xl object-cover border"
                            style={{ borderColor: inkBorder }}
                            fallback={
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold"
                                style={{
                                  backgroundColor: primaryColor,
                                  color: buttonTextColor,
                                }}
                              >
                                {initial}
                              </div>
                            }
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold"
                            style={{
                              backgroundColor: primaryColor,
                              color: buttonTextColor,
                            }}
                          >
                            {initial}
                          </div>
                        )}
                        <div>
                          <div
                            className="text-xs sm:text-[13px] font-extrabold leading-snug"
                            style={{ color: textColor }}
                          >
                            {serviceName}
                          </div>
                          {Boolean(c.description) && (
                            <p
                              className="text-[11px] mt-1 leading-relaxed line-clamp-3"
                              style={{ color: mutedTextColor }}
                            >
                              {String(c.description)}
                            </p>
                          )}
                        </div>
                      </div>
                      {price && (
                        <div
                          className="text-xs font-extrabold tabular-nums"
                          style={{ color: primaryColor }}
                        >
                          {price}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          const { block, idx } = chunk;
          const c = block.content || {};
          const key = block.id ?? block.clientKey ?? `${block.blockType}-${idx}`;

          if (block.blockType === 'botao_link') {
            const url = String(c.url || '#');
            return (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-transform active:translate-y-[1px] ${radiusClass}`}
                style={getActionButtonStyle()}
              >
                {renderLinkIcon(String(c.icon || 'link'))}
                <span>{String(c.label || 'Acessar link')}</span>
              </a>
            );
          }

          if (
            block.blockType === 'botao_instagram' ||
            block.blockType === 'botao_tiktok' ||
            block.blockType === 'botao_youtube' ||
            block.blockType === 'botao_facebook'
          ) {
            const networkMap: Record<
              string,
              { key: SocialNetworkKey; defaultLabel: string; icon: React.ReactNode }
            > = {
              botao_instagram: {
                key: 'instagram',
                defaultLabel: 'Instagram',
                icon: <InstagramLogo className="w-4 h-4 shrink-0" />,
              },
              botao_tiktok: {
                key: 'tiktok',
                defaultLabel: 'TikTok',
                icon: <TikTokLogo className="w-4 h-4 shrink-0" />,
              },
              botao_youtube: {
                key: 'youtube',
                defaultLabel: 'YouTube',
                icon: <YouTubeLogo className="w-4 h-4 shrink-0" />,
              },
              botao_facebook: {
                key: 'facebook',
                defaultLabel: 'Facebook',
                icon: <FacebookLogo className="w-4 h-4 shrink-0" />,
              },
            };
            const meta = networkMap[block.blockType];
            const rawTarget = String(c.url || c.account || '').trim();
            const href = rawTarget ? normalizeSocialUrl(meta.key, rawTarget) : '#';
            const hasHref = href !== '#';
            return (
              <a
                key={key}
                href={href}
                target={hasHref ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-transform active:translate-y-[1px] ${radiusClass}`}
                style={getActionButtonStyle()}
              >
                {meta.icon}
                <span>{String(c.label || meta.defaultLabel)}</span>
              </a>
            );
          }

          if (block.blockType === 'whatsapp') {
            const digits = String(c.phone || rawWhatsappDigits).replace(/\D/g, '');
            const href = digits
              ? `https://wa.me/${digits}?text=${encodeURIComponent(
                  String(c.message || `Olá! Gostaria de falar com ${heroTitle}.`)
                )}`
              : '#';
            return (
              <a
                key={key}
                href={href}
                target={digits ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-transform active:translate-y-[1px] ${radiusClass}`}
                style={getActionButtonStyle('#22C55E')}
              >
                <MessageCircle className="w-4 h-4" />
                <span>{String(c.label || 'WhatsApp')}</span>
              </a>
            );
          }

          if (block.blockType === 'avaliacoes_google') {
            const uri = String(
              c.writeReviewUri || c.reviewsUri || minisite.business?.googleMapsUrl || '#'
            );
            return (
              <a
                key={key}
                href={uri}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-transform active:translate-y-[1px] ${radiusClass}`}
                style={getActionButtonStyle()}
              >
                <Star className="w-4 h-4" />
                <span>{String(c.label || 'Nos avalie no Google')}</span>
              </a>
            );
          }

          if (block.blockType === 'como_chegar') {
            const uri = String(
              c.directionsUri ||
                minisite.business?.googleMapsUrl ||
                (c.address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      String(c.address)
                    )}`
                  : '#')
            );
            return (
              <a
                key={key}
                href={uri}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-transform active:translate-y-[1px] ${radiusClass}`}
                style={getActionButtonStyle()}
              >
                <MapPin className="w-4 h-4" />
                <span>{String(c.label || 'Como chegar')}</span>
              </a>
            );
          }

          if (block.blockType === 'titulo_secao') {
            return (
              <div key={key} className="pt-3 pb-0.5">
                <h2
                  className="text-base sm:text-lg font-extrabold tracking-tight"
                  style={{ color: textColor }}
                >
                  {String(c.title || 'Serviços')}
                </h2>
                {Boolean(c.subtitle) && (
                  <p className="text-xs mt-0.5" style={{ color: mutedTextColor }}>
                    {String(c.subtitle)}
                  </p>
                )}
              </div>
            );
          }

          if (block.blockType === 'servicos') {
            const items = Array.isArray(c.items)
              ? (c.items as Array<{ name: string; description?: string }>)
              : [];
            if (items.length === 0) return null;
            return (
              <div key={key} className="grid grid-cols-2 gap-3">
                {items.map((svc, idxSvc) => {
                  const initial = (svc.name || 'S').trim().charAt(0).toUpperCase();
                  return (
                    <div
                      key={idxSvc}
                      className="rounded-2xl p-3.5 space-y-2"
                      style={{
                        backgroundColor: serviceCardBg,
                        borderColor: inkBorder,
                        borderWidth: '1.5px',
                        borderStyle: 'solid',
                        boxShadow: tactileShadow,
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold"
                        style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                      >
                        {initial}
                      </div>
                      <div className="text-xs font-extrabold" style={{ color: textColor }}>
                        {svc.name}
                      </div>
                      {svc.description && (
                        <div className="text-[11px]" style={{ color: mutedTextColor }}>
                          {svc.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          if (block.blockType === 'texto') {
            const body = String(c.body || '').trim();
            if (!body) return null;
            const customTitle = String(c.title || '').trim();
            return (
              <div key={key} className="py-1.5 space-y-1">
                {customTitle && customTitle.toLowerCase() !== 'sobre nós' && (
                  <div
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: primaryColor }}
                  >
                    {customTitle}
                  </div>
                )}
                <p
                  className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-line"
                  style={{ color: textColor }}
                >
                  {body}
                </p>
              </div>
            );
          }

          if (block.blockType === 'avaliacoes') {
            const rating = typeof c.rating === 'number' ? c.rating : null;
            const userRatingCount = typeof c.userRatingCount === 'number' ? c.userRatingCount : null;
            const reviewsUri = String(
              c.reviewsUri || minisite.business?.googleMapsUrl || ''
            );
            const writeReviewUri = String(c.writeReviewUri || '');
            const reviews = Array.isArray(c.reviews) ? (c.reviews as GoogleReviewItem[]) : [];

            return (
              <div key={key} className="pt-2 space-y-2.5">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3
                      className="text-base sm:text-lg font-extrabold tracking-tight"
                      style={{ color: textColor }}
                    >
                      {String(c.title || 'Quem conhece recomenda')}
                    </h3>
                    {rating != null && (
                      <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-xs">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="font-bold tabular-nums">{rating.toFixed(1)}</span>
                        <span style={{ color: mutedTextColor }}>
                          ({userRatingCount ?? 0} avaliações · Fonte: Google)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {reviewsUri && (
                      <a
                        href={reviewsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold inline-flex items-center gap-1 hover:underline"
                        style={{ color: primaryColor }}
                      >
                        <span>Ver no Google</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {reviews.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto snap-x pb-2 -mx-1 px-1">
                    {reviews.slice(0, 5).map((rev, rIdx) => {
                      const authorInitial = (rev.authorName || 'C').trim().charAt(0).toUpperCase();
                      const starCount = Math.max(1, Math.min(5, Math.round(rev.rating || 5)));
                      return (
                        <div
                          key={rIdx}
                          className="min-w-[240px] max-w-[270px] shrink-0 snap-start rounded-2xl p-4 flex flex-col justify-between gap-3"
                          style={cardStyle}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: starCount }).map((_, sIdx) => (
                                  <Star
                                    key={sIdx}
                                    className="w-3.5 h-3.5 text-amber-500 fill-amber-500"
                                  />
                                ))}
                              </div>
                              {rev.relativeTime && (
                                <span
                                  className="text-[10px] truncate"
                                  style={{ color: mutedTextColor }}
                                >
                                  {rev.relativeTime}
                                </span>
                              )}
                            </div>
                            {rev.text ? (
                              <p
                                className="text-xs leading-relaxed line-clamp-4"
                                style={{ color: textColor }}
                              >
                                “{rev.text}”
                              </p>
                            ) : (
                              <p className="text-[11px] italic" style={{ color: mutedTextColor }}>
                                Avaliação com {starCount} estrelas no Google Maps.
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-2 min-w-0">
                              {rev.authorPhotoUri ? (
                                <ResilientImage
                                  src={rev.authorPhotoUri}
                                  alt={rev.authorName}
                                  variant="avatar"
                                  referrerPolicy="no-referrer"
                                  className="w-6 h-6 rounded-full object-cover shrink-0 border"
                                  style={{ borderColor: inkBorder }}
                                  fallback={
                                    <span
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                                      style={{
                                        backgroundColor: primaryColor,
                                        color: buttonTextColor,
                                      }}
                                    >
                                      {authorInitial}
                                    </span>
                                  }
                                />
                              ) : (
                                <span
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                                  style={{
                                    backgroundColor: primaryColor,
                                    color: buttonTextColor,
                                  }}
                                >
                                  {authorInitial}
                                </span>
                              )}
                              {rev.authorUri ? (
                                <a
                                  href={rev.authorUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold truncate hover:underline"
                                  style={{ color: textColor }}
                                >
                                  {rev.authorName}
                                </a>
                              ) : (
                                <span
                                  className="text-xs font-bold truncate"
                                  style={{ color: textColor }}
                                >
                                  {rev.authorName}
                                </span>
                              )}
                            </div>
                            {(rev.reviewUri || reviewsUri) && (
                              <a
                                href={rev.reviewUri || reviewsUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir avaliação original no Google"
                                className="text-[10px] font-semibold shrink-0 hover:underline"
                                style={{ color: primaryColor }}
                              >
                                Google
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl p-3.5 text-xs flex items-center justify-between gap-2" style={cardStyle}>
                    <span style={{ color: mutedTextColor }}>
                      Confira os comentários e avaliações completos diretamente no Google.
                    </span>
                    {(writeReviewUri || reviewsUri) && (
                      <a
                        href={reviewsUri || writeReviewUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold shrink-0 hover:underline"
                        style={{ color: primaryColor }}
                      >
                        Abrir ficha
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          }

          if (block.blockType === 'galeria') {
            const images = Array.isArray(c.images) ? (c.images as GalleryPhotoItem[]) : [];
            if (images.length === 0) return null;
            return (
              <div key={key} className="space-y-1.5 pt-1">
                <div className="flex gap-2.5 overflow-x-auto snap-x pb-1">
                  {images.map((img, gIdx) => (
                    <div key={gIdx} className="w-[205px] sm:w-[230px] shrink-0 snap-start flex flex-col gap-1.5">
                      <div
                        className="w-full aspect-[16/10] rounded-2xl overflow-hidden border"
                        style={{ borderColor: inkBorder }}
                      >
                        <ResilientImage
                          src={img.url}
                          alt={img.caption || `${heroTitle} foto ${gIdx + 1}`}
                          variant="gallery"
                          fallbackLabel="Imagem indisponível"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (block.blockType === 'horarios') {
            const weekdays = Array.isArray(c.weekdayDescriptions)
              ? (c.weekdayDescriptions as string[])
              : [];
            if (weekdays.length === 0) return null;
            const groupedRows = groupWeekdayHours(weekdays, new Date().getDay());
            return (
              <div key={key} className="rounded-2xl p-4 space-y-2.5" style={cardStyle}>
                <div
                  className="flex items-center gap-2 text-sm font-extrabold"
                  style={{ color: textColor }}
                >
                  <Clock className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                  <span>{String(c.title || 'Horário de funcionamento')}</span>
                </div>
                <ul className="space-y-2 text-xs">
                  {groupedRows.map((row, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 pb-1.5 border-b last:border-b-0 last:pb-0"
                      style={{ borderColor: darkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)' }}
                    >
                      <span
                        className={row.isToday ? 'font-bold' : 'font-medium'}
                        style={{ color: textColor }}
                      >
                        {row.label}
                      </span>
                      {row.hours && (
                        <span
                          className="font-bold tabular-nums shrink-0"
                          style={{ color: row.isClosed ? mutedTextColor : primaryColor }}
                        >
                          {row.hours}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          if (block.blockType === 'endereco_mapa' || block.blockType === 'endereco') {
            const address = String(c.address || minisite.business?.address || '');
            const phone = String(c.phone || minisite.business?.phone || '');
            const website = String(c.website || minisite.business?.website || '');
            const directionsUri = String(
              c.directionsUri || c.mapsUrl || minisite.business?.googleMapsUrl || ''
            );
            const loc = c.location as { lat?: number; lng?: number } | null | undefined;
            const showMap =
              c.showMap !== false && typeof loc?.lat === 'number' && typeof loc?.lng === 'number';

            return (
              <div key={key} className="rounded-2xl overflow-hidden" style={cardStyle}>
                {showMap && loc && (
                  <PlaceMap
                    lat={loc.lat!}
                    lng={loc.lng!}
                    businessName={heroTitle}
                    address={address}
                    directionsUri={directionsUri}
                    primaryColor={primaryColor}
                    heightClass={compact ? 'h-40' : 'h-48'}
                    flush
                  />
                )}

                <div className="p-4 space-y-2">
                  {address && (
                    <div className="flex items-start gap-2 text-xs leading-relaxed">
                      <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: primaryColor }} />
                      <span className="font-medium" style={{ color: textColor }}>
                        {address}
                      </span>
                    </div>
                  )}

                  {phone && (
                    <a
                      href={`tel:${phone.replace(/\D/g, '')}`}
                      className="flex items-center gap-2 text-xs font-mono tabular-nums hover:underline"
                      style={{ color: mutedTextColor }}
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: primaryColor }} />
                      <span>{phone}</span>
                    </a>
                  )}

                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs hover:underline truncate"
                      style={{ color: primaryColor }}
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{website}</span>
                    </a>
                  )}
                </div>
              </div>
            );
          }

          if (block.blockType === 'redes_sociais') {
            const instagram = String(c.instagram || '');
            const facebook = String(c.facebook || '');
            const youtube = String(c.youtube || '');
            const tiktok = String(c.tiktok || '');
            const website = String(c.website || '');

            const links = [
              instagram && {
                label: 'Instagram',
                href: normalizeSocialUrl('instagram', instagram),
                icon: <InstagramLogo className="w-4 h-4" />,
              },
              facebook && {
                label: 'Facebook',
                href: normalizeSocialUrl('facebook', facebook),
                icon: <FacebookLogo className="w-4 h-4" />,
              },
              youtube && {
                label: 'YouTube',
                href: normalizeSocialUrl('youtube', youtube),
                icon: <YouTubeLogo className="w-4 h-4" />,
              },
              tiktok && {
                label: 'TikTok',
                href: normalizeSocialUrl('tiktok', tiktok),
                icon: <TikTokLogo className="w-4 h-4" />,
              },
              website && {
                label: 'Site',
                href: website.startsWith('http') ? website : `https://${website}`,
                icon: <Globe className="w-4 h-4" />,
              },
            ].filter(Boolean) as Array<{ label: string; href: string; icon: React.ReactNode }>;

            if (links.length === 0) return null;

            return (
              <div key={key} className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                {links.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.label}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                    style={{
                      backgroundColor: serviceCardBg,
                      color: primaryColor,
                    }}
                  >
                    {item.icon}
                  </a>
                ))}
              </div>
            );
          }

          if (block.blockType === 'pix') {
            const pixKey = String(c.pixKey || '');
            return (
              <div key={key} className="rounded-2xl p-4 space-y-2" style={cardStyle}>
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: textColor }}>
                  <QrCode className="w-4 h-4" style={{ color: primaryColor }} />
                  <span>{String(c.title || 'Pagamento via Pix')}</span>
                </div>
                {Boolean(c.beneficiary) && (
                  <div className="text-xs" style={{ color: mutedTextColor }}>
                    Beneficiário: {String(c.beneficiary)}
                  </div>
                )}
                {pixKey && (
                  <div
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs font-mono"
                    style={{ borderColor: inkBorder }}
                  >
                    <span className="truncate">{pixKey}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`pix-${key}`, pixKey)}
                      className="inline-flex items-center gap-1 font-sans font-semibold shrink-0 cursor-pointer"
                      style={{ color: primaryColor }}
                    >
                      {copiedKey === `pix-${key}` ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                {Boolean(c.note) && (
                  <p className="text-[11px]" style={{ color: mutedTextColor }}>
                    {String(c.note)}
                  </p>
                )}
              </div>
            );
          }

          if (block.blockType === 'wifi') {
            const network = String(c.networkName || '');
            const password = String(c.password || '');
            return (
              <div key={key} className="rounded-2xl p-4 space-y-2" style={cardStyle}>
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: textColor }}>
                  <Wifi className="w-4 h-4" style={{ color: primaryColor }} />
                  <span>{String(c.title || 'Wi-Fi para clientes')}</span>
                </div>
                <div className="text-xs space-y-1">
                  <div>
                    <span style={{ color: mutedTextColor }}>Rede: </span>
                    <span className="font-semibold">{network || 'Não informada'}</span>
                  </div>
                  {password && (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span style={{ color: mutedTextColor }}>Senha: </span>
                        <span className="font-mono font-semibold">{password}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(`wifi-${key}`, password)}
                        className="text-xs font-semibold cursor-pointer"
                        style={{ color: primaryColor }}
                      >
                        {copiedKey === `wifi-${key}` ? 'Copiada' : 'Copiar'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (block.blockType === 'formulario') {
            const targetPhone = String(c.destinationWhatsapp || rawWhatsappDigits).replace(/\D/g, '');
            const waMsg = `Olá! Meu nome é ${formState.name || 'Cliente'}. ${formState.message}`;
            const waUrl = targetPhone
              ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(waMsg)}`
              : '#';
            return (
              <div key={key} className="rounded-2xl p-4 space-y-2.5" style={cardStyle}>
                <div className="text-sm font-bold" style={{ color: textColor }}>
                  {String(c.title || 'Solicitar orçamento')}
                </div>
                {Boolean(c.subtitle) && (
                  <p className="text-xs" style={{ color: mutedTextColor }}>
                    {String(c.subtitle)}
                  </p>
                )}
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Seu nome"
                  className="w-full px-3 py-2 rounded-xl border text-xs bg-transparent"
                  style={{ borderColor: inkBorder, color: textColor }}
                />
                <textarea
                  rows={2}
                  value={formState.message}
                  onChange={(e) => setFormState((s) => ({ ...s, message: e.target.value }))}
                  placeholder="Como podemos ajudar?"
                  className="w-full px-3 py-2 rounded-xl border text-xs bg-transparent"
                  style={{ borderColor: inkBorder, color: textColor }}
                />
                <a
                  href={waUrl}
                  target={targetPhone ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className={`w-full py-2.5 px-4 text-xs font-bold inline-flex items-center justify-center gap-1.5 ${radiusClass}`}
                  style={getActionButtonStyle()}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{String(c.buttonLabel || 'Enviar no WhatsApp')}</span>
                </a>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Footer Attribution */}
      <div
        className="px-4 py-3 text-center text-[11px]"
        style={{ color: mutedTextColor }}
      >
        <a
          href="https://www.instagram.com/feedemfoco360/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline transition-opacity hover:opacity-80"
        >
          @feedemfoco360 - Desenvolvido e criado
        </a>
      </div>

      {/* Floating WhatsApp CTA */}
      {theme.fixedWhatsappButton && whatsappHref && (
        <div className="sticky bottom-3 px-4 pb-2 z-20 pointer-events-none">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`pointer-events-auto w-full py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 ${radiusClass}`}
            style={getActionButtonStyle('#16A34A')}
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp</span>
          </a>
        </div>
      )}
    </div>
  );
}
