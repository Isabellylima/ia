// FERCOPOR IA — Assistente: envia a pergunta à API da própria app e mostra a resposta à medida que chega (streaming).
// Sem dependências. O texto da IA é inserido só como texto (textContent): nada vindo da resposta é interpretado como HTML.
(() => {
  'use strict';
  const raiz = document.querySelector('[data-chat]');
  if (!raiz) return;
  const form = raiz.querySelector('[data-formulario]');
  const lista = raiz.querySelector('[data-mensagens]');
  const estado = raiz.querySelector('[data-estado]');
  const erro = raiz.querySelector('[data-erro]');
  const caixa = form.querySelector('textarea');
  const botao = form.querySelector('[data-enviar]');
  const campoConversa = form.querySelector('input[name="conversa"]');
  const campoAgente = form.querySelector('[name="agente"]');
  const USD = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

  /* ---------- Markdown simples e seguro (só elementos criados aqui; links só http/https) ---------- */
  function inline(pai, texto) {
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
    let i = 0; let m;
    while ((m = re.exec(texto))) {
      if (m.index > i) pai.append(texto.slice(i, m.index));
      const t = m[0];
      let el;
      if (t.startsWith('**')) { el = document.createElement('strong'); el.textContent = t.slice(2, -2); }
      else if (t.startsWith('`')) { el = document.createElement('code'); el.textContent = t.slice(1, -1); }
      else if (t.startsWith('[')) {
        const k = t.indexOf('](');
        el = document.createElement('a'); el.textContent = t.slice(1, k); el.href = t.slice(k + 2, -1); el.rel = 'noopener noreferrer'; el.target = '_blank';
      } else { el = document.createElement('em'); el.textContent = t.slice(1, -1); }
      pai.append(el); i = m.index + t.length;
    }
    if (i < texto.length) pai.append(texto.slice(i));
  }
  function renderizar(alvo, md) {
    const frag = document.createDocumentFragment();
    const linhas = String(md).replace(/\r\n/g, '\n').split('\n');
    let p = null; let listaAtual = null; let codigo = null;
    const fechar = () => { p = null; listaAtual = null; };
    for (const linha of linhas) {
      if (codigo) { if (/^```/.test(linha)) { codigo = null; } else { codigo.textContent += (codigo.textContent ? '\n' : '') + linha; } continue; }
      if (/^```/.test(linha)) { fechar(); const pre = document.createElement('pre'); codigo = document.createElement('code'); pre.append(codigo); frag.append(pre); continue; }
      const h = /^(#{1,4})\s+(.*)$/.exec(linha);
      if (h) { fechar(); const el = document.createElement(h[1].length <= 2 ? 'h3' : 'h4'); inline(el, h[2]); frag.append(el); continue; }
      const li = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(linha);
      if (li) {
        const tipo = li[1] ? 'OL' : 'UL';
        if (!listaAtual || listaAtual.tagName !== tipo) { p = null; listaAtual = document.createElement(tipo.toLowerCase()); frag.append(listaAtual); }
        const item = document.createElement('li'); inline(item, li[2]); listaAtual.append(item); continue;
      }
      if (!linha.trim()) { fechar(); continue; }
      listaAtual = null;
      if (!p) { p = document.createElement('p'); frag.append(p); } else p.append(document.createElement('br'));
      inline(p, linha);
    }
    alvo.replaceChildren(frag);
  }
  raiz.querySelectorAll('[data-md]').forEach((el) => renderizar(el, el.textContent));

  /* ---------- Mensagens ---------- */
  function bolha(papel, texto) {
    const li = document.createElement('li');
    li.className = `msg msg-${papel === 'user' ? 'utilizador' : 'ia'}`;
    const quem = document.createElement('p'); quem.className = 'msg-quem'; quem.textContent = papel === 'user' ? 'Você' : 'FERCOPOR IA';
    const corpo = document.createElement('div'); corpo.className = 'msg-texto';
    if (papel === 'user') renderizar(corpo, texto); else { corpo.textContent = texto; corpo.classList.add('msg-espera'); }
    li.append(quem, corpo);
    const vazio = lista.querySelector('.mensagens-vazio'); if (vazio) vazio.remove();
    lista.append(li);
    return { li, corpo };
  }
  function nota(li, classe, texto) { const p = document.createElement('p'); p.className = classe; p.textContent = texto; li.append(p); }
  function mostrarErro(m) { erro.textContent = m; erro.hidden = false; }
  const descer = () => { const fim = lista.lastElementChild; if (fim) fim.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };

  /* ---------- Leitura do streaming (Server-Sent Events) ---------- */
  async function* eventos(resposta) {
    const leitor = resposta.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, k); buf = buf.slice(k + 2);
        let tipo = 'message'; let dados = '';
        for (const l of bloco.split('\n')) { if (l.startsWith('event: ')) tipo = l.slice(7); else if (l.startsWith('data: ')) dados += l.slice(6); }
        try { yield { tipo, dados: JSON.parse(dados || '{}') }; } catch { /* evento ilegível: ignorar */ }
      }
    }
  }

  let ocupado = false;
  async function enviar(texto) {
    if (ocupado || !texto) return;
    ocupado = true; botao.disabled = true; erro.hidden = true;
    caixa.value = '';
    bolha('user', texto);
    const { li, corpo } = bolha('assistant', 'A FERCOPOR IA está a responder…');
    li.setAttribute('aria-busy', 'true');
    estado.textContent = 'A FERCOPOR IA está a responder.';
    descer();
    let acumulado = ''; let agendado = false; let terminou = false;
    const desenhar = () => { agendado = false; corpo.classList.remove('msg-espera'); renderizar(corpo, acumulado); };
    try {
      const r = await fetch('/api/assistente/mensagem', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ conversa: campoConversa.value || null, agente: campoAgente ? campoAgente.value : 'assistente', texto }),
      });
      if (!r.ok || !(r.headers.get('Content-Type') || '').startsWith('text/event-stream')) {
        let m = 'Não foi possível enviar a pergunta.';
        try { const j = await r.json(); if (j && j.erro) m = j.erro; } catch { /* resposta sem JSON */ }
        if (r.status === 401 || r.status === 403) m = 'A sessão terminou ou não tem acesso. Atualize a página.';
        li.remove(); lista.lastElementChild && lista.lastElementChild.remove();
        caixa.value = texto; mostrarErro(m); estado.textContent = m;
        return;
      }
      for await (const ev of eventos(r)) {
        const d = ev.dados;
        if (ev.tipo === 'inicio') {
          campoConversa.value = d.conversa;
          if (campoAgente && campoAgente.tagName === 'SELECT') campoAgente.disabled = true;
          if (d.nova) history.replaceState(null, '', `/assistente?c=${encodeURIComponent(d.conversa)}`);
        } else if (ev.tipo === 'estado' && !acumulado) {
          corpo.textContent = d.estado === 'a consultar ferramentas' ? 'A consultar informação…' : 'A pensar…';
        } else if (ev.tipo === 'texto') {
          acumulado += d.texto;
          if (!agendado) { agendado = true; requestAnimationFrame(desenhar); }
        } else if (ev.tipo === 'aviso') {
          nota(li, 'msg-aviso', d.mensagem);
        } else if (ev.tipo === 'erro') {
          mostrarErro(d.mensagem);
        } else if (ev.tipo === 'fim') {
          terminou = true;
          desenhar();
          if (!acumulado) corpo.textContent = d.estado === 'erro' ? 'Sem resposta.' : '';
          const partes = [d.nomeModelo, `${(d.tokensEntrada + d.tokensSaida).toLocaleString('pt-PT')} tokens`, `custo estimado ${USD.format(d.custo || 0)}`];
          nota(li, 'msg-meta', partes.join(' · '));
        }
      }
      if (!terminou) mostrarErro('A ligação terminou antes do fim da resposta. A resposta pode estar incompleta; veja a conversa em «Conversas».');
    } catch {
      mostrarErro('Falhou a ligação. Verifique a rede e tente novamente.');
    } finally {
      li.removeAttribute('aria-busy');
      estado.textContent = terminou ? 'Resposta concluída.' : estado.textContent;
      ocupado = false; botao.disabled = false; caixa.focus();
      descer();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(caixa.value.trim()); });
  caixa.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });

  // Pergunta vinda do Dashboard (?q=): envia uma vez e limpa o endereço
  const q = new URLSearchParams(location.search).get('q');
  if (q && !campoConversa.value && caixa.value.trim()) { history.replaceState(null, '', '/assistente'); enviar(caixa.value.trim()); }
  else { caixa.focus(); descer(); }
})();
