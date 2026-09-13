/* Identidade vem do Supabase; autorizacao vem de acesso.js.

   Verificacao assimetrica pelo JWKS, que e o que a documentacao do Supabase
   recomenda — HS256 eles desaconselham. O jose cacheia as chaves, entao nao
   ha ida ao Supabase por requisicao, e o painel continua de pe se o Supabase
   ficar fora do ar depois que as chaves ja foram buscadas. */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { perfilDe } from "./acesso.js";

const URL_SUPABASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
let jwks = null;

export const authConfigurada = () => Boolean(URL_SUPABASE);

function chaves() {
  if (!jwks) {
    if (!URL_SUPABASE) return null;
    jwks = createRemoteJWKSet(new URL(`${URL_SUPABASE}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

function tokenDe(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

export async function quemE(req) {
  const token = tokenDe(req);
  if (!token) return null;
  const ks = chaves();
  if (!ks) return null;
  try {
    const { payload } = await jwtVerify(token, ks, { issuer: `${URL_SUPABASE}/auth/v1` });
    const email = payload.email || payload.user_metadata?.email;
    if (!email) return null;
    return await perfilDe(email);
  } catch {
    return null;
  }
}

/* Falha fechada: sem SUPABASE_URL as rotas protegidas nao abrem. E o modo de
   falha certo — se a configuracao sumir, o painel para em vez de servir 221
   telefones de tutor para quem pedir. */
export function exigeDiretoria({ admin = false } = {}) {
  return async (req, res, next) => {
    if (!authConfigurada()) {
      return res.status(503).json({
        ok: false,
        error: "painel sem autenticacao configurada",
        detalhe: "defina SUPABASE_URL no servidor",
      });
    }
    const perfil = await quemE(req);
    if (!perfil) return res.status(401).json({ ok: false, error: "entre para ver o painel" });
    const semAcesso = perfil.paginas !== "todas" && (!perfil.paginas || !perfil.paginas.length);
    if (semAcesso) {
      return res.status(403).json({ ok: false, error: "sua conta ainda nao tem aba liberada" });
    }
    if (admin && !perfil.admin) {
      return res.status(403).json({ ok: false, error: "so a conta admin faz isso" });
    }
    req.perfil = perfil;
    next();
  };
}
