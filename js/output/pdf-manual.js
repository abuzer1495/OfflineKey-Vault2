/*
 * js/output/pdf-manual.js   ->   WG.pdfManual
 *
 * PURPOSE
 *   Appends A4 instruction page(s) to the wallet PDF in the current UI
 *   language: what each card is, how to store it, how to restore it (which
 *   wallet apps, which derivation path) and safety rules. No secrets are
 *   printed here.
 */
(function (WG) {
  'use strict';

  var t = WG.i18n.t;

  /**
   * @param {jsPDF} doc
   * @param {object} set    wallet set
   * @param {object} L      layout options (text colour is not used here: always black on white)
   * @param {object} h      helpers from pdf.js: font(doc, bold, size), lh(size), wrapText(text, cols), colsFor(w, size)
   */
  function addTo(doc, set, L, h) {
    var W = 210, H = 297, M = 15, size = 8.5;
    var cols = h.colsFor(W - 2 * M, size);
    var y = 0;

    function page() { doc.addPage([W, H], 'p'); y = M; }

    /** Print a paragraph, starting a new page when the current one is full. */
    function para(text, bold, big) {
      var s = big ? 12 : size;
      h.font(doc, bold, s);
      doc.setTextColor(0, 0, 0);
      h.wrapText(text, big ? h.colsFor(W - 2 * M, s) : cols).forEach(function (line) {
        if (y + h.lh(s) > H - M) page();
        doc.text(line, M, y, { baseline: 'top' });
        y += h.lh(s);
      });
      y += h.lh(s) * 0.6;
    }

    page();
    para(t('manTitle'), true, true);
    para(t('manCreated', { date: set.createdAt.slice(0, 10), version: WG.version }));
    para(t('manIntro'));
    para(t('manCardsTitle'), true);
    if (set.mnemonic) para(t('manSeedCard'));
    if (set.shares) para(t('manShareCard', { m: set.slip39.threshold, n: set.shares.length }));
    para(t(set.mode === 'single' ? 'manSingleCard' : 'manCoinCard'));
    if (set.hasPassphrase) para(t('manPassphrase'), true);

    para(t('manRestoreTitle'), true);
    set.results.forEach(function (r) {
      var coin = WG.coins.get(r.coin);
      var how = r.coin === 'xmr' ? t('ownSeed') : (r.path || t('singleKey'));
      para(r.symbol + ' (' + r.name + ') — ' + WG.resultUi.variantLabel(r) + ' — ' + how + '\n  ' + t('compatWallets') + ' ' + coin.wallets);
      r.notes.forEach(function (n) { para('  ! ' + t(n)); });
    });

    para(t('manSafetyTitle'), true);
    ['manSafety1', 'manSafety2', 'manSafety3', 'manSafety4', 'manSafety5'].forEach(function (k) { para('• ' + t(k)); });
  }

  WG.define('pdfManual', { addTo: addTo });
})(window.WG);
