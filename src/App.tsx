import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { AppShell } from './components/AppShell';
import { DashboardView } from './views/DashboardView';
import { MinisitesView } from './views/MinisitesView';
import { BusinessesView } from './views/BusinessesView';
import { MinisitePublicPreview } from './views/MinisitePublicPreview';
import { MinisiteEditorPreview } from './views/MinisiteEditorPreview';
import { TeamView } from './views/TeamView';
import { LogsView } from './views/LogsView';
import { RoadmapModuleView } from './views/RoadmapModuleView';
import { ProspeccaoView } from './views/ProspeccaoView';
import { CrmPipelineView } from './views/CrmPipelineView';
import { QrCodesView } from './views/QrCodesView';
import { ScriptsView } from './views/ScriptsView';
import { ConfiguracoesView } from './views/ConfiguracoesView';

const ROADMAP_MODULES: Record<
  string,
  { title: string; phase: number; description: string; deliverables: string[] }
> = {
  '/prospeccao': {
    title: 'Prospecção comercial',
    phase: 5,
    description:
      'Busca territorial por estado, cidade, bairro, segmento e raio com fontes autorizadas e criação imediata de minisite.',
    deliverables: [
      'Filtros por empresas sem site, não abordadas e oportunidades',
      'Seleção direta para geração de minisite demonstrativo',
      'Registro de buscas em prospecting_searches',
    ],
  },
  '/crm': {
    title: 'CRM comercial',
    phase: 5,
    description:
      'Funil Kanban com 9 etapas comerciais da prospecção ao fechamento, histórico e tarefas.',
    deliverables: [
      'Etapas: Encontrado, Qualificado, Abordagem, Respondeu, Demonstração enviada, Proposta enviada, Negociação, Ganho, Perdido',
      'Vínculo com minisite demonstrativo e propostas',
      'Histórico de atividades e próximo contato',
    ],
  },
  '/diagnosticos': {
    title: 'Diagnósticos digitais',
    phase: 5,
    description:
      'Análise técnica complementar de presença digital com Google PageSpeed Insights e pontuação de 0 a 100 baseada em evidências.',
    deliverables: [
      'Integração real com Google PageSpeed Insights',
      'Critérios objetivos de experiência mobile, SEO básico e conversão',
      'Relatório revisável com Gemini',
    ],
  },
  '/propostas': {
    title: 'Propostas comerciais',
    phase: 5,
    description:
      'Gerador de propostas comerciais com identidade da Feed em Foco 360, exportação PDF e link compartilhável.',
    deliverables: [
      'Seleção de empresa, serviço, prazo, entregáveis e preço',
      'Revisão obrigatória antes do envio ao cliente',
      'Registro de visualizações e atualização de status',
    ],
  },
  '/scripts': {
    title: 'Scripts comerciais',
    phase: 5,
    description:
      'Biblioteca de mensagens comerciais personalizadas com dados confirmados da empresa.',
    deliverables: [
      'Abordagem inicial, apresentação de minisite, envio de proposta e acompanhamento',
      'Personalização assistida por IA sem invenção de fatos',
    ],
  },
  '/whatsapp': {
    title: 'WhatsApp Business',
    phase: 5,
    description:
      'Integração preparada para WhatsApp Business Platform oficial respeitando consentimento e LGPD.',
    deliverables: [
      'Envio contextualizado individual a partir do CRM e Minisites',
      'Conformidade com políticas de mensagens e sem disparos em massa não autorizados',
    ],
  },
  '/fluxos': {
    title: 'Fluxos comerciais',
    phase: 5,
    description: 'Cadências de acompanhamento e lembretes para a equipe comercial.',
    deliverables: [
      'Sequências de tarefas ligadas às etapas do CRM',
      'Alertas de follow-up no Dashboard',
    ],
  },
  '/qr-codes': {
    title: 'QR Codes dinâmicos',
    phase: 4,
    description:
      'Geração de QR Codes dinâmicos para minisite, avaliações do Google, WhatsApp e URLs com exportação PNG/SVG.',
    deliverables: [
      'Redirecionamento próprio com contagem de leituras',
      'Edição de destino sem trocar o material impresso',
    ],
  },
  '/agenda': {
    title: 'Agenda',
    phase: 4,
    description:
      'Módulo opcional de agendamento por serviços, duração e disponibilidade real, preparado para Google Calendar.',
    deliverables: [
      'Configuração real de dias, horários e serviços',
      'Confirmação e cancelamento pelo painel interno',
    ],
  },
  '/projetos': {
    title: 'Projetos',
    phase: 5,
    description: 'Gestão de entregas e serviços contratados por empresa cliente.',
    deliverables: [
      'Acompanhamento de status de produção e entrega',
      'Vínculo direto com clientes e minisites',
    ],
  },
  '/clientes': {
    title: 'Painel do cliente',
    phase: 4,
    description:
      'Área interna consolidada por empresa com dados cadastrais, minisite, serviços contratados, propostas e observações.',
    deliverables: [
      'Visão 360 da conta do cliente para a equipe Feed em Foco 360',
      'Histórico de propostas, tarefas e projetos',
    ],
  },
  '/cobrancas': {
    title: 'Financeiro interno',
    phase: 5,
    description:
      'Controle exclusivo de serviços vendidos pela Feed em Foco 360, contratos, cobranças e receita mensal.',
    deliverables: [
      'Cadastro de serviços recorrentes e pontuais',
      'Lançamentos, vencimentos, baixas e relatórios financeiros',
    ],
  },
  '/relatorios': {
    title: 'Relatórios',
    phase: 5,
    description: 'Relatórios gerenciais de conversão comercial, visualizações e produtividade.',
    deliverables: [
      'Desempenho por consultor e segmento',
      'Conversão de demonstrações em propostas ganhas',
    ],
  },
  '/configuracoes': {
    title: 'Configurações',
    phase: 3,
    description:
      'Configuração de domínio wildcard para subdomínios, políticas de publicação e padrões da marca.',
    deliverables: [
      'Definição de domínio base configurável (ex: focoleads360.com.br)',
      'Reserva de subdomínios administrativos',
    ],
  },
  '/integracoes': {
    title: 'Integrações',
    phase: 2,
    description:
      'Conexões com Google Places API (New), Gemini API, Google PageSpeed Insights e WhatsApp Business.',
    deliverables: [
      'Importação oficial de dados via Google Places API (New) na Fase 2',
      'Geração estruturada server-side via Gemini API',
    ],
  },
};

function AppRouter() {
  const { firebaseUser, profile, loading, isDemoSession } = useAuth();
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    if (path !== window.location.pathname) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Public / Demo preview routes work without requiring internal login
  const demoMatch = currentPath.match(/^\/(?:demo|m)\/([a-z0-9-]+)$/i);
  if (demoMatch) {
    return (
      <MinisitePublicPreview
        slug={demoMatch[1]}
        onBack={() => navigate('/minisites')}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">Carregando Foco Leads 360...</div>
      </div>
    );
  }

  const isAuthenticated = Boolean(firebaseUser && profile);
  if (!isAuthenticated && !isDemoSession) {
    return <LoginScreen />;
  }

  const editorMatch = currentPath.match(/^\/minisites\/(\d+)\/editar$/);

  const renderMainContent = () => {
    if (currentPath === '/' || currentPath === '') {
      return <DashboardView onNavigate={navigate} />;
    }
    if (currentPath === '/minisites') {
      return <MinisitesView onNavigate={navigate} />;
    }
    if (currentPath === '/criar-minisite') {
      return <MinisitesView onNavigate={navigate} focusCreate />;
    }
    if (editorMatch) {
      return (
        <MinisiteEditorPreview
          minisiteId={Number(editorMatch[1])}
          onNavigate={navigate}
        />
      );
    }
    if (currentPath === '/prospeccao') {
      return <ProspeccaoView onNavigate={navigate} />;
    }
    if (currentPath === '/crm') {
      return <CrmPipelineView onNavigate={navigate} />;
    }
    if (currentPath === '/qr-codes') {
      return <QrCodesView />;
    }
    if (currentPath === '/scripts') {
      return <ScriptsView />;
    }
    if (currentPath === '/configuracoes') {
      return <ConfiguracoesView />;
    }
    if (currentPath === '/empresas') {
      return <BusinessesView onNavigate={navigate} />;
    }
    if (currentPath === '/equipe') {
      return <TeamView />;
    }
    if (currentPath === '/logs') {
      return <LogsView />;
    }

    const roadmap = ROADMAP_MODULES[currentPath];
    if (roadmap) {
      return (
        <RoadmapModuleView
          title={roadmap.title}
          phase={roadmap.phase}
          description={roadmap.description}
          deliverables={roadmap.deliverables}
          onNavigate={navigate}
        />
      );
    }

    return <DashboardView onNavigate={navigate} />;
  };

  return (
    <AppShell currentPath={currentPath} onNavigate={navigate}>
      {renderMainContent()}
    </AppShell>
  );
}

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  return (
    <AuthProvider>
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <AppRouter />
    </AuthProvider>
  );
}
