// Fornecedores de IA da FERCOPOR IA. O resto da app só fala com esta interface; para acrescentar outro fornecedor
// (ex.: Workers AI ou um modelo privado, fase 07), criar um adaptador com os mesmos métodos e registá-lo aqui:
//
//   id, nome
//   configurado(env)                          a credencial existe (sem a revelar)
//   conversar(env, opcoes)                    gerador: { tipo: 'texto' | 'pensar' | 'fallback' | 'mensagem', … }
//   paraMensagens(guardadas)                  histórico guardado → mensagens no formato do fornecedor
//   mensagemUtilizador(texto, fontes)         mensagem nova do utilizador (com fontes de RAG)
//   texto(conteudo), chamadas(conteudo), temConteudo(conteudo), resultados(lista)
import { anthropic } from './anthropic.js';

export { ErroFornecedor } from './erros.js';

export const FORNECEDORES = { anthropic };

export function obterFornecedor(id) { return FORNECEDORES[id] || null; }
