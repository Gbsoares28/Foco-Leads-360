import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function ConfiguracoesView() {
  const { apiFetch, isDemoSession, profile, signInWithGoogle } = useAuth();

  const [form, setForm] = useState({
    operatorName: '',
    operatorCity: '',
    sitePriceLabel: 'R$ 97/mês',
    platePriceLabel: 'R$ 79,00',
    baseDomain: 'focoleads360.com.br',
    whatsappConnected: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    let active = true;
    apiFetch<{ settings: typeof form }>('/api/settings')
      .then((res) => {
        if (active && res.settings) setForm(res.settings);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Erro ao carregar configurações.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para salvar as configurações.');
      return;
    }
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotifStatus('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifStatus(result);
    } catch {
      setNotifStatus('denied');
    }
  };

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Configurações</h1>
        <p className="text-sm text-slate-600 mt-1">
          Defina seus dados operacionais para preencher automaticamente variáveis dos scripts e publicações da Feed em Foco 360.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          {(isDemoSession || !profile) && (
            <button type="button" onClick={signInWithGoogle} className="underline font-semibold cursor-pointer">
              Entrar com Google
            </button>
          )}
        </div>
      )}

      {savedNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Configurações salvas e aplicadas aos scripts comerciais.</span>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Seu nome ({'{meu_nome}'})
            </label>
            <input
              type="text"
              value={form.operatorName}
              onChange={(e) => setForm((f) => ({ ...f, operatorName: e.target.value }))}
              placeholder="Ex: Lucas"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Sua cidade ({'{minha_cidade}'})
            </label>
            <input
              type="text"
              value={form.operatorCity}
              onChange={(e) => setForm((f) => ({ ...f, operatorCity: e.target.value }))}
              placeholder="Ex: Rio de Janeiro"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Preço padrão do minisite ({'{preco_site}'})
            </label>
            <input
              type="text"
              value={form.sitePriceLabel}
              onChange={(e) => setForm((f) => ({ ...f, sitePriceLabel: e.target.value }))}
              placeholder="R$ 97/mês"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Preço da placa de avaliação ({'{preco}'})
            </label>
            <input
              type="text"
              value={form.platePriceLabel}
              onChange={(e) => setForm((f) => ({ ...f, platePriceLabel: e.target.value }))}
              placeholder="R$ 79,00"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#10253D] mb-1">
              Domínio base dos subdomínios oficiais
            </label>
            <input
              type="text"
              value={form.baseDomain}
              onChange={(e) => setForm((f) => ({ ...f, baseDomain: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-[#10253D]"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[#10253D] cursor-pointer">
            <input
              type="checkbox"
              checked={form.whatsappConnected}
              onChange={(e) => setForm((f) => ({ ...f, whatsappConnected: e.target.checked }))}
              className="rounded border-slate-300"
            />
            <span>Marcar WhatsApp comercial como conectado nesta estação</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando…' : 'Salvar configurações'}</span>
          </button>
        </div>
      </form>

      {/* Browser Notifications */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="text-sm font-bold text-[#10253D] flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#1677F2]" />
            <span>Notificações do navegador</span>
          </div>
          <p className="text-xs text-slate-500">
            Status atual:{' '}
            <strong>
              {notifStatus === 'granted'
                ? 'Ativadas'
                : notifStatus === 'denied'
                  ? 'Bloqueadas no navegador'
                  : notifStatus === 'unsupported'
                    ? 'Não suportadas neste contexto'
                    : 'Aguardando ativação'}
            </strong>
          </p>
        </div>

        <button
          type="button"
          onClick={handleEnableNotifications}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#10253D] cursor-pointer"
        >
          Ativar notificações
        </button>
      </div>
    </div>
  );
}
