import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Search, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Business {
  id: number;
  name: string;
  category: string;
  city: string;
  neighborhood: string;
  state: string;
  address: string;
  phone: string;
  whatsapp: string;
  website: string;
  instagram: string;
  googleMapsUrl: string | null;
  isDemo: boolean;
  createdAt: string;
}

export function BusinessesView({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { apiFetch, showDemoData, isDemoSession, profile, signInWithGoogle } = useAuth();
  const effectiveDemo = isDemoSession || showDemoData;

  const [items, setItems] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Manual form fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creatingForId, setCreatingForId] = useState<number | null>(null);

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        demo: effectiveDemo ? 'true' : 'false',
        search,
      });
      const res = await apiFetch<{ items: Business[] }>(`/api/businesses?${qs.toString()}`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar empresas.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, effectiveDemo, search]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isDemoSession || !profile) {
      setFormError('Entre com sua conta Google corporativa para cadastrar empresas.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/businesses', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category,
          city,
          neighborhood,
          state: stateUf,
          address,
          phone,
          whatsapp,
          website,
          instagram,
          googleMapsUrl,
          isDemo: effectiveDemo,
        }),
      });
      setName('');
      setCategory('');
      setCity('');
      setNeighborhood('');
      setStateUf('');
      setAddress('');
      setPhone('');
      setWhatsapp('');
      setWebsite('');
      setInstagram('');
      setGoogleMapsUrl('');
      setShowForm(false);
      await loadBusinesses();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar empresa.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFromBusiness = async (biz: Business) => {
    if (isDemoSession || !profile) {
      setError('Entre com sua conta Google corporativa para gerar um minisite.');
      return;
    }
    setCreatingForId(biz.id);
    setError(null);
    try {
      const res = await apiFetch<{ minisite: { id: number } }>('/api/minisites', {
        method: 'POST',
        body: JSON.stringify({
          businessId: biz.id,
          confirmedName: biz.name,
          confirmedCategory: biz.category,
          confirmedCity: biz.city,
          confirmedAddress: biz.address,
          confirmedPhone: biz.phone,
          confirmedWhatsapp: biz.whatsapp,
          confirmedInstagram: biz.instagram,
          resolvedMapsUrl: biz.googleMapsUrl || '',
          description: `${biz.name} - ${biz.category}${biz.city ? ` em ${biz.city}` : ''}`,
          useAi: true,
          isDemo: biz.isDemo,
        }),
      });
      onNavigate(`/minisites/${res.minisite.id}/editar`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar minisite.');
    } finally {
      setCreatingForId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#10253D] tracking-tight">Empresas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cadastro manual e gerenciamento de empresas vinculadas aos minisites e projetos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{showForm ? 'Cancelar cadastro' : 'Cadastrar empresa manualmente'}</span>
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSaveBusiness}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#10253D]">
              Novo cadastro manual de empresa
            </h2>
            {isDemoSession && (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="text-xs font-semibold text-[#1677F2] hover:underline cursor-pointer"
              >
                Entrar com Google
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome da empresa *
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Clínica Vet Tijuca"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Segmento / Categoria *
              </label>
              <input
                required
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: Clínica veterinária"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Ex: 5521999990000"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(21) 3333-0000"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cidade</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Rio de Janeiro"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Bairro</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Tijuca"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={stateUf}
                  onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                  placeholder="RJ"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Endereço completo
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número e complemento"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Instagram</label>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@empresa"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Site atual</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Link do Google Maps
              </label>
              <input
                type="text"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#1677F2] hover:bg-[#1262CA] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar empresa'}
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, segmento ou cidade..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="mt-2 text-sm text-slate-600">Nenhuma empresa cadastrada nesta base.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Segmento</th>
                  <th className="py-3 px-4">Localidade</th>
                  <th className="py-3 px-4">Contato</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {items.map((biz) => (
                  <tr key={biz.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#10253D]">{biz.name}</div>
                      {biz.instagram && (
                        <div className="text-xs text-slate-500">{biz.instagram}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{biz.category}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {[biz.neighborhood, biz.city, biz.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                      {biz.whatsapp || biz.phone || 'Não informado'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={creatingForId === biz.id}
                        onClick={() => handleGenerateFromBusiness(biz)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#1677F2] text-xs font-semibold text-[#1677F2] cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{creatingForId === biz.id ? 'Gerando...' : 'Criar minisite'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
