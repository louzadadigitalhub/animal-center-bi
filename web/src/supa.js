/* Cliente do Supabase. A chave anon e publica por desenho — ela so identifica
   o projeto. Quem autoriza e o servidor, que confere o token pelo JWKS e
   cruza com as permissoes em data/perfis.json. */
import { createClient } from "@supabase/supabase-js";

const URL_SUPA = import.meta.env.VITE_SUPABASE_URL || "";
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supaConfigurado = Boolean(URL_SUPA && ANON);

export const supa = supaConfigurado
  ? createClient(URL_SUPA, ANON, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/* Toda chamada ao painel passa por aqui, para o token nunca ficar de fora
   por esquecimento. Sem token o servidor devolve 401 e a tela manda logar. */
export async function apiFetch(caminho, opcoes = {}) {
  const headers = { ...(opcoes.headers || {}) };
  if (supa) {
    const { data } = await supa.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (opcoes.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(caminho, { ...opcoes, headers });
}
