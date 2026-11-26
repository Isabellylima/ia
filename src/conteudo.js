// Conteúdo fixo da FERCOPOR AI: menu, agentes especializados, infraestrutura Cloudflare e roadmap de desenvolvimento.
// Textos aprovados pela ADM (2026-11-26). Alterar aqui muda as páginas; as ações de acesso estão em acessos.js.

// Menu lateral (secção → itens). «acao» liga cada item ao catálogo de acessos (o servidor confirma em cada pedido).
export const MENU = [
  { seccao: 'Workspace', itens: [
    { id: 'dashboard', nome: 'Dashboard', href: '/', icone: 'painel', acao: 'pagina.inicio' },
    { id: 'assistente', nome: 'Assistente IA', href: '/assistente', icone: 'conversa', acao: 'pagina.assistente' },
    { id: 'conversas', nome: 'Conversas', href: '/conversas', icone: 'historico', acao: 'pagina.conversas' },
    { id: 'agentes', nome: 'Agentes IA', href: '/agentes', icone: 'robo', acao: 'pagina.agentes' },
    { id: 'conhecimento', nome: 'Conhecimento', href: '/conhecimento', icone: 'livros', acao: 'pagina.conhecimento' },
    { id: 'memoria', nome: 'Memória', href: '/memoria', icone: 'cerebro', acao: 'pagina.memoria' },
    { id: 'modelos', nome: 'Modelos', href: '/modelos', icone: 'chip', acao: 'pagina.modelos' },
  ] },
  { seccao: 'Operações', itens: [
    { id: 'automacoes', nome: 'Automações', href: '/automacoes', icone: 'calendario', acao: 'pagina.automacoes' },
    { id: 'reunioes', nome: 'Reuniões', href: '/reunioes', icone: 'microfone', acao: 'pagina.reunioes' },
    { id: 'relatorios', nome: 'Relatórios', href: '/relatorios', icone: 'barras', acao: 'pagina.relatorios' },
  ] },
  { seccao: 'Administração', itens: [
    { id: 'integracoes', nome: 'Integrações', href: '/integracoes', icone: 'ficha', acao: 'pagina.integracoes' },
    { id: 'permissoes', nome: 'Permissões', href: '/admin/acessos', icone: 'escudo', soAdmin: true },
    { id: 'monitorizacao', nome: 'Monitorização', href: '/monitorizacao', icone: 'monitor', acao: 'pagina.monitorizacao' },
    { id: 'infraestrutura', nome: 'Infraestrutura e Roadmap', href: '/infraestrutura', icone: 'nuvem', acao: 'pagina.infraestrutura' },
    { id: 'configuracoes', nome: 'Configurações', href: '/configuracoes', icone: 'engrenagem', acao: 'pagina.configuracoes' },
  ] },
];

// Páginas ainda por configurar: título e frase curta (sem números nem funcionalidades inventadas)
export const POR_CONFIGURAR = {
  assistente: { titulo: 'Assistente IA', texto: 'Conversa com a FERCOPOR AI para consultar informação, analisar dados e executar tarefas.' },
  conversas: { titulo: 'Conversas', texto: 'Histórico das conversas com o assistente e com os agentes.' },
  agentes: { titulo: 'Agentes IA', texto: 'Agentes especializados por área, com as suas ferramentas e tarefas.' },
  conhecimento: { titulo: 'Conhecimento', texto: 'Documentação interna e conhecimento corporativo disponível para pesquisa.' },
  memoria: { titulo: 'Memória', texto: 'Memória semântica usada pelo assistente e pelos agentes.' },
  modelos: { titulo: 'Modelos', texto: 'Modelos de IA disponíveis e respetiva configuração.' },
  automacoes: { titulo: 'Automações', texto: 'Rotinas e tarefas automáticas.' },
  reunioes: { titulo: 'Reuniões', texto: 'Áudio, transcrições e resultados de reuniões.' },
  relatorios: { titulo: 'Relatórios', texto: 'Relatórios gerados pela FERCOPOR AI.' },
  integracoes: { titulo: 'Integrações', texto: 'Ligações às aplicações e departamentos da FERCOPOR.' },
  monitorizacao: { titulo: 'Monitorização', texto: 'Pedidos de IA, consumo e funcionamento dos serviços.' },
  configuracoes: { titulo: 'Configurações', texto: 'Definições gerais da FERCOPOR AI.' },
};

// Indicadores do Dashboard: ainda sem dados (mostram «—» até haver serviços ligados)
export const INDICADORES = [
  { nome: 'Agentes', icone: 'robo' },
  { nome: 'Integrações', icone: 'ficha' },
  { nome: 'Conhecimento', icone: 'copias' },
  { nome: 'Consumo mensal', icone: 'consumo' },
];

export const AGENTES = [
  { nome: 'Commercial Agent', icone: 'pasta', estado: 'Por configurar' },
  { nome: 'Meeting Agent', icone: 'microfone', estado: 'Por configurar' },
  { nome: 'Data Quality Agent', icone: 'base', estado: 'Por configurar' },
];

// Infraestrutura Cloudflare (proposta)
export const INFRA_INTRO = 'Como já estamos a trabalhar com o Cloudflare, faz sentido aproveitar o próprio ecossistema antes de contratar serviços adicionais.';
export const INFRA_NOTA = 'Esta opção poderá permitir-nos reduzir a dispersão da infraestrutura e centralizar uma parte significativa da manutenção no Cloudflare. A escolha definitiva dependerá da análise do repositório, dos requisitos e dos limites de cada serviço.';
// prioridade: classe do selo (imediata, avaliar, fase, futuro)
export const SERVICOS = [
  { servico: 'Workers', finalidade: 'Backend central', prioridade: 'Imediata', tipo: 'imediata' },
  { servico: 'D1', finalidade: 'Base de dados operacional', prioridade: 'Imediata', tipo: 'imediata' },
  { servico: 'Secrets', finalidade: 'Proteção de credenciais', prioridade: 'Imediata', tipo: 'imediata' },
  { servico: 'AI Gateway', finalidade: 'Gestão e monitorização de pedidos de IA', prioridade: 'Imediata', tipo: 'imediata' },
  { servico: 'Workers AI', finalidade: 'Execução de modelos de IA', prioridade: 'Avaliar', tipo: 'avaliar' },
  { servico: 'R2', finalidade: 'Armazenamento de documentos e áudio', prioridade: 'Fase 2', tipo: 'fase' },
  { servico: 'Vectorize', finalidade: 'Memória semântica e RAG', prioridade: 'Fase 2', tipo: 'fase' },
  { servico: 'Queues', finalidade: 'Processamento assíncrono', prioridade: 'Fase 3', tipo: 'fase' },
  { servico: 'Cron Triggers', finalidade: 'Rotinas automáticas', prioridade: 'Fase 3', tipo: 'fase' },
  { servico: 'Durable Objects', finalidade: 'Gestão de estado e sessões, se necessário', prioridade: 'Futuramente', tipo: 'futuro' },
];

// Roadmap de desenvolvimento (fase 01 = atual)
export const ROADMAP = [
  { n: '01', nome: 'Foundation', texto: 'Infraestrutura, interface, autenticação, base de dados e AI Core.', atual: true },
  { n: '02', nome: 'Corporate Knowledge', texto: 'Documentação interna, RAG, pesquisa semântica e conhecimento corporativo.' },
  { n: '03', nome: 'Intelligence & Agents', texto: 'Criação de agentes, ferramentas, tarefas e automações.' },
  { n: '04', nome: 'CRM Intelligence', texto: 'Integração com o HubSpot, análise comercial e qualidade de dados.' },
  { n: '05', nome: 'Meeting Intelligence', texto: 'Áudio, transcrições, Smart Ring e resultados de reuniões.' },
  { n: '06', nome: 'Enterprise Integration', texto: 'Integração transversal com as aplicações e departamentos.' },
  { n: '07', nome: 'Private AI', texto: 'Avaliação de modelos locais e infraestrutura privada de processamento.' },
];
