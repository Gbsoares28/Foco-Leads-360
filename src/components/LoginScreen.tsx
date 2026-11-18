import { ArrowRight, Eye, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function LoginScreen() {
  const { signInWithGoogle, enterDemoSession, authError } = useAuth();

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col lg:flex-row">
      {/* Coluna Institucional */}
      <div className="lg:w-1/2 bg-[#10253D] text-white p-8 lg:p-16 flex flex-col justify-between">
        <div>
          <div className="text-sm font-medium text-slate-300 tracking-wide">
            Feed em Foco 360
          </div>
          <h1 className="mt-6 text-3xl lg:text-4xl font-bold tracking-tight text-balance leading-tight">
            Foco Leads 360
          </h1>
          <p className="mt-3 text-lg text-slate-200 max-w-md">
            Encontre oportunidades. Crie soluções. Conquiste clientes.
          </p>
        </div>

        <div className="mt-12 space-y-6 max-w-md">
          <div className="border-t border-white/15 pt-6">
            <h2 className="text-sm font-semibold text-white">
              Fluxo principal de operação interna
            </h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Cole o link de uma empresa no Google Maps, valide os dados oficiais, gere um minisite
              estruturado com inteligência artificial e publique demonstrações ou sites em
              subdomínios exclusivos.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-[#1677F2] shrink-0" />
            <span>Acesso exclusivo para colaboradores autorizados da Feed em Foco 360</span>
          </div>
        </div>
      </div>

      {/* Coluna de Acesso */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <h2 className="text-xl font-bold text-[#10253D]">Acessar painel interno</h2>
          <p className="mt-2 text-sm text-slate-600">
            Entre com sua conta Google corporativa para criar empresas, gerar minisites e gerenciar
            clientes.
          </p>

          {authError && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {authError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              <span>Entrar com Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative py-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-500">ou</span>
              </div>
            </div>

            <button
              type="button"
              onClick={enterDemoSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#10253D] font-medium text-sm transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4 text-slate-600" />
              <span>Explorar em Modo Demonstração</span>
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            O Modo Demonstração utiliza exclusivamente registros fictícios separados dos dados
            reais e não permite publicação oficial ou alteração da base de produção.
          </p>
        </div>
      </div>
    </div>
  );
}
