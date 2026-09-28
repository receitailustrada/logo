/* Replica clavHashModulo_/clavHashConfig_ do 28_Versao.gs em Node, carregando os .gs num sandbox. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const SRC=path.resolve(process.argv[2]||'clav-fix');
const stub=()=>new Proxy(function(){}, {get:(t,p)=>p===Symbol.toPrimitive?()=>'':(p==='toString'?()=>'':stub()), apply:()=>stub(), construct:()=>stub()});
const ctx={console, Math, JSON, Date, RegExp, Number, String, Boolean, Array, Object, Error, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, Promise, Proxy, Reflect, Symbol};
['SpreadsheetApp','PropertiesService','CacheService','LockService','Utilities','HtmlService','ScriptApp','DriveApp','DocumentApp','MailApp','GmailApp','Session','Logger','UrlFetchApp','ContentService','CalendarApp'].forEach(n=>ctx[n]=stub());
vm.createContext(ctx); ctx.globalThis=ctx;
const files=fs.readdirSync(SRC).filter(f=>f.endsWith('.gs')).sort();
const perFile={};
for(const f of files){ const src=fs.readFileSync(path.join(SRC,f),'utf8'); try{ vm.runInContext(src,ctx,{filename:f}); }catch(e){ console.error('ERRO ao carregar',f,e.message); }
  perFile[f]=[...src.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]); }
const sha=t=>crypto.createHash('sha256').update(String(t),'utf8').digest('hex');
const curto=t=>sha(t).slice(0,16);
function hashModulo(nomes){ const partes=[],faltando=[]; for(const n of nomes){ if(n==='CLAV_MANIFESTO_') continue; const f=ctx[n]; if(typeof f!=='function'){ faltando.push(n); continue; } partes.push(n+'\u0001'+String(f.toString()).replace(/\r/g,'')); } return {hash:curto(partes.join('\u0002')),faltando}; }
const configHash=curto(JSON.stringify(ctx.CLAV));
module.exports={ctx,perFile,hashModulo,configHash,curto};
if(require.main===module){
  const mode=process.argv[3]||'validate';
  const man=ctx.CLAV_MANIFESTO_();
  if(mode==='validate'){
    let ok=0,dif=0;
    for(const m of man.modulos){ const h=hashModulo(m.funcoes); const same=h.hash===m.hash; if(same) ok++; else dif++; console.log((same?'OK       ':'DIFERENTE')+' '+m.arquivo+' manifesto='+m.hash+' calculado='+h.hash+(h.faltando.length?' faltando='+h.faltando.join(','):'')); }
    console.log('config_hash manifesto=',man.config_hash,'calculado=',configHash); console.log('iguais',ok,'diferentes',dif);
  } else if(mode==='generate'){
    const modulos=files.map(f=>({arquivo:f,funcoes:perFile[f],hash:hashModulo(perFile[f]).hash}));
    const html=(man.html||[]).map(h=>({arquivo:h.arquivo,caracteres:null,hash:'',pendente:'Execute adminSelarManifestoHtml no editor do Apps Script logo após publicar.'}));
    const out={gerado_em:new Date().toISOString().slice(0,10),build:process.argv[4]||ctx.CLAV_BUILD_.numero,config_hash:configHash,html,modulos};
    const linhas=['function CLAV_MANIFESTO_() {','  return {','    gerado_em: '+JSON.stringify(out.gerado_em)+',','    build: '+JSON.stringify(out.build)+',','    config_hash: '+JSON.stringify(out.config_hash)+',','    html: '+JSON.stringify(out.html)+',','    modulos: ['];
    modulos.forEach((m,i)=>linhas.push('      '+JSON.stringify(m)+(i<modulos.length-1?',':'')));
    linhas.push('    ]','  };','}');
    fs.writeFileSync('manifesto_gerado.js',linhas.join('\n')+'\n'); console.log('manifesto_gerado.js escrito:',modulos.length,'módulos,',modulos.reduce((a,m)=>a+m.funcoes.length,0),'funções, config_hash',configHash);
  }
}
