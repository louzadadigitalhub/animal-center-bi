# Animal Center BI

Painel de gestão da clínica (Matriz + São Cristóvão) com robô que lê o SimplesVet.

```
SimplesVet  →  robô na VPS (EasyPanel)  →  painel no celular / TV / computador
```

## Como sobe no EasyPanel (caminho único, o mais simples)

O Docker já junta o painel e o robô no mesmo serviço. Não precisa Vercel para ir ao ar.

1. Conecte o repositório GitHub no EasyPanel, projeto `animalcenter`.
2. Tipo: **App** a partir do `Dockerfile` na raiz.
3. Porta interna: **8787** (não use 80, 3000 nem 8080 — já estão ocupadas na VPS).
4. Volume persistente: `/data` (guarda as vendas entre restarts).
5. Variáveis de ambiente (as senhas ficam só no EasyPanel, nunca no GitHub):

| Chave | Valor |
|---|---|
| `SIMPLES_VET_EMAIL` | e-mail do login da clínica |
| `SIMPLES_VET_PASSWORD` | senha do login da clínica |
| `SIMPLES_VET_LOGIN_URL` | `https://app.simples.vet/login/login.php` |
| `PORT` | `8787` |
| `DATA_DIR` | `/data` |
| `SCRAPE_MS` | `120000` (puxa a cada 2 minutos) |

6. Ligue auto-deploy no GitHub: cada `git push` na `main` reconstrói o app.
7. Aponte um domínio no EasyPanel (ex.: `bi.seudominio.com.br`).

Teste depois de subir: `https://SEU-DOMINIO/api/health` deve responder `{"ok":true,...}`.

## Painel no Vercel (opcional, depois)

Só use se quiser o site separado do robô.

- Root do Vercel: pasta `web`
- Variável de build: `VITE_API_URL` = URL pública do EasyPanel (sem barra no fim)
- O robô continua na VPS. O Vercel só mostra a tela.

## Local

```bash
# terminal 1 — robô
cd bot && SKIP_SCRAPE=1 PORT=8787 DATA_DIR=../data node server.js

# terminal 2 — painel
cd web && npm run dev
```

O painel local fala com o robô em `http://127.0.0.1:8787` via proxy do Vite.
