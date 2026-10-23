/*
 * js/output/pdf.js   ->   WG.pdf
 *
 * PURPOSE
 *   Builds a print-and-cut PDF of a wallet set with jsPDF (vendor/jspdf.umd.js).
 *   Every "card" has a FRONT (secret side) and a BACK (public side), like the
 *   original project. Layout options (all millimetres) come from the PDF panel:
 *
 *     pageSize      'a4' | 'a5' | 'fit'  (fit = page exactly one card pair)
 *     orientation   'p' | 'l'            (A4 only; A5 is always landscape)
 *     separate      false: front and back side by side on the same page
 *                   true:  fronts on one page, backs on the next, mirrored
 *                          horizontally for long-edge duplex printing
 *     marginTop, marginLeft, cardWidth, cardHeight, gap
 *     guideInner, guideOuter, guideColor   corner cut marks (inside / outside)
 *     textColor, textBg, textBgOpacity, textShadow
 *     useBackground, bgFront, bgBack        JPEG data URLs (already re-encoded)
 *     secretQr      print QR codes of secrets (mnemonic / private keys)
 *     coinSecrets   HD wallets: also print each coin's private key
 *     manual        append instruction page(s): A5 when A5 is chosen, else A4 (language = UI language)
 *
 * TEXT
 *   DejaVu Sans Mono (vendor/dejavu-fonts.js) is embedded, so Turkish and
 *   accented BIP39 words print correctly. Scripts the font lacks (Japanese,
 *   Chinese, Korean) are rendered through a canvas with system fonts and
 *   embedded as an image. Text blocks shrink until they fit their box.
 *
 * SECURITY NOTES
 *   The PDF contains secrets. It is created in memory and handed to the
 *   browser's download; nothing is sent anywhere. The UI warns the user to
 *   print it offline and delete the file.
 */
(function (WG) {
  'use strict';

  var t = WG.i18n.t;
  var PT = 0.3528;          // millimetres per typographic point
  var PAD = 2.2;            // inner card padding (mm)
  var FONT = 'DejaVuMono';

  /** "#rrggbb" -> [r, g, b]. */
  function rgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#000000');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }

  /** True if the text needs glyphs DejaVu Sans Mono does not have (CJK, Kana, Hangul). */
  function needsCanvas(text) {
    return /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(text);
  }

  // ---- Document setup -----------------------------------------------------

  /** Page size in mm for the chosen layout. */
  function pageSize(L) {
    if (L.pageSize === 'fit') {
      return L.separate
        ? { w: L.marginLeft * 2 + L.cardWidth, h: L.marginTop * 2 + L.cardHeight }
        : { w: L.marginLeft * 2 + L.cardWidth * 2 + L.gap, h: L.marginTop * 2 + L.cardHeight };
    }
    if (L.pageSize === 'a5') return { w: 210, h: 148 };
    return L.orientation === 'l' ? { w: 297, h: 210 } : { w: 210, h: 297 };
  }

  /** New jsPDF document with the embedded Unicode font. */
  function newDoc(size) {
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('vendor/jspdf.umd.js not loaded');
    var doc = new jsPDF({ unit: 'mm', format: [size.w, size.h], orientation: size.w > size.h ? 'l' : 'p', compress: true });
    doc.addFileToVFS('DejaVuSansMono.ttf', window.WGFonts.mono);
    doc.addFont('DejaVuSansMono.ttf', FONT, 'normal');
    doc.addFileToVFS('DejaVuSansMono-Bold.ttf', window.WGFonts.monoBold);
    doc.addFont('DejaVuSansMono-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
    doc.setProperties({ title: 'Paper wallet', subject: 'Offline paper wallet', creator: 'OfflineKey Vault ' + WG.version });
    return doc;
  }

  /** Select font weight and size. */
  function font(doc, bold, size) {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  }

  /** Line height in mm for a font size in pt. */
  function lh(size) { return size * PT * 1.18; }

  // ---- Text layout (monospace => simple, exact char counting) ---------------

  /** Greedy word wrap to at most `cols` characters; over-long tokens are hard-split. */
  function wrapText(text, cols) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var line = '';
      para.split(/ +/).forEach(function (word) {
        while (word.length > cols) {
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, cols));
          word = word.slice(cols);
        }
        if (!line) line = word;
        else if (line.length + 1 + word.length <= cols) line += ' ' + word;
        else { out.push(line); line = word; }
      });
      out.push(line);
    });
    return out;
  }

  /** Characters per line for a width at a font size (monospace advance = 0.6 em). */
  function colsFor(width, size) { return Math.max(1, Math.floor(width / (size * PT * 0.6))); }

  /**
   * Largest font size (maxPt..minPt) at which labelled blocks fit in w x h.
   * @param {Array<{label?:string, value:string}>} blocks
   * @returns {{size:number, rows:Array<{text:string, bold:boolean}>}|null}
   */
  function fitBlocks(blocks, w, h, maxPt, minPt) {
    for (var size = maxPt; size >= minPt; size -= 0.25) {
      var cols = colsFor(w, size);
      var rows = [];
      blocks.forEach(function (b, i) {
        if (b.label) wrapText(b.label, cols).forEach(function (l) { rows.push({ text: l, bold: true }); });
        wrapText(b.value, cols).forEach(function (l) { rows.push({ text: l, bold: false }); });
        if (i < blocks.length - 1) rows.push({ text: '', bold: false, gap: true });
      });
      var height = rows.reduce(function (a, r) { return a + (r.gap ? lh(size) * 0.35 : lh(size)); }, 0);
      if (height <= h) return { size: size, rows: rows, height: height };
    }
    return null;
  }

  /**
   * Largest layout of a numbered word grid in w x h: tries 1..4 columns.
   * @returns {{size, cols, rowsPerCol, cellW}|null}
   */
  function fitWords(words, w, h, maxPt, minPt) {
    var best = null;
    for (var cols = 1; cols <= 4; cols++) {
      var perCol = Math.ceil(words.length / cols);
      var longest = words.reduce(function (a, x, i) { return Math.max(a, (String(i + 1) + '. ' + x).length); }, 0);
      for (var size = maxPt; size >= minPt; size -= 0.25) {
        var cellW = w / cols;
        if (longest * size * PT * 0.6 <= cellW - 0.8 && perCol * lh(size) <= h) {
          if (!best || size > best.size) best = { size: size, cols: cols, perCol: perCol, cellW: cellW };
          break;
        }
      }
    }
    return best;
  }

  // ---- Drawing primitives -----------------------------------------------

  /** Run fn with a temporary fill opacity. */
  function withOpacity(doc, opacity, fn) {
    var GState = doc.GState || (window.jspdf && window.jspdf.GState);
    if (GState && opacity < 1) doc.setGState(new GState({ opacity: opacity, 'stroke-opacity': opacity }));
    fn();
    if (GState && opacity < 1) doc.setGState(new GState({ opacity: 1, 'stroke-opacity': 1 }));
  }

  /** Semi-transparent background behind a text area (the original "text fill"). */
  function textBackground(doc, L, x, y, w, h) {
    if (!(L.textBgOpacity > 0)) return;
    withOpacity(doc, L.textBgOpacity, function () {
      var c = rgb(L.textBg);
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(x - 0.6, y - 0.6, w + 1.2, h + 1.2, 'F');
    });
  }

  /** Text line with optional contrasting shadow (baseline at the top of the line box). */
  function textLine(doc, L, str, x, y) {
    var c = rgb(L.textColor);
    if (L.textShadow) {
      doc.setTextColor(255 - c[0], 255 - c[1], 255 - c[2]);
      doc.text(str, x + 0.15, y + 0.15, { baseline: 'top' });
    }
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(str, x, y, { baseline: 'top' });
  }

  /** Render text through a canvas (system fonts) and place it as an image. */
  function canvasText(doc, lines, x, y, w, h, color) {
    var scale = 12;                                   // px per mm (~300 dpi)
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext('2d');
    var px = Math.min(canvas.height / lines.length * 0.82, 64);
    ctx.font = px + 'px sans-serif';
    while (px > 6 && lines.some(function (l) { return ctx.measureText(l).width > canvas.width; })) {
      px -= 1;
      ctx.font = px + 'px sans-serif';
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    lines.forEach(function (l, i) { ctx.fillText(l, 0, i * (canvas.height / lines.length)); });
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
  }

  /** QR code as vector squares on an opaque white background. */
  function qr(doc, text, x, y, size) {
    var m = WG.qr.matrix(text);
    var quiet = 2;
    var cell = size / (m.size + quiet * 2);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, size, size, 'F');
    doc.setFillColor(0, 0, 0);
    for (var r = 0; r < m.size; r++) {
      for (var c = 0; c < m.size; c++) {
        if (m.dark(r, c)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.01, cell + 0.01, 'F');
      }
    }
  }

  /** Corner cut marks: each corner gets an inner and an outer line on both axes. */
  function cutMarks(doc, L, x, y, w, h) {
    var c = rgb(L.guideColor);
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(0.12);
    var i = L.guideInner, o = L.guideOuter;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (k) {
      var cx = k[0], cy = k[1], sx = k[2], sy = k[3];
      doc.line(cx - sx * o, cy, cx + sx * i, cy);     // horizontal
      doc.line(cx, cy - sy * o, cx, cy + sy * i);     // vertical
    });
  }

  /** Card background: image (with bleed into the outer guide area) or a light outline. */
  function cardBackground(doc, L, side, x, y, w, h) {
    var img = side === 'front' ? L.bgFront : (L.bgBack || L.bgFront);
    if (L.useBackground && img) {
      var b = L.guideOuter;
      doc.addImage(img, 'JPEG', x - b, y - b, w + 2 * b, h + 2 * b, undefined, 'FAST');
    } else {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.rect(x, y, w, h, 'S');
    }
  }

  // ---- Card sides -----------------------------------------------------------

  /**
   * Draw one card side from a generic spec:
   *   { title, footer, words?: string[], blocks?: [{label, value}], qr?: string }
   */
  function drawSide(doc, L, spec, side, x, y, w, h) {
    cardBackground(doc, L, side, x, y, w, h);
    var innerX = x + PAD, innerW = w - 2 * PAD;
    // Title
    // Shrink the title until it fits in two lines, so the "-xxxxx" tag at its end is never cut.
    var titleSize = Math.min(8, Math.max(4.5, h / 8));
    while (titleSize > 3.5 && wrapText(spec.title, colsFor(innerW, titleSize)).length > 2) titleSize -= 0.25;
    font(doc, true, titleSize);
    var titleRows = wrapText(spec.title, colsFor(innerW, titleSize)).slice(0, 2);
    textBackground(doc, L, innerX, y + PAD, innerW, titleRows.length * lh(titleSize));
    titleRows.forEach(function (r, i) { textLine(doc, L, r, innerX, y + PAD + i * lh(titleSize)); });
    // Footer
    var footSize = Math.max(3.5, Math.min(5, h / 12));
    var footY = y + h - PAD - lh(footSize);
    font(doc, false, footSize);
    var foot = wrapText(spec.footer || '', colsFor(innerW, footSize))[0] || '';
    textBackground(doc, L, innerX, footY, innerW, lh(footSize));
    textLine(doc, L, foot, innerX, footY);
    // Body area
    var bodyY = y + PAD + titleRows.length * lh(titleSize) + 1.2;
    var bodyH = footY - 1.2 - bodyY;
    var textW = innerW;
    if (spec.qr) {
      var qs = Math.min(bodyH, innerW * 0.45);
      qr(doc, spec.qr, x + w - PAD - qs, bodyY + (bodyH - qs) / 2, qs);
      textW = innerW - qs - 1.5;
    }
    if (spec.words) drawWords(doc, L, spec.words, innerX, bodyY, textW, bodyH);
    if (spec.blocks) drawBlocks(doc, L, spec.blocks, innerX, bodyY, textW, bodyH);
  }

  /** Labelled text blocks, shrunk to fit; falls back to shortened values. */
  function drawBlocks(doc, L, blocks, x, y, w, h) {
    var fit = fitBlocks(blocks, w, h, 7, 3);
    if (!fit) {
      // Too much text for this card size: shorten long values in the middle.
      blocks = blocks.map(function (b) { return { label: b.label, value: b.value.length > 26 ? b.value.slice(0, 12) + '…' + b.value.slice(-10) : b.value }; });
      fit = fitBlocks(blocks, w, h, 7, 2.5);
    }
    if (!fit) return;
    textBackground(doc, L, x, y, w, fit.height);
    var cy = y;
    fit.rows.forEach(function (r) {
      if (r.gap) { cy += lh(fit.size) * 0.35; return; }
      if (needsCanvas(r.text)) canvasText(doc, [r.text], x, cy, w, lh(fit.size), L.textColor);
      else { font(doc, r.bold, fit.size); textLine(doc, L, r.text, x, cy); }
      cy += lh(fit.size);
    });
  }

  /** Numbered word grid, column-major ("1..8" down the first column). */
  function drawWords(doc, L, words, x, y, w, h) {
    var labels = words.map(function (wd, i) { return (i + 1 < 10 && words.length >= 10 ? ' ' : '') + (i + 1) + '.' + wd; });
    if (labels.some(needsCanvas)) {
      // CJK / Kana / Hangul: draw the grid with system fonts via canvas.
      var cols = words.length > 12 ? 3 : 2;
      var per = Math.ceil(words.length / cols);
      textBackground(doc, L, x, y, w, h);
      for (var c = 0; c < cols; c++) {
        canvasText(doc, labels.slice(c * per, (c + 1) * per), x + c * (w / cols), y, w / cols - 0.5, h, L.textColor);
      }
      return;
    }
    var fit = fitWords(labels, w, h, 8, 3);
    if (!fit) return;
    textBackground(doc, L, x, y, w, fit.perCol * lh(fit.size));
    font(doc, false, fit.size);
    labels.forEach(function (label, i) {
      var col = Math.floor(i / fit.perCol), row = i % fit.perCol;
      textLine(doc, L, label, x + col * fit.cellW, y + row * lh(fit.size));
    });
  }

  // ---- What goes on each card ----------------------------------------------------

  /**
   * Build the list of card pairs [{front, back}] for a wallet set.
   * Each pair carries `tag`: the last 5 characters of its address (seed and
   * share cards use the first coin's address). It is appended as "-xxxxx" to
   * the title of BOTH sides, so cut cards can be matched front-to-back. It is
   * kept out of the address text itself so nobody copies it as part of the
   * address.
   */
  function cardsFor(set, L) {
    var date = set.createdAt.slice(0, 10);
    var cards = [];
    var walletTag = set.results.length ? set.results[0].address.slice(-5) : '';
    var secretFoot = t('pdfSecret') + ' · ' + date;
    var publicFoot = t('pdfPublic') + ' · ' + date;

    if (set.mnemonic) {
      var words = WG.bip39.words(set.mnemonic);
      cards.push({
        tag: walletTag,
        front: { title: t('pdfSeedTitle', { n: words.length, lang: set.language }), words: words, qr: L.secretQr ? set.mnemonic : null,
          footer: secretFoot + (set.hasPassphrase ? ' · ' + t('pdfPassYes') : '') },
        back: { title: t('pdfSummaryTitle'), footer: publicFoot,
          blocks: set.results.filter(function (r) { return r.coin !== 'xmr'; }).map(function (r) { return { label: r.symbol + ' ' + (r.path || ''), value: r.address }; }) },
      });
    }
    if (set.shares) {
      set.shares.forEach(function (sh, i) {
        cards.push({
          tag: walletTag,
          front: { title: t('pdfShareTitle', { i: i + 1, n: set.shares.length, m: set.slip39.threshold }), words: sh.split(' '), qr: L.secretQr ? sh : null,
            footer: secretFoot + (set.hasPassphrase ? ' · ' + t('pdfPassYes') : '') },
          back: { title: t('pdfShareBackTitle'), footer: publicFoot,
            blocks: [{ label: '', value: t('pdfShareBackText', { m: set.slip39.threshold, n: set.shares.length }) }] },
        });
      });
    }
    set.results.forEach(function (r) {
      var head = r.name + ' · ' + WG.resultUi.variantLabel(r) + (r.path ? ' · ' + r.path : '');
      var address = { label: t('lblAddress'), value: r.address };
      var watch = r.watch.map(function (wi) { return { label: t(wi.labelKey), value: wi.value }; });
      if (r.coin === 'xmr') {
        cards.push({
          tag: r.address.slice(-5),
          front: { title: 'Monero · ' + t('pdfMoneroSeed'), words: r.mnemonic.split(' '), qr: L.secretQr ? r.mnemonic : null, footer: secretFoot },
          back: { title: 'Monero · ' + t('pdfPublicSide'), blocks: [address].concat(watch, [{ label: t('pdfRestoreDate'), value: date }]), qr: r.address, footer: publicFoot },
        });
        return;
      }
      var printSecrets = (set.mode === 'single' || L.coinSecrets) && r.secrets.length;
      if (printSecrets) {
        var sec = r.secrets[0];
        cards.push({
          tag: r.address.slice(-5),
          front: { title: head, blocks: [{ label: t(sec.labelKey), value: sec.value }].concat(r.bip38 ? [{ label: '', value: t('pdfBip38Note') }] : []),
            qr: L.secretQr && sec.qr ? sec.value : null, footer: secretFoot },
          back: { title: r.name + ' · ' + t('pdfPublicSide'), blocks: [address].concat(watch), qr: r.address, footer: publicFoot },
        });
      } else {
        cards.push({
          tag: r.address.slice(-5),
          front: { title: head, blocks: [address], qr: r.address, footer: publicFoot },
          back: { title: r.name + ' · ' + t('pdfWatchSide'), footer: publicFoot,
            blocks: watch.length ? watch : [{ label: '', value: t(set.mode === 'slip39' ? 'backupIsShares' : 'backupIsMnemonic') }],
            qr: watch.length ? r.watch[0].value : null },
        });
      }
    });
    cards.forEach(function (c) {
      if (!c.tag) return;
      c.front.title += ' -' + c.tag;
      c.back.title += ' -' + c.tag;
    });
    return cards;
  }

  // ---- Page placement -------------------------------------------------------

  /** Validate that at least one card (pair) fits the page; returns an error message or null. */
  function checkFit(L) {
    var p = pageSize(L);
    var needW = L.separate ? L.marginLeft * 2 + L.cardWidth : L.marginLeft * 2 + L.cardWidth * 2 + L.gap;
    var needH = L.marginTop * 2 + L.cardHeight;
    if (needW > p.w + 0.01 || needH > p.h + 0.01) return t('pdfNoFit');
    if (L.cardWidth < 40 || L.cardHeight < 25) return t('pdfTooSmall');
    return null;
  }

  /**
   * Build the PDF.
   * @param {object} set  wallet set
   * @param {object} L    layout options (see header)
   * @returns {jsPDF} document (caller saves it)
   */
  function build(set, L) {
    var err = checkFit(L);
    if (err) throw new Error(err);
    var size = pageSize(L);
    var doc = newDoc(size);
    var cards = cardsFor(set, L);
    placements(L, cards.length).forEach(function (page, i) {
      if (i > 0) doc.addPage([size.w, size.h], size.w > size.h ? 'l' : 'p');
      page.forEach(function (p) {
        drawSide(doc, L, cards[p.card][p.side], p.side, p.x, p.y, L.cardWidth, L.cardHeight);
        cutMarks(doc, L, p.x, p.y, L.cardWidth, L.cardHeight);
      });
    });
    if (L.manual) WG.pdfManual.addTo(doc, set, L, { font: font, lh: lh, wrapText: wrapText, colsFor: colsFor });
    return doc;
  }

  /**
   * Where every card side goes. Shared by build() and the on-screen preview
   * (js/ui/pdf-preview.js), so both always show the same layout.
   * @param {object} L  layout options
   * @param {number} n  number of cards (front + back pairs)
   * @returns {Array<Array<{card:number, side:'front'|'back', x:number, y:number}>>} one array per page
   */
  function placements(L, n) {
    var size = pageSize(L);
    var stepY = L.cardHeight + L.gap;
    var rows = Math.max(1, Math.floor((size.h - 2 * L.marginTop + L.gap) / stepY));
    var pages = [];
    var i;
    if (!L.separate) {
      // Front | gap | back on each row.
      for (i = 0; i < n; i++) {
        if (i % rows === 0) pages.push([]);
        var y = L.marginTop + (i % rows) * stepY;
        pages[pages.length - 1].push({ card: i, side: 'front', x: L.marginLeft, y: y },
          { card: i, side: 'back', x: L.marginLeft + L.cardWidth + L.gap, y: y });
      }
      return pages;
    }
    // Grid of fronts, then the same grid of backs mirrored for long-edge duplex.
    var stepX = L.cardWidth + L.gap;
    var cols = Math.max(1, Math.floor((size.w - 2 * L.marginLeft + L.gap) / stepX));
    var perPage = cols * rows;
    for (var start = 0; start < n; start += perPage) {
      ['front', 'back'].forEach(function (side) {
        var page = [];
        for (var k = 0; k < Math.min(perPage, n - start); k++) {
          var x = L.marginLeft + (k % cols) * stepX;
          if (side === 'back') x = size.w - x - L.cardWidth;
          page.push({ card: start + k, side: side, x: x, y: L.marginTop + Math.floor(k / cols) * stepY });
        }
        pages.push(page);
      });
    }
    return pages;
  }

  WG.define('pdf', {
    build: build,
    checkFit: checkFit,
    pageSize: pageSize,
    placements: placements,
    cardsFor: cardsFor,
    /** Layout defaults: the original project's values (credit-card size, green guides). */
    defaults: function () {
      return {
        pageSize: 'a4', orientation: 'p', separate: false,
        marginTop: 10, marginLeft: 10, cardWidth: 85.6, cardHeight: 53.98, gap: 10,
        guideInner: 10, guideOuter: 5, guideColor: '#22ff00',
        textColor: '#000000', textBg: '#ffffff', textBgOpacity: 0.8, textShadow: false,
        useBackground: true, bgFront: null, bgBack: null,
        secretQr: true, coinSecrets: false, manual: true,
      };
    },
  });
})(window.WG);
