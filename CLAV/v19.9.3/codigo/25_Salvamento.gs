/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 25_Salvamento.gs
 * Salvamento idempotente: revisão, histórico e colunas de payload
 *
 * Conteúdo: normalizeSaveMeta_, preparePacienteWrite_, encode/readPayloadColumns, mergeDeep_.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function normalizeSaveMeta_(meta, payload) {
  meta = meta && typeof meta === 'object' ? meta : {};
  var base = meta.baseRevision;
  if (base === undefined || base === null || base === '') {
    base = payload && payload.atendimento && payload.atendimento.revision !== undefined ? payload.atendimento.revision : null;
  }
  base = base === null || base === '' || isNaN(Number(base)) ? null : Number(base);
  var anteriores = Array.isArray(meta.previousRequestIds) ? meta.previousRequestIds : [];
  return {
    requestId: cleanRequestId_(meta.requestId || Utilities.getUuid()),
    baseRevision: base,
    previousRequestIds: anteriores.map(cleanRequestId_).filter(Boolean).slice(0, 8),
    clientSavedAt: String(meta.clientSavedAt || '').slice(0, 80),
    clientContext: meta.clientContext && typeof meta.clientContext === 'object' ? deepClone_(meta.clientContext) : {}
  };
}

function cleanRequestId_(value) {
  var id = String(value || '').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 160);
  return id || Utilities.getUuid();
}

function deterministicEntityId_(prefix, requestId) {
  var digest = sha256_(String(prefix || 'ID') + '|' + cleanRequestId_(requestId || Utilities.getUuid()));
  return String(prefix || 'ID').toUpperCase() + '-' + digest.slice(0, 24).toUpperCase();
}

function buildSaveResponse_(info, payload, user, unchanged, requestId) {
  payload = normalizePayload_(payload || readPayloadFromRow_(info.obj));
  payload.atendimento.revision = Number(info.obj.revision || payload.atendimento.revision || 0);
  payload.atendimento.updated_at = info.obj.updated_at || payload.atendimento.updated_at || '';
  return {
    // v19.9: resposta sanitizada para perfil operacional (mesma regra de obterAtendimento).
    atendimento: isMedical_(user) ? payload : sanitizeForReadOperational_(deepClone_(payload)),
    alertas: filtrarAlertasPorPerfil_(parseJson_(info.obj.alertas_json, []), user),
    dashboard: safeDashboard_(user),
    registros: safeListAtendimentos_({ limit: 20 }, user),
    planilhaUrl: canOpenSpreadsheet_(user) ? getSpreadsheet_().getUrl() : '',
    savedAt: dataTextoPlanilha_(info.obj.updated_at) || nowISO_(),
    revision: Number(info.obj.revision || 0),
    requestId: requestId || String(info.obj.last_request_id || ''),
    unchanged: !!unchanged,
    verified: true,
    serverVersion: CLAV.VERSION
  };
}

function preparePacienteWrite_(payload, user, stamp, requestId, previousPatient, incomingPatient) {
  var p = payload.paciente || {};
  if (!String(p.nome || '').trim()) throw appError_('PACIENTE_OBRIGATORIO', 'Nome do paciente é obrigatório.');
  var explicitPatientId = String(p.paciente_id || '').trim();
  if (!p.paciente_id && requestId) p.paciente_id = deterministicEntityId_('PAC', requestId);
  var info = p.paciente_id ? findRowBy_('PACIENTES', 'paciente_id', String(p.paciente_id)) : null;
  if (info && info.obj._deleted_at) throw appError_('PACIENTE_EXCLUIDO', 'O paciente está excluído; a gravação não pode reativá-lo.');
  var cpf = digitsOnly_(p.cpf || '');
  // v19.9: CPF incompleto quebra a detecção de duplicidade. Recusa só quando o
  // valor é novo ou foi alterado; cadastros antigos com CPF parcial não travam.
  if (cpf && cpf.length !== 11) {
    var cpfAnterior = info ? digitsOnly_(info.obj.cpf || '') : '';
    if (cpf !== cpfAnterior) throw appError_('CPF_INVALIDO', 'CPF deve ter 11 dígitos. Confira o número antes de salvar; nenhum cadastro foi alterado.');
  }
  if (!info && cpf) {
    var rows = allRowsWithNumbers_('PACIENTES');
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].obj._deleted_at && digitsOnly_(rows[i].obj.cpf || '') === cpf) {
        throw appError_('PACIENTE_EXISTENTE_SELECIONE', 'Já existe um cadastro com este CPF. Selecione explicitamente o paciente correto na busca antes de criar o atendimento; nenhum cadastro foi alterado.');
      }
    }
  }
  if (explicitPatientId && info && String(info.obj.paciente_id) !== explicitPatientId) {
    throw appError_('VINCULO_PACIENTE_IMUTAVEL', 'O CPF aponta para outro cadastro. Revise a identidade antes de salvar.');
  }
  if (explicitPatientId && !info) throw appError_('PACIENTE_NAO_ENCONTRADO', 'O paciente selecionado não existe. Reabra o cadastro antes de salvar.');
  var before = info ? deepClone_(info.obj) : null;
  var obj = before ? deepClone_(before) : {};
  obj.paciente_id = obj.paciente_id || deterministicEntityId_('PAC', requestId || Utilities.getUuid());
  // v19.3. O prontuário era o paciente_id hexadecimal inteiro
  // ("CLAV-02342D726FD705D15FCBD56F"): 29 caracteres que quebravam a célula do
  // cabeçalho do PDF em duas linhas e eram impossíveis de ditar por telefone.
  // Agora é sequencial e curto. Prontuários já existentes NÃO são alterados.
  obj.prontuario = p.prontuario || obj.prontuario || proximoProntuario_();
  obj.nome = clean_(p.nome, 180);
  obj.nome_social = clean_(p.nome_social || '', 120);
  obj.nome_preferido = clean_(p.nome_preferido || p.nome_social || '', 120);
  obj.nascimento = p.nascimento || '';
  obj.idade = p.idade || calcAge_(p.nascimento) || '';
  obj.sexo = p.sexo || '';
  obj.potencial_gestacional = clean_(p.potencial_gestacional || '', 80);
  obj.cpf = cpf;
  obj.telefone = digitsOnly_(p.telefone || '');
  obj.email = normalizeEmail_(p.email || '');
  obj.cidade = clean_(p.cidade || '', 180);
  obj.contexto_cuidado = clean_(p.contexto_cuidado || '', 5000);
  obj.observacoes = clean_(p.observacoes || '', 5000);
  obj.created_at = obj.created_at || stamp;
  obj.created_by = obj.created_by || user.usuario;
  if (before && previousPatient) {
    // O snapshot do atendimento não é autorização para reverter o cadastro.
    // Só aplica deltas realmente enviados pelo formulário; alterações paralelas
    // no mesmo campo exigem comparação explícita pelo usuário.
    var editable = ['nome', 'nome_social', 'nome_preferido', 'nascimento', 'idade', 'sexo',
      'potencial_gestacional', 'cpf', 'telefone', 'email', 'cidade', 'contexto_cuidado', 'observacoes'];
    incomingPatient = incomingPatient || {};
    editable.forEach(function (field) {
      var supplied = Object.prototype.hasOwnProperty.call(incomingPatient, field);
      var base = patientFieldValue_(field, previousPatient[field]);
      var wanted = patientFieldValue_(field, obj[field]);
      var current = patientFieldValue_(field, before[field]);
      if (!supplied || patientFieldValue_(field, incomingPatient[field]) === base) {
        if (before[field] === undefined) delete obj[field]; else obj[field] = before[field];
      } else if (current !== base && wanted !== current) {
        throw appError_('CONFLITO_CADASTRO_PACIENTE', 'O cadastro do paciente foi atualizado em outro fluxo. Confira o campo ' + field + ' antes de salvar; nenhum cadastro foi sobrescrito.');
      }
    });
    obj.prontuario = before.prontuario || obj.prontuario;
  } else if (before && explicitPatientId) {
    // Novo episódio para paciente já cadastrado: não altera a pessoa por inferência.
    // O cadastro tem sua própria tela de edição e pode ter mudado após a busca.
    var changedFields = ['nome', 'nome_social', 'nome_preferido', 'nascimento', 'sexo', 'cpf', 'telefone', 'email', 'cidade', 'potencial_gestacional', 'contexto_cuidado', 'observacoes'];
    changedFields.forEach(function (field) {
      var effectiveBefore = field === 'nome_preferido' ? (before.nome_preferido || before.nome_social || '') : before[field];
      if (Object.prototype.hasOwnProperty.call(p, field) && patientFieldValue_(field, p[field]) !== patientFieldValue_(field, effectiveBefore)) {
        throw appError_('CONFLITO_CADASTRO_PACIENTE', 'O cadastro selecionado diverge do formulário. Atualize/edite o paciente na busca e selecione-o novamente antes de criar o episódio.');
      }
    });
    obj = deepClone_(before);
  }
  obj._deleted_at = '';
  var changed = !before || patientMeaningfulHash_(before) !== patientMeaningfulHash_(obj);
  if (changed) {
    obj.updated_at = stamp;
    obj.updated_by = user.usuario;
  }
  return { info: info, obj: obj, before: before, changed: changed };
}

/**
 * v19.3. Próximo prontuário no formato CLAV-00001.
 *
 * Roda dentro do lock de escrita de salvarAtendimento, então a contagem é
 * segura. Considera apenas prontuários no formato novo; os antigos (hash)
 * continuam válidos e não entram na sequência. Em qualquer falha, cai no
 * formato anterior, para nunca impedir um cadastro.
 */
function proximoProntuario_() {
  try {
    var maior = 0;
    var linhas = allLite_('PACIENTES');
    for (var i = 0; i < linhas.length; i++) {
      var m = /^CLAV-(\d{4,8})$/.exec(String(linhas[i].prontuario || '').trim().toUpperCase());
      if (m) {
        var n = Number(m[1]);
        if (n > maior) maior = n;
      }
    }
    var proximo = String(maior + 1);
    while (proximo.length < 5) proximo = '0' + proximo;
    return 'CLAV-' + proximo;
  } catch (err) {
    return 'CLAV-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  }
}

function persistPacienteWrite_(plan) {
  if (!plan || !plan.changed) return;
  if (plan.info) writeObjectAtRow_('PACIENTES', plan.info.row, plan.obj);
  else insert_('PACIENTES', plan.obj);
  // ÚNICA linha acrescentada neste arquivo (v19.1): derruba o índice de busca
  // de pacientes (27_Pacientes.gs) para que um cadastro recém-gravado apareça
  // na busca imediatamente, e não só depois dos 10 minutos de cache.
  try { invalidarIndicePacientes_(); } catch (ignoredIndice) {}
}

function encodePayloadColumns_(payload) {
  var json = JSON.stringify(payload || {});
  var max = CLAV.PAYLOAD_CHUNK_SIZE * CLAV.PAYLOAD_CHUNK_COUNT;
  if (json.length > max) {
    throw appError_('PAYLOAD_TOO_LARGE', 'O atendimento ultrapassou o limite seguro de armazenamento. Reduza textos excessivamente longos ou itens repetidos.');
  }
  // CORRECAO 6. O corte era feito por unidade de codigo UTF-16. Quando caia no
  // meio de um par substituto (emoji digitado em campo livre), cada metade
  // ficava com um substituto solitario, o Sheets alterava o caractere e a
  // releitura devolvia JSON invalido: o conteudo clinico inteiro se perdia em
  // silencio. Agora o corte recua uma posicao quando cairia dentro do par.
  var result = {};
  var pos = 0;
  for (var i = 0; i < CLAV.PAYLOAD_CHUNK_COUNT; i++) {
    var key = i === 0 ? 'payload_json' : 'payload_json_' + (i + 1);
    var fim = Math.min(json.length, pos + CLAV.PAYLOAD_CHUNK_SIZE);
    if (fim > pos && fim < json.length) {
      var code = json.charCodeAt(fim - 1);
      if (code >= 0xD800 && code <= 0xDBFF) fim -= 1;
    }
    result[key] = pos < json.length ? json.slice(pos, fim) : '';
    pos = fim;
  }
  if (pos < json.length) {
    throw appError_('PAYLOAD_TOO_LARGE', 'O atendimento ultrapassou o limite seguro de armazenamento. Reduza textos excessivamente longos ou itens repetidos.');
  }
  return result;
}

function readPayloadFromRow_(row) {
  row = row || {};
  var json = '';
  for (var i = 0; i < CLAV.PAYLOAD_CHUNK_COUNT; i++) {
    var key = i === 0 ? 'payload_json' : 'payload_json_' + (i + 1);
    json += String(row[key] || '');
  }
  if (!json.trim()) return {};
  try {
    return JSON.parse(json);
  } catch (err) {
    Logger.log('ERRO CRÍTICO: Falha ao parsear payload_json: ' + err.message);
    throw appError_('PAYLOAD_CORROMPIDO', 'Falha na integridade do registro clínico (JSON corrompido na planilha). A gravação foi cancelada para proteger os dados do paciente.', { cause: err.message });
  }
}

function recordOperationBestEffort_(requestId, operation, entityId, revision, result, user) {
  try {
    if (!requestId) return;
    var existing = findRowBy_('OPERACOES', 'request_id', requestId);
    if (existing) return;
    insert_('OPERACOES', {
      request_id: requestId,
      operacao: operation || '',
      entity_id: entityId || '',
      revision: Number(revision || 0),
      result_json: truncateCellText_(toJson_(result || {})),
      created_at: nowISO_(),
      usuario_id: user && user.usuario_id ? user.usuario_id : ''
    });
  } catch (ignored) {}
}

function insertHistoryVersionBestEffort_(payload, hash, revision, user, requestId, action) {
  try {
    var chunks = encodePayloadColumns_(payload);
    insert_('HISTORICO', {
      versao_id: uid_('VER'),
      atendimento_id: payload.atendimento.atendimento_id,
      revision: revision,
      payload_hash: hash,
      payload_json: chunks.payload_json,
      payload_json_2: chunks.payload_json_2,
      payload_json_3: chunks.payload_json_3,
      payload_json_4: chunks.payload_json_4,
      payload_json_5: chunks.payload_json_5,
      saved_at: nowISO_(),
      saved_by: user.usuario,
      request_id: requestId || '',
      acao: action || 'SALVAR'
    });
  } catch (err) {
    try { upsertConfigValue_('HISTORY_WARNING_LAST', (err.message || String(err)).slice(0, 1000), 'Último aviso de histórico'); } catch (ignored) {}
  }
}

function truncateCellText_(value) {
  var text = String(value === undefined || value === null ? '' : value);
  return text.length > CLAV.PAYLOAD_CHUNK_SIZE ? text.slice(0, CLAV.PAYLOAD_CHUNK_SIZE) : text;
}

function compactAuditSnapshot_(value) {
  if (!value || typeof value !== 'object') return value || {};
  var copy = deepClone_(value);
  ['payload_json', 'payload_json_2', 'payload_json_3', 'payload_json_4', 'payload_json_5', 'senha_hash', 'senha_salt', 'token_hash'].forEach(function (key) {
    if (copy && Object.prototype.hasOwnProperty.call(copy, key)) delete copy[key];
  });
  return copy;
}

function appError_(code, message, details) {
  var err = new Error(message || code || 'Erro');
  err.code = code || 'ERRO_INTERNO';
  err.details = details || null;
  return err;
}

function calcAge_(dateStr) {
  if (!dateStr) return '';
  // v19.9: data civil lida por partes. new Date('AAAA-MM-DD') é meia-noite UTC,
  // que em Brasília cai no dia anterior: idade errada na véspera do aniversário.
  var m0 = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  var d = m0 ? new Date(Number(m0[1]), Number(m0[2]) - 1, Number(m0[3])) : new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  var hojeTxt = Utilities.formatDate(new Date(), CLAV.TZ, 'yyyy-MM-dd').split('-');
  var now = new Date(Number(hojeTxt[0]), Number(hojeTxt[1]) - 1, Number(hojeTxt[2]));
  if (d > now) return ''; // Data de nascimento futura é clinicamente inválida
  var age = now.getFullYear() - d.getFullYear();
  var m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : '';
}

/**
 * v19.9. Diz se já houve versão de HISTORICO vinda da ficha intraoperatória para
 * este atendimento nos últimos 10 minutos (e marca o momento quando não houve).
 * Cache é acelerador: se falhar, o histórico é gravado normalmente.
 */
function historicoIntraopRecente_(atendimentoId) {
  try {
    var cache = CacheService.getScriptCache();
    var chave = 'CLAV_HIST_INTRA_' + String(atendimentoId || '');
    if (cache.get(chave)) return true;
    cache.put(chave, '1', 600);
    return false;
  } catch (ignored) { return false; }
}

function classificarImc_(imc, idade) {
  imc = Number(imc || 0);
  if (!imc) return 'Aguardando dados';
  if (idade !== null && idade !== undefined && !isNaN(Number(idade)) && Number(idade) < 18) {
    return 'Curva de crescimento (OMS/pediatria)';
  }
  if (imc < 18.5) return 'Baixo peso';
  if (imc < 25) return 'Eutrofia';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade I';
  if (imc < 40) return 'Obesidade II';
  return 'Obesidade III';
}

function mergeDeep_(target, source) {
  target = target || {};
  source = source || {};
  Object.keys(source).forEach(function (key) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      mergeDeep_(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  });
  return target;
}

/** v19.4.1 — identidade e recibos de salvamento; nenhuma migração de dados. */
function saveScope_(meta, payload, user) {
  var a = payload.atendimento || {}, p = payload.paciente || {}, c = meta.clientContext || {};
  var id = String(a.atendimento_id || a.numero || '').trim();
  var patientId = String(p.paciente_id || a.paciente_id || '').trim();
  var userId = String(user.usuario_id || user.usuario || '');
  if (p.paciente_id && a.paciente_id && String(p.paciente_id) !== String(a.paciente_id)) {
    throw appError_('VINCULO_PACIENTE_IMUTAVEL', 'Os identificadores de paciente do formulário não conferem.');
  }
  if (c.userId && String(c.userId) !== userId) throw appError_('CONTEXTO_USUARIO_INVALIDO', 'O rascunho pertence a outro usuário.');
  if (c.atendimentoId !== undefined && String(c.atendimentoId || '') !== id) throw appError_('CONTEXTO_ATENDIMENTO_INVALIDO', 'O rascunho não corresponde ao atendimento enviado.');
  if (c.pacienteId !== undefined && String(c.pacienteId || '') !== patientId) throw appError_('CONTEXTO_PACIENTE_INVALIDO', 'O rascunho não corresponde ao paciente enviado.');
  var deployment = String(getWebAppUrl_() || '').replace(/[?#].*$/, '');
  if (c.installationId && deployment && String(c.installationId).replace(/[?#].*$/, '') !== deployment) {
    throw appError_('CONTEXTO_INSTALACAO_INVALIDO', 'O rascunho pertence a outra implantação. Abra o endereço correto.');
  }
  var installationScope = sha256_(String(ScriptApp.getScriptId()) + '|' + String(PropertiesService.getScriptProperties().getProperty(CLAV.DB_PROP) || ''));
  return { intendedId: id, patientId: patientId, userId: userId,
    installationScope: installationScope, operationId: String(c.operationId || '').slice(0, 160), tabId: String(c.tabId || '').slice(0, 160) };
}

function saveInputHash_(payload, meta) {
  var raw = deepClone_(payload);
  if (raw.atendimento) delete raw.atendimento._saveReceipt;
  return sha256_(stableStringify_({ payload: raw, baseRevision: meta.baseRevision }));
}

function makeSaveReceipt_(meta, scope, inputHash, entityId, patientId, revision, payloadHash) {
  return { requestId: meta.requestId, inputHash: inputHash, userId: scope.userId,
    installationScope: scope.installationScope, operationId: scope.operationId, tabId: scope.tabId,
    intendedId: scope.intendedId, intendedPatientId: scope.patientId,
    entityId: entityId, patientId: patientId, revision: revision, payloadHash: payloadHash };
}

function findSaveRequest_(requestId) {
  var info = findRowBy_('ATENDIMENTOS', 'last_request_id', requestId);
  var op = findRowBy_('OPERACOES', 'request_id', requestId);
  if (op && String(op.obj.operacao || '') !== 'SALVAR_ATENDIMENTO') throw appError_('REQUEST_ESCOPO_INVALIDO', 'Este identificador já pertence a outra operação.');
  if (!info && op) info = findRowBy_('ATENDIMENTOS', 'atendimento_id', String(op.obj.entity_id || ''));
  if (!info && !op) return null;
  if (!info || info.obj._deleted_at) throw appError_('REQUEST_DESTINO_INDISPONIVEL', 'A tentativa anterior se refere a um atendimento indisponível.');
  var p = readPayloadFromRow_(info.obj);
  assertStoredAtendimentoIdentity_(info, p);
  var receipt = p.atendimento && p.atendimento._saveReceipt;
  if (!receipt || String(receipt.requestId) !== requestId) {
    var result = op ? parseJson_(op.obj.result_json, {}) : {};
    receipt = result.receipt || null;
  }
  return { info: info, operation: op, receipt: receipt };
}

function assertSaveRequestScope_(prior, scope, requestId, inputHash, exact) {
  var r = prior.receipt;
  var row = prior.info.obj;
  // Mesmo registros anteriores ao patch jamais autorizam troca de paciente/caso.
  if ((scope.intendedId && scope.intendedId !== String(row.atendimento_id)) ||
      (scope.patientId && scope.patientId !== String(row.paciente_id))) {
    throw appError_('REQUEST_ESCOPO_INVALIDO', 'Uma tentativa anterior pertence a outro paciente ou atendimento. Nenhum destino foi alterado.');
  }
  if (!r) throw appError_('REENVIO_LEGADO_NAO_CONFIRMADO', 'Esta tentativa é anterior à proteção de vínculo. Reabra o atendimento e confira o conteúdo antes de reenviar; o rascunho deve ser preservado.');
  if (String(r.requestId) !== requestId || r.userId !== scope.userId || r.installationScope !== scope.installationScope ||
      r.entityId !== String(row.atendimento_id) || r.patientId !== String(row.paciente_id) ||
      String(r.operationId || '') !== scope.operationId || String(r.tabId || '') !== scope.tabId ||
      (!scope.intendedId && String(r.intendedId || '') !== '') ||
      (!scope.intendedId && String(r.intendedPatientId || '') !== scope.patientId)) {
    throw appError_('REQUEST_ESCOPO_INVALIDO', 'A tentativa não pertence ao mesmo usuário, instalação, aba e atendimento. Nenhuma gravação foi realizada.');
  }
  if (exact && String(r.inputHash || '') !== inputHash) throw appError_('REQUEST_CONTEUDO_DIFERENTE', 'O mesmo pedido foi reutilizado com conteúdo diferente. Preserve a tentativa original e salve a nova edição separadamente.');
  if (exact && (Number(r.revision) !== Number(row.revision) || r.payloadHash !== payloadMeaningfulHash_(readPayloadFromRow_(row)))) {
    throw appError_('CONFLITO_REVISAO', 'A tentativa foi gravada, mas o atendimento já recebeu outra versão. Reabra e compare o rascunho antes de continuar.');
  }
}

function assertStoredAtendimentoIdentity_(info, payload) {
  var row = info && info.obj || {}, a = payload && payload.atendimento || {}, p = payload && payload.paciente || {};
  var id = String(row.atendimento_id || ''), patientId = String(row.paciente_id || '');
  if (!id || !patientId || String(a.atendimento_id || '') !== id || String(p.paciente_id || '') !== patientId ||
      (a.paciente_id && String(a.paciente_id) !== patientId)) {
    throw appError_('VINCULO_ARMAZENADO_INCONSISTENTE', 'O vínculo paciente-atendimento armazenado não confere. Solicite revisão separada dos dados; a gravação foi bloqueada.');
  }
  return patientId;
}

function assertIncomingIdentity_(payload, info, existingPayload) {
  var patientId = assertStoredAtendimentoIdentity_(info, existingPayload);
  var p = payload.paciente || {}, a = payload.atendimento || {};
  var incoming = String(p.paciente_id || a.paciente_id || '');
  if (!incoming || incoming !== patientId || (p.paciente_id && String(p.paciente_id) !== patientId) ||
      (a.paciente_id && String(a.paciente_id) !== patientId)) {
    throw appError_('VINCULO_PACIENTE_IMUTAVEL', 'Não é permitido trocar o paciente de um atendimento existente. Abra o atendimento correto.');
  }
}

function verifyStoredSave_(info, expectedPayload, revision, meaningfulHash, requestId) {
  if (!info || info.obj._deleted_at) throw appError_('SAVE_VERIFY_FAILED', 'A planilha não confirmou o atendimento. Preserve o rascunho e reenvie a mesma tentativa.');
  var readback = readPayloadFromRow_(info.obj);
  assertStoredAtendimentoIdentity_(info, readback);
  // Bloqueio REAL: hash, revisão ou request_id relidos diferentes do gravado.
  // É o que detecta escrita perdida, linha errada ou corrupção do payload.
  if (String(info.obj.payload_hash || '') !== String(meaningfulHash) || Number(info.obj.revision) !== Number(revision) ||
      String(info.obj.last_request_id || '') !== String(requestId) ||
      payloadMeaningfulHash_(readback) !== String(meaningfulHash)) {
    throw appError_('SAVE_VERIFY_FAILED', 'O conteúdo relido não corresponde à gravação enviada. Preserve o rascunho e reenvie a mesma tentativa.', { atendimentoId: info.obj.atendimento_id, revision: revision });
  }
  // v19.5. A comparação byte a byte do JSON inteiro deixou de ser bloqueante.
  // Com o hash significativo, a revisão e o request_id conferidos acima, uma
  // diferença textual só pode vir de serialização (ordem de chaves, campo
  // normalizado na leitura, recibo interno) — não de perda de dado. Bloquear
  // aqui derrubaria TODOS os salvamentos a cada ajuste futuro de normalização.
  // A divergência fica registrada na auditoria para investigação.
  try {
    var relido = stableStringify_(readback), enviado = stableStringify_(expectedPayload);
    if (relido !== enviado) {
      logAudit_(null, 'SAVE_VERIFY_DIVERGENCIA_TEXTUAL', 'ATENDIMENTOS', String(info.obj.atendimento_id || ''),
        { tamanhoEnviado: enviado.length, revision: revision }, { tamanhoRelido: relido.length, requestId: requestId }, 'AVISO', '', '');
    }
  } catch (ignoredDiff) {}
}

// v19.9.3 — Conflito causado só pela ficha intraoperatória.
// A ficha grava pelo mesmo salvarAtendimento (requestId "INTRA5-…", apenas o bloco
// intraop) e cada gravação fica em OPERACOES com a revisão que produziu. Quando TODAS
// as revisões entre a que a tela leu e a atual vieram da ficha, o sistema principal
// pode gravar ou encerrar por cima: ele nunca envia intraop e o merge preserva o que a
// ficha registrou. Qualquer revisão sem registro, ou de outra origem (outro usuário,
// encerrar, reabrir), continua sendo conflito. Só é consultado no caminho do conflito.
function revisoesSomenteDaFicha_(atendimentoId, baseRevision, revisaoAtual) {
  try {
    var id = String(atendimentoId || '');
    var base = Number(baseRevision);
    var atual = Number(revisaoAtual);
    if (!id || !isFinite(base) || !isFinite(atual) || base >= atual || atual - base > 200) return false;
    var porRevisao = {};
    allRowsWithNumbers_('OPERACOES').forEach(function (r) {
      var o = r.obj || {};
      if (String(o.entity_id || '') !== id || String(o.operacao || '') !== 'SALVAR_ATENDIMENTO') return;
      var rev = Number(o.revision || 0);
      if (!porRevisao[rev]) porRevisao[rev] = [];
      porRevisao[rev].push(String(o.request_id || ''));
    });
    for (var rev = base + 1; rev <= atual; rev++) {
      var ids = porRevisao[rev];
      if (!ids || !ids.length) return false;
      for (var i = 0; i < ids.length; i++) {
        if (!/^INTRA5-/.test(ids[i])) return false;
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

function assertTransitionRevision_(info, requestMeta) {
  var base = requestMeta && requestMeta.baseRevision;
  if (base === undefined || base === null || base === '' || !isFinite(Number(base))) {
    throw appError_('REVISAO_OBRIGATORIA', 'Atualize a tela antes de encerrar ou reabrir o atendimento.');
  }
  var atual = Number(info.obj.revision || 0);
  if (Number(base) === atual) return;
  // v19.9.3: revisões intermediárias vindas só da ficha não impedem encerrar/reabrir;
  // a transição usa o registro atual da planilha (com a ficha), nada vem do navegador.
  if (Number(base) < atual && revisoesSomenteDaFicha_(info.obj.atendimento_id, Number(base), atual)) return;
  throw appError_('CONFLITO_REVISAO', 'O atendimento recebeu outra versão. Reabra e confira antes de mudar sua situação.');
}

function assertSaveDates_(payload, incoming, previous) {
  incoming = incoming || payload;
  var groups = [
    ['paciente', 'nascimento', true], ['procedimento', 'data_cirurgia', true], ['atendimento', 'data_cirurgia', true],
    ['atendimento', 'data_consulta', false], ['preop', 'data_avaliacao', false]
  ];
  groups.forEach(function (item) {
    var section = item[0], field = item[1], raw = incoming[section] || {};
    if (!Object.prototype.hasOwnProperty.call(raw, field)) return;
    var value = raw[field], prior = previous && previous[section] || {};
    // Legado não editado permanece intacto; nenhuma normalização em massa.
    if (previous && String(value || '') === String(prior[field] || '')) return;
    if (value === undefined || value === null || value === '') return;
    if (item[2] ? !dataCivilEstrita_(String(value)) : !partesDataClav_(String(value))) {
      throw appError_('DATA_INVALIDA', 'Data inválida em ' + field + '. Use AAAA-MM-DD para data civil ou um horário ISO válido para consulta/avaliação.');
    }
  });
}

function patientFieldValue_(field, value) {
  if (value === undefined || value === null) return '';
  if (field === 'cpf' || field === 'telefone') return digitsOnly_(value);
  if (field === 'email') return normalizeEmail_(value);
  if (field === 'nascimento') return diaCalendarioClav_(value) || String(value).trim();
  return String(value).trim();
}

function assertSaveSchema_() {
  ['PACIENTES', 'ATENDIMENTOS', 'OPERACOES'].forEach(function (name) {
    var expected = headers_(name), sh = sheet_(name);
    var actual = sh.getRange(1, 1, 1, expected.length).getValues()[0];
    for (var i = 0; i < expected.length; i++) {
      if (String(actual[i] || '') !== expected[i]) throw appError_('SCHEMA_DIVERGENTE', 'Cabeçalhos de ' + name + ' incompatíveis. A gravação foi bloqueada; qualquer reparação deve ser revisada separadamente.');
    }
  });
}