import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  MessageCircle,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { interpolateScriptVariables, SCRIPT_VARIABLES } from '../lib/default-scripts';
import { buildPublicMinisiteUrl } from '../lib/slug-utils';

interface CommercialScript {
  id: number;
  stageKey: string;
  stageOrder: number;
  stageTitle: string;
  title: string;
  body: string;
  isDefault: boolean;
}

interface BusinessOption {
  id: number;
  name: string;
  whatsapp: string;
  phone: string;
  googleMapsUrl: string | null;
  sourceMetadata: Record<string, unknown> | null;
}

interface OperatorSettings {
  operatorName: string;
  operatorCity: string;
  sitePriceLabel: string;
  platePriceLabel: string;
  baseDomain: string;
}

export function ScriptsView() {
  const { apiFetch, showDemoData, isDemoSession, profile, logout } = useAuth();

  const [scripts, setScripts] = useState<CommercialScript[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [minisites, setMinisites] = useState<
    Array<{ businessId: number; slug: string; status?: string }>
  >([]);
  const [settings, setSettings] = useState<OperatorSettings>({
    operatorName: '',
    operatorCity: '',
    sitePriceLabel: 'R$ 97/mês',
    platePriceLabel: 'R$ 79,00',
    baseDomain: 'linkfoco.com.br',
  });

  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Edit script state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // New script per stage
  const [creatingStageKey, setCreatingStageKey] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scriptsRes, settingsRes, bizRes, msRes] = await Promise.all([
        apiFetch<{ scripts: CommercialScript[] }>('/api/scripts'),
        apiFetch<{ settings: OperatorSettings }>('/api/settings'),
        apiFetch<{ items: BusinessOption[] }>(`/api/businesses?demo=${showDemoData}`),
        apiFetch<{ items: Array<{ businessId: number; slug: string; status?: string }> }>(
          `/api/minisites?demo=${showDemoData}&pageSize=50`
        ),
      ]);
      setScripts(scriptsRes.scripts || []);
      if (settingsRes.settings) setSettings(settingsRes.settings);
      setBusinesses(bizRes.items || []);
      setMinisites(msRes.items || []);
      if (bizRes.items?.length && !selectedBusinessId) {
        setSelectedBusinessId(String(bizRes.items[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar scripts.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedBusinessId, showDemoData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stages = useMemo(() => {
    const grouped = new Map<
      string,
      { stageKey: string; stageOrder: number; stageTitle: string; items: CommercialScript[] }
    >();
    for (const s of scripts) {
      if (!grouped.has(s.stageKey)) {
        grouped.set(s.stageKey, {
          stageKey: s.stageKey,
          stageOrder: s.stageOrder,
          stageTitle: s.stageTitle,
          items: [],
        });
      }
      grouped.get(s.stageKey)!.items.push(s);
    }
    return Array.from(grouped.values()).sort((a, b) => a.stageOrder - b.stageOrder);
  }, [scripts]);

  const selectedBiz = useMemo(
    () => businesses.find((b) => String(b.id) === selectedBusinessId) || null,
    [businesses, selectedBusinessId]
  );

  const previewText = useCallback(
    (body: string) => {
      const linkedMs = selectedBiz
        ? minisites.find((m) => m.businessId === selectedBiz.id)
        : null;
      const meta = (selectedBiz?.sourceMetadata || {}) as Record<string, unknown>;
      return interpolateScriptVariables(body, {
        meu_nome: settings.operatorName,
        minha_cidade: settings.operatorCity,
        negocio: selectedBiz?.name || 'Nosso Pet Favorito',
        link_site: linkedMs?.slug
          ? linkedMs.status === 'publicado'
            ? buildPublicMinisiteUrl(linkedMs.slug)
            : `${window.location.origin}/demo/${linkedMs.slug}`
          : buildPublicMinisiteUrl('nosso-pet-favorito'),
        preco_site: settings.sitePriceLabel,
        avaliacoes: typeof meta.userRatingCount === 'number' ? meta.userRatingCount : 38,
        nota: typeof meta.rating === 'number' ? meta.rating.toFixed(1) : '4.9',
        concorrente: 'Concorrente Líder',
        concorrente_avaliacoes: 185,
        gap: 147,
        preco: settings.platePriceLabel,
        link_avaliacao: selectedBiz?.googleMapsUrl || 'https://g.page/r/exemplo/review',
      });
    },
    [minisites, selectedBiz, settings]
  );

  const insertVariable = (token: string, mode: 'edit' | 'new') => {
    if (mode === 'edit') {
      const el = editTextareaRef.current;
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = editBody.slice(0, start) + token + editBody.slice(end);
        setEditBody(next);
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start + token.length, start + token.length);
        }, 10);
      } else {
        setEditBody((b) => `${b} ${token}`);
      }
    } else {
      setNewBody((b) => `${b} ${token}`);
    }
  };

  const handleSaveEdit = async (id: number) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para editar scripts.');
      return;
    }
    try {
      const res = await apiFetch<{ script: CommercialScript }>(`/api/scripts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() }),
      });
      setScripts((prev) => prev.map((s) => (s.id === id ? res.script : s)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar script.');
    }
  };

  const handleCreateScript = async (
    stageKey: string,
    stageOrder: number,
    stageTitle: string
  ) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para criar scripts.');
      return;
    }
    try {
      const res = await apiFetch<{ script: CommercialScript }>('/api/scripts', {
        method: 'POST',
        body: JSON.stringify({
          stageKey,
          stageOrder,
          stageTitle,
          title: newTitle.trim(),
          body: newBody.trim(),
        }),
      });
      setScripts((prev) => [...prev, res.script]);
      setCreatingStageKey(null);
      setNewTitle('');
      setNewBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar script.');
    }
  };

  const handleDelete = async (id: number) => {
    if (isDemoSession || !profile) return;
    try {
      await apiFetch(`/api/scripts/${id}`, { method: 'DELETE' });
      setScripts((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir script.');
    }
  };

  const handleRestoreDefaults = async () => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para restaurar os scripts padrão.');
      return;
    }
    try {
      const res = await apiFetch<{ scripts: CommercialScript[] }>('/api/scripts/restore', {
        method: 'POST',
      });
      setScripts(res.scripts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar scripts padrão.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Scripts comerciais</h1>
          <p className="text-sm text-slate-600 mt-1">
            Sequência completa em 8 etapas com variáveis dinâmicas preenchidas com os dados reais da empresa.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRestoreDefaults}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar scripts padrão</span>
        </button>
      </div>

      {/* Variable Simulator Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#10253D]">Simular com empresa:</span>
          <select
            value={selectedBusinessId}
            onChange={(e) => setSelectedBusinessId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-[#10253D]"
          >
            <option value="">Exemplo padrão (Nosso Pet Favorito)</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span>Variáveis disponíveis:</span>
          {SCRIPT_VARIABLES.slice(0, 6).map((v) => (
            <code key={v} className="px-1.5 py-0.5 rounded bg-slate-100 text-[#10253D] font-mono">
              {v}
            </code>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          {(isDemoSession || !profile) && (
            <button type="button" onClick={logout} className="underline font-semibold cursor-pointer">
              Ir para login
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {stages.map((stage) => (
            <div
              key={stage.stageKey}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-[#10253D]">{stage.stageTitle}</h2>
                {!isDemoSession && profile && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingStageKey(stage.stageKey);
                      setNewTitle('');
                      setNewBody('');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1677F2] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo script nesta etapa</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {stage.items.map((script) => {
                  const isEditing = editingId === script.id;
                  const interpolated = previewText(script.body);
                  const waDigits = (selectedBiz?.whatsapp || selectedBiz?.phone || '').replace(
                    /\D/g,
                    ''
                  );
                  const waHref = waDigits
                    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(interpolated)}`
                    : `https://wa.me/?text=${encodeURIComponent(interpolated)}`;

                  return (
                    <div
                      key={script.id}
                      className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#10253D]"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {SCRIPT_VARIABLES.map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => insertVariable(v, 'edit')}
                                className="px-2 py-1 rounded bg-white border border-slate-200 hover:border-[#1677F2] text-[11px] font-mono text-[#10253D] cursor-pointer"
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                          <textarea
                            ref={editTextareaRef}
                            rows={4}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(script.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1677F2] text-white text-xs font-semibold cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Salvar script</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-[#10253D]">{script.title}</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(interpolated);
                                  setCopiedId(script.id);
                                  setTimeout(() => setCopiedId(null), 1800);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-[#10253D] cursor-pointer"
                              >
                                {copiedId === script.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Copiado</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copiar pronto</span>
                                  </>
                                )}
                              </button>

                              <a
                                href={waHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#16A34A] text-white text-[11px] font-semibold"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>Enviar</span>
                              </a>

                              {!isDemoSession && profile && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(script.id);
                                      setEditTitle(script.title);
                                      setEditBody(script.body);
                                    }}
                                    className="p-1 text-slate-500 hover:text-[#10253D] cursor-pointer"
                                    title="Editar script"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(script.id)}
                                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                    title="Excluir script"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed bg-white border border-slate-200 rounded-lg p-3">
                            {interpolated}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {creatingStageKey === stage.stageKey && (
                  <div className="rounded-xl border border-dashed border-[#1677F2] p-4 space-y-3 bg-sky-50/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#10253D]">
                        Novo script em {stage.stageTitle}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCreatingStageKey(null)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Título do script"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {SCRIPT_VARIABLES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVariable(v, 'new')}
                          className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] font-mono cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      placeholder="Escreva a mensagem usando as variáveis acima…"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCreateScript(
                            stage.stageKey,
                            stage.stageOrder,
                            stage.stageTitle
                          )
                        }
                        className="px-4 py-1.5 rounded-lg bg-[#1677F2] text-white text-xs font-semibold cursor-pointer"
                      >
                        Adicionar script
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
