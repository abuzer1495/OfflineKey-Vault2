/*
 * tests/suites/entropy.js
 *
 * PURPOSE
 *   Behavioural tests of the entropy pool and event collectors on private
 *   pools (WG.entropy.createPool), so the app-wide pool is never touched.
 *   Formula KATs live in js/core/selftest-entropy.js (critical, start-up).
 */
(function (WG) {
  'use strict';

  var E = WG.entropy;
  var B = WG.bytes;
  var reg = WG.selftest.register;

  /** True if |a - b| is below a floating-point tolerance. */
  function near(a, b) { return Math.abs(a - b) < 1e-9; }

  reg({
    id: 'entropy.pool.credits', group: 'entropy pool', title: 'Each source is credited conservatively and counted',
    run: function (t) {
      var p = E.createPool();
      p.addDie(3); p.addDie(6); p.addDie(1);
      p.addCoin(true);
      p.addPointer(10.5, 20.25, 1234.5, 'mouse');
      p.addKeyTiming(99.9);
      p.addText('some free text');
      p.addJitter([0.1, 0.2]);
      var s = p.stats();
      t.ok(near(s.bySource.dice, 3 * Math.log2(6)), 'dice 3 x 2.585 bits');
      t.ok(near(s.bySource.coin, 1), 'coin 1 bit');
      t.ok(near(s.bySource.pointer, 0.5), 'pointer 0.5 bit');
      t.ok(near(s.bySource.keyboard, 1), 'keyboard 1 bit');
      t.ok(near(s.bySource.text, 0) && near(s.bySource.jitter, 0), 'text and jitter credited 0');
      t.ok(near(s.creditedBits, 3 * Math.log2(6) + 2.5), 'total');
      t.equal(s.diceRolls, 3, 'dice log length');
      t.equal(s.events, 8, 'event counter');
    },
  });

  reg({
    id: 'entropy.pool.validation', group: 'entropy pool', title: 'Invalid user input is rejected',
    run: function (t) {
      var p = E.createPool();
      t.throws(function () { p.addDie(0); }, 'die 0');
      t.throws(function () { p.addDie(7); }, 'die 7');
      t.throws(function () { p.addDie(2.5); }, 'die 2.5');
      t.throws(function () { p.addCoin('heads'); }, 'coin as string');
      t.equal(p.stats().events, 0, 'nothing was absorbed');
    },
  });

  reg({
    id: 'entropy.pool.extract', group: 'entropy pool', title: 'extract(): length, uniqueness, minimum-credit gate',
    run: function (t) {
      var p = E.createPool();
      var a = p.extract('test', 32);
      var b = p.extract('test', 32);
      t.equal(a.length, 32, 'length');
      t.ok(!B.equal(a, b), 'consecutive extractions differ');
      t.throws(function () { p.extract('test', 32, { minCreditedBits: 1 }); }, 'refused without user entropy');
      p.addCoin(false);
      t.equal(p.extract('test', 16, { minCreditedBits: 1 }).length, 16, 'allowed after 1 credited bit');
    },
  });

  reg({
    id: 'entropy.pool.dice-only', group: 'entropy pool', title: 'extractDiceOnly(): matches formula, needs enough rolls, wipes log',
    run: function (t) {
      var p = E.createPool();
      var rolls = '';
      for (var i = 0; i < 49; i++) { var v = (i * 5) % 6 + 1; p.addDie(v); rolls += v; }
      t.throws(function () { p.extractDiceOnly(16); }, '49 rolls are not enough for 128 bits');
      t.equal(p.stats().diceRolls, 49, 'log kept after refusal');
      p.addDie(4); rolls += '4';
      t.equalHex(p.extractDiceOnly(16), B.bytesToHex(E.diceToEntropy(rolls, 16)), 'same as diceToEntropy');
      t.equal(p.stats().diceRolls, 0, 'dice log wiped after use');
      t.throws(function () { p.extractDiceOnly(16); }, 'rolls cannot be reused');
    },
  });

  reg({
    id: 'entropy.pool.reset', group: 'entropy pool', title: 'reset() clears credits, counters and dice log',
    run: function (t) {
      var p = E.createPool();
      p.addDie(2); p.addCoin(true);
      p.reset();
      var s = p.stats();
      t.equal(s.creditedBits, 0, 'credits');
      t.equal(s.events, 0, 'events');
      t.equal(s.diceRolls, 0, 'dice log');
    },
  });

  reg({
    id: 'entropy.sources.keyboard', group: 'entropy sources', title: 'Keyboard: timing only, auto-repeat and bursts ignored',
    run: function (t) {
      var p = E.createPool();
      var target = document.createElement('div');
      var detach = WG.entropySources.attachKeyboard(target, p);
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));               // < 15 ms later: dropped
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', repeat: true })); // auto-repeat: dropped
      detach();
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));               // detached: ignored
      t.equal(p.stats().counts.keyboard, 1, 'exactly one accepted press');
    },
  });

  reg({
    id: 'entropy.sources.pointer', group: 'entropy sources', title: 'Pointer: samples too close in time are dropped',
    run: function (t) {
      var p = E.createPool();
      var pad = document.createElement('div');
      var drawn = 0;
      var detach = WG.entropySources.attachPointer(pad, p, function () { drawn++; });
      pad.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse' }));
      pad.dispatchEvent(new PointerEvent('pointermove', { clientX: 90, clientY: 90, pointerType: 'mouse' })); // < 10 ms: dropped
      detach();
      t.equal(p.stats().counts.pointer, 1, 'one accepted sample');
      t.equal(drawn, 1, 'draw callback called once');
    },
  });

  reg({
    id: 'entropy.sources.jitter', group: 'entropy sources', title: 'Timer jitter is collected and credited 0 bits',
    run: async function (t) {
      var p = E.createPool();
      await WG.entropySources.collectJitter(p, 8);
      t.equal(p.stats().counts.jitter, 1, 'one jitter event');
      t.ok(near(p.stats().creditedBits, 0), 'no credit');
    },
  });
})(window.WG);
