import { useEffect, useState } from 'react';
import { ArrowLeft, Monitor, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MinisiteRenderer, type RenderableMinisite } from '../components/MinisiteRenderer';
import { buildPublicMinisitePath, buildPublicMinisiteUrl } from '../lib/slug-utils';

export function MinisitePublicPreview({
  slug,
  mode = 'demo',
  onBack,
}: {
  slug: string;
  mode?: 'public' | 'demo';
  onBack: () => void;
}) {
  const { profile, isDemoSession } = useAuth();
  const isStaffSession = Boolean(profile || isDemoSession);

  const [minisite, setMinisite] = useState<RenderableMinisite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const visited = new Set<string>();

    async function loadMinisite(currentSlug: string) {
      const normalized = currentSlug.trim().toLowerCase();
      if (visited.has(normalized)) {
        throw new Error('Ciclo de redirecionamento detectado para este endereço.');
      }
      visited.add(normalized);

      const endpoint =
        mode === 'public'
          ? `/api/public/site/${encodeURIComponent(normalized)}`
          : `/api/public/minisite/${encodeURIComponent(normalized)}`;

      const res = await fetch(endpoint);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Minisite não encontrado ou não publicado.');
      }

      if (mode === 'public' && json.redirect && json.targetSlug) {
        const target = String(json.targetSlug).trim().toLowerCase();
        const search = window.location.search || '';
        const nextPath = `${buildPublicMinisitePath(target)}${search}`;
        if (window.location.pathname + window.location.search !== nextPath) {
          window.history.replaceState({}, '', nextPath);
        }
        return loadMinisite(target);
      }

      return json as { minisite: RenderableMinisite; publicUrl?: string };
    }

    loadMinisite(slug)
      .then((data) => {
        if (!active) return;
        setMinisite(data.minisite);
        if (data.minisite?.title) {
          document.title = data.minisite?.seo?.title || data.minisite.title;
        }
        if (mode === 'public' && data.minisite?.slug) {
          const canonicalPath = buildPublicMinisitePath(data.minisite.slug);
          const expectedFullPath = `${canonicalPath}${window.location.search || ''}`;
          if (window.location.pathname + (window.location.search || '') !== expectedFullPath) {
            window.history.replaceState({}, '', expectedFullPath);
          }
          const canonicalHref =
            data.publicUrl || buildPublicMinisiteUrl(data.minisite.slug);
          let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'canonical';
            document.head.appendChild(link);
          }
          link.href = canonicalHref;
        }
      })
      .catch((err) => {
        if (active) {
          setMinisite(null);
          setError(err instanceof Error ? err.message : 'Minisite não encontrado.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, mode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] h-[640px] bg-white rounded-3xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error || !minisite) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            404 · Página indisponível
          </div>
          <h1 className="text-lg font-bold text-[#10253D]">
            Minisite não encontrado ou não publicado
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'O endereço solicitado não corresponde a um minisite ativo no momento.'}
          </p>
          {isStaffSession && (
            <button
              type="button"
              onClick={onBack}
              className="mt-6 px-4 py-2 rounded-lg bg-[#1677F2] text-white text-sm font-semibold cursor-pointer"
            >
              Voltar ao painel
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'public') {
    return (
      <div
        className="min-h-screen w-full flex justify-center sm:py-6 sm:px-4"
        style={{ backgroundColor: minisite.theme?.backgroundColor || '#FAF5ED' }}
      >
        <div className="w-full max-w-[460px] min-h-screen sm:min-h-0 sm:rounded-3xl overflow-hidden flex flex-col">
          <MinisiteRenderer minisite={minisite} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col">
      {/* Preview Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-8 h-14 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#10253D] hover:text-[#1677F2] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-mono text-slate-600 truncate">
            {buildPublicMinisitePath(minisite.slug)}
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
              viewport === 'mobile' ? 'bg-white text-[#10253D] shadow-sm' : 'text-slate-600'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile</span>
          </button>
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
              viewport === 'desktop' ? 'bg-white text-[#10253D] shadow-sm' : 'text-slate-600'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop</span>
          </button>
        </div>
      </div>

      {/* Explicit Demo / Draft Disclosure */}
      {minisite.status !== 'publicado' && (
        <div className="bg-[#10253D] text-white text-center px-4 py-2 text-xs">
          Prévia privada ({minisite.status === 'demonstracao' ? 'Modo Demonstração' : 'Rascunho'}) ·
          Não indexada em mecanismos de busca · Foco Leads 360
        </div>
      )}

      {/* Rendered Minisite Surface */}
      <div
        className="flex-1 flex justify-center p-4 sm:p-6 transition-colors"
        style={{
          backgroundColor:
            viewport === 'desktop'
              ? minisite.theme?.backgroundColor || '#FAF5ED'
              : '#F1F5F9',
        }}
      >
        <div
          className={`overflow-hidden flex flex-col transition-all ${
            viewport === 'mobile'
              ? 'w-full max-w-[390px] rounded-[32px] shadow-sm border-4 border-[#10253D]'
              : 'w-full max-w-[460px]'
          }`}
        >
          <MinisiteRenderer minisite={minisite} compact={viewport === 'mobile'} />
        </div>
      </div>
    </div>
  );
}
