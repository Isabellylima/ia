// @ts-check
// @fercopor/login/hono — as rotas /auth/* e o middleware de sessão para apps feitas com Hono.
//   rotasLogin(app, login, { entrada, diagnostico, exigirSessao })  regista /auth/entrar, /auth/retorno, /auth/sair e
//                                                                    /auth/diagnostico (aberto só sem login configurado)
// O ambiente já configurado (login.configurar) tem de estar em c.var.env0 (ver o middleware da app). Uma app que precise
// de outro /auth/diagnostico regista a sua rota ANTES de chamar rotasLogin (a primeira rota registada responde).

/**
 * @param {import('hono').Hono<any>} app
 * @param {ReturnType<typeof import('./index.js').criarLogin>} login
 * @param {{
 *   entrada: (mensagem: string, status: number, c: import('hono').Context<any>) => Response,
 *   diagnostico: (env: Record<string, any>) => Promise<unknown>,
 *   exigirSessao: (c: import('hono').Context<any>) => Promise<unknown>,
 *   cabecalhos?: Record<string, string>,
 * }} o
 */
export function rotasLogin(app, login, o) {
  app.get('/auth/entrar', (c) => login.iniciarLogin(c.req.raw, c.var.env0));   // 503 enquanto o login não está configurado
  app.get('/auth/retorno', async (c) => {
    const r = await login.concluirLogin(c.req.raw, c.var.env0);
    if ('erro' in r) return o.entrada(r.erro, 400, c);
    return new Response(null, { status: 302, headers: r.cabecalhos });
  });
  app.get('/auth/sair', (c) => new Response(null, { status: 302, headers: login.terminarSessao(c.var.env0, { microsoft: c.req.query('microsoft') === '1' }) }));
  // Diagnóstico do login (sem segredos): aberto só enquanto o login não está configurado; depois exige sessão
  app.get('/auth/diagnostico', async (c) => {
    const env = c.var.env0;
    if (login.loginConfigurado(env)) await o.exigirSessao(c);
    return new Response(JSON.stringify(await o.diagnostico(env), null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(o.cabecalhos || {}) } });
  });
}
