/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 00_Config.gs
 * Configuração central, identidade institucional e esquema da planilha
 *
 * Conteúdo: CLAV (constantes, SHEETS), CLAV_RUNTIME, FAIXAS_SV_CLAV e o leitor
 * das faixas (classificarSinaisVitais_ e auxiliares sv*_), getWebAppUrl_,
 * clientRuntimeConfig_.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

/**
 * CLAV | Sistema Perioperatório para Grupo de Anestesiologistas
 * Versão Q200 perioperatória, com documentação CFM, alertas auditáveis e PDF tabular
 *
 * Arquitetura desta versão:
 *   - instalação somente por função administrativa explícita;
 *   - login por telefone, e-mail ou usuário, sem alterar senha durante o login;
 *   - senha com hash salgado estável, independente de "pepper" volátil;
 *   - sessão persistente em SESSOES, com CacheService apenas como acelerador;
 *   - rascunho automático exclusivamente no navegador a cada 30 segundos;
 *   - gravação na planilha somente por ação explícita do usuário;
 *   - salvamento idempotente, com revisão e detecção de conflito;
 *   - payload JSON dividido em colunas para respeitar o limite de célula do Sheets;
 *   - histórico criado apenas em salvamentos/ações explícitas.
 */

var CLAV = {
  APP_NAME: 'CLAV | Sistema Perioperatório',
  SHORT_NAME: 'CLAV Anestesia',
  // Identidade institucional centralizada. O rótulo "Prontuário" e os cabeçalhos
  // de documentos usam estes valores; para vender o sistema a outra equipe basta
  // ajustar aqui ou sobrescrever pelas chaves NOME_INSTITUICAO / CIDADE_INSTITUICAO
  // na aba CONFIG da planilha, sem alterar código.
  NOME_INSTITUICAO: 'Clínica de Anestesiologia de Vacaria',
  CIDADE_INSTITUICAO: 'Vacaria/RS',
  VERSION: '2026.09.28-clav-perioperatorio-v19.9-ficha-sessao-integridade-alertas',
  // Catálogo não mudou neste patch; evita sincronização só por mudança do build.
  CATALOG_VERSION: '2026.09.08-clav-perioperatorio-cfm-q200-v18.2-revisao-adversarial-auditada',
  SCHEMA_VERSION: '8',
  CATALOG_SYNC_PROP: 'CLAV_CATALOGO_SYNC_V18',
  SCHEMA_MIGRATED_PROP: 'CLAV_SCHEMA_MIGRATED_V8',
  BATE_ESCALA_TRIGGER_FN: 'enviarBateEscalaDiario',
  TZ: 'America/Sao_Paulo',
  DB_PROP: 'CLAV_PERIOPERATORIO_DB_ID',
  INSTALL_READY_PROP: 'CLAV_INSTALL_READY_V3',
  INSTALLATION_ID_PROP: 'CLAV_INSTALLATION_ID_V3',
  ROOT_FOLDER_PROP: 'CLAV_ROOT_FOLDER_ID',
  EXPORTS_FOLDER_PROP: 'CLAV_EXPORTS_FOLDER_ID',
  // O número de rodadas fica GRAVADO junto do algoritmo em cada usuário
  // ("SHA256-ITER-PEPPER-V2:120"). Assim ele pode ser ajustado a qualquer
  // momento sem invalidar as senhas já existentes.
  PASSWORD_ALGORITHM: 'SHA256-ITER-PEPPER-V2',
  PASSWORD_ALGORITHM_LEGACY: 'SHA256-SALT-APS-V1',
  PASSWORD_ITERATIONS: 120,
  PASSWORD_ITERATIONS_MAX: 400,
  PEPPER_PROP: 'CLAV_PEPPER_V2',
  TOKEN_MINUTES: 720,
  TOKEN_REFRESH_MINUTES: 120,
  SESSION_CACHE_PREFIX: 'CLAV_SESS_V5_',
  SESSION_CACHE_SECONDS: 21600,
  RESET_CODE_MINUTES: 15,
  RESET_MAX_ATTEMPTS: 5,
  RESET_MIN_INTERVAL_SECONDS: 120,
  AUDIT_LOGIN_TO_SHEET: false,
  LOCAL_AUTOSAVE_SECONDS: 30,
  PAYLOAD_CHUNK_SIZE: 45000,
  PAYLOAD_CHUNK_COUNT: 5,
  ROOT_FOLDER_NAME: 'CLAV | Sistema Perioperatório',
  EXPORTS_FOLDER_NAME: 'PDFs e Exportações',
  DRIVE_EDITORS: ['receituarioilustrado@gmail.com', 'contatoclavrs@gmail.com'],
  LOGO_URL: 'https://raw.githubusercontent.com/receitailustrada/logo/refs/heads/main/clav-logotipo-fundo-branco.png',
  MAIN_COLOR: '#1e574e',
  SHEETS: {
    CONFIG: {
      color: '#dbeafe',
      pk: 'chave',
      headers: ['chave', 'valor', 'descricao', 'updated_at', 'updated_by']
    },
    USUARIOS: {
      color: '#dcfce7',
      pk: 'usuario_id',
      headers: [
        'usuario_id', 'usuario', 'nome', 'perfil', 'crm', 'rqe', 'email', 'telefone',
        'senha_hash', 'senha_salt', 'senha_algoritmo', 'auth_version', 'ativo',
        'ultimo_login', 'created_at', 'updated_at', '_deleted_at'
      ]
    },
    SESSOES: {
      color: '#e2e8f0',
      pk: 'sessao_id',
      headers: ['sessao_id', 'usuario_id', 'usuario', 'token_hash', 'auth_version', 'created_at', 'expires_at', 'revoked_at', 'user_agent']
    },
    RECUPERACOES: {
      color: '#fce7f3',
      pk: 'reset_id',
      headers: ['reset_id', 'usuario_id', 'login_hash', 'code_hash', 'email_destino', 'created_at', 'expires_at', 'attempts', 'consumed_at', 'status', 'user_agent']
    },
    PACIENTES: {
      color: '#ccfbf1',
      pk: 'paciente_id',
      headers: ['paciente_id', 'prontuario', 'nome', 'nome_social', 'nome_preferido', 'nascimento', 'idade', 'sexo', 'potencial_gestacional', 'cpf', 'telefone', 'email', 'cidade', 'contexto_cuidado', 'observacoes', 'created_at', 'created_by', 'updated_at', 'updated_by', '_deleted_at']
    },
    ATENDIMENTOS: {
      color: '#fef3c7',
      pk: 'atendimento_id',
      // Colunas planas (prontuario..clav_score) existem para que listagem,
      // busca, agenda e dashboard NUNCA precisem ler as colunas payload_json,
      // que chegam a 225 KB por linha. Ver correcao 13 da revisao.
      headers: [
        'atendimento_id', 'paciente_id', 'paciente_nome', 'data_consulta', 'data_cirurgia', 'status',
        'procedimento', 'lateralidade', 'carater', 'tipo_cirurgia', 'convenio', 'local_procedimento', 'cirurgiao',
        'anestesiologista', 'triagem_concluida_em', 'beta_hcg_status',
        'prontuario', 'nome_preferido', 'cidade', 'imc', 'pa', 'fr', 'clav_score',
        'conclusao', 'data_avaliacao', 'triagem_responsavel', 'porte',
        'alertas_json',
        'payload_json', 'payload_json_2', 'payload_json_3', 'payload_json_4', 'payload_json_5',
        'payload_hash', 'revision', 'last_request_id', 'locked',
        'created_at', 'created_by', 'updated_at', 'updated_by', '_deleted_at'
      ]
    },
    HISTORICO: {
      color: '#e0e7ff',
      pk: 'versao_id',
      headers: [
        'versao_id', 'atendimento_id', 'revision', 'payload_hash',
        'payload_json', 'payload_json_2', 'payload_json_3', 'payload_json_4', 'payload_json_5',
        'saved_at', 'saved_by', 'request_id', 'acao'
      ]
    },
    OPERACOES: {
      color: '#fce7f3',
      pk: 'request_id',
      headers: ['request_id', 'operacao', 'entity_id', 'revision', 'result_json', 'created_at', 'usuario_id']
    },
    INCIDENTES: {
      color: '#fee2e2',
      pk: 'incidente_id',
      headers: ['incidente_id', 'atendimento_id', 'paciente_id', 'categoria', 'gravidade', 'descricao', 'conduta', 'status', 'created_at', 'created_by', 'updated_at', 'updated_by', '_deleted_at']
    },
    EXPORTACOES: {
      color: '#ede9fe',
      pk: 'exportacao_id',
      headers: ['exportacao_id', 'atendimento_id', 'tipo', 'arquivo_nome', 'arquivo_url', 'hash_documental', 'created_at', 'created_by']
    },
    AUDITORIA: {
      color: '#f1f5f9',
      pk: 'audit_id',
      headers: ['audit_id', 'timestamp', 'usuario_id', 'usuario', 'perfil', 'acao', 'entidade', 'entidade_id', 'antes_json', 'depois_json', 'resultado', 'user_agent', 'trace_id']
    },
    PROFISSIONAIS: {
      color: '#d1fae5',
      pk: 'nome',
      headers: ['nome', 'grupo', 'ativo', 'ordem']
    },
    PROCEDIMENTOS: {
      color: '#fef9c3',
      pk: 'nome',
      // lateralidade: SIDE (direita/esquerda), BIL (bilateral) ou NA (não se aplica).
      // carater: sugestão mais provável (Eletivo, Urgência, Emergência, Tempo sensível).
      // porte: Pequeno / Médio / Grande (quando conhecido). Tudo editável na aba.
      headers: ['nome', 'grupo', 'ativo', 'ordem', 'lateralidade', 'carater', 'porte']
    },
    CONVENIOS: {
      color: '#e0f2fe',
      pk: 'nome',
      headers: ['nome', 'ativo', 'ordem']
    },
    MEDICACOES: {
      color: '#fae8ff',
      pk: 'nome',
      headers: ['nome', 'grupo', 'ativo', 'ordem']
    },
    MUNICIPIOS: {
      color: '#ecfccb',
      pk: 'nome',
      headers: ['nome', 'uf', 'ativo']
    },
    // v19.4 — Chamados de suporte abertos pela equipe de dentro do sistema
    // (29_Chamados.gs). A aba nasce sozinha no primeiro chamado; status e
    // resolução são preenchidos à mão pelo suporte, na própria planilha.
    CHAMADOS: {
      color: '#ffedd5',
      pk: 'chamado_id',
      headers: [
        'chamado_id', 'created_at', 'usuario_id', 'usuario', 'nome', 'perfil',
        'categorias', 'urgencia', 'frequencia', 'descricao', 'atendimento_id', 'tela', 'build',
        'contexto_json', 'anexos_json', 'email_status', 'email_destino', 'status',
        'request_id', 'user_agent', 'resolvido_em', 'resolucao'
      ]
    }
  }
};

var CLAV_RUNTIME = {
  spreadsheet: null,
  sheets: {}
};

/**
 * v19.6.1 — Faixas de referência dos sinais vitais da triagem (adulto, 18 anos
 * ou mais). Fonte única dos limites: o navegador recebe este objeto por
 * clientRuntimeConfig_ (chave faixasSv) e não guarda cópia própria; o servidor
 * usa o mesmo objeto em classificarSinaisVitais_ (12_Calculos.gs) e nos casos
 * de teste testarFaixasSV_ (99_Diagnostico.gs).
 *
 * São valores iniciais para confirmação e ajuste pela equipe. Ao alterar
 * qualquer número, mude também "versao": a classificação gravada em
 * triagem.sv_classificacao (payload_json) carrega a versão usada, para que
 * registros antigos continuem interpretáveis.
 *
 * Leitura de cada variável:
 *   normal         [mínimo, máximo] inclusivos → "Normal";
 *   atencao_acima  acima do normal e até este valor → "Atenção"; acima dele →
 *                  "Crítico"; null = qualquer valor acima do normal é crítico;
 *   atencao_abaixo abaixo do normal e a partir deste valor → "Atenção"; abaixo
 *                  dele → "Crítico"; null = qualquer valor abaixo é crítico;
 *   plausivel      [mínimo, máximo]; fora disso → "Conferir valor digitado"
 *                  (provável erro de digitação; o registro guarda que não foi
 *                  conferido);
 *   sem_critico    true → fora do normal é sempre "Atenção" (IMC);
 *   normal null    só plausibilidade (peso, altura).
 * PAD maior ou igual à PAS é tratada como implausível (provável inversão).
 * Menor de 18 anos: sem faixa (tabela pediátrica ainda não configurada).
 */
var FAIXAS_SV_CLAV = {
  versao: '2026.09.26-adulto-v1',
  idade_adulto: 18,
  obrigatorios: ['pa', 'fc', 'fr', 'spo2', 'peso', 'altura'],
  adulto: {
    pas:         { rotulo: 'PAS',    unidade: 'mmHg', normal: [90, 139],    atencao_acima: 179,  atencao_abaixo: null, plausivel: [50, 300] },
    pad:         { rotulo: 'PAD',    unidade: 'mmHg', normal: [60, 89],     atencao_acima: 109,  atencao_abaixo: 50,   plausivel: [20, 200] },
    fc:          { rotulo: 'FC',     unidade: 'bpm',  normal: [50, 100],    atencao_acima: 120,  atencao_abaixo: 40,   plausivel: [20, 250] },
    fr:          { rotulo: 'FR',     unidade: 'irpm', normal: [12, 20],     atencao_acima: 24,   atencao_abaixo: 10,   plausivel: [4, 60] },
    spo2:        { rotulo: 'SpO₂',   unidade: '%',    normal: [95, 100],    atencao_acima: null, atencao_abaixo: 90,   plausivel: [50, 100] },
    temperatura: { rotulo: 'Temp',   unidade: '°C',   normal: [36.0, 37.2], atencao_acima: 37.7, atencao_abaixo: 35.0, plausivel: [30, 43] },
    peso:        { rotulo: 'Peso',   unidade: 'kg',   normal: null, plausivel: [2, 350] },
    altura:      { rotulo: 'Altura', unidade: 'cm',   normal: null, plausivel: [45, 230] },
    imc:         { rotulo: 'IMC',    unidade: '',     normal: [18.5, 24.9], atencao_acima: 90,   atencao_abaixo: 10,   plausivel: [10, 90], sem_critico: true }
  }
};

/* ===========================================================================
 * SINAIS VITAIS DA TRIAGEM — leitura e classificação por faixas (v19.6.1)
 * ---------------------------------------------------------------------------
 * Motivo: em produção, a triagem com PA 180/80, FC 140, FR 28, SpO2 86 e
 * Temp 39,1 saía como "Sinais vitais completos e dentro das faixas esperadas".
 * A verificação anterior só testava preenchimento e plausibilidade ampla, e
 * Number("180/80") e Number("39,1") devolvem NaN, que nunca dispara comparação.
 *
 * Regras deste bloco:
 *   - completo não é normal: preenchimento e faixa são verificações separadas;
 *   - todo valor é lido por expressão explícita e testado com isFinite antes
 *     de qualquer comparação; o que não pôde ser lido fica "nao_interpretado"
 *     e nunca conta como normal;
 *   - os limites vêm de FAIXAS_SV_CLAV (00_Config.gs); este código não guarda
 *     nenhum número de referência;
 *   - menor de 18 anos: "sem_faixa" (tabela pediátrica ainda não configurada);
 *   - valor fora da faixa não bloqueia salvamento; valor implausível recebe
 *     "Conferir valor digitado".
 *
 * Status por variável: normal | atencao | critico | implausivel |
 *                      nao_interpretado | sem_faixa | vazio
 * Nível do resumo:     critico | atencao | neutro | normal | vazio
 *
 * O mesmo código roda no navegador (Index.html, mesmas funções sem o sufixo
 * "_"); os doze casos de testarFaixasSV_ (99_Diagnostico.gs) valem para os dois.
 * ========================================================================= */

/** Decimal com vírgula ou ponto; aceita unidade ao final ("39,1 °C", "98%"). */
function svLerDecimal_(valor) {
  if (valor === undefined || valor === null) return NaN;
  if (typeof valor === 'number') return isFinite(valor) ? valor : NaN;
  var texto = String(valor).trim().replace(/\s+/g, ' ');
  var m = texto.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:[a-zA-Z°%ºª\/]+)?$/);
  if (!m) return NaN;
  var n = Number(m[1].replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

/** PA em "180/80", "180x80", "180 x 80", "180-80" ou "180 80".
 *  v19.9: a forma abreviada usada pela equipe ("12/8", "18/8") é lida como
 *  120/80 e 180/80 quando PAS ≤ 30 e PAD ≤ 20; o resultado marca "abreviada"
 *  para a tela e o PDF dizerem de onde o número saiu. Antes "18/8" virava
 *  "Conferir" cinza e um hipertenso passava sem vermelho. */
function svLerPa_(valor) {
  var texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (!texto) return { ok: false, vazio: true, pas: NaN, pad: NaN, texto: '' };
  var m = texto.replace(/mmhg/i, '').trim().match(/^(\d{1,3})\s*[\/xX×\-\s]\s*(\d{1,3})$/);
  if (!m) return { ok: false, vazio: false, pas: NaN, pad: NaN, texto: texto };
  var pas = Number(m[1]), pad = Number(m[2]), abreviada = false;
  if (pas > 0 && pas <= 30 && pad <= 20) { pas = pas * 10; pad = pad * 10; abreviada = true; }
  return { ok: true, vazio: false, pas: pas, pad: pad, texto: texto, abreviada: abreviada };
}

/** Altura em metros ou centímetros; abaixo de 3 é metro ("1,85" → 185 cm). */
function svLerAlturaCm_(valor) {
  var n = svLerDecimal_(valor);
  if (!isFinite(n)) return NaN;
  if (n < 3) n = n * 100;
  return Math.round(n * 100) / 100;
}

/** Número em português para texto de tela e resumo ("39,1"). */
function svFmtNumero_(n) {
  if (n === undefined || n === null || n === '' || !isFinite(Number(n))) return '';
  var texto = String(Number(n));
  return texto.replace('.', ',');
}

/** Etiqueta curta exibida ao lado do campo. */
function svRotulo_(status) {
  switch (status) {
    case 'normal': return 'Normal';
    case 'atencao': return 'Atenção';
    case 'critico': return 'Crítico';
    case 'implausivel': return 'Conferir';
    case 'nao_interpretado': return 'Conferir';
    case 'sem_faixa': return 'Sem faixa';
    default: return '';
  }
}

/** Pior entre dois status já classificados (crítico > atenção > normal). */
function svPiorStatus_(a, b) {
  var ordem = { vazio: 0, normal: 1, sem_faixa: 2, nao_interpretado: 3, implausivel: 4, atencao: 5, critico: 6 };
  return (ordem[a] || 0) >= (ordem[b] || 0) ? a : b;
}

/**
 * Classifica um número contra uma faixa de FAIXAS_SV_CLAV.
 *   plausivel [mín, máx] fora → implausivel;
 *   normal [mín, máx] dentro → normal;
 *   acima do normal e até atencao_acima → atencao; acima disso → critico;
 *   abaixo do normal e a partir de atencao_abaixo → atencao; abaixo disso → critico;
 *   sem_critico: true → fora do normal é sempre atencao (IMC);
 *   normal null → só plausibilidade (peso, altura): plausível conta como normal.
 */
function svClassificarNumero_(numero, faixa) {
  if (!isFinite(numero)) return 'nao_interpretado';
  if (!faixa) return 'sem_faixa';
  var pl = faixa.plausivel;
  if (pl && (numero < pl[0] || numero > pl[1])) return 'implausivel';
  if (!faixa.normal) return 'normal';
  if (numero >= faixa.normal[0] && numero <= faixa.normal[1]) return 'normal';
  var temAcima = faixa.atencao_acima !== null && faixa.atencao_acima !== undefined && isFinite(Number(faixa.atencao_acima));
  var temAbaixo = faixa.atencao_abaixo !== null && faixa.atencao_abaixo !== undefined && isFinite(Number(faixa.atencao_abaixo));
  if (numero > faixa.normal[1]) {
    if (temAcima && numero <= Number(faixa.atencao_acima)) return 'atencao';
    return faixa.sem_critico ? 'atencao' : 'critico';
  }
  if (temAbaixo && numero >= Number(faixa.atencao_abaixo)) return 'atencao';
  return faixa.sem_critico ? 'atencao' : 'critico';
}

/** Classe do IMC (OMS, adulto). */
function svClasseImc_(imc) {
  if (!isFinite(imc) || imc <= 0) return '';
  if (imc < 18.5) return 'Baixo peso';
  if (imc < 25) return 'Eutrofia';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade I';
  if (imc < 40) return 'Obesidade II';
  return 'Obesidade III';
}

/**
 * Classificação completa da triagem.
 *   triagem: { pa, fc, fr, spo2, temperatura, peso, altura } (textos da tela)
 *   idade:   número em anos, ou null/'' quando desconhecida (tratada como adulto)
 *   faixas:  FAIXAS_SV_CLAV (servidor) ou o mesmo objeto recebido pela
 *            configuração do sistema (navegador). Sem faixas → nada é verde.
 * Devolve { versao_faixas, idade, pediatrico, itens, achados, contagem,
 *           faltando, nivel, titulo, texto, completo }.
 */
function classificarSinaisVitais_(triagem, idade, faixas) {
  triagem = triagem || {};
  faixas = (faixas && typeof faixas === 'object') ? faixas : null;
  var tabela = faixas && faixas.adulto && typeof faixas.adulto === 'object' ? faixas.adulto : null;
  var idadeNum = (idade === '' || idade === null || idade === undefined) ? NaN : Number(String(idade).replace(/[^\d.]/g, ''));
  var idadeOk = isFinite(idadeNum);
  var idadeAdulto = faixas && isFinite(Number(faixas.idade_adulto)) ? Number(faixas.idade_adulto) : 18;
  var pediatrico = idadeOk && idadeNum < idadeAdulto;
  var obrigatorios = faixas && Array.isArray(faixas.obrigatorios) ? faixas.obrigatorios : ['pa', 'fc', 'fr', 'spo2', 'peso', 'altura'];

  var itens = {};
  var achados = [];
  var contagem = { critico: 0, atencao: 0, implausivel: 0, nao_interpretado: 0, sem_faixa: 0, vazio: 0, normal: 0 };
  var faltando = [];
  var temValor = false;

  function bruto(chave) { var v = triagem[chave]; return v === undefined || v === null ? '' : String(v).trim(); }
  function faixaDe(chave) { return tabela && tabela[chave] && typeof tabela[chave] === 'object' ? tabela[chave] : null; }
  function referencia(f) {
    if (!f || !f.normal) return '';
    return svFmtNumero_(f.normal[0]) + '–' + svFmtNumero_(f.normal[1]) + (f.unidade ? (f.unidade === '%' ? '' : ' ') + f.unidade : '');
  }
  function registrar(chave, item) {
    itens[chave] = item;
    if (contagem[item.status] !== undefined) contagem[item.status]++;
  }
  function achado(chave, texto, status, motivo) {
    achados.push({ chave: chave, texto: texto, status: status, motivo: motivo || '' });
  }
  function comUnidade(rot, numero, uni) {
    return rot + ' ' + svFmtNumero_(numero) + (uni ? (uni === '%' ? '' : ' ') + uni : '');
  }

  function itemNumerico(chave, rotuloPadrao, unidadePadrao, opcoes) {
    opcoes = opcoes || {};
    var valor = bruto(chave);
    var f = faixaDe(chave);
    var rot = (f && f.rotulo) || rotuloPadrao;
    var uni = f && f.unidade !== undefined ? f.unidade : unidadePadrao;
    var item = { chave: chave, rotulo: rot, valor: valor, numero: null, unidade: uni, status: 'vazio', etiqueta: '', texto: '', referencia: referencia(f), motivo: '', obrigatorio: obrigatorios.indexOf(chave) >= 0 };
    if (!valor) {
      if (item.obrigatorio) faltando.push(rot);
      registrar(chave, item);
      return item;
    }
    temValor = true;
    var numero = opcoes.altura ? svLerAlturaCm_(valor) : svLerDecimal_(valor);
    if (!isFinite(numero)) {
      item.status = 'nao_interpretado';
      item.texto = rot + ' "' + valor + '"';
      item.motivo = 'valor não reconhecido';
      item.etiqueta = svRotulo_(item.status);
      registrar(chave, item);
      achado(chave, item.texto, item.status, item.motivo);
      return item;
    }
    item.numero = numero;
    item.texto = comUnidade(rot, numero, uni);
    if (!f) {
      item.status = 'sem_faixa';
      item.motivo = tabela ? 'sem faixa configurada' : 'faixas de referência não carregadas';
    } else if (pediatrico && !opcoes.soPlausivel) {
      item.status = 'sem_faixa';
      item.motivo = 'faixas pediátricas não configuradas';
    } else {
      item.status = svClassificarNumero_(numero, f);
      if (item.status === 'implausivel') item.motivo = 'fora do plausível (' + svFmtNumero_(f.plausivel[0]) + '–' + svFmtNumero_(f.plausivel[1]) + ')';
      else if (item.status === 'atencao' || item.status === 'critico') item.motivo = 'referência ' + item.referencia;
    }
    item.etiqueta = svRotulo_(item.status);
    // Peso e altura só passam por plausibilidade: quando plausíveis, não recebem etiqueta.
    if (opcoes.soPlausivel && item.status === 'normal') item.etiqueta = '';
    registrar(chave, item);
    if (item.status !== 'normal' && item.status !== 'vazio') achado(chave, item.texto, item.status, item.motivo);
    return item;
  }

  // ---- PA: PAS e PAD lidas separadamente; a PA recebe o pior status. ----
  (function () {
    var valor = bruto('pa');
    var fPas = faixaDe('pas'), fPad = faixaDe('pad');
    var ref = (fPas && fPad && fPas.normal && fPad.normal)
      ? svFmtNumero_(fPas.normal[0]) + '–' + svFmtNumero_(fPas.normal[1]) + '/' + svFmtNumero_(fPad.normal[0]) + '–' + svFmtNumero_(fPad.normal[1]) + ' mmHg'
      : '';
    var item = { chave: 'pa', rotulo: 'PA', valor: valor, pas: null, pad: null, unidade: 'mmHg', status: 'vazio', status_pas: 'vazio', status_pad: 'vazio', etiqueta: '', texto: '', referencia: ref, motivo: '', obrigatorio: obrigatorios.indexOf('pa') >= 0 };
    if (!valor) {
      if (item.obrigatorio) faltando.push('PA');
      registrar('pa', item);
      return;
    }
    temValor = true;
    var lido = svLerPa_(valor);
    if (!lido.ok) {
      item.status = item.status_pas = item.status_pad = 'nao_interpretado';
      item.texto = 'PA "' + valor + '"';
      item.motivo = 'formato não reconhecido (use 120/80)';
      item.etiqueta = svRotulo_(item.status);
      registrar('pa', item);
      achado('pa', item.texto, item.status, item.motivo);
      return;
    }
    item.pas = lido.pas;
    item.pad = lido.pad;
    item.texto = 'PA ' + lido.pas + '/' + lido.pad + ' mmHg' + (lido.abreviada ? ' (digitado "' + valor + '")' : '');
    if (!fPas || !fPad) {
      item.status = item.status_pas = item.status_pad = 'sem_faixa';
      item.motivo = tabela ? 'sem faixa configurada' : 'faixas de referência não carregadas';
      item.etiqueta = svRotulo_(item.status);
      registrar('pa', item);
      achado('pa', item.texto, item.status, item.motivo);
      return;
    }
    if (pediatrico) {
      item.status = item.status_pas = item.status_pad = 'sem_faixa';
      item.motivo = 'faixas pediátricas não configuradas';
      item.etiqueta = svRotulo_(item.status);
      registrar('pa', item);
      achado('pa', item.texto, item.status, item.motivo);
      return;
    }
    item.status_pas = svClassificarNumero_(lido.pas, fPas);
    item.status_pad = svClassificarNumero_(lido.pad, fPad);
    if (lido.pad >= lido.pas) {
      item.status_pad = 'implausivel';
      item.motivo = 'PAD maior ou igual à PAS (provável inversão)';
    }
    if (item.status_pas === 'implausivel' || item.status_pad === 'implausivel') {
      item.status = 'implausivel';
      if (!item.motivo) item.motivo = 'fora do plausível (PAS ' + svFmtNumero_(fPas.plausivel[0]) + '–' + svFmtNumero_(fPas.plausivel[1]) + ', PAD ' + svFmtNumero_(fPad.plausivel[0]) + '–' + svFmtNumero_(fPad.plausivel[1]) + ')';
      item.etiqueta = svRotulo_(item.status);
      registrar('pa', item);
      achado('pa', item.texto, item.status, item.motivo);
      return;
    }
    item.status = svPiorStatus_(item.status_pas, item.status_pad);
    var partes = [];
    if (item.status_pas !== 'normal') { partes.push('PAS ' + lido.pas + ' mmHg'); achado('pas', 'PAS ' + lido.pas + ' mmHg', item.status_pas, 'referência ' + referencia(fPas)); }
    if (item.status_pad !== 'normal') { partes.push('PAD ' + lido.pad + ' mmHg'); achado('pad', 'PAD ' + lido.pad + ' mmHg', item.status_pad, 'referência ' + referencia(fPad)); }
    if (partes.length) item.motivo = partes.join(' · ') + ' (referência ' + ref + ')';
    item.etiqueta = svRotulo_(item.status);
    registrar('pa', item);
  })();

  itemNumerico('fc', 'FC', 'bpm');
  itemNumerico('fr', 'FR', 'irpm');
  itemNumerico('spo2', 'SpO₂', '%');
  itemNumerico('temperatura', 'Temp', '°C');
  var peso = itemNumerico('peso', 'Peso', 'kg', { soPlausivel: true });
  var altura = itemNumerico('altura', 'Altura', 'cm', { soPlausivel: true, altura: true });

  // ---- IMC calculado a partir de peso e altura já lidos. ----
  (function () {
    var f = faixaDe('imc');
    var item = { chave: 'imc', rotulo: 'IMC', valor: '', numero: null, classe: '', unidade: '', status: 'vazio', etiqueta: '', texto: '', referencia: referencia(f), motivo: '', obrigatorio: false };
    var p = peso.numero, a = altura.numero;
    if (isFinite(p) && isFinite(a) && p > 0 && a > 0 && peso.status !== 'implausivel' && altura.status !== 'implausivel') {
      var imc = Math.round((p / ((a / 100) * (a / 100))) * 10) / 10;
      item.numero = imc;
      item.valor = imc.toFixed(1);
      item.classe = svClasseImc_(imc);
      item.texto = 'IMC ' + svFmtNumero_(imc) + (item.classe ? ' (' + item.classe + ')' : '');
      if (!f) { item.status = 'sem_faixa'; item.motivo = tabela ? 'sem faixa configurada' : 'faixas de referência não carregadas'; }
      else if (pediatrico) { item.status = 'sem_faixa'; item.classe = 'Curva de crescimento (OMS/pediatria)'; item.texto = 'IMC ' + svFmtNumero_(imc); item.motivo = 'faixas pediátricas não configuradas'; }
      else {
        item.status = svClassificarNumero_(imc, f);
        if (item.status === 'implausivel') item.motivo = 'fora do plausível (' + svFmtNumero_(f.plausivel[0]) + '–' + svFmtNumero_(f.plausivel[1]) + ')';
        else if (item.status !== 'normal') item.motivo = 'referência ' + item.referencia;
      }
      item.etiqueta = svRotulo_(item.status);
      if (item.status !== 'normal') achado('imc', item.texto, item.status, item.motivo);
    }
    registrar('imc', item);
  })();

  // ---- Resumo do bloco: vermelho > âmbar > cinza > verde. ----
  var criticos = achados.filter(function (x) { return x.status === 'critico'; });
  var atencao = achados.filter(function (x) { return x.status === 'atencao'; });
  var conferir = achados.filter(function (x) { return x.status === 'implausivel'; });
  var naoInterpretados = achados.filter(function (x) { return x.status === 'nao_interpretado'; });
  var semFaixa = achados.filter(function (x) { return x.status === 'sem_faixa'; });
  var lista = function (arr) { return arr.map(function (x) { return x.texto; }).join(' · '); };

  var nivel;
  if (!temValor) nivel = 'vazio';
  else if (criticos.length) nivel = 'critico';
  else if (atencao.length) nivel = 'atencao';
  else if (faltando.length || conferir.length || naoInterpretados.length || semFaixa.length) nivel = 'neutro';
  else nivel = 'normal';

  var frases = [];
  if (nivel === 'vazio') {
    return {
      versao_faixas: faixas && faixas.versao ? String(faixas.versao) : '',
      idade: idadeOk ? idadeNum : null,
      pediatrico: pediatrico,
      faixas_carregadas: !!tabela,
      itens: itens,
      achados: achados,
      contagem: contagem,
      faltando: faltando,
      nivel: nivel,
      titulo: '',
      texto: '',
      completo: false
    };
  }
  if (criticos.length) frases.push('Fora da faixa: ' + lista(criticos) + '.');
  if (atencao.length) frases.push('Atenção: ' + lista(atencao) + '.');
  if (conferir.length) frases.push('Conferir valor digitado: ' + conferir.map(function (x) { return x.texto + (x.motivo ? ' — ' + x.motivo : ''); }).join(' · ') + '.');
  if (naoInterpretados.length) frases.push('Não interpretado: ' + naoInterpretados.map(function (x) { return x.texto + (x.motivo ? ' — ' + x.motivo : ''); }).join(' · ') + '.');
  if (semFaixa.length) {
    if (!tabela) frases.push('Faixas de referência não carregadas — conferir manualmente: ' + lista(semFaixa) + '.');
    else if (pediatrico) frases.push('Faixas pediátricas não configuradas — conferir pela idade (' + svFmtNumero_(idadeNum) + ' anos): ' + lista(semFaixa) + '.');
    else frases.push('Sem faixa configurada: ' + lista(semFaixa) + '.');
  }
  if (faltando.length) frases.push('Faltando: ' + faltando.join(' · ') + '.');
  if (nivel === 'critico') frases.push('Conferir a aferição e registrar a conduta.');
  else if (nivel === 'atencao') frases.push('Reavaliar e registrar.');
  else if (nivel === 'normal') {
    var lidos = ['pa', 'fc', 'fr', 'spo2', 'temperatura'].filter(function (k) { return itens[k] && itens[k].status === 'normal'; }).map(function (k) { return itens[k].texto; });
    frases.push('Sinais vitais completos e dentro das faixas esperadas: ' + lidos.join(' · ') + '.');
  }

  var titulo = '';
  if (nivel === 'critico') titulo = criticos.length + (criticos.length === 1 ? ' crítico' : ' críticos');
  else if (nivel === 'atencao') titulo = atencao.length + ' em atenção';
  else if (nivel === 'neutro') titulo = faltando.length && !conferir.length && !naoInterpretados.length && !semFaixa.length ? 'Incompleta' : (semFaixa.length && !conferir.length && !naoInterpretados.length ? 'Sem faixa' : 'Conferir');
  else if (nivel === 'normal') titulo = 'Sinais normais';

  return {
    versao_faixas: faixas && faixas.versao ? String(faixas.versao) : '',
    idade: idadeOk ? idadeNum : null,
    pediatrico: pediatrico,
    faixas_carregadas: !!tabela,
    itens: itens,
    achados: achados,
    contagem: contagem,
    faltando: faltando,
    nivel: nivel,
    titulo: titulo,
    texto: frases.join(' '),
    completo: faltando.length === 0
  };
}

/** Versão compacta para gravar em triagem.sv_classificacao (payload_json). */
function svClassificacaoParaRegistro_(resultado) {
  if (!resultado || typeof resultado !== 'object') return {};
  var itens = {};
  Object.keys(resultado.itens || {}).forEach(function (chave) {
    var it = resultado.itens[chave] || {};
    var compacto = { status: it.status || 'vazio', valor: it.valor === undefined || it.valor === null ? '' : String(it.valor), etiqueta: it.etiqueta || '', motivo: it.motivo || '' };
    if (chave === 'pa') { compacto.pas = it.pas === null || it.pas === undefined ? '' : it.pas; compacto.pad = it.pad === null || it.pad === undefined ? '' : it.pad; compacto.status_pas = it.status_pas || ''; compacto.status_pad = it.status_pad || ''; }
    else compacto.numero = it.numero === null || it.numero === undefined ? '' : it.numero;
    if (chave === 'imc') compacto.classe = it.classe || '';
    itens[chave] = compacto;
  });
  return {
    versao_faixas: resultado.versao_faixas || '',
    idade: resultado.idade === null || resultado.idade === undefined ? '' : resultado.idade,
    pediatrico: !!resultado.pediatrico,
    faixas_carregadas: !!resultado.faixas_carregadas,
    nivel: resultado.nivel || 'vazio',
    titulo: resultado.titulo || '',
    texto: resultado.texto || '',
    completo: !!resultado.completo,
    contagem: resultado.contagem || {},
    faltando: Array.isArray(resultado.faltando) ? resultado.faltando.slice() : [],
    itens: itens
  };
}

// Retorna a URL pública /exec do Web App. É usada pelo frontend para oferecer
// "Abrir em aba própria" quando a página é detectada rodando dentro de um
// iframe (por exemplo, incorporada em um Google Sites). Nunca lança erro:
// se ScriptApp.getService().getUrl() falhar (ex.: execução fora do contexto
// de Web App), retorna string vazia e o frontend cai de volta em
// window.location.href.
function getWebAppUrl_() {
  try {
    // A URL direta nunca carrega query string ou fragmento. Credenciais são
    // enviadas exclusivamente no canal google.script.run.
    var url = ScriptApp.getService().getUrl() || '';
    return String(url).replace(/[?#].*$/, '');
  } catch (err) {
    return '';
  }
}

/**
 * Configuração leve devolvida ao navegador por google.script.run.
 *
 * Regra importante para Google Sites:
 * o doGet NÃO consulta planilha, Drive, PropertiesService ou qualquer serviço
 * que possa exigir autorização antes de o HTML existir. A página é entregue
 * imediatamente e esta configuração é obtida depois, pela chamada assíncrona
 * inicializar(). Isso evita redirecionamento/autorização dentro do iframe e
 * evita reconstruir todo o Index.html como uma string no servidor.
 */
function clientRuntimeConfig_(status, user) {
  status = status || { installed: false, message: '' };
  var planilhaUrl = '';
  if (user && canOpenSpreadsheet_(user)) {
    try { planilhaUrl = getSpreadsheet_().getUrl(); } catch (ignored) {}
  }
  return {
    nome: CLAV.APP_NAME,
    appName: CLAV.APP_NAME,
    shortName: CLAV.SHORT_NAME,
    versao: CLAV.VERSION,
    version: CLAV.VERSION,
    schemaVersion: CLAV.SCHEMA_VERSION,
    logoUrl: CLAV.LOGO_URL,
    salvamentoPlanilha: 'MANUAL_ONLY',
    spreadsheetSaveMode: 'MANUAL_ONLY',
    rascunhoLocalSegundos: CLAV.LOCAL_AUTOSAVE_SECONDS,
    localAutosaveSeconds: CLAV.LOCAL_AUTOSAVE_SECONDS,
    planilhaUrl: planilhaUrl,
    webAppUrl: getWebAppUrl_(),
    installed: !!status.installed,
    installationMessage: status.message || '',
    now: nowISO_(),
    iframeAllowed: true,
    // v19.6.1: faixas de referência dos sinais vitais da triagem. O navegador
    // classifica com este objeto; sem ele, nenhum valor é mostrado como normal.
    faixasSv: FAIXAS_SV_CLAV
  };
}