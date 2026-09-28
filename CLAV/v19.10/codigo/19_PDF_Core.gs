/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 19_PDF_Core.gs
 * Motor do PDF: documento, cabeçalho, rodapé e prescrição
 *
 * Conteúdo: createTablePdfBlob_, appendPdfDocHeader_/Footer_, prescrição e jejum.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

/**
 * NOTA DE MANUTENÇÃO (correção 28 da revisão)
 * Foi removida a segunda implementação do documento impresso (renderPdfHtml_ e
 * seus auxiliares section_, row_, cell_, cols_, tr_, secRow_, td_,
 * classToColspan_, resumoExames_, resumoItens_), além de stubs sem chamada
 * (renderInstallBusy_, ensureInstalled_, acquireScriptLock_, isInstallReady_,
 * verifyPassword_, upsertPacienteFromPayload_, newToken_).
 *
 * Aquela versão antiga ainda seguia a regra antiga de imprimir "Não informado"
 * em campo vazio e não recebia as correções feitas na versão oficial. Não
 * rodava, mas era o principal risco de alguém corrigir o arquivo errado.
 *
 * O PDF oficial é gerado por: createTablePdfBlob_ -> buildPdfSections_ ->
 * appendPdfDocGridSection_ / appendPdfDocSection_.
 */
function createTablePdfBlob_(payload, tipo, user, finalName) {
  payload = normalizePayload_(payload);
  tipo = normalizeDocumentType_(tipo);
  var tempDoc = DocumentApp.create('TEMP_' + finalName.replace(/\.pdf$/i, ''));
  var tempFile = DriveApp.getFileById(tempDoc.getId());
  try {
    var body = tempDoc.getBody();
    body.clear();
    try { body.setMarginTop(14).setMarginBottom(20).setMarginLeft(20).setMarginRight(20); } catch (ignored) {}
    appendPdfDocHeader_(body, payload, tipo);
    if (tipo === 'PRESCRICAO_HOSPITALAR') {
      appendPrescricaoDoc_(body, payload, user);
    } else {
      buildPdfSections_(payload, tipo, user).forEach(function (section) {
        if (!section) return;
        // Quebra de página fixa: a seção marcada abre uma nova folha do PDF.
        if (section.pageBreakBefore) { try { body.appendPageBreak(); } catch (ignoredBreak) {} }
        if (section.grid) appendPdfDocGridSection_(body, section.title, section.grid, section.cols);
        else appendPdfDocSection_(body, section.title, section.rows, section.headers, section.widths);
      });
    }
    appendPdfDocSignature_(body, payload, user, tipo);
    compactPdfSpacerParagraphs_(body);
    appendPdfDocFooter_(tempDoc);
    tempDoc.saveAndClose();
    // CORRECAO (imagem 1 do chamado): impede que uma linha da tabela seja
    // partida entre duas paginas, deixando o rotulo no fim de uma folha e o
    // valor no inicio da seguinte.
    preventRowOverflowBestEffort_(tempDoc.getId());
    return tempFile.getAs(MimeType.PDF).setName(finalName);
  } finally {
    try { tempFile.setTrashed(true); } catch (ignored2) {}
  }
}

// Rodapé com data de emissão automática em todas as páginas.
function appendPdfDocFooter_(doc) {
  try {
    var footer = doc.getFooter() || doc.addFooter();
    footer.clear();
    var p = footer.appendParagraph('Documento emitido em ' + nowBR_() + ' | ' + nomeInstituicao_() + ' - ' + cidadeInstituicao_());
    p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    p.editAsText().setFontFamily('Arial').setFontSize(7).setForegroundColor('#64748b');
  } catch (ignored) {}
}

// Prescrição pré-operatória em modelo pré-pronto (seção 4 do escopo):
// cabeçalho puxado da Parte 1 e itens numerados, em Arial, com carimbo ao final.
function appendPrescricaoDoc_(body, payload, user) {
  var p = payload.paciente || {};
  var pr = payload.procedimento || {};
  var a = payload.atendimento || {};
  var linhas = prescricaoLinhas_(payload);

  var nome = body.appendParagraph(String(p.nome || 'Paciente não informado'));
  styleParagraph_(nome, 13, true, '#111111', DocumentApp.HorizontalAlignment.CENTER);
  nome.editAsText().setFontFamily('Arial');
  // Respiro do topo (pedido da equipe): os parágrafos vazios usados como
  // espaçador eram achatados pela compactação do PDF; o espaçamento agora
  // fica nos próprios parágrafos e sobrevive à compactação.
  try { nome.setSpacingBefore(10).setSpacingAfter(8); } catch (ignoredNome) {}

  var cabecalho = [];
  cabecalho.push('Pré-operatório de:');
  var proc = [pr.nome, pr.lateralidade && tokenClav_(pr.lateralidade) !== 'nao se aplica' ? pr.lateralidade : ''].filter(Boolean).join(' — ');
  if (proc) cabecalho.push(proc);
  if (pr.tipo_cirurgia && tokenClav_(pr.tipo_cirurgia) !== 'nao se aplica') cabecalho.push(pr.tipo_cirurgia);
  var equipe = [pr.cirurgiao_1, pr.cirurgiao_2, pr.cirurgiao_3, pr.cirurgiao_4, pr.cirurgiao_5].filter(Boolean);
  if (!equipe.length && pr.cirurgiao) equipe = String(pr.cirurgiao).split(';').map(function (s) { return s.trim(); }).filter(Boolean);
  if (equipe.length) cabecalho.push(equipe[0]);
  if (pr.data_cirurgia) cabecalho.push('Data Cirurgia: ' + fmtDataBR_(pr.data_cirurgia));
  if (a.convenio) cabecalho.push(a.convenio);
  cabecalho.forEach(function (linha, cIdx) {
    var par = body.appendParagraph(linha);
    // Parte superior centralizada (pedido da equipe), no mesmo eixo do nome
    // do paciente; os itens numerados abaixo permanecem à esquerda.
    styleParagraph_(par, 11, false, '#111111', DocumentApp.HorizontalAlignment.CENTER);
    par.editAsText().setFontFamily('Arial');
    try { par.setSpacingAfter(cIdx === cabecalho.length - 1 ? 4 : 2); } catch (ignoredCab) {}
  });
  // v19.9: identificação e alergia no cabeçalho da prescrição (segurança do
  // paciente): nascimento, prontuário e peso; alergia REAL em vermelho.
  var an = payload.anamnese || {}, tri = payload.triagem || {};
  var identLinha = [p.nascimento ? 'Nasc. ' + fmtDataBR_(p.nascimento) : '', p.prontuario ? 'Prontuário ' + p.prontuario : '', tri.peso ? 'Peso ' + tri.peso + ' kg' : ''].filter(Boolean).join(' · ');
  if (identLinha) {
    var parId = body.appendParagraph(identLinha);
    styleParagraph_(parId, 10, false, '#111111', DocumentApp.HorizontalAlignment.CENTER);
    parId.editAsText().setFontFamily('Arial');
    try { parId.setSpacingAfter(4); } catch (ignoredId) {}
  }
  var alergiaTexto = complicacoesImpressao_(an.alergias_itens, an.alergias);
  if (temAlergiaReal_(alergiaTexto)) {
    var parAl = body.appendParagraph('ALERGIA: ' + alergiaTexto);
    styleParagraph_(parAl, 11, true, '#991b1b', DocumentApp.HorizontalAlignment.CENTER);
    parAl.editAsText().setFontFamily('Arial');
    try { parAl.editAsText().setBackgroundColor('#fde2e2'); } catch (ignoredBg) {}
    try { parAl.setSpacingAfter(10); } catch (ignoredAl) {}
  } else {
    try { body.appendParagraph('').setSpacingAfter(6); } catch (ignoredEsp) {}
  }
  linhas.forEach(function (linha, idx) {
    var par = body.appendParagraph((idx + 1) + ') ' + linha);
    styleParagraph_(par, 11, false, '#111111', DocumentApp.HorizontalAlignment.LEFT);
    par.editAsText().setFontFamily('Arial');
    try { par.setSpacingAfter(4); } catch (ignored) {}
  });
}

// Linhas numeradas da prescrição: jejum (padrão ou diferenciado do protocolo
// GLP-1), CSVR, rotinas, acesso venoso, SF+ATB, itens opcionais clicáveis,
// itens livres e, por fim, as medicações de uso contínuo selecionadas.
// Reconhece as variantes "Sem indicação de antibiótico", "sem necessidade",
// "desnecessário" digitadas ou escolhidas nos chips (espelho de atbSemIndicacaoClient).
function atbSemIndicacao_(valor) {
  var t = tokenClav_(String(valor || ''));
  if (!t) return false;
  return /^(sem indicacao|sem necessidade|desnecessari[oa]|nao indicado|nao necessita|dispensad[oa])/.test(t);
}

function prescricaoLinhas_(payload) {
  var modelo = (payload.conduta && payload.conduta.prescricao_modelo) || {};
  var linhas = [];
  if (glp1AtivoServidor_(payload)) {
    // Protocolo GLP-1 (canetas emagrecedoras) ativo: o jejum diferenciado,
    // editável no bloco do protocolo, substitui o item 1 da prescrição.
    var textoJejum = String((payload.anamnese || {}).glp1_jejum_texto || '').trim() || GLP1_JEJUM_PADRAO_();
    textoJejum.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (item) { linhas.push(item); });
  } else {
    var jejum = String(modelo.jejum_partir || '').trim();
    if (!jejum) linhas.push('Jejum a partir da(s) ______');
    else if (tokenClav_(jejum) === 'meia-noite') linhas.push('Jejum a partir da meia-noite');
    else linhas.push('Jejum a partir da(s) ' + jejum);
  }
  linhas.push('CSVR');
  linhas.push('Rotinas pré-operatórias');
  var calibre = String(modelo.abocath_calibre || '').trim();
  var membro = String(modelo.abocath_membro || '').trim();
  linhas.push('Acesso venoso periférico (Abocath n° ' + (calibre || '____') + ') no MS ' + (membro || '____'));
  var atb = String(modelo.antibiotico || '').trim();
  // Compatibilidade: prescrições antigas com Clindamicina 900 mg passam a 600 mg.
  if (/^clindamicina\s*900\s*mg$/i.test(atb)) atb = 'Clindamicina 600 mg';
  if (atbSemIndicacao_(atb)) {
    // Algumas cirurgias (ex.: vasculares) não usam antibiótico: a linha do
    // soro + ATB é substituída pela declaração explícita.
    linhas.push('Antibioticoprofilaxia: sem indicação');
  } else {
    linhas.push('SF 0,9% ---- 100 ml EV' + (atb ? ' + ' + atb : ' + ________________') + ' no bloco');
  }
  rxOpcionaisLinhas_(modelo.opcionais).forEach(function (item) { linhas.push(item); });
  var extras = String(modelo.itens_livres || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  extras.forEach(function (item) { linhas.push(item); });
  var meds = prescricaoMedicacoes_(payload);
  meds.forEach(function (item) { linhas.push(item); });
  return linhas;
}

// Espelho servidor dos itens opcionais clicáveis da prescrição (mesma tabela do
// Index.html; ids desconhecidos são ignorados sem erro).
function RX_OPCIONAIS_() {
  return [
    { id: 'hgt', linha: 'Protocolo de HGT' },
    { id: 'tricotomia', linha: 'Tricotomia do sítio cirúrgico conforme rotina institucional, imediatamente antes do procedimento' },
    { id: 'meias', linha: 'Meias elásticas de compressão durante o procedimento' },
    { id: 'manta', linha: 'Manta térmica durante o procedimento' },
    { id: 'reserva_chad', linha: 'Reserva de concentrado de hemácias (CHAD) para o procedimento' },
    { id: 'reserva_plasma', linha: 'Reserva de plasma fresco congelado para o procedimento' },
    { id: 'reserva_plaquetas', linha: 'Reserva de plaquetas para o procedimento' }
  ];
}

function rxOpcionaisLinhas_(ids) {
  var tabela = RX_OPCIONAIS_();
  return (Array.isArray(ids) ? ids : []).map(function (id) {
    var achou = null;
    tabela.forEach(function (item) { if (item.id === id) achou = item; });
    return achou ? achou.linha : '';
  }).filter(Boolean);
}

// Jejum diferenciado padrão do protocolo GLP-1 (nota SBA), usado como reserva
// quando o texto editável do frontend estiver em branco.
function GLP1_JEJUM_PADRAO_() {
  return 'Dieta líquida sem resíduos nas 24 horas anteriores à cirurgia (água, café preto e sem leite, chá, água de coco sem resíduos, sucos coados e sem polpa ou pedaço, bebidas sem resíduos de carboidratos como soluções com glicose, frutose, maltodextrina, soro de reidratação oral, Gatorade)\nJejum absoluto por 8 a 12 horas antes da cirurgia';
}

// Espelho servidor das medicações do protocolo GLP-1 (mesma tabela do Index).
function GLP1_MEDS_SERVIDOR_() {
  return [
    { id: 'exenatida', label: 'Exenatida (Byetta e Bydureon)', dur: 'curta' },
    { id: 'lixisenatida', label: 'Lixisenatida (Adlyxin e Lyxumia)', dur: 'curta' },
    { id: 'semaglutida', label: 'Semaglutida (Ozempic e Wegovy)', dur: 'longa' },
    { id: 'liraglutida', label: 'Liraglutida (Victoza, Saxenda, Olire e Lirux; associação: Xultophy)', dur: 'longa' },
    { id: 'dulaglutida', label: 'Dulaglutida (Trulicity)', dur: 'longa' },
    { id: 'tirzepatida', label: 'Tirzepatida (Mounjaro e Zepbound)', dur: 'longa' }
  ];
}

function glp1AtivoServidor_(payload) {
  return tokenClav_(((payload || {}).anamnese || {}).glp1_protocolo || '') === 'sim';
}

// Resumo impresso da triagem GLP-1 na ficha de avaliação pré-anestésica:
// medicação com duração, última dose, POCUS, fatores de risco e conduta.
function resumoGlp1_(payload) {
  var an = (payload || {}).anamnese || {};
  if (!glp1AtivoServidor_(payload)) {
    if (tokenClav_(an.glp1_protocolo || '') === 'nao') return 'Nega uso de agonista do receptor GLP-1 ou coagonista GLP-1/GIP';
    return '';
  }
  var med = null;
  GLP1_MEDS_SERVIDOR_().forEach(function (m) { if (m.id === String(an.glp1_med_id || '')) med = m; });
  var riscos = Array.isArray(an.glp1_riscos) ? an.glp1_riscos : [];
  var partes = [];
  partes.push('Protocolo ativo' + (med ? ' — ' + med.label + ' (' + med.dur + ' duração)' : (an.glp1_medicamento ? ' — ' + an.glp1_medicamento : '')));
  if (an.glp1_ultima_dose) partes.push('última dose: ' + an.glp1_ultima_dose);
  if (an.glp1_pocus) partes.push('POCUS gástrico disponível: ' + an.glp1_pocus);
  if (tokenClav_(an.glp1_pocus || '') === 'sim') partes.push(riscos.length ? 'Fatores de risco: ' + riscos.join('; ') : 'Sem fatores de risco marcados');
  if (String(an.glp1_suspensao || '').trim()) partes.push('Conduta: ' + String(an.glp1_suspensao).trim());
  return partes.filter(Boolean).join(' · ');
}

// Medicações de uso contínuo que alimentam a prescrição: usa a seleção feita em
// "Medicações para o período de internação"; sem seleção, cai nas medicações em
// uso registradas no pré-anestésico.
function prescricaoMedicacoes_(payload) {
  var internacao = (payload.conduta && payload.conduta.medicacoes_internacao) || [];
  var ativas = internacao.filter(function (m) {
    return String((m && (m.medicamento || m.item)) || '').trim() && tokenClav_(m.conduta || '').indexOf('suspend') < 0;
  }).map(function (m) {
    var nome = String(m.medicamento || m.item).trim();
    var detalhe = [m.dose, m.horario].filter(Boolean).join(' ');
    return detalhe && tokenClav_(nome).indexOf(tokenClav_(detalhe)) < 0 ? nome + ' ' + detalhe : nome;
  });
  if (ativas.length) return ativas;
  // v19.10 (pedido C13): a lista de internação já foi mexida pela equipe (importada,
  // editada, esvaziada ou toda "Suspender") → a prescrição NÃO volta a listar todas as
  // medicações em uso; sai a declaração explícita. Só a lista nunca tocada cai no
  // comportamento antigo (registros anteriores continuam iguais).
  if (String((payload.conduta && payload.conduta.medicacoes_internacao_tocada) || '').toUpperCase() === 'SIM') {
    return ['Sem medicações de uso contínuo a manter no período de internação'];
  }
  return String((payload.anamnese && payload.anamnese.medicacoes) || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean);
}

function fmtDataBR_(value) {
  var m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(value || '');
}

function appendPdfDocHeader_(body, payload, tipo) {
  var nbsp = '\u00A0';
  var table = body.appendTable([[nbsp, nbsp]]);
  try { table.setBorderWidth(0); } catch (ignored) {}
  var left = table.getCell(0, 0);
  var right = table.getCell(0, 1);
  // Cabeçalho na mesma largura única do corpo (155 + 400 = 555pt): o total
  // antigo de 540pt deixava o cabeçalho ~15pt mais curto que as seções.
  try { left.setWidth(155); right.setWidth(PDF_TABLE_TOTAL_ - 155); } catch (ignored2) {}
  setPdfCellPadding_(left, 1); setPdfCellPadding_(right, 1);
  var logoParagraph = left.getChild(0).asParagraph();
  try { logoParagraph.setAlignment(DocumentApp.HorizontalAlignment.LEFT).setSpacingBefore(0).setSpacingAfter(0); } catch (ignored3) {}
  var logoInserida = false;
  try {
    var blob = logoBlobEmCache_();
    if (blob) {
      var image = logoParagraph.appendInlineImage(blob);
      fitInlineImage_(image, 145, 44);
      logoInserida = true;
    }
  } catch (ignored4) { logoInserida = false; }
  if (!logoInserida) {
    logoParagraph.setText('CLAV');
    styleParagraph_(logoParagraph, 16, true, CLAV.MAIN_COLOR, DocumentApp.HorizontalAlignment.LEFT);
  }
  var atendimento = payload.atendimento || {};
  var title = pdfTitle_(tipo);
  var cfmDoc = tipo === 'AVALIACAO_PRE_ANESTESICA' || tipo === 'FICHA_ANESTESIA' || tipo === 'RECUPERACAO_POS_ANESTESICA';
  // Cabeçalho enxuto (pedido da equipe): sem "Gerado em" e sem o número do
  // atendimento, para reduzir o espaço impresso. A data de emissão segue no
  // rodapé de todas as páginas e o atendimento continua rastreável na planilha.
  var headerText = title + '\n' + nomeInstituicao_() + (cfmDoc ? '\nConforme Resolução CFM nº 2.174/2017' : '');
  right.setText(headerText);
  // Alinhamento corrigido (pedido da equipe): as quebras de linha criam
  // parágrafos separados dentro da célula e apenas o primeiro recebia o
  // estilo, deixando "Clínica de Anestesiologia de Vacaria" e "Conforme
  // Resolução CFM nº 2.174/2017" soltos à esquerda. Agora todas as linhas
  // do bloco encostam na mesma borda direita do título.
  for (var hi = 0; hi < right.getNumChildren(); hi++) {
    var headChild = right.getChild(hi);
    if (headChild.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    styleParagraph_(headChild.asParagraph(), hi === 0 ? 12 : 8, hi === 0, hi === 0 ? CLAV.MAIN_COLOR : '#334155', DocumentApp.HorizontalAlignment.RIGHT);
  }
}

// CORRECAO 15. O logotipo era baixado por UrlFetchApp a CADA documento: numa
// geracao em lote de 5 fichas, eram 5 downloads. Agora e baixado uma vez e
// guardado em cache por 6 horas.
function logoBlobEmCache_() {
  var chaveCache = 'CLAV_LOGO_B64_V1';
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (ignoredCache) {}
  if (cache) {
    try {
      var guardado = cacheGetChunked_(cache, chaveCache);
      if (guardado && guardado.b64) {
        return Utilities.newBlob(Utilities.base64Decode(guardado.b64), guardado.mime || 'image/png', 'clav-logo');
      }
    } catch (ignoredRead) {}
  }
  try {
    var url = getConfigValue_('LOGO_URL', CLAV.LOGO_URL);
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return null;
    var blob = response.getBlob();
    var bytes = blob.getBytes();
    if (!bytes || !bytes.length) return null;
    if (cache) {
      try {
        cachePutChunked_(cache, chaveCache, { b64: Utilities.base64Encode(bytes), mime: blob.getContentType() || 'image/png' }, 21600);
      } catch (ignoredWrite) {}
    }
    return blob;
  } catch (ignoredFetch) {
    return null;
  }
}

function fitInlineImage_(image, maxWidth, maxHeight) {
  try {
    var w = Number(image.getWidth() || maxWidth);
    var h = Number(image.getHeight() || maxHeight);
    if (!w || !h) { image.setWidth(maxWidth).setHeight(maxHeight); return; }
    var scale = Math.min(maxWidth / w, maxHeight / h, 1);
    image.setWidth(Math.max(1, Math.round(w * scale)));
    image.setHeight(Math.max(1, Math.round(h * scale)));
  } catch (ignored) {
    try { image.setWidth(maxWidth).setHeight(maxHeight); } catch (ignored2) {}
  }
}

function appendPdfDocSection_(body, title, rows, headers, widths) {
  var safeTitle = String(title || '').trim() || 'SEÇÃO';
  var titleTable = body.appendTable([[safeTitle]]);
  try { titleTable.setBorderColor('#1e574e').setBorderWidth(1); } catch (ignored) {}
  var titleCell = titleTable.getCell(0, 0);
  titleCell.setBackgroundColor('#e8f2f0');
  setPdfCellPadding_(titleCell, PDF_PAD_TITULO_);
  try { titleCell.setWidth(PDF_TABLE_TOTAL_); } catch (ignoredTW2) {}
  titleCell.editAsText().setFontFamily('Arial').setFontSize(PDF_FONT_TITULO_).setBold(true).setForegroundColor('#1e574e');

  var sourceRows = Array.isArray(rows) ? rows : [];
  var columnCount = Math.max(2, headers && headers.length ? headers.length : sourceRows.reduce(function (m, row) { return Math.max(m, Array.isArray(row) ? row.length : 1); }, 2));
  var values = sourceRows.map(function (row) {
    row = Array.isArray(row) ? row.slice(0, columnCount) : [row];
    while (row.length < columnCount) row.push('');
    return row.map(function (value, index) {
      var clean = value === undefined || value === null ? '' : String(value).trim();
      if (!clean && index === 0) clean = ' ';
      return clean;
    });
  });
  if (headers && headers.length) values.unshift(headers.map(String));
  if (!values.length) return;

  var table = body.appendTable(values);
  try { table.setBorderColor('#111111').setBorderWidth(1); } catch (ignored2) {}
  // As larguras informadas (ou colunas iguais, quando ausentes) são
  // normalizadas proporcionalmente para a largura única do PDF: as somas
  // originais variavam por seção e desalinhavam a borda direita.
  var pesosSec = [];
  for (var pi = 0; pi < columnCount; pi++) pesosSec.push(widths && Number(widths[pi]) > 0 ? Number(widths[pi]) : 1);
  var largurasSec = distribuirLargurasPdf_(pesosSec, PDF_TABLE_TOTAL_);
  for (var r = 0; r < table.getNumRows(); r++) {
    var isHeader = !!(headers && headers.length && r === 0);
    for (var c = 0; c < table.getRow(r).getNumCells(); c++) {
      var cell = table.getCell(r, c);
      if (isHeader || (!headers && c === 0)) cell.setBackgroundColor(isHeader ? '#e8f2f0' : '#f8fafc');
      setPdfCellPadding_(cell, PDF_PAD_CELULA_);
      try { cell.setWidth(largurasSec[c] || Math.round(PDF_TABLE_TOTAL_ / columnCount)); } catch (ignored3) {}
      cell.editAsText().setFontFamily('Arial').setFontSize(isHeader ? PDF_FONT_CABECALHO_ : (c === 0 && !headers ? PDF_FONT_CABECALHO_ : PDF_FONT_TABELA_)).setBold(isHeader || (!headers && c === 0)).setForegroundColor('#111111');
    }
  }
}

/**
 * Escolhe o número de colunas que desperdiça menos espaço.
 *
 * O layout antigo respeitava vãos individuais (span) e, por isso, deixava
 * células vazias no fim da linha — foi exatamente o que a equipe apontou na
 * seção "Escores de risco", com três itens numa grade de quatro colunas e um
 * quarto de linha em branco. Aqui, três itens viram três colunas e a linha
 * fecha cheia.
 *
 * Empate entre duas opções resolve pela grade mais densa (mais colunas,
 * menos linhas), que é o que economiza altura de página.
 */
function melhorNumeroDeColunas_(quantidade, preferido) {
  var maximo = Math.max(1, Math.min(6, Number(preferido) || 4));
  if (quantidade <= 0) return maximo;
  if (quantidade <= maximo) return quantidade;
  // Critério, nesta ordem: menor número de LINHAS (é o que economiza altura de
  // página) e, entre as opções empatadas, a que deixa menos célula vazia.
  var melhor = maximo;
  var melhorLinhas = Math.ceil(quantidade / maximo);
  var melhorSobra = maximo * melhorLinhas - quantidade;
  for (var n = maximo - 1; n >= 2; n--) {
    var linhas = Math.ceil(quantidade / n);
    var sobra = n * linhas - quantidade;
    if (linhas < melhorLinhas || (linhas === melhorLinhas && sobra < melhorSobra)) {
      melhorLinhas = linhas; melhorSobra = sobra; melhor = n;
    }
  }
  return melhor;
}

/**
 * Distribui os itens numa grade retangular de N colunas iguais.
 * Todas as linhas passam a ter o mesmo número de células com a mesma largura,
 * o que faz os separadores verticais coincidirem em toda a seção — a base do
 * alinhamento perfeito pedido pela equipe. O Google Docs não permite mesclar
 * células, então uniformizar é a única forma de alinhar de verdade.
 */
function packGridRows_(items, cols) {
  var lista = (items || []).filter(Boolean);
  if (!lista.length) return [];
  var n = melhorNumeroDeColunas_(lista.length, cols);
  var rows = [];
  for (var i = 0; i < lista.length; i += n) {
    var linha = [];
    for (var c = 0; c < n; c++) {
      var item = lista[i + c];
      linha.push(item ? { label: item[0], value: item[1], span: 1, destaque: item[3] || '' } : { label: '', value: '', span: 1, vazio: true });
    }
    rows.push(linha);
  }
  return rows;
}

function gridCellText_(cellItem) {
  var label = String(cellItem.label === undefined || cellItem.label === null ? '' : cellItem.label).trim();
  var value = cellItem.value === undefined || cellItem.value === null ? '' : String(cellItem.value).trim();
  if (!label && !value) return ' ';
  if (!label) return value || ' ';
  return label + '\n' + (value || ' ');
}

// Largura única de todas as tabelas do PDF. Página A4 (595pt) com margens de
// 20pt de cada lado = 555pt úteis. O valor antigo de 559pt excedia a área
// útil e, somado aos arredondamentos independentes por célula (somas de 558 a
// 560pt) e à tarja de título sem largura definida, deixava a borda direita
// das seções "serrilhada" — cada tabela terminava num ponto diferente.
