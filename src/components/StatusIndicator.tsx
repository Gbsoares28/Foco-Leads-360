import { CheckCircle2, Eye, FileEdit, PowerOff } from 'lucide-react';

export function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case 'publicado':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Publicado</span>
        </span>
      );
    case 'demonstracao':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677F2] whitespace-nowrap">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span>Demonstração</span>
        </span>
      );
    case 'desativado':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 whitespace-nowrap">
          <PowerOff className="w-3.5 h-3.5 shrink-0" />
          <span>Desativado</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
          <FileEdit className="w-3.5 h-3.5 shrink-0" />
          <span>Rascunho</span>
        </span>
      );
  }
}
