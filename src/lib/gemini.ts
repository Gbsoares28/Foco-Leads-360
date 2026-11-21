import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentParameters } from '@google/genai';
import {
  enforceThemePaletteContrast,
  getDefaultPaletteForTemplate,
} from './minisite-types.ts';

export interface ImageInputPart {
  dataBase64: string;
  mimeType: string;
  label?: string;
}

export interface AnalyzedBrandPalette {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  serviceCardBg: string;
  textColor: string;
  buttonTextColor: string;
  fontFamily: string;
  brandAnalysisSummary: string;
}

export interface GeneratedMinisitePayload {
  business: {
    name: string;
    category: string;
    city: string;
    address: string;
    phone: string;
    whatsapp: string;
    instagram: string;
  };
  templateId: string;
  theme: AnalyzedBrandPalette;
  seo: {
    title: string;
    description: string;
  };
  hero: {
    title: string;
    subtitle: string;
  };
  institutionalText: string;
  sectionTitle: string;
  services: Array<{
    name: string;
    description: string;
    needsReview: boolean;
  }>;
  ctaLabel: string;
  needsReviewFields: string[];
}

const VALID_TEMPLATES = [
  'clinica_veterinaria',
  'pet_shop',
  'banho_e_tosa',
  'barbearia',
  'salao_de_beleza',
  'restaurante',
  'consultorio',
  'loja',
  'prestador_de_servicos',
  'modelo_generico',
];

function isHexColor(val: unknown): val is string {
  return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim());
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY não configurada no ambiente do servidor. Configure a chave para geração com IA.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Erro desconhecido na Gemini API.';
  }
}

export function isTransientGeminiError(err: unknown): boolean {
  const msg = extractRawErrorMessage(err).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('500') ||
    msg.includes('internal') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  );
}

export function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = extractRawErrorMessage(err);
  const lower = raw.toLowerCase();

  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      status: 503,
      message:
        'Os modelos de IA estão temporariamente com alta demanda (503). Aguarde alguns segundos e clique para tentar novamente.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Limite temporário de requisições da Gemini API atingido. Aguarde instantes e tente novamente.',
    };
  }
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 400,
      message:
        'A chave GEMINI_API_KEY configurada está inválida ou sem permissão. Verifique Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw.length > 240 ? 'Não foi possível concluir a análise com IA no momento.' : raw,
  };
}

async function generateContentWithResilience(params: {
  ai: GoogleGenAI;
  contents: GenerateContentParameters['contents'];
  config: GenerateContentParameters['config'];
  models?: string[];
}) {
  const models = params.models ?? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastError: unknown;

  for (const model of models) {
    const maxAttempts = 2;
    const modelThinkingLevel =
      model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await params.ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            ...params.config,
            thinkingConfig: { thinkingLevel: modelThinkingLevel },
          },
        });
      } catch (err) {
        lastError = err;
        if (!isTransientGeminiError(err)) {
          throw err;
        }
        if (attempt < maxAttempts) {
          await sleep(300 * attempt);
        }
      }
    }
  }

  throw lastError;
}

function sanitizeTheme(
  rawTheme: Partial<AnalyzedBrandPalette> | undefined,
  templateId: string
): AnalyzedBrandPalette {
  const fallbackPalette = getDefaultPaletteForTemplate(templateId).theme;
  const base = enforceThemePaletteContrast({
    primaryColor: isHexColor(rawTheme?.primaryColor)
      ? rawTheme.primaryColor
      : fallbackPalette.primaryColor,
    secondaryColor: isHexColor(rawTheme?.secondaryColor)
      ? rawTheme.secondaryColor
      : fallbackPalette.secondaryColor,
    accentColor: isHexColor(rawTheme?.accentColor)
      ? rawTheme.accentColor
      : fallbackPalette.accentColor,
    backgroundColor: isHexColor(rawTheme?.backgroundColor)
      ? rawTheme.backgroundColor
      : fallbackPalette.backgroundColor,
    surfaceColor: isHexColor(rawTheme?.surfaceColor)
      ? rawTheme.surfaceColor
      : fallbackPalette.surfaceColor,
    serviceCardBg: isHexColor(rawTheme?.serviceCardBg)
      ? rawTheme.serviceCardBg
      : undefined,
    textColor: isHexColor(rawTheme?.textColor) ? rawTheme.textColor : fallbackPalette.textColor,
    buttonTextColor: isHexColor(rawTheme?.buttonTextColor)
      ? rawTheme.buttonTextColor
      : fallbackPalette.buttonTextColor,
  });

  return {
    ...base,
    fontFamily: rawTheme?.fontFamily || 'Plus Jakarta Sans',
    brandAnalysisSummary:
      typeof rawTheme?.brandAnalysisSummary === 'string' && rawTheme.brandAnalysisSummary.trim()
        ? rawTheme.brandAnalysisSummary.trim()
        : 'Paleta harmônica gerada de acordo com o segmento e legibilidade comercial.',
  };
}

export async function structureMinisiteWithGemini(params: {
  companyNameOrQuery: string;
  category?: string;
  types?: string[];
  city?: string;
  address?: string;
  phone?: string;
  website?: string;
  googleDescription?: string;
  weekdayDescriptions?: string[];
  rating?: number | null;
  userRatingCount?: number | null;
  reviewsSample?: string[];
  description: string;
  resolvedMapsUrl?: string | null;
  imageParts?: ImageInputPart[];
}): Promise<GeneratedMinisitePayload> {
  const ai = getAiClient();

  const systemInstruction = `Você é o motor de estruturação e identidade visual de minisites comerciais da Feed em Foco 360.
REGRAS RÍGIDAS DE INTEGRIDADE:
1. NUNCA invente preços, horários de funcionamento, avaliações, depoimentos, certificações, promoções, telefones ou endereços que não tenham sido fornecidos nos dados abaixo.
2. Melhore a redação comercial apenas com base nas informações explicitamente fornecidas na ficha do Google, nas avaliações reais e na descrição complementar.
3. Para "hero.title": extraia o nome limpo da marca (sem palavras-chave genéricas de SEO em caixa alta no início, ex: "PET SHOP BANHO E TOSA NA TIJUCA – NOSSO PET FAVORITO" vira "Nosso Pet Favorito").
4. Para "hero.subtitle": escreva uma descrição calorosa, direta e comercial (máximo 140 caracteres) fiel ao segmento e bairro/cidade confirmados.
5. Para "sectionTitle": use um título natural e acolhedor para o segmento (ex: "O que fazemos pelo seu pet" para pet shop/banho e tosa, "Nossos cuidados" para clínica, "O que oferecemos" para comércio local).
6. Para "services": extraia de 3 a 4 serviços ou frentes principais mencionados na ficha do Google, nas categorias/tipos, na descrição complementar ou nas avaliações reais enviadas. Cada item deve ter título curto ("Banho", "Tosa", etc.) e descrição natural de 1 a 2 linhas. Se nenhum serviço específico puder ser inferido com segurança, retorne [] e inclua "servicos" em needsReviewFields.
7. Para "institutionalText": escreva um resumo direto e persuasivo de 1 a 2 frases destacando o que clientes mais elogiam nas avaliações reais e diferenciais confirmados da empresa.
8. ANÁLISE DE IDENTIDADE VISUAL DA EMPRESA ("theme"):
   - Se houver imagem anexada, extraia as cores predominantes da marca/fachada para primaryColor, secondaryColor, accentColor, backgroundColor, surfaceColor, serviceCardBg, textColor e buttonTextColor (contraste >= 4.5:1).
   - "brandAnalysisSummary": 1 frase curta em pt-BR explicando a paleta aplicada.
9. Escolha o templateId mais adequado entre: ${VALID_TEMPLATES.join(', ')}.
10. Responda estritamente no JSON especificado.`;

  const prompt = `Dados confirmados da empresa:
Nome: ${params.companyNameOrQuery || 'Não informado'}
Segmento / Categoria Google: ${params.category || 'Não informado'}
Tipos Google Places: ${params.types?.length ? params.types.join(', ') : 'Não informados'}
Cidade: ${params.city || 'Não informada'}
Endereço: ${params.address || 'Não informado'}
Telefone: ${params.phone || 'Não informado'}
Site oficial: ${params.website || 'Não informado'}
Descrição oficial da ficha Google: ${params.googleDescription || 'Não informada'}
Horários Google: ${params.weekdayDescriptions?.length ? params.weekdayDescriptions.join(' | ') : 'Não informados'}
Nota Google: ${params.rating != null ? `${params.rating} (${params.userRatingCount ?? 0} avaliações)` : 'Não informada'}
Trechos de avaliações reais no Google: ${params.reviewsSample?.length ? params.reviewsSample.join(' // ') : 'Nenhum'}
Link Google Maps: ${params.resolvedMapsUrl || 'Não informado'}
Descrição complementar do operador: ${params.description || 'Nenhuma descrição adicional'}
Imagens visuais anexadas para análise de identidade visual: ${params.imageParts?.length || 0}

Analise a identidade visual da empresa (especialmente pelas imagens enviadas, se houver) e estruture os textos, a paleta de cores personalizada e os blocos do minisite em português do Brasil.`;

  const contentParts: Array<
    { text: string } | { inlineData: { data: string; mimeType: string } }
  > = [{ text: prompt }];

  for (const img of params.imageParts || []) {
    if (img.dataBase64 && img.mimeType) {
      contentParts.push({
        inlineData: {
          data: img.dataBase64,
          mimeType: img.mimeType,
        },
      });
    }
  }

  const response = await generateContentWithResilience({
    ai,
    contents: contentParts,
    models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          business: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: { type: Type.STRING },
              city: { type: Type.STRING },
              address: { type: Type.STRING },
              phone: { type: Type.STRING },
              whatsapp: { type: Type.STRING },
              instagram: { type: Type.STRING },
            },
          },
          templateId: { type: Type.STRING },
          theme: {
            type: Type.OBJECT,
            properties: {
              primaryColor: { type: Type.STRING },
              secondaryColor: { type: Type.STRING },
              accentColor: { type: Type.STRING },
              backgroundColor: { type: Type.STRING },
              surfaceColor: { type: Type.STRING },
              serviceCardBg: { type: Type.STRING },
              textColor: { type: Type.STRING },
              buttonTextColor: { type: Type.STRING },
              fontFamily: { type: Type.STRING },
              brandAnalysisSummary: { type: Type.STRING },
            },
          },
          seo: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
            },
          },
          hero: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subtitle: { type: Type.STRING },
            },
          },
          institutionalText: { type: Type.STRING },
          sectionTitle: { type: Type.STRING },
          services: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                needsReview: { type: Type.BOOLEAN },
              },
            },
          },
          ctaLabel: { type: Type.STRING },
          needsReviewFields: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('A resposta da Gemini API retornou vazia.');
  }

  const parsed = JSON.parse(rawText) as GeneratedMinisitePayload;
  if (!VALID_TEMPLATES.includes(parsed.templateId)) {
    parsed.templateId = 'modelo_generico';
  }

  parsed.theme = sanitizeTheme(parsed.theme, parsed.templateId);
  return parsed;
}

export async function analyzeBrandPaletteWithGemini(params: {
  businessName: string;
  category?: string;
  templateId?: string;
  imageParts: ImageInputPart[];
}): Promise<AnalyzedBrandPalette> {
  const ai = getAiClient();
  const tpl = params.templateId && VALID_TEMPLATES.includes(params.templateId)
    ? params.templateId
    : 'modelo_generico';

  const contentParts: Array<
    { text: string } | { inlineData: { data: string; mimeType: string } }
  > = [
    {
      text: `Analise as imagens da marca "${params.businessName}" (${params.category || 'Negócio local'}).
Retorne em JSON a paleta fiel à identidade visual observada:
- primaryColor: cor predominante forte da marca/fachada para botões e ícones.
- secondaryColor: cor secundária para o selo na capa.
- accentColor: cor de acento complementar.
- backgroundColor: fundo suave harmônico (#FAF5ED, #F4F7FB, #18181B, etc).
- surfaceColor: fundo dos cards (#FFFFFF ou escuro).
- serviceCardBg: tom suave da primaryColor para cards de serviço.
- textColor e buttonTextColor: alto contraste.
- brandAnalysisSummary: 1 frase curta em pt-BR sobre as cores da marca.`,
    },
  ];

  for (const img of params.imageParts) {
    if (img.dataBase64 && img.mimeType) {
      contentParts.push({
        inlineData: { data: img.dataBase64, mimeType: img.mimeType },
      });
    }
  }

  const response = await generateContentWithResilience({
    ai,
    contents: contentParts,
    models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryColor: { type: Type.STRING },
          secondaryColor: { type: Type.STRING },
          accentColor: { type: Type.STRING },
          backgroundColor: { type: Type.STRING },
          surfaceColor: { type: Type.STRING },
          serviceCardBg: { type: Type.STRING },
          textColor: { type: Type.STRING },
          buttonTextColor: { type: Type.STRING },
          fontFamily: { type: Type.STRING },
          brandAnalysisSummary: { type: Type.STRING },
        },
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Não foi possível analisar a paleta de cores.');
  }

  const parsed = JSON.parse(rawText) as Partial<AnalyzedBrandPalette>;
  return sanitizeTheme(parsed, tpl);
}
