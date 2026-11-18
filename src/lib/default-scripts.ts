export interface DefaultScriptTemplate {
  stageKey: string;
  stageOrder: number;
  stageTitle: string;
  title: string;
  body: string;
}

export const SCRIPT_VARIABLES = [
  '{meu_nome}',
  '{minha_cidade}',
  '{negocio}',
  '{link_site}',
  '{preco_site}',
  '{avaliacoes}',
  '{nota}',
  '{concorrente}',
  '{concorrente_avaliacoes}',
  '{gap}',
  '{preco}',
  '{link_avaliacao}',
] as const;

export const DEFAULT_COMMERCIAL_SCRIPTS: DefaultScriptTemplate[] = [
  {
    stageKey: 'abertura',
    stageOrder: 1,
    stageTitle: '1. Abertura',
    title: 'Só o oi',
    body: 'Oi, tudo bem? Aqui é o {meu_nome}, de {minha_cidade} 🙂',
  },
  {
    stageKey: 'respondeu',
    stageOrder: 2,
    stageTitle: '2. Depois que respondeu',
    title: 'Roteiro do áudio (grave com voz de conversa)',
    body: 'Opa, tudo certo? Vou ser rápido. Procurei a {negocio} no Google e vi que vocês não têm site — quem pesquisa acaba indo pro concorrente que tem. Eu monto sites simples pra comércio da região, com WhatsApp, fotos, horário e mapa. Tomei a liberdade de montar uma prévia do de vocês, posso te mandar o link?',
  },
  {
    stageKey: 'respondeu',
    stageOrder: 2,
    stageTitle: '2. Depois que respondeu',
    title: 'Versão em texto (se não der pra mandar áudio)',
    body: 'Procurei a {negocio} no Google e vi que vocês ainda não têm site. Eu monto sites pra comércio da região — e já deixei uma prévia pronta do de vocês, com as fotos e o horário do Google. Posso te mandar?',
  },
  {
    stageKey: 'previa',
    stageOrder: 3,
    stageTitle: '3. Prévia do minisite',
    title: 'Link da prévia',
    body: 'Olha aqui como ficou: {link_site}\n\nAbre no celular — tem botão de WhatsApp, fotos, horário e como chegar. Dá pra mudar cores, textos e fotos do jeito que você quiser.',
  },
  {
    stageKey: 'previa',
    stageOrder: 3,
    stageTitle: '3. Prévia do minisite',
    title: 'Depois que ele abriu a prévia',
    body: 'Viu como o cliente já cai direto no seu WhatsApp? Você coloca esse link no Instagram, no Google e manda pros clientes. O que achou?',
  },
  {
    stageKey: 'preco_fechamento',
    stageOrder: 4,
    stageTitle: '4. Preço e fechamento',
    title: 'Preço',
    body: '{preco_site}. O site já fica no ar com o link de vocês, pronto pra colocar no Instagram e no Google. Custa menos que um mês de impulsionamento e trabalha pra você todo dia.',
  },
  {
    stageKey: 'preco_fechamento',
    stageOrder: 4,
    stageTitle: '4. Preço e fechamento',
    title: 'Fechamento (pergunta de escolha)',
    body: 'Quer que eu deixe ele no ar hoje do jeito que está, ou prefere trocar alguma foto antes?',
  },
  {
    stageKey: 'objecoes',
    stageOrder: 5,
    stageTitle: '5. Objeções',
    title: '"Tá caro"',
    body: 'Entendo. Pensa assim: se o site trouxer 2 clientes que te acharam pelo Google, já se pagou — e ele continua no ar todo mês.',
  },
  {
    stageKey: 'objecoes',
    stageOrder: 5,
    stageTitle: '5. Objeções',
    title: '"Já tenho Instagram"',
    body: 'Instagram é ótimo! O site junta tudo num link só: WhatsApp, endereço, horário, fotos e avaliações. Você coloca ele na bio e no Google, e o cliente não se perde.',
  },
  {
    stageKey: 'objecoes',
    stageOrder: 5,
    stageTitle: '5. Objeções',
    title: '"Vou pensar"',
    body: 'Claro! A prévia fica aqui pra você mostrar pra quem quiser. O que pesa mais pra você: o valor ou se vai trazer cliente mesmo?',
  },
  {
    stageKey: 'followup',
    stageOrder: 6,
    stageTitle: '6. Follow-up',
    title: 'Follow-up 1 (2 dias sem resposta)',
    body: 'Oi! Conseguiu ver minha mensagem? 🙂',
  },
  {
    stageKey: 'followup',
    stageOrder: 6,
    stageTitle: '6. Follow-up',
    title: 'Follow-up 2 (5 dias sem resposta)',
    body: 'Passando só pra não deixar no vácuo: a prévia do site da {negocio} ainda tá aqui. Se fizer sentido, me chama que eu coloco no ar. Se não, sem problema!',
  },
  {
    stageKey: 'pos_venda',
    stageOrder: 7,
    stageTitle: '7. Pós-venda',
    title: 'Site no ar',
    body: 'Seu site tá no ar! {link_site}\n\nColoca esse link na bio do Instagram e no seu perfil do Google. Qualquer mudança é só me chamar.',
  },
  {
    stageKey: 'pos_venda',
    stageOrder: 7,
    stageTitle: '7. Pós-venda',
    title: 'Pedido de indicação (1 semana depois)',
    body: 'E aí, já chegou cliente pelo site? Se tiver algum amigo dono de comércio que ia gostar também, me indica que eu faço uma condição especial pra ele 🙏',
  },
  {
    stageKey: 'placa_avaliacao',
    stageOrder: 8,
    stageTitle: '8. Placa de avaliação (venda adicional)',
    title: 'Oferta da placa (depois de fechar o site)',
    body: 'Uma ideia pra completar: vocês têm {avaliacoes} avaliações no Google e a {concorrente} tem {concorrente_avaliacoes}. Tenho uma plaquinha com chip e QR: o cliente encosta o celular e já avalia vocês. {preco}. Quer junto com o site?',
  },
  {
    stageKey: 'placa_avaliacao',
    stageOrder: 8,
    stageTitle: '8. Placa de avaliação (venda adicional)',
    title: 'Entrega da placa',
    body: 'Sua placa tá pronta e configurada! Testa aí: encosta o celular ou aponta a câmera pro QR. O link direto pra mandar pros clientes é: {link_avaliacao}',
  },
];

export interface ScriptInterpolationContext {
  meu_nome?: string;
  minha_cidade?: string;
  negocio?: string;
  link_site?: string;
  preco_site?: string;
  avaliacoes?: string | number;
  nota?: string | number;
  concorrente?: string;
  concorrente_avaliacoes?: string | number;
  gap?: string | number;
  preco?: string;
  link_avaliacao?: string;
}

export function interpolateScriptVariables(
  template: string,
  ctx: ScriptInterpolationContext
): string {
  const map: Record<string, string> = {
    '{meu_nome}': ctx.meu_nome || '[Seu nome em Config]',
    '{minha_cidade}': ctx.minha_cidade || '[Sua cidade em Config]',
    '{negocio}': ctx.negocio || '[Nome do negócio]',
    '{link_site}': ctx.link_site || '[Link da prévia]',
    '{preco_site}': ctx.preco_site || 'R$ 97/mês',
    '{avaliacoes}': String(ctx.avaliacoes ?? '0'),
    '{nota}': String(ctx.nota ?? '—'),
    '{concorrente}': ctx.concorrente || '[Concorrente local]',
    '{concorrente_avaliacoes}': String(ctx.concorrente_avaliacoes ?? '0'),
    '{gap}': String(ctx.gap ?? '0'),
    '{preco}': ctx.preco || 'R$ 79,00',
    '{link_avaliacao}': ctx.link_avaliacao || '[Link de avaliação Google]',
  };

  let output = template;
  for (const [token, value] of Object.entries(map)) {
    output = output.split(token).join(value);
  }
  return output;
}
