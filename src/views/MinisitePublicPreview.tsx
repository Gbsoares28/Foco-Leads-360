import { useEffect, useState } from 'react';
import { ArrowLeft, Monitor, Smartphone } from 'lucide-react';
import { MinisiteRenderer, type RenderableMinisite } from '../components/MinisiteRenderer';

export function MinisitePublicPreview({
  slug,
  onBack,
}: {
  slug: string;
  onBack: () => void;
}) {
  const [minisite, setMinisite] = useState<RenderableMinisite | null>(null);
  const [baseDomain, setBaseDomain] = useState('focoleads360.com.br');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/public/minisite/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Minisite indisponível.');
        return json;
      })
      .then((data) => {
        if (active) {
          setMinisite(data.minisite);
          if (data.baseDomain) setBaseDomain(data.baseDomain);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Erro ao carregar prévia.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
        <div className="w-full max-w-sm h-[600px] bg-white rounded-3xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (error || !minisite) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h1 className="text-lg font-bold text-[#10253D]">Minisite indisponível</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'Página não encontrada.'}</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-6 px-4 py-2 rounded-lg bg-[#1677F2] text-white text-sm font-semibold cursor-pointer"
          >
            Voltar ao painel
          </button>
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
            {minisite.slug}.{baseDomain}
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
          Não indexada em mecanismos de busca · Feed em Foco 360
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
