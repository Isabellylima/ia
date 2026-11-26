// Ferramentas (tool calling) da FERCOPOR IA, independentes do fornecedor. Nesta fase não há ferramentas registadas:
// o ciclo de chamadas já funciona e as integrações futuras (HubSpot, apps FERCOPOR) só precisam de se registar aqui.
//
// Definição de uma ferramenta:
//   nome        identificador (a-z, 0-9, _), ex.: 'hubspot_procurar_contacto'
//   descricao   o que faz e quando usar (o modelo decide com base nisto)
//   esquema     JSON Schema da entrada (type: 'object', properties, required, additionalProperties: false)
//   agentes     ids dos agentes que a podem usar (config.js → AGENTES_IA)
//   acao        ação do Padrão de Acessos que o utilizador tem de ter (opcional; o servidor confirma em cada chamada)
//   escrita     true se altera dados externos (fica desligada até haver confirmação do utilizador na interface)
//   executar    async (entrada, { env, utilizador, agente }) => string | objeto (o resultado volta ao modelo)
//
// Regras: as credenciais das integrações ficam em secrets do Worker; os resultados não devem incluir mais dados pessoais
// do que os necessários para a pergunta; nenhuma ferramenta de escrita corre sem confirmação explícita.

const REGISTO = new Map();

export function registarFerramenta(f) {
  if (!/^[a-z0-9_]{1,64}$/.test(f.nome)) throw new Error(`Nome de ferramenta inválido: ${f.nome}`);
  if (!f.esquema || f.esquema.type !== 'object') throw new Error(`Esquema inválido: ${f.nome}`);
  REGISTO.set(f.nome, f);
}
export function removerFerramenta(nome) { REGISTO.delete(nome); }

export function ferramentasDoAgente(idAgente, utilizador, pode) {
  return [...REGISTO.values()].filter((f) => !f.escrita && (f.agentes || []).includes(idAgente) && (!f.acao || pode(utilizador, f.acao)));
}

// Validação mínima de JSON Schema (tipos, obrigatórios, propriedades extra, enum). A entrada vem do modelo: é sempre
// validada antes de correr a ferramenta.
export function validarEntrada(esquema, v, caminho = 'entrada') {
  const tipo = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v;
  const ok = (t) => t === tipo || (t === 'number' && tipo === 'integer');
  if (esquema.type && !(Array.isArray(esquema.type) ? esquema.type.some(ok) : ok(esquema.type))) return `${caminho}: tipo ${tipo}, esperado ${esquema.type}`;
  if (esquema.enum && !esquema.enum.includes(v)) return `${caminho}: valor fora da lista`;
  if (tipo === 'string' && esquema.maxLength && v.length > esquema.maxLength) return `${caminho}: demasiado longo`;
  if (tipo === 'object') {
    const props = esquema.properties || {};
    for (const r of esquema.required || []) if (!(r in v)) return `${caminho}.${r}: obrigatório`;
    for (const [k, x] of Object.entries(v)) {
      if (!props[k]) { if (esquema.additionalProperties === false) return `${caminho}.${k}: não permitido`; continue; }
      const e = validarEntrada(props[k], x, `${caminho}.${k}`); if (e) return e;
    }
  }
  if (tipo === 'array' && esquema.items) for (let i = 0; i < v.length; i++) { const e = validarEntrada(esquema.items, v[i], `${caminho}[${i}]`); if (e) return e; }
  return null;
}

// Executa uma chamada do modelo. Nunca lança: devolve { id, conteudo, erro } para voltar ao modelo como resultado.
export async function executarChamada(chamada, disponiveis, ctx) {
  const f = disponiveis.find((x) => x.nome === chamada.nome) || disponiveis.find((x) => x.nome.toLowerCase() === String(chamada.nome).toLowerCase());
  if (!f) return { id: chamada.id, erro: true, conteudo: `Ferramenta desconhecida: ${chamada.nome}. Disponíveis: ${disponiveis.map((x) => x.nome).join(', ') || 'nenhuma'}.` };
  const invalida = validarEntrada(f.esquema, chamada.entrada);
  if (invalida) return { id: chamada.id, erro: true, conteudo: `Entrada inválida (${invalida}).` };
  if (f.acao && !ctx.pode(ctx.utilizador, f.acao)) return { id: chamada.id, erro: true, conteudo: 'O utilizador não tem acesso a esta ferramenta.' };
  try {
    const r = await f.executar(chamada.entrada, ctx);
    const conteudo = typeof r === 'string' ? r : JSON.stringify(r);
    return { id: chamada.id, erro: false, conteudo: conteudo.slice(0, 50_000) };
  } catch (e) {
    console.error(JSON.stringify({ evento: 'ferramenta_falhou', ferramenta: f.nome, erro: String(e && e.message).slice(0, 200) }));
    return { id: chamada.id, erro: true, conteudo: 'A ferramenta falhou. Diga ao utilizador que não foi possível obter esta informação.' };
  }
}
