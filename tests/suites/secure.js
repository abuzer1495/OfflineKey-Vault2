/*
 * tests/suites/secure.js
 *
 * PURPOSE
 *   Optional security features against their official vectors:
 *     - SLIP-0039: all 45 python-shamir-mnemonic vectors (valid sets must give
 *       the master secret and BIP32 root xprv, invalid sets must be rejected),
 *       plus generate -> combine round trips for every M-subset.
 *     - BIP38: decrypt and encrypt vectors from the BIP text (scrypt; slow).
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var reg = WG.selftest.register;
  var VEC = WG.vectors;

  /** Test-only randomness (the app always uses the entropy pool). */
  function rnd(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  // ---- SLIP-0039 official vectors --------------------------------------------
  VEC.slip39.cases.forEach(function (c, i) {
    reg({
      id: 'secure.slip39.vec' + (i + 1), group: 'SLIP-0039 (' + VEC.slip39.source + ')', title: c.description,
      run: function (t) {
        if (c.secret) {
          var ms = WG.slip39.combine(c.mnemonics, VEC.slip39.passphrase);
          t.equalHex(ms, c.secret, 'master secret');
          t.equal(V.bip32.HDKey.fromMasterSeed(ms).privateExtendedKey, c.xprv, 'BIP32 root xprv');
        } else {
          t.throws(function () { WG.slip39.combine(c.mnemonics, VEC.slip39.passphrase); }, 'invalid set rejected');
        }
      },
    });
  });

  /** All k-element subsets of an array. */
  function subsets(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    var head = arr[0], rest = arr.slice(1);
    return subsets(rest, k - 1).map(function (s) { return [head].concat(s); }).concat(subsets(rest, k));
  }

  [[16, 2, 3, 'TREZOR'], [32, 3, 5, ''], [16, 1, 1, 'pass phrase']].forEach(function (p) {
    reg({
      id: 'secure.slip39.roundtrip-' + p.join('-'), group: 'SLIP-0039 generate',
      title: 'Generate ' + p[1] + '-of-' + p[2] + ' (' + p[0] * 8 + '-bit, passphrase "' + p[3] + '") and recover from every ' + p[1] + '-subset',
      run: function (t) {
        var ms = rnd(p[0]);
        var shares = WG.slip39.generate(ms, { threshold: p[1], count: p[2], passphrase: p[3], randomBytes: rnd });
        t.equal(shares.length, p[2], 'share count');
        t.equal(shares[0].split(' ').length, p[0] === 16 ? 20 : 33, 'words per share');
        shares.forEach(function (s, i) {
          var d = WG.slip39.describe(s);
          t.equal(d.index, i, 'share index'); t.equal(d.memberThreshold, p[1], 'threshold');
        });
        subsets(shares, p[1]).forEach(function (set) { t.equalHex(WG.slip39.combine(set, p[3]), B.bytesToHex(ms), 'subset'); });
        if (p[1] > 1) t.throws(function () { WG.slip39.combine(shares.slice(0, p[1] - 1), p[3]); }, 'fewer than threshold rejected');
        if (p[3]) t.ok(!B.equal(WG.slip39.combine(shares.slice(0, p[1]), 'wrong'), ms), 'wrong passphrase gives a different secret');
      },
    });
  });

  // ---- BIP38 -------------------------------------------------------------
  VEC.bip38.cases.forEach(function (c, i) {
    reg({
      id: 'secure.bip38.decrypt' + i, group: 'BIP38 (' + VEC.bip38.source + ')',
      title: 'Decrypt ' + (c.compressed ? 'compressed' : 'uncompressed') + ' "' + c.passphrase + '" (scrypt, slow)',
      run: async function (t) {
        var r = await WG.bip38.decrypt(c.encrypted, c.passphrase);
        t.equalHex(r.privateKey, c.privkey, 'private key');
        t.equal(r.compressed, c.compressed, 'compression flag');
      },
    });
  });
  [0, 2].forEach(function (i) {
    var c = VEC.bip38.cases[i];
    reg({
      id: 'secure.bip38.encrypt' + i, group: 'BIP38 (' + VEC.bip38.source + ')',
      title: 'Encrypt ' + (c.compressed ? 'compressed' : 'uncompressed') + ' "' + c.passphrase + '" (scrypt, slow)',
      run: async function (t) {
        var r = await WG.bip38.encrypt(B.hexToBytes(c.privkey), c.passphrase, c.compressed);
        t.equal(r.encrypted, c.encrypted, 'encrypted key');
      },
    });
  });
  reg({
    id: 'secure.bip38.wrong-password', group: 'BIP38 negative', title: 'Wrong BIP38 password is detected (address hash check)',
    run: async function (t) {
      var failed = false;
      try { await WG.bip38.decrypt(VEC.bip38.cases[2].encrypted, 'not the password'); } catch (e) { failed = true; }
      t.ok(failed, 'decrypt with wrong password throws');
    },
  });
})(window.WG, window.WGVendor);
