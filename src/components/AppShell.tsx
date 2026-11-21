import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  FileCheck2,
  FileText,
  FolderKanban,
  GitBranch,
  Globe,
  Kanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  Plus,
  QrCode,
  Search,
  Settings,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  phase?: number;
}

export const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Principal',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/prospeccao', label: 'Buscar', icon: Search },
      { path: '/crm', label: 'Painel CRM', icon: Kanban },
      { path: '/minisites', label: 'Minisites', icon: Globe, primary: true },
      { path: '/criar-minisite', label: 'Criar minisite', icon: Sparkles },
      { path: '/empresas', label: 'Empresas', icon: Building2 },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { path: '/scripts', label: 'Scripts', icon: FileText },
      { path: '/qr-codes', label: 'QR Codes', icon: QrCode },
      { path: '/diagnosticos', label: 'Diagnósticos', icon: Activity, phase: 5 },
      { path: '/propostas', label: 'Propostas', icon: FileCheck2, phase: 5 },
      { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, phase: 5 },
      { path: '/fluxos', label: 'Fluxos comerciais', icon: GitBranch, phase: 5 },
    ],
  },
  {
    title: 'Operação',
    items: [
      { path: '/agenda', label: 'Agenda', icon: Calendar, phase: 4 },
      { path: '/projetos', label: 'Projetos', icon: FolderKanban, phase: 5 },
      { path: '/clientes', label: 'Clientes', icon: UserCheck, phase: 4 },
      { path: '/cobrancas', label: 'Cobranças', icon: CreditCard, phase: 5 },
    ],
  },
  {
    title: 'Administração',
    items: [
      { path: '/relatorios', label: 'Relatórios', icon: BarChart3, phase: 5 },
      { path: '/equipe', label: 'Equipe', icon: Users },
      { path: '/configuracoes', label: 'Config', icon: Settings },
      { path: '/integracoes', label: 'Integrações', icon: Plug, phase: 2 },
      { path: '/logs', label: 'Logs', icon: Briefcase },
    ],
  },
];

const ROLE_TEXT: Record<string, string> = {
  administrador: 'Administrador',
  gestor_comercial: 'Gestor comercial',
  consultor_comercial: 'Consultor comercial',
  operacional: 'Operacional',
};

interface AppShellProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export function AppShell({ currentPath, onNavigate, children }: AppShellProps) {
  const {
    profile,
    isDemoSession,
    showDemoData,
    setShowDemoData,
    logout,
  } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === currentPath)?.label ||
    'Minisites';

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#10253D] text-white">
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleNav('/')}
          className="text-left cursor-pointer focus:outline-none"
        >
          <div className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            Foco Leads 360
          </div>
          <div className="text-xs text-slate-400 whitespace-nowrap">Feed em Foco 360</div>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-2 text-slate-300 hover:text-white cursor-pointer"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  currentPath === item.path ||
                  (item.path === '/minisites' && currentPath.startsWith('/minisites/'));

                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleNav(item.path)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#1677F2] text-white font-semibold'
                        : item.primary
                          ? 'text-white hover:bg-white/10 font-medium'
                          : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.phase && (
                      <span className="text-[10px] text-slate-400 font-mono">F{item.phase}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        {profile ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{profile.fullName}</div>
              <div className="text-xs text-slate-400 truncate">
                {ROLE_TEXT[profile.role] || profile.role}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sair"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
              aria-label="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-300">Sessão restrita</div>
            <button
              type="button"
              onClick={logout}
              className="w-full px-3 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Ir para login
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{renderSidebarContent()}</div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#10253D] cursor-pointer"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <span className="hidden sm:inline font-medium text-slate-400">Foco Leads 360</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-semibold text-[#10253D] truncate">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!isDemoSession && (
              <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowDemoData(false)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !showDemoData
                      ? 'bg-white text-[#10253D] shadow-sm'
                      : 'text-slate-600 hover:text-[#10253D]'
                  }`}
                >
                  Produção
                </button>
                <button
                  type="button"
                  onClick={() => setShowDemoData(true)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showDemoData
                      ? 'bg-white text-[#1677F2] shadow-sm'
                      : 'text-slate-600 hover:text-[#10253D]'
                  }`}
                >
                  Demonstração
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleNav('/minisites')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Criar minisite com IA</span>
            </button>
          </div>
        </header>

        {/* Demo Context Notice */}
        {(isDemoSession || showDemoData) && (
          <div className="bg-slate-800 text-white px-4 lg:px-8 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Modo Demonstração:</strong> exibindo exclusivamente empresas e minisites
              demonstrativos separados da base real.
            </span>
            <button
              type="button"
              onClick={() => setShowDemoData(false)}
              className="underline font-semibold text-sky-300 hover:text-white cursor-pointer"
            >
              Voltar para base real
            </button>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-8 pb-20 lg:pb-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>

        {/* Mobile Bottom Navigation (compact <= 56px) */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white border-t border-slate-200 grid grid-cols-4">
          <button
            type="button"
            onClick={() => handleNav('/')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer ${
              currentPath === '/' ? 'text-[#1677F2] font-semibold' : 'text-slate-600'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Painel</span>
          </button>
          <button
            type="button"
            onClick={() => handleNav('/minisites')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer ${
              currentPath === '/minisites' ? 'text-[#1677F2] font-semibold' : 'text-slate-600'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Minisites</span>
          </button>
          <button
            type="button"
            onClick={() => handleNav('/criar-minisite')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer ${
              currentPath === '/criar-minisite' ? 'text-[#1677F2] font-semibold' : 'text-slate-600'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Criar IA</span>
          </button>
          <button
            type="button"
            onClick={() => handleNav('/empresas')}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer ${
              currentPath === '/empresas' ? 'text-[#1677F2] font-semibold' : 'text-slate-600'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Empresas</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
