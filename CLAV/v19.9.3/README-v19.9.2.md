# CLAV v19.9.2 — Correções pontuais de tela autorizadas

**Data:** 28/09/2026 · **Base:** v19.9.1 (mesmo projeto Apps Script `app_clav_07092026-0423`, 36 arquivos) · **Planilha:** CLAV | Sistema Perioperatório | Base de Dados (esquema 8, sem alteração de esquema nem de dados)

Versão gravada no código: `2026.09.28-clav-perioperatorio-v19.9.2-ajustes-visuais-blocos-reordenaveis` (em `00_Config.gs` e no bootstrap do `Index.html`). Pacote `19.9.2` em `CLAV_BUILD_` e no manifesto (`28_Versao.gs`).

Histórico: `README-v19.9.1.md` (encerramento, cartão fixo, manifesto) e `README-v19.9.md` (ficha com sessão própria, integridade da base, alertas de sinais vitais). A lista de pedidos com a avaliação de risco de cada um está em `correcoes-pontuais-pos-v19.9.1.md`.

---

## 1. O que foi pedido e o que foi feito

Cada item foi anotado, avaliado quanto ao risco e só executado depois da autorização. Nenhum toca em dados, salvamento, servidor ou PDF.

| # | Pedido | O que mudou |
|---|---|---|
| 1 | Visão: "Retomar rascunho local" na cor do aviso; "Ver alertas" em vermelho. | CSS por identificador: âmbar dos avisos e vermelho dos alertas graves. |
| 2 | Selos ao lado dos títulos dos blocos pareciam botões e mostravam a mãozinha. | Causa: o cabeçalho de cada bloco recolhível é clicável e o selo herdava o cursor. Regra única para `span.chip` dentro dos cabeçalhos: pílula, fundo suave, sem mãozinha. Botões de verdade (`chip-btn`) continuam iguais. |
| 3 | Atalhos rápidos de medicações ocupavam espaço sem uso. | Fileira e texto de ajuda nascem recolhidos; botão **Atalhos** no cabeçalho do bloco abre e fecha; escolha guardada por usuário neste navegador. Nenhum atalho foi retirado. |
| 4 | Retirar Cloro e Cálcio. | **Retirado a pedido**; nada mudou. |
| 5 | Escala de dor do adulto só com números. | Fileira de desenhos do adulto oculta; números 0–10 e "Não se aplica" gravam o mesmo campo. Pediátrica mantém os desenhos. |
| 6 | Atalho clicado na barra do pré-anestésico com destaque evidente, válido nos 20 estilos. | Não existia estado "atual" (só "preenchido", em verde fixo). O clique marca o chip como atual: traço interno, anel e peso maior, nas variáveis de cor do tema ativo. |
| 7 | Cores em Novo e Sair; legendas ao passar o mouse diferenciando Encerrar, Novo e Sair. | Novo na cor do tema, Sair em vermelho discreto; atributo `title` em Encerrar, Reabrir, Novo e Sair com o comportamento real de cada um. |
| 8 | Ficha intraoperatória: destacar Paciente, Cirurgia realizada e estado do caso; menu esquerdo recolhido por padrão. | Cabeçalho da tela recebe a classe `cab-tela`: borda forte e valor maior nas duas caixas; estado com cor por situação (iniciar, encerrar, encerrado) e chip de estado com classe própria. **A folha impressa não muda.** Menu esquerdo nasce recolhido, espelhando a regra do painel direito; quem abrir e o navegador lembrar continua aberto. |
| 9 | Fonte maior salva para o usuário que aumentou. | Nível guardado por usuário neste navegador e aplicado logo após o login; quem nunca ajustou herda o nível geral; ao sair, volta ao geral. |
| 10 | Recuperação por 7 dias. | **Sem alteração**: não há prazo de validade; rascunhos ficam no navegador por tempo indeterminado. O que limita é o próprio navegador e a janela de autosave (30 s, constante `LOCAL_AUTOSAVE_SECONDS` em `00_Config.gs`). |
| 11 | Subir e descer os blocos do pré-anestésico. | Botão **Reorganizar** na barra de atalhos mostra setas ▲▼ em cada bloco; a ordem fica guardada por usuário neste navegador; **Ordem padrão** desfaz; a barra de atalhos é refeita na nova ordem; o cabeçalho adesivo fica fora. Os campos continuam ligados por nome: salvar, carregar, PDF e impressão digital não mudam, e reordenar não marca o formulário como alterado. |

## 2. Arquivos alterados (4)

| Arquivo | Mudança |
|---|---|
| `Index.html` | Itens 1, 2, 3, 5, 6, 7, 9 e 11; bloco de CSS "v19.9.2" no fim da folha principal; `prefKeyUsuario`/`aplicarPreferenciasDoUsuario` (chamada ao final de `applyPermissionsUI`); `toggleMedChips`; `montarBarraPreop`, `aplicarOrdemPreop`, `moverSubboxPreop`, `alternarReordenacaoPreop`, `restaurarOrdemPreop`; `irParaSubbox` marca o chip atual; versão do bootstrap. |
| `Intra.html` | Item 8: classe `cab-tela` no cabeçalho da tela, classes de estado no botão do caso e no chip de estado, CSS de destaque, menu esquerdo recolhido por padrão. |
| `00_Config.gs` | `VERSION` → v19.9.2. |
| `28_Versao.gs` | `CLAV_BUILD_` 19.9.2 (novidades, histórico com 19.9.1); manifesto regenerado (32 módulos, 376 funções, `config_hash`). **Arquivo entregue só no ZIP privado.** |

Os outros 32 arquivos são idênticos aos da v19.9.1.

## 3. Verificação

- Sintaxe: 42 blocos (32 `.gs` + scripts de `Index.html` e `Intra.html` renderizado), zero erros. Cruzamento de chamadas ao servidor e IDs do DOM sem faltas.
- Manifesto: 32/32 módulos e `config_hash` conferem; nenhuma função fora do manifesto.
- Playwright: **72 OK / 0 falhas, zero erros de console**, sendo 18 verificações novas (cores, legendas, selo sem mãozinha, escala do adulto, atalhos de medicações com preferência, atalho atual, fonte por usuário, reordenação com persistência, ordem padrão, volta da fonte ao sair, ficha com menu recolhido e cabeçalho destacado).
- Não executado dentro do Google Apps Script nem contra a planilha real.

## 4. Implantação (mesma URL /exec)

1. Colar por cima e salvar: `Index.html`, `Intra.html`, `00_Config.gs` (pasta `codigo/`) e `28_Versao.gs` (ZIP privado).
2. Implantar → Gerenciar implantações → lápis → **Nova versão** → Implantar.
3. Executar `adminSelarManifestoHtml` no editor (os dois HTML mudaram; o selo anterior deixa de valer sozinho, porque é por build).
4. Botão **Análise**: esperado "Pacote: 19.9.2" e "ÍNTEGRO: idêntico ao pacote 19.9.2".

## 5. Roteiro de teste (5 minutos)

| # | Passo | Esperado |
|---|---|---|
| 1 | Aba Visão. | "Retomar rascunho local" âmbar; "Ver alertas" vermelho; "Novo" na cor do tema; "Sair" vermelho; passar o mouse mostra a legenda de cada botão. |
| 2 | Pré-anestésico, passar o mouse sobre "Via aérea"/"Dor não registrada". | Pílula com fundo suave, cursor normal. |
| 3 | Bloco Medicações em uso. | Sem a fileira de atalhos; botão "Atalhos" abre; ao recarregar, continua como ficou. |
| 4 | Escala de dor. | Adulto só números; pediátrica com desenhos. |
| 5 | Clicar num atalho da barra (ex.: Exame físico). | Chip em destaque na cor do tema; trocar de tema mantém o destaque. |
| 6 | Barra → Reorganizar → setas num bloco → Concluir. | Bloco muda de lugar, barra acompanha, status de salvamento não muda; recarregar mantém a ordem; "Ordem padrão" desfaz. |
| 7 | A+ duas vezes, sair, entrar com outro usuário. | O outro usuário vê o tamanho geral; ao voltar, o primeiro vê o tamanho maior. |
| 8 | Ficha intraoperatória. | Menu esquerdo recolhido; Paciente e Cirurgia realçados; "Iniciar caso" verde cheio; ao encerrar, "Caso encerrado" cinza; imprimir a ficha e conferir que a folha está igual à anterior. |

## 6. Plano de volta

Implantar → Gerenciar implantações → versão anterior → Implantar. As preferências por usuário ficam só no navegador e são ignoradas por versões que não as conhecem.

## 7. Pendências que continuam com o Daniel

As mesmas da v19.9.1 (duas implementações de alertas; relatório narrativo regravado com hora; servidor sem `ciente`; itens herdados da v19.9), mais: reconhecer nomes comerciais de combinações na busca de medicações é mudança no catálogo da planilha, não na tela.
