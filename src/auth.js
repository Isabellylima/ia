// Autenticação da FERCOPOR IA: login Microsoft do pacote @fercopor/login (o mesmo das outras apps FERCOPOR) e acessos do
// pacote @fercopor/acessos (acessos.js). Sem login configurado ninguém entra (nunca há modo aberto).
import { criarLogin, ErroHttp } from '@fercopor/login';
import { AC } from './acessos.js';

export { ErroHttp };
export const LOGIN = criarLogin({ app: 'ia' });
export const { assinar } = LOGIN;

// Diagnóstico da configuração (sem valores secretos)
export async function diagnostico(env) {
  return { ...LOGIN.diagnosticoLogin(env), kv: Boolean(env.IA_KV), administradoresFixos: String(env.ADMIN_EMAILS || '').split(/[,;\s]+/).filter(Boolean).length };
}

// Utilizador da sessão (ou erro 401/403/503). Modo local de demonstração só com DEMO_LOCAL=sim e sem login configurado.
export async function autenticar(request, env) {
  if (env.DEMO_LOCAL === 'sim' && !LOGIN.loginConfigurado(env)) return { email: 'demo@fercopor.pt', nome: 'Demonstração', demo: true, admin: true };
  if (!LOGIN.loginConfigurado(env)) throw new ErroHttp(503, 'Login Microsoft por configurar (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET).');
  const email = await LOGIN.emailDaSessao(request, env);
  const a = await AC.resolverAcesso(env, email);
  if (!a) throw new ErroHttp(403, 'Utilizador sem autorização. Peça acesso a um administrador da FERCOPOR IA.');
  return { email, admin: a.admin, perfil: a.perfil, perfilNome: a.perfilNome, cargo: a.cargo, cargoNome: a.cargoNome, perms: a.perms };
}
