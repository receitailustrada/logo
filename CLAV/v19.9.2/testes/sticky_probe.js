'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const { chromium } = require('playwright');
const SRC=path.resolve(process.argv[2]||'clav-fix'); const WWW=path.resolve('www_probe'); const PORT=8766; const BASE=`http://127.0.0.1:${PORT}`;
const WEB_URL='https://script.google.com/macros/s/MOCK_DEPLOY/exec';
const FAIXAS=JSON.parse(fs.readFileSync('faixas.json','utf8'));
const VERSION=(fs.readFileSync(path.join(SRC,'00_Config.gs'),'utf8').match(/VERSION:\s*'([^']+)'/)||[])[1];
fs.rmSync(WWW,{recursive:true,force:true}); fs.mkdirSync(WWW,{recursive:true}); fs.copyFileSync(path.join(SRC,'Index.html'),path.join(WWW,'Index.html'));
const server=http.createServer((req,res)=>{ const file=path.join(WWW,decodeURIComponent(req.url.split('?')[0].replace(/^\//,'')||'Index.html')); if(!file.startsWith(WWW)||!fs.existsSync(file)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(fs.readFileSync(file)); });
const MOCK=require('./mock.js')({VERSION,WEB_URL,FAIXAS});
(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const browser=await chromium.launch();
  for (const vw of [{width:1400,height:800},{width:1100,height:800}]) {
    const ctx=await browser.newContext({viewport:vw}); const page=await ctx.newPage();
    await page.route('**/*',route=>{ const u=route.request().url(); if(u.startsWith(BASE)) return route.continue(); return route.abort(); });
    await page.addInitScript(MOCK);
    await page.goto(BASE+'/Index.html',{waitUntil:'load'});
    await page.waitForFunction(()=>window.__CLAV_CLIENT_READY__===true,null,{timeout:20000});
    await page.waitForFunction(()=>{const b=document.getElementById('loginBtn');return b&&!b.disabled;},null,{timeout:20000});
    await page.fill('#loginUser','denis'); await page.fill('#loginPass','Senha!12345'); await page.click('#loginBtn');
    await page.waitForFunction(()=>typeof STATE!=='undefined'&&STATE.user&&STATE.user.usuario==='denis',null,{timeout:20000});
    await page.evaluate(async()=>{ await abrirRegistro('ATD-1'); });
    await page.waitForFunction(()=>document.getElementById('railPacNome').textContent.includes('Maria'),null,{timeout:10000});
    const secs=await page.evaluate(()=>Array.from(document.querySelectorAll('#stepNav button[data-go]')).map(b=>b.dataset.go));
    console.log('viewport',vw.width,'sections',secs.join(','));
    for(const s of secs){
      await page.evaluate(n=>showSection(n),s);
      await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(80);
      const info=await page.evaluate(()=>{ const card=document.getElementById('railPacienteCard'); const rail=document.querySelector('.rail'); const strip=document.getElementById('topPacienteStrip'); const cs=getComputedStyle(rail);
        return { docH:document.documentElement.scrollHeight, railH:rail.getBoundingClientRect().height, railPos:cs.position, railTop:cs.top, cardTop0:Math.round(card.getBoundingClientRect().top), stripDisplay:getComputedStyle(strip).display, preopStrip:(document.getElementById('preopPacienteStrip')||{}).offsetParent!==undefined && document.getElementById('preopPacienteStrip')? getComputedStyle(document.getElementById('preopPacienteStrip')).display:'-' }; });
      await page.evaluate(()=>window.scrollTo(0,1200)); await page.waitForTimeout(120);
      const after=await page.evaluate(()=>{ const card=document.getElementById('railPacienteCard'); return { scrollY:window.scrollY, cardTop:Math.round(card.getBoundingClientRect().top), cardVisible: card.getBoundingClientRect().bottom>0 && card.getBoundingClientRect().top < innerHeight }; });
      console.log(' ',s.padEnd(14),'docH',info.docH,'railH',Math.round(info.railH),'pos',info.railPos,'top',info.railTop,'card@0',info.cardTop0,'| scrollY',after.scrollY,'card',after.cardTop,after.cardVisible?'VISÍVEL':'FORA','| strip',info.stripDisplay,'preopStrip',info.preopStrip);
    }
    await ctx.close();
  }
  await browser.close(); server.close();
})().catch(e=>{console.error(e);process.exit(1);});
