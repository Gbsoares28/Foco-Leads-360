import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuditLogEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
}

export function LogsView() {
  const { apiFetch, profile } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead =
    profile?.role === 'administrador' || profile?.role === 'gestor_comercial';

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<{ logs: AuditLogEntry[] }>('/api/audit-logs')
      .then((res) => setLogs(res.logs))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar logs.'))
      .finally(() => setLoading(false));
  }, [apiFetch, canRead]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Logs de auditoria</h1>
        <p className="mt-1 text-sm text-slate-600">
          Registro de criações, alterações de status, autorizações de publicação e mudanças de equipe.
        </p>
      </div>

      {!canRead ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
          Visualização disponível para Administradores e Gestores comerciais autenticados.
        </div>
      ) : loading ? (
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum registro de auditoria gravado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-4">Ação</th>
                    <th className="py-3 px-4">Entidade</th>
                    <th className="py-3 px-4">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-[#10253D]">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {log.entityType} #{log.entityId}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {log.actorName || log.actorEmail || 'Sistema'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
