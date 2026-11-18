import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth, type UserRole } from '../contexts/AuthContext';

interface TeamMember {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; summary: string }> = [
  {
    value: 'administrador',
    label: 'Administrador',
    summary: 'Acesso completo e autorização de publicação oficial.',
  },
  {
    value: 'gestor_comercial',
    label: 'Gestor comercial',
    summary: 'Prospecção, CRM, propostas, relatórios e minisites.',
  },
  {
    value: 'consultor_comercial',
    label: 'Consultor comercial',
    summary: 'Empresas, oportunidades, demonstrações e propostas.',
  },
  {
    value: 'operacional',
    label: 'Operacional',
    summary: 'Edição de minisites e projetos autorizados.',
  },
];

export function TeamView() {
  const { apiFetch, profile } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const isAdmin = profile?.role === 'administrador';

  const loadTeam = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ members: TeamMember[] }>('/api/team');
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar equipe.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, isAdmin]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleUpdate = async (member: TeamMember, nextRole: UserRole, nextActive: boolean) => {
    setSavingId(member.id);
    setError(null);
    try {
      await apiFetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole, active: nextActive }),
      });
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar colaborador.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Equipe e permissões</h1>
        <p className="mt-1 text-sm text-slate-600">
          Controle interno de acesso por papéis aplicado no backend e no banco PostgreSQL.
        </p>
      </div>

      {/* Role Reference Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLE_OPTIONS.map((r) => (
          <div key={r.value} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#10253D]">
              <ShieldCheck className="w-4 h-4 text-[#1677F2]" />
              <span>{r.label}</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{r.summary}</p>
          </div>
        ))}
      </div>

      {!isAdmin ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
          A gestão de papéis e ativação de colaboradores é restrita ao papel de{' '}
          <strong>Administrador</strong>.
        </div>
      ) : loading ? (
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {error && (
            <div className="p-3 bg-red-50 border-b border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Papel</th>
                  <th className="py-3 px-4">Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-[#10253D]">{m.fullName}</td>
                    <td className="py-3 px-4 text-slate-600">{m.email}</td>
                    <td className="py-3 px-4">
                      <select
                        disabled={savingId === m.id}
                        value={m.role}
                        onChange={(e) =>
                          handleUpdate(m, e.target.value as UserRole, m.active)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-[#10253D]"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        disabled={savingId === m.id}
                        onClick={() => handleUpdate(m, m.role, !m.active)}
                        className={`text-xs font-semibold cursor-pointer ${
                          m.active ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {m.active ? 'Ativo' : 'Desativado'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
