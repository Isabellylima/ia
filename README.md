# FERCOPOR IA

Centro de inteligência corporativa da FERCOPOR (app interna). Worker Cloudflare `ia`, publicado em `ia.fercopor.app`.
Fase atual do roadmap: **01 · Foundation** (infraestrutura, interface, autenticação, base de dados e AI Core).

## Estrutura

Servidor em [Hono](https://hono.dev) com os pacotes partilhados FERCOPOR em `packages/` (workspaces npm), os mesmos das
outras apps: `@fercopor/login` (login Microsoft e rotas `/auth/*`), `@fercopor/acessos` (Padrão de Acessos e `/admin/*`) e
`@fercopor/ui`. Motor de IA com o SDK oficial `@anthropic-ai/sdk` (versão fixada).

| Ficheiro | Conteúdo |
|---|---|
| `src/index.js` | App Hono e ordem de segurança (`/auth/*` → sessão → `/admin/*` → ação do endereço → mesma origem nos POST → páginas → erros) |
| `src/conteudo.js` | Menu, agentes especializados, serviços Cloudflare e roadmap (alterar aqui muda as páginas) |
| `src/acessos.js` | Catálogo de ações (um por item do menu; a API do assistente usa a ação da página) e nível de origem «Equipa» |
| `src/auth.js` | Login Microsoft e resolução do acesso |
| `src/paginas.js` | Layout (topo, menu lateral, menu da conta), Dashboard, Infraestrutura e Roadmap, páginas por configurar, entrada |
| `src/paginasIA.js` | Assistente, Conversas, Modelos, Monitorização e Configuração da IA |
| `src/ia/modelos.js` | Catálogo de modelos (fornecedor, preços, contexto) e funções Principal / Operacional / Análise avançada |
| `src/ia/config.js` | Identidade «FERCOPOR IA», agentes, limites por omissão; configuração editável guardada na KV |
| `src/ia/assistente.js` | Orquestrador: validação, reserva do consumo, streaming, ciclo de ferramentas, histórico e registo |
| `src/ia/bd.js` | D1: esquema (criado na primeira utilização), conversas, mensagens, pedidos, limites, monitorização |
| `src/ia/fornecedores/` | Interface comum dos fornecedores de IA e adaptador Anthropic (único sítio que conhece o SDK) |
| `src/ia/ferramentas.js` | Registo de ferramentas (tool calling) para HubSpot e outras apps; vazio nesta fase |
| `src/ia/conhecimento.js` | Ponto de ligação da base de conhecimento (RAG, fase 02); devolve sempre lista vazia |
| `public/ia.css`, `public/assistente.js` | Interface; o script só é carregado na página do Assistente |

## Páginas

- **Dashboard** (`/`): Intelligence Overview: indicadores (Agentes ativos e Consumo mensal estimado com dados reais;
  Integrações e Conhecimento mostram «—» até haver serviços ligados), «Como posso ajudar?» (abre o Assistente quando o motor
  está configurado), fase atual e agentes especializados.
- **Assistente IA** (`/assistente`, `/assistente?c=<conversa>`): conversa em streaming com a FERCOPOR IA; a conversa fica
  guardada. Aviso permanente: fase de testes, sem dados pessoais de clientes.
- **Conversas** (`/conversas`): histórico de cada pessoa (só o dono vê as suas); apagar = ocultar.
- **Modelos** (`/modelos`): catálogo, preços e modelo de cada função (consulta para todos; alteração só ADM).
- **Monitorização** (`/monitorizacao`): pedidos, tokens, duração e custo estimado do mês; ADM vê todos, cada pessoa vê os seus.
- **Integrações** (`/integracoes`): estado da ligação à Anthropic e botão **Testar ligação** (só ADM): verifica KV, D1,
  credencial (sem a mostrar), autenticação e acesso ao modelo (Models API), resposta em streaming com as instruções globais
  e limites, com um pedido real mínimo registado em Monitorização como «Teste de ligação».
- **Configuração da IA** (`/admin/ia`, menu da conta, só ADM): modelo, esforço e máximo de tokens por função; instruções de
  sistema gerais e por agente; agentes ativos; limites por utilizador e por agente.
- **Infraestrutura e Roadmap** (`/infraestrutura`, menu Administração): serviços Cloudflare e as 7 fases.
- Restantes itens do menu (Agentes IA, Conhecimento, Memória, Automações, Reuniões, Relatórios, Configurações):
  «Por configurar».
- **Permissões** = Níveis de Acesso e Ações (`/admin/acessos`); **Utilizadores** (`/admin/utilizadores`) no menu da conta. Só ADM.

## Motor de IA

- **Fornecedor:** Anthropic (Messages API, em streaming), sempre a partir do Worker. A chave (`ANTHROPIC_API_KEY`) nunca sai
  do servidor; o navegador só fala com `/api/assistente/mensagem` (sessão obrigatória, mesma origem, ação «Assistente IA»).
- **Modelos** (confirmados na documentação oficial em 2026-11-26):

  | Função | Modelo | Esforço | Máx. tokens |
  |---|---|---|---|
  | Principal (conversas) | `claude-sonnet-5-5` | médio | 16 000 |
  | Operacional (tarefas simples) | `claude-haiku-5-5` | baixo | 8 000 |
  | Análise avançada | `claude-opus-5-5` | alto | 32 000 |

  Todos alteráveis em `/admin/ia` sem publicar código. Sonnet 5.5 e Opus 5.5 usam o fallback do servidor da Anthropic
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): numa recusa por política, o pedido é repetido noutro
  modelo dentro da mesma chamada. O custo é calculado por modelo efetivamente usado.
- **Identidade:** os utilizadores veem sempre «FERCOPOR IA». Se alguém perguntar diretamente que tecnologia é usada, o
  assistente pode dizer que usa modelos Claude, da Anthropic (não nega o motor).
- **Instruções de sistema:** identidade fixa + instruções gerais + instruções do agente (as duas últimas em `/admin/ia`).
- **Histórico:** D1 (`conversas`, `mensagens`). O conteúdo devolvido pelo fornecedor é guardado e reenviado tal como veio
  (só se acrescenta), como a Anthropic exige para o raciocínio dos modelos atuais. Cache automática do prefixo
  (`cache_control`) para baixar o custo das conversas longas.
- **Registo de cada pedido** (D1, `pedidos`): utilizador, agente, modelo pedido e modelo que respondeu, tokens de entrada,
  saída, escrita e leitura em cache, duração, passos, motivo de paragem, estado e custo estimado (USD, preços de
  `src/ia/modelos.js`). Também vai para os registos do Worker (`evento: pedido_ia`, sem texto das conversas).
- **Limites:** por utilizador (pedidos/dia, custo/dia, custo/mês, pedidos em simultâneo) e por agente (pedidos/dia,
  custo/dia, custo/mês); 0 = sem limite. Antes de cada pedido é **reservado o custo máximo possível** (entrada estimada por
  excesso + saída máxima, com margem para fallback) numa única instrução SQL que só grava se couber em todos os limites;
  pedidos em curso contam pelo valor reservado. O ciclo de ferramentas para antes de ultrapassar a reserva. Dias e meses no
  calendário de Lisboa. Valores por omissão: 100 pedidos, 2 US$/dia e 20 US$/mês por pessoa; 2000 pedidos, 30 US$/dia e
  300 US$/mês por agente.
- **Ferramentas (tool calling):** ciclo completo (até 4 passos por pergunta), validação da entrada, permissões por ação e
  por agente; ferramentas de escrita ficam desligadas até haver confirmação na interface. Nenhuma registada nesta fase.
- **RAG:** `procurarConhecimento()` e `mensagemUtilizador(texto, fontes)` já ligados no fluxo; falta o índice (fase 02:
  R2 + Vectorize + permissões em D1).
- **Outros fornecedores:** acrescentar um adaptador em `src/ia/fornecedores/` com a mesma interface e os seus modelos em
  `src/ia/modelos.js`. O histórico de outro fornecedor é reenviado como texto.

## Acessos (Padrão de Acessos FERCOPOR)

- Login só com a conta Microsoft 365 da FERCOPOR (`@fercopor.pt`).
- App nova, sem lista herdada: até haver lista gravada, só entram os `ADMIN_EMAILS`. Regra de entrada por omissão: quem não
  está na lista não entra.
- O servidor verifica a ação de cada endereço (o menu só esconde). `/api/assistente/*` exige a ação «Assistente IA».
- POST só da mesma origem em toda a app.

## Configuração no Cloudflare (Worker `ia`)

| Variável / segredo | Valor |
|---|---|
| `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Aplicação Entra ID (pode ser a mesma das outras apps, com mais um URI de retorno) |
| `ADMIN_EMAILS` | Administradores fixos (separados por vírgula) |
| `APP_URL` | `https://ia.fercopor.app` |
| `DOMINIO_PRINCIPAL` | `https://ia.fercopor.app` (o `*.workers.dev` passa a redirecionar) |
| `ANTHROPIC_API_KEY` | **Segredo** (tipo «Secret», nunca «Text»): chave da API da Anthropic. Sem ela, as páginas da IA mostram «Por configurar» |
| `AI_GATEWAY_ANTHROPIC_URL` | Opcional: `https://gateway.ai.cloudflare.com/v1/<conta>/<gateway>/anthropic` para passar pelo AI Gateway |

URI de retorno a registar no Entra ID (plataforma Web): `https://ia.fercopor.app/auth/retorno`.

A KV `IA_KV` e a base D1 `IA_DB` são criadas na primeira publicação (binding sem id no `wrangler.jsonc`); o esquema da D1 é
criado pela app no primeiro pedido.

## Desenvolvimento

```
npm install
npm test          # testes da app, da IA (fornecedor simulado, sem pedidos reais) e dos pacotes
npm run local     # demonstração local sem login em http://localhost:8797/ (D1 em memória; IA só com ANTHROPIC_API_KEY no terminal)
```
