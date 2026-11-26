// Catálogo de modelos da FERCOPOR IA, independente do fornecedor. Cada modelo indica o fornecedor (o adaptador em
// src/ia/fornecedores/) e os preços usados no custo estimado. Para acrescentar outro fornecedor: um adaptador novo e as
// suas entradas aqui; a área administrativa passa a mostrá-las sem mais alterações.
//
// Identificadores e preços confirmados na documentação oficial da Anthropic em 2026-11-26
// (platform.claude.com/docs/en/about-claude/models/overview e /pricing). Preços em USD por milhão de tokens.

export const VERIFICADO_EM = '2026-11-26';

// fallback: 'default' = o modelo aceita o fallback do servidor (beta server-side-fallback-2026-07-01)
export const MODELOS = {
  'claude-sonnet-5-5': {
    fornecedor: 'anthropic', nome: 'Claude Sonnet 5.5', contexto: 1_000_000, maxSaida: 128_000, fallback: 'default',
    preco: { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.1 },
  },
  'claude-haiku-5-5': {
    fornecedor: 'anthropic', nome: 'Claude Haiku 5.5', contexto: 1_000_000, maxSaida: 128_000, fallback: null,
    preco: { entrada: 0.1, saida: 0.5, cacheEscrita: 0.125, cacheLeitura: 0.01 },
    // Acima de 100 000 tokens de entrada (incluindo cache) o pedido inteiro passa a este preço
    precoLongo: { limite: 100_000, entrada: 0.5, saida: 2.5, cacheEscrita: 0.625, cacheLeitura: 0.05 },
  },
  'claude-opus-5-5': {
    fornecedor: 'anthropic', nome: 'Claude Opus 5.5', contexto: 1_000_000, maxSaida: 128_000, fallback: 'default',
    preco: { entrada: 4, saida: 20, cacheEscrita: 5, cacheLeitura: 0.2 },
  },
};

// Modelos que podem responder em fallback (o servidor troca o modelo numa recusa). Só servem para calcular o custo;
// não aparecem na área administrativa.
const MODELOS_FALLBACK = {
  'claude-sonnet-5': { fornecedor: 'anthropic', nome: 'Claude Sonnet 5', preco: { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.2 } },
  'claude-opus-5': { fornecedor: 'anthropic', nome: 'Claude Opus 5', preco: { entrada: 5, saida: 25, cacheEscrita: 6.25, cacheLeitura: 0.5 } },
  'claude-opus-4-8': { fornecedor: 'anthropic', nome: 'Claude Opus 4.8', preco: { entrada: 5, saida: 25, cacheEscrita: 6.25, cacheLeitura: 0.5 } },
};

// Funções de modelo: o administrador escolhe que modelo serve cada função; cada agente usa uma função.
export const FUNCOES = {
  principal: { nome: 'Principal', descricao: 'Conversas e trabalho do dia a dia.', modelo: 'claude-sonnet-5-5', esforco: 'medium', maxTokens: 16000 },
  operacional: { nome: 'Operacional', descricao: 'Tarefas simples e repetitivas (classificar, resumir, extrair).', modelo: 'claude-haiku-5-5', esforco: 'low', maxTokens: 8000 },
  avancado: { nome: 'Análise avançada', descricao: 'Análises longas ou difíceis.', modelo: 'claude-opus-5-5', esforco: 'high', maxTokens: 32000 },
};

export const ESFORCOS = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' };

export function modelo(id) { return MODELOS[id] || MODELOS_FALLBACK[id] || null; }

const porMilhao = (tokens, preco) => (Number(tokens) || 0) * preco / 1e6;

// Custo de um bloco de utilização de um modelo (USD). Se o modelo não estiver no catálogo, usa o do pedido.
function custoDe(u, idModelo, idPedido) {
  const m = modelo(idModelo) || modelo(idPedido);
  if (!m) return 0;
  const totalEntrada = (u.entrada || 0) + (u.cacheLeitura || 0) + (u.cacheEscrita || 0);
  const p = m.precoLongo && totalEntrada > m.precoLongo.limite ? m.precoLongo : m.preco;
  return porMilhao(u.entrada, p.entrada) + porMilhao(u.saida, p.saida) + porMilhao(u.cacheEscrita, p.cacheEscrita) + porMilhao(u.cacheLeitura, p.cacheLeitura);
}

/**
 * Custo estimado de um pedido (USD). uso = { entrada, saida, cacheEscrita, cacheLeitura, porModelo?: [{ modelo, ... }] }.
 * Com porModelo (fallback: mais de um modelo no mesmo pedido), soma cada parte ao preço do seu modelo.
 */
export function custoEstimado(uso, idModelo) {
  if (Array.isArray(uso.porModelo) && uso.porModelo.length) return uso.porModelo.reduce((s, p) => s + custoDe(p, p.modelo, idModelo), 0);
  return custoDe(uso, idModelo, idModelo);
}

/** Custo máximo possível de um pedido (para reservar antes de o enviar): entrada estimada + saída máxima, com margem
 * para um fallback a um modelo mais caro e para escrita em cache. */
export function custoMaximo(idModelo, tokensEntrada, maxTokens) {
  const m = modelo(idModelo);
  if (!m) return 0;
  const p = m.precoLongo || m.preco;
  const margem = m.fallback ? 1.25 : 1;
  return (porMilhao(tokensEntrada, Math.max(p.entrada, p.cacheEscrita)) + porMilhao(maxTokens, p.saida)) * margem;
}
