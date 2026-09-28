/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 23_Utils.gs
 * Utilitários, manutenção, instalação e migração de esquema
 *
 * Conteúdo: Normalizações, hashes de payload, manutencaoDiaria, installOrRepair_, locks.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function contextoSeguroSalvamento_(payload, requestMeta) {
  var p = payload || {};
  var meta = requestMeta && typeof requestMeta === 'object' ? requestMeta : {};
  var tamanho = 0;
  try { tamanho = JSON.stringify(p).length; } catch (ignored) {}
  return {
    atendimentoId: String((p.atendimento && p.atendimento.atendimento_id) || ''),
    pacienteInformado: !!(p.paciente && String(p.paciente.nome || '').trim()),
    tamanhoPayload: tamanho,
    secoes: Object.keys(p).join(','),
    requestId: String(meta.requestId || ''),
    baseRevision: meta.baseRevision === undefined ? '' : String(meta.baseRevision)
  };
}

function normalizeLoginInput_(s) {
  return normalizeKey_(String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, ''));
}

function normalizeEmail_(s) {
  return String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
}

function digitsOnly_(s) {
  return String(s || '').replace(/\D/g, '');
}

function normalizePasswordInput_(s) {
  // Não aplica trim, caixa alta/baixa ou remoção de caracteres especiais.
  return String(s === undefined || s === null ? '' : s);
}

function constantTimeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var mismatch = a.length ^ b.length;
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^ (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
  }
  return mismatch === 0;
}

function deepClone_(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function stableStringify_(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify_).join(',') + ']';
  if (Object.prototype.toString.call(value) === '[object Date]') return JSON.stringify(value.toISOString());
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify_(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function payloadMeaningfulHash_(payload) {
  var copy = deepClone_(normalizePayload_(deepClone_(payload || {})));
  if (copy.atendimento) {
    delete copy.atendimento.updated_at;
    delete copy.atendimento.updated_by;
    delete copy.atendimento.revision;
    delete copy.atendimento._saveReceipt;
  }
  return sha256_(stableStringify_(copy));
}

function patientMeaningfulHash_(patient) {
  var copy = deepClone_(patient || {});
  delete copy.updated_at;
  delete copy.updated_by;
  return sha256_(stableStringify_(copy));
}

// Limpeza real das abas de sessao e recuperacao. A funcao anterior era um
// no-op e nunca era chamada: SESSOES crescia sem limite e a validacao de
// sessao (executada em toda acao) ficava progressivamente mais lenta
// (correcao 16). Roda na instalacao/reparo e pode ser agendada por gatilho.
function limparSessoesAntigas_(diasRetencao) {
  var dias = Number(diasRetencao || 45);
  var limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  var removidas = { sessoes: 0, recuperacoes: 0 };
  try {
    removidas.sessoes = purgarLinhasAntigas_('SESSOES', function (obj) {
      var exp = parseIsoMillis_(obj.expires_at);
      var rev = parseIsoMillis_(obj.revoked_at);
      if (rev && rev < limite) return true;
      return !!exp && exp < limite;
    });
  } catch (ignoredS) {}
  try {
    removidas.recuperacoes = purgarLinhasAntigas_('RECUPERACOES', function (obj) {
      var criado = parseIsoMillis_(obj.created_at);
      return !!criado && criado < limite;
    });
  } catch (ignoredR) {}
  return removidas;
}

function purgarLinhasAntigas_(sheetName, deveRemover) {
  var sh = sheet_(sheetName);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var headers = headers_(sheetName);
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var manter = [];
  var removidas = 0;
  for (var i = 0; i < values.length; i++) {
    var obj = {};
    headers.forEach(function (h, j) { obj[h] = values[i][j]; });
    if (deveRemover(obj)) removidas++;
    else manter.push(values[i]);
  }
  if (!removidas) return 0;
  // v19.9: UMA escrita cobrindo o bloco original (linhas mantidas + linhas em
  // branco no fim), em vez de clearContent seguido de setValues: não há janela em
  // que a aba de sessões fica vazia se a execução cair entre as duas chamadas.
  var largura = headers.length;
  var vazia = [];
  for (var c = 0; c < largura; c++) vazia.push('');
  var bloco = manter.slice();
  while (bloco.length < values.length) bloco.push(vazia.slice());
  sh.getRange(2, 1, values.length, largura).setValues(bloco);
  SpreadsheetApp.flush();
  return removidas;
}

// Alvo de gatilho diario opcional (Acionadores > adicionar > manutencaoDiaria).
function manutencaoDiaria() {
  requireInstalled_();
  var lock = acquireWriteLock_('manutencao diaria', 30000);
  try { return limparSessoesAntigas_(); }
  finally { releaseLock_(lock); }
}

function assertManualAdministrator_() {
  var active = '';
  var effective = '';
  try { active = normalizeEmail_(Session.getActiveUser().getEmail()); } catch (ignored) {}
  try { effective = normalizeEmail_(Session.getEffectiveUser().getEmail()); } catch (ignored2) {}
  var email = active || effective;
  var allowed = (CLAV.DRIVE_EDITORS || []).map(normalizeEmail_);
  if (!email || allowed.indexOf(email) < 0) {
    throw new Error('Execute esta função manualmente no editor usando receituarioilustrado@gmail.com ou contatoclavrs@gmail.com.');
  }
}

function installOrRepair_(resetDefaultPasswords) {
  var lock = acquireWriteLock_('instalação/reparo', 30000);
  try {
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty(CLAV.INSTALLATION_ID_PROP)) {
      props.setProperty(CLAV.INSTALLATION_ID_PROP, Utilities.getUuid());
    }

    var ss = getOrCreateSpreadsheet_();
    CLAV_RUNTIME.spreadsheet = ss;
    CLAV_RUNTIME.sheets = {};
    Object.keys(CLAV.SHEETS).forEach(function (name, idx) {
      var def = CLAV.SHEETS[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      if (idx === 0 && ss.getSheets()[0].getName() !== name) {
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(1);
      }
      ensureHeaders_(sh, def.headers, def.color);
      CLAV_RUNTIME.sheets[name] = sh;
    });

    // Remove a aba padrao vazia criada junto com a planilha (correcao 27).
    ['Página1', 'Pagina1', 'Sheet1', 'Folha1'].forEach(function (nome) {
      try {
        var extra = ss.getSheetByName(nome);
        if (extra && !CLAV.SHEETS[nome] && ss.getSheets().length > 1) ss.deleteSheet(extra);
      } catch (ignoredDefault) {}
    });

    seedConfig_();
    seedCatalogos_();
    // Bases já instaladas: acrescenta os procedimentos novos do catálogo
    // embutido e preenche lateralidade/caráter nas linhas em branco.
    try { sincronizarCatalogoProcedimentos_(true); } catch (ignoredCat) {}
    seedUsers_(!!resetDefaultPasswords);
    ensureDatabaseSharing_(ss);
    limparSessoesAntigas_();

    props.setProperty(CLAV.INSTALL_READY_PROP, 'SIM');
    props.setProperty('CLAV_SCHEMA_VERSION', CLAV.SCHEMA_VERSION);
    props.setProperty(CLAV.SCHEMA_MIGRATED_PROP, CLAV.SCHEMA_VERSION);
    props.setProperty('CLAV_AUTH_MODEL', CLAV.PASSWORD_ALGORITHM + '+SHEET_SESSION_CACHE_FALLBACK');
    props.setProperty('CLAV_LAST_INSTALL_OK_AT', nowISO_());
    SpreadsheetApp.flush();

    return {
      installed: true,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      version: CLAV.VERSION,
      schemaVersion: CLAV.SCHEMA_VERSION,
      message: resetDefaultPasswords
        ? 'Instalação/reparo concluído e credenciais iniciais redefinidas por comando explícito.'
        : 'Instalação/reparo concluído sem alterar senhas existentes.'
    };
  } finally {
    releaseLock_(lock);
  }
}

/**
 * Migração automática de esquema: ao publicar uma versão nova do código sobre
 * uma base já instalada, garante (uma única vez por SCHEMA_VERSION) que todas
 * as abas recebam as colunas novas — sem exigir adminInstalarOuReparar manual.
 * Preserva dados existentes: desde a v19.9 migrateSheetSchema_ é somente aditivo
 * (acrescenta colunas novas ao fim) e nunca reordena, limpa ou reescreve uma aba.
 */
function garantirEsquemaAtual_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(CLAV.SCHEMA_MIGRATED_PROP) === CLAV.SCHEMA_VERSION) return false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return false;
  try {
    if (props.getProperty(CLAV.SCHEMA_MIGRATED_PROP) === CLAV.SCHEMA_VERSION) return false;
    var ss = getSpreadsheet_();
    Object.keys(CLAV.SHEETS).forEach(function (name) {
      var def = CLAV.SHEETS[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      ensureHeaders_(sh, def.headers, def.color);
      CLAV_RUNTIME.sheets[name] = sh;
    });
    try { seedConfig_(); } catch (ignoredCfg) {}
    try { sincronizarCatalogoProcedimentos_(false); } catch (ignoredCat) {}
    props.setProperty(CLAV.SCHEMA_MIGRATED_PROP, CLAV.SCHEMA_VERSION);
    props.setProperty('CLAV_SCHEMA_VERSION', CLAV.SCHEMA_VERSION);
    SpreadsheetApp.flush();
    Logger.log('Esquema migrado automaticamente para a versão ' + CLAV.SCHEMA_VERSION + '.');
    return true;
  } catch (err) {
    Logger.log('Falha na migração automática de esquema: ' + (err && err.message ? err.message : err));
    return false;
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function installationStatus_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CLAV.DB_PROP);
  if (!id || props.getProperty(CLAV.INSTALL_READY_PROP) !== 'SIM') {
    return { installed: false, message: 'Execute adminInstalarSistema no editor do Apps Script antes de usar o Web App.' };
  }
  try {
    var ss = SpreadsheetApp.openById(id);
    CLAV_RUNTIME.spreadsheet = ss;
    var required = ['USUARIOS', 'SESSOES', 'RECUPERACOES', 'PACIENTES', 'ATENDIMENTOS', 'HISTORICO', 'AUDITORIA'];
    for (var i = 0; i < required.length; i++) {
      if (!ss.getSheetByName(required[i])) {
        return { installed: false, message: 'Estrutura incompleta. Execute adminInstalarOuReparar.' };
      }
    }
    return { installed: true, message: '' };
  } catch (err) {
    return { installed: false, message: 'A planilha-base não pôde ser aberta. Execute adminInstalarOuReparar.' };
  }
}

function requireInstalled_() {
  var status = installationStatus_();
  if (!status.installed) throw appError_('SETUP_REQUIRED', status.message);
}

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CLAV.DB_PROP);
  if (id) {
    try {
      var existing = SpreadsheetApp.openById(id);
      existing.setSpreadsheetTimeZone(CLAV.TZ);
      return existing;
    } catch (errAbrir) {
      // v19.9: com um ID configurado, uma falha transitória do Drive NÃO pode
      // criar outra planilha vazia e religar o sistema a ela (a base real ficaria
      // órfã e o app mostraria zero atendimentos).
      throw appError_('DATABASE_UNAVAILABLE', 'A planilha-base configurada (' + id + ') não pôde ser aberta. Verifique o acesso ao arquivo e tente de novo; nenhuma base nova foi criada.', { cause: errAbrir && errAbrir.message ? errAbrir.message : String(errAbrir) });
    }
  }
  var created = SpreadsheetApp.create(CLAV.APP_NAME + ' | Base de Dados');
  created.setSpreadsheetTimeZone(CLAV.TZ);
  props.setProperty(CLAV.DB_PROP, created.getId());
  return created;
}

/**
 * v19.9 (28/09/2026) — ESQUEMA SOMENTE ADITIVO. Nunca apaga nem reordena uma
 * aba que já tem dados.
 *
 * Até a v19.8, quando o cabeçalho real diferia do esperado, esta função lia a
 * aba inteira, fazia clearContents() e reescrevia tudo. É exatamente o caminho
 * que apagou a base na v18 (uma leitura demorada ou um erro entre o clear e a
 * reescrita deixa a aba vazia) e ele era alcançável em qualquer carregamento de
 * página, por garantirEsquemaAtual_() em inicializar()/validarLogin(). Regras:
 *   - aba vazia: escreve o cabeçalho;
 *   - cabeçalho igual: nada;
 *   - cabeçalho real é prefixo do esperado (versão nova acrescentou colunas ao
 *     fim): escreve SÓ as células de cabeçalho que faltam, ou seja, colunas
 *     novas no fim, sem tocar em linha alguma;
 *   - qualquer outra diferença (ordem, nome, coluna a mais no meio): NÃO altera
 *     nada, registra no log e devolve false. assertSaveSchema_ continua
 *     bloqueando o salvamento com mensagem clara até a revisão manual, que é
 *     o comportamento seguro: dado parado é recuperável; dado apagado, não.
 */
function migrateSheetSchema_(sheet, desiredHeaders) {
  ensureGridSize_(sheet, desiredHeaders.length, 2);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    return true;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (h) { return String(h || '').trim(); });
  // Células vazias no fim da linha de cabeçalho (colunas formatadas sem título)
  // não contam como divergência.
  while (currentHeaders.length && !currentHeaders[currentHeaders.length - 1]) currentHeaders.pop();

  var prefixoIgual = currentHeaders.length <= desiredHeaders.length;
  for (var i = 0; prefixoIgual && i < currentHeaders.length; i++) {
    if (currentHeaders[i] !== desiredHeaders[i]) prefixoIgual = false;
  }
  if (prefixoIgual) {
    if (currentHeaders.length === desiredHeaders.length) return true;
    var novas = desiredHeaders.slice(currentHeaders.length);
    sheet.getRange(1, currentHeaders.length + 1, 1, novas.length).setValues([novas]);
    Logger.log('Esquema de ' + sheet.getName() + ': ' + novas.length + ' coluna(s) acrescentada(s) ao fim (' +
      novas.join(', ') + '). Nenhuma linha existente foi alterada.');
    return true;
  }

  Logger.log('Esquema de ' + sheet.getName() + ' diverge do esperado e NÃO foi alterado automaticamente. ' +
    'Esperado: ' + desiredHeaders.join(' | ') + ' — Atual: ' + currentHeaders.join(' | ') +
    '. Revise manualmente (inserir ou renomear colunas) com a planilha em backup; até lá o salvamento fica bloqueado por assertSaveSchema_.');
  return false;
}

// Todas as colunas de data/hora entram como TEXTO. Sem isto o Sheets converte
// "2026-08-30T14:30" em valor de data e devolve um objeto Date, que quebra a
// ordenacao por string, o contador "Hoje" e o filtro da agenda (correcao 5).
function applyTextFormats_(sheet, headers) {
  var textColumns = /(^|_)(id|usuario|email|telefone|cpf|hash|salt|json|request_id|revision|auth_version)($|_)/i;
  var dateColumns = /(_at$|_em$|^data_|_data$|expires_at|saved_at|timestamp|ultimo_login|horario)/i;
  headers.forEach(function (h, idx) {
    var nome = String(h);
    if (textColumns.test(nome) || dateColumns.test(nome) || /prontuario|crm|rqe|imc|^pa$|^fr$|clav_score/i.test(nome)) {
      try { sheet.getRange(2, idx + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@'); } catch (ignored) {}
    }
  });
}

function acquireWriteLock_(label, waitMs) {
  var lock = LockService.getScriptLock();
  if (lock.tryLock(Number(waitMs || 20000))) return lock;
  throw appError_('OPERACAO_OCUPADA', 'Outra gravação está em andamento. Aguarde alguns segundos e clique novamente em Salvar. Operação: ' + label + '.');
}

function releaseLock_(lock) {
  try { if (lock && lock.releaseLock) lock.releaseLock(); } catch (ignored) {}
}

