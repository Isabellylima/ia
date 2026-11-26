// Configuração da FERCOPOR IA editável na área administrativa (/admin/ia), guardada na KV da app (IA_KV, chave
// «ia:config»). O que não estiver gravado usa os valores por omissão deste ficheiro. Nenhum segredo vive aqui.
import { MODELOS, FUNCOES, ESFORCOS } from './modelos.js';

export const CHAVE_CONFIG = 'ia:config';

// Identidade apresentada aos utilizadores. O motor (Claude, da Anthropic) é interno; se alguém perguntar diretamente
// pela tecnologia, a resposta é verdadeira.
export const IDENTIDADE = `És a FERCOPOR IA, o assistente interno da FERCOPOR, promotora imobiliária portuguesa.
Apresenta-te sempre como «FERCOPOR IA». Não precisas de mencionar o modelo nem o fornecedor; se alguém perguntar diretamente que tecnologia usas, podes dizer que a FERCOPOR IA usa modelos Claude, da Anthropic.
Responde em português de Portugal, de forma clara e direta. Se não souberes algo ou não tiveres acesso à informação, diz isso em vez de inventar.
Não tens acesso a sistemas internos (HubSpot, documentos, e-mail) a não ser pelas ferramentas que te forem dadas nesta conversa.`;

// Agentes: cada um usa uma função de modelo, as suas instruções e os seus limites. Só o assistente geral vem ativo.
export const AGENTES_IA = {
  assistente: { nome: 'Assistente FERCOPOR IA', funcao: 'principal', ativo: true, instrucoes: '' },
  comercial: { nome: 'Commercial Agent', funcao: 'principal', ativo: false, instrucoes: 'Apoias a equipa comercial: preparação de contactos, resumos e propostas.' },
  reunioes: { nome: 'Meeting Agent', funcao: 'operacional', ativo: false, instrucoes: 'Organizas notas e resumos de reuniões em decisões e próximos passos.' },
  qualidade: { nome: 'Data Quality Agent', funcao: 'operacional', ativo: false, instrucoes: 'Ajudas a rever a qualidade e a coerência de dados.' },
};

// Limites (0 = sem limite nesse indicador). Custo em USD (estimado com os preços do catálogo).
export const LIMITES_PADRAO = {
  utilizador: { pedidosDia: 100, custoDia: 2, custoMes: 20, emCurso: 2 },
  agente: { pedidosDia: 2000, custoDia: 30, custoMes: 300 },
};

export function configPadrao() {
  return {
    funcoes: Object.fromEntries(Object.entries(FUNCOES).map(([id, f]) => [id, { modelo: f.modelo, esforco: f.esforco, maxTokens: f.maxTokens }])),
    instrucoesGerais: '',
    agentes: Object.fromEntries(Object.entries(AGENTES_IA).map(([id, a]) => [id, { funcao: a.funcao, ativo: a.ativo, instrucoes: a.instrucoes, limites: { ...LIMITES_PADRAO.agente } }])),
    limitesUtilizador: { ...LIMITES_PADRAO.utilizador },
  };
}

// Valor em falta ou vazio = valor por omissão (nunca 0, que significa «sem limite»)
const vazio = (v) => v == null || String(v).trim() === '';
const inteiro = (v, min, max, padrao) => { if (vazio(v)) return padrao; const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : padrao; };
const decimal = (v, min, max, padrao) => { if (vazio(v)) return padrao; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : padrao; };
const texto = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').slice(0, max);

// Junta o que está gravado com os valores por omissão (descarta campos desconhecidos ou inválidos).
export function normalizar(g = {}) {
  const p = configPadrao();
  const funcoes = {};
  for (const [id, f] of Object.entries(p.funcoes)) {
    const x = (g.funcoes || {})[id] || {};
    const m = MODELOS[x.modelo] ? x.modelo : f.modelo;
    funcoes[id] = { modelo: m, esforco: ESFORCOS[x.esforco] ? x.esforco : f.esforco, maxTokens: inteiro(x.maxTokens, 1024, MODELOS[m].maxSaida, f.maxTokens) };
  }
  const agentes = {};
  for (const [id, a] of Object.entries(p.agentes)) {
    const x = (g.agentes || {})[id] || {};
    const l = x.limites || {};
    agentes[id] = {
      funcao: FUNCOES[x.funcao] ? x.funcao : a.funcao,
      ativo: typeof x.ativo === 'boolean' ? x.ativo : a.ativo,
      instrucoes: typeof x.instrucoes === 'string' ? texto(x.instrucoes, 8000) : a.instrucoes,
      limites: { pedidosDia: inteiro(l.pedidosDia, 0, 1e6, a.limites.pedidosDia), custoDia: decimal(l.custoDia, 0, 1e5, a.limites.custoDia), custoMes: decimal(l.custoMes, 0, 1e6, a.limites.custoMes) },
    };
  }
  const lu = g.limitesUtilizador || {};
  const pu = p.limitesUtilizador;
  return {
    funcoes,
    instrucoesGerais: typeof g.instrucoesGerais === 'string' ? texto(g.instrucoesGerais, 12000) : p.instrucoesGerais,
    agentes,
    limitesUtilizador: { pedidosDia: inteiro(lu.pedidosDia, 0, 1e5, pu.pedidosDia), custoDia: decimal(lu.custoDia, 0, 1e4, pu.custoDia), custoMes: decimal(lu.custoMes, 0, 1e5, pu.custoMes), emCurso: inteiro(lu.emCurso, 1, 10, pu.emCurso) },
    atualizadoEm: g.atualizadoEm || null, atualizadoPor: g.atualizadoPor || null,
  };
}

export async function lerConfig(env) {
  let g = null;
  try { g = env.IA_KV ? await env.IA_KV.get(CHAVE_CONFIG, 'json') : null; } catch (e) { console.error(JSON.stringify({ evento: 'config_ia_ilegivel', erro: String(e && e.message).slice(0, 200) })); }
  return normalizar(g || {});
}

// Formulário da área administrativa → configuração validada e gravada
export async function guardarConfig(env, por, fd) {
  const atual = await lerConfig(env);
  const g = { funcoes: {}, agentes: {}, limitesUtilizador: {} };
  for (const id of Object.keys(atual.funcoes)) g.funcoes[id] = { modelo: fd.get(`funcao.${id}.modelo`), esforco: fd.get(`funcao.${id}.esforco`), maxTokens: fd.get(`funcao.${id}.maxTokens`) };
  g.instrucoesGerais = fd.get('instrucoesGerais') ?? atual.instrucoesGerais;
  for (const id of Object.keys(atual.agentes)) {
    g.agentes[id] = {
      funcao: fd.get(`agente.${id}.funcao`), ativo: fd.get(`agente.${id}.ativo`) === 'sim', instrucoes: fd.get(`agente.${id}.instrucoes`) ?? '',
      limites: { pedidosDia: fd.get(`agente.${id}.pedidosDia`), custoDia: fd.get(`agente.${id}.custoDia`), custoMes: fd.get(`agente.${id}.custoMes`) },
    };
  }
  for (const k of ['pedidosDia', 'custoDia', 'custoMes', 'emCurso']) g.limitesUtilizador[k] = fd.get(`utilizador.${k}`);
  const nova = normalizar(g);
  if (!Object.values(nova.agentes).some((a) => a.ativo)) throw Object.assign(new Error('Tem de haver pelo menos um agente ativo.'), { status: 400 });
  nova.atualizadoEm = new Date().toISOString();
  nova.atualizadoPor = por;
  await env.IA_KV.put(CHAVE_CONFIG, JSON.stringify(nova));
  console.log(JSON.stringify({ evento: 'config_ia_alterada', por }));
  return nova;
}

// Instruções de sistema completas de um agente: identidade + instruções gerais + instruções do agente
export function instrucoesSistema(config, idAgente) {
  const a = config.agentes[idAgente];
  return [IDENTIDADE, config.instrucoesGerais.trim(), a && a.instrucoes.trim()].filter(Boolean).join('\n\n');
}
