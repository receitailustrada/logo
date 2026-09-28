# CLAV v19.8 → v19.9 — Relatório consolidado dos agentes revisores

Seis agentes independentes leram o código real (36 arquivos) e a exportação da planilha (227 atendimentos, 220 pacientes, 1.255 versões em HISTORICO, 2.626 linhas de AUDITORIA), cada um com uma persona e um fluxo de trabalho. Abaixo, cada achado com o status nesta versão.

Legenda: **CORRIGIDO** (v19.9) · **MITIGADO** (reduzido, não eliminado) · **DECISÃO** (depende do Daniel) · **PENDENTE** (mapeado, sem alteração)

## Evidência empírica (planilha real)
- 227/227 payloads íntegros, vínculo paciente–atendimento e `payload_hash` conferem; 0 duplicidades de IDs.
- AUDITORIA: 367 `ERRO_intraopSalvar` (227 `SESSION_INVALID`, 131 `BLOQUEADO`), 193 `ERRO_intraopAbrirCaso` (`SESSION_EXPIRED`), 55 `CONFLITO_REVISAO`. Este é o "não dá em nada" do intraoperatório, em números.
- HISTORICO: 11,7 milhões de caracteres em dois meses; um caso com 66 versões (ficha gravando a cada 2,5 s).

---

## 1. Anestesiologista (ficha intraoperatória)
| Achado | Gravidade | Status |
|---|---|---|
| Código de erro lido de `res.code` (inexistente): ficha nunca se recupera do conflito de revisão e falha até o F5 | GRAVE | **CORRIGIDO** (`Intra.html`, ponte) |
| `serializar()` carimba "agora": rascunho local antigo sobrescreve prontuário mais novo (perda de dados, reproduzida em teste) | GRAVE | **CORRIGIDO** (carimbo gravado no dispositivo) |
| Sessão não atravessa para a aba nova (Google Sites, tablets, logout); ficha sem como se reautenticar | GRAVE | **CORRIGIDO** (fragmento `#clavtk=` + login na ficha + releitura do token) |
| XSS refletido pelo parâmetro `caso` | GRAVE (segurança) | **CORRIGIDO** (`01_WebApp.gs` filtra; `Intra.html` escapa `<`) |
| "Duas fichas abertas" fantasma por 6 h | MODERADO | **CORRIGIDO** (5 min sem batimento) |
| Autosave a cada 2,5 s grava revisão + HISTORICO integral a cada toque; toasts durante a edição | MODERADO | **CORRIGIDO** (espelho a cada 15 s, HISTORICO da ficha a cada 10 min, toast só na 1ª falha e no Salvar) |
| Biblioteca de fármacos não incluída na ficha | MODERADO | **CORRIGIDO** (include + painel com dose por peso e kits) |
| Impressão marcada "(teste v5)", "CASO-TESTE", `versao:'teste-5.0'`; sem prontuário/nascimento/atendimento; carimbo sem CRM; sem logotipo | MODERADO | **CORRIGIDO** |
| `intraopFilaDoDia`/`intraopOpcoes` sem uso | LEVE | **CORRIGIDO** para a fila (agora usada); `intraopOpcoes` continua disponível sem uso |
| "⧉ Aba" abria o mesmo caso em duas abas de registro (ping-pong de revisão) | LEVE | **CORRIGIDO** (abre espelho somente leitura) |
| Mensagens com "/exec" e "Reimplante o Web App" | LEVE | **CORRIGIDO** |

## 2. Enfermagem e técnicas (triagem)
| Achado | Gravidade | Status |
|---|---|---|
| Resumo da triagem para o médico usa limites próprios: PA 180/80 sem destaque | GRAVE | **CORRIGIDO** (classificador oficial) |
| Nenhum alerta para PA/FC/FR/Temp críticos (só SpO₂ < 92) no servidor e na tela | GRAVE | **CORRIGIDO** (`SV_*_CRITICO/ATENCAO` em `10_Payload_Clinico.gs` e `Index.html`) |
| Temperatura, peso e altura `type="number"`: vírgula depende do idioma do navegador e valor inválido some em silêncio | GRAVE (condicional) | **CORRIGIDO** (texto com `inputmode="decimal"`) |
| PA abreviada "12/8"/"18/8" vira "Conferir" cinza | MODERADO | **CORRIGIDO** (lida como 120/80 e 180/80, com registro do digitado) |
| "Triagem concluída" fica marcada mesmo com salvamento recusado | MODERADO | **CORRIGIDO** |
| `DOR_PEDIATRICA_AUSENTE` para técnica sem campo; glicemia sem campo | MODERADO | **CORRIGIDO** o alerta (só médico); glicemia é **DECISÃO** (campo novo na tela) |
| Nomes de TRIAGE_STAFF ≠ USUARIOS geram "correção por outro profissional" falsa | MODERADO | **CORRIGIDO** para Liamara, Camila Portela e Fabiana; Roberta (Jacob × Jacoby) é **DECISÃO** |
| IMC sem trava de plausibilidade (altura "17" → IMC 2422) | LEVE | **CORRIGIDO** (cliente e servidor) |
| PDF sem classificação dos sinais vitais | LEVE | **CORRIGIDO** (linha "Classificação dos sinais vitais") |
| "Secretária" citada na UI sem perfil SECRETARIA | LEVE | **DECISÃO** |

## 3. Secretária / recepção
| Achado | Gravidade | Status |
|---|---|---|
| Texto de "Qualidade, intercorrência e evento" e "Relatório clínico textual" descartado com "Salvo com sucesso" | GRAVE | **CORRIGIDO** (`sanitizeOperationalPayload_`) |
| "Editar cadastro" apaga `nome_social` e `contexto_cuidado` | GRAVE | **CORRIGIDO** (`27_Pacientes.gs` só altera campos enviados) |
| Resposta do salvamento devolve payload clínico completo ao perfil operacional | GRAVE (LGPD) | **CORRIGIDO** (`04_Atendimentos.gs`, `25_Salvamento.gs`) |
| Histórico do paciente mostra a cirurgia um dia antes (data civil interpretada em UTC) | MODERADO | **CORRIGIDO** (`formatDateTime`) |
| CPF sem validação no formulário principal | MODERADO | **MITIGADO** (servidor recusa CPF novo/alterado com ≠ 11 dígitos; máscara no formulário principal **PENDENTE**) |
| Atendimento aberto por engano não pode ser retirado da agenda pela recepção | MODERADO | **DECISÃO** |
| Idade gravada em UTC congela | MODERADO | **CORRIGIDO** (`calcAge_`) |
| Busca da lista remove espaços; fallback de municípios; `userPermissions_.save` ≠ `assertCanSave_`; textos sem saída | LEVE | **PENDENTE** |

## 4. Suporte
| Achado | Gravidade | Status |
|---|---|---|
| Painel Análise e chamados declaram "pacote 19.4.1" em instalação v19.8; manifesto sem `30_Catalogo_Correcoes.gs` | GRAVE | **CORRIGIDO** (`CLAV_BUILD_` 19.9 com histórico; módulo no manifesto; hashes dependem de `adminGerarManifesto`) |
| Checagem "Versões divergentes" comparava servidor com servidor; versão do HTML se perdia | GRAVE | **CORRIGIDO** (`HTML_VERSION`) |
| Ficha em outra aba sem sessão no Google Sites | MODERADO | **CORRIGIDO** |
| Rascunhos e escopo do intraop chaveados pela URL /exec ("Nova implantação" órfã tudo) | MODERADO | **PENDENTE** (procedimento: sempre "Nova versão"; mudar exige tocar `saveScope_` na mesma versão) |
| Falhas de login sem rastro e sem freio | MODERADO | **PENDENTE** |
| Gatilho do bate-escala pode duplicar entre contas | MODERADO | **PENDENTE** |
| Credenciais iniciais no código-fonte | MODERADO (segurança) | **DECISÃO** (executar `adminRotacionarCredenciaisIniciais`); por isso `08_Planilha_Base.gs` não vai ao repositório público |
| Mensagem do carregador culpa a implantação em navegador antigo; `SCHEMA_DIVERGENTE` sem orientação; bloco de cache 90.000; anexos de chamado sem teto | LEVE | **CORRIGIDO** (mensagem e cache); orientação do `SCHEMA_DIVERGENTE` fica no log do servidor; teto de anexos **PENDENTE** |
| Timeout do cliente (60 s) menor que o cold start | — | **CORRIGIDO** (120 s para login/início, 300 s para lote de PDF) |

## 5. Documentos e PDF
| Achado | Gravidade | Status |
|---|---|---|
| PDF oficial perde IVAS, transfusão, AVC e plegia que a prévia imprime | GRAVE | **CORRIGIDO** |
| Prescrição sem alergia, peso, nascimento e prontuário | GRAVE | **CORRIGIDO** (PDF e prévia) |
| Horários do intraop/SRPA em ISO | GRAVE | **CORRIGIDO** |
| Timeout do cliente < guarda do servidor no lote | MODERADO | **CORRIGIDO** |
| Lote sem try/catch por documento | MODERADO | **CORRIGIDO** |
| Hash não impresso; páginas 2+ sem identificação | MODERADO | **PENDENTE** |
| Tipo de documento não validado | MODERADO | **CORRIGIDO** |
| Sinais vitais sem faixa no PDF | MODERADO | **CORRIGIDO** (linha de classificação) |
| Linha ginecológica "Sem alterações" em homem | MODERADO | **CORRIGIDO** |
| PDF arquivado irrecuperável pelo médico | MODERADO | **PENDENTE** |
| Ficha v5 impressa pode estourar a página | MODERADO | **CORRIGIDO** (`break-inside: avoid`) |
| Ficha v5: assinatura sem CRM, sem logotipo | MODERADO | **CORRIGIDO** |
| Carimbo com `\n` num único parágrafo | LEVE | **CORRIGIDO** |
| Serviço avançado Docs; e-mails de compartilhamento; rótulos divergentes; `crmDoProfissional_` por prefixo; Docs temporários na lixeira | LEVE | **PENDENTE** |

## 6. Integridade de dados e planilha
| Achado | Gravidade | Status |
|---|---|---|
| Migração automática com `clearContents` alcançável no carregamento/login (lição da v18) | BLOQUEANTE (latente) | **CORRIGIDO** (`migrateSheetSchema_` somente aditivo; `ensureHeaders_` não formata quando diverge) |
| Reparo pode religar o sistema a uma base nova e vazia | GRAVE | **CORRIGIDO** (`getOrCreateSpreadsheet_`) |
| Ficha longa não cabe nas 5 colunas | GRAVE | **MITIGADO** (orçamento de 150 mil com mensagem clara; caso realista de 12 h cabe) |
| Index praticamente não salva durante a cirurgia (55 conflitos reais) | GRAVE | **CORRIGIDO** (Index não envia `intraop`; rebase automático) |
| Ficha perde a sessão e falha em silêncio; atendimento encerrado continua tentando | GRAVE | **CORRIGIDO** |
| AUDITORIA poluída por erros de sessão | MODERADO | **CORRIGIDO** |
| HISTORICO sem limite | MODERADO | **MITIGADO** (ficha: 1 versão a cada 10 min; rotação manual da aba continua recomendada) |
| `purgarLinhasAntigas_` com clear + setValues | MODERADO | **CORRIGIDO** (uma única escrita) |
| `revokeAllSessions_` fora do lock; atalho "sem alteração" frágil; checagem de cabeçalho só em 3 abas | MODERADO | **PENDENTE** |
| Duas fichas do mesmo caso | MODERADO | **MITIGADO** ("⧉ Aba" abre espelho; fila e Index escolhem o slot já usado pelo caso) |
| Colunas vazias no fim de ATENDIMENTOS; `excluirAtendimento` regrava datas convertidas; `upsertConfigValue_` sem lock | LEVE | **PENDENTE** (as colunas vazias deixaram de ser perigosas com a migração aditiva) |

## O que os agentes destacaram como sólido
- Núcleo de gravação: lock, esquema, idempotência com recibo, revisão, hash significativo, releitura verificada, HISTORICO/OPERACOES/AUDITORIA. A base real confirma (227/227).
- Motor de faixas de sinais vitais único cliente/servidor com "completo não é normal" e 20 casos de teste.
- Perfis bem isolados; leituras leves por coluna; soft delete respeitado; PDFs privados por bytes; logo em cache; carimbo por perfil.
