# Testes headless do CLAV (Playwright + ponte google.script.run simulada)

- `e2e.js` — 79 verificações dos fluxos críticos (Index e ficha): sessão da ficha, encerramento (impedimentos, ciência de alerta só do servidor, trava de repetição), cartão do paciente fixo os ajustes da v19.9.2 (cores, selos, atalhos de medicações, escala de dor, atalho atual, fonte por usuário, blocos reordenáveis, ficha) e o conflito da ficha (v19.9.3). Uso: `NODE_PATH=/opt/node22/lib/node_modules node e2e.js <pasta-com-os-36-arquivos>`.
- `mock.js` — servidor Apps Script simulado (envelopes `{ok,data}`, revisões, conflito, sessão, fila, encerramento com bloqueios e ciência).
- `before.js` — cenários da v19.9 com checagens tolerantes, para evidenciar a v19.8.
- `sticky_probe.js` — mede a posição do cartão do paciente em cada aba ao rolar (1400 e 1100 px).
- `debug_encerrar.js` — rastreio passo a passo do encerramento (chamadas, toasts, impressão digital).
- `syntax_check.js` — `node --check` em todos os `.gs` e blocos `<script>` (template renderizado).
- `cross_check.js` — chamadas ao servidor ↔ funções públicas; IDs do DOM.
- `manifest_tool.js` — reproduz `clavHashModulo_`/`clavHashConfig_`: `validate` compara com o manifesto do código; `generate <build>` escreve `manifesto_gerado.js` para colar em `28_Versao.gs`.
- `render_intra.py` — renderiza o template `Intra.html` como o `doGet`/`include()` fazem.
- `faixas.json` — cópia de `FAIXAS_SV_CLAV` usada pelo simulador.
- `e2e-resultado-v1993.json` / `e2e-resultado-v1992.json` / `e2e-resultado-v1991.json` / `e2e-resultado-v199-antes.json` / `before-resultado.json` — execuções de 28/09/2026 (v19.9.3, v19.9.2, v19.9.1, v19.9 e v19.8).

Requisitos: Node 22, Playwright 1.56 com Chromium. Nada aqui toca o Apps Script real nem a planilha.

## v19.10
- `server_unit.js` (novo): carrega os `.gs` num sandbox Node com `Utilities.formatDate` real e planilha simulada; cobre lateralidade pelo catálogo, leitura de datas (D-1), diagnóstico/normalização das colunas de data, prescrição de internação, `forcarRevisao` e rótulos do PDF. Uso: `node server_unit.js clav-fix`. Resultado em `server-unit-resultado.json` (35 OK).
- `e2e.js`: 34 verificações novas (bloco "v19.10"), com `mock.js` aceitando `meta.forcarRevisao` e assumindo o responsável ao encerrar. Resultado em `e2e-resultado-v1910.json` (113 OK).
- `shots_v1910.js`: capturas de tela das telas alteradas em `shots-v1910/`.

## v19.11
- `server_unit.js`: seção "[v19.11]" com a folha impressa no motor do servidor (`buildPdfSections_`), grade fixa, célula em linha e o documento PEDIDOS (49 OK).
- `e2e.js`: bloco "v19.11" (15 verificações: tela e estrutura da folha). Resultado em `e2e-resultado-v1911.json` (128 OK).
- `shots_v1911.js`: capturas em `shots-v1911/` (exame físico, revisão, via aérea, solicitações, folha e pedidos).
