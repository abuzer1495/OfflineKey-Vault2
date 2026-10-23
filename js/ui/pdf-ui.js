/*
 * js/ui/pdf-ui.js   ->   WG.pdfUi
 *
 * PURPOSE
 *   "4. Print / PDF" panel: the card layout options of the original project
 *   (margins, card size, gap, cut guides, colours, transparency, shadow, page
 *   size, page separation, background images, manual page) and the button
 *   that builds and downloads the PDF (js/output/pdf.js).
 *
 *   Options live in a layout object owned by app.js (survives re-renders).
 *   Background images are re-encoded through a canvas to JPEG (max 2000 px),
 *   which also strips photo metadata (EXIF/GPS) before it goes into the PDF.
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;

  /** Form fields: [key, type, i18n label, extra]. Types: num, color, check, select. */
  var FIELDS = [
    ['pageSize', 'select', 'pdfPageSize', [['a4', 'A4'], ['a5', 'A5'], ['fit', 'pdfFit']]],
    ['orientation', 'select', 'pdfOrientation', [['p', 'pdfPortrait'], ['l', 'pdfLandscape']]],
    ['separate', 'check', 'pdfSeparate'],
    ['marginTop', 'num', 'pdfMarginTop'],
    ['marginLeft', 'num', 'pdfMarginLeft'],
    ['cardWidth', 'num', 'pdfCardWidth'],
    ['cardHeight', 'num', 'pdfCardHeight'],
    ['gap', 'num', 'pdfGap'],
    ['guideInner', 'num', 'pdfGuideInner'],
    ['guideOuter', 'num', 'pdfGuideOuter'],
    ['guideColor', 'color', 'pdfGuideColor'],
    ['textColor', 'color', 'pdfTextColor'],
    ['textBg', 'color', 'pdfTextBg'],
    ['textBgOpacity', 'num', 'pdfOpacity', { min: 0, max: 1, step: 0.1 }],
    ['textShadow', 'check', 'pdfShadow'],
    ['secretQr', 'check', 'pdfSecretQr'],
    ['coinSecrets', 'check', 'pdfCoinSecrets'],
    ['manual', 'check', 'pdfManual'],
    ['useBackground', 'check', 'pdfUseBg'],
  ];

  /** Re-encode an image file to a JPEG data URL (max 2000 px on the long side). */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 2000 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(t('pdfBadImage'))); };
      img.src = url;
    });
  }

  /** One form field bound to layout[key]. */
  function field(layout, f, onChange) {
    var key = f[0], type = f[1], id = 'pdf-' + key, input;
    if (type === 'select') {
      input = el('select', { id: id }, f[3].map(function (o) {
        return el('option', { value: o[0], selected: layout[key] === o[0] ? 'selected' : null }, o[1].indexOf('pdf') === 0 ? t(o[1]) : o[1]);
      }));
      input.addEventListener('change', function () { layout[key] = input.value; onChange(); });
    } else if (type === 'check') {
      input = el('input', { type: 'checkbox', id: id, checked: layout[key] ? 'checked' : null });
      input.addEventListener('change', function () { layout[key] = input.checked; onChange(); });
      return el('label', { class: 'check', for: id }, input, ' ', t(f[2]));
    } else {
      var x = f[3] || { min: 0, max: 300, step: 0.1 };
      input = el('input', { type: type === 'color' ? 'color' : 'number', id: id, min: x.min, max: x.max, step: x.step });
      input.value = layout[key];
      input.addEventListener('input', function () {
        layout[key] = type === 'color' ? input.value : parseFloat(input.value) || 0;
        onChange();
      });
    }
    return el('label', { class: 'field', for: id }, el('span', null, t(f[2])), input);
  }

  /**
   * Build the panel.
   * @param {object} set     wallet set to print
   * @param {object} layout  layout options (mutated)
   */
  function create(set, layout) {
    var msg = el('p', { class: 'field-msg', role: 'status' });
    var button = el('button', { type: 'button', class: 'primary big', id: 'pdf-build' }, t('pdfBuild'));

    /** Show layout problems and disable the button if the cards do not fit. */
    function check() {
      var err = WG.pdf.checkFit(layout);
      msg.textContent = err || '';
      button.disabled = !!err;
    }

    var fields = FIELDS.filter(function (f) { return f[0] !== 'coinSecrets' || set.mode !== 'single'; })
      .map(function (f) { return field(layout, f, check); });

    /** File input for a background image side. */
    function bgInput(key, label) {
      var input = el('input', { type: 'file', id: 'pdf-' + key, accept: 'image/png,image/jpeg,image/webp' });
      input.addEventListener('change', function () {
        if (!input.files[0]) { layout[key] = null; return; }
        loadImage(input.files[0]).then(function (data) { layout[key] = data; }, function (e) { msg.textContent = e.message; });
      });
      return el('label', { class: 'field', for: 'pdf-' + key }, el('span', null, t(label)), input);
    }

    button.addEventListener('click', function () {
      try {
        msg.textContent = t('pdfWorking');
        var doc = WG.pdf.build(set, layout);
        doc.save('paper-wallet-' + set.createdAt.slice(0, 16).replace(/[-:T]/g, '') + '.pdf');
        msg.textContent = t('pdfDone');
      } catch (e) {
        msg.textContent = t('error') + ': ' + e.message;
      }
    });

    var section = el('section', { class: 'card pdf', id: 'pdf' },
      el('h2', null, t('pdfTitle')),
      el('p', { class: 'muted small' }, t('pdfIntro')),
      el('div', { class: 'form-grid' }, fields, bgInput('bgFront', 'pdfBgFront'), bgInput('bgBack', 'pdfBgBack')),
      el('p', { class: 'warn small' }, t('pdfWarn')),
      el('div', { class: 'generate-row' }, button), msg);
    check();
    return { element: section, destroy: function () {} };
  }

  WG.define('pdfUi', { create: create });
})(window.WG);
