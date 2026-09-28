/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 20_PDF_Layout.gs
 * Layout tabular do PDF: larguras, grades, destaques e paginação
 *
 * Conteúdo: Constantes de tipografia, distribuirLargurasPdf_, grades e controle de quebra.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

var PDF_TABLE_TOTAL_ = 555;

// Densidade da impressão. Reduzir recuo e entrelinha foi o que devolveu
// espaço vertical sem tocar nos separadores de célula, que a equipe faz
// questão de manter.
var PDF_PAD_CELULA_ = 2;
var PDF_PAD_TITULO_ = 3;
var PDF_FONT_TITULO_ = 8;
var PDF_FONT_ROTULO_ = 6;
var PDF_FONT_VALOR_ = 8.5;
var PDF_FONT_TABELA_ = 8;
var PDF_FONT_CABECALHO_ = 7;

// Distribui a largura total entre as colunas com arredondamento acumulado:
// cada corte é arredondado sobre a posição acumulada, então a soma das
// larguras fecha exatamente no total, sem deriva de ±1 a 2pt por linha.
function distribuirLargurasPdf_(pesos, total) {
  var lista = (pesos || []).map(function (p) { var n = Number(p); return n > 0 ? n : 1; });
  if (!lista.length) return [];
  var soma = lista.reduce(function (s, n) { return s + n; }, 0);
  var out = [], acumulado = 0, anterior = 0;
  for (var i = 0; i < lista.length; i++) {
    acumulado += lista[i];
    var fim = Math.round(acumulado / soma * total);
    out.push(Math.max(24, fim - anterior));
    anterior = fim;
  }
  return out;
}

// Tarja de título das seções, com a largura exata do corpo.
function appendPdfSectionTitle_(body, title) {
  var safeTitle = String(title || '').trim() || 'SEÇÃO';
  var titleTable = body.appendTable([[safeTitle]]);
  try { titleTable.setBorderColor('#1e574e').setBorderWidth(1); } catch (ignored) {}
  var titleCell = titleTable.getCell(0, 0);
  titleCell.setBackgroundColor('#e8f2f0');
  setPdfCellPadding_(titleCell, PDF_PAD_TITULO_);
  try { titleCell.setWidth(PDF_TABLE_TOTAL_); } catch (ignoredTW) {}
  titleCell.editAsText().setFontFamily('Arial').setFontSize(PDF_FONT_TITULO_).setBold(true).setForegroundColor('#1e574e');
  return titleTable;
}

/**
 * Aplica o par rótulo/valor dentro de uma célula.
 * O rótulo (que já traz a unidade de medida ao lado, conforme pedido) fica em
 * corpo menor, em versalete cinza; o valor fica logo abaixo, maior e escuro.
 */
// Destaques "marca-texto" do PDF (pedido da equipe): alergia em vermelho
// translúcido, Mallampati em amarelo, ASA em laranja e capacidade funcional em
// verde. O valor fica em negrito. Espelhado no cliente (PDF_DESTAQUES_CLIENT).
var PDF_DESTAQUES_ = {
  alergia: { fundo: '#fde2e2', texto: '#991b1b' },
  mallampati: { fundo: '#fef3c7', texto: '#78350f' },
  asa: { fundo: '#fed7aa', texto: '#7c2d12' },
  capacidade: { fundo: '#dcfce7', texto: '#14532d' }
};
function estilizarCelulaGrade_(cell, def) {
  setPdfCellPadding_(cell, PDF_PAD_CELULA_);
  var text = cell.editAsText();
  text.setFontFamily('Arial').setFontSize(PDF_FONT_VALOR_).setBold(false).setForegroundColor('#111111');
  var label = String((def && def.label) || '').trim();
  var destaque = def && def.destaque ? PDF_DESTAQUES_[def.destaque] : null;
  if (destaque) {
    try { cell.setBackgroundColor(destaque.fundo); } catch (ignoredBg) {}
    try {
      var total = String(cell.getText() || '').length;
      if (total > 0) text.setBold(0, total - 1, true).setForegroundColor(0, total - 1, destaque.texto);
    } catch (ignoredTx) {}
  }
  if (!label) return;
  try {
    text.setFontSize(0, label.length - 1, PDF_FONT_ROTULO_)
        .setBold(0, label.length - 1, true)
        .setForegroundColor(0, label.length - 1, '#475569');
  } catch (ignored) {}
}

/**
 * Seção em grade.
 *
 * Reescrita para resolver os três pontos levantados pela equipe:
 *  1. ALINHAMENTO — antes, cada conjunto de linhas com vãos diferentes virava
 *     uma tabela própria, com larguras próprias, e os separadores verticais
 *     não coincidiam entre um bloco e outro. Agora cada seção usa UMA tabela
 *     retangular com colunas de largura idêntica: todos os separadores
 *     coincidem de cima a baixo.
 *  2. ESPAÇO — o número de colunas é calculado para não sobrar célula vazia,
 *     e os recuos internos foram reduzidos.
 *  3. SEPARADORES — mantidos integralmente, com a mesma espessura e cor.
 *
 * Itens de largura total ("full") saem numa tabela de coluna única logo
 * abaixo, com a mesma largura externa: a moldura continua alinhada.
 */
function appendPdfDocGridSection_(body, title, items, cols) {
  var lista = (items || []).filter(Boolean);
  if (!lista.length) return;

  var normais = [];
  var largos = [];
  lista.forEach(function (item) {
    if (item[2] === 'full') largos.push(item);
    else normais.push(item);
  });

  appendPdfSectionTitle_(body, title);
  if (normais.length) appendGradeUniforme_(body, normais, cols);
  if (largos.length) appendGradeUniforme_(body, largos, 1);
}

function appendGradeUniforme_(body, items, cols) {
  var rows = packGridRows_(items, cols);
  if (!rows.length) return;
  var colunas = rows[0].length;
  var pesos = [];
  for (var i = 0; i < colunas; i++) pesos.push(1);
  var larguras = distribuirLargurasPdf_(pesos, PDF_TABLE_TOTAL_);

  var texts = rows.map(function (row) { return row.map(gridCellText_); });
  var table = body.appendTable(texts);
  try { table.setBorderColor('#111111').setBorderWidth(1); } catch (ignored) {}

  for (var r = 0; r < table.getNumRows(); r++) {
    for (var c = 0; c < table.getRow(r).getNumCells(); c++) {
      var cell = table.getCell(r, c);
      var def = (rows[r] && rows[r][c]) || { label: '', value: '' };
      try { cell.setWidth(larguras[c]); } catch (ignoredW) {}
      estilizarCelulaGrade_(cell, def);
    }
  }
}

/**
 * Impede que uma linha de tabela seja partida entre duas páginas.
 *
 * Era o defeito da primeira imagem enviada pela equipe: a faixa de rótulos
 * ("TAP / TP (atividade) | TTPa / KPTT | ...") ficava no rodapé de uma folha e
 * os valores correspondentes ("95 % | 36 s | ...") apareciam sozinhos no topo
 * da folha seguinte, deixando o documento ilegível naquele trecho.
 *
 * DocumentApp não expõe esse controle, então usamos a API REST do Docs com o
 * próprio token da execução. Falha aqui nunca interrompe a geração do PDF:
 * no pior caso o documento sai como saía antes.
 */
function preventRowOverflowBestEffort_(docId) {
  try {
    var url = 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId);
    var token = ScriptApp.getOAuthToken();
    var doc = JSON.parse(UrlFetchApp.fetch(url + '?fields=body/content(startIndex,table/rows)', {
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token }
    }).getContentText());

    var conteudo = (doc && doc.body && doc.body.content) || [];
    var requests = [];
    conteudo.forEach(function (elemento) {
      if (!elemento || !elemento.table) return;
      requests.push({
        updateTableRowStyle: {
          tableStartLocation: { index: elemento.startIndex },
          tableRowStyle: { preventOverflow: true },
          fields: 'preventOverflow'
        }
      });
    });
    if (!requests.length) return false;

    var resposta = UrlFetchApp.fetch(url + ':batchUpdate', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ requests: requests })
    });
    return resposta.getResponseCode() >= 200 && resposta.getResponseCode() < 300;
  } catch (ignored) {
    return false;
  }
}

function compactPdfSpacerParagraphs_(body) {
  try {
    for (var i = 0; i < body.getNumChildren(); i++) {
      var child = body.getChild(i);
      if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      var paragraph = child.asParagraph();
      if (String(paragraph.getText() || '').trim()) continue;
      try {
        paragraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
        var attrs = {};
        attrs[DocumentApp.Attribute.FONT_SIZE] = 1;
        paragraph.setAttributes(attrs);
      } catch (ignoredInner) {}
    }
  } catch (ignored) {}
}

function statusFindings_(status, findings) {
  var s = String(status === undefined || status === null ? '' : status).trim();
  var f = String(findings === undefined || findings === null ? '' : findings).trim();
  if (s && f) return s + ' — ' + f;
  return s || f || '';
}

/**
 * Regra de impressão da Revisão por Sistemas (atualizada a pedido da equipe):
 *  - "Sem alterações" (ou legado "Sem queixas") imprime somente essa frase;
 *  - "Com alterações" imprime somente a descrição das alterações;
 *  - situação em branco e nada marcado: com vazioVira=true (Revisão por
 *    Sistemas) imprime "Sem alterações"; nos demais usos (auscultas) não sai;
 *  - valores legados ("Não se aplica" etc.) continuam legíveis como texto.
 */
// Ausculta: siglas padrão por extenso no documento (espelho de auscultaImpressaoClient).
function auscultaImpressao_(status, texto) {
  var t = tokenClav_(String(status || ''));
  var extra = String(texto || '').trim() ? ' — ' + String(texto).trim() : '';
  if (t.indexOf('mv') === 0) return 'MV+, S/RA (murmúrio vesicular presente, sem ruídos adventícios)' + extra;
  if (t.indexOf('rcr') === 0) return 'RCR, 2T, BNF, sem sopros (ritmo cardíaco regular, em 2 tempos, bulhas normofonéticas, sem sopros)' + extra;
  return sistemaImpressao_(status, [], texto);
}

function sistemaImpressao_(status, itens, textoLivre, vazioVira) {
  var s = String(status || '').trim();
  var token = tokenClav_(s);
  var achados = [];
  (Array.isArray(itens) ? itens : []).forEach(function (item) {
    var texto = String(item || '').trim();
    if (texto) achados.push(texto);
  });
  var livre = String(textoLivre || '').trim();
  if (livre) achados.push(livre);
  if (token === 'sem alteracoes' || token === 'sem queixas') return 'Sem alterações';
  if (token === 'sem particularidades') return s;
  if (token === 'com alteracoes') return achados.length ? achados.join('; ') : 'Com alterações';
  if (!s && !achados.length) return vazioVira ? 'Sem alterações' : '';
  if (!s) return achados.join('; ');
  return statusFindings_(s, achados.join('; '));
}

// Item de grade que só entra na impressão quando houver conteúdo (regra global
// de não imprimir campos vazios, sem rótulo órfão e sem linha em branco).
function gi_(label, value, span, destaque) {
  var texto = value === undefined || value === null ? '' : String(value).trim();
  if (!texto) return null;
  return [label, texto, span || 1, destaque || ''];
}

/**
 * Item de grade com a UNIDADE DE MEDIDA ao lado do rótulo, e não colada ao
 * valor. Pedido direto da equipe: "Hemoglobina g/dL" em cima, "12,0" embaixo.
 * O rótulo é impresso em corpo menor que o valor, então a unidade fica
 * discreta e o número ganha destaque.
 *
 * Se o valor já vier com a unidade digitada pelo usuário, ela não é repetida.
 */
function giu_(label, value, unit, span) {
  var texto = value === undefined || value === null ? '' : String(value).trim();
  if (!texto) return null;
  var unidade = String(unit || '').trim();
  if (unidade) {
    var limpo = texto.toLowerCase().replace(/\s+/g, '');
    var alvo = unidade.toLowerCase().replace(/\s+/g, '');
    if (limpo.length > alvo.length && limpo.slice(-alvo.length) === alvo) {
      texto = texto.slice(0, texto.length - unidade.length).trim() || texto;
    }
  }
  return [unidade ? label + ' ' + unidade : label, texto, span || 1];
}

function pushGridSection_(sections, title, cols, items) {
  var filtrados = (items || []).filter(function (x) { return !!x; });
  if (filtrados.length) sections.push({ title: title, cols: cols, grid: filtrados });
}

// Tabela de tempos mínimos de jejum (Plano de Jejum e Orientações).
function tabelaJejumRows_() {
  return [
    ['Líquidos claros (água, chá, suco coado, isotônico)', '2 horas'],
    ['Leite materno', '4 horas'],
    ['Fórmula infantil / leite não humano', '6 horas'],
    ['Refeição leve (sem gordura ou fritura)', '6 horas'],
    ['Refeição completa com gordura ou fritura', '8 horas']
  ];
}

function habitosImpressao_(payload) {
  var an = payload.anamnese || {};
  var partes = [];
  var tab = String(an.tabagismo_status || '').trim();
  if (tab) {
    var det = [];
    // Correção de discordância: quando o status é "Nunca fumou" (não tabagista),
    // os detalhes residuais (anos, cigarros/dia, anos-maço) NÃO são impressos,
    // mesmo que tenham ficado gravados de uma edição anterior.
    var nuncaFumou = /^(nunca|nao|não)/.test(tokenClav_(tab));
    if (!nuncaFumou) {
      if (an.tabagismo_anos) det.push(an.tabagismo_anos + ' ano(s) de tabagismo');
      if (an.tabagismo_cigarros_dia) det.push(an.tabagismo_cigarros_dia + ' cigarro(s)/dia');
      if (an.tabagismo_anos_maco) det.push(an.tabagismo_anos_maco + ' anos-maço');
      if (an.tabagismo_parou_ha && tokenClav_(tab).indexOf('ex') === 0) det.push('parou há ' + an.tabagismo_parou_ha);
    }
    partes.push('Tabagismo: ' + (nuncaFumou ? 'não tabagista (nunca fumou)' : tab) + (det.length ? ' (' + det.join('; ') + ')' : ''));
  }
  if (an.etilismo_status) partes.push('Etilismo: ' + an.etilismo_status);
  if (an.outras_drogas) partes.push('Outras drogas: ' + an.outras_drogas);
  if (an.habitos) partes.push(String(an.habitos).trim());
  return partes.join('. ');
}

function complicacoesImpressao_(itens, outras) {
  var lista = (Array.isArray(itens) ? itens : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  var extra = String(outras || '').trim();
  if (extra) lista.push(extra);
  return lista.join('; ');
}

// Assinatura em formato de carimbo: linha ligeiramente maior que o nome e,
// abaixo, o nome do anestesiologista responsável, "Médico" e o CRM.
/**
 * v19.3. Diz se o campo de alergias descreve uma alergia REAL.
 * Negativas ("nega alergias", "sem alergias", "nenhuma") não podem acionar o
 * destaque vermelho do documento impresso. Espelhado no cliente por
 * temAlergiaReal() no Index.html.
 */
function temAlergiaReal_(texto) {
  var t = String(texto || '').trim();
  if (!t) return false;
  var chave = tokenClav_(t).replace(/\s+/g, '');
  if (!chave) return false;
  var negativas = ['negaalergias', 'negaalergia', 'negaalergiasconhecidas', 'negaalergiaconhecida',
                   'semalergias', 'semalergia', 'semalergiasconhecidas', 'nenhuma', 'nenhum', 'nao',
                   'naopossui', 'naorefere', 'naoinformado', 'naoseaplica', 'ausente', 'ausentes',
                   'negativo', 'negativa', 'desconhece'];
  if (negativas.indexOf(chave) >= 0) return false;
  if (/^(nega|sem|nenhuma|nenhum|nao)/.test(chave) && chave.length <= 34) return false;
  return true;
}

/**
 * v19.3. Escolhe quem assina e com qual CRM.
 *
 * O documento vinha saindo assinado com o rótulo da conta de acesso
 * ("Suporte CLAV") e CRM em branco. Um perfil não médico nunca deve ser
 * estampado como "Médico": nesse caso a linha sai em branco para assinatura
 * manual, que é o correto sob a Resolução CFM nº 2.174/2017.
 */
function resolverCarimboAssinatura_(payload, user, tipo) {
  var a = payload.atendimento || {};
  var pre = payload.preop || {};
  var intra = payload.intraop || {};
  var srpa = payload.srpa || {};
  var limpar = function (v) { return String(v || '').split(';')[0].trim(); };

  var doCaso = limpar(tipo === 'FICHA_ANESTESIA'
    ? (intra.anestesiologistas_responsaveis || pre.anestesiologista || a.anestesiologista)
    : tipo === 'RECUPERACAO_POS_ANESTESICA'
      ? (srpa.anestesiologistas_responsaveis || intra.anestesiologistas_responsaveis || pre.anestesiologista)
      : (pre.anestesiologista || a.anestesiologista));

  var naoMedicos = ['suporte', 'administrador', 'suporte clav', 'administrador clav', 'sistema'];
  if (doCaso && naoMedicos.indexOf(tokenClav_(doCaso)) >= 0) doCaso = '';

  var logado = limpar(user && user.nome);
  if (logado && naoMedicos.indexOf(tokenClav_(logado)) >= 0) logado = '';
  var logadoEhMedico = !!(user && isMedical_(user) && String(user.crm || '').trim());

  var candidatos = [];
  if (doCaso) candidatos.push(doCaso);
  if (logado && logadoEhMedico) candidatos.push(logado);

  for (var i = 0; i < candidatos.length; i++) {
    var crm = crmDoProfissional_(candidatos[i], user);
    if (crm) return { nome: candidatos[i], crm: crm, titulo: 'Médico' };
  }
  if (doCaso) return { nome: doCaso, crm: '', titulo: 'Médico' };
  if (logado && logadoEhMedico) return { nome: logado, crm: '', titulo: 'Médico' };
  return { nome: '', crm: '', titulo: 'Médico responsável' };
}

function appendPdfDocSignature_(body, payload, user, tipo) {
  var a = payload.atendimento || {};
  var pre = payload.preop || {};
  var intra = payload.intraop || {};
  var srpa = payload.srpa || {};
  tipo = normalizeDocumentType_(tipo);
  if (tipo === 'OPERACIONAL') return;
  var carimbo = resolverCarimboAssinatura_(payload, user, tipo);
  var medico = carimbo.nome;
  var crm = carimbo.crm;
  var tamanhoLinha = Math.max(medico.length + 8, 34);
  var linha = new Array(tamanhoLinha + 1).join('_');
  // v19.9: um parágrafo por linha do carimbo. No DocumentApp, "\n" dentro de um
  // appendParagraph vira parágrafos separados, e só o primeiro (vazio) recebia
  // Arial 10 centralizado; o respiro fica em setSpacingBefore, que sobrevive à
  // compactação de parágrafos vazios do PDF.
  var partes = [
    { texto: linha, negrito: false, antes: 22 },
    { texto: medico || ' ', negrito: true, antes: 0 },
    { texto: carimbo.titulo, negrito: false, antes: 0 },
    { texto: crm ? crm : 'CRM: ______________', negrito: false, antes: 0 }
  ];
  partes.forEach(function (pt) {
    var par = body.appendParagraph(pt.texto);
    styleParagraph_(par, 10, pt.negrito, '#111111', DocumentApp.HorizontalAlignment.CENTER);
    par.editAsText().setFontFamily('Arial');
    try { par.setSpacingBefore(pt.antes).setSpacingAfter(0); } catch (ignoredEsp) {}
  });
}

// Resolve o CRM do profissional pelo cadastro de usuários; quando não houver,
// usa o CRM do usuário logado se os nomes coincidirem.
function crmDoProfissional_(nome, user) {
  var alvo = tokenClav_(String(nome || '').replace(/^dr\.?\s+|^dra\.?\s+/i, ''));
  if (!alvo) return '';
  var formatar = function (valor) {
    var texto = String(valor || '').trim();
    if (!texto) return '';
    return /crm/i.test(texto) ? texto : 'CRM-RS ' + texto;
  };
  try {
    var usuarios = all_('USUARIOS').filter(function (u) { return !u._deleted_at && String(u.crm || '').trim(); });
    for (var i = 0; i < usuarios.length; i++) {
      var nomeUsuario = tokenClav_(String(usuarios[i].nome || '').replace(/^dr\.?\s+|^dra\.?\s+/i, ''));
      if (nomeUsuario && (nomeUsuario === alvo || nomeUsuario.indexOf(alvo) === 0 || alvo.indexOf(nomeUsuario) === 0)) {
        return formatar(usuarios[i].crm);
      }
    }
  } catch (ignored) {}
  if (user && user.nome && tokenClav_(String(user.nome).replace(/^dr\.?\s+|^dra\.?\s+/i, '')) === alvo) {
    return formatar(user.crm);
  }
  return '';
}

