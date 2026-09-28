/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos
 *
 * MÓDULO: 29_Chamados.gs
 * Chamados de suporte abertos por qualquer login, de dentro do sistema.
 *
 * Conteúdo: abrirChamado (tela), garantirAbaChamados_, e-mail ao suporte,
 * anexos (prints) na pasta do sistema no Drive, limite de envio e proteção
 * contra envio duplicado.
 *
 * Regras:
 *   - Não lê nem grava nada do atendimento: o prontuário aberto não é tocado.
 *   - O chamado é gravado na aba CHAMADOS mesmo que o e-mail falhe.
 *   - A aba CHAMADOS é criada na primeira vez, sozinha; nenhuma outra aba é
 *     visitada e nada passa por migrateSheetSchema_ depois de criada.
 *   - Destinatários: chave CHAMADOS_EMAILS da aba CONFIG (separados por
 *     vírgula). Se a chave não existir, vale CLAV_CHAMADOS_EMAIL_PADRAO_.
 *   - O e-mail leva o identificador do atendimento, nunca o nome do paciente.
 *     O print pode mostrar dados do paciente: por isso ele só vai para o
 *     e-mail de suporte da clínica e para a pasta restrita do sistema.
 */

var CLAV_CHAMADOS_EMAIL_PADRAO_ = 'contatoclavrs@gmail.com';
var CLAV_CHAMADOS_LIMITES_ = {
  intervalo_segundos: 15,      // entre dois chamados do mesmo login
  por_dia: 30,                 // por login
  imagens: 3,
  bytes_por_imagem: 3500000,
  descricao: 4000
};

function garantirAbaChamados_() {
  if (CLAV_RUNTIME.sheets.CHAMADOS) return CLAV_RUNTIME.sheets.CHAMADOS;
  var def = CLAV.SHEETS.CHAMADOS;
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName('CHAMADOS');
  if (!sh) {
    sh = ss.insertSheet('CHAMADOS', ss.getSheets().length);
    ensureHeaders_(sh, def.headers, def.color);
  } else if (sh.getLastRow() < 1) {
    ensureHeaders_(sh, def.headers, def.color);
  } else {
    var cab = sh.getRange(1, 1, 1, def.headers.length).getDisplayValues()[0].map(function (h) { return String(h || '').trim(); });
    for (var i = 0; i < def.headers.length; i++) {
      if (cab[i] !== def.headers[i]) {
        throw appError_('CHAMADOS_CABECALHO', 'A aba CHAMADOS está com cabeçalho diferente do esperado. Nada foi gravado; avise o suporte.');
      }
    }
  }
  CLAV_RUNTIME.sheets.CHAMADOS = sh;
  return sh;
}

function chamadosDestinatarios_() {
  var bruto = String(getConfigValue_('CHAMADOS_EMAILS', CLAV_CHAMADOS_EMAIL_PADRAO_) || '');
  var lista = bruto.split(/[,;\s]+/).map(function (e) { return normalizeEmail_(e); }).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
  return lista.length ? lista : [CLAV_CHAMADOS_EMAIL_PADRAO_];
}

function chamadoTextoCurto_(valor, max) {
  return clean_(String(valor === undefined || valor === null ? '' : valor), max || 200);
}

function chamadoListaCurta_(lista, maxItens, maxTexto) {
  if (!Array.isArray(lista)) return [];
  var vistos = {};
  var out = [];
  lista.forEach(function (item) {
    var t = chamadoTextoCurto_(item, maxTexto || 120);
    if (!t || vistos[t] || out.length >= (maxItens || 12)) return;
    vistos[t] = true;
    out.push(t);
  });
  return out;
}

// Aceita somente imagem em data URL (png, jpeg ou webp) dentro do limite.
function chamadoImagens_(imagens, protocolo) {
  if (!Array.isArray(imagens)) return [];
  var blobs = [];
  imagens.slice(0, CLAV_CHAMADOS_LIMITES_.imagens).forEach(function (img, i) {
    var m = String(img && img.dataUrl || '').match(/^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+\/=]+)$/);
    if (!m) return;
    var bytes = Utilities.base64Decode(m[3]);
    if (!bytes.length || bytes.length > CLAV_CHAMADOS_LIMITES_.bytes_por_imagem) return;
    var ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    blobs.push(Utilities.newBlob(bytes, m[1], protocolo + '_print' + (i + 1) + '.' + ext));
  });
  return blobs;
}

function chamadoPastaAnexos_() {
  var raiz = getAppFolder_();
  var it = raiz.getFoldersByName('Chamados de suporte');
  return it.hasNext() ? it.next() : raiz.createFolder('Chamados de suporte');
}

function chamadoContexto_(ctx) {
  ctx = (ctx && typeof ctx === 'object') ? ctx : {};
  var erros = Array.isArray(ctx.erros) ? ctx.erros.slice(-8).map(function (e) {
    return { quando: chamadoTextoCurto_(e && e.quando, 40), tipo: chamadoTextoCurto_(e && e.tipo, 30), texto: chamadoTextoCurto_(e && e.texto, 400) };
  }) : [];
  return {
    tela: chamadoTextoCurto_(ctx.tela, 80),
    atendimento_id: chamadoTextoCurto_(ctx.atendimento_id, 80),
    status_atendimento: chamadoTextoCurto_(ctx.status_atendimento, 40),
    revisao: chamadoTextoCurto_(ctx.revisao, 20),
    alteracoes_nao_salvas: ctx.alteracoes_nao_salvas ? 'sim' : 'não',
    ultimo_erro_salvamento: chamadoTextoCurto_(ctx.ultimo_erro_salvamento, 400),
    versao_tela: chamadoTextoCurto_(ctx.versao_tela, 120),
    dentro_de_site: ctx.dentro_de_site ? 'sim' : 'não',
    online: ctx.online === false ? 'não' : 'sim',
    janela: chamadoTextoCurto_(ctx.janela, 40),
    aba_navegador: chamadoTextoCurto_(ctx.aba_navegador, 60),
    hora_local: chamadoTextoCurto_(ctx.hora_local, 40),
    erros: erros
  };
}

function chamadoEmailHtml_(c, user, ctx, links) {
  var linha = function (rotulo, valor) {
    return '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;font-weight:bold;width:210px;vertical-align:top">' + esc_(rotulo) + '</td><td style="padding:6px 10px;border:1px solid #cbd5e1;vertical-align:top">' + valor + '</td></tr>';
  };
  var texto = function (v) { return esc_(v || '—'); };
  var html = [];
  html.push('<div style="font-family:Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;background:#ffffff">');
  html.push('<h2 style="color:#1e574e;margin:0 0 4px 0">CLAV | Chamado de suporte ' + esc_(c.chamado_id) + '</h2>');
  html.push('<p style="margin:0 0 14px 0;color:#475569">Aberto em ' + esc_(nowBR_()) + ' por <b>' + esc_(user.nome) + '</b></p>');
  html.push('<table style="border-collapse:collapse;width:100%;max-width:820px">');
  html.push(linha('Urgência', '<b>' + texto(c.urgencia) + '</b>'));
  html.push(linha('O que está acontecendo', c.categorias ? esc_(c.categorias).replace(/ \| /g, '<br>') : '—'));
  html.push(linha('Frequência', texto(c.frequencia)));
  html.push(linha('Descrição', c.descricao ? esc_(c.descricao).replace(/\n/g, '<br>') : '—'));
  html.push(linha('Quem abriu', texto(user.nome) + '<br>Perfil: ' + texto(user.perfil) + ' | Login: ' + texto(user.usuario) + '<br>E-mail: ' + texto(user.email) + ' | Telefone: ' + texto(user.telefone)));
  html.push(linha('Tela em uso', texto(ctx.tela)));
  html.push(linha('Atendimento aberto', texto(ctx.atendimento_id) + (ctx.atendimento_id ? ' (status ' + texto(ctx.status_atendimento) + ', revisão ' + texto(ctx.revisao) + ')' : '') + '<br>Alterações não salvas: ' + texto(ctx.alteracoes_nao_salvas)));
  if (ctx.ultimo_erro_salvamento) html.push(linha('Último erro de salvamento', texto(ctx.ultimo_erro_salvamento)));
  html.push(linha('Versão', 'Pacote ' + texto(c.build) + '<br>Tela: ' + texto(ctx.versao_tela)));
  html.push(linha('Ambiente', 'Dentro de site: ' + texto(ctx.dentro_de_site) + ' | Online: ' + texto(ctx.online) + ' | Janela: ' + texto(ctx.janela) + '<br>' + texto(c.user_agent)));
  if (ctx.erros && ctx.erros.length) {
    html.push(linha('Últimos avisos e erros na tela', ctx.erros.map(function (e) { return esc_(e.quando + ' [' + e.tipo + '] ' + e.texto); }).join('<br>')));
  }
  html.push(linha('Prints', links.length ? links.map(function (l, i) { return '<a href="' + esc_(l) + '">Print ' + (i + 1) + '</a>'; }).join(' | ') + ' (também em anexo)' : 'Nenhum'));
  html.push('</table>');
  html.push('<p style="color:#64748b;font-size:12px;margin-top:14px">Registro na aba CHAMADOS da planilha-base. Responder a este e-mail escreve para quem abriu o chamado, quando ele tem e-mail cadastrado.</p>');
  html.push('</div>');
  return html.join('');
}

function chamadoEmailTexto_(c, user, ctx, links) {
  var L = [];
  L.push('CLAV | Chamado de suporte ' + c.chamado_id + ' — ' + nowBR_());
  L.push('Quem abriu: ' + user.nome + ' (' + user.perfil + ', login ' + user.usuario + ')');
  L.push('Urgência: ' + (c.urgencia || '—'));
  L.push('O que está acontecendo: ' + (c.categorias || '—'));
  L.push('Frequência: ' + (c.frequencia || '—'));
  L.push('Descrição: ' + (c.descricao || '—'));
  L.push('Tela: ' + (ctx.tela || '—') + ' | Atendimento: ' + (ctx.atendimento_id || '—'));
  L.push('Versão: pacote ' + c.build + ' | ' + (ctx.versao_tela || ''));
  if (links.length) L.push('Prints: ' + links.join(' '));
  return L.join('\n');
}

/** Tela: botão "Chamado" (todos os logins). */
function abrirChamado(token, payload) {
  return safe_('abrirChamado', function () {
    requireInstalled_();
    var user = validarSessao_(token);
    payload = (payload && typeof payload === 'object') ? payload : {};

    var requestId = chamadoTextoCurto_(payload.request_id, 80);
    if (!requestId) throw appError_('CHAMADO_INVALIDO', 'Pedido sem identificador. Feche a janela do chamado e abra de novo.');
    var categorias = chamadoListaCurta_(payload.categorias, 12, 120);
    var descricao = clean_(String(payload.descricao || ''), CLAV_CHAMADOS_LIMITES_.descricao);
    if (!categorias.length && descricao.length < 5) {
      throw appError_('CHAMADO_VAZIO', 'Marque pelo menos uma opção ou descreva o problema em algumas palavras.');
    }

    // Envio repetido do mesmo pedido (duplo clique, reenvio após demora): devolve o protocolo já criado.
    try {
      if (getSpreadsheet_().getSheetByName('CHAMADOS')) {
        garantirAbaChamados_();
        var repetido = findRowBy_('CHAMADOS', 'request_id', requestId);
        if (repetido) {
          return ok_({ protocolo: repetido.obj.chamado_id, repetido: true, email_enviado: String(repetido.obj.email_status || '').indexOf('ENVIADO') === 0, destino: String(repetido.obj.email_destino || ''), anexos: 0 });
        }
      }
    } catch (ignoredRepetido) {}

    // Limite de envio por login.
    var cache = CacheService.getScriptCache();
    var chaveIntervalo = 'CLAV_CHAMADO_INT_' + String(user.usuario_id || user.usuario);
    if (cache.get(chaveIntervalo)) {
      throw appError_('CHAMADO_AGUARDE', 'Seu chamado anterior acabou de ser enviado. Aguarde alguns segundos para abrir outro.');
    }

    var protocolo = uid_('CH');
    var ctx = chamadoContexto_(payload.contexto);
    var userAgent = String(payload.user_agent || '').slice(0, 1000);
    var blobs = chamadoImagens_(payload.imagens, protocolo);

    // Prints na pasta restrita do sistema (fora do lock: o Drive pode demorar).
    var links = [];
    var anexosInfo = [];
    if (blobs.length) {
      try {
        var pasta = chamadoPastaAnexos_();
        blobs.forEach(function (blob) {
          var arquivo = pasta.createFile(blob);
          links.push(arquivo.getUrl());
          anexosInfo.push({ nome: arquivo.getName(), url: arquivo.getUrl(), bytes: blob.getBytes().length });
        });
      } catch (erroDrive) {
        anexosInfo.push({ erro: 'Não foi possível salvar no Drive: ' + String(erroDrive && erroDrive.message ? erroDrive.message : erroDrive) });
      }
    }

    var destinos = chamadosDestinatarios_();
    var registro = {
      chamado_id: protocolo,
      created_at: nowISO_(),
      usuario_id: user.usuario_id || '',
      usuario: user.usuario || '',
      nome: user.nome || '',
      perfil: user.perfil || '',
      categorias: categorias.join(' | '),
      urgencia: chamadoTextoCurto_(payload.urgencia, 80),
      frequencia: chamadoTextoCurto_(payload.frequencia, 80),
      descricao: descricao,
      atendimento_id: ctx.atendimento_id,
      tela: ctx.tela,
      build: CLAV_BUILD_.numero + ' (' + CLAV_BUILD_.data + ') · ' + CLAV.VERSION,
      contexto_json: truncateCellText_(toJson_(ctx)),
      anexos_json: truncateCellText_(toJson_(anexosInfo)),
      email_status: 'PENDENTE',
      email_destino: destinos.join(', '),
      status: 'ABERTO',
      request_id: requestId,
      user_agent: userAgent,
      resolvido_em: '',
      resolucao: ''
    };

    var lock = acquireWriteLock_('abrir chamado', 20000);
    try {
      garantirAbaChamados_();
      var duplicado = findRowBy_('CHAMADOS', 'request_id', requestId);
      if (duplicado) {
        return ok_({ protocolo: duplicado.obj.chamado_id, repetido: true, email_enviado: String(duplicado.obj.email_status || '').indexOf('ENVIADO') === 0, destino: String(duplicado.obj.email_destino || ''), anexos: 0 });
      }
      var hoje = Utilities.formatDate(new Date(), CLAV.TZ, 'yyyy-MM-dd');
      var doDia = all_('CHAMADOS').filter(function (c) {
        return String(c.usuario_id || '') === String(registro.usuario_id) && String(c.created_at || '').slice(0, 10) === hoje;
      }).length;
      if (doDia >= CLAV_CHAMADOS_LIMITES_.por_dia) {
        throw appError_('CHAMADO_LIMITE', 'Limite diário de chamados atingido para este login. Fale diretamente com o suporte.');
      }
      if (!getConfigValue_('CHAMADOS_EMAILS', '')) {
        try { upsertConfigValue_('CHAMADOS_EMAILS', CLAV_CHAMADOS_EMAIL_PADRAO_, 'E-mails que recebem os chamados de suporte (separados por vírgula).'); } catch (ignoredCfg) {}
      }
      insert_('CHAMADOS', registro);
      SpreadsheetApp.flush();
    } finally {
      releaseLock_(lock);
    }
    cache.put(chaveIntervalo, '1', CLAV_CHAMADOS_LIMITES_.intervalo_segundos);

    // E-mail fora do lock, para nunca segurar um salvamento clínico.
    var emailStatus = '';
    try {
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error('cota diária de e-mail esgotada');
      var assunto = '[CLAV Chamado] ' + (registro.urgencia ? registro.urgencia + ' — ' : '') + (categorias[0] || 'Relato livre') + ' — ' + registro.nome;
      var opcoes = {
        to: destinos.join(','),
        subject: assunto.slice(0, 240),
        name: CLAV.SHORT_NAME,
        body: chamadoEmailTexto_(registro, user, ctx, links),
        htmlBody: chamadoEmailHtml_(registro, user, ctx, links)
      };
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(user.email || ''))) opcoes.replyTo = String(user.email);
      if (blobs.length) opcoes.attachments = blobs;
      MailApp.sendEmail(opcoes);
      emailStatus = 'ENVIADO ' + nowISO_();
    } catch (erroEmail) {
      emailStatus = 'FALHOU: ' + String(erroEmail && erroEmail.message ? erroEmail.message : erroEmail).slice(0, 300);
    }

    var lock2 = null;
    try {
      lock2 = acquireWriteLock_('registrar envio do chamado', 10000);
      var gravado = findRowBy_('CHAMADOS', 'chamado_id', protocolo);
      if (gravado) {
        gravado.obj.email_status = emailStatus;
        writeObjectAtRow_('CHAMADOS', gravado.row, gravado.obj);
        SpreadsheetApp.flush();
      }
    } catch (ignoredStatus) {
    } finally {
      releaseLock_(lock2);
    }

    logAudit_(user, 'CHAMADO_ABERTO', 'CHAMADOS', protocolo, null, { categorias: registro.categorias, urgencia: registro.urgencia, anexos: blobs.length, email: emailStatus.slice(0, 40) }, 'OK', userAgent, '');

    var enviado = emailStatus.indexOf('ENVIADO') === 0;
    return ok_({
      protocolo: protocolo,
      repetido: false,
      email_enviado: enviado,
      destino: destinos.join(', '),
      anexos: blobs.length,
      mensagem: enviado
        ? 'Chamado registrado e enviado ao suporte.'
        : 'Chamado registrado na planilha. O e-mail não pôde ser enviado agora; o suporte verá o registro na aba CHAMADOS.'
    });
  }, { origem: 'abrirChamado' });
}
