/*
 * tests/suites/generator.js
 *
 * PURPOSE
 *   End-to-end tests of WG.generator on private entropy pools: every mode,
 *   every coin, dice-only compatibility, the minimum-entropy gate, BIP38 and
 *   wiping. Each generated set must carry only passing verification checks.
 */
(function (WG) {
  'use strict';

  var B = WG.bytes;
  var reg = WG.selftest.register;
  var ALL_COINS = WG.coins.list().map(function (c) { return c.id; });

  /** A private pool with `bits` of credited entropy from coin flips. */
  function poolWith(bits) {
    var p = WG.entropy.createPool();
    for (var i = 0; i < bits; i++) p.addCoin(i % 3 === 0);
    return p;
  }

  /** Address shape per coin (mainnet). */
  var SHAPE = {
    btc: /^(bc1q[0-9a-z]{38}|bc1p[0-9a-z]{58}|1[1-9A-HJ-NP-Za-km-z]{25,34})$/, ltc: /^(ltc1q[0-9a-z]{38}|L[1-9A-HJ-NP-Za-km-z]{25,34})$/,
    doge: /^D[1-9A-HJ-NP-Za-km-z]{25,34}$/, eth: /^0x[0-9a-fA-F]{40}$/, trx: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
    xrp: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, xlm: /^G[A-Z2-7]{55}$/,
    ada: /^addr1[0-9a-z]{98}$/, xmr: /^4[1-9A-HJ-NP-Za-km-z]{94}$/,
  };

  /** Common assertions on a generated set. */
  function checkSet(t, set, expectCoins) {
    t.ok(set.checks.length > 0, 'verification checks ran');
    set.checks.forEach(function (c) { t.ok(c.ok, c.what); });
    t.equal(set.results.map(function (r) { return r.coin; }).sort().join(','), expectCoins.slice().sort().join(','), 'coins');
    set.results.forEach(function (r) { t.ok(SHAPE[r.coin].test(r.address), r.coin + ' address shape: ' + r.address); });
  }

  reg({
    id: 'gen.bip39-all-coins', group: 'generator', title: 'BIP39 24 words, all 10 coins, self-verified',
    run: async function (t) {
      var set = await WG.generator.generate({ mode: 'bip39', coins: ALL_COINS, words: 24, pool: poolWith(256), minCreditedBits: 256 });
      t.equal(WG.bip39.words(set.mnemonic).length, 24, '24 words');
      t.ok(WG.bip39.validate(set.mnemonic), 'valid BIP39');
      checkSet(t, set, ALL_COINS);
    },
  });

  reg({
    id: 'gen.bip39-variants-passphrase', group: 'generator', title: 'BIP39 12 Japanese words + passphrase, taproot/legacy variants',
    run: async function (t) {
      var set = await WG.generator.generate({ mode: 'bip39', coins: ['btc', 'ltc', 'ada'], words: 12, language: 'japanese',
        passphrase: 'çok gizli パス', variants: { btc: 'p2tr', ltc: 'p2pkh' }, pool: poolWith(128), minCreditedBits: 128 });
      t.equal(WG.bip39.words(set.mnemonic).length, 12, '12 words');
      t.ok(set.mnemonic.indexOf('　') !== -1, 'ideographic spaces');
      t.ok(set.hasPassphrase && !('passphrase' in set), 'passphrase flagged, not stored');
      t.ok(/^bc1p/.test(set.results[0].address) && /^L/.test(set.results[1].address), 'variants honoured');
      checkSet(t, set, ['btc', 'ltc', 'ada']);
    },
  });

  reg({
    id: 'gen.dice-only', group: 'generator', title: 'Dice-only: mnemonic = BIP39(SHA-256(rolls)) (Coldcard method)',
    run: async function (t) {
      var p = WG.entropy.createPool();
      var rolls = '';
      for (var i = 0; i < 100; i++) { var v = (i * 7 + 3) % 6 + 1; p.addDie(v); rolls += v; }
      var set = await WG.generator.generate({ mode: 'bip39', coins: ['btc'], words: 24, diceOnly: true, pool: p, minCreditedBits: 0 });
      t.equal(set.mnemonic, WG.bip39.entropyToMnemonic(WGVendor.hashes.sha256(B.utf8ToBytes(rolls))), 'mnemonic from rolls');
      t.ok(set.diceOnly, 'flagged');
      checkSet(t, set, ['btc']);
    },
  });

  reg({
    id: 'gen.slip39', group: 'generator', title: 'SLIP-39 2-of-3 + passphrase; Cardano skipped; Monero separate',
    run: async function (t) {
      var set = await WG.generator.generate({ mode: 'slip39', coins: ['btc', 'eth', 'ada', 'xmr'], passphrase: 'TREZOR',
        slip39: { threshold: 2, count: 3, bytes: 16 }, pool: poolWith(128), minCreditedBits: 128 });
      t.equal(set.shares.length, 3, '3 shares');
      t.equal(set.mnemonic, null, 'no BIP39 mnemonic');
      var ms = WG.slip39.combine([set.shares[0], set.shares[2]], 'TREZOR');
      t.equal(WG.coins.get('eth').fromSeed({ seed: ms }).address, set.results[1].address, 'shares 1+3 recover the ETH address');
      checkSet(t, set, ['btc', 'eth', 'xmr']);
    },
  });

  reg({
    id: 'gen.single-bip38', group: 'generator', title: 'Single keys for every single-key coin, BTC with BIP38 (slow)',
    run: async function (t) {
      var coins = ALL_COINS.filter(function (id) { return WG.coins.get(id).singleKey; });
      var set = await WG.generator.generate({ mode: 'single', coins: coins, bip38: { enabled: true, password: 'Satoshi' }, pool: poolWith(128), minCreditedBits: 128 });
      var btc = set.results.filter(function (r) { return r.coin === 'btc'; })[0];
      t.ok(btc.bip38 && /^6P/.test(btc.secrets[0].value), 'BIP38 key printed');
      t.ok(btc.secrets.every(function (s) { return s.labelKey !== 'lblWif'; }), 'no plain WIF printed');
      t.ok(/^1/.test(btc.address), 'legacy address for BIP38');
      var dec = await WG.bip38.decrypt(btc.secrets[0].value, 'Satoshi');
      t.equal(dec.address, btc.address, 'decrypts to the address');
      checkSet(t, set, coins);
    },
  });

  reg({
    id: 'gen.min-entropy-gate', group: 'generator', title: 'Generation refuses when the user has not contributed the minimum entropy',
    run: async function (t) {
      var refused = false;
      try { await WG.generator.generate({ mode: 'bip39', coins: ['btc'], pool: poolWith(10), minCreditedBits: 128 }); } catch (e) { refused = /not enough user entropy/.test(e.message); }
      t.ok(refused, 'refused');
    },
  });

  reg({
    id: 'gen.wipe', group: 'generator', title: 'wipe() zeroes every private key buffer',
    run: async function (t) {
      var set = await WG.generator.generate({ mode: 'single', coins: ['eth', 'sol'], pool: poolWith(128), minCreditedBits: 128 });
      var keys = set.results.map(function (r) { return r.privateKey; });
      set.wipe();
      keys.forEach(function (k) { t.ok(B.equal(k, new Uint8Array(32)), 'zeroed'); });
      t.equal(set.results.length, 0, 'results cleared');
    },
  });
})(window.WG);
