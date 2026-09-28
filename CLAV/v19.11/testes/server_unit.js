/* Testes unitários do servidor (.gs em sandbox Node) — v19.10.
   Uso: node server_unit.js [pasta-do-codigo]
   Cobre: lateralidade pelo catálogo (A5), leitura de datas civis (A3), prescrição de internação (C13),
   meta.forcarRevisao (item 13), diagnóstico/normalização de datas (A3) e encerramento assumindo o responsável. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.resolve(process.argv[2] || 'clav-fix');
const stub = () => new Proxy(function () {}, { get: (t, p) => p === Symbol.toPrimitive ? () => '' : (p === 'toString' ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
const ctx = { console, Math, JSON, Date, RegExp, Number, String, Boolean, Array, Object, Error, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, Promise, Proxy, Reflect, Symbol };
['SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'HtmlService', 'ScriptApp', 'DriveApp', 'DocumentApp', 'MailApp', 'GmailApp', 'Session', 'Logger', 'UrlFetchApp', 'ContentService', 'CalendarApp'].forEach(n => ctx[n] = stub());
function fmt(date, tz, pattern) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
  const g = t => (parts.find(p => p.type === t) || {}).value;
  let hh = g('hour'); if (hh === '24') hh = '00';
  const map = { yyyy: g('year'), MM: g('month'), dd: g('day'), HH: hh, mm: g('minute'), ss: g('second') };
  return String(pattern).replace(/'T'/g, 'T').replace(/yyyy|MM|dd|HH|mm|ss|XXX/g, k => k === 'XXX' ? '-03:00' : map[k]);
}
ctx.Utilities = new Proxy({}, { get: (t, p) => p === 'formatDate' ? fmt : (p === 'getUuid' ? () => 'uuid-' + Math.random().toString(16).slice(2) : stub()) });
vm.createContext(ctx); ctx.globalThis = ctx;
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort()) {
  try { vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }); } catch (e) { console.error('ERRO ao carregar', f, e.message); process.exit(2); }
}
const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond }); console.log((cond ? '  OK   ' : '  FALHA') + ' ' + name + (cond ? '' : '  → ' + String(detail === undefined ? '' : detail).slice(0, 400))); }
const run = code => vm.runInContext(code, ctx);

/* ---------- A5: lateralidade pelo catálogo ---------- */
console.log('\n[A5] lateralidade no servidor pela aba PROCEDIMENTOS');
ctx.catalogoAtivo_ = (sheet, fallback) => sheet === 'PROCEDIMENTOS' ? [
  { nome: 'Meniscectomia artroscópica', grupo: 'Ortopedia e Traumatologia', lateralidade: 'SIDE', carater: 'Eletivo', porte: '' },
  { nome: 'Colecistectomia videolaparoscópica', grupo: 'Cirurgia Geral e Digestiva', lateralidade: 'NA', carater: 'Eletivo', porte: '' },
  { nome: 'Ooforectomia Laparoscópica', grupo: 'Ginecologia e Obstetrícia', lateralidade: 'SIDE', carater: 'Eletivo', porte: '' },
  { nome: 'Dacriocistorrinostomia', grupo: 'Oftalmologia', lateralidade: 'SIDE', carater: 'Eletivo', porte: '' }
] : fallback;
ctx.CLAV_PROC_CAT_CACHE_ = null;
const user = { usuario_id: 'U1', usuario: 'denis', nome: 'Denis Paim Cipriani', perfil: 'ANESTESISTA', crm: '1', ativo: 'SIM' };
function payloadBase(proc, lado) {
  return { paciente: { nome: 'Teste', nascimento: '1980-01-01', idade: '46', sexo: 'Masculino' }, procedimento: { nome: proc, lateralidade: lado }, atendimento: {}, triagem: { pa: '120/80', fc: '70', fr: '16', spo2: '98', peso: '70', altura: '170', temperatura: '36.5' }, preop: { asa: 'ASA I', anestesiologista: 'Denis Paim Cipriani' }, viaAerea: { mallampati: 'I' }, conduta: {}, anamnese: {}, sistemas: {}, riscos: {}, seguranca: {}, intraop: {}, srpa: {}, exames: {}, documentos: {}, calculos: {} };
}
ctx.__user = user;
const ids = (proc, lado) => { ctx.__p = payloadBase(proc, lado); return run('gerarAlertasServidor_(__p, __user)').map(a => a.id + ':' + a.tipo); };
const r1 = ids('Meniscectomia artroscópica', 'Direita');
check('Meniscectomia (SIDE na aba) com "Direita" não gera LATERALIDADE_INDEVIDA', !r1.some(x => /LATERALIDADE/.test(x)), r1.join(','));
const r2 = ids('Dacriocistorrinostomia', 'Não se aplica');
check('Dacriocistorrinostomia (SIDE na aba, regex antiga não reconhecia) sem lado → aviso LATERALIDADE_AUSENTE', r2.includes('LATERALIDADE_AUSENTE:warn'), r2.join(','));
const r3 = ids('Colecistectomia videolaparoscópica', 'Direita');
check('Colecistectomia (NA) com "Direita" continua alerta grave LATERALIDADE_INDEVIDA', r3.includes('LATERALIDADE_INDEVIDA:danger'), r3.join(','));
const r4 = ids('Colecistectomia videolaparoscópica', 'Bilateral');
check('Colecistectomia (NA) com "Bilateral" vira aviso (LATERALIDADE_BILATERAL_CONFERIR), sem alerta grave', r4.includes('LATERALIDADE_BILATERAL_CONFERIR:warn') && !r4.some(x => /:danger/.test(x) && /LATERALIDADE/.test(x)), r4.join(','));
const r5 = ids('Ooforectomia Laparoscópica', 'Bilateral');
check('Ooforectomia (SIDE na aba) com "Bilateral" não gera alerta de lateralidade', !r5.some(x => /LATERALIDADE/.test(x)), r5.join(','));
const r6 = ids('Procedimento inventado do joelho', 'Não se aplica');
check('Procedimento fora do catálogo cai na inferência pelo nome (joelho → lado esperado)', r6.includes('LATERALIDADE_AUSENTE:warn'), r6.join(','));
check('Catálogo lido uma vez por execução (cache)', run('Object.keys(clavCatalogoProcedimentosServidor_()).length') === 4 && run('CLAV_PROC_CAT_CACHE_ !== null'));

/* ---------- A3: leitura de datas ---------- */
console.log('\n[A3] datas civis sem deslocamento');
ctx.__tzPlan = 'America/Sao_Paulo';
ctx.getSpreadsheet_ = () => ({ getSpreadsheetTimeZone: () => ctx.__tzPlan });
ctx.CLAV_FUSO_PLANILHA_CACHE_ = '';
const dia = v => { ctx.__v = v; return run('diaCalendarioClav_(__v)'); };
check('texto civil "2026-09-29" → 2026-09-29', dia('2026-09-29') === '2026-09-29', dia('2026-09-29'));
check('hora local "2026-09-29T10:30" → 2026-09-29', dia('2026-09-29T10:30') === '2026-09-29', dia('2026-09-29T10:30'));
check('legado meia-noite UTC "2026-09-29T00:00:00Z" → 2026-09-29 (antes: 2026-09-28)', dia('2026-09-29T00:00:00Z') === '2026-09-29', dia('2026-09-29T00:00:00Z'));
check('legado "2026-09-29T00:00:00.000Z" → 2026-09-29', dia('2026-09-29T00:00:00.000Z') === '2026-09-29', dia('2026-09-29T00:00:00.000Z'));
check('instante real "2026-09-29T02:30:00Z" (23:30 do dia 28 em SP) → 2026-09-28', dia('2026-09-29T02:30:00Z') === '2026-09-28', dia('2026-09-29T02:30:00Z'));
check('instante local com fuso "2026-09-29T00:00:00-03:00" → 2026-09-29', dia('2026-09-29T00:00:00-03:00') === '2026-09-29', dia('2026-09-29T00:00:00-03:00'));
check('célula Date (meia-noite de SP) com planilha em SP → 2026-09-29', dia(new Date('2026-09-29T00:00:00-03:00')) === '2026-09-29', dia(new Date('2026-09-29T00:00:00-03:00')));
ctx.__tzPlan = 'UTC'; ctx.CLAV_FUSO_PLANILHA_CACHE_ = '';
check('célula Date (meia-noite UTC) com planilha em UTC → 2026-09-29 (antes: 2026-09-28)', dia(new Date('2026-09-29T00:00:00Z')) === '2026-09-29', dia(new Date('2026-09-29T00:00:00Z')));
ctx.__tzPlan = 'America/Sao_Paulo'; ctx.CLAV_FUSO_PLANILHA_CACHE_ = '';
check('valor inválido → vazio', dia('ontem') === '' && dia('') === '');
check('nascimento legado "1970-05-03T00:00:00Z" → 1970-05-03 (patientFieldValue_)', run("patientFieldValue_('nascimento', '1970-05-03T00:00:00Z')") === '1970-05-03');

/* diagnóstico e normalização com planilha falsa */
console.log('\n[A3] diagnóstico e normalização das colunas de data');
const headers = run('CLAV.SHEETS.ATENDIMENTOS.headers');
const col = n => headers.indexOf(n);
const linhas = [];
function linha(id, nome, consulta, cirurgia) { const r = headers.map(() => ''); r[col('atendimento_id')] = id; r[col('paciente_nome')] = nome; r[col('data_consulta')] = consulta; r[col('data_cirurgia')] = cirurgia; linhas.push(r); }
linha('ATD-A', 'Ana', '2026-09-28T09:00', '2026-09-29');                       // padrão civil: nada a fazer
linha('ATD-B', 'Bruno', '2026-09-28T09:00', '2026-09-29T00:00:00Z');          // legado UTC meia-noite
linha('ATD-C', 'Carla', new Date('2026-09-28T09:00:00-03:00'), new Date('2026-09-29T00:00:00-03:00')); // células convertidas em data
linha('ATD-D', 'Davi', '2026-09-28T12:00:00.000Z', '');                        // instante real com fuso (09:00 em SP)
const escritas = [], formatos = [];
const fakeSheet = {
  getLastRow: () => linhas.length + 1,
  getMaxRows: () => linhas.length + 1,
  getRange: (r, c, nr, nc) => ({
    getValues: () => linhas.slice(r - 2, r - 2 + (nr || 1)).map(row => row.slice(c - 1, c - 1 + (nc || 1))),
    setNumberFormat: f => { formatos.push({ r, c, nr: nr || 1, f }); return fakeSheet.getRange(r, c, nr, nc); },
    setValue: v => { escritas.push({ r, c, v }); linhas[r - 2][c - 1] = v; }
  })
};
ctx.sheet_ = name => { if (name !== 'ATENDIMENTOS') throw new Error('aba inesperada ' + name); return fakeSheet; };
ctx.acquireWriteLock_ = () => ({}); ctx.releaseLock_ = () => {}; ctx.logAudit_ = () => {}; ctx.insert_ = () => {};
const diag = run('clavLinhasDatasForaDoPadrao_()');
const porId = {}; diag.forEach(l => { porId[l.atendimento_id + ':' + l.campo] = l; });
check('diagnóstico ignora linhas já civis (ATD-A) e lista B, C e D', !porId['ATD-A:data_cirurgia'] && !porId['ATD-A:data_consulta'] && porId['ATD-B:data_cirurgia'] && porId['ATD-C:data_cirurgia'] && porId['ATD-C:data_consulta'] && porId['ATD-D:data_consulta'], JSON.stringify(Object.keys(porId)));
check('ATD-B: legado UTC → dia 29 (antes lia 28) e texto proposto civil', porId['ATD-B:data_cirurgia'].dia === '2026-09-29' && porId['ATD-B:data_cirurgia'].diaAntigo === '2026-09-28' && porId['ATD-B:data_cirurgia'].texto === '2026-09-29', JSON.stringify(porId['ATD-B:data_cirurgia']));
check('ATD-C: célula de data → texto civil (cirurgia) e data+hora local (consulta)', porId['ATD-C:data_cirurgia'].texto === '2026-09-29' && porId['ATD-C:data_consulta'].texto === '2026-09-28T09:00', JSON.stringify([porId['ATD-C:data_cirurgia'].texto, porId['ATD-C:data_consulta'].texto]));
check('ATD-D: instante real vira hora local de SP (09:00) no mesmo dia', porId['ATD-D:data_consulta'].texto === '2026-09-28T09:00' && porId['ATD-D:data_consulta'].dia === '2026-09-28', JSON.stringify(porId['ATD-D:data_consulta']));
const semConfirmar = run('clavNormalizarDatasAtendimentos()');
check('normalização sem "true" não grava nada', /Nada foi alterado/.test(semConfirmar) && escritas.length === 0);
const resumo = run('clavNormalizarDatasAtendimentos(true)');
check('normalização com "true" regrava só as 4 células fora do padrão, como texto, e formata as duas colunas', escritas.length === 4 && escritas.every(e => typeof e.v === 'string') && formatos.filter(f => f.f === '@' && f.nr === linhas.length).length === 2 && /4 célula/.test(resumo), JSON.stringify({ escritas, formatos: formatos.length, resumo }));
check('depois da normalização, a agenda lê o dia certo para todos (linhas B e C → 29)', dia(linhas[1][col('data_cirurgia')]) === '2026-09-29' && dia(linhas[2][col('data_cirurgia')]) === '2026-09-29' && run('clavLinhasDatasForaDoPadrao_()').length === 0);

/* ---------- C13: prescrição de internação ---------- */
console.log('\n[C13] prescrição de internação no servidor');
const pm = c => { ctx.__p = { anamnese: { medicacoes: 'Losartana 50 mg; Metformina 850 mg' }, conduta: c }; return run('prescricaoMedicacoes_(__p)'); };
check('lista nunca tocada e vazia → medicações em uso (comportamento antigo)', pm({ medicacoes_internacao: [] }).join('|') === 'Losartana 50 mg|Metformina 850 mg');
check('lista tocada e vazia → "Sem medicações de uso contínuo…"', /Sem medicações de uso contínuo/.test(pm({ medicacoes_internacao: [], medicacoes_internacao_tocada: 'SIM' }).join('|')));
check('lista tocada com tudo suspenso → "Sem medicações…" (não volta tudo)', /Sem medicações/.test(pm({ medicacoes_internacao: [{ medicamento: 'Losartana 50 mg', conduta: 'Suspender' }], medicacoes_internacao_tocada: 'SIM' }).join('|')));
check('lista com item mantido → só ele', pm({ medicacoes_internacao: [{ medicamento: 'Metformina 850 mg', conduta: 'Manter', dose: '', horario: '' }, { medicamento: 'Losartana 50 mg', conduta: 'Suspender' }], medicacoes_internacao_tocada: 'SIM' }).join('|') === 'Metformina 850 mg');
check('normalizePayload_ garante os campos novos', (() => { ctx.__p = { conduta: {} }; const n = run('normalizePayload_(__p)'); return Array.isArray(n.conduta.medicacoes_internacao_excluidas) && n.conduta.medicacoes_internacao_tocada === ''; })());

/* ---------- item 13: forcarRevisao ---------- */
console.log('\n[item 13] meta.forcarRevisao');
check('normalizeSaveMeta_ só aceita true literal', run("normalizeSaveMeta_({ forcarRevisao: true, baseRevision: 3 }, {}).forcarRevisao === true && normalizeSaveMeta_({ forcarRevisao: 'true' }, {}).forcarRevisao === false && normalizeSaveMeta_({}, {}).forcarRevisao === false"));
check('assertTransitionRevision_ com forcarRevisao não lança mesmo com revisão diferente', (() => { try { ctx.__info = { obj: { revision: 7, atendimento_id: 'X' } }; run('assertTransitionRevision_(__info, { baseRevision: 3, forcarRevisao: true })'); return true; } catch (e) { return false; } })());
check('assertTransitionRevision_ sem forçar continua lançando CONFLITO_REVISAO', (() => { ctx.revisoesSomenteDaFicha_ = () => false; try { run('assertTransitionRevision_(__info, { baseRevision: 3 })'); return false; } catch (e) { return /CONFLITO_REVISAO/.test(e.message) || (e.code === 'CONFLITO_REVISAO') || /outra versão/.test(String(e.message)); } })());

/* ---------- PDF: rótulos ---------- */
console.log('\n[PDF] rótulos');
const secoes = fs.readFileSync(path.join(SRC, '21_PDF_Secoes.gs'), 'utf8'), layout = fs.readFileSync(path.join(SRC, '20_PDF_Layout.gs'), 'utf8');
check('21_PDF_Secoes: "Observações finais para o bloco cirúrgico" no lugar de "Prescrição pré-anestésica"', secoes.includes("gi_('Observações finais para o bloco cirúrgico'") && !secoes.includes("gi_('Prescrição pré-anestésica'"));
check('21_PDF_Secoes: título "ESTRATIFICAÇÃO FINAL / ASA"', secoes.includes("'ESTRATIFICAÇÃO FINAL / ASA'"));
check('20_PDF_Layout: "Não tabagista"', layout.includes("'Não tabagista'") && !layout.includes('nunca fumou)'));

/* ---------- v19.11: folha impressa (motor do servidor) e documento de pedidos ---------- */
console.log('\n[v19.11] folha impressa no servidor: grade fixa, células em linha, textos padrão, pedidos');
ctx.interacoesParaImpressao_ = () => [];
ctx.__pl = { paciente: { nome: 'Maria da Silva', nome_preferido: '', prontuario: 'CLAV-00012', nascimento: '1970-05-03', idade: '56', sexo: 'Feminino' },
  atendimento: { atendimento_id: 'ATD-1', data_consulta: '2026-09-28T09:00', convenio: 'SUS', local: 'Hospital' },
  procedimento: { nome: 'Colecistectomia videolaparoscópica', lateralidade: 'Não se aplica', carater: 'Eletivo', data_cirurgia: '2026-09-29', cirurgiao_1: 'Dr. Cirurgião', risco_cirurgico: 'Intermediário' },
  triagem: { pa: '180/80', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170', responsavel: 'Liamara', dor: '3' },
  preop: { asa: '', anestesiologista: 'Denis Paim Cipriani', data_avaliacao: '2026-09-28T10:00', mets: '> 4 METs' },
  anamnese: { alergias: '', alergias_itens: [], medicacoes: '', antecedentes_texto: '' },
  conduta: { tcle: 'Assinado', conclusao: 'Apto', anestesia_proposta: 'Anestesia geral', solicitacoes_itens: ['ECG', 'Avaliação cardiológica'], solicitacoes_detalhes: { ECG: 'Rotina (HAS)' }, solicitacoes_outros: 'Hemograma recente' },
  exames: { hb: '14,3', creatinina: '0,9' }, sistemas: {}, exame: { ausculta_cardiaca_status: 'Com alterações', ausculta_cardiaca: 'Sopro sistólico 2+/6' }, viaAerea: { mallampati: '', distancia_tireomentoniana: '7' }, riscos: {}, seguranca: {}, srpa: {}, documentos: {}, calculos: { imc: '24.2', imc_classe: 'Eutrofia', rcri: '0', stop_bang: '1', caprini: '1' }, intraop: {} };
const secsSrv = run("buildPdfSections_(__pl, 'AVALIACAO_PRE_ANESTESICA', __user)");
const bySrv = t => secsSrv.find(x => x.title === t);
const valSrv = (sec, label) => { const it = sec && sec.grid && sec.grid.find(g => g[0] === label); return it ? it[1] : null; };
const identS = bySrv('IDENTIFICAÇÃO DO PACIENTE E DO PROCEDIMENTO'), triS = bySrv('TRIAGEM, SINAIS VITAIS E DADOS ANTROPOMÉTRICOS'), antS = bySrv('ANTECEDENTES E HISTÓRIA CLÍNICA'), efS = bySrv('EXAME FÍSICO'), vaS = bySrv('VIA AÉREA'), escS = bySrv('ESCORES DE RISCO'), apS = bySrv('ANTECEDENTES PRINCIPAIS'), estS = bySrv('ESTRATIFICAÇÃO FINAL / ASA'), condS = bySrv('CONDUTA, PLANO E SEGURANÇA');
check('D3 servidor: cabeçalho fixo 3×4 em linha, nome em caixa alta, três rótulos, sem nascimento', !!identS && identS.fixo === true && identS.grid[0][1] === 'MARIA DA SILVA' && identS.grid[0][3] === 'nome' && identS.grid.slice(0, 12).every(g => g[4] === 'inline') && identS.grid.slice(0, 12).map(g => g[0]).filter(Boolean).join('|') === 'Data da consulta|Data da cirurgia|Prontuário' && valSrv(identS, 'Data da consulta') === '28/09/2026', JSON.stringify(identS && identS.grid.slice(0, 12)));
check('D4 servidor: triagem 8 células em linha com unidade, fixa, sem responsável', !!triS && triS.fixo === true && triS.grid.filter(g => g[2] !== 'full').length === 8 && valSrv(triS, 'PA') === '180/80 mmHg' && valSrv(triS, 'Peso') === '70 kg' && !triS.grid.some(g => /Respons/.test(g[0])), JSON.stringify(triS && triS.grid.map(g => g[0] + '=' + g[1])));
check('D5 servidor: sem seção "CONSULTA PRÉ-ANESTÉSICA"; TCLE na conduta; dor no exame físico', !secsSrv.some(x => x.title === 'CONSULTA PRÉ-ANESTÉSICA') && valSrv(condS, 'TCLE') === 'Assinado' && valSrv(efS, 'Escala de dor (0 a 10)') === '3', JSON.stringify(secsSrv.map(x => x.title)));
check('D2 servidor: textos padrão (medicações, cirurgias, alergias, hábitos, antecedentes, ASA, Mallampati)', valSrv(antS, 'Medicações em uso atual/recente') === 'NENHUMA MEDICAÇÃO EM USO' && /Nega cirurgias/.test(valSrv(antS, 'Cirurgias e procedimentos prévios')) && valSrv(antS, 'Alergias') === 'Nega alergias' && /Nega tabagismo/.test(valSrv(antS, 'Hábitos')) && valSrv(apS, 'Resumo consolidado') === 'PACIENTE HÍGIDO' && /ASA ___/.test(valSrv(estS, 'ASA')) && /Mallampati ___/.test(valSrv(vaS, 'Mallampati')), JSON.stringify({ m: valSrv(antS, 'Medicações em uso atual/recente'), al: valSrv(antS, 'Alergias'), asa: valSrv(estS, 'ASA'), mp: valSrv(vaS, 'Mallampati') }));
check('D2 servidor: "Nega alergias" padrão NÃO recebe o destaque vermelho', antS && (antS.grid.find(g => g[0] === 'Alergias') || [])[3] === '');
check('D7/D9 servidor: exames e DTM em linha; escores só com os três; estratificação fixa em 4 na ordem pedida', (bySrv('EXAMES COMPLEMENTARES').grid.find(g => g[0] === 'Hemoglobina') || [])[4] === 'inline' && valSrv(bySrv('EXAMES COMPLEMENTARES'), 'Hemoglobina') === '14,3 g/dL' && (vaS.grid.find(g => /tireomentoniana/.test(g[0])) || [])[4] === 'inline' && escS.grid.map(g => g[0]).join('|') === 'RCRI (Índice de Lee)|STOP-Bang|Caprini' && estS.fixo === true && estS.grid.map(g => g[0]).join('|') === 'Capacidade funcional|ASA|Risco do procedimento cirúrgico|Estratificação global do risco do paciente', JSON.stringify({ est: estS.grid.map(g => g[0]), esc: escS.grid.map(g => g[0]) }));
check('C7 servidor: ausculta "Com alterações" imprime o texto editado', valSrv(efS, 'Ausculta cardíaca') === 'Sopro sistólico 2+/6');
const rowsFix = run("packGridRows_([['A','1',1,'','inline'],['B','2',1],['C','3',1]], 4, true)");
check('packGridRows_ fixo: 4 colunas mesmo com 3 itens, vazio com traço, marca em linha preservada', rowsFix.length === 1 && rowsFix[0].length === 4 && rowsFix[0][3].value === '—' && rowsFix[0][0].inline === true && rowsFix[0][1].inline === false, JSON.stringify(rowsFix));
const rowsLivre = run("packGridRows_([['A','1',1],['B','2',1],['C','3',1]], 4)");
check('packGridRows_ sem fixo: continua refluindo (3 itens → 3 colunas)', rowsLivre.length === 1 && rowsLivre[0].length === 3);
check('gridCellText_: em linha "PA: 120/80 mmHg"; comum com quebra', run("gridCellText_({ label: 'PA', value: '120/80 mmHg', inline: true })") === 'PA: 120/80 mmHg' && run("gridCellText_({ label: 'PA', value: '120/80 mmHg' })") === 'PA\n120/80 mmHg');
check("normalizeDocumentType_('PEDIDOS') e alias SOLICITACOES válidos; desconhecido continua recusado", run("normalizeDocumentType_('PEDIDOS')") === 'PEDIDOS' && run("normalizeDocumentType_('solicitacoes')") === 'PEDIDOS' && (() => { try { run("normalizeDocumentType_('XPTO')"); return false; } catch (e) { return true; } })());
const pedS = run("buildPdfSections_(__pl, 'PEDIDOS', __user)");
const exS = pedS.find(x => x.title === 'SOLICITAÇÃO DE EXAMES'), avS = pedS.find(x => /AVALIAÇÃO ESPECIALIZADA/.test(x.title)), outS = pedS.find(x => /OUTRAS SOLICITAÇÕES/.test(x.title));
check('C12 servidor: documento de pedidos com identificação, triagem, contexto, exames e avaliações numerados, texto por item e campo livre', pedS[0].title === 'IDENTIFICAÇÃO DO PACIENTE E DO PROCEDIMENTO' && pedS.some(x => x.title === 'CONTEXTO DA SOLICITAÇÃO') && exS && exS.rows[0].join('|') === '1|ECG|Rotina (HAS)' && avS && avS.rows[0][1] === 'Avaliação cardiológica' && outS && outS.grid[0][1] === 'Hemograma recente' && run("pdfTitle_('PEDIDOS')") === 'SOLICITAÇÃO DE EXAMES E AVALIAÇÕES', JSON.stringify(pedS.map(x => x.title)));
check('C12 servidor: normalizePayload_ garante solicitacoes_detalhes como objeto', (() => { ctx.__p = { conduta: { solicitacoes_detalhes: ['x'] } }; return JSON.stringify(run('normalizePayload_(__p)').conduta.solicitacoes_detalhes) === '{}'; })());
check('Relatório narrativo continua gerando texto com as seções novas', /IDENTIFICAÇÃO DO PACIENTE/.test(run("relatorioNarrativoServidor_(__pl, 'RELATORIO_NARRATIVO', __user)")));

const falhas = results.filter(r => !r.ok).length;
console.log(`\nRESULTADO SERVIDOR: ${results.length - falhas} OK / ${falhas} FALHA(S)`);
fs.writeFileSync('server-unit-resultado.json', JSON.stringify({ src: SRC, data: new Date().toISOString(), resultados: results }, null, 2));
process.exit(falhas ? 1 : 0);
