/* google.script.run / server('fn') ↔ funções públicas; IDs do DOM usados no JS ↔ presentes no HTML. */
const fs=require('fs'),path=require('path');
const SRC=path.resolve(process.argv[2]||'clav-fix');
const gs=fs.readdirSync(SRC).filter(f=>f.endsWith('.gs')).map(f=>fs.readFileSync(path.join(SRC,f),'utf8')).join('\n');
const pub=new Set([...gs.matchAll(/^function\s+([A-Za-z]\w*)\s*\(/gm)].map(m=>m[1]).filter(n=>!n.endsWith('_')));
const idx=fs.readFileSync(path.join(SRC,'Index.html'),'utf8'), intra=fs.readFileSync(path.join(SRC,'Intra.html'),'utf8');
const calls=new Set();
for(const m of idx.matchAll(/\bserver\(\s*['"]([A-Za-z]\w*)['"]/g)) calls.add(m[1]);
for(const m of (idx+intra).matchAll(/google\.script\.run(?:\.with\w+\([^)]*\))*\.([A-Za-z]\w*)\(/g)) calls.add(m[1]);
for(const m of intra.matchAll(/\bchamar\(\s*['"]([A-Za-z]\w*)['"]/g)) calls.add(m[1]);
for(const m of intra.matchAll(/\brun\[\s*['"]([A-Za-z]\w*)['"]\s*\]/g)) calls.add(m[1]);
for(const m of intra.matchAll(/\bapi\.([A-Za-z]\w*)\(/g)) if(pub.has(m[1])) calls.add(m[1]);
const faltam=[...calls].filter(c=>!pub.has(c));
console.log('chamadas ao servidor:',calls.size,'| sem função pública:',faltam.length?faltam.join(','):'nenhuma');
function ids(html){ return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])); }
function used(html){ const s=new Set(); for(const m of html.matchAll(/\$\(\s*['"`]#([A-Za-z][\w-]*)['"`]\s*\)/g)) s.add(m[1]); for(const m of html.matchAll(/getElementById\(\s*['"`]([A-Za-z][\w-]*)['"`]\s*\)/g)) s.add(m[1]); return s; }
for(const [nome,html] of [['Index.html',idx],['Intra.html',intra]]){ const have=ids(html), use=used(html); const dyn=[...use].filter(i=>!have.has(i)); console.log(nome,'ids usados:',use.size,'| não encontrados no HTML estático:',dyn.length?dyn.join(','):'nenhum'); }
