'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const { chromium } = require('playwright');
const SRC=path.resolve(process.argv[2]||'clav-fix'); const WWW=path.resolve('www_dbg'); const PORT=8767; const BASE=`http://127.0.0.1:${PORT}`;
const WEB_URL='https://script.google.com/macros/s/MOCK_DEPLOY/exec';
const FAIXAS=JSON.parse(fs.readFileSync('faixas.json','utf8'));
const VERSION=(fs.readFileSync(path.join(SRC,'00_Config.gs'),'utf8').match(/VERSION:\s*'([^']+)'/)||[])[1];
fs.rmSync(WWW,{recursive:true,force:true}); fs.mkdirSync(WWW,{recursive:true}); fs.copyFileSync(path.join(SRC,'Index.html'),path.join(WWW,'Index.html'));
const server=http.createServer((req,res)=>{ const file=path.join(WWW,decodeURIComponent(req.url.split('?')[0].replace(/^\//,'')||'Index.html')); if(!file.startsWith(WWW)||!fs.existsSync(file)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(fs.readFileSync(file)); });
const MOCK=require('./mock.js')({VERSION,WEB_URL,FAIXAS});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:1400,height:800}}); const page=await ctx.newPage();
  page.on('pageerror',e=>console.log('PAGEERROR',e.message)); page.on('console',m=>{ if(m.type()==='error'&&!/net::|Failed to load/.test(m.text())) console.log('CONSOLE',m.text().slice(0,200)); });
  await page.route('**/*',route=>{ const u=route.request().url(); if(u.startsWith(BASE)) return route.continue(); return route.abort(); });
  await page.addInitScript(MOCK);
  await page.addInitScript(()=>{ window.__TOASTS__=[]; document.addEventListener('DOMContentLoaded',()=>{ const w=document.getElementById('toastWrap'); if(!w) return; new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{ if(n.textContent) window.__TOASTS__.push(n.textContent.trim().slice(0,160)); }))).observe(w,{childList:true}); }); });
  await page.goto(BASE+'/Index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>window.__CLAV_CLIENT_READY__===true,null,{timeout:20000});
  await page.waitForFunction(()=>{const b=document.getElementById('loginBtn');return b&&!b.disabled;},null,{timeout:20000});
  const modo=process.argv[3]||'B';
  if(modo==='C') await page.evaluate(()=>{ window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].payload.conduta.conclusao='Apto'; });
  await page.fill('#loginUser','denis'); await page.fill('#loginPass','Senha!12345'); await page.click('#loginBtn');
  await page.waitForFunction(()=>typeof STATE!=='undefined'&&STATE.user&&STATE.user.usuario==='denis',null,{timeout:20000});
  await page.evaluate(async()=>{ await abrirRegistro('ATD-1'); });
  await page.waitForFunction(()=>document.getElementById('railPacNome').textContent.includes('Maria'),null,{timeout:15000});
  const snap=async(tag)=>{ const s=await page.evaluate(()=>({ calls: window.__MOCK_SERVER__.calls.map(c=>c.fn).filter(f=>/salvar|encerrar|obter/.test(f)), toasts: window.__TOASTS__.slice(-6), dirty: STATE.dirty, unpersisted: hasUnpersistedChanges(), status: STATE.saveStatus, rev: (STATE.current.atendimento||{}).revision, dbrev: window.__MOCK_SERVER__.DB.atendimentos['ATD-1'].revision, modal: !document.getElementById('alertAckModal').classList.contains('hide'), acks: Array.from(document.querySelectorAll('#alertAckList [data-ack-confirm]')).map(x=>x.dataset.ackConfirm), cientes:(STATE.current.seguranca.alertas_cientes||[]).map(x=>x.alerta_id), currentAlerts:(STATE.currentAlerts||[]).filter(x=>x.tipo==='danger').map(x=>x.id+(x.ciente?'(c)':'')), pendingSave: !!STATE.pendingSave, fpDiff: (function(){ const a=fingerprintData(collectForm()); const b=STATE.lastServerFingerprint||''; if(a===b) return 'igual'; let i=0; while(i<a.length&&i<b.length&&a[i]===b[i]) i++; return 'lenA='+a.length+' lenB='+b.length+' @'+i+' A:'+a.slice(Math.max(0,i-80),i+120)+' || B:'+b.slice(Math.max(0,i-80),i+120); })() })); console.log('---',tag,JSON.stringify(s)); };
  await snap('aberto');
  if(modo==='B'){
    await page.evaluate(()=>{ showSection('preop'); const s=document.getElementById('conclusao'); const inp=s._q200Enhanced.input; inp.focus(); inp.value='Apto'; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); inp.blur(); });
    await sleep(500); await snap('conclusao');
    await page.evaluate(()=>{ window.__MOCK_SERVER__.alertaSoServidor={ id:'LATERALIDADE_INDEVIDA', tipo:'danger', texto:'Procedimento sem lateralidade anatômica registrado como "Direita". Confirme.', categoria:'PROCEDIMENTO' }; });
    await page.click('#closeCaseBtn'); await sleep(2500); await snap('encerrar#1');
    await page.evaluate(()=>document.querySelectorAll('#alertAckList [data-ack-confirm]').forEach(x=>{x.checked=true;}));
    await page.click('#confirmAckBtn'); await sleep(1500); await snap('confirm+1.5s'); await sleep(4000); await snap('confirm+5.5s');
  } else {
    await page.evaluate(()=>{ acknowledgeAllVisibleAlerts(); }); await sleep(400); await snap('ackAll');
    await page.evaluate(()=>{ window.__MOCK_SERVER__.forcarBloqueio='ANESTESIOLOGISTA_OBRIGATORIO'; });
    await page.click('#closeCaseBtn'); await sleep(1500); await snap('encerrar+1.5s'); await sleep(4000); await snap('encerrar+5.5s');
  }
  await browser.close(); server.close();
})().catch(e=>{console.error(e);process.exit(1);});
