/*
 * js/output/pdf-manual.js   ->   WG.pdfManual
 *
 * PURPOSE
 *   Appends instruction page(s) (A5 for A5 layouts, otherwise A4) to the wallet PDF in the current UI
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
    // The manual uses the cards' paper: A5 portrait when A5 is chosen,
    // otherwise A4 portrait ("fit" pages are card-sized, too small for text).
    var a5 = L.pageSize === 'a5';
    var W = a5 ? 148 : 210, H = a5 ? 210 : 297, M = a5 ? 10 : 15, size = a5 ? 7.5 : 8.5;
    var cols = h.colsFor(W - 2 * M, size);
    var y = 0;

    function page() { doc.addPage([W, H], 'p'); y = M; }

    /**
     * Print a paragraph; text flows onto as many pages as needed. Breaks are
     * placed sensibly: a heading never stays alone at the bottom of a page
     * (it needs room for 3 more lines), and a paragraph never leaves a single
     * line behind (it moves to the next page if fewer than 2 lines fit).
     */
    function para(text, bold, big) {
      var s = big ? 12 : size;
      var lines = h.wrapText(text, big ? h.colsFor(W - 2 * M, s) : cols);
      var room = Math.floor((H - M - y) / h.lh(s));
      var needed = bold ? lines.length + 3 : Math.min(lines.length, 2);
      if (room < needed) page();
      h.font(doc, bold, s);
      doc.setTextColor(0, 0, 0);
      lines.forEach(function (line) {
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
