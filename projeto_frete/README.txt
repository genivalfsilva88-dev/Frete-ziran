# Projeto Frete (Front + Apps Script).

Este ZIP contém:
- index.html / assets do front
- Code.gs (Apps Script) atualizado para confiabilidade/performance/segurança

## 1) Apps Script
1. Abra a planilha base (Google Sheets).
2. Extensões -> Apps Script.
3. Substitua TODO o conteúdo do Code.gs pelo arquivo `Code.gs` deste ZIP.
4. Salve.

## 2) Publicar o WebApp
- Implantar -> Nova implantação -> Aplicativo da Web
- Executar como: **Você**
- Quem tem acesso: **Qualquer pessoa com conta Google** (ou conforme política interna)
- Atualize o link no front (se você usa URL fixa no index.html).

## 3) Importante (erro 'Usuário não cadastrado na aba Usuários')
- A aba **Usuarios** deve ter uma linha com o e-mail que você usa no login (ex.: genival.ziran@gmail.com) e **Ativo = SIM**.
- Perfil: `GESTOR` para acessar telas de gestor.

## 4) AnoMes
- AnoMes é preenchido como TEXTO no formato `yyyy-MM`.
- Se existirem linhas antigas com AnoMes vazio: execute o menu **Administração -> Backfill AnoMes (todas abas)**.

