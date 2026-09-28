# CLAV v19.9.3 — Salvar e encerrar depois de abrir a ficha intraoperatória

**Data:** 28/09/2026 · **Base:** v19.9.2 (mesmo projeto Apps Script `app_clav_07092026-0423`, 36 arquivos) · **Planilha:** CLAV | Sistema Perioperatório | Base de Dados (esquema 8, sem alteração de esquema nem de dados)

Versão gravada no código: `2026.09.28-clav-perioperatorio-v19.9.3-encerrar-apos-ficha`. Pacote `19.9.3` em `CLAV_BUILD_` e no manifesto.

Histórico: `README-v19.9.2.md` (correções de tela e blocos reordenáveis), `README-v19.9.1.md` (encerramento, cartão fixo, manifesto), `README-v19.9.md` (ficha com sessão própria). Pedidos avaliados um a um em `correcoes-pontuais-pos-v19.9.1.md`.

**Escopo autorizado nesta versão: só o item 12** (conflito depois de abrir a ficha). As regras de encerramento (impedimentos, ciência de alertas, conflito real) não mudaram; o item 13 aguarda decisão.

---

## 1. O relato e o que estava por trás

"Abri o intraoperatório só para ver, fechei, e ao encerrar apareceu *Falha ao salvar: este atendimento foi alterado em outra aba ou por outro usuário*."

1. **A ficha grava mesmo quando só se olha.** Num caso já iniciado, abrir a ficha de registro ativa as marcações vencidas pelo relógio e dispara o salvamento automático: em 15 segundos, ou ao trocar de aba, ela espelha no prontuário e a revisão sobe. Só o modo visualização, embutido no sistema principal, não grava.
2. **O sistema principal não absorvia essa revisão.** A resolução automática da v19.9 dependia da cópia do servidor guardada na tela; ao recarregar a página o caso volta do rascunho sem essa cópia, e o mesmo acontece em "Retomar rascunho local". Além disso, a comparação "só o intraop mudou" incluía o relatório narrativo regravado com hora, e a impressão digital de "alterações pendentes" incluía os cálculos derivados, que mudam quando a ficha é absorvida. Resultado: conflito em vermelho ou "Há novas alterações pendentes" logo depois de salvar.

## 2. O que mudou (4 arquivos + versão)

| Arquivo | Mudança |
|---|---|
| `25_Salvamento.gs` | `revisoesSomenteDaFicha_`: consulta a aba OPERACOES revisão por revisão; só é verdadeiro quando **todas** as gravações entre a revisão lida pela tela e a atual têm `request_id` da ficha ("INTRA5-…"). `assertTransitionRevision_` (encerrar/reabrir) aceita esse caso. |
| `04_Atendimentos.gs` | `salvarAtendimento`: no conflito de revisão, se o payload não traz `intraop`, não vem da ficha e as revisões intermediárias são só da ficha, a gravação segue (a mesclagem preserva a ficha); a auditoria registra `rebase_ficha: {de, para}`. Revisão sem registro ou de outra origem continua conflito. |
| `Index.html` | `adotarIntraopDoServidor` usa o próprio formulário como base quando não há cópia do servidor e nada está pendente, e atualiza o estado sincronizado; `sincronizarRevisaoDaFicha` ao voltar para a aba e antes de Encerrar; `semIntraopNemMetadados` com as exclusões da impressão digital; `fingerprintData` sem `calculos`; `ResizeObserver` no cabeçalho para o cartão do paciente e a barra do pré-anestésico acompanharem a altura real; versão. |
| `00_Config.gs` | `VERSION` → v19.9.3. |
| `28_Versao.gs` | `CLAV_BUILD_` 19.9.3 e manifesto regenerado. **Só no ZIP privado.** |

`Intra.html` não mudou nesta versão (o da v19.9.2 continua valendo).

## 3. Verificação

- Sintaxe 42 blocos / 0 erros; cruzamento de chamadas e IDs sem faltas; manifesto 32/32 + `config_hash`.
- Playwright: **79 OK / 0 falhas, zero erros de console**. Cenários novos: caso restaurado sem cópia do servidor + ficha gravou → sincroniza em silêncio e Encerrar conclui; edição pendente + ficha gravou → o servidor aceita a gravação por cima, preserva a ficha e encerra; gravação de outra pessoa → conflito continua, nada sobrescrito.
- Não executado dentro do Google Apps Script nem contra a planilha real.

## 4. Implantação (mesma URL /exec)

1. Colar por cima e salvar: `Index.html`, `04_Atendimentos.gs`, `25_Salvamento.gs`, `00_Config.gs` (pasta `codigo/`) e `28_Versao.gs` (ZIP privado). Se a v19.9.2 ainda não foi colada, colar também `Intra.html` (pasta `codigo/`).
2. Implantar → Gerenciar implantações → lápis → **Nova versão** → Implantar.
3. Executar `adminSelarManifestoHtml` no editor.
4. Botão **Análise**: esperado "Pacote: 19.9.3" e "ÍNTEGRO: idêntico ao pacote 19.9.3".

## 5. Roteiro de teste (3 minutos)

| # | Passo | Esperado |
|---|---|---|
| 1 | Abrir um atendimento já iniciado na ficha; recarregar a página do sistema principal (o caso volta do rascunho); abrir a ficha em outra aba, esperar 20 s, voltar. | Chip de salvamento mostra "Ficha atualizada · rev. N"; sem vermelho. |
| 2 | Clicar **Encerrar** (com conclusão preenchida e ciência dos alertas). | Encerra sem "alterado em outra aba". |
| 3 | Editar um campo (ex.: FR), abrir a ficha, esperar 20 s, voltar e clicar **Salvar**. | Salva por cima; a ficha continua com os lançamentos; a AUDITORIA mostra `rebase_ficha` no evento. |
| 4 | Duas pessoas no mesmo atendimento: a segunda salva depois da primeira ler. | A primeira continua recebendo "alterado em outra aba" ao salvar (proteção mantida). |

## 6. Plano de volta

Implantar → Gerenciar implantações → versão anterior → Implantar. Nada a reverter na planilha.

## 7. Pendente de decisão (item 13)

"Encerrar a qualquer custo": impedimentos rígidos (CFM), ciência de alertas graves e conflito real continuam como estão até a decisão do Daniel com o irmão.
