// Adaptador Anthropic (Claude) da FERCOPOR IA, com o SDK oficial @anthropic-ai/sdk (Messages API em streaming).
// Implementa a interface comum dos fornecedores (ver ./index.js). A chave vem só do secret ANTHROPIC_API_KEY do Worker;
// nunca sai do servidor. Opcional: AI_GATEWAY_ANTHROPIC_URL (endereço do Cloudflare AI Gateway para a Anthropic).
import Anthropic from '@anthropic-ai/sdk';
import { ErroFornecedor } from './erros.js';

const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

export const anthropic = {
  id: 'anthropic',
  nome: 'Anthropic',
  configurado: (env) => typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim().length > 20,

  /**
   * Um passo da conversa em streaming. Emite { tipo: 'texto', texto }, { tipo: 'pensar' }, { tipo: 'fallback' } e,
   * no fim, { tipo: 'mensagem', conteudo, paragem, detalheParagem, uso, modelo }.
   */
  async *conversar(env, { modelo, infoModelo, sistema, mensagens, ferramentas = [], maxTokens, esforco, utilizadorId }) {
    const client = cliente(env);
    const params = {
      model: modelo,
      max_tokens: maxTokens,
      system: sistema,
      messages: mensagens,
      // Cache automático do prefixo (instruções + histórico): reduz custo e latência nas conversas longas
      cache_control: { type: 'ephemeral' },
      output_config: { effort: esforco },
      metadata: { user_id: utilizadorId },
    };
    if (ferramentas.length) params.tools = ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.esquema, eager_input_streaming: true }));
    // Fallback do servidor: numa recusa por política, a Anthropic repete o pedido noutro modelo, no mesmo pedido
    if (infoModelo && infoModelo.fallback) { params.betas = [BETA_FALLBACK]; params.fallbacks = infoModelo.fallback; }

    let comecou = false;
    let stream;
    try {
      stream = client.beta.messages.stream(params);
      for await (const ev of stream) {
        comecou = true;
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield { tipo: 'texto', texto: ev.delta.text };
        else if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking') yield { tipo: 'pensar' };
        else if (ev.type === 'content_block_start' && ev.content_block.type === 'fallback') yield { tipo: 'fallback' };
      }
      const msg = await stream.finalMessage();
      const conteudo = paraEco(msg.content);
      yield {
        tipo: 'mensagem',
        conteudo,
        paragem: paragem(msg.stop_reason),
        detalheParagem: msg.stop_details && msg.stop_details.category ? String(msg.stop_details.category) : null,
        uso: uso(msg),
        modelo: msg.model || modelo,
      };
    } catch (e) {
      throw traduzirErro(e, comecou);
    }
  },

  /**
   * Teste de ligação (página Integrações): 1) Models API confirma a autenticação e o acesso ao modelo (sem custo);
   * 2) um pedido mínimo real em streaming mede o tempo até à primeira resposta e o tempo total. Nunca devolve a chave.
   */
  async testarLigacao(env, { modelo, infoModelo, sistema }) {
    const passos = [];
    const t0 = Date.now();
    let client;
    try { client = cliente(env); } catch (e) { return { ok: false, passos: [{ nome: 'Credencial', ok: false, detalhe: e.message }] }; }
    passos.push({ nome: 'Credencial', ok: true, detalhe: 'Secret ANTHROPIC_API_KEY presente no Worker (valor não mostrado).' });
    try {
      const m = await client.models.retrieve(modelo);
      passos.push({ nome: 'Autenticação e acesso ao modelo', ok: true, detalhe: `${m.display_name || m.id} (${m.id}) disponível para esta chave.` });
    } catch (e) {
      const err = traduzirErro(e, false);
      passos.push({ nome: 'Autenticação e acesso ao modelo', ok: false, detalhe: err.message });
      return { ok: false, passos, erro: err };
    }
    let primeiro = null; let partes = 0; let texto = '';
    try {
      for await (const ev of this.conversar(env, { modelo, infoModelo, sistema, mensagens: [{ role: 'user', content: 'Teste técnico de ligação da FERCOPOR IA. Responde apenas com a frase: «Ligação confirmada.»' }], maxTokens: 1024, esforco: 'low', utilizadorId: 'teste-de-ligacao' })) {
        if (ev.tipo === 'texto') { if (primeiro == null) primeiro = Date.now() - t0; partes++; texto += ev.texto; }
        else if (ev.tipo === 'mensagem') {
          const total = Date.now() - t0;
          passos.push({ nome: 'Resposta do modelo em streaming', ok: ev.paragem !== 'recusa' && texto.length > 0, detalhe: `«${texto.trim().slice(0, 120)}» · ${partes} fragmento(s) recebidos em streaming · paragem: ${ev.paragem}` });
          return { ok: passos.every((p) => p.ok), passos, modelo: ev.modelo, uso: ev.uso, primeiraRespostaMs: primeiro, totalMs: total };
        }
      }
      return { ok: false, passos: [...passos, { nome: 'Resposta do modelo em streaming', ok: false, detalhe: 'A resposta terminou sem mensagem final.' }] };
    } catch (e) {
      passos.push({ nome: 'Resposta do modelo em streaming', ok: false, detalhe: e.message });
      return { ok: false, passos, erro: e };
    }
  },

  // Histórico guardado → mensagens da API. Conteúdo deste fornecedor volta tal como foi recebido (só se acrescenta,
  // nunca se reescreve); o de outros fornecedores entra como texto simples.
  paraMensagens(guardadas) {
    const r = [];
    for (const m of guardadas) {
      if (m.fornecedor === 'anthropic') r.push({ role: m.papel, content: m.conteudo });
      else if (m.visivel && m.texto) r.push({ role: m.papel, content: m.texto });
    }
    return r;
  },

  // Mensagem do utilizador, com as fontes da base de conhecimento (RAG) antes da pergunta, quando existirem
  mensagemUtilizador(texto, fontes = []) {
    const blocos = fontes.map((f, i) => ({ type: 'text', text: `<fonte n="${i + 1}" titulo="${escAttr(f.titulo)}" origem="${escAttr(f.origem)}">\n${f.texto}\n</fonte>` }));
    return { role: 'user', content: [...blocos, { type: 'text', text: texto }] };
  },

  texto: (conteudo) => conteudo.filter((b) => b.type === 'text').map((b) => b.text).join(''),
  chamadas: (conteudo) => conteudo.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, nome: b.name, entrada: b.input })),
  temConteudo: (conteudo) => conteudo.some((b) => b.type === 'text' || b.type === 'tool_use'),
  // Resultados das ferramentas: todos na mesma mensagem (mantém as chamadas em paralelo)
  resultados: (lista) => ({ role: 'user', content: lista.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.conteudo, ...(r.erro ? { is_error: true } : {}) })) }),
};

const escAttr = (t) => String(t || '').replace(/[<>"&]/g, '');

function cliente(env) {
  if (!anthropic.configurado(env)) throw new ErroFornecedor('configuracao', 'O motor de IA não está configurado.');
  const opcoes = { apiKey: env.ANTHROPIC_API_KEY.trim(), maxRetries: 2, timeout: 10 * 60 * 1000 };
  const gw = String(env.AI_GATEWAY_ANTHROPIC_URL || '').trim();
  if (/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/[\w-]+\/[\w-]+\/anthropic\/?$/.test(gw)) opcoes.baseURL = gw.replace(/\/$/, '');
  return new Anthropic(opcoes);
}

function paragem(s) {
  return { end_turn: 'fim', tool_use: 'ferramenta', max_tokens: 'limite', refusal: 'recusa', pause_turn: 'pausa', stop_sequence: 'fim' }[s] || String(s || 'fim');
}

// Depois de um fallback a meio da resposta, a Anthropic pede que o eco omita os blocos internos (pensamento e chamadas
// de ferramentas) anteriores ao último bloco «fallback», mantendo o texto e o próprio bloco no mesmo sítio.
export function paraEco(conteudo) {
  const ultimo = conteudo.map((b) => b.type).lastIndexOf('fallback');
  if (ultimo < 0) return conteudo;
  return conteudo.filter((b, i) => i >= ultimo || b.type === 'text' || b.type === 'fallback');
}

// Tokens do pedido. Com fallback, a Anthropic devolve a utilização de cada modelo em usage.iterations.
function uso(msg) {
  const u = msg.usage || {};
  const r = { entrada: u.input_tokens || 0, saida: u.output_tokens || 0, cacheEscrita: u.cache_creation_input_tokens || 0, cacheLeitura: u.cache_read_input_tokens || 0 };
  const it = Array.isArray(u.iterations) ? u.iterations.filter((x) => x && typeof x.input_tokens === 'number') : [];
  if (it.some((x) => x.type === 'fallback_message')) {
    r.porModelo = it.map((x) => ({ modelo: x.model || msg.model, entrada: x.input_tokens || 0, saida: x.output_tokens || 0, cacheEscrita: x.cache_creation_input_tokens || 0, cacheLeitura: x.cache_read_input_tokens || 0 }));
  }
  return r;
}

// Erros do SDK → erro comum da FERCOPOR IA (mensagem para o utilizador sem detalhes técnicos nem dados da conta).
// faturavel: o pedido pode ter sido cobrado (ligação perdida depois de a resposta começar).
function traduzirErro(e, comecou) {
  if (e instanceof ErroFornecedor) return e;
  const tecnico = String(e && e.message || e).slice(0, 300);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ErroFornecedor('configuracao', 'O motor de IA recusou a credencial configurada. Avise um administrador.', { tecnico });
  if (e instanceof Anthropic.RateLimitError) return new ErroFornecedor('ocupado', 'O motor de IA está com muitos pedidos. Tente novamente daqui a pouco.', { tecnico });
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError || e instanceof Anthropic.UnprocessableEntityError) return new ErroFornecedor('pedido', 'O pedido não foi aceite pelo motor de IA.', { tecnico });
  if (e instanceof Anthropic.APIUserAbortError) return new ErroFornecedor('interrompido', 'O pedido foi interrompido.', { tecnico, faturavel: comecou });
  if (e instanceof Anthropic.APIConnectionError) return new ErroFornecedor('ligacao', 'Falhou a ligação ao motor de IA.', { tecnico, faturavel: comecou });
  if (e instanceof Anthropic.APIError) return new ErroFornecedor(e.status === 529 || (e.status >= 500) ? 'ocupado' : 'outro', 'O motor de IA está indisponível neste momento. Tente novamente daqui a pouco.', { tecnico, faturavel: comecou });
  return new ErroFornecedor('outro', 'Não foi possível obter resposta.', { tecnico, faturavel: comecou });
}
