# ZIRAN LOGÍSTICA — Controle de Fretes (Cloudflare Pages + Apps Script)

Este projeto entrega um **app web profissional** (Cloudflare Pages) com **backend confiável** (Google Apps Script / Google Sheets),
incluindo login por **Gmail + PIN (matrícula)**, fluxo completo de **lançamentos → aprovação → lançamentos/reprovados**, e **relatórios**.

---

## 1) Pré‑requisitos

- Uma planilha Google com as abas (nomes exatamente assim):
  - `Respostas ao formulário 1`
  - `Aprovacao`
  - `Lancamentos`
  - `Reprovado`
  - `Usuarios`
  - `Clientes`
  - `Frotas`
  - (opcionais, para arquivamento) `Historico_Lancamentos`, `Historico_Reprovados`

- Na aba `Usuarios`, crie estas colunas (linha 1):
  - `Nome`, `Email`, `Perfil`, `Ativo`, `FrotaPadrao`, `PIN`
  - `Perfil`: use `Gestor` ou `Motorista`
  - `Ativo`: `SIM` / `NÃO`
  - `PIN`: matrícula (pode ser numérico ou texto)

> Se você ainda não tiver a coluna `PIN`, o sistema cria automaticamente, mas **é recomendado preencher** para segurança.

---

## 2) Backend — Apps Script (API)

1. Abra a planilha → **Extensões** → **Apps Script**
2. Crie um arquivo `Code.gs` e cole o conteúdo de `apps_script/Code.gs`
3. Em **Implantar** → **Nova implantação**:
   - Tipo: **Aplicativo da web**
   - Executar como: **Você**
   - Quem tem acesso: **Qualquer pessoa**
4. Copie a URL do WebApp (termina com `/exec`)

---

## 3) Frontend — Cloudflare Pages + Functions (Proxy com CORS)

### Estrutura
- `public/` → arquivos estáticos do app (HTML/CSS/JS + PWA)
- `functions/api.js` → proxy server-side para o Apps Script, adicionando CORS e escondendo a URL do GAS

### Configurar no Cloudflare
1. Suba este projeto no GitHub (recomendado) **ou** faça upload direto no Pages
2. No Cloudflare Pages:
   - **Build command**: vazio
   - **Build output directory**: `public`
   - **Functions**: ativadas automaticamente pelo diretório `functions/`

3. Em **Settings → Environment variables**, crie:
   - `APPS_SCRIPT_URL` = `https://script.google.com/macros/s/SEU_ID/exec`
   - (opcional) `PROXY_SHARED_SECRET` = uma senha forte (ex.: `ziran-2026-...`)
     - Se definido, o front envia o segredo e o proxy valida (ajuda a evitar abuse).

---

## 4) Como usar

- O usuário entra com **Gmail** e **PIN**.
- O sistema identifica o **Perfil** (Motorista/Gestor) pela aba `Usuarios`.

### Motorista
- Novo Lançamento (frete)
- Meus lançamentos (pendentes, aprovados, reprovados)

### Gestor
- Pendentes de aprovação (com filtro/busca e seleção)
- Processar (aprovar/reprovar + observação)
- Históricos
- Relatórios (por mês e por motorista)
- Cadastros (usuários, clientes, frotas)

---

## 5) Diagnóstico rápido (se der erro)

- 401/403: usuário não cadastrado/ativo ou PIN errado.
- “Erro ao carregar dados”:
  - verifique se `APPS_SCRIPT_URL` está correto
  - confira se o Apps Script está implantado como **WebApp**
  - confira se as abas existem com o nome correto
- Se pendentes não aparecem:
  - execute no menu da planilha: Administração → Importar respostas → Aprovação

---

## 6) Segurança (recomendado)

- Preencha `PIN` para todos os usuários.
- Mantenha `Quem tem acesso: Qualquer pessoa` no Apps Script **apenas** porque o proxy (Cloudflare) fica na frente.
- Use `PROXY_SHARED_SECRET` no Cloudflare e no `public/app.js` (config).
