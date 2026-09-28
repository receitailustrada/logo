/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 21_PDF_Secoes.gs
 * Conteúdo dos documentos: seções, narrativa, assinatura e Drive
 *
 * Conteúdo: buildPdfSections_, relatorioNarrativoServidor_, assinatura e pastas do Drive.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function buildPdfSections_(payload, tipo, user) {
  payload = normalizePayload_(payload);
  tipo = normalizeDocumentType_(tipo);
  var p = payload.paciente || {}, a = payload.atendimento || {}, pr = payload.procedimento || {};
  var t = payload.triagem || {}, pre = payload.preop || {}, an = payload.anamnese || {};
  var sis = payload.sistemas || {}, ex = payload.exame || {}, via = payload.viaAerea || {}, cond = payload.conduta || {};
  var calc = payload.calculos || {};
  var sections = [];
  var equipe = equipeCirurgica_(pr);
  var idadeTexto = calc.idade_formatada || idadeFormatada_(p.nascimento, p.idade);
  var tipoCirurgia = pr.tipo_cirurgia && tokenClav_(pr.tipo_cirurgia) !== 'nao se aplica' ? pr.tipo_cirurgia : '';

  // Identificação: CPF, telefone e e-mail NUNCA saem na impressão.
  // v19.11 (pedido D3 da equipe): cabeçalho fixo em 3 linhas × 4 colunas, nome em
  // caixa alta, sem data de nascimento; só "Data da consulta", "Data da cirurgia" e
  // "Prontuário" levam rótulo. Célula vazia sai com traço (a grade não reflui).
  var nomeCab = String(p.nome || p.nome_preferido || '').trim().toUpperCase();
  if (nomeCab && String(p.nome_preferido || '').trim() && tokenClav_(p.nome_preferido) !== tokenClav_(p.nome)) nomeCab += ' (uso: ' + String(p.nome_preferido).trim() + ')';
  var dataConsulta = fmtDataBR_(String(pre.data_avaliacao || '').slice(0, 10)) || fmtDataBR_(String(a.data_consulta || '').slice(0, 10));
  var procCab = [pr.nome, tipoCirurgia].filter(Boolean).join(' — ');
  var cirurgiaoCab = equipe.length ? equipe.join('; ') : '';
  pushGridSection_(sections, 'IDENTIFICAÇÃO DO PACIENTE E DO PROCEDIMENTO', 4, [
    gif_('', nomeCab, 1, 'nome', true), gif_('', idadeTexto, 1, '', true), gif_('', p.sexo, 1, '', true), gif_('Data da consulta', dataConsulta, 1, '', true),
    gif_('', procCab, 1, '', true), gif_('', pr.lateralidade, 1, '', true), gif_('', a.convenio, 1, '', true), gif_('Data da cirurgia', fmtDataBR_(pr.data_cirurgia || a.data_cirurgia), 1, '', true),
    gif_('', cirurgiaoCab, 1, '', true), gif_('', a.local || pr.local, 1, '', true), gif_('', pr.carater, 1, '', true), gif_('Prontuário', p.prontuario, 1, '', true),
    (String(pr.diagnostico || '').trim() ? gi_('Diagnóstico cirúrgico (registro anterior)', pr.diagnostico, 'full') : null),
    (String(pr.observacoes || '').trim() ? gi_('Observações do procedimento (registro anterior)', pr.observacoes, 'full') : null)
  ], { fixo: true });

  // v19.11 (pedido D4): valores em linha ("PA: 120/80 mmHg"), duas linhas de quatro,
  // fonte maior; "Responsável pela triagem" saiu da impressão.
  pushGridSection_(sections, 'TRIAGEM, SINAIS VITAIS E DADOS ANTROPOMÉTRICOS', 4, [
    gif_('PA', unitValue_(t.pa, 'mmHg'), 1, '', true), gif_('FC', unitValue_(t.fc, 'bpm'), 1, '', true), gif_('FR', unitValue_(t.fr, 'irpm'), 1, '', true), gif_('SpO2', unitValue_(t.spo2, '%'), 1, '', true),
    gif_('Temperatura', unitValue_(t.temperatura, '°C'), 1, '', true), gif_('Peso', unitValue_(t.peso, 'kg'), 1, '', true),
    gif_('Altura', unitValue_(t.altura, Number(String(t.altura || '').replace(',', '.')) > 3 ? 'cm' : 'm'), 1, '', true),
    gif_('IMC', [calc.imc, calc.imc_classe].filter(Boolean).join(' / '), 1, '', true),
    // v19.9: a classificação por faixas (a mesma da tela) sai no documento.
    gi_('Classificação dos sinais vitais', (function () {
      try {
        var svc = t.sv_classificacao && typeof t.sv_classificacao === 'object' ? t.sv_classificacao : null;
        if (svc && svc.texto) return String(svc.titulo ? svc.titulo + ' — ' : '') + svc.texto;
        var r = classificarSinaisVitais_(t, (calc.idade_formatada ? '' : (p.idade || '')) || (idadeDoPaciente_(payload) === null ? '' : idadeDoPaciente_(payload)), FAIXAS_SV_CLAV);
        return r && r.texto ? (r.titulo ? r.titulo + ' — ' : '') + r.texto : '';
      } catch (ignoredSv) { return ''; }
    })(), 'full'),
    gi_('Observação da triagem', t.observacao, 'full')
  ], { fixo: true });

  if (tipo === 'OPERACIONAL') return sections;

  if (tipo === 'PEDIDOS') return sections.concat(secoesPedidos_(payload));

  if (tipo === 'AVALIACAO_PRE_ANESTESICA' || tipo === 'RELATORIO_NARRATIVO') {
    // v19.11 (pedido D5): o bloco "Consulta pré-anestésica" foi desfeito — a data
    // virou "Data da consulta" no cabeçalho, a dor foi para o Exame físico, o TCLE
    // para a Conduta e o "Beta-HCG conferido" para a segurança reprodutiva.
    // v19.11 (pedido D2): antecedentes sempre impressos, com texto padrão quando vazios.
    pushGridSection_(sections, 'ANTECEDENTES E HISTÓRIA CLÍNICA', 2, [
      gi_('Cirurgias e procedimentos prévios', valorOuPadrao_((an.cirurgias_previas || []).join('; '), 'cirurgias'), 'full'),
      gi_('Ano/época e detalhes das cirurgias prévias', valorOuPadrao_(an.cirurgias_previas_outros, 'cirurgias_detalhes'), 'full'),
      gi_('Complicações anestésicas pessoais prévias', valorOuPadrao_([complicacoesImpressao_(an.compl_anestesicas_pessoais, an.historia_anestesica), (an.compl_anestesicas_tipos || []).length ? 'Anestesia(s) relacionada(s): ' + an.compl_anestesicas_tipos.join('; ') : ''].filter(Boolean).join('. '), 'compl_pessoais'), 'full'),
      gi_('Complicações anestésicas familiares', valorOuPadrao_([complicacoesImpressao_(an.compl_anestesicas_familiares, an.familiar), an.compl_familiares_parentesco ? 'Parentesco: ' + an.compl_familiares_parentesco : ''].filter(Boolean).join('. '), 'compl_familiares'), 'full'),
      gi_('Medicações em uso atual/recente', valorOuPadrao_(an.medicacoes, 'medicacoes'), 'full'),
      gi_('Protocolo GLP-1 (canetas emagrecedoras)', valorOuPadrao_(resumoGlp1_(payload), 'glp1'), 'full'),
      // v19.3. O realce vermelho passou a depender de HAVER alergia. Antes ele
      // disparava pelo campo existir, e "Nega alergias" saía destacado como se
      // fosse um alerta — invertendo a leitura de quem confere o papel.
      gi_('Alergias', valorOuPadrao_(complicacoesImpressao_(an.alergias_itens, an.alergias), 'alergias'), 'full',
          temAlergiaReal_(complicacoesImpressao_(an.alergias_itens, an.alergias)) ? 'alergia' : ''),
      gi_('Hábitos', valorOuPadrao_(habitosImpressao_(payload), 'habitos'), 'full'),
      gi_('Contexto clínico relevante', p.contexto_cuidado, 'full')
    ]);

    // Exames complementares na PRIMEIRA folha (logo após a história clínica).
    // v19.11 (pedido D7): valor em linha ("Hemoglobina: 14,3 g/dL"), fonte maior, até 4 colunas.
    var examItems = examTableRows_(payload.exames).map(function (row) {
      var span = row[0] === 'Outros exames' ? 'full' : 1;
      return span === 'full' ? gi_(row[0], row[1], 'full') : gil_(row[0], row[1], row[2], 1);
    }).filter(Boolean);
    if (String((payload.exames || {}).creatinina || '').trim() && calc.clearance_texto) {
      var posCreat = -1;
      examItems.forEach(function (item, idx) { if (item && item[0] === 'Creatinina') posCreat = idx; });
      var clcrItem = gil_('Clearance de creatinina', String(calc.clearance_cockcroft || calc.clearance_texto || '').replace(/\s*mL\/min.*$/i, ''), 'mL/min', 1);
      if (posCreat >= 0) examItems.splice(posCreat + 1, 0, clcrItem); else examItems.push(clcrItem);
    }
    pushGridSection_(sections, 'EXAMES COMPLEMENTARES', 4, examItems);

    var esforcos = ['Dispneia: ' + String(sis.dispneia_esforco || '').trim(), 'Cansaço/fadiga: ' + String(sis.cansaco_esforco || '').trim(), 'Precordialgia/angina: ' + String(sis.precordialgia_esforco || '').trim()]
      .filter(function (x) { return !/:\s*$/.test(x); }).join(' · ');
    // A segurança reprodutiva/Beta-HCG imprime aqui, ao lado do ginecológico
    // (saiu do bloco de conduta, a pedido da equipe), agora incluindo a DUM e
    // (v19.11) a conferência médica do Beta-HCG.
    var betaConferido = [fmtIsoBR_(payload.seguranca.beta_hcg_conferido_em), payload.seguranca.beta_hcg_conferido_por].filter(Boolean).join(' — ');
    var segReprodutiva = [payload.seguranca.beta_hcg_status, fmtDataBR_(payload.seguranca.beta_hcg_data), payload.seguranca.beta_hcg_resultado, payload.seguranca.dum ? 'DUM: ' + fmtDataBR_(payload.seguranca.dum) : '', payload.seguranca.beta_hcg_observacao, payload.seguranca.beta_hcg_justificativa, betaConferido ? 'Conferido: ' + betaConferido : ''].filter(Boolean).join(' / ');
    var antesRevisao = sections.length;
    pushGridSection_(sections, 'REVISÃO POR SISTEMAS', 2, [
      gi_('Cardiovascular', sistemaImpressao_(sis.cardiovascular_status, sis.cardio_itens, sis.cardiovascular, true), 1),
      gi_('Sintomas aos esforços', esforcos, 1),
      // v19.9: campos estruturados (IVAS, transfusão, AVC, plegia) impressos como na prévia da tela.
      gi_('Respiratório', sistemaImpressao_(sis.respiratorio_status, sis.resp_itens, [sis.respiratorio, sis.resp_ivas_dias ? 'IVAS há ' + sis.resp_ivas_dias + ' dia(s)' : '', sis.resp_ivas_tratamento ? 'tratamento: ' + sis.resp_ivas_tratamento : ''].filter(Boolean).join('; '), true), 1),
      gi_('Renal / urológico', sistemaImpressao_(sis.renal_urologico_status, sis.renal_itens, sis.renal_urologico, true), 1),
      gi_('Gastrointestinal / hepático', sistemaImpressao_(sis.gastro_hepatico_status, sis.gastro_itens, sis.gastro_hepatico, false), 1),
      gi_('Endócrino / metabólico', sistemaImpressao_(sis.endocrino_metabolico_status, sis.endocrino_itens, sis.endocrino_metabolico, true), 1),
      gi_('Hematológico', sistemaImpressao_(sis.hematologico_status, (sis.hemato_itens || []).concat(sis.hemato_coagulacao_itens || []), [sis.hematologico, sis.hemato_transfusao_tempo ? 'transfusão há ' + sis.hemato_transfusao_tempo : ''].filter(Boolean).join('; '), true), 1),
      gi_('Neurológico / psiquiátrico', sistemaImpressao_(sis.neuro_psiquiatrico_status, sis.neuro_itens, [sis.neuro_psiquiatrico, sis.neuro_avc_tempo ? 'AVC há ' + sis.neuro_avc_tempo : '', sis.neuro_avc_sequela ? 'sequela: ' + sis.neuro_avc_sequela : '', sis.neuro_plegia_local ? 'plegia/paresia em ' + sis.neuro_plegia_local : ''].filter(Boolean).join('; '), true), 1),
      gi_('Musculoesquelético', sistemaImpressao_(sis.musculoesqueletico_status, sis.musculo_itens, sis.musculoesqueletico, true), 1),
      gi_('Outros sistemas', sistemaImpressao_(sis.outros_status, [], sis.outros, true), 1),
      // v19.9: como na prévia, a linha ginecológica só entra quando há conteúdo
      // próprio ou quando o sexo/potencial gestacional a torna pertinente (saía
      // "Sem alterações" em paciente masculino).
      (function () {
        var sexo = tokenClav_(String(p.sexo || ''));
        var gestacional = tokenClav_(String(p.potencial_gestacional || '')).replace(/\s+/g, '');
        var preenchido = String(sis.gineco_obstetrico || '').trim() ||
          (String(sis.gineco_obstetrico_status || '').trim() && tokenClav_(sis.gineco_obstetrico_status).replace(/\s+/g, '') !== 'semalteracoes');
        var pertinente = preenchido || sexo === 'feminino' || sexo === 'intersexo' ||
          (gestacional && gestacional !== 'nao' && gestacional !== 'naoseaplica');
        if (!pertinente) return null;
        return gi_('Ginecológico / obstétrico', sistemaImpressao_(sis.gineco_obstetrico_status, [], sis.gineco_obstetrico, true), 1);
      })(),
      gi_('Beta-HCG / segurança reprodutiva', segReprodutiva, 1)
    ]);
    // Quebra de página fixa: a segunda folha sempre começa na Revisão por
    // Sistemas (identificação, triagem, história e exames ficam na primeira folha).
    if (sections.length > antesRevisao) sections[sections.length - 1].pageBreakBefore = true;

    var respiracaoExame = [ex.respiracao, ex.respiracao_tipo].filter(Boolean).join(' — ');
    var cianoseExame = [ex.cianose, ex.cianose_tipo].filter(Boolean).join(' — ');
    // v19.11 (pedidos C2/D5): a escala de dor imprime dentro do Exame físico.
    pushGridSection_(sections, 'EXAME FÍSICO', 4, [
      gi_('Estado geral', ex.estado_geral, 1), gi_('Cor', ex.cor, 1), gi_('Hidratação', ex.hidratacao, 1),
      gi_('Cianose', cianoseExame, 1), gi_('Icterícia', ex.ictericia, 1), gi_('Respiração', respiracaoExame, 1),
      gi_('Ausculta cardíaca', auscultaImpressao_(ex.ausculta_cardiaca_status, ex.ausculta_cardiaca), 1),
      gi_('Ausculta pulmonar', auscultaImpressao_(ex.ausculta_pulmonar_status, ex.ausculta_pulmonar), 1),
      gil_('Escala de dor (0 a 10)', t.dor, '', 1),
      gil_('Escala de faces pediátrica', t.dor_faces, '', 1),
      (String(ex.coloracao || '').trim() ? gi_('Coloração/hidratação (registro anterior)', ex.coloracao, 2) : null),
      gi_('Outros achados do exame físico', ex.observacoes, 'full')
    ]);

    var denticao = (via.denticao_itens || []).join('; ') || via.denticao;
    // v19.11 (pedidos D2/D7): Mallampati sempre impresso (traço para preencher à mão);
    // distância tireomentoniana e circunferência cervical em linha, fonte maior.
    pushGridSection_(sections, 'VIA AÉREA', 4, [
      gi_('Mallampati', valorOuPadrao_(via.mallampati, 'mallampati'), 1, 'mallampati'), gi_('Abertura oral', via.abertura_oral, 1),
      gi_('Protrusão mandibular', via.protrusao_mandibular, 1), gi_('Mobilidade cervical', via.mobilidade_cervical, 1),
      gil_('Distância tireomentoniana', via.distancia_tireomentoniana, 'cm', 1),
      gil_('Circunferência cervical', via.circunferencia_cervical, 'cm', 1),
      gi_('Dentição e próteses', denticao, 2),
      gi_('Outros achados da via aérea', via.observacoes, 'full')
    ]);

    // Score CLAV retirado da impressão (segue calculado e visível na tela).
    // v19.11 (pedido D9): a capacidade funcional foi para a linha da estratificação.
    pushGridSection_(sections, 'ESCORES DE RISCO', 3, [
      gi_('RCRI (Índice de Lee)', calc.rcri, 1), gi_('STOP-Bang', calc.stop_bang, 1), gi_('Caprini', calc.caprini, 1)
    ]);

    // Resumo consolidado dos antecedentes logo antes da estratificação
    // (posição pedida pela equipe: é a síntese da avaliação). v19.11: texto padrão quando vazio.
    pushGridSection_(sections, 'ANTECEDENTES PRINCIPAIS', 1, [
      gi_('Resumo consolidado', valorOuPadrao_(an.antecedentes_texto, 'antecedentes'), 'full')
    ]);

    // v19.11 (pedido D9): uma linha fixa "Capacidade funcional – ASA – Risco do
    // procedimento – Estratificação global", ASA impresso mesmo em branco.
    pushGridSection_(sections, 'ESTRATIFICAÇÃO FINAL / ASA', 4, [
      gif_('Capacidade funcional', pre.mets, 1, 'capacidade'),
      gif_('ASA', valorOuPadrao_(pre.asa, 'asa'), 1, 'asa'),
      gif_('Risco do procedimento cirúrgico', pr.risco_cirurgico, 1),
      gif_('Estratificação global do risco do paciente', pre.estratificacao_risco_paciente, 1)
    ], { fixo: true });

    // Interações medicamentosas: entra logo antes da conduta, porque é o que
    // deve orientar a decisão registrada em seguida.
    var linhasInteracao = interacoesParaImpressao_(payload);
    if (linhasInteracao.length) {
      sections.push({
        title: 'INTERAÇÕES MEDICAMENTOSAS E DUPLICIDADES TERAPÊUTICAS',
        headers: ['Gravidade', 'Interação identificada', 'Medicamentos', 'Conduta perioperatória sugerida'],
        widths: [52, 148, 128, 227],
        rows: linhasInteracao
      });
    }

    pushGridSection_(sections, 'CONDUTA, PLANO E SEGURANÇA', 3, [
      gi_('Conclusão', cond.conclusao, 1), gi_('Anestesia proposta', cond.anestesia_proposta, 1), gi_('TCLE', cond.tcle, 1),
      gi_('Solicitações, avaliações complementares e pareceres', cond.solicitacoes, 'full'),
      gi_('Observações finais para o bloco cirúrgico', cond.prescricao_pre_anestesica, 'full'),
      gi_('Plano de jejum e orientações', cond.plano, 'full'),
      (String(pre.jejum || '').trim() ? gi_('Jejum informado (registro anterior)', pre.jejum, 'full') : null),
      gi_('Alertas graves com ciência registrada', resumoAlertasCientes_(payload.seguranca.alertas_cientes), 'full')
    ]);

    // A tabela de tempos mínimos de jejum deixou de sair na impressão para
    // economizar página; ela permanece na tela do sistema (tabelaJejumRows_
    // segue disponível caso a equipe queira reativar a impressão no futuro).

    if (protecaoMenorAtiva_(payload)) {
      pushGridSection_(sections, 'PROTEÇÃO À CRIANÇA E AO ADOLESCENTE - NOTIFICAÇÃO COMPULSÓRIA', 2, [
        gi_('Ciência das autoridades', payload.seguranca.protecao_menor_ciencia, 1),
        gi_('Órgãos e serviços acionados', (payload.seguranca.protecao_menor_orgaos || []).join('; '), 1),
        gi_('Protocolo / boletim / ofício', payload.seguranca.protecao_menor_protocolo, 1),
        gi_('Data da notificação', fmtDataBR_(payload.seguranca.protecao_menor_data), 1),
        gi_('Profissional responsável pela comunicação', payload.seguranca.protecao_menor_responsavel, 'full'),
        gi_('Conduta adotada', payload.seguranca.protecao_menor_observacoes, 'full')
      ]);
    }
  }

  if (tipo === 'RELATORIO_NARRATIVO') {
    // CORRECAO 21. Antes, gerar o PDF sem passar por "Atualizar prévia" produzia
    // um documento com a frase "Sem texto gerado" no lugar do relatório.
    var textoNarrativo = String(payload.documentos.resumo || payload.documentos.relatorio_narrativo || '').trim() || relatorioNarrativoServidor_(payload, tipo, user);
    sections = [sections[0], { title: 'RELATÓRIO CLÍNICO NARRATIVO', cols: 1, grid: [['Relatório', textoNarrativo, 'full']] }];
  }

  if (tipo === 'FICHA_ANESTESIA' || tipo === 'RECUPERACAO_POS_ANESTESICA') {
    var intraRows = payload.intraop.sinais || [];
    pushGridSection_(sections, 'REGISTRO INTRAOPERATÓRIO', 4, [
      gi_('Anestesiologista(s) responsável(is)', payload.intraop.anestesiologistas_responsaveis, 2),
      gi_('Transferência de responsabilidade', payload.intraop.transferencia_responsabilidade, 2),
      // v19.9: horários em dd/mm/aaaa hh:mm (saíam em ISO "2026-09-27T14:30").
      gi_('Início / fim da anestesia', [payload.intraop.inicio_anestesia, payload.intraop.fim_anestesia].filter(Boolean).map(function (v) { return fmtIsoBR_(v) || v; }).join(' / '), 1),
      gi_('Início / fim da cirurgia', [payload.intraop.inicio_cirurgia, payload.intraop.fim_cirurgia].filter(Boolean).map(function (v) { return fmtIsoBR_(v) || v; }).join(' / '), 1),
      gi_('Técnica anestésica', payload.intraop.tecnica, 1), gi_('Via aérea', payload.intraop.via_aerea, 1),
      gi_('Ventilação', payload.intraop.ventilacao, 1), gi_('Posicionamento', payload.intraop.posicionamento, 1),
      gi_('Acesso venoso / invasivo', payload.intraop.acesso, 1), gi_('Destino pós-operatório', payload.intraop.destino, 1),
      gi_('Monitorização', (payload.intraop.monitorizacao_itens || []).join(', ') || payload.intraop.monitorizacao, 2),
      gi_('Checklist de segurança', ['Sign in: ' + String(payload.intraop.checklist_sign_in || '').trim(), 'Time out: ' + String(payload.intraop.checklist_time_out || '').trim()].filter(function (x) { return !/:\s*$/.test(x); }).join('; '), 2),
      gi_('Intercorrências / eventos / condutas', payload.intraop.intercorrencias, 'full')
    ]);
    if ((payload.intraop.medicacoes || []).length) sections.push({ title: 'MEDICAÇÕES, FLUIDOS E HEMODERIVADOS', headers: ['Horário', 'Item', 'Dose / volume', 'Via', 'Observação'], widths: [65, 165, 100, 70, 145], rows: (payload.intraop.medicacoes || []).map(function (m) { return [m.horario, m.item, m.dose, m.via, m.obs]; }) });
    var comuns = intraRows.filter(function (x) { return ['pa', 'fc', 'spo2', 'etco2', 'temp', 'bis'].some(function (key) { return String(x[key] || '').trim(); }); });
    if (comuns.length) sections.push({ title: 'MONITORIZAÇÃO SERIADA - INTERVALO MÁXIMO DE 10 MINUTOS', headers: ['Horário', 'PA mmHg', 'FC bpm', 'SpO2 %', 'EtCO2 mmHg', 'Temp °C', 'BIS / profundidade'], widths: [55, 75, 60, 60, 72, 62, 85], rows: comuns.map(function (x) { return [x.horario, x.pa, x.fc, x.spo2, x.etco2, x.temp, x.bis]; }) });
    var invasivas = intraRows.filter(function (x) { return ['pam', 'pvc', 'ic', 'vs'].some(function (key) { return String(x[key] || '').trim(); }); });
    if (invasivas.length) sections.push({ title: 'HEMODINÂMICA INVASIVA - INTERVALO MÁXIMO DE 15 MINUTOS', headers: ['Horário', 'PAM', 'PVC', 'Índice cardíaco', 'Volume sistólico'], widths: [65, 80, 80, 150, 150], rows: invasivas.map(function (x) { return [x.horario, x.pam, x.pvc, x.ic, x.vs]; }) });
    var derivadas = intraRows.filter(function (x) { return ['vvs', 'delta_pp', 'outros'].some(function (key) { return String(x[key] || '').trim(); }); });
    if (derivadas.length) sections.push({ title: 'HEMODINÂMICA DERIVADA E OUTROS PARÂMETROS', headers: ['Horário', 'VVS', 'DeltaPP', 'Outros'], widths: [65, 90, 90, 280], rows: derivadas.map(function (x) { return [x.horario, x.vvs, x.delta_pp, x.outros]; }) });
  }

  if (tipo === 'RECUPERACAO_POS_ANESTESICA') {
    var srpaRows = payload.srpa.sinais || [];
    pushGridSection_(sections, 'AVALIAÇÃO E EVOLUÇÃO NA SRPA', 4, [
      gi_('Anestesiologista(s) responsável(is)', payload.srpa.anestesiologistas_responsaveis, 2),
      gi_('Transferência de responsabilidade na admissão', payload.srpa.transferencia_responsabilidade, 2),
      gi_('Admissão / alta', [payload.srpa.admissao, payload.srpa.alta].filter(Boolean).map(function (v) { return fmtIsoBR_(v) || v; }).join(' / '), 1),
      gi_('Recursos de monitorização', payload.srpa.monitorizacao, 1), gi_('Aldrete-Kroulik', payload.srpa.aldrete, 1), gi_('Dor', payload.srpa.dor, 1),
      giu_('Temperatura', payload.srpa.temperatura, '°C', 1), gi_('Consciência', payload.srpa.consciencia, 1),
      gi_('Respiração / SpO2', payload.srpa.respiracao, 1), gi_('Circulação / PA', payload.srpa.circulacao, 1),
      gi_('Atividade motora', payload.srpa.atividade, 1), gi_('Náuseas / vômitos', payload.srpa.nausea_vomito, 1),
      gi_('Bloqueio motor', payload.srpa.bloqueio_motor, 1), gi_('Destino', payload.srpa.destino, 1),
      gi_('Outros parâmetros', payload.srpa.outros_parametros, 1), gi_('Observações seriadas livres', payload.srpa.observacoes_seriadas, 1),
      gi_('Handoff, intercorrências e orientações', payload.srpa.handoff, 'full')
    ]);
    if (srpaRows.length) {
      sections.push({ title: 'AVALIAÇÕES SERIADAS NA SRPA - INTERVALO MÁXIMO DE 15 MINUTOS NA PRIMEIRA HORA', headers: ['Horário', 'Consciência', 'PA', 'FC', 'SpO2', 'Temp'], widths: [55, 170, 80, 65, 65, 65], rows: srpaRows.map(function (x) { return [x.horario, x.consciencia, x.pa, x.fc, x.spo2, x.temp]; }) });
      sections.push({ title: 'ATIVIDADE, DOR, NÁUSEAS E OUTROS PARÂMETROS NA SRPA', headers: ['Horário', 'Atividade motora', 'Dor', 'Náuseas / vômitos', 'Outros'], widths: [55, 150, 55, 130, 160], rows: srpaRows.map(function (x) { return [x.horario, x.atividade, x.dor, x.nausea, x.obs]; }) });
    }
    if ((payload.srpa.medicacoes || []).length) sections.push({ title: 'SOLUÇÕES E FÁRMACOS NA SRPA', headers: ['Horário', 'Item', 'Dose / volume', 'Via', 'Observação'], widths: [65, 165, 100, 70, 145], rows: (payload.srpa.medicacoes || []).map(function (m) { return [m.horario, m.item, m.dose, m.via, m.obs]; }) });
  }
  return sections;
}

// Reserva do relatório narrativo: monta um texto corrido a partir das seções
// já calculadas, para o documento nunca sair vazio (correcao 21).
function relatorioNarrativoServidor_(payload, tipo, user) {
  var linhas = [];
  try {
    buildPdfSections_(payload, 'AVALIACAO_PRE_ANESTESICA', user).forEach(function (section) {
      if (!section) return;
      var itens = [];
      if (section.grid) {
        section.grid.forEach(function (item) {
          if (item && item[1]) itens.push(String(item[0]) + ': ' + String(item[1]));
        });
      } else if (section.rows) {
        section.rows.forEach(function (row) {
          var texto = (row || []).filter(Boolean).join(' — ');
          if (texto) itens.push(texto);
        });
      }
      if (itens.length) linhas.push(String(section.title) + '. ' + itens.join('. ') + '.');
    });
  } catch (ignored) {}
  if (!linhas.length) return 'Sem texto gerado.';
  return linhas.join('\n\n');
}

function examTableRows_(e) {
  e = e || {};
  var defs = [
    ['Hemoglobina', 'hb', 'g/dL'], ['Hematócrito', 'ht', '%'], ['Plaquetas', 'plaquetas', '/mm³'],
    ['Glicose', 'glicose', 'mg/dL'], ['Hemoglobina glicada', 'hba1c', '%'], ['Ureia', 'ureia', 'mg/dL'],
    ['Creatinina', 'creatinina', 'mg/dL'], ['Sódio', 'na', 'mEq/L'], ['Potássio', 'k', 'mEq/L'], ['Cloro', 'cloro', 'mEq/L'],
    ['Cálcio', 'calcio', 'mg/dL'], ['Magnésio', 'magnesio', 'mg/dL'], ['INR', 'inr', ''],
    ['TAP / TP (atividade)', 'tap_pct', '%'], ['TAP / TP (segundos)', 'tap', 's'],
    ['TTPa / KPTT', 'ttpa', 's'], ['AST / TGO', 'tgo', 'U/L'], ['ALT / TGP', 'tgp', 'U/L'], ['GGT', 'ggt', 'U/L'],
    ['Fosfatase alcalina', 'fa', 'U/L'], ['Albumina', 'albumina', 'g/dL'], ['TSH', 'tsh', 'mUI/L'], ['T4 livre', 't4l', 'ng/dL'],
    ['PSA', 'psa', 'ng/mL'], ['ECG', 'ecg', ''], ['Radiografia de tórax', 'rx_torax', ''], ['Outros exames', 'outros', '']
  ];
  return defs.map(function (d) { return [d[0], e[d[1]] || '', d[2]]; }).filter(function (r) { return r[1] !== ''; });
}

function unitValue_(value, unit) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  var text = String(value).trim();
  if (unit && text.toLowerCase().replace(/\s+/g, '').slice(-String(unit).replace(/\s+/g, '').length) === String(unit).toLowerCase().replace(/\s+/g, '')) return text;
  return text + (unit ? ' ' + unit : '');
}

function fmtIsoBR_(iso) {
  var raw = String(iso || '').trim();
  if (!raw) return '';
  try {
    var date = new Date(raw);
    if (isNaN(date.getTime())) return raw;
    return Utilities.formatDate(date, CLAV.TZ, 'dd/MM/yyyy HH:mm');
  } catch (ignored) { return raw; }
}

function resumoAlertasCientes_(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map(function (c) {
    return [c.alerta_id || c.id, c.ciente_por, c.ciente_em].filter(Boolean).join(' | ');
  }).join('\n');
}

// v19.11 (pedido C12 da equipe): documento "Solicitação de exames e avaliações" — um
// pedido numerado por item marcado em "Solicitações, avaliações complementares e
// pareceres", com o texto por pedido (objetivo/justificativa) e o campo livre.
// Espelhado no Index (secoesPedidosClient).
function classificarPedido_(nome) {
  var t = tokenClav_(String(nome || ''));
  return (t.indexOf('avaliacao') === 0 || t.indexOf('parecer') >= 0 || t.indexOf('consulta') === 0) ? 'AVALIACAO' : 'EXAME';
}
function secoesPedidos_(payload) {
  var cond = payload.conduta || {};
  var pr = payload.procedimento || {};
  var pre = payload.preop || {};
  var itens = Array.isArray(cond.solicitacoes_itens) ? cond.solicitacoes_itens : [];
  var detalhes = cond.solicitacoes_detalhes && typeof cond.solicitacoes_detalhes === 'object' ? cond.solicitacoes_detalhes : {};
  var exames = [], avaliacoes = [];
  itens.forEach(function (item) {
    var nome = String(item || '').trim();
    if (!nome) return;
    var det = String(detalhes[nome] || '').trim();
    (classificarPedido_(nome) === 'AVALIACAO' ? avaliacoes : exames).push([nome, det]);
  });
  var outras = String(cond.solicitacoes_outros || '').trim();
  var saida = [];
  var contexto = ['Procedimento proposto: ' + [pr.nome, pr.lateralidade && tokenClav_(pr.lateralidade) !== 'nao se aplica' ? pr.lateralidade : ''].filter(Boolean).join(' — '),
    pr.data_cirurgia ? 'Data prevista da cirurgia: ' + fmtDataBR_(pr.data_cirurgia) : '',
    pre.asa ? 'Classificação ASA: ' + pre.asa : '',
    'Motivo: avaliação pré-anestésica'].filter(function (x) { return x && !/:\s*$/.test(x); });
  saida.push({ title: 'CONTEXTO DA SOLICITAÇÃO', cols: 1, grid: [['Solicitação vinculada à avaliação pré-anestésica', contexto.join('. ') + '.', 'full']] });
  if (exames.length) saida.push({ title: 'SOLICITAÇÃO DE EXAMES', headers: ['Nº', 'Exame', 'Justificativa / objetivo'], widths: [30, 200, 325], rows: exames.map(function (e, i) { return [String(i + 1), e[0], e[1] || '—']; }) });
  if (avaliacoes.length) saida.push({ title: 'SOLICITAÇÃO DE AVALIAÇÃO ESPECIALIZADA / PARECER', headers: ['Nº', 'Avaliação', 'Pergunta ao especialista / objetivo'], widths: [30, 200, 325], rows: avaliacoes.map(function (e, i) { return [String(i + 1), e[0], e[1] || 'Avaliação de risco e otimização clínica para o procedimento proposto.']; }) });
  if (outras) saida.push({ title: 'OUTRAS SOLICITAÇÕES E DETALHES', cols: 1, grid: [['Texto livre', outras, 'full']] });
  if (!exames.length && !avaliacoes.length && !outras) saida.push({ title: 'SOLICITAÇÕES', cols: 1, grid: [['Situação', 'Nenhuma solicitação registrada nesta avaliação.', 'full']] });
  return saida;
}

function pdfTitle_(tipo) {
  tipo = normalizeDocumentType_(tipo);
  if (tipo === 'PEDIDOS') return 'SOLICITAÇÃO DE EXAMES E AVALIAÇÕES';
  if (tipo === 'FICHA_ANESTESIA') return 'FICHA DE ANESTESIA';
  if (tipo === 'RECUPERACAO_POS_ANESTESICA') return 'FICHA DE RECUPERAÇÃO PÓS-ANESTÉSICA';
  if (tipo === 'PRESCRICAO_HOSPITALAR') return 'PRESCRIÇÃO HOSPITALAR / PERIOPERATÓRIA';
  if (tipo === 'RELATORIO_NARRATIVO') return 'RELATÓRIO CLÍNICO NARRATIVO';
  if (tipo === 'OPERACIONAL') return 'RESUMO OPERACIONAL';
  return 'FICHA DE CONSULTA PRÉ-ANESTÉSICA';
}

function styleParagraph_(paragraph, size, bold, color, alignment) {
  try {
    paragraph.setAlignment(alignment || DocumentApp.HorizontalAlignment.LEFT);
    paragraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    var text = paragraph.editAsText();
    text.setFontFamily('Arial').setFontSize(size || 9).setBold(!!bold).setForegroundColor(color || '#111111');
  } catch (ignored) {}
}

function setPdfCellPadding_(cell, px) {
  try {
    cell.setPaddingTop(px).setPaddingBottom(px).setPaddingLeft(px).setPaddingRight(px);
    cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  } catch (ignored) {}
}

// DESATIVADA a pedido da equipe: file.addViewer() dispara um e-mail
// "Item shared with you" do Google Drive a cada PDF gerado, lotando a caixa
// dos anestesiologistas. O acesso ao documento está garantido de duas formas
// que não notificam ninguém: o download direto em base64 no navegador e o
// link do Drive com leitura por makePdfShareable_. A função permanece aqui
// caso a clínica queira reativar o compartilhamento nominal no futuro.
function grantPdfViewer_(file, user) {
  var email = user && normalizeEmail_(user.email || '');
  if (!email) return;
  try { file.addViewer(email); } catch (ignored) {}
}

// CORRECAO 7 (bloqueante, LGPD). O PDF de prontuario era publicado no Drive
// como ANYONE_WITH_LINK, sem prazo e sem revogacao: um link repassado expunha
// o prontuario completo e nominal a qualquer pessoa da internet, para sempre.
// Isso era desnecessario, porque o proprio sistema ja entrega o arquivo ao
// navegador em base64. Agora o arquivo nasce PRIVADO e o acesso e nominal,
// restrito aos responsaveis tecnicos de CLAV.DRIVE_EDITORS.
function makePdfShareable_(file) {
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (ignored) {}
  try { addDriveEditors_(file); } catch (ignored2) {}
  return false;
}


function getAppFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CLAV.ROOT_FOLDER_PROP);
  var folder = null;
  if (id) {
    try { folder = DriveApp.getFolderById(id); } catch (ignored) { props.deleteProperty(CLAV.ROOT_FOLDER_PROP); }
  }
  if (!folder) {
    var matches = DriveApp.getFoldersByName(CLAV.ROOT_FOLDER_NAME);
    folder = matches.hasNext() ? matches.next() : DriveApp.createFolder(CLAV.ROOT_FOLDER_NAME);
    props.setProperty(CLAV.ROOT_FOLDER_PROP, folder.getId());
  }
  addDriveEditors_(folder);
  return folder;
}

function getExportsFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CLAV.EXPORTS_FOLDER_PROP);
  var folder = null;
  if (id) {
    try { folder = DriveApp.getFolderById(id); } catch (ignored) { props.deleteProperty(CLAV.EXPORTS_FOLDER_PROP); }
  }
  if (!folder) {
    var root = getAppFolder_();
    var matches = root.getFoldersByName(CLAV.EXPORTS_FOLDER_NAME);
    folder = matches.hasNext() ? matches.next() : root.createFolder(CLAV.EXPORTS_FOLDER_NAME);
    props.setProperty(CLAV.EXPORTS_FOLDER_PROP, folder.getId());
  }
  addDriveEditors_(folder);
  return folder;
}

function ensureDatabaseSharing_(ss) {
  try {
    var file = DriveApp.getFileById(ss.getId());
    try { file.moveTo(getAppFolder_()); } catch (ignored) {}
    addDriveEditors_(file);
  } catch (err) {
    upsertConfigValue_('DRIVE_SHARE_WARNING', err.message || String(err), 'Aviso ao compartilhar a base');
  }
}

function addDriveEditors_(resource) {
  (CLAV.DRIVE_EDITORS || []).forEach(function (email) {
    try { resource.addEditor(email); } catch (ignored) {}
  });
}

function upsertConfigValue_(key, value, description) {
  var ex = findRowBy_('CONFIG', 'chave', key);
  var obj = {
    chave: key,
    valor: String(value || ''),
    descricao: description || '',
    updated_at: nowISO_(),
    updated_by: 'sistema'
  };
  if (ex) writeObjectAtRow_('CONFIG', ex.row, Object.assign({}, ex.obj, obj)); else insert_('CONFIG', obj);
}

