/*
 * tests/suites/core.js
 *
 * PURPOSE
 *   Tests for the app's own core helpers (js/core/*) that are not covered by
 *   vendor known-answer tests. Loaded by tests/test.html only.
 */
(function (WG) {
  'use strict';

  var B = WG.bytes;
  var reg = WG.selftest.register;

  reg({
    id: 'core.bytes.hex', group: 'core: bytes', title: 'hexToBytes is strict and round-trips',
    run: function (t) {
      t.equalHex(B.hexToBytes('00ff10AB'), '00ff10ab', 'mixed case accepted');
      t.throws(function () { B.hexToBytes('abc'); }, 'odd length');
      t.throws(function () { B.hexToBytes('zz'); }, 'non-hex');
      t.throws(function () { B.hexToBytes(null); }, 'non-string');
      t.equal(B.bytesToHex(new Uint8Array([1, 2, 254])), '0102fe', 'bytesToHex');
    },
  });

  reg({
    id: 'core.bytes.equal-wipe', group: 'core: bytes', title: 'equal() and wipe()',
    run: function (t) {
      var a = new Uint8Array([1, 2, 3]);
      t.ok(B.equal(a, new Uint8Array([1, 2, 3])), 'equal arrays');
      t.ok(!B.equal(a, new Uint8Array([1, 2, 4])), 'different content');
      t.ok(!B.equal(a, new Uint8Array([1, 2])), 'different length');
      B.wipe(a, null);
      t.ok(B.equal(a, new Uint8Array(3)), 'wiped to zeros');
      t.equalHex(B.concat(new Uint8Array([1]), new Uint8Array([2, 3])), '010203', 'concat');
    },
  });

  reg({
    id: 'core.namespace.immutable', group: 'core: namespace', title: 'Defined modules cannot be replaced',
    run: function (t) {
      t.throws(function () { WG.define('bytes', {}); }, 'redefine module');
      t.throws(function () { 'use strict'; WG.bytes = null; }, 'assign module');
      t.ok(Object.isFrozen(WG.bytes), 'module frozen');
      var d = Object.getOwnPropertyDescriptor(window, 'WG');
      t.ok(d && !d.writable && !d.configurable, 'window.WG locked');
    },
  });

  reg({
    id: 'core.selftest.gate', group: 'core: selftest', title: 'Critical tests are registered and gate generation',
    run: function (t) {
      t.ok(WG.selftest.count() > 0, 'tests registered');
      t.equal(typeof WG.selftest.requireHealthy, 'function', 'gate exists');
    },
  });
})(window.WG);
