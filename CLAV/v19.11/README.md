# CLAV v19.11 — Pedidos da equipe, lote 2: folha impressa e layouts

**Data:** 28/09/2026 · **Base:** v19.10 (mesmo projeto Apps Script `app_clav_07092026-0423`, 36 arquivos) · **Planilha:** CLAV | Sistema Perioperatório | Base de Dados (esquema 8, sem alteração)

Versão gravada no código: `2026.09.28-clav-perioperatorio-v19.11-folha-impressa`. Pacote `19.11` em `CLAV_BUILD_` e no manifesto (config_hash `11417e65f8a5d162`, 390 funções).

Histórico: `README-v19.10.md` (lote 1: servidor, tela, encerrar e imprimir), `README-v19.9.3.md`, `README-v19.9.2.md`, `README-v19.9.1.md`, `README-v19.9.md`. Lista completa dos pedidos e situação em `pente-fino-pedidos-equipe.md`.

**Com esta versão, toda a lista do irmão do Daniel está executada** (autorização de 28/09/2026: "pode corrigir tudo… ele decide"). Duas ressalvas técnicas: as figurinhas da escala de faces não saem na folha impressa (só o valor; a impressão não pode depender de imagem remota) e o PDF arquivado no Drive não tem cantos arredondados (limitação do Google Docs).

---

## 1. O que mudou, item por item

Toda mudança de impressão foi feita **nos dois motores**: a folha que os médicos imprimem pelos botões (`Index.html`, `buildPdfSectionsClient` + `PRINT_SHEET_CSS`) e o PDF arquivado no Drive (`21_PDF_Secoes.gs` + `20_PDF_Layout.gs` + `19_PDF_Core.gs`).

| Item | O que foi feito |
|---|---|
| D3 Cabeçalho | Grade **fixa** de 3 linhas × 4 colunas, célula vazia com traço: **NOME EM CAIXA ALTA** · idade · sexo · *Data da consulta* / procedimento (com tipo de cirurgia) · lateralidade · convênio · *Data da cirurgia* / cirurgião e equipe · local · caráter · *Prontuário*. Sem data de nascimento; só as três células em itálico levam rótulo. "Data da consulta" = data da avaliação pré-anestésica (ou do cadastro, se a consulta ainda não tem data). Nome de uso, quando diferente, sai entre parênteses após o nome. Vale para todos os documentos (a identificação é comum). |
| D4 Triagem | Duas linhas de quatro, valores **em linha** com unidade e fonte maior ("PA: 180/80 mmHg"); "Responsável pela triagem" saiu da impressão (continua na planilha e na tela). Classificação dos sinais vitais e observação seguem em linha inteira. |
| D5 Bloco "Consulta pré-anestésica" | Desfeito: data → cabeçalho; escala de dor (adulto e faces) → **Exame físico**; TCLE → **Conduta**; "Beta-HCG conferido" → linha do Beta-HCG na revisão por sistemas; "Contexto clínico relevante" → Antecedentes; "Triagem revisada" deixou de ser impressa; "Jejum informado (registro anterior)" → Conduta, só quando existir. |
| D2 / D6 Seções sempre impressas | Cirurgias prévias, ano/detalhes, complicações pessoais e familiares, medicações, GLP-1, alergias e hábitos saem sempre, com texto padrão quando vazios: "Nega cirurgias ou procedimentos prévios", "—", "Nega complicações anestésicas prévias", "Nega complicações anestésicas familiares", **"NENHUMA MEDICAÇÃO EM USO"**, "Nega uso de agonistas do receptor GLP-1 (canetas emagrecedoras)", "Nega alergias" (sem o destaque vermelho), "Nega tabagismo, etilismo e uso de outras drogas". Antecedentes principais vazio → **"PACIENTE HÍGIDO"**. Mallampati vazio → "Mallampati ______"; ASA vazio → "ASA ______". Os textos ficam em uma tabela única por motor (`PRINT_PADROES_` / `PRINT_PADROES_CLIENT`) para a equipe ajustar a redação. Ressalva clínica: o padrão afirma negativas; quem assina confere. |
| D7 Exames e via aérea | Exames em linha ("Hemoglobina: 14,3 g/dL"), até 4 colunas, fonte maior; distância tireomentoniana e circunferência cervical também em linha. |
| D9 Linha final | "ESTRATIFICAÇÃO FINAL / ASA" virou grade fixa de 4: **Capacidade funcional · ASA · Risco do procedimento · Estratificação global**, sempre as quatro células. A seção de escores ficou só com RCRI, STOP-Bang e Caprini. |
| C2 Dor | Tela: a escala de dor mora dentro do bloco **Exame físico** (mesmos ids e campos; adulto com números, pediátrica com desenhos, bloqueio por idade igual). Impressão: dor e faces dentro de Exame físico. |
| C5 Revisão por sistemas | Cada sistema em duas colunas: caixa de descrição **sempre visível à esquerda**, itens clicáveis à direita (dispneia/cansaço/precordialgia empilhados); sem botão "Outras"; **Ginecológico/Obstétrico** entrou como caixa dentro de "Outros sistemas e ginecológico/obstétrico". Campos, situação, sincronização com antecedentes e impressão iguais. |
| C7 Ausculta | Ausculta cardíaca e pulmonar viraram **texto padrão editável** ("RCR, 2T, BNF, sem sopros" / "MV+, S/RA"). Texto igual ao padrão = normal; "Sem particularidades" = essa opção; qualquer outro texto = "Com alterações" com a descrição igual ao texto. Os campos gravados são os mesmos de antes (situação + descrição), então alertas, registros antigos e a impressão continuam funcionando. |
| C8 Via aérea | Primeira linha igual (Mallampati, abertura oral, protrusão, mobilidade, DTM, circunferência); abaixo, **desenhos do Mallampati à esquerda** e **dentição em duas colunas à direita**; "Outros achados da via aérea" com caixa. |
| C12 Pedidos imprimíveis | Novo documento **"Solicitação de exames e avaliações"** (botão "PDF pedidos", opção na prévia, item no lote). Cada solicitação marcada ganha uma caixa de objetivo/justificativa (`conduta.solicitacoes_detalhes`); o documento traz identificação, triagem, contexto (procedimento, data prevista, ASA), exames numerados e avaliações/pareceres numerados com o texto de cada um, o campo livre e a assinatura. "Radiografia de tórax" entrou na lista de solicitações. |
| Extra | Alergia digitada no campo livre igual a um item marcado não sai mais repetida ("Dipirona; Dipirona"). |

## 2. Arquivos alterados (9)

Pasta `codigo/` do repositório (públicos, 8): `Index.html`, `00_Config.gs`, `06_Documentos_API.gs`, `10_Payload_Clinico.gs`, `19_PDF_Core.gs`, `20_PDF_Layout.gs`, `21_PDF_Secoes.gs`, e (sem mudança nesta versão, mas necessário se a v19.10 não foi colada) os demais da v19.10.
Só no ZIP privado (1): `28_Versao.gs` (`CLAV_BUILD_` 19.11 e manifesto regenerado).

Quem ainda não colou a v19.10: colar todos os arquivos da pasta `codigo/` (versão atual de cada um) mais `28_Versao.gs` do ZIP.

## 3. Verificação

- Sintaxe: 42 blocos / 0 erros. Cruzamento: sem faltas novas. Manifesto: 32/32 + `config_hash`.
- Playwright (`testes/e2e.js`): **128 OK / 0 falhas, zero erros de console** (15 verificações novas: dor no exame físico, revisão em duas colunas com texto livre, ausculta editável ida e volta, via aérea, pedidos com caixa e documento, estrutura da folha: cabeçalho 3×4, triagem em linha, sem "Consulta", textos padrão, escores, linha fixa da estratificação).
- Servidor em sandbox Node (`testes/server_unit.js`): **49 OK / 0 falhas** (mesmas verificações da folha no motor do PDF do Drive, grade fixa, célula em linha, tipo PEDIDOS).
- Capturas em `testes/shots-v1911/` (exame físico com dor e ausculta, revisão em duas colunas, via aérea, solicitações, folha páginas 1 e 2, documento de pedidos).
- Não executado dentro do Google Apps Script nem contra a planilha real.

## 4. Implantação (mesma URL /exec)

1. Colar por cima e salvar os arquivos da pasta `codigo/` e o `28_Versao.gs` do ZIP privado.
2. Implantar → Gerenciar implantações → lápis → **Nova versão** → Implantar.
3. Executar `adminSelarManifestoHtml` no editor.
4. Botão **Análise**: esperado "Pacote: 19.11" e "ÍNTEGRO: idêntico ao pacote 19.11".

## 5. Roteiro de teste (10 minutos)

| # | Passo | Esperado |
|---|---|---|
| 1 | Pré-anestésico: bloco Exame físico. | Escala de dor no topo do bloco; auscultas como caixas de texto com o padrão; escrever "sopro sistólico" na cardíaca deixa a caixa âmbar e, na prévia, "Ausculta cardíaca: sopro sistólico". Apagar volta ao padrão. |
| 2 | Revisão por sistemas. | Caixa de texto à esquerda em todos os sistemas, itens à direita, sem "Outras"; ginecológico dentro de "Outros sistemas". Texto na caixa marca "1 achado". |
| 3 | Via aérea. | Desenhos à esquerda, dentição em duas colunas à direita, "Outros achados da via aérea". |
| 4 | Solicitações: marcar ECG e Avaliação cardiológica; escrever o objetivo; Documentos → **PDF pedidos**. | Documento "Solicitação de exames e avaliações" com exames e avaliações numerados e o texto de cada um. |
| 5 | Imprimir a ficha pré-anestésica de um paciente com poucos campos preenchidos. | Cabeçalho 3×4 com nome em caixa alta; triagem "PA: … mmHg"; "NENHUMA MEDICAÇÃO EM USO", "PACIENTE HÍGIDO", "Mallampati ______", "ASA ______" onde estava vazio; sem "Responsável pela triagem"; sem bloco "Consulta pré-anestésica"; TCLE na conduta; linha Capacidade/ASA/Risco/Estratificação. |
| 6 | Gerar o PDF do Drive do mesmo atendimento (Registros → PDF servidor). | Mesma estrutura (sem cantos arredondados). |

## 6. Plano de volta

Implantar → Gerenciar implantações → versão anterior → Implantar. Nada a reverter na planilha. Registros gravados com `conduta.solicitacoes_detalhes` continuam legíveis pela v19.10 (campo ignorado).

## 7. Decisões desta versão (para não reabrir)

- Grade "fixa" (`fixo: true`) só nas três seções pedidas (cabeçalho, triagem, estratificação); as demais continuam refluindo por quantidade de itens.
- Célula "em linha" = quinto elemento `'inline'` do item de grade (`gil_`/`gilC`, `gif_`/`gifC`); o PDF do Drive escreve "Rótulo: valor" na mesma linha.
- Textos padrão só em `PRINT_PADROES_` / `PRINT_PADROES_CLIENT`; "Nega alergias" padrão nunca recebe o destaque vermelho.
- Ausculta: a caixa visível não é campo de dados; deriva de `exame.ausculta_*_status` + `exame.ausculta_*` e grava neles.
- Revisão por sistemas: `gineco` continua um sistema próprio (campos e status), renderizado dentro do bloco `outros`.
- Documento `PEDIDOS`: só perfis médicos; classificação exame × avaliação pelo nome ("Avaliação…", "parecer", "consulta").
