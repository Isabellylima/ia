// Páginas da FERCOPOR AI (HTML gerado no servidor, sem scripts nem estilos em linha: a CSP não os permite).
import { esc } from '@fercopor/ui';
import { MENU, INDICADORES, AGENTES, POR_CONFIGURAR, INFRA_INTRO, INFRA_NOTA, SERVICOS, ROADMAP } from './conteudo.js';
import { ocultar } from './acessos.js';

export { esc };
const VERSAO_CSS = '2026-11-26b';

// Ícones de linha (24×24, traço 1.7), no estilo dos ecrãs aprovados
const I = {
  painel: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  conversa: '<path d="M20 11.5a7.5 7.5 0 0 1-11.2 6.5L4 19.5l1.5-4.6A7.5 7.5 0 1 1 20 11.5z"/>',
  historico: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V9H8"/><path d="M12 7.5V12l3 2"/>',
  robo: '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V5M9.5 12.5v1M14.5 12.5v1"/>',
  livros: '<path d="M5 4v16M9 4v16M13.5 4.5l5 15"/>',
  cerebro: '<path d="M12 5.5v13"/><path d="M12 5.5a3 3 0 0 0-5.5 1.2A3 3 0 0 0 4.5 12a3 3 0 0 0 2 4.8A3 3 0 0 0 12 18.5"/><path d="M12 5.5a3 3 0 0 1 5.5 1.2 3 3 0 0 1 2 5.3 3 3 0 0 1-2 4.8 3 3 0 0 1-5.5 1.7"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><circle cx="15.5" cy="15.5" r="3"/><path d="M15.5 14.2v1.3l.9.7"/>',
  microfone: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  barras: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3.5" height="6.5" rx="1"/><rect x="10.3" y="6" width="3.5" height="11.5" rx="1"/><rect x="15.1" y="9" width="3.5" height="8.5" rx="1"/>',
  ficha: '<path d="M9 3.5V8M15 3.5V8M7 8h10v3.5a5 5 0 0 1-10 0z"/><path d="M12 16.5v4"/>',
  escudo: '<path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  monitor: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M6.5 14l3-3.5 3 2.5 4.5-5"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  nuvem: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 18.5z"/>',
  copias: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  consumo: '<path d="M4 20h16M6 17v-3M9.5 17v-5M13 17v-7M16.5 17V8"/><path d="M5 10.5 10 6l3 2.5L19.5 4"/>',
  pasta: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>',
  base: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  brilho: '<path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z"/><circle cx="18" cy="5.5" r="1.6"/>',
  clip: '<path d="M16.5 7.5 9 15a2 2 0 0 0 2.8 2.8l7.4-7.4a4 4 0 0 0-5.7-5.7L6 12.2a6 6 0 0 0 8.5 8.5L20 15"/>',
  enviar: '<circle cx="12" cy="12" r="8.5"/><path d="M12 16V8.5M8.8 11.5 12 8.3l3.2 3.2"/>',
  conta: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.2a6.5 6.5 0 0 1 11 0"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
export const icone = (k, classe = 'icone') => `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[k] || ''}</svg>`;

const CABECA = (titulo) => `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#141414">
<title>${esc(titulo)}</title>
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/ia.css?v=${VERSAO_CSS}"><link rel="stylesheet" href="/acessos.css"></head>`;

function menuLateral(ativo, u) {
  return MENU.map((s) => `<p class="menu-seccao">${esc(s.seccao)}</p><ul>${s.itens.filter((i) => !i.soAdmin || (u && u.admin)).map((i) => {
    const e = i.id === ativo;
    return `<li><a class="menu-item${e ? ' ativo' : ''}" href="${esc(i.href)}"${e ? ' aria-current="page"' : ''}>${icone(i.icone)}<span>${esc(i.nome)}</span></a></li>`;
  }).join('')}</ul>`).join('');
}

function menuConta(u) {
  if (!u) return '';
  const admin = u.admin ? `<a href="/admin/utilizadores">Utilizadores</a><a href="/admin/acessos">Níveis de Acesso e Ações</a>` : '';
  return `<details class="conta"><summary aria-label="Conta">${icone('conta')}</summary><div class="conta-menu">
<p class="conta-quem"><strong>${esc(u.nome || u.email)}</strong><span>${esc(u.perfilNome || '')}${u.demo ? ' · demonstração local' : ''}</span></p>
${admin}<a href="https://dashboard.fercopor.app">Outras aplicações FERCOPOR</a>${u.demo ? '' : '<a href="/auth/sair">Terminar sessão</a>'}</div></details>`;
}

// Página completa com o menu (o HTML passa por ocultar(): ligações sem acesso não aparecem)
export function pagina({ titulo, ativo = '', conteudo, utilizador }) {
  const corpo = `${CABECA(titulo === 'FERCOPOR AI' ? titulo : `${titulo} · FERCOPOR AI`)}
<body>
<header class="topo">
  <a class="marca" href="/"><img src="/fercopor-logo.svg" alt="FERCOPOR" width="128" height="20"><span>AI</span></a>
  <div class="topo-direita"><span class="ambiente">Ambiente interno</span>${menuConta(utilizador)}</div>
</header>
<div class="estrutura">
  <details class="menu-movel"><summary>${icone('menu')}<span>Menu</span></summary><nav aria-label="Menu principal">${menuLateral(ativo, utilizador)}</nav></details>
  <nav class="lateral" aria-label="Menu principal">${menuLateral(ativo, utilizador)}</nav>
  <main class="conteudo">${conteudo}</main>
</div>
</body></html>`;
  return utilizador ? ocultar(corpo, utilizador) : corpo;
}

// Dashboard — Intelligence Overview
export function conteudoInicio() {
  const cartoes = INDICADORES.map((c) => `<article class="cartao indicador">${icone(c.icone)}<h2>${esc(c.nome)}</h2><p class="valor" aria-label="Sem dados">—</p></article>`).join('');
  const agentes = AGENTES.map((a) => `<li><a class="agente" href="/agentes">${icone(a.icone)}<span class="agente-texto"><strong>${esc(a.nome)}</strong><span>${esc(a.estado)}</span></span>${icone('seta', 'icone seta')}</a></li>`).join('');
  const atual = ROADMAP.find((f) => f.atual);
  return `<h1>Intelligence Overview</h1>
<p class="subtitulo">Centro de inteligência corporativa</p>
<section class="grelha-indicadores" aria-label="Indicadores">${cartoes}</section>
<section class="cartao ajuda">
  ${icone('brilho', 'icone grande')}
  <h2>Como posso ajudar?</h2>
  <p class="suave">Consulta informação, analisa dados e executa tarefas.</p>
  <div class="caixa-pergunta" aria-disabled="true">
    <label for="pergunta" class="so-leitor">Pergunta à FERCOPOR AI</label>
    <input id="pergunta" type="text" placeholder="Pergunta à FERCOPOR AI..." disabled>
    <div class="caixa-acoes"><span class="caixa-anexos">${icone('clip')}${icone('microfone')}</span>${icone('enviar', 'icone enviar')}</div>
  </div>
  <p class="nota">O assistente fica disponível no fim da fase ${esc(atual.n)} · ${esc(atual.nome)}.</p>
</section>
<section class="faixa-roadmap">
  <div><p class="etiqueta">Fase atual</p><p><strong>${esc(atual.n)} · ${esc(atual.nome)}</strong> — ${esc(atual.texto)}</p></div>
  <a class="botao-sec" href="/infraestrutura">Ver infraestrutura e roadmap</a>
</section>
<h2 class="titulo-seccao">Agentes especializados</h2>
<ul class="lista-agentes">${agentes}</ul>`;
}

// Infraestrutura e Roadmap
export function conteudoInfraestrutura() {
  const linhas = SERVICOS.map((s) => `<tr><th scope="row">${esc(s.servico)}</th><td>${esc(s.finalidade)}</td><td><span class="selo selo-${esc(s.tipo)}">${esc(s.prioridade)}</span></td></tr>`).join('');
  const fases = ROADMAP.map((f) => `<li class="fase${f.atual ? ' atual' : ''}"><span class="fase-n">${esc(f.n)}</span><div><h3>${esc(f.nome)}${f.atual ? ' <span class="selo selo-imediata">Fase inicial</span>' : ''}</h3><p>${esc(f.texto)}</p></div></li>`).join('');
  return `<h1>Infraestrutura e Roadmap</h1>
<p class="subtitulo">Base técnica proposta para a FERCOPOR AI e fases de desenvolvimento.</p>
<section class="cartao bloco">
  <h2>${icone('nuvem')}Infraestrutura Cloudflare</h2>
  <p>${esc(INFRA_INTRO)}</p>
  <div class="tabela"><table>
    <thead><tr><th scope="col">Serviço</th><th scope="col">Finalidade</th><th scope="col">Prioridade</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>
  <p class="nota">${esc(INFRA_NOTA)}</p>
</section>
<section class="cartao bloco">
  <h2>${icone('consumo')}Roadmap de desenvolvimento</h2>
  <ol class="roadmap">${fases}</ol>
</section>`;
}

export function conteudoPorConfigurar(id) {
  const p = POR_CONFIGURAR[id];
  return `<h1>${esc(p.titulo)}</h1>
<p class="subtitulo">${esc(p.texto)}</p>
<section class="cartao vazio"><span class="selo selo-futuro">Por configurar</span><p>Esta área ainda não está configurada.</p><a class="botao-sec" href="/infraestrutura">Ver o roadmap</a></section>`;
}

// Página de entrada (login Microsoft), igual às outras apps FERCOPOR
export function paginaEntrada(mensagem = '', status = 200) {
  const erro = status >= 400;
  return { status, html: `${CABECA('FERCOPOR AI')}
<body class="pagina-entrada"><main class="entrada">
  <div class="entrada-cartao">
    <p class="marca marca-entrada"><img src="/fercopor-logo.svg" alt="FERCOPOR" width="128" height="20"><span>AI</span></p>
    <h1>Iniciar sessão</h1>
    <p class="suave">Use a sua conta Microsoft 365 da FERCOPOR (<strong>@fercopor.pt</strong>).</p>
    ${mensagem ? `<p class="entrada-aviso${erro ? ' erro' : ''}" role="${erro ? 'alert' : 'status'}">${esc(mensagem)}</p>` : ''}
    <a class="botao-microsoft" href="/auth/entrar"><svg viewBox="0 0 21 21" width="20" height="20" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>Iniciar sessão com Microsoft</a>
    <p class="nota">A palavra-passe é pedida pela Microsoft, nunca por esta aplicação.</p>
  </div>
  <p class="entrada-rodape">FERCOPOR · Uso interno</p>
</main></body></html>` };
}
