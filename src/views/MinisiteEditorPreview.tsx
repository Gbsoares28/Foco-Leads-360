import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  ImagePlus,
  Layers,
  Palette,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StatusIndicator } from '../components/StatusIndicator';
import { MinisiteRenderer, type RenderableMinisite } from '../components/MinisiteRenderer';
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
  getBlockLabel,
  getBlockSummary,
  TEMPLATE_OPTIONS,
  type GalleryPhotoItem,
  type GoogleReviewItem,
  type MinisiteBlockData,
  type MinisiteBlockType,
  type MinisiteSeo,
  type MinisiteTheme,
} from '../lib/minisite-types';

interface EditorMinisiteDetail {
  id: number;
  title: string;
  slug: string;
  status: string;
  templateId: string;
  isDemo: boolean;
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
  const { apiFetch, baseDomain, profile, isDemoSession } = useAuth();
  const [minisite, setMinisite] = useState<EditorMinisiteDetail | null>(null);
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

  const hydratedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrateFromDetail = useCallback((detail: EditorMinisiteDetail) => {
    setMinisite(detail);
    setTitle(detail.title);
    setSlug(detail.slug);
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
    setSaveStatus('idle');
    setSaveError(null);
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    let active = true;
    hydratedRef.current = false;
    setLoading(true);
    apiFetch<{ minisite: EditorMinisiteDetail }>(`/api/minisites/${minisiteId}`)
      .then((res) => {
        if (active) hydrateFromDetail(res.minisite);
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

  const persistSave = useCallback(async () => {
    if (!minisite || isDemoSession || !profile) return;
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
      setMinisite(res.minisite);
      setSlug(res.minisite.slug);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar alterações.');
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
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(file);
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
    try {
      const res = await apiFetch<{ minisite: { status: string } }>(
        `/api/minisites/${minisite.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      setMinisite((prev) => (prev ? { ...prev, status: res.minisite.status } : prev));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao atualizar status.');
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

  const publicDemoUrl = `${window.location.origin}/demo/${slug || minisite.slug}`;

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
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#10253D] truncate">
                {title || minisite.title}
              </h1>
              <StatusIndicator status={minisite.status} />
            </div>
            <div className="text-xs font-mono text-slate-500 truncate">
              {slug || minisite.slug}.{baseDomain}
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
                <span>Salvar</span>
              </button>

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
                  Publicado (Admin)
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
            onClick={() => onNavigate(`/demo/${slug || minisite.slug}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir página</span>
          </button>
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
                        <img
                          src={theme.logoImage}
                          alt="Logo"
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-full object-cover border border-slate-200 bg-white shrink-0"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ backgroundColor: theme.primaryColor || '#1677F2' }}
                        >
                          {(title || 'FL').slice(0, 2).toUpperCase()}
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
                        <img
                          src={theme.coverImage}
                          alt="Capa"
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
                    <li>Logo: quadrada, 400 × 400 px (aparece redonda).</li>
                  </ul>
                </div>

                {/* 3-step Reel cover upload guidance */}
                <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-600 space-y-2">
                  <div className="font-semibold text-[#10253D]">
                    Quer usar um Reel do cliente como capa?
                  </div>
                  <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                    <li>
                      Peça ao cliente o arquivo MP4 original do Reel ou utilize o vídeo autorizado em seu aparelho.
                    </li>
                    <li>
                      Confira se o arquivo tem no máximo 30 MB e duração curta (até 15 s) para carregamento instantâneo.
                    </li>
                    <li>
                      Clique em <strong>Enviar capa</strong> acima e selecione o arquivo MP4 baixado.
                    </li>
                  </ol>
                  <p className="text-[11px] text-slate-500">
                    Use só vídeos do seu cliente, com a autorização dele. Vídeo de até 30 MB.
                  </p>
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
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-medium text-slate-600">
                                    Depoimentos importados ({((c.reviews as GoogleReviewItem[]) || []).length})
                                  </div>
                                  {((c.reviews as GoogleReviewItem[]) || []).map((rev, rIdx, arr) => (
                                    <div
                                      key={rIdx}
                                      className="p-2 rounded-lg border border-slate-200 bg-white flex items-start justify-between gap-2 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-[#10253D]">
                                          {rev.authorName} ({rev.rating}★)
                                        </span>
                                        <p className="text-slate-600 line-clamp-2">{rev.text}</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateBlockContent(index, {
                                            reviews: arr.filter((_, i) => i !== rIdx),
                                          })
                                        }
                                        className="text-red-500 p-1 cursor-pointer shrink-0"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
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
                                      <img
                                        src={img.url}
                                        alt=""
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

              <div>
                <h2 className="text-sm font-bold text-[#10253D] flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#1677F2]" />
                  <span>Paletas de cores sugeridas</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aplique uma paleta harmônica em um clique ou personalize cada cor abaixo.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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
                        className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
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
                                className="w-4 h-4 rounded-full border border-black/15"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">{pal.segmentHint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fine-grain Color Pickers */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ajuste fino de cores
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'primaryColor', label: 'Botões / destaque' },
                    { key: 'secondaryColor', label: 'Selo / secundária' },
                    { key: 'accentColor', label: 'Detalhe da capa' },
                    { key: 'backgroundColor', label: 'Fundo da página' },
                    { key: 'surfaceColor', label: 'Fundo dos cartões' },
                    { key: 'serviceCardBg', label: 'Cards de serviços' },
                    { key: 'textColor', label: 'Cor do texto' },
                  ].map((field) => {
                    const val = String(
                      (theme as Record<string, unknown>)[field.key] || '#1677F2'
                    );
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-[11px] font-medium text-slate-600">
                          {field.label}
                        </label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : '#1677F2'}
                            onChange={(e) => {
                              setTheme((t) => ({ ...t, [field.key]: e.target.value }));
                              markDirty();
                            }}
                            className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={val}
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
              </div>

              {/* Button Style, Radius & Template */}
              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Estilo dos botões
                  </label>
                  <select
                    value={theme.buttonStyle || 'solid'}
                    onChange={(e) => {
                      setTheme((t) => ({
                        ...t,
                        buttonStyle: e.target.value as MinisiteTheme['buttonStyle'],
                      }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                  >
                    <option value="solid">Sólido com relevo</option>
                    <option value="gradient">Degradê com a marca</option>
                    <option value="outline">Contorno limpo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Arredondamento
                  </label>
                  <select
                    value={theme.buttonRadius || 'xl'}
                    onChange={(e) => {
                      setTheme((t) => ({
                        ...t,
                        buttonRadius: e.target.value as MinisiteTheme['buttonRadius'],
                      }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                  >
                    <option value="md">Moderado</option>
                    <option value="xl">Cartão arredondado</option>
                    <option value="full">Pílula completa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Segmento / Template
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

                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Estilo da capa
                  </label>
                  <select
                    value={theme.heroStyle || 'card'}
                    onChange={(e) => {
                      setTheme((t) => ({
                        ...t,
                        heroStyle: e.target.value as MinisiteTheme['heroStyle'],
                      }));
                      markDirty();
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                  >
                    <option value="card">Cartão expressivo com formas</option>
                    <option value="minimal">Limpo sem formas extras</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ajustes' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-[#10253D]">Ajustes de SEO e publicação</h2>

              <div>
                <label className="block text-xs font-semibold text-[#10253D] mb-1">
                  Slug / Subdomínio
                </label>
                <div className="flex items-center rounded-lg border border-slate-300 overflow-hidden">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      markDirty();
                    }}
                    className="flex-1 px-3 py-2 text-xs font-mono text-[#10253D] focus:outline-none"
                  />
                  <span className="px-3 py-2 bg-slate-50 border-l border-slate-200 text-xs font-mono text-slate-500">
                    .{baseDomain}
                  </span>
                </div>
              </div>

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
                <span>Manter prévia privada não indexada (noindex) até aprovação oficial</span>
              </label>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-700">
                <ShieldAlert className="w-4 h-4 text-[#1677F2] shrink-0 mt-0.5" />
                <span>
                  Publicação oficial no subdomínio {slug || minisite.slug}.{baseDomain} requer
                  autorização de Administrador (
                  {profile?.role === 'administrador'
                    ? 'Você tem permissão'
                    : 'Perfil atual não autorizado'}
                  ).
                </span>
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
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-[#10253D]">Links de acesso</h2>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-[#10253D] break-all">{publicDemoUrl}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(publicDemoUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#10253D] shrink-0 cursor-pointer"
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
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1677F2] shrink-0" />
                <span>
                  Subdomínio oficial configurado: <strong className="font-mono">{slug}.{baseDomain}</strong>
                </span>
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
