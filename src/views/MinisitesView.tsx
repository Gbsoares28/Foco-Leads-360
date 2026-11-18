import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  Power,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StatusIndicator } from '../components/StatusIndicator';

interface MinisiteItem {
  id: number;
  businessId: number;
  title: string;
  slug: string;
  status: string;
  templateId: string;
  theme: {
    primaryColor?: string;
    logoImage?: string;
    coverImage?: string;
  };
  viewsCount: number;
  isDemo: boolean;
  updatedAt: string;
  businessName: string;
  businessCategory: string;
  businessCity: string;
}

interface MinisitesListResponse {
  items: MinisiteItem[];
  baseDomain: string;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface GooglePlaceCandidate {
  placeId: string;
  name: string;
  category: string;
  primaryType: string;
  types: string[];
  description: string;
  formattedAddress: string;
  shortAddress: string;
  city: string;
  neighborhood: string;
  state: string;
  phone: string;
  internationalPhone: string;
  whatsappCandidate: string;
  website: string;
  googleMapsUri: string;
  directionsUri: string;
  reviewsUri: string;
  writeReviewUri: string;
  rating: number | null;
  userRatingCount: number | null;
  reviews: Array<{
    authorName: string;
    authorUri?: string;
    authorPhotoUri?: string;
    rating: number;
    relativeTime: string;
    text: string;
  }>;
  weekdayDescriptions: string[];
  openNow: boolean | null;
  businessStatus: string;
  location: { lat: number; lng: number } | null;
  photos: Array<{
    photoName: string;
    authorAttributions: Array<{ displayName: string; uri?: string }>;
  }>;
}

interface ParsedGoogleResponse {
  parsed: {
    isUrl: boolean;
    validDomain: boolean;
    originalInput: string;
    resolvedUrl: string | null;
    extractedName: string | null;
    extractedQuery: string | null;
    coordinates: { lat: number; lng: number } | null;
    sourceType: 'share_google' | 'google_maps' | 'text_query';
    notes: string;
  };
  places: GooglePlaceCandidate[];
  placesWarning: string | null;
}

export function MinisitesView({
  onNavigate,
  focusCreate = false,
}: {
  onNavigate: (path: string) => void;
  focusCreate?: boolean;
}) {
  const { apiFetch, showDemoData, isDemoSession, profile, signInWithGoogle } = useAuth();
  const effectiveDemo = isDemoSession || showDemoData;

  // Creation form state
  const [queryOrUrl, setQueryOrUrl] = useState('');
  const [description, setDescription] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolvedInfo, setResolvedInfo] = useState<ParsedGoogleResponse['parsed'] | null>(null);
  const [placeCandidates, setPlaceCandidates] = useState<GooglePlaceCandidate[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<GooglePlaceCandidate | null>(null);
  const [placesWarning, setPlacesWarning] = useState<string | null>(null);

  const [confirmedName, setConfirmedName] = useState('');
  const [confirmedCategory, setConfirmedCategory] = useState('');
  const [confirmedCity, setConfirmedCity] = useState('');
  const [confirmedAddress, setConfirmedAddress] = useState('');
  const [confirmedPhone, setConfirmedPhone] = useState('');
  const [confirmedWhatsapp, setConfirmedWhatsapp] = useState('');
  const [confirmedWebsite, setConfirmedWebsite] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [lastCreatedSlug, setLastCreatedSlug] = useState<string | null>(null);

  // Listing state
  const [items, setItems] = useState<MinisiteItem[]>([]);
  const [baseDomain, setBaseDomain] = useState('focoleads360.com.br');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadMinisites = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const qs = new URLSearchParams({
        demo: effectiveDemo ? 'true' : 'false',
        search: searchTerm,
        status: statusFilter,
        page: String(page),
        pageSize: '9',
      });
      const res = await apiFetch<MinisitesListResponse>(`/api/minisites?${qs.toString()}`);
      setItems(res.items);
      setBaseDomain(res.baseDomain || 'focoleads360.com.br');
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Erro ao listar minisites.');
    } finally {
      setLoadingList(false);
    }
  }, [apiFetch, effectiveDemo, searchTerm, statusFilter, page]);

  useEffect(() => {
    loadMinisites();
  }, [loadMinisites]);

  const applyCandidate = (place: GooglePlaceCandidate) => {
    setSelectedPlace(place);
    setConfirmedName(place.name);
    setConfirmedCategory(place.category);
    setConfirmedCity(place.city || place.neighborhood);
    setConfirmedAddress(place.formattedAddress);
    setConfirmedPhone(place.phone);
    setConfirmedWhatsapp(place.whatsappCandidate);
    setConfirmedWebsite(place.website);
    if (place.description && !description.trim()) {
      setDescription(place.description);
    }
  };

  const handleResolveGoogleInput = async () => {
    setFormError(null);
    setFormSuccess(null);
    setLastCreatedSlug(null);
    if (!queryOrUrl.trim()) {
      setFormError('Cole o link do Google (share.google ou Google Maps) ou digite nome e cidade.');
      return;
    }

    setResolving(true);
    setPlacesWarning(null);
    try {
      const res = await apiFetch<ParsedGoogleResponse>('/api/google/resolve-link', {
        method: 'POST',
        body: JSON.stringify({ input: queryOrUrl }),
      });
      setResolvedInfo(res.parsed);
      setPlaceCandidates(res.places || []);
      setPlacesWarning(res.placesWarning || null);

      if (res.places && res.places.length > 0) {
        applyCandidate(res.places[0]);
      } else {
        setSelectedPlace(null);
        setConfirmedName(res.parsed.extractedName || queryOrUrl.trim());
        setConfirmedCategory('');
        setConfirmedCity('');
        setConfirmedAddress('');
        setConfirmedPhone('');
        setConfirmedWhatsapp('');
        setConfirmedWebsite('');
      }
    } catch (err) {
      setResolvedInfo(null);
      setPlaceCandidates([]);
      setSelectedPlace(null);
      setFormError(err instanceof Error ? err.message : 'Erro ao validar o endereço.');
    } finally {
      setResolving(false);
    }
  };

  const handleCreateMinisite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setLastCreatedSlug(null);

    if (isDemoSession || !profile) {
      setFormError('Para criar e persistir novos minisites, entre com sua conta Google corporativa.');
      return;
    }

    if (!queryOrUrl.trim() && !description.trim() && !confirmedName.trim()) {
      setFormError('Informe o link do Google, nome da empresa ou uma descrição do negócio.');
      return;
    }

    setCreating(true);
    try {
      const firstPhoto = selectedPlace?.photos?.[0];
      const res = await apiFetch<{
        minisite: MinisiteItem;
        aiUsed: boolean;
        aiNote: string | null;
      }>('/api/minisites', {
        method: 'POST',
        body: JSON.stringify({
          queryOrUrl: queryOrUrl.trim(),
          description: description.trim(),
          googlePlaceId: selectedPlace?.placeId || '',
          confirmedName: confirmedName.trim(),
          confirmedCategory: confirmedCategory.trim(),
          confirmedCity: confirmedCity.trim(),
          confirmedNeighborhood: selectedPlace?.neighborhood || '',
          confirmedState: selectedPlace?.state || '',
          confirmedAddress: confirmedAddress.trim(),
          confirmedPhone: confirmedPhone.trim(),
          confirmedWhatsapp: confirmedWhatsapp.trim(),
          confirmedWebsite: confirmedWebsite.trim(),
          resolvedMapsUrl: selectedPlace?.googleMapsUri || resolvedInfo?.resolvedUrl || '',
          googlePlaceData: selectedPlace
            ? {
                description: selectedPlace.description,
                types: selectedPlace.types,
                rating: selectedPlace.rating,
                userRatingCount: selectedPlace.userRatingCount,
                openNow: selectedPlace.openNow,
                weekdayDescriptions: selectedPlace.weekdayDescriptions,
                directionsUri: selectedPlace.directionsUri,
                reviewsUri: selectedPlace.reviewsUri,
                writeReviewUri: selectedPlace.writeReviewUri,
                location: selectedPlace.location,
                reviews: selectedPlace.reviews,
                photos: selectedPlace.photos.map((p) => ({
                  photoName: p.photoName,
                  authorAttributions: p.authorAttributions,
                })),
                firstPhotoName: firstPhoto?.photoName,
                firstPhotoAttribution: firstPhoto?.authorAttributions?.[0],
              }
            : undefined,
          useAi: true,
          isDemo: effectiveDemo,
        }),
      });

      setLastCreatedSlug(res.minisite.slug);
      setFormSuccess(
        `Minisite "${res.minisite.title}" criado (${res.aiUsed ? 'estruturado com IA' : 'estrutura inicial'}).`
      );
      onNavigate(`/minisites/${res.minisite.id}/editar`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar minisite.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyAddress = (slug: string) => {
    const shareUrl = `${window.location.origin}/demo/${slug}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleStatusChange = async (minisiteId: number, nextStatus: string) => {
    setStatusActionError(null);
    if (isDemoSession || !profile) {
      setStatusActionError('Entre com sua conta Google para alterar o status de publicação.');
      return;
    }
    try {
      await apiFetch(`/api/minisites/${minisiteId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadMinisites();
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : 'Falha ao alterar status.');
    }
  };

  const handleDeleteMinisite = async (minisiteId: number) => {
    setStatusActionError(null);
    if (isDemoSession || !profile) {
      setStatusActionError('Entre com sua conta Google corporativa para excluir minisites.');
      setConfirmDeleteId(null);
      return;
    }
    setDeletingId(minisiteId);
    try {
      await apiFetch(`/api/minisites/${minisiteId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      setItems((prev) => prev.filter((item) => item.id !== minisiteId));
      await loadMinisites();
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : 'Falha ao excluir minisite.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Minisites</h1>
        <p className="mt-1 text-sm text-slate-600">
          Transforme as informações de uma empresa no Google em um minisite profissional com
          inteligência artificial.
        </p>
      </div>

      {/* Creation Form */}
      <form
        onSubmit={handleCreateMinisite}
        className={`bg-white border rounded-xl p-6 space-y-4 ${
          focusCreate ? 'border-[#1677F2]' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[#10253D]">Novo minisite com IA</h2>
          {isDemoSession && (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="text-xs font-semibold text-[#1677F2] hover:underline text-left cursor-pointer"
            >
              Entre com Google para habilitar criação real
            </button>
          )}
        </div>

        {/* Primary Input + Buscar */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Link do Google (share.google, maps.app.goo.gl, Google Maps) ou nome da empresa e cidade
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={queryOrUrl}
              onChange={(e) => setQueryOrUrl(e.target.value)}
              placeholder="Cole o link do Google da empresa (ex: https://share.google/...) ou digite nome e cidade."
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] placeholder:text-slate-400 focus:outline-none focus:border-[#1677F2]"
            />
            <button
              type="button"
              onClick={handleResolveGoogleInput}
              disabled={resolving}
              className="px-5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-[#10253D] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {resolving ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>

        {/* Google Places Confirmation Box */}
        {resolvedInfo && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#1677F2] mt-0.5 shrink-0" />
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-[#10253D]">Identificação Google:</span>{' '}
                  {resolvedInfo.notes}
                </div>
              </div>
              {resolvedInfo.resolvedUrl && (
                <a
                  href={resolvedInfo.resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#1677F2] hover:underline whitespace-nowrap shrink-0"
                >
                  Abrir link resolvido
                </a>
              )}
            </div>

            {placesWarning && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                {placesWarning}
              </div>
            )}

            {/* Candidate list returned by Google Places API (New) */}
            {placeCandidates.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#10253D]">
                  {placeCandidates.length === 1
                    ? 'Empresa localizada na Google Places API:'
                    : `Selecione a empresa correta (${placeCandidates.length} encontradas):`}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {placeCandidates.map((cand) => {
                    const isSelected = selectedPlace?.placeId === cand.placeId;
                    const firstPhoto = cand.photos?.[0];
                    return (
                      <button
                        key={cand.placeId}
                        type="button"
                        onClick={() => applyCandidate(cand)}
                        className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex gap-3 items-start ${
                          isSelected
                            ? 'bg-white border-[#1677F2]'
                            : 'bg-white/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {firstPhoto ? (
                          <div className="w-16 shrink-0">
                            <img
                              src={`/api/google/place-photo?name=${encodeURIComponent(
                                firstPhoto.photoName
                              )}&w=240`}
                              alt={cand.name}
                              referrerPolicy="no-referrer"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                            {cand.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#10253D] truncate">
                              {cand.name}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-[#1677F2] shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{cand.category}</div>
                          <div className="text-xs text-slate-600 line-clamp-2">
                            {cand.formattedAddress}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                            {cand.rating != null && (
                              <span className="inline-flex items-center gap-1 font-medium text-[#10253D]">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                <span className="tabular-nums">
                                  {cand.rating.toFixed(1)} ({cand.userRatingCount ?? 0})
                                </span>
                              </span>
                            )}
                            {cand.phone && (
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                <Phone className="w-3 h-3" />
                                {cand.phone}
                              </span>
                            )}
                            {cand.website && (
                              <span className="inline-flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                Site
                              </span>
                            )}
                            {cand.weekdayDescriptions.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Horários
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Editable Confirmation Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Nome confirmado
                </label>
                <input
                  type="text"
                  value={confirmedName}
                  onChange={(e) => setConfirmedName(e.target.value)}
                  placeholder="Nome da empresa"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Segmento / Categoria
                </label>
                <input
                  type="text"
                  value={confirmedCategory}
                  onChange={(e) => setConfirmedCategory(e.target.value)}
                  placeholder="Segmento"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Cidade / Bairro
                </label>
                <input
                  type="text"
                  value={confirmedCity}
                  onChange={(e) => setConfirmedCity(e.target.value)}
                  placeholder="Cidade"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Endereço
                </label>
                <input
                  type="text"
                  value={confirmedAddress}
                  onChange={(e) => setConfirmedAddress(e.target.value)}
                  placeholder="Endereço confirmado"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  WhatsApp (opcional)
                </label>
                <input
                  type="text"
                  value={confirmedWhatsapp}
                  onChange={(e) => setConfirmedWhatsapp(e.target.value)}
                  placeholder={confirmedPhone ? `Tel: ${confirmedPhone}` : '5521999990000'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D]"
                />
              </div>
            </div>

            {selectedPlace && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-[#10253D]">Dados prontos para importação:</span>
                  <span>{selectedPlace.photos.length} foto(s)</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPlace.reviews.length} avaliação(ões) Google</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPlace.weekdayDescriptions.length} dia(s) de horário</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPlace.location ? 'Mapa com pino' : 'Sem coordenadas'}</span>
                </div>
                {selectedPlace.description && (
                  <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5">
                    <span className="font-semibold text-[#10253D]">Descrição da ficha Google: </span>
                    {selectedPlace.description}
                  </p>
                )}
                {selectedPlace.photos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedPlace.photos.slice(0, 6).map((ph, idx) => (
                      <img
                        key={ph.photoName}
                        src={`/api/google/place-photo?name=${encodeURIComponent(ph.photoName)}&w=240`}
                        alt={`${selectedPlace.name} ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Complementary Description */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Descrição complementar (opcional)
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ou descreva o negócio: serviços, preços, Instagram, diferenciais, endereço..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] placeholder:text-slate-400 focus:outline-none focus:border-[#1677F2]"
          />
        </div>

        {formError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {formError}
          </div>
        )}
        {formSuccess && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-3">
            <span>{formSuccess}</span>
            {lastCreatedSlug && (
              <button
                type="button"
                onClick={() => onNavigate(`/demo/${lastCreatedSlug}`)}
                className="font-semibold underline text-emerald-900 whitespace-nowrap cursor-pointer"
              >
                Abrir prévia agora
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500">
            Importação direta via Google Places API (New) com atribuição obrigatória e zero dados
            inventados.
          </p>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            <span>{creating ? 'Gerando estrutura...' : 'Criar minisite com IA'}</span>
          </button>
        </div>
      </form>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setPage(1);
              setSearchTerm(e.target.value);
            }}
            placeholder="Buscar por nome, empresa, slug ou cidade..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'demonstracao', label: 'Demonstração' },
            { id: 'rascunho', label: 'Rascunho' },
            { id: 'publicado', label: 'Publicados' },
            { id: 'desativado', label: 'Desativados' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setPage(1);
                setStatusFilter(tab.id);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-[#10253D] shadow-sm'
                  : 'text-slate-600 hover:text-[#10253D]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {statusActionError && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {statusActionError}
        </div>
      )}

      {/* Cards Listing */}
      {loadingList ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : listError ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {listError}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm text-slate-600">
            Nenhum minisite encontrado para os filtros aplicados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((item) => {
            const fullSubdomain = `${item.slug}.${baseDomain}`;
            const updatedStr = new Date(item.updatedAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.theme?.logoImage ? (
                        <img
                          src={item.theme.logoImage}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ backgroundColor: item.theme?.primaryColor || '#10253D' }}
                        >
                          {item.title.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#10253D] truncate">{item.title}</h3>
                        <div className="text-xs text-slate-500 truncate">
                          {item.businessName}
                        </div>
                      </div>
                    </div>

                    <StatusIndicator status={item.status} />
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="text-xs font-mono text-[#1677F2] truncate">{fullSubdomain}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums font-medium text-slate-700">
                        {item.viewsCount} visualizações
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Atualizado em {updatedStr}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onNavigate(`/minisites/${item.id}/editar`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate(`/demo/${item.slug}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyAddress(item.slug)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer"
                    >
                      {copiedSlug === item.slug ? (
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

                  <div className="flex items-center gap-1.5">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      aria-label={`Status de ${item.title}`}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer"
                    >
                      <option value="rascunho">Rascunho</option>
                      <option value="demonstracao">Demonstração</option>
                      <option value="publicado">Publicado (Admin)</option>
                      <option value="desativado">Desativado</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusChange(
                          item.id,
                          item.status === 'desativado' ? 'demonstracao' : 'desativado'
                        )
                      }
                      title={item.status === 'desativado' ? 'Reativar' : 'Desativar'}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>

                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={() => handleDeleteMinisite(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <span>{deletingId === item.id ? 'Excluindo…' : 'Confirmar'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-medium text-red-600 cursor-pointer"
                        title="Excluir minisite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500 tabular-nums">
            Página {page} de {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-[#10253D] disabled:opacity-50 cursor-pointer"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-[#10253D] disabled:opacity-50 cursor-pointer"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
