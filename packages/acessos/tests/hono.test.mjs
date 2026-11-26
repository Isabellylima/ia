// @fercopor/acessos/hono: o middleware de ações e as rotas de administração numa app Hono mínima
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { criarAcessos } from '@fercopor/acessos';
import { exigirAcao, rotasAdmin, rotaEstilo } from '@fercopor/acessos/hono';

const kv = () => { const m = new Map(); return { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, String(v)); } }; };
const AC = criarAcessos({ app: 'Teste', kv: 'KV', catalogo: [{ id: 'pagina.inicio', modulo: 'Início', nome: 'Início', nivel: 'pagina', fixa: true }, { id: 'pagina.a', modulo: 'A', nome: 'Página A', nivel: 'pagina' }], niveisOrigem: { equipa: 'Equipa' }, padrao: { equipa: ['pagina.a'] } });

function app(utilizador) {
  const a = new Hono();
  rotaEstilo(a);
  a.use('*', async (c, next) => { c.set('utilizador', utilizador); c.set('env', c.env); await next(); });
  rotasAdmin(a, AC, { recusar: () => { throw Object.assign(new Error('Só administradores.'), { status: 403 }); }, pagina: (c, r) => c.html(r.html, r.status) });
  a.use('*', exigirAcao(AC, (p) => (p === '/a' ? 'pagina.a' : p === '/' ? 'pagina.inicio' : null), (c, acao) => c.text(`sem ${acao}`, 403)));
  a.get('/', (c) => c.text('início'));
  a.get('/a', (c) => c.text('A'));
  a.onError((e, c) => c.text(e.message, e.status || 500));
  return a;
}
const pedir = (u, caminho, op) => app(u).fetch(new Request('https://t.exemplo' + caminho, op), { KV: kv(), ALLOWED_DOMAIN: 'exemplo.pt' });

test('Ação do endereço: com ela passa; sem ela 403 com a ação em falta; fixas sempre', async () => {
  assert.equal(await (await pedir({ perms: ['pagina.a'] }, '/a')).text(), 'A');
  const r = await pedir({ perms: [] }, '/a');
  assert.equal(r.status, 403);
  assert.equal(await r.text(), 'sem pagina.a');
  assert.equal((await pedir({ admin: true, perms: [] }, '/a')).status, 200);
  assert.equal((await pedir({ perms: ['pagina.inicio'] }, '/')).status, 200);
});

test('Administração: só ADM; GET mostra e POST grava; estilos servidos à parte', async () => {
  assert.equal((await pedir({ perms: ['pagina.a'] }, '/admin/acessos')).status, 403);
  const g = await pedir({ admin: true, email: 'chefe@exemplo.pt' }, '/admin/acessos');
  assert.equal(g.status, 200);
  assert.match(await g.text(), /Níveis de Acesso e Ações/);
  const p = await pedir({ admin: true, email: 'chefe@exemplo.pt' }, '/admin/acessos', { method: 'POST', body: new URLSearchParams([['novo_nivel', 'Leitura'], ['novo_nivel_base', 'nada'], ['entrada', 'lista']]) });
  assert.match(await p.text(), /Guardado: 1 alteração\./);
  const css = await pedir(null, '/acessos.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('Content-Type'), /text\/css/);
});
