/* Sintaxe: todos os .gs (como .js) e todos os blocos <script> dos HTML (Intra renderizado como o include() real). */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),os=require('os');
const SRC=path.resolve(process.argv[2]||'clav-fix'); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'clavsyn-'));
let erros=0, n=0;
function check(nome,codigo){ const f=path.join(tmp,nome.replace(/[^\w.-]+/g,'_')+'.js'); fs.writeFileSync(f,codigo); try{ execFileSync('node',['--check',f],{stdio:['ignore','pipe','pipe']}); n++; }catch(e){ erros++; console.log('ERRO',nome,'\n',String(e.stderr||e.message).split('\n').slice(0,6).join('\n')); } }
for(const f of fs.readdirSync(SRC).filter(x=>x.endsWith('.gs')).sort()) check(f,fs.readFileSync(path.join(SRC,f),'utf8'));
function scripts(html,nome){ const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m,i=0; while((m=re.exec(html))){ i++; const attrs=m[1]; if(/type\s*=\s*["']application\/json["']/i.test(attrs)) continue; if(/\bsrc\s*=/.test(attrs)) continue; check(nome+'#script'+i,m[2]); } }
const idx=fs.readFileSync(path.join(SRC,'Index.html'),'utf8'); scripts(idx,'Index.html');
const farm=fs.readFileSync(path.join(SRC,'IntraFarmacos.html'),'utf8').replace(/<!--[\s\S]*?-->/g,'');
let intra=fs.readFileSync(path.join(SRC,'Intra.html'),'utf8');
intra=intra.replace("<?!= JSON.stringify(bootParams || {}).replace(/</g, '\\\\u003c') ?>", JSON.stringify({caso:'X',slot:'1',modo:'completo',webAppUrl:'https://x/exec',logoUrl:'',versao:'v'}));
intra=intra.replace("<?!= include('IntraFarmacos').replace(/<!--[\\s\\S]*?-->/g, '') ?>", farm);
if(intra.includes('<?')) { console.log('ERRO: scriptlet não renderizado em Intra.html'); erros++; }
scripts(intra,'Intra.html(renderizado)');
console.log('blocos verificados:',n,'| erros:',erros); process.exit(erros?1:0);
