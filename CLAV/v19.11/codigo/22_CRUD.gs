/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 22_CRUD.gs
 * Acesso genérico às abas: insert, all, findRowBy e auditoria
 *
 * Conteúdo: sheet_, insert_, all_, allLite_, findRowBy_, logAudit_, safe_, ok_.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

/** CRUD helpers */
function sheet_(name) {
  if (CLAV_RUNTIME.sheets[name]) return CLAV_RUNTIME.sheets[name];
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw appError_('SCHEMA_MISSING', 'A aba ' + name + ' não existe. Execute adminInstalarOuReparar.');
  CLAV_RUNTIME.sheets[name] = sh;
  return sh;
}

function headers_(name) { return CLAV.SHEETS[name].headers; }

function insert_(name, obj) {
  var sh = sheet_(name);
  var values = objectToRow_(name, obj);
  sh.appendRow(values);
  return obj;
}

function writeObjectAtRow_(name, row, obj) {
  var sh = sheet_(name);
  sh.getRange(row, 1, 1, headers_(name).length).setValues([objectToRow_(name, obj)]);
}

function sanitizeCellForSheet_(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  var str = String(val);
  if (!str) return '';
  var first = str.charAt(0);
  // Proteção contra Formula Injection no Google Sheets: prefixa apóstrofo se iniciar com =, +, -, @
  if (first === '=' || first === '+' || first === '-' || first === '@') {
    if (!/^[-+]?\d+(\.\d+)?$/.test(str.trim())) {
      return "'" + str;
    }
  }
  return str;
}

function objectToRow_(name, obj) {
  return headers_(name).map(function (h) {
    var val = obj[h] !== undefined && obj[h] !== null ? obj[h] : '';
    return sanitizeCellForSheet_(val);
  });
}

// Le a aba SEM as colunas payload_json*, que sao gigantes. Usada por listagem,
// busca, agenda e dashboard (correcao 13).
function allLite_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var headers = headers_(name);
  if (last < 2) return [];
  var pesados = {};
  headers.forEach(function (h) { if (/^payload_json/.test(String(h))) pesados[h] = true; });
  var blocos = [];
  var inicio = -1;
  for (var c = 0; c < headers.length; c++) {
    var leve = !pesados[headers[c]];
    if (leve && inicio < 0) inicio = c;
    if ((!leve || c === headers.length - 1) && inicio >= 0) {
      var fim = leve ? c : c - 1;
      blocos.push({ from: inicio, to: fim });
      inicio = -1;
    }
  }
  var dados = blocos.map(function (b) {
    return sh.getRange(2, b.from + 1, last - 1, b.to - b.from + 1).getValues();
  });
  var out = [];
  for (var r = 0; r < last - 1; r++) {
    var obj = {};
    blocos.forEach(function (b, bi) {
      for (var k = b.from; k <= b.to; k++) obj[headers[k]] = dados[bi][r][k - b.from];
    });
    out.push(obj);
  }
  return out;
}

function all_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var headers = headers_(name);
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function allRowsWithNumbers_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var headers = headers_(name);
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row, index) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return { row: index + 2, obj: obj };
  });
}

function findRowBy_(name, field, value) {
  value = String(value || '');
  if (!value) return null;
  var sh = sheet_(name);
  var headers = headers_(name);
  var col = headers.indexOf(field) + 1;
  if (col < 1) throw new Error('Campo não existe em ' + name + ': ' + field);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var values = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === value) {
      var rowValues = sh.getRange(i + 2, 1, 1, headers.length).getValues()[0];
      var obj = {};
      headers.forEach(function (h, j) { obj[h] = rowValues[j]; });
      return { row: i + 2, obj: obj };
    }
  }
  return null;
}

function logAudit_(user, acao, entidade, entidadeId, before, after, result, userAgent, traceId) {
  try {
    insert_('AUDITORIA', {
      audit_id: uid_('AUD'),
      timestamp: nowISO_(),
      usuario_id: user && user.usuario_id ? user.usuario_id : '',
      usuario: user && user.usuario ? user.usuario : '',
      perfil: user && user.perfil ? user.perfil : '',
      acao: acao,
      entidade: entidade,
      entidade_id: entidadeId || '',
      antes_json: truncateCellText_(toJson_(compactAuditSnapshot_(before || {}))),
      depois_json: truncateCellText_(toJson_(compactAuditSnapshot_(after || {}))),
      resultado: result || 'OK',
      user_agent: String(userAgent || '').slice(0, 1000),
      trace_id: traceId || ''
    });
  } catch (ignored) {}
}

function safe_(origin, callback, context) {
  var traceId = 'ERR-' + Utilities.getUuid();
  try {
    return callback();
  } catch (err) {
    var code = err && err.code ? err.code : 'ERRO_INTERNO';
    // v19.9: sessão ausente/expirada/inválida não vai para a aba AUDITORIA (eram
    // ~700 linhas de ruído vindas da ficha em sala); continua no envelope de erro.
    var skipAuthSheetAudit = (!CLAV.AUDIT_LOGIN_TO_SHEET && ['validarLogin', 'encerrarSessao', 'inicializar'].indexOf(origin) >= 0) || /^SESSION_/.test(String(code));
    if (!skipAuthSheetAudit) {
      try {
        logAudit_(null, 'ERRO_' + origin, 'SISTEMA', '', context || {}, { message: err.message, code: code }, 'ERRO', '', traceId);
      } catch (ignored) {}
    }
    return {
      ok: false,
      message: err && err.message ? err.message : String(err),
      error: {
        origin: origin,
        code: code,
        traceId: traceId,
        details: err && err.details ? err.details : null
      }
    };
  }
}

function ok_(data) { return { ok: true, data: JSON.parse(JSON.stringify(data)) }; }

function uid_(prefix) {
  var stamp = Utilities.formatDate(new Date(), CLAV.TZ, 'yyyyMMddHHmmss');
  return prefix + '-' + stamp + '-' + randomText_(5).toUpperCase();
}

function randomText_(len) {
  var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var out = '';
  for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function sha256_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return raw.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function normalizeKey_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '');
}

function capitalize_(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function clean_(s, max) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, max || 5000); }
function toJson_(obj) { return JSON.stringify(obj || {}); }
function parseJson_(text, fallback) { try { return text ? JSON.parse(String(text)) : fallback; } catch (err) { return fallback; } }
function nowISO_() { return iso_(new Date()); }
function iso_(d) { return Utilities.formatDate(d, CLAV.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function nowBR_() { return Utilities.formatDate(new Date(), CLAV.TZ, 'dd/MM/yyyy HH:mm'); }
function val_(v) { return v === undefined || v === null || v === '' ? 'Não informado' : String(v); }
function esc_(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function sanitizeFileName_(s) { return String(s || '').replace(/[^a-zA-Z0-9_\-\.]+/g, '_').slice(0, 160); }
function preview_(obj) { var s = toJson_(obj || {}); return s.length > 1000 ? s.slice(0, 1000) + '...' : s; }

// CORRECAO 10 (LGPD). O contexto de erro gravava os primeiros 1.000 caracteres
// do payload bruto na aba AUDITORIA - e o payload comeca por nome, CPF,
// telefone, e-mail e nascimento. Agora vai apenas metadado nao identificavel.
