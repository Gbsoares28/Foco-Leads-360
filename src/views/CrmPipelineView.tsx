import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  LayoutGrid,
  List,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { interpolateScriptVariables } from '../lib/default-scripts';

interface CrmLead {
  id: number;
  businessId: number;
  minisiteId: number | null;
  stage: string;
  estimatedValue: number;
  serviceName: string;
  leadScore: number;
  competitorName: string;
  competitorReviews: number;
  gapReviews: number;
  notes: string;
  updatedAt: string;
  businessName: string;
  businessCategory: string;
  businessCity: string;
  businessPhone: string;
  businessWhatsapp: string;
  businessWebsite: string;
  businessMapsUrl: string | null;
  businessMetadata: Record<string, unknown> | null;
  minisiteSlug: string | null;
  minisiteViews: number | null;
  minisiteStatus: string | null;
}

interface CrmStageDef {
  id: string;
  label: string;
}

interface OperatorSettings {
  operatorName: string;
  operatorCity: string;
  sitePriceLabel: string;
  platePriceLabel: string;
  baseDomain: string;
  whatsappConnected: boolean;
}

interface CommercialScript {
  id: number;
  stageKey: string;
  stageOrder: number;
  stageTitle: string;
  title: string;
  body: string;
}

function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function CrmPipelineView({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { apiFetch, showDemoData, isDemoSession, profile, signInWithGoogle } = useAuth();

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<CrmStageDef[]>([
    { id: 'novo', label: 'Novo' },
    { id: 'chamado', label: 'Chamado' },
    { id: 'respondeu', label: 'Responderam' },
    { id: 'negociando', label: 'Negociando' },
    { id: 'fechou', label: 'Fechou' },
    { id: 'perdido', label: 'Perdido' },
  ]);
  const [settings, setSettings] = useState<OperatorSettings>({
    operatorName: '',
    operatorCity: '',
    sitePriceLabel: 'R$ 97/mês',
    platePriceLabel: 'R$ 79,00',
    baseDomain: 'focoleads360.com.br',
    whatsappConnected: false,
  });
  const [scripts, setScripts] = useState<CommercialScript[]>([]);
  const [businesses, setBusinesses] = useState<
    Array<{ id: number; name: string; city: string; category: string }>
  >([]);

  const [viewMode, setViewMode] = useState<'quadro' | 'lista'>('quadro');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({
    businessId: '',
    name: '',
    category: 'Empresa local',
    city: '',
    whatsapp: '',
    estimatedValueReais: '97',
    notes: '',
  });
  const [savingNew, setSavingNew] = useState(false);

  const [outreachLead, setOutreachLead] = useState<CrmLead | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [crmRes, scriptsRes, bizRes] = await Promise.all([
        apiFetch<{ leads: CrmLead[]; stages: CrmStageDef[]; settings: OperatorSettings }>(
          `/api/crm/leads?demo=${showDemoData}`
        ),
        apiFetch<{ scripts: CommercialScript[] }>('/api/scripts'),
        apiFetch<{ items: Array<{ id: number; name: string; city: string; category: string }> }>(
          `/api/businesses?demo=${showDemoData}`
        ),
      ]);
      setLeads(crmRes.leads || []);
      if (crmRes.stages?.length) setStages(crmRes.stages);
      if (crmRes.settings) setSettings(crmRes.settings);
      setScripts(scriptsRes.scripts || []);
      setBusinesses(bizRes.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar Painel CRM.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showDemoData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.businessName.toLowerCase().includes(q) ||
        l.businessCategory.toLowerCase().includes(q) ||
        l.businessCity.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const kpis = useMemo(() => {
    const total = leads.length;
    const chamados = leads.filter((l) => l.stage === 'chamado').length;
    const responderam = leads.filter((l) =>
      ['respondeu', 'negociando'].includes(l.stage)
    ).length;
    const fechadosList = leads.filter((l) => l.stage === 'fechou');
    const faturadoCents = fechadosList.reduce((acc, item) => acc + (item.estimatedValue || 0), 0);
    return {
      total,
      chamados,
      responderam,
      fechados: fechadosList.length,
      faturadoCents,
    };
  }, [leads]);

  const handleStageChange = async (leadId: number, nextStage: string) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para mover leads no funil.');
      return;
    }
    const prev = leads;
    setLeads((curr) => curr.map((l) => (l.id === leadId ? { ...l, stage: nextStage } : l)));
    try {
      await apiFetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: nextStage }),
      });
    } catch (err) {
      setLeads(prev);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar etapa.');
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    if (isDemoSession || !profile) return;
    try {
      await apiFetch(`/api/crm/leads/${leadId}`, { method: 'DELETE' });
      setLeads((curr) => curr.filter((l) => l.id !== leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover lead.');
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSession || !profile) {
      setError('Entre com Google para criar leads.');
      return;
    }
    setSavingNew(true);
    setError(null);
    try {
      const valueCents = Math.round((parseFloat(newForm.estimatedValueReais) || 0) * 100);
      await apiFetch('/api/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          businessId: newForm.businessId ? Number(newForm.businessId) : undefined,
          businessPayload: !newForm.businessId
            ? {
                name: newForm.name.trim(),
                category: newForm.category.trim() || 'Empresa local',
                city: newForm.city.trim(),
                whatsapp: newForm.whatsapp.trim(),
              }
            : undefined,
          stage: 'novo',
          estimatedValue: valueCents,
          notes: newForm.notes.trim(),
          isDemo: showDemoData,
        }),
      });
      setShowNewModal(false);
      setNewForm({
        businessId: '',
        name: '',
        category: 'Empresa local',
        city: '',
        whatsapp: '',
        estimatedValueReais: '97',
        notes: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar lead.');
    } finally {
      setSavingNew(false);
    }
  };

  const activeScript = useMemo(() => {
    if (!scripts.length) return null;
    return scripts.find((s) => s.id === selectedScriptId) || scripts[0];
  }, [scripts, selectedScriptId]);

  const renderedOutreachText = useMemo(() => {
    if (!outreachLead || !activeScript) return '';
    const meta = outreachLead.businessMetadata || {};
    const ratingVal = typeof meta.rating === 'number' ? meta.rating.toFixed(1) : '—';
    const reviewsVal =
      typeof meta.userRatingCount === 'number' ? meta.userRatingCount : '0';
    const siteLink = outreachLead.minisiteSlug
      ? `${window.location.origin}/demo/${outreachLead.minisiteSlug}`
      : `https://${settings.baseDomain}`;

    return interpolateScriptVariables(activeScript.body, {
      meu_nome: settings.operatorName,
      minha_cidade: settings.operatorCity,
      negocio: outreachLead.businessName,
      link_site: siteLink,
      preco_site: settings.sitePriceLabel,
      avaliacoes: reviewsVal,
      nota: ratingVal,
      concorrente: outreachLead.competitorName,
      concorrente_avaliacoes: outreachLead.competitorReviews,
      gap: outreachLead.gapReviews,
      preco: settings.platePriceLabel,
      link_avaliacao: outreachLead.businessMapsUrl || '',
    });
  }, [activeScript, outreachLead, settings]);

  const needsOperatorConfig = !settings.operatorName || !settings.operatorCity;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Painel de Leads</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Acompanhe abordagens, visualizações de prévia e fechamentos em cada etapa do funil.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('quadro')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                viewMode === 'quadro' ? 'bg-white text-[#10253D] shadow-sm' : 'text-slate-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Quadro</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('lista')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                viewMode === 'lista' ? 'bg-white text-[#10253D] shadow-sm' : 'text-slate-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lead</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Leads', value: String(kpis.total), tone: 'text-[#10253D]' },
          { label: 'Chamados', value: String(kpis.chamados), tone: 'text-[#1677F2]' },
          { label: 'Responderam', value: String(kpis.responderam), tone: 'text-amber-600' },
          { label: 'Fechados', value: String(kpis.fechados), tone: 'text-emerald-700' },
          {
            label: 'Faturado',
            value: formatBRLFromCents(kpis.faturadoCents),
            tone: 'text-[#10253D]',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 font-medium">{kpi.label}</div>
            <div className={`text-xl font-bold font-mono tabular-nums mt-1 ${kpi.tone}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Config Reminder + Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no quadro…"
            className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm text-[#10253D] focus:outline-none focus:border-[#1677F2]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {needsOperatorConfig && (
            <button
              type="button"
              onClick={() => onNavigate('/configuracoes')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 font-medium hover:bg-amber-100 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Defina seu nome e cidade em Config para personalizar os scripts</span>
            </button>
          )}
          <span className="text-slate-500">
            WhatsApp:{' '}
            <strong className={settings.whatsappConnected ? 'text-emerald-700' : 'text-slate-700'}>
              {settings.whatsappConnected ? 'Conectado' : 'Via link wa.me'}
            </strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          {(isDemoSession || !profile) && (
            <button type="button" onClick={signInWithGoogle} className="underline font-semibold cursor-pointer">
              Entrar com Google
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="h-72 rounded-xl bg-white border border-slate-200 animate-pulse" />
      ) : viewMode === 'quadro' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
          {stages.map((stage) => {
            const colLeads = filteredLeads.filter((l) => l.stage === stage.id);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedId != null) {
                    handleStageChange(draggedId, stage.id);
                    setDraggedId(null);
                  }
                }}
                className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 space-y-2.5 min-h-[260px]"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-[#10253D]">{stage.label}</span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {colLeads.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {colLeads.map((lead) => {
                    const meta = lead.businessMetadata || {};
                    const rating = typeof meta.rating === 'number' ? meta.rating : null;
                    const reviewsCount =
                      typeof meta.userRatingCount === 'number' ? meta.userRatingCount : null;
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDraggedId(lead.id)}
                        className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-bold text-[#10253D] leading-snug">
                            {lead.businessName}
                          </div>
                          {lead.leadScore > 0 && (
                            <span className="text-[11px] font-mono tabular-nums text-[#1677F2] font-semibold shrink-0">
                              {lead.leadScore}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1">
                          <span>{lead.businessCategory}</span>
                          {rating != null && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5 text-[#10253D] font-medium tabular-nums">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                {rating.toFixed(1)} ({reviewsCount ?? 0})
                              </span>
                            </>
                          )}
                        </div>

                        {lead.minisiteSlug && (
                          <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                            <Eye className="w-3 h-3 text-[#1677F2] shrink-0" />
                            <span>
                              abriu a prévia{' '}
                              <strong className="font-mono tabular-nums">
                                {lead.minisiteViews ?? 0}x
                              </strong>
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setOutreachLead(lead);
                              setSelectedScriptId(scripts[0]?.id ?? null);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Abordar</span>
                          </button>

                          <select
                            value={lead.stage}
                            onChange={(e) => handleStageChange(lead.id, e.target.value)}
                            aria-label="Etapa"
                            className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700"
                          >
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}

                  {colLeads.length === 0 && (
                    <div className="py-6 text-center text-[11px] text-slate-400">
                      Arraste um lead para cá
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table List View */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Etapa</th>
                  <th className="py-3 px-4">Prévia</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#10253D]">{lead.businessName}</div>
                      <div className="text-slate-500">
                        {lead.businessCategory}
                        {lead.businessCity ? ` · ${lead.businessCity}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={lead.stage}
                        onChange={(e) => handleStageChange(lead.id, e.target.value)}
                        className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 tabular-nums text-slate-600">
                      {lead.minisiteSlug ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(`/demo/${lead.minisiteSlug}`)}
                          className="text-[#1677F2] hover:underline cursor-pointer"
                        >
                          {lead.minisiteViews ?? 0} visualizações
                        </button>
                      ) : (
                        'Sem minisite'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#10253D]">
                      {formatBRLFromCents(lead.estimatedValue || 0)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOutreachLead(lead);
                            setSelectedScriptId(scripts[0]?.id ?? null);
                          }}
                          className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                        >
                          Abordar
                        </button>
                        {!isDemoSession && profile && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLead(lead.id)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Remover lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Nenhum lead encontrado. Use a aba Buscar ou clique em + Novo Lead.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: + Novo Lead */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateLead}
            className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#10253D]">Adicionar novo lead</h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {businesses.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-[#10253D] mb-1">
                  Vincular empresa já cadastrada (opcional)
                </label>
                <select
                  value={newForm.businessId}
                  onChange={(e) => setNewForm((f) => ({ ...f, businessId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  <option value="">Cadastrar nova empresa abaixo</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.city ? `· ${b.city}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!newForm.businessId && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#10253D] mb-1">
                    Nome do negócio
                  </label>
                  <input
                    type="text"
                    required
                    value={newForm.name}
                    onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Padaria Pão Quente"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#10253D] mb-1">
                      Segmento
                    </label>
                    <input
                      type="text"
                      value={newForm.category}
                      onChange={(e) => setNewForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#10253D] mb-1">
                      WhatsApp
                    </label>
                    <input
                      type="text"
                      value={newForm.whatsapp}
                      onChange={(e) => setNewForm((f) => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="5521999990000"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#10253D] mb-1">
                  Valor estimado (R$)
                </label>
                <input
                  type="number"
                  value={newForm.estimatedValueReais}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, estimatedValueReais: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#10253D] mb-1">
                  Cidade
                </label>
                <input
                  type="text"
                  value={newForm.city}
                  onChange={(e) => setNewForm((f) => ({ ...f, city: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                Observações iniciais
              </label>
              <textarea
                rows={2}
                value={newForm.notes}
                onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingNew}
                className="px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer"
              >
                {savingNew ? 'Salvando…' : 'Salvar Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Abordar com Script */}
      {outreachLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#10253D]">
                  Abordar {outreachLead.businessName}
                </h2>
                <p className="text-xs text-slate-500">
                  Escolha um script pronto com as variáveis preenchidas automaticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOutreachLead(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                Selecionar script comercial
              </label>
              <select
                value={activeScript?.id ?? ''}
                onChange={(e) => setSelectedScriptId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              >
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stageTitle} — {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-[#10253D] whitespace-pre-line leading-relaxed">
              {renderedOutreachText}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(renderedOutreachText);
                  setCopiedMsg(true);
                  setTimeout(() => setCopiedMsg(false), 1800);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer"
              >
                {copiedMsg ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar mensagem</span>
                  </>
                )}
              </button>

              {(() => {
                const digits = (
                  outreachLead.businessWhatsapp ||
                  outreachLead.businessPhone ||
                  ''
                ).replace(/\D/g, '');
                const waUrl = digits
                  ? `https://wa.me/${digits}?text=${encodeURIComponent(renderedOutreachText)}`
                  : `https://wa.me/?text=${encodeURIComponent(renderedOutreachText)}`;
                return (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (outreachLead.stage === 'novo' && !isDemoSession && profile) {
                        handleStageChange(outreachLead.id, 'chamado');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Abrir no WhatsApp</span>
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
