# CLAV v19.9 — Ficha intraoperatória com sessão própria, integridade da base e alertas de sinais vitais

**Data:** 28/09/2026 · **Base:** export do projeto Apps Script `app_clav_07092026-0423` (v19.8, 36 arquivos) · **Planilha:** CLAV | Sistema Perioperatório | Base de Dados (esquema 8, sem alteração de esquema nesta versão)

Versão gravada no código: `2026.09.28-clav-perioperatorio-v19.9-ficha-sessao-integridade-alertas` (em `00_Config.gs` e no bootstrap do `Index.html`).

---

## 1. O que estava acontecendo com o intraoperatório (e a "URL exec")

A auditoria real da planilha mostra **227 erros `SESSION_INVALID` e 193 `SESSION_EXPIRED` vindos da ficha** e **55 `CONFLITO_REVISAO`**. Isso é o que a equipe vivia:

1. **A ficha abria em outra aba "Sem sessão".** O sistema guarda o login no armazenamento do navegador; quando o CLAV roda dentro do Google Sites (ou num tablet), o navegador **separa o armazenamento da aba nova**, e a ficha não achava a sessão. O que a pessoa via era exatamente isto: uma aba nova com o endereço `script.google.com/macros/s/.../exec?page=intra...` e a ficha dizendo "Entre no sistema principal e abra a ficha novamente". A URL não é o defeito, é o sintoma visível de que a aba nasceu sem sessão.
2. **Depois de qualquer salvamento no sistema principal, a ficha parava de gravar até dar F5.** A ponte lia o código do erro em `res.code`, mas o servidor manda em `res.error.code`; o conflito de revisão nunca era reconhecido e a ficha reenviava a mesma revisão velha seis vezes.
3. **Durante a cirurgia, o sistema principal não conseguia salvar** ("Conflito: rascunho preservado"), porque a ficha sobe a revisão a cada gravação e o Index reenviava o bloco `intraop` antigo com a revisão antiga.
4. **Rascunho antigo vencia o prontuário mais novo.** A ficha carimbava "agora" na cópia local ao comparar, então um rascunho de ontem no computador da sala sobrescrevia o que foi lançado hoje no tablet (perda de dados, reproduzida em teste).
5. **Biblioteca de fármacos nunca foi incluída na ficha** (o `include('IntraFarmacos')` prometido no código não existia).

Sobre o endereço `/exec` na barra do navegador: **é inerente ao Google Apps Script**. Qualquer página do Web App aberta em aba própria mostra `script.google.com/macros/s/.../exec`. Só o embed no Google Sites esconde isso, e a ficha precisa de aba própria por decisão fixa do projeto. O que foi eliminado: (a) a ficha nascer sem sessão, (b) o `caso` na URL ser aceito sem filtro (era um XSS refletido), (c) as três mensagens de erro que citavam "implantação /exec" para causas que nada tinham a ver com implantação.

---

## 2. O que mudou, arquivo por arquivo

| Arquivo | Mudança | Por quê |
|---|---|---|
| `Intra.html` | Ponte reescrita (v19.9): sessão pelo fragmento `#clavtk=` lido por `google.script.url` e apagado por `google.script.history.replace`; **login na própria ficha** (`validarLogin`); **fila do dia** (`intraopFilaDoDia`) quando aberta sem atendimento; código de erro lido de `error.code`; rascunho local comparado pelo carimbo gravado; TTL das abas 5 min; espelho no prontuário a cada 15 s (Salvar continua imediato); "⧉ Aba" abre espelho somente leitura; atendimento encerrado para de insistir; biblioteca de fármacos com dose pelo peso; impressão com logotipo, prontuário/nascimento/atendimento, CRM no carimbo, sem "teste v5"; `<` escapado no bootstrap. | Sessão perdida em outra aba, conflito nunca resolvido, perda de dados por rascunho antigo, biblioteca ausente, documento marcado como teste, XSS. |
| `IntraFarmacos.html` | Cabeçalho passou de comentário HTML para comentário de bloco JavaScript. | Dentro de `<script>` o comentário HTML quebrava a sintaxe do bloco da biblioteca. |
| `Index.html` | URL da ficha com `#clavtk=`; token aceito do fragmento ao iniciar; **Index não envia mais o bloco `intraop`** e, em conflito causado só pela ficha, adota a revisão do servidor e reenvia uma vez; `HTML_VERSION` própria e comparação real tela × servidor; resumo da triagem e alertas usam o classificador oficial (PA 180/80, FC 130, FR 30, Temp 39,1 viram alerta); PA abreviada 12/8; "Triagem concluída" volta atrás se a planilha recusar; nomes das técnicas iguais aos de USUARIOS; IMC só com peso/altura plausíveis; temperatura, peso e altura em campo de texto decimal; datas civis sem UTC; TTL das abas 5 min; timeouts 120 s (login/início) e 300 s (lote de PDF); erros do lote de PDF exibidos; prescrição na prévia com nascimento, prontuário, peso e alergia; mensagens sem jargão de implantação. | Conflitos reais durante a cirurgia, médico não via vermelho, tela desatualizada nunca era detectada, campos numéricos engoliam vírgula conforme o idioma do navegador. |
| `00_Config.gs` | Versão; `svLerPa_` lê PA abreviada; texto da PA informa "(digitado "12/8")". | Formato usado pela equipe saía cinza "Conferir". |
| `01_WebApp.gs` | `caso`, `slot`, `modo` filtrados; `logoUrl` no bootParams. | XSS refletido; logotipo da folha impressa. |
| `04_Atendimentos.gs` | Histórico da ficha no máximo a cada 10 min; resposta sanitizada para perfil operacional; ação `SALVAR_INTRAOPERATORIO` no histórico. | HISTORICO com 11,7 milhões de caracteres em 2 meses; anamnese/conduta chegavam à recepção. |
| `06_Documentos_API.gs` | Lista de tipos válidos; lote com `try/catch` por documento e lista `erros`. | Tipo desconhecido gerava PDF pela metade; um erro derrubava o lote inteiro. |
| `08_Planilha_Base.gs` | `ensureHeaders_` não formata/oculta colunas quando o esquema diverge. | Evita ocultar a coluna errada. **(Arquivo entregue no ZIP privado, ver seção 4.)** |
| `10_Payload_Clinico.gs` | Alertas `SV_*_CRITICO/ATENCAO` no servidor; `DOR_PEDIATRICA_AUSENTE` só para médico; `sanitizeOperationalPayload_` preserva `documentos.resumo` e `seguranca.evento_*`. | Nenhum alerta para PA/FC/FR/Temp; técnica recebia aviso sem campo; texto da recepção descartado com "Salvo com sucesso". |
| `12_Calculos.gs` | IMC só plausível; bloco de cache 60.000. | IMC 2422 com altura "17"; cache estourava com acentos. |
| `19_PDF_Core.gs` | Prescrição com nascimento, prontuário, peso e ALERGIA em vermelho. | Segurança do paciente. |
| `20_PDF_Layout.gs` | Carimbo em um parágrafo por linha. | Só o primeiro parágrafo recebia Arial 10 centralizado. |
| `21_PDF_Secoes.gs` | Classificação dos sinais vitais no PDF; campos estruturados de IVAS/transfusão/AVC/plegia; linha ginecológica só quando pertinente; horários do intraop e da SRPA em dd/mm/aaaa hh:mm. | PDF omitia dados da prévia e imprimia ISO. |
| `22_CRUD.gs` | `safe_` não grava `SESSION_*` na AUDITORIA. | ~700 linhas de ruído. |
| `23_Utils.gs` | **`migrateSheetSchema_` somente aditivo** (fim do `clearContents`); reparo não cria planilha nova sobre ID existente; purga de sessões em uma única escrita. | O caminho que apagou a base na v18 continuava alcançável no carregamento da página. |
| `25_Salvamento.gs` | Resposta sanitizada por perfil; CPF novo/alterado precisa de 11 dígitos; `calcAge_` sem UTC; `historicoIntraopRecente_` (nova). | Duplicidade não detectada com CPF parcial; idade errada na véspera do aniversário. |
| `26_Intraop.gs` | Orçamento de 150 mil caracteres para a ficha, com mensagem clara. | Ficha longa falhava depois com `PAYLOAD_TOO_LARGE`. |
| `27_Pacientes.gs` | Editar cadastro altera só os campos enviados. | Corrigir telefone apagava nome social e contexto de cuidado. |
| `28_Versao.gs` | `CLAV_BUILD_` 19.9 com histórico 19.5–19.8; módulo `30_Catalogo_Correcoes.gs` no manifesto. | Painel dizia "pacote 19.4.1" em instalação v19.8. **(Arquivo entregue no ZIP privado, ver seção 4.)** |
| `29_Chamados.gs` | `build` do chamado inclui `CLAV.VERSION`. | Chamado dizia 19.4.1. |
| `99_Diagnostico.gs` | Casos 5 e 5b (PA 18/8 e 12/8); contagem de funções de `25_Salvamento.gs`. | Testes acompanham a leitura abreviada. |

**Arquivos que NÃO mudaram (não precisam ser colados):** `02_Admin.gs`, `03_Auth.gs`, `05_Relatorios.gs`, `07_Usuarios.gs`, `09_Seguranca.gs`, `11_Farmacologia.gs`, `13_Catalogo.gs`, `14_Dados_Equipe.gs`, `15_Dados_Procedimentos.gs`, `16_Dados_Convenios.gs`, `17_Dados_Medicacoes.gs`, `18_Dados_Municipios.gs`, `24_Sessao.gs`, `30_Catalogo_Correcoes.gs`, `appsscript.json`.

Nenhuma migração de dados, nenhuma coluna nova, nenhuma escrita automática na planilha nesta versão.

---

## 3. Verificação feita antes da entrega

- Sintaxe: `node --check` em cada `.gs`, nos `.gs` concatenados e em cada bloco `<script>` de `Index.html` e `Intra.html` (com o template renderizado como o `include()` real faz). Zero erros.
- Funções: 374 (373 + `historicoIntraopRecente_`), nenhuma removida, nenhuma duplicada. Todas as 33 chamadas `google.script.run` dos HTML existem como função pública.
- IDs do DOM: todos os IDs usados no JavaScript existem no HTML (Index e Intra).
- Casos de teste de sinais vitais (`testarFaixasSV`, 99_Diagnostico): **20 OK / 0 falhas**, incluindo os novos casos de PA abreviada.
- Teste headless (Playwright, ponte `google.script.run` simulada com envelopes, revisões, conflito e sessão): **42 verificações OK / 0 falhas, zero erros de console**, cobrindo login, abertura do atendimento, URL da ficha com sessão, alerta e resumo para PA 180/80, salvamento do Index após a ficha gravar (conflito resolvido, intraop preservado), ficha com sessão pelo fragmento, biblioteca de fármacos e dose por peso, salvamento e conflito na ficha, atendimento encerrado, sessão expirada com login na ficha, ficha sem sessão, fila do dia, rascunho antigo × prontuário novo, modo visualização e tentativa de XSS. O mesmo roteiro rodado no código v19.8 reproduz os defeitos (pasta `testes/`, arquivo `before-resultado.json`).

Não foi possível executar dentro do Google Apps Script nem contra a planilha real. O roteiro pós-implantação abaixo cobre isso.

---

## 4. Implantação (mesma URL /exec, sem trocar de implantação)

**Antes:** Arquivo → Fazer download → `.xlsx` da planilha; anotar a versão ativa em Implantar → Gerenciar implantações.

1. No editor do Apps Script, para cada um dos **21 arquivos alterados**, abrir o arquivo, selecionar tudo, colar o conteúdo novo por cima, **Ctrl+S**. Os 19 arquivos públicos estão em `codigo/`; **`08_Planilha_Base.gs` e `28_Versao.gs` estão apenas no ZIP enviado no chat** (contêm telefones, e-mails e hashes de senha da equipe e não podem ficar num repositório público). O ZIP traz os 36 arquivos completos, prontos para colar.
2. Implantar → Gerenciar implantações → lápis → Versão: **Nova versão** → Implantar. Sem "Nova versão" o site continua servindo o código antigo. **Nunca** "Nova implantação" (URL nova órfã os rascunhos e o Google Sites).
3. No editor, executar `clavConferirArquivos` (31 módulos, 0 faltando) e `testarFaixasSV` (20 OK).
4. Opcional, para o painel Análise voltar a dizer "OK": executar `adminGerarManifesto` e colar o resultado sobre `CLAV_MANIFESTO_` em `28_Versao.gs`, depois nova versão de novo.

**Regra nova de manutenção:** a versão do `Index.html` (`clavBootstrapData` → `version`) tem de ser igual a `CLAV.VERSION`. Se só os `.gs` forem atualizados, a tela avisa "Versões divergentes" no login e recusa salvar até o `Index.html` ser colado também. É proposital: era exatamente a situação "um erro atrás do outro a cada versão".

---

## 5. Roteiro de teste pós-implantação (10 minutos)

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Abrir a URL /exec, entrar. | Sem toast "Versões divergentes"; painel de suporte mostra v19.9. |
| 2 | Abrir um atendimento salvo → Intraoperatório → "Abrir a ficha em outra aba para registrar" (testar também pelo Google Sites e num tablet). | A ficha abre já "Vinculado · Nome do paciente", sem pedir login. Se pedir, entrar com o mesmo usuário: deve vincular. |
| 3 | Na ficha: lançar um sinal, clicar Salvar. Voltar ao sistema principal, alterar a FR na triagem e Salvar. | Ficha: "Salvo no prontuário às hh:mm:ss · rev. N". Sistema principal: salva sem "Conflito" e o painel do intraoperatório reflete a ficha. |
| 4 | Triagem com PA `180/80`, depois PA `12/8`. | 180/80: chip vermelho no bloco 2, alerta "Sinal vital fora da faixa: PAS 180 mmHg" no painel e PA destacada no resumo do pré-anestésico. 12/8: lida como 120/80, normal. |
| 5 | Na ficha, menu esquerdo → "Biblioteca de fármacos", digitar `propofol`. | Doses com total pelo peso do cabeçalho e botão "+ Linha em Drogas". |
| 6 | Na ficha, ☷ Fila (ou abrir `?page=intra` sem caso no tablet). | Lista dos procedimentos com data de cirurgia hoje; tocar abre a ficha vinculada. |
| 7 | Gerar "PDF prescrição" e "PDF anestesia" de um caso com alergia e horários de anestesia. | Prescrição com nascimento, prontuário, peso e ALERGIA em vermelho; horários em dd/mm/aaaa hh:mm. |

---

## 6. Plano de volta

- Código: Implantar → Gerenciar implantações → escolher a versão anterior → Implantar.
- Planilha: nada a reverter (esta versão não altera esquema nem dados). Se necessário, Arquivo → Histórico de versões.
- Navegador: se uma aba antiga da ficha continuar aberta, fechar e abrir de novo pelo sistema principal.

---

## 7. Pendências e decisões que só o Daniel pode tomar

Corrigido nesta versão está na seção 2. O que ficou registrado e **não** foi mexido:

**Decisões**
1. **Nome da Dra. Roberta:** USUARIOS e `14_Dados_Equipe.gs` dizem "Roberta Mattei **Jacob**"; `Index.html` e a decisão fixa do projeto dizem "**Jacoby**". Enquanto divergir, a auditoria de triagem pode acusar "correção por outro profissional" para ela. Definir a grafia e alinhar (uma linha em cada arquivo).
2. **Glicemia na triagem:** o servidor e a ficha leem `triagem.glicemia`, mas não existe campo na tela. Acrescentar o campo (e uma faixa em `FAIXAS_SV_CLAV`) é mudança visual, por isso não foi feita sem pedido.
3. **Perfil "secretária":** não existe; a recepção usa TECNICA. Se quiser um perfil próprio, é preciso criá-lo em `assertCanSave_`, `userPermissions_` e nos textos.
4. **Cancelar atendimento aberto por engano:** hoje só ADMIN/SUPORTE excluem; não há status CANCELADO. Decidir se a recepção pode cancelar enquanto não houver consulta.
5. **Credenciais iniciais no código-fonte** (`08_Planilha_Base.gs`): se `adminRotacionarCredenciaisIniciais` ainda não foi executada, executar uma vez e distribuir as senhas pessoalmente.

**Melhorias mapeadas, sem risco imediato** (relatório completo em `RELATORIO-REVISAO-AGENTES.md`): contador de tentativas de login; gatilho do bate-escala em duas contas; hash documental impresso no rodapé; recuperação dos PDFs arquivados pelo médico; máscara de CPF no formulário principal; busca da lista sem exigir espaços; `revokeAllSessions_` fora do lock; checagem de cabeçalho generalizada para todas as abas; `installationId` do rascunho atrelado à URL da implantação (por isso, sempre "Nova versão").

---

## 8. Como este pacote foi produzido

Seis agentes revisores percorreram o código real com personas (anestesiologista, enfermagem/técnica, secretária, suporte, documentos/PDF, integridade de dados) e devolveram defeitos com arquivo:linha. Cada defeito confirmado foi corrigido de forma cirúrgica e aditiva, sem redesenho, e verificado por sintaxe, cruzamento cliente–servidor e teste headless. O roteiro de teste (`testes/`) pode ser reexecutado em qualquer versão futura: `NODE_PATH=/opt/node22/lib/node_modules node e2e.js <pasta-do-codigo>`.
