// FERCOPOR IA — motor de IA: streaming, histórico persistente, registo de consumo, limites, configuração e ferramentas.
// Nenhum pedido sai para a Anthropic: o fetch global é substituído por uma resposta simulada no formato oficial (SSE).
// Só dados fictícios (perguntas de teste, e-mails @fercopor.pt de teste).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { assinar } from '../src/auth.js';
import { d1Local } from '../tools/d1-local.mjs';
import { custoEstimado, custoMaximo } from '../src/ia/modelos.js';
import { paraEco } from '../src/ia/fornecedores/anthropic.js';
import { registarFerramenta, removerFerramenta, validarEntrada } from '../src/ia/ferramentas.js';
import { CHAVE_CONFIG, configPadrao, normalizar } from '../src/ia/config.js';
import * as BD from '../src/ia/bd.js';

const CHAVE = 'sk-ant-teste-0000000000000000000000000000';
const ADMIN = 'isabelly.silva@fercopor.pt';
const kv = (inicial = {}) => { const m = new Map(Object.entries(inicial)); return { m, async get(k, t) { const v = m.get(k); return v == null ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; };
const base = (extra = {}) => ({
  MICROSOFT_TENANT_ID: '00000000-0000-0000-0000-000000000001', MICROSOFT_CLIENT_ID: 'cliente-teste', MICROSOFT_CLIENT_SECRET: 'segredo-teste',
  SESSION_SECRET: 'x'.repeat(40), ADMIN_EMAILS: ADMIN, IA_KV: kv({ utilizadores: JSON.stringify([{ email: 'ana@fercopor.pt', perfil: 'equipa' }, { email: 'rui@fercopor.pt', perfil: 'equipa' }]) }),
  IA_DB: d1Local(), ANTHROPIC_API_KEY: CHAVE, ...extra,
});

async function abrir(caminho, { env, email = ADMIN, metodo = 'GET', corpo, tipo = 'application/json', origem = 'https://ia.fercopor.app' } = {}) {
  const h = {};
  if (email) h.Cookie = `__Host-ia_sessao=${await assinar(env, { e: email, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  if (metodo !== 'GET' && origem) h.Origin = origem;
  if (corpo !== undefined) h['Content-Type'] = tipo;
  const body = corpo === undefined ? undefined : tipo === 'application/json' ? JSON.stringify(corpo) : corpo;
  const r = await worker.fetch(new Request(`https://ia.fercopor.app${caminho}`, { method: metodo, headers: h, body }), env, { waitUntil() {} });
  return { r, texto: await r.text() };
}
const perguntar = (env, texto, o = {}) => abrir('/api/assistente/mensagem', { env, metodo: 'POST', corpo: { texto, conversa: o.conversa || null, agente: o.agente || 'assistente' }, email: o.email });
const eventos = (sse) => sse.split('\n\n').filter(Boolean).map((b) => { const t = /event: (.*)/.exec(b); const d = /data: (.*)/.exec(b); return { tipo: t && t[1], dados: d ? JSON.parse(d[1]) : null }; });

/* ---------- Anthropic simulada ---------- */
const pedidos = [];
const modelosPedidos = [];
let respostas = [];
const sse = (evs) => evs.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function respostaTexto(texto, { modelo = 'claude-sonnet-5-5', entrada = 1200, saida = 40, paragem = 'end_turn', cacheLeitura = 0, cacheEscrita = 0 } = {}) {
  const partes = texto.match(/.{1,12}/gs) || [''];
  return sse([
    { type: 'message_start', message: { id: 'msg_teste', type: 'message', role: 'assistant', model: modelo, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: entrada, output_tokens: 1, cache_creation_input_tokens: cacheEscrita, cache_read_input_tokens: cacheLeitura } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...partes.map((p) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: paragem, stop_sequence: null }, usage: { output_tokens: saida } },
    { type: 'message_stop' },
  ]);
}
function respostaFerramenta(nome, entrada) {
  return sse([
    { type: 'message_start', message: { id: 'msg_ferr', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_teste', name: nome, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(entrada) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ]);
}
const fetchOriginal = globalThis.fetch;
test.before(() => {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url instanceof Request ? url.url : url);
    if (!u.startsWith('https://api.anthropic.com/')) throw new Error(`Pedido externo inesperado nos testes: ${u}`);
    const h = new Headers(init.headers);
    if (u.includes('/v1/models/')) { modelosPedidos.push(u); return new Response(JSON.stringify({ type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-28T00:00:00Z' }), { headers: { 'content-type': 'application/json' } }); }
    pedidos.push({ url: u, headers: h, corpo: JSON.parse(init.body) });
    const r = respostas.shift();
    if (!r) throw new Error('Sem resposta simulada');
    if (r.status) return new Response(JSON.stringify({ type: 'error', error: { type: r.tipo, message: 'simulado' } }), { status: r.status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });
    return new Response(r, { headers: { 'content-type': 'text/event-stream' } });
  };
});
test.after(() => { globalThis.fetch = fetchOriginal; });
test.beforeEach(() => { pedidos.length = 0; modelosPedidos.length = 0; respostas = []; });

/* ---------- Testes ---------- */

test('sem ANTHROPIC_API_KEY: Assistente por configurar e a API recusa (503) sem chamar o fornecedor', async () => {
  const env = base({ ANTHROPIC_API_KEY: undefined });
  const p = await abrir('/assistente', { env });
  assert.equal(p.r.status, 200);
  assert.match(p.texto, /O motor de IA ainda não está configurado/);
  assert.match(p.texto, /ANTHROPIC_API_KEY/);
  assert.doesNotMatch(p.texto, /assistente\.js/);
  const a = await perguntar(env, 'Olá');
  assert.equal(a.r.status, 503);
  assert.equal(pedidos.length, 0);
});

test('pergunta: resposta em streaming, histórico guardado e consumo registado; a chave nunca chega ao navegador', async () => {
  const env = base();
  respostas.push(respostaTexto('Olá! Sou a FERCOPOR IA. Em que posso ajudar?'));
  const { r, texto } = await perguntar(env, 'Olá, quem és? (teste)');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /text\/event-stream/);
  assert.ok(!texto.includes(CHAVE));
  const ev = eventos(texto);
  assert.equal(ev[0].tipo, 'inicio');
  assert.ok(ev.filter((e) => e.tipo === 'texto').length > 1, 'texto chega em várias partes');
  assert.equal(ev.filter((e) => e.tipo === 'texto').map((e) => e.dados.texto).join(''), 'Olá! Sou a FERCOPOR IA. Em que posso ajudar?');
  const fim = ev.find((e) => e.tipo === 'fim').dados;
  assert.equal(fim.modelo, 'claude-sonnet-5-5');
  assert.equal(fim.tokensEntrada, 1200);
  assert.equal(fim.tokensSaida, 40);
  assert.equal(fim.custo, 0.0028); // 1200 × 2 $/M + 40 × 10 $/M

  // Pedido enviado à Anthropic (servidor): modelo principal, identidade, cache, fallback, chave só no cabeçalho
  const p = pedidos[0];
  assert.match(p.url, /\/v1\/messages/);
  assert.equal(p.headers.get('authorization'), `Bearer ${CHAVE}`); // o SDK 1.x envia a chave neste cabeçalho
  assert.match(p.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(p.corpo.model, 'claude-sonnet-5-5');
  assert.equal(p.corpo.stream, true);
  assert.equal(p.corpo.fallbacks, 'default');
  assert.deepEqual(p.corpo.cache_control, { type: 'ephemeral' });
  assert.equal(p.corpo.output_config.effort, 'medium');
  assert.match(p.corpo.system, /És a FERCOPOR IA/);
  assert.ok(!JSON.stringify(p.corpo).includes(ADMIN), 'o e-mail não vai para a API');
  assert.match(p.corpo.metadata.user_id, /^[0-9a-f]{32}$/);
  assert.equal(p.corpo.tools, undefined);

  // D1: conversa, duas mensagens e o pedido concluído com tokens, modelo, duração e custo
  const db = env.IA_DB;
  const conversa = (await db.prepare('SELECT * FROM conversas').all()).results;
  assert.equal(conversa.length, 1);
  assert.equal(conversa[0].email, ADMIN);
  assert.equal(conversa[0].titulo, 'Olá, quem és? (teste)');
  const msgs = (await db.prepare('SELECT papel, texto FROM mensagens ORDER BY id').all()).results;
  assert.deepEqual(msgs.map((m) => m.papel), ['user', 'assistant']);
  const ped = await db.prepare('SELECT * FROM pedidos').first();
  assert.equal(ped.estado, 'concluido');
  assert.equal(ped.modelo, 'claude-sonnet-5-5');
  assert.equal(ped.tokens_entrada, 1200);
  assert.equal(ped.tokens_saida, 40);
  assert.equal(ped.custo, 0.0028);
  assert.ok(ped.custo_reservado >= ped.custo);
  assert.ok(ped.duracao_ms >= 0);
});

test('continuação: o histórico é reenviado; só o dono vê a conversa', async () => {
  const env = base();
  respostas.push(respostaTexto('Primeira resposta.'));
  const a = await perguntar(env, 'Primeira pergunta de teste');
  const id = eventos(a.texto)[0].dados.conversa;
  respostas.push(respostaTexto('Segunda resposta.'));
  const b = await perguntar(env, 'Segunda pergunta', { conversa: id });
  assert.equal(b.r.status, 200);
  assert.deepEqual(pedidos[1].corpo.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(pedidos[1].corpo.messages[1].content[0].text, 'Primeira resposta.');

  const pagina = await abrir(`/assistente?c=${id}`, { env });
  assert.equal(pagina.r.status, 200);
  assert.match(pagina.texto, /Primeira pergunta de teste/);
  assert.match(pagina.texto, /Segunda resposta\./);
  assert.match(pagina.texto, /script src="\/assistente\.js/);
  assert.match(pagina.r.headers.get('Content-Security-Policy'), /script-src 'self'; connect-src 'self'/);
  const lista = await abrir('/conversas', { env });
  assert.match(lista.texto, /Primeira pergunta de teste/);

  const outra = await abrir(`/assistente?c=${id}`, { env, email: 'ana@fercopor.pt' });
  assert.equal(outra.r.status, 404);
  const via = await perguntar(env, 'intrusão', { conversa: id, email: 'ana@fercopor.pt' });
  assert.equal(via.r.status, 404);
  assert.equal(pedidos.length, 2);
  const alheia = await abrir('/conversas', { env, email: 'ana@fercopor.pt' });
  assert.doesNotMatch(alheia.texto, /Primeira pergunta de teste/);

  const apagar = await abrir('/conversas/apagar', { env, metodo: 'POST', corpo: `id=${id}`, tipo: 'application/x-www-form-urlencoded' });
  assert.equal(apagar.r.status, 303);
  assert.equal((await abrir(`/assistente?c=${id}`, { env })).r.status, 404);
});

test('limites por utilizador: pedidos por dia e custo mensal (recusa 429 antes de chamar o fornecedor)', async () => {
  const c = configPadrao(); c.limitesUtilizador.pedidosDia = 1;
  const env = base();
  await env.IA_KV.put(CHAVE_CONFIG, JSON.stringify(c));
  respostas.push(respostaTexto('ok'));
  assert.equal((await perguntar(env, 'um', { email: 'ana@fercopor.pt' })).r.status, 200);
  const segundo = await perguntar(env, 'dois', { email: 'ana@fercopor.pt' });
  assert.equal(segundo.r.status, 429);
  assert.match(JSON.parse(segundo.texto).erro, /limite diário de pedidos/);
  assert.equal(pedidos.length, 1);
  // Outro utilizador não é afetado
  respostas.push(respostaTexto('ok'));
  assert.equal((await perguntar(env, 'três', { email: 'rui@fercopor.pt' })).r.status, 200);

  const c2 = configPadrao(); c2.limitesUtilizador.custoMes = 0.01;
  const env2 = base();
  await env2.IA_KV.put(CHAVE_CONFIG, JSON.stringify(c2));
  const caro = await perguntar(env2, 'pergunta');
  assert.equal(caro.r.status, 429);
  assert.match(JSON.parse(caro.texto).erro, /limite mensal de consumo/);
});

test('limites por agente e pedidos em simultâneo (reserva atómica na D1)', async () => {
  const c = configPadrao(); c.agentes.assistente.limites.pedidosDia = 1;
  const env = base();
  await env.IA_KV.put(CHAVE_CONFIG, JSON.stringify(c));
  respostas.push(respostaTexto('ok'));
  assert.equal((await perguntar(env, 'um', { email: 'ana@fercopor.pt' })).r.status, 200);
  const r = await perguntar(env, 'dois', { email: 'rui@fercopor.pt' });
  assert.equal(r.r.status, 429);
  assert.match(JSON.parse(r.texto).erro, /agente atingiu o limite diário/);

  const db = d1Local(); await BD.garantirEsquema(db);
  const lu = { pedidosDia: 0, custoDia: 0, custoMes: 0, emCurso: 1 }; const la = { pedidosDia: 0, custoDia: 0, custoMes: 0 };
  const a = await BD.reservarPedido(db, { email: 'ana@fercopor.pt', agente: 'assistente', conversaId: null, fornecedor: 'anthropic', modelo: 'claude-sonnet-5-5', reserva: 0.1, limitesUtilizador: lu, limitesAgente: la });
  const b = await BD.reservarPedido(db, { email: 'ana@fercopor.pt', agente: 'assistente', conversaId: null, fornecedor: 'anthropic', modelo: 'claude-sonnet-5-5', reserva: 0.1, limitesUtilizador: lu, limitesAgente: la });
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.match(b.motivo, /pedido em curso/);
  // A reserva conta para o custo enquanto o pedido está em curso
  const c3 = await BD.reservarPedido(db, { email: 'rui@fercopor.pt', agente: 'assistente', conversaId: null, fornecedor: 'anthropic', modelo: 'claude-sonnet-5-5', reserva: 0.1, limitesUtilizador: lu, limitesAgente: { ...la, custoDia: 0.15 } });
  assert.equal(c3.ok, false);
  assert.match(c3.motivo, /agente atingiu o limite diário de consumo/);
});

test('área administrativa: trocar o modelo principal sem alterar código; só ADM', async () => {
  const env = base();
  const fd = new URLSearchParams();
  const c = configPadrao();
  for (const [id, f] of Object.entries(c.funcoes)) { fd.set(`funcao.${id}.modelo`, f.modelo); fd.set(`funcao.${id}.esforco`, f.esforco); fd.set(`funcao.${id}.maxTokens`, String(f.maxTokens)); }
  fd.set('funcao.principal.modelo', 'claude-haiku-5-5');
  fd.set('funcao.principal.esforco', 'low');
  fd.set('instrucoesGerais', 'Responde sempre de forma breve. (teste)');
  for (const [id, a] of Object.entries(c.agentes)) {
    fd.set(`agente.${id}.funcao`, a.funcao); if (a.ativo) fd.set(`agente.${id}.ativo`, 'sim'); fd.set(`agente.${id}.instrucoes`, a.instrucoes);
    for (const k of ['pedidosDia', 'custoDia', 'custoMes']) fd.set(`agente.${id}.${k}`, String(a.limites[k]));
  }
  for (const [k, v] of Object.entries(c.limitesUtilizador)) fd.set(`utilizador.${k}`, String(v));
  const g = await abrir('/admin/ia', { env, metodo: 'POST', corpo: fd.toString(), tipo: 'application/x-www-form-urlencoded' });
  assert.equal(g.r.status, 200);
  assert.match(g.texto, /Configuração guardada/);

  respostas.push(respostaTexto('Breve.', { modelo: 'claude-haiku-5-5' }));
  const p = await perguntar(env, 'teste');
  assert.equal(p.r.status, 200);
  assert.equal(pedidos[0].corpo.model, 'claude-haiku-5-5');
  assert.equal(pedidos[0].corpo.fallbacks, undefined);
  assert.equal(pedidos[0].corpo.output_config.effort, 'low');
  assert.match(pedidos[0].corpo.system, /Responde sempre de forma breve/);
  const fim = eventos(p.texto).find((e) => e.tipo === 'fim').dados;
  assert.equal(fim.custo, 0.00014); // 1200 × 0,10 $/M + 40 × 0,50 $/M

  const modelos = await abrir('/modelos', { env, email: 'ana@fercopor.pt' });
  assert.equal(modelos.r.status, 200);
  assert.match(modelos.texto, /claude-sonnet-5-5/);
  assert.match(modelos.texto, /claude-opus-5-5/);
  assert.doesNotMatch(modelos.texto, /href="\/admin\/ia"/);
  assert.equal((await abrir('/admin/ia', { env, email: 'ana@fercopor.pt' })).r.status, 403);
  const semOrigem = await abrir('/admin/ia', { env, metodo: 'POST', corpo: fd.toString(), tipo: 'application/x-www-form-urlencoded', origem: 'https://exemplo.com' });
  assert.equal(semOrigem.r.status, 403);
});

test('ferramentas: chamada validada, resultado devolvido ao modelo e dois passos registados', async () => {
  const chamadas = [];
  registarFerramenta({
    nome: 'teste_eco', descricao: 'Devolve o texto recebido (teste).', agentes: ['assistente'],
    esquema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false },
    executar: async (e) => { chamadas.push(e); return { eco: e.texto }; },
  });
  try {
    const env = base();
    respostas.push(respostaFerramenta('teste_eco', { texto: 'abc' }), respostaTexto('A ferramenta devolveu abc.'));
    const r = await perguntar(env, 'usa a ferramenta');
    assert.equal(r.r.status, 200);
    assert.deepEqual(chamadas, [{ texto: 'abc' }]);
    assert.equal(pedidos[0].corpo.tools[0].name, 'teste_eco');
    assert.equal(pedidos[0].corpo.tools[0].eager_input_streaming, true);
    const ultima = pedidos[1].corpo.messages.at(-1);
    assert.equal(ultima.content[0].type, 'tool_result');
    assert.equal(ultima.content[0].tool_use_id, 'toolu_teste');
    const ped = await env.IA_DB.prepare('SELECT * FROM pedidos').first();
    assert.equal(ped.iteracoes, 2);
    assert.equal(ped.tokens_entrada, 2100);
    const visiveis = (await env.IA_DB.prepare('SELECT papel FROM mensagens WHERE visivel = 1 ORDER BY id').all()).results;
    assert.deepEqual(visiveis.map((m) => m.papel), ['user', 'assistant']);
  } finally { removerFerramenta('teste_eco'); }
});

test('recusa e erro do fornecedor: avisos claros, sem detalhes técnicos, estado registado', async () => {
  const env = base();
  respostas.push(respostaTexto('', { paragem: 'refusal', saida: 0 }));
  const a = await perguntar(env, 'pedido recusado (teste)');
  assert.ok(eventos(a.texto).some((e) => e.tipo === 'aviso' && /não pode ajudar/.test(e.dados.mensagem)));
  assert.equal((await env.IA_DB.prepare("SELECT estado FROM pedidos").first()).estado, 'recusado');

  const env2 = base();
  respostas.push({ status: 401, tipo: 'authentication_error' });
  const b = await perguntar(env2, 'teste');
  const erro = eventos(b.texto).find((e) => e.tipo === 'erro');
  assert.match(erro.dados.mensagem, /recusou a credencial/);
  assert.doesNotMatch(b.texto, /simulado/);
  const ped = await env2.IA_DB.prepare('SELECT estado, custo FROM pedidos').first();
  assert.equal(ped.estado, 'erro');
  assert.equal(ped.custo, 0);
});

test('API: só da mesma origem, JSON válido e texto obrigatório; sem sessão não entra', async () => {
  const env = base();
  assert.equal((await abrir('/api/assistente/mensagem', { env, metodo: 'POST', corpo: { texto: 'x' }, origem: 'https://exemplo.com' })).r.status, 403);
  assert.equal((await abrir('/api/assistente/mensagem', { env, metodo: 'POST', corpo: 'texto=x', tipo: 'application/x-www-form-urlencoded' })).r.status, 415);
  assert.equal((await perguntar(env, '   ')).r.status, 400);
  assert.equal((await perguntar(env, 'x'.repeat(20_001))).r.status, 400);
  const semSessao = await abrir('/api/assistente/mensagem', { env, metodo: 'POST', corpo: { texto: 'x' }, email: '' });
  assert.equal(semSessao.r.status, 401);
  assert.match(JSON.parse(semSessao.texto).erro, /Sessão terminada/);
  assert.equal(pedidos.length, 0);
});

test('Monitorização: ADM vê todos; cada pessoa vê só os seus pedidos; Dashboard mostra o consumo', async () => {
  const env = base();
  respostas.push(respostaTexto('a'), respostaTexto('b'));
  await perguntar(env, 'pergunta da ana', { email: 'ana@fercopor.pt' });
  await perguntar(env, 'pergunta da admin');
  const adm = await abrir('/monitorizacao', { env });
  assert.equal(adm.r.status, 200);
  assert.match(adm.texto, /ana@fercopor\.pt/);
  assert.match(adm.texto, /Por utilizador/);
  const ana = await abrir('/monitorizacao', { env, email: 'ana@fercopor.pt' });
  assert.doesNotMatch(ana.texto, /isabelly\.silva/);
  assert.match(ana.texto, /os seus pedidos/);
  const dash = await abrir('/', { env });
  assert.match(dash.texto, /action="\/assistente"/);
  assert.match(dash.texto, /0,0056/);
});

test('configuração sem nada gravado: limites por omissão ativos (0 só quando escolhido)', () => {
  const c = normalizar({});
  assert.deepEqual(c.limitesUtilizador, { pedidosDia: 100, custoDia: 2, custoMes: 20, emCurso: 2 });
  assert.deepEqual(c.agentes.assistente.limites, { pedidosDia: 2000, custoDia: 30, custoMes: 300 });
  assert.equal(c.funcoes.principal.modelo, 'claude-sonnet-5-5');
  assert.equal(c.funcoes.operacional.modelo, 'claude-haiku-5-5');
  assert.equal(c.funcoes.avancado.modelo, 'claude-opus-5-5');
  const vazio = normalizar({ limitesUtilizador: { custoMes: '', custoDia: '0' }, funcoes: { principal: { modelo: 'gpt-qualquer' } } });
  assert.equal(vazio.limitesUtilizador.custoMes, 20);
  assert.equal(vazio.limitesUtilizador.custoDia, 0);
  assert.equal(vazio.funcoes.principal.modelo, 'claude-sonnet-5-5');
});

test('custos: preços por modelo, escalão longo do Haiku, fallback e reserva máxima', () => {
  assert.equal(custoEstimado({ entrada: 1e6, saida: 1e6 }, 'claude-opus-5-5'), 24);
  assert.equal(custoEstimado({ entrada: 50_000, saida: 0 }, 'claude-haiku-5-5'), 0.005);
  assert.equal(custoEstimado({ entrada: 200_000, saida: 0 }, 'claude-haiku-5-5'), 0.1);
  assert.equal(Math.round(custoEstimado({ entrada: 0, saida: 0, cacheLeitura: 1e6, cacheEscrita: 1e6 }, 'claude-sonnet-5-5') * 100) / 100, 2.6);
  const fb = custoEstimado({ porModelo: [{ modelo: 'claude-sonnet-5-5', entrada: 1e6, saida: 0 }, { modelo: 'claude-sonnet-5', entrada: 1e6, saida: 1e6 }] }, 'claude-sonnet-5-5');
  assert.equal(fb, 14);
  assert.ok(custoMaximo('claude-sonnet-5-5', 1000, 16000) >= custoEstimado({ entrada: 1000, saida: 16000 }, 'claude-sonnet-5-5'));
});

test('fallback a meio da resposta: o eco omite os blocos internos anteriores ao bloco «fallback»', () => {
  const c = [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'parcial' }, { type: 'tool_use', id: 't', name: 'x', input: {} }, { type: 'fallback', from: {}, to: {} }, { type: 'thinking', thinking: '', signature: 's2' }, { type: 'text', text: 'resto' }];
  assert.deepEqual(paraEco(c).map((b) => b.type), ['text', 'fallback', 'thinking', 'text']);
  const sem = [{ type: 'thinking' }, { type: 'text', text: 'a' }];
  assert.equal(paraEco(sem), sem);
});

test('validação das entradas das ferramentas', () => {
  const e = { type: 'object', properties: { n: { type: 'integer' }, s: { type: 'string', enum: ['a', 'b'] } }, required: ['n'], additionalProperties: false };
  assert.equal(validarEntrada(e, { n: 1, s: 'a' }), null);
  assert.match(validarEntrada(e, { s: 'a' }), /obrigatório/);
  assert.match(validarEntrada(e, { n: 1, x: 2 }), /não permitido/);
  assert.match(validarEntrada(e, { n: 'um' }), /tipo/);
  assert.match(validarEntrada(e, { n: 1, s: 'c' }), /fora da lista/);
});

test('Integrações: «Testar ligação» só para ADM; confirma credencial, modelo, streaming e regista o pedido', async () => {
  const env = base();
  const ver = await abrir('/integracoes', { env });
  assert.match(ver.texto, /Testar ligação/);
  assert.match(ver.texto, /credencial configurada/);
  assert.ok(!ver.texto.includes(CHAVE));
  const equipa = await abrir('/integracoes', { env, email: 'ana@fercopor.pt' });
  assert.doesNotMatch(equipa.texto, /action="\/integracoes\/anthropic\/testar"/);
  assert.equal((await abrir('/integracoes/anthropic/testar', { env, email: 'ana@fercopor.pt', metodo: 'POST', corpo: '', tipo: 'application/x-www-form-urlencoded' })).r.status, 403);

  respostas.push(respostaTexto('Ligação confirmada.', { entrada: 600, saida: 8 }));
  const t = await abrir('/integracoes/anthropic/testar', { env, metodo: 'POST', corpo: '', tipo: 'application/x-www-form-urlencoded' });
  assert.equal(t.r.status, 200);
  assert.match(t.texto, /Ligação confirmada/);
  assert.match(t.texto, /Claude Sonnet 5\.5 \(claude-sonnet-5-5\) disponível/);
  assert.match(t.texto, /fragmento\(s\) recebidos em streaming/);
  assert.ok(!t.texto.includes(CHAVE));
  assert.equal(modelosPedidos.length, 1);
  assert.match(pedidos[0].corpo.system, /És a FERCOPOR IA/);
  const ped = await env.IA_DB.prepare("SELECT * FROM pedidos WHERE agente = 'diagnostico'").first();
  assert.equal(ped.estado, 'concluido');
  assert.equal(ped.tokens_entrada, 600);
  assert.equal(ped.custo, 0.00128);

  const semChave = await abrir('/integracoes/anthropic/testar', { env: base({ ANTHROPIC_API_KEY: undefined }), metodo: 'POST', corpo: '', tipo: 'application/x-www-form-urlencoded' });
  assert.equal(semChave.r.status, 502);
  assert.match(semChave.texto, /ANTHROPIC_API_KEY ausente/);
});
