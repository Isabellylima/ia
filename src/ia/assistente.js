// Orquestrador do assistente da FERCOPOR IA (independente do fornecedor):
//   prepararPedido  valida, confirma o agente e o modelo, reserva o consumo (limites por utilizador e por agente, de forma
//                   atómica na D1) e guarda a pergunta. Erros aqui são respostas HTTP normais (400, 404, 429, 503).
//   executarPedido  corre o modelo em streaming (com o ciclo de ferramentas), guarda a resposta no histórico e regista
//                   tokens, modelo, duração e custo estimado. Nunca gasta mais do que o valor reservado.
import * as BD from './bd.js';
import { lerConfig, instrucoesSistema } from './config.js';
import { MODELOS, custoEstimado, custoMaximo } from './modelos.js';
import { obterFornecedor, ErroFornecedor } from './fornecedores/index.js';
import { ferramentasDoAgente, executarChamada } from './ferramentas.js';
import { procurarConhecimento } from './conhecimento.js';

export const MAX_TEXTO = 20_000;
const MAX_PASSOS = 4;            // passos do ciclo de ferramentas por pergunta
const TOKENS_POR_CARACTER = 1 / 3; // estimativa prudente (por excesso) para a reserva

export class ErroPedido extends Error { constructor(status, m) { super(m); this.status = status; } }

// Estado da IA para as páginas (sem segredos)
export async function estadoIA(env) {
  const config = await lerConfig(env);
  const f = config.funcoes.principal;
  const forn = obterFornecedor(MODELOS[f.modelo].fornecedor);
  return { config, motor: Boolean(forn && forn.configurado(env)), baseDados: Boolean(env.IA_DB) };
}

async function idAnonimo(email) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fercopor-ia:${email}`)));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function prepararPedido(env, utilizador, pode, { conversa: idConversa, agente: idAgente = 'assistente', texto }) {
  const db = BD.bd(env);
  if (!db) throw new ErroPedido(503, 'A base de dados da FERCOPOR IA ainda não está configurada.');
  await BD.garantirEsquema(db);
  texto = String(texto ?? '').trim();
  if (!texto) throw new ErroPedido(400, 'Escreva a sua pergunta.');
  if (texto.length > MAX_TEXTO) throw new ErroPedido(400, `A pergunta é demasiado longa (máximo ${MAX_TEXTO.toLocaleString('pt-PT')} caracteres).`);

  const config = await lerConfig(env);
  const agente = config.agentes[idAgente];
  if (!agente || !agente.ativo) throw new ErroPedido(400, 'Este agente não está disponível.');
  const funcao = config.funcoes[agente.funcao];
  const info = MODELOS[funcao.modelo];
  const fornecedor = obterFornecedor(info.fornecedor);
  if (!fornecedor || !fornecedor.configurado(env)) throw new ErroPedido(503, 'O motor de IA ainda não está configurado.');

  let conversa = null;
  if (idConversa) {
    conversa = await BD.obterConversa(db, idConversa, utilizador.email);
    if (!conversa) throw new ErroPedido(404, 'Conversa não encontrada.');
    if (conversa.agente !== idAgente) throw new ErroPedido(400, 'Esta conversa pertence a outro agente.');
  }
  const historico = conversa ? await BD.mensagens(db, conversa.id) : [];
  const fontes = await procurarConhecimento(env, { pergunta: texto, agente: idAgente, utilizador });
  const sistema = instrucoesSistema(config, idAgente);
  const ferramentas = ferramentasDoAgente(idAgente, utilizador, pode);
  const novaMensagem = fornecedor.mensagemUtilizador(texto, fontes);
  const mensagensApi = [...fornecedor.paraMensagens(historico), novaMensagem];

  // Reserva: custo máximo possível (entrada estimada por excesso + saída máxima) por cada passo previsto
  const caracteres = sistema.length + JSON.stringify(mensagensApi).length + JSON.stringify(ferramentas.map((f) => [f.nome, f.descricao, f.esquema])).length;
  const tokensEntrada = Math.ceil(caracteres * TOKENS_POR_CARACTER) + 200;
  if (tokensEntrada + funcao.maxTokens > info.contexto * 0.9) throw new ErroPedido(400, 'Esta conversa já é demasiado longa. Comece uma conversa nova.');
  const passos = ferramentas.length ? MAX_PASSOS : 1;
  const porPasso = custoMaximo(funcao.modelo, tokensEntrada, funcao.maxTokens);
  const reserva = Math.round(porPasso * passos * 1e6) / 1e6;

  const id = conversa ? conversa.id : BD.novoId();
  const r = await BD.reservarPedido(db, {
    email: utilizador.email, agente: idAgente, conversaId: id, fornecedor: fornecedor.id, modelo: funcao.modelo, reserva,
    limitesUtilizador: config.limitesUtilizador, limitesAgente: agente.limites,
  });
  if (!r.ok) throw new ErroPedido(429, r.motivo);

  // Só depois da reserva: criar a conversa e guardar a pergunta
  const passosBd = [];
  if (!conversa) {
    const t = BD.agora();
    passosBd.push(db.prepare('INSERT INTO conversas (id, email, agente, titulo, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?)').bind(id, utilizador.email, idAgente, titulo(texto), t, t));
  }
  passosBd.push(BD.inserirMensagem(db, { conversaId: id, papel: 'user', conteudo: novaMensagem.content, texto, fornecedor: fornecedor.id, pedidoId: r.id }));
  passosBd.push(BD.tocarConversa(db, id));
  await db.batch(passosBd);

  return {
    env, db, utilizador, pode, idAgente, conversaId: id, nova: !conversa, pedidoId: r.id, reserva, porPasso,
    fornecedor, modelo: funcao.modelo, info, esforco: funcao.esforco, maxTokens: funcao.maxTokens,
    sistema, mensagensApi, ferramentas, utilizadorId: await idAnonimo(utilizador.email),
  };
}

/**
 * «Testar ligação» (Integrações, só ADM): base de dados, configuração, credencial, autenticação, modelo principal e
 * streaming, com um pedido real mínimo. O pedido passa pelos limites do utilizador e fica registado (agente «diagnostico»).
 */
export async function testarLigacao(env, utilizador) {
  const passos = [];
  const db = BD.bd(env);
  const config = await lerConfig(env);
  passos.push({ nome: 'Configuração da IA (KV)', ok: Boolean(env.IA_KV), detalhe: env.IA_KV ? `Modelo principal: ${config.funcoes.principal.modelo} · esforço ${config.funcoes.principal.esforco}` : 'KV IA_KV indisponível.' });
  if (!db) return { ok: false, passos: [...passos, { nome: 'Base de dados (D1)', ok: false, detalhe: 'Binding IA_DB indisponível.' }] };
  try { await BD.garantirEsquema(db); await db.prepare('SELECT COUNT(*) AS n FROM pedidos').first(); passos.push({ nome: 'Base de dados (D1)', ok: true, detalhe: 'IA_DB ligada; tabelas conversas, mensagens e pedidos disponíveis.' }); }
  catch (e) { return { ok: false, passos: [...passos, { nome: 'Base de dados (D1)', ok: false, detalhe: String(e && e.message).slice(0, 200) }] }; }

  const funcao = config.funcoes.principal;
  const info = MODELOS[funcao.modelo];
  const fornecedor = obterFornecedor(info.fornecedor);
  if (!fornecedor.configurado(env)) return { ok: false, passos: [...passos, { nome: 'Credencial', ok: false, detalhe: 'Secret ANTHROPIC_API_KEY ausente ou inválido no Worker.' }] };
  const sistema = instrucoesSistema(config, 'assistente');
  const reserva = custoMaximo(funcao.modelo, Math.ceil(sistema.length * TOKENS_POR_CARACTER) + 300, 1024);
  const r = await BD.reservarPedido(db, { email: utilizador.email, agente: 'diagnostico', conversaId: null, fornecedor: fornecedor.id, modelo: funcao.modelo, reserva, limitesUtilizador: config.limitesUtilizador, limitesAgente: { pedidosDia: 0, custoDia: 0, custoMes: 0 } });
  if (!r.ok) return { ok: false, passos: [...passos, { nome: 'Limites de consumo', ok: false, detalhe: r.motivo }] };
  passos.push({ nome: 'Limites de consumo', ok: true, detalhe: `Pedido reservado dentro dos limites (máximo ${reserva.toFixed(4)} US$).` });

  const t0 = Date.now();
  const res = await fornecedor.testarLigacao(env, { modelo: funcao.modelo, infoModelo: info, sistema });
  const uso = res.uso || { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
  const custo = Math.round(custoEstimado(uso, funcao.modelo) * 1e6) / 1e6;
  const duracaoMs = res.totalMs ?? (Date.now() - t0);
  try {
    await BD.concluirPedido(db, r.id, { estado: res.ok ? 'concluido' : 'erro', modelo: res.modelo || funcao.modelo, uso, custo, duracaoMs, paragem: res.ok ? 'fim' : null, erro: res.erro ? `${res.erro.codigo || ''}: ${res.erro.tecnico || res.erro.message}` : null, iteracoes: 1 }).run();
  } catch (e) { console.error(JSON.stringify({ evento: 'registo_teste_falhou', erro: String(e && e.message).slice(0, 200) })); }
  console.log(JSON.stringify({ evento: 'teste_ligacao_ia', ok: res.ok, modelo: res.modelo || funcao.modelo, entrada: uso.entrada, saida: uso.saida, custo, primeiraRespostaMs: res.primeiraRespostaMs ?? null, duracaoMs }));
  if (res.ok) passos.push({ nome: 'Registo de tokens, custo e latência', ok: true, detalhe: `Registado em Monitorização (agente «Teste de ligação»).` });
  return { ok: res.ok, passos: [...passos, ...res.passos], modelo: res.modelo || funcao.modelo, uso, custo, primeiraRespostaMs: res.primeiraRespostaMs ?? null, duracaoMs, quando: new Date().toISOString() };
}

const titulo = (t) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > 80 ? `${s.slice(0, 77)}…` : s; };

/**
 * Corre o pedido preparado. emitir(tipo, dados) envia eventos ao navegador:
 *   inicio { conversa, pedido } · estado { estado } · texto { texto } · aviso { mensagem } · erro { mensagem } ·
 *   fim { conversa, pedido, modelo, tokensEntrada, tokensSaida, custo, duracaoMs, paragem }
 */
export async function executarPedido(p, emitir) {
  const t0 = Date.now();
  const total = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
  let custo = 0; let passos = 0; let modeloServido = p.modelo; let paragem = null; let estado = 'concluido'; let erro = null;
  const mensagens = [...p.mensagensApi];
  emitir('inicio', { conversa: p.conversaId, pedido: p.pedidoId, nova: p.nova });

  try {
    while (passos < MAX_PASSOS) {
      passos++;
      let final = null;
      try {
        for await (const ev of p.fornecedor.conversar(p.env, {
          modelo: p.modelo, infoModelo: p.info, sistema: p.sistema, mensagens, ferramentas: p.ferramentas,
          maxTokens: p.maxTokens, esforco: p.esforco, utilizadorId: p.utilizadorId,
        })) {
          if (ev.tipo === 'texto') emitir('texto', { texto: ev.texto });
          else if (ev.tipo === 'pensar') emitir('estado', { estado: 'a pensar' });
          else if (ev.tipo === 'mensagem') final = ev;
        }
      } catch (e) {
        // Ligação perdida a meio: o passo pode ter sido cobrado; conta pelo máximo do passo (nunca por menos)
        if (e instanceof ErroFornecedor && e.faturavel) custo += p.porPasso;
        throw e;
      }

      for (const k of Object.keys(total)) total[k] += final.uso[k] || 0;
      custo += custoEstimado(final.uso, p.modelo);
      modeloServido = final.modelo;
      paragem = final.paragem;

      const chamadas = final.paragem === 'ferramenta' ? p.fornecedor.chamadas(final.conteudo) : [];
      const guardar = [];
      if (p.fornecedor.temConteudo(final.conteudo)) {
        const assistente = { role: 'assistant', content: final.conteudo };
        mensagens.push(assistente);
        guardar.push(BD.inserirMensagem(p.db, { conversaId: p.conversaId, papel: 'assistant', conteudo: final.conteudo, texto: p.fornecedor.texto(final.conteudo), fornecedor: p.fornecedor.id, modelo: final.modelo, visivel: Boolean(p.fornecedor.texto(final.conteudo)), pedidoId: p.pedidoId }));
      }

      if (final.paragem === 'recusa') {
        estado = 'recusado';
        emitir('aviso', { mensagem: 'A FERCOPOR IA não pode ajudar com este pedido.' });
      } else if (final.paragem === 'limite' && !chamadas.length) {
        emitir('aviso', { mensagem: 'A resposta foi cortada por ter atingido o tamanho máximo configurado.' });
      }

      // Continuar só com chamadas de ferramentas válidas e se o próximo passo ainda couber na reserva
      const continuar = chamadas.length > 0 && passos < MAX_PASSOS && custo + p.porPasso <= p.reserva + 1e-9;
      if (chamadas.length && !continuar) {
        // Sem orçamento para mais um passo: responder às chamadas como erro para o histórico ficar válido
        const resultados = chamadas.map((c) => ({ id: c.id, erro: true, conteudo: 'Limite de passos deste pedido atingido.' }));
        guardar.push(BD.inserirMensagem(p.db, { conversaId: p.conversaId, papel: 'user', conteudo: p.fornecedor.resultados(resultados).content, fornecedor: p.fornecedor.id, visivel: false, pedidoId: p.pedidoId }));
        emitir('aviso', { mensagem: 'O pedido precisava de mais passos do que o permitido. Tente reformular a pergunta.' });
      }
      if (continuar) {
        emitir('estado', { estado: 'a consultar ferramentas' });
        const ctx = { env: p.env, utilizador: p.utilizador, agente: p.idAgente, pode: p.pode };
        const resultados = await Promise.all(chamadas.map((c) => executarChamada(c, p.ferramentas, ctx)));
        const msg = p.fornecedor.resultados(resultados);
        mensagens.push(msg);
        guardar.push(BD.inserirMensagem(p.db, { conversaId: p.conversaId, papel: 'user', conteudo: msg.content, fornecedor: p.fornecedor.id, visivel: false, pedidoId: p.pedidoId }));
      }
      guardar.push(BD.tocarConversa(p.db, p.conversaId));
      await p.db.batch(guardar);

      if (continuar) continue;
      if (final.paragem === 'pausa' && passos < MAX_PASSOS && custo + p.porPasso <= p.reserva + 1e-9) continue;
      break;
    }
  } catch (e) {
    estado = 'erro';
    erro = e instanceof ErroFornecedor ? `${e.codigo}: ${e.tecnico || e.message}` : String(e && e.message || e);
    console.error(JSON.stringify({ evento: 'pedido_ia_falhou', pedido: p.pedidoId, erro: erro.slice(0, 300) }));
    emitir('erro', { mensagem: e instanceof ErroFornecedor ? e.message : 'Não foi possível obter resposta. Tente novamente.' });
  }

  const duracaoMs = Date.now() - t0;
  custo = Math.round(custo * 1e6) / 1e6;
  try {
    await BD.concluirPedido(p.db, p.pedidoId, { estado, modelo: modeloServido, uso: total, custo, duracaoMs, paragem, erro, iteracoes: passos }).run();
  } catch (e) {
    // Sem registo do custo final o pedido fica «em curso» e conta pelo valor reservado (nunca por menos)
    console.error(JSON.stringify({ evento: 'registo_pedido_falhou', pedido: p.pedidoId, erro: String(e && e.message).slice(0, 200) }));
  }
  console.log(JSON.stringify({ evento: 'pedido_ia', pedido: p.pedidoId, agente: p.idAgente, modelo: modeloServido, estado, entrada: total.entrada, saida: total.saida, cacheEscrita: total.cacheEscrita, cacheLeitura: total.cacheLeitura, custo, duracaoMs, passos }));
  emitir('fim', { conversa: p.conversaId, pedido: p.pedidoId, estado, modelo: modeloServido, nomeModelo: (MODELOS[modeloServido] || {}).nome || modeloServido, tokensEntrada: total.entrada + total.cacheEscrita + total.cacheLeitura, tokensSaida: total.saida, custo, duracaoMs, paragem });
}
