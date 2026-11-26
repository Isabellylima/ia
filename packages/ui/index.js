// @ts-check
// @fercopor/ui — peças comuns das páginas FERCOPOR geradas no servidor: escape de HTML, cabeçalhos de segurança,
// respostas (HTML, JSON, redirecionamento) e o redirecionamento do endereço *.workers.dev para o domínio próprio.
// Sem dependências: funciona com ou sem Hono.

/** Escape de HTML (texto e atributos). @param {unknown} t */
export const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Política de segurança por omissão: só recursos da própria app, sem scripts nem estilos em linha, sem molduras. */
export const CSP_PADRAO = "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

/** Cabeçalhos de segurança de todas as respostas da app. @param {string} [csp] */
export const cabecalhosSeguranca = (csp = CSP_PADRAO) => ({
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': csp,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});
export const SEGURANCA = cabecalhosSeguranca();

/** PWA (app instalável): manifesto, nome no ecrã principal e registo do Service Worker (public/pwa.js, public/sw.js).
 * @param {string} nome nome da app no ecrã principal (ex.: «FERCOPOR Experience») */
export const cabecaPwa = (nome) => `<link rel="manifest" href="/manifest.webmanifest"><meta name="apple-mobile-web-app-title" content="${esc(nome)}"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><script src="/pwa.js" defer></script>`;

/** Opção discreta do menu da conta: só aparece quando o navegador permite instalar (public/pwa.js). */
export const BOTAO_INSTALAR = '<button type="button" data-instalar-app hidden>Instalar aplicação</button>';

/** Página HTML privada (nunca em cache). @param {string} corpo @param {number} [status] */
export const html = (corpo, status = 200) => new Response(corpo, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', ...SEGURANCA } });
/** JSON privado (nunca em cache). @param {unknown} dados @param {number} [status] */
export const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...SEGURANCA } });
/** Redirecionamento depois de um formulário (303: o navegador segue com GET). @param {string} destino */
export const ir = (destino) => new Response(null, { status: 303, headers: { Location: destino, 'Cache-Control': 'no-store' } });
/** Folha de estilos servida pelo Worker (ex.: estilos das páginas de acessos). @param {string} css */
export const css = (css) => new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });

/**
 * Domínio próprio (DOMINIO_PRINCIPAL, ex.: https://experience.fercopor.app, no painel do Cloudflare): o endereço antigo
 * *.workers.dev redireciona para lá com o mesmo caminho. Sem a variável: null (nada muda).
 * @param {Request} request @param {{ DOMINIO_PRINCIPAL?: string }} env @returns {Response | null}
 */
export function redirecionarDominio(request, env) {
  const alvo = String(env.DOMINIO_PRINCIPAL || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(alvo)) return null;
  const url = new URL(request.url);
  if (!url.hostname.endsWith('.workers.dev') || url.origin === alvo) return null;
  return new Response(null, { status: request.method === 'GET' || request.method === 'HEAD' ? 301 : 308, headers: { Location: alvo + url.pathname + url.search, 'Cache-Control': 'no-store' } });
}


/* ---------- Trilho das aplicações FERCOPOR (2026-11-25) ----------
 * Painel preto à esquerda, comum a todas as apps (estrutural): recolhido mostra só os ícones; a seta expande e mostra
 * os nomes (COMERCIAL, PÓS-VENDA, EXPERIENCE, …). Só no computador (o CSS esconde-o abaixo de 1024 px).
 * Uso numa app: `<body class="com-trilho">${trilhoApps({ atual: 'comercial', apps })}…` e servir CSS_TRILHO como folha
 * de estilos própria (ex.: /trilho.css), porque a política de segurança não permite estilos em linha.
 * Estado aberto/fechado: guardado no navegador pelo script da app (opcional; sem ele, começa sempre recolhido). */
export const ICONES_APPS = {
  painel: '<rect x="3.5" y="3.5" width="7.5" height="9" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="5.5" rx="1.5"/><rect x="13" y="11" width="7.5" height="9.5" rx="1.5"/><rect x="3.5" y="14.5" width="7.5" height="6" rx="1.5"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
  grafico: '<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="5.5" rx="1"/><rect x="10.5" y="7" width="3" height="10.5" rx="1"/><rect x="15.5" y="10" width="3" height="7.5" rx="1"/>',
  ferramentas: '<path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  pessoas: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.3A6.5 6.5 0 0 1 21.5 20"/>',
  documento: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5"/>',
  folha: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M3.5 14.5h17M9.5 4v16"/>',
};
/** Lista por omissão das apps (as apps podem passar a sua). Sem a FERCOPOR Info nem a Central de Reports (pedido de 2026-11-25). */
export const APPS_FERCOPOR = [
  { id: 'dashboard', nome: 'Dashboard', url: 'https://dashboard.fercopor.app', icone: 'painel' },
  { id: 'comercial', nome: 'Comercial', url: 'https://comercial.fercopor.app', icone: 'calendario' },
  { id: 'marketing', nome: 'Marketing', url: 'https://marketing.fercopor.app', icone: 'grafico' },
  { id: 'pos-venda', nome: 'Pós-venda', url: 'https://pos-venda.fercopor.app', icone: 'ferramentas' },
  { id: 'experience', nome: 'Experience', url: 'https://experience.fercopor.app', icone: 'pessoas' },
];
const SETA_TRILHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
/**
 * HTML do trilho (logo a seguir a <body class="com-trilho">). Apps sem url não aparecem.
 * @param {{ atual?: string, apps?: Array<{ id: string, nome: string, url?: string|null, icone?: string }>, icones?: Record<string,string> }} [o]
 */
export function trilhoApps({ atual = '', apps = APPS_FERCOPOR, icones = ICONES_APPS } = {}) {
  const lista = apps.filter((a) => a && a.url);
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icones[k] || icones.painel || ''}</svg>`;
  return `<input type="checkbox" id="trilho-aberto" class="trilho-estado" aria-label="Expandir o painel das aplicações">
<nav class="trilho-apps" aria-label="Aplicações FERCOPOR">
  <label for="trilho-aberto" class="trilho-alternar" title="Expandir / recolher">${SETA_TRILHO}<span>Aplicações</span></label>
  <ul>${lista.map((a) => {
    const e = a.id === atual;
    return `<li><a class="trilho-app${e ? ' atual' : ''}" href="${esc(a.url)}" title="${esc(a.nome)}"${e ? ' aria-current="page"' : ''}><span class="trilho-icone">${svg(a.icone || '')}</span><span class="trilho-nome">${esc(a.nome)}</span></a></li>`;
  }).join('')}</ul>
</nav>`;
}
/** Folha de estilos do trilho (servir com css(CSS_TRILHO) ou copiar para public/trilho.css). */
export const CSS_TRILHO = "/* Trilho das aplicações FERCOPOR (@fercopor/ui · trilhoApps). Só no computador (≥ 1024 px); no telemóvel não aparece.\n   Recolhido: só os ícones (64 px). Expandido (seta): ícones e nomes, por cima do conteúdo. Sem JavaScript obrigatório. */\n.trilho-estado, .trilho-apps { display: none; }\n@media (min-width: 1024px) {\n  body.com-trilho { padding-left: 64px; }\n  .trilho-estado { display: block; position: fixed; left: 0; top: 0; width: 1px; height: 1px; margin: 0; opacity: 0; pointer-events: none; }\n  .trilho-apps { display: flex; flex-direction: column; position: fixed; z-index: 60; left: 0; top: 0; bottom: 0; width: 64px;\n    background: #141414; color: #FFF9EB; border-right: 1px solid rgba(255, 249, 235, .08); overflow-x: hidden; overflow-y: auto; transition: width .2s ease; }\n  .trilho-estado:checked ~ .trilho-apps { width: 236px; box-shadow: 10px 0 28px rgba(0, 0, 0, .28); }\n  .trilho-alternar { display: flex; align-items: center; justify-content: flex-start; gap: 14px; height: 58px; flex: 0 0 58px; padding: 0 20px; cursor: pointer;\n    color: rgba(255, 249, 235, .72); border-bottom: 1px solid rgba(255, 249, 235, .08); white-space: nowrap; user-select: none; }\n  .trilho-alternar:hover { color: #FFFFFF; }\n  .trilho-alternar svg { flex: 0 0 22px; width: 22px; height: 22px; transition: transform .2s ease; }\n  .trilho-alternar span { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: 0; transition: opacity .15s ease; }\n  .trilho-estado:checked ~ .trilho-apps .trilho-alternar svg { transform: rotate(180deg); }\n  .trilho-estado:focus-visible ~ .trilho-apps .trilho-alternar { outline: 2px solid #B49A55; outline-offset: -4px; }\n  .trilho-apps ul { list-style: none; margin: 0; padding: 12px 0; display: flex; flex-direction: column; gap: 4px; }\n  .trilho-app { display: flex; align-items: center; gap: 14px; height: 46px; padding: 0 11px; margin: 0 9px; border-radius: 10px;\n    color: rgba(255, 249, 235, .78); text-decoration: none; white-space: nowrap; }\n  .trilho-app:hover { background: rgba(255, 249, 235, .08); color: #FFFFFF; }\n  .trilho-app:focus-visible { outline: 2px solid #B49A55; outline-offset: 0; background: rgba(255, 249, 235, .08); color: #FFFFFF; }\n  .trilho-app.atual { background: #7E6A32; color: #FFF9EB; }\n  .trilho-icone { flex: 0 0 24px; width: 24px; height: 24px; display: grid; place-items: center; }\n  .trilho-icone svg { width: 22px; height: 22px; }\n  .trilho-nome { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; opacity: 0; transition: opacity .15s ease; }\n  .trilho-estado:checked ~ .trilho-apps .trilho-nome, .trilho-estado:checked ~ .trilho-apps .trilho-alternar span { opacity: 1; }\n}\n@media (prefers-reduced-motion: reduce) { .trilho-apps, .trilho-nome, .trilho-alternar svg, .trilho-alternar span { transition: none; } }\n@media print { .trilho-estado, .trilho-apps { display: none !important; } body.com-trilho { padding-left: 0 !important; } }\n";
