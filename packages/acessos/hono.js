// @ts-check
// @fercopor/acessos/hono — o Padrão de Acessos em apps feitas com Hono.
//   exigirAcao(AC, acaoDoPedido, semAcesso)   middleware: cada pedido só passa com a ação do endereço (o servidor decide)
//   rotasAdmin(app, AC, { pagina })           /admin/utilizadores e /admin/acessos, só para administradores
//   rotaEstilo(app)                           /acessos.css (estilos das duas páginas; a CSP das apps não deixa estilos em linha)
//   publicarDefinicao(AC)                     middleware: mantém atualizada a definição da app para a página central
// O utilizador autenticado tem de estar em c.var.utilizador e o ambiente em c.var.env.
import { ESTILO_ACESSOS } from './index.js';

/**
 * @param {{ pode: (u: any, acao: string) => boolean }} AC
 * @param {(caminho: string, metodo: string) => string | null} acaoDoPedido
 * @param {(c: import('hono').Context<any>, acao: string) => Response | Promise<Response>} semAcesso
 * @returns {import('hono').MiddlewareHandler<any>}
 */
export const exigirAcao = (AC, acaoDoPedido, semAcesso) => async (c, next) => {
  const acao = acaoDoPedido(c.req.path, c.req.method);
  if (acao && !AC.pode(c.var.utilizador, acao)) return semAcesso(c, acao);
  await next();
};

/**
 * @param {import('hono').Hono<any>} app
 * @param {{ rotaAdmin: (env: any, u: any, caminho: string, request: Request) => Promise<{ titulo: string, html: string, status: number }> }} AC
 * @param {{ pagina: (c: import('hono').Context<any>, r: { titulo: string, html: string, status: number }) => Response, recusar: () => never }} o
 */
export function rotasAdmin(app, AC, o) {
  for (const caminho of ['/admin/utilizadores', '/admin/acessos']) {
    app.on(['GET', 'POST'], caminho, async (c) => {
      const u = c.var.utilizador;
      if (!u || !u.admin) return o.recusar();
      const r = await AC.rotaAdmin(c.var.env, u, caminho, c.req.raw);
      if (c.req.method === 'POST' && r.status === 200) console.log(JSON.stringify({ evento: 'acessos_alterados', pagina: caminho }));
      return o.pagina(c, r);
    });
  }
}

/** @param {import('hono').Hono<any>} app */
export function rotaEstilo(app) {
  app.get('/acessos.css', () => new Response(ESTILO_ACESSOS, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } }));
}

/**
 * Mantém a definição da app («acessos:definicao» na KV da app) atualizada para a página central de acessos. Corre
 * depois da resposta (waitUntil) quando há contexto do Worker; uma falha nunca afeta o pedido.
 * @param {{ publicarDefinicao: (env: any) => Promise<boolean> }} AC
 * @returns {import('hono').MiddlewareHandler<any>}
 */
export const publicarDefinicao = (AC) => async (c, next) => {
  await next();
  const env = c.var.env || c.env;
  if (!env || (c.var.utilizador && c.var.utilizador.demo)) return;
  const tarefa = AC.publicarDefinicao(env).catch((e) => console.error(JSON.stringify({ evento: 'definicao_acessos_falhou', erro: String(e && e.message).slice(0, 200) })));
  let ctx; try { ctx = c.executionCtx; } catch { ctx = undefined; }
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(tarefa); else await tarefa;
};
