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
