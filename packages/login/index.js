// @ts-check
// @fercopor/login — login Microsoft (Entra ID, OpenID Connect com PKCE) comum às apps FERCOPOR.
// Sessão num cookie assinado (HMAC), só @fercopor.pt (ALLOWED_DOMAIN), credenciais SÓ das variáveis MICROSOFT_* do
// painel. Sem login configurado ninguém entra (nunca há modo aberto). Nunca regista ou mostra o segredo, o código,
// o verificador nem tokens. Quem pode entrar e o quê decide @fercopor/acessos; este pacote só confirma a conta.

/** Erro com código HTTP (401 sem sessão, 403 sem autorização, 503 por configurar…). */
export class ErroHttp extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) { super(message); this.status = status; }
}

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMBITOS = 'openid profile email';

/**
 * @typedef {Record<string, any>} Env
 * @param {{ app: string, cookie?: string, sal?: string, ambitos?: string, segredoProprio?: boolean, clientIdGuid?: boolean,
 *   verificarDominio?: boolean, horasPadrao?: number, sairMicrosoft?: boolean, mensagemPorConfigurar?: string }} opcoes
 *   app: nome do Worker (ex.: 'experience', 'pos-venda'): mensagens de ajuda e, por omissão, o nome dos cookies.
 *   cookie: nome curto dos cookies __Host-<cookie>_sessao/_oauth, quando difere do Worker (ex.: 'posvenda').
 *   sal: derivação do SESSION_SECRET a partir do client secret quando não é definido (mudar invalida as sessões).
 *   segredoProprio: true → SESSION_SECRET (≥ 32) obrigatório no painel; nunca derivado do client secret.
 *   clientIdGuid: true → o MICROSOFT_CLIENT_ID tem de ter o formato GUID para o login contar como configurado.
 *   verificarDominio: false → não exige @ALLOWED_DOMAIN no e-mail (o tenant já é verificado no id_token; quem decide o
 *     acesso é o Padrão de Acessos). Por omissão true.
 *   horasPadrao: duração da sessão sem SESSAO_HORAS (1 a 24; por omissão 12).
 *   sairMicrosoft: true → «sair» apaga também os dados do site (Clear-Site-Data), volta a /?saiu=1 e, com
 *     { microsoft: true }, termina a sessão Microsoft neste navegador.
 *   mensagemPorConfigurar: texto mostrado enquanto o login não está configurado.
 */
export function criarLogin({ app, cookie: prefixo = app, sal = `fercopor-${app}/sessao/v1`, ambitos = AMBITOS, segredoProprio = false, clientIdGuid = false,
  verificarDominio = true, horasPadrao = 12, sairMicrosoft = false,
  mensagemPorConfigurar = 'Login Microsoft por configurar (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET).' }) {
  const COOKIE_SESSAO = `__Host-${prefixo}_sessao`;
  const COOKIE_OAUTH = `__Host-${prefixo}_oauth`;

  const DICAS = {
    AADSTS7000215: `O segredo (MICROSOFT_CLIENT_SECRET) não é válido para esta aplicação: confirme que é o «Value» (não o «Secret ID») de um segredo da MESMA aplicação Entra, ainda válido, e volte a guardá-lo no Worker «${app}».`,
    AADSTS7000222: 'O segredo da aplicação expirou: crie um novo segredo no Entra ID e atualize MICROSOFT_CLIENT_SECRET.',
    AADSTS700016: 'O MICROSOFT_CLIENT_ID não corresponde a uma aplicação deste diretório.',
    AADSTS50011: 'O endereço de retorno desta app ainda não está registado no Entra ID.',
    AADSTS90002: 'O MICROSOFT_TENANT_ID não foi encontrado.',
    AADSTS50105: 'A sua conta não está atribuída a esta aplicação no Entra ID. Peça acesso ao administrador.',
    AADSTS50020: 'Esta conta não pertence ao diretório da FERCOPOR.',
  };

  /** Credenciais normalizadas (ENTRA_* antigas ignoradas), APP_URL e SESSION_SECRET. @param {Env} env @param {Request} request */
  async function configurar(env, request) {
    const e = { ...env };
    const segredoBruto = String(env.MICROSOFT_CLIENT_SECRET || '');
    e.ENTRA_TENANT_ID = String(env.MICROSOFT_TENANT_ID || '').trim();
    e.ENTRA_CLIENT_ID = String(env.MICROSOFT_CLIENT_ID || '').trim();
    e.ENTRA_CLIENT_SECRET = segredoBruto.trim();
    // Diagnóstico sem expor o segredo (só formato e comprimento)
    e._diag = {
      variaveisEntraIgnoradas: ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET'].filter((k) => env[k]),
      segredoPresente: Boolean(e.ENTRA_CLIENT_SECRET),
      segredoComprimento: e.ENTRA_CLIENT_SECRET.length,
      segredoTinhaEspacos: segredoBruto !== segredoBruto.trim(),
      segredoComAspas: /^["'].*["']$/.test(e.ENTRA_CLIENT_SECRET),
      segredoPareceSecretId: GUID.test(e.ENTRA_CLIENT_SECRET),
      sessaoSecretValido: String(env.SESSION_SECRET || '').length >= 32,
    };
    if (!e.APP_URL) e.APP_URL = new URL(request.url).origin;
    if (!segredoProprio && !e.SESSION_SECRET && e.ENTRA_CLIENT_SECRET) {
      const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(e.ENTRA_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derivado = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(sal));
      e.SESSION_SECRET = [...new Uint8Array(derivado)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return e;
  }

  /** @param {Env} env */
  const loginConfigurado = (env) => Boolean(GUID.test(env.ENTRA_TENANT_ID) && (clientIdGuid ? GUID.test(env.ENTRA_CLIENT_ID) : env.ENTRA_CLIENT_ID) && env.ENTRA_CLIENT_SECRET && String(env.SESSION_SECRET || '').length >= 32);
  /** @param {Env} env */
  const retorno = (env) => String(env.APP_URL).replace(/\/$/, '') + '/auth/retorno';
  /** @param {Env} env */
  const dominio = (env) => String(env.ALLOWED_DOMAIN || 'fercopor.pt').toLowerCase();

  /** Parte do diagnóstico que é do login (sem valores secretos). @param {Env} env */
  const diagnosticoLogin = (env) => ({
    tenantId: env.ENTRA_TENANT_ID || null,
    tenantIdEGuid: GUID.test(env.ENTRA_TENANT_ID),
    clientId: env.ENTRA_CLIENT_ID || null,
    redirectUri: retorno(env),
    ...(env._diag || {}),
    loginConfigurado: loginConfigurado(env),
  });

  /**
   * Sessão confirmada: login configurado (503), sessão válida (401) e, com verificarDominio, conta da organização (403).
   * @param {Request} request @param {Env} env @returns {Promise<{ email: string, nome: string }>}
   */
  async function sessaoDoPedido(request, env) {
    if (!loginConfigurado(env)) throw new ErroHttp(503, mensagemPorConfigurar);
    const sessao = await lerAssinado(request, env, COOKIE_SESSAO);
    if (!sessao) throw new ErroHttp(401, 'Sessão em falta.');
    const email = String(sessao.e || '').toLowerCase();
    if (verificarDominio && !email.endsWith('@' + dominio(env))) throw new ErroHttp(403, 'Conta fora da organização.');
    return { email, nome: String(sessao.n || '') };
  }
  /** E-mail da sessão (ver sessaoDoPedido). @param {Request} request @param {Env} env */
  const emailDaSessao = async (request, env) => (await sessaoDoPedido(request, env)).email;

  /** @param {Request} request @param {Env} env */
  async function iniciarLogin(request, env) {
    if (!loginConfigurado(env)) throw new ErroHttp(503, mensagemPorConfigurar);
    const volta = destinoSeguro(new URL(request.url).searchParams.get('volta'));
    const estado = aleatorio(24);
    const nonce = aleatorio(24);
    const verificador = aleatorio(48);
    const desafio = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))));
    const temporario = await assinar(env, { s: estado, n: nonce, v: verificador, volta, exp: agora() + 600 });
    const url = new URL(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: env.ENTRA_CLIENT_ID, response_type: 'code', redirect_uri: retorno(env), response_mode: 'query', scope: ambitos,
      state: estado, nonce, code_challenge: desafio, code_challenge_method: 'S256', prompt: 'select_account',
    }).toString();
    return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': cookie(COOKIE_OAUTH, temporario, 600), 'Cache-Control': 'no-store' } });
  }

  /** Devolve { cabecalhos } com a sessão, ou { erro } para mostrar na página de entrada. @param {Request} request @param {Env} env @returns {Promise<{ cabecalhos: Headers } | { erro: string }>} */
  async function concluirLogin(request, env) {
    if (!loginConfigurado(env)) return { erro: mensagemPorConfigurar };
    const url = new URL(request.url);
    const temporario = await lerAssinado(request, env, COOKIE_OAUTH);
    if (url.searchParams.get('error')) {
      const aadMs = (String(url.searchParams.get('error_description') || '').match(/AADSTS\d+/) || [])[0];
      const dica = aadMs && /** @type {Record<string,string>} */ (DICAS)[aadMs];
      return { erro: `O início de sessão foi cancelado ou recusado pela Microsoft.${dica ? ` ${dica}` : ''}` };
    }
    const codigo = url.searchParams.get('code');
    if (!temporario || !codigo || url.searchParams.get('state') !== temporario.s) return { erro: 'O pedido de início de sessão expirou ou não é válido. Tente novamente.' };
    // Erros de configuração detetáveis antes de contactar a Microsoft (sem mostrar o segredo)
    const d = env._diag || {};
    if (d.segredoPareceSecretId) return { erro: 'MICROSOFT_CLIENT_SECRET contém o «Secret ID» (formato GUID) em vez do «Value» do segredo. Em Entra ID › Certificates & secrets, copie a coluna «Value».' };
    if (d.segredoComAspas) return { erro: 'MICROSOFT_CLIENT_SECRET foi guardado com aspas à volta. Guarde só o valor, sem aspas.' };
    const r = await fetch(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.ENTRA_CLIENT_ID, client_secret: env.ENTRA_CLIENT_SECRET, grant_type: 'authorization_code', code: codigo, redirect_uri: retorno(env), code_verifier: temporario.v, scope: ambitos }).toString(),
    });
    if (!r.ok) {
      /** @type {any} */
      let e = {};
      try { e = await r.json(); } catch { /* sem JSON */ }
      const aad = (String(e.error_description || '').match(/AADSTS\d+/) || [])[0] || e.error || `HTTP ${r.status}`;
      // Só campos de diagnóstico (nunca o código, tokens ou o segredo)
      console.error(JSON.stringify({
        evento: 'login_falhou', http: r.status, codigo: aad, trace_id: e.trace_id || '', correlation_id: e.correlation_id || '', redirect_uri: retorno(env),
        segredo_comprimento: d.segredoComprimento, segredo_tinha_espacos: d.segredoTinhaEspacos, variaveis_entra_ignoradas: d.variaveisEntraIgnoradas,
      }));
      return { erro: `A Microsoft não confirmou o início de sessão (${aad}${e.trace_id ? ` · rastreio ${String(e.trace_id).slice(0, 8)}` : ''}). ${/** @type {Record<string,string>} */ (DICAS)[aad] || 'Verifique o registo da aplicação no Entra ID.'}` };
    }
    let dados;
    try { dados = await verificarIdToken((await r.json()).id_token, env, temporario.n); } catch (e) { return { erro: /** @type {Error} */ (e).message }; }
    const email = String(dados.email || dados.preferred_username || '').toLowerCase();
    if (!email) return { erro: 'A conta Microsoft não indicou um e-mail.' };
    if (verificarDominio && !email.endsWith('@' + dominio(env))) return { erro: 'Esta conta não pertence à organização FERCOPOR.' };
    const horas = Math.min(Math.max(Number(env.SESSAO_HORAS) || horasPadrao, 1), 24);
    const cabecalhos = new Headers({ Location: temporario.volta || '/', 'Cache-Control': 'no-store' });
    cabecalhos.append('Set-Cookie', cookie(COOKIE_SESSAO, await assinar(env, { e: email, n: String(dados.name || '').slice(0, 80), exp: agora() + horas * 3600 }), horas * 3600));
    cabecalhos.append('Set-Cookie', cookie(COOKIE_OAUTH, '', 0));
    console.log(JSON.stringify({ evento: 'login_ok', app }));   // sem e-mail nos registos
    return { cabecalhos };
  }

  /** Sair: apaga a sessão. Com sairMicrosoft, também os dados do site e, com { microsoft: true }, a sessão Microsoft. @param {Env} [env] @param {{ microsoft?: boolean }} [o] */
  function terminarSessao(env = {}, { microsoft = false } = {}) {
    if (!sairMicrosoft) {
      const h = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
      h.append('Set-Cookie', cookie(COOKIE_SESSAO, '', 0));
      return h;
    }
    const destino = microsoft && GUID.test(env.ENTRA_TENANT_ID)
      ? `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(String(env.APP_URL).replace(/\/$/, '') + '/')}`
      : '/?saiu=1';
    const h = new Headers({ Location: destino, 'Cache-Control': 'no-store', 'Clear-Site-Data': '"cookies"' });
    h.append('Set-Cookie', cookie(COOKIE_SESSAO, '', 0));
    h.append('Set-Cookie', cookie(COOKIE_OAUTH, '', 0));
    return h;
  }

  /**
   * Validação completa do id_token: assinatura RS256 (chaves do tenant), issuer, audience, tenant, nonce e validade
   * (margem de 60 s para relógios). @param {string} token @param {Env} env @param {string} nonce @param {{ chaves?: any[] }} [o]
   */
  async function verificarIdToken(token, env, nonce, { chaves } = {}) {
    const tenant = env.ENTRA_TENANT_ID.toLowerCase();
    const partes = String(token || '').split('.');
    if (partes.length !== 3) throw new ErroHttp(401, 'Resposta da Microsoft inválida.');
    const cab = JSON.parse(texto64(partes[0]));
    const dados = JSON.parse(texto64(partes[1]));
    const lista = chaves || (await (await fetch(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`)).json()).keys || [];
    const jwk = lista.find((/** @type {any} */ k) => k.kid === cab.kid);
    if (cab.alg !== 'RS256' || !jwk) throw new ErroHttp(401, 'Resposta da Microsoft inválida (chave).');
    const chave = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, bytes64(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`))) throw new ErroHttp(401, 'Resposta da Microsoft inválida (assinatura).');
    if (dados.iss !== `https://login.microsoftonline.com/${tenant}/v2.0`) throw new ErroHttp(401, 'Sessão Microsoft de outro emissor.');
    if (dados.aud !== env.ENTRA_CLIENT_ID) throw new ErroHttp(401, 'Sessão Microsoft para outra aplicação.');
    if (String(dados.tid || '').toLowerCase() !== tenant) throw new ErroHttp(401, 'Esta conta não pertence ao diretório da FERCOPOR.');
    if (dados.nonce !== nonce) throw new ErroHttp(401, 'Sessão Microsoft inválida (nonce).');
    const t = agora();
    if (!dados.exp || dados.exp < t - 60 || (dados.nbf && dados.nbf > t + 60)) throw new ErroHttp(401, 'Sessão Microsoft expirada.');
    return dados;
  }

  /** @param {Env} env */
  const chaveHmac = (env) => crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  /** @param {Env} env @param {unknown} dados */
  async function assinar(env, dados) {
    const corpo = base64Url(new TextEncoder().encode(JSON.stringify(dados)));
    const a = await crypto.subtle.sign('HMAC', await chaveHmac(env), new TextEncoder().encode(corpo));
    return `${corpo}.${base64Url(new Uint8Array(a))}`;
  }
  /** @param {Request} request @param {Env} env @param {string} nome @returns {Promise<any>} */
  async function lerAssinado(request, env, nome) {
    const valor = ((request.headers.get('Cookie') || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(nome + '=')) || '').slice(nome.length + 1);
    const [corpo, assinatura] = valor.split('.');
    if (!corpo || !assinatura) return null;
    try {
      if (!await crypto.subtle.verify('HMAC', await chaveHmac(env), bytes64(assinatura), new TextEncoder().encode(corpo))) return null;
      const d = JSON.parse(texto64(corpo));
      return d.exp && d.exp > agora() ? d : null;
    } catch { return null; }
  }

  return { configurar, loginConfigurado, diagnosticoLogin, sessaoDoPedido, emailDaSessao, iniciarLogin, concluirLogin, terminarSessao, verificarIdToken, assinar, retorno, NOME_COOKIE_SESSAO: COOKIE_SESSAO, NOME_COOKIE_OAUTH: COOKIE_OAUTH };
}

/** @param {string | null} v */
const destinoSeguro = (v) => (typeof v === 'string' && /^\/[^/\\]/.test(v) && v.length < 200 ? v : '/');
const agora = () => Math.floor(Date.now() / 1000);
/** @param {string} nome @param {string} valor @param {number} s */
const cookie = (nome, valor, s) => `${nome}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${s}`;
/** @param {number} n */
const aleatorio = (n) => base64Url(crypto.getRandomValues(new Uint8Array(n)));
/** @param {Uint8Array} bytes */
export function base64Url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
/** @param {string} t */
function bytes64(t) { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }
/** @param {string} t */
const texto64 = (t) => new TextDecoder().decode(bytes64(t));
