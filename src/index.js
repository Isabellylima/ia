// FERCOPOR AI — centro de inteligência corporativa (Cloudflare Worker «ia», servidor Hono, pacotes @fercopor/*).
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

export const SEGURANCA = cabecalhosSeguranca("default-src 'none'; script-src 'none'; img-src 'self'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
const html = (corpo, status = 200) => new Response(corpo, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', ...SEGURANCA } });
const pag = (c, o, status = 200) => html(P.pagina({ utilizador: c.var.utilizador, ...o }), status);
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

// 6. Páginas
app.get('/', (c) => pag(c, { titulo: 'FERCOPOR AI', ativo: 'dashboard', conteudo: P.conteudoInicio() }));
app.get('/infraestrutura', (c) => pag(c, { titulo: 'Infraestrutura e Roadmap', ativo: 'infraestrutura', conteudo: P.conteudoInfraestrutura() }));
for (const id of Object.keys(POR_CONFIGURAR)) app.get(`/${id}`, (c) => pag(c, { titulo: POR_CONFIGURAR[id].titulo, ativo: id, conteudo: P.conteudoPorConfigurar(id) }));

// 7. Erros
app.notFound((c) => (c.req.method !== 'GET' && c.req.method !== 'HEAD'
  ? new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', ...SEGURANCA } })
  : paginaErro(new ErroHttp(404, 'Página não encontrada.'), c)));
app.onError((e, c) => paginaErro(e, c));

function paginaErro(e, c) {
  if (!(e instanceof ErroHttp)) { console.error(e); e = new ErroHttp(500, 'Erro interno.'); }
  // Sem sessão: página de entrada; sem autorização ou login por configurar: a mesma página com o motivo
  if (e.status === 401) return html(P.paginaEntrada('').html, 200);
  if (e.status === 403 && !(c && c.var.utilizador)) { const p = P.paginaEntrada(e.message, 403); return html(p.html, p.status); }
  if (e.status === 503) { const p = P.paginaEntrada(e.message, 503); return html(p.html, p.status); }
  const titulo = e.status === 404 ? 'Não encontrado' : e.status === 403 ? 'Sem acesso' : 'Indisponível';
  const conteudo = `<h1>${titulo}</h1><p>${P.esc(e.message)}</p><p><a href="/">Voltar ao Dashboard</a></p>`;
  return c && c.var.utilizador ? pag(c, { titulo, conteudo }, e.status) : html(P.pagina({ titulo, conteudo }), e.status);
}

export default { fetch: (request, env, ctx) => app.fetch(request, env, ctx) };
