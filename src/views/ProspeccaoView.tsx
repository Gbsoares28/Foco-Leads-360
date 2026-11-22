import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe,
  Link2,
  MapPin,
  Phone,
  Search,
  Sparkles,
  Star,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ProspectResult {
  placeId: string;
  name: string;
  category: string;
  types?: string[];
  description?: string;
  address: string;
  city: string;
  neighborhood: string;
  state: string;
  phone: string;
  whatsappCandidate: string;
  website: string;
  googleMapsUrl: string;
  directionsUri?: string;
  reviewsUri?: string;
  writeReviewUri?: string;
  photosUri?: string;
  rating: number | null;
  userRatingCount: number | null;
  openNow?: boolean | null;
  weekdayDescriptions?: string[];
  location: { lat: number; lng: number } | null;
  reviews?: Array<{
    authorName: string;
    authorUri?: string;
    authorPhotoUri?: string;
    rating: number;
    relativeTime: string;
    text: string;
  }>;
  photos?: Array<{
    photoName: string;
    authorAttributions?: Array<{ displayName: string; uri?: string }>;
  }>;
  leadScore: number;
  hasWebsite: boolean;
  competitorName: string;
  competitorReviews: number;
  gapReviews: number;
  opportunityReasons: string[];
}

export function ProspeccaoView({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { apiFetch, showDemoData, isDemoSession, profile, logout } = useAuth();

  const [country, setCountry] = useState('BR');
  const [stateUf, setStateUf] = useState('');
  const [city, setCity] = useState('');
  const [niche, setNiche] = useState('');
  const [neighborhoods, setNeighborhoods] = useState('');
  const [onlyWithoutWebsite, setOnlyWithoutWebsite] = useState(false);

  const [usage, setUsage] = useState({ used: 0, limit: 30, remaining: 30 });
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [topCompetitor, setTopCompetitor] = useState<{
    name: string;
    reviews: number;
    rating: number | null;
  } | null>(null);

  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sentToLeadIds, setSentToLeadIds] = useState<Record<string, boolean>>({});
  const [busyPlaceId, setBusyPlaceId] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    try {
      const res = await apiFetch<{
        usage: { used: number; limit: number; remaining: number };
      }>(`/api/prospeccao/usage?demo=${showDemoData}`);
      setUsage(res.usage);
    } catch {
      // ignore initial non-blocking load failure
    }
  }, [apiFetch, showDemoData]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !niche.trim()) {
      setError('Informe a cidade e o nicho para buscar estabelecimentos.');
      return;
    }
    setSearching(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch<{
        results: ProspectResult[];
        requestsUsed: number;
        topCompetitor: { name: string; reviews: number; rating: number | null } | null;
        usage: { used: number; limit: number; remaining: number };
      }>('/api/prospeccao/buscar', {
        method: 'POST',
        body: JSON.stringify({
          country,
          state: stateUf.trim(),
          city: city.trim(),
          niche: niche.trim(),
          neighborhoods: neighborhoods.trim(),
          isDemo: showDemoData,
        }),
      });
      setResults(res.results || []);
      setTopCompetitor(res.topCompetitor || null);
      if (res.usage) setUsage(res.usage);
      await loadUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar comércios.');
    } finally {
      setSearching(false);
    }
  };

  const handleSendToLeads = async (item: ProspectResult) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para salvar leads no CRM.');
      return;
    }
    setBusyPlaceId(`lead-${item.placeId}`);
    setError(null);
    try {
      await apiFetch('/api/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          stage: 'novo',
          serviceName: 'Minisite comercial',
          estimatedValue: 9700,
          leadScore: item.leadScore,
          competitorName: item.competitorName,
          competitorReviews: item.competitorReviews,
          gapReviews: item.gapReviews,
          notes: item.opportunityReasons.join(' · '),
          isDemo: showDemoData,
          businessPayload: {
            name: item.name,
            category: item.category || niche || 'Empresa local',
            city: item.city || city,
            neighborhood: item.neighborhood || '',
            state: item.state || stateUf,
            address: item.address || '',
            phone: item.phone || '',
            whatsapp: item.whatsappCandidate || '',
            website: item.website || '',
            googleMapsUrl: item.googleMapsUrl || '',
            googlePlaceId: item.placeId,
            sourceMetadata: {
              origin: 'google_places_prospeccao',
              rating: item.rating,
              userRatingCount: item.userRatingCount,
              googleDescription: item.description || '',
            },
          },
        }),
      });
      setSentToLeadIds((prev) => ({ ...prev, [item.placeId]: true }));
      setFeedback(`${item.name} adicionado ao Painel CRM.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar lead para o CRM.');
    } finally {
      setBusyPlaceId(null);
    }
  };

  const handleCreateMinisite = async (item: ProspectResult) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para gerar um minisite com IA.');
      return;
    }
    setBusyPlaceId(`site-${item.placeId}`);
    setError(null);
    try {
      const res = await apiFetch<{ minisite: { id: number } }>('/api/minisites', {
        method: 'POST',
        body: JSON.stringify({
          queryOrUrl: item.googleMapsUrl || `${item.name} ${item.city}`,
          googlePlaceId: item.placeId,
          confirmedName: item.name,
          confirmedCategory: item.category || niche || 'Empresa local',
          confirmedCity: item.city || city,
          confirmedNeighborhood: item.neighborhood || '',
          confirmedState: item.state || stateUf,
          confirmedAddress: item.address || '',
          confirmedPhone: item.phone || '',
          confirmedWhatsapp: item.whatsappCandidate || '',
          confirmedWebsite: item.website || '',
          resolvedMapsUrl: item.googleMapsUrl || '',
          googlePlaceData: {
            description: item.description,
            types: item.types,
            rating: item.rating,
            userRatingCount: item.userRatingCount,
            openNow: item.openNow,
            weekdayDescriptions: item.weekdayDescriptions,
            directionsUri: item.directionsUri,
            reviewsUri: item.reviewsUri,
            writeReviewUri: item.writeReviewUri,
            photosUri: item.photosUri,
            googleMapsUri: item.googleMapsUrl,
            location: item.location,
            reviews: item.reviews,
            photos: item.photos,
          },
          useAi: true,
          isDemo: showDemoData,
        }),
      });
      onNavigate(`/minisites/${res.minisite.id}/editar`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar minisite.');
      setBusyPlaceId(null);
    }
  };

  const visibleResults = onlyWithoutWebsite
    ? results.filter((r) => !r.hasWebsite)
    : results;

  const usagePercent = Math.min(100, Math.round((usage.used / Math.max(1, usage.limit)) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Buscar comércios</h1>
          <p className="text-sm text-slate-600 mt-1">
            Encontre empresas locais pelo Google Places, identifique quem ainda não tem site e crie a prévia em segundos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/minisites')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-[#10253D] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Link2 className="w-4 h-4 text-[#1677F2]" />
          <span>Criar site pelo link do Google</span>
        </button>
      </div>

      {/* Monthly Request Meter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-[240px]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#10253D]">Uso no mês (buscas Places API)</span>
            <span className="font-mono tabular-nums text-slate-600">
              {usage.used} / {usage.limit} requisições
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-[#1677F2] transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Cada bairro informado conta 1 requisição (máximo de 3 bairros por busca).
        </div>
      </div>

      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">País</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D]"
            >
              <option value="BR">🇧🇷 Brasil</option>
              <option value="PT">🇵🇹 Portugal</option>
              <option value="US">🇺🇸 Estados Unidos</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Estado / Região <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={stateUf}
              onChange={(e) => setStateUf(e.target.value)}
              placeholder="Ex: RJ, SP, MG"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">Cidade</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: Rio de Janeiro"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">Nicho</label>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Ex: Pet shop, Barbearia, Dentista"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Bairros <span className="text-slate-400 font-normal">(opcional, por vírgula)</span>
            </label>
            <input
              type="text"
              value={neighborhoods}
              onChange={(e) => setNeighborhoods(e.target.value)}
              placeholder="Tijuca, Botafogo, Méier"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWithoutWebsite}
              onChange={(e) => setOnlyWithoutWebsite(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Mostrar apenas empresas sem site cadastrado</span>
          </label>

          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>{searching ? 'Buscando no Google…' : 'Buscar oportunidades'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {(isDemoSession || !profile) && (
            <button
              type="button"
              onClick={logout}
              className="underline font-semibold text-[#10253D] cursor-pointer"
            >
              Ir para login
            </button>
          )}
        </div>
      )}

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/crm')}
            className="font-semibold underline cursor-pointer"
          >
            Abrir Painel CRM
          </button>
        </div>
      )}

      {/* Top Local Competitor Benchmark */}
      {topCompetitor && results.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            Referência local em avaliações:{' '}
            <strong className="text-[#10253D]">{topCompetitor.name}</strong>
          </div>
          <div className="font-mono tabular-nums text-slate-700">
            {topCompetitor.reviews} avaliações
            {topCompetitor.rating != null ? ` · ${topCompetitor.rating.toFixed(1)}★` : ''}
          </div>
        </div>
      )}

      {/* Results List */}
      {searching ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : visibleResults.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Exibindo <strong className="text-[#10253D] tabular-nums">{visibleResults.length}</strong>{' '}
              {visibleResults.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}
            </span>
            <span>Ordenadas por maior oportunidade comercial (0–100)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleResults.map((item) => {
              const isSent = Boolean(sentToLeadIds[item.placeId]);
              return (
                <div
                  key={item.placeId}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-[#10253D] truncate">{item.name}</h3>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{item.category || niche}</span>
                          {item.rating != null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-semibold text-[#10253D] tabular-nums">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                {item.rating.toFixed(1)} ({item.userRatingCount ?? 0})
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              item.hasWebsite
                                ? 'text-slate-600'
                                : 'text-emerald-700 font-semibold'
                            }
                          >
                            {item.hasWebsite ? 'Possui site' : 'Sem site'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-500">Oportunidade</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-[#1677F2]">
                          {item.leadScore}/100
                        </div>
                      </div>
                    </div>

                    {item.address && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{item.address}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      {item.phone && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.phone}</span>
                        </span>
                      )}
                      {item.website && (
                        <a
                          href={item.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#1677F2] hover:underline truncate max-w-[220px]"
                        >
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.website.replace(/^https?:\/\//, '')}</span>
                        </a>
                      )}
                      {item.googleMapsUrl && (
                        <a
                          href={item.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-[#10253D] hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Ficha Google</span>
                        </a>
                      )}
                    </div>

                    {item.opportunityReasons.length > 0 && (
                      <div className="text-xs text-slate-500 pt-1 border-t border-slate-100">
                        {item.opportunityReasons.join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isSent || busyPlaceId === `lead-${item.placeId}`}
                      onClick={() => handleSendToLeads(item)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                        isSent
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-300 bg-white hover:bg-slate-50 text-[#10253D]'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isSent ? 'No CRM' : 'Enviar para Leads'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyPlaceId === `site-${item.placeId}`}
                      onClick={() => handleCreateMinisite(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {busyPlaceId === `site-${item.placeId}`
                          ? 'Gerando prévia…'
                          : 'Criar minisite com IA'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="text-sm font-semibold text-[#10253D]">
            Nenhuma busca realizada nesta sessão
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Preencha cidade e nicho acima (ex: <em>Rio de Janeiro</em> + <em>Pet shop</em>) para listar empresas locais com pontuação de oportunidade e criação instantânea de minisite.
          </p>
        </div>
      )}

    </div>
  );
}
