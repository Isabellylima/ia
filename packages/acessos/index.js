// Padrão de Acessos FERCOPOR (2026-11-13), o mesmo das apps Comercial e Experience: utilizadores, níveis de acesso,
// ações, cargos e regra de entrada, geridos só pela ADM. Cada página/botão é uma «ação»; o servidor verifica-a em todos
// os pedidos. Pacote @fercopor/acessos: o mesmo código em todas as apps; o que muda por app (catálogo e níveis de
// origem) está no acessos.js de cada app. Com Hono, ver ./hono.js (middleware de ações e rotas de administração).
// Guardado na KV da app: «utilizadores» (lista) e «acessos:config» (níveis, bases, diferenças da matriz, cargos, entrada).

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const listaEmails = (t) => String(t || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+$/.test(x));
const escPadrao = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Valores do registo: «Sim»/«Não» para verdadeiro/falso (registos antigos da Comercial) e «—» quando vazio
const valorRegisto = (v) => (v === true ? 'Sim' : v === false ? 'Não' : (v == null || v === '' ? '—' : String(v)));
const limpo = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (p, nome) => `${p}-${normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'x'}`;
const CHAVE_LISTA = 'utilizadores', CHAVE_DEF = 'acessos:definicao';

export class ErroAcessos extends Error { constructor(m) { super(m); this.status = 400; } }

/* opcoes:
   app           nome da app nas mensagens (ex.: «Marketing»)
   kv            nome do binding da KV própria (ex.: 'MARKETING_KV')
   catalogo      [{ id, modulo, nome, nivel: 'pagina'|'seccao'|'acao', fixa? }]
   niveisOrigem  { id: 'Nome' } — os níveis que já existiam antes do padrão
   padrao        { id: [ações] } — o que cada nível de origem tinha
   herdar        async (env) => lista | null — lista inicial enquanto a app não tem lista própria
   avisoHerdada  texto mostrado enquanto a lista é herdada
   entradaPadrao (env) => { modo, nivel } | null — regra de entrada enquanto a ADM não grava outra
   esc           função de escape de HTML da app
   perfilDesconhecido  nível dado a quem tem na lista um nível que já não existe (nem de origem nem criado pela ADM)
   ligacaoCentral      endereço da página central de acessos (mostrado nas páginas de administração da app)
   chaves              { config, registo }: nomes das chaves na KV (por omissão «acessos:config» e «acessos:registo»;
                       a Comercial usa «permissoes:perfis» e «permissoes:registo», do tempo anterior ao pacote)
   semNivelSemAcesso   true → quem não tem nível válido não tem nenhuma ação (nem o Início), como na Comercial */
export function criarAcessos(o) {
  const esc = o.esc || escPadrao;
  const CHAVE = (o.chaves && o.chaves.config) || 'acessos:config';
  const CHAVE_REG = (o.chaves && o.chaves.registo) || 'acessos:registo';
  const CATALOGO = o.catalogo;
  const IDS = new Set(CATALOGO.map((c) => c.id));
  const TODAS = CATALOGO.map((c) => c.id);
  const FIXAS = CATALOGO.filter((c) => c.fixa).map((c) => c.id);
  const NIVEIS_ORIGEM = o.niveisOrigem || {};
  const PADRAO = o.padrao || {};
  const BASES = { padrao: 'Regras de origem', tudo: 'Acesso a tudo', nada: FIXAS.length ? 'Sem acesso (só o Início)' : 'Sem acesso' };
  const kv = (env) => env[o.kv];

  const niveisPers = (c) => (Array.isArray(c && c.niveis) ? c.niveis.filter((n) => n && /^n-[a-z0-9-]{1,40}$/.test(n.id) && n.nome) : []);
  const cargosDe = (c) => (Array.isArray(c && c.cargos) ? c.cargos.filter((x) => x && /^c-[a-z0-9-]{1,40}$/.test(x.id) && x.nome) : []);
  const nomeNivel = (c, id) => NIVEIS_ORIGEM[id] || (niveisPers(c).find((n) => n.id === id) || {}).nome || '';
  const eNivel = (c, id) => Boolean(NIVEIS_ORIGEM[id] || niveisPers(c).some((n) => n.id === id));
  const todosNiveis = (c) => [...Object.keys(NIVEIS_ORIGEM), ...niveisPers(c).map((n) => n.id)];
  function baseDe(c, id) {
    const p = niveisPers(c).find((n) => n.id === id);
    if (p) return p.base === 'tudo' ? 'tudo' : 'nada';
    const b = ((c && c.bases) || {})[id];
    return BASES[b] ? b : 'padrao';
  }
  function base(c, id) {
    const b = baseDe(c, id);
    if (b === 'tudo') return new Set(TODAS);
    if (b === 'nada') return new Set(FIXAS);
    return new Set([...(PADRAO[id] || []), ...FIXAS]);
  }
  function permissoes(c, id) {
    if (!eNivel(c, id)) return new Set(o.semNivelSemAcesso ? [] : FIXAS);
    const s = base(c, id);
    for (const [a, v] of Object.entries(((c && c.perfis) || {})[id] || {})) {
      const d = CATALOGO.find((x) => x.id === a);
      if (!d || d.fixa) continue;
      if (v === true) s.add(a); else if (v === false) s.delete(a);
    }
    return s;
  }
  function entradaDe(c, env) {
    const e = c && c.entrada;
    if (e && e.modo === 'nivel' && eNivel(c, e.nivel)) return { modo: 'nivel', nivel: e.nivel };
    if (e && e.modo === 'lista') return { modo: 'lista' };
    const p = env && o.entradaPadrao ? o.entradaPadrao(env) : null;
    return p && p.modo === 'nivel' && eNivel(c, p.nivel) ? { modo: 'nivel', nivel: p.nivel } : { modo: 'lista' };
  }

  async function lerConfig(env) {
    const c = kv(env) ? await kv(env).get(CHAVE, 'json').catch(() => null) : null;
    return c && typeof c === 'object' ? { perfis: {}, ...c } : { perfis: {} };
  }
  // Formato antigo (perfil «administrador») passa a nível de origem + marca de administração
  const normalizarLista = (l) => (Array.isArray(l) ? l : []).filter((u) => u && typeof u.email === 'string').map((u) => {
    const admin = Boolean(u.admin) || u.perfil === 'administrador';
    let perfil = u.perfil === 'administrador' ? (o.nivelDoAdminAntigo || '') : String(u.perfil || '');
    if (o.converterPerfil) perfil = o.converterPerfil(perfil);
    else if (o.perfilDesconhecido && !NIVEIS_ORIGEM[perfil] && !/^n-/.test(perfil)) perfil = o.perfilDesconhecido;
    return { email: u.email.trim().toLowerCase(), perfil, admin, ...(u.cargo ? { cargo: u.cargo } : {}) };
  });
  let cache = null;
  async function lerUtilizadores(env) {
    if (cache && cache.ate > Date.now() && cache.env === env[o.kv]) return cache.v;
    const propria = kv(env) ? await kv(env).get(CHAVE_LISTA, 'json').catch(() => null) : null;
    let v;
    if (Array.isArray(propria)) v = { lista: normalizarLista(propria), herdada: false };
    else v = { lista: normalizarLista(o.herdar ? await o.herdar(env).catch(() => null) : null), herdada: Boolean(o.herdar) };
    cache = { ate: Date.now() + 15e3, env: env[o.kv], v };
    return v;
  }
  const limparCache = () => { cache = null; };

  // { admin, perfil, perfilNome, cargo, perms } ou null (sem acesso)
  async function resolverAcesso(env, email) {
    const e = String(email || '').toLowerCase();
    const dominio = String(env.ALLOWED_DOMAIN || 'fercopor.pt').toLowerCase();
    if (!e.endsWith('@' + dominio)) return null;
    const [config, { lista }] = await Promise.all([lerConfig(env), lerUtilizadores(env)]);
    let registo = lista.find((u) => u.email === e) || null;
    const admin = listaEmails(env.ADMIN_EMAILS).includes(e) || Boolean(registo && registo.admin);
    const entrada = entradaDe(config, env);
    if (!registo && !admin && entrada.modo === 'nivel') registo = { email: e, perfil: entrada.nivel, porEntrada: true };
    if (!registo && !admin) return null;
    const perfil = registo && eNivel(config, registo.perfil) ? registo.perfil : '';
    const perms = admin ? new Set(TODAS) : permissoes(config, perfil);
    return { admin, perfil, perfilNome: admin ? 'Administrador' : nomeNivel(config, perfil) || 'Sem nível', cargo: (registo && registo.cargo) || '', cargoNome: (cargosDe(config).find((c) => c.id === (registo && registo.cargo)) || {}).nome || '', perms: [...perms], porEntrada: Boolean(registo && registo.porEntrada) };
  }
  const pode = (u, acao) => Boolean(u && (u.admin || u.demo || (u.perms || []).includes(acao)));

  async function registar(env, por, alteracoes) {
    if (!alteracoes.length || !kv(env)) return;
    const quando = new Date().toISOString();
    const antes = (await kv(env).get(CHAVE_REG, 'json').catch(() => null)) || [];
    await kv(env).put(CHAVE_REG, JSON.stringify([...alteracoes.map((a) => ({ quando, por, ...a })).reverse(), ...antes].slice(0, 200)));
  }
  const lerRegisto = async (env) => (kv(env) ? (await kv(env).get(CHAVE_REG, 'json').catch(() => null)) || [] : []);

  async function guardarUtilizadores(env, por, fd) {
    if (!kv(env)) throw new ErroAcessos(`Armazenamento ${o.kv} em falta.`);
    const config = await lerConfig(env);
    const { lista: antes } = await lerUtilizadores(env);
    const dominio = String(env.ALLOWED_DOMAIN || 'fercopor.pt').toLowerCase();
    const emails = fd.getAll('email').map((e) => String(e).trim().toLowerCase());
    const lista = [];
    emails.forEach((email, i) => {
      if (fd.get(`remover_${i}`) === 'sim' || !email) return;
      if (!/^[^\s@]+@[^\s@]+$/.test(email) || !email.endsWith('@' + dominio)) throw new ErroAcessos(`E-mail fora da organização: ${email}`);
      if (lista.some((u) => u.email === email)) return;
      const perfil = String(fd.get(`perfil_${i}`) || '');
      const cargo = String(fd.get(`cargo_${i}`) || '');
      if (perfil && !eNivel(config, perfil)) throw new ErroAcessos(`Nível de acesso inválido para ${email}.`);
      if (cargo && !cargosDe(config).some((c) => c.id === cargo)) throw new ErroAcessos(`Cargo inválido para ${email}.`);
      lista.push({ email, perfil, admin: fd.get(`admin_${i}`) === 'sim', ...(cargo ? { cargo } : {}) });
    });
    const novo = limpo(fd.get('novo_email'), 120).toLowerCase();
    if (novo) {
      if (!/^[^\s@]+@[^\s@]+$/.test(novo) || !novo.endsWith('@' + dominio)) throw new ErroAcessos(`E-mail fora da organização: ${novo}`);
      const nivelNovo = String(fd.get('novo_perfil') || '');
      if (nivelNovo && !eNivel(config, nivelNovo)) throw new ErroAcessos('Nível de acesso inválido para o novo e-mail.');
      if (!lista.some((u) => u.email === novo)) lista.push({ email: novo, perfil: nivelNovo, admin: false });
    }
    const eu = String(por).toLowerCase();
    const fixos = listaEmails(env.ADMIN_EMAILS);
    const euAntes = antes.find((u) => u.email === eu);
    if (euAntes && euAntes.admin && !fixos.includes(eu) && !(lista.find((u) => u.email === eu) || {}).admin) throw new ErroAcessos('Não pode retirar a sua própria administração.');
    await kv(env).put(CHAVE_LISTA, JSON.stringify(lista));
    limparCache();
    const n = (p) => nomeNivel(config, p) || 'Sem nível';
    const cg = (c) => (cargosDe(config).find((x) => x.id === c) || {}).nome || 'Sem cargo';
    const alt = [];
    for (const d of lista) {
      const a = antes.find((x) => x.email === d.email);
      if (!a) { alt.push({ tipo: 'utilizadores.acrescentar', alvo: d.email, antes: '', depois: n(d.perfil) }); continue; }
      if ((a.perfil || '') !== d.perfil) alt.push({ tipo: 'utilizadores.perfil', alvo: d.email, antes: n(a.perfil), depois: n(d.perfil) });
      if (Boolean(a.admin) !== d.admin) alt.push({ tipo: 'utilizadores.admin', alvo: d.email, antes: a.admin ? 'Administrador' : 'Não', depois: d.admin ? 'Administrador' : 'Não' });
      if ((a.cargo || '') !== (d.cargo || '')) alt.push({ tipo: 'utilizadores.cargo', alvo: d.email, antes: cg(a.cargo), depois: cg(d.cargo) });
    }
    for (const a of antes) if (!lista.some((d) => d.email === a.email)) alt.push({ tipo: 'utilizadores.retirar', alvo: a.email, antes: n(a.perfil), depois: '' });
    await registar(env, por, alt);
    return alt.length;
  }

  async function guardarAcessos(env, por, fd) {
    if (!kv(env)) throw new ErroAcessos(`Armazenamento ${o.kv} em falta.`);
    const atual = await lerConfig(env);
    const { lista: utilizadores } = await lerUtilizadores(env);
    const nova = { ...atual, perfis: { ...(atual.perfis || {}) }, bases: { ...(atual.bases || {}) } };
    const alt = [];
    const niveis = [];
    for (const n of niveisPers(atual)) {
      if (fd.get(`nivel_apagar_${n.id}`) === 'sim') {
        if (utilizadores.some((u) => u.perfil === n.id)) throw new ErroAcessos(`O nível «${n.nome}» tem utilizadores: atribua-lhes outro nível antes de o apagar.`);
        if (entradaDe(atual, env).nivel === n.id) throw new ErroAcessos(`O nível «${n.nome}» é o da regra de entrada.`);
        delete nova.perfis[n.id]; alt.push({ tipo: 'niveis.apagar', alvo: n.nome, antes: '', depois: '' }); continue;
      }
      const nome = limpo(fd.get(`nivel_nome_${n.id}`), 60) || n.nome;
      const b = fd.get(`nivel_base_${n.id}`) === 'tudo' ? 'tudo' : (fd.has(`nivel_base_${n.id}`) ? 'nada' : n.base);
      if (nome !== n.nome) alt.push({ tipo: 'niveis.nome', alvo: n.nome, antes: n.nome, depois: nome });
      if (b !== n.base) { alt.push({ tipo: 'niveis.base', alvo: nome, antes: BASES[n.base] || '', depois: BASES[b] }); delete nova.perfis[n.id]; }
      niveis.push({ id: n.id, nome, base: b });
    }
    const novoNome = limpo(fd.get('novo_nivel'), 60);
    if (novoNome) {
      if ([...Object.values(NIVEIS_ORIGEM), ...niveis.map((x) => x.nome)].some((x) => normalizar(x) === normalizar(novoNome))) throw new ErroAcessos(`Já existe um nível chamado «${novoNome}».`);
      let id = slug('n', novoNome); let k = 2; const id0 = id;
      while (niveis.some((x) => x.id === id)) id = `${id0}-${k++}`;
      const b = fd.get('novo_nivel_base') === 'tudo' ? 'tudo' : 'nada';
      niveis.push({ id, nome: novoNome, base: b });
      alt.push({ tipo: 'niveis.criar', alvo: novoNome, antes: '', depois: BASES[b] });
    }
    nova.niveis = niveis;
    for (const id of Object.keys(NIVEIS_ORIGEM)) {
      const b = String(fd.get(`base_${id}`) || '');
      if (!BASES[b] || b === baseDe(atual, id)) continue;
      alt.push({ tipo: 'niveis.base', alvo: NIVEIS_ORIGEM[id], antes: BASES[baseDe(atual, id)], depois: BASES[b] });
      if (b === 'padrao') delete nova.bases[id]; else nova.bases[id] = b;
      delete nova.perfis[id];
    }
    for (const id of todosNiveis(nova)) {
      if (!fd.has(`matriz_${id}`) || baseDe(nova, id) !== baseDe(atual, id) || !eNivel(atual, id)) continue;
      const pedidas = new Set(fd.getAll(`acao_${id}`).filter((a) => IDS.has(a)));
      const antes = permissoes(atual, id), b = base(nova, id);
      const dif = {};
      for (const d of CATALOGO) {
        if (d.fixa) continue;
        const quer = pedidas.has(d.id);
        if (quer !== b.has(d.id)) dif[d.id] = quer;
        if (quer !== antes.has(d.id)) alt.push({ tipo: 'acoes.alterar', alvo: `${nomeNivel(nova, id)} · ${d.nome}`, antes: antes.has(d.id) ? 'Sim' : 'Não', depois: quer ? 'Sim' : 'Não' });
      }
      if (Object.keys(dif).length) nova.perfis[id] = dif; else delete nova.perfis[id];
    }
    const cargos = [];
    for (const c of cargosDe(atual)) {
      if (fd.get(`cargo_apagar_${c.id}`) === 'sim') {
        if (utilizadores.some((u) => u.cargo === c.id)) throw new ErroAcessos(`O cargo «${c.nome}» está atribuído: retire-o primeiro.`);
        alt.push({ tipo: 'cargos.apagar', alvo: c.nome, antes: '', depois: '' }); continue;
      }
      const nome = limpo(fd.get(`cargo_nome_${c.id}`), 80) || c.nome;
      if (nome !== c.nome) alt.push({ tipo: 'cargos.nome', alvo: c.nome, antes: c.nome, depois: nome });
      cargos.push({ id: c.id, nome });
    }
    const novoCargo = limpo(fd.get('novo_cargo'), 80);
    if (novoCargo) {
      if (cargos.some((x) => normalizar(x.nome) === normalizar(novoCargo))) throw new ErroAcessos(`Cargo repetido: «${novoCargo}».`);
      let id = slug('c', novoCargo); let k = 2; const id0 = id;
      while (cargos.some((x) => x.id === id)) id = `${id0}-${k++}`;
      cargos.push({ id, nome: novoCargo }); alt.push({ tipo: 'cargos.criar', alvo: novoCargo, antes: '', depois: novoCargo });
    }
    nova.cargos = cargos;
    if (fd.has('entrada')) {
      const e = fd.get('entrada') === 'nivel' ? { modo: 'nivel', nivel: String(fd.get('entrada_nivel') || '') } : { modo: 'lista' };
      if (e.modo === 'nivel' && !eNivel(nova, e.nivel)) throw new ErroAcessos('Escolha um nível válido para a regra de entrada.');
      const txt = (x, c) => (x.modo === 'nivel' ? `Entra com «${nomeNivel(c, x.nivel)}»` : 'Sem acesso (só a lista)');
      const antesE = entradaDe(atual, env);
      if (txt(antesE, atual) !== txt(e, nova)) alt.push({ tipo: 'entrada.alterar', alvo: 'Quem não está na lista', antes: txt(antesE, atual), depois: txt(e, nova) });
      if (txt(antesE, atual) !== txt(e, nova) || atual.entrada) nova.entrada = e;
    }
    if (!alt.length) return 0;
    nova.atualizado = new Date().toISOString(); nova.por = por;
    await kv(env).put(CHAVE, JSON.stringify(nova));
    limparCache();
    await registar(env, por, alt);
    return alt.length;
  }

  /* ---------- Páginas (só ADM) ---------- */
  const opcoes = (lista, valor) => lista.map(([v, t]) => `<option value="${esc(v)}"${v === valor ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const msg = (mensagem, erro) => (mensagem ? `<p class="acessos-mensagem${erro ? ' erro' : ''}" role="${erro ? 'alert' : 'status'}">${esc(mensagem)}</p>` : '');
  const nomeTipo = { pagina: 'Página', seccao: 'Secção', acao: 'Ação' };

  function paginaUtilizadores({ lista, herdada, config, env, eu, mensagem = '', erro = false, base = '/admin' }) {
    const niveis = todosNiveis(config).map((id) => [id, nomeNivel(config, id)]);
    const cargos = cargosDe(config).map((c) => [c.id, c.nome]);
    const entrada = entradaDe(config, env);
    const fixos = listaEmails(env.ADMIN_EMAILS);
    const efetivas = (u) => {
      if (u.admin || fixos.includes(u.email)) return 'Tudo (administração)';
      const p = permissoes(config, u.perfil);
      return `${CATALOGO.filter((c) => p.has(c.id)).length} de ${CATALOGO.length}`;
    };
    return `<div class="acessos">
<h1>Utilizadores</h1>
<p class="subtitulo">O <strong>nível de acesso</strong> define o que a pessoa vê e faz (ações em <a href="${base}/acessos">Níveis de Acesso e Ações</a>). O <strong>cargo</strong> é só informativo. A <strong>administração</strong> dá acesso a tudo. Sem nível, a pessoa entra mas não vê nada${FIXAS.length ? ' além do Início' : ''}.</p>
<p class="subtitulo">Quem não está na lista: <strong>${entrada.modo === 'nivel' ? `entra com o nível «${esc(nomeNivel(config, entrada.nivel))}»` : 'não entra (sem acesso)'}</strong>.</p>
${msg(mensagem, erro)}
${herdada ? `<p class="acessos-mensagem" role="status">${esc(o.avisoHerdada || 'Esta lista ainda não foi gravada nesta app.')} Ao guardar, passa a ser a lista própria da app ${esc(o.app)}.</p>` : ''}
${fixos.length ? `<p class="subtitulo">Administradores fixos no Cloudflare (ADMIN_EMAILS): ${fixos.map(esc).join(', ')}.</p>` : ''}
<form method="post" action="${base}/utilizadores" class="acessos-form">
<div class="acessos-tabela"><table>
<thead><tr><th scope="col">E-mail</th><th scope="col">Nível de acesso</th><th scope="col">Cargo</th><th scope="col">Administrador</th><th scope="col">Ações</th><th scope="col">Retirar</th></tr></thead>
<tbody>${lista.map((u, i) => `<tr><th scope="row">${esc(u.email)}<input type="hidden" name="email" value="${esc(u.email)}"></th>
<td><select name="perfil_${i}" aria-label="Nível de acesso de ${esc(u.email)}"><option value="">Sem nível (sem acesso)</option>${opcoes(niveis, u.perfil)}</select></td>
<td><select name="cargo_${i}" aria-label="Cargo de ${esc(u.email)}"><option value="">Sem cargo</option>${opcoes(cargos, u.cargo || '')}</select></td>
<td><input type="checkbox" name="admin_${i}" value="sim" aria-label="Administrador ${esc(u.email)}"${u.admin ? ' checked' : ''}>${fixos.includes(u.email) ? ' <small>Fixo no Cloudflare</small>' : ''}</td>
<td>${esc(efetivas(u))}</td>
<td>${u.email === String(eu).toLowerCase() ? '' : `<input type="checkbox" name="remover_${i}" value="sim" aria-label="Retirar ${esc(u.email)}">`}</td></tr>`).join('') || '<tr><td colspan="6">Lista vazia.</td></tr>'}</tbody></table></div>
<div class="acessos-linha"><label>Acrescentar e-mail<input name="novo_email" type="email" placeholder="nome@fercopor.pt" autocomplete="off"></label>
<label>Nível<select name="novo_perfil"><option value="">Sem nível</option>${opcoes(niveis, '')}</select></label></div>
<button type="submit" class="botao">Guardar utilizadores</button>
</form></div>`;
  }

  function paginaAcessos({ config, utilizadores, registo, env, mensagem = '', erro = false, base = '/admin' }) {
    const niveis = todosNiveis(config);
    const usam = (id) => utilizadores.filter((u) => u.perfil === id).length;
    const opBase = (v, origem) => Object.entries(BASES).filter(([k]) => origem || k !== 'padrao').map(([k, t]) => `<option value="${k}"${v === k ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const entrada = entradaDe(config, env);
    const modulos = [...new Set(CATALOGO.map((c) => c.modulo))];
    return `<div class="acessos">
<h1>Níveis de Acesso e Ações</h1>
<p class="subtitulo">Cada página, secção e botão é uma <strong>ação</strong>. O servidor aplica-as em todos os pedidos: o que não estiver autorizado não aparece e também não abre pelo endereço. A administração tem sempre tudo.</p>
${msg(mensagem, erro)}
<form method="post" action="${base}/acessos" class="acessos-form">
<section class="acessos-bloco"><h2>Níveis de acesso</h2>
<p class="subtitulo">Cada nível começa com as regras de origem, com acesso a tudo ou sem acesso, e ajusta-se ação a ação. Mudar a base recomeça as ações desse nível.</p>
<div class="acessos-tabela"><table><thead><tr><th scope="col">Nível</th><th scope="col">Começa com</th><th scope="col">Utilizadores</th><th scope="col">Apagar</th></tr></thead><tbody>
${Object.keys(NIVEIS_ORIGEM).map((id) => `<tr><th scope="row">${esc(NIVEIS_ORIGEM[id])}<br><small>Nível de origem</small></th><td><select name="base_${id}" aria-label="Começa com">${opBase(baseDe(config, id), true)}</select></td><td>${usam(id)}</td><td></td></tr>`).join('')}
${niveisPers(config).map((n) => `<tr><th scope="row"><input name="nivel_nome_${n.id}" value="${esc(n.nome)}" maxlength="60" aria-label="Nome do nível"><br><small>Criado pela ADM</small></th>
<td><select name="nivel_base_${n.id}" aria-label="Começa com">${opBase(n.base, false)}</select></td><td>${usam(n.id)}</td>
<td>${usam(n.id) ? '' : `<input type="checkbox" name="nivel_apagar_${n.id}" value="sim" aria-label="Apagar ${esc(n.nome)}">`}</td></tr>`).join('')}
</tbody></table></div>
<div class="acessos-linha"><label>Novo nível de acesso<input name="novo_nivel" maxlength="60" placeholder="Ex.: Consulta"></label>
<label>Começa com<select name="novo_nivel_base">${opBase('nada', false)}</select></label></div>
<h3>Quem entra sem estar na lista</h3>
<label class="acessos-opcao"><input type="radio" name="entrada" value="lista"${entrada.modo !== 'nivel' ? ' checked' : ''}> <span>Sem acesso: só entra quem estiver na lista (recomendado)</span></label>
<label class="acessos-opcao"><input type="radio" name="entrada" value="nivel"${entrada.modo === 'nivel' ? ' checked' : ''}> <span>Qualquer conta @fercopor.pt entra com o nível</span>
<select name="entrada_nivel" aria-label="Nível para quem não está na lista">${opcoes(niveis.map((id) => [id, nomeNivel(config, id)]), entrada.nivel || '')}</select></label>
<p class="subtitulo">A regra de entrada nunca dá administração.</p>
<h3>Cargos</h3><p class="subtitulo">Só informativos: não dão acessos.</p>
${cargosDe(config).map((c) => `<div class="acessos-linha"><input name="cargo_nome_${c.id}" value="${esc(c.nome)}" maxlength="80" aria-label="Nome do cargo"> ${utilizadores.some((u) => u.cargo === c.id) ? '<small>atribuído</small>' : `<label class="acessos-opcao"><input type="checkbox" name="cargo_apagar_${c.id}" value="sim"> apagar</label>`}</div>`).join('')}
<div class="acessos-linha"><label>Novo cargo<input name="novo_cargo" maxlength="80" placeholder="Ex.: Coordenadora"></label></div>
</section>
<section class="acessos-bloco"><h2>Ações por nível de acesso</h2>
<div class="acessos-tabela"><table class="acessos-matriz"><thead><tr><th scope="col">Ação</th><th scope="col">Tipo</th>${niveis.map((id) => `<th scope="col">${esc(nomeNivel(config, id))}<input type="hidden" name="matriz_${id}" value="1"></th>`).join('')}</tr></thead><tbody>
${modulos.map((m) => `<tr class="acessos-modulo"><th colspan="${niveis.length + 2}" scope="colgroup">${esc(m)}</th></tr>${CATALOGO.filter((c) => c.modulo === m).map((c) => `<tr><th scope="row">${esc(c.nome)}<br><small><code>${esc(c.id)}</code></small></th><td>${esc(nomeTipo[c.nivel] || '')}</td>${niveis.map((id) => {
      const p = permissoes(config, id);
      return `<td><input type="checkbox" name="acao_${id}" value="${c.id}" aria-label="${esc(c.nome)}: ${esc(nomeNivel(config, id))}"${p.has(c.id) ? ' checked' : ''}${c.fixa ? ' disabled' : ''}></td>`;
    }).join('')}</tr>`).join('')}`).join('')}
</tbody></table></div></section>
<button type="submit" class="botao">Guardar níveis, ações e cargos</button>
</form>
<section class="acessos-bloco"><h2>Últimas alterações</h2>${registo.length ? `<div class="acessos-tabela"><table><thead><tr><th scope="col">Quando</th><th scope="col">Por</th><th scope="col">O quê</th><th scope="col">Antes → depois</th></tr></thead><tbody>
${registo.slice(0, 50).map((r) => `<tr><td>${esc(new Date(r.quando).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }))}</td><td>${esc(r.por)}</td><td>${esc(r.alvo || [r.perfilNome, r.permissaoNome].filter(Boolean).join(' · '))}</td><td>${esc(valorRegisto(r.antes))} → ${esc(valorRegisto(r.depois))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="subtitulo">Ainda não há alterações.</p>'}</section>
</div>`;
  }

  // Tratamento das duas rotas /admin/utilizadores e /admin/acessos (GET mostra, POST grava). Devolve { titulo, html, status }
  async function rotaAdmin(env, utilizador, caminho, request, { base = '/admin' } = {}) {
    let mensagem = '', erro = false, status = 200;
    if (request.method === 'POST') {
      try {
        const fd = await request.formData();
        const n = caminho === '/admin/utilizadores' ? await guardarUtilizadores(env, utilizador.email, fd) : await guardarAcessos(env, utilizador.email, fd);
        mensagem = n ? `Guardado: ${n} ${n === 1 ? 'alteração' : 'alterações'}.` : 'Sem alterações.';
      } catch (e) {
        if (!(e instanceof ErroAcessos)) throw e;
        mensagem = e.message; erro = true; status = 400;
      }
    }
    const [config, u] = await Promise.all([lerConfig(env), lerUtilizadores(env)]);
    const central = o.ligacaoCentral && base === '/admin' ? `<p class="acessos-mensagem" role="note">Os acessos de todas as apps FERCOPOR também se gerem num só sítio: <a href="${esc(o.ligacaoCentral)}">página central de acessos</a>.</p>` : '';
    if (caminho === '/admin/utilizadores') return { titulo: 'Utilizadores', status, html: central + paginaUtilizadores({ ...u, config, env, eu: utilizador.email, mensagem, erro, base }) };
    return { titulo: 'Níveis de Acesso e Ações', status, html: central + paginaAcessos({ config, utilizadores: u.lista, registo: await lerRegisto(env), env, mensagem, erro, base }) };
  }

  /* ---------- Página central: a app publica a sua definição na própria KV ----------
     «acessos:definicao» guarda o que a página central precisa para mostrar e gravar os acessos desta app como ela os
     usa: catálogo, níveis de origem, regras de origem, regra de entrada por omissão, administradores fixos e, enquanto
     não há lista própria, a lista herdada. A app continua a ler e a verificar tudo sozinha (a central só grava as mesmas
     chaves da mesma KV). Escreve-se só quando muda; verificado no máximo a cada 10 minutos por instância. */
  let publicada = { em: 0, json: '' };
  async function definicao(env) {
    const propria = kv(env) ? await kv(env).get(CHAVE_LISTA, 'json').catch(() => null) : null;
    const herdada = !Array.isArray(propria) && o.herdar ? normalizarLista(await o.herdar(env).catch(() => null)) : null;
    const entrada = o.entradaPadrao ? o.entradaPadrao(env) : null;
    return {
      versao: 1, app: o.app, catalogo: CATALOGO, niveisOrigem: NIVEIS_ORIGEM, padrao: PADRAO, avisoHerdada: o.avisoHerdada || '',
      nivelDoAdminAntigo: o.nivelDoAdminAntigo || '', perfilDesconhecido: o.perfilDesconhecido || '',
      entradaPadrao: entrada && entrada.modo === 'nivel' ? { modo: 'nivel', nivel: entrada.nivel } : null,
      adminsFixos: listaEmails(env.ADMIN_EMAILS), dominio: String(env.ALLOWED_DOMAIN || 'fercopor.pt').toLowerCase(), listaHerdada: herdada,
      chaves: { config: CHAVE, registo: CHAVE_REG }, semNivelSemAcesso: Boolean(o.semNivelSemAcesso),
    };
  }
  async function publicarDefinicao(env, { forcar = false } = {}) {
    if (!kv(env)) return false;
    if (!forcar && Date.now() - publicada.em < 10 * 60e3) return false;
    const d = await definicao(env);
    const json = JSON.stringify(d);
    publicada = { em: Date.now(), json };
    const antes = await kv(env).get(CHAVE_DEF).catch(() => null);
    if (antes === json) return false;
    await kv(env).put(CHAVE_DEF, json);
    return true;
  }
  const esquecerPublicacao = () => { publicada = { em: 0, json: '' }; };

  return { CATALOGO, NIVEIS_ORIGEM, BASES, ErroAcessos, cargosDe, nomeNivel, eNivel, todosNiveis, baseDe, permissoes, entradaDe, lerConfig, lerUtilizadores, limparCache, resolverAcesso, pode, guardarUtilizadores, guardarAcessos, lerRegisto, paginaUtilizadores, paginaAcessos, rotaAdmin, definicao, publicarDefinicao, esquecerPublicacao };
}

/* Página central: os acessos de uma app a partir da definição que ela publicou na sua KV. Devolve a mesma interface de
   criarAcessos (páginas, gravação, resolverAcesso) e ambiente(kvDaApp) — o «env» com que se chamam as funções. */
export function acessosDaDefinicao(def, { esc } = {}) {
  const lista = Array.isArray(def.listaHerdada) ? def.listaHerdada : null;
  const AC = criarAcessos({
    app: def.app, kv: '__KV_DA_APP', catalogo: def.catalogo, niveisOrigem: def.niveisOrigem, padrao: def.padrao,
    avisoHerdada: def.avisoHerdada, nivelDoAdminAntigo: def.nivelDoAdminAntigo || undefined, perfilDesconhecido: def.perfilDesconhecido || undefined,
    entradaPadrao: () => def.entradaPadrao || null, herdar: lista ? async () => lista : undefined, esc,
    chaves: def.chaves, semNivelSemAcesso: Boolean(def.semNivelSemAcesso),
  });
  const ambiente = (kvDaApp) => ({ __KV_DA_APP: kvDaApp, ADMIN_EMAILS: (def.adminsFixos || []).join(','), ALLOWED_DOMAIN: def.dominio || 'fercopor.pt' });
  return { ...AC, ambiente };
}

// Esconde do HTML as ligações e formulários para endereços que o utilizador não pode usar (o servidor recusa-os de
// qualquer forma). acaoDoPedido(caminho, metodo) → id da ação ou null (sem verificação).
export function ocultarSemAcesso(html, u, acaoDoPedido) {
  if (!u || u.admin || u.demo) return html;
  const perms = new Set(u.perms || []);
  const permitido = (alvo, metodo) => {
    if (!alvo || !alvo.startsWith('/') || alvo.startsWith('//')) return true;
    const acao = acaoDoPedido(alvo.split(/[?#]/)[0], metodo);
    return !acao || perms.has(acao);
  };
  return String(html)
    .replace(/<form\b([^>]*)>[\s\S]*?<\/form>/gi, (todo, attrs) => {
      const alvo = (attrs.match(/\baction="([^"]*)"/i) || [])[1];
      const metodo = /\bmethod="post"/i.test(attrs) ? 'POST' : 'GET';
      return permitido(alvo, metodo) ? todo : '';
    })
    .replace(/<a\b([^>]*)>[\s\S]*?<\/a>/gi, (todo, attrs) => (permitido((attrs.match(/\bhref="([^"]*)"/i) || [])[1], 'GET') ? todo : ''));
}

// Estilos das duas páginas (iguais em todas as apps; usam as cores do design system quando existem)
export const ESTILO_ACESSOS = `.acessos h1{margin-bottom:.25rem}.acessos .subtitulo{color:var(--texto-suave,#5f5f5f);max-width:70ch}
.acessos-form{display:grid;gap:1.25rem;margin-top:1rem}.acessos-bloco{border:1px solid var(--linha,#e2e2e2);border-radius:12px;padding:1rem 1.25rem;background:var(--fundo-cartao,#fff);margin-top:1rem}
.acessos-bloco h2{margin-top:0}.acessos-tabela{overflow-x:auto}.acessos-tabela table{border-collapse:collapse;width:100%;min-width:560px}
.acessos-tabela th,.acessos-tabela td{border-bottom:1px solid var(--linha,#e2e2e2);padding:.5rem .6rem;text-align:left;vertical-align:middle}
.acessos-matriz td{text-align:center}.acessos-modulo th{background:var(--fundo-suave,#f4f4f2);font-weight:600}
.acessos-linha{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end;margin:.6rem 0}.acessos-linha label{display:grid;gap:.25rem;font-size:.9rem}
.acessos-opcao{display:flex;gap:.5rem;align-items:center;margin:.35rem 0;flex-wrap:wrap}.acessos select,.acessos input[type=text],.acessos input[type=email],.acessos input:not([type]){padding:.4rem .5rem;border:1px solid var(--linha,#cfcfcf);border-radius:8px;font:inherit;max-width:100%}
.acessos-mensagem{padding:.6rem .8rem;border-radius:8px;background:#eef6ee;border:1px solid #bcd9bc}.acessos-mensagem.erro{background:#fbeeee;border-color:#e3b5b5}
.acessos code{font-size:.78rem;color:var(--texto-suave,#6a6a6a)}`;
