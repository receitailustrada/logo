/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 27_Pacientes.gs
 * Cadastro de pacientes: busca, deduplicação, edição e abertura de novo
 * atendimento a partir de um cadastro já existente.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * A aba PACIENTES era gravada por preparePacienteWrite_ e NUNCA lida. Na
 * prática o sistema não tinha base de pacientes: para reoperar alguém era
 * preciso pesquisar ATENDIMENTOS, abrir um registro antigo inteiro (a linha
 * chega a 225 KB por causa das colunas payload_json) e só então clonar o
 * cadastro. Quatro passos e um download pesado para uma tarefa que deveria ser
 * uma busca e um clique.
 *
 * Aqui a aba vira o que sempre deveria ter sido: o índice do serviço.
 *
 *   buscarPacientes            — busca única por nome, CPF, prontuário,
 *                                telefone ou nascimento, com ranking
 *   verificarDuplicidade...    — avisa ANTES de criar um cadastro repetido
 *   abrirPacienteNovoAtendi... — devolve cadastro + história clínica
 *                                reaproveitável, sem trafegar o payload inteiro
 *   historicoPaciente          — linha do tempo cirúrgica do paciente
 *   salvarCadastroPaciente     — corrige o cadastro sem abrir atendimento
 *
 * DESEMPENHO
 * O índice é montado com allLite_ (a aba PACIENTES não tem colunas pesadas) e
 * fica em CacheService por 10 minutos. Toda escrita de paciente invalida o
 * índice — ver invalidarIndicePacientes_(), chamada em persistPacienteWrite_.
 *
 * SEGURANÇA
 * CPF, telefone e e-mail só são devolvidos mascarados. Perfis não médicos
 * recebem o mesmo índice: identificação é trabalho da recepção e da triagem.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global.
 */

var CLAV_PAC_INDICE_KEY_ = 'CLAV_PAC_INDICE_V1';
var CLAV_PAC_INDICE_TTL_ = 600;      // 10 minutos
var CLAV_PAC_BUSCA_LIMITE_ = 25;

/* ============================================================================
 * 1. ÍNDICE DE BUSCA
 * ==========================================================================*/

/** Texto sem acento, minúsculo e sem pontuação — base de toda comparação. */
function pacChave_(valor) {
  return String(valor || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Iniciais para o avatar da lista (evita mandar foto ou dado extra à tela). */
function pacIniciais_(nome) {
  var partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** CPF mascarado: confere a identidade sem expor o número inteiro na tela. */
function pacMascararCpf_(cpf) {
  var d = digitsOnly_(cpf);
  if (d.length !== 11) return d ? '•••' : '';
  return '•••.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-••';
}

function pacMascararTelefone_(tel) {
  var d = digitsOnly_(tel);
  if (d.length < 8) return '';
  return '(' + d.slice(0, 2) + ') ••••-' + d.slice(-4);
}

/**
 * Monta (ou recupera do cache) o índice leve de pacientes.
 * Uma entrada por paciente, com os campos já normalizados para comparação.
 */
function pacIndice_(forcar) {
  var cache = CacheService.getScriptCache();
  if (!forcar) {
    var salvo = cacheGetChunked_(cache, CLAV_PAC_INDICE_KEY_);
    if (salvo) {
      var lido = parseJson_(salvo, null);
      if (lido && lido.itens) return lido;
    }
  }

  var pacientes = allLite_('PACIENTES').filter(function (r) { return !r._deleted_at; });

  // Contadores por paciente vindos de ATENDIMENTOS (sem colunas payload_json).
  var atendimentos = allLite_('ATENDIMENTOS').filter(function (r) { return !r._deleted_at; });
  var porPaciente = {};
  atendimentos.forEach(function (a) {
    var pid = String(a.paciente_id || '');
    if (!pid) return;
    var alvo = porPaciente[pid] || (porPaciente[pid] = { total: 0, ultimo: null, ultimoMs: -1, procedimentos: [] });
    alvo.total += 1;
    var ms = ordemMillis_(a.data_cirurgia, a.updated_at);
    if (a.procedimento) {
      alvo.procedimentos.push({
        procedimento: String(a.procedimento || ''),
        lateralidade: String(a.lateralidade || ''),
        data: diaLocalPlanilha_(a.data_cirurgia) || diaLocalPlanilha_(a.data_consulta) || '',
        ms: ms
      });
    }
    if (ms > alvo.ultimoMs) {
      alvo.ultimoMs = ms;
      alvo.ultimo = {
        atendimento_id: String(a.atendimento_id || ''),
        procedimento: String(a.procedimento || ''),
        lateralidade: String(a.lateralidade || ''),
        status: String(a.status || ''),
        data_cirurgia: diaLocalPlanilha_(a.data_cirurgia) || '',
        data_consulta: diaLocalPlanilha_(a.data_consulta) || ''
      };
    }
  });

  var itens = pacientes.map(function (p) {
    var pid = String(p.paciente_id || '');
    var agregado = porPaciente[pid] || { total: 0, ultimo: null, procedimentos: [] };
    var nasc = dataTextoPlanilha_(p.nascimento) || String(p.nascimento || '');
    agregado.procedimentos.sort(function (a, b) { return b.ms - a.ms; });
    return {
      id: pid,
      prontuario: String(p.prontuario || ''),
      nome: String(p.nome || ''),
      preferido: String(p.nome_preferido || p.nome_social || ''),
      nascimento: nasc.slice(0, 10),
      idade: String(p.idade || calcAge_(nasc) || ''),
      sexo: String(p.sexo || ''),
      cidade: String(p.cidade || ''),
      cpfDigitos: digitsOnly_(p.cpf || ''),
      telDigitos: digitsOnly_(p.telefone || ''),
      // Campos normalizados: calculados uma vez, não a cada tecla digitada.
      kNome: pacChave_(p.nome),
      kPreferido: pacChave_(p.nome_preferido || p.nome_social || ''),
      kCidade: pacChave_(p.cidade),
      kProntuario: pacChave_(p.prontuario),
      totalAtendimentos: agregado.total,
      ultimo: agregado.ultimo,
      historico: agregado.procedimentos.slice(0, 6),
      atualizadoEm: dataTextoPlanilha_(p.updated_at) || ''
    };
  });

  // Mais recentes primeiro: é o que a recepção normalmente procura.
  itens.sort(function (a, b) {
    return String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || ''));
  });

  var indice = { geradoEm: nowISO_(), total: itens.length, itens: itens };
  try { cachePutChunked_(cache, CLAV_PAC_INDICE_KEY_, toJson_(indice), CLAV_PAC_INDICE_TTL_); }
  catch (ignored) { /* índice grande demais para o cache: segue sem cache */ }
  return indice;
}

/**
 * Invalida o índice. Chamada por persistPacienteWrite_ (25_Salvamento.gs) e
 * por salvarCadastroPaciente. Sem isso, um cadastro recém-corrigido
 * continuaria aparecendo desatualizado na busca por até 10 minutos.
 */
function invalidarIndicePacientes_() {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(CLAV_PAC_INDICE_KEY_);
    // cachePutChunked_ grava em pedaços numerados; remove os possíveis blocos.
    for (var i = 0; i < 20; i++) cache.remove(CLAV_PAC_INDICE_KEY_ + '_' + i);
  } catch (ignored) {}
}

/* ============================================================================
 * 2. BUSCA
 * ==========================================================================*/

/**
 * Interpreta o que foi digitado. Uma caixa só, sem o usuário escolher o campo:
 * dígitos viram CPF/telefone/prontuário, texto vira nome, data vira nascimento.
 */
function pacInterpretarTermo_(termo) {
  var bruto = String(termo || '').trim();
  var digitos = digitsOnly_(bruto);
  var out = {
    bruto: bruto,
    chave: pacChave_(bruto),
    tokens: pacChave_(bruto).split(' ').filter(Boolean),
    digitos: digitos,
    ehCpf: digitos.length === 11 && /^[\d.\-\s]+$/.test(bruto),
    ehTelefone: digitos.length >= 10 && digitos.length <= 11 && /^[\d()\-\s+]+$/.test(bruto),
    nascimento: ''
  };
  // dd/mm/aaaa ou aaaa-mm-dd
  var br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto);
  if (br) out.nascimento = br[3] + '-' + br[2] + '-' + br[1];
  var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
  if (iso) out.nascimento = bruto;
  return out;
}

/**
 * Pontua um paciente contra o termo. A ordem importa mais que a nota exata:
 * identificador exato no topo, começo do nome depois, pedaço do nome por último.
 */
function pacPontuar_(item, alvo) {
  var pontos = 0;
  var motivos = [];

  if (alvo.digitos.length >= 6) {
    if (item.cpfDigitos && item.cpfDigitos === alvo.digitos) { pontos += 1000; motivos.push('CPF'); }
    else if (item.telDigitos && item.telDigitos === alvo.digitos) { pontos += 850; motivos.push('telefone'); }
    else if (item.cpfDigitos && item.cpfDigitos.indexOf(alvo.digitos) >= 0) { pontos += 620; motivos.push('CPF'); }
    else if (item.telDigitos && item.telDigitos.indexOf(alvo.digitos) >= 0) { pontos += 560; motivos.push('telefone'); }
  }

  if (alvo.chave && item.kProntuario) {
    if (item.kProntuario === alvo.chave) { pontos += 900; motivos.push('prontuário'); }
    else if (item.kProntuario.indexOf(alvo.chave) >= 0) { pontos += 500; motivos.push('prontuário'); }
  }

  if (alvo.nascimento && item.nascimento === alvo.nascimento) { pontos += 700; motivos.push('nascimento'); }

  if (alvo.tokens.length) {
    var nomes = item.kNome + ' ' + item.kPreferido;
    if (item.kNome.indexOf(alvo.chave) === 0) { pontos += 640; motivos.push('nome'); }
    else if (nomes.indexOf(alvo.chave) >= 0) { pontos += 420; motivos.push('nome'); }
    else {
      // Todos os pedaços presentes, em qualquer ordem: "silva maria" acha
      // "Maria Aparecida da Silva".
      var todos = alvo.tokens.every(function (t) { return nomes.indexOf(t) >= 0; });
      if (todos) { pontos += 340; motivos.push('nome'); }
      else {
        var quantos = alvo.tokens.filter(function (t) { return t.length >= 3 && nomes.indexOf(t) >= 0; }).length;
        if (quantos) pontos += 120 * quantos;
      }
      if (!pontos && alvo.chave.length >= 3 && item.kCidade.indexOf(alvo.chave) >= 0) {
        pontos += 60; motivos.push('cidade');
      }
    }
  }

  // Desempate: quem tem mais atendimentos costuma ser o procurado.
  if (pontos) pontos += Math.min(20, item.totalAtendimentos * 2);
  return { pontos: pontos, motivos: motivos };
}

/** Projeção enviada à tela: o suficiente para reconhecer, nada além disso. */
function pacPublico_(item, motivos) {
  return {
    paciente_id: item.id,
    prontuario: item.prontuario,
    nome: item.nome,
    nome_preferido: item.preferido,
    iniciais: pacIniciais_(item.nome),
    nascimento: item.nascimento,
    idade: item.idade,
    idade_formatada: idadeFormatada_(item.nascimento, item.idade),
    sexo: item.sexo,
    cidade: item.cidade,
    cpf_mascarado: pacMascararCpf_(item.cpfDigitos),
    telefone_mascarado: pacMascararTelefone_(item.telDigitos),
    total_atendimentos: item.totalAtendimentos,
    ultimo: item.ultimo,
    historico: item.historico,
    encontrado_por: (motivos || []).filter(function (m, i, a) { return a.indexOf(m) === i; })
  };
}

/**
 * Busca de pacientes. Uma caixa, qualquer critério.
 * Termo vazio devolve os últimos atualizados — a lista já nasce útil.
 */
function buscarPacientes(termo, token, limite) {
  return safe_('buscarPacientes', function () {
    requireInstalled_();
    validarSessao_(token);

    var indice = pacIndice_(false);
    var alvo = pacInterpretarTermo_(termo);
    var max = Math.min(Number(limite || CLAV_PAC_BUSCA_LIMITE_), 60);

    if (!alvo.bruto) {
      return ok_({
        termo: '', total: indice.total, recentes: true,
        resultados: indice.itens.slice(0, max).map(function (i) { return pacPublico_(i, ['recente']); })
      });
    }

    var pontuados = [];
    for (var i = 0; i < indice.itens.length; i++) {
      var r = pacPontuar_(indice.itens[i], alvo);
      if (r.pontos > 0) pontuados.push({ item: indice.itens[i], pontos: r.pontos, motivos: r.motivos });
    }
    pontuados.sort(function (a, b) {
      return (b.pontos - a.pontos) || String(a.item.nome).localeCompare(String(b.item.nome));
    });

    return ok_({
      termo: alvo.bruto,
      total: pontuados.length,
      recentes: false,
      resultados: pontuados.slice(0, max).map(function (p) { return pacPublico_(p.item, p.motivos); })
    });
  }, { termo: String(termo || '').slice(0, 40) });
}

/* ============================================================================
 * 3. DEDUPLICAÇÃO
 * ==========================================================================*/

/**
 * Chamado enquanto o nome é digitado num cadastro novo.
 *
 * A duplicidade de paciente é o erro mais caro deste sistema: gera dois
 * prontuários, divide a história clínica e faz o anestesista avaliar alguém
 * com metade dos antecedentes. Barrar na digitação custa uma chamada; corrigir
 * depois custa uma auditoria.
 */
function verificarDuplicidadePaciente(dados, token) {
  return safe_('verificarDuplicidadePaciente', function () {
    requireInstalled_();
    validarSessao_(token);
    dados = dados || {};

    var nome = pacChave_(dados.nome);
    var cpf = digitsOnly_(dados.cpf || '');
    var tel = digitsOnly_(dados.telefone || '');
    var nasc = String(dados.nascimento || '').slice(0, 10);
    var ignorar = String(dados.paciente_id || '');

    if (nome.length < 4 && !cpf && !tel) return ok_({ candidatos: [], nivel: 'nenhum' });

    var indice = pacIndice_(false);
    var candidatos = [];

    indice.itens.forEach(function (item) {
      if (ignorar && item.id === ignorar) return;
      var forca = 0, motivos = [];

      if (cpf && item.cpfDigitos === cpf) { forca = 100; motivos.push('mesmo CPF'); }
      else {
        var mesmoNome = nome && (item.kNome === nome);
        var nomeParecido = nome && !mesmoNome && pacNomesParecidos_(nome, item.kNome);
        if (mesmoNome && nasc && item.nascimento === nasc) { forca = 98; motivos.push('mesmo nome e nascimento'); }
        else if (mesmoNome && tel && item.telDigitos === tel) { forca = 95; motivos.push('mesmo nome e telefone'); }
        else if (mesmoNome) { forca = 78; motivos.push('mesmo nome'); }
        else if (nomeParecido && nasc && item.nascimento === nasc) { forca = 85; motivos.push('nome parecido e mesmo nascimento'); }
        else if (nomeParecido) { forca = 52; motivos.push('nome parecido'); }
        else if (tel && item.telDigitos === tel) { forca = 60; motivos.push('mesmo telefone'); }
      }

      if (forca >= 50) {
        var pub = pacPublico_(item, motivos);
        pub.forca = forca;
        pub.motivo_texto = motivos.join(' · ');
        candidatos.push(pub);
      }
    });

    candidatos.sort(function (a, b) { return b.forca - a.forca; });
    candidatos = candidatos.slice(0, 5);

    var nivel = 'nenhum';
    if (candidatos.length) nivel = candidatos[0].forca >= 90 ? 'alto' : candidatos[0].forca >= 70 ? 'medio' : 'baixo';

    return ok_({ candidatos: candidatos, nivel: nivel });
  }, {});
}

/**
 * Dois nomes são "parecidos" quando compartilham o primeiro nome e o último
 * sobrenome, ou quando um contém o outro. Regra deliberadamente conservadora:
 * é melhor perguntar de menos do que acusar irmãos de serem a mesma pessoa.
 */
function pacNomesParecidos_(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.indexOf(a) >= 0) return true;
  if (b.length >= 8 && a.indexOf(b) >= 0) return true;
  var pa = a.split(' ').filter(Boolean), pb = b.split(' ').filter(Boolean);
  if (pa.length < 2 || pb.length < 2) return false;
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
}

/* ============================================================================
 * 4. ABERTURA DE NOVO ATENDIMENTO A PARTIR DO CADASTRO
 * ==========================================================================*/

/**
 * Entrega o necessário para abrir um novo procedimento de um paciente que já
 * existe, SEM trafegar o payload inteiro do atendimento anterior.
 *
 * O que volta:
 *   paciente  — o cadastro atual (fonte: aba PACIENTES, não o payload antigo)
 *   clinico   — anamnese, revisão por sistemas e via aérea do último
 *               atendimento: história que não muda entre cirurgias
 *   contexto  — convênio e local usados da última vez (sugestão, editável)
 *   historico — cirurgias anteriores, para o anestesista ver de imediato se
 *               é reoperação do mesmo lado
 *
 * O que NÃO volta, de propósito: triagem, exames, avaliação, conduta e
 * intraoperatório. São do episódio anterior e precisam ser refeitos.
 */
function abrirPacienteNovoAtendimento(pacienteId, token) {
  return safe_('abrirPacienteNovoAtendimento', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!pacienteId) throw appError_('PARAMETRO', 'Informe o paciente.');

    var info = findRowBy_('PACIENTES', 'paciente_id', String(pacienteId));
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Cadastro de paciente não encontrado.');

    var p = info.obj;
    var nasc = dataTextoPlanilha_(p.nascimento) || String(p.nascimento || '');

    var paciente = {
      paciente_id: String(p.paciente_id || ''),
      prontuario: String(p.prontuario || ''),
      nome: String(p.nome || ''),
      nome_social: String(p.nome_social || ''),
      nome_preferido: String(p.nome_preferido || p.nome_social || ''),
      nascimento: nasc.slice(0, 10),
      idade: String(p.idade || calcAge_(nasc) || ''),
      sexo: String(p.sexo || ''),
      potencial_gestacional: String(p.potencial_gestacional || ''),
      cpf: String(p.cpf || ''),
      telefone: String(p.telefone || ''),
      email: String(p.email || ''),
      cidade: String(p.cidade || ''),
      contexto_cuidado: String(p.contexto_cuidado || ''),
      observacoes: String(p.observacoes || '')
    };

    // Último atendimento do paciente, pela lista leve.
    var leves = allLite_('ATENDIMENTOS').filter(function (a) {
      return !a._deleted_at && String(a.paciente_id || '') === String(pacienteId);
    });
    leves.sort(function (a, b) {
      return ordemMillis_(b.updated_at, b.created_at) - ordemMillis_(a.updated_at, a.created_at);
    });

    var clinico = { anamnese: {}, sistemas: {}, viaAerea: {} };
    var contexto = { convenio: '', local: '', anestesiologista: '' };
    var origemId = '';

    if (leves.length) {
      // UMA leitura pesada, do lado do servidor, só do registro mais recente.
      var ultimoInfo = findRowBy_('ATENDIMENTOS', 'atendimento_id', String(leves[0].atendimento_id));
      if (ultimoInfo) {
        var payload = normalizePayload_(readPayloadFromRow_(ultimoInfo.obj));
        origemId = String(leves[0].atendimento_id || '');
        if (isMedical_(user)) {
          clinico.anamnese = payload.anamnese || {};
          clinico.sistemas = payload.sistemas || {};
          clinico.viaAerea = payload.viaAerea || {};
        }
        contexto.convenio = (payload.atendimento && payload.atendimento.convenio) || String(leves[0].convenio || '');
        contexto.local = (payload.atendimento && payload.atendimento.local) || String(leves[0].local_procedimento || '');
        contexto.anestesiologista = (payload.preop && payload.preop.anestesiologista) || '';
      }
    }

    var historico = leves.slice(0, 12).map(function (a) {
      return {
        atendimento_id: String(a.atendimento_id || ''),
        procedimento: String(a.procedimento || ''),
        lateralidade: String(a.lateralidade || ''),
        carater: String(a.carater || ''),
        status: String(a.status || ''),
        data_cirurgia: diaLocalPlanilha_(a.data_cirurgia) || '',
        data_consulta: diaLocalPlanilha_(a.data_consulta) || '',
        anestesiologista: String(a.anestesiologista || '')
      };
    });

    try {
      logAudit_(user, 'ABRIR_PACIENTE_NOVO_ATENDIMENTO', 'PACIENTES', String(pacienteId),
        null, { historico: historico.length }, 'OK', '', '');
    } catch (ignored) {}

    return ok_({
      paciente: paciente,
      clinico: clinico,
      contexto: contexto,
      historico: historico,
      origem_atendimento_id: origemId,
      reaproveitaClinico: isMedical_(user)
    });
  }, { pacienteId: pacienteId });
}

/** Linha do tempo cirúrgica do paciente, para exibir no cadastro. */
function historicoPaciente(pacienteId, token) {
  return safe_('historicoPaciente', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!pacienteId) throw appError_('PARAMETRO', 'Informe o paciente.');
    var rows = allLite_('ATENDIMENTOS').filter(function (a) {
      return !a._deleted_at && String(a.paciente_id || '') === String(pacienteId);
    });
    rows.sort(function (a, b) {
      return ordemMillis_(b.data_cirurgia, b.updated_at) - ordemMillis_(a.data_cirurgia, a.updated_at);
    });
    return ok_({
      total: rows.length,
      registros: rows.slice(0, 30).map(function (r) { return publicAtendimentoRow_(r, user); })
    });
  }, { pacienteId: pacienteId });
}

/* ============================================================================
 * 5. EDIÇÃO DO CADASTRO
 * ==========================================================================*/

/**
 * Corrige o cadastro sem abrir um atendimento.
 *
 * Antes, arrumar um nome digitado errado exigia abrir um atendimento inteiro e
 * salvá-lo de novo — o que criava uma revisão nova no prontuário por causa de
 * um acento. Aqui a escrita é só na aba PACIENTES, com auditoria própria.
 *
 * Os atendimentos JÁ SALVOS mantêm o nome como estava na época: é registro
 * clínico, não cadastro vivo. A tela aberta é atualizada pelo retorno.
 */
function salvarCadastroPaciente(dados, token, userAgent) {
  return safe_('salvarCadastroPaciente', function () {
    requireInstalled_();
    var session = validateSessionToken_(token);
    var user = session.user;
    assertCanSave_(user);

    dados = dados || {};
    var pacienteId = String(dados.paciente_id || '');
    if (!pacienteId) throw appError_('PARAMETRO', 'Cadastro sem identificador. Salve o atendimento primeiro.');
    if (!String(dados.nome || '').trim()) throw appError_('PACIENTE_OBRIGATORIO', 'Nome do paciente é obrigatório.');

    var info = findRowBy_('PACIENTES', 'paciente_id', pacienteId);
    if (!info || info.obj._deleted_at) throw appError_('NAO_ENCONTRADO', 'Cadastro de paciente não encontrado.');

    var cpfNovo = digitsOnly_(dados.cpf || '');
    if (cpfNovo && cpfNovo.length !== 11) throw appError_('CPF_INVALIDO', 'CPF deve ter 11 dígitos.');

    // CPF já usado por outro cadastro: bloqueia a fusão silenciosa de pessoas.
    if (cpfNovo) {
      var indice = pacIndice_(true);
      var conflito = null;
      for (var i = 0; i < indice.itens.length; i++) {
        if (indice.itens[i].id !== pacienteId && indice.itens[i].cpfDigitos === cpfNovo) { conflito = indice.itens[i]; break; }
      }
      if (conflito) {
        throw appError_('CPF_DUPLICADO',
          'Este CPF já pertence ao cadastro de ' + conflito.nome + ' (prontuário ' + conflito.prontuario + ').');
      }
    }

    var lock = acquireWriteLock_('salvar cadastro de paciente', 20000);
    try {
      var antes = deepClone_(info.obj);
      var obj = deepClone_(info.obj);

      // v19.9: só altera os campos que o formulário ENVIOU. Antes, corrigir um
      // telefone apagava nome_social e contexto_cuidado (registrados pelo médico),
      // porque o modal não envia esses campos e o código gravava '' no lugar.
      var enviado = function (k) { return Object.prototype.hasOwnProperty.call(dados, k); };
      obj.nome = clean_(dados.nome, 180);
      if (enviado('nome_social')) obj.nome_social = clean_(dados.nome_social || '', 120);
      if (enviado('nome_preferido') || enviado('nome_social')) obj.nome_preferido = clean_(dados.nome_preferido || dados.nome_social || obj.nome_social || '', 120);
      if (enviado('nascimento')) obj.nascimento = String(dados.nascimento || '').slice(0, 10);
      obj.idade = dados.idade || calcAge_(obj.nascimento) || '';
      if (enviado('sexo')) obj.sexo = clean_(dados.sexo || '', 60);
      if (enviado('potencial_gestacional')) obj.potencial_gestacional = clean_(dados.potencial_gestacional || '', 80);
      if (enviado('cpf')) obj.cpf = cpfNovo;
      if (enviado('telefone')) obj.telefone = digitsOnly_(dados.telefone || '');
      if (enviado('email')) obj.email = normalizeEmail_(dados.email || '');
      if (enviado('cidade')) obj.cidade = clean_(dados.cidade || '', 180);
      if (enviado('contexto_cuidado')) obj.contexto_cuidado = clean_(dados.contexto_cuidado || '', 5000);
      if (enviado('observacoes')) obj.observacoes = clean_(dados.observacoes || '', 5000);

      var mudou = patientMeaningfulHash_(antes) !== patientMeaningfulHash_(obj);
      if (!mudou) {
        return ok_({ paciente: pacientePublicoCompleto_(obj), alterado: false });
      }

      obj.updated_at = nowISO_();
      obj.updated_by = user.usuario;
      writeObjectAtRow_('PACIENTES', info.row, obj);
      invalidarIndicePacientes_();

      logAudit_(user, 'EDITAR_CADASTRO_PACIENTE', 'PACIENTES', pacienteId,
        compactAuditSnapshot_(antes), compactAuditSnapshot_(obj), 'OK', userAgent, '');

      return ok_({ paciente: pacientePublicoCompleto_(obj), alterado: true });
    } finally {
      releaseLock_(lock);
    }
  }, { pacienteId: String((dados || {}).paciente_id || '') });
}

/** Cadastro completo devolvido à tela após edição (aqui o CPF vai inteiro,
 *  porque é o formulário do próprio cadastro, já aberto pelo usuário). */
function pacientePublicoCompleto_(obj) {
  var nasc = dataTextoPlanilha_(obj.nascimento) || String(obj.nascimento || '');
  return {
    paciente_id: String(obj.paciente_id || ''),
    prontuario: String(obj.prontuario || ''),
    nome: String(obj.nome || ''),
    nome_social: String(obj.nome_social || ''),
    nome_preferido: String(obj.nome_preferido || ''),
    nascimento: nasc.slice(0, 10),
    idade: String(obj.idade || ''),
    sexo: String(obj.sexo || ''),
    potencial_gestacional: String(obj.potencial_gestacional || ''),
    cpf: String(obj.cpf || ''),
    telefone: String(obj.telefone || ''),
    email: String(obj.email || ''),
    cidade: String(obj.cidade || ''),
    contexto_cuidado: String(obj.contexto_cuidado || ''),
    observacoes: String(obj.observacoes || ''),
    updated_at: dataTextoPlanilha_(obj.updated_at) || ''
  };
}

/** Força a reconstrução do índice. Útil após importação em massa na planilha. */
function reindexarPacientes(token) {
  return safe_('reindexarPacientes', function () {
    requireInstalled_();
    validarSessao_(token);
    invalidarIndicePacientes_();
    var indice = pacIndice_(true);
    return ok_({ total: indice.total, geradoEm: indice.geradoEm });
  }, {});
}
