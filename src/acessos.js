// Padrão de Acessos FERCOPOR na FERCOPOR IA: catálogo de ações (um por item do menu) e nível de origem. A lógica comum
// está no pacote @fercopor/acessos (igual em todas as apps). App nova: sem lista herdada; até a ADM gravar a lista,
// só entram os ADMIN_EMAILS. Regra de entrada por omissão: quem não está na lista não entra.
import { criarAcessos, ErroAcessos, ESTILO_ACESSOS, ocultarSemAcesso } from '@fercopor/acessos';
import { MENU } from './conteudo.js';

export const CATALOGO = [
  { id: 'pagina.inicio', modulo: 'Workspace', nome: 'Dashboard (Intelligence Overview)', nivel: 'pagina', fixa: true },
  ...MENU.flatMap((s) => s.itens.filter((i) => i.acao && i.acao !== 'pagina.inicio').map((i) => ({ id: i.acao, modulo: s.seccao, nome: i.nome, nivel: 'pagina' }))),
];
const TODAS = CATALOGO.map((c) => c.id);

export const AC = criarAcessos({
  app: 'FERCOPOR IA',
  kv: 'IA_KV',
  catalogo: CATALOGO,
  niveisOrigem: { equipa: 'Equipa' },
  padrao: { equipa: TODAS },
  perfilDesconhecido: 'equipa',
  ligacaoCentral: 'https://dashboard.fercopor.app/acessos',
  entradaPadrao: () => null,
});

// Ação de cada endereço (null: sem verificação — Dashboard, autenticação e administração, que é só da ADM)
const ACOES = Object.fromEntries(MENU.flatMap((s) => s.itens).filter((i) => i.acao && i.href !== '/').map((i) => [i.href, i.acao]));
export function acaoDoPedido(caminho) {
  for (const [p, a] of Object.entries(ACOES)) if (caminho === p || caminho.startsWith(p + '/')) return a;
  return null;
}
export const pode = AC.pode;
export const ocultar = (html, u) => ocultarSemAcesso(html, u, acaoDoPedido);
export { ErroAcessos, ESTILO_ACESSOS };
