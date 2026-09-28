/**
 * CLAV | Sistema Perioperatório — Código dividido em módulos (07/09/2026)
 *
 * MÓDULO: 01_WebApp.gs
 * Ponto de entrada do Web App e roteamento de páginas
 *
 * Conteúdo: doGet com roteamento (?page=intra), include_ para composição de
 * arquivos HTML e helpers de URL das páginas.
 *
 * ROTAS
 *   (sem parâmetro)      -> Index      : sistema principal completo
 *   ?page=intra          -> Intra      : ficha anestésica intraoperatória autônoma
 *   ?page=intra&caso=ID  -> Intra      : abre já vinculado a um atendimento
 *   ?page=intra&slot=2   -> Intra      : segunda aba para consulta/passagem de plantão (anestesias simultâneas são vedadas pelo CFM)
 *
 * A rota autônoma existe porque, em sala cirúrgica, o tablet precisa abrir a
 * ficha diretamente, sem carregar todo o sistema principal, e precisa poder
 * ficar aberta em paralelo à tela do sistema no computador da sala.
 *
 * Observação: no Google Apps Script todos os arquivos .gs compartilham o mesmo
 * escopo global. A divisão é apenas organizacional: nenhuma função foi renomeada,
 * removida ou alterada em relação ao Código.gs monolítico original.
 */

function doGet(e) {
  // Saída estática e direta, conforme o fluxo nativo do HtmlService.
  // O JavaScript clínico extenso permanece no Index como fonte inerte e é
  // ativado pelo carregador seguro após a fase document.write do HtmlService.
  // Isso evita a falha de análise observada dentro do Google Sites, sem mover,
  // resumir ou remover qualquer regra técnica do sistema.
  var params = (e && e.parameter) ? e.parameter : {};
  var page = String(params.page || '').toLowerCase();

  if (page === 'intra' || page === 'intraop' || page === 'intraoperatorio') {
    // A ficha intraoperatória é montada por template porque a biblioteca de
    // fármacos vive em arquivo próprio (IntraFarmacos). Só o Intra usa template;
    // o Index permanece estático, exatamente como antes.
    var tpl = HtmlService.createTemplateFromFile('Intra');
    // v19.9: parâmetros filtrados ANTES de irem para o HTML. Um "caso" com
    // "</script>" executaria código na ficha (XSS refletido) com acesso à sessão.
    var casoParam = String(params.caso || params.atendimento || '').trim();
    var slotParam = String(params.slot || '1').trim();
    var modoParam = String(params.modo || 'completo').trim().toLowerCase();
    tpl.bootParams = {
      caso: /^[A-Za-z0-9._:-]{1,80}$/.test(casoParam) ? casoParam : '',
      slot: /^[0-9v]{1,2}$/.test(slotParam) ? slotParam : '1',
      modo: /^[a-z]{1,20}$/.test(modoParam) ? modoParam : 'completo',
      // v19.6: a ficha precisa da URL pública do serviço para abrir o sistema
      // principal e novas abas. Dentro do Apps Script, window.location aponta
      // para o iframe userCodeAppPanel (página em branco), nunca para /exec.
      webAppUrl: getWebAppUrl_(),
      // v19.9: logotipo da folha impressa da ficha (mesmo arquivo dos PDFs).
      logoUrl: CLAV.LOGO_URL,
      versao: CLAV.VERSION
    };
    return tpl.evaluate()
      .setTitle('CLAV | Ficha Anestésica Intraoperatória')
      .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/logo/script-32.png')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CLAV.APP_NAME)
    .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/logo/script-32.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inclui o conteúdo bruto de outro arquivo HTML do projeto.
 * Usado dentro de Intra.html para carregar a biblioteca de fármacos sem
 * transformar o arquivo em um monólito de 4.000 linhas.
 */
function include_(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/** Alias sem underscore: templates do HtmlService não enxergam funções privadas. */
function include(nome) {
  return include_(nome);
}

/**
 * URL da ficha intraoperatória autônoma, entregue ao frontend para abrir em
 * outra aba. Nunca lança erro: se a URL do serviço não estiver disponível,
 * devolve string vazia e a tela cai de volta no módulo embutido.
 */
function urlIntraoperatorio_(atendimentoId, slot) {
  var base = getWebAppUrl_();
  if (!base) return '';
  var url = base + '?page=intra';
  if (atendimentoId) url += '&caso=' + encodeURIComponent(String(atendimentoId));
  if (slot) url += '&slot=' + encodeURIComponent(String(slot));
  return url;
}
