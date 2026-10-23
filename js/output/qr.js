/*
 * js/output/qr.js   ->   WG.qr
 *
 * PURPOSE
 *   QR codes for the screen (canvas) and for the PDF (module matrix drawn as
 *   vector squares by js/output/pdf.js), using vendor/qrcode.js
 *   (qrcode-generator by Kazuhiko Arase, MIT).
 *
 * NOTES
 *   - Text is encoded as UTF-8 bytes in "Byte" mode, so non-ASCII mnemonics
 *     (Japanese, Korean, Chinese, accented words) scan back correctly. The
 *     library's default byte conversion keeps the low 8 bits of each char,
 *     so we hand it a string whose chars ARE the UTF-8 bytes.
 *   - Error correction level M (15 %) by default: survives small print flaws
 *     while keeping long secrets (Monero mnemonic) at a printable density.
 *   - No markup is generated (the library's SVG/IMG helpers return HTML
 *     strings, which this app never inserts).
 */
(function (WG) {
  'use strict';

  /** UTF-8 bytes of text as a "binary string" (one char per byte). */
  function utf8Binary(text) {
    var bytes = WG.bytes.utf8ToBytes(text);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  /**
   * Compute the QR module matrix.
   * @param {string} text
   * @param {string} [ecc]  'L' | 'M' | 'Q' | 'H'
   * @returns {{size: number, dark: function(row, col): boolean}}
   */
  function matrix(text, ecc) {
    if (typeof window.qrcode !== 'function') throw new Error('vendor/qrcode.js not loaded');
    var q = window.qrcode(0, ecc || 'M');      // type 0 = smallest version that fits
    q.addData(utf8Binary(text), 'Byte');
    q.make();
    var n = q.getModuleCount();
    return { size: n, dark: function (r, c) { return q.isDark(r, c); } };
  }

  /**
   * Draw a QR code on a new canvas.
   * @param {string} text
   * @param {number} cssSize  displayed size in CSS pixels
   * @returns {HTMLCanvasElement}
   */
  function toCanvas(text, cssSize) {
    var m = matrix(text);
    var quiet = 4;                                  // standard quiet zone in modules
    var total = m.size + quiet * 2;
    var dpr = window.devicePixelRatio || 1;
    var scale = Math.max(1, Math.floor((cssSize * dpr) / total));
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = total * scale;
    canvas.className = 'qr';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'QR');
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < m.size; r++) {
      for (var c = 0; c < m.size; c++) {
        if (m.dark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
    return canvas;
  }

  WG.define('qr', { matrix: matrix, toCanvas: toCanvas });
})(window.WG);
