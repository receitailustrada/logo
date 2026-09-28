/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 12_Calculos.gs
 * Cálculos clínicos, dashboard, listagens e lookups
 *
 * Conteúdo: Beta-HCG, proteção ao menor, calcularServidor_, Cockcroft-Gault, dashboard_, lookups_.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

// ===== Segurança reprodutiva e proteção à criança e ao adolescente =====
function tokenClav_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function idadeDoPaciente_(payload) {
  var p = (payload && payload.paciente) || {};
  var bruto = String(p.idade || '').replace(/\D/g, '');
  var idade = bruto === '' ? NaN : Number(bruto);
  if (isNaN(idade)) {
    var calculada = calcAge_(p.nascimento);
    idade = (calculada === '' || calculada === null || calculada === undefined) ? NaN : Number(calculada);
  }
  return isNaN(idade) ? null : idade;
}

function situacaoBetaHcg_(payload) {
  var p = (payload && payload.paciente) || {};
  var sexo = tokenClav_(p.sexo);
  var potencial = tokenClav_(p.potencial_gestacional);
  var idade = idadeDoPaciente_(payload);
  if (potencial === 'sim') return { aplica: true, idade: idade, motivo: '' };
  if (sexo.indexOf('masc') === 0) return { aplica: false, idade: idade, motivo: 'Sexo registrado masculino: Beta-HCG não se aplica.' };
  if (idade !== null && idade > 60) return { aplica: false, idade: idade, motivo: 'Idade superior a 60 anos: Beta-HCG não se aplica.' };
  if (idade !== null && idade < 9) return { aplica: false, idade: idade, motivo: 'Idade inferior a 9 anos sem potencial gestacional informado.' };
  if (potencial.indexOf('nao se aplica') === 0) return { aplica: false, idade: idade, motivo: 'Potencial gestacional registrado como não aplicável.' };
  if (potencial.indexOf('menopaus') === 0) return { aplica: false, idade: idade, motivo: 'Paciente menopausada: Beta-HCG dispensável.' };
  if (potencial.indexOf('histerectomiz') === 0) return { aplica: false, idade: idade, motivo: 'Paciente histerectomizada: Beta-HCG não se aplica.' };
  return { aplica: true, idade: idade, motivo: '' };
}

function protecaoMenorAtiva_(payload) {
  var p = (payload && payload.paciente) || {};
  var seg = (payload && payload.seguranca) || {};
  var sexo = tokenClav_(p.sexo);
  var idade = idadeDoPaciente_(payload);
  var resultado = tokenClav_(seg.beta_hcg_resultado);
  var positivo = resultado.indexOf('positiv') >= 0 && resultado.indexOf('nao positiv') < 0;
  return sexo.indexOf('fem') === 0 && idade !== null && idade < 14 && positivo;
}

function protecaoMenorPendente_(payload) {
  if (!protecaoMenorAtiva_(payload)) return false;
  var seg = (payload && payload.seguranca) || {};
  var ciencia = tokenClav_(seg.protecao_menor_ciencia);
  var orgaos = seg.protecao_menor_orgaos;
  var temOrgao = Array.isArray(orgaos) ? orgaos.length > 0 : !!orgaos;
  return !(ciencia.indexOf('sim') === 0 && temOrgao);
}

function clockMinutes_(value) {
  var match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function maximumIntervalMinutes_(rows, predicate) {
  rows = Array.isArray(rows) ? rows : [];
  var times = rows.filter(function (row) { return !predicate || predicate(row || {}); }).map(function (row) {
    return clockMinutes_(row && row.horario);
  }).filter(function (value) { return value !== null && isFinite(value); }).sort(function (a, b) { return a - b; });
  var max = 0;
  for (var i = 1; i < times.length; i++) max = Math.max(max, times[i] - times[i - 1]);
  return max;
}

function calcularServidor_(payload, alertas) {
  payload = normalizePayload_(payload);
  var t = payload.triagem || {};
  var peso = Number(String(t.peso || '').replace(',', '.'));
  var altura = Number(String(t.altura || '').replace(',', '.'));
  if (altura > 3) altura = altura / 100;
  // v19.9: IMC só com peso e altura plausíveis (altura "17" gerava IMC 2422 e
  // acionava STOP-Bang/Caprini por engano). Mesmos limites de FAIXAS_SV_CLAV.
  var imc = (peso >= 2 && peso <= 350 && altura >= 0.45 && altura <= 2.3) ? peso / (altura * altura) : '';
  var idade = idadeDoPaciente_(payload);
  var isPediatrico = idade !== null && idade < 18;
  var rcri = (!isPediatrico && Array.isArray(payload.riscos.rcri)) ? payload.riscos.rcri.length : 0;
  var stopBang = (!isPediatrico && Array.isArray(payload.riscos.stop_bang)) ? payload.riscos.stop_bang.length : 0;
  var danger = (alertas || []).filter(function (a) { return a.tipo === 'danger'; }).length;
  var warn = (alertas || []).filter(function (a) { return a.tipo === 'warn'; }).length;
  var score = Math.max(0, 100 - danger * 18 - warn * 7);
  var clcr = cockcroftGault_(payload);
  return {
    imc: imc ? imc.toFixed(1) : '',
    imc_classe: classificarImc_(imc, idade),
    rcri: rcri,
    stop_bang: stopBang,
    clearance_cockcroft: clcr === null ? '' : clcr,
    clearance_texto: clcr === null ? '' : (clcr + ' mL/min (Cockcroft-Gault)'),
    idade_formatada: idadeFormatada_(payload.paciente && payload.paciente.nascimento, payload.paciente && payload.paciente.idade),
    clav_score: score,
    clav_status: score >= 85 ? 'Documentação adequada' : (score >= 65 ? 'Revisar pendências' : 'Pendências críticas')
  };
}

/**
 * Clearance de creatinina por Cockcroft-Gault:
 * ClCr = [(140 − idade) × peso] / (72 × creatinina), × 0,85 se sexo feminino.
 * Retorna null quando faltar idade, peso, sexo ou creatinina (dados insuficientes).
 */
function cockcroftGault_(payload) {
  var idade = idadeDoPaciente_(payload);
  var peso = Number(String((payload.triagem || {}).peso || '').replace(',', '.'));
  var creat = Number(String((payload.exames || {}).creatinina || '').replace(',', '.'));
  var sexo = tokenClav_((payload.paciente || {}).sexo || '');
  var fem = sexo.indexOf('fem') === 0;
  var masc = sexo.indexOf('masc') === 0;
  // Cockcroft-Gault é clinicamente validado exclusivamente para adultos (idade >= 18 anos)
  if (idade === null || idade < 18 || !peso || !creat || (!fem && !masc)) return null;
  var clcr = ((140 - idade) * peso) / (72 * creat);
  if (fem) clcr = clcr * 0.85;
  if (!isFinite(clcr) || clcr <= 0) return null;
  return Math.round(clcr);
}

// Idade com unidade para impressão: "72 anos"; abaixo de 1 ano, meses; abaixo
// de 1 mês, dias.
function idadeFormatada_(nascimento, idadeRegistrada) {
  var iso = String(nascimento || '').slice(0, 10);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    var nasc = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var hoje = new Date();
    if (!isNaN(nasc.getTime()) && nasc <= hoje) {
      var dias = Math.floor((hoje.getTime() - nasc.getTime()) / 86400000);
      if (dias < 31) return dias + (dias === 1 ? ' dia' : ' dias');
      var meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
      if (hoje.getDate() < nasc.getDate()) meses -= 1;
      if (meses < 12) return meses + (meses === 1 ? ' mês' : ' meses');
      var anos = Math.floor(meses / 12);
      return anos + (anos === 1 ? ' ano' : ' anos');
    }
  }
  var bruta = String(idadeRegistrada || '').trim();
  if (!bruta) return '';
  return /^\d+$/.test(bruta) ? bruta + ' anos' : bruta;
}

/** Listagens e dashboard */
function listarAtendimentosInterno_(filtro, user) {
  filtro = filtro || {};
  // allLite_ ignora as colunas payload_json*: a busca e a listagem passam a
  // custar alguns KB por linha em vez de ate 225 KB (correcao 13).
  var rows = allLite_('ATENDIMENTOS').filter(function (r) { return !r._deleted_at; });
  var q = normalizeKey_(filtro.q || '');
  if (q) {
    rows = rows.filter(function (r) {
      var text = [r.paciente_nome, r.nome_preferido, r.prontuario, r.cidade, r.procedimento, r.status, r.convenio, r.local_procedimento, r.cirurgiao, r.anestesiologista, r.atendimento_id].join(' ');
      return normalizeKey_(text).indexOf(q) >= 0;
    });
  }
  if (filtro.status) rows = rows.filter(function (r) { return r.status === filtro.status; });
  // Ordena por instante real. A comparacao por string quebrava quando o Sheets
  // devolvia um objeto Date ("Sat Aug 30 2026...") em vez do texto ISO
  // (correcao 5).
  rows.sort(function (a, b) {
    return ordemMillis_(b.updated_at, b.created_at) - ordemMillis_(a.updated_at, a.created_at);
  });
  var limit = Math.min(Number(filtro.limit || 60), 200);
  return rows.slice(0, limit).map(function (r) { return publicAtendimentoRow_(r, user); });
}

// Datas civis não são instantes UTC. Aceita apenas calendário ISO válido;
// formatos ambíguos e datas impossíveis permanecem inválidos, sem rollover.
function dataCivilEstrita_(valor) {
  if (typeof valor !== 'string') return '';
  var texto = valor.trim();
  var m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return '';
  var bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  var dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= dias[mes - 1] ? texto : '';
}

// Distingue data pura, data/hora local e timestamp com fuso explícito.
// v19.11.1 (diagnóstico de 28/09/2026: 296 células "2026-07-13 9:00", texto vindo da
// restauração do backup de 06/09). Converte formatos de exibição da planilha para o
// padrão civil: "aaaa-m-d h:mm", "dd/mm/aaaa h:mm" (com ou sem hora/segundos). Devolve
// "" quando o texto não é um desses formatos; datas impossíveis continuam inválidas.
function textoDataLegado_(texto) {
  var t = String(texto || '').trim();
  if (!t) return '';
  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  var ano, mes, dia, hora, minuto, segundo;
  if (m) { ano = m[1]; mes = m[2]; dia = m[3]; hora = m[4]; minuto = m[5]; segundo = m[6]; }
  else {
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return '';
    dia = m[1]; mes = m[2]; ano = m[3]; hora = m[4]; minuto = m[5]; segundo = m[6];
  }
  var p2 = function (n) { return ('0' + String(Number(n))).slice(-2); };
  var civil = dataCivilEstrita_(ano + '-' + p2(mes) + '-' + p2(dia));
  if (!civil) return '';
  if (hora === undefined) return civil;
  if (Number(hora) > 23 || Number(minuto) > 59 || (segundo !== undefined && Number(segundo) > 59)) return '';
  return civil + 'T' + p2(hora) + ':' + p2(minuto) + (segundo !== undefined ? ':' + p2(segundo) : '');
}
// Texto já no padrão gravado pelo sistema (data civil ou data/hora local sem fuso).
function textoDataCanonico_(texto) {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(texto || '').trim());
}

function partesDataClav_(valor) {
  if (typeof valor !== 'string') return null;
  var texto = valor.trim();
  // v19.11.1: formato legado da planilha ("2026-07-13 9:00") é lido como data/hora local.
  var legado = textoDataLegado_(texto);
  if (legado && legado !== texto) texto = legado;
  var civil = dataCivilEstrita_(texto);
  if (civil) return { dia: civil, hora: 0, minuto: 0, segundo: 0, milissegundo: 0, fuso: '', dataPura: true };
  var m = texto.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!m || !dataCivilEstrita_(m[1])) return null;
  var hora = Number(m[2]), minuto = Number(m[3]), segundo = Number(m[4] || 0);
  if (hora > 23 || minuto > 59 || segundo > 59) return null;
  var fuso = m[6] || '';
  if (fuso && fuso !== 'Z' && (Number(fuso.slice(1, 3)) > 23 || Number(fuso.slice(4, 6)) > 59)) return null;
  return { dia: m[1], hora: hora, minuto: minuto, segundo: segundo,
    milissegundo: Number(((m[5] || '') + '000').slice(0, 3)), fuso: fuso, dataPura: false };
}

function diaCalendarioClav_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    // v19.10 (pedido A3): uma célula convertida em data pela planilha representa o
    // dia EXIBIDO no fuso da própria planilha; formatá-la noutro fuso deslocava a
    // agenda e o bate-escala em um dia para parte dos pacientes.
    return isNaN(valor.getTime()) ? '' : Utilities.formatDate(valor, fusoPlanilhaClav_(), 'yyyy-MM-dd');
  }
  var partes = partesDataClav_(valor);
  if (!partes) return '';
  // A data civil e o horário local conservam o dia informado; somente um
  // timestamp com fuso representa um instante a converter para o fuso CLAV.
  if (!partes.fuso) return partes.dia;
  // v19.10 (pedido A3): data pura gravada por versões antigas como meia-noite UTC
  // ("2026-09-29T00:00:00Z") é o dia 29, e não "28 às 21h" em São Paulo.
  if (dataPuraEmUtc_(partes)) return partes.dia;
  var ms = parseIsoMillis_(valor);
  return Utilities.formatDate(new Date(ms), CLAV.TZ, 'yyyy-MM-dd');
}

// Instante exatamente à meia-noite UTC = data civil serializada sem hora.
function dataPuraEmUtc_(partes) {
  return !!partes && !partes.dataPura && partes.hora === 0 && partes.minuto === 0 && partes.segundo === 0
    && (partes.fuso === 'Z' || partes.fuso === '+00:00' || partes.fuso === '-00:00');
}

// Fuso da planilha-base (o que a célula de data exibe). Cai no fuso do sistema
// quando a planilha não puder ser lida. Lido uma vez por execução.
var CLAV_FUSO_PLANILHA_CACHE_ = '';
function fusoPlanilhaClav_() {
  if (CLAV_FUSO_PLANILHA_CACHE_) return CLAV_FUSO_PLANILHA_CACHE_;
  var tz = '';
  try { tz = String(getSpreadsheet_().getSpreadsheetTimeZone() || ''); } catch (ignored) { tz = ''; }
  CLAV_FUSO_PLANILHA_CACHE_ = tz || CLAV.TZ;
  return CLAV_FUSO_PLANILHA_CACHE_;
}

// Normaliza data/hora vinda da planilha, que pode chegar como texto ISO ou como
// objeto Date, dependendo do formato da coluna (correcao 5).
function dataTextoPlanilha_(valor) {
  if (valor === undefined || valor === null || valor === '') return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    if (isNaN(valor.getTime())) return '';
    return Utilities.formatDate(valor, CLAV.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(valor);
}

function ordemMillis_(preferido, alternativo) {
  var ms = parseIsoMillis_(dataTextoPlanilha_(preferido));
  if (ms) return ms;
  return parseIsoMillis_(dataTextoPlanilha_(alternativo));
}

function publicAtendimentoRow_(r, user) {
  var alertas = parseJson_(r.alertas_json, []);
  var obj = {
    atendimento_id: r.atendimento_id,
    paciente_id: r.paciente_id,
    paciente_nome: r.paciente_nome,
    data_consulta: r.data_consulta,
    data_cirurgia: r.data_cirurgia,
    status: r.status,
    procedimento: r.procedimento,
    lateralidade: r.lateralidade,
    carater: r.carater,
    tipo_cirurgia: r.tipo_cirurgia || '',
    convenio: r.convenio,
    local_procedimento: r.local_procedimento,
    cirurgiao: r.cirurgiao,
    anestesiologista: r.anestesiologista,
    triagem_concluida_em: dataTextoPlanilha_(r.triagem_concluida_em),
    conclusao: r.conclusao || '',
    data_avaliacao: dataTextoPlanilha_(r.data_avaliacao),
    triagem_responsavel: r.triagem_responsavel || '',
    locked: r.locked,
    updated_at: dataTextoPlanilha_(r.updated_at),
    revision: Number(r.revision || 0),
    alertas_count: alertas.length,
    alertas_danger: alertas.filter(function (a) { return a.tipo === 'danger'; }).length
  };
  obj.data_consulta = dataTextoPlanilha_(r.data_consulta);
  obj.data_cirurgia = diaLocalPlanilha_(r.data_cirurgia);
  // Indicadores clinicos so para o corpo medico (correcao 11).
  if (isMedical_(user)) {
    obj.beta_hcg_status = r.beta_hcg_status || '';
    obj.imc = r.imc || '';
    obj.pa = r.pa || '';
    obj.fr = r.fr || '';
    obj.score = r.clav_score === '' || r.clav_score === undefined || r.clav_score === null ? '' : Number(r.clav_score);
  }
  return obj;
}

// Alertas visiveis a perfis operacionais: apenas o que e trabalho da triagem e
// do cadastro. Antes, a tecnica recebia "ASA IV", "RCRI com 4 criterios" etc.,
// justamente o que o payload sanitizado ja havia removido (correcao 11).
var CLAV_ALERTAS_OPERACIONAIS_ = ['IDENTIFICACAO', 'TRIAGEM', 'PROCEDIMENTO', 'SINAIS_VITAIS', 'PEDIATRIA', 'RESPONSABILIDADE', 'DOCUMENTACAO'];

function filtrarAlertasPorPerfil_(alertas, user) {
  var lista = Array.isArray(alertas) ? alertas : [];
  if (isMedical_(user)) return lista;
  return lista.filter(function (a) {
    return CLAV_ALERTAS_OPERACIONAIS_.indexOf(String((a && a.categoria) || '')) >= 0;
  });
}

function dashboard_(user) {
  var rows = allLite_('ATENDIMENTOS').filter(function (r) { return !r._deleted_at; });
  var hoje = Utilities.formatDate(new Date(), CLAV.TZ, 'yyyy-MM-dd');
  var counts = { total: rows.length, abertos: 0, triagem: 0, pendentes: 0, encerrados: 0, hoje: 0, alertasCriticos: 0 };
  rows.forEach(function (r) {
    var status = String(r.status || '').toUpperCase();
    if (status === 'ENCERRADO') counts.encerrados++;
    else if (status === 'PENDENTE') counts.pendentes++;
    else if (status === 'TRIAGEM' || status === 'TRIAGEM_CONCLUIDA') counts.triagem++;
    else counts.abertos++;
    if (diaLocalPlanilha_(r.data_consulta) === hoje) counts.hoje++;
    var a = parseJson_(r.alertas_json, []);
    counts.alertasCriticos += a.filter(function (x) { return x.tipo === 'danger'; }).length;
  });
  return { counts: counts, generatedAt: nowISO_() };
}

function listUsuariosPublicos_() {
  return all_('USUARIOS')
    .filter(function (u) { return !u._deleted_at && String(u.ativo || '').toUpperCase() === 'SIM'; })
    .map(function (u) {
      return {
        usuario_id: u.usuario_id,
        nome: u.nome,
        perfil: u.perfil,
        crm: u.crm,
        rqe: u.rqe
      };
    });
}

function publicUser_(u) {
  return {
    usuario_id: u.usuario_id,
    usuario: u.usuario,
    nome: u.nome,
    perfil: u.perfil,
    crm: u.crm,
    rqe: u.rqe,
    email: u.email,
    telefone: u.telefone,
    permissoes: userPermissions_(u)
  };
}

function lookups_() {
  var profissionaisTodos = catalogoAtivo_('PROFISSIONAIS', DEFAULT_PROFISSIONAIS_().concat(DEFAULT_ANESTESIOLOGISTAS_()));
  var isAnest = function (item) { return tokenClav_(item.grupo || '').indexOf('anestesiolog') === 0; };
  var cirurgioes = profissionaisTodos.filter(function (item) { return !isAnest(item); });
  // Deduplicação por nome: a base de anestesiologistas pode existir duas vezes
  // na aba PROFISSIONAIS (semeada por DEFAULT_PROFISSIONAIS_ e por
  // DEFAULT_ANESTESIOLOGISTAS_), e o seletor não deve mostrar nomes repetidos.
  var vistosAnest = {};
  var anestesistasItens = profissionaisTodos.filter(isAnest).filter(function (item) {
    var chave = tokenClav_(item.nome || '');
    if (!chave || vistosAnest[chave]) return false;
    vistosAnest[chave] = true;
    return true;
  }).map(function (item) { return { nome: item.nome, grupo: 'Anestesiologia' }; });
  var anestesiologistas = anestesistasItens.map(function (item) { return item.nome; });
  // Equipe cirúrgica: cirurgiões primeiro e, a pedido da equipe, os
  // anestesiologistas ao final (grupo "Anestesiologia"), pois bloqueios e
  // infiltrações são procedimentos realizados pela própria anestesia.
  var equipeCirurgica = cirurgioes.concat(anestesistasItens);
  try { sincronizarCatalogoProcedimentos_(false); } catch (ignored) {}
  var procedimentosCatalogo = catalogoAtivo_('PROCEDIMENTOS', DEFAULT_PROCEDIMENTOS_());
  var conveniosCatalogo = catalogoAtivo_('CONVENIOS', DEFAULT_CONVENIOS_().map(function (nome) { return { nome: nome, grupo: '' }; }));
  // Bases já instaladas: acrescenta na aba MEDICACOES as medicações novas da
  // lista embutida. Só inclui; nunca apaga nem regrava linhas existentes.
  try { sincronizarCatalogoMedicacoes_(false); } catch (ignoredMed) {}
  var medicacoesCatalogo = catalogoAtivo_('MEDICACOES', DEFAULT_MEDICACOES_());
  return {
    nome_instituicao: nomeInstituicao_(),
    cidade_instituicao: cidadeInstituicao_(),
    profissionais: equipeCirurgica,
    anestesiologistas: anestesiologistas,
    procedimentos_catalogo: procedimentosCatalogo,
    procedimentos: procedimentosCatalogo.map(function (item) { return item.nome; }),
    // Mapa grupo do procedimento → grupos de profissionais mais prováveis
    // (ordem = prioridade). Usado pela tela para sugerir a equipe cirúrgica.
    equipe_por_grupo: CLAV_EQUIPE_POR_GRUPO_(),
    convenios_catalogo: conveniosCatalogo,
    convenios: conveniosCatalogo.map(function (item) { return item.nome; }),
    medicacoes_catalogo: medicacoesCatalogo,
    locais: ['Clínica CLAV', 'HNSO - Hospital Nossa Senhora da Oliveira', 'Hospital Unimed', 'Outro: digitar manualmente'],
    carater: ['Eletivo', 'Urgência', 'Emergência', 'Tempo sensível'],
    lateralidade: ['Não se aplica', 'Direita', 'Esquerda', 'Bilateral'],
    tipo_cirurgia: ['Não se aplica', 'Convencional (aberta)', 'Laparoscopia', 'Robótica'],
    asa: ['ASA I', 'ASA II', 'ASA III', 'ASA IV', 'ASA V', 'ASA VI'],
    tecnicas: ['Anestesia geral', 'Raquianestesia', 'Peridural', 'Bloqueio periférico', 'Sedação', 'Combinada', 'Outro: digitar manualmente'],
    beta: ['Não se aplica', 'Negativo', 'Positivo', 'Solicitado/Pendente', 'Dispensado com justificativa'],
    potencial_gestacional: ['Sim', 'Não', 'Indeterminado / avaliar', 'Menopausada', 'Histerectomizada', 'Com laqueadura tubária', 'Não se aplica']
  };
}

/**
 * Municípios do Brasil (IBGE): a lista completa não trafega no bootstrap para
 * não pesar o carregamento. O cliente chama listarMunicipios uma única vez por
 * sessão; o servidor responde da aba MUNICIPIOS (personalizável) com fallback
 * na base embutida, usando CacheService em blocos como acelerador.
 */
function listarMunicipios(token) {
  return safe_('listarMunicipios', function () {
    requireInstalled_();
    validarSessao_(token);
    var cache = CacheService.getScriptCache();
    var cached = cacheGetChunked_(cache, 'CLAV_MUNICIPIOS_V1');
    if (cached) return ok_({ municipios: cached, total: cached.length, origem: 'cache' });
    var lista = [];
    try {
      var rows = all_('MUNICIPIOS');
      lista = rows.filter(function (r) {
        var ativo = String(r.ativo === undefined || r.ativo === null || r.ativo === '' ? 'SIM' : r.ativo).trim().toUpperCase();
        return String(r.nome || '').trim() && ativo !== 'NÃO' && ativo !== 'NAO';
      }).map(function (r) { return { nome: String(r.nome).trim(), uf: String(r.uf || '').trim().toUpperCase() }; });
    } catch (ignored) { lista = []; }
    if (!lista.length) lista = DEFAULT_MUNICIPIOS_();
    cachePutChunked_(cache, 'CLAV_MUNICIPIOS_V1', lista, 21600);
    return ok_({ municipios: lista, total: lista.length, origem: 'planilha' });
  }, {});
}

// CacheService limita cada chave a ~100KB; a lista completa de municípios é
// gravada em blocos numerados e recomposta na leitura.
function cachePutChunked_(cache, key, value, seconds) {
  try {
    var text = JSON.stringify(value);
    // v19.9: 100 KB do CacheService são medidos em bytes; com acentos, 90.000
    // caracteres estouravam e o put falhava em silêncio. 60.000 deixa folga.
    var size = 60000;
    var chunks = [];
    for (var i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    var payload = { n: chunks.length };
    cache.put(key + '_META', JSON.stringify(payload), seconds);
    chunks.forEach(function (chunk, idx) { cache.put(key + '_' + idx, chunk, seconds); });
  } catch (ignored) {}
}

function cacheGetChunked_(cache, key) {
  try {
    var meta = cache.get(key + '_META');
    if (!meta) return null;
    var n = Number(JSON.parse(meta).n || 0);
    if (!n) return null;
    var parts = [];
    for (var i = 0; i < n; i++) {
      var chunk = cache.get(key + '_' + i);
      if (chunk === null || chunk === undefined) return null;
      parts.push(chunk);
    }
    return JSON.parse(parts.join(''));
  } catch (ignored) {
    return null;
  }
}