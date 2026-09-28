# CLAV v19.9.1 — Encerramento sem beco sem saída, cartão do paciente fixo e Análise do sistema com impressão digital real

**Data:** 28/09/2026 · **Base:** v19.9 implantada no projeto Apps Script `app_clav_07092026-0423` ("CLAV | Sistema Perioperatório", 36 arquivos) · **Planilha:** CLAV | Sistema Perioperatório | Base de Dados (esquema 8, sem alteração de esquema nem de dados)

Versão gravada no código: `2026.09.28-clav-perioperatorio-v19.9.1-encerramento-cartao-manifesto` (em `00_Config.gs` e no bootstrap do `Index.html`). Pacote `19.9.1` em `CLAV_BUILD_` e no manifesto (`28_Versao.gs`).

O pacote anterior (v19.9, 21 arquivos) está descrito em `README-v19.9.md`. **Esta versão altera só 4 arquivos.**

---

## 1. O que foi relatado depois de implantar a v19.9 e o que estava por trás

### 1.1 "Não deixa encerrar o caso mesmo clicando em ciência do alerta"

Havia **três** defeitos encadeados, todos confirmados no código e reproduzidos em teste:

1. **A planilha bloqueava antes de olhar a ciência, e a tela pedia a ciência antes de olhar os bloqueios.** `encerrarAtendimento` (04_Atendimentos.gs) recusa o encerramento sem nome, procedimento, anestesiologista responsável, **conclusão da avaliação pré-anestésica**, nascimento válido e responsável da ficha intraoperatória iniciada. A tela abria o modal "Ciência de alertas graves" e listava "CONDUTA · Conclusão e conduta final ausentes" com uma caixinha para marcar, como se bastasse ler. O médico marcava tudo, a planilha respondia `CONCLUSAO_OBRIGATORIA` e a mensagem aparecia num aviso passageiro, sem apontar o campo. Era exatamente o caso da captura de tela (Endoscopia, conclusão em branco).
2. **Alertas que só a planilha gera nunca conseguiam ciência.** O servidor produz `LATERALIDADE_INDEVIDA`, `DATA_NASCIMENTO_FUTURA` e `ANESTESIOLOGISTA_AUSENTE` (grave) que não existem na lista da tela. Quando a planilha devolvia um deles, a tela mostrava o modal, mas `acknowledgeAlert` só procurava na lista da própria tela: não encontrava, **saía em silêncio**, salvava, tentava encerrar e a planilha pedia o mesmo alerta de novo. Sem fim. O mesmo acontecia quando o texto do alerta mudava (valor novo do sinal vital) — a planilha compara id **e** texto.
3. **Depois de salvar a ciência, a tela achava que havia alterações pendentes.** `documentos.relatorio_narrativo` é escrito pelo gerador do relatório a cada renderização, com a hora ("Prévia atualizada em …") e o estado de ciência ("[ciência registrada]"). Ele entrava na impressão digital que decide se o formulário está igual ao que a planilha tem; logo após um salvamento bem-sucedido, a regeneração já o deixava diferente, e o Encerrar respondia "Há novas alterações pendentes. Salve-as antes de encerrar." — salvar de novo não resolvia.

### 1.2 "O nome do paciente anda junto com a rolagem em quase todas as abas"

O menu lateral inteiro é `position: sticky`, mas mede cerca de 1.800 px (menu de etapas, alertas, segurança) — mais alto que a tela. Perto do fim da página o navegador empurra o menu inteiro para cima e o cartão "Fluxo do atendimento" (nome, idade, procedimento, situação) sai de vista. Nas abas curtas (Triagem, SRPA, Documentos, Registros, Relatórios) isso acontece com poucos centímetros de rolagem; no Pré-anestésico a faixa própria do cabeçalho disfarçava. Medido no teste (1400×800, aba SRPA): topo do cartão em **−13 px** na v19.9; **+102 px** (logo abaixo do cabeçalho) na v19.9.1.

### 1.3 "A Análise está defasada, mostra como se a versão não fosse esta"

O manifesto de integridade de `28_Versao.gs` continuava sendo o gerado na 19.4.1; a v19.9 não trazia hashes novos e dependia de rodar `adminGerarManifesto` e colar o resultado no código. Nesta versão o algoritmo do manifesto foi reproduzido fora do Apps Script e validado: os 25 módulos intocados batem byte a byte com o manifesto antigo e os 19 apontados como "DIFERENTE" pela Análise real são exatamente os 19 que a reprodução aponta. O manifesto agora vem **preenchido com as impressões digitais reais dos 32 módulos (376 funções) e do objeto CLAV**. Os arquivos HTML só podem ser medidos pelo próprio HtmlService: para eles existe agora `adminSelarManifestoHtml`, uma função de um clique no editor que grava o selo em propriedade do script (sem colar código). A Análise passa a dizer **ÍNTEGRO** depois desse clique.

---

## 2. O que mudou (4 arquivos)

| Arquivo | Mudança | Por quê |
|---|---|---|
| `Index.html` | **Encerrar:** antes da ciência, `impedimentosEncerramento()` confere os seis bloqueios da planilha e abre "Encerramento bloqueado" com botão **Ir ao campo** (abre a aba, expande o bloco recolhido, rola e foca o campo — inclusive selects pesquisáveis); bloqueio devolvido pela planilha (`err.code`) cai no mesmo modal com a mensagem do servidor. **Ciência:** `openAckModal` guarda os alertas exatamente como exibidos; `acknowledgeAlert(id, origem)` procura primeiro nessa lista (alertas só do servidor) e renova a ciência quando o texto mudou; trava de repetição: se a planilha devolver a mesma exigência logo após a ciência salva, a tela avisa em vez de reabrir o modal sem fim; `unacknowledgedSevereAlerts()` recalcula do formulário; após salvar, o estado de ciência é mesclado nos alertas devolvidos pelo servidor. **Impressão digital:** `documentos.relatorio_narrativo` (texto gerado, com hora) sai da comparação; o texto editável `documentos.resumo` continua contando. **Cartão do paciente:** `.rail-card.rail-paciente` sticky sob o cabeçalho (≥1201 px), fundo sólido e `z-index` próprio. Versão do bootstrap. | Itens 1.1 e 1.2. |
| `00_Config.gs` | `VERSION` → v19.9.1. | Tela e servidor conferem a versão um do outro. |
| `04_Atendimentos.gs` | Comparação do texto da ciência ignora diferenças de espaçamento (id + texto normalizado). | Item 1.1 (2). |
| `28_Versao.gs` | `CLAV_BUILD_` 19.9.1 (novidades, histórico com 19.9); `CLAV_MANIFESTO_` regenerado com hashes reais (32 módulos, 376 funções, `config_hash`); **`adminSelarManifestoHtml`** e `clavSeloHtml_` (selo dos HTML em propriedade do script, válido só para o build atual); `clavInventario_` usa o selo quando o manifesto não traz hash do HTML; veredito "CONFERÊNCIA PENDENTE DOS HTML" explica o que executar. **Arquivo entregue apenas no ZIP privado** (contém telefones, e-mails e hashes da equipe). | Item 1.3. |

**Não mudaram (não precisam ser colados):** `Intra.html`, `IntraFarmacos.html`, `01_WebApp.gs`, `02_Admin.gs`, `03_Auth.gs`, `05_Relatorios.gs`, `06_Documentos_API.gs`, `07_Usuarios.gs`, `08_Planilha_Base.gs`, `09_Seguranca.gs`, `10_Payload_Clinico.gs`, `11_Farmacologia.gs`, `12_Calculos.gs`, `13_Catalogo.gs`, `14_Dados_Equipe.gs`, `15_Dados_Procedimentos.gs`, `16_Dados_Convenios.gs`, `17_Dados_Medicacoes.gs`, `18_Dados_Municipios.gs`, `19_PDF_Core.gs`, `20_PDF_Layout.gs`, `21_PDF_Secoes.gs`, `22_CRUD.gs`, `23_Utils.gs`, `24_Sessao.gs`, `25_Salvamento.gs`, `26_Intraop.gs`, `27_Pacientes.gs`, `29_Chamados.gs`, `30_Catalogo_Correcoes.gs`, `99_Diagnostico.gs`, `appsscript.json`.

Nenhuma mudança visual além do cartão fixo e do modal de encerramento (que reutiliza o modal de ciência existente). Nenhuma escrita na planilha, nenhuma coluna nova.

---

## 3. Verificação feita antes da entrega

- **Sintaxe:** `node --check` nos 32 `.gs` e nos 10 blocos `<script>` de `Index.html`/`Intra.html` (template renderizado como o `include()` real): 42 blocos, zero erros.
- **Cruzamento:** todas as chamadas `google.script.run`/`server()` têm função pública; todos os IDs usados no JavaScript existem no HTML (os dois únicos ausentes são elementos criados em tempo de execução, como antes).
- **Manifesto:** reprodução do algoritmo validada contra o manifesto anterior (25/25 módulos intocados iguais) e contra a Análise real da v19.9 (mesmos 19 módulos divergentes). Manifesto novo: 32/32 módulos e `config_hash` conferem, nenhuma função fora do manifesto.
- **Teste headless (Playwright, servidor Apps Script simulado):** **54 verificações OK / 0 falhas, zero erros de console** — as 42 da v19.9 mais 12 novas: conclusão em branco abre "Encerramento bloqueado" sem chamar a planilha; "Ir ao campo" abre o pré-anestésico, expande o bloco e foca a Conclusão; Conclusão preenchida pelo controle pesquisável; ciência dos alertas da tela; alerta que só a planilha gera chega ao modal e é gravado com o texto exato; atendimento ENCERRADO na planilha; bloqueio devolvido pela planilha vira modal com a mensagem do servidor; trava de repetição; cartão do paciente visível no fim das abas SRPA e Documentos. **A mesma suíte rodada no código v19.9 reproduz o defeito** (46 OK / 8 falhas na v19.9, e as 8 falhas são exatamente as verificações novas: o modal de ciência lista "Conclusão e conduta final ausentes" como item marcável, o alerta que só a planilha gera nunca encerra o caso, e o cartão do paciente fica a −886 px no fim da aba SRPA).
- **Não executado:** dentro do Google Apps Script e contra a planilha real. O roteiro da seção 5 cobre isso.

---

## 4. Implantação (mesma URL /exec)

1. No editor do Apps Script, colar por cima (selecionar tudo, colar, **Ctrl+S**) **4 arquivos**: `Index.html`, `00_Config.gs`, `04_Atendimentos.gs` (pasta `codigo/`) e **`28_Versao.gs` (só no ZIP privado enviado no chat)**. O ZIP traz os 36 completos, caso queira conferir algum outro.
2. Implantar → Gerenciar implantações → lápis → Versão: **Nova versão** → Implantar. Nunca "Nova implantação".
3. No editor, selecionar `adminSelarManifestoHtml` e **Executar** (uma vez, logo após publicar). O Registro de execução mostra os três hashes gravados.
4. Abrir o sistema → botão **Análise**. Esperado: "Pacote: 19.9.1 de 2026-09-28" e **"ÍNTEGRO: idêntico ao pacote 19.9.1"**. Se algum `.gs` aparecer como "DIFERENTE DO PACOTE", o arquivo colado nessa posição não é o do pacote: colar de novo a partir do ZIP e publicar nova versão. Se aparecer "CONFERÊNCIA PENDENTE DOS HTML", o passo 3 não foi executado (ou foi executado antes de publicar).
5. Opcional: `clavConferirArquivos` (31 encontrados, 0 faltando) e `testarFaixasSV` (20 OK), como na v19.9.

---

## 5. Roteiro de teste pós-implantação (5 minutos)

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Abrir um atendimento com a Conclusão da avaliação em branco → **Encerrar**. | Modal "Encerramento bloqueado" listando "Conclusão da avaliação pré-anestésica" com botão **Ir ao campo**; nenhuma caixinha de ciência; sem chamada à planilha. |
| 2 | Clicar **Ir ao campo**. | Aba Pré-anestésico aberta, bloco "Solicitações, avaliações complementares e pareceres" expandido, campo Conclusão destacado e com foco. |
| 3 | Escolher a Conclusão → **Encerrar**. | Se houver alertas graves: modal "Ciência de alertas graves" só com caixinhas; marcar → "Registrar ciência e encerrar" → "Atendimento encerrado". |
| 4 | Caso de teste: procedimento de linha média (ex.: hernioplastia umbilical) gravado com lateralidade "Direita" → Encerrar. | O alerta "Procedimento sem lateralidade anatômica…" (só a planilha gera) aparece no modal de ciência; marcar → encerra. Antes, este caso nunca encerrava. |
| 5 | Em qualquer atendimento, aba SRPA (ou Triagem, Documentos), rolar até o fim. | O cartão "Fluxo do atendimento" com o nome do paciente fica preso logo abaixo do cabeçalho. |
| 6 | Botão **Análise** (após o passo 3 da implantação). | "ÍNTEGRO: idêntico ao pacote 19.9.1"; nenhuma função fora do manifesto. |

---

## 6. Plano de volta

- Código: Implantar → Gerenciar implantações → escolher a versão anterior → Implantar.
- Planilha: nada a reverter (esta versão não altera esquema nem dados). O selo dos HTML fica numa propriedade do script (`CLAV_SELO_HTML`) e é ignorado por versões que não o conhecem.

---

## 7. Pendências e decisões (continuam com o Daniel)

As decisões da v19.9 permanecem (grafia Roberta Jacob × Jacoby; campo glicemia na triagem; perfil SECRETARIA; cancelamento pela recepção; `adminRotacionarCredenciaisIniciais`). Registradas nesta versão, sem mexer:

1. `documentos.relatorio_narrativo` continua sendo regravado a cada renderização, com hora. O ideal é gerá-lo só ao imprimir/salvar; não foi alterado porque muda o conteúdo que hoje vai ao PDF narrativo. A impressão digital já o ignora.
2. O servidor devolve os alertas sem o estado de ciência; a tela agora o mescla ao receber. O ideal é o servidor devolver `ciente` já calculado.
3. A lista de alertas da tela e a do servidor são duas implementações (`gerarAlertas` × `gerarAlertasServidor_`) e divergem em três alertas graves. Unificar num único módulo compartilhado evita nova divergência.

---

## 8. Como este pacote foi produzido

Diagnóstico a partir das capturas de tela e do relatório da Análise enviados após a implantação da v19.9; leitura das duas implementações de alertas e do fluxo de encerramento; reprodução dos três defeitos em teste headless (pasta `testes/`, `e2e-resultado-v199-antes.json`); correções cirúrgicas nos 4 arquivos; reprodução do algoritmo do manifesto (`testes/manifest_tool.js`) validada contra a Análise real. Para reexecutar: `NODE_PATH=/opt/node22/lib/node_modules node e2e.js <pasta-com-os-36-arquivos>`.
