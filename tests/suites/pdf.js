/*
 * tests/suites/pdf.js
 *
 * PURPOSE
 *   Checks of the PDF output (js/output/pdf.js, pdf-manual.js):
 *     - every card pair carries the "-xxxxx" tag (last 5 characters of its
 *       address) at the end of BOTH titles, so cut cards can be matched;
 *     - the instruction pages follow the paper: A5 portrait for A5 layouts
 *       (split over as many pages as needed), A4 portrait otherwise.
 *   Browser only (needs jsPDF and the UI text modules).
 */
(function (WG) {
  'use strict';

  var reg = WG.selftest.register;
  var ALL = WG.coins.list().map(function (c) { return c.id; });

  /** A throw-away wallet set from a private pool. */
  async function wallet(coins) {
    var p = WG.entropy.createPool();
    for (var i = 0; i < 256; i++) p.addCoin(i % 2 === 0);
    return WG.generator.generate({ mode: 'bip39', coins: coins, words: 24, pool: p, minCreditedBits: 256 });
  }

  /** [{w, h}] in mm for every page of a jsPDF document. */
  function pageSizes(doc) {
    var out = [];
    for (var i = 1; i <= doc.getNumberOfPages(); i++) {
      doc.setPage(i);
      out.push({ w: Math.round(doc.internal.pageSize.getWidth()), h: Math.round(doc.internal.pageSize.getHeight()) });
    }
    return out;
  }

  reg({
    id: 'pdf.card-tags', group: 'PDF', title: 'Both sides of every card end with "-" + the last 5 characters of its address',
    run: async function (t) {
      var set = await wallet(['btc', 'eth', 'xmr']);
      var cards = WG.pdf.cardsFor(set, WG.pdf.defaults());
      t.equal(cards.length, 4, 'seed card + 3 coin cards');
      var expected = [set.results[0].address.slice(-5)].concat(set.results.map(function (r) { return r.address.slice(-5); }));
      cards.forEach(function (c, i) {
        t.equal(c.tag, expected[i], 'tag of card ' + (i + 1));
        t.ok(c.front.title.slice(-7) === ' -' + c.tag, 'front title ends with tag: ' + c.front.title);
        t.ok(c.back.title.slice(-7) === ' -' + c.tag, 'back title ends with tag: ' + c.back.title);
      });
    },
  });

  reg({
    id: 'pdf.manual-a5', group: 'PDF', title: 'A5 layout: cards on A5 landscape, manual on A5 portrait split over several pages',
    run: async function (t) {
      var set = await wallet(ALL);
      var L = Object.assign(WG.pdf.defaults(), { pageSize: 'a5', manual: true });
      var sizes = pageSizes(WG.pdf.build(set, L));
      var cardPages = sizes.filter(function (s) { return s.w === 210 && s.h === 148; }).length;
      var manualPages = sizes.filter(function (s) { return s.w === 148 && s.h === 210; }).length;
      t.equal(cardPages + manualPages, sizes.length, 'only A5 pages: ' + JSON.stringify(sizes));
      t.ok(cardPages >= 1, 'card pages');
      t.ok(manualPages >= 2, 'manual split over at least 2 A5 pages (got ' + manualPages + ')');
    },
  });

  reg({
    id: 'pdf.manual-a4', group: 'PDF', title: 'A4 layout: manual stays on A4 portrait',
    run: async function (t) {
      var set = await wallet(['btc']);
      var sizes = pageSizes(WG.pdf.build(set, Object.assign(WG.pdf.defaults(), { manual: true })));
      var last = sizes[sizes.length - 1];
      t.ok(last.w === 210 && last.h === 297, 'manual page is A4: ' + JSON.stringify(last));
    },
  });
})(window.WG);
