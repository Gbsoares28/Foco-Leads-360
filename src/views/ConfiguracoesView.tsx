import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function ConfiguracoesView() {
  const { apiFetch, isDemoSession, profile, logout } = useAuth();

  const [form, setForm] = useState({
    operatorName: '',
    operatorCity: '',
    sitePriceLabel: 'R$ 97/mês',
    platePriceLabel: 'R$ 79,00',
    baseDomain: 'linkfoco.vercel.app',
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
      setError('Entre com o administrador autorizado para salvar as configurações.');
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
            <button type="button" onClick={logout} className="underline font-semibold cursor-pointer">
              Ir para login
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

          <div className="sm:col-span-2 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#10253D] mb-1">
                Domínio público padrão dos minisites (ex: linkfoco.vercel.app)
              </label>
              <input
                type="text"
                value={form.baseDomain}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    baseDomain: e.target.value
                      .replace(/^https?:\/\//i, '')
                      .replace(/\/.*$/, '')
                      .trim()
                      .toLowerCase(),
                  }))
                }
                placeholder="linkfoco.vercel.app"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-[#10253D]"
              />
            </div>

            <div className="px-3.5 py-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 space-y-1.5">
              <div>
                Padrão público canônico:{' '}
                <code className="font-mono text-[#10253D] font-semibold">
                  https://{form.baseDomain || 'linkfoco.vercel.app'}/nosso-pet-favorito
                </code>
              </div>
              <div>
                Prévia local ativa neste ambiente:{' '}
                <code className="font-mono text-[#1677F2] font-semibold">
                  {window.location.origin}/nosso-pet-favorito
                </code>
              </div>
              <div>
                Compatibilidade preservada:{' '}
                <code className="font-mono text-slate-700 font-semibold">
                  /LinkFoco/nosso-pet-favorito · /s/nosso-pet-favorito · /demo/nosso-pet-favorito
                </code>
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Todos os minisites são publicados dinamicamente sob <code className="font-mono">/&lt;slug&gt;</code>, sem domínio individual por cliente nem redeploy ao trocar slug (slugs antigos e links legados <code className="font-mono">/LinkFoco/&lt;slug&gt;</code> ou <code className="font-mono">/s/&lt;slug&gt;</code> redirecionam automaticamente preservando parâmetros). Para servir em{' '}
                <strong className="font-mono">{form.baseDomain || 'linkfoco.vercel.app'}</strong>, publique apenas as rotas públicas na Vercel conforme <code className="font-mono">docs/VERCEL_PUBLIC_SETUP.md</code> e defina <code className="font-mono">PUBLIC_BASE_URL=https://{form.baseDomain || 'linkfoco.vercel.app'}</code> e <code className="font-mono">VITE_PUBLIC_BASE_URL=https://{form.baseDomain || 'linkfoco.vercel.app'}</code>.
              </p>
            </div>
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
