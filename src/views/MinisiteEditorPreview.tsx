import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  ImagePlus,
  Layers,
  Palette,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useAuth } from '../contexts/AuthContext';
import { StatusIndicator } from '../components/StatusIndicator';
import { MinisiteRenderer, type RenderableMinisite } from '../components/MinisiteRenderer';
import { ResilientImage } from '../components/ResilientImage';
import { clearImageCacheForPlace, preloadImageBatch } from '../lib/image-cache';
import {
  FacebookLogo,
  InstagramLogo,
  renderSocialBrandLogo,
  TikTokLogo,
  YouTubeLogo,
} from '../components/SocialIcons';
import {
  BLOCK_CATALOG,
  CURATED_PALETTES,
  enforceThemePaletteContrast,
  FONT_STYLE_OPTIONS,
  getBlockLabel,
  getBlockSummary,
  SEGMENT_THEMES,
  SITE_STYLE_PRESETS,
  TEMPLATE_OPTIONS,
  type GalleryPhotoItem,
  googleReviewKey,
  visibleGoogleReviews,
  type GoogleReviewItem,
  type MinisiteBlockData,
  type MinisiteBlockType,
  type MinisiteSeo,
  type MinisiteTheme,
} from '../lib/minisite-types';
import {
  buildChannelPublicMinisiteUrl,
  buildLocalMinisitePreviewPath,
  buildPublicMinisitePath,
  buildPublicMinisiteUrl,
  getConfiguredPublicBaseUrl,
  validateSlug,
} from '../lib/slug-utils';

interface EditorMinisiteDetail {
  id: number;
  title: string;
  slug: string;
  slugAliases?: string[];
  status: string;
  templateId: string;
  isDemo: boolean;
  hasUnpublishedChanges?: boolean;
  publishedAt?: string | null;
  theme: MinisiteTheme;
  seo: MinisiteSeo;
  business: {
    name: string;
    category: string;
    address: string;
    phone: string;
    whatsapp: string;
    website: string;
    instagram: string;
    googleMapsUrl: string | null;
    googlePlaceId?: string | null;
  };
  blocks: Array<MinisiteBlockData & { id: number }>;
}

interface VersionRecord {
  id: number;
  version: number;
  createdAt: string;
  authorName: string | null;
}

function getBlockBadgeColor(blockType: string): string {
  switch (blockType) {
    case 'whatsapp':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'botao_instagram':
      return 'bg-pink-50 text-pink-700 border-pink-200';
    case 'botao_tiktok':
      return 'bg-slate-900 text-white border-slate-900';
    case 'botao_youtube':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'botao_facebook':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'botao_link':
    case 'avaliacoes_google':
    case 'como_chegar':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'produto_servico':
    case 'servicos':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'endereco_mapa':
    case 'endereco':
    case 'horarios':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function MinisiteEditorPreview({
  minisiteId,
  onNavigate,
}: {
  minisiteId: number;
  onNavigate: (path: string) => void;
}) {
  const { apiFetch, profile, isDemoSession } = useAuth();
  const [minisite, setMinisite] = useState<EditorMinisiteDetail | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState(() => getConfiguredPublicBaseUrl());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable draft state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [templateId, setTemplateId] = useState('modelo_generico');
  const [theme, setTheme] = useState<MinisiteTheme>({});
  const [seo, setSeo] = useState<MinisiteSeo>({});
  const [blocks, setBlocks] = useState<MinisiteBlockData[]>([]);
  const [businessProfile, setBusinessProfile] = useState({
    name: '',
    category: '',
    address: '',
    phone: '',
    whatsapp: '',
    website: '',
    instagram: '',
  });

  // UI state
  const [activeTab, setActiveTab] = useState<
    'conteudo' | 'aparencia' | 'ajustes' | 'compartilhar' | 'perfil'
  >('conteudo');
  const [mobilePane, setMobilePane] = useState<'editar' | 'visualizar'>('editar');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedChannelKey, setCopiedChannelKey] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [analyzingPalette, setAnalyzingPalette] = useState(false);
  const [paletteFeedback, setPaletteFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmDeleteMinisite, setConfirmDeleteMinisite] = useState(false);
  const [deletingMinisite, setDeletingMinisite] = useState(false);
  const [publishingAction, setPublishingAction] = useState(false);
  const [refreshingGoogle, setRefreshingGoogle] = useState(false);
  const [googlePhotos, setGooglePhotos] = useState<GalleryPhotoItem[]>([]);
  const [googleRefreshFeedback, setGoogleRefreshFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const hydratedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrateFromDetail = useCallback((detail: EditorMinisiteDetail) => {
    if (!detail || !detail.id) {
      throw new Error('Dados do minisite inválidos ou ausentes.');
    }
    setMinisite(detail);
    setTitle(detail.title || '');
    setSlug(detail.slug || '');
    setTemplateId(detail.templateId || 'modelo_generico');
    setTheme(detail.theme || {});
    setSeo(detail.seo || {});
    setBusinessProfile({
      name: detail.business?.name || '',
      category: detail.business?.category || '',
      address: detail.business?.address || '',
      phone: detail.business?.phone || '',
      whatsapp: detail.business?.whatsapp || '',
      website: detail.business?.website || '',
      instagram: detail.business?.instagram || '',
    });

    const coverBlock = detail.blocks.find((b) => b.blockType === 'capa');
    setShortDesc(
      String(coverBlock?.content?.subtitle || detail.seo?.description || detail.business.category || '')
    );

    const editableBlocks = detail.blocks
      .filter((b) => b.blockType !== 'capa')
      .map((b, idx) => ({
        ...b,
        clientKey: `blk-${b.id || idx}-${Math.random().toString(36).slice(2, 7)}`,
      }));
    setBlocks(editableBlocks);

    // Populate Google gallery photos initially from existing Google gallery items if any
    const galBlock = detail.blocks.find((b) => b.blockType === 'galeria');
    if (Array.isArray(galBlock?.content?.images)) {
      const existingGoogleImgs = (galBlock.content.images as GalleryPhotoItem[]).filter(
        (img) => img.url?.includes('/api/google/place-photo')
      );
      if (existingGoogleImgs.length > 0) {
        setGooglePhotos(existingGoogleImgs);
      }
    }

    setSaveStatus('idle');
    setSaveError(null);
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    let active = true;
    hydratedRef.current = false;
    setLoading(true);
    apiFetch<{ minisite: EditorMinisiteDetail; publicUrl?: string }>(`/api/minisites/${minisiteId}`)
      .then((res) => {
        if (active) {
          if (!res?.minisite?.slug) {
            throw new Error('O servidor não retornou os dados completos do minisite.');
          }
          hydrateFromDetail(res.minisite);
          if (res.publicUrl) {
            try {
              setPublicBaseUrl(new URL(res.publicUrl).origin);
            } catch {
              // keep window.location.origin
            }
          }
          if (res.minisite.business?.googlePlaceId) {
            apiFetch<{ galleryPhotos: GalleryPhotoItem[] }>(
              `/api/google/place-details/${encodeURIComponent(res.minisite.business.googlePlaceId)}`
            )
              .then((det) => {
                if (active && Array.isArray(det.galleryPhotos) && det.galleryPhotos.length > 0) {
                  setGooglePhotos(det.galleryPhotos);
                }
              })
              .catch(() => {
                // ignore background photo preload failures if API key not configured
              });
          }
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Erro ao abrir editor.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, hydrateFromDetail, minisiteId]);

  const buildPayloadBlocks = useCallback(() => {
    const coverBlock = minisite?.blocks.find((b) => b.blockType === 'capa');
    const capaPayload = {
      blockType: 'capa',
      visible: true,
      content: {
        ...(coverBlock?.content || {}),
        title,
        subtitle: shortDesc,
        image: theme.coverImage || coverBlock?.content?.image || '',
      },
    };
    return [
      capaPayload,
      ...blocks.map((b) => ({
        blockType: b.blockType,
        visible: b.visible,
        content: b.content,
      })),
    ];
  }, [blocks, minisite?.blocks, shortDesc, theme.coverImage, title]);

  const persistSave = useCallback(async (): Promise<boolean> => {
    if (!minisite || isDemoSession || !profile) return false;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const res = await apiFetch<{ minisite: EditorMinisiteDetail }>(`/api/minisites/${minisite.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim() || minisite.title,
          slug: slug.trim() || minisite.slug,
          templateId,
          theme,
          seo: {
            ...seo,
            description: seo.description || shortDesc,
          },
          blocks: buildPayloadBlocks(),
          businessPatch: businessProfile,
        }),
      });
      if (!res?.minisite) {
        throw new Error('O servidor não confirmou os dados salvos do minisite.');
      }
      setMinisite(res.minisite);
      setSlug(res.minisite.slug || minisite.slug || '');
      setSaveStatus('saved');
      return true;
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar alterações.');
      return false;
    }
  }, [
    apiFetch,
    buildPayloadBlocks,
    businessProfile,
    isDemoSession,
    minisite,
    profile,
    seo,
    shortDesc,
    slug,
    templateId,
    theme,
  ]);

  const markDirty = useCallback(() => {
    if (!hydratedRef.current) return;
    setSaveStatus('dirty');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (!isDemoSession && profile) {
      autosaveTimerRef.current = setTimeout(() => {
        persistSave();
      }, 1600);
    }
  }, [isDemoSession, persistSave, profile]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const activeSlug = slug || minisite?.slug || '';
    if (!activeSlug) {
      setQrCodeDataUrl('');
      return;
    }
    const targetUrl = buildPublicMinisiteUrl(activeSlug, {
      publicBaseUrl,
    });
    let cancelled = false;
    QRCode.toDataURL(targetUrl, {
      width: 360,
      margin: 2,
      color: {
        dark: '#10253D',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrCodeDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrCodeDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [minisite?.slug, publicBaseUrl, slug]);

  const handleUploadFile = async (
    file: File,
    onSuccess: (url: string, mime: string) => void,
    targetKey: string
  ) => {
    if (isDemoSession || !profile) {
      setSaveError('Entre com sua conta Google corporativa para enviar arquivos.');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    if (!allowed.includes(file.type)) {
      setSaveError('Use imagens JPG, PNG, WebP ou vídeo MP4.');
      return;
    }
    setUploadingTarget(targetKey);
    setSaveError(null);
    try {
      let media: Blob = file;
      if (file.type.startsWith('image/')) {
        const image = await createImageBitmap(file);
        try {
          const maxWidth = targetKey === 'logo' ? 512 : 1600;
          const scale = Math.min(1, maxWidth / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Não foi possível preparar a imagem.');
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const optimized = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/webp', 0.84);
          });
          if (optimized && (scale < 1 || optimized.size < file.size)) media = optimized;
        } finally {
          image.close();
        }
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(media);
      });

      const uploaded = await apiFetch<{ url: string; mimeType: string }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          dataBase64: dataUrl,
        }),
      });
      onSuccess(uploaded.url, uploaded.mimeType);
      markDirty();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro no upload de mídia.');
    } finally {
      setUploadingTarget(null);
    }
  };

  const updateBlockContent = (index: number, patch: Record<string, unknown>) => {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === index ? { ...b, content: { ...b.content, ...patch } } : b
      )
    );
    markDirty();
  };

  const moveBlock = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    if (expandedIndex === index) setExpandedIndex(target);
    else if (expandedIndex === target) setExpandedIndex(index);
    markDirty();
  };

  const duplicateBlock = (index: number) => {
    const source = blocks[index];
    if (!source) return;
    const copy: MinisiteBlockData = {
      blockType: source.blockType,
      position: index + 1,
      visible: source.visible,
      clientKey: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: JSON.parse(JSON.stringify(source.content)),
    };
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setExpandedIndex(index + 1);
    markDirty();
  };

  const toggleBlockVisibility = (index: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, visible: !b.visible } : b))
    );
    markDirty();
  };

  const deleteBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
    markDirty();
  };

  const addBlock = (type: MinisiteBlockType) => {
    const def = BLOCK_CATALOG.find((c) => c.type === type);
    const defaultContent = def ? JSON.parse(JSON.stringify(def.defaultContent)) : {};
    if (type === 'whatsapp' && minisite?.business.whatsapp) {
      defaultContent.phone = minisite.business.whatsapp;
    }
    if (type === 'endereco_mapa' && minisite?.business.address) {
      defaultContent.address = minisite.business.address;
    }
    const newBlock: MinisiteBlockData = {
      blockType: type,
      position: blocks.length,
      visible: true,
      clientKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: defaultContent,
    };
    setBlocks((prev) => [...prev, newBlock]);
    setExpandedIndex(blocks.length);
    setShowAddBlock(false);
    markDirty();
  };

  const handleStatusChange = async (nextStatus: string) => {
    if (!minisite || isDemoSession || !profile) return;
    setSaveError(null);
    setPublishingAction(true);
    try {
      if (nextStatus === 'publicado') {
        const savedOk = await persistSave();
        if (!savedOk) return;
        const res = await apiFetch<{ minisite: { status: string; publishedAt?: string } }>(
          `/api/minisites/${minisite.id}/publish`,
          { method: 'POST' }
        );
        setMinisite((prev) =>
          prev
            ? {
                ...prev,
                status: res.minisite.status,
                hasUnpublishedChanges: false,
                publishedAt: res.minisite.publishedAt || new Date().toISOString(),
              }
            : prev
        );
      } else {
        const res = await apiFetch<{ minisite: { status: string } }>(
          `/api/minisites/${minisite.id}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
          }
        );
        setMinisite((prev) =>
          prev
            ? { ...prev, status: res.minisite.status, hasUnpublishedChanges: false }
            : prev
        );
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao atualizar status.');
    } finally {
      setPublishingAction(false);
    }
  };

  const handlePublishSnapshot = async () => {
    if (!minisite || isDemoSession || !profile) return;
    setSaveError(null);
    setPublishingAction(true);
    try {
      const savedOk = await persistSave();
      if (!savedOk) return;
      const res = await apiFetch<{ minisite: { status: string; publishedAt?: string } }>(
        `/api/minisites/${minisite.id}/publish`,
        { method: 'POST' }
      );
      setMinisite((prev) =>
        prev
          ? {
              ...prev,
              status: res.minisite.status,
              hasUnpublishedChanges: false,
              publishedAt: res.minisite.publishedAt || new Date().toISOString(),
            }
          : prev
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao publicar minisite.');
    } finally {
      setPublishingAction(false);
    }
  };

  const handleUnpublish = async () => {
    if (!minisite || isDemoSession || !profile) return;
    setSaveError(null);
    setPublishingAction(true);
    try {
      const res = await apiFetch<{ minisite: { status: string } }>(
        `/api/minisites/${minisite.id}/unpublish`,
        {
          method: 'POST',
          body: JSON.stringify({ status: 'rascunho' }),
        }
      );
      setMinisite((prev) =>
        prev ? { ...prev, status: res.minisite.status, hasUnpublishedChanges: false } : prev
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao despublicar minisite.');
    } finally {
      setPublishingAction(false);
    }
  };

  const handleRefreshGoogleData = async () => {
    if (!minisite || isDemoSession || !profile) {
      setGoogleRefreshFeedback({
        type: 'error',
        message: 'Entre com sua conta Google corporativa para sincronizar os dados do Google Places.',
      });
      return;
    }
    setRefreshingGoogle(true);
    setGoogleRefreshFeedback(null);
    setSaveError(null);
    try {
      if (saveStatus === 'dirty') {
        await persistSave();
      }
      const res = await apiFetch<{
        minisite: EditorMinisiteDetail;
        googlePhotos: GalleryPhotoItem[];
        summary: {
          rating: number | null;
          userRatingCount: number | null;
          reviewsImported: number;
          photosImported: number;
          weekdayHoursImported: number;
          preservedManualMedia: boolean;
          coverAutoFilled: boolean;
        };
      }>(`/api/minisites/${minisite.id}/refresh-google`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res?.minisite) {
        throw new Error('O servidor não retornou os dados atualizados do minisite.');
      }
      hydrateFromDetail(res.minisite);
      if (minisite?.business?.googlePlaceId) {
        clearImageCacheForPlace(minisite.business.googlePlaceId);
      }
      if (Array.isArray(res.googlePhotos)) {
        setGooglePhotos(res.googlePhotos);
        void preloadImageBatch(
          res.googlePhotos.map((p) => p.url),
          3
        );
      }
      const s = res.summary;
      setGoogleRefreshFeedback({
        type: 'success',
        message: `Dados do Google atualizados: ${s.rating != null ? `${s.rating.toFixed(1)}★ (${s.userRatingCount ?? 0}), ` : ''}${s.reviewsImported} avaliações, ${s.photosImported} fotos${s.preservedManualMedia ? ' · mídias manuais preservadas' : ''}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar dados do Google.';
      setGoogleRefreshFeedback({ type: 'error', message: msg });
      setSaveError(msg);
    } finally {
      setRefreshingGoogle(false);
    }
  };

  const applyGooglePhotoAsCover = (photo: GalleryPhotoItem) => {
    const highResUrl = photo.url.replace(/([?&]w=)\d+/, '$11080');
    setTheme((t) => ({
      ...t,
      coverImage: highResUrl,
      coverVideo: '',
      photoAttribution: photo.attributionName
        ? { displayName: photo.attributionName, uri: photo.attributionUri }
        : null,
      placePhotosUri: photo.originUri || t.placePhotosUri || minisite?.business?.googleMapsUrl || '',
    }));
    markDirty();
  };

  const applyGooglePhotoAsLogo = (photo: GalleryPhotoItem) => {
    const logoResUrl = photo.url.replace(/([?&]w=)\d+/, '$1480');
    setTheme((t) => ({ ...t, logoImage: logoResUrl }));
    markDirty();
  };

  const addGooglePhotoToGallery = (photo: GalleryPhotoItem) => {
    const galIdx = blocks.findIndex((b) => b.blockType === 'galeria');
    if (galIdx >= 0) {
      const prevImgs = (blocks[galIdx].content?.images as GalleryPhotoItem[]) || [];
      if (prevImgs.some((img) => img.url === photo.url)) return;
      updateBlockContent(galIdx, { images: [...prevImgs, photo] });
    } else {
      const newGal: MinisiteBlockData = {
        blockType: 'galeria',
        position: blocks.length,
        visible: true,
        clientKey: `gal-${Date.now()}`,
        content: {
          title: 'Fotos do estabelecimento',
          images: [photo],
        },
      };
      setBlocks((prev) => [...prev, newGal]);
      markDirty();
    }
  };

  const handleOpenVersions = async () => {
    if (!minisite) return;
    setShowVersions((v) => !v);
    if (!showVersions) {
      setLoadingVersions(true);
      try {
        const res = await apiFetch<{ versions: VersionRecord[] }>(
          `/api/minisites/${minisite.id}/versions`
        );
        setVersions(res.versions || []);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Erro ao carregar versões.');
      } finally {
        setLoadingVersions(false);
      }
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!minisite || isDemoSession || !profile) return;
    try {
      const res = await apiFetch<{ minisite: EditorMinisiteDetail }>(
        `/api/minisites/${minisite.id}/restore/${versionId}`,
        { method: 'POST' }
      );
      if (!res?.minisite) {
        throw new Error('O servidor não retornou a versão restaurada do minisite.');
      }
      hydrateFromDetail(res.minisite);
      setShowVersions(false);
      setSaveStatus('saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao restaurar versão.');
    }
  };

  const handleAnalyzeVisualIdentity = async () => {
    if (!minisite || isDemoSession || !profile) {
      const msg = 'Entre com sua conta Google corporativa para analisar a identidade visual com IA.';
      setPaletteFeedback({ type: 'error', message: msg });
      setSaveError(msg);
      return;
    }
    setAnalyzingPalette(true);
    setSaveError(null);
    setPaletteFeedback(null);
    try {
      const galleryBlock = blocks.find((b) => b.blockType === 'galeria');
      const firstGalleryUrl = Array.isArray(galleryBlock?.content?.images)
        ? String((galleryBlock?.content?.images as GalleryPhotoItem[])[0]?.url || '')
        : '';

      const res = await apiFetch<{ palette: MinisiteTheme; elapsedMs?: number }>(
        `/api/minisites/${minisite.id}/analyze-palette`,
        {
          method: 'POST',
          body: JSON.stringify({
            logoImage: theme.logoImage || '',
            coverImage: theme.coverImage || '',
            fallbackImage: firstGalleryUrl,
            templateId,
            businessName: title || businessProfile.name || minisite.title,
            category: businessProfile.category || minisite.business.category || '',
          }),
        }
      );
      setTheme((prev) => ({
        ...prev,
        ...res.palette,
      }));
      const timingNote =
        typeof res.elapsedMs === 'number'
          ? ` em ${(res.elapsedMs / 1000).toFixed(1)}s`
          : '';
      setPaletteFeedback({
        type: 'success',
        message: `Paleta de cores aplicada automaticamente${timingNote} com base na identidade visual.`,
      });
      markDirty();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível analisar a identidade visual.';
      setPaletteFeedback({ type: 'error', message: msg });
      setSaveError(msg);
    } finally {
      setAnalyzingPalette(false);
    }
  };

  const handleDeleteMinisite = async () => {
    if (!minisite || isDemoSession || !profile) {
      setSaveError('Entre com sua conta Google corporativa para excluir minisites.');
      setConfirmDeleteMinisite(false);
      return;
    }
    setDeletingMinisite(true);
    setSaveError(null);
    try {
      await apiFetch(`/api/minisites/${minisite.id}`, { method: 'DELETE' });
      onNavigate('/minisites');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao excluir minisite.');
      setDeletingMinisite(false);
    }
  };

  if (loading) {
    return <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  if (error || !minisite) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        {error || 'Minisite não encontrado.'}
      </div>
    );
  }

  const livePreviewMinisite: RenderableMinisite = {
    id: minisite.id,
    title: title || minisite.title,
    slug: slug || minisite.slug,
    status: minisite.status,
    templateId,
    theme,
    business: {
      ...minisite.business,
      ...businessProfile,
    },
    blocks: [
      {
        blockType: 'capa',
        position: 0,
        visible: true,
        content: {
          title: title || minisite.title,
          subtitle: shortDesc,
          image: theme.coverImage || '',
          photoAttribution: theme.photoAttribution || null,
        },
      },
      ...blocks,
    ],
  };

  const activeSlug = slug || minisite.slug;
  const canonicalPublicPath = buildPublicMinisitePath(activeSlug);
  const canonicalPublicUrl = buildPublicMinisiteUrl(activeSlug, {
    publicBaseUrl,
  });
  const localOpenPath = buildLocalMinisitePreviewPath(activeSlug, minisite.status);
  const publicDemoUrl = `${window.location.origin}/demo/${activeSlug}`;
  const slugValidation = validateSlug(slug);

  return (
    <div className="space-y-5">
      {/* Editor Top Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 lg:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/minisites')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#10253D] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <span className="text-slate-300">|</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-[#10253D] truncate">
                {title || minisite.title}
              </h1>
              <StatusIndicator status={minisite.status} />
              {minisite.hasUnpublishedChanges && (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  Alterações não republicadas
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-[#1677F2] truncate" title={canonicalPublicUrl}>
              {canonicalPublicPath}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Save indicator & manual save */}
          <span className="text-xs text-slate-500 px-2">
            {saveStatus === 'saving' && 'Salvando...'}
            {saveStatus === 'saved' && 'Salvo'}
            {saveStatus === 'dirty' && 'Alterações pendentes'}
            {saveStatus === 'error' && 'Erro ao salvar'}
          </span>

          {!isDemoSession && profile && (
            <>
              <button
                type="button"
                onClick={persistSave}
                disabled={saveStatus === 'saving'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar rascunho</span>
              </button>

              {profile.role === 'administrador' && (
                <>
                  <button
                    type="button"
                    disabled={publishingAction}
                    onClick={handlePublishSnapshot}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {publishingAction
                        ? 'Publicando...'
                        : minisite.status === 'publicado'
                          ? 'Republicar'
                          : 'Publicar'}
                    </span>
                  </button>

                  {minisite.status === 'publicado' && (
                    <button
                      type="button"
                      disabled={publishingAction}
                      onClick={handleUnpublish}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <span>Despublicar</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={handleOpenVersions}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>Versões</span>
              </button>

              <select
                value={minisite.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                aria-label="Status de publicação"
                className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-[#10253D] cursor-pointer"
              >
                <option value="rascunho">Rascunho</option>
                <option value="demonstracao">Demonstração</option>
                <option value="publicado" disabled={profile.role !== 'administrador'}>
                  Publicado (/{slug || minisite.slug})
                </option>
                <option value="desativado">Desativado</option>
              </select>

              {confirmDeleteMinisite ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={deletingMinisite}
                    onClick={handleDeleteMinisite}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <span>{deletingMinisite ? 'Excluindo…' : 'Confirmar exclusão'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMinisite(false)}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteMinisite(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-xs font-semibold text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              const target = minisite.status === 'publicado' ? canonicalPublicUrl : publicDemoUrl;
              navigator.clipboard?.writeText(target);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 1800);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedUrl ? 'Copiado' : 'Copiar link'}</span>
          </button>

          {minisite.status === 'publicado' ? (
            <a
              href={`/${slug || minisite.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir site</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate(`/demo/${slug || minisite.slug}`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir prévia</span>
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showVersions && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#10253D] uppercase tracking-wider">
              Histórico de versões salvas
            </h3>
            <button
              type="button"
              onClick={() => setShowVersions(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {loadingVersions ? (
            <div className="text-xs text-slate-500">Carregando versões...</div>
          ) : versions.length === 0 ? (
            <div className="text-xs text-slate-500">Nenhuma versão anterior encontrada.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {versions.map((v) => (
                <div key={v.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-[#10253D]">Versão {v.version}</span>
                    <span className="text-slate-500 ml-2">
                      {new Date(v.createdAt).toLocaleString('pt-BR')}
                      {v.authorName ? ` · ${v.authorName}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreVersion(v.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-[#1677F2] cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs + Mobile Pane Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
          {[
            { id: 'conteudo', label: 'Conteúdo' },
            { id: 'aparencia', label: 'Aparência' },
            { id: 'ajustes', label: 'Ajustes' },
            { id: 'compartilhar', label: 'Compartilhar' },
            { id: 'perfil', label: 'Perfil' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.id as 'conteudo' | 'aparencia' | 'ajustes' | 'compartilhar' | 'perfil'
                )
              }
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-[#10253D] shadow-sm'
                  : 'text-slate-600 hover:text-[#10253D]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex lg:hidden items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setMobilePane('editar')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              mobilePane === 'editar' ? 'bg-white text-[#10253D] shadow-sm' : 'text-slate-600'
            }`}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('visualizar')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              mobilePane === 'visualizar'
                ? 'bg-white text-[#10253D] shadow-sm'
                : 'text-slate-600'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Prévia</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Editor Column */}
        <div
          className={`lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6 ${
            mobilePane === 'visualizar' ? 'hidden lg:block' : ''
          }`}
        >
          {activeTab === 'conteudo' && (
            <>
              {/* Logo & Capa Media Controls */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Logo */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#10253D]">Logo</span>
                      {theme.logoImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setTheme((t) => ({ ...t, logoImage: '' }));
                            markDirty();
                          }}
                          className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {theme.logoImage ? (
                        <ResilientImage
                          src={theme.logoImage}
                          alt="Logo"
                          variant="avatar"
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                          <ImagePlus className="w-5 h-5" />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingTarget === 'logo' ? 'Enviando...' : 'Enviar logo'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleUploadFile(
                                f,
                                (url) => setTheme((t) => ({ ...t, logoImage: url })),
                                'logo'
                              );
                            }
                          }}
                        />
                      </label>
                    </div>
                    {theme.logoImage?.includes('/api/google/place-photo') && (
                      <p className="text-[11px] text-slate-500">
                        Imagem de perfil provisória preenchida com foto do Google (editável; não representa logotipo oficial).
                      </p>
                    )}
                    <input
                      type="text"
                      value={theme.logoImage || ''}
                      onChange={(e) => {
                        setTheme((t) => ({ ...t, logoImage: e.target.value }));
                        markDirty();
                      }}
                      placeholder="Ou cole a URL da logo..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-[#10253D]"
                    />
                  </div>

                  {/* Capa (Foto ou Vídeo) */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#10253D]">Capa (foto ou vídeo)</span>
                      {(theme.coverImage || theme.coverVideo) && (
                        <button
                          type="button"
                          onClick={() => {
                            setTheme((t) => ({ ...t, coverImage: '', coverVideo: '' }));
                            markDirty();
                          }}
                          className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {theme.coverVideo ? (
                        <video
                          src={theme.coverVideo}
                          muted
                          className="w-20 h-14 rounded-lg object-cover border border-slate-200 bg-black shrink-0"
                        />
                      ) : theme.coverImage ? (
                        <ResilientImage
                          src={theme.coverImage}
                          alt="Capa"
                          variant="thumb"
                          referrerPolicy="no-referrer"
                          className="w-20 h-14 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-14 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 shrink-0">
                          <ImagePlus className="w-5 h-5" />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingTarget === 'cover' ? 'Enviando...' : 'Enviar capa'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,video/mp4"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleUploadFile(
                                f,
                                (url, mime) =>
                                  setTheme((t) =>
                                    mime === 'video/mp4'
                                      ? { ...t, coverVideo: url }
                                      : { ...t, coverImage: url, coverVideo: '' }
                                  ),
                                'cover'
                              );
                            }
                          }}
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      value={theme.coverImage || ''}
                      onChange={(e) => {
                        setTheme((t) => ({ ...t, coverImage: e.target.value }));
                        markDirty();
                      }}
                      placeholder="Ou cole a URL da imagem de capa..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-[#10253D]"
                    />
                  </div>
                </div>

                {/* Media guidance box matching reference */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <div className="font-semibold text-[#10253D]">
                    Tamanho ideal para o estilo escolhido: capa de 1080 × 1080 px
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    <li>
                      Formato quadrado, aparece suave ao fundo. O site é cortado no centro para preencher a área,
                      então deixe o assunto principal no meio e sem texto nas bordas.
                    </li>
                    <li>Foto: JPG, PNG ou WebP, até 8 MB. Fotos horizontais e bem iluminadas funcionam melhor.</li>
                    <li>
                      Vídeo: MP4, curto (até 15 s), até 30 MB. Vídeo vertical de celular (9:16) também serve,
                      mas aparece cortado.
                    </li>
                    <li>Logo / imagem de perfil: quadrada, 400 × 400 px.</li>
                  </ul>
                </div>

                {/* 3-step Reel cover upload guidance */}
                <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-600 space-y-2">
                  <div className="font-semibold text-[#10253D]">
                    Quer usar um Reel do cliente como capa?
                  </div>
                  <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                    <li>
                      No Instagram, abra o Reel, toque em <strong>Compartilhar</strong> e em <strong>Copiar link</strong> (ou solicite o MP4 ao cliente).
                    </li>
                    <li>
                      Baixe o vídeo em formato MP4 (curto, até 15 s e no máximo 30 MB).
                    </li>
                    <li>
                      Volte aqui e clique em <strong>Enviar capa</strong> acima para enviar o arquivo MP4.
                    </li>
                  </ol>
                  <p className="text-[11px] text-slate-500">
                    Use só vídeos do seu cliente, com a autorização dele. Se o vídeo for maior que 30 MB, escolha uma qualidade menor antes de enviar.
                  </p>
                </div>

                {/* Google Places Sync + Photo Picker */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-[#10253D]">
                        Dados e fotos do Google Places
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Quando não há logo manual nem logotipo identificado, a importação usa uma foto do Google
                        como imagem de perfil provisória editável (além da capa quando vazia). Escolha abaixo para
                        capa, galeria ou logo, ou envie arquivos manuais.
                      </p>
                    </div>
                    {!isDemoSession && profile && (
                      <button
                        type="button"
                        disabled={refreshingGoogle || !minisite.business?.googlePlaceId}
                        onClick={handleRefreshGoogleData}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${refreshingGoogle ? 'animate-spin' : ''}`}
                        />
                        <span>
                          {refreshingGoogle ? 'Atualizando...' : 'Atualizar dados do Google'}
                        </span>
                      </button>
                    )}
                  </div>

                  {!minisite.business?.googlePlaceId && (
                    <div className="text-[11px] text-slate-500">
                      Este minisite foi criado sem um Place ID vinculado.
                    </div>
                  )}

                  {googleRefreshFeedback && (
                    <div
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                        googleRefreshFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      <span>{googleRefreshFeedback.message}</span>
                      <button
                        type="button"
                        onClick={() => setGoogleRefreshFeedback(null)}
                        className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {googlePhotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                      {googlePhotos.slice(0, 9).map((ph, gIdx) => (
                        <div
                          key={`${ph.url}-${gIdx}`}
                          className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col"
                        >
                          <ResilientImage
                            src={ph.url}
                            alt={`Google foto ${gIdx + 1}`}
                            variant="gallery"
                            loading="lazy"
                            fallbackLabel="Foto indisponível"
                            referrerPolicy="no-referrer"
                            className="w-full h-20 object-cover"
                          />
                          <div className="p-2 space-y-1.5 flex-1 flex flex-col justify-between">
                            <div className="text-[10px] text-slate-500 truncate">
                              {ph.attributionName || 'Google Maps'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => applyGooglePhotoAsCover(ph)}
                                className="px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-[#10253D] cursor-pointer"
                              >
                                Capa
                              </button>
                              <button
                                type="button"
                                onClick={() => addGooglePhotoToGallery(ph)}
                                className="px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-[#10253D] cursor-pointer"
                              >
                                + Galeria
                              </button>
                              <button
                                type="button"
                                onClick={() => applyGooglePhotoAsLogo(ph)}
                                className="px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-[#10253D] cursor-pointer"
                              >
                                Logo
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Nome, Descrição Curta e Selo de Horário */}
              <div className="space-y-3.5 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">Nome</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      markDirty();
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Descrição curta
                  </label>
                  <textarea
                    rows={3}
                    value={shortDesc}
                    onChange={(e) => {
                      setShortDesc(e.target.value);
                      markDirty();
                    }}
                    placeholder="Resumo atraente do negócio exibido na capa..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#10253D] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(theme.showOpenBadge)}
                      onChange={(e) => {
                        setTheme((t) => ({
                          ...t,
                          showOpenBadge: e.target.checked,
                          openBadgeText: t.openBadgeText || 'Aberto agora',
                        }));
                        markDirty();
                      }}
                      className="rounded border-slate-300"
                    />
                    <span>Exibir selo de destaque na capa</span>
                  </label>

                  {theme.showOpenBadge && (
                    <input
                      type="text"
                      value={theme.openBadgeText || ''}
                      onChange={(e) => {
                        setTheme((t) => ({ ...t, openBadgeText: e.target.value }));
                        markDirty();
                      }}
                      placeholder="Ex: Aberto agora · até 19h"
                      className="px-3 py-1 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                    />
                  )}
                </div>
              </div>

              {/* Ordered Interactive Blocks List */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Blocos do minisite ({blocks.length})
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    Clique em qualquer bloco para editar
                  </span>
                </div>

                <div className="space-y-2.5">
                  {blocks.map((block, index) => {
                    const isExpanded = expandedIndex === index;
                    const c = block.content || {};
                    const key = block.clientKey || block.id || index;

                    return (
                      <div
                        key={key}
                        className={`rounded-xl border transition-colors ${
                          block.visible
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-50 border-slate-200/70 opacity-70'
                        }`}
                      >
                        {/* Block Card Header */}
                        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedIndex(isExpanded ? null : index)}
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold shrink-0 ${getBlockBadgeColor(
                                block.blockType
                              )}`}
                            >
                              {renderSocialBrandLogo(block.blockType, 'w-3 h-3 shrink-0')}
                              <span>{getBlockLabel(block.blockType)}</span>
                            </span>
                            <span className="text-xs font-medium text-[#10253D] truncate">
                              {getBlockSummary(block)}
                            </span>
                          </button>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setExpandedIndex(isExpanded ? null : index)}
                              title={isExpanded ? 'Recolher' : 'Editar bloco'}
                              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveBlock(index, -1)}
                              title="Mover para cima"
                              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === blocks.length - 1}
                              onClick={() => moveBlock(index, 1)}
                              title="Mover para baixo"
                              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateBlock(index)}
                              title="Duplicar bloco"
                              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleBlockVisibility(index)}
                              title={block.visible ? 'Ocultar bloco' : 'Mostrar bloco'}
                              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
                            >
                              {block.visible ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBlock(index)}
                              title="Excluir bloco"
                              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Block Field Editor */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/40">
                            {block.blockType === 'botao_link' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Texto do botão
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.label || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { label: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    URL de destino
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.url || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { url: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Ícone
                                  </label>
                                  <select
                                    value={String(c.icon || 'link')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { icon: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  >
                                    <option value="instagram">Instagram</option>
                                    <option value="tiktok">TikTok</option>
                                    <option value="youtube">YouTube</option>
                                    <option value="facebook">Facebook</option>
                                    <option value="globe">Site / Globo</option>
                                    <option value="link">Link padrão</option>
                                    <option value="calendar">Agenda</option>
                                    <option value="utensils">Cardápio / Restaurante</option>
                                    <option value="shopping_bag">Loja / Catálogo</option>
                                  </select>
                                </div>
                              </div>
                            )}

                            {(block.blockType === 'botao_instagram' ||
                              block.blockType === 'botao_tiktok' ||
                              block.blockType === 'botao_youtube' ||
                              block.blockType === 'botao_facebook') && (
                              <div className="space-y-2.5">
                                <div className="flex items-center gap-2 text-xs font-semibold text-[#10253D]">
                                  {renderSocialBrandLogo(block.blockType, 'w-4 h-4 shrink-0')}
                                  <span>
                                    {block.blockType === 'botao_instagram'
                                      ? 'Botão Instagram'
                                      : block.blockType === 'botao_tiktok'
                                        ? 'Botão TikTok'
                                        : block.blockType === 'botao_youtube'
                                          ? 'Botão YouTube'
                                          : 'Botão Facebook'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Texto do botão
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.label || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { label: e.target.value })
                                      }
                                      placeholder={
                                        block.blockType === 'botao_instagram'
                                          ? 'Instagram'
                                          : block.blockType === 'botao_tiktok'
                                            ? 'TikTok'
                                            : block.blockType === 'botao_youtube'
                                              ? 'YouTube'
                                              : 'Facebook'
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Usuário (@) ou link completo
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.url || c.account || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { url: e.target.value })
                                      }
                                      placeholder={
                                        block.blockType === 'botao_instagram'
                                          ? '@suamarca ou https://instagram.com/suamarca'
                                          : block.blockType === 'botao_tiktok'
                                            ? '@suamarca ou https://tiktok.com/@suamarca'
                                            : block.blockType === 'botao_youtube'
                                              ? '@seucanal ou https://youtube.com/@seucanal'
                                              : 'suapagina ou https://facebook.com/suapagina'
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {block.blockType === 'whatsapp' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Texto do botão
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.label || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { label: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Número WhatsApp (DDI + DDD + Número)
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.phone || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { phone: e.target.value })
                                    }
                                    placeholder="5521999990000"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Mensagem inicial automática
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.message || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { message: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'avaliacoes_google' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Texto do botão
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.label || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { label: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Link de avaliações Google
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.writeReviewUri || c.reviewsUri || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, {
                                        reviewsUri: e.target.value,
                                        writeReviewUri: e.target.value,
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'como_chegar' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Texto do botão
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.label || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { label: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Link de rota no Google Maps
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.directionsUri || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { directionsUri: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'titulo_secao' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Título
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.title || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { title: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Subtítulo (opcional)
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.subtitle || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { subtitle: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'produto_servico' && (
                              <div className="space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Nome do produto ou serviço
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.name || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { name: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Valor (opcional)
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.price || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { price: e.target.value })
                                      }
                                      placeholder="Ex: R$ 90,00 ou Sob consulta"
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Descrição
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={String(c.description || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { description: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    URL da foto (opcional)
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.image || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { image: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'servicos' && (
                              <div className="space-y-2">
                                {((c.items as Array<{ name: string; description?: string }>) || []).map(
                                  (svc, sIdx, arr) => (
                                    <div key={sIdx} className="flex gap-2 items-start">
                                      <input
                                        type="text"
                                        value={svc.name}
                                        onChange={(e) => {
                                          const next = arr.map((it, i) =>
                                            i === sIdx ? { ...it, name: e.target.value } : it
                                          );
                                          updateBlockContent(index, { items: next });
                                        }}
                                        placeholder="Nome do serviço"
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = arr.filter((_, i) => i !== sIdx);
                                          updateBlockContent(index, { items: next });
                                        }}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const arr =
                                      (c.items as Array<{ name: string; description?: string }>) ||
                                      [];
                                    updateBlockContent(index, {
                                      items: [...arr, { name: 'Novo serviço', description: '' }],
                                    });
                                  }}
                                  className="text-xs font-semibold text-[#1677F2] hover:underline cursor-pointer"
                                >
                                  + Adicionar serviço
                                </button>
                              </div>
                            )}

                            {block.blockType === 'texto' && (
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Título (opcional)
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.title || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { title: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Conteúdo do texto
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={String(c.body || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { body: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'avaliacoes' && (
                              <div className="space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Título da seção
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.title || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { title: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Link das avaliações no Google
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.reviewsUri || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { reviewsUri: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                </div>
                                {typeof c.rating === 'number' && (
                                  <div className="text-[11px] text-slate-600">
                                    Nota geral: <strong>{c.rating.toFixed(1)}★</strong> (
                                    {typeof c.userRatingCount === 'number' ? c.userRatingCount : 0}{' '}
                                    avaliações no Google)
                                  </div>
                                )}
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-medium text-slate-600">
                                    Avaliações importadas ({((c.reviews as GoogleReviewItem[]) || []).length})
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    {visibleGoogleReviews(c).length} em exibição. Salve e republique para atualizar o site.
                                  </p>
                                  {((c.reviews as GoogleReviewItem[]) || []).map((rev, rIdx) => (
                                    <div
                                      key={rIdx}
                                      className="p-2 rounded-lg border border-slate-200 bg-white flex items-start justify-between gap-2 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-[#10253D]">
                                          {rev.authorName} ({rev.rating}★)
                                        </span>
                                        {rev.relativeTime && (
                                          <span className="text-[10px] text-slate-400 ml-1.5">
                                            {rev.relativeTime}
                                          </span>
                                        )}
                                        <p className="text-slate-600 line-clamp-2">{rev.text}</p>
                                      </div>
                                      <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={visibleGoogleReviews(c).includes(rev)}
                                          onChange={(event) => {
                                            const selected = new Set(
                                              Array.isArray(c.selectedReviewKeys)
                                                ? c.selectedReviewKeys as string[]
                                                : visibleGoogleReviews(c).map(googleReviewKey),
                                            );
                                            const key = googleReviewKey(rev);
                                            if (event.target.checked) selected.add(key);
                                            else selected.delete(key);
                                            updateBlockContent(index, { selectedReviewKeys: [...selected] });
                                          }}
                                          aria-label={`Exibir avaliação de ${rev.authorName}`}
                                        />
                                        Exibir
                                      </label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {block.blockType === 'galeria' && (
                              <div className="space-y-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Título da galeria
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.title || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { title: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  {((c.images as GalleryPhotoItem[]) || []).map((img, gIdx, arr) => (
                                    <div
                                      key={gIdx}
                                      className="relative rounded-lg overflow-hidden border border-slate-200 aspect-[4/3]"
                                    >
                                      <ResilientImage
                                        src={img.url}
                                        alt=""
                                        variant="gallery"
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateBlockContent(index, {
                                            images: arr.filter((_, i) => i !== gIdx),
                                          })
                                        }
                                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-600 cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>
                                    {uploadingTarget === `gallery-${index}`
                                      ? 'Enviando...'
                                      : 'Adicionar foto'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        handleUploadFile(
                                          f,
                                          (url) => {
                                            const prev = (c.images as GalleryPhotoItem[]) || [];
                                            updateBlockContent(index, {
                                              images: [...prev, { url, caption: '' }],
                                            });
                                          },
                                          `gallery-${index}`
                                        );
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            )}

                            {block.blockType === 'horarios' && (
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Título
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.title || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { title: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                {((c.weekdayDescriptions as string[]) || []).map((line, hIdx, arr) => (
                                  <div key={hIdx} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={line}
                                      onChange={(e) => {
                                        const next = arr.map((l, i) =>
                                          i === hIdx ? e.target.value : l
                                        );
                                        updateBlockContent(index, { weekdayDescriptions: next });
                                      }}
                                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateBlockContent(index, {
                                          weekdayDescriptions: arr.filter((_, i) => i !== hIdx),
                                        })
                                      }
                                      className="p-1 text-red-500 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateBlockContent(index, {
                                      weekdayDescriptions: [
                                        ...((c.weekdayDescriptions as string[]) || []),
                                        'Segunda a Sexta: 09:00 - 18:00',
                                      ],
                                    })
                                  }
                                  className="text-xs font-semibold text-[#1677F2] hover:underline cursor-pointer"
                                >
                                  + Adicionar horário
                                </button>
                              </div>
                            )}

                            {(block.blockType === 'endereco_mapa' ||
                              block.blockType === 'endereco') && (
                              <div className="space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Título
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.title || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { title: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Telefone
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c.phone || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { phone: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Endereço completo
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.address || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { address: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Latitude (mapa)
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      value={
                                        (c.location as { lat?: number } | null)?.lat ?? ''
                                      }
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        const prevLoc =
                                          (c.location as { lat?: number; lng?: number } | null) ||
                                          {};
                                        updateBlockContent(index, {
                                          location: Number.isFinite(val)
                                            ? { ...prevLoc, lat: val }
                                            : null,
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      Longitude (mapa)
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      value={
                                        (c.location as { lng?: number } | null)?.lng ?? ''
                                      }
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        const prevLoc =
                                          (c.location as { lat?: number; lng?: number } | null) ||
                                          {};
                                        updateBlockContent(index, {
                                          location: Number.isFinite(val)
                                            ? { ...prevLoc, lng: val }
                                            : null,
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                    />
                                  </div>
                                </div>
                                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={c.showMap !== false}
                                    onChange={(e) =>
                                      updateBlockContent(index, { showMap: e.target.checked })
                                    }
                                  />
                                  <span>Exibir mapa interativo do Google Maps</span>
                                </label>
                              </div>
                            )}

                            {block.blockType === 'redes_sociais' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {[
                                  { k: 'instagram', label: 'Instagram (@usuario ou URL)' },
                                  { k: 'facebook', label: 'Facebook' },
                                  { k: 'youtube', label: 'YouTube' },
                                  { k: 'tiktok', label: 'TikTok' },
                                  { k: 'website', label: 'Site oficial' },
                                ].map((net) => (
                                  <div key={net.k}>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                      {net.label}
                                    </label>
                                    <input
                                      type="text"
                                      value={String(c[net.k] || '')}
                                      onChange={(e) =>
                                        updateBlockContent(index, { [net.k]: e.target.value })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {block.blockType === 'pix' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Chave Pix
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.pixKey || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { pixKey: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Favorecido
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.beneficiary || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { beneficiary: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'wifi' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Nome da rede (SSID)
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.networkName || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { networkName: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Senha
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.password || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { password: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                  />
                                </div>
                              </div>
                            )}

                            {block.blockType === 'formulario' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Título do formulário
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.title || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, { title: e.target.value })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    WhatsApp de destino
                                  </label>
                                  <input
                                    type="text"
                                    value={String(c.destinationWhatsapp || '')}
                                    onChange={(e) =>
                                      updateBlockContent(index, {
                                        destinationWhatsapp: e.target.value,
                                      })
                                    }
                                    placeholder="5521999990000"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick-insert independent Social Network Buttons */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="text-[11px] font-bold text-[#10253D] uppercase tracking-wider">
                    Botões independentes de redes sociais
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => addBlock('botao_instagram')}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-pink-200 bg-white hover:bg-pink-50 text-xs font-bold text-pink-700 transition-colors cursor-pointer"
                    >
                      <InstagramLogo className="w-4 h-4 shrink-0" />
                      <span>+ Instagram</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlock('botao_tiktok')}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-900 transition-colors cursor-pointer"
                    >
                      <TikTokLogo className="w-4 h-4 shrink-0" />
                      <span>+ TikTok</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlock('botao_youtube')}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-xs font-bold text-red-600 transition-colors cursor-pointer"
                    >
                      <YouTubeLogo className="w-4 h-4 shrink-0" />
                      <span>+ YouTube</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlock('botao_facebook')}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-xs font-bold text-blue-700 transition-colors cursor-pointer"
                    >
                      <FacebookLogo className="w-4 h-4 shrink-0" />
                      <span>+ Facebook</span>
                    </button>
                  </div>
                </div>

                {/* + Adicionar Bloco */}
                {!showAddBlock ? (
                  <button
                    type="button"
                    onClick={() => setShowAddBlock(true)}
                    className="w-full py-3.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#1677F2] hover:bg-slate-50 text-sm font-semibold text-[#10253D] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar bloco</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#10253D]">
                        Escolha o tipo de bloco para inserir
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddBlock(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BLOCK_CATALOG.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => addBlock(item.type)}
                          className="text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-[#1677F2] transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-bold text-[#10253D] flex items-center gap-1.5">
                            {renderSocialBrandLogo(item.type, 'w-3.5 h-3.5 shrink-0')}
                            <span>{item.label}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {item.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'aparencia' && (
            <div className="space-y-6">
              {/* Estilo do site */}
              <div className="space-y-2.5">
                <div>
                  <h2 className="text-sm font-bold text-[#10253D]">Estilo do site</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Muda o desenho do site inteiro. Escolher um estilo aplica as cores sugeridas dele; depois você ajusta as cores abaixo. A foto ou vídeo do topo é a Capa, na aba Conteúdo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SITE_STYLE_PRESETS.map((preset) => {
                    const isSelected = (theme.siteStyle || 'vibrante') === preset.id;
                    const primary = preset.patch.primaryColor || '#1677F2';
                    const bg = preset.patch.backgroundColor || '#FFFFFF';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setTheme((t) => ({
                            ...t,
                            ...preset.patch,
                            serviceCardBg: undefined,
                          }));
                          markDirty();
                        }}
                        className={`text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                          isSelected
                            ? 'border-[#1677F2] bg-sky-50/50 ring-1 ring-[#1677F2]'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-[#10253D]">{preset.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{preset.description}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <span
                            className="w-4 h-4 rounded-full border border-black/15"
                            style={{ backgroundColor: primary }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-black/15"
                            style={{ backgroundColor: bg }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Temas por segmento */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Temas por segmento
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {SEGMENT_THEMES.map((seg) => {
                    const active =
                      theme.primaryColor?.toLowerCase() === seg.primaryColor.toLowerCase() &&
                      theme.backgroundColor?.toLowerCase() === seg.backgroundColor.toLowerCase();
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => {
                          const balanced = enforceThemePaletteContrast({
                            primaryColor: seg.primaryColor,
                            secondaryColor: seg.secondaryColor,
                            accentColor: seg.secondaryColor,
                            backgroundColor: seg.backgroundColor,
                            surfaceColor: seg.surfaceColor,
                            textColor: seg.textColor,
                            buttonTextColor: seg.buttonTextColor,
                          });
                          setTheme((t) => ({
                            ...t,
                            ...balanced,
                          }));
                          markDirty();
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'border-[#1677F2] bg-sky-50 text-[#10253D]'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                          style={{ backgroundColor: seg.primaryColor }}
                        />
                        <span>{seg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Automatic Visual Identity Analysis Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-[#10253D] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#1677F2]" />
                      <span>Identidade visual da empresa</span>
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {theme.brandAnalysisSummary ||
                        'A IA analisa a logo, fachada e fotos da empresa para extrair cores dos botões, cards e fundo.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={analyzingPalette}
                    onClick={handleAnalyzeVisualIdentity}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {analyzingPalette
                        ? 'Analisando identidade…'
                        : 'Reanalisar cores pela capa/logo'}
                    </span>
                  </button>
                </div>
                {paletteFeedback && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      paletteFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    <span>{paletteFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setPaletteFeedback(null)}
                      className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Cores */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cores
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'primaryColor', label: 'Principal', fallback: '#C2410C' },
                    { key: 'backgroundColor', label: 'Fundo', fallback: '#FFF8EE' },
                    { key: 'textColor', label: 'Texto', fallback: '#2B1D14' },
                  ].map((field) => {
                    const val = String(
                      (theme as Record<string, unknown>)[field.key] || field.fallback
                    );
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-xs font-semibold text-[#10253D]">
                          {field.label}
                        </label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : field.fallback}
                            onChange={(e) => {
                              setTheme((t) => ({ ...t, [field.key]: e.target.value }));
                              markDirty();
                            }}
                            className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            value={val.toUpperCase()}
                            onChange={(e) => {
                              setTheme((t) => ({ ...t, [field.key]: e.target.value }));
                              markDirty();
                            }}
                            className="w-full text-xs font-mono text-[#10253D] focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Secondary fine-grain pickers */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {[
                    { key: 'secondaryColor', label: 'Selo / secundária', fallback: '#FACC15' },
                    { key: 'accentColor', label: 'Detalhe', fallback: '#EC4899' },
                    { key: 'surfaceColor', label: 'Cartões', fallback: '#FFFFFF' },
                    { key: 'serviceCardBg', label: 'Cards de serviços', fallback: '#F7F3EA' },
                  ].map((field) => {
                    const val = String(
                      (theme as Record<string, unknown>)[field.key] || field.fallback
                    );
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600">
                          {field.label}
                        </label>
                        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : field.fallback}
                            onChange={(e) => {
                              setTheme((t) => ({ ...t, [field.key]: e.target.value }));
                              markDirty();
                            }}
                            className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent shrink-0"
                          />
                          <input
                            type="text"
                            value={val.toUpperCase()}
                            onChange={(e) => {
                              setTheme((t) => ({ ...t, [field.key]: e.target.value }));
                              markDirty();
                            }}
                            className="w-full text-[11px] font-mono text-[#10253D] focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Estilo: Fonte, Botões, Serviços e produtos, Cantos */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Estilo
                </h3>

                {/* Fonte */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#10253D]">Fonte</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FONT_STYLE_OPTIONS.map((fontOpt) => {
                      const active =
                        (theme.fontFamily || 'Plus Jakarta Sans').toLowerCase() ===
                        fontOpt.id.toLowerCase();
                      return (
                        <button
                          key={fontOpt.id}
                          type="button"
                          onClick={() => {
                            setTheme((t) => ({ ...t, fontFamily: fontOpt.id }));
                            markDirty();
                          }}
                          style={{ fontFamily: fontOpt.cssValue }}
                          className={`px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                            active
                              ? 'border-[#1677F2] bg-sky-50 text-[#10253D]'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {fontOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Botões */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#10253D]">Botões</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'solid', label: 'Preenchido' },
                      { id: 'soft', label: 'Suave' },
                      { id: 'outline', label: 'Contorno' },
                      { id: 'gradient', label: 'Degradê' },
                    ].map((btnOpt) => {
                      const active = (theme.buttonStyle || 'solid') === btnOpt.id;
                      return (
                        <button
                          key={btnOpt.id}
                          type="button"
                          onClick={() => {
                            setTheme((t) => ({
                              ...t,
                              buttonStyle: btnOpt.id as MinisiteTheme['buttonStyle'],
                            }));
                            markDirty();
                          }}
                          className={`px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                            active
                              ? 'border-[#1677F2] bg-sky-50 text-[#10253D]'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {btnOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Serviços (agenda) e produtos */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#10253D]">
                    Serviços (agenda) e produtos
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'stacked', label: 'Empilhado' },
                      { id: 'carousel', label: 'Carrossel' },
                    ].map((layoutOpt) => {
                      const active = (theme.servicesLayout || 'stacked') === layoutOpt.id;
                      return (
                        <button
                          key={layoutOpt.id}
                          type="button"
                          onClick={() => {
                            setTheme((t) => ({
                              ...t,
                              servicesLayout: layoutOpt.id as MinisiteTheme['servicesLayout'],
                            }));
                            markDirty();
                          }}
                          className={`px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                            active
                              ? 'border-[#1677F2] bg-sky-50 text-[#10253D]'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {layoutOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cantos */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#10253D]">Cantos</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'md', label: 'Retos' },
                      { id: 'xl', label: 'Arredondados' },
                      { id: 'full', label: 'Pílula' },
                    ].map((radOpt) => {
                      const active = (theme.buttonRadius || 'full') === radOpt.id;
                      return (
                        <button
                          key={radOpt.id}
                          type="button"
                          onClick={() => {
                            setTheme((t) => ({
                              ...t,
                              buttonRadius: radOpt.id as MinisiteTheme['buttonRadius'],
                            }));
                            markDirty();
                          }}
                          className={`px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                            active
                              ? 'border-[#1677F2] bg-sky-50 text-[#10253D]'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {radOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Paletas sugeridas e Template */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#1677F2]" />
                  <span>Paletas prontas & segmento</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CURATED_PALETTES.map((pal) => {
                    const isSelected =
                      theme.primaryColor?.toLowerCase() === pal.theme.primaryColor.toLowerCase() &&
                      theme.backgroundColor?.toLowerCase() ===
                        pal.theme.backgroundColor.toLowerCase();
                    return (
                      <button
                        key={pal.id}
                        type="button"
                        onClick={() => {
                          setTheme((t) => ({ ...t, ...pal.theme, serviceCardBg: undefined }));
                          markDirty();
                        }}
                        className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[#1677F2] bg-sky-50/40'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#10253D]">{pal.name}</span>
                          <div className="flex items-center gap-1">
                            {[
                              pal.theme.primaryColor,
                              pal.theme.secondaryColor,
                              pal.theme.accentColor,
                              pal.theme.backgroundColor,
                            ].map((hex, i) => (
                              <span
                                key={i}
                                className="w-3.5 h-3.5 rounded-full border border-black/15"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{pal.segmentHint}</div>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Segmento / Template base
                  </label>
                  <select
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                  >
                    {TEMPLATE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ajustes' && (
            <div className="space-y-6">
              {/* WhatsApp principal */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-[#10253D]">WhatsApp principal</h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Usado no botão flutuante e nos links diretos de atendimento.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Número com DDD
                  </label>
                  <input
                    type="text"
                    value={businessProfile.whatsapp}
                    onChange={(e) => {
                      const nextWhatsapp = e.target.value;
                      setBusinessProfile((bp) => ({ ...bp, whatsapp: nextWhatsapp }));
                      markDirty();
                    }}
                    placeholder="21971171244"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Mensagem inicial
                  </label>
                  <textarea
                    rows={2}
                    value={theme.whatsappDefaultMessage || ''}
                    onChange={(e) => {
                      setTheme((t) => ({ ...t, whatsappDefaultMessage: e.target.value }));
                      markDirty();
                    }}
                    placeholder={`Oi! Vim pelo site e quero falar com ${title || 'a equipe'}.`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(theme.fixedWhatsappButton)}
                    onChange={(e) => {
                      setTheme((t) => ({ ...t, fixedWhatsappButton: e.target.checked }));
                      markDirty();
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    Mostrar o botão flutuante do WhatsApp na parte de baixo do site. Desmarque para tirar; o número continua nos blocos que você adicionar.
                  </span>
                </label>
              </div>

              {/* Endereço do site */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <h2 className="text-sm font-bold text-[#10253D]">Endereço do site</h2>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <div className="flex-1 flex items-center rounded-lg border border-slate-300 overflow-hidden bg-white min-w-0">
                    <span className="px-3 py-2 bg-slate-50 border-r border-slate-200 text-xs font-mono text-slate-500 truncate max-w-[260px]">
                      {publicBaseUrl}/
                    </span>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlug(e.target.value.toLowerCase());
                        markDirty();
                      }}
                      className="flex-1 px-3 py-2 text-xs font-mono text-[#10253D] focus:outline-none min-w-0"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saveStatus === 'saving' || !slugValidation.valid}
                    onClick={() => void persistSave()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10253D] hover:bg-[#193556] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saveStatus === 'saving' ? 'Salvando…' : 'Salvar'}</span>
                  </button>
                </div>
                {!slugValidation.valid && (
                  <p className="text-[11px] text-red-600">{slugValidation.reason}</p>
                )}
                <p className="text-[11px] text-slate-500">
                  Ao alterar o endereço de um minisite publicado, o slug anterior fica salvo automaticamente como redirecionamento permanente (preservando parâmetros de campanha), sem exigir novo deploy.
                </p>
                {Array.isArray(minisite.slugAliases) && minisite.slugAliases.length > 0 && (
                  <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="font-semibold text-[#10253D]">Endereços anteriores redirecionando para cá: </span>
                    <span className="font-mono">
                      {minisite.slugAliases.map((a) => `/${a}`).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Publicação toggle */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h2 className="text-sm font-bold text-[#10253D]">Publicação</h2>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[#10253D]">Site publicado</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Quando desligado, o endereço mostra &ldquo;página não encontrada&rdquo;.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={minisite.status === 'publicado'}
                    disabled={publishingAction || profile?.role !== 'administrador' || isDemoSession}
                    onClick={() => {
                      if (minisite.status === 'publicado') {
                        void handleUnpublish();
                      } else {
                        void handlePublishSnapshot();
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                      minisite.status === 'publicado' ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        minisite.status === 'publicado' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2 text-[11px] text-slate-600">
                  <ShieldAlert className="w-4 h-4 text-[#1677F2] shrink-0 mt-0.5" />
                  <span>
                    Publicação oficial em <strong className="font-mono">{canonicalPublicPath}</strong> exige perfil Administrador ({profile?.role === 'administrador' ? 'autorizado' : 'não autorizado'}).
                  </span>
                </div>
              </div>

              {/* SEO */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ajustes de SEO
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Título SEO
                  </label>
                  <input
                    type="text"
                    value={seo.title || ''}
                    onChange={(e) => {
                      setSeo((s) => ({ ...s, title: e.target.value }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Descrição SEO
                  </label>
                  <textarea
                    rows={2}
                    value={seo.description || ''}
                    onChange={(e) => {
                      setSeo((s) => ({ ...s, description: e.target.value }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seo.noIndex !== false}
                    onChange={(e) => {
                      setSeo((s) => ({ ...s, noIndex: e.target.checked }));
                      markDirty();
                    }}
                  />
                  <span>Manter prévia privada não indexada (noindex) até publicação oficial</span>
                </label>
              </div>

              {!isDemoSession && profile && (
                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-red-700">Excluir este minisite</div>
                    <p className="text-[11px] text-slate-500">
                      Remove o minisite, blocos e histórico de versões permanentemente.
                    </p>
                  </div>
                  {confirmDeleteMinisite ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={deletingMinisite}
                        onClick={handleDeleteMinisite}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {deletingMinisite ? 'Excluindo…' : 'Confirmar exclusão'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteMinisite(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMinisite(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir minisite</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'compartilhar' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-[#10253D]">Seu link</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visitantes acessam diretamente pelo caminho no mesmo domínio, sem login.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Link público canônico
                  </span>
                  <StatusIndicator status={minisite.status} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-[#10253D] break-all">
                    {canonicalPublicUrl}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(canonicalPublicUrl);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#10253D] cursor-pointer"
                    >
                      {copiedUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                    {minisite.status === 'publicado' && (
                      <a
                        href={localOpenPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Abrir prévia local em ${window.location.origin}${localOpenPath}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1677F2] text-white text-xs font-semibold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Abrir</span>
                      </a>
                    )}
                  </div>
                </div>
                {minisite.status !== 'publicado' ? (
                  <p className="text-[11px] text-amber-700">
                    Este link retornará página não encontrada enquanto o minisite não for publicado.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Em desenvolvimento, &ldquo;Abrir&rdquo; testa a rota local (<span className="font-mono">{localOpenPath}</span>); o link copiado e o QR Code usam a origem pública configurada (<span className="font-mono">{publicBaseUrl}</span>), que requer a configuração pública publicada na Vercel.
                  </p>
                )}
              </div>

              {/* QR Code do site */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-[#10253D] flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-[#1677F2]" />
                      <span>QR Code do site</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Codifica automaticamente <span className="font-mono">{canonicalPublicUrl}</span>.
                    </p>
                  </div>
                  {qrCodeDataUrl && (
                    <a
                      href={qrCodeDataUrl}
                      download={`qrcode-${activeSlug}.png`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar PNG</span>
                    </a>
                  )}
                </div>
                {qrCodeDataUrl && (
                  <div className="flex items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <img
                      src={qrCodeDataUrl}
                      alt={`QR Code de ${title || minisite.title}`}
                      className="w-44 h-44 rounded-lg border border-slate-200 bg-white p-1.5"
                    />
                  </div>
                )}
              </div>

              {/* Links por canal */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-[#10253D]">Links por canal</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Use um link diferente em cada lugar para acompanhar de onde vêm seus acessos.
                  </p>
                </div>
                <div className="space-y-2">
                  {[
                    { key: 'instagram', label: 'Bio do Instagram' },
                    { key: 'tiktok', label: 'Bio do TikTok' },
                    { key: 'whatsapp', label: 'Status / mensagens do WhatsApp' },
                    { key: 'google', label: 'Perfil no Google' },
                    { key: 'nfc', label: 'Cartão NFC' },
                    { key: 'youtube', label: 'Descrição do YouTube' },
                  ].map((ch) => {
                    const chUrl = buildChannelPublicMinisiteUrl(activeSlug, ch.key, {
                      publicBaseUrl,
                    });
                    const isCopied = copiedChannelKey === ch.key;
                    return (
                      <div
                        key={ch.key}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/60"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#10253D]">{ch.label}</div>
                          <div className="text-[11px] font-mono text-slate-500 truncate">
                            {chUrl}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(chUrl);
                            setCopiedChannelKey(ch.key);
                            setTimeout(() => setCopiedChannelKey(null), 1800);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-[#10253D] shrink-0 cursor-pointer"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-[#1677F2] shrink-0" />
                  <span className="truncate">
                    Rota local ativa e compatibilidade herdada:{' '}
                    <strong className="font-mono">
                      {`${window.location.origin}${canonicalPublicPath}`}
                    </strong>
                    {' · '}
                    <span className="font-mono text-slate-500">/LinkFoco/{activeSlug}</span>
                    {' · '}
                    <span className="font-mono text-slate-500">/s/{activeSlug}</span>
                  </span>
                </div>
                {minisite.status === 'publicado' && (
                  <a
                    href={localOpenPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#1677F2] hover:underline shrink-0"
                  >
                    Abrir
                  </a>
                )}
              </div>

              <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-[#1677F2] shrink-0" />
                  <span className="truncate">
                    Prévia privada para demonstração:{' '}
                    <strong className="font-mono">{publicDemoUrl}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(`/demo/${activeSlug}`)}
                  className="text-xs font-semibold text-[#1677F2] hover:underline shrink-0 cursor-pointer"
                >
                  Abrir prévia
                </button>
              </div>
            </div>
          )}

          {activeTab === 'perfil' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#10253D]">Perfil da empresa vinculada</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atualize os dados cadastrais da empresa sincronizados com o minisite e o CRM.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Razão social / Nome comercial
                  </label>
                  <input
                    type="text"
                    value={businessProfile.name}
                    onChange={(e) => {
                      setBusinessProfile((bp) => ({ ...bp, name: e.target.value }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Categoria / Segmento
                  </label>
                  <input
                    type="text"
                    value={businessProfile.category}
                    onChange={(e) => {
                      setBusinessProfile((bp) => ({ ...bp, category: e.target.value }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    WhatsApp (DDI + DDD + número)
                  </label>
                  <input
                    type="text"
                    value={businessProfile.whatsapp}
                    onChange={(e) => {
                      setBusinessProfile((bp) => ({ ...bp, whatsapp: e.target.value }));
                      markDirty();
                    }}
                    placeholder="5521999990000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-[#10253D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Telefone fixo / comercial
                  </label>
                  <input
                    type="text"
                    value={businessProfile.phone}
                    onChange={(e) => {
                      setBusinessProfile((bp) => ({ ...bp, phone: e.target.value }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-[#10253D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Instagram
                  </label>
                  <input
                    type="text"
                    value={businessProfile.instagram}
                    onChange={(e) => {
                      setBusinessProfile((bp) => ({ ...bp, instagram: e.target.value }));
                      markDirty();
                    }}
                    placeholder="@empresa"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Site oficial
                  </label>
                  <input
                    type="text"
                    value={businessProfile.website}
                    onChange={(e) => {
                      setBusinessProfile((bp) => ({ ...bp, website: e.target.value }));
                      markDirty();
                    }}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#10253D] mb-1">
                  Endereço completo
                </label>
                <input
                  type="text"
                  value={businessProfile.address}
                  onChange={(e) => {
                    setBusinessProfile((bp) => ({ ...bp, address: e.target.value }));
                    markDirty();
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-[#10253D]"
                />
              </div>

              {!isDemoSession && profile && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={persistSave}
                    disabled={saveStatus === 'saving'}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar dados do perfil</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Live Smartphone Frame */}
        <div
          className={`lg:col-span-5 flex flex-col items-center lg:sticky lg:top-6 ${
            mobilePane === 'editar' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="w-full max-w-[365px] bg-[#10253D] p-2.5 rounded-[38px] shadow-lg">
            <div className="w-full h-[640px] rounded-[30px] overflow-y-auto bg-white">
              <MinisiteRenderer minisite={livePreviewMinisite} compact />
            </div>
          </div>

          <div className="mt-3 flex flex-col items-center gap-2">
            <div className="text-xs text-slate-500">Pré-visualização ao vivo</div>
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-[#10253D] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(theme.fixedWhatsappButton)}
                onChange={(e) => {
                  setTheme((t) => ({ ...t, fixedWhatsappButton: e.target.checked }));
                  markDirty();
                }}
              />
              <span>Botão fixo do WhatsApp</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
