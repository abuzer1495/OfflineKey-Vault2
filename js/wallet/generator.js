/*
 * js/wallet/generator.js   ->   WG.generator
 *
 * PURPOSE
 *   Turns user settings + the entropy pool into a complete, self-verified
 *   wallet set. This is the only place where key material is created.
 *
 * MODES
 *   bip39   one BIP39 mnemonic (12/24 words, any language, optional passphrase)
 *           -> every selected BIP39-family coin. Optional "dice only" entropy.
 *   slip39  one master secret (128/256 bit) split into M-of-N SLIP-39 shares
 *           (optional passphrase encrypts it) -> master secret is the BIP32 seed.
 *           Cardano is not available (it needs BIP39 entropy).
 *   single  one independent random private key per coin (classic paper
 *           wallet), optional BIP38 password for Bitcoin (legacy address).
 *   Monero always gets its own 25-word seed, in every mode.
 *
 * VERIFICATION (a wallet is only returned if all checks pass)
 *   - the mnemonic / shares are decoded again and must give the same entropy
 *     / master secret (SLIP-39: first M and last M shares independently),
 *   - every address is derived a second time from the decoded backup,
 *   - every printed private key string is decoded and must match the key,
 *   - BIP38 strings are decrypted with the password and must match,
 *   - Monero mnemonics are decoded and must give the same address.
 *
 * SECURITY NOTES
 *   - Requires WG.selftest.requireHealthy() and the minimum credited user
 *     entropy chosen in the UI (pool.extract enforces both).
 *   - The passphrase is never stored in the returned set (only a flag).
 *   - wipe() zeroes every key buffer the set holds.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var C = WG.coins;
  var secp = V.curves.secp256k1;

  /** Draw a valid secp256k1 private key (retry on the ~2^-128 invalid case). */
  function secpKey(pool, purpose, min) {
    for (var i = 0; i < 8; i++) {
      var k = pool.extract(purpose, 32, { minCreditedBits: min });
      if (secp.utils.isValidSecretKey(k)) return k;
      B.wipe(k);
    }
    throw new Error('could not draw a valid secp256k1 key');
  }

  /** Decode a printed private key string back to raw bytes, per coin. */
  function decodeSecret(coinId, value) {
    switch (coinId) {
      case 'btc': case 'ltc': case 'doge': {
        var raw = WG.encode.base58checkDecode(value);    // version || key || 0x01
        if (raw.length !== 34 || raw[33] !== 1) throw new Error('unexpected WIF layout');
        return raw.slice(1, 33);
      }
      case 'eth': case 'trx': case 'xrp':
        return B.hexToBytes(value.replace(/^0x/, ''));
      case 'sol':
        return V.base.base58.decode(value).slice(0, 32);
      case 'xlm':
        return V.base.base32.decode(value + '='.repeat((8 - value.length % 8) % 8)).slice(1, 33);
      default:
        throw new Error('no secret decoder for ' + coinId);
    }
  }

  /** Check that a result's printed secret decodes to its raw key. */
  function verifyPrintedSecret(r, checks) {
    if (!r.privateKey || r.coin === 'xmr' || !r.secrets.length) return;
    var s = r.secrets[0];
    if (s.labelKey === 'lblBip38') return;     // verified separately (needs the password)
    var ok = B.equal(decodeSecret(r.coin, s.value), r.privateKey);
    checks.push({ what: r.symbol + ': printed private key decodes to the derived key', ok: ok });
    if (!ok) throw new Error('verification failed: printed key of ' + r.symbol);
  }

  /** Same coin list, derived again from a recovered seed: addresses must match. */
  function verifyRederive(results, ctx, checks, label) {
    results.forEach(function (r) {
      if (r.coin === 'xmr') return;
      var again = C.get(r.coin).fromSeed(Object.assign({}, ctx, { variant: r.variant }));
      var ok = again.address === r.address;
      checks.push({ what: r.symbol + ': ' + label, ok: ok });
      if (!ok) throw new Error('verification failed: ' + r.symbol + ' address differs after ' + label);
    });
  }

  /** Monero wallet from 32 bytes of key material, verified through its mnemonic. */
  function makeMonero(material, checks) {
    var r = C.get('xmr').fromKeyMaterial(material);
    B.wipe(material);
    var back = WG.monero.keysFromSpend(WG.monero.mnemonicDecode(r.mnemonic));
    var ok = back.address === r.address && B.equal(back.spend, r.privateKey);
    checks.push({ what: 'XMR: 25-word mnemonic decodes to the same keys and address', ok: ok });
    if (!ok) throw new Error('verification failed: Monero');
    return r;
  }

  /**
   * Generate a wallet set.
   * @param {object} s  settings:
   *   mode ('bip39'|'slip39'|'single'), coins [ids], variants {coinId: variantId},
   *   words (12|24), language, passphrase, diceOnly,
   *   slip39 {threshold, count, bytes (16|32)}, bip38 {enabled, password},
   *   minCreditedBits, pool (defaults to WG.entropy.pool), onProgress(text)
   * @returns {Promise<object>} the verified wallet set
   */
  async function generate(s) {
    WG.selftest.requireHealthy();
    var pool = s.pool || WG.entropy.pool;
    var min = s.minCreditedBits || 0;
    var progress = s.onProgress || function () {};
    var checks = [];
    var results = [];
    var set = { createdAt: new Date().toISOString(), mode: s.mode, language: s.language || 'english',
      hasPassphrase: !!s.passphrase, mnemonic: null, shares: null, slip39: null, diceOnly: false, results: results, checks: checks };
    var coins = s.coins.map(function (id) { return C.get(id); });
    var hd = coins.filter(function (c) { return c.family === 'bip39'; });
    var wantMonero = coins.some(function (c) { return c.id === 'xmr'; });
    if (!coins.length) throw new Error('select at least one coin');

    if (s.mode === 'bip39') {
      var nBytes = WG.bip39.WORDS_TO_BYTES[s.words || 24];
      if (!nBytes) throw new Error('unsupported word count');
      var entropy = s.diceOnly ? pool.extractDiceOnly(nBytes) : pool.extract('bip39-entropy', nBytes, { minCreditedBits: min });
      set.diceOnly = !!s.diceOnly;
      set.mnemonic = WG.bip39.entropyToMnemonic(entropy, set.language);
      var seed = WG.bip39.mnemonicToSeed(set.mnemonic, s.passphrase);
      progress('derive');
      hd.forEach(function (c) {
        results.push(c.fromSeed({ seed: seed, entropy: entropy, passphrase: s.passphrase || '', variant: s.variants && s.variants[c.id] }));
      });
      // Verify: decode the words again and re-derive everything from them.
      var entropy2 = WG.bip39.mnemonicToEntropy(set.mnemonic, set.language);
      var okEntropy = B.equal(entropy2, entropy) && WG.bip39.validate(set.mnemonic, set.language);
      checks.push({ what: 'BIP39: mnemonic checksum valid and decodes to the generated entropy', ok: okEntropy });
      if (!okEntropy) throw new Error('verification failed: BIP39 mnemonic');
      var wordsAgain = WG.bip39.words(set.mnemonic).join(set.language === 'japanese' ? '　' : ' ');
      verifyRederive(results, { seed: WG.bip39.mnemonicToSeed(wordsAgain, s.passphrase), entropy: entropy2, passphrase: s.passphrase || '' },
        checks, 'address re-derived from the written-down words');
      B.wipe(entropy, entropy2, seed);
    } else if (s.mode === 'slip39') {
      var cfg = s.slip39 || {};
      var ms = pool.extract('slip39-master-secret', cfg.bytes || 16, { minCreditedBits: min });
      set.shares = WG.slip39.generate(ms, {
        threshold: cfg.threshold, count: cfg.count, passphrase: s.passphrase || '',
        randomBytes: function (n) { return pool.extract('slip39-share-randomness', n, { minCreditedBits: min }); },
      });
      set.slip39 = { threshold: cfg.threshold, count: cfg.count, bits: (cfg.bytes || 16) * 8 };
      progress('derive');
      hd.forEach(function (c) {
        if (c.needsEntropy) return;      // Cardano: not available with SLIP-39
        results.push(c.fromSeed({ seed: ms, entropy: null, passphrase: '', variant: s.variants && s.variants[c.id] }));
      });
      // Verify: recover from the first M and from the last M shares.
      var first = WG.slip39.combine(set.shares.slice(0, cfg.threshold), s.passphrase || '');
      var last = WG.slip39.combine(set.shares.slice(set.shares.length - cfg.threshold), s.passphrase || '');
      var okShares = B.equal(first, ms) && B.equal(last, ms);
      checks.push({ what: 'SLIP-39: first ' + cfg.threshold + ' and last ' + cfg.threshold + ' shares both recover the master secret', ok: okShares });
      if (!okShares) throw new Error('verification failed: SLIP-39 shares');
      verifyRederive(results, { seed: first, entropy: null, passphrase: '' }, checks, 'address re-derived from recovered shares');
      B.wipe(ms, first, last);
    } else if (s.mode === 'single') {
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        if (c.family === 'monero') continue;
        if (!c.singleKey) continue;      // Cardano has no single-key mode
        var variant = s.variants && s.variants[c.id];
        var useBip38 = c.id === 'btc' && s.bip38 && s.bip38.enabled;
        if (useBip38) variant = 'p2pkh';  // BIP38 is defined for legacy P2PKH addresses
        var key = (c.id === 'sol' || c.id === 'xlm') ? pool.extract('single-' + c.id, 32, { minCreditedBits: min }) : secpKey(pool, 'single-' + c.id, min);
        var r = c.fromPrivateKey(key, variant);
        if (useBip38) {
          progress('bip38');
          var enc = await WG.bip38.encrypt(key, s.bip38.password, true);
          var dec = await WG.bip38.decrypt(enc.encrypted, s.bip38.password);
          var okBip38 = B.equal(dec.privateKey, key) && dec.address === r.address && enc.address === r.address;
          checks.push({ what: 'BTC: BIP38 key decrypts with the password to the same key and address', ok: okBip38 });
          if (!okBip38) throw new Error('verification failed: BIP38');
          B.wipe(dec.privateKey);
          // The paper wallet carries ONLY the encrypted key, never the plain WIF.
          r = Object.freeze(Object.assign({}, r, { secrets: [{ labelKey: 'lblBip38', value: enc.encrypted, qr: true }], bip38: true }));
        }
        results.push(r);
      }
    } else {
      throw new Error('unknown mode ' + s.mode);
    }

    if (wantMonero) {
      progress('monero');
      results.push(makeMonero(pool.extract('monero-spend-key', 32, { minCreditedBits: min }), checks));
    }
    results.forEach(function (r) { verifyPrintedSecret(r, checks); });

    /** Zero every key buffer this set references. */
    set.wipe = function () {
      results.forEach(function (r) { if (r.privateKey) B.wipe(r.privateKey); });
      results.length = 0;
      set.mnemonic = null;
      set.shares = null;
    };
    return set;
  }

  WG.define('generator', { generate: generate, decodeSecret: decodeSecret });
})(window.WG, window.WGVendor);
