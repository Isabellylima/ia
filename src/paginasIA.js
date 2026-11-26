// Páginas da IA: Assistente, Conversas, Modelos, Monitorização e Configuração da IA (/admin/ia). HTML gerado no servidor;
// o único script é /assistente.js (na página do Assistente), servido pela própria app.
import { esc } from '@fercopor/ui';
import { MODELOS, FUNCOES, ESFORCOS, VERIFICADO_EM } from './ia/modelos.js';
import { AGENTES_IA, IDENTIDADE } from './ia/config.js';
import { MAX_TEXTO } from './ia/assistente.js';
import { icone } from './paginas.js';

const USD = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const usd = (v) => USD.format(Number(v) || 0);
export const num = (v) => (Number(v) || 0).toLocaleString('pt-PT');
const dataHora = (iso) => { try { return new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const nomeModelo = (id) => (MODELOS[id] && MODELOS[id].nome) || id || '—';
const nomeAgente = (id) => (id === 'diagnostico' ? 'Teste de ligação' : (AGENTES_IA[id] && AGENTES_IA[id].nome) || id);

/* ---------- Integrações ---------- */

export function conteudoIntegracoes({ estado, utilizador, resultado = null }) {
  const f = estado.config.funcoes.principal;
  const linha = (nome, ok, detalhe) => `<li class="verificacao ${ok ? 'ok' : 'falha'}"><span class="verificacao-estado">${ok ? 'OK' : 'Falhou'}</span><div><strong>${esc(nome)}</strong><p>${esc(detalhe)}</p></div></li>`;
  let res = '';
  if (resultado) {
    const passos = [linha('Sessão do utilizador', true, `${utilizador.email} · ${utilizador.admin ? 'Administrador' : utilizador.perfilNome || 'Equipa'} (login Microsoft)`), ...resultado.passos.map((p) => linha(p.nome, p.ok, p.detalhe))].join('');
    const metricas = resultado.uso ? `<dl class="metricas">
<div><dt>Modelo que respondeu</dt><dd>${esc(nomeModelo(resultado.modelo))} <code>${esc(resultado.modelo)}</code></dd></div>
<div><dt>Primeira resposta</dt><dd>${resultado.primeiraRespostaMs == null ? '—' : `${num(resultado.primeiraRespostaMs)} ms`}</dd></div>
<div><dt>Duração total</dt><dd>${num(resultado.duracaoMs)} ms</dd></div>
<div><dt>Tokens (entrada / saída)</dt><dd>${num(resultado.uso.entrada + resultado.uso.cacheEscrita + resultado.uso.cacheLeitura)} / ${num(resultado.uso.saida)}</dd></div>
<div><dt>Custo estimado</dt><dd>${usd(resultado.custo)}</dd></div></dl>` : '';
    res = `<section class="cartao bloco" aria-labelledby="res-teste"><h2 id="res-teste">${resultado.ok ? 'Ligação confirmada' : 'Ligação com problemas'}</h2>
<p class="entrada-aviso${resultado.ok ? '' : ' erro'}" role="${resultado.ok ? 'status' : 'alert'}">${resultado.ok ? 'A FERCOPOR IA comunica com a Anthropic.' : 'Pelo menos uma verificação falhou. Veja o detalhe abaixo.'}</p>
<ul class="verificacoes">${passos}</ul>${metricas}
${resultado.quando ? `<p class="nota">Teste feito em ${esc(dataHora(resultado.quando))}. É um pedido real e fica registado em Monitorização.</p>` : ''}</section>`;
  }
  return `<h1>Integrações</h1><p class="subtitulo">Ligações às aplicações e departamentos da FERCOPOR.</p>
${res}
<section class="cartao bloco"><h2>${icone('brilho')}Anthropic · motor de IA</h2>
<p>Estado: <strong>${estado.motor ? 'credencial configurada' : 'por configurar'}</strong> · Modelo principal: <strong>${esc(nomeModelo(f.modelo))}</strong> <code>${esc(f.modelo)}</code> · Base de dados: <strong>${estado.baseDados ? 'ligada' : 'por configurar'}</strong></p>
${utilizador.admin
    ? `<form method="post" action="/integracoes/anthropic/testar"><button type="submit" class="botao-principal">Testar ligação</button></form>
<p class="nota">Confirma a credencial, a autenticação, o acesso ao modelo principal e a resposta em streaming com um pedido real mínimo (custo inferior a um cêntimo, contado nos seus limites). A chave nunca é mostrada.</p>`
    : '<p class="nota">O teste de ligação está disponível para administradores.</p>'}
</section>
<section class="cartao bloco"><h2>${icone('ficha')}Outras integrações</h2><p class="suave">HubSpot e restantes aplicações FERCOPOR: por configurar (fase 04 · CRM Intelligence e fase 06 · Enterprise Integration).</p></section>`;
}

function porConfigurar(titulo, subtitulo, motivos, admin) {
  const lista = motivos.map((m) => `<li>${esc(m)}</li>`).join('');
  return `<h1>${esc(titulo)}</h1><p class="subtitulo">${esc(subtitulo)}</p>
<section class="cartao vazio"><span class="selo selo-futuro">Por configurar</span><p>O motor de IA ainda não está configurado.</p>
${admin && lista ? `<ul class="lista-motivos">${lista}</ul><a class="botao-sec" href="/admin/ia">Configuração da IA</a>` : '<p class="suave">Um administrador tem de concluir a configuração.</p>'}</section>`;
}

function motivosEstado(e) {
  const m = [];
  if (!e.motor) m.push('Falta o secret ANTHROPIC_API_KEY no Worker «ia» (Cloudflare → Workers → ia → Definições → Variáveis e segredos).');
  if (!e.baseDados) m.push('Falta a base de dados D1 (binding IA_DB). É criada automaticamente na próxima publicação.');
  return m;
}

/* ---------- Assistente ---------- */

export function conteudoAssistente({ estado, conversa, mensagens = [], agentes, admin, pergunta = '' }) {
  if (!estado.motor || !estado.baseDados) return porConfigurar('Assistente IA', 'Conversa com a FERCOPOR IA para consultar informação, analisar dados e executar tarefas.', motivosEstado(estado), admin);
  const historico = mensagens.filter((m) => m.visivel && m.texto).map((m) => bolha(m.papel, m.texto, m.papel === 'assistant' ? nomeModelo(m.modelo) : '')).join('');
  const seletor = !conversa && agentes.length > 1
    ? `<label class="agente-seletor"><span>Agente</span><select name="agente">${agentes.map(([id, a]) => `<option value="${esc(id)}">${esc(nomeAgente(id))}</option>`).join('')}</select></label>`
    : `<input type="hidden" name="agente" value="${esc(conversa ? conversa.agente : (agentes[0] || ['assistente'])[0])}">`;
  return `<div class="chat" data-chat>
<div class="chat-topo">
  <div><h1>${conversa ? esc(conversa.titulo || 'Conversa') : 'Assistente IA'}</h1>
  <p class="subtitulo">${conversa ? `${esc(nomeAgente(conversa.agente))} · iniciada em ${esc(dataHora(conversa.criada_em))}` : 'Consulta informação, analisa dados e executa tarefas.'}</p></div>
  <div class="chat-acoes"><a class="botao-sec" href="/assistente">Nova conversa</a><a class="botao-sec" href="/conversas">Conversas</a></div>
</div>
<ol class="mensagens" data-mensagens>${historico || (conversa ? '' : vazio())}</ol>
<p class="so-leitor" role="status" data-estado></p>
<p class="chat-erro" role="alert" data-erro hidden></p>
<form class="compositor" data-formulario action="/api/assistente/mensagem" method="post">
  <input type="hidden" name="conversa" value="${esc(conversa ? conversa.id : '')}">
  ${seletor}
  <div class="caixa-pergunta">
    <label for="pergunta" class="so-leitor">Pergunta à FERCOPOR IA</label>
    <textarea id="pergunta" name="texto" rows="2" maxlength="${MAX_TEXTO}" placeholder="Pergunta à FERCOPOR IA..." required>${esc(pergunta)}</textarea>
    <div class="caixa-acoes"><span class="nota-compositor">Enter envia · Shift+Enter muda de linha</span>
      <button type="submit" class="botao-enviar" data-enviar aria-label="Enviar pergunta">${icone('enviar', 'icone enviar')}</button></div>
  </div>
  <p class="nota">Fase de testes: não inclua dados pessoais de clientes nas perguntas. As respostas podem conter erros; confirme a informação importante.</p>
</form>
<noscript><p class="chat-erro">O assistente precisa de JavaScript ativo no navegador.</p></noscript>
</div>`;
}

const vazio = () => `<li class="mensagens-vazio">${icone('brilho', 'icone grande')}<h2>Como posso ajudar?</h2><p class="suave">Escreva uma pergunta para começar. A conversa fica guardada em «Conversas».</p></li>`;

export function bolha(papel, texto, meta = '') {
  const quem = papel === 'user' ? 'Você' : 'FERCOPOR IA';
  return `<li class="msg msg-${papel === 'user' ? 'utilizador' : 'ia'}"><p class="msg-quem">${esc(quem)}</p><div class="msg-texto" data-md>${esc(texto)}</div>${meta ? `<p class="msg-meta">${esc(meta)}</p>` : ''}</li>`;
}

/* ---------- Conversas ---------- */

export function conteudoConversas({ estado, lista, admin, mensagem = '' }) {
  if (!estado.baseDados) return porConfigurar('Conversas', 'Histórico das conversas com o assistente e com os agentes.', motivosEstado(estado), admin);
  const aviso = mensagem ? `<p class="entrada-aviso" role="status">${esc(mensagem)}</p>` : '';
  if (!lista.length) return `<h1>Conversas</h1><p class="subtitulo">Histórico das suas conversas com a FERCOPOR IA.</p>${aviso}
<section class="cartao vazio"><p>Ainda não tem conversas.</p><a class="botao-sec" href="/assistente">Começar uma conversa</a></section>`;
  const linhas = lista.map((c) => `<li class="conversa-linha"><a href="/assistente?c=${esc(c.id)}"><strong>${esc(c.titulo || 'Conversa')}</strong>
<span>${esc(nomeAgente(c.agente))} · ${num(c.mensagens)} mensage${c.mensagens === 1 ? 'm' : 'ns'} · ${esc(dataHora(c.atualizada_em))}</span></a>
<form method="post" action="/conversas/apagar"><input type="hidden" name="id" value="${esc(c.id)}"><button type="submit" class="botao-texto" aria-label="Apagar a conversa «${esc(c.titulo || 'Conversa')}»">Apagar</button></form></li>`).join('');
  return `<h1>Conversas</h1><p class="subtitulo">Histórico das suas conversas com a FERCOPOR IA (só você as vê).</p>${aviso}
<p><a class="botao-sec" href="/assistente">Nova conversa</a></p><ul class="lista-conversas">${linhas}</ul>`;
}

/* ---------- Modelos ---------- */

export function conteudoModelos({ estado, admin }) {
  const c = estado.config;
  const usadoPor = (id) => Object.entries(c.funcoes).filter(([, f]) => f.modelo === id).map(([fid]) => FUNCOES[fid].nome);
  const linhas = Object.entries(MODELOS).map(([id, m]) => `<tr><th scope="row">${esc(m.nome)}<br><code>${esc(id)}</code></th>
<td>${usadoPor(id).map((n) => `<span class="selo selo-imediata">${esc(n)}</span>`).join(' ') || '<span class="suave">Não usado</span>'}</td>
<td>${usd(m.preco.entrada)} / ${usd(m.preco.saida)}${m.precoLongo ? `<br><span class="suave">acima de ${num(m.precoLongo.limite)} tokens: ${usd(m.precoLongo.entrada)} / ${usd(m.precoLongo.saida)}</span>` : ''}</td>
<td>${num(m.contexto)}</td></tr>`).join('');
  const funcoes = Object.entries(c.funcoes).map(([id, f]) => `<tr><th scope="row">${esc(FUNCOES[id].nome)}</th><td>${esc(FUNCOES[id].descricao)}</td><td>${esc(nomeModelo(f.modelo))}</td><td>${esc(ESFORCOS[f.esforco])}</td><td>${num(f.maxTokens)}</td></tr>`).join('');
  return `<h1>Modelos</h1><p class="subtitulo">Modelos de IA disponíveis e a função de cada um. O motor é escolhido na área administrativa, sem alterar o código.</p>
<section class="cartao bloco"><h2>${icone('chip')}Estado</h2>
<p>Motor de IA: <strong>${estado.motor ? 'configurado' : 'por configurar'}</strong> · Base de dados: <strong>${estado.baseDados ? 'ligada' : 'por configurar'}</strong></p>
${admin ? '<p><a class="botao-sec" href="/admin/ia">Alterar a configuração da IA</a></p>' : ''}</section>
<section class="cartao bloco"><h2>${icone('engrenagem')}Funções</h2><div class="tabela"><table>
<thead><tr><th scope="col">Função</th><th scope="col">Uso</th><th scope="col">Modelo</th><th scope="col">Esforço</th><th scope="col">Máx. tokens de resposta</th></tr></thead><tbody>${funcoes}</tbody></table></div></section>
<section class="cartao bloco"><h2>${icone('nuvem')}Catálogo</h2><div class="tabela"><table>
<thead><tr><th scope="col">Modelo</th><th scope="col">Função</th><th scope="col">Preço (USD por milhão de tokens: entrada / saída)</th><th scope="col">Contexto (tokens)</th></tr></thead><tbody>${linhas}</tbody></table></div>
<p class="nota">Fornecedor: Anthropic. Identificadores e preços confirmados na documentação oficial em ${esc(VERIFICADO_EM)}. Os custos mostrados na app são estimativas a partir destes preços; a fatura da Anthropic é a referência.</p></section>`;
}

/* ---------- Monitorização ---------- */

export function conteudoMonitorizacao({ estado, resumo, recentes, admin, erro = false }) {
  if (!estado.baseDados) return porConfigurar('Monitorização', 'Pedidos de IA, consumo e funcionamento dos serviços.', motivosEstado(estado), admin);
  const ambito = admin ? 'todos os utilizadores' : 'os seus pedidos';
  if (erro) return `<h1>Monitorização</h1><p class="subtitulo">Pedidos de IA de ${ambito}.</p><section class="cartao vazio" role="alert"><span class="selo selo-avaliar">Erro</span><p>Não foi possível ler o registo de pedidos. Tente novamente daqui a pouco.</p></section>`;
  const t = resumo.total;
  const cartao = (nome, valor, ic) => `<article class="cartao indicador">${icone(ic)}<h2>${esc(nome)}</h2><p class="valor">${valor}</p></article>`;
  const tabela = (titulo, linhas, nomeCol, fmt) => `<section class="cartao bloco"><h2>${esc(titulo)}</h2>${linhas.length ? `<div class="tabela"><table>
<thead><tr><th scope="col">${esc(nomeCol)}</th><th scope="col">Pedidos</th><th scope="col">Tokens de entrada</th><th scope="col">Tokens de saída</th><th scope="col">Custo estimado</th></tr></thead>
<tbody>${linhas.map((l) => `<tr><th scope="row">${esc(fmt(l.chave))}</th><td>${num(l.pedidos)}</td><td>${num(l.entrada)}</td><td>${num(l.saida)}</td><td>${usd(l.custo)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="suave">Sem pedidos neste mês.</p>'}</section>`;
  const ESTADOS = { concluido: 'Concluído', em_curso: 'Em curso', erro: 'Erro', recusado: 'Recusado', interrompido: 'Interrompido' };
  const rec = recentes.length ? `<div class="tabela"><table><thead><tr><th scope="col">Data</th>${admin ? '<th scope="col">Utilizador</th>' : ''}<th scope="col">Agente</th><th scope="col">Modelo</th><th scope="col">Estado</th><th scope="col">Tokens (entrada / saída)</th><th scope="col">Duração</th><th scope="col">Custo estimado</th></tr></thead><tbody>
${recentes.map((r) => `<tr><th scope="row">${esc(dataHora(r.criado_em))}</th>${admin ? `<td>${esc(r.email)}</td>` : ''}<td>${esc(nomeAgente(r.agente))}</td><td>${esc(nomeModelo(r.modelo))}</td><td>${esc(ESTADOS[r.estado] || r.estado)}</td>
<td>${num(r.tokens_entrada + r.tokens_cache_escrita + r.tokens_cache_leitura)} / ${num(r.tokens_saida)}</td><td>${r.duracao_ms == null ? '—' : `${(r.duracao_ms / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} s`}</td><td>${r.estado === 'em_curso' ? `até ${usd(r.custo_reservado)}` : usd(r.custo)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="suave">Ainda não há pedidos registados.</p>';
  return `<h1>Monitorização</h1><p class="subtitulo">Pedidos de IA de ${ambito} · mês ${esc(resumo.mes)} (calendário de Lisboa).</p>
<section class="grelha-indicadores grelha-4" aria-label="Totais do mês">
${cartao('Pedidos', num(t.pedidos), 'conversa')}${cartao('Tokens de entrada', num(t.entrada), 'copias')}${cartao('Tokens de saída', num(t.saida), 'barras')}${cartao('Custo estimado', usd(t.custo), 'consumo')}
</section>
<p class="nota">${num(t.erros)} pedido(s) com erro ou interrompido(s) · duração média ${(Number(t.duracao) / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} s. Tokens de entrada incluem os lidos e escritos em cache. Pedidos em curso contam pelo valor máximo reservado. Origem: registo da FERCOPOR IA (D1), atualizado em cada pedido; custo estimado com os preços de ${esc(VERIFICADO_EM)}.</p>
${tabela('Por modelo', resumo.porModelo, 'Modelo', nomeModelo)}
${tabela('Por agente', resumo.porAgente, 'Agente', nomeAgente)}
${admin ? tabela('Por utilizador', resumo.porUtilizador, 'Utilizador', (x) => x) : ''}
<section class="cartao bloco"><h2>Pedidos recentes</h2>${rec}</section>`;
}

/* ---------- Configuração da IA (só ADM) ---------- */

const opcoes = (lista, atual) => lista.map(([v, n]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(n)}</option>`).join('');
const campoNum = (nome, rotulo, valor, { min = 0, max, passo = 1, ajuda = '' } = {}) => `<label class="campo"><span>${esc(rotulo)}</span><input type="number" name="${esc(nome)}" value="${esc(valor)}" min="${min}"${max != null ? ` max="${max}"` : ''} step="${passo}" inputmode="decimal">${ajuda ? `<small>${esc(ajuda)}</small>` : ''}</label>`;

export function conteudoAdminIA({ estado, mensagem = '', erro = false }) {
  const c = estado.config;
  const aviso = mensagem ? `<p class="entrada-aviso${erro ? ' erro' : ''}" role="${erro ? 'alert' : 'status'}">${esc(mensagem)}</p>` : '';
  const modelos = Object.entries(MODELOS).map(([id, m]) => [id, `${m.nome} (${id})`]);
  const esforcos = Object.entries(ESFORCOS);
  const funcoes = Object.entries(c.funcoes).map(([id, f]) => `<fieldset class="cartao bloco"><legend>${esc(FUNCOES[id].nome)}</legend><p class="suave">${esc(FUNCOES[id].descricao)}</p>
<div class="campos">
<label class="campo"><span>Modelo</span><select name="funcao.${id}.modelo">${opcoes(modelos, f.modelo)}</select></label>
<label class="campo"><span>Esforço</span><select name="funcao.${id}.esforco">${opcoes(esforcos, f.esforco)}</select></label>
${campoNum(`funcao.${id}.maxTokens`, 'Máximo de tokens por resposta', f.maxTokens, { min: 1024, max: 128000 })}
</div></fieldset>`).join('');
  const agentes = Object.entries(c.agentes).map(([id, a]) => `<fieldset class="cartao bloco"><legend>${esc(nomeAgente(id))}</legend>
<div class="campos">
<label class="campo campo-caixa"><input type="checkbox" name="agente.${id}.ativo" value="sim"${a.ativo ? ' checked' : ''}><span>Ativo</span></label>
<label class="campo"><span>Função de modelo</span><select name="agente.${id}.funcao">${opcoes(Object.entries(FUNCOES).map(([k, f]) => [k, f.nome]), a.funcao)}</select></label>
${campoNum(`agente.${id}.pedidosDia`, 'Pedidos por dia', a.limites.pedidosDia, { ajuda: '0 = sem limite' })}
${campoNum(`agente.${id}.custoDia`, 'Custo por dia (USD)', a.limites.custoDia, { passo: 0.01, ajuda: '0 = sem limite' })}
${campoNum(`agente.${id}.custoMes`, 'Custo por mês (USD)', a.limites.custoMes, { passo: 0.01, ajuda: '0 = sem limite' })}
</div>
<label class="campo campo-largo"><span>Instruções do agente</span><textarea name="agente.${id}.instrucoes" rows="3" maxlength="8000">${esc(a.instrucoes)}</textarea></label></fieldset>`).join('');
  const lu = c.limitesUtilizador;
  return `<h1>Configuração da IA</h1><p class="subtitulo">Modelos, instruções de sistema e limites de utilização. As alterações aplicam-se ao pedido seguinte, sem publicar código.</p>
${aviso}
<p class="nota">Motor de IA: <strong>${estado.motor ? 'configurado' : 'por configurar (secret ANTHROPIC_API_KEY)'}</strong> · Base de dados: <strong>${estado.baseDados ? 'ligada' : 'por configurar (IA_DB)'}</strong>${c.atualizadoEm ? ` · Última alteração: ${esc(dataHora(c.atualizadoEm))} por ${esc(c.atualizadoPor)}` : ''}</p>
<form method="post" action="/admin/ia" class="form-ia">
<h2 class="titulo-seccao">Modelo por função</h2>${funcoes}
<h2 class="titulo-seccao">Instruções de sistema</h2>
<section class="cartao bloco"><p class="suave">Identidade fixa (sempre incluída):</p><pre class="identidade">${esc(IDENTIDADE)}</pre>
<label class="campo campo-largo"><span>Instruções gerais (para todos os agentes)</span><textarea name="instrucoesGerais" rows="6" maxlength="12000">${esc(c.instrucoesGerais)}</textarea>
<small>Ex.: tom, formato das respostas, termos da FERCOPOR. Não coloque aqui dados pessoais nem credenciais.</small></label></section>
<h2 class="titulo-seccao">Agentes</h2>${agentes}
<h2 class="titulo-seccao">Limites por utilizador</h2>
<fieldset class="cartao bloco"><legend>Cada utilizador</legend><div class="campos">
${campoNum('utilizador.pedidosDia', 'Pedidos por dia', lu.pedidosDia, { ajuda: '0 = sem limite' })}
${campoNum('utilizador.custoDia', 'Custo por dia (USD)', lu.custoDia, { passo: 0.01, ajuda: '0 = sem limite' })}
${campoNum('utilizador.custoMes', 'Custo por mês (USD)', lu.custoMes, { passo: 0.01, ajuda: '0 = sem limite' })}
${campoNum('utilizador.emCurso', 'Pedidos em simultâneo', lu.emCurso, { min: 1, max: 10 })}
</div><p class="nota">Antes de cada pedido é reservado o custo máximo possível; o pedido só começa se couber em todos os limites (do utilizador e do agente).</p></fieldset>
<p><button type="submit" class="botao-principal">Guardar configuração</button></p>
</form>`;
}
