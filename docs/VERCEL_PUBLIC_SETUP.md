# Configuração Vercel Apenas para Rotas e Recursos Públicos

Este guia documenta como publicar a camada pública dos minisites no padrão canônico **`https://linkfoco.vercel.app/<slug>`** (por exemplo `https://linkfoco.vercel.app/nosso-pet-favorito`), mantendo **painel administrativo, login, banco de dados PostgreSQL e chaves/segredos privados exclusivamente no backend existente (Node/Express)**.

---

## 1. Divisão de responsabilidades e precedência de rotas

### Fica na Vercel (ordem obrigatória de precedência)
1. **Assets e arquivos da raiz** (`/assets/*`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/sw.js`) — avaliados **antes** do rewrite de slug raiz.
2. **Proxy apenas de endpoints públicos sem autenticação**:
   - `/api/public/:path*` (snapshot publicado, ETag/cache por minisite e resolução de aliases)
   - `/api/google/place-photo` (proxy seguro de fotos com `Cross-Origin-Resource-Policy: cross-origin`)
   - `/uploads/:path*` (imagens e vídeos enviados pelo editor, com cache imutável)
   - `/q/:code` (redirecionamento de QR Codes dinâmicos)
3. **Rotas legadas e demonstração (compatibilidade preservada)**:
   - `/LinkFoco/:slug` e `/s/:slug` -> redirecionam ao novo endereço canônico `/:slug` preservando a *query string* (`?src=...`) quando publicados, e retornam `404` se forem rascunhos/inexistentes.
   - `/demo/:slug` -> preserva o modo demonstração com `Cache-Control: no-store`.
4. **Rota pública canônica de segmento único (`/:slug`)**:
   - Aceita apenas identificadores válidos (`[a-z0-9-]{3,64}`), excluindo por lookahead negativo e lista de reservados no backend qualquer rota interna (`/admin`, `/login`, `/painel`, `/dashboard`, `/minisites`, `/crm`, `/prospeccao`, `/qr-codes`, `/scripts`, `/configuracoes`, `/empresas`, `/equipe`, `/logs`, `/api`, `/assets`, `/uploads`, `/q`, `/demo`, `/m`, `/s`, `/linkfoco`, arquivos com extensão etc.).

### Permanece EXCLUSIVAMENTE no backend existente (nunca publicar segredos na Vercel)
- Painel administrativo (`/minisites`, `/crm`, `/prospeccao`, `/configuracoes`, `/equipe`, `/logs`).
- Autenticação (`/api/auth/login`, `/api/me`, Firebase Admin/Auth).
- Banco de dados PostgreSQL / Cloud SQL e suas credenciais (`SQL_*`, `DATABASE_URL`).
- Chaves privadas de servidor (`GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, `ADMIN_PASSWORD`, tokens de sessão).
- **Importante:** nunca faça proxy de `/api/minisites/*`, `/api/auth/*`, `/api/crm/*`, `/api/settings` ou `/api/prospeccao/*` pela camada pública da Vercel, e **nunca** use uma URL temporária `ais-dev-*.run.app` como destino de produção.

---

## 2. Variáveis de ambiente necessárias

### No projeto Vercel (apenas variáveis públicas `VITE_*`)
- `VITE_PUBLIC_BASE_URL=https://linkfoco.vercel.app`

> **Não adicione** `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, credenciais de banco ou senhas de administrador no painel da Vercel.

### No backend de produção (Node/Express)
- `PUBLIC_BASE_URL=https://linkfoco.vercel.app`
- `VITE_PUBLIC_BASE_URL=https://linkfoco.vercel.app`
- Demais variáveis de banco, Firebase e APIs já existentes no backend.

---

## 3. Configuração do `vercel.json` para proxy público

Use o arquivo modelo `vercel.public.template.json` como base para o `vercel.json` de produção, substituindo `<ORIGEM_ESTAVEL_DO_BACKEND_DE_PRODUCAO>` pela URL HTTPS **fixa e estável** do seu backend em produção (nunca uma URL `ais-dev-*`).

### Aliases de slug e rotas antigas
- Ao alterar o `slug` de um minisite já publicado no editor (**Endereço do site**), o backend grava o slug anterior na tabela `minisite_slug_aliases`.
- **Não é necessário redeploy na Vercel nem domínio por cliente.**
- Acessos a `/<slug-antigo>?src=instagram`, `/LinkFoco/<slug-antigo>?src=instagram` ou `/s/<slug-antigo>?src=instagram` resolvem em salto único para `/<slug-atual>?src=instagram`, sem loops.
- Rascunhos, minisites desativados e aliases de minisites não publicados retornam `404` com `Cache-Control: no-store, max-age=0`.

---

## 4. Política de cache seguro por minisite e carregamento de fotos

| Recurso | Estratégia de Cache | Observação |
| :--- | :--- | :--- |
| `/api/public/site/:slug` (publicado) | `ETag` único por `minisiteId + slug + updatedAt + publishedAt` + `Cache-Control: public, max-age=30, s-maxage=120, stale-while-revalidate=300` | Suporta `If-None-Match` (`304 Not Modified`). Atualizações ou trocas de slug geram novo ETag automaticamente. |
| `/api/public/site/:slug` (`redirect` ou `404`) | `Cache-Control: no-store, max-age=0` | Evita que rascunhos ou redirecionamentos antigos fiquem presos em cache. |
| `/api/public/minisite/:slug` (prévia/demo) | `Cache-Control: private, no-store, max-age=0` | Nunca é armazenado em cache público de borda. |
| `/api/google/place-photo` | `Cache-Control: public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400`, `Cross-Origin-Resource-Policy: cross-origin`, `Access-Control-Allow-Origin: *` | Garante carregamento das fotos sem expor a chave do Google Places. |
| `/uploads/:filename` | `Cache-Control: public, max-age=31536000, immutable`, `Cross-Origin-Resource-Policy: cross-origin`, `Access-Control-Allow-Origin: *` | Arquivos com nome hash único carregam com cache longo e persistência em banco (`media_assets`). |

---

## 5. Checklist de integração manual restante (fora do repositório)

1. Provisionar/confirmar a URL estável de produção do backend Node/Express (sem `ais-dev`).
2. Configurar `PUBLIC_BASE_URL=https://linkfoco.vercel.app` no ambiente do backend de produção.
3. No projeto Vercel (`linkfoco.vercel.app`), copiar `vercel.public.template.json` para `vercel.json` preenchendo `<ORIGEM_ESTAVEL_DO_BACKEND_DE_PRODUCAO>` com a origem real do backend.
4. Configurar `VITE_PUBLIC_BASE_URL=https://linkfoco.vercel.app` nas Environment Variables do projeto na Vercel e executar o deploy.
5. Validar após deploy:
   - `GET https://linkfoco.vercel.app/<slug-publicado>` carrega o minisite e fotos normalmente.
   - `GET https://linkfoco.vercel.app/<slug-rascunho>` e `GET https://linkfoco.vercel.app/LinkFoco/<slug-rascunho>` retornam `404`.
   - `GET https://linkfoco.vercel.app/LinkFoco/<slug-publicado>?src=instagram`, `/s/<slug-publicado>?src=instagram` e `/<slug-antigo>?src=instagram` redirecionam para `/<slug-atual>?src=instagram`.
   - `GET https://linkfoco.vercel.app/demo/<slug>` preserva o modo demonstração.
