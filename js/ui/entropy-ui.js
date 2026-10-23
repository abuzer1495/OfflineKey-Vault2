/*
 * js/ui/entropy-ui.js   ->   WG.entropyUi
 *
 * PURPOSE
 *   The "collect entropy" panel of index.html: a credited-bits meter with a
 *   selectable threshold, a pointer/touch drawing pad, dice entry, coin-flip
 *   buttons, a free-text box and a per-source breakdown. It only FEEDS the
 *   pool; it never reads key material back.
 *
 * STRUCTURE
 *   create(pool, opts) builds the panel once and returns
 *     { element, destroy() }.
 *   Pool changes update the existing nodes in place (throttled to one update
 *   per animation frame), because rebuilding on every mouse sample would be
 *   wasteful and would clear the drawing pad.
 *
 * SECURITY NOTES
 *   - Dice are typed into a buffer first and committed with "Add", so typos
 *     can be fixed before they reach the (append-only) pool. Exactness matters
 *     for dice-only mode, where the rolls ARE the key.
 *   - The free-text box is cleared right after its content is mixed in.
 *   - All text goes through WG.dom (textContent only).
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var help = WG.help.button;     // small "?" button with a plain-language explanation
  var E = WG.entropy;

  /** Display order of sources in the breakdown table. */
  var SOURCES = ['dice', 'coin', 'pointer', 'keyboard', 'text', 'jitter'];

  /** Thresholds the user can choose (credited user bits required before generation). */
  var THRESHOLDS = [128, 256, 512];

  /** Format a bit count for display (one decimal below 10, integer above). */
  function fmtBits(b) {
    return b < 10 ? (Math.floor(b * 10) / 10).toString() : String(Math.floor(b));
  }

  /**
   * Build the panel.
   * @param {object} pool                       WG.entropy pool
   * @param {{threshold:number, onThreshold:function}} opts
   *        threshold:   currently selected minimum credited bits
   *        onThreshold: called with the new value when the user changes it
   */
  function create(pool, opts) {
    var threshold = opts.threshold;

    // ---- Meter ---------------------------------------------------------------
    var meter = el('meter', { min: '0', max: String(threshold), low: String(threshold * 0.5), high: String(threshold * 0.99), optimum: String(threshold) });
    var meterText = el('span', { class: 'meter-text' });
    var readyText = el('p', { class: 'ready', role: 'status' });
    var select = el('select', { id: 'threshold', 'aria-label': t('entThreshold') },
      THRESHOLDS.map(function (v) { return el('option', { value: String(v), selected: v === threshold ? 'selected' : null }, v + ' bit'); }));
    select.addEventListener('change', function () { opts.onThreshold(parseInt(select.value, 10)); });

    // ---- Pointer pad (canvas: only draws dots, holds no data) -----------------
    var canvas = el('canvas', { class: 'pad', 'aria-label': t('entPadHint') });
    var ctx = canvas.getContext('2d');
    /** Match the canvas buffer to its on-screen size (sharp dots on HiDPI). */
    function sizeCanvas() {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function drawDot(x, y) {
      ctx.fillStyle = 'rgba(242, 104, 34, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    var detachPointer = WG.entropySources.attachPointer(canvas, pool, drawDot);
    window.addEventListener('resize', sizeCanvas);

    // ---- Dice ----------------------------------------------------------------
    var diceInput = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', id: 'dice-input', placeholder: '3 1 6 6 2 …' });
    var diceMsg = el('p', { class: 'field-msg', role: 'alert' });
    var diceButtons = [1, 2, 3, 4, 5, 6].map(function (v) {
      var b = el('button', { type: 'button', class: 'die', 'aria-label': t('entDieFace', { v: v }) }, String(v));
      b.addEventListener('click', function () { diceInput.value += (diceInput.value && !/\s$/.test(diceInput.value) ? ' ' : '') + v; diceInput.focus(); });
      return b;
    });
    var diceAdd = el('button', { type: 'button', class: 'primary', id: 'dice-add' }, t('entAdd'));
    /** Validate the buffer (digits 1-6, separators allowed) and commit every roll. */
    function commitDice() {
      var digits = diceInput.value.replace(/[\s,;.]+/g, '');
      if (!digits) return;
      if (!/^[1-6]+$/.test(digits)) { diceMsg.textContent = t('entDiceInvalid'); return; }
      for (var i = 0; i < digits.length; i++) pool.addDie(digits.charCodeAt(i) - 48);
      diceInput.value = '';
      diceMsg.textContent = t('entDiceAdded', { n: digits.length });
    }
    diceAdd.addEventListener('click', commitDice);
    diceInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') commitDice(); });

    // ---- Coin ----------------------------------------------------------------
    var heads = el('button', { type: 'button', id: 'coin-heads' }, t('entHeads'));
    var tails = el('button', { type: 'button', id: 'coin-tails' }, t('entTails'));
    heads.addEventListener('click', function () { pool.addCoin(true); });
    tails.addEventListener('click', function () { pool.addCoin(false); });

    // ---- Free text -----------------------------------------------------------
    var textArea = el('textarea', { rows: '2', autocomplete: 'off', spellcheck: 'false', id: 'free-text', placeholder: t('entTextPlaceholder') });
    var textAdd = el('button', { type: 'button' }, t('entMix'));
    textAdd.addEventListener('click', function () {
      pool.addText(textArea.value);
      textArea.value = '';
    });

    // ---- Breakdown + reset ---------------------------------------------------
    var rows = {};
    var tbody = el('tbody', null, SOURCES.map(function (s) {
      rows[s] = { count: el('td', { class: 'num' }), bits: el('td', { class: 'num' }) };
      return el('tr', null, el('td', null, t('src_' + s)), rows[s].count, rows[s].bits);
    }));
    var reset = el('button', { type: 'button', class: 'danger' }, t('entReset'));
    reset.addEventListener('click', function () {
      if (!window.confirm(t('entResetConfirm'))) return;
      pool.reset();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      diceMsg.textContent = '';
    });
    var diceOnlyInfo = el('p', { class: 'muted small' });

    // ---- Assemble ------------------------------------------------------------
    var element = el('section', { class: 'card entropy' },
      el('h2', null, t('entTitle'), help('entropy')),
      el('p', { class: 'muted' }, t('entIntro')),
      el('div', { class: 'meter-row' }, meter, meterText, el('label', { for: 'threshold' }, t('entThreshold')), select, help('threshold')),
      readyText,

      el('h3', null, t('entPadTitle'), help('pad')),
      el('p', { class: 'muted small' }, t('entPadHint')),
      canvas,

      el('h3', null, t('entDiceTitle'), help('dice')),
      el('p', { class: 'muted small' }, t('entDiceHint')),
      el('div', { class: 'dice-row' }, diceButtons),
      el('div', { class: 'input-row' }, diceInput, diceAdd, help('diceAdd')),
      diceMsg,
      diceOnlyInfo,

      el('h3', null, t('entCoinTitle'), help('coinFlip')),
      el('div', { class: 'input-row' }, heads, tails),

      el('h3', null, t('entTextTitle'), help('text')),
      el('p', { class: 'muted small' }, t('entTextHint')),
      el('div', { class: 'input-row' }, textArea, textAdd, help('mix')),

      el('details', null,
        el('summary', null, t('entBreakdown'), help('breakdown')),
        el('table', { class: 'results' },
          el('thead', null, el('tr', null, el('th', null, t('entSource')), el('th', { class: 'num' }, t('entEvents')), el('th', { class: 'num' }, t('entBits')))),
          tbody),
        el('p', { class: 'muted small' }, t('entCreditNote'))),
      el('div', { class: 'input-row' }, reset, help('resetEntropy')));

    /** Copy pool statistics into the existing nodes. */
    function update() {
      var s = pool.stats();
      meter.value = Math.min(s.creditedBits, threshold);
      meterText.textContent = fmtBits(s.creditedBits) + ' / ' + threshold + ' bit';
      var ready = s.creditedBits >= threshold;
      readyText.textContent = ready ? t('entReady') : t('entNeedMore', { n: Math.ceil(threshold - s.creditedBits) });
      readyText.className = 'ready ' + (ready ? 'status-good' : 'muted');
      SOURCES.forEach(function (src) {
        rows[src].count.textContent = String(s.counts[src] || 0);
        rows[src].bits.textContent = fmtBits(s.bySource[src] || 0);
      });
      diceOnlyInfo.textContent = t('entDiceOnlyInfo', { n: s.diceRolls, need128: E.diceRollsNeeded(16), need256: E.diceRollsNeeded(32) });
    }

    // Throttle pool notifications to one DOM update per animation frame.
    var scheduled = false;
    var alive = true;
    var unsubscribe = pool.onChange(function () {
      if (!alive || scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; if (alive) update(); });
    });

    update();
    // The canvas has no size until it is in the document; size it on the next frame.
    requestAnimationFrame(sizeCanvas);

    return {
      element: element,
      /** Detach listeners before the panel is thrown away (e.g. language switch). */
      destroy: function () {
        alive = false;
        unsubscribe();
        detachPointer();
        window.removeEventListener('resize', sizeCanvas);
      },
    };
  }

  WG.define('entropyUi', { create: create, THRESHOLDS: Object.freeze(THRESHOLDS.slice()) });
})(window.WG);
