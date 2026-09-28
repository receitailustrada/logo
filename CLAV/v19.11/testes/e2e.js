/* Teste headless do CLAV v19.9 com Playwright e um servidor Apps Script simulado.
   Uso: NODE_PATH=/opt/node22/lib/node_modules node e2e.js [pasta-do-codigo]   */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const SRC = path.resolve(process.argv[2] || 'clav-fix');
const WWW = path.resolve('www');
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const WEB_URL = 'https://script.google.com/macros/s/MOCK_DEPLOY/exec';
const FAIXAS = JSON.parse(fs.readFileSync('faixas.json', 'utf8'));
const VERSION = (fs.readFileSync(path.join(SRC, '00_Config.gs'), 'utf8').match(/VERSION:\s*'([^']+)'/) || [])[1];

/* ---------- preparação dos arquivos servidos ---------- */
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
fs.copyFileSync(path.join(SRC, 'Index.html'), path.join(WWW, 'Index.html'));
const intraTpl = fs.readFileSync(path.join(SRC, 'Intra.html'), 'utf8');
const farmacos = fs.readFileSync(path.join(SRC, 'IntraFarmacos.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
function renderIntra(name, boot) {
  let s = intraTpl;
  s = s.replace("<?!= JSON.stringify(bootParams || {}).replace(/</g, '\\\\u003c') ?>", JSON.stringify(boot).replace(/</g, '\\u003c'));
  s = s.replace("<?!= JSON.stringify(bootParams || {}) ?>", JSON.stringify(boot));
  s = s.replace("<?!= include('IntraFarmacos').replace(/<!--[\\s\\S]*?-->/g, '') ?>", farmacos).replace("<?!= include('IntraFarmacos') ?>", farmacos);
  if (s.includes('<?')) throw new Error('scriptlet não renderizado em ' + name);
  fs.writeFileSync(path.join(WWW, name), s);
}
const bootBase = { caso: 'ATD-1', slot: '1', modo: 'completo', webAppUrl: WEB_URL, logoUrl: '', versao: VERSION };
renderIntra('intra_caso.html', bootBase);
renderIntra('intra_semcaso.html', Object.assign({}, bootBase, { caso: '' }));
renderIntra('intra_ro.html', Object.assign({}, bootBase, { slot: 'v', modo: 'visualizacao' }));
renderIntra('intra_xss.html', Object.assign({}, bootBase, { caso: '</script><script>window.__XSS__=1;</script>' }));

/* ---------- servidor HTTP estático ---------- */
const server = http.createServer((req, res) => {
  const file = path.join(WWW, decodeURIComponent(req.url.split('?')[0].replace(/^\//, '') || 'Index.html'));
  if (!file.startsWith(WWW) || !fs.existsSync(file)) { res.writeHead(404); res.end('nao encontrado'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(file));
});

/* ---------- ponte google.script simulada + banco em memória (roda dentro da página) ---------- */
const MOCK = require('./mock.js')({ VERSION, WEB_URL, FAIXAS });

/* ---------- utilidades de teste ---------- */
const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail).slice(0, 300) }); console.log((cond ? '  OK   ' : '  FALHA') + ' ' + name + (cond ? '' : '  → ' + String(detail).slice(0, 300))); }
async function newPage(browser, opts) {
  const ctx = await browser.newContext({ viewport: (opts && opts.viewport) || { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e && e.message ? e.message : String(e))));
  page.on('console', msg => { if (msg.type() === 'error') { const t = msg.text(); if (!/ERR_FAILED|ERR_ABORTED|Failed to load resource|net::/i.test(t)) errors.push('console: ' + t); } });
  await page.route('**/*', route => { const u = route.request().url(); if (u.startsWith(BASE)) return route.continue(); return route.abort(); });
  await page.addInitScript(MOCK);
  if (opts && opts.init) await page.addInitScript(opts.init);
  return { ctx, page, errors };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    /* ===================== INDEX ===================== */
    console.log('\n[INDEX] boot, login, atendimento, URL da ficha, alertas, salvar durante a cirurgia');
    {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(BASE + '/Index.html', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__CLAV_CLIENT_READY__ === true, null, { timeout: 20000 });
      await page.waitForFunction(() => { const b = document.getElementById('loginBtn'); return b && !b.disabled; }, null, { timeout: 20000 });
      check('Index: módulo principal carregou e login habilitado', true);
      await page.fill('#loginUser', 'denis');
      await page.fill('#loginPass', 'Senha!12345');
      await page.click('#loginBtn');
      await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.user && STATE.user.usuario === 'denis', null, { timeout: 20000 });
      check('Index: login por validarLogin e sessão persistida', await page.evaluate(() => localStorage.getItem('clav.session.token') === STATE.token));
      check('Index: HTML_VERSION igual à versão do servidor (sem aviso de divergência)', await page.evaluate(() => HTML_VERSION === BOOT.version && HTML_VERSION.length > 10), await page.evaluate(() => HTML_VERSION + ' vs ' + BOOT.version));
      const aberto = await page.evaluate(() => abrirRegistro('ATD-1'));
      check('Index: abrirRegistro(ATD-1) carregou o atendimento', aberto === true && await page.evaluate(() => getNested(STATE.current, 'paciente.nome') === 'Maria da Silva'));
      const url = await page.evaluate(() => intraUrl('1', ''));
      check('Index: URL da ficha leva caso, slot e sessão no fragmento', /\/exec\?page=intra&caso=ATD-1&slot=1#clavtk=TOKEN-/.test(url), url);
      check('Index: URL da ficha não leva o token na query', !/[?&]clavtk=/.test(url) && !/[?&]token=/.test(url), url);
      await page.evaluate(() => showSection('intraop'));
      await page.click('#btnIntraAba');
      await sleep(300);
      const opened = await page.evaluate(() => window.__OPENED__);
      check('Index: botão "Abrir a ficha em outra aba" abre a URL com sessão', opened.length === 1 && /page=intra&caso=ATD-1&slot=1#clavtk=/.test(opened[0].url) && opened[0].name === 'clav-intra-1', JSON.stringify(opened));
      const alertas = await page.evaluate(() => calcularTudo().alertas.map(a => a.id));
      check('Index: PA 180/80 gera alerta SV_PAS_CRITICO no painel', alertas.includes('SV_PAS_CRITICO'), alertas.join(','));
      await page.evaluate(() => renderTriagemResumo(STATE.current));
      const resumo = await page.evaluate(() => Array.from(document.querySelectorAll('#triagemResumoContent .ts-item.out')).map(x => x.textContent.trim()));
      check('Index: resumo da triagem destaca a PA 180/80 para o médico', resumo.some(t => /^PA/.test(t) && /Crítico/.test(t)), JSON.stringify(resumo));
      /* salvar durante a cirurgia: a ficha gravou (revisão subiu) e o Index edita a triagem */
      const revFicha = await page.evaluate(() => window.__MOCK_SERVER__.simulateFichaSave('ATD-1'));
      await page.evaluate(() => { const el = document.querySelector('[data-field="triagem.fr"]'); el.value = '18'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(400);
      const salvo = await page.evaluate(() => salvarAgora());
      const db = await page.evaluate(() => { const a = window.__MOCK_SERVER__.DB.atendimentos['ATD-1']; return { revision: a.revision, fr: a.payload.triagem.fr, intraop: a.payload.intraop && a.payload.intraop.ficha_v5_json ? 'preservado' : 'PERDIDO', tecnica: a.payload.intraop.tecnica }; });
      const enviados = await page.evaluate(() => window.__MOCK_SERVER__.calls.filter(c => c.fn === 'salvarAtendimento').map(c => ({ temIntraop: Object.prototype.hasOwnProperty.call(c.args[0] || {}, 'intraop'), base: c.args[2] && c.args[2].baseRevision })));
      check('Index: salvar após a ficha gravar → conflito resolvido sozinho e gravação confirmada', salvo === true && db.fr === '18' && db.revision === revFicha + 1, JSON.stringify({ salvo, db, enviados }));
      check('Index: o bloco intraop da ficha foi preservado (Index não o envia)', db.intraop === 'preservado' && db.tecnica === 'Geral balanceada' && enviados.length >= 1 && enviados.every(e => !e.temIntraop), JSON.stringify({ db, enviados }));
      check('Index: a tela incorporou o intraop gravado pela ficha', await page.evaluate(() => getNested(STATE.current, 'intraop.tecnica') === 'Geral balanceada'));
      check('Index: chip de salvamento indica planilha salva', await page.evaluate(() => /salva/i.test(document.getElementById('saveChip') ? document.getElementById('saveChip').textContent : 'salva')));
      check('Index: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INTRA: sessão pelo fragmento ===================== */
    console.log('\n[INTRA] sessão entregue pelo fragmento (#clavtk=) sem localStorage compartilhado');
    {
      const { ctx, page, errors } = await newPage(browser, { init: "window.__MOCK_HASH__='clavtk=TOKEN-DENIS-0123456789ABCDEF0123456789';" });
      await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' });
      await page.waitForFunction(() => /Vinculado/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 });
      check('Intra: ficha vinculada com o token do fragmento', await page.evaluate(() => document.getElementById('ponteChip').textContent.includes('Maria da Silva')), await page.evaluate(() => document.getElementById('ponteChip').textContent));
      check('Intra: token persistido no armazenamento da própria aba', await page.evaluate(() => localStorage.getItem('clav.session.token') === 'TOKEN-DENIS-0123456789ABCDEF0123456789'));
      const hist = await page.evaluate(() => window.__MOCK_HISTORY__);
      check('Intra: fragmento apagado da URL após a leitura (history.replace com hash vazio e page=intra)', hist.some(h => h.op === 'replace' && h.hash === '' && h.params && h.params.page === 'intra' && h.params.caso === 'ATD-1'), JSON.stringify(hist));
      check('Intra: veil de login não aparece quando há sessão', await page.evaluate(() => !document.getElementById('loginVeil').classList.contains('open')));
      check('Intra: contexto do paciente aplicado (peso, ASA, alergia)', await page.evaluate(() => { const c = document.getElementById('ctxCorpo').textContent; return c.includes('Maria da Silva') && c.includes('Dipirona') && c.includes('ASA II'); }));
      check('Intra: biblioteca de fármacos carregada (88 fármacos)', await page.evaluate(() => window.CLAV_FARMACOS_LIB && window.CLAV_FARMACOS_LIB.FARMACOS.length === 88));
      await page.evaluate(() => { document.getElementById('secFarmacos').open = true; });
      await page.fill('#inpFarmBusca', 'propof');
      await sleep(400);
      check('Intra: busca de fármaco calcula dose total pelo peso (70 kg)', await page.evaluate(() => /105–175 mg \(70 kg\)/.test(document.getElementById('farmLista').textContent)), await page.evaluate(() => document.getElementById('farmLista').textContent.slice(0, 200)));
      /* salvamento no prontuário e conflito de revisão */
      const s1 = await page.evaluate(() => window.CLAV_PONTE.salvarAgora());
      check('Intra: salvar no prontuário confirma (intraopSalvar)', s1 === true && await page.evaluate(() => /Salvo no prontuário/.test(document.getElementById('stamp').textContent)), await page.evaluate(() => document.getElementById('stamp').textContent));
      const revAntes = await page.evaluate(() => window.__MOCK_SERVER__.simulateIndexSave('ATD-1'));
      const s2 = await page.evaluate(() => window.CLAV_PONTE.salvarAgora());
      const revDepois = await page.evaluate(() => window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].revision);
      const conflitos = await page.evaluate(() => window.__MOCK_SERVER__.calls.filter(c => c.fn === 'intraopSalvar').length);
      check('Intra: após o Index gravar, a ficha relê a revisão e reenvia (conflito resolvido)', s2 === true && revDepois === revAntes + 1 && conflitos >= 3, JSON.stringify({ s2, revAntes, revDepois, conflitos }));
      check('Intra: código de erro do servidor lido de error.code', await page.evaluate(() => window.CLAV_PONTE.estado().revision) === revDepois);
      /* atendimento encerrado no sistema principal */
      await page.evaluate(() => window.__MOCK_SERVER__.lock('ATD-1', true));
      const s3 = await page.evaluate(() => window.CLAV_PONTE.salvarAgora());
      check('Intra: atendimento encerrado → para de insistir e avisa', s3 === false && await page.evaluate(() => /Atendimento encerrado/.test(document.getElementById('ponteChip').textContent) && window.CLAV_PONTE.estado().pendente === false));
      await page.evaluate(() => window.__MOCK_SERVER__.lock('ATD-1', false));
      /* sessão revogada → login na própria ficha */
      await page.evaluate(() => window.__MOCK_SERVER__.revoke('TOKEN-DENIS-0123456789ABCDEF0123456789'));
      const s4 = await page.evaluate(() => window.CLAV_PONTE.salvarAgora());
      await sleep(200);
      check('Intra: sessão expirada durante a cirurgia abre o login na própria ficha', s4 === false && await page.evaluate(() => document.getElementById('loginVeil').classList.contains('open')));
      await page.fill('#loginUsuario', 'denis');
      await page.fill('#loginSenha', 'Senha!12345');
      await page.click('#loginEntrar');
      await page.waitForFunction(() => !document.getElementById('loginVeil').classList.contains('open'), null, { timeout: 10000 });
      await sleep(600);
      check('Intra: após reentrar, a ficha volta a gravar no prontuário', await page.evaluate(() => /Salvo no prontuário/.test(document.getElementById('stamp').textContent) && window.CLAV_PONTE.estado().pendente === false), await page.evaluate(() => document.getElementById('stamp').textContent));
      check('Intra: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INTRA: sem sessão → login na ficha ===================== */
    console.log('\n[INTRA] sem sessão nenhuma: login na própria ficha');
    {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('loginVeil').classList.contains('open'), null, { timeout: 15000 });
      check('Intra: sem token → veil de login aberto', true);
      await page.fill('#loginUsuario', 'denis');
      await page.fill('#loginSenha', 'errada');
      await page.click('#loginEntrar');
      await page.waitForFunction(() => !document.getElementById('loginErro').hidden, null, { timeout: 10000 });
      check('Intra: senha errada mostra a mensagem do servidor', await page.evaluate(() => /Credenciais inválidas/.test(document.getElementById('loginErro').textContent)));
      await page.fill('#loginSenha', 'Senha!12345');
      await page.click('#loginEntrar');
      await page.waitForFunction(() => /Vinculado/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 });
      check('Intra: login correto vincula a ficha ao atendimento', await page.evaluate(() => document.getElementById('ponteChip').textContent.includes('Maria da Silva')));
      check('Intra: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INTRA: sem caso → fila do dia ===================== */
    console.log('\n[INTRA] aberta sem atendimento (tablet): fila do dia');
    {
      const { ctx, page, errors } = await newPage(browser, { init: "try{localStorage.setItem('clav.session.token','TOKEN-DENIS-0123456789ABCDEF0123456789');}catch(e){}" });
      await page.goto(BASE + '/intra_semcaso.html', { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('filaVeil').classList.contains('open') && document.querySelector('#filaLista .filaItem'), null, { timeout: 15000 });
      check('Intra: fila do dia aparece com o paciente do dia', await page.evaluate(() => document.querySelector('#filaLista .filaItem').textContent.includes('Maria da Silva')));
      await page.click('#filaLista .filaItem');
      await sleep(200);
      const opened = await page.evaluate(() => window.__OPENED__);
      check('Intra: tocar no paciente abre a ficha vinculada com a sessão', opened.length === 1 && /page=intra&caso=ATD-1&slot=1#clavtk=TOKEN-DENIS-0123456789ABCDEF0123456789/.test(opened[0].url), JSON.stringify(opened));
      check('Intra: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INTRA: rascunho local antigo x prontuário novo ===================== */
    console.log('\n[INTRA] rascunho local antigo não pode vencer o prontuário mais novo');
    {
      const rascunho = { versao: 'clav-ficha-v5', inicio: '2026-09-27T08:00:00.000Z', iniciado: true, fim: '', intervaloMin: 5, duracaoMin: 240, rapido: false, cab: { hospital: 'Hospital', paciente: 'LOCAL ANTIGO' }, cfg: { pre: [], posicao: [], tecnica: [], via: [], puncoes: {}, det: {}, drogasSel: [], fluidosSel: [] }, ligadas: {}, drogas: [], fluidos: [], bh: { iniciado: {}, absorvido: {}, perdas: {}, reposicao: {} }, lab: [], rec: { aldrete: '', destino: [] }, obs: 'RASCUNHO ANTIGO', anot: '', salvoEm: '2026-09-27T09:00:00.000Z', series: [] };
      const prontuario = Object.assign({}, rascunho, { obs: 'PRONTUARIO NOVO', cab: { hospital: 'Hospital', paciente: 'Maria da Silva' }, salvoEm: '2026-09-27T20:00:00.000Z' });
      const init = `try{localStorage.setItem('clav.session.token','TOKEN-DENIS-0123456789ABCDEF0123456789'); localStorage.setItem('clav_intra_v5_ATD-1_s1', ${JSON.stringify(JSON.stringify(rascunho))});}catch(e){}
        (function(){ const w=setInterval(()=>{ if(window.__MOCK_SERVER__){ clearInterval(w); const a=window.__MOCK_SERVER__.DB.atendimentos['ATD-1']; a.payload.intraop={ ficha_v5_json: ${JSON.stringify(JSON.stringify(prontuario))}, ficha_v5_salvo_em: '2026-09-27T20:00:00.000Z', sinais: [], medicacoes: [] }; a.revision=2; } },0); })();`;
      const { ctx, page, errors } = await newPage(browser, { init });
      await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' });
      await page.waitForFunction(() => /Vinculado/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 });
      await sleep(300);
      const obs = await page.evaluate(() => window.CLAV_FICHA.estado().obs);
      check('Intra: prontuário mais novo prevalece sobre o rascunho antigo deste aparelho', obs === 'PRONTUARIO NOVO', obs);
      const enviouAntigo = await page.evaluate(() => window.__MOCK_SERVER__.calls.some(c => c.fn === 'intraopSalvar' && /RASCUNHO ANTIGO/.test(JSON.stringify(c.args[1] || {}))));
      check('Intra: o rascunho antigo NÃO foi enviado ao prontuário', !enviouAntigo);
      check('Intra: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INTRA: visualização embutida ===================== */
    console.log('\n[INTRA] modo visualização (embutido no sistema principal)');
    {
      const { ctx, page, errors } = await newPage(browser, { init: "try{localStorage.setItem('clav.session.token','TOKEN-DENIS-0123456789ABCDEF0123456789');}catch(e){}" });
      await page.goto(BASE + '/intra_ro.html', { waitUntil: 'load' });
      await page.waitForFunction(() => /Visualização/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 });
      check('Intra RO: vinculada em modo visualização, banner visível e botão Fila oculto', await page.evaluate(() => !document.getElementById('roBanner').hidden && getComputedStyle(document.getElementById('btnFila')).display === 'none'));
      await page.click('#btnRoAbrir');
      await sleep(200);
      const opened = await page.evaluate(() => window.__OPENED__);
      check('Intra RO: "Abrir em outra aba para registrar" abre a ficha de registro com sessão', opened.length === 1 && /page=intra&caso=ATD-1&slot=1#clavtk=TOKEN-DENIS-0123456789ABCDEF0123456789/.test(opened[0].url), JSON.stringify(opened));
      check('Intra RO: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INDEX: encerramento (v19.9.1) ===================== */
    console.log('\n[INDEX] encerramento: impedimentos antes da ciência, alerta que só a planilha gera, trava de repetição, cartão do paciente fixo');
    async function entrarEAbrir(page, antes) {
      await page.goto(BASE + '/Index.html', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__CLAV_CLIENT_READY__ === true, null, { timeout: 20000 });
      await page.waitForFunction(() => { const b = document.getElementById('loginBtn'); return b && !b.disabled; }, null, { timeout: 20000 });
      if (antes) await page.evaluate(antes);
      await page.fill('#loginUser', 'denis'); await page.fill('#loginPass', 'Senha!12345'); await page.click('#loginBtn');
      await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.user && STATE.user.usuario === 'denis', null, { timeout: 20000 });
      await page.evaluate(async () => { await abrirRegistro('ATD-1'); });
      await page.waitForFunction(() => document.getElementById('railPacNome').textContent.includes('Maria'), null, { timeout: 15000 });
    }
    const modalEstado = () => ({ aberto: !document.getElementById('alertAckModal').classList.contains('hide'), titulo: document.getElementById('alertAckTitle').textContent.trim(), impedimentos: Array.from(document.querySelectorAll('#alertAckList .ack-impedimento b')).map(b => b.textContent.trim()), textos: Array.from(document.querySelectorAll('#alertAckList .ack-impedimento small')).map(b => b.textContent.trim()), acks: Array.from(document.querySelectorAll('#alertAckList [data-ack-confirm]')).map(x => x.dataset.ackConfirm), confirmVisivel: !document.getElementById('confirmAckBtn').classList.contains('hide'), chamadasEncerrar: window.__MOCK_SERVER__.calls.filter(c => c.fn === 'encerrarAtendimento').length, toasts: Array.from(document.querySelectorAll('#toastWrap .toast')).map(t => t.textContent.trim()) });
    {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page);
      /* 1. conclusão em branco: impedimento, sem chamar a planilha */
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => !document.getElementById('alertAckModal').classList.contains('hide'), null, { timeout: 15000 }).catch(() => {});
      const m1 = await page.evaluate(modalEstado);
      check('Encerrar: conclusão em branco abre "Encerramento bloqueado" (sem checkbox, sem chamar a planilha)', m1.aberto && m1.titulo === 'Encerramento bloqueado' && m1.impedimentos.some(t => /Conclusão/.test(t)) && !m1.confirmVisivel && m1.chamadasEncerrar === 0, JSON.stringify(m1));
      /* 2. Ir ao campo */
      const irBtn = await page.$('#alertAckList [data-ir-impedimento]');
      if (irBtn) { await irBtn.click(); await sleep(1100); }
      const nav = await page.evaluate(() => { const el = document.getElementById('conclusao'); const box = el ? el.closest('.subbox') : null; const visivel = el && el._q200Enhanced ? el._q200Enhanced.input : el; return { secao: document.getElementById('sec-preop').classList.contains('active'), modalFechado: document.getElementById('alertAckModal').classList.contains('hide'), boxAberto: !(box && box.classList.contains('collapsed')), focado: document.activeElement === visivel }; });
      check('Encerrar: "Ir ao campo" abre o pré-anestésico, expande o bloco e foca a Conclusão', !!irBtn && nav.secao && nav.modalFechado && nav.boxAberto && nav.focado, JSON.stringify(nav));
      /* 3. conclusão preenchida → ciência dos alertas da tela; a planilha ainda devolve um alerta que só ela gera */
      await page.evaluate(() => { try { closeAckModal(); } catch (e) {} showSection('preop'); });
      // preenche a Conclusão pelo controle pesquisável (mesmo caminho do usuário: digitar e Enter)
      await page.evaluate(() => { const s = document.getElementById('conclusao'); const inp = s._q200Enhanced ? s._q200Enhanced.input : null; if (inp) { inp.focus(); inp.value = 'Apto'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); inp.blur(); } else { s.value = 'Apto'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
      await sleep(400);
      check('Encerrar: Conclusão "Apto" gravada no formulário pelo controle pesquisável', await page.evaluate(() => document.getElementById('conclusao').value === 'Apto' && collectForm().conduta.conclusao === 'Apto'));
      await page.evaluate(() => { window.__MOCK_SERVER__.alertaSoServidor = { id: 'LATERALIDADE_INDEVIDA', tipo: 'danger', texto: 'Procedimento sem lateralidade anatômica registrado como "Direita". Confirme o procedimento e o lado antes do time out: nomes parecidos (umbilical x inguinal) mudam o sítio cirúrgico.', categoria: 'PROCEDIMENTO' }; });
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => !document.getElementById('alertAckModal').classList.contains('hide') && document.querySelectorAll('#alertAckList [data-ack-confirm]').length > 0, null, { timeout: 20000 }).catch(() => {});
      const m2 = await page.evaluate(modalEstado);
      check('Encerrar: com a conclusão preenchida, pede a ciência dos alertas graves da tela (PAS 180)', m2.aberto && m2.titulo === 'Ciência de alertas graves' && m2.acks.includes('SV_PAS_CRITICO') && !m2.acks.includes('LATERALIDADE_INDEVIDA'), JSON.stringify(m2));
      await page.evaluate(() => document.querySelectorAll('#alertAckList [data-ack-confirm]').forEach(x => { x.checked = true; }));
      await page.click('#confirmAckBtn');
      await page.waitForFunction(() => !document.getElementById('alertAckModal').classList.contains('hide') && Array.from(document.querySelectorAll('#alertAckList [data-ack-confirm]')).some(x => x.dataset.ackConfirm === 'LATERALIDADE_INDEVIDA'), null, { timeout: 25000 }).catch(() => {});
      const m3 = await page.evaluate(modalEstado);
      check('Encerrar: alerta que só a planilha gera (lateralidade indevida) chega ao modal de ciência', m3.aberto && m3.acks.includes('LATERALIDADE_INDEVIDA'), JSON.stringify(m3));
      await page.evaluate(() => document.querySelectorAll('#alertAckList [data-ack-confirm]').forEach(x => { x.checked = true; }));
      if (m3.aberto) await page.click('#confirmAckBtn');
      await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.current && STATE.current.atendimento && STATE.current.atendimento.status === 'ENCERRADO', null, { timeout: 25000 }).catch(() => {});
      const fim = await page.evaluate(() => { const c = (STATE.current.seguranca.alertas_cientes || []); const lat = c.find(x => x.alerta_id === 'LATERALIDADE_INDEVIDA'); return { status: STATE.current.atendimento.status, textoLat: lat ? lat.texto : null, modalFechado: document.getElementById('alertAckModal').classList.contains('hide'), chamadas: window.__MOCK_SERVER__.calls.filter(x => x.fn === 'encerrarAtendimento').length, locked: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].locked }; });
      check('Encerrar: ciência do alerta do servidor gravada com o texto exato e atendimento ENCERRADO na planilha', fim.status === 'ENCERRADO' && /lateralidade anatômica/.test(fim.textoLat || '') && fim.modalFechado && fim.locked === true, JSON.stringify(fim));
      check('Encerrar: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page, () => { window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.conduta.conclusao = 'Apto'; });
      /* 4. bloqueio devolvido pela planilha (a tela não previu) */
      await page.evaluate(() => { try { closeAckModal(); } catch (e) {} acknowledgeAllVisibleAlerts(); window.__MOCK_SERVER__.forcarBloqueio = 'ANESTESIOLOGISTA_OBRIGATORIO'; });
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => !document.getElementById('alertAckModal').classList.contains('hide') && document.getElementById('alertAckTitle').textContent.trim() === 'Encerramento bloqueado', null, { timeout: 20000 }).catch(() => {});
      const m4 = await page.evaluate(modalEstado);
      check('Encerrar: bloqueio devolvido pela planilha vira "Encerramento bloqueado" com a mensagem do servidor e botão para o campo', m4.aberto && m4.titulo === 'Encerramento bloqueado' && m4.textos.some(t => /simulado pela planilha/.test(t)) && m4.impedimentos.some(t => /Anestesiologista/.test(t)), JSON.stringify(m4));
      await page.evaluate(() => { try { closeAckModal(); } catch (e) {} });
      /* 5. trava de repetição: a planilha repete a mesma exigência depois da ciência salva */
      await page.evaluate(() => { window.__MOCK_SERVER__.repetirCiencia = true; });
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => !document.getElementById('alertAckModal').classList.contains('hide') && document.querySelectorAll('#alertAckList [data-ack-confirm]').length > 0, null, { timeout: 20000 }).catch(() => {});
      const antes = await page.evaluate(modalEstado);
      await page.evaluate(() => document.querySelectorAll('#alertAckList [data-ack-confirm]').forEach(x => { x.checked = true; }));
      if (antes.aberto) await page.click('#confirmAckBtn');
      await sleep(3500);
      const trava = await page.evaluate(modalEstado);
      check('Encerrar: se a planilha repete a mesma exigência após a ciência salva, a tela avisa em vez de reabrir o modal sem fim', antes.aberto && antes.acks.includes('SO_SERVIDOR_TEIMOSO') && !trava.aberto && trava.toasts.some(t => /não reconheceu a ciência/i.test(t)) && trava.chamadasEncerrar === 3, JSON.stringify({ antes: antes.acks, depois: { aberto: trava.aberto, chamadas: trava.chamadasEncerrar, toasts: trava.toasts.slice(-2) } }));
      /* 6. cartão do paciente preso sob o cabeçalho no fim de uma aba curta (1400×800) */
      await page.evaluate(() => { closeAckModal(); showSection('srpa'); });
      await sleep(500);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sleep(600);
      const st = await page.evaluate(() => { const r = document.getElementById('railPacienteCard').getBoundingClientRect(); const tb = document.getElementById('topbar').getBoundingClientRect(); return { scrollY: Math.round(window.scrollY), top: Math.round(r.top), bottom: Math.round(r.bottom), topbarBottom: Math.round(tb.bottom), altura: window.innerHeight, nome: document.getElementById('railPacNome').textContent.trim(), railAltura: Math.round(document.querySelector('.rail').getBoundingClientRect().height) }; });
      check('Cartão do paciente: no fim da aba SRPA continua inteiro e visível logo abaixo do cabeçalho', st.scrollY > 200 && st.top >= st.topbarBottom - 2 && st.bottom <= st.altura && /Maria/.test(st.nome), JSON.stringify(st));
      await page.evaluate(() => showSection('documentos'));
      await sleep(500);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sleep(600);
      const st2 = await page.evaluate(() => { const r = document.getElementById('railPacienteCard').getBoundingClientRect(); const tb = document.getElementById('topbar').getBoundingClientRect(); return { scrollY: Math.round(window.scrollY), top: Math.round(r.top), topbarBottom: Math.round(tb.bottom), bottom: Math.round(r.bottom), altura: window.innerHeight }; });
      check('Cartão do paciente: idem na aba Documentos', st2.scrollY > 200 && st2.top >= st2.topbarBottom - 2 && st2.bottom <= st2.altura, JSON.stringify(st2));
      check('Encerrar/cartão: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INDEX/INTRA: ajustes v19.9.2 ===================== */
    console.log('\n[INDEX] v19.9.2: botões, selos, atalhos de medicações, escala de dor, atalho atual, fonte por usuário, blocos reordenáveis');
    {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page);
      const est = await page.evaluate(() => {
        const cs = el => getComputedStyle(el);
        return {
          rascunho: cs(document.getElementById('lastDraftBtn')).color, alertas: cs(document.getElementById('visionAlertsBtn')).color,
          novo: cs(document.getElementById('newBtn')).color, sair: cs(document.getElementById('logoutBtn')).color,
          brand: (() => { const t = document.createElement('span'); t.style.color = 'var(--brand)'; document.body.appendChild(t); const c = cs(t).color; t.remove(); return c; })(),
          titulos: ['closeCaseBtn', 'reopenBtn', 'newBtn', 'logoutBtn'].map(id => (document.getElementById(id).getAttribute('title') || '').length > 20),
          selo: { cursor: cs(document.getElementById('airwayBadge')).cursor, raio: cs(document.getElementById('airwayBadge')).borderRadius },
          facesAdulto: cs(document.getElementById('painAdultFaces')).display, facesPed: cs(document.getElementById('painFaces')).display,
          medChipsOcultos: document.getElementById('medChips').classList.contains('hide') && document.getElementById('medChipsHelp').classList.contains('hide')
        };
      });
      check('v19.9.2: cores dos botões (rascunho âmbar, alertas vermelho, Novo na cor do tema ativo, Sair vermelho)', est.rascunho === 'rgb(180, 83, 9)' && est.alertas === 'rgb(180, 35, 24)' && est.novo === est.brand && est.sair === 'rgb(180, 35, 24)', JSON.stringify(est));
      check('v19.9.2: legendas em Encerrar, Reabrir, Novo e Sair', est.titulos.every(Boolean), JSON.stringify(est.titulos));
      check('v19.9.2: selo "Via aérea" sem mãozinha e em pílula', est.selo.cursor === 'default' && /999px/.test(est.selo.raio), JSON.stringify(est.selo));
      check('v19.9.2: escala do adulto sem desenhos; pediátrica com desenhos', est.facesAdulto === 'none' && est.facesPed !== 'none', JSON.stringify({ a: est.facesAdulto, p: est.facesPed }));
      check('v19.9.2: atalhos de medicações nascem recolhidos', est.medChipsOcultos);
      await page.evaluate(() => showSection('preop'));
      await sleep(300);
      // v19.10 (pedido C3): os atalhos foram retirados de vez — botão e fileira ficam ocultos mesmo com a preferência antiga "aberto".
      const medRetirado = await page.evaluate(() => { localStorage.setItem('clav.ui.medChipsOpen.U1', '1'); toggleMedChips(true, false); const cs = el => getComputedStyle(el); return { btn: cs(document.getElementById('medChipsToggleBtn')).display, fileira: cs(document.getElementById('medChips')).display, ajuda: cs(document.getElementById('medChipsHelp')).display, campoMed: !!document.getElementById('medicacoes') }; });
      check('v19.10 (C3): atalhos rápidos de medicações retirados (botão, fileira e ajuda ocultos; campo de medicações continua)', medRetirado.btn === 'none' && medRetirado.fileira === 'none' && medRetirado.ajuda === 'none' && medRetirado.campoMed, JSON.stringify(medRetirado));
      /* atalho atual */
      await page.click('#preopJumpBar [data-jump="sb-exame-fisico"]');
      await sleep(300);
      const atual = await page.evaluate(() => Array.from(document.querySelectorAll('#preopJumpBar .jump-chip.is-current')).map(c => c.dataset.jump));
      check('v19.9.2: atalho clicado fica em destaque (um só)', atual.length === 1 && atual[0] === 'sb-exame-fisico', JSON.stringify(atual));
      /* fonte por usuário */
      await page.evaluate(() => changeFontScale(1));
      const fonte = await page.evaluate(() => ({ chave: localStorage.getItem('clav.ui.fontLevel.U1'), zoom: document.documentElement.style.getPropertyValue('--q200-zoom') }));
      check('v19.9.2: nível de fonte guardado por usuário', fonte.chave === '1' && fonte.zoom === '1.06', JSON.stringify(fonte));
      /* reordenar blocos */
      const ordemAntes = await page.evaluate(() => Array.from(document.querySelectorAll('#preopGrid > .subbox.collapsible')).map(b => b.id));
      const fpAntes = await page.evaluate(() => fingerprintData(collectForm()));
      await page.click('#preopJumpBar [data-preop-reorder]');
      await sleep(200);
      const modo = await page.evaluate(() => ({ classe: document.getElementById('preopGrid').classList.contains('preop-reordenando'), setasVisiveis: getComputedStyle(document.querySelector('#sb-exame-fisico .subbox-move')).display !== 'none', restaurarVisivel: getComputedStyle(document.querySelector('#preopJumpBar [data-preop-restore]')).display !== 'none' }));
      check('v19.9.2: modo "Reorganizar" mostra setas e "Ordem padrão"', modo.classe && modo.setasVisiveis && modo.restaurarVisivel, JSON.stringify(modo));
      await page.click('#sb-exame-fisico .subbox-move [data-move="-1"]');
      await sleep(150);
      await page.click('#sb-exame-fisico .subbox-move [data-move="-1"]');
      await sleep(300);
      const depois = await page.evaluate(() => ({
        ordem: Array.from(document.querySelectorAll('#preopGrid > .subbox.collapsible')).map(b => b.id),
        chips: Array.from(document.querySelectorAll('#preopJumpBar [data-jump]')).map(c => c.dataset.jump),
        salvo: localStorage.getItem('clav.ui.preopOrder.U1'), dirty: STATE.dirty, pendente: hasUnpersistedChanges(), fp: fingerprintData(collectForm())
      }));
      const idxAntes = ordemAntes.indexOf('sb-exame-fisico'), idxDepois = depois.ordem.indexOf('sb-exame-fisico');
      check('v19.9.2: duas setas para cima movem o bloco duas posições, barra de atalhos acompanha', idxDepois === idxAntes - 2 && depois.chips.join('|') === depois.ordem.join('|'), JSON.stringify({ idxAntes, idxDepois, chipsIguais: depois.chips.join('|') === depois.ordem.join('|') }));
      check('v19.9.2: ordem guardada por usuário e formulário NÃO fica alterado', !!depois.salvo && JSON.parse(depois.salvo).join('|') === depois.ordem.join('|') && depois.dirty === false && depois.pendente === false && depois.fp === fpAntes, JSON.stringify({ salvo: !!depois.salvo, dirty: depois.dirty, pendente: depois.pendente, fpIgual: depois.fp === fpAntes }));
      /* persiste após recarregar */
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__CLAV_CLIENT_READY__ === true, null, { timeout: 20000 });
      await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.user && STATE.user.usuario === 'denis', null, { timeout: 20000 }).catch(() => {});
      const logado = await page.evaluate(() => !!(typeof STATE !== 'undefined' && STATE.user));
      if (!logado) { await page.fill('#loginUser', 'denis'); await page.fill('#loginPass', 'Senha!12345'); await page.click('#loginBtn'); await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.user && STATE.user.usuario === 'denis', null, { timeout: 20000 }); }
      await page.evaluate(async () => { await abrirRegistro('ATD-1'); showSection('preop'); });
      await sleep(500);
      const recarregado = await page.evaluate(() => ({ ordem: Array.from(document.querySelectorAll('#preopGrid > .subbox.collapsible')).map(b => b.id), zoom: document.documentElement.style.getPropertyValue('--q200-zoom'), medOculto: getComputedStyle(document.getElementById('medChips')).display === 'none' }));
      check('v19.9.2: ordem e fonte sobrevivem a recarregar a página (atalhos de medicações seguem retirados, v19.10)', recarregado.ordem.indexOf('sb-exame-fisico') === idxAntes - 2 && recarregado.zoom === '1.06' && recarregado.medOculto, JSON.stringify(recarregado));
      /* ordem padrão */
      await page.click('#preopJumpBar [data-preop-reorder]');
      await sleep(150);
      await page.click('#preopJumpBar [data-preop-restore]');
      await sleep(300);
      const restaurado = await page.evaluate(() => ({ ordem: Array.from(document.querySelectorAll('#preopGrid > .subbox.collapsible')).map(b => b.id), salvo: localStorage.getItem('clav.ui.preopOrder.U1') }));
      check('v19.9.2: "Ordem padrão" devolve a sequência original e limpa a preferência', restaurado.ordem.join('|') === ordemAntes.join('|') && !restaurado.salvo, JSON.stringify({ igual: restaurado.ordem.join('|') === ordemAntes.join('|'), salvo: restaurado.salvo }));
      /* sair volta ao nível geral da fonte */
      await page.evaluate(() => logout());
      await sleep(400);
      check('v19.9.2: ao sair, a fonte volta ao nível geral do navegador', await page.evaluate(() => document.documentElement.style.getPropertyValue('--q200-zoom') === '1'));
      check('v19.9.2: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await newPage(browser, { init: "window.__MOCK_HASH__='clavtk=TOKEN-DENIS-0123456789ABCDEF0123456789';", viewport: { width: 1400, height: 800 } });
      await page.goto(BASE + '/intra_caso.html', { waitUntil: 'load' });
      await page.waitForFunction(() => /Vinculado/.test(document.getElementById('ponteChip').textContent), null, { timeout: 15000 });
      const ficha = await page.evaluate(() => ({
        menuFechado: document.body.classList.contains('sb-fechada'), painelFechado: document.body.classList.contains('rp-fechado'),
        cabTela: !!document.querySelector('.cab.cab-tela'), estadoBtn: (document.querySelector('.cab.cab-tela .b.btn') || { className: '' }).className,
        chipEstado: (document.getElementById('chipStatus') || { className: '' }).className,
        pacienteDestacado: (() => { const b = document.querySelector('.cab.cab-tela .r2 > .b:first-child'); return b ? getComputedStyle(b).borderTopWidth : ''; })()
      }));
      check('Intra v19.9.2: menu esquerdo e painel direito recolhidos por padrão', ficha.menuFechado && ficha.painelFechado, JSON.stringify(ficha));
      check('Intra v19.9.2: Paciente/Cirurgia destacados na tela e estado do caso com classe própria', ficha.cabTela && /estado-iniciar/.test(ficha.estadoBtn) && /estado-nao-iniciado/.test(ficha.chipEstado) && ficha.pacienteDestacado === '2px', JSON.stringify(ficha));
      check('Intra v19.9.2: sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INDEX: v19.9.3 — encerrar depois de a ficha gravar ===================== */
    console.log('\n[INDEX] v19.9.3: abrir a ficha "só para ver" não pode travar Salvar/Encerrar');
    const editarFr = () => { const el = document.querySelector('[data-field="triagem.fr"]'); el.value = '18'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    {
      /* (a) caso restaurado sem cópia do servidor (recarregar / Retomar rascunho) + ficha gravou + Encerrar */
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page, () => { window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.conduta.conclusao = 'Apto'; });
      await page.evaluate(async () => { acknowledgeAllVisibleAlerts(); await salvarAgora(); });
      await page.waitForFunction(() => typeof STATE !== 'undefined' && STATE.dirty === false && !STATE.saveInFlight, null, { timeout: 15000 });
      await page.evaluate(() => { STATE.serverBase = null; });
      await page.evaluate(() => window.__MOCK_SERVER__.simulateFichaSave('ATD-1'));
      const sinc = await page.evaluate(async () => { const ok = await sincronizarRevisaoDaFicha('foco'); return { ok, rev: Number(getNested(STATE.current, 'atendimento.revision') || 0), dbrev: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].revision, base: !!STATE.serverBase, sinais: (getNested(STATE.current, 'intraop.sinais') || []).length, pendente: hasUnpersistedChanges(), tipo: STATE.saveStatus.type }; });
      check('v19.9.3: ao voltar para a aba, a revisão da ficha é absorvida em silêncio, mesmo sem cópia do servidor', sinc.ok && sinc.rev === sinc.dbrev && sinc.base && sinc.sinais === 1 && sinc.pendente === false && sinc.tipo !== 'error', JSON.stringify(sinc));
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => getNested(STATE.current, 'atendimento.status') === 'ENCERRADO', null, { timeout: 20000 }).catch(() => {});
      const fimA = await page.evaluate(() => ({ status: getNested(STATE.current, 'atendimento.status'), tipo: STATE.saveStatus.type, locked: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].locked }));
      check('v19.9.3: Encerrar conclui depois de a ficha ter gravado (sem "alterado em outra aba")', fimA.status === 'ENCERRADO' && fimA.locked === true && fimA.tipo !== 'error', JSON.stringify(fimA));
      check('v19.9.3 (a): sem erros de JavaScript', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    {
      /* (b) edição local pendente + ficha gravou depois da leitura: o salvamento do Encerrar segue pelo servidor (revisões só da ficha) */
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page, () => { window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.conduta.conclusao = 'Apto'; });
      await page.evaluate(() => acknowledgeAllVisibleAlerts());
      await page.evaluate(editarFr);
      await page.evaluate(() => { STATE.serverBase = null; window.__MOCK_SERVER__.simulateFichaSave('ATD-1'); });
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => getNested(STATE.current, 'atendimento.status') === 'ENCERRADO', null, { timeout: 25000 }).catch(() => {});
      const fimB = await page.evaluate(() => { const a = window.__MOCK_SERVER__.DB.atendimentos['ATD-1']; return { status: getNested(STATE.current, 'atendimento.status'), tipo: STATE.saveStatus.type, locked: a.locked, fr: a.payload.triagem.fr, sinais: (a.payload.intraop.sinais || []).length, ops: (window.__MOCK_SERVER__.DB.ops['ATD-1'] || []).map(o => o.rid.slice(0, 6)) }; });
      check('v19.9.3: com edição pendente, o servidor aceita a gravação por cima das revisões da ficha, preserva a ficha e encerra', fimB.status === 'ENCERRADO' && fimB.locked === true && fimB.fr === '18' && fimB.sinais === 1 && fimB.tipo !== 'error', JSON.stringify(fimB));
      check('v19.9.3 (b): sem erros de JavaScript', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    {
      /* (c) outra pessoa gravou (não é a ficha): o conflito verdadeiro continua protegendo */
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page, () => { window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.conduta.conclusao = 'Apto'; });
      await page.evaluate(() => acknowledgeAllVisibleAlerts());
      await page.evaluate(editarFr);
      await page.evaluate(() => window.__MOCK_SERVER__.simulateIndexSave('ATD-1'));
      await page.click('#closeCaseBtn');
      await sleep(4000);
      const fimC = await page.evaluate(() => { const a = window.__MOCK_SERVER__.DB.atendimentos['ATD-1']; return { status: getNested(STATE.current, 'atendimento.status'), tipo: STATE.saveStatus.type, texto: STATE.saveStatus.text, locked: a.locked, fr: a.payload.triagem.fr, fc: a.payload.triagem.fc }; });
      check('v19.9.3: gravação de outra pessoa continua sendo conflito (nada sobrescrito, caso não encerrado)', fimC.status !== 'ENCERRADO' && fimC.locked === false && fimC.tipo === 'error' && fimC.fr !== '18' && fimC.fc === '99', JSON.stringify(fimC));
      check('v19.9.3 (c): sem erros de JavaScript', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== v19.10: pedidos da equipe (lote 1) ===================== */
    console.log('\n[v19.10] tela: alertas recolhidos, casos hipotéticos, exames ocultos, alergias, Beta-HCG, calculadora, ordem, conclusão, medicações de internação, impressão que salva');
    {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page);
      await page.evaluate(() => showSection('preop'));
      await sleep(400);
      const tela = await page.evaluate(() => {
        const cs = el => getComputedStyle(el);
        const grid = document.getElementById('preopGrid');
        const ids = Array.from(grid.querySelectorAll(':scope > .subbox')).map(b => b.id);
        const campo = k => document.querySelector(`[data-field="exames.${k}"]`);
        return {
          railRecolhido: document.getElementById('railAlertsCard').classList.contains('collapsed'),
          casosOcultos: cs(document.getElementById('painelCasosHipoteticos')).display === 'none' && document.querySelectorAll('[data-demo-case]').length === 5,
          triageBtnOculto: cs(document.getElementById('triageChipsToggleBtn')).display === 'none',
          examesOcultos: ['cloro', 'calcio', 'magnesio'].map(k => cs(campo(k).closest('.exam-field')).display === 'none'),
          examesVisiveis: ['hb', 'k', 'na', 'creatinina'].map(k => cs(campo(k).closest('.exam-field')).display !== 'none'),
          alergias: Array.from(document.querySelectorAll('#alergiasChecks input[data-array]')).map(x => x.value),
          calcNav: !!document.querySelector('#stepNav [data-go="calculadora"]'),
          scoresNoPreop: ids.some(id => /scores-de-risco/.test(id)),
          scoresNaCalc: !!document.querySelector('#sec-calculadora #rcriChecks') && !!document.querySelector('#sec-calculadora #stopChecks') && !!document.querySelector('#sec-calculadora #capriniChecks'),
          idxMets: ids.indexOf('sb-capacidade-funcional-em-mets'), idxRevisao: ids.indexOf('sb-revisao-por-sistemas'),
          tituloEstrat: document.querySelector('#sb-estratificacao-final h3').textContent.trim(),
          conclusaoBloco: !!document.querySelector('#sb-conclusao-e-anestesia-proposta.collapsible #conclusao') && !!document.querySelector('#sb-conclusao-e-anestesia-proposta [data-field="conduta.anestesia_proposta"]'),
          chipConclusao: !!document.querySelector('#preopJumpBar [data-jump="sb-conclusao-e-anestesia-proposta"]'),
          metsFont: parseFloat(cs(document.querySelector('#metsChips .chip-btn')).fontSize),
          betaLabel: document.getElementById('betaStatus').closest('.field').querySelector('label').textContent.trim(),
          betaLegadoOculto: Array.from(document.querySelectorAll('.beta-legado')).length === 2 && Array.from(document.querySelectorAll('.beta-legado')).every(el => el.classList.contains('hide')),
          printCss: /border-radius:5px/.test(PRINT_SHEET_CSS) && /border-spacing:2px/.test(PRINT_SHEET_CSS) && /\.pdf-section-title \{[^}]*border-radius:7px/.test(PRINT_SHEET_CSS),
          ackTexto: document.getElementById('confirmAckBtn').textContent.trim()
        };
      });
      check('v19.10 (A1): lista de alertas do menu nasce recolhida também em tela larga', tela.railRecolhido);
      check('v19.10 (A2): painel dos casos hipotéticos escondido (botões continuam no HTML)', tela.casosOcultos);
      check('v19.10 (B1): botão "Atalhos" da observação da triagem oculto', tela.triageBtnOculto);
      check('v19.10 (B2): Cloro, Cálcio e Magnésio fora da grade; demais exames visíveis', tela.examesOcultos.every(Boolean) && tela.examesVisiveis.every(Boolean), JSON.stringify({ o: tela.examesOcultos, v: tela.examesVisiveis }));
      check('v19.10 (C4): lista de alergias enxuta (nega + 12 itens, com látex, penicilina, dipirona, AAS, contraste, alimentos)', tela.alergias.length === 13 && ['Látex', 'Dipirona', 'AAS', 'Contraste iodado'].every(x => tela.alergias.includes(x)) && tela.alergias.some(x => /Alimentos/.test(x)), JSON.stringify(tela.alergias));
      check('v19.10 (C9): aba "Calculadora" no menu com os três escores; bloco fora do pré-anestésico', tela.calcNav && tela.scoresNaCalc && !tela.scoresNoPreop, JSON.stringify({ nav: tela.calcNav, calc: tela.scoresNaCalc, preop: tela.scoresNoPreop }));
      check('v19.10 (C10): capacidade funcional acima da revisão por sistemas e com fonte maior', tela.idxMets >= 0 && tela.idxRevisao > tela.idxMets && tela.metsFont >= 13, JSON.stringify({ mets: tela.idxMets, rev: tela.idxRevisao, font: tela.metsFont }));
      check('v19.10 (C11): título "Estratificação final / ASA" com id estável', tela.tituloEstrat === 'Estratificação final / ASA');
      check('v19.10 (C15): Conclusão e anestesia proposta em bloco recolhível com atalho na barra', tela.conclusaoBloco && tela.chipConclusao);
      check('v19.10 (C6): Beta-HCM numa linha ("Resultado do Beta-HCG") e terceira linha escondida', tela.betaLabel === 'Resultado do Beta-HCG' && tela.betaLegadoOculto, JSON.stringify({ l: tela.betaLabel, o: tela.betaLegadoOculto }));
      check('v19.10 (D1): folha do navegador com caixas arredondadas', tela.printCss);
      check('v19.10 (item 13): botão do modal de ciência "Ciente de todos os alertas: encerrar"', /Ciente de todos/.test(tela.ackTexto), tela.ackTexto);

      /* C6: o seletor espelha o resultado detalhado; registro antigo com observação mostra a terceira linha */
      const beta = await page.evaluate(() => {
        const st = document.getElementById('betaStatus'), res = document.getElementById('betaResultado');
        const set = v => { ensureSelectValue(st, v); st.value = v; st.dispatchEvent(new Event('change', { bubbles: true })); return res.value; };
        const r1 = set('Positivo'), r2 = set('Solicitado/Pendente'), r3 = set('Negativo');
        const alertaPos = (() => { set('Positivo'); STATE.current = collectForm(); return gerarAlertas(Object.assign(collectForm(), { paciente: Object.assign({}, collectForm().paciente, { nascimento: '2015-01-01', idade: '11' }) })).some(a => a.id === 'PROTECAO_MENOR_14'); })();
        set('Negativo');
        const antes = Array.from(document.querySelectorAll('.beta-legado')).every(el => el.classList.contains('hide'));
        document.getElementById('betaObservacao').value = 'Beta 12 mUI/mL (laboratório X)'; atualizarBetaLegado();
        const depois = Array.from(document.querySelectorAll('.beta-legado')).every(el => !el.classList.contains('hide'));
        document.getElementById('betaObservacao').value = ''; atualizarBetaLegado();
        return { r1, r2, r3, alertaPos, antes, depois };
      });
      check('v19.10 (C6): "Resultado do Beta-HCG" espelha o resultado detalhado (Positivo/Aguardando/Negativo) e mantém o alerta da menor de 14 anos', beta.r1 === 'Positivo' && beta.r2 === 'Aguardando resultado' && beta.r3 === 'Negativo' && beta.alertaPos, JSON.stringify(beta));
      check('v19.10 (C6): observação de registro antigo faz a terceira linha aparecer', beta.antes && beta.depois, JSON.stringify(beta));

      /* C4: item de lista anterior continua gravado e visível */
      const legado = await page.evaluate(() => {
        STATE.current = collectForm(); STATE.current.anamnese.alergias_itens = ['Dipirona', 'Vancomicina']; fillForm(STATE.current);
        const extraEl = document.querySelector('#alergiasChecks label.check.legado input[value="Vancomicina"]');
        const extra = extraEl ? { checked: extraEl.checked } : null; // lido agora: o 2º fillForm desmarca e remove a caixa
        const coletado = collectForm().anamnese.alergias_itens.slice();
        STATE.current = collectForm(); STATE.current.anamnese.alergias_itens = ['Dipirona']; fillForm(STATE.current);
        const removido = !document.querySelector('#alergiasChecks label.check.legado');
        return { extra: !!extra && extra.checked, coletado, removido };
      });
      check('v19.10 (C4): alergia de lista anterior aparece como caixa extra marcada, é gravada e some quando não está mais no registro', legado.extra && legado.coletado.includes('Vancomicina') && legado.coletado.includes('Dipirona') && legado.removido, JSON.stringify(legado));

      /* B2: exame oculto com valor em registro antigo continua visível */
      const examLegado = await page.evaluate(() => {
        STATE.current = collectForm(); STATE.current.exames.cloro = '101'; fillForm(STATE.current);
        const cs = el => getComputedStyle(el);
        const cloro = cs(document.querySelector('[data-field="exames.cloro"]').closest('.exam-field')).display;
        const calcio = cs(document.querySelector('[data-field="exames.calcio"]').closest('.exam-field')).display;
        const coletado = collectForm().exames.cloro;
        STATE.current = collectForm(); STATE.current.exames.cloro = ''; fillForm(STATE.current);
        return { cloro, calcio, coletado, depois: cs(document.querySelector('[data-field="exames.cloro"]').closest('.exam-field')).display };
      });
      check('v19.10 (B2): Cloro com valor antigo continua visível e gravado; Cálcio vazio segue oculto; sem valor volta a sumir', examLegado.cloro !== 'none' && examLegado.calcio === 'none' && examLegado.coletado === '101' && examLegado.depois === 'none', JSON.stringify(examLegado));

      /* C13: medicações de internação */
      const meds = await page.evaluate(async () => {
        STATE.current = collectForm(); STATE.current.anamnese.medicacoes = 'Losartana 50 mg; Metformina 850 mg'; STATE.current.conduta.medicacoes_internacao = []; STATE.current.conduta.medicacoes_internacao_tocada = ''; STATE.current.conduta.medicacoes_internacao_excluidas = []; fillForm(STATE.current);
        const antes = rxLines(collectForm());
        importHospitalMedications();
        const importadas = collectForm().conduta.medicacoes_internacao.map(m => m.medicamento);
        document.querySelector('[data-remove-hospital-med="0"]').click();
        const aposRemover = { lista: collectForm().conduta.medicacoes_internacao.map(m => m.medicamento), excl: collectForm().conduta.medicacoes_internacao_excluidas.slice(), rx: rxLines(collectForm()) };
        importHospitalMedications();
        const aposReimportar = collectForm().conduta.medicacoes_internacao.map(m => m.medicamento);
        document.querySelector('[data-remove-hospital-med="0"]').click();
        const vazia = { lista: collectForm().conduta.medicacoes_internacao.length, tocada: collectForm().conduta.medicacoes_internacao_tocada, rx: rxLines(collectForm()) };
        const btnRestaurar = document.querySelector('[data-restaurar-hospital-meds]');
        if (btnRestaurar) btnRestaurar.click();
        importHospitalMedications();
        const restauradas = collectForm().conduta.medicacoes_internacao.map(m => m.medicamento);
        return { antes, importadas, aposRemover, aposReimportar, vazia, temRestaurar: !!btnRestaurar, restauradas };
      });
      check('v19.10 (C13): lista nunca tocada → prescrição lista as medicações em uso (comportamento antigo preservado)', meds.antes.includes('Losartana 50 mg') && meds.antes.includes('Metformina 850 mg'), JSON.stringify(meds.antes));
      check('v19.10 (C13): remover uma medicação da internação tira da prescrição e "Importar" não a recoloca', meds.importadas.length === 2 && meds.aposRemover.lista.join('|') === 'Metformina 850 mg' && meds.aposRemover.excl.join('|') === 'Losartana 50 mg' && !meds.aposRemover.rx.some(l => /Losartana/.test(l)) && meds.aposRemover.rx.some(l => /Metformina/.test(l)) && meds.aposReimportar.join('|') === 'Metformina 850 mg', JSON.stringify(meds));
      check('v19.10 (C13): lista esvaziada pela equipe → prescrição declara "Sem medicações de uso contínuo" (não volta tudo)', meds.vazia.lista === 0 && meds.vazia.tocada === 'SIM' && meds.vazia.rx.some(l => /Sem medicações de uso contínuo/.test(l)) && !meds.vazia.rx.some(l => /Losartana|Metformina/.test(l)), JSON.stringify(meds.vazia));
      check('v19.10 (C13): "Restaurar" libera as removidas para reimportar', meds.temRestaurar && meds.restauradas.length === 2, JSON.stringify({ r: meds.temRestaurar, l: meds.restauradas }));

      /* C14: imprimir salva na planilha antes */
      await page.evaluate(() => { STATE.current = collectForm(); STATE.current.anamnese.medicacoes = ''; STATE.current.conduta.medicacoes_internacao = []; fillForm(STATE.current); const el = document.querySelector('[data-field="triagem.fr"]'); el.value = '19'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(300);
      const antesPrint = await page.evaluate(() => ({ dirty: STATE.dirty, salvos: window.__MOCK_SERVER__.calls.filter(c => c.fn === 'salvarAtendimento').length, abertas: window.__OPENED__.length }));
      await page.evaluate(async () => { await gerarPdf('AVALIACAO_PRE_ANESTESICA'); });
      await sleep(400);
      const depoisPrint = await page.evaluate(() => ({ dirty: STATE.dirty, pendente: hasUnpersistedChanges(), salvos: window.__MOCK_SERVER__.calls.filter(c => c.fn === 'salvarAtendimento').length, abertas: window.__OPENED__.length, fr: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.triagem.fr }));
      check('v19.10 (C14): imprimir com alteração pendente grava na planilha antes de abrir a impressão', antesPrint.dirty === true && depoisPrint.salvos === antesPrint.salvos + 1 && depoisPrint.fr === '19' && depoisPrint.pendente === false && depoisPrint.abertas === antesPrint.abertas + 1, JSON.stringify({ antesPrint, depoisPrint }));
      await page.evaluate(async () => { await gerarPdf('AVALIACAO_PRE_ANESTESICA'); });
      await sleep(300);
      const semMudanca = await page.evaluate(() => window.__MOCK_SERVER__.calls.filter(c => c.fn === 'salvarAtendimento').length);
      check('v19.10 (C14): imprimir sem alteração pendente não grava de novo', semMudanca === depoisPrint.salvos, String(semMudanca));
      check('v19.10 (tela): sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    console.log('\n[v19.10] encerrar a qualquer custo: ciência num clique, responsável assumido, conflito real com escolha');
    {
      /* (a) ciência num clique + anestesiologista em branco assumido por quem encerra */
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page);
      await page.evaluate(() => { showSection('preop'); const s = document.getElementById('conclusao'); ensureSelectValue(s, 'Apto'); s.value = 'Apto'; s.dispatchEvent(new Event('change', { bubbles: true })); const a = document.getElementById('anestSelect'); a.value = ''; a.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(300);
      const semResp = await page.evaluate(() => ({ anest: collectForm().preop.anestesiologista, impedimentos: impedimentosEncerramento(collectForm()).map(i => i.codigo) }));
      check('v19.10 (item 13): anestesiologista em branco não é impedimento para quem pode assumir', semResp.anest === '' && semResp.impedimentos.length === 0, JSON.stringify(semResp));
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => !document.getElementById('alertAckModal').classList.contains('hide') && document.querySelectorAll('#alertAckList [data-ack-confirm]').length > 0, null, { timeout: 15000 }).catch(() => {});
      const m = await page.evaluate(() => ({ titulo: document.getElementById('alertAckTitle').textContent.trim(), marcados: Array.from(document.querySelectorAll('#alertAckList [data-ack-confirm]')).every(x => x.checked), qtd: document.querySelectorAll('#alertAckList [data-ack-confirm]').length, anest: collectForm().preop.anestesiologista }));
      check('v19.10 (item 13): Encerrar preenche o responsável com quem encerra e abre a ciência já marcada (sem "Encerramento bloqueado")', m.titulo === 'Ciência de alertas graves' && m.marcados && m.qtd >= 1 && m.anest === 'Denis Paim Cipriani', JSON.stringify(m));
      await page.click('#confirmAckBtn');
      await page.waitForFunction(() => getNested(STATE.current, 'atendimento.status') === 'ENCERRADO', null, { timeout: 20000 }).catch(() => {});
      const fim = await page.evaluate(() => ({ status: getNested(STATE.current, 'atendimento.status'), locked: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].locked, cientes: (window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.seguranca.alertas_cientes || []).map(c => c.alerta_id), anest: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.preop.anestesiologista }));
      check('v19.10 (item 13): um clique registra a ciência de todos os alertas e encerra', fim.status === 'ENCERRADO' && fim.locked === true && fim.cientes.includes('SV_PAS_CRITICO') && fim.anest === 'Denis Paim Cipriani', JSON.stringify(fim));
      check('v19.10 (item 13 a): sem erros de JavaScript', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    {
      /* (b) conflito real ao encerrar: outra pessoa gravou → modal → "Encerrar mesmo assim" */
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page);
      await page.evaluate(async () => { showSection('preop'); const s = document.getElementById('conclusao'); ensureSelectValue(s, 'Apto'); s.value = 'Apto'; s.dispatchEvent(new Event('change', { bubbles: true })); acknowledgeAllVisibleAlerts(); await salvarAgora(); });
      await sleep(300);
      const revOutro = await page.evaluate(() => window.__MOCK_SERVER__.simulateIndexSave('ATD-1'));
      await page.click('#closeCaseBtn');
      await page.waitForFunction(() => !document.getElementById('conflitoModal').classList.contains('hide'), null, { timeout: 15000 }).catch(() => {});
      const c1 = await page.evaluate(() => ({ aberto: !document.getElementById('conflitoModal').classList.contains('hide'), botao: document.getElementById('conflitoForcarBtn').textContent.trim(), status: getNested(STATE.current, 'atendimento.status') }));
      check('v19.10 (item 13): gravação de outra pessoa ao encerrar abre a escolha (Recarregar / Encerrar mesmo assim) em vez de só falhar', c1.aberto && /Encerrar mesmo assim/.test(c1.botao) && c1.status !== 'ENCERRADO', JSON.stringify(c1));
      await page.click('#conflitoForcarBtn');
      await page.waitForFunction(() => getNested(STATE.current, 'atendimento.status') === 'ENCERRADO', null, { timeout: 20000 }).catch(() => {});
      const c2 = await page.evaluate(() => ({ status: getNested(STATE.current, 'atendimento.status'), locked: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].locked, fc: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.triagem.fc, forcados: window.__MOCK_SERVER__.forcados }));
      check('v19.10 (item 13): "Encerrar mesmo assim" encerra o registro atual da planilha (a gravação da outra pessoa é preservada) e o servidor recebe forcarRevisao', c2.status === 'ENCERRADO' && c2.locked === true && c2.fc === '99' && c2.forcados.some(f => f.fn === 'encerrarAtendimento' && f.de === revOutro - 1 && f.para === revOutro), JSON.stringify(c2));
      check('v19.10 (item 13 b): sem erros de JavaScript', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    {
      /* (c) conflito real ao salvar: escolha "Gravar por cima" e "Recarregar" */
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 800 } });
      await entrarEAbrir(page);
      await page.evaluate(() => { const el = document.querySelector('[data-field="triagem.fr"]'); el.value = '21'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(300);
      await page.evaluate(() => window.__MOCK_SERVER__.simulateIndexSave('ATD-1'));
      const salvo1 = await page.evaluate(() => salvarAgora());
      await page.waitForFunction(() => !document.getElementById('conflitoModal').classList.contains('hide'), null, { timeout: 15000 }).catch(() => {});
      const s1 = await page.evaluate(() => ({ aberto: !document.getElementById('conflitoModal').classList.contains('hide'), botao: document.getElementById('conflitoForcarBtn').textContent.trim(), fr: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.triagem.fr }));
      check('v19.10 (item 13): conflito real ao salvar abre a escolha e nada é gravado sem decisão', salvo1 === false && s1.aberto && /Gravar por cima/.test(s1.botao) && s1.fr === '16', JSON.stringify({ salvo1, s1 }));
      await page.click('#conflitoForcarBtn');
      await page.waitForFunction(() => STATE.dirty === false && document.getElementById('conflitoModal').classList.contains('hide'), null, { timeout: 15000 }).catch(() => {});
      const s2 = await page.evaluate(() => ({ dirty: STATE.dirty, fr: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.triagem.fr, rev: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].revision, forcados: window.__MOCK_SERVER__.forcados.filter(f => f.fn === 'salvarAtendimento').length, chip: (document.getElementById('saveChip') || { textContent: '' }).textContent }));
      check('v19.10 (item 13): "Gravar por cima" grava a edição desta tela com revisão forçada (auditada)', s2.dirty === false && s2.fr === '21' && s2.forcados === 1, JSON.stringify(s2));
      /* Recarregar: nova edição, novo conflito, escolhe recarregar */
      await page.evaluate(() => { const el = document.querySelector('[data-field="triagem.fr"]'); el.value = '22'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await sleep(200);
      await page.evaluate(() => window.__MOCK_SERVER__.simulateIndexSave('ATD-1'));
      await page.evaluate(() => salvarAgora());
      await page.waitForFunction(() => !document.getElementById('conflitoModal').classList.contains('hide'), null, { timeout: 15000 }).catch(() => {});
      await page.click('#conflitoRecarregarBtn');
      await page.waitForFunction(() => document.getElementById('conflitoModal').classList.contains('hide') && STATE.dirty === false, null, { timeout: 15000 }).catch(() => {});
      const s3 = await page.evaluate(() => ({ fr: collectForm().triagem.fr, fc: collectForm().triagem.fc, dirty: STATE.dirty, rascunhos: Object.keys(localStorage).filter(k => k.startsWith('clav.draft.')).length }));
      check('v19.10 (item 13): "Recarregar da planilha" traz a versão mais nova sem gravar a edição (que fica em rascunho local)', s3.fr === '21' && s3.fc === '99' && s3.dirty === false && s3.rascunhos >= 1, JSON.stringify(s3));
      check('v19.10 (item 13 c): sem erros de JavaScript', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== v19.11: folha impressa e layouts (lote 2) ===================== */
    console.log('\n[v19.11] tela: dor no exame físico, revisão em duas colunas, ausculta editável, via aérea, pedidos; folha: cabeçalho 3×4, triagem em linha, textos padrão');
    {
      const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1400, height: 900 } });
      await entrarEAbrir(page);
      await page.evaluate(() => showSection('preop'));
      await sleep(400);
      const tela = await page.evaluate(() => {
        const cs = el => getComputedStyle(el);
        const pain = document.getElementById('painBox');
        const blocos = Array.from(document.querySelectorAll('#systemsReview .sys-block'));
        const ausc = document.getElementById('auscultaCardiacaTexto');
        return {
          painDentro: !!pain && !!pain.closest('.subbox') && pain.closest('.subbox').id === 'sb-exame-fisico' && !!document.getElementById('painBadge') && !!document.getElementById('painAdultNumbers'),
          chipDor: !!document.querySelector('#preopJumpBar [data-jump="painBox"]'),
          sysBlocos: blocos.length, sysDuasCol: blocos.filter(b => b.querySelector('.sys-flat.sys-two-col')).length,
          sysCaixas: blocos.filter(b => { const t = b.querySelector('.sys-left textarea[data-sys-livre]'); return t && cs(t).display !== 'none' && !t.classList.contains('hide'); }).length,
          semOutras: document.querySelectorAll('#systemsReview [data-sys-outro]').length === 0,
          ginecoDentro: !!document.querySelector('[data-sys-block="outros"] [data-sys-block="gineco"] textarea[data-field="sistemas.gineco_obstetrico"]') && !!document.querySelector('[data-sys-block="gineco"] [data-sys-status="gineco"]'),
          tituloOutros: (document.querySelector('[data-sys-block="outros"] .sys-head h4') || {}).textContent,
          auscTexto: ausc ? ausc.value : null, auscStatusOculto: !!document.getElementById('auscultaCardiacaStatus') && cs(document.getElementById('auscultaCardiacaStatus')).display === 'none',
          vaOrdem: (() => { const m = document.querySelector('.va-mallampati'), d = document.querySelector('.va-denticao'); return !!m && !!d && (m.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })(),
          denticaoCols: cs(document.getElementById('denticaoChecks')).gridTemplateColumns.split(' ').length,
          vaOutros: (document.querySelector('[data-field="viaAerea.observacoes"]').closest('.field').querySelector('label') || {}).textContent,
          opcaoPedidos: !!document.querySelector('#previewType option[value="PEDIDOS"]') && !!document.querySelector('[data-pdf="PEDIDOS"]') && !!document.querySelector('[data-batch-doc][value="PEDIDOS"]'),
          tituloPedidos: pdfTitleClient('PEDIDOS')
        };
      });
      check('v19.11 (C2): escala de dor dentro do bloco Exame físico (mesmos ids), sem atalho próprio na barra', tela.painDentro && !tela.chipDor, JSON.stringify({ d: tela.painDentro, c: tela.chipDor }));
      check('v19.11 (C5): revisão por sistemas em 9 blocos de duas colunas, caixa de texto sempre visível e sem botão "Outras"', tela.sysBlocos === 9 && tela.sysDuasCol === 9 && tela.sysCaixas === 9 && tela.semOutras, JSON.stringify({ b: tela.sysBlocos, dc: tela.sysDuasCol, cx: tela.sysCaixas, o: tela.semOutras }));
      check('v19.11 (C5): ginecológico/obstétrico como caixa dentro de "Outros sistemas" (campos e situação preservados)', tela.ginecoDentro && /ginecol/i.test(tela.tituloOutros || ''), JSON.stringify({ g: tela.ginecoDentro, t: tela.tituloOutros }));
      check('v19.11 (C7): ausculta cardíaca como texto padrão editável; seletor antigo oculto', tela.auscTexto === 'RCR, 2T, BNF, sem sopros' && tela.auscStatusOculto, JSON.stringify({ t: tela.auscTexto, o: tela.auscStatusOculto }));
      check('v19.11 (C8): desenhos do Mallampati à esquerda, dentição à direita em duas colunas, "Outros achados da via aérea"', tela.vaOrdem && tela.denticaoCols === 2 && /Outros achados/.test(tela.vaOutros || ''), JSON.stringify({ o: tela.vaOrdem, c: tela.denticaoCols, l: tela.vaOutros }));
      check('v19.11 (C12): documento "Solicitação de exames e avaliações" no seletor, no botão e no lote', tela.opcaoPedidos && /SOLICITA/.test(tela.tituloPedidos), JSON.stringify({ o: tela.opcaoPedidos, t: tela.tituloPedidos }));

      /* C5: texto livre marca o sistema como alterado e vai para a impressão */
      const sysTxt = await page.evaluate(() => {
        const ta = document.querySelector('[data-sys-livre="cardio"]'); ta.value = 'Sopro sistólico conhecido'; ta.dispatchEvent(new Event('input', { bubbles: true }));
        const d = collectForm();
        const chip = document.querySelector('[data-sys-count="cardio"]').textContent;
        const sec = buildPdfSectionsClient(d, 'AVALIACAO_PRE_ANESTESICA').find(x => x.title === 'REVISÃO POR SISTEMAS');
        const item = sec && sec.grid.find(g => g[0] === 'Cardiovascular');
        ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));
        return { livre: d.sistemas.cardiovascular, status: d.sistemas.cardiovascular_status, chip, impresso: item ? item[1] : '' };
      });
      check('v19.11 (C5): texto na caixa vira "Com alterações" e sai na folha', sysTxt.livre === 'Sopro sistólico conhecido' && sysTxt.status === 'Com alterações' && /1 achado/.test(sysTxt.chip) && /Sopro sistólico/.test(sysTxt.impresso), JSON.stringify(sysTxt));

      /* C7: editar o texto grava "Com alterações" + descrição; voltar ao padrão limpa */
      const ausc = await page.evaluate(() => {
        const el = document.getElementById('auscultaCardiacaTexto');
        const set = v => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return collectForm().exame; };
        const a = set('Sopro sistólico 2+/6 em foco mitral');
        const sec = buildPdfSectionsClient(collectForm(), 'AVALIACAO_PRE_ANESTESICA').find(x => x.title === 'EXAME FÍSICO');
        const impresso = sec && sec.grid.find(g => g[0] === 'Ausculta cardíaca');
        const alterada = el.classList.contains('alterada');
        const b = set('RCR, 2T, BNF, sem sopros');
        const c = set('');
        return { a: { s: a.ausculta_cardiaca_status, d: a.ausculta_cardiaca }, impresso: impresso ? impresso[1] : '', alterada, b: { s: b.ausculta_cardiaca_status, d: b.ausculta_cardiaca }, c: { s: c.ausculta_cardiaca_status, d: c.ausculta_cardiaca, txt: el.value } };
      });
      check('v19.11 (C7): texto diferente do padrão grava "Com alterações" + descrição e sai assim na folha; voltar ao padrão (ou apagar) restaura o normal', ausc.a.s === 'Com alterações' && ausc.a.d === 'Sopro sistólico 2+/6 em foco mitral' && /Sopro sistólico/.test(ausc.impresso) && ausc.alterada && ausc.b.s === 'RCR, 2T, BNF, sem sopros' && ausc.b.d === '' && ausc.c.s === 'RCR, 2T, BNF, sem sopros' && ausc.c.txt === 'RCR, 2T, BNF, sem sopros', JSON.stringify(ausc));

      /* C12: pedidos com texto por item e documento próprio */
      const ped = await page.evaluate(() => {
        const marcar = v => { const cb = document.querySelector(`#consultRequestChecks input[value="${v}"]`); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); };
        marcar('ECG'); marcar('Avaliação cardiológica');
        const inp = document.querySelector('#consultRequestDetails input[data-solicitacao-detalhe="ECG"]');
        if (inp) { inp.value = 'Rotina pré-operatória (HAS)'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
        const d = collectForm();
        const secs = buildPdfSectionsClient(d, 'PEDIDOS');
        const ex = secs.find(x => x.title === 'SOLICITAÇÃO DE EXAMES'), av = secs.find(x => /AVALIAÇÃO ESPECIALIZADA/.test(x.title));
        const html = buildPreviewHtml(d, 'PEDIDOS');
        return { temInput: !!inp, detalhe: d.conduta.solicitacoes_detalhes && d.conduta.solicitacoes_detalhes.ECG, solicitacoes: d.conduta.solicitacoes, titulos: secs.map(x => x.title), ex: ex && ex.rows, av: av && av.rows, html: /SOLICITAÇÃO DE EXAMES E AVALIAÇÕES/.test(html) && /Rotina pré-operatória/.test(html) };
      });
      check('v19.11 (C12): item marcado ganha caixa de objetivo; o documento de pedidos lista exames e avaliações numerados com o texto', ped.temInput && ped.detalhe === 'Rotina pré-operatória (HAS)' && /ECG/.test(ped.solicitacoes) && ped.titulos[0] === 'IDENTIFICAÇÃO DO PACIENTE E DO PROCEDIMENTO' && ped.ex && ped.ex[0][1] === 'ECG' && ped.ex[0][2] === 'Rotina pré-operatória (HAS)' && ped.av && ped.av[0][1] === 'Avaliação cardiológica' && ped.html, JSON.stringify(ped));

      /* Folha impressa: estrutura */
      const folha = await page.evaluate(() => {
        STATE.current = collectForm(); STATE.current.triagem.dor = '3'; STATE.current.viaAerea.mallampati = ''; STATE.current.viaAerea.distancia_tireomentoniana = '7'; STATE.current.anamnese.antecedentes_texto = ''; STATE.current.anamnese.medicacoes = ''; fillForm(STATE.current);
        const d = collectForm();
        const secs = buildPdfSectionsClient(d, 'AVALIACAO_PRE_ANESTESICA');
        const by = t => secs.find(x => x.title === t);
        const ident = by('IDENTIFICAÇÃO DO PACIENTE E DO PROCEDIMENTO'), tri = by('TRIAGEM, SINAIS VITAIS E DADOS ANTROPOMÉTRICOS'), ant = by('ANTECEDENTES E HISTÓRIA CLÍNICA'), ef = by('EXAME FÍSICO'), va = by('VIA AÉREA'), esc = by('ESCORES DE RISCO'), ap = by('ANTECEDENTES PRINCIPAIS'), est = by('ESTRATIFICAÇÃO FINAL / ASA'), cond = by('CONDUTA, PLANO E SEGURANÇA');
        const val = (sec, label) => { const it = sec && sec.grid.find(g => g[0] === label); return it ? it[1] : null; };
        const html = buildPreviewHtml(d, 'AVALIACAO_PRE_ANESTESICA');
        const primeira = (html.match(/<table class="pdf-grid-table">[\s\S]*?<\/table>/) || [''])[0];
        return {
          titulos: secs.map(x => x.title),
          identFixo: !!ident && ident.fixo === true && ident.grid.slice(0, 12).every(g => g[4] === 'inline'),
          nome: ident && ident.grid[0][1], nomeDestaque: ident && ident.grid[0][3], rotulos: ident && ident.grid.slice(0, 12).map(g => g[0]),
          semNascimento: !!ident && !ident.grid.some(g => /Nascimento/.test(g[0])),
          triFixo: !!tri && tri.fixo === true && tri.grid.filter(g => g[2] !== 'full').length === 8 && tri.grid.filter(g => g[2] !== 'full').every(g => g[4] === 'inline'),
          pa: val(tri, 'PA'), semResponsavel: !!tri && !tri.grid.some(g => /Responsável/.test(g[0])),
          semConsulta: !secs.some(x => x.title === 'CONSULTA PRÉ-ANESTÉSICA'),
          medicacoes: val(ant, 'Medicações em uso atual/recente'), cirurgias: val(ant, 'Cirurgias e procedimentos prévios'), habitos: val(ant, 'Hábitos'),
          dor: val(ef, 'Escala de dor (0 a 10)'), mallampati: val(va, 'Mallampati'), dtmInline: va && (va.grid.find(g => /tireomentoniana/.test(g[0])) || [])[4],
          escores: esc && esc.grid.map(g => g[0]), semAntigo: !secs.some(x => x.title === 'ESCORES DE RISCO E CAPACIDADE FUNCIONAL'),
          higido: val(ap, 'Resumo consolidado'),
          estOrdem: est && est.grid.map(g => g[0]), estFixo: !!est && est.fixo === true, asa: val(est, 'ASA'),
          tcle: val(cond, 'TCLE'),
          htmlNome: /class="hl-nome inline"/.test(html) && /MARIA DA SILVA/.test(html), tdsPrimeira: (primeira.match(/<td/g) || []).length, inlineCss: /td\.inline \.val-inline/.test(PRINT_SHEET_CSS)
        };
      });
      check('v19.11 (D3): cabeçalho fixo 3×4 em linha, nome em caixa alta, só três rótulos, sem nascimento', folha.identFixo && folha.nome === 'MARIA DA SILVA' && folha.nomeDestaque === 'nome' && folha.rotulos.filter(Boolean).join('|') === 'Data da consulta|Data da cirurgia|Prontuário' && folha.semNascimento && folha.tdsPrimeira === 12 && folha.htmlNome, JSON.stringify({ f: folha.identFixo, n: folha.nome, r: folha.rotulos, tds: folha.tdsPrimeira, h: folha.htmlNome }));
      check('v19.11 (D4): triagem em duas linhas de quatro, valores em linha com unidade, sem "Responsável pela triagem"', folha.triFixo && folha.pa === '180/80 mmHg' && folha.semResponsavel && folha.inlineCss, JSON.stringify({ f: folha.triFixo, pa: folha.pa, r: folha.semResponsavel }));
      check('v19.11 (D5): bloco "Consulta pré-anestésica" desfeito; TCLE na conduta; dor no exame físico', folha.semConsulta && folha.tcle === 'Pendente' && folha.dor === '3', JSON.stringify({ c: folha.semConsulta, t: folha.tcle, d: folha.dor }));
      check('v19.11 (D2): seções sempre impressas com texto padrão (medicações, cirurgias, hábitos, antecedentes principais, Mallampati)', folha.medicacoes === 'NENHUMA MEDICAÇÃO EM USO' && /Nega cirurgias/.test(folha.cirurgias) && /Nega tabagismo/.test(folha.habitos) && folha.higido === 'PACIENTE HÍGIDO' && /Mallampati ___/.test(folha.mallampati), JSON.stringify({ m: folha.medicacoes, c: folha.cirurgias, h: folha.habitos, a: folha.higido, mp: folha.mallampati }));
      check('v19.11 (D7/D9): exames e via aérea em linha; escores sem a capacidade; linha fixa Capacidade/ASA/Risco/Estratificação com ASA sempre impresso', folha.dtmInline === 'inline' && folha.escores.join('|') === 'RCRI (Índice de Lee)|STOP-Bang|Caprini' && folha.semAntigo && folha.estFixo && folha.estOrdem.join('|') === 'Capacidade funcional|ASA|Risco do procedimento cirúrgico|Estratificação global do risco do paciente' && folha.asa === 'ASA II', JSON.stringify({ dtm: folha.dtmInline, e: folha.escores, o: folha.estOrdem, asa: folha.asa }));
      check('v19.11 (tela e folha): sem erros de JavaScript no console', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    /* ===================== INTRA: XSS refletido ===================== */
    console.log('\n[INTRA] parâmetro malicioso no template');
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE + '/intra_xss.html', { waitUntil: 'load' });
      await sleep(500);
      check('Intra: "</script>" no parâmetro caso não executa código', await page.evaluate(() => window.__XSS__ === undefined && typeof window.CLAV_FICHA === 'object'));
      await ctx.close();
    }
  } catch (e) {
    check('EXCEÇÃO NO TESTE', false, e && e.stack ? e.stack : String(e));
  } finally {
    await browser.close();
    server.close();
  }
  const falhas = results.filter(r => !r.ok);
  console.log(`\nRESULTADO: ${results.length - falhas.length} OK / ${falhas.length} FALHA(S)`);
  fs.writeFileSync('e2e-resultado.json', JSON.stringify({ src: SRC, versao: VERSION, data: new Date().toISOString(), resultados: results }, null, 2));
  process.exit(falhas.length ? 1 : 0);
})();
