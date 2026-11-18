import { ArrowRight } from 'lucide-react';

interface RoadmapModuleViewProps {
  title: string;
  phase: number;
  description: string;
  deliverables: string[];
  onNavigate: (path: string) => void;
}

export function RoadmapModuleView({
  title,
  phase,
  description,
  deliverables,
  onNavigate,
}: RoadmapModuleViewProps) {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="text-xs font-semibold text-[#1677F2]">
          Módulo previsto para a Fase {phase}
        </div>
        <h1 className="mt-1 text-2xl font-bold text-[#10253D] tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-[#10253D]">Escopo planejado na arquitetura</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          {deliverables.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span className="text-[#1677F2] font-bold">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/minisites')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold cursor-pointer"
          >
            <span>Ir para Minisites (Fase 1 ativa)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/empresas')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#10253D] cursor-pointer"
          >
            <span>Cadastrar empresas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
