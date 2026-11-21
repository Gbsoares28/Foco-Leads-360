export type MinisiteBlockType =
  | 'capa'
  | 'botao_link'
  | 'botao_instagram'
  | 'botao_tiktok'
  | 'botao_youtube'
  | 'botao_facebook'
  | 'whatsapp'
  | 'avaliacoes_google'
  | 'como_chegar'
  | 'titulo_secao'
  | 'produto_servico'
  | 'servicos'
  | 'texto'
  | 'avaliacoes'
  | 'galeria'
  | 'horarios'
  | 'endereco_mapa'
  | 'endereco'
  | 'redes_sociais'
  | 'pix'
  | 'wifi'
  | 'formulario';

export interface MinisiteTheme {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  serviceCardBg?: string;
  textColor?: string;
  buttonTextColor?: string;
  buttonStyle?: 'solid' | 'soft' | 'outline' | 'gradient';
  buttonRadius?: 'md' | 'xl' | 'full';
  heroStyle?: 'card' | 'banner' | 'minimal';
  siteStyle?: 'classico' | 'vitrine' | 'luxo' | 'vibrante';
  servicesLayout?: 'stacked' | 'carousel';
  fontFamily?: string;
  coverImage?: string;
  coverVideo?: string;
  logoImage?: string;
  fixedWhatsappButton?: boolean;
  whatsappDefaultMessage?: string;
  showOpenBadge?: boolean;
  openBadgeText?: string;
  brandAnalysisSummary?: string;
  photoAttribution?: { displayName: string; uri?: string } | null;
  placePhotosUri?: string;
}

export interface MinisiteSeo {
  title?: string;
  description?: string;
  noIndex?: boolean;
}

export interface MinisiteBlockData {
  id?: number;
  clientKey?: string;
  blockType: MinisiteBlockType | string;
  position: number;
  visible: boolean;
  content: Record<string, unknown>;
}

export interface GoogleReviewItem {
  authorName: string;
  authorUri?: string;
  authorPhotoUri?: string;
  reviewUri?: string;
  rating: number;
  relativeTime: string;
  text: string;
}

export interface GalleryPhotoItem {
  url: string;
  caption?: string;
  attributionName?: string;
  attributionUri?: string;
  originUri?: string;
  googlePlaceId?: string;
  photoIndex?: number;
}

export interface PalettePreset {
  id: string;
  name: string;
  segmentHint: string;
  theme: Required<
    Pick<
      MinisiteTheme,
      | 'primaryColor'
      | 'secondaryColor'
      | 'accentColor'
      | 'backgroundColor'
      | 'surfaceColor'
      | 'textColor'
      | 'buttonTextColor'
    >
  >;
}

export const CURATED_PALETTES: PalettePreset[] = [
  {
    id: 'terracota_pet',
    name: 'Terracota & Sol',
    segmentHint: 'Pet Shop, Banho e Tosa, Serviços Locais',
    theme: {
      primaryColor: '#C2410C',
      secondaryColor: '#FACC15',
      accentColor: '#EC4899',
      backgroundColor: '#F7F3EA',
      surfaceColor: '#FFFFFF',
      textColor: '#1E293B',
      buttonTextColor: '#FFFFFF',
    },
  },
  {
    id: 'vet_saude',
    name: 'Esmeralda Clínica',
    segmentHint: 'Clínica Veterinária, Consultório, Saúde',
    theme: {
      primaryColor: '#0F766E',
      secondaryColor: '#14B8A6',
      accentColor: '#F59E0B',
      backgroundColor: '#F0FDF9',
      surfaceColor: '#FFFFFF',
      textColor: '#0F172A',
      buttonTextColor: '#FFFFFF',
    },
  },
  {
    id: 'barbearia_classic',
    name: 'Mogno & Carvão',
    segmentHint: 'Barbearia, Estética Masculina, Oficina',
    theme: {
      primaryColor: '#92400E',
      secondaryColor: '#D97706',
      accentColor: '#FBBF24',
      backgroundColor: '#18181B',
      surfaceColor: '#27272A',
      textColor: '#FAFAFA',
      buttonTextColor: '#FFFFFF',
    },
  },
  {
    id: 'gastronomia_quente',
    name: 'Vinho & Creme',
    segmentHint: 'Restaurante, Bistrô, Cafeteria, Padaria',
    theme: {
      primaryColor: '#9F1239',
      secondaryColor: '#F59E0B',
      accentColor: '#FB7185',
      backgroundColor: '#FFFBF5',
      surfaceColor: '#FFFFFF',
      textColor: '#1C1917',
      buttonTextColor: '#FFFFFF',
    },
  },
  {
    id: 'azul_corporativo',
    name: 'Azul Confiança',
    segmentHint: 'Serviços Profissionais, Loja, Tecnologia',
    theme: {
      primaryColor: '#1677F2',
      secondaryColor: '#10253D',
      accentColor: '#38BDF8',
      backgroundColor: '#F8FAFC',
      surfaceColor: '#FFFFFF',
      textColor: '#10253D',
      buttonTextColor: '#FFFFFF',
    },
  },
  {
    id: 'beleza_rose',
    name: 'Rosa Editorial',
    segmentHint: 'Salão de Beleza, Estética, Moda',
    theme: {
      primaryColor: '#BE185D',
      secondaryColor: '#F472B6',
      accentColor: '#FDE047',
      backgroundColor: '#FDF2F8',
      surfaceColor: '#FFFFFF',
      textColor: '#1F2937',
      buttonTextColor: '#FFFFFF',
    },
  },
];

export interface SiteStylePreset {
  id: 'classico' | 'vitrine' | 'luxo' | 'vibrante';
  label: string;
  description: string;
  patch: Partial<MinisiteTheme>;
}

export const SITE_STYLE_PRESETS: SiteStylePreset[] = [
  {
    id: 'classico',
    label: 'Clássico',
    description: 'Simples, estilo link na bio',
    patch: {
      siteStyle: 'classico',
      primaryColor: '#1677F2',
      secondaryColor: '#FACC15',
      backgroundColor: '#F8FAFC',
      surfaceColor: '#FFFFFF',
      textColor: '#10253D',
      buttonTextColor: '#FFFFFF',
      buttonStyle: 'solid',
      buttonRadius: 'xl',
      fixedWhatsappButton: false,
    },
  },
  {
    id: 'vitrine',
    label: 'Vitrine',
    description: 'Claro e moderno, com cartões e botão fixo',
    patch: {
      siteStyle: 'vitrine',
      primaryColor: '#C2410C',
      secondaryColor: '#FACC15',
      backgroundColor: '#FFF8EE',
      surfaceColor: '#FFFFFF',
      textColor: '#2B1D14',
      buttonTextColor: '#FFFFFF',
      buttonStyle: 'solid',
      buttonRadius: 'full',
      fixedWhatsappButton: true,
    },
  },
  {
    id: 'luxo',
    label: 'Luxo',
    description: 'Escuro, elegante e dourado',
    patch: {
      siteStyle: 'luxo',
      primaryColor: '#D4AF37',
      secondaryColor: '#F59E0B',
      backgroundColor: '#111827',
      surfaceColor: '#1F2937',
      textColor: '#F9FAFB',
      buttonTextColor: '#111827',
      buttonStyle: 'gradient',
      buttonRadius: 'xl',
      fixedWhatsappButton: true,
    },
  },
  {
    id: 'vibrante',
    label: 'Vibrante',
    description: 'Cores fortes e cartões com borda',
    patch: {
      siteStyle: 'vibrante',
      primaryColor: '#C2410C',
      secondaryColor: '#FACC15',
      accentColor: '#EC4899',
      backgroundColor: '#FAF5ED',
      surfaceColor: '#FFFFFF',
      textColor: '#1E1B18',
      buttonTextColor: '#FFFFFF',
      buttonStyle: 'solid',
      buttonRadius: 'full',
      fixedWhatsappButton: true,
    },
  },
];

export interface SegmentThemePreset {
  id: string;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  buttonTextColor: string;
}

export const SEGMENT_THEMES: SegmentThemePreset[] = [
  { id: 'barbearia', label: 'Barbearia', primaryColor: '#92400E', secondaryColor: '#F59E0B', backgroundColor: '#18181B', surfaceColor: '#27272A', textColor: '#FAFAFA', buttonTextColor: '#FFFFFF' },
  { id: 'salao_de_beleza', label: 'Salão de beleza', primaryColor: '#BE185D', secondaryColor: '#FDE047', backgroundColor: '#FDF2F8', surfaceColor: '#FFFFFF', textColor: '#1F2937', buttonTextColor: '#FFFFFF' },
  { id: 'restaurante', label: 'Restaurante', primaryColor: '#9F1239', secondaryColor: '#FBBF24', backgroundColor: '#FFFBF5', surfaceColor: '#FFFFFF', textColor: '#1C1917', buttonTextColor: '#FFFFFF' },
  { id: 'cafeteria', label: 'Cafeteria', primaryColor: '#78350F', secondaryColor: '#FDE68A', backgroundColor: '#FAF5EE', surfaceColor: '#FFFFFF', textColor: '#291D16', buttonTextColor: '#FFFFFF' },
  { id: 'clinica_saude', label: 'Clínica e saúde', primaryColor: '#0F766E', secondaryColor: '#A7F3D0', backgroundColor: '#F0FDF9', surfaceColor: '#FFFFFF', textColor: '#0F172A', buttonTextColor: '#FFFFFF' },
  { id: 'odontologia', label: 'Odontologia', primaryColor: '#0284C7', secondaryColor: '#BAE6FD', backgroundColor: '#F0F9FF', surfaceColor: '#FFFFFF', textColor: '#0C4A6E', buttonTextColor: '#FFFFFF' },
  { id: 'academia', label: 'Academia e esporte', primaryColor: '#DC2626', secondaryColor: '#FACC15', backgroundColor: '#18181B', surfaceColor: '#27272A', textColor: '#F8FAFC', buttonTextColor: '#FFFFFF' },
  { id: 'pet_shop', label: 'Pet shop', primaryColor: '#C2410C', secondaryColor: '#FACC15', backgroundColor: '#FFF8EE', surfaceColor: '#FFFFFF', textColor: '#2B1D14', buttonTextColor: '#FFFFFF' },
  { id: 'loja_moda', label: 'Loja e moda', primaryColor: '#7C3AED', secondaryColor: '#FDE047', backgroundColor: '#FAF5FF', surfaceColor: '#FFFFFF', textColor: '#1E1B4B', buttonTextColor: '#FFFFFF' },
  { id: 'imobiliaria', label: 'Imobiliária', primaryColor: '#1E3A8A', secondaryColor: '#F59E0B', backgroundColor: '#F8FAFC', surfaceColor: '#FFFFFF', textColor: '#0F172A', buttonTextColor: '#FFFFFF' },
  { id: 'prestador_de_servicos', label: 'Prestador de serviço', primaryColor: '#1677F2', secondaryColor: '#FACC15', backgroundColor: '#F8FAFC', surfaceColor: '#FFFFFF', textColor: '#10253D', buttonTextColor: '#FFFFFF' },
  { id: 'cursos_educacao', label: 'Cursos e educação', primaryColor: '#4338CA', secondaryColor: '#FDE047', backgroundColor: '#EEF2FF', surfaceColor: '#FFFFFF', textColor: '#1E1B4B', buttonTextColor: '#FFFFFF' },
  { id: 'eventos_festas', label: 'Eventos e festas', primaryColor: '#DB2777', secondaryColor: '#FACC15', backgroundColor: '#FFF1F2', surfaceColor: '#FFFFFF', textColor: '#3B0764', buttonTextColor: '#FFFFFF' },
];

export const FONT_STYLE_OPTIONS = [
  { id: 'Plus Jakarta Sans', label: 'Moderna', cssValue: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: 'Georgia', label: 'Elegante', cssValue: "Georgia, 'Times New Roman', serif" },
  { id: 'Nunito', label: 'Arredondada', cssValue: "'Nunito', 'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: 'Space Grotesk', label: 'Técnica', cssValue: "'Space Grotesk', 'JetBrains Mono', monospace" },
];

export const TEMPLATE_OPTIONS = [
  { id: 'clinica_veterinaria', label: 'Clínica Veterinária' },
  { id: 'pet_shop', label: 'Pet Shop' },
  { id: 'banho_e_tosa', label: 'Banho e Tosa' },
  { id: 'barbearia', label: 'Barbearia' },
  { id: 'salao_de_beleza', label: 'Salão de Beleza' },
  { id: 'restaurante', label: 'Restaurante / Bistrô' },
  { id: 'consultorio', label: 'Consultório / Saúde' },
  { id: 'loja', label: 'Loja / Comércio' },
  { id: 'prestador_de_servicos', label: 'Prestador de Serviços' },
  { id: 'modelo_generico', label: 'Modelo Versátil' },
];

export function getDefaultPaletteForTemplate(templateId: string): PalettePreset {
  switch (templateId) {
    case 'pet_shop':
    case 'banho_e_tosa':
      return CURATED_PALETTES[0];
    case 'clinica_veterinaria':
    case 'consultorio':
      return CURATED_PALETTES[1];
    case 'barbearia':
      return CURATED_PALETTES[2];
    case 'restaurante':
      return CURATED_PALETTES[3];
    case 'salao_de_beleza':
      return CURATED_PALETTES[5];
    default:
      return CURATED_PALETTES[4];
  }
}

export const BLOCK_CATALOG: Array<{
  type: MinisiteBlockType;
  label: string;
  description: string;
  defaultContent: Record<string, unknown>;
}> = [
  {
    type: 'botao_link',
    label: 'Botão / link',
    description: 'Link de destaque para site, agendamento, cardápio ou promoção.',
    defaultContent: {
      label: 'Acessar link',
      url: 'https://',
      icon: 'link',
      style: 'primary',
    },
  },
  {
    type: 'botao_instagram',
    label: 'Botão Instagram',
    description: 'Botão independente com logo oficial do Instagram (@usuario ou URL).',
    defaultContent: {
      label: 'Instagram',
      url: '',
    },
  },
  {
    type: 'botao_tiktok',
    label: 'Botão TikTok',
    description: 'Botão independente com logo oficial do TikTok (@usuario ou URL).',
    defaultContent: {
      label: 'TikTok',
      url: '',
    },
  },
  {
    type: 'botao_youtube',
    label: 'Botão YouTube',
    description: 'Botão independente com logo oficial do YouTube (canal ou vídeo).',
    defaultContent: {
      label: 'YouTube',
      url: '',
    },
  },
  {
    type: 'botao_facebook',
    label: 'Botão Facebook',
    description: 'Botão independente com logo oficial do Facebook (página ou URL).',
    defaultContent: {
      label: 'Facebook',
      url: '',
    },
  },
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    description: 'Botão verde direto para iniciar conversa no WhatsApp.',
    defaultContent: {
      label: 'Falar no WhatsApp',
      phone: '',
      message: 'Olá! Gostaria de mais informações.',
    },
  },
  {
    type: 'avaliacoes_google',
    label: 'Nos avalie no Google',
    description: 'Botão direto para o perfil de avaliações no Google Maps.',
    defaultContent: {
      label: 'Nos avalie no Google',
      reviewsUri: '',
      writeReviewUri: '',
    },
  },
  {
    type: 'como_chegar',
    label: 'Como chegar',
    description: 'Botão para abrir rota direta no Google Maps.',
    defaultContent: {
      label: 'Como chegar',
      address: '',
      directionsUri: '',
    },
  },
  {
    type: 'titulo_secao',
    label: 'Título de seção',
    description: 'Cabeçalho para organizar serviços, novidades ou informações.',
    defaultContent: {
      title: 'O que oferecemos',
      subtitle: '',
    },
  },
  {
    type: 'produto_servico',
    label: 'Produto / serviço',
    description: 'Cartão individual com nome, descrição e valor opcional.',
    defaultContent: {
      name: 'Novo serviço',
      description: 'Descreva os detalhes do atendimento ou produto.',
      price: '',
      image: '',
    },
  },
  {
    type: 'texto',
    label: 'Texto',
    description: 'Parágrafo institucional ou diferenciais do estabelecimento.',
    defaultContent: {
      title: '',
      body: 'Conte um pouco sobre a história, diferenciais e atendimento da empresa.',
    },
  },
  {
    type: 'avaliacoes',
    label: 'Avaliações',
    description: 'Nota no Google e depoimentos importados da ficha do estabelecimento.',
    defaultContent: {
      title: 'Quem conhece recomenda',
      rating: null,
      userRatingCount: null,
      reviewsUri: '',
      reviews: [],
    },
  },
  {
    type: 'galeria',
    label: 'Galeria de fotos',
    description: 'Fotos reais do ambiente, fachada e atendimento.',
    defaultContent: {
      title: 'Conheça nosso espaço',
      images: [],
    },
  },
  {
    type: 'horarios',
    label: 'Horário de funcionamento',
    description: 'Dias e horários de atendimento da empresa.',
    defaultContent: {
      title: 'Horário de funcionamento',
      weekdayDescriptions: [],
    },
  },
  {
    type: 'endereco_mapa',
    label: 'Endereço / mapa',
    description: 'Endereço completo com mapa interativo do Google Maps.',
    defaultContent: {
      title: 'Onde estamos',
      address: '',
      phone: '',
      website: '',
      mapsUrl: '',
      directionsUri: '',
      location: null,
      showMap: true,
    },
  },
  {
    type: 'redes_sociais',
    label: 'Redes sociais',
    description: 'Linha de ícones para Instagram, Facebook, TikTok, YouTube e Site.',
    defaultContent: {
      title: 'Acompanhe nas redes',
      instagram: '',
      facebook: '',
      youtube: '',
      tiktok: '',
      website: '',
    },
  },
  {
    type: 'pix',
    label: 'Pix',
    description: 'Cartão com chave Pix copiável para facilitar pagamentos.',
    defaultContent: {
      title: 'Pagamento via Pix',
      keyType: 'CNPJ',
      pixKey: '',
      beneficiary: '',
      note: 'Copie a chave e envie o comprovante no WhatsApp.',
    },
  },
  {
    type: 'wifi',
    label: 'Wi-Fi',
    description: 'Credenciais de rede Wi-Fi para clientes no local.',
    defaultContent: {
      title: 'Wi-Fi para clientes',
      networkName: '',
      password: '',
      security: 'WPA2',
    },
  },
  {
    type: 'formulario',
    label: 'Formulário de contato',
    description: 'Captação rápida de nome e mensagem enviada para o WhatsApp.',
    defaultContent: {
      title: 'Solicitar orçamento',
      subtitle: 'Preencha seus dados para iniciar o atendimento.',
      buttonLabel: 'Enviar no WhatsApp',
      destinationWhatsapp: '',
    },
  },
];

export function getBlockLabel(blockType: string): string {
  const found = BLOCK_CATALOG.find((b) => b.type === blockType);
  if (found) return found.label;
  if (blockType === 'capa') return 'Capa';
  if (blockType === 'servicos') return 'Lista de serviços';
  if (blockType === 'endereco') return 'Endereço / mapa';
  return blockType;
}

export function getBlockSummary(block: MinisiteBlockData): string {
  const c = block.content || {};
  switch (block.blockType) {
    case 'botao_link':
      return String(c.label || c.url || 'Botão de link');
    case 'botao_instagram':
      return c.url ? `${String(c.label || 'Instagram')} · ${String(c.url)}` : String(c.label || 'Instagram');
    case 'botao_tiktok':
      return c.url ? `${String(c.label || 'TikTok')} · ${String(c.url)}` : String(c.label || 'TikTok');
    case 'botao_youtube':
      return c.url ? `${String(c.label || 'YouTube')} · ${String(c.url)}` : String(c.label || 'YouTube');
    case 'botao_facebook':
      return c.url ? `${String(c.label || 'Facebook')} · ${String(c.url)}` : String(c.label || 'Facebook');
    case 'whatsapp':
      return String(c.label || c.phone || 'WhatsApp');
    case 'avaliacoes_google':
      return String(c.label || 'Nos avalie no Google');
    case 'como_chegar':
      return String(c.label || c.address || 'Como chegar');
    case 'titulo_secao':
      return String(c.title || 'Título de seção');
    case 'produto_servico':
      return String(c.name || 'Produto / serviço');
    case 'servicos': {
      const items = Array.isArray(c.items) ? c.items : [];
      return `${items.length} serviço(s)`;
    }
    case 'texto':
      return String(c.body || c.title || 'Texto institucional').slice(0, 72);
    case 'avaliacoes':
      return String(c.title || 'Avaliações do Google');
    case 'galeria': {
      const imgs = Array.isArray(c.images) ? c.images : [];
      return `${String(c.title || 'Galeria')} (${imgs.length} fotos)`;
    }
    case 'horarios':
      return String(c.title || 'Horário de funcionamento');
    case 'endereco_mapa':
    case 'endereco':
      return String(c.address || c.title || 'Endereço e mapa').slice(0, 72);
    case 'redes_sociais':
      return String(c.title || 'Linha de ícones das suas redes');
    case 'pix':
      return String(c.pixKey || c.title || 'Chave Pix');
    case 'wifi':
      return String(c.networkName || c.title || 'Wi-Fi');
    case 'formulario':
      return String(c.title || 'Formulário de contato');
    default:
      return String(c.title || c.label || 'Bloco');
  }
}

// ---- COLOR & CONTRAST UTILITIES ----

export function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex.trim())) return null;
  const clean = hex.trim();
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function mixHexColors(hexA: string, hexB: string, weightB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w
  );
}

export function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickReadableTextColor(bgHex: string): '#FFFFFF' | '#10253D' {
  const whiteContrast = getContrastRatio('#FFFFFF', bgHex);
  const darkContrast = getContrastRatio('#10253D', bgHex);
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#10253D';
}

export function enforceThemePaletteContrast<
  T extends {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    surfaceColor: string;
    serviceCardBg?: string;
    textColor: string;
    buttonTextColor: string;
  },
>(palette: T): T & { serviceCardBg: string } {
  const isDarkBg = getRelativeLuminance(palette.backgroundColor) < 0.35;
  const safeText =
    getContrastRatio(palette.textColor, palette.backgroundColor) >= 4.5
      ? palette.textColor
      : isDarkBg
        ? '#F8FAFC'
        : '#1E1B18';

  const safeButtonText =
    getContrastRatio(palette.buttonTextColor, palette.primaryColor) >= 4.2
      ? palette.buttonTextColor
      : pickReadableTextColor(palette.primaryColor);

  const computedServiceBg =
    palette.serviceCardBg && /^#[0-9a-fA-F]{6}$/.test(palette.serviceCardBg)
      ? palette.serviceCardBg
      : mixHexColors(palette.surfaceColor, palette.primaryColor, isDarkBg ? 0.16 : 0.14);

  return {
    ...palette,
    textColor: safeText,
    buttonTextColor: safeButtonText,
    serviceCardBg: computedServiceBg,
  };
}
