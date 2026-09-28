/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 10_Payload_Clinico.gs
 * Normalização do payload clínico, colunas planas e alertas do servidor
 *
 * Conteúdo: sanitize/normalizePayload_, flatAtendimento_, auditoria de triagem, gerarAlertasServidor_.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function sanitizeOperationalPayload_(p) {
  p = normalizePayload_(p || {});
  return {
    paciente: p.paciente,
    atendimento: p.atendimento,
    procedimento: p.procedimento,
    triagem: p.triagem,
    // A secretária registra a Parte 2 completa, incluindo exames complementares.
    exames: p.exames || {},
    // v19.9: "Relatório clínico textual" e "Qualidade, intercorrência e evento" são
    // visíveis ao perfil operacional; sem estas chaves o texto era descartado em
    // silêncio com mensagem de sucesso e sumia da tela na resposta.
    documentos: {
      operacional: p.documentos && p.documentos.operacional ? p.documentos.operacional : '',
      resumo: p.documentos && p.documentos.resumo ? p.documentos.resumo : ''
    },
    seguranca: (function (s) {
      var out = {};
      ['evento_categoria', 'evento_gravidade', 'evento_status', 'evento_descricao', 'evento_conduta'].forEach(function (k) {
        if (s && s[k] !== undefined && s[k] !== null) out[k] = s[k];
      });
      return out;
    })(p.seguranca)
  };
}

function sanitizeForReadOperational_(payload) {
  payload = normalizePayload_(payload);
  return sanitizeOperationalPayload_(payload);
}

function normalizePayload_(p) {
  p = p || {};
  p.paciente = p.paciente || {};
  p.atendimento = p.atendimento || {};
  p.procedimento = p.procedimento || {};
  p.triagem = p.triagem || {};
  p.preop = p.preop || {};
  p.anamnese = p.anamnese || {};
  p.sistemas = p.sistemas || {};
  p.exame = p.exame || {};
  p.viaAerea = p.viaAerea || {};
  p.exames = p.exames || {};
  p.riscos = p.riscos || {};
  p.conduta = p.conduta || {};
  p.conduta.medicacoes_internacao = Array.isArray(p.conduta.medicacoes_internacao) ? p.conduta.medicacoes_internacao : [];
  // v19.10 (pedido C13): nomes removidos da lista de internação e marca de "lista tocada".
  p.conduta.medicacoes_internacao_excluidas = Array.isArray(p.conduta.medicacoes_internacao_excluidas) ? p.conduta.medicacoes_internacao_excluidas : [];
  p.conduta.medicacoes_internacao_tocada = p.conduta.medicacoes_internacao_tocada || '';
  p.conduta.solicitacoes_itens = Array.isArray(p.conduta.solicitacoes_itens) ? p.conduta.solicitacoes_itens : [];
  p.conduta.prescricao_modelo = (p.conduta.prescricao_modelo && typeof p.conduta.prescricao_modelo === 'object') ? p.conduta.prescricao_modelo : {};
  // Itens opcionais clicáveis da prescrição (HGT, tricotomia, meias elásticas,
  // manta térmica e reservas de hemocomponentes).
  p.conduta.prescricao_modelo.opcionais = Array.isArray(p.conduta.prescricao_modelo.opcionais) ? p.conduta.prescricao_modelo.opcionais : [];
  p.anamnese.cirurgias_previas = Array.isArray(p.anamnese.cirurgias_previas) ? p.anamnese.cirurgias_previas : [];
  // Blocos estruturados criados na revisão do pré-anestésico (retrocompatíveis:
  // registros antigos simplesmente não os possuem e seguem legíveis).
  p.anamnese.compl_anestesicas_pessoais = Array.isArray(p.anamnese.compl_anestesicas_pessoais) ? p.anamnese.compl_anestesicas_pessoais : [];
  p.anamnese.compl_anestesicas_familiares = Array.isArray(p.anamnese.compl_anestesicas_familiares) ? p.anamnese.compl_anestesicas_familiares : [];
  p.anamnese.compl_anestesicas_tipos = Array.isArray(p.anamnese.compl_anestesicas_tipos) ? p.anamnese.compl_anestesicas_tipos : [];
  p.anamnese.alergias_itens = Array.isArray(p.anamnese.alergias_itens) ? p.anamnese.alergias_itens : [];
  // Triagem GLP-1 (nota SBA / canetas emagrecedoras): campos retrocompatíveis.
  p.anamnese.glp1_protocolo = p.anamnese.glp1_protocolo || '';
  p.anamnese.glp1_medicamento = p.anamnese.glp1_medicamento || '';
  p.anamnese.glp1_med_id = p.anamnese.glp1_med_id || '';
  p.anamnese.glp1_pocus = p.anamnese.glp1_pocus || '';
  p.anamnese.glp1_riscos = Array.isArray(p.anamnese.glp1_riscos) ? p.anamnese.glp1_riscos : [];
  p.anamnese.glp1_ultima_dose = p.anamnese.glp1_ultima_dose || '';
  p.anamnese.glp1_suspensao = p.anamnese.glp1_suspensao || '';
  p.anamnese.glp1_jejum_texto = p.anamnese.glp1_jejum_texto || '';
  p.viaAerea = p.viaAerea || {};
  p.viaAerea.denticao_itens = Array.isArray(p.viaAerea.denticao_itens) ? p.viaAerea.denticao_itens : [];
  ['cardio_itens', 'resp_itens', 'renal_itens', 'gastro_itens', 'endocrino_itens', 'hemato_itens', 'neuro_itens', 'musculo_itens'].forEach(function (key) {
    p.sistemas[key] = Array.isArray(p.sistemas[key]) ? p.sistemas[key] : [];
  });
  p.sistemas.hemato_coagulacao_itens = Array.isArray(p.sistemas.hemato_coagulacao_itens) ? p.sistemas.hemato_coagulacao_itens : [];
  p.intraop = p.intraop || {};
  p.intraop.sinais = Array.isArray(p.intraop.sinais) ? p.intraop.sinais : [];
  p.intraop.medicacoes = Array.isArray(p.intraop.medicacoes) ? p.intraop.medicacoes : [];
  p.intraop.monitorizacao_itens = Array.isArray(p.intraop.monitorizacao_itens) ? p.intraop.monitorizacao_itens : [];
  p.srpa = p.srpa || {};
  p.srpa.sinais = Array.isArray(p.srpa.sinais) ? p.srpa.sinais : [];
  p.srpa.medicacoes = Array.isArray(p.srpa.medicacoes) ? p.srpa.medicacoes : [];
  p.documentos = p.documentos || {};
  p.seguranca = p.seguranca || {};
  p.seguranca.alertas_cientes = Array.isArray(p.seguranca.alertas_cientes) ? p.seguranca.alertas_cientes : [];
  p.seguranca.protecao_menor_orgaos = Array.isArray(p.seguranca.protecao_menor_orgaos)
    ? p.seguranca.protecao_menor_orgaos
    : (p.seguranca.protecao_menor_orgaos ? [String(p.seguranca.protecao_menor_orgaos)] : []);
  p.seguranca.beta_hcg_observacao = p.seguranca.beta_hcg_observacao || '';
  // Data da última menstruação (DUM), pedida pela equipe; registros antigos
  // simplesmente não a possuem e seguem legíveis.
  p.seguranca.dum = p.seguranca.dum || '';
  p.seguranca.protecao_menor_ciencia = p.seguranca.protecao_menor_ciencia || '';
  p.seguranca.protecao_menor_protocolo = p.seguranca.protecao_menor_protocolo || '';
  p.seguranca.protecao_menor_data = p.seguranca.protecao_menor_data || '';
  p.seguranca.protecao_menor_responsavel = p.seguranca.protecao_menor_responsavel || '';
  p.seguranca.protecao_menor_observacoes = p.seguranca.protecao_menor_observacoes || '';
  p.calculos = p.calculos || {};
  if (!p.atendimento.status) p.atendimento.status = 'ABERTO';
  return p;
}

function flatAtendimento_(payload, user, alertas) {
  payload = normalizePayload_(payload);
  var p = payload.paciente || {};
  var a = payload.atendimento || {};
  var pr = payload.procedimento || {};
  var pre = payload.preop || {};
  var chunks = encodePayloadColumns_(payload);
  var equipe = equipeCirurgica_(pr);
  return {
    atendimento_id: a.atendimento_id,
    paciente_id: p.paciente_id || a.paciente_id || '',
    paciente_nome: p.nome || '',
    data_consulta: a.data_consulta || '',
    data_cirurgia: pr.data_cirurgia || a.data_cirurgia || '',
    status: a.status || 'ABERTO',
    procedimento: pr.nome || '',
    lateralidade: pr.lateralidade || '',
    carater: pr.carater || '',
    tipo_cirurgia: pr.tipo_cirurgia || '',
    convenio: a.convenio || '',
    local_procedimento: a.local || pr.local || '',
    cirurgiao: equipe.join('; '),
    anestesiologista: pre.anestesiologista || a.anestesiologista || '',
    triagem_concluida_em: a.triagem_concluida_em || '',
    beta_hcg_status: payload.seguranca.beta_hcg_status || '',
    prontuario: p.prontuario || '',
    nome_preferido: p.nome_preferido || p.nome_social || '',
    cidade: p.cidade || '',
    imc: (payload.calculos && payload.calculos.imc) || '',
    pa: (payload.triagem && payload.triagem.pa) || '',
    fr: (payload.triagem && payload.triagem.fr) || '',
    clav_score: (payload.calculos && payload.calculos.clav_score !== undefined && payload.calculos.clav_score !== null) ? String(payload.calculos.clav_score) : '',
    conclusao: (payload.conduta && payload.conduta.conclusao) || '',
    data_avaliacao: (pre && pre.data_avaliacao) || '',
    triagem_responsavel: (payload.triagem && payload.triagem.responsavel) || '',
    porte: pr.porte || '',
    alertas_json: truncateCellText_(toJson_(alertas || [])),
    payload_json: chunks.payload_json, payload_json_2: chunks.payload_json_2,
    payload_json_3: chunks.payload_json_3, payload_json_4: chunks.payload_json_4,
    payload_json_5: chunks.payload_json_5,
    payload_hash: payloadMeaningfulHash_(payload),
    revision: Number(a.revision || 0), last_request_id: '',
    updated_at: nowISO_(), updated_by: user.usuario, _deleted_at: ''
  };
}

// Campos de triagem auditados (sinais vitais, medidas e observações).
var CLAV_TRIAGEM_CAMPOS_AUDITADOS_ = ['pa', 'fc', 'fr', 'spo2', 'temperatura', 'peso', 'altura', 'observacao', 'glicemia', 'dor'];

function registrarAuditoriaTriagem_(existingPayload, payload, user, stamp, requestId, userAgent) {
  if (!existingPayload || !payload || !payload.triagem) return;
  var antes = existingPayload.triagem || {};
  var depois = payload.triagem;
  var responsavel = String(antes.responsavel || depois.responsavel || '').trim();
  if (!responsavel) return;
  var editor = String(user.nome || user.usuario || '').trim();
  if (!editor || tokenClav_(editor) === tokenClav_(responsavel)) return;
  var alteracoes = [];
  CLAV_TRIAGEM_CAMPOS_AUDITADOS_.forEach(function (campo) {
    var a = antes[campo] === undefined || antes[campo] === null ? '' : String(antes[campo]).trim();
    var b = depois[campo] === undefined || depois[campo] === null ? '' : String(depois[campo]).trim();
    if (a !== b) alteracoes.push({ campo: campo, de: a, para: b });
  });
  if (!alteracoes.length) return;
  // Mantém o nome de quem triou; registra quem corrigiu apenas na planilha.
  depois.responsavel = responsavel;
  if (!Array.isArray(depois.auditoria)) depois.auditoria = Array.isArray(antes.auditoria) ? antes.auditoria.slice() : [];
  depois.auditoria.push({ em: stamp, por: editor, usuario_id: user.usuario_id || '', alteracoes: alteracoes });
  if (depois.auditoria.length > 40) depois.auditoria = depois.auditoria.slice(-40);
  logAudit_(user, 'TRIAGEM_CORRIGIDA', 'ATENDIMENTOS', payload.atendimento.atendimento_id, { responsavel_triagem: responsavel }, { alteracoes: alteracoes, request_id: requestId }, 'OK', userAgent, '');
}

// Fonte unica da equipe cirurgica. A versao anterior somava os campos
// estruturados COM o campo legado ja concatenado, e a deduplicacao por
// igualdade exata nao removia nada: o PDF assinado imprimia "A; B; A; B"
// (correcao 2).
function equipeCirurgica_(pr) {
  pr = pr || {};
  var lista = [pr.cirurgiao_1, pr.cirurgiao_2, pr.cirurgiao_3, pr.cirurgiao_4, pr.cirurgiao_5]
    .map(function (v) { return String(v || '').trim(); })
    .filter(Boolean);
  if (!lista.length && pr.cirurgiao) {
    lista = String(pr.cirurgiao).split(/\s*;\s*/).map(function (v) { return v.trim(); }).filter(Boolean);
  }
  var vistos = {};
  return lista.filter(function (nome) {
    var chave = normalizeKey_(nome);
    if (!chave || vistos[chave]) return false;
    vistos[chave] = true;
    return true;
  });
}

function gerarAlertasServidor_(payload, user) {
  payload = normalizePayload_(payload);
  var alertas = [];
  var p = payload.paciente || {};
  var pr = payload.procedimento || {};
  var t = payload.triagem || {};
  var pre = payload.preop || {};
  var via = payload.viaAerea || {};
  var cond = payload.conduta || {};
  var sistemas = payload.sistemas || {};
  var intra = payload.intraop || {};
  var srpa = payload.srpa || {};
  var idade = Number(p.idade || calcAge_(p.nascimento) || 0);
  var potencial = String(p.potencial_gestacional || '').toUpperCase();
  var sexo = String(p.sexo || '').toUpperCase();
  var asa = String(pre.asa || '').toUpperCase();
  var mallampati = String(via.mallampati || '').toUpperCase();
  var stopBang = Array.isArray(payload.riscos.stop_bang) ? payload.riscos.stop_bang.length : 0;
  var rcri = Array.isArray(payload.riscos.rcri) ? payload.riscos.rcri.length : 0;
  var spo2 = Number(String(t.spo2 || '').replace(',', '.'));

  function add(id, tipo, texto, categoria) {
    alertas.push({ id: id, tipo: tipo, texto: texto, categoria: categoria || 'DOCUMENTACAO' });
  }

  if (!p.nome) add('PACIENTE_NOME', 'danger', 'Nome do paciente ausente.', 'IDENTIFICACAO');
  if (!pr.nome) add('PROCEDIMENTO_AUSENTE', 'warn', 'Procedimento proposto não informado.', 'PROCEDIMENTO');
  else {
    try {
      // v19.10: mesma classificação da tela (aba PROCEDIMENTOS); inferência só como reserva.
      var itensProc = String(pr.nome).split(/\s*\+\s*/).filter(Boolean).map(function (nome) { return clavItemProcServidor_(nome); });
      var sugLat = clavSugestaoProcedimentos_(itensProc).lat;
      var latAtual = tokenClav_(String(pr.lateralidade || ''));
      var semLado = (!latAtual || latAtual === 'não se aplica' || latAtual === 'nao se aplica');
      var ladoDefinido = (latAtual === 'direita' || latAtual === 'esquerda');
      var bilateral = (latAtual === 'bilateral');
      if (sugLat === 'SIDE' && semLado) add('LATERALIDADE_AUSENTE', 'warn', 'Procedimento com lateralidade (direita/esquerda): informe o lado operado.', 'PROCEDIMENTO');
      // v19.10: "Bilateral" num procedimento sem lado no catálogo (ex.: ooforectomia
      // bilateral) é aviso de conferência, não alerta grave que exige ciência.
      if (sugLat === 'NA' && bilateral) {
        add('LATERALIDADE_BILATERAL_CONFERIR', 'warn',
          'Procedimento sem lateralidade no catálogo registrado como "Bilateral". Confirme o procedimento e o lado antes do time out.',
          'PROCEDIMENTO');
      }
      // v19.3. A regra inversa faltava: procedimento de linha média ou de órgão
      // único (hérnia umbilical, colecistectomia, histerectomia) gravado COM
      // lado. É a discordância que antecede cirurgia em sítio errado — a mesma
      // que apareceu na ficha revisada em 07/09/2026 ("Hernioplastia Umbilical /
      // Direita", com ultrassom descrevendo hérnia INGUINAL à direita).
      if (sugLat === 'NA' && ladoDefinido) {
        add('LATERALIDADE_INDEVIDA', 'danger',
          'Procedimento sem lateralidade anatômica registrado como "' + pr.lateralidade + '". ' +
          'Confirme o procedimento e o lado antes do time out: nomes parecidos (umbilical x inguinal) mudam o sítio cirúrgico.',
          'PROCEDIMENTO');
      }
    } catch (ignoredLat) {}
  }
    var nascIso = String(p.nascimento || '').slice(0, 10);
  if (nascIso) {
    var hojeIso = Utilities.formatDate(new Date(), CLAV.TZ, 'yyyy-MM-dd');
    if (nascIso > hojeIso) {
      add('DATA_NASCIMENTO_FUTURA', 'danger', 'Data de nascimento informada está no futuro (' + fmtDataBR_(nascIso) + '). Corrija o cadastro do paciente.', 'IDENTIFICACAO');
    }
  }
  if (!t.pa || !t.fc || !t.spo2 || !t.peso || !t.altura) add('TRIAGEM_INCOMPLETA', 'warn', 'Triagem incompleta: PA, FC, SpO2, peso ou altura ausentes.', 'TRIAGEM');
  if (!t.fr) add('FR_AUSENTE', 'warn', 'Frequência respiratória não registrada.', 'TRIAGEM');
  // v19.9: a escala de dor por faces fica no bloco médico; o aviso só faz sentido
  // para quem pode preenchê-la (a técnica recebia o alerta sem campo na tela).
  if (isMedical_(user) && idade > 0 && idade < 12 && !t.dor_faces && !t.dor) add('DOR_PEDIATRICA_AUSENTE', 'warn', 'Escala de dor pediátrica por faces não registrada na avaliação pré-anestésica.', 'PEDIATRIA');
  // CORRECAO 18. A regra anterior (if (spo2 && ...)) deixava passar SpO2 = 0,
  // divergindo da tela, que alertava. Agora ambas usam o mesmo teste numerico.
  if (!isNaN(spo2) && String(t.spo2 || '').trim() !== '' && spo2 < 92) add('SPO2_BAIXA', 'danger', 'SpO2 inferior a 92%. Confirmar medida e registrar avaliação e conduta.', 'SINAIS_VITAIS');
  // v19.9: qualquer sinal vital fora da faixa gera alerta (antes só SpO2 < 92).
  // Usa o mesmo classificador da tela e do 99_Diagnostico: PA 180/80, FC 130,
  // FR 30 e Temp 39,1 chegam ao painel, à lista, ao dashboard e à ciência do médico.
  try {
    var svResultado = classificarSinaisVitais_(t, idade > 0 ? idade : '', FAIXAS_SV_CLAV);
    (svResultado.achados || []).forEach(function (ac) {
      if (!ac || (ac.status !== 'critico' && ac.status !== 'atencao')) return;
      if (ac.chave === 'spo2' && !isNaN(spo2) && spo2 < 92) return; // já coberto por SPO2_BAIXA
      add('SV_' + String(ac.chave || '').toUpperCase() + '_' + (ac.status === 'critico' ? 'CRITICO' : 'ATENCAO'),
        ac.status === 'critico' ? 'danger' : 'warn',
        (ac.status === 'critico' ? 'Sinal vital fora da faixa: ' : 'Sinal vital em atenção: ') + ac.texto + (ac.motivo ? ' (' + ac.motivo + ')' : '') +
          (ac.status === 'critico' ? '. Conferir a aferição e registrar a conduta.' : '. Reavaliar e registrar.'),
        'SINAIS_VITAIS');
    });
  } catch (ignoredSv) {}

  if (isMedical_(user)) {
    // CORRECAO 18. Estava fora do bloco medico e disparava tambem para perfis
    // operacionais, divergindo da tela.
    if (!pre.anestesiologista && !payload.atendimento.anestesiologista) add('ANESTESIOLOGISTA_AUSENTE', 'danger', 'Anestesiologista responsável não definido. Obrigatório pela Resolução CFM nº 2.174/2017.', 'RESPONSABILIDADE');
    if (!pre.asa) add('ASA_AUSENTE', 'warn', 'Classificação ASA não registrada.', 'RISCO');
    if (asa.indexOf('ASA IV') >= 0 || asa.indexOf('ASA V') >= 0) add('ASA_ALTO_RISCO', 'danger', 'Classificação ' + pre.asa + ': confirmar planejamento, ambiente, monitorização e destino pós-operatório.', 'RISCO');
    if (!via.mallampati) add('MALLAMPATI_AUSENTE', 'danger', 'Via aérea sem classificação de Mallampati.', 'VIA_AEREA');
    if (mallampati === 'IV') add('MALLAMPATI_IV', 'danger', 'Mallampati IV: registrar estratégia de via aérea e recursos de resgate.', 'VIA_AEREA');
    if (!via.abertura_oral) add('ABERTURA_ORAL_AUSENTE', 'warn', 'Abertura oral não registrada.', 'VIA_AEREA');
    if (!via.protrusao_mandibular) add('PROTRUSAO_MANDIBULAR_AUSENTE', 'warn', 'Protrusão mandibular não registrada.', 'VIA_AEREA');
    if (!via.mobilidade_cervical) add('MOBILIDADE_CERVICAL_AUSENTE', 'warn', 'Mobilidade cervical não registrada.', 'VIA_AEREA');
    if (!via.distancia_tireomentoniana) add('DTM_AUSENTE', 'warn', 'Distância tireomentoniana não registrada.', 'VIA_AEREA');
    if (!via.circunferencia_cervical) add('CIRCUNFERENCIA_CERVICAL_AUSENTE', 'warn', 'Circunferência cervical não registrada.', 'VIA_AEREA');
    // CORRECAO 18. As tres regras abaixo ignoravam os campos estruturados que a
    // tela usa (situacao da ausculta e itens de alergia). O resultado era a tela
    // mostrar "Documentacao adequada" enquanto a planilha gravava pendencias.
    if (!payload.exame.ausculta_pulmonar_status && !payload.exame.ausculta_pulmonar) add('AUSCULTA_PULMONAR_AUSENTE', 'warn', 'Ausculta pulmonar não registrada.', 'EXAME_FISICO');
    if (String(payload.exame.ausculta_pulmonar_status || '') === 'Com alterações' && !String(payload.exame.ausculta_pulmonar || '').trim()) add('AUSCULTA_PULMONAR_SEM_DESCRICAO', 'warn', 'Ausculta pulmonar marcada como com alterações sem descrição do achado.', 'EXAME_FISICO');
    if (!payload.exame.ausculta_cardiaca_status && !payload.exame.ausculta_cardiaca) add('AUSCULTA_CARDIACA_AUSENTE', 'warn', 'Ausculta cardíaca não registrada.', 'EXAME_FISICO');
    if (String(payload.exame.ausculta_cardiaca_status || '') === 'Com alterações' && !String(payload.exame.ausculta_cardiaca || '').trim()) add('AUSCULTA_CARDIACA_SEM_DESCRICAO', 'warn', 'Ausculta cardíaca marcada como com alterações sem descrição do achado.', 'EXAME_FISICO');
    if (!payload.anamnese.alergias && !(payload.anamnese.alergias_itens || []).length) add('ALERGIAS_AUSENTES', 'warn', 'Alergias não registradas.', 'ANAMNESE');
    // O campo "Jejum" saiu do cabeçalho do pré-anestésico; a orientação de jejum
    // agora vive no Plano de Jejum e Orientações e na prescrição pré-pronta.
    if (!pr.risco_cirurgico) add('RISCO_PROCEDIMENTO_AUSENTE', 'warn', 'Risco do procedimento cirúrgico não classificado.', 'ESTRATIFICACAO_RISCO');
    if (!pre.estratificacao_risco_paciente) add('RISCO_PACIENTE_AUSENTE', 'warn', 'Estratificação global do risco do paciente não registrada.', 'ESTRATIFICACAO_RISCO');
    // Revisão por sistemas em branco deixou de gerar alerta: situação vazia
    // agora sai na impressão como "Sem alterações" (decisão da equipe).
    if (idade >= 18 || idade === 0) {
      if (stopBang >= 5) add('STOP_BANG_ALTO', 'danger', 'STOP-Bang com ' + stopBang + ' critérios: risco elevado para apneia obstrutiva do sono.', 'RISCO_RESPIRATORIO');
      else if (stopBang >= 3) add('STOP_BANG_INTERMEDIARIO', 'warn', 'STOP-Bang com ' + stopBang + ' critérios: revisar risco respiratório e plano de monitorização.', 'RISCO_RESPIRATORIO');
      if (rcri >= 3) add('RCRI_ELEVADO', 'danger', 'RCRI com ' + rcri + ' critérios: risco cardiovascular elevado, exigir planejamento documentado.', 'RISCO_CARDIOVASCULAR');
    } else {
      var respTexto = tokenClav_(String(sistemas.respiratorio || ''));
      if (respTexto.indexOf('ronco') >= 0 || respTexto.indexOf('apneia') >= 0 || respTexto.indexOf('hipertrofia') >= 0) {
        add('SAOS_PEDIATRICA_SUSPEITA', 'warn', 'Paciente pediátrico com história de ronco/pausas/hipertrofia adenoamigdaliana: risco respiratório aumentado; atentar para sensibilidade a opioides.', 'PEDIATRIA');
      }
    }
    if (!cond.conclusao) add('CONCLUSAO_AUSENTE', 'danger', 'Conclusão e conduta final ausentes.', 'CONDUTA');

    var intraRows = Array.isArray(intra.sinais) ? intra.sinais : [];
    var intraStarted = !!(intra.inicio_anestesia || intraRows.length || normalizeKey_(payload.atendimento.status || '') === 'intraoperatorio');
    if (intraStarted && !String(intra.anestesiologistas_responsaveis || '').trim()) add('INTRA_RESPONSAVEL_AUSENTE', 'danger', 'Registro intraoperatório sem anestesiologista responsável identificado.', 'RESPONSABILIDADE_INTRAOPERATORIA');
    if (intraStarted && !String(intra.monitorizacao || '').trim() && !(intra.monitorizacao_itens || []).length) add('INTRA_MONITORIZACAO_AUSENTE', 'warn', 'Recursos de monitorização intraoperatória não registrados.', 'MONITORIZACAO');
    var commonInterval = maximumIntervalMinutes_(intraRows, function (row) { return ['pa', 'fc', 'spo2', 'etco2', 'temp', 'bis'].some(function (key) { return String(row[key] || '').trim(); }); });
    if (commonInterval > 10) add('INTRA_INTERVALO_SUPERIOR_10', 'danger', 'Monitorização intraoperatória com intervalo máximo de ' + commonInterval + ' minutos. Os parâmetros seriados usuais devem ser registrados em intervalos não superiores a 10 minutos.', 'MONITORIZACAO');
    var invasiveInterval = maximumIntervalMinutes_(intraRows, function (row) { return ['pam', 'pvc', 'ic', 'vs', 'vvs', 'delta_pp', 'outros'].some(function (key) { return String(row[key] || '').trim(); }); });
    if (invasiveInterval > 15) add('INTRA_INVASIVA_INTERVALO_SUPERIOR_15', 'danger', 'Dados hemodinâmicos invasivos com intervalo máximo de ' + invasiveInterval + ' minutos. O limite documental é de 15 minutos.', 'MONITORIZACAO_HEMODINAMICA');

    var srpaRows = Array.isArray(srpa.sinais) ? srpa.sinais : [];
    var srpaStarted = !!(srpa.admissao || srpaRows.length || normalizeKey_(payload.atendimento.status || '') === 'srpa');
    if (srpaStarted && !String(srpa.anestesiologistas_responsaveis || '').trim()) add('SRPA_RESPONSAVEL_AUSENTE', 'danger', 'Recuperação pós-anestésica sem anestesiologista responsável identificado.', 'RESPONSABILIDADE_SRPA');
    if (srpaStarted && !String(srpa.monitorizacao || '').trim()) add('SRPA_MONITORIZACAO_AUSENTE', 'warn', 'Recursos de monitorização da SRPA não registrados.', 'MONITORIZACAO_SRPA');
    if (srpaStarted && !srpaRows.length) add('SRPA_SERIADO_AUSENTE', 'warn', 'SRPA iniciada sem avaliações seriadas estruturadas.', 'MONITORIZACAO_SRPA');
    var srpaInterval = maximumIntervalMinutes_(srpaRows);
    if (srpaInterval > 15) add('SRPA_INTERVALO_SUPERIOR_15', 'danger', 'Avaliações da SRPA com intervalo máximo de ' + srpaInterval + ' minutos. Na primeira hora, o limite documental é de 15 minutos.', 'MONITORIZACAO_SRPA');
  }

  var betaSituacao = situacaoBetaHcg_(payload);
  var betaResolvido = String(payload.seguranca.beta_hcg_resultado || '').trim() !== ''
    || String(payload.seguranca.beta_hcg_justificativa || '').trim() !== ''
    || String(payload.seguranca.beta_hcg_status || '').toUpperCase().indexOf('REALIZADO') >= 0
    || String(payload.seguranca.beta_hcg_status || '').toUpperCase().indexOf('DISPENSAD') >= 0;
  if (isMedical_(user) && betaSituacao.aplica && !betaResolvido) {
    add('BETA_HCG_PENDENTE', 'warn', 'Segurança reprodutiva: registrar resultado do Beta-HCG ou a justificativa clínica de dispensa ao final da consulta.', 'SEGURANCA_REPRODUTIVA');
  }
  if (protecaoMenorAtiva_(payload) && protecaoMenorPendente_(payload)) {
    add('PROTECAO_MENOR_14', 'danger', 'Paciente do sexo feminino com menos de 14 anos e Beta-HCG positivo. Há presunção legal de violência sexual e a notificação é compulsória. Registre a ciência das autoridades, o órgão acionado e o protocolo, ou comunique imediatamente o Conselho Tutelar e a autoridade policial.', 'PROTECAO_CRIANCA_ADOLESCENTE');
  }
  if (String(payload.seguranca.alerta_cadastro_inclusivo || '').toUpperCase() === 'SIM') {
    add('CADASTRO_INCLUSIVO', 'danger', 'A retirada de nome de uso e da informação reprodutiva clinicamente necessária pode causar identificação inadequada, constrangimento e falha de segurança.', 'INCLUSAO');
  }

  // NOVO: interações medicamentosas e duplicidades terapêuticas relevantes no
  // perioperatório (ex.: enalapril + losartana). Só para o corpo médico.
  if (isMedical_(user)) {
    interacoesMedicamentosas_(payload).forEach(function (item) {
      add(item.id, item.tipo, item.texto, 'INTERACAO_MEDICAMENTOSA');
    });
  }
  return alertas;
}

/* =====================================================================
 * INTERAÇÕES MEDICAMENTOSAS E DUPLICIDADES TERAPÊUTICAS
 * ---------------------------------------------------------------------
 * Motor declarativo compartilhado por tela e servidor. Lê as medicações em
 * uso (anamnese.medicacoes) e as medicações do período de internação
 * (conduta.medicacoes_internacao), identifica a CLASSE de cada item e
 * dispara as combinações clinicamente relevantes no perioperatório.
 *
 * O caso que motivou o módulo: enalapril + losartana (IECA + BRA) é dupla
 * inibição do SRAA e não gerava nenhum alerta.
 *
 * Cada regra devolve: id, tipo (danger/warn), título, o que foi detectado
 * (com os nomes exatos digitados) e a conduta perioperatória sugerida.
 * ===================================================================== */
