// Servidor local de demonstração (sem login: DEMO_LOCAL=sim). Uso: node tools/servidor-local.mjs [porta]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';

const porta = Number(process.argv[2] || 8797);
const raiz = fileURLToPath(new URL('../public/', import.meta.url));
const tipos = { '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const m = new Map();
const env = { DEMO_LOCAL: 'sim', IA_KV: { async get(k, t) { const v = m.get(k); return v == null ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } } };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${porta}`);
  const ficheiro = normalize(join(raiz, url.pathname));
  if (ficheiro.startsWith(raiz) && extname(ficheiro)) {
    let dados; try { dados = await readFile(ficheiro); } catch { /* não é ficheiro: segue para o Worker */ }
    if (dados) { res.writeHead(200, { 'Content-Type': tipos[extname(ficheiro)] || 'application/octet-stream' }); return res.end(dados); }
  }
  const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers }), env, {});
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(porta, () => console.log(`FERCOPOR IA (demonstração) em http://localhost:${porta}/`));
