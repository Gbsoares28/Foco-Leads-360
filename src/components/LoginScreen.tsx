import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function LoginScreen() {
  const { signInWithCredentials, signingIn, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signInWithCredentials(email, password);
  };

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
              estruturado com inteligência artificial e publique demonstrações ou sites diretamente
              no domínio do sistema.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-[#1677F2] shrink-0" />
            <span>Acesso exclusivo para o administrador autorizado da Feed em Foco 360</span>
          </div>
        </div>
      </div>

      {/* Coluna de Acesso */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <h2 className="text-xl font-bold text-[#10253D]">Acessar painel interno</h2>
          <p className="mt-2 text-sm text-slate-600">
            Entre com o e-mail e a senha do administrador autorizados no Firebase Authentication.
          </p>

          {authError && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-[#10253D] mb-1.5"
              >
                E-mail autorizado
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu-email@dominio.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:ring-2 focus:ring-[#1677F2]/30 focus:border-[#1677F2]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-[#10253D] mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm text-[#10253D] focus:outline-none focus:ring-2 focus:ring-[#1677F2]/30 focus:border-[#1677F2]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              <span>{signingIn ? 'Validando acesso...' : 'Entrar no sistema'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            Qualquer tentativa com e-mail ou senha não autorizados é bloqueada automaticamente pelo
            sistema e pelo backend.
          </p>
        </div>
      </div>
    </div>
  );
}
