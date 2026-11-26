// Base de conhecimento corporativa (RAG) — ponto de ligação preparado para a fase 02 · Corporate Knowledge.
// Nesta fase não há índice: devolve sempre uma lista vazia e o assistente responde só com o que sabe e com a conversa.
//
// Na fase 02 (proposta da página «Infraestrutura e Roadmap»): documentos em R2, fragmentos com embeddings em Vectorize
// (binding IA_VECTORIZE) e metadados de permissões em D1. Esta função passa a:
//   1. calcular o embedding da pergunta;
//   2. procurar os fragmentos mais próximos, filtrando pelo que o utilizador pode ver (nunca devolver documentos de
//      áreas a que não tem acesso);
//   3. devolver [{ titulo, origem, texto }], que o fornecedor inclui antes da pergunta (ver mensagemUtilizador).

/** @returns {Promise<Array<{ titulo: string, origem: string, texto: string }>>} */
export async function procurarConhecimento(env, { pergunta, agente, utilizador }) { // eslint-disable-line no-unused-vars
  if (!env.IA_VECTORIZE) return [];
  return []; // índice ainda por construir (fase 02)
}

// Passa a true quando o índice da fase 02 existir
export const conhecimentoAtivo = () => false;
