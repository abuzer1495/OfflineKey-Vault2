/*
 * tests/suites/bip-vectors.js
 *
 * PURPOSE
 *   Registers one non-critical test per official vector loaded from
 *   tests/vectors/bip39-trezor.js and tests/vectors/bip32.js, so the test
 *   page reports exactly which vector fails. Loaded by tests/test.html only.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var reg = WG.selftest.register;

  // ---- BIP39: entropy <-> mnemonic, seed, BIP32 root ------------------------
  var b39 = WG.vectors.bip39Trezor;
  b39.cases.forEach(function (c, i) {
    reg({
      id: 'vec.bip39.' + i, group: 'BIP39 (' + b39.source + ')',
      title: 'BIP39 #' + i + ': ' + (c.entropy.length * 4) + '-bit entropy ' + c.entropy.slice(0, 8) + '…',
      run: function (t) {
        var wl = V.bip39.wordlists.english;
        t.equal(V.bip39.entropyToMnemonic(B.hexToBytes(c.entropy), wl), c.mnemonic, 'entropy -> mnemonic');
        t.equalHex(V.bip39.mnemonicToEntropy(c.mnemonic, wl), c.entropy, 'mnemonic -> entropy');
        t.ok(V.bip39.validateMnemonic(c.mnemonic, wl), 'mnemonic checksum valid');
        var seed = V.bip39.mnemonicToSeedSync(c.mnemonic, b39.passphrase);
        t.equalHex(seed, c.seed, 'mnemonic + passphrase -> seed');
        t.equalHex(WG.bip39.mnemonicToSeed(c.mnemonic, b39.passphrase), c.seed, 'WG.bip39.mnemonicToSeed (app implementation)');
        t.equal(WG.bip39.entropyToMnemonic(B.hexToBytes(c.entropy)), c.mnemonic, 'WG.bip39.entropyToMnemonic');
        t.equal(V.bip32.HDKey.fromMasterSeed(seed).privateExtendedKey, c.xprv, 'seed -> BIP32 root xprv');
      },
    });
  });

  // ---- BIP32: master seed -> derivation paths --------------------------------
  var b32 = WG.vectors.bip32;
  b32.vectors.forEach(function (v) {
    v.chains.forEach(function (c) {
      reg({
        id: 'vec.bip32.' + v.name + '.' + c.path, group: 'BIP32 (' + b32.source + ')',
        title: v.name + ' — ' + c.path,
        run: function (t) {
          var key = V.bip32.HDKey.fromMasterSeed(B.hexToBytes(v.seed)).derive(c.path);
          t.equal(key.publicExtendedKey, c.xpub, 'xpub');
          t.equal(key.privateExtendedKey, c.xprv, 'xprv');
          // Round trip: parsing the expected xprv must reproduce the same xpub.
          t.equal(V.bip32.HDKey.fromExtendedKey(c.xprv).publicExtendedKey, c.xpub, 'xprv -> xpub');
        },
      });
    });
  });

  // ---- Negative checks -------------------------------------------------------
  reg({
    id: 'vec.bip39.bad-checksum', group: 'BIP39 negative',
    title: 'Mnemonic with a wrong last word is rejected',
    run: function (t) {
      var wl = V.bip39.wordlists.english;
      var bad = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
      t.ok(!V.bip39.validateMnemonic(bad, wl), 'checksum failure detected');
      t.throws(function () { V.bip39.mnemonicToEntropy(bad, wl); }, 'mnemonicToEntropy');
    },
  });
})(window.WG, window.WGVendor);
