// Erro comum a todos os fornecedores de IA. codigo: configuracao | ocupado | pedido | ligacao | interrompido | outro.
// A mensagem é para o utilizador; «tecnico» fica só no registo do Worker.
export class ErroFornecedor extends Error {
  constructor(codigo, mensagem, { tecnico = '', faturavel = false } = {}) {
    super(mensagem);
    this.codigo = codigo;
    this.tecnico = tecnico;
    this.faturavel = faturavel;
  }
}
