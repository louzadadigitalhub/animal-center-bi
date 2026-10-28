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

/* O e-mail que vale e so o do topo do token, que o Supabase preenche com o
   da conta. user_metadata a propria pessoa edita pelo navegador
   (updateUser), entao quem pusesse ali o e-mail da diretoria entraria como
   ela. Conta anonima nao tem dono e fica de fora; se o token disser que o
   e-mail nao foi confirmado, tambem. */
export function emailDoToken(payload) {
  if (!payload || payload.is_anonymous === true) return "";
  if ("email_confirmed_at" in payload && !payload.email_confirmed_at) return "";
  if (payload.email_verified === false) return "";
  return typeof payload.email === "string" ? payload.email.trim() : "";
}

export async function quemE(req) {
  const token = tokenDe(req);
  if (!token) return null;
  const ks = chaves();
  if (!ks) return null;
  try {
    const { payload } = await jwtVerify(token, ks, { issuer: `${URL_SUPABASE}/auth/v1` });
    const email = emailDoToken(payload);
    if (!email) return null;
    return await perfilDe(email);
  } catch {
    return null;
  }
}

/* Falha fechada: sem SUPABASE_URL as rotas protegidas nao abrem. E o modo de
   falha certo — se a configuracao sumir, o painel para em vez de servir 221
   telefones de tutor para quem pedir. */
/* pagina: exige uma aba especifica, nao so "tem alguma aba". A conta que
   ve Vendas nao pode baixar a planilha de custo por saber a URL. */
export function exigeDiretoria({ admin = false, pagina = "" } = {}) {
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
    if (pagina && perfil.paginas !== "todas" && !perfil.paginas.includes(pagina)) {
      return res.status(403).json({ ok: false, error: `sua conta nao tem a aba ${pagina}` });
    }
    req.perfil = perfil;
    next();
  };
}
