// @fercopor/login: sessão assinada, domínio, cookies por app, derivação do segredo e rotas /auth/* em Hono
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { criarLogin, ErroHttp } from '@fercopor/login';
import { rotasLogin } from '@fercopor/login/hono';

const L = criarLogin({ app: 'teste' });
const ENV = { MICROSOFT_TENANT_ID: '00000000-0000-0000-0000-000000000001', MICROSOFT_CLIENT_ID: 'cliente', MICROSOFT_CLIENT_SECRET: '  segredo-de-teste-com-comprimento-suficiente ' };
const pedido = (c, h = {}) => new Request('https://app.exemplo' + c, { headers: h });

test('configurar: só MICROSOFT_*, segredo sem espaços, APP_URL da origem, SESSION_SECRET derivado (sem expor o segredo)', async () => {
  const e = await L.configurar({ ...ENV, ENTRA_CLIENT_SECRET: 'antigo' }, pedido('/'));
  assert.equal(e.ENTRA_CLIENT_SECRET, 'segredo-de-teste-com-comprimento-suficiente');
  assert.equal(e.APP_URL, 'https://app.exemplo');
  assert.equal(e.SESSION_SECRET.length, 64);
  assert.ok(L.loginConfigurado(e));
  const d = L.diagnosticoLogin(e);
  assert.deepEqual(d.variaveisEntraIgnoradas, ['ENTRA_CLIENT_SECRET']);
  assert.equal(d.segredoTinhaEspacos, true);
  assert.ok(!JSON.stringify(d).includes('segredo-de-teste'));
  // Outra app deriva outro segredo (as sessões não passam de uma app para outra)
  const outra = await criarLogin({ app: 'outra' }).configurar(ENV, pedido('/'));
  assert.notEqual(outra.SESSION_SECRET, e.SESSION_SECRET);
});

test('emailDaSessao: 503 sem login, 401 sem sessão ou adulterada, 403 fora do domínio; cookie com o nome da app', async () => {
  await assert.rejects(L.emailDaSessao(pedido('/'), await L.configurar({}, pedido('/'))), (e) => e instanceof ErroHttp && e.status === 503);
  const e = await L.configurar(ENV, pedido('/'));
  await assert.rejects(L.emailDaSessao(pedido('/'), e), (x) => x.status === 401);
  const ok = await L.assinar(e, { e: 'Ana@Fercopor.pt', exp: Math.floor(Date.now() / 1000) + 60 });
  assert.equal(L.NOME_COOKIE_SESSAO, '__Host-teste_sessao');
  assert.equal(criarLogin({ app: 'pos-venda', cookie: 'posvenda' }).NOME_COOKIE_SESSAO, '__Host-posvenda_sessao');
  assert.equal(await L.emailDaSessao(pedido('/', { Cookie: `__Host-teste_sessao=${ok}` }), e), 'ana@fercopor.pt');
  await assert.rejects(L.emailDaSessao(pedido('/', { Cookie: `__Host-teste_sessao=${ok}x` }), e), (x) => x.status === 401);
  const expirada = await L.assinar(e, { e: 'ana@fercopor.pt', exp: 1 });
  await assert.rejects(L.emailDaSessao(pedido('/', { Cookie: `__Host-teste_sessao=${expirada}` }), e), (x) => x.status === 401);
  const fora = await L.assinar(e, { e: 'ana@gmail.com', exp: Math.floor(Date.now() / 1000) + 60 });
  await assert.rejects(L.emailDaSessao(pedido('/', { Cookie: `__Host-teste_sessao=${fora}` }), e), (x) => x.status === 403);
});

test('Rotas Hono: entrar com PKCE e destino seguro, sair apaga a sessão, diagnóstico fechado com login configurado', async () => {
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('env0', await L.configurar(c.env, c.req.raw)); await next(); });
  rotasLogin(app, L, { entrada: (m, s) => new Response(m, { status: s }), diagnostico: async (env) => L.diagnosticoLogin(env), exigirSessao: () => { throw new ErroHttp(401, 'Sessão em falta.'); } });
  app.onError((e) => new Response(e.message, { status: e.status || 500 }));
  const r = await app.fetch(pedido('/auth/entrar?volta=//malicioso.pt'), ENV);
  assert.equal(r.status, 302);
  const u = new URL(r.headers.get('Location'));
  assert.equal(u.hostname, 'login.microsoftonline.com');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://app.exemplo/auth/retorno');
  assert.match(r.headers.get('Set-Cookie'), /^__Host-teste_oauth=.*HttpOnly; Secure; SameSite=Lax/);
  const s = await app.fetch(pedido('/auth/sair'), ENV);
  assert.match(s.headers.get('Set-Cookie'), /__Host-teste_sessao=; .*Max-Age=0/);
  assert.equal((await app.fetch(pedido('/auth/diagnostico'), ENV)).status, 401);
  assert.equal((await app.fetch(pedido('/auth/diagnostico'), {})).status, 200);
  assert.equal((await app.fetch(pedido('/auth/entrar'), {})).status, 503);
  assert.equal((await app.fetch(pedido('/auth/retorno?code=x&state=y'), ENV)).status, 400);
});
