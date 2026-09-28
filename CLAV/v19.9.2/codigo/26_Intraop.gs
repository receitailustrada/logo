/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 26_Intraop.gs
 * Integração do intraoperatório: contexto do caso, fila do dia, salvamento e
 * controle de abas simultâneas.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * Até esta versão a ficha intraoperatória e o receituário viviam soltos, sem
 * conversar com a base. Aqui o intraoperatório passa a ser um consumidor de
 * primeira classe do mesmo atendimento: ao abrir a ficha no tablet, o sistema
 * entrega o contexto suficiente para iniciar o procedimento (identificação,
 * peso, alergias, ASA, via aérea prevista, jejum, comorbidades, medicações em
 * uso, alertas e pendências de segurança) e devolve o que for registrado para
 * dentro do mesmo payload, sob a chave "intraop".
 *
 * REGRA DE OURO DO SALVAMENTO
 * Este módulo NÃO escreve na planilha por conta própria. Ele monta o payload e
 * delega a salvarAtendimento(), preservando revisão, hash, detecção de
 * conflito, histórico e auditoria já existentes. Qualquer atalho aqui
 * quebraria a integridade que o sistema principal garante.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global.
 *
 * v19.8 (27/09/2026)
 * - tecnica_proposta: a consulta grava a técnica em conduta.anestesia_proposta;
 *   o contexto lia conduta.tecnica_proposta/tecnica (chaves inexistentes) e a
 *   ficha nunca recebia a técnica proposta. Agora lê as três, nesta ordem.
 * - clearance: a consulta grava calculos.clearance_cockcroft; incluído.
 * - intraopRegistrarAba aceita o nome do paciente (4º parâmetro, opcional) e o
 *   devolve em outrasAbas, para o aviso da ficha dizer QUEM está na outra aba
 *   em vez do número do atendimento.
 */

/** Quantas abas de ficha o mesmo profissional pode manter abertas ao mesmo tempo. */
var CLAV_INTRA_MAX_ABAS_ = 2;
var CLAV_INTRA_ABA_PREFIX_ = 'CLAV_INTRA_ABAS_V1_';
var CLAV_INTRA_ABA_TTL_ = 21600; // 6 horas: cobre uma jornada de sala sem lixo eterno.

/* ============================================================================
 * 1. CONTEXTO DO CASO
 * ==========================================================================*/

/**
 * Devolve tudo o que a ficha intraoperatória precisa para começar, em um único
 * pacote enxuto. Evita que o tablet faça cinco chamadas em sala.
 */
function intraopAbrirCaso(atendimentoId, token) {
  return safe_('intraopAbrirCaso', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!atendimentoId) throw appError_('PARAMETRO', 'Informe o atendimento a ser aberto.');

    var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');

    var payload = normalizePayload_(readPayloadFromRow_(info.obj));
    assertStoredAtendimentoIdentity_(info, payload);
    var alertas = filtrarAlertasPorPerfil_(parseJson_(info.obj.alertas_json, []), user);

    return ok_({
      contexto: intraopMontarContexto_(payload, info.obj, user, alertas),
      intraop: payload.intraop || {},
      revision: Number(info.obj.revision || 0),
      locked: String(info.obj.locked || '').toUpperCase() === 'SIM',
      permissoes: userPermissions_(user),
      usuario: publicUser_(user),
      podeSalvar: isMedical_(user),
      urlAbaPropria: urlIntraoperatorio_(atendimentoId, 1),
      installationId: getWebAppUrl_()
    });
  }, { atendimentoId: atendimentoId });
}

/**
 * Contexto compacto. Só o que é útil com o paciente já na mesa: nada de
 * histórico longo, nada de texto de consulta inteiro.
 */
function intraopMontarContexto_(payload, row, user, alertas) {
  var p = payload.paciente || {};
  var pr = payload.procedimento || {};
  var pre = payload.preop || {};
  var tr = payload.triagem || {};
  var an = payload.anamnese || {};
  var va = payload.viaAerea || {};
  var ri = payload.riscos || {};
  var si = payload.sistemas || {};
  var seg = payload.seguranca || {};
  var cal = payload.calculos || {};
  var con = payload.conduta || {};

  var peso = tr.peso || '';
  var altura = tr.altura || '';

  return {
    atendimento_id: (payload.atendimento && payload.atendimento.atendimento_id) || row.atendimento_id || '',
    status: (payload.atendimento && payload.atendimento.status) || row.status || 'ABERTO',
    instituicao: nomeInstituicao_(),
    cidade_instituicao: cidadeInstituicao_(),

    paciente: {
      paciente_id: p.paciente_id || '',
      nome: p.nome || '',
      nome_preferido: p.nome_preferido || p.nome_social || '',
      prontuario: p.prontuario || '',
      nascimento: p.nascimento || '',
      idade: p.idade || calcAge_(p.nascimento) || '',
      idade_formatada: idadeFormatada_(p.nascimento, p.idade),
      sexo: p.sexo || '',
      potencial_gestacional: p.potencial_gestacional || '',
      cidade: p.cidade || '',
      contexto_cuidado: p.contexto_cuidado || ''
    },

    medidas: {
      peso: peso,
      altura: altura,
      imc: cal.imc || '',
      imc_classe: cal.imc ? classificarImc_(Number(cal.imc)) : '',
      superficie_corporal: intraopSuperficieCorporal_(peso, altura),
      clearance: (cal.clearance || cal.cockcroft || cal.clearance_cockcroft || '')
    },

    procedimento: {
      nome: pr.nome || row.procedimento || '',
      lateralidade: pr.lateralidade || '',
      carater: pr.carater || '',
      porte: pr.porte || '',
      tipo_cirurgia: pr.tipo_cirurgia || '',
      risco_cirurgico: pr.risco_cirurgico || '',
      data_cirurgia: pr.data_cirurgia || row.data_cirurgia || '',
      local: (payload.atendimento && payload.atendimento.local) || pr.local || row.local_procedimento || '',
      convenio: (payload.atendimento && payload.atendimento.convenio) || row.convenio || '',
      equipe: equipeCirurgica_(pr),
      cirurgiao: equipeCirurgica_(pr).join('; ')
    },

    // Bloco que decide conduta em sala. É o coração da integração.
    preAnestesico: {
      asa: pre.asa || '',
      mets: pre.mets || '',
      estratificacao: pre.estratificacao_risco_paciente || '',
      anestesiologista: pre.anestesiologista || row.anestesiologista || '',
      data_avaliacao: pre.data_avaliacao || '',
      conclusao: con.conclusao || '',
      tecnica_proposta: con.tecnica_proposta || con.tecnica || con.anestesia_proposta || '',
      jejum: intraopTextoJejum_(payload),
      alergias: an.alergias || '',
      alergias_itens: Array.isArray(an.alergias_itens) ? an.alergias_itens : [],
      medicacoes_uso: an.medicacoes || '',
      historia_anestesica: an.historia_anestesica || '',
      compl_anestesicas_pessoais: Array.isArray(an.compl_anestesicas_pessoais) ? an.compl_anestesicas_pessoais : [],
      compl_anestesicas_familiares: Array.isArray(an.compl_anestesicas_familiares) ? an.compl_anestesicas_familiares : [],
      antecedentes: an.antecedentes_texto || '',
      comorbidades: intraopResumoSistemas_(si),
      glp1: resumoGlp1_(payload) || ''
    },

    viaAerea: {
      mallampati: va.mallampati || '',
      abertura_oral: va.abertura_oral || '',
      distancia_tireomentoniana: va.distancia_tireomentoniana || '',
      mobilidade_cervical: va.mobilidade_cervical || '',
      protrusao_mandibular: va.protrusao_mandibular || '',
      circunferencia_cervical: va.circunferencia_cervical || '',
      denticao: va.denticao || '',
      denticao_itens: Array.isArray(va.denticao_itens) ? va.denticao_itens : [],
      observacoes: va.observacoes || '',
      dificil_previsto: intraopViaAereaDificil_(va)
    },

    riscos: {
      rcri: ri.rcri || '',
      stop_bang: ri.stop_bang || '',
      apfel: ri.apfel || '',
      caprini: ri.caprini || '',
      clav_score: cal.clav_score === undefined || cal.clav_score === null ? '' : cal.clav_score
    },

    // Últimos sinais vitais conhecidos: servem como linha de base do gráfico.
    basal: {
      pa: tr.pa || '',
      fc: tr.fc || '',
      fr: tr.fr || '',
      spo2: tr.spo2 || '',
      temperatura: tr.temperatura || '',
      glicemia: tr.glicemia || '',
      dor: tr.dor || '',
      responsavel: tr.responsavel || '',
      registrado_em: (payload.atendimento && payload.atendimento.triagem_concluida_em) || ''
    },

    seguranca: {
      beta_hcg_status: seg.beta_hcg_status || '',
      beta_hcg_observacao: seg.beta_hcg_observacao || '',
      dum: seg.dum || '',
      protecao_menor_ativa: protecaoMenorAtiva_(payload),
      protecao_menor_pendente: protecaoMenorPendente_(payload)
    },

    // Medicações já prescritas na avaliação: o receituário da ficha começa daqui.
    prescricaoPrevia: Array.isArray(con.medicacoes_internacao) ? con.medicacoes_internacao : [],

    alertas: alertas || [],

    responsavelSala: {
      nome: user.nome || user.usuario || '',
      crm: crmDoProfissional_(user.nome, user) || user.crm || '',
      rqe: user.rqe || '',
      perfil: user.perfil || ''
    }
  };
}

/** Superfície corporal por Mosteller — usada em doses de alguns fármacos. */
function intraopSuperficieCorporal_(peso, altura) {
  var p = Number(String(peso).replace(',', '.'));
  var a = Number(String(altura).replace(',', '.'));
  if (!p || !a) return '';
  return (Math.sqrt((a * p) / 3600)).toFixed(2);
}

/** Marca via aérea potencialmente difícil a partir do que já foi avaliado. */
function intraopViaAereaDificil_(va) {
  var motivos = [];
  var mp = String(va.mallampati || '').toUpperCase();
  if (mp.indexOf('III') >= 0 || mp.indexOf('IV') >= 0) motivos.push('Mallampati ' + va.mallampati);
  var dtm = Number(String(va.distancia_tireomentoniana || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (dtm && dtm < 6) motivos.push('Distância tireomentoniana ' + va.distancia_tireomentoniana + ' cm');
  var ao = Number(String(va.abertura_oral || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (ao && ao < 3) motivos.push('Abertura oral ' + va.abertura_oral + ' cm');
  var cc = Number(String(va.circunferencia_cervical || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (cc && cc > 43) motivos.push('Circunferência cervical ' + va.circunferencia_cervical + ' cm');
  if (String(va.mobilidade_cervical || '').toLowerCase().indexOf('reduz') >= 0) motivos.push('Mobilidade cervical reduzida');
  return motivos;
}

/** Resumo curto das comorbidades por sistema, para o cabeçalho da ficha. */
function intraopResumoSistemas_(si) {
  var mapa = [
    ['cardio_itens', 'Cardiovascular'], ['resp_itens', 'Respiratório'],
    ['renal_itens', 'Renal'], ['gastro_itens', 'Digestivo'],
    ['endocrino_itens', 'Endócrino'], ['hemato_itens', 'Hematológico'],
    ['neuro_itens', 'Neurológico'], ['musculo_itens', 'Musculoesquelético']
  ];
  var out = [];
  mapa.forEach(function (par) {
    var itens = si[par[0]];
    if (Array.isArray(itens) && itens.length) out.push({ sistema: par[1], itens: itens.slice(0, 8) });
  });
  return out;
}

/** Texto de jejum aplicável (inclui a regra GLP-1 quando ativa). */
function intraopTextoJejum_(payload) {
  try {
    if (glp1AtivoServidor_(payload)) {
      var t = (payload.anamnese && payload.anamnese.glp1_jejum_texto) || '';
      if (t) return t;
    }
  } catch (ignored) {}
  return (payload.conduta && payload.conduta.jejum) || '';
}

/* ============================================================================
 * 2. FILA DO DIA
 * ==========================================================================*/

/**
 * Casos do dia prontos para a sala. É a tela inicial da ficha quando ela é
 * aberta sem um caso definido — o anestesista toca no paciente e começa.
 */
function intraopFilaDoDia(dataCirurgia, token) {
  return safe_('intraopFilaDoDia', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var alvo = dataCirurgia || Utilities.formatDate(new Date(), CLAV.TZ, 'yyyy-MM-dd');

    // Filtra pela DATA DA CIRURGIA (a agenda usa data_consulta; em sala o que
    // importa é o dia do procedimento). allLite_ ignora as colunas payload_json*,
    // então a fila custa alguns KB por linha em vez de centenas.
    var rows = allLite_('ATENDIMENTOS').filter(function (r) {
      if (r._deleted_at) return false;
      if (String(r.status || '').toUpperCase() === 'CANCELADO') return false;
      return diaLocalPlanilha_(r.data_cirurgia) === alvo;
    });

    var fila = rows.map(function (r) {
      var pub = publicAtendimentoRow_(r, user);
      return {
        atendimento_id: pub.atendimento_id,
        paciente_nome: pub.paciente_nome,
        prontuario: r.prontuario || '',
        procedimento: pub.procedimento || '',
        lateralidade: pub.lateralidade || '',
        carater: pub.carater || '',
        porte: r.porte || '',
        local: pub.local_procedimento || '',
        cirurgiao: pub.cirurgiao || '',
        anestesiologista: pub.anestesiologista || '',
        convenio: pub.convenio || '',
        status: pub.status || '',
        locked: pub.locked || '',
        alertas_danger: pub.alertas_danger || 0,
        beta_hcg_status: pub.beta_hcg_status || '',
        url: urlIntraoperatorio_(pub.atendimento_id, 1)
      };
    });

    // Emergência e urgência primeiro: é a ordem em que a sala é chamada.
    fila.sort(function (a, b) {
      var ord = clavOrdemCarater_(b.carater) - clavOrdemCarater_(a.carater);
      if (ord) return ord;
      return String(a.paciente_nome || '').localeCompare(String(b.paciente_nome || ''));
    });

    return ok_({ data: alvo, fila: fila, total: fila.length });
  }, { dataCirurgia: dataCirurgia });
}

/* ============================================================================
 * 3. SALVAMENTO
 * ==========================================================================*/

/**
 * Grava o bloco intraoperatório dentro do atendimento existente.
 *
 * Recebe apenas o pedaço "intraop" e faz o merge no payload atual, para que
 * uma ficha aberta em sala jamais sobrescreva a consulta pré-anestésica que
 * está aberta em outra tela. O restante do payload segue intocado.
 */
function intraopSalvar(atendimentoId, intraop, token, requestMeta, userAgent) {
  return safe_('intraopSalvar', function () {
    requireInstalled_();
    var session = validateSessionToken_(token);
    var user = session.user;
    assertCanSave_(user);
    if (!isMedical_(user)) throw appError_('PERMISSAO', 'Somente o corpo médico registra a ficha anestésica.');
    if (!atendimentoId) throw appError_('PARAMETRO', 'Informe o atendimento da ficha.');

    var info = findRowBy_('ATENDIMENTOS', 'atendimento_id', atendimentoId);
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Atendimento não encontrado.');
    var stored = normalizePayload_(readPayloadFromRow_(info.obj));
    var patientId = assertStoredAtendimentoIdentity_(info, stored);
    var meta = deepClone_(requestMeta || {});
    if (!meta.requestId || meta.baseRevision === undefined || meta.baseRevision === null || meta.baseRevision === '' || !isFinite(Number(meta.baseRevision))) {
      throw appError_('REVISAO_OBRIGATORIA', 'Atualize a ficha antes de salvar: esta versão exige a revisão original e o identificador da tentativa.');
    }
    if (!meta.clientContext || String(meta.clientContext.atendimentoId || '') !== String(atendimentoId) ||
        String(meta.clientContext.pacienteId || '') !== String(patientId)) {
      throw appError_('VINCULO_INCOMPATIVEL', 'O contexto desta ficha não corresponde ao paciente e atendimento abertos.');
    }
    if (!meta.clientSavedAt || isNaN(Date.parse(meta.clientSavedAt))) {
      throw appError_('PARAMETRO', 'A tentativa de salvamento está sem data válida. Abra novamente a ficha.');
    }
    // Payload parcial e determinístico: o núcleo faz o merge SOB o lock e usa
    // a revisão que o cliente realmente leu. Reenvio preserva a mesma entrada.
    var bloco = intraopNormalizarBloco_(intraop, {});
    Object.keys(bloco).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(intraop || {}, key)) delete bloco[key];
    });
    bloco.atualizado_em = String(meta.clientSavedAt);
    bloco.atualizado_por = user.usuario;
    var payload = {
      paciente: { paciente_id: patientId },
      atendimento: { atendimento_id: String(atendimentoId), paciente_id: patientId, revision: Number(meta.baseRevision) },
      intraop: bloco
    };
    meta.origem = 'INTRAOPERATORIO';

    var resposta = salvarAtendimento(payload, token, meta, userAgent);
    try {
      logAudit_(user, 'SALVAR_INTRAOPERATORIO', 'ATENDIMENTOS', atendimentoId, null,
        { aferições: (payload.intraop.sinais || []).length, medicações: (payload.intraop.medicacoes || []).length },
        resposta && resposta.ok ? 'OK' : 'ERRO', userAgent, meta.requestId);
    } catch (ignoredAudit) {}
    return resposta;
  }, { atendimentoId: atendimentoId });
}

/**
 * Normaliza e limita o bloco intraoperatório. O tablet é fonte de dado bruto:
 * aqui garantimos tipo, ordenação por horário e teto de linhas, para que uma
 * sessão longa nunca estoure o limite de célula da planilha.
 */
function intraopNormalizarBloco_(novo, atual) {
  novo = (novo && typeof novo === 'object') ? novo : {};
  atual = (atual && typeof atual === 'object') ? atual : {};
  var out = mergeDeep_(deepClone_(atual), novo);

  // v19.6: "intercorrencias" é TEXTO (é assim que o Index, o PDF e a ficha v5 o
  // tratam). Listas antigas gravadas pela ficha anterior são convertidas em texto.
  if (Array.isArray(out.intercorrencias)) {
    out.intercorrencias = out.intercorrencias.map(function (i) {
      if (!i) return '';
      if (typeof i !== 'object') return String(i);
      return [i.hora || i.horario || '', i.texto || i.descricao || i.evento || i.conduta || ''].filter(Boolean).join(' — ');
    }).filter(Boolean).join('\n');
  }
  if (out.intercorrencias !== undefined && out.intercorrencias !== null && typeof out.intercorrencias !== 'string') {
    out.intercorrencias = String(out.intercorrencias);
  }
  var listas = ['sinais', 'medicacoes', 'monitorizacao_itens', 'eventos',
                'ventilacao', 'fluidos', 'hemoderivados', 'aldrete', 'checklist'];
  listas.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(novo, k) && !Array.isArray(novo[k])) {
      throw appError_('INTRA_DADOS_INVALIDOS', 'O campo ' + k + ' deve ser uma lista. A ficha não foi gravada; preserve o JSON e revise o conteúdo.');
    }
    out[k] = Array.isArray(out[k]) ? out[k] : [];
  });

  // Ordena por horário quando houver, para a ficha impressa sair coerente.
  ['sinais', 'medicacoes', 'ventilacao', 'fluidos', 'eventos'].forEach(function (k) {
    if (out[k].some(function (i) { return !i || typeof i !== 'object' || Array.isArray(i); })) {
      throw appError_('INTRA_DADOS_INVALIDOS', 'Há um item inválido em ' + k + '. Nenhum item foi descartado ou gravado. Preserve o JSON e revise o lançamento.');
    }
    // v19.5 (TEMPO-002). Ordenar pelo texto da hora punha 00:05 antes de
    // 23:55 num caso que atravessou a meia-noite. A coluna (minutos desde o
    // início) é a referência cronológica; a hora só desempata itens sem coluna.
    out[k] = out[k].sort(function (a, b) {
      var ca = Number(a.col), cb = Number(b.col);
      var temA = a.col !== null && a.col !== '' && a.col !== undefined && isFinite(ca);
      var temB = b.col !== null && b.col !== '' && b.col !== undefined && isFinite(cb);
      if (temA && temB && ca !== cb) return ca - cb;
      if (temA !== temB) return temA ? -1 : 1;
      return String(a.hora || a.horario || '').localeCompare(String(b.hora || b.horario || ''));
    });
  });

  // Nunca confirmar uma ficha descartando silenciosamente linhas excedentes.
  // Os mesmos tetos anteriores permanecem, com erro explícito para preservar
  // o rascunho integral e permitir revisão/exportação antes de novo envio.
  var limites = { sinais:720, medicacoes:400, eventos:400, ventilacao:400, fluidos:200 };
  Object.keys(limites).forEach(function (key) {
    if (out[key].length > limites[key]) {
      throw appError_('INTRA_LIMITE_EXCEDIDO', 'A ficha excede o limite de ' + limites[key] + ' itens em ' + key + '. Nenhuma linha foi descartada ou gravada. Exporte o JSON completo e revise os lançamentos.');
    }
  });

  // v19.9: orçamento de tamanho. O atendimento inteiro cabe em 5 colunas de
  // 45.000 caracteres; a ficha (JSON íntegro + linhas legíveis) fica limitada a
  // 150.000 para sobrar espaço à consulta. Recusar com clareza é melhor do que
  // falhar depois com PAYLOAD_TOO_LARGE sem dizer o que reduzir.
  var tamanho = JSON.stringify(out).length;
  if (tamanho > 150000) {
    throw appError_('INTRA_LIMITE_EXCEDIDO', 'A ficha ficou grande demais para o prontuário (' + Math.round(tamanho / 1000) + ' mil caracteres; limite 150 mil). Nenhuma linha foi descartada ou gravada. Copie o JSON pela ficha e avise o suporte.');
  }

  return out;
}

/* ============================================================================
 * 4. CONTROLE DE ABAS SIMULTÂNEAS
 * ==========================================================================*/

/**
 * Registra que uma aba de ficha foi aberta por este usuário.
 *
 * Existe porque a realidade da escala impõe: com um único anestesista de
 * plantão e a chegada de uma urgência, o profissional precisa registrar o
 * segundo caso sem perder o primeiro. O sistema permite até
 * CLAV_INTRA_MAX_ABAS_ fichas abertas, identifica cada aba, e devolve ao
 * frontend quais outros casos estão ativos — para que a tela mostre de quem é
 * a ficha em foco e evite lançamento no paciente errado.
 *
 * O registro é apenas operacional (cache com validade curta). Não altera
 * prontuário, não bloqueia atendimento e não substitui a decisão clínica de
 * quem está em sala.
 */
function intraopRegistrarAba(atendimentoId, abaId, token, pacienteNome) {
  return safe_('intraopRegistrarAba', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var chave = CLAV_INTRA_ABA_PREFIX_ + sha256_(String(user.usuario_id || user.usuario));
    var cache = CacheService.getUserCache();
    var abas = parseJson_(cache.get(chave), []) || [];
    var agora = Date.now();

    // Descarta abas silenciosas há mais de 20 minutos (tablet fechado, bateria).
    abas = abas.filter(function (a) {
      return a && a.abaId && (agora - Number(a.visto_em || 0)) < 20 * 60 * 1000;
    });

    var existente = null;
    for (var i = 0; i < abas.length; i++) {
      if (abas[i].abaId === abaId) { existente = abas[i]; break; }
    }

    var limiteAtingido = false;
    if (!existente) {
      if (abas.length >= CLAV_INTRA_MAX_ABAS_) {
        limiteAtingido = true;
      } else {
        existente = { abaId: abaId, aberta_em: agora };
        abas.push(existente);
      }
    }

    if (existente) {
      existente.atendimento_id = atendimentoId || '';
      // v19.8: nome de tela do paciente (só para o aviso da outra aba; nunca substitui o vínculo pelo id).
      if (pacienteNome) existente.paciente = String(pacienteNome).slice(0, 80);
      existente.visto_em = agora;
      cache.put(chave, toJson_(abas), CLAV_INTRA_ABA_TTL_);
    }

    var outras = abas.filter(function (a) { return a.abaId !== abaId && a.atendimento_id; })
      .map(function (a) { return { abaId: a.abaId, atendimento_id: a.atendimento_id, paciente: a.paciente || '' }; });

    return ok_({
      registrada: !limiteAtingido,
      limiteAtingido: limiteAtingido,
      maximo: CLAV_INTRA_MAX_ABAS_,
      abertas: abas.length,
      outrasAbas: outras,
      conflito: outras.some(function (a) { return a.atendimento_id !== atendimentoId; })
    });
  }, { atendimentoId: atendimentoId, abaId: abaId });
}

/** Libera a aba ao fechar a ficha, para não travar o limite à toa. */
function intraopLiberarAba(abaId, token) {
  return safe_('intraopLiberarAba', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    var chave = CLAV_INTRA_ABA_PREFIX_ + sha256_(String(user.usuario_id || user.usuario));
    var cache = CacheService.getUserCache();
    var abas = (parseJson_(cache.get(chave), []) || []).filter(function (a) { return a && a.abaId !== abaId; });
    cache.put(chave, toJson_(abas), CLAV_INTRA_ABA_TTL_);
    return ok_({ abertas: abas.length });
  }, { abaId: abaId });
}

/* ============================================================================
 * 5. APOIO À TELA
 * ==========================================================================*/

/** Opções e catálogos que a ficha usa nos chips e listas rápidas. */
function intraopOpcoes(token) {
  return safe_('intraopOpcoes', function () {
    requireInstalled_();
    validarSessao_(token);
    return ok_({
      medicacoes: catalogoAtivo_('MEDICACOES', DEFAULT_MEDICACOES_()),
      anestesiologistas: DEFAULT_ANESTESIOLOGISTAS_(),
      maxAbas: CLAV_INTRA_MAX_ABAS_,
      urlBase: getWebAppUrl_()
    });
  }, {});
}