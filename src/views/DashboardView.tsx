import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardResponse {
  isDemo: boolean;
  kpis: {
    totalMinisites: number;
    publishedMinisites: number;
    demoMinisites: number;
    disabledMinisites: number;
    totalViews: number;
    registeredBusinesses: number;
    commercialLeads: number;
    proposalsSent: number;
    clientsWon: number;
    serviceRevenue: number;
    pendingTasks: number;
  };
  periodSeries: Array<{
    date: string;
    label: string;
    minisitesCriados: number;
    visualizacoes: number;
  }>;
  alerts: Array<{
    id: string;
    severity: 'warning' | 'error' | 'info';
    title: string;
    description: string;
    actionPath: string;
  }>;
}

export function DashboardView({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { apiFetch, showDemoData, isDemoSession } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveDemo = isDemoSession || showDemoData;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<DashboardResponse>(`/api/dashboard?demo=${effectiveDemo ? 'true' : 'false'}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Erro ao carregar painel.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, effectiveDemo]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        {error || 'Não foi possível carregar os indicadores.'}
      </div>
    );
  }

  const maxViews = Math.max(1, ...data.periodSeries.map((d) => d.visualizacoes));

  const kpiCards = [
    { label: 'Minisites criados', value: data.kpis.totalMinisites },
    { label: 'Publicados', value: data.kpis.publishedMinisites },
    { label: 'Em demonstração', value: data.kpis.demoMinisites },
    { label: 'Desativados', value: data.kpis.disabledMinisites },
    { label: 'Visualizações totais', value: data.kpis.totalViews },
    { label: 'Empresas cadastradas', value: data.kpis.registeredBusinesses },
    { label: 'Leads comerciais', value: data.kpis.commercialLeads },
    { label: 'Propostas enviadas', value: data.kpis.proposalsSent },
    { label: 'Clientes conquistados', value: data.kpis.clientsWon },
    {
      label: 'Receita de serviços',
      value: data.kpis.serviceRevenue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    },
    { label: 'Tarefas pendentes', value: data.kpis.pendingTasks },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Main CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">
            Visão geral da operação
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Acompanhe minisites ativos, visualizações, cadastros de empresas e alertas comerciais.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/minisites')}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Criar minisite com IA</span>
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {kpiCards.map((item) => (
          <div
            key={item.label}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="mt-2 text-2xl font-bold text-[#10253D] tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-semibold text-[#10253D]">
                Atividade nos últimos 7 dias
              </h2>
              <p className="text-xs text-slate-500">
                Criação de minisites e distribuição de visualizações por dia
              </p>
            </div>
          </div>

          <div className="h-48 flex items-end justify-between gap-3 pt-4 border-b border-slate-100">
            {data.periodSeries.map((point) => {
              const barHeightPct = Math.max(8, Math.round((point.visualizacoes / maxViews) * 100));
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {point.visualizacoes}
                  </div>
                  <div className="w-full max-w-[44px] bg-slate-100 rounded-t-md h-32 flex items-end overflow-hidden">
                    <div
                      className="w-full bg-[#1677F2] rounded-t-md transition-all duration-300"
                      style={{ height: `${point.visualizacoes > 0 ? barHeightPct : 4}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono text-slate-600 tabular-nums pb-1">
                    {point.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <h2 className="text-base font-semibold text-[#10253D]">Alertas operacionais</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Itens que requerem revisão ou acompanhamento
          </p>

          <div className="mt-4 space-y-3 flex-1">
            {data.alerts.length === 0 ? (
              <div className="text-sm text-slate-500 py-8 text-center">
                Nenhuma pendência crítica no momento.
              </div>
            ) : (
              data.alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => onNavigate(alert.actionPath)}
                  className="w-full text-left p-3.5 rounded-lg border border-slate-200 hover:border-[#1677F2] transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        alert.severity === 'error'
                          ? 'text-red-600'
                          : alert.severity === 'warning'
                            ? 'text-amber-600'
                            : 'text-[#1677F2]'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#10253D]">{alert.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{alert.description}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
