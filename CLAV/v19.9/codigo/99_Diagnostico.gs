/**
 * CLAV | DIAGNÓSTICO DE INSTALAÇÃO E TESTES DE REGRAS CLÍNICAS
 *
 * COMO USAR
 *   1. Mantenha este arquivo no projeto com o nome 99_Diagnostico.
 *   2. No seletor de funções, escolha a função desejada e clique em Executar:
 *        - clavConferirArquivos : confere se todos os módulos .gs e HTML existem;
 *        - testarFaixasSV       : roda os casos de teste das faixas de sinais
 *                                 vitais da triagem (v19.6.1) e registra a tabela
 *                                 entrada → esperado → obtido → OK/FALHA;
 *        - testarCatalogoProcedimentos : casos de lateralidade e caráter da
 *                                 inferência pelo nome e da tabela de correções
 *                                 (v19.7), com a mesma tabela OK/FALHA.
 *   3. Leia o resultado em Execuções (ou no alerta, se rodar pela planilha).
 *
 * Nenhuma função aqui escreve na planilha, altera propriedades ou toca em dados
 * de pacientes — é só leitura de escopo e cálculo em memória.
 *
 * Observação: funções terminadas em "_" não aparecem no seletor do editor; por
 * isso as duas funções de diagnóstico têm nome público.
 */

function clavConferirArquivos() {
  var MODULOS = [
  { arquivo: '00_Config.gs', funcao: 'getWebAppUrl_', qtd: 12 },
  { arquivo: '01_WebApp.gs', funcao: 'doGet', qtd: 4 },
  { arquivo: '02_Admin.gs', funcao: 'adminInstalarSistema', qtd: 7 },
  { arquivo: '03_Auth.gs', funcao: 'inicializar', qtd: 5 },
  { arquivo: '04_Atendimentos.gs', funcao: 'salvarAtendimento', qtd: 7 },
  { arquivo: '05_Relatorios.gs', funcao: 'relatorioBateEscala', qtd: 11 },
  { arquivo: '06_Documentos_API.gs', funcao: 'excluirAtendimento', qtd: 5 },
  { arquivo: '07_Usuarios.gs', funcao: 'criarOuAtualizarUsuario', qtd: 1 },
  { arquivo: '08_Planilha_Base.gs', funcao: 'getInstallInfo_', qtd: 11 },
  { arquivo: '09_Seguranca.gs', funcao: 'findUsersForLogin_', qtd: 25 },
  { arquivo: '10_Payload_Clinico.gs', funcao: 'sanitizeOperationalPayload_', qtd: 7 },
  { arquivo: '11_Farmacologia.gs', funcao: 'CLAV_FARMACO_CLASSES_', qtd: 5 },
  { arquivo: '12_Calculos.gs', funcao: 'tokenClav_', qtd: 22 },
  { arquivo: '13_Catalogo.gs', funcao: 'clavTokenProc_', qtd: 16 },
  { arquivo: '14_Dados_Equipe.gs', funcao: 'DEFAULT_PROFISSIONAIS_', qtd: 2 },
  { arquivo: '15_Dados_Procedimentos.gs', funcao: 'DEFAULT_PROCEDIMENTOS_', qtd: 1 },
  { arquivo: '16_Dados_Convenios.gs', funcao: 'DEFAULT_CONVENIOS_', qtd: 1 },
  { arquivo: '17_Dados_Medicacoes.gs', funcao: 'DEFAULT_MEDICACOES_', qtd: 1 },
  { arquivo: '18_Dados_Municipios.gs', funcao: 'DEFAULT_MUNICIPIOS_', qtd: 1 },
  { arquivo: '19_PDF_Core.gs', funcao: 'createTablePdfBlob_', qtd: 20 },
  { arquivo: '20_PDF_Layout.gs', funcao: 'distribuirLargurasPdf_', qtd: 20 },
  { arquivo: '21_PDF_Secoes.gs', funcao: 'buildPdfSections_', qtd: 16 },
  { arquivo: '22_CRUD.gs', funcao: 'sheet_', qtd: 27 },
  { arquivo: '23_Utils.gs', funcao: 'contextoSeguroSalvamento_', qtd: 23 },
  { arquivo: '24_Sessao.gs', funcao: 'createSessionToken_', qtd: 17 },
  { arquivo: '25_Salvamento.gs', funcao: 'normalizeSaveMeta_', qtd: 18 },
  { arquivo: '26_Intraop.gs', funcao: 'intraopAbrirCaso', qtd: 12 },
  { arquivo: '27_Pacientes.gs', funcao: 'pacChave_', qtd: 17 },
  { arquivo: '28_Versao.gs', funcao: 'analisarSistema', qtd: 17 },
  { arquivo: '29_Chamados.gs', funcao: 'abrirChamado', qtd: 10 },
  { arquivo: '30_Catalogo_Correcoes.gs', funcao: 'clavCorrigirItemCatalogo_', qtd: 8 },
  ];

  var faltando = [];
  var presentes = [];

  MODULOS.forEach(function (m) {
    var existe = false;
    try { existe = (typeof this[m.funcao] === 'function'); } catch (e) { existe = false; }
    if (!existe) {
      // Fallback: eval do nome, para o caso de o escopo global não ser 'this'.
      try { existe = (eval('typeof ' + m.funcao) === 'function'); } catch (e2) { existe = false; }
    }
    (existe ? presentes : faltando).push(m);
  });

  var linhas = [];
  linhas.push('CLAV — CONFERENCIA DE ARQUIVOS DO PROJETO');
  linhas.push('Modulos esperados: ' + MODULOS.length);
  linhas.push('Encontrados: ' + presentes.length + '   |   FALTANDO: ' + faltando.length);
  linhas.push('');

  if (faltando.length) {
    linhas.push('>>> ARQUIVOS QUE FALTAM NO PROJETO <<<');
    faltando.forEach(function (m) {
      linhas.push('   FALTA  ' + m.arquivo + '   (' + m.qtd + ' funcoes perdidas; teste: ' + m.funcao + ')');
    });
    linhas.push('');
    linhas.push('Crie cada arquivo acima com o nome EXATO e cole o conteudo correspondente.');
  } else {
    linhas.push('Todos os modulos .gs estao presentes.');
  }

  linhas.push('');
  linhas.push('--- ARQUIVOS HTML (confira a mao no editor) ---');
  ['Index', 'Intra', 'IntraFarmacos'].forEach(function (nome) {
    var ok = false;
    try { HtmlService.createHtmlOutputFromFile(nome); ok = true; } catch (e) { ok = false; }
    linhas.push((ok ? '   ok     ' : '   FALTA  ') + nome + '.html');
  });

  linhas.push('');
  linhas.push('--- ESTADO DA INSTALACAO ---');
  try {
    var props = PropertiesService.getScriptProperties();
    linhas.push('   Esquema migrado: ' + (props.getProperty(CLAV.SCHEMA_MIGRATED_PROP) || '(nao marcado)'));
    linhas.push('   Instalacao pronta: ' + (props.getProperty('CLAV_INSTALL_READY_V3') || '(nao marcado)'));
    linhas.push('   Planilha vinculada: ' + (props.getProperty('CLAV_PERIOPERATORIO_DB_ID') ? 'sim' : 'NAO'));
  } catch (e) {
    linhas.push('   Nao foi possivel ler as propriedades: ' + e.message);
  }

  var texto = linhas.join('\n');
  Logger.log(texto);
  try { SpreadsheetApp.getUi().alert(texto); } catch (semUi) { /* sem interface: fica no log */ }
  return texto;
}

/**
 * v19.6.1 — Casos de teste das faixas de sinais vitais da triagem.
 *
 * Roda classificarSinaisVitais_ (00_Config.gs) com FAIXAS_SV_CLAV sobre os
 * doze casos de referência e registra uma tabela entrada → esperado → obtido →
 * OK/FALHA. O caso 1 é o do print de produção (PA 180/80, FC 140, FR 28,
 * SpO2 86, Temp 39,1), que antes saía como "dentro das faixas esperadas".
 * O navegador roda exatamente o mesmo código (Index.html), portanto um caso
 * que passa aqui passa na tela.
 *
 * Não escreve nada: é cálculo em memória. Resultado no Registro de execução.
 */
function testarFaixasSV() {
  var F = FAIXAS_SV_CLAV;
  var CASOS = [
    { n: 1, nome: 'Print de producao', tri: { pa: '180/80', fc: '140', fr: '28', spo2: '86', temperatura: '39,1', peso: '100', altura: '185' }, idade: 45,
      esperado: { pa: 'critico', fc: 'critico', fr: 'critico', spo2: 'critico', temperatura: 'critico', nivel: 'critico', criticos: 5 } },
    { n: 2, nome: 'Tudo normal', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'normal', fc: 'normal', fr: 'normal', spo2: 'normal', temperatura: 'normal', nivel: 'normal' } },
    { n: 3, nome: 'Tudo atencao', tri: { pa: '150/95', fc: '105', fr: '22', spo2: '93', temperatura: '37,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'atencao', fc: 'atencao', fr: 'atencao', spo2: 'atencao', temperatura: 'atencao', nivel: 'atencao' } },
    { n: 4, nome: 'Criticos baixos', tri: { pa: '80/50', fc: '38', fr: '8', spo2: '89', temperatura: '34,8', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'critico', fc: 'critico', fr: 'critico', spo2: 'critico', temperatura: 'critico', nivel: 'critico' } },
    // v19.9: a forma abreviada da equipe passou a ser lida (18/8 = 180/80, 12/8 = 120/80).
    { n: 5, nome: 'PA 18/8 abreviada = 180/80', tri: { pa: '18/8', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'critico', nivel: 'critico', textoContem: 'PAS 180' } },
    { n: '5b', nome: 'PA 12/8 abreviada = 120/80', tri: { pa: '12/8', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'normal', nivel: 'normal' } },
    { n: 6, nome: 'PA 80/120 inversao', tri: { pa: '80/120', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'implausivel', nivel: 'neutro', textoContem: 'inversão' } },
    { n: 7, nome: 'PA abc', tri: { pa: 'abc', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'nao_interpretado', nivel: 'neutro', naoVerde: true } },
    { n: '8a', nome: 'Temp 39,1', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '39,1', peso: '70', altura: '170' }, idade: 45,
      esperado: { temperatura: 'critico', tempNumero: 39.1, nivel: 'critico' } },
    { n: '8b', nome: 'Temp 39.1', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '39.1', peso: '70', altura: '170' }, idade: 45,
      esperado: { temperatura: 'critico', tempNumero: 39.1, nivel: 'critico' } },
    { n: '9a', nome: 'Altura 1,85 e peso 100', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '100', altura: '1,85' }, idade: 45,
      esperado: { alturaCm: 185, imc: '29.2', imcClasse: 'Sobrepeso' } },
    { n: '9b', nome: 'Altura 185 e peso 100', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '100', altura: '185' }, idade: 45,
      esperado: { alturaCm: 185, imc: '29.2', imcClasse: 'Sobrepeso' } },
    { n: 10, nome: 'Idade 8 anos, FC 110', tri: { pa: '100/60', fc: '110', fr: '20', spo2: '98', temperatura: '36,5', peso: '25', altura: '125' }, idade: 8,
      esperado: { fc: 'sem_faixa', nivel: 'neutro', naoVerde: true, textoContem: 'pediátricas' } },
    { n: 11, nome: 'SpO2 vazio', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { spo2: 'vazio', completo: false, naoVerde: true, textoContem: 'Faltando' } },
    { n: 12, nome: 'PA 180/115', tri: { pa: '180/115', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'critico', status_pas: 'critico', status_pad: 'critico', nivel: 'critico' } },
    { n: 'E1', nome: 'Sem faixas carregadas', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45, semFaixas: true,
      esperado: { pa: 'sem_faixa', nivel: 'neutro', naoVerde: true } },
    { n: 'E2', nome: 'Idade desconhecida = adulto', tri: { pa: '180/80', fc: '140', fr: '28', spo2: '86', temperatura: '39,1', peso: '100', altura: '185' }, idade: '',
      esperado: { pa: 'critico', nivel: 'critico' } },
    { n: 'E3', nome: 'Separador "180 x 80"', tri: { pa: '180 x 80', fc: '72', fr: '16', spo2: '98', temperatura: '36,5', peso: '70', altura: '170' }, idade: 45,
      esperado: { pa: 'critico', nivel: 'critico' } },
    { n: 'E4', nome: 'Nada preenchido', tri: {}, idade: 45,
      esperado: { nivel: 'vazio' } },
    { n: 'E5', nome: 'Temp vazia (opcional), resto normal', tri: { pa: '120/80', fc: '72', fr: '16', spo2: '98', temperatura: '', peso: '70', altura: '170' }, idade: 45,
      esperado: { temperatura: 'vazio', nivel: 'normal', completo: true } }
  ];

  function obter(r, chave, esperado) {
    if (['pa', 'fc', 'fr', 'spo2', 'temperatura'].indexOf(chave) >= 0) return r.itens[chave].status;
    if (chave === 'nivel') return r.nivel;
    if (chave === 'criticos') return r.achados.filter(function (x) { return x.status === 'critico'; }).length;
    if (chave === 'textoContem') return String(r.texto).indexOf(esperado) >= 0 ? esperado : r.texto;
    if (chave === 'naoVerde') return r.nivel !== 'normal';
    if (chave === 'tempNumero') return r.itens.temperatura.numero;
    if (chave === 'alturaCm') return r.itens.altura.numero;
    if (chave === 'imc') return r.itens.imc.valor;
    if (chave === 'imcClasse') return r.itens.imc.classe;
    if (chave === 'completo') return r.completo;
    if (chave === 'status_pas') return r.itens.pa.status_pas;
    if (chave === 'status_pad') return r.itens.pa.status_pad;
    return undefined;
  }

  var linhas = [];
  var falhas = 0;
  linhas.push('CLAV — TESTE DAS FAIXAS DE SINAIS VITAIS (faixas ' + F.versao + ')');
  linhas.push('caso | entrada | esperado | obtido | resultado');
  CASOS.forEach(function (c) {
    var r = classificarSinaisVitais_(c.tri, c.idade, c.semFaixas ? null : F);
    var problemas = [];
    var esperadoTxt = [], obtidoTxt = [];
    Object.keys(c.esperado).forEach(function (k) {
      var e = c.esperado[k];
      var o = obter(r, k, e);
      esperadoTxt.push(k + '=' + JSON.stringify(e));
      obtidoTxt.push(k + '=' + JSON.stringify(o));
      if (o !== e) problemas.push(k + ': esperado ' + JSON.stringify(e) + ', obtido ' + JSON.stringify(o));
    });
    if (problemas.length) falhas++;
    var entrada = Object.keys(c.tri).map(function (k) { return k + ' ' + c.tri[k]; }).join(', ') + (c.idade !== undefined && c.idade !== '' ? ', idade ' + c.idade : ', idade ?') + (c.semFaixas ? ', sem faixas' : '');
    linhas.push(c.n + ' ' + c.nome + ' | ' + entrada + ' | ' + esperadoTxt.join(' ') + ' | ' + obtidoTxt.join(' ') + ' | ' + (problemas.length ? 'FALHA — ' + problemas.join('; ') : 'OK'));
    linhas.push('     tela: ' + (r.titulo || '(sem chip)') + ' — ' + (r.texto || '(sem resumo)'));
  });
  linhas.push('');
  linhas.push((CASOS.length - falhas) + ' OK / ' + falhas + ' FALHA(S)' + (falhas ? '  >>> NAO IMPLANTAR ATE CORRIGIR' : '  — pronto para implantar'));
  var texto = linhas.join('\n');
  Logger.log(texto);
  try { SpreadsheetApp.getUi().alert(texto); } catch (semUi) { /* sem interface: fica no log */ }
  return texto;
}

/**
 * v19.7 — Casos de teste do catálogo de procedimentos (lateralidade e caráter).
 *
 * Roda clavInferirLateralidade_/clavInferirCarater_ (13_Catalogo.gs, bloco
 * espelhado no Index.html) e clavCorrigirItemCatalogo_ (30_Catalogo_Correcoes.gs)
 * sobre os casos relatados em produção: ooforectomia bilateral que travava o
 * encerramento, ureterolitotripsia e nefrolitotripsia "sem lateralidade",
 * "Ruptura de Manguito Rotador" como urgência. Não escreve nada.
 */
function testarCatalogoProcedimentos() {
  var CASOS_LAT = [
    ['Ooforectomia Laparoscópica', 'SIDE'], ['Ooforectomia por Laparotomia', 'SIDE'], ['Cistectomia ovariana', 'SIDE'],
    ['Salpingectomia por gestação ectópica estável', 'SIDE'], ['Cirurgia para Gravidez Ectópica Via Laparotomia', 'SIDE'],
    ['Ureterolitotripsia Flexível', 'SIDE'], ['Ureterolitotripsia Rígida', 'SIDE'], ['Nefrolitotripsia Extracorpórea', 'SIDE'],
    ['Ureteronefrolitotripsia Flexível', 'SIDE'], ['Ureterolitotripsia + Cistolitotripsia', 'SIDE'], ['Colocação de cateter duplo J', 'SIDE'],
    ['Adrenalectomia por Laparotomia', 'SIDE'], ['Drenagem torácica fechada', 'SIDE'], ['Mastoidectomia', 'SIDE'], ['Hemitiroidectomia', 'SIDE'],
    ['Cistolitotripsia', 'NA'], ['Litotripsia vesical endoscópica', 'NA'], ['Histerectomia Total Via Abdominal + Anexectomia', 'NA'],
    ['Laqueadura Tubária Videolaparoscópica', 'NA'], ['Hernioplastia Umbilical', 'NA'], ['Videocolecistectomia', 'NA'], ['Colonoscopia', 'NA'],
    ['Videoartroscopia de Quadril Bilateral', 'BIL'], ['Ureteroscopia bilateral', 'BIL'],
    ['Hernioplastia Inguinal Laparoscópica', 'SIDE'], ['Fratura de Tornozelo', 'SIDE'], ['Facectomia do Olho', 'SIDE']
  ];
  var CASOS_CAR = [
    ['Ruptura de Manguito Rotador do Ombro', 'Eletivo'], ['Ruptura de tendão de Aquiles', 'Eletivo'], ['Ruptura de baço', 'Urgência'],
    ['Hérnia Inguinal Estrangulada', 'Emergência'], ['Hérnia Inguinal Encarcerada', 'Urgência'], ['Fratura de Tornozelo', 'Urgência'],
    ['Videocolecistectomia', 'Eletivo'], ['Mastectomia Total', 'Tempo sensível'], ['Laparotomia Exploradora', 'Emergência']
  ];
  var CASOS_TAB = [
    [{ nome: 'Ruptura de Manguito Rotador do Ombro', lateralidade: 'SIDE', carater: 'Urgência' }, 'SIDE', 'Eletivo', 'valor semeado corrigido'],
    [{ nome: 'Ruptura de Manguito Rotador do Ombro', lateralidade: 'SIDE', carater: 'Tempo sensível' }, 'SIDE', 'Tempo sensível', 'valor editado pela equipe respeitado'],
    [{ nome: 'Ooforectomia Laparoscópica', lateralidade: 'NA', carater: 'Eletivo' }, 'SIDE', 'Eletivo', 'lateralidade semeada NA vira SIDE'],
    [{ nome: 'Ooforectomia Laparoscópica', lateralidade: 'BIL', carater: 'Eletivo' }, 'BIL', 'Eletivo', 'lateralidade editada respeitada'],
    [{ nome: 'Videocolecistectomia', lateralidade: 'NA', carater: 'Eletivo' }, 'NA', 'Eletivo', 'fora da tabela intocado'],
    [{ nome: 'Hérnia Inguinal Estrangulada', lateralidade: 'SIDE', carater: 'Eletivo' }, 'SIDE', 'Emergência', 'caráter semeado corrigido']
  ];
  var linhas = [];
  var falhas = 0;
  linhas.push('CLAV — TESTE DO CATALOGO DE PROCEDIMENTOS (lateralidade e carater)');
  linhas.push('caso | esperado | obtido | resultado');
  CASOS_LAT.forEach(function (c) {
    var o = clavInferirLateralidade_(c[0]);
    if (o !== c[1]) falhas++;
    linhas.push('lateralidade: ' + c[0] + ' | ' + c[1] + ' | ' + o + ' | ' + (o === c[1] ? 'OK' : 'FALHA'));
  });
  CASOS_CAR.forEach(function (c) {
    var o = clavInferirCarater_(c[0]);
    if (o !== c[1]) falhas++;
    linhas.push('carater: ' + c[0] + ' | ' + c[1] + ' | ' + o + ' | ' + (o === c[1] ? 'OK' : 'FALHA'));
  });
  CASOS_TAB.forEach(function (c) {
    var item = { nome: c[0].nome, lateralidade: c[0].lateralidade, carater: c[0].carater };
    var r = clavCorrigirItemCatalogo_(item);
    var ok = r.lateralidade === c[1] && r.carater === c[2];
    if (!ok) falhas++;
    linhas.push('tabela: ' + c[3] + ' (' + c[0].nome + ') | ' + c[1] + '/' + c[2] + ' | ' + r.lateralidade + '/' + r.carater + ' | ' + (ok ? 'OK' : 'FALHA'));
  });
  var total = CASOS_LAT.length + CASOS_CAR.length + CASOS_TAB.length;
  linhas.push('');
  linhas.push((total - falhas) + ' OK / ' + falhas + ' FALHA(S)' + (falhas ? '  >>> NAO IMPLANTAR ATE CORRIGIR' : '  — pronto para implantar'));
  linhas.push('Proximo passo: adminSimularCorrecaoCatalogo (mostra) e adminAplicarCorrecaoCatalogo (grava) para alinhar a aba PROCEDIMENTOS.');
  var texto = linhas.join('\n');
  Logger.log(texto);
  try { SpreadsheetApp.getUi().alert(texto); } catch (semUi) { /* sem interface: fica no log */ }
  return texto;
}