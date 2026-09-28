# Testes headless do CLAV (Playwright + ponte google.script.run simulada)

- `e2e.js` — 42 verificações dos fluxos críticos (Index e ficha). Uso: `NODE_PATH=/opt/node22/lib/node_modules node e2e.js <pasta-com-os-36-arquivos>`.
- `before.js` — mesmos cenários, com checagens tolerantes, para evidenciar o comportamento de uma versão anterior.
- `mock.js` — servidor Apps Script simulado (envelopes `{ok,data}`, revisões, conflito, sessão, fila).
- `render_intra.py` — renderiza o template `Intra.html` como o `doGet`/`include()` fazem.
- `faixas.json` — cópia de `FAIXAS_SV_CLAV` usada pelo simulador.
- `e2e-resultado.json` / `before-resultado.json` — resultados da execução de 28/09/2026 (v19.9 e v19.8).

Requisitos: Node 22, Playwright 1.56 com Chromium. Nada aqui toca o Apps Script real nem a planilha.
