/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 04_Atendimentos.gs
 * CRUD de atendimentos, agenda e leitura de registros
 *
 * Conteúdo: salvarAtendimento, encerrar/reabrir, obter, listar, listarAgenda.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function salvarAtendimento(payload, token, requestMeta, userAgent) {
  if (typeof requestMeta === 'string' && userAgent === undefined) {
    userAgent = requestMeta;
    requestMeta = {};
  }

  var auditContext = contextoSeguroSalvamento_(payload, requestMeta);
  return safe_('salvarAtendimento', function () {
    requireInstalled_();
    var session = validateSessionToken_(token);
    var user = session.user;
    assertCanSave_(user);

    var rawPayload = deepClone_(payload || {});
    var meta = normalizeSaveMeta_(requestMeta, rawPayload);
    // v19.9: gravações vindas da ficha intraoperatória (requestId INTRA5-…) têm
    // histórico limitado a uma versão a cada 10 minutos por atendimento.
    var origemFicha = /^INTRA5-/.test(String(meta.requestId || ''));
    var scope = saveScope_(meta, rawPayload, user);
    var inputHash = saveInputHash_(rawPayload, meta);
    Object.assign(auditContext, { usuarioId: scope.userId, pacienteId: scope.patientId,
      installationScope: scope.installationScope, tabId: scope.tabId, operationId: scope.operationId,
      previousRequestIds: meta.previousRequestIds });
    var resposta = null;
    var lock = acquireWriteLock_('salvar atendimento', 30000);
    try {
      // Leitura apenas: não migrar nem reparar a base durante um salvamento.
      assertSaveSchema_();
      var prior = findSaveRequest_(meta.requestId);
      if (prior) {
        assertSaveRequestScope_(prior, scope, meta.requestId, inputHash, true);
        var replayPayload = readPayloadFromRow_(prior.info.obj);
        verifyStoredSave_(prior.info, replayPayload, Number(prior.info.obj.revision || 0),
          String(prior.info.obj.payload_hash || ''), String(prior.info.obj.last_request_id || ''));
        return ok_(buildSaveResponse_(prior.info, replayPayload, user, true, meta.requestId));
      }
      // Pedidos anteriores são apenas evidência para detectar associação indevida.
      // Nunca substituem destino ou revisão-base da requisição atual.
      meta.previousRequestIds.forEach(function (previousId) {
        if (previousId === meta.requestId) return;
        var previous = findSaveRequest_(previousId);
        if (previous) {
          assertSaveRequestScope_(previous, scope, previousId, '', false);
          if (!scope.intendedId) {
            throw appError_('REENVIO_PENDENTE', 'Uma tentativa anterior deste rascunho já foi gravada. Reenvie a tentativa original ou reabra o atendimento confirmado; nenhum destino foi trocado.');
          }
        }
      });
      var id = scope.intendedId;
      if (!id) {
        id = deterministicEntityId_('ATD', sha256_(scope.installationScope + ':' + scope.userId + ':' + (scope.operationId || meta.requestId)));
      }
      auditContext.atendimentoResolvido = id;
      var existingInfo = findRowBy_('ATENDIMENTOS', 'atendimento_id', id);
      if (scope.intendedId && (!existingInfo || existingInfo.obj._deleted_at)) {
        throw appError_('NAO_ENCONTRADO', 'Atendimento inexistente ou excluído. A gravação não pode recriá-lo.');
      }
      if (!scope.intendedId && existingInfo) {
        throw appError_('REENVIO_PENDENTE', 'Este rascunho já originou um atendimento. Reenvie a tentativa original ou abra o registro confirmado antes de continuar.');
      }
      var existingPayload = existingInfo ? readPayloadFromRow_(existingInfo.obj) : null;
      if (existingInfo) {
        assertStoredAtendimentoIdentity_(existingInfo, existingPayload);
        assertIncomingIdentity_(rawPayload, existingInfo, existingPayload);
        if (meta.baseRevision === null) throw appError_('REVISAO_OBRIGATORIA', 'Reabra o atendimento para obter sua revisão antes de salvar.');
      }
      var serverRevision = existingInfo
        ? Number(existingInfo.obj.revision || (existingPayload.atendimento && existingPayload.atendimento.revision) || 0)
        : 0;

      if (existingInfo && String(existingInfo.obj.locked || '').toUpperCase() === 'SIM') {
        throw appError_('ATENDIMENTO_BLOQUEADO', 'Este atendimento está encerrado. Reabra-o antes de alterar e salvar.');
      }

      var rebaseFicha = null;
      if (existingInfo && meta.baseRevision !== null && Number(meta.baseRevision) !== serverRevision) {
        // v19.9.3: se todas as revisões desde a lida pela tela vieram da ficha (bloco
        // intraop), o salvamento segue: este payload não traz intraop e o merge preserva
        // a ficha. Abrir a ficha "só para ver" já sobe a revisão (marcações pelo relógio),
        // e o sistema principal caía em "alterado em outra aba" ao salvar ou encerrar.
        var somenteFicha = !origemFicha && Number(meta.baseRevision) < serverRevision
          && (!rawPayload || rawPayload.intraop === undefined)
          && revisoesSomenteDaFicha_(id, Number(meta.baseRevision), serverRevision);
        // v19.10 (item 13): o usuário confirmou na tela "Gravar por cima". A versão
        // anterior fica no HISTORICO e a AUDITORIA registra rebase_forcado.
        var forcado = !somenteFicha && !origemFicha && meta.forcarRevisao === true;
        if (!somenteFicha && !forcado) {
          throw appError_(
            'CONFLITO_REVISAO',
            'Este atendimento foi alterado em outra aba ou por outro usuário. Reabra o registro antes de salvar.',
            { expectedRevision: serverRevision, receivedRevision: meta.baseRevision }
          );
        }
        rebaseFicha = forcado
          ? { de: Number(meta.baseRevision), para: serverRevision, forcado: true, por: user.usuario || '' }
          : { de: Number(meta.baseRevision), para: serverRevision };
      }

      if (existingPayload) {
        payload = isMedical_(user)
          ? mergeDeep_(deepClone_(existingPayload), rawPayload)
          : mergeDeep_(deepClone_(existingPayload), sanitizeOperationalPayload_(deepClone_(rawPayload)));
      } else {
        payload = rawPayload;
      }
      payload = normalizePayload_(payload);
      payload.atendimento.atendimento_id = id;
      if (!String(payload.paciente.nome || '').trim()) throw appError_('PACIENTE_OBRIGATORIO', 'Informe o nome do paciente antes de salvar.');
      assertSaveDates_(payload, rawPayload, existingPayload);
      // Recibo é metadado do servidor, nunca aceito do navegador.
      delete payload.atendimento._saveReceipt;

      if (!payload.atendimento.status) payload.atendimento.status = 'ABERTO';
      if (existingPayload) {
        payload.atendimento.created_at = existingPayload.atendimento.created_at || existingInfo.obj.created_at || '';
        payload.atendimento.created_by = existingPayload.atendimento.created_by || existingInfo.obj.created_by || '';
      } else {
        payload.atendimento.created_at = payload.atendimento.created_at || nowISO_();
        payload.atendimento.created_by = payload.atendimento.created_by || user.usuario;
      }

      var stamp = nowISO_();
      // Auditoria da triagem: quem realizou a triagem (técnica/secretaria) fica
      // registrado em triagem.responsavel e permanece no PDF. Se outro usuário
      // (ex.: o médico) corrigir um valor, a alteração é registrada APENAS na
      // planilha (AUDITORIA + triagem.auditoria) — nunca troca o nome no PDF.
      try { registrarAuditoriaTriagem_(existingPayload, payload, user, stamp, meta.requestId, userAgent); } catch (ignoredAudit) {}
      var patientPlan = preparePacienteWrite_(payload, user, stamp, id, existingPayload && existingPayload.paciente, rawPayload.paciente);
      if (existingInfo && String(patientPlan.obj.paciente_id) !== String(existingInfo.obj.paciente_id)) {
        throw appError_('VINCULO_PACIENTE_IMUTAVEL', 'O cadastro resolvido não corresponde ao paciente deste atendimento. Nenhuma gravação foi realizada.');
      }
      payload.paciente.paciente_id = patientPlan.obj.paciente_id;
      payload.paciente.prontuario = patientPlan.obj.prontuario;
      payload.atendimento.paciente_id = patientPlan.obj.paciente_id;

      var alertas = gerarAlertasServidor_(payload, user);
      payload.calculos = Object.assign(payload.calculos || {}, calcularServidor_(payload, alertas));
      var meaningfulHash = payloadMeaningfulHash_(payload);
      var previousHash = existingInfo ? payloadMeaningfulHash_(existingPayload) : '';

      if (existingInfo && previousHash === meaningfulHash && !patientPlan.changed && String(existingInfo.obj.payload_hash || '')) {
        verifyStoredSave_(existingInfo, existingPayload, serverRevision, meaningfulHash, String(existingInfo.obj.last_request_id || ''));
        recordOperationBestEffort_(meta.requestId, 'SALVAR_ATENDIMENTO', id, serverRevision,
          { receipt: makeSaveReceipt_(meta, scope, inputHash, id, payload.paciente.paciente_id, serverRevision, meaningfulHash) }, user);
        return ok_(buildSaveResponse_(existingInfo, existingPayload, user, true, meta.requestId));
      }

      var nextRevision = serverRevision + 1;
      payload.atendimento.revision = nextRevision;
      payload.atendimento.updated_at = stamp;
      payload.atendimento.updated_by = user.nome || user.usuario;
      payload.atendimento._saveReceipt = makeSaveReceipt_(meta, scope, inputHash, id, payload.paciente.paciente_id, nextRevision, meaningfulHash);

      var flat = flatAtendimento_(payload, user, alertas);
      flat.payload_hash = meaningfulHash;
      flat.revision = nextRevision;
      flat.last_request_id = meta.requestId;
      flat.updated_at = stamp;
      flat.updated_by = user.usuario;
      flat._deleted_at = '';

      if (patientPlan.changed) persistPacienteWrite_(patientPlan);

      var before = existingInfo ? compactAuditSnapshot_(existingInfo.obj) : {};
      if (existingInfo) {
        flat.created_at = existingInfo.obj.created_at || payload.atendimento.created_at || stamp;
        flat.created_by = existingInfo.obj.created_by || payload.atendimento.created_by || user.usuario;
        flat.locked = existingInfo.obj.locked || 'NAO';
        writeObjectAtRow_('ATENDIMENTOS', existingInfo.row, Object.assign({}, existingInfo.obj, flat));
      } else {
        flat.created_at = payload.atendimento.created_at || stamp;
        flat.created_by = payload.atendimento.created_by || user.usuario;
        flat.locked = 'NAO';
        insert_('ATENDIMENTOS', flat);
      }

      SpreadsheetApp.flush();

      // Confirmação pós-gravação: o frontend só recebe sucesso depois de o registro
      // ser relido da planilha com o mesmo hash, revisão e request_id.
      var verified = findRowBy_('ATENDIMENTOS', 'atendimento_id', payload.atendimento.atendimento_id);
      verifyStoredSave_(verified, payload, nextRevision, meaningfulHash, meta.requestId);

      // Registra a idempotência fora do caminho crítico. Mesmo que a aba de
      // operações esteja indisponível, a confirmação principal já ocorreu.
      recordOperationBestEffort_(
        meta.requestId,
        'SALVAR_ATENDIMENTO',
        payload.atendimento.atendimento_id,
        nextRevision,
        { savedAt: verified.obj.updated_at || stamp, payloadHash: meaningfulHash, receipt: payload.atendimento._saveReceipt },
        user
      );

      // Histórico e auditoria não podem transformar uma gravação clínica já
      // confirmada em mensagem falsa de erro.
      try {
        // v19.9: a ficha grava a cada poucos segundos; uma cópia integral do payload
        // em HISTORICO por gravação inflava a planilha (11,7 milhões de caracteres em
        // dois meses). Para a ficha, no máximo uma versão a cada 10 min por atendimento.
        if (!(origemFicha && historicoIntraopRecente_(payload.atendimento.atendimento_id))) {
          insertHistoryVersionBestEffort_(
            payload,
            meaningfulHash,
            nextRevision,
            user,
            meta.requestId,
            existingInfo ? (origemFicha ? 'SALVAR_INTRAOPERATORIO' : 'SALVAR_ATUALIZACAO') : 'SALVAR_CRIACAO'
          );
        }
      } catch (ignoredHistory) {}

      try {
        logAudit_(
          user,
          existingInfo ? 'ATENDIMENTO_ATUALIZADO' : 'ATENDIMENTO_CRIADO',
          'ATENDIMENTOS',
          payload.atendimento.atendimento_id,
          before,
          { revision: nextRevision, payload_hash: meaningfulHash, request_id: meta.requestId, rebase_ficha: rebaseFicha },
          'OK',
          userAgent
        );
      } catch (ignoredAudit) {}

      // Registra de forma explícita quando um alerta grave foi marcado como lido.
      // A ação fica separada da atualização clínica geral para facilitar auditoria.
      try {
        var previousAcks = existingPayload && existingPayload.seguranca && Array.isArray(existingPayload.seguranca.alertas_cientes)
          ? existingPayload.seguranca.alertas_cientes
          : [];
        var currentAcks = payload.seguranca && Array.isArray(payload.seguranca.alertas_cientes)
          ? payload.seguranca.alertas_cientes
          : [];
        var newAcks = currentAcks.filter(function (ack) {
          var id = String(ack.alerta_id || ack.id || '');
          var text = String(ack.texto || '');
          return id && !previousAcks.some(function (prev) {
            return String(prev.alerta_id || prev.id || '') === id && String(prev.texto || '') === text;
          });
        });
        if (newAcks.length) {
          logAudit_(
            user,
            'ALERTAS_GRAVES_LIDOS',
            'ATENDIMENTOS',
            payload.atendimento.atendimento_id,
            {},
            { alertas: newAcks, revision: nextRevision, request_id: meta.requestId },
            'OK',
            userAgent
          );
        }
      } catch (ignoredAckAudit) {}

      resposta = {
        // v19.9: perfil operacional recebe o payload sanitizado (como em obterAtendimento);
        // antes a resposta do salvamento devolvia anamnese e conduta ao computador da recepção.
        atendimento: isMedical_(user) ? normalizePayload_(readPayloadFromRow_(verified.obj)) : sanitizeForReadOperational_(readPayloadFromRow_(verified.obj)),
        alertas: filtrarAlertasPorPerfil_(parseJson_(verified.obj.alertas_json, alertas), user),
        savedAt: dataTextoPlanilha_(verified.obj.updated_at) || stamp,
        revision: Number(verified.obj.revision || nextRevision),
        requestId: meta.requestId,
        unchanged: false,
        verified: true,
        serverVersion: CLAV.VERSION
      };
    } finally {
      releaseLock_(lock);
    }

    // CORRECAO 14. Listagem e dashboard sao montados FORA da trava de escrita.
    // Antes, a trava global seguia retida durante a varredura da base, e a
    // secretaria concluindo a triagem bloqueava o anestesiologista salvando a
    // consulta, com erro "Outra gravação está em andamento" mesmo depois de a
    // gravação ter terminado.
    resposta.dashboard = safeDashboard_(user);
    resposta.registros = safeListAtendimentos_({ limit: 20 }, user);
    resposta.planilhaUrl = canOpenSpreadsheet_(user) ? getSpreadsheet_().getUrl() : '';
    return ok_(resposta);
  }, auditContext);
}

function encerrarAtendimento(atendimentoId, token, userAgent, requestMeta) {
  return safe_('encerrarAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!isMedical_(user)) throw appError_('SEM_PERMISSAO', 'Encerramento clínico permitido apenas para anestesiologista, gestor médico ou suporte.');
    var lock = acquireWriteLock_('encerrar atendimento', 30000);
    try {
      assertSaveSchema_();
      var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
      if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');
      if (String(info.obj.locked || '').toUpperCase() === 'SIM') throw appError_('JA_ENCERRADO', 'Este atendimento já está encerrado.');

      var before = compactAuditSnapshot_(info.obj);
      var payload = normalizePayload_(readPayloadFromRow_(info.obj));
      assertStoredAtendimentoIdentity_(info, payload);
      assertTransitionRevision_(info, requestMeta);

      // Validações imperativas CFM 2.174/2017 e de integridade médica antes do encerramento
      var p = payload.paciente || {};
      var pr = payload.procedimento || {};
      var pre = payload.preop || {};
      var cond = payload.conduta || {};
      var intra = payload.intraop || {};
      var srpa = payload.srpa || {};

      if (!String(p.nome || "").trim()) {
        throw appError_("NOME_OBRIGATORIO", "Não é possível encerrar atendimento sem o nome do paciente.");
      }
      if (!String(pr.nome || "").trim()) {
        throw appError_("PROCEDIMENTO_OBRIGATORIO", "Não é possível encerrar atendimento sem o procedimento proposto.");
      }
      // v19.10 (item 13, "Encerrar a qualquer custo"): o anestesiologista ou gestor
      // médico que encerra assume a responsabilidade quando o campo está em branco
      // (fica registrado na AUDITORIA em "assumidos"); suporte/admin sem CRM de
      // anestesia continua precisando indicar o responsável. Nome, procedimento e
      // conclusão seguem obrigatórios (sem eles não há avaliação a encerrar). A data
      // de nascimento no futuro deixou de bloquear: é alerta grave com ciência.
      var perfilUser = String(user.perfil || '').toUpperCase();
      var podeAssumir = perfilUser === 'ANESTESISTA' || perfilUser === 'GESTOR_MEDICO';
      var assumidos = [];
      var anestResp = String(pre.anestesiologista || payload.atendimento.anestesiologista || "").trim();
      if (!anestResp && podeAssumir) {
        payload.preop = payload.preop || {};
        payload.preop.anestesiologista = user.nome || user.usuario;
        anestResp = payload.preop.anestesiologista;
        assumidos.push('preop.anestesiologista');
      }
      if (!anestResp) {
        throw appError_("ANESTESIOLOGISTA_OBRIGATORIO", "Encerramento bloqueado: o Anestesiologista Responsável deve ser definido antes de concluir (Resolução CFM nº 2.174/2017).");
      }
      if (!String(cond.conclusao || "").trim()) {
        throw appError_("CONCLUSAO_OBRIGATORIA", "Encerramento bloqueado: registre a Conclusão da avaliação pré-anestésica.");
      }
      var intraIniciado = !!(intra.inicio_anestesia || (Array.isArray(intra.sinais) && intra.sinais.length));
      if (intraIniciado && !String(intra.anestesiologistas_responsaveis || "").trim()) {
        if (podeAssumir) {
          payload.intraop = payload.intraop || {};
          payload.intraop.anestesiologistas_responsaveis = user.nome || user.usuario;
          assumidos.push('intraop.anestesiologistas_responsaveis');
        } else {
          throw appError_("INTRA_RESPONSAVEL_OBRIGATORIO", "Encerramento bloqueado: procedimento intraoperatório iniciado sem anestesiologista responsável identificado.");
        }
      }

      var alertas = gerarAlertasServidor_(payload, user);
      var graves = alertas.filter(function (a) { return a.tipo === 'danger'; });
      var cientes = Array.isArray(payload.seguranca.alertas_cientes) ? payload.seguranca.alertas_cientes : [];
      // v19.9.1: a comparação do texto ignora diferenças de espaçamento. A tela
      // registra a ciência com o id e o texto exatamente como exibidos (inclusive
      // dos alertas que só o servidor gera); qualquer outra divergência de texto
      // continua exigindo nova ciência, porque o alerta mudou de conteúdo.
      var faltantes = graves.filter(function (a) {
        var textoAtual = String(a.texto || '').replace(/\s+/g, ' ').trim();
        return !cientes.some(function (c) {
          var sameId = String(c.alerta_id || c.id || '') === String(a.id || '');
          var storedText = String(c.texto || '').replace(/\s+/g, ' ').trim();
          return sameId && (!storedText || storedText === textoAtual);
        });
      });

      // Pendências clínicas não impedem o encerramento. A única etapa obrigatória é
      // registrar que o alerta grave foi exibido e lido pelo anestesiologista.
      if (faltantes.length) {
        return ok_({
          requiresAcknowledgement: true,
          alertas: faltantes,
          message: 'Há alertas graves ainda não marcados como lidos. Registre a ciência para prosseguir.',
          atendimento: payload
        });
      }

      var stamp = nowISO_();
      var revision = Number(info.obj.revision || payload.atendimento.revision || 0) + 1;
      payload.atendimento.status = 'ENCERRADO';
      payload.atendimento.encerrado_em = stamp;
      payload.atendimento.encerrado_por = user.nome || user.usuario;
      payload.atendimento.updated_at = stamp;
      payload.atendimento.updated_by = user.nome || user.usuario;
      payload.atendimento.revision = revision;
      payload.seguranca.encerramento_com_alertas = graves.length ? 'SIM' : 'NAO';
      payload.seguranca.alertas_graves_no_encerramento = graves;
      payload.calculos = Object.assign(payload.calculos || {}, calcularServidor_(payload, alertas));

      var hash = payloadMeaningfulHash_(payload);
      var flat = flatAtendimento_(payload, user, alertas);
      flat.payload_hash = hash;
      flat.revision = revision;
      flat.last_request_id = 'ENCERRAR-' + Utilities.getUuid();
      flat.locked = 'SIM';
      flat.updated_at = stamp;
      flat.updated_by = user.usuario;
      var after = Object.assign({}, info.obj, flat);
      writeObjectAtRow_('ATENDIMENTOS', info.row, after);
      insertHistoryVersionBestEffort_(payload, hash, revision, user, flat.last_request_id, 'ENCERRAR');
      SpreadsheetApp.flush();
      verifyStoredSave_(findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId), payload, revision, hash, flat.last_request_id);
      logAudit_(user, 'ATENDIMENTO_ENCERRADO', 'ATENDIMENTOS', atendimentoId, before, {
        revision: revision,
        payload_hash: hash,
        alertas_graves: graves.map(function (a) { return a.id; }),
        ciencias: cientes.map(function (c) { return c.alerta_id || c.id || ''; }),
        assumidos: assumidos,
        revisao_forcada: !!(requestMeta && requestMeta.forcarRevisao === true)
      }, 'OK', userAgent);
      return ok_({ atendimento: payload, alertas: filtrarAlertasPorPerfil_(alertas, user), dashboard: safeDashboard_(user), registros: safeListAtendimentos_({ limit: 20 }, user), savedAt: stamp, revision: revision, requiresAcknowledgement: false });
    } finally {
      releaseLock_(lock);
    }
  }, { atendimentoId: atendimentoId });
}

function reabrirAtendimento(atendimentoId, token, userAgent, requestMeta) {
  return safe_('reabrirAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!isMedical_(user)) throw appError_('SEM_PERMISSAO', 'Reabertura restrita ao corpo médico/suporte.');
    var lock = acquireWriteLock_('reabrir atendimento', 30000);
    try {
      assertSaveSchema_();
      var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
      if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');
      if (String(info.obj.locked || '').toUpperCase() !== 'SIM') throw appError_('JA_ABERTO', 'Este atendimento já está aberto para edição.');

      var before = compactAuditSnapshot_(info.obj);
      var payload = normalizePayload_(readPayloadFromRow_(info.obj));
      assertStoredAtendimentoIdentity_(info, payload);
      assertTransitionRevision_(info, requestMeta);
      var stamp = nowISO_();
      var revision = Number(info.obj.revision || payload.atendimento.revision || 0) + 1;
      payload.atendimento.status = 'REABERTO';
      payload.atendimento.reaberto_em = stamp;
      payload.atendimento.reaberto_por = user.nome || user.usuario;
      payload.atendimento.updated_at = stamp;
      payload.atendimento.updated_by = user.nome || user.usuario;
      payload.atendimento.revision = revision;

      var alertas = gerarAlertasServidor_(payload, user);
      var hash = payloadMeaningfulHash_(payload);
      var flat = flatAtendimento_(payload, user, alertas);
      flat.payload_hash = hash;
      flat.revision = revision;
      flat.last_request_id = 'REABRIR-' + Utilities.getUuid();
      flat.locked = 'NAO';
      flat.updated_at = stamp;
      flat.updated_by = user.usuario;
      var after = Object.assign({}, info.obj, flat);
      writeObjectAtRow_('ATENDIMENTOS', info.row, after);
      insertHistoryVersionBestEffort_(payload, hash, revision, user, flat.last_request_id, 'REABRIR');
      SpreadsheetApp.flush();
      verifyStoredSave_(findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId), payload, revision, hash, flat.last_request_id);
      logAudit_(user, 'ATENDIMENTO_REABERTO', 'ATENDIMENTOS', atendimentoId, before, { revision: revision, payload_hash: hash }, 'OK', userAgent);
      return ok_({ atendimento: payload, registros: safeListAtendimentos_({ limit: 20 }, user), dashboard: safeDashboard_(user), savedAt: stamp, revision: revision });
    } finally {
      releaseLock_(lock);
    }
  }, { atendimentoId: atendimentoId });
}

function obterAtendimento(atendimentoId, token) {
  return safe_('obterAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');
    var payload = normalizePayload_(readPayloadFromRow_(info.obj));
    payload.atendimento.revision = Number(info.obj.revision || payload.atendimento.revision || 0);
    payload.atendimento.updated_at = info.obj.updated_at || payload.atendimento.updated_at || '';
    if (!isMedical_(user)) payload = sanitizeForReadOperational_(payload);
    return ok_({ atendimento: payload, locked: String(info.obj.locked || '').toUpperCase() === 'SIM', alertas: filtrarAlertasPorPerfil_(parseJson_(info.obj.alertas_json, []), user), revision: Number(info.obj.revision || 0) });
  }, { atendimentoId: atendimentoId });
}

function listarAtendimentos(filtro, token) {
  return safe_('listarAtendimentos', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    return ok_({ registros: listarAtendimentosInterno_(filtro || {}, user), dashboard: dashboard_(user) });
  }, filtro || {});
}

/**
 * Agenda do dia: devolve TODOS os atendimentos cuja data da consulta cai no dia
 * informado (yyyy-MM-dd), independentemente do limite de registros recentes.
 * Antes, a agenda era filtrada apenas entre os 20 últimos registros do login,
 * por isso "aparecia só um nome" até clicar em Atualizar (correção 5).
 */
function listarAgenda(data, token) {
  return safe_('listarAgenda', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var dia = data ? dataCivilEstrita_(data) : Utilities.formatDate(new Date(), CLAV.TZ, 'yyyy-MM-dd');
    if (!dia) throw appError_('DATA_INVALIDA', 'Informe uma data de consulta válida no formato AAAA-MM-DD.');
    var rows = allLite_('ATENDIMENTOS').filter(function (r) {
      if (r._deleted_at) return false;
      return diaLocalPlanilha_(r.data_consulta) === dia;
    });
    rows.sort(function (a, b) {
      return parseIsoMillis_(dataTextoPlanilha_(a.data_consulta)) - parseIsoMillis_(dataTextoPlanilha_(b.data_consulta));
    });
    return ok_({ data: dia, registros: rows.map(function (r) { return publicAtendimentoRow_(r, user); }), total: rows.length });
  }, { data: data });
}

// Dia local (yyyy-MM-dd) de um valor de data da planilha (ISO com fuso, texto
// "yyyy-MM-ddTHH:mm" ou objeto Date). Sem fuso, assume o horário local.
function diaLocalPlanilha_(valor) {
  return diaCalendarioClav_(valor);
}
