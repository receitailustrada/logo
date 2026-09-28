/* Evidência "antes": mesmos cenários críticos contra o código original (v19.8), com checagens tolerantes.
   Uso: NODE_PATH=/opt/node22/lib/node_modules node before.js clav-src */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const SRC = path.resolve(process.argv[2] || 'clav-src');
const WWW = path.resolve('www_before'); const PORT = 8767; const BASE = `http://127.0.0.1:${PORT}`;
const WEB_URL = 'https://script.google.com/macros/s/MOCK_DEPLOY/exec';
const FAIXAS = JSON.parse(fs.readFileSync('faixas.json', 'utf8'));
const VERSION = (fs.readFileSync(path.join(SRC, '00_Config.gs'), 'utf8').match(/VERSION:\s*'([^']+)'/) || [])[1];
const TOKEN = 'TOKEN-DENIS-0123456789ABCDEF0123456789';
const MOCK = require('./mock.js')({ VERSION, WEB_URL, FAIXAS });
fs.rmSync(WWW, { recursive: true, force: true }); fs.mkdirSync(WWW, { recursive: true });
fs.copyFileSync(path.join(SRC, 'Index.html'), path.join(WWW, 'Index.html'));
const tpl = fs.readFileSync(path.join(SRC, 'Intra.html'), 'utf8');
const farm = fs.readFileSync(path.join(SRC, 'IntraFarmacos.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
function render(name, boot) { let s = tpl.replace("<?!= JSON.stringify(bootParams || {}).replace(/</g, '\\\\u003c') ?>", JSON.stringify(boot).replace(/</g, '\\u003c')).replace("<?!= JSON.stringify(bootParams || {}) ?>", JSON.stringify(boot)).replace("<?!= include('IntraFarmacos').replace(/<!--[\\s\\S]*?-->/g, '') ?>", farm).replace("<?!= include('IntraFarmacos') ?>", farm); fs.writeFileSync(path.join(WWW, name), s); }
const boot = { caso: 'ATD-1', slot: '1', modo: 'completo', webAppUrl: WEB_URL, versao: VERSION };
render('intra_caso.html', boot); render('intra_semcaso.html', Object.assign({}, boot, { caso: '' }));
const server = http.createServer((req, res) => { const f = path.join(WWW, req.url.split('?')[0].replace(/^\//, '')); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f)); });
const out = []; const rec = (nome, resultado) => { out.push({ nome, resultado }); console.log('  ' + nome + ' → ' + resultado); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function novaPagina(browser, init) { const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort()); await page.addInitScript(MOCK); if (init) await page.addInitScript(init); return { ctx, page, errors }; }
async function tenta(fn, fallback) { try { return await fn(); } catch (e) { return fallback === undefined ? ('ERRO: ' + String(e.message || e).slice(0, 120)) : fallback; } }
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();
  console.log('\n[ANTES] Index v' + VERSION);
  { const { ctx, page } = await novaPagina(browser);
    await page.goto(BASE + '/Index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => { const b = document.getElementById('loginBtn'); return b && !b.disabled; }, null, { timeout: 20000 });
    await page.fill('#loginUser', 'denis'); await page.fill('#loginPass', 'Senha!12345'); await page.click('#loginBtn');
    await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.user, null, { timeout: 20000 });
    await page.evaluate(() => abrirRegistro('ATD-1')); await sleep(300);
    rec('URL da ficha gerada pelo Index', await tenta(() => page.evaluate(() => intraUrl('1', ''))));
    rec('Alerta SV_PAS_CRITICO para PA 180/80', await tenta(() => page.evaluate(() => calcularTudo().alertas.some(a => a.id === 'SV_PAS_CRITICO') ? 'SIM' : 'NÃO (só ' + calcularTudo().alertas.map(a => a.id).join(',') + ')')));
    rec('Resumo da triagem marca a PA como fora da faixa', await tenta(() => page.evaluate(() => { renderTriagemResumo(STATE.current); return Array.from(document.querySelectorAll('#triagemResumoContent .ts-item.out')).some(x => /^PA/.test(x.textContent.trim())) ? 'SIM' : 'NÃO'; })));
    await page.evaluate(() => window.__MOCK_SERVER__.simulateFichaSave('ATD-1'));
    await page.evaluate(() => { const el = document.querySelector('[data-field="triagem.fr"]'); el.value = '18'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
    const salvo = await tenta(() => page.evaluate(() => salvarAgora()));
    const db = await page.evaluate(() => { const a = window.__MOCK_SERVER__.DB.atendimentos['ATD-1']; return { fr: a.payload.triagem.fr, intraopFicha: !!(a.payload.intraop && a.payload.intraop.ficha_v5_json) }; });
    const chip = await page.evaluate(() => document.getElementById('saveChip') ? document.getElementById('saveChip').textContent.trim() : '');
    rec('Salvar no Index depois de a ficha gravar', 'retorno=' + salvo + ' | FR gravada=' + db.fr + ' | chip="' + chip + '"');
    const enviouIntraop = await page.evaluate(() => window.__MOCK_SERVER__.calls.filter(c => c.fn === 'salvarAtendimento').some(c => Object.prototype.hasOwnProperty.call(c.args[0] || {}, 'intraop')));
    rec('Index envia o bloco intraop no salvamento', enviouIntraop ? 'SIM (sobrescreveria a ficha se a revisão passasse)' : 'NÃO');
    await ctx.close(); }
  console.log('\n[ANTES] Ficha com sessão só no fragmento (Google Sites / tablet)');
  { const { ctx, page } = await novaPagina(browser, "window.__MOCK_HASH__='clavtk=" + TOKEN + "';");
    await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' }); await sleep(2500);
    rec('Chip da ficha', await page.evaluate(() => document.getElementById('ponteChip').textContent));
    rec('Existe login na própria ficha', await page.evaluate(() => document.getElementById('loginVeil') ? 'SIM' : 'NÃO'));
    await ctx.close(); }
  console.log('\n[ANTES] Ficha com sessão: conflito de revisão após o Index gravar');
  { const { ctx, page } = await novaPagina(browser, "try{localStorage.setItem('clav.session.token','" + TOKEN + "');}catch(e){}");
    await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' });
    await page.waitForFunction(() => /Vinculado/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 });
    await page.evaluate(() => window.CLAV_PONTE.salvarAgora());
    await page.evaluate(() => window.__MOCK_SERVER__.simulateIndexSave('ATD-1'));
    const s2 = await tenta(() => page.evaluate(() => window.CLAV_PONTE.salvarAgora()));
    await sleep(500);
    rec('Salvar na ficha após o Index gravar', 'retorno=' + s2 + ' | carimbo="' + await page.evaluate(() => document.getElementById('stamp').textContent) + '"');
    rec('Biblioteca de fármacos na ficha', await page.evaluate(() => (window.CLAV_FARMACOS_LIB ? 'SIM' : 'NÃO (arquivo IntraFarmacos não incluído)')));
    await ctx.close(); }
  console.log('\n[ANTES] Ficha aberta sem atendimento (tablet)');
  { const { ctx, page } = await novaPagina(browser, "try{localStorage.setItem('clav.session.token','" + TOKEN + "');}catch(e){}");
    await page.goto(BASE + '/intra_semcaso.html', { waitUntil: 'load' }); await sleep(2000);
    rec('Chip da ficha', await page.evaluate(() => document.getElementById('ponteChip').textContent));
    rec('Fila do dia disponível', await page.evaluate(() => document.getElementById('filaVeil') ? 'SIM' : 'NÃO'));
    await ctx.close(); }
  console.log('\n[ANTES] Rascunho local antigo x prontuário novo');
  { const rasc = { versao: 'teste-5.0', inicio: '2026-09-27T08:00:00.000Z', iniciado: true, fim: '', intervaloMin: 5, duracaoMin: 240, rapido: false, cab: { hospital: 'Hospital', paciente: 'LOCAL ANTIGO' }, cfg: { pre: [], posicao: [], tecnica: [], via: [], puncoes: {}, det: {}, drogasSel: [], fluidosSel: [] }, ligadas: {}, drogas: [], fluidos: [], bh: { iniciado: {}, absorvido: {}, perdas: {}, reposicao: {} }, lab: [], rec: { aldrete: '', destino: [] }, obs: 'RASCUNHO ANTIGO', anot: '', salvoEm: '2026-09-27T09:00:00.000Z', series: [] };
    const pront = Object.assign({}, rasc, { obs: 'PRONTUARIO NOVO', salvoEm: '2026-09-27T20:00:00.000Z' });
    const init = `try{localStorage.setItem('clav.session.token','${TOKEN}'); localStorage.setItem('clav_intra_v5_ATD-1_s1', ${JSON.stringify(JSON.stringify(rasc))});}catch(e){}
      (function(){ const w=setInterval(()=>{ if(window.__MOCK_SERVER__){ clearInterval(w); const a=window.__MOCK_SERVER__.DB.atendimentos['ATD-1']; a.payload.intraop={ ficha_v5_json: ${JSON.stringify(JSON.stringify(pront))}, ficha_v5_salvo_em: '2026-09-27T20:00:00.000Z', sinais: [], medicacoes: [] }; a.revision=2; } },0); })();`;
    const { ctx, page } = await novaPagina(browser, init);
    await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' });
    await page.waitForFunction(() => /Vinculado/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 }); await sleep(4000);
    rec('Observações da ficha após abrir', await page.evaluate(() => window.CLAV_FICHA.estado().obs));
    rec('Rascunho antigo enviado ao prontuário', await page.evaluate(() => window.__MOCK_SERVER__.calls.some(c => c.fn === 'intraopSalvar' && /RASCUNHO ANTIGO/.test(JSON.stringify(c.args[1] || {}))) ? 'SIM (perda de dados)' : 'NÃO'));
    await ctx.close(); }
  await browser.close(); server.close();
  fs.writeFileSync('before-resultado.json', JSON.stringify({ src: SRC, versao: VERSION, resultados: out }, null, 2));
})();
