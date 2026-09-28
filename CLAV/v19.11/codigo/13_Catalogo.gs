/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 13_Catalogo.gs
 * Catálogo inteligente de procedimentos (lateralidade, caráter e porte)
 *
 * Conteúdo: Regex espelhadas cliente/servidor, sincronizarCatalogoProcedimentos_,
 * sincronizarCatalogoMedicacoes_ (20/09/2026), seeds de catálogo.
 *
 * v19.7 (27/09/2026) — lateralidade e caráter:
 *   - As listas de termos casam PALAVRA INTEIRA (\b(...)\b): prefixos como
 *     "ovari" ou "histerect" nunca casavam "ovariana"/"histerectomia". Foram
 *     acrescentadas as palavras inteiras dos casos relatados em produção
 *     (ooforectomia, salpingectomia, ureterolitotripsia, nefrolitotripsia,
 *     duplo J, adrenalectomia, drenagem de tórax, ouvido médio etc.).
 *   - "Ruptura" de manguito rotador, tendão, ligamento ou menisco deixa de
 *     sugerir Urgência; hérnia estrangulada = Emergência, encarcerada = Urgência.
 *   - catalogoAtivo_ e os seeds aplicam a tabela de correções de
 *     30_Catalogo_Correcoes.gs (linhas semeadas com valor errado). Valor editado
 *     pela equipe na aba PROCEDIMENTOS continua valendo.
 *   O bloco "ESPELHO cliente/servidor" é idêntico ao do Index.html.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

// ===== Regras de inteligência do procedimento (ESPELHO cliente/servidor) =====
// Índice de lateralidade e caráter mais provável a partir do nome do
// procedimento. Usado (1) pelo servidor para semear a aba PROCEDIMENTOS e
// (2) pela tela como reserva quando a linha da aba não trouxer metadados ou o
// procedimento for digitado livremente. Se alterar aqui, altere no par.
function clavTokenProc_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// Termos que indicam estrutura PAR (direita/esquerda) — lateralidade aplicável.
var CLAV_LAT_SIDE_RE_ = /\b(joelho|quadril|ombro|cotovelo|punho|mao|maos|dedo|dedos|polegar|pe|pes|tornozelo|calcaneo|calcanhar|femur|femoral|tibia|tibial|fibula|umero|umeral|radio|ulna|olecrano|clavicula|escapula|patela|menisco|meniscal|cruzado|colateral|manguito|rotador|labrum|labral|tunel do carpo|carpo|carpal|tunel cubital|ulnar|mediano|fibular|radial|dupuytren|gatilho|quervain|halux|hallux|joanete|unha|ungueal|inguinal|femoral|hidrocele|varicocele|orquiectomia|orquidopexia|orquiepididim|testic|epididim|espermatocele|mama|mamario|mamaria|mastectomia|setorectomia|quadrantectomia|mastopexia|axilar|sentinela|olho|ocular|intraocular|facectomia|catarata|pterigio|blefar|dacrio|estrabismo|glaucoma|trabeculectomia|vitrectomia|retina|retiniana|ceratoplastia|cornea|corneano|cristalino|iridectomia|iridoplastia|iridotomia|calazio|calazio|entropio|ectropio|ptose palpebral|palpebra|palpebral|ouvido|timpano|timpanoplastia|timpanotomia|miringo|mastoid|estaped|orelha|coclear|nefrectomia|nefrolitotomia|nefrostomia|pielo|ureter|ureteral|rim|renal|adrenal|suprarrenal|carotida|carotidea|varizes|safena|safenectomia|fistula arteriovenosa|fav|amputacao|desarticulacao|artroscop|artroplast|artrodese|osteossintese|osteotomia|fratura|luxacao|tendao|tendinea|tenorrafia|tenolise|tenodese|epicondil|bursa|bursite|parotid|submandibular|submaxilar|seio maxilar|caldwell|antrostomia|maxilar|zigom|orbita|orbitaria|orbital|condilo|condilar|atm|temporomandibular|nervo|neurolise|neurorrafia|plexo|braquial|coxa|perna|braco|antebraco|membro superior|membro inferior|membro|cotovelo|panturrilha|cistoscopia com|nasal|narina|hemilaringectomia|hemitireoidectomia|lobectomia|lobo|pulmonar|pleura|pleural|toracoscopia|toracotomia|drenagem toracica|toracostomia|hemitorax|acromio|glenoide|escafoide|metacarp|metatars|falange|interfalang|sindactilia|polidactilia|linfonodo cervical|esvaziamento cervical|hernia lombar|glandula salivar|lacrimal|canaliculo|ooforectomia|ovariectomia|ovariana|ovariano|anexial|salpingectomia|salpingostomia|salpingo|ectopica|bartholin|ureterolitotripsia|ureterolitotomia|ureterorrenolitotripsia|ureteronefrolitotripsia|ureteroscopia|ureterorrenoscopia|nefrolitotripsia|pielolitotomia|duplo j|varicocelectomia|hidrocelectomia|epididimectomia|adrenalectomia|suprarrenalectomia|hemitiroidectomia|pneumonectomia|pneumectomia|dreno de torax|drenagem de torax|dreno toracico|toracocentese|pleurodese|decorticacao|mastoidectomia|timpanomastoidectomia|colesteatoma|estapedectomia|estapedotomia)\b/;
// Termos que NEGAM a lateralidade mesmo com palavra par (linha média/órgão único).
var CLAV_LAT_NA_RE_ = /\b(bilateral|amigdal|adenoid|tonsil|uvul|septo|septoplastia|traqueo|tireoid(?!ectomia parcial)|tiroid|paratireoid|laring|farin|esofag|gastr|duoden|jejun|ile|colon|colect|reto|retal|anal|anorret|hemorroid|fistula anal|fissura|pilonidal|apendic|colecist|hepat|pancre|esplen|baco|hernia umbilical|umbilical|epigastr|incisional|ventral|diastase|abdomin|abdome|laparotomia|laparoscopia|videolaparoscopia|peritone|bexiga|vesical|uretra|uretral|prostat|utero|uterin|histerect|histerosc|colpo|vagin|vulv|cervic|cerclagem|cesar|parto|curetagem|tubaria|laqueadura|vasectomia|penis|penian|peniana|postectomia|circuncis|hipospadia|escroto|escrotal|coluna|lombar|toracica|cervical(?! de linfonodo)|vertebr|disc|craniot|cranio|hipofis|ventricul|derivacao|cardi|marcapasso|valv|coronar|aort|mediastin|estern|esternotomia|timo|timect|diafragm|endoscopia|colonoscopia|broncoscopia|cpre|polipectomia|dilatacao|bariatric|gastroplastia|bypass|sleeve|nasofaring|dentar|dental|exodontia|molar|gengiv|palato|labio|labial|lingua|lingual|frenul|freno|mandibul|mento|queixo|face|facial|rinoplastia|rinosseptoplastia|turbin|corneto|sinus|seios da face|septal|pescoco|cervicotomia|traqueia|tireoglosso|branquial|otoplastia|abdominoplastia|lipoaspiracao|dermolipectomia|lifting|ritidoplastia|biopsia de pele|lesao de pele|nevo|lipoma|cisto sebaceo|cisto epidermico|cisto triquilemal|queloide|cicatriz|ferida|corpo estranho|abscesso|bloqueio|infiltracao|puncao|cateter|porta|portocath|acesso venoso|dialise|fistula(?! arteriovenosa)|rtu|cistoscopia|ureteroscopia bilateral|litotripsia|circuncisao)\b/;
// Caráter: emergência > urgência > tempo sensível > eletivo.
var CLAV_CARATER_EMERG_RE_ = /\b(emergencia|laparotomia exploradora|trauma|traumatico|hemorragia|hemorragico|sangramento ativo|perfura|perfuracao|aneurisma roto|roto|rota|torcao|embolectomia|trombectomia|isquemia|isquemico|estrangulad[ao]|volvo|pneumotorax hipertensivo|hematoma extradural|hematoma subdural|cricotireoid|tamponamento cardiaco|choque|parada|placenta previa|descolamento prematuro|eclampsia|prolapso de cordao|sofrimento fetal)\b/;
var CLAV_CARATER_URG_RE_ = /\b(urgencia|ruptura(?! (?:d[eao]s? )?(?:manguito|tend|ligament|menisc|labr|biceps|quadricip|patelar|aquiles))|encarcerad[ao]|descolamento|tamponamento|descompress|apendic|abscesso|drenagem|fratura|luxacao|reducao|corpo estranho|colecistite|obstrucao|oclusao|desbridamento|fasciotomia|tenorrafia|sutura|laceracao|reimplante|empiema|toracostomia|dreno toracico|drenagem toracica|ectopica|aborto|pos aborto|retencao urinaria|cistostomia|nefrostomia|duplo j|osteomielite|artrite septica|infec|necros|necrose|queimad|gangrena|hidatidose|fecaloma|impactacao|epistaxe|hematoma|lavagem|amputacao de urgencia|cerclagem de urgencia|cesariana de urgencia|parto|exploracao)\b/;
var CLAV_CARATER_TEMPO_RE_ = /\b(neoplasia|neoplasica|cancer|carcinoma|tumor|tumoral|maligno|maligna|mastectomia|quadrantectomia|setorectomia|colectomia|gastrectomia|esofagectomia|pancreatectomia|duodenopancreatectomia|hepatectomia|prostatectomia radical|nefrectomia radical|cistectomia|orquiectomia radical|amputacao de reto|wertheim|whipple|melanoma|sarcoma|linfonodo sentinela|esvaziamento|linfadenectomia|lobectomia pulmonar|pneumectomia|bilobectomia|tireoidectomia total|histerectomia radical|vulvectomia|penectomia|glossectomia|laringectomia|faringectomia|mandibulectomia|maxilectomia|parotidectomia|biopsia de massa|exerese de tumor|resseccao de tumor|oncolog)\b/;
function clavInferirLateralidade_(nome) {
  var t = ' ' + clavTokenProc_(nome) + ' ';
  if (/\bbilateral\b/.test(t)) return 'BIL';
  if (/\b(unilateral|direit[oa]|esquerd[oa])\b/.test(t)) return 'SIDE';
  if (CLAV_LAT_NA_RE_.test(t)) {
    // Estrutura par explícita vence a regra de linha média (ex.: "hérnia inguinal", "fratura de fêmur").
    if (/\b(inguinal|femoral|hidrocele|varicocele|orquiectomia|orquidopexia|testic|mama|mastectomia|setorectomia|quadrantectomia|fratura|luxacao|joelho|quadril|ombro|olho|catarata|facectomia|pterigio|nefrectomia|ureter|carotida|amputacao|artroscop|artroplast|timpan|mastoid|linfonodo cervical|esvaziamento cervical|ooforectomia|ovariectomia|ovariana|anexial|salpingectomia|ectopica|bartholin|ureterolitotripsia|ureterorrenolitotripsia|ureteronefrolitotripsia|nefrolitotripsia|nefrolitotomia|ureteroscopia|duplo j|adrenalectomia|drenagem toracica|dreno toracico|dreno de torax|toracostomia|toracocentese|pleurodese)\b/.test(t)) return 'SIDE';
    return 'NA';
  }
  if (CLAV_LAT_SIDE_RE_.test(t)) return 'SIDE';
  return 'NA';
}
function clavInferirCarater_(nome) {
  var t = ' ' + clavTokenProc_(nome) + ' ';
  if (/\b(eletiv[oa])\b/.test(t)) return 'Eletivo';
  if (CLAV_CARATER_EMERG_RE_.test(t)) return 'Emergência';
  if (CLAV_CARATER_URG_RE_.test(t)) return 'Urgência';
  if (CLAV_CARATER_TEMPO_RE_.test(t)) return 'Tempo sensível';
  return 'Eletivo';
}
// Ordem sugerida das opções de caráter, do mais ao menos provável.
function clavOrdemCarater_(sugestao) {
  var base = ['Eletivo', 'Urgência', 'Emergência', 'Tempo sensível'];
  var mapa = {
    'Eletivo': ['Eletivo', 'Tempo sensível', 'Urgência', 'Emergência'],
    'Urgência': ['Urgência', 'Emergência', 'Eletivo', 'Tempo sensível'],
    'Emergência': ['Emergência', 'Urgência', 'Eletivo', 'Tempo sensível'],
    'Tempo sensível': ['Tempo sensível', 'Eletivo', 'Urgência', 'Emergência']
  };
  return mapa[sugestao] || base;
}
// Ordem sugerida das opções de lateralidade e valor pré-selecionado.
function clavOrdemLateralidade_(lat) {
  if (lat === 'BIL') return { valor: 'Bilateral', ordem: ['Bilateral', 'Direita', 'Esquerda', 'Não se aplica'] };
  if (lat === 'SIDE') return { valor: '', ordem: ['Direita', 'Esquerda', 'Bilateral', 'Não se aplica'] };
  return { valor: 'Não se aplica', ordem: ['Não se aplica', 'Direita', 'Esquerda', 'Bilateral'] };
}
var CLAV_PESO_CARATER_ = { 'Eletivo': 0, 'Tempo sensível': 1, 'Urgência': 2, 'Emergência': 3 };
// Consolida as sugestões de vários procedimentos selecionados ao mesmo tempo.
function clavSugestaoProcedimentos_(itens) {
  var lat = 'NA', carater = 'Eletivo', peso = -1, grupos = [];
  (itens || []).forEach(function (item) {
    if (!item) return;
    var l = item.lat || clavInferirLateralidade_(item.nome);
    if (l === 'BIL') lat = 'BIL';
    else if (l === 'SIDE' && lat !== 'BIL') lat = 'SIDE';
    var c = item.carater || clavInferirCarater_(item.nome);
    if (CLAV_PESO_CARATER_[c] > peso) { peso = CLAV_PESO_CARATER_[c]; carater = c; }
    if (item.grupo && grupos.indexOf(item.grupo) < 0) grupos.push(item.grupo);
  });
  return { lateralidade: clavOrdemLateralidade_(lat), lat: lat, carater: carater, ordemCarater: clavOrdemCarater_(carater), grupos: grupos };
}

// v19.10 (pedido A5 da equipe). O servidor passa a classificar a lateralidade pela
// MESMA fonte da tela: a coluna "lateralidade" da aba PROCEDIMENTOS (com a tabela
// de correções de 30_Catalogo_Correcoes.gs). Antes, gerarAlertasServidor_ só usava
// a inferência pelo nome, e 104 procedimentos apareciam "com lado" na tela e "sem
// lateralidade" na planilha, disparando o alerta grave de lateralidade indevida ao
// escolher o lado. A inferência pelo nome fica só como reserva para procedimento
// digitado fora do catálogo. O catálogo é lido uma vez por execução.
var CLAV_PROC_CAT_CACHE_ = null;
function clavCatalogoProcedimentosServidor_() {
  if (CLAV_PROC_CAT_CACHE_) return CLAV_PROC_CAT_CACHE_;
  var lista = [];
  try { lista = catalogoAtivo_('PROCEDIMENTOS', DEFAULT_PROCEDIMENTOS_()) || []; } catch (ignored) { lista = []; }
  var mapa = {};
  lista.forEach(function (item) {
    var chave = clavTokenProc_(item && item.nome);
    if (chave && !mapa[chave]) mapa[chave] = item;
  });
  CLAV_PROC_CAT_CACHE_ = mapa;
  return mapa;
}
function clavItemProcServidor_(nome) {
  var item = clavCatalogoProcedimentosServidor_()[clavTokenProc_(nome)] || null;
  var base = item
    ? { nome: item.nome, grupo: item.grupo || '', lateralidade: item.lateralidade || '', carater: item.carater || '' }
    : { nome: String(nome || ''), grupo: '' };
  base.lat = base.lateralidade || clavInferirLateralidade_(base.nome);
  return base;
}

// Grupo do procedimento → grupos de profissionais (aba PROFISSIONAIS) em ordem
// de probabilidade. Espelhado no cliente (CLAV_EQUIPE_POR_GRUPO_).
function CLAV_EQUIPE_POR_GRUPO_() {
  return {
    'Endoscopia e Colonoscopia': ['Gastroenterologia e Endoscopia', 'Cirurgia Geral'],
    'Pele e Partes Moles (Dermatologia ou Oncologia)': ['Dermatologia', 'Cirurgia Plástica', 'Cirurgia Geral'],
    'Cirurgia Vascular e Acessos': ['Cirurgia Vascular'],
    'Bloqueios e Infiltrações': ['Anestesiologia', 'Ortopedia e Traumatologia'],
    'Ginecologia e Obstetrícia': ['Ginecologia e Obstetrícia'],
    'Urologia': ['Urologia'],
    'Ortopedia e Traumatologia': ['Ortopedia e Traumatologia'],
    'Oftalmologia': ['Oftalmologia'],
    'Cirurgia Plástica e Mastologia': ['Cirurgia Plástica', 'Mastologia', 'Cirurgia Geral'],
    'Otorrinolaringologia + Cabeça e Pescoço': ['Otorrinolaringologia', 'Cirurgia de Cabeça e Pescoço'],
    'Bucomaxilofacial': ['Bucomaxilofacial'],
    'Cirurgia Torácica': ['Cirurgia Torácica', 'Cirurgia Geral'],
    'Neurocirurgia': ['Neurocirurgia'],
    'Cirurgia Pediátrica': ['Cirurgia Pediátrica', 'Cirurgia Geral'],
    'Cirurgia Geral e Digestiva': ['Cirurgia Geral', 'Gastroenterologia e Endoscopia'],
    'Cirurgia Cardíaca e Hemodinâmica': ['Cirurgia Cardíaca', 'Cardiologia', 'Hemodinâmica'],
    'Radiologia Intervencionista': ['Radiologia e Diagnóstico por Imagem (Intervencionista)']
  };
}

function catalogoAtivo_(sheetName, fallback) {
  try {
    var rows = all_(sheetName).filter(function (r) {
      var ativo = String(r.ativo === undefined || r.ativo === null ? 'SIM' : r.ativo).trim().toUpperCase();
      return String(r.nome || '').trim() && ativo !== 'NÃO' && ativo !== 'NAO';
    }).map(function (r, idx) {
      var item = { nome: String(r.nome).trim(), grupo: String(r.grupo || '').trim(), ordem: Number(r.ordem) > 0 ? Number(r.ordem) : (idx + 1) };
      // Metadados de inteligência do procedimento (aba PROCEDIMENTOS). Quando a
      // linha estiver em branco, a tela e o servidor inferem pelo nome.
      if (sheetName === 'PROCEDIMENTOS') {
        item.lateralidade = normalizarLateralidadeCatalogo_(r.lateralidade);
        item.carater = normalizarCaraterCatalogo_(r.carater);
        item.porte = String(r.porte || '').trim();
        // v19.7: linha ainda com o valor semeado errado (ex.: ooforectomia "sem
        // lateralidade", manguito rotador "urgência") recebe a correção da
        // tabela de 30_Catalogo_Correcoes.gs. Valor editado pela equipe na aba
        // é respeitado: a correção só vale quando a célula ainda é a da semente.
        item = clavCorrigirItemCatalogo_(item);
      }
      return item;
    });
    if (rows.length) {
      rows.sort(function (a, b) { return a.ordem - b.ordem; });
      return rows.map(function (r) {
        var out = { nome: r.nome, grupo: r.grupo };
        if (sheetName === 'PROCEDIMENTOS') {
          out.lateralidade = r.lateralidade || clavInferirLateralidade_(r.nome);
          out.carater = r.carater || clavInferirCarater_(r.nome);
          out.porte = r.porte || '';
        }
        return out;
      });
    }
  } catch (ignored) {}
  return fallback;
}

// Aceita "SIDE", "BIL", "NA" e também os textos humanos da aba (Direita/Esquerda,
// Bilateral, Não se aplica). Vazio → '' (inferir pelo nome).
function normalizarLateralidadeCatalogo_(value) {
  var t = tokenClav_(String(value || ''));
  if (!t) return '';
  if (t === 'side' || t === 'lado' || t.indexOf('direita') >= 0 || t.indexOf('esquerda') >= 0 || t === 'unilateral') return 'SIDE';
  if (t === 'bil' || t.indexOf('bilateral') >= 0) return 'BIL';
  if (t === 'na' || t.indexOf('nao se aplica') >= 0 || t === 'n a') return 'NA';
  return '';
}

function normalizarCaraterCatalogo_(value) {
  var t = tokenClav_(String(value || ''));
  if (!t) return '';
  if (t.indexOf('emerg') === 0) return 'Emergência';
  if (t.indexOf('urg') === 0) return 'Urgência';
  if (t.indexOf('tempo') === 0) return 'Tempo sensível';
  if (t.indexOf('elet') === 0) return 'Eletivo';
  return '';
}

/**
 * Sincroniza a aba PROCEDIMENTOS com o catálogo embutido (DEFAULT_PROCEDIMENTOS_):
 * acrescenta os procedimentos que ainda não existem (comparação por nome
 * normalizado) e preenche lateralidade/caráter/porte nas linhas em branco.
 * Nunca apaga nem reordena linhas já existentes — a equipe pode editar a aba
 * livremente. Executa uma vez por versão (propriedade CATALOG_SYNC_PROP) e
 * também pelo menu administrativo (adminSincronizarCatalogo).
 *
 * v19.7: os itens novos e os metadados preenchidos passam pela tabela de
 * correções (clavAplicarCorrecoesCatalogo_). Linhas já existentes com valor
 * semeado errado NÃO são regravadas aqui — para isso existe
 * adminAplicarCorrecaoCatalogo (30_Catalogo_Correcoes.gs), executada pelo editor.
 */
function sincronizarCatalogoProcedimentos_(force) {
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty(CLAV.CATALOG_SYNC_PROP) === (CLAV.CATALOG_VERSION || CLAV.VERSION)) return { skipped: true };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { skipped: true, reason: 'lock' };
  try {
    if (!force && props.getProperty(CLAV.CATALOG_SYNC_PROP) === (CLAV.CATALOG_VERSION || CLAV.VERSION)) return { skipped: true };
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName('PROCEDIMENTOS');
    if (!sh) return { skipped: true, reason: 'sheet' };
    ensureHeaders_(sh, CLAV.SHEETS.PROCEDIMENTOS.headers, CLAV.SHEETS.PROCEDIMENTOS.color);
    var headers = CLAV.SHEETS.PROCEDIMENTOS.headers;
    var col = {};
    headers.forEach(function (h, i) { col[h] = i; });
    var lastRow = sh.getLastRow();
    var existing = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
    var seen = {};
    var maxOrdem = 0;
    var updates = [];
    existing.forEach(function (row, idx) {
      var nome = String(row[col.nome] || '').trim();
      if (!nome) return;
      seen[tokenClav_(nome)] = true;
      var ordem = Number(row[col.ordem]);
      if (ordem > maxOrdem) maxOrdem = ordem;
      var changed = false;
      var sugerido = clavCorrigirItemCatalogo_({ nome: nome, lateralidade: '', carater: '' });
      if (!String(row[col.lateralidade] || '').trim()) { row[col.lateralidade] = sugerido.lateralidade || clavInferirLateralidade_(nome); changed = true; }
      if (!String(row[col.carater] || '').trim()) { row[col.carater] = sugerido.carater || clavInferirCarater_(nome); changed = true; }
      if (changed) updates.push({ r: idx + 2, row: row });
    });
    updates.forEach(function (u) {
      sh.getRange(u.r, col.lateralidade + 1, 1, 2).setValues([[u.row[col.lateralidade], u.row[col.carater]]]);
    });
    var novos = [];
    clavAplicarCorrecoesCatalogo_(DEFAULT_PROCEDIMENTOS_()).forEach(function (item) {
      var key = tokenClav_(item.nome);
      if (!key || seen[key]) return;
      seen[key] = true;
      maxOrdem += 1;
      novos.push([item.nome, item.grupo || '', 'SIM', maxOrdem, item.lateralidade || clavInferirLateralidade_(item.nome), item.carater || clavInferirCarater_(item.nome), item.porte || '']);
    });
    if (novos.length) {
      sh.getRange(sh.getLastRow() + 1, 1, novos.length, headers.length).setValues(novos);
    }
    props.setProperty(CLAV.CATALOG_SYNC_PROP, (CLAV.CATALOG_VERSION || CLAV.VERSION));
    try { CacheService.getScriptCache().remove('CLAV_LOOKUPS_V1'); } catch (ignored) {}
    Logger.log('Catálogo PROCEDIMENTOS sincronizado: ' + novos.length + ' novos, ' + updates.length + ' metadados preenchidos.');
    return { adicionados: novos.length, atualizados: updates.length };
  } catch (err) {
    Logger.log('Falha ao sincronizar catálogo: ' + (err && err.message ? err.message : err));
    return { erro: String(err && err.message ? err.message : err) };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/** Menu administrativo: força a sincronização do catálogo de procedimentos. */
function adminSincronizarCatalogo(token) {
  return safe_('adminSincronizarCatalogo', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    if (!canManageUsers_(user) && !isMedical_(user)) throw new Error('Perfil sem permissão para sincronizar o catálogo.');
    var res = sincronizarCatalogoProcedimentos_(true);
    logAudit_(user, 'CATALOGO_SINCRONIZADO', 'PROCEDIMENTOS', 'PROCEDIMENTOS', null, res, 'OK', '', '');
    return ok_(res);
  }, {});
}

// Propriedade do script que guarda a assinatura da última lista de medicações
// já conferida contra a aba. Mudou a lista no código -> muda a assinatura ->
// a conferência roda uma vez no próximo carregamento.
var CLAV_MEDICACOES_SYNC_PROP_ = 'CLAV_MEDICACOES_SYNC_V1';

function assinaturaCatalogoMedicacoes_(lista) {
  return String((lista || []).length) + ':' + sha256_((lista || []).map(function (item) {
    return tokenClav_(item.nome) + '|' + tokenClav_(item.grupo || '');
  }).join('\n'));
}

/**
 * Sincroniza a aba MEDICACOES com a lista embutida (DEFAULT_MEDICACOES_):
 * acrescenta ao final da aba somente as medicações que ainda não existem
 * (comparação por nome normalizado, inclusive contra linhas inativas).
 *
 * Garantias:
 *   - nunca apaga, reordena nem regrava linhas já existentes;
 *   - não passa por ensureHeaders_/migrateSheetSchema_: se o cabeçalho da aba
 *     não for exatamente nome | grupo | ativo | ordem, não faz nada;
 *   - com simular = true apenas informa o que faria, sem escrever.
 *
 * Ordem do item novo: fracionária (ex.: 57,001), logo após o último item do
 * mesmo grupo, para que ele apareça dentro do grupo na tela sem renumerar
 * ninguém. Grupo que ainda não existe na aba entra depois do último item.
 *
 * Executa quando a lista do código muda (assinatura em CLAV_MEDICACOES_SYNC_PROP_)
 * e pelo editor: adminSincronizarMedicacoes / adminSimularSincronizacaoMedicacoes.
 */
function sincronizarCatalogoMedicacoes_(force, simular) {
  var props = PropertiesService.getScriptProperties();
  var lista = DEFAULT_MEDICACOES_();
  var assinatura = assinaturaCatalogoMedicacoes_(lista);
  if (!force && !simular && props.getProperty(CLAV_MEDICACOES_SYNC_PROP_) === assinatura) return { skipped: true };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { skipped: true, reason: 'lock' };
  try {
    if (!force && !simular && props.getProperty(CLAV_MEDICACOES_SYNC_PROP_) === assinatura) return { skipped: true };
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName('MEDICACOES');
    if (!sh) return { skipped: true, reason: 'sheet' };
    var headers = CLAV.SHEETS.MEDICACOES.headers;
    var col = {};
    headers.forEach(function (h, i) { col[h] = i; });
    var lastRow = sh.getLastRow();

    // Aba vazia (só cabeçalho ou nem isso): é o caso de instalação nova, tratado
    // pelo seed normal. Aqui não se cria cabeçalho nem se mexe em formatação.
    if (lastRow < 2) {
      if (simular) return { simulacao: true, abaVazia: true, adicionaria: lista.length };
      seedCatalogo_('MEDICACOES', lista);
      if (sh.getLastRow() > 1) props.setProperty(CLAV_MEDICACOES_SYNC_PROP_, assinatura);
      return { abaVazia: true, adicionados: Math.max(sh.getLastRow() - 1, 0) };
    }

    var atuais = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0].map(function (h) { return String(h || '').trim(); });
    for (var c = 0; c < headers.length; c++) {
      if (atuais[c] !== headers[c]) {
        Logger.log('Catálogo MEDICACOES: cabeçalho diferente do esperado (' + atuais.join(' | ') + '). Nada foi alterado.');
        return { erro: 'Cabeçalho da aba MEDICACOES diferente do esperado. Nada foi alterado.', cabecalho: atuais };
      }
    }

    var existing = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var seen = {};
    var maxOrdem = 0;
    var maxOrdemGrupo = {};
    var linhasComNome = 0;
    existing.forEach(function (row, idx) {
      var nome = String(row[col.nome] || '').trim();
      if (!nome) return;
      linhasComNome += 1;
      seen[tokenClav_(nome)] = true;
      var ordem = Number(row[col.ordem]);
      if (!(ordem > 0)) ordem = idx + 1;
      if (ordem > maxOrdem) maxOrdem = ordem;
      var g = tokenClav_(row[col.grupo] || '');
      if (maxOrdemGrupo[g] === undefined || ordem > maxOrdemGrupo[g]) maxOrdemGrupo[g] = ordem;
    });

    var novosPorGrupo = {};
    var gruposNovos = [];
    lista.forEach(function (item) {
      var key = tokenClav_(item && item.nome);
      if (!key || seen[key]) return;
      seen[key] = true;
      var g = tokenClav_(item.grupo || '');
      if (!novosPorGrupo[g]) { novosPorGrupo[g] = []; gruposNovos.push(g); }
      novosPorGrupo[g].push(item);
    });

    var novos = [];
    gruposNovos.forEach(function (g) {
      var base = maxOrdemGrupo[g];
      novosPorGrupo[g].forEach(function (item, i) {
        var ordem;
        if (base !== undefined) {
          // Dentro do grupo existente: 57 -> 57,001; 57,002; ... sem alcançar 58.
          ordem = Math.round((base + (i + 1) / 1000) * 1000) / 1000;
          if (ordem >= Math.floor(base) + 1) ordem = Math.floor(base) + 0.999;
        } else {
          maxOrdem = Math.floor(maxOrdem) + 1;
          ordem = maxOrdem;
        }
        novos.push([String(item.nome).trim(), String(item.grupo || '').trim(), 'SIM', ordem]);
      });
    });

    if (simular) {
      return {
        simulacao: true,
        linhasNaAba: linhasComNome,
        itensNoCodigo: lista.length,
        adicionaria: novos.length,
        itens: novos.map(function (r) { return { nome: r[0], grupo: r[1], ordem: r[3] }; })
      };
    }

    if (novos.length) {
      ensureGridSize_(sh, headers.length, lastRow + novos.length);
      sh.getRange(lastRow + 1, 1, novos.length, headers.length).setValues(novos);
      // O filtro da aba cobre só as linhas que existiam; recria para incluir as novas.
      try {
        var filtro = sh.getFilter();
        if (filtro) {
          filtro.remove();
          sh.getRange(1, 1, sh.getLastRow(), headers.length).createFilter();
        }
      } catch (ignoredFiltro) {}
      SpreadsheetApp.flush();
    }
    props.setProperty(CLAV_MEDICACOES_SYNC_PROP_, assinatura);
    Logger.log('Catálogo MEDICACOES sincronizado: ' + novos.length + ' novas; ' + linhasComNome + ' já existiam e não foram tocadas.');
    return { adicionados: novos.length, jaExistiam: linhasComNome, totalNaAba: linhasComNome + novos.length };
  } catch (err) {
    Logger.log('Falha ao sincronizar medicações: ' + (err && err.message ? err.message : err));
    return { erro: String(err && err.message ? err.message : err) };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function seedCatalogos_() {
  seedCatalogo_('PROFISSIONAIS', DEFAULT_PROFISSIONAIS_().concat(DEFAULT_ANESTESIOLOGISTAS_()));
  seedCatalogo_('PROCEDIMENTOS', clavAplicarCorrecoesCatalogo_(DEFAULT_PROCEDIMENTOS_()));
  seedCatalogo_('MEDICACOES', DEFAULT_MEDICACOES_());
  seedConvenios_();
  seedMunicipios_();
}

function seedCatalogo_(sheetName, items) {
  try {
    var sh = getSpreadsheet_().getSheetByName(sheetName);
    if (!sh || sh.getLastRow() > 1) return;
    var values;
    if (sheetName === 'PROCEDIMENTOS') {
      values = (items || []).map(function (item, idx) {
        return [item.nome, item.grupo || '', 'SIM', idx + 1, item.lateralidade || clavInferirLateralidade_(item.nome), item.carater || clavInferirCarater_(item.nome), item.porte || ''];
      });
      if (values.length) sh.getRange(2, 1, values.length, 7).setValues(values);
      return;
    }
    values = (items || []).map(function (item, idx) { return [item.nome, item.grupo || '', 'SIM', idx + 1]; });
    if (values.length) sh.getRange(2, 1, values.length, 4).setValues(values);
  } catch (ignored) {}
}

function seedConvenios_() {
  try {
    var sh = getSpreadsheet_().getSheetByName('CONVENIOS');
    if (!sh || sh.getLastRow() > 1) return;
    var values = DEFAULT_CONVENIOS_().map(function (nome, idx) { return [nome, 'SIM', idx + 1]; });
    if (values.length) sh.getRange(2, 1, values.length, 3).setValues(values);
  } catch (ignored) {}
}

function seedMunicipios_() {
  try {
    var sh = getSpreadsheet_().getSheetByName('MUNICIPIOS');
    if (!sh || sh.getLastRow() > 1) return;
    var values = DEFAULT_MUNICIPIOS_().map(function (m) { return [m.nome, m.uf, 'SIM']; });
    var block = 2000;
    for (var i = 0; i < values.length; i += block) {
      var slice = values.slice(i, i + block);
      sh.getRange(2 + i, 1, slice.length, 3).setValues(slice);
    }
  } catch (ignored) {}
}