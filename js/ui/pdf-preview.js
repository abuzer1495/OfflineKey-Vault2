/*
 * js/ui/pdf-preview.js   ->   WG.pdfPreview
 *
 * PURPOSE
 *   Visual layout editor for the PDF panel: the first page of the PDF drawn
 *   as an SVG at 2/5 of its real size (an A4 page is 84 x 118.8 mm on a
 *   correctly calibrated screen). Card positions come from
 *   WG.pdf.placements(), the same function the PDF uses.
 *
 *   Five dashed lines can be dragged; each one edits one layout value:
 *     top margin line    -> marginTop        left margin line -> marginLeft
 *     first card right   -> cardWidth        first card bottom -> cardHeight
 *     second column left -> gap
 *   The same values can be typed into the form below; both stay in sync.
 *
 * HOW
 *   The SVG viewBox is the page size in millimetres, so drawing happens in
 *   mm directly; pointer positions are converted to mm with the SVG's own
 *   screen matrix (works at any zoom). SVG is built with createElementNS and
 *   presentation attributes only (no innerHTML, no inline style).
 */
(function (WG) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var t = WG.i18n.t;

  /** Create an SVG element with attributes. */
  function svg(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    if (text) n.textContent = text;
    return n;
  }

  /** Round to 0.5 mm and keep within [min, max]. */
  function snap(v, min, max) {
    return Math.min(max, Math.max(min, Math.round(v * 2) / 2));
  }

  /**
   * @param {object} layout     layout options (mutated by dragging)
   * @param {number} cardCount  number of card pairs in the wallet set
   * @param {function} onChange called after a drag changed the layout
   * @returns {{element: SVGElement, refresh: function}}
   */
  function create(layout, cardCount, onChange) {
    var L = layout;
    var root = svg('svg', { class: 'page-preview', role: 'img', 'aria-label': t('prevTitle') });
    var drag = null;    // {key, axis} while a line is being dragged

    /** Pointer position in page millimetres. */
    function toMm(e) {
      var p = root.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      return p.matrixTransform(root.getScreenCTM().inverse());
    }

    /** Apply a drag position to the layout value behind the line. */
    function apply(key, mm) {
      if (key === 'marginTop') L.marginTop = snap(mm.y, 0, 100);
      if (key === 'marginLeft') L.marginLeft = snap(mm.x, 0, 100);
      if (key === 'cardWidth') L.cardWidth = snap(mm.x - L.marginLeft, 40, 280);
      if (key === 'cardHeight') L.cardHeight = snap(mm.y - L.marginTop, 25, 280);
      if (key === 'gap') L.gap = snap(mm.x - L.marginLeft - L.cardWidth, 0, 100);
    }

    /** A draggable dashed line with a wide invisible grip. */
    function handle(key, axis, pos, size) {
      var g = svg('g', { class: 'handle handle-' + axis });
      var coords = axis === 'x' ? { x1: pos, y1: 0, x2: pos, y2: size.h } : { x1: 0, y1: pos, x2: size.w, y2: pos };
      g.appendChild(svg('line', Object.assign({ stroke: 'transparent', 'stroke-width': 4 }, coords)));
      g.appendChild(svg('line', Object.assign({ class: 'handle-line', 'stroke-width': 0.6, 'stroke-dasharray': '2 1.5' }, coords)));
      g.appendChild(svg('title', null, t('prev_' + key)));
      g.addEventListener('pointerdown', function (e) {
        drag = key;
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capturable pointer */ }
        e.preventDefault();
      });
      return g;
    }

    root.addEventListener('pointermove', function (e) {
      if (!drag) return;
      apply(drag, toMm(e));
      draw();
      onChange();
    });
    root.addEventListener('pointerup', function () { drag = null; });
    root.addEventListener('pointercancel', function () { drag = null; });

    /** Corner cut marks, as in the PDF. */
    function marks(x, y, w, h) {
      var i = L.guideInner, o = L.guideOuter;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (k) {
        root.appendChild(svg('line', { x1: k[0] - k[2] * o, y1: k[1], x2: k[0] + k[2] * i, y2: k[1], stroke: L.guideColor, 'stroke-width': 0.35 }));
        root.appendChild(svg('line', { x1: k[0], y1: k[1] - k[3] * o, x2: k[0], y2: k[1] + k[3] * i, stroke: L.guideColor, 'stroke-width': 0.35 }));
      });
    }

    /** Redraw the whole page from the layout. */
    function draw() {
      while (root.firstChild) root.removeChild(root.firstChild);
      var size = WG.pdf.pageSize(L);
      root.setAttribute('viewBox', '0 0 ' + size.w + ' ' + size.h);
      root.setAttribute('width', (size.w * 0.4) + 'mm');      // 2/5 of the real size
      root.setAttribute('height', (size.h * 0.4) + 'mm');
      root.appendChild(svg('rect', { x: 0, y: 0, width: size.w, height: size.h, class: 'paper' }));
      var fits = !WG.pdf.checkFit(L);
      var page = fits ? WG.pdf.placements(L, Math.max(1, cardCount))[0] : [];
      page.forEach(function (p) {
        var img = p.side === 'front' ? L.bgFront : (L.bgBack || L.bgFront);
        if (L.useBackground && img) {
          root.appendChild(svg('image', { href: img, x: p.x, y: p.y, width: L.cardWidth, height: L.cardHeight, preserveAspectRatio: 'none' }));
        }
        root.appendChild(svg('rect', { x: p.x, y: p.y, width: L.cardWidth, height: L.cardHeight, class: 'card-' + p.side }));
        root.appendChild(svg('text', { x: p.x + 2, y: p.y + 6, class: 'card-label' }, t(p.side === 'front' ? 'prevFront' : 'prevBack') + ' ' + (p.card + 1)));
        marks(p.x, p.y, L.cardWidth, L.cardHeight);
      });
      // Draggable lines (gap only exists between columns).
      root.appendChild(handle('marginTop', 'y', L.marginTop, size));
      root.appendChild(handle('marginLeft', 'x', L.marginLeft, size));
      root.appendChild(handle('cardWidth', 'x', L.marginLeft + L.cardWidth, size));
      root.appendChild(handle('cardHeight', 'y', L.marginTop + L.cardHeight, size));
      if (!L.separate || page.some(function (p) { return p.x > L.marginLeft + L.cardWidth; })) {
        root.appendChild(handle('gap', 'x', L.marginLeft + L.cardWidth + L.gap, size));
      }
    }

    draw();
    return { element: root, refresh: draw };
  }

  WG.define('pdfPreview', { create: create });
})(window.WG);
