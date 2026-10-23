/*
 * js/core/selftest-entropy.js
 *
 * PURPOSE
 *   Critical known-answer tests for the entropy pool formulas documented in
 *   js/core/entropy-pool.js. Expected values were computed with an
 *   independent implementation (Node.js built-in crypto: createHash /
 *   hkdfSync), not with the code under test, so a change to the mixing,
 *   KDF or dice formula is detected on every start-up.
 */
(function (WG) {
  'use strict';

  var E = WG.entropy;
  var B = WG.bytes;
  var reg = WG.selftest.register;

  /** n bytes all equal to value. */
  function filled(n, value) {
    return new Uint8Array(n).fill(value);
  }

  reg({
    id: 'entropy.absorb-kat', group: 'entropy', critical: true,
    title: 'Pool absorb = SHA-512(state || u32 counter || u8 len || tag || u32 len || data)',
    run: function (t) {
      t.equalHex(E.absorb(filled(64, 0x11), 7, 'dice', new Uint8Array([5])),
        'c12283592d083da57fb1e960b238fae83aaa74889ec89f97c549f4ace81994913932d555cf684aa8dee9afb96618be17575e89e33d5b2bdf97c83cf14795a3be');
    },
  });

  reg({
    id: 'entropy.derive-kat', group: 'entropy', critical: true,
    title: 'Extraction = HKDF-SHA512(CSPRNG || state, "WG-entropy-v1", "wg-extract/" || purpose)',
    run: function (t) {
      t.equalHex(E.derive(filled(64, 0x22), filled(64, 0x33), 'test', 32),
        '47186362010db59fc59bca7552db283bda411ffc324b3ef19cf00908bf92f1c5');
    },
  });

  reg({
    id: 'entropy.dice-kat', group: 'entropy', critical: true,
    title: 'Dice-only = SHA-256(roll digits), Coldcard-compatible (100 rolls / 50 rolls)',
    run: function (t) {
      // 100 rolls = 258.5 bits >= 256. (Coldcard accepts 99 = 255.9 bits; we stay strictly >= 256.)
      var r100 = '1234561234561234561234561234561234561234561234561234561234561234561234561234561234561234561234561234';
      var r50 = '65432165432165432165432165432165432165432165432165';
      t.equalHex(E.diceToEntropy(r100, 32), 'e56403e8522ddeae1b44a1e8148b1ba4d3b4c626ccf20980056eedcc7e0c0f35', '256-bit');
      t.equalHex(E.diceToEntropy(r50, 16), 'a3c59f982a304cb7d500fc6ee6827bd0', '128-bit (first 16 bytes)');
      t.equal(E.diceRollsNeeded(32), 100, 'rolls needed for 256 bits');
      t.equal(E.diceRollsNeeded(16), 50, 'rolls needed for 128 bits');
      t.throws(function () { E.diceToEntropy(r100.slice(1), 32); }, '99 rolls rejected for 256 bits');
      t.throws(function () { E.diceToEntropy(r100.slice(0, 99) + '7', 32); }, 'digit 7 rejected');
    },
  });

  reg({
    id: 'entropy.csprng-always-mixed', group: 'entropy', critical: true,
    title: 'Same pool state + same user input still gives different output (CSPRNG mixed in)',
    run: function (t) {
      var state = filled(64, 0x44);
      var r1 = new Uint8Array(64), r2 = new Uint8Array(64);
      window.crypto.getRandomValues(r1);
      window.crypto.getRandomValues(r2);
      t.ok(!B.equal(E.derive(r1, state, 'x', 32), E.derive(r2, state, 'x', 32)), 'outputs differ');
      t.ok(!B.equal(E.derive(r1, state, 'a', 32), E.derive(r1, state, 'b', 32)), 'purpose separates outputs');
    },
  });
})(window.WG);
