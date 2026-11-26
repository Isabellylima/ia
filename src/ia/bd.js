// Base de dados operacional da FERCOPOR IA (Cloudflare D1, binding IA_DB): conversas, mensagens e registo de pedidos de
// IA (tokens, modelo, duração, custo estimado), que serve também para os limites de utilização.
// O esquema é criado na primeira utilização (CREATE … IF NOT EXISTS), por isso a base criada automaticamente na
// publicação funciona sem passos manuais. Alterações futuras: acrescentar entradas a ESQUEMA (nunca editar as antigas).

export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS conversas (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, agente TEXT NOT NULL, titulo TEXT NOT NULL DEFAULT '',
    criada_em TEXT NOT NULL, atualizada_em TEXT NOT NULL, apagada INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS conversas_email ON conversas (email, apagada, atualizada_em)',
  `CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conversa_id TEXT NOT NULL, papel TEXT NOT NULL, conteudo TEXT NOT NULL,
    texto TEXT NOT NULL DEFAULT '', fornecedor TEXT, modelo TEXT, visivel INTEGER NOT NULL DEFAULT 1, pedido_id TEXT,
    criada_em TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS mensagens_conversa ON mensagens (conversa_id, id)',
  `CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, agente TEXT NOT NULL, conversa_id TEXT, fornecedor TEXT NOT NULL,
    modelo_pedido TEXT NOT NULL, modelo TEXT, estado TEXT NOT NULL, tokens_entrada INTEGER NOT NULL DEFAULT 0,
    tokens_saida INTEGER NOT NULL DEFAULT 0, tokens_cache_escrita INTEGER NOT NULL DEFAULT 0,
    tokens_cache_leitura INTEGER NOT NULL DEFAULT 0, custo_reservado REAL NOT NULL DEFAULT 0, custo REAL NOT NULL DEFAULT 0,
    duracao_ms INTEGER, paragem TEXT, erro TEXT, iteracoes INTEGER NOT NULL DEFAULT 0, dia TEXT NOT NULL, mes TEXT NOT NULL,
    criado_em TEXT NOT NULL, concluido_em TEXT)`,
  'CREATE INDEX IF NOT EXISTS pedidos_email ON pedidos (email, dia)',
  'CREATE INDEX IF NOT EXISTS pedidos_agente ON pedidos (agente, dia)',
  'CREATE INDEX IF NOT EXISTS pedidos_mes ON pedidos (mes, email)',
  'CREATE INDEX IF NOT EXISTS pedidos_estado ON pedidos (estado, criado_em)',
];

const prontas = new WeakSet();
export async function garantirEsquema(db) {
  if (prontas.has(db)) return;
  await db.batch(ESQUEMA.map((s) => db.prepare(s)));
  prontas.add(db);
}

export function bd(env) {
  if (!env.IA_DB) return null;
  return env.IA_DB;
}

// Dia e mês em Lisboa (os limites diários e mensais seguem o calendário de Portugal)
const FORMATO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
export function periodo(data = new Date()) { const dia = FORMATO.format(data); return { dia, mes: dia.slice(0, 7) }; }
export const agora = () => new Date().toISOString();
export const novoId = () => crypto.randomUUID();

/* ---------- Conversas e mensagens ---------- */

export async function criarConversa(db, { email, agente, titulo }) {
  const id = novoId(); const t = agora();
  await db.prepare('INSERT INTO conversas (id, email, agente, titulo, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?)').bind(id, email, agente, titulo.slice(0, 120), t, t).run();
  return { id, email, agente, titulo, criada_em: t, atualizada_em: t };
}

// Só o dono vê a sua conversa (null se não existir, for de outra pessoa ou estiver apagada)
export async function obterConversa(db, id, email) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  return db.prepare('SELECT * FROM conversas WHERE id = ? AND email = ? AND apagada = 0').bind(id, email).first();
}

export async function listarConversas(db, email, limite = 100) {
  const r = await db.prepare(`SELECT c.id, c.agente, c.titulo, c.criada_em, c.atualizada_em,
      (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id AND m.visivel = 1) AS mensagens
    FROM conversas c WHERE c.email = ? AND c.apagada = 0 ORDER BY c.atualizada_em DESC LIMIT ?`).bind(email, limite).all();
  return r.results || [];
}

export async function apagarConversa(db, id, email) {
  const r = await db.prepare('UPDATE conversas SET apagada = 1, atualizada_em = ? WHERE id = ? AND email = ? AND apagada = 0').bind(agora(), id, email).run();
  return Boolean(r.meta && r.meta.changes);
}

export async function mensagens(db, conversaId) {
  const r = await db.prepare('SELECT id, papel, conteudo, texto, fornecedor, modelo, visivel, criada_em FROM mensagens WHERE conversa_id = ? ORDER BY id').bind(conversaId).all();
  return (r.results || []).map((m) => ({ ...m, conteudo: JSON.parse(m.conteudo) }));
}

export function inserirMensagem(db, m) {
  return db.prepare('INSERT INTO mensagens (conversa_id, papel, conteudo, texto, fornecedor, modelo, visivel, pedido_id, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(m.conversaId, m.papel, JSON.stringify(m.conteudo), m.texto || '', m.fornecedor || null, m.modelo || null, m.visivel === false ? 0 : 1, m.pedidoId || null, agora());
}

export function tocarConversa(db, id) { return db.prepare('UPDATE conversas SET atualizada_em = ? WHERE id = ?').bind(agora(), id); }

/* ---------- Pedidos e limites ---------- */

// Custo comprometido: pedidos em curso contam pelo valor reservado (o máximo possível), os outros pelo custo final
const COMPROMETIDO = "COALESCE(SUM(CASE WHEN estado = 'em_curso' THEN custo_reservado ELSE custo END), 0)";
const EXPIRA_MIN = 15;

/**
 * Reserva um pedido de forma atómica: só é gravado se, contando com o custo máximo deste pedido, nenhum limite do
 * utilizador nem do agente for ultrapassado. Devolve { ok: true, id } ou { ok: false, motivo }.
 * Limite 0 = sem limite nesse indicador.
 */
export async function reservarPedido(db, { email, agente, conversaId, fornecedor, modelo, reserva, limitesUtilizador: lu, limitesAgente: la }) {
  const id = novoId(); const t = agora(); const { dia, mes } = periodo();
  const expirou = new Date(Date.now() - EXPIRA_MIN * 60_000).toISOString();
  // Pedidos presos em «em_curso» (Worker interrompido): ficam com o custo reservado, para nunca se perder consumo
  await db.prepare("UPDATE pedidos SET estado = 'interrompido', custo = custo_reservado, concluido_em = ? WHERE estado = 'em_curso' AND criado_em < ?").bind(t, expirou).run();
  const r = await db.prepare(`INSERT INTO pedidos (id, email, agente, conversa_id, fornecedor, modelo_pedido, estado, custo_reservado, dia, mes, criado_em)
    SELECT ?, ?, ?, ?, ?, ?, 'em_curso', ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM pedidos WHERE email = ? AND estado = 'em_curso') < ?
      AND (? = 0 OR (SELECT COUNT(*) FROM pedidos WHERE email = ? AND dia = ?) < ?)
      AND (? = 0 OR (SELECT ${COMPROMETIDO} FROM pedidos WHERE email = ? AND dia = ?) + ? <= ?)
      AND (? = 0 OR (SELECT ${COMPROMETIDO} FROM pedidos WHERE email = ? AND mes = ?) + ? <= ?)
      AND (? = 0 OR (SELECT COUNT(*) FROM pedidos WHERE agente = ? AND dia = ?) < ?)
      AND (? = 0 OR (SELECT ${COMPROMETIDO} FROM pedidos WHERE agente = ? AND dia = ?) + ? <= ?)
      AND (? = 0 OR (SELECT ${COMPROMETIDO} FROM pedidos WHERE agente = ? AND mes = ?) + ? <= ?)`).bind(
    id, email, agente, conversaId, fornecedor, modelo, reserva, dia, mes, t,
    email, lu.emCurso,
    lu.pedidosDia, email, dia, lu.pedidosDia,
    lu.custoDia, email, dia, reserva, lu.custoDia,
    lu.custoMes, email, mes, reserva, lu.custoMes,
    la.pedidosDia, agente, dia, la.pedidosDia,
    la.custoDia, agente, dia, reserva, la.custoDia,
    la.custoMes, agente, mes, reserva, la.custoMes,
  ).run();
  if (r.meta && r.meta.changes) return { ok: true, id };
  return { ok: false, motivo: await motivoRecusa(db, { email, agente, dia, mes, reserva, lu, la }) };
}

async function motivoRecusa(db, { email, agente, dia, mes, reserva, lu, la }) {
  const u = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM pedidos WHERE email = ? AND estado = 'em_curso') AS emCurso,
      (SELECT COUNT(*) FROM pedidos WHERE email = ? AND dia = ?) AS pedidosDia,
      (SELECT ${COMPROMETIDO} FROM pedidos WHERE email = ? AND dia = ?) AS custoDia,
      (SELECT ${COMPROMETIDO} FROM pedidos WHERE email = ? AND mes = ?) AS custoMes,
      (SELECT COUNT(*) FROM pedidos WHERE agente = ? AND dia = ?) AS agPedidosDia,
      (SELECT ${COMPROMETIDO} FROM pedidos WHERE agente = ? AND dia = ?) AS agCustoDia,
      (SELECT ${COMPROMETIDO} FROM pedidos WHERE agente = ? AND mes = ?) AS agCustoMes`)
    .bind(email, email, dia, email, dia, email, mes, agente, dia, agente, dia, agente, mes).first();
  if (u.emCurso >= lu.emCurso) return 'Já tem um pedido em curso. Aguarde que termine.';
  if (lu.pedidosDia && u.pedidosDia >= lu.pedidosDia) return 'Atingiu o limite diário de pedidos.';
  if (lu.custoDia && u.custoDia + reserva > lu.custoDia) return 'Atingiu o limite diário de consumo.';
  if (lu.custoMes && u.custoMes + reserva > lu.custoMes) return 'Atingiu o limite mensal de consumo.';
  if (la.pedidosDia && u.agPedidosDia >= la.pedidosDia) return 'Este agente atingiu o limite diário de pedidos.';
  if (la.custoDia && u.agCustoDia + reserva > la.custoDia) return 'Este agente atingiu o limite diário de consumo.';
  if (la.custoMes && u.agCustoMes + reserva > la.custoMes) return 'Este agente atingiu o limite mensal de consumo.';
  return 'Limite de utilização atingido.';
}

export function concluirPedido(db, id, r) {
  return db.prepare(`UPDATE pedidos SET estado = ?, modelo = ?, tokens_entrada = ?, tokens_saida = ?, tokens_cache_escrita = ?,
      tokens_cache_leitura = ?, custo = ?, duracao_ms = ?, paragem = ?, erro = ?, iteracoes = ?, concluido_em = ? WHERE id = ?`)
    .bind(r.estado, r.modelo || null, r.uso.entrada || 0, r.uso.saida || 0, r.uso.cacheEscrita || 0, r.uso.cacheLeitura || 0,
      r.custo, r.duracaoMs, r.paragem || null, r.erro ? String(r.erro).slice(0, 300) : null, r.iteracoes || 0, agora(), id);
}

/* ---------- Monitorização ---------- */

// Totais do mês (de todos, ou só de um utilizador). Pedidos em curso contam pelo valor reservado.
export async function resumoMes(db, { email = null, mes = periodo().mes } = {}) {
  const f = email ? ' AND email = ?' : '';
  const a = email ? [mes, email] : [mes];
  const total = await db.prepare(`SELECT COUNT(*) AS pedidos, COALESCE(SUM(tokens_entrada + tokens_cache_escrita + tokens_cache_leitura), 0) AS entrada,
      COALESCE(SUM(tokens_saida), 0) AS saida, ${COMPROMETIDO} AS custo, COALESCE(AVG(duracao_ms), 0) AS duracao,
      COALESCE(SUM(CASE WHEN estado IN ('erro', 'interrompido') THEN 1 ELSE 0 END), 0) AS erros
    FROM pedidos WHERE mes = ?${f}`).bind(...a).first();
  const agrupar = async (col) => (await db.prepare(`SELECT ${col} AS chave, COUNT(*) AS pedidos, COALESCE(SUM(tokens_entrada + tokens_cache_escrita + tokens_cache_leitura), 0) AS entrada,
      COALESCE(SUM(tokens_saida), 0) AS saida, ${COMPROMETIDO} AS custo FROM pedidos WHERE mes = ?${f} GROUP BY ${col} ORDER BY custo DESC LIMIT 50`).bind(...a).all()).results || [];
  return { mes, total, porModelo: await agrupar("COALESCE(modelo, modelo_pedido)"), porAgente: await agrupar('agente'), porUtilizador: email ? [] : await agrupar('email') };
}

export async function pedidosRecentes(db, { email = null, limite = 50 } = {}) {
  const f = email ? 'WHERE email = ?' : '';
  const r = await db.prepare(`SELECT id, email, agente, COALESCE(modelo, modelo_pedido) AS modelo, estado, tokens_entrada, tokens_saida,
      tokens_cache_escrita, tokens_cache_leitura, custo, custo_reservado, duracao_ms, paragem, criado_em
    FROM pedidos ${f} ORDER BY criado_em DESC LIMIT ?`).bind(...(email ? [email, limite] : [limite])).all();
  return r.results || [];
}
