/* Cliente do Supabase, criado a partir da configuracao que o servidor entrega
   em /api/config.

   Nao uso VITE_* de proposito: o Vite embute essas variaveis no momento do
   build, e o EasyPanel injeta ambiente em runtime — o build dentro do
   container nao as veria e o painel acharia que o Supabase nao existe.

   A chave publishable e publica por desenho: ela so identifica o projeto.
   Quem autoriza e o servidor, que confere o token pelo JWKS e cruza com as
   permissoes de data/perfis.json. */
import { createClient } from "@supabase/supabase-js";

let cliente = null;
let pronto = null;

export function iniciarSupa() {
  if (pronto) return pronto;
  pronto = fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
      if (c?.supabaseUrl && c?.supabaseKey) {
        cliente = createClient(c.supabaseUrl, c.supabaseKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
      }
      return cliente;
    })
    .catch(() => null);
  return pronto;
}

export const getSupa = () => cliente;

/* Toda chamada ao painel passa por aqui, para o token nunca ficar de fora
   por esquecimento. Sem token o servidor devolve 401 e a tela manda logar. */
export async function apiFetch(caminho, opcoes = {}) {
  const headers = { ...(opcoes.headers || {}) };
  const c = cliente || (await iniciarSupa());
  if (c) {
    const { data } = await c.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (opcoes.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(caminho, { ...opcoes, headers });
}
