// @fercopor/ui: escape, cabeçalhos de segurança, respostas e redirecionamento para o domínio próprio
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, html, json, ir, redirecionarDominio, SEGURANCA, cabecalhosSeguranca } from '@fercopor/ui';

test('esc: escapa os cinco caracteres perigosos e aceita null/undefined', () => {
  assert.equal(esc(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('Respostas privadas, sem cache e com os cabeçalhos de segurança', async () => {
  for (const r of [html('<p>x</p>', 201), json({ a: 1 })]) {
    assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
    assert.match(r.headers.get('Content-Security-Policy'), /default-src 'none'; script-src 'self'/);
    assert.doesNotMatch(r.headers.get('Content-Security-Policy'), /unsafe-inline/);
  }
  assert.equal(html('', 201).status, 201);
  assert.deepEqual(await json({ a: 1 }).json(), { a: 1 });
  const v = ir('/pedidos?ok=1');
  assert.equal(v.status, 303);
  assert.equal(v.headers.get('Location'), '/pedidos?ok=1');
  assert.equal(cabecalhosSeguranca("default-src 'self'")['Content-Security-Policy'], "default-src 'self'");
  assert.equal(SEGURANCA['X-Robots-Tag'], 'noindex, nofollow');
});

test('Domínio próprio: só *.workers.dev redireciona (301 GET, 308 POST), com o mesmo caminho; sem variável nada muda', () => {
  const env = { DOMINIO_PRINCIPAL: 'https://app.exemplo.pt/' };
  const g = redirecionarDominio(new Request('https://app.conta.workers.dev/pedidos/1?ok=x'), env);
  assert.equal(g.status, 301);
  assert.equal(g.headers.get('Location'), 'https://app.exemplo.pt/pedidos/1?ok=x');
  assert.equal(redirecionarDominio(new Request('https://app.conta.workers.dev/pedidos', { method: 'POST' }), env).status, 308);
  assert.equal(redirecionarDominio(new Request('https://app.exemplo.pt/'), env), null);
  assert.equal(redirecionarDominio(new Request('https://app.conta.workers.dev/'), {}), null);
  assert.equal(redirecionarDominio(new Request('https://app.conta.workers.dev/'), { DOMINIO_PRINCIPAL: 'javascript:alert(1)' }), null);
});
