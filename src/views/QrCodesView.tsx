import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Pause,
  Play,
  Plus,
  QrCode,
  Save,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildPublicMinisiteUrl } from '../lib/slug-utils';

interface QrCodeItem {
  id: number;
  code: string;
  label: string;
  destinationType: string;
  destinationUrl: string;
  businessId: number | null;
  minisiteId: number | null;
  scansCount: number;
  active: boolean;
  businessName: string | null;
  minisiteSlug: string | null;
  createdAt: string;
}

interface MinisiteOption {
  id: number;
  title: string;
  slug: string;
  status?: string;
  businessId: number;
  businessName: string;
  businessWhatsapp: string;
}

const DESTINATION_LABELS: Record<string, string> = {
  minisite: 'Minisite',
  avaliacao_google: 'Avaliação Google',
  whatsapp: 'WhatsApp',
  url: 'URL personalizada',
};

function QrPreviewImage({ url, label }: { url: string; label: string }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      color: { dark: '#10253D', light: '#FFFFFF' },
    })
      .then((res) => {
        if (mounted) setDataUrl(res);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [url]);

  if (!dataUrl) {
    return (
      <div className="w-24 h-24 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
        <QrCode className="w-6 h-6 text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`QR Code ${label}`}
      className="w-24 h-24 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
    />
  );
}

export function QrCodesView() {
  const { apiFetch, showDemoData, isDemoSession, profile, logout } = useAuth();

  const [items, setItems] = useState<QrCodeItem[]>([]);
  const [minisites, setMinisites] = useState<MinisiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreator, setShowCreator] = useState(false);
  const [form, setForm] = useState({
    label: '',
    destinationType: 'minisite',
    destinationUrl: '',
    minisiteId: '',
  });
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qrRes, msRes] = await Promise.all([
        apiFetch<{ items: QrCodeItem[] }>(`/api/qr-codes?demo=${showDemoData}`),
        apiFetch<{ items: MinisiteOption[] }>(`/api/minisites?demo=${showDemoData}&pageSize=50`),
      ]);
      setItems(qrRes.items || []);
      setMinisites(msRes.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar QR Codes.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showDemoData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectMinisite = (msId: string) => {
    const selected = minisites.find((m) => String(m.id) === msId);
    if (!selected) {
      setForm((f) => ({ ...f, minisiteId: '' }));
      return;
    }
    const defaultUrl =
      form.destinationType === 'whatsapp' && selected.businessWhatsapp
        ? `https://wa.me/${selected.businessWhatsapp.replace(/\D/g, '')}`
        : selected?.slug
          ? buildPublicMinisiteUrl(selected.slug)
          : '';

    setForm((f) => ({
      ...f,
      minisiteId: msId,
      label: f.label || `Placa · ${selected.title}`,
      destinationUrl: defaultUrl,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para criar QR Codes.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const selected = minisites.find((m) => String(m.id) === form.minisiteId);
      await apiFetch('/api/qr-codes', {
        method: 'POST',
        body: JSON.stringify({
          label: form.label.trim(),
          destinationType: form.destinationType,
          destinationUrl: form.destinationUrl.trim(),
          minisiteId: selected ? selected.id : null,
          businessId: selected ? selected.businessId : null,
          isDemo: showDemoData,
        }),
      });
      setForm({ label: '', destinationType: 'minisite', destinationUrl: '', minisiteId: '' });
      setShowCreator(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar QR Code.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (item: QrCodeItem) => {
    if (isDemoSession || !profile) return;
    try {
      await apiFetch(`/api/qr-codes/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      });
      setItems((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, active: !item.active } : q))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status do QR Code.');
    }
  };

  const handleSaveDestination = async (id: number) => {
    if (isDemoSession || !profile) return;
    try {
      await apiFetch(`/api/qr-codes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ destinationUrl: editUrl.trim() }),
      });
      setItems((prev) =>
        prev.map((q) => (q.id === id ? { ...q, destinationUrl: editUrl.trim() } : q))
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'URL inválida ao atualizar destino.');
    }
  };

  const handleDelete = async (id: number) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para excluir QR Codes.');
      setConfirmDeleteId(null);
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      await apiFetch(`/api/qr-codes/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      setItems((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir QR Code.');
    } finally {
      setDeletingId(null);
    }
  };

  const downloadPng = async (shortUrl: string, filename: string) => {
    const dataUrl = await QRCode.toDataURL(shortUrl, {
      width: 1024,
      margin: 2,
      color: { dark: '#10253D', light: '#FFFFFF' },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${filename}.png`;
    a.click();
  };

  const downloadSvg = async (shortUrl: string, filename: string) => {
    const svg = await QRCode.toString(shortUrl, {
      type: 'svg',
      margin: 2,
      color: { dark: '#10253D', light: '#FFFFFF' },
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">QR Codes dinâmicos</h1>
          <p className="text-sm text-slate-600 mt-1">
            Imprima placas NFC/QR para clientes e altere o link de destino a qualquer momento sem reimprimir.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreator((s) => !s)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Novo QR Code</span>
        </button>
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

      {showCreator && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                Tipo de destino
              </label>
              <select
                value={form.destinationType}
                onChange={(e) => setForm((f) => ({ ...f, destinationType: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="minisite">Minisite</option>
                <option value="avaliacao_google">Avaliação Google</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="url">URL personalizada</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                Puxar de um minisite (opcional)
              </label>
              <select
                value={form.minisiteId}
                onChange={(e) => handleSelectMinisite(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="">Selecionar manualmente</option>
                {minisites.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} (/{m.slug}{m.status === 'publicado' ? ' · publicado' : ''})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                Identificação da placa / QR
              </label>
              <input
                type="text"
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Placa Balcão · Nosso Pet"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                URL de destino
              </label>
              <input
                type="url"
                required
                value={form.destinationUrl}
                onChange={(e) => setForm((f) => ({ ...f, destinationUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreator(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer"
            >
              {creating ? 'Gerando…' : 'Criar QR Code dinâmico'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <QrCode className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="text-sm font-semibold text-[#10253D]">
            Nenhum QR Code dinâmico cadastrado
          </div>
          <p className="text-xs text-slate-500">
            Crie seu primeiro QR Code para placas de avaliação, balcão ou redirecionamento de minisite.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const shortUrl = `${window.location.origin}/q/${item.code}`;
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className={`bg-white border border-slate-200 rounded-xl p-5 flex gap-4 ${
                  item.active ? '' : 'opacity-70'
                }`}
              >
                <QrPreviewImage url={shortUrl} label={item.label} />

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#10253D] truncate">{item.label}</h3>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span>{DESTINATION_LABELS[item.destinationType] || item.destinationType}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums text-[#10253D] font-semibold">
                          {item.scansCount} leituras
                        </span>
                        <span>·</span>
                        <span className={item.active ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                          {item.active ? 'Ativo' : 'Pausado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-mono text-slate-600 truncate">/q/{item.code}</div>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveDestination(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1677F2] text-white text-xs font-semibold cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="truncate">{item.destinationUrl}</span>
                      {!isDemoSession && profile && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditUrl(item.destinationUrl);
                          }}
                          className="text-[#1677F2] font-semibold hover:underline shrink-0 cursor-pointer"
                        >
                          Editar destino
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(shortUrl);
                        setCopiedCode(item.code);
                        setTimeout(() => setCopiedCode(null), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer"
                    >
                      {copiedCode === item.code ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar link</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadPng(shortUrl, item.code)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PNG</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadSvg(shortUrl, item.code)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>SVG</span>
                    </button>

                    <a
                      href={shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#10253D]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Testar</span>
                    </a>

                    {!isDemoSession && profile && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 cursor-pointer"
                      >
                        {item.active ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pausar</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Reativar</span>
                          </>
                        )}
                      </button>
                    )}

                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={() => handleDelete(item.id)}
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
                        title="Excluir QR Code"
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
    </div>
  );
}
