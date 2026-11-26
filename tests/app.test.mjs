// FERCOPOR AI de ponta a ponta: login obrigatório, Padrão de Acessos, páginas e conteúdos da infraestrutura e do roadmap.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { assinar } from '../src/auth.js';
import { SERVICOS, ROADMAP, MENU } from '../src/conteudo.js';

const kv = (inicial = {}) => { const m = new Map(Object.entries(inicial)); return { m, async get(k, t) { const v = m.get(k); return v == null ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; };
const base = (extra = {}) => ({
  MICROSOFT_TENANT_ID: '00000000-0000-0000-0000-000000000001', MICROSOFT_CLIENT_ID: 'cliente-teste', MICROSOFT_CLIENT_SECRET: 'segredo-teste',
  SESSION_SECRET: 'x'.repeat(40), ADMIN_EMAILS: 'isabelly.silva@fercopor.pt', IA_KV: kv(), ...extra,
});
async function abrir(caminho, { env = base(), email = 'isabelly.silva@fercopor.pt', metodo = 'GET', cabecalhos = {} } = {}) {
  const h = { ...cabecalhos };
  if (email) h.Cookie = `__Host-ia_sessao=${await assinar(env, { e: email, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const r = await worker.fetch(new Request(`https://ia.fercopor.app${caminho}`, { method: metodo, headers: h }), env, { waitUntil() {} });
  return { r, texto: await r.text() };
}

test('sem sessão: página de entrada com login Microsoft', async () => {
  const { r, texto } = await abrir('/', { email: '' });
  assert.equal(r.status, 200);
  assert.match(texto, /Iniciar sessão com Microsoft/);
  assert.match(texto, /nunca por esta aplicação/);
  assert.doesNotMatch(texto, /Intelligence Overview/);
});

test('login por configurar: ninguém entra', async () => {
  const { r, texto } = await abrir('/', { env: { IA_KV: kv() }, email: '' });
  assert.equal(r.status, 503);
  assert.match(texto, /Login Microsoft por configurar/);
});

test('administradora: Dashboard igual aos ecrãs aprovados e menu completo', async () => {
  const { r, texto } = await abrir('/');
  assert.equal(r.status, 200);
  for (const t of ['FERCOPOR AI', 'Ambiente interno', 'Intelligence Overview', 'Centro de inteligência corporativa', 'Como posso ajudar?', 'Pergunta à FERCOPOR AI', 'Agentes especializados', 'Commercial Agent', 'Meeting Agent', 'Data Quality Agent', 'Por configurar']) assert.ok(texto.includes(t), t);
  for (const i of MENU.flatMap((s) => s.itens)) assert.ok(texto.includes(`>${i.nome.replace('&', '&amp;')}<`), i.nome);
  assert.match(texto, /href="\/admin\/utilizadores"/);
  assert.match(texto, /Níveis de Acesso e Ações/);
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.match(r.headers.get('Content-Security-Policy'), /script-src 'none'/);
});

test('Infraestrutura e Roadmap: todos os serviços, prioridades e as 7 fases', async () => {
  const { r, texto } = await abrir('/infraestrutura');
  assert.equal(r.status, 200);
  assert.equal(SERVICOS.length, 10);
  for (const s of SERVICOS) { assert.ok(texto.includes(`>${s.servico}<`), s.servico); assert.ok(texto.includes(s.finalidade.replace(',', ',')), s.finalidade); }
  assert.equal((texto.match(/selo-imediata">Imediata/g) || []).length, 4);
  assert.equal(ROADMAP.length, 7);
  for (const f of ROADMAP) { assert.ok(texto.includes(f.nome.replace('&', '&amp;')), f.nome); assert.ok(texto.includes(`>${f.n}<`), f.n); }
  assert.match(texto, /Foundation <span class="selo selo-imediata">Fase inicial/);
  assert.match(texto, /A escolha definitiva dependerá da análise do repositório/);
});

test('páginas por configurar abrem sem inventar dados', async () => {
  for (const p of ['/assistente', '/agentes', '/reunioes', '/integracoes', '/configuracoes']) {
    const { r, texto } = await abrir(p);
    assert.equal(r.status, 200, p);
    assert.match(texto, /Esta área ainda não está configurada/);
  }
});

test('fora da lista: não entra (regra de entrada por omissão)', async () => {
  const { r, texto } = await abrir('/', { email: 'outra.pessoa@fercopor.pt' });
  assert.equal(r.status, 403);
  assert.match(texto, /sem autorização/);
});

test('nível sem a página: o servidor recusa e o menu esconde', async () => {
  const env = base({ IA_KV: kv({
    utilizadores: JSON.stringify([{ email: 'ana@fercopor.pt', perfil: 'equipa' }]),
    'acessos:config': JSON.stringify({ perfis: { equipa: { 'pagina.infraestrutura': false } } }),
  }) });
  const inicio = await abrir('/', { env, email: 'ana@fercopor.pt' });
  assert.equal(inicio.r.status, 200);
  assert.doesNotMatch(inicio.texto, /href="\/infraestrutura"/);
  assert.match(inicio.texto, /href="\/agentes"/);
  assert.doesNotMatch(inicio.texto, /admin\/utilizadores/);
  const infra = await abrir('/infraestrutura', { env, email: 'ana@fercopor.pt' });
  assert.equal(infra.r.status, 403);
  const admin = await abrir('/admin/utilizadores', { env, email: 'ana@fercopor.pt' });
  assert.equal(admin.r.status, 403);
});

test('administração: Utilizadores e Níveis de Acesso e Ações', async () => {
  const u = await abrir('/admin/utilizadores');
  assert.equal(u.r.status, 200);
  assert.match(u.texto, /Utilizadores/);
  const a = await abrir('/admin/acessos');
  assert.equal(a.r.status, 200);
  assert.match(a.texto, /Infraestrutura e Roadmap/);
  const css = await abrir('/acessos.css', { email: '' });
  assert.equal(css.r.status, 200);
  const outra = await abrir('/admin/acessos', { metodo: 'POST', cabecalhos: { Origin: 'https://exemplo.com' } });
  assert.equal(outra.r.status, 403);
});

test('endereço desconhecido: 404 com o menu', async () => {
  const { r, texto } = await abrir('/nao-existe');
  assert.equal(r.status, 404);
  assert.match(texto, /Não encontrado/);
});
