// FERCOPOR IA — centro de inteligência corporativa (Cloudflare Worker «ia», servidor Hono, pacotes @fercopor/*).
// Ordem de segurança, igual às outras apps FERCOPOR:
//   1. configuração e domínio   2. /auth/* (login Microsoft)   3. sessão   4. administração (só ADM; POST só da mesma origem)
//   5. ação de cada endereço (o servidor decide; o menu só esconde)   6. páginas   7. erros
import { Hono } from 'hono';
import { rotasLogin } from '@fercopor/login/hono';
import { rotasAdmin, rotaEstilo, publicarDefinicao } from '@fercopor/acessos/hono';
import { cabecalhosSeguranca, redirecionarDominio } from '@fercopor/ui';
import { LOGIN, autenticar, ErroHttp, diagnostico } from './auth.js';
import { AC, acaoDoPedido, pode } from './acessos.js';
import { POR_CONFIGURAR } from './conteudo.js';
import * as P from './paginas.js';
import * as PIA from './paginasIA.js';
import * as BD from './ia/bd.js';
import { guardarConfig, AGENTES_IA } from './ia/config.js';
import { estadoIA, prepararPedido, executarPedido, ErroPedido, testarLigacao } from './ia/assistente.js';

export const SEGURANCA = cabecalhosSeguranca("default-src 'none'; script-src 'none'; img-src 'self'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
// Só a página do Assistente carrega um script (/assistente.js, da própria app) e fala com a API da própria app
export const SEGURANCA_ASSISTENTE = cabecalhosSeguranca("default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
const html = (corpo, status = 200, seg = SEGURANCA) => new Response(corpo, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', ...seg } });
const pag = (c, o, status = 200, seg = SEGURANCA) => html(P.pagina({ utilizador: c.var.utilizador, ...o }), status, seg);
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...SEGURANCA } });
const ir = (destino) => new Response(null, { status: 303, headers: { Location: destino, 'Cache-Control': 'no-store' } });
const ADMIN = ['/admin/utilizadores', '/admin/acessos'];

const app = new Hono();

// 1. Domínio próprio (DOMINIO_PRINCIPAL) e credenciais normalizadas
app.use('*', async (c, next) => {
  const r = redirecionarDominio(c.req.raw, c.env || {});
  if (r) return r;
  c.set('env0', await LOGIN.configurar(c.env || {}, c.req.raw));
  await next();
});
rotaEstilo(app);   // /acessos.css (estilos das páginas de administração; público, sem dados)

// 2. Login Microsoft
rotasLogin(app, LOGIN, {
  entrada: (mensagem, status) => { const e = P.paginaEntrada(mensagem, status); return html(e.html, e.status); },
  diagnostico,
  exigirSessao: (c) => autenticar(c.req.raw, c.var.env0),
  cabecalhos: SEGURANCA,
});

// 3. Sessão
app.use('*', async (c, next) => {
  c.set('utilizador', await autenticar(c.req.raw, c.var.env0));
  c.set('env', c.var.env0);
  await next();
});
// Definição de acessos para a página central (dashboard.fercopor.app/acessos); depois da resposta, nunca afeta o pedido
app.use('*', publicarDefinicao(AC));

// 4. Padrão de Acessos: Utilizadores e Níveis de Acesso e Ações (só ADM; POST só da mesma origem)
app.use('/admin/*', async (c, next) => {
  if (!c.var.utilizador.admin) throw new ErroHttp(403, 'Só para administradores.');
  if (c.req.method === 'POST') { const origem = c.req.header('Origin'); if (!origem || origem !== new URL(c.req.url).origin) throw new ErroHttp(403, 'Pedido de outra origem recusado.'); }
  await next();
});
rotasAdmin(app, AC, {
  recusar: () => { throw new ErroHttp(403, 'Só para administradores.'); },
  pagina: (c, r) => pag(c, { titulo: r.titulo, ativo: 'permissoes', conteudo: r.html }, r.status),
});

// 5. Ação de cada endereço, verificada no servidor
app.use('*', async (c, next) => {
  const acao = acaoDoPedido(c.req.path);
  if (acao && !pode(c.var.utilizador, acao)) {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') throw new ErroHttp(403, 'O seu nível de acesso não inclui esta ação.');
    return pag(c, { titulo: 'Sem acesso', conteudo: '<h1>Sem acesso</h1><p>O seu nível de acesso não inclui esta página. Se precisar dela, peça a um administrador.</p>' }, 403);
  }
  await next();
});

// Pedidos que alteram dados (fora de /auth e /admin, que já têm a sua verificação): só da mesma origem
app.use('*', async (c, next) => {
  if (c.req.method === 'POST' && !c.req.path.startsWith('/admin/')) {
    const origem = c.req.header('Origin');
    if (!origem || origem !== new URL(c.req.url).origin) throw new ErroHttp(403, 'Pedido de outra origem recusado.');
  }
  await next();
});

// 6. Páginas
app.get('/', async (c) => {
  const env = c.var.env;
  const u = c.var.utilizador;
  const e = await estadoIA(env);
  const ativos = Object.entries(e.config.agentes).filter(([, a]) => a.ativo);
  const nomesAtivos = Object.fromEntries(ativos.map(([id]) => [AGENTES_IA[id].nome, true]));
  const valores = { Agentes: { valor: String(ativos.length), nota: ativos.length === 1 ? 'agente ativo' : 'agentes ativos' } };
  const db = BD.bd(env);
  if (db) {
    try {
      await BD.garantirEsquema(db);
      const r = await BD.resumoMes(db, { email: u.admin ? null : u.email });
      valores['Consumo mensal'] = { valor: PIA.usd(r.total.custo), nota: `estimado · ${u.admin ? 'todos' : 'os seus pedidos'} · ${PIA.num(r.total.pedidos)} pedido(s)` };
    } catch (err) {
      console.error(JSON.stringify({ evento: 'consumo_ilegivel', erro: String(err && err.message).slice(0, 200) }));
      valores['Consumo mensal'] = { valor: 'Erro', nota: 'não foi possível ler o registo' };
    }
  }
  return pag(c, { titulo: 'FERCOPOR IA', ativo: 'dashboard', conteudo: P.conteudoInicio({ valores, assistente: e.motor && e.baseDados, agentesAtivos: nomesAtivos }) });
});

// Assistente IA (conversa em streaming) e histórico
app.get('/assistente', async (c) => {
  const env = c.var.env; const u = c.var.utilizador;
  const estado = await estadoIA(env);
  const agentes = Object.entries(estado.config.agentes).filter(([, a]) => a.ativo);
  let conversa = null; let mensagens = [];
  const id = c.req.query('c');
  const db = BD.bd(env);
  if (id && db && estado.motor) {
    await BD.garantirEsquema(db);
    conversa = await BD.obterConversa(db, id, u.email);
    if (!conversa) throw new ErroHttp(404, 'Conversa não encontrada.');
    mensagens = await BD.mensagens(db, conversa.id);
  }
  const pergunta = String(c.req.query('q') || '').slice(0, 2000);
  const conteudo = PIA.conteudoAssistente({ estado, conversa, mensagens, agentes, admin: u.admin, pergunta });
  return pag(c, { titulo: conversa ? conversa.titulo || 'Conversa' : 'Assistente IA', ativo: 'assistente', conteudo, script: estado.motor && estado.baseDados ? '/assistente.js' : '' }, 200, SEGURANCA_ASSISTENTE);
});

app.post('/api/assistente/mensagem', async (c) => {
  const env = c.var.env; const u = c.var.utilizador;
  if (!String(c.req.header('Content-Type') || '').startsWith('application/json')) return json({ erro: 'Formato do pedido inválido.' }, 415);
  const bruto = await c.req.text();
  if (bruto.length > 100_000) return json({ erro: 'Pedido demasiado grande.' }, 413);
  let corpo; try { corpo = JSON.parse(bruto); } catch { return json({ erro: 'Formato do pedido inválido.' }, 400); }
  let preparado;
  try {
    preparado = await prepararPedido(env, u, pode, { conversa: corpo.conversa || null, agente: corpo.agente || 'assistente', texto: corpo.texto });
  } catch (e) {
    if (e instanceof ErroPedido) return json({ erro: e.message }, e.status);
    throw e;
  }
  // Resposta em streaming (Server-Sent Events): o navegador recebe o texto à medida que é gerado
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const emitir = (tipo, dados) => { w.write(enc.encode(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`)).catch(() => {}); };
  // Se o navegador fechar a ligação, o pedido continua até ao fim e fica guardado no histórico
  const tarefa = executarPedido(preparado, emitir).catch((e) => console.error(e)).finally(() => w.close().catch(() => {}));
  let ctx; try { ctx = c.executionCtx; } catch { ctx = undefined; }
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(tarefa);
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', ...SEGURANCA } });
});

app.get('/conversas', async (c) => {
  const env = c.var.env; const u = c.var.utilizador;
  const estado = await estadoIA(env);
  const db = BD.bd(env);
  let lista = [];
  if (db) { await BD.garantirEsquema(db); lista = await BD.listarConversas(db, u.email); }
  const mensagem = c.req.query('apagada') ? 'Conversa apagada.' : '';
  return pag(c, { titulo: 'Conversas', ativo: 'conversas', conteudo: PIA.conteudoConversas({ estado, lista, admin: u.admin, mensagem }) });
});
app.post('/conversas/apagar', async (c) => {
  const db = BD.bd(c.var.env);
  if (!db) throw new ErroHttp(503, 'A base de dados da FERCOPOR IA ainda não está configurada.');
  await BD.garantirEsquema(db);
  const fd = await c.req.formData();
  const ok = await BD.apagarConversa(db, String(fd.get('id') || ''), c.var.utilizador.email);
  if (!ok) throw new ErroHttp(404, 'Conversa não encontrada.');
  return ir('/conversas?apagada=1');
});

app.get('/modelos', async (c) => pag(c, { titulo: 'Modelos', ativo: 'modelos', conteudo: PIA.conteudoModelos({ estado: await estadoIA(c.var.env), admin: c.var.utilizador.admin }) }));

app.get('/monitorizacao', async (c) => {
  const env = c.var.env; const u = c.var.utilizador;
  const estado = await estadoIA(env);
  const db = BD.bd(env);
  let resumo = null; let recentes = []; let erro = false;
  if (db) {
    try {
      await BD.garantirEsquema(db);
      const email = u.admin ? null : u.email;
      resumo = await BD.resumoMes(db, { email });
      recentes = await BD.pedidosRecentes(db, { email });
    } catch (e) { console.error(JSON.stringify({ evento: 'monitorizacao_falhou', erro: String(e && e.message).slice(0, 200) })); erro = true; }
  }
  return pag(c, { titulo: 'Monitorização', ativo: 'monitorizacao', conteudo: PIA.conteudoMonitorizacao({ estado, resumo, recentes, admin: u.admin, erro }) });
});

// Integrações: estado da Anthropic e «Testar ligação» (pedido real mínimo; só ADM)
app.get('/integracoes', async (c) => pag(c, { titulo: 'Integrações', ativo: 'integracoes', conteudo: PIA.conteudoIntegracoes({ estado: await estadoIA(c.var.env), utilizador: c.var.utilizador }) }));
app.post('/integracoes/anthropic/testar', async (c) => {
  const u = c.var.utilizador;
  if (!u.admin) throw new ErroHttp(403, 'O teste de ligação está disponível para administradores.');
  const resultado = await testarLigacao(c.var.env, u);
  return pag(c, { titulo: 'Integrações', ativo: 'integracoes', conteudo: PIA.conteudoIntegracoes({ estado: await estadoIA(c.var.env), utilizador: u, resultado }) }, resultado.ok ? 200 : 502);
});

// Configuração da IA (só ADM: o middleware de /admin/* já confirma o administrador e a origem dos POST)
app.on(['GET', 'POST'], '/admin/ia', async (c) => {
  const env = c.var.env;
  let mensagem = ''; let erro = false;
  if (c.req.method === 'POST') {
    if (!env.IA_KV) throw new ErroHttp(503, 'A KV da FERCOPOR IA não está disponível.');
    try { await guardarConfig(env, c.var.utilizador.email, await c.req.formData()); mensagem = 'Configuração guardada. Aplica-se ao pedido seguinte.'; }
    catch (e) { if (e.status === 400) { mensagem = e.message; erro = true; } else throw e; }
  }
  return pag(c, { titulo: 'Configuração da IA', ativo: 'modelos', conteudo: PIA.conteudoAdminIA({ estado: await estadoIA(env), mensagem, erro }) }, erro ? 400 : 200);
});
app.get('/infraestrutura', (c) => pag(c, { titulo: 'Infraestrutura e Roadmap', ativo: 'infraestrutura', conteudo: P.conteudoInfraestrutura() }));
for (const id of Object.keys(POR_CONFIGURAR)) app.get(`/${id}`, (c) => pag(c, { titulo: POR_CONFIGURAR[id].titulo, ativo: id, conteudo: P.conteudoPorConfigurar(id) }));

// 7. Erros
app.notFound((c) => (c.req.method !== 'GET' && c.req.method !== 'HEAD'
  ? new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', ...SEGURANCA } })
  : paginaErro(new ErroHttp(404, 'Página não encontrada.'), c)));
app.onError((e, c) => paginaErro(e, c));

function paginaErro(e, c) {
  if (!(e instanceof ErroHttp)) { console.error(e); e = new ErroHttp(500, 'Erro interno.'); }
  // API do assistente: erros em JSON (o navegador mostra a mensagem; 401 = sessão terminada)
  if (c && c.req.path.startsWith('/api/')) return json({ erro: e.status === 401 ? 'Sessão terminada. Atualize a página e inicie sessão.' : e.message }, e.status);
  // Sem sessão: página de entrada; sem autorização ou login por configurar: a mesma página com o motivo
  if (e.status === 401) return html(P.paginaEntrada('').html, 200);
  if (e.status === 403 && !(c && c.var.utilizador)) { const p = P.paginaEntrada(e.message, 403); return html(p.html, p.status); }
  if (e.status === 503) { const p = P.paginaEntrada(e.message, 503); return html(p.html, p.status); }
  const titulo = e.status === 404 ? 'Não encontrado' : e.status === 403 ? 'Sem acesso' : 'Indisponível';
  const conteudo = `<h1>${titulo}</h1><p>${P.esc(e.message)}</p><p><a href="/">Voltar ao Dashboard</a></p>`;
  return c && c.var.utilizador ? pag(c, { titulo, conteudo }, e.status) : html(P.pagina({ titulo, conteudo }), e.status);
}

export default { fetch: (request, env, ctx) => app.fetch(request, env, ctx) };
