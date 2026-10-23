/*
 * js/core/entropy-sources.js   ->   WG.entropySources
 *
 * PURPOSE
 *   Browser event collectors that feed an entropy pool (js/core/entropy-pool.js):
 *     - pointer:  mouse / touch / pen movement over a given element
 *     - keyboard: key-press TIMING anywhere in the page (never which key)
 *     - jitter:   scheduling jitter of the event loop (credited 0 bits)
 *   Dice, coin flips and free text are entered explicitly by the UI and go
 *   straight to pool.addDie / addCoin / addText.
 *
 * RATE LIMITS
 *   Samples that are too close in time/space carry almost no new
 *   information, so they are dropped before reaching the pool:
 *     pointer:  >= 10 ms and >= 4 px since the last accepted sample
 *     keyboard: >= 15 ms since the last accepted press, auto-repeat ignored
 */
(function (WG) {
  'use strict';

  var POINTER_MIN_MS = 10;
  var POINTER_MIN_PX = 4;
  var KEY_MIN_MS = 15;

  /**
   * Collect pointer movement over `element` into `pool`.
   * @param {Element} element  the drawing pad
   * @param {object} pool      WG.entropy pool
   * @param {function} [onSample]  called with (x, y) of each accepted sample (for drawing)
   * @returns {function}       detach()
   */
  function attachPointer(element, pool, onSample) {
    var lastX = -1e9, lastY = -1e9, lastT = -1e9;
    function onMove(e) {
      var rect = element.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var t = performance.now();
      var dist = Math.abs(x - lastX) + Math.abs(y - lastY);
      if (t - lastT < POINTER_MIN_MS || dist < POINTER_MIN_PX) return;
      lastX = x; lastY = y; lastT = t;
      // Raw (sub-pixel) client coordinates are mixed in; the rounded ones are only for drawing.
      pool.addPointer(e.clientX, e.clientY, t, e.pointerType);
      if (onSample) onSample(x, y);
    }
    element.addEventListener('pointermove', onMove);
    return function detach() { element.removeEventListener('pointermove', onMove); };
  }

  /**
   * Collect key-press timings on `target` (usually document) into `pool`.
   * Only performance.now() is recorded; the key value is never read.
   * @returns {function} detach()
   */
  function attachKeyboard(target, pool) {
    var lastT = -1e9;
    function onKey(e) {
      if (e.repeat) return;
      var t = performance.now();
      if (t - lastT < KEY_MIN_MS) return;
      lastT = t;
      pool.addKeyTiming(t);
    }
    target.addEventListener('keydown', onKey);
    return function detach() { target.removeEventListener('keydown', onKey); };
  }

  /**
   * Measure event-loop scheduling jitter (n zero-delay timer round trips)
   * and mix the deltas into `pool`. Credited 0 bits; it is a cheap extra.
   * @returns {Promise<void>}
   */
  async function collectJitter(pool, n) {
    var samples = [];
    for (var i = 0; i < (n || 64); i++) {
      var t0 = performance.now();
      await new Promise(function (r) { setTimeout(r, 0); });
      samples.push(performance.now() - t0);
    }
    pool.addJitter(samples);
  }

  WG.define('entropySources', {
    attachPointer: attachPointer,
    attachKeyboard: attachKeyboard,
    collectJitter: collectJitter,
  });
})(window.WG);
