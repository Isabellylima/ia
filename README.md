# FERCOPOR IA

Centro de inteligência corporativa da FERCOPOR (app interna). Worker Cloudflare `ia`; endereço previsto `ia.fercopor.app`.
Fase atual do roadmap: **01 · Foundation** (infraestrutura, interface, autenticação, base de dados e AI Core).

## Estrutura

Servidor em [Hono](https://hono.dev) com os pacotes partilhados FERCOPOR em `packages/` (workspaces npm), os mesmos das
outras apps: `@fercopor/login` (login Microsoft e rotas `/auth/*`), `@fercopor/acessos` (Padrão de Acessos e `/admin/*`) e
`@fercopor/ui`.

| Ficheiro | Conteúdo |
|---|---|
| `src/index.js` | App Hono e ordem de segurança (`/auth/*` → sessão → `/admin/*` → ação do endereço → páginas → erros) |
| `src/conteudo.js` | Menu, agentes especializados, serviços Cloudflare e roadmap (alterar aqui muda as páginas) |
| `src/acessos.js` | Catálogo de ações (um por item do menu) e nível de origem «Equipa» |
| `src/auth.js` | Login Microsoft e resolução do acesso |
| `src/paginas.js` | Layout (topo, menu lateral, menu da conta), Dashboard, Infraestrutura e Roadmap, páginas por configurar, entrada |
| `public/ia.css` | Interface |

## Páginas

- **Dashboard** (`/`): Intelligence Overview — indicadores (Agentes, Integrações, Conhecimento, Consumo mensal; «—» até
  haver serviços ligados), «Como posso ajudar?» (desativado até ao fim da fase 01), fase atual e agentes especializados.
- **Infraestrutura e Roadmap** (`/infraestrutura`, menu Administração): serviços Cloudflare com finalidade e prioridade e
  as 7 fases de desenvolvimento.
- Restantes itens do menu: «Por configurar».
- **Permissões** = Níveis de Acesso e Ações (`/admin/acessos`); **Utilizadores** (`/admin/utilizadores`) no menu da conta. Só ADM.

## Acessos (Padrão de Acessos FERCOPOR)

- Login só com a conta Microsoft 365 da FERCOPOR (`@fercopor.pt`).
- App nova, sem lista herdada: até haver lista gravada, só entram os `ADMIN_EMAILS`. Regra de entrada por omissão: quem não
  está na lista não entra.
- O servidor verifica a ação de cada endereço (o menu só esconde).

## Configuração no Cloudflare (Worker `ia`)

| Variável / segredo | Valor |
|---|---|
| `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Aplicação Entra ID (pode ser a mesma das outras apps, com mais um URI de retorno) |
| `ADMIN_EMAILS` | Administradores fixos (separados por vírgula) |
| `APP_URL` | `https://ia.fercopor.app` (depois do domínio ligado) |
| `DOMINIO_PRINCIPAL` | `https://ia.fercopor.app` (o `*.workers.dev` passa a redirecionar) |

URI de retorno a registar no Entra ID (plataforma Web): `https://ia.fercopor.app/auth/retorno` (e, enquanto não houver
domínio, o endereço `*.workers.dev`/`auth/retorno`).

A KV `IA_KV` é criada na primeira publicação.

## Desenvolvimento

```
npm install
npm test          # testes da app e dos pacotes
npm run local     # demonstração local sem login em http://localhost:8797/
```
