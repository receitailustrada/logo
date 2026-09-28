# CLAV v19.10 — Pedidos da equipe, lote 1

**Data:** 28/09/2026 · **Base:** v19.9.3 (mesmo projeto Apps Script `app_clav_07092026-0423`, 36 arquivos) · **Planilha:** CLAV | Sistema Perioperatório | Base de Dados (esquema 8, sem alteração de esquema; a normalização de datas é opcional e feita à mão, ver seção 4)

Versão gravada no código: `2026.09.28-clav-perioperatorio-v19.10-pedidos-equipe-1`. Pacote `19.10` em `CLAV_BUILD_` e no manifesto (config_hash `49e27033f50712b8`).

Histórico: `README-v19.9.3.md` (conflito depois da ficha), `README-v19.9.2.md` (ajustes de tela e blocos reordenáveis), `README-v19.9.1.md` (encerramento, cartão fixo, manifesto), `README-v19.9.md` (ficha com sessão própria). Pedidos avaliados um a um em `pente-fino-pedidos-equipe.md` e `correcoes-pontuais-pos-v19.9.1.md`.

**Autorização:** Daniel, 28/09/2026: "pode corrigir tudo… ele decide. Não vou interferir". A lista do irmão passou a ser a especificação. Esta versão executa o **lote 1** (defeitos de servidor, ajustes de tela, encerrar e imprimir). O **lote 2** (folha impressa e layouts grandes) vem na v19.11.

---

## 1. O que mudou, item por item

| Item da lista | O que foi feito | Onde |
|---|---|---|
| A5 Lateralidade travando o Encerrar | A planilha classifica o procedimento pela **mesma coluna da aba PROCEDIMENTOS** que a tela usa (com a tabela de correções); a inferência pelo nome fica só como reserva para procedimento digitado fora do catálogo. Os 104 procedimentos que a tela tratava "com lado" e a planilha "sem lado" deixam de gerar o alerta grave ao escolher o lado. **"Bilateral"** em procedimento sem lado no catálogo vira aviso (`LATERALIDADE_BILATERAL_CONFERIR`), não alerta grave. "Direita/Esquerda" em procedimento sem lado continua grave (segurança de sítio cirúrgico). | `13_Catalogo.gs` (`clavItemProcServidor_`, catálogo lido uma vez por execução), `10_Payload_Clinico.gs` |
| A3 Agenda e bate-escala em D-1 | Leitura corrigida: data pura gravada por versão antiga como meia-noite UTC (`…T00:00:00Z`) é o próprio dia; célula convertida em data pela planilha é lida no fuso **da planilha**. Vale para agenda, fila da ficha, bate-escala, relatórios e histórico do paciente. Para limpar de vez os registros antigos: `clavDiagnosticoDatas()` (só lista) e `clavNormalizarDatasAtendimentos(true)` (regrava só as células fora do padrão como texto e põe as duas colunas em formato de texto). | `12_Calculos.gs` (`diaCalendarioClav_`, `fusoPlanilhaClav_`), `99_Diagnostico.gs` |
| C13 Medicações de internação | Remover um item **não** faz a prescrição voltar a listar todas as medicações em uso; lista revisada e vazia (ou toda "Suspender") imprime "Sem medicações de uso contínuo a manter no período de internação"; "Importar" não recoloca o que foi removido (nova lista `medicacoes_internacao_excluidas`, com botão **Restaurar**). Registro nunca tocado se comporta como antes. | `Index.html` (`renderHospitalMedications`, `importHospitalMedications`, `rxMedicationLines`), `19_PDF_Core.gs` (`prescricaoMedicacoes_`), `10_Payload_Clinico.gs` |
| Item 13 "Encerrar a qualquer custo" | (1) **Ciência num clique:** o modal já vem com todos os alertas marcados e o botão "Ciente de todos os alertas: encerrar" registra a ciência de cada um (id + texto, nome e horário) e encerra. (2) **Responsável assumido:** anestesiologista ou gestor médico que encerra com o campo em branco passa a ser o responsável (na tela, antes de salvar; na planilha, como reserva) e a AUDITORIA registra `assumidos`. O mesmo vale para a ficha intraoperatória iniciada sem responsável. Suporte/admin continua tendo de indicar o nome. (3) **Nascimento no futuro** deixa de bloquear (continua alerta grave com ciência). (4) **Conflito real** (outra pessoa gravou) ao salvar ou encerrar abre a escolha: **Recarregar da planilha** (a edição desta tela fica em rascunho local) ou **Gravar por cima / Encerrar mesmo assim** (`forcarRevisao`, gravado na AUDITORIA como `rebase_ficha.forcado` / `revisao_forcada`; a versão anterior fica no HISTORICO). (5) Antes de desistir por "novas alterações pendentes", o Encerrar tenta uma segunda gravação. **Continuam obrigatórios:** nome do paciente, procedimento e conclusão. | `Index.html`, `04_Atendimentos.gs`, `25_Salvamento.gs` |
| C14 Imprimir salva | Botões de impressão gravam na planilha antes de abrir a impressão, quando há nome, atendimento não encerrado e alteração pendente. Se a gravação falhar, o documento sai como antes ("CÓPIA LOCAL") e o aviso pede para salvar. Sem alteração pendente, nada é regravado. | `Index.html` (`salvarAntesDeImprimir`, `gerarPdf`, botões da prévia e lote) |
| A1 Alertas do menu | Lista nasce recolhida em qualquer tela (a escolha de quem abrir continua guardada). | `Index.html` (`railAlertsCollapsedDefault`) |
| A2 Casos hipotéticos | Painel escondido da Visão (código e botões continuam no HTML). | `Index.html` (`#painelCasosHipoteticos`) |
| B1 Observação da triagem | Botão "Atalhos" oculto: observação sem itens clicáveis. | `Index.html` (CSS) |
| B2 Cloro, Cálcio, Magnésio | Fora da grade de exames nos atendimentos novos; **continuam na lista**, e registro antigo com valor segue aparecendo, gravando e imprimindo. | `Index.html` (`EXAM_DEFS` com marca `oculto`, `atualizarExamesOcultos`) |
| C3 Atalhos de medicações | Retirados (botão, fileira e ajuda ocultos; a busca por nome continua). | `Index.html` |
| C4 Alergias enxutas | Lista: Nega alergias, Látex, Penicilina (benzetacil, amoxicilina), Cefazolina / cefalexina, Sulfas (Bactrim e outras), Dipirona, AAS, Metoclopramida, Morfina e demais opioides, Contraste iodado, Picada de abelha, Pólen / poeira / ácaros, Alimentos (descrever na caixa livre). Item de lista anterior marcado em registro antigo aparece como caixa extra já marcada, continua gravado e impresso. | `Index.html` (`ALERGIAS_ITENS`, `garantirItensLegado`) |
| C6 Beta-HCG numa linha | O seletor passou a se chamar **Resultado do Beta-HCG** (Não se aplica / Negativo / Positivo / Solicitado-Pendente / Dispensado com justificativa) e espelha automaticamente o campo de resultado detalhado, que continua alimentando o alerta de proteção à menor de 14 anos, o "Beta-HCG pendente", o resumo e a impressão. A terceira linha (resultado detalhado e observação) só aparece em registro antigo que tenha informação diferente do seletor. | `Index.html` (`sincronizarResultadoBeta`, `atualizarBetaLegado`) |
| C9 Escores de risco | Bloco RCRI / STOP-Bang / Caprini saiu do pré-anestésico e virou a aba **Calculadora** (menu, perfis médicos). Mesmos campos, mesmos alertas, mesma impressão. | `Index.html` (`#sec-calculadora`) |
| C10 Capacidade funcional | Acima da revisão por sistemas na ordem padrão; chips com fonte maior. Quem tinha ordem própria guardada continua com a sua. | `Index.html` |
| C11 Título | "Estratificação final / ASA" na tela e nos dois motores de impressão (o bloco ganhou id fixo para não perder a ordem guardada). | `Index.html`, `21_PDF_Secoes.gs` |
| C15 Conclusão | "Conclusão" e "Anestesia proposta" viraram o bloco recolhível **Conclusão e anestesia proposta**, com atalho na barra e "Ir ao campo" do encerramento apontando para ele. | `Index.html` |
| C16 Rótulo do PDF | "Observações finais para o bloco cirúrgico" no PDF do servidor (era "Prescrição pré-anestésica"). | `21_PDF_Secoes.gs` |
| D1 Bordas arredondadas | Caixas e títulos de seção com cantos arredondados na folha impressa pelo navegador (o PDF arquivado no Drive não permite). | `Index.html` (`PRINT_SHEET_CSS`) |
| D6 Tabagismo | "Não tabagista" nos dois motores. | `Index.html`, `20_PDF_Layout.gs` |

`Intra.html`, `IntraFarmacos.html` e os demais 23 arquivos não mudaram.

## 2. Arquivos alterados (12)

Pasta `codigo/` do repositório (públicos, 11): `Index.html`, `00_Config.gs`, `04_Atendimentos.gs`, `10_Payload_Clinico.gs`, `12_Calculos.gs`, `13_Catalogo.gs`, `19_PDF_Core.gs`, `20_PDF_Layout.gs`, `21_PDF_Secoes.gs`, `25_Salvamento.gs`, `99_Diagnostico.gs`.
Só no ZIP privado (1): `28_Versao.gs` (`CLAV_BUILD_` 19.10 e manifesto regenerado).

## 3. Verificação

- Sintaxe: 42 blocos / 0 erros. Cruzamento de chamadas e IDs: sem faltas novas. Manifesto: 32/32 módulos + `config_hash` iguais.
- Playwright (`testes/e2e.js` + `mock.js`): **113 OK / 0 falhas, zero erros de console** (34 verificações novas: tela, medicações de internação, impressão que salva, ciência num clique, responsável assumido, conflito ao encerrar e ao salvar com as duas escolhas).
- Servidor em sandbox Node (`testes/server_unit.js`, novo): **35 OK / 0 falhas** (lateralidade pelo catálogo, leitura de datas, diagnóstico e normalização com planilha simulada, prescrição de internação, `forcarRevisao`, rótulos do PDF).
- Capturas de tela em `testes/shots-v1910/` (pré-anestésico, Beta-HCG, calculadora, ciência, conflito, folha impressa).
- Não executado dentro do Google Apps Script nem contra a planilha real.

## 4. Implantação (mesma URL /exec)

1. Colar por cima e salvar os 11 arquivos da pasta `codigo/` e o `28_Versao.gs` do ZIP privado. (Quem ainda não colou a v19.9.2/v19.9.3: colar também `Intra.html` da v19.9.2.)
2. Implantar → Gerenciar implantações → lápis → **Nova versão** → Implantar.
3. Executar `adminSelarManifestoHtml` no editor.
4. Botão **Análise**: esperado "Pacote: 19.10" e "ÍNTEGRO: idêntico ao pacote 19.10".
5. **Datas da agenda (opcional, recomendado):** no editor, executar `clavDiagnosticoDatas` e ler o registro (Execuções). Se listar células fora do padrão: fazer o backup da planilha (Arquivo → Fazer download → .xlsx) e executar `clavNormalizarDatasAtendimentos(true)` **uma vez**. Sem isso a agenda já lê certo; a normalização só evita que a planilha volte a converter as células.

## 5. Roteiro de teste (10 minutos)

| # | Passo | Esperado |
|---|---|---|
| 1 | Agenda do dia e bate-escala com os pacientes que caíam em D-1. | Aparecem no dia certo. |
| 2 | Paciente e agenda: "Meniscectomia artroscópica" com lateralidade **Direita**; salvar. | Nenhum alerta grave de "lateralidade indevida". "Colecistectomia" + **Direita** continua grave; + **Bilateral** vira aviso. |
| 3 | Pré-anestésico: menu sem "Scores de risco"; aba **Calculadora** com RCRI/STOP-Bang/Caprini; "Capacidade funcional" acima da "Revisão por sistemas"; "Estratificação final / ASA"; bloco "Conclusão e anestesia proposta"; Beta-HCG com um seletor "Resultado do Beta-HCG". | Conforme. Marcar um critério na Calculadora e voltar ao pré-anestésico: resumo e alertas consideram. |
| 4 | Triagem: grade de exames sem Cloro/Cálcio/Magnésio; abrir um atendimento antigo que tenha Cloro preenchido. | Novo: sem as três células. Antigo: Cloro aparece com o valor. |
| 5 | Medicações em uso: 2 itens → "Importar medicações em uso" → remover 1 → "Atualizar modelo" da prescrição. | A prescrição lista só a que ficou. Importar de novo não recoloca a removida; "Restaurar" libera. Remover a última: prescrição com "Sem medicações de uso contínuo a manter". |
| 6 | Com alteração pendente, clicar **Imprimir**. | Chip "Salvando na planilha antes de imprimir…", depois a folha sem faixa "CÓPIA LOCAL"; planilha atualizada. |
| 7 | Encerrar com anestesiologista em branco (login de anestesiologista) e conclusão preenchida. | Campo preenchido com quem encerra (aviso); modal de ciência já marcado; um clique encerra. AUDITORIA: `assumidos`. |
| 8 | Duas pessoas no mesmo atendimento: a segunda salva depois da primeira ler; a primeira clica Salvar. | Modal "Atendimento alterado…": **Recarregar** traz a versão nova (edição fica em Visão → Retomar rascunho local); **Gravar por cima** grava e a AUDITORIA mostra `rebase_ficha.forcado: true`. |
| 9 | Folha impressa pelo navegador. | Caixas com cantos arredondados; "Estratificação final / ASA"; hábitos com "Não tabagista". PDF do Drive com "Observações finais para o bloco cirúrgico". |

## 6. Plano de volta

Implantar → Gerenciar implantações → versão anterior → Implantar. Nada a reverter na planilha; se `clavNormalizarDatasAtendimentos(true)` tiver sido executada, as células continuam corretas (texto civil) e a versão anterior também as lê.

## 7. Decisões desta versão (para não reabrir)

- Lateralidade no servidor sempre pela aba PROCEDIMENTOS (`clavItemProcServidor_`); inferência pelo nome só para nome fora do catálogo. "Bilateral" em procedimento NA = aviso.
- Datas civis: `diaCalendarioClav_` trata meia-noite UTC como data pura e célula Date no fuso da planilha; normalização só à mão, célula a célula, com `confirmar === true`.
- Medicações de internação: `medicacoes_internacao_tocada` ('SIM') e `medicacoes_internacao_excluidas` (nomes) fazem parte do payload; espelho obrigatório entre `rxMedicationLines` e `prescricaoMedicacoes_`.
- Encerramento: bloqueios rígidos = nome, procedimento, conclusão (+ responsável quando quem encerra não pode assumir); ciência num clique registra todos os exibidos; `forcarRevisao` só com `true` literal e sempre auditado; a ficha (`origemFicha`) nunca força.
- Imprimir salva antes quando há o que salvar; falha de gravação não impede imprimir.
- Cloro/Cálcio/Magnésio ficam em `EXAM_DEFS` com a marca `oculto`; nunca apagar da lista. Alergias antigas nunca somem: `garantirItensLegado`.
- Beta-HCG: o campo `beta_hcg_status` é o que a equipe vê; `beta_hcg_resultado` é derivado dele (mapa em `resultadoBetaEsperado`) e continua sendo a fonte dos alertas.

## 8. Próximo pacote (v19.11, lote 2)

C2 dor dentro do exame físico (tela e impressão), C5 revisão por sistemas em duas colunas, C7 ausculta editável, C8 via aérea rearranjada, C12 pedidos de exame e avaliação imprimíveis, D2 seções sempre impressas com texto padrão, D3 cabeçalho 3×4, D4 triagem em linha sem responsável, D5 bloco "Consulta pré-anestésica" desfeito, D7 exames em linha, D9 linha capacidade/ASA/risco/estratificação. Tudo em dobro (folha do navegador e PDF do servidor).
