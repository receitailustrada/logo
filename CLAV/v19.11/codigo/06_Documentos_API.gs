/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 06_Documentos_API.gs
 * API de documentos: exclusão, geração de PDF e acesso à base
 *
 * Conteúdo: excluirAtendimento, gerarPdfAtendimento(s), normalizeDocumentType_, abrirPlanilhaBase.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function excluirAtendimento(atendimentoId, token, userAgent) {
  return safe_('excluirAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!canDeleteRecords_(user)) throw appError_('SEM_PERMISSAO', 'Exclusão lógica restrita ao suporte/admin.');
    var lock = acquireWriteLock_('excluir atendimento', 20000);
    try {
      var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
      if (!info) throw appError_('NAO_ENCONTRADO', 'Atendimento não localizado.');
      var before = compactAuditSnapshot_(info.obj);
      info.obj._deleted_at = nowISO_();
      info.obj.updated_at = nowISO_();
      info.obj.updated_by = user.usuario;
      writeObjectAtRow_('ATENDIMENTOS', info.row, info.obj);
      SpreadsheetApp.flush();
      logAudit_(user, 'ATENDIMENTO_EXCLUIDO_LOGICO', 'ATENDIMENTOS', atendimentoId, before, { deleted_at: info.obj._deleted_at }, 'OK', userAgent);
      return ok_({ registros: safeListAtendimentos_({ limit: 50 }, user), dashboard: safeDashboard_(user) });
    } finally {
      releaseLock_(lock);
    }
  }, { atendimentoId: atendimentoId });
}

function gerarPdfAtendimento(atendimentoId, tipo, token, userAgent) {
  return safe_('gerarPdfAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');
    var payload = normalizePayload_(readPayloadFromRow_(info.obj));
    tipo = normalizeDocumentType_(tipo || 'AVALIACAO_PRE_ANESTESICA');
    if (!isMedical_(user) && tipo !== 'OPERACIONAL') {
      throw appError_('SEM_PERMISSAO', 'Documento clínico restrito ao corpo médico. Use o resumo operacional.');
    }

    var name = sanitizeFileName_('CLAV_' + tipo + '_' + atendimentoId + '_' + Utilities.formatDate(new Date(), CLAV.TZ, 'yyyyMMdd_HHmmss')) + '.pdf';
    var blob = createTablePdfBlob_(payload, tipo, user, name);
    var file = getExportsFolder_().createFile(blob.setName(name));
    makePdfShareable_(file);
    var hash = sha256_(stableStringify_({ tipo: tipo, atendimento: payload }));

    insert_('EXPORTACOES', {
      exportacao_id: uid_('EXP'), atendimento_id: atendimentoId, tipo: tipo,
      arquivo_nome: name, arquivo_url: file.getUrl(), hash_documental: hash,
      created_at: nowISO_(), created_by: user.usuario
    });
    logAudit_(user, 'PDF_GERADO', 'ATENDIMENTOS', atendimentoId, {}, { tipo: tipo, url: file.getUrl(), hash: hash }, 'OK', userAgent);
    // bytesBase64 permite ao navegador abrir/baixar o PDF diretamente, sem
    // passar pela tela de permissão do Google Drive. O link do Drive continua
    // no retorno como reserva e para a trilha de auditoria.
    return ok_({
      nome: name, url: file.getUrl(), hash: hash, tipo: tipo, generatedAt: nowISO_(),
      bytesBase64: Utilities.base64Encode(blob.getBytes()), mime: 'application/pdf'
    });
  }, { atendimentoId: atendimentoId, tipo: tipo });
}

function gerarPdfsAtendimento(atendimentoId, tipos, token, userAgent) {
  return safe_('gerarPdfsAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');
    var payload = normalizePayload_(readPayloadFromRow_(info.obj));
    var requested = Array.isArray(tipos) && tipos.length ? tipos : ['AVALIACAO_PRE_ANESTESICA', 'FICHA_ANESTESIA', 'RECUPERACAO_POS_ANESTESICA'];
    var arquivos = [];
    var erros = [];
    var inicio = Date.now();
    var interrompido = false;
    var carimbo = Utilities.formatDate(new Date(), CLAV.TZ, 'yyyyMMdd_HHmmss');
    // CORRECAO 15. Guarda de tempo: cada documento custa alguns segundos e o
    // Apps Script encerra a execucao aos 6 minutos. Em vez de parar no meio sem
    // aviso, o lote devolve o que conseguiu e sinaliza o que faltou.
    requested.slice(0, 6).forEach(function (rawTipo) {
      if (interrompido) return;
      if (Date.now() - inicio > 210000) { interrompido = true; return; }
      // v19.9: um documento com erro não derruba o lote nem esconde os já gerados.
      try {
        var tipo = normalizeDocumentType_(rawTipo);
        if (!isMedical_(user) && tipo !== 'OPERACIONAL') { erros.push({ tipo: tipo, mensagem: 'documento clínico restrito ao corpo médico' }); return; }
        var name = sanitizeFileName_('CLAV_' + tipo + '_' + atendimentoId + '_' + carimbo) + '.pdf';
        var blob = createTablePdfBlob_(payload, tipo, user, name);
        var file = getExportsFolder_().createFile(blob.setName(name));
        makePdfShareable_(file);
        var hash = sha256_(stableStringify_({ tipo: tipo, atendimento: payload }));
        insert_('EXPORTACOES', {
          exportacao_id: uid_('EXP'), atendimento_id: atendimentoId, tipo: tipo,
          arquivo_nome: name, arquivo_url: file.getUrl(), hash_documental: hash,
          created_at: nowISO_(), created_by: user.usuario
        });
        // Bytes vao junto: o navegador abre o arquivo sem depender do Drive, que
        // agora e privado (correcao 7).
        arquivos.push({
          nome: name, url: file.getUrl(), hash: hash, tipo: tipo,
          bytesBase64: Utilities.base64Encode(blob.getBytes()), mime: 'application/pdf'
        });
      } catch (errDoc) {
        erros.push({ tipo: String(rawTipo || ''), mensagem: errDoc && errDoc.message ? errDoc.message : String(errDoc) });
      }
    });
    logAudit_(user, 'PDFS_GERADOS_EM_LOTE', 'ATENDIMENTOS', atendimentoId, {}, { tipos: arquivos.map(function (a) { return a.tipo; }), interrompido: interrompido, erros: erros }, erros.length ? 'PARCIAL' : 'OK', userAgent);
    var mensagens = [];
    if (interrompido) mensagens.push('Alguns documentos não couberam no tempo desta execução. Gere os restantes individualmente.');
    if (erros.length) mensagens.push('Não foi possível gerar: ' + erros.map(function (e) { return e.tipo + ' (' + e.mensagem + ')'; }).join('; ') + '.');
    return ok_({
      arquivos: arquivos,
      erros: erros,
      generatedAt: nowISO_(),
      interrompido: interrompido,
      mensagem: mensagens.join(' ')
    });
  }, { atendimentoId: atendimentoId, tipos: tipos });
}

function normalizeDocumentType_(tipo) {
  tipo = String(tipo || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  var aliases = {
    PRE_ANESTESICO: 'AVALIACAO_PRE_ANESTESICA',
    CONSULTA_PRE_ANESTESICA: 'AVALIACAO_PRE_ANESTESICA',
    FICHA_ANESTESICA: 'FICHA_ANESTESIA',
    SRPA: 'RECUPERACAO_POS_ANESTESICA',
    POS_ANESTESICO: 'RECUPERACAO_POS_ANESTESICA',
    PRESCRICAO: 'PRESCRICAO_HOSPITALAR',
    RELATORIO: 'RELATORIO_NARRATIVO',
    SOLICITACOES: 'PEDIDOS',
    PEDIDOS_EXAMES: 'PEDIDOS'
  };
  var resolvido = aliases[tipo] || tipo || 'AVALIACAO_PRE_ANESTESICA';
  // v19.9: tipo desconhecido não pode virar um "pré-anestésico" pela metade.
  // v19.11 (pedido C12): PEDIDOS = solicitação de exames e avaliações para imprimir.
  var validos = ['AVALIACAO_PRE_ANESTESICA', 'FICHA_ANESTESIA', 'RECUPERACAO_POS_ANESTESICA', 'PRESCRICAO_HOSPITALAR', 'RELATORIO_NARRATIVO', 'OPERACIONAL', 'PEDIDOS'];
  if (validos.indexOf(resolvido) < 0) throw appError_('TIPO_DOCUMENTO_INVALIDO', 'Tipo de documento desconhecido: "' + String(tipo || '') + '".');
  return resolvido;
}

function abrirPlanilhaBase(token) {
  return safe_('abrirPlanilhaBase', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!canOpenSpreadsheet_(user)) {
      throw new Error('Seu perfil usa o sistema, mas não possui acesso direto à planilha ou ao histórico bruto.');
    }
    return ok_({ url: getSpreadsheet_().getUrl() });
  }, {});
}

