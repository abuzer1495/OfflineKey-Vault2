/*
 * js/secure/slip39.js   ->   WG.slip39
 *
 * PURPOSE
 *   SLIP-0039 Shamir's Secret-Sharing for mnemonic codes (Trezor-compatible).
 *   A master secret (16 or 32 bytes) is encrypted with an optional passphrase
 *   and split into N share mnemonics; any M of them recover it. The master
 *   secret is used directly as the BIP32 seed by compatible wallets.
 *
 *   This is a line-by-line port of the reference implementation
 *   trezor/python-shamir-mnemonic (shamir.py, share.py, cipher.py, rs1024.py),
 *   restricted to ONE group (group threshold 1, 1 group) for generation, while
 *   combine() accepts any valid multi-group set. Verified against all official
 *   vectors in tests/vectors/slip39.js.
 *
 * BUILDING BLOCKS
 *   - Feistel cipher, 4 rounds, round function
 *       PBKDF2-HMAC-SHA256(password = i || passphrase, salt = salt || R,
 *                          iterations = (10000 << e) / 4, length = |R|)
 *     salt = "shamir" || identifier (2 bytes BE), or empty for extendable backups
 *   - Shamir over GF(256) with polynomial x^8 + x^4 + x^3 + x + 1,
 *     secret at x = 255, digest share at x = 254 (HMAC-SHA256 digest, 4 bytes)
 *   - Mnemonic: 10-bit words: id(15) ext(1) e(4) | GI(4) GT-1(4) GC-1(4) MI(4) MT-1(4)
 *     | padded share value | RS1024 checksum (3 words), customization
 *     "shamir" or "shamir_extendable".
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;

  var RADIX_BITS = 10;
  var RADIX = 1024;
  var ID_LENGTH_BITS = 15;
  var ITERATION_EXP_LENGTH_BITS = 4;
  var EXTENDABLE_FLAG_LENGTH_BITS = 1;
  var ID_EXP_LENGTH_WORDS = 2;
  var CHECKSUM_LENGTH_WORDS = 3;
  var DIGEST_LENGTH_BYTES = 4;
  var METADATA_LENGTH_WORDS = ID_EXP_LENGTH_WORDS + 2 + CHECKSUM_LENGTH_WORDS;   // 7
  var MIN_STRENGTH_BITS = 128;
  var MIN_MNEMONIC_LENGTH_WORDS = METADATA_LENGTH_WORDS + Math.ceil(MIN_STRENGTH_BITS / RADIX_BITS);   // 20
  var BASE_ITERATION_COUNT = 10000;
  var ROUND_COUNT = 4;
  var SECRET_INDEX = 255;
  var DIGEST_INDEX = 254;
  var MAX_SHARE_COUNT = 16;

  /** Error type matching the reference implementation's MnemonicError. */
  function MnemonicError(msg) { var e = new Error(msg); e.name = 'MnemonicError'; return e; }

  /** ASCII bytes of a customization string. */
  function customization(extendable) {
    return B.utf8ToBytes(extendable ? 'shamir_extendable' : 'shamir');
  }

  // ---- RS1024 checksum ------------------------------------------------------
  var GEN = [0xE0E040, 0x1C1C080, 0x3838100, 0x7070200, 0xE0E0009, 0x1C0C2412, 0x38086C24, 0x3090FC48, 0x21B1F890, 0x3F3F120];

  function polymod(values) {
    var chk = 1;
    for (var k = 0; k < values.length; k++) {
      var b = chk >>> 20;
      chk = (((chk & 0xFFFFF) << 10) ^ values[k]) >>> 0;
      for (var i = 0; i < 10; i++) if ((b >>> i) & 1) chk = (chk ^ GEN[i]) >>> 0;
    }
    return chk;
  }

  function createChecksum(data, extendable) {
    var values = Array.from(customization(extendable)).concat(data, [0, 0, 0]);
    var pm = (polymod(values) ^ 1) >>> 0;
    var out = [];
    for (var i = CHECKSUM_LENGTH_WORDS - 1; i >= 0; i--) out.push((pm >>> (10 * i)) & 1023);
    return out;
  }

  function verifyChecksum(data, extendable) {
    return polymod(Array.from(customization(extendable)).concat(data)) === 1;
  }

  // ---- Integer <-> word index conversion (BigInt, big endian base 1024) ------
  function intToIndices(value, length) {
    var out = [];
    for (var i = length - 1; i >= 0; i--) out.push(Number((value >> BigInt(i * RADIX_BITS)) & BigInt(1023)));
    return out;
  }
  function intFromIndices(indices) {
    var v = BigInt(0);
    indices.forEach(function (x) { v = v * BigInt(RADIX) + BigInt(x); });
    return v;
  }
  function bytesToBigInt(b) { return b.length ? BigInt('0x' + B.bytesToHex(b)) : BigInt(0); }
  function bigIntToBytes(v, len) {
    var hex = v.toString(16);
    if (hex.length > len * 2) return null;     // does not fit (padding error)
    return B.hexToBytes(hex.padStart(len * 2, '0'));
  }

  // ---- Feistel cipher ---------------------------------------------------------
  function salt(identifier, extendable) {
    if (extendable) return new Uint8Array(0);
    return B.concat(B.utf8ToBytes('shamir'), new Uint8Array([(identifier >>> 8) & 255, identifier & 255]));
  }
  function roundFunction(i, passphrase, e, s, r) {
    return H.pbkdf2(H.sha256, B.concat(new Uint8Array([i]), passphrase), B.concat(s, r),
      { c: Math.floor((BASE_ITERATION_COUNT << e) / ROUND_COUNT), dkLen: r.length });
  }
  function xor(a, b) {
    var out = new Uint8Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
    return out;
  }
  function feistel(data, passphrase, e, identifier, extendable, decrypt) {
    if (data.length % 2 !== 0) throw MnemonicError('The length of the master secret in bytes must be an even number.');
    var l = data.slice(0, data.length / 2), r = data.slice(data.length / 2);
    var s = salt(identifier, extendable);
    for (var k = 0; k < ROUND_COUNT; k++) {
      var i = decrypt ? ROUND_COUNT - 1 - k : k;
      var f = roundFunction(i, passphrase, e, s, r);
      var nl = r;
      r = xor(l, f);
      l = nl;
    }
    return B.concat(r, l);
  }

  // ---- GF(256) Shamir -------------------------------------------------------
  var EXP = new Array(255), LOG = new Array(256).fill(0);
  (function () {
    var poly = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = poly; LOG[poly] = i;
      poly = (poly << 1) ^ poly;          // multiply by (x + 1)
      if (poly & 0x100) poly ^= 0x11B;    // reduce by x^8 + x^4 + x^3 + x + 1
    }
  })();

  /** f(x) given shares [{x, data}] (Lagrange interpolation in GF(256)). */
  function interpolate(shares, x) {
    var xs = shares.map(function (s) { return s.x; });
    if (new Set(xs).size !== xs.length) throw MnemonicError('Invalid set of shares. Share indices must be unique.');
    var lens = new Set(shares.map(function (s) { return s.data.length; }));
    if (lens.size !== 1) throw MnemonicError('Invalid set of shares. All share values must have the same length.');
    for (var k = 0; k < shares.length; k++) if (shares[k].x === x) return shares[k].data;
    var logProd = 0;
    shares.forEach(function (s) { logProd += LOG[s.x ^ x]; });
    var result = new Uint8Array(shares[0].data.length);
    shares.forEach(function (s) {
      var sum = 0;
      shares.forEach(function (o) { sum += LOG[s.x ^ o.x]; });    // LOG[0] = 0 for o === s, as in the reference
      var logBasis = (((logProd - LOG[s.x ^ x] - sum) % 255) + 255) % 255;
      for (var i = 0; i < result.length; i++) {
        var v = s.data[i];
        result[i] ^= v !== 0 ? EXP[(LOG[v] + logBasis) % 255] : 0;
      }
    });
    return result;
  }

  function createDigest(randomData, sharedSecret) {
    return H.hmac(H.sha256, randomData, sharedSecret).slice(0, DIGEST_LENGTH_BYTES);
  }

  /** Split a secret into shareCount shares with the given threshold. randomBytes(n) supplies randomness. */
  function splitSecret(threshold, shareCount, secret, randomBytes) {
    if (threshold < 1) throw new Error('The requested threshold must be a positive integer.');
    if (threshold > shareCount) throw new Error('The requested threshold must not exceed the number of shares.');
    if (shareCount > MAX_SHARE_COUNT) throw new Error('The requested number of shares must not exceed ' + MAX_SHARE_COUNT + '.');
    var i;
    if (threshold === 1) {
      var same = [];
      for (i = 0; i < shareCount; i++) same.push({ x: i, data: secret });
      return same;
    }
    var randomShareCount = threshold - 2;
    var shares = [];
    for (i = 0; i < randomShareCount; i++) shares.push({ x: i, data: randomBytes(secret.length) });
    var randomPart = randomBytes(secret.length - DIGEST_LENGTH_BYTES);
    var digest = createDigest(randomPart, secret);
    var baseShares = shares.concat([{ x: DIGEST_INDEX, data: B.concat(digest, randomPart) }, { x: SECRET_INDEX, data: secret }]);
    for (i = randomShareCount; i < shareCount; i++) shares.push({ x: i, data: interpolate(baseShares, i) });
    return shares;
  }

  function recoverSecret(threshold, shares) {
    if (threshold === 1) return shares[0].data;
    var sharedSecret = interpolate(shares, SECRET_INDEX);
    var digestShare = interpolate(shares, DIGEST_INDEX);
    var digest = digestShare.slice(0, DIGEST_LENGTH_BYTES);
    var randomPart = digestShare.slice(DIGEST_LENGTH_BYTES);
    if (!B.equal(digest, createDigest(randomPart, sharedSecret))) throw MnemonicError('Invalid digest of the shared secret.');
    return sharedSecret;
  }

  // ---- Share <-> mnemonic -----------------------------------------------------
  function wordIndex() {
    var map = {};
    WG.slip39Wordlist.forEach(function (w, i) { map[w] = i; });
    return map;
  }

  /** Encode one share object as a mnemonic string. */
  function shareToMnemonic(s) {
    var valueWordCount = Math.ceil(s.value.length * 8 / RADIX_BITS);
    var idExp = (BigInt(s.identifier) << BigInt(ITERATION_EXP_LENGTH_BITS + EXTENDABLE_FLAG_LENGTH_BITS)) +
      (BigInt(s.extendable ? 1 : 0) << BigInt(ITERATION_EXP_LENGTH_BITS)) + BigInt(s.iterationExponent);
    // Five 4-bit fields, 20 bits total = 2 words (see share.py _encode_share_params).
    var p = s.groupIndex;
    p = p * 16 + (s.groupThreshold - 1);
    p = p * 16 + (s.groupCount - 1);
    p = p * 16 + s.index;
    p = p * 16 + (s.memberThreshold - 1);
    var params = BigInt(p);
    var data = intToIndices(idExp, ID_EXP_LENGTH_WORDS).concat(intToIndices(params, 2), intToIndices(bytesToBigInt(s.value), valueWordCount));
    return data.concat(createChecksum(data, s.extendable)).map(function (i) { return WG.slip39Wordlist[i]; }).join(' ');
  }

  /** Decode one mnemonic into a share object (throws MnemonicError on any defect). */
  function mnemonicToShare(mnemonic, index) {
    var words = mnemonic.trim().toLowerCase().split(/\s+/);
    var data = words.map(function (w) {
      if (!Object.prototype.hasOwnProperty.call(index, w)) throw MnemonicError('Invalid mnemonic word "' + w + '".');
      return index[w];
    });
    if (data.length < MIN_MNEMONIC_LENGTH_WORDS) throw MnemonicError('Invalid mnemonic length. The length of each mnemonic must be at least ' + MIN_MNEMONIC_LENGTH_WORDS + ' words.');
    var paddingLen = (RADIX_BITS * (data.length - METADATA_LENGTH_WORDS)) % 16;
    if (paddingLen > 8) throw MnemonicError('Invalid mnemonic length.');
    var idExp = Number(intFromIndices(data.slice(0, ID_EXP_LENGTH_WORDS)));
    var identifier = idExp >> (EXTENDABLE_FLAG_LENGTH_BITS + ITERATION_EXP_LENGTH_BITS);
    var extendable = ((idExp >> ITERATION_EXP_LENGTH_BITS) & 1) === 1;
    var iterationExponent = idExp & ((1 << ITERATION_EXP_LENGTH_BITS) - 1);
    if (!verifyChecksum(data, extendable)) throw MnemonicError('Invalid mnemonic checksum.');
    var p = Number(intFromIndices(data.slice(ID_EXP_LENGTH_WORDS, ID_EXP_LENGTH_WORDS + 2)));
    var groupIndex = (p >> 16) & 15, groupThreshold = (p >> 12) & 15, groupCount = (p >> 8) & 15, idx = (p >> 4) & 15, memberThreshold = p & 15;
    if (groupCount < groupThreshold) throw MnemonicError('Invalid mnemonic. Group threshold cannot be greater than group count.');
    var valueData = data.slice(ID_EXP_LENGTH_WORDS + 2, data.length - CHECKSUM_LENGTH_WORDS);
    var valueByteCount = Math.ceil((RADIX_BITS * valueData.length - paddingLen) / 8);
    var value = bigIntToBytes(intFromIndices(valueData), valueByteCount);
    if (!value) throw MnemonicError('Invalid mnemonic padding.');
    return {
      identifier: identifier, extendable: extendable, iterationExponent: iterationExponent,
      groupIndex: groupIndex, groupThreshold: groupThreshold + 1, groupCount: groupCount + 1,
      index: idx, memberThreshold: memberThreshold + 1, value: value, mnemonic: words.join(' '),
    };
  }

  /** Passphrase must be printable ASCII (SLIP-39 requirement). */
  function passphraseBytes(passphrase) {
    var p = passphrase || '';
    if (!/^[\x20-\x7e]*$/.test(p)) throw new Error('The passphrase must contain only printable ASCII characters (code points 32-126).');
    return B.utf8ToBytes(p);
  }

  /**
   * Generate a single-group M-of-N share set.
   * @param {Uint8Array} masterSecret   16 or 32 bytes (from the entropy pool)
   * @param {{threshold:number, count:number, passphrase?:string, extendable?:boolean,
   *          iterationExponent?:number, randomBytes:function(n):Uint8Array}} opts
   *        randomBytes MUST be backed by the entropy pool (identifier and share randomness)
   * @returns {string[]} share mnemonics
   */
  function generate(masterSecret, opts) {
    if (masterSecret.length * 8 < MIN_STRENGTH_BITS || masterSecret.length % 2 !== 0) throw new Error('master secret must be at least 16 bytes and even');
    var m = opts.threshold, n = opts.count;
    if (m === 1 && n > 1) throw new Error('Creating multiple member shares with member threshold 1 is not allowed. Use 1-of-1 member sharing instead.');
    var e = opts.iterationExponent === undefined ? 1 : opts.iterationExponent;
    var extendable = opts.extendable !== false;
    var idBytes = opts.randomBytes(2);
    var identifier = ((idBytes[0] << 8) | idBytes[1]) & ((1 << ID_LENGTH_BITS) - 1);
    var ems = feistel(masterSecret, passphraseBytes(opts.passphrase), e, identifier, extendable, false);
    // One group: the group "split" with threshold 1 of 1 yields the EMS itself.
    var members = splitSecret(m, n, ems, opts.randomBytes);
    return members.map(function (s) {
      return shareToMnemonic({ identifier: identifier, extendable: extendable, iterationExponent: e,
        groupIndex: 0, groupThreshold: 1, groupCount: 1, index: s.x, memberThreshold: m, value: s.data });
    });
  }

  /**
   * Recover the master secret from share mnemonics (any valid group layout).
   * @param {string[]} mnemonics
   * @param {string} [passphrase]
   */
  function combine(mnemonics, passphrase) {
    if (!mnemonics || !mnemonics.length) throw MnemonicError('The list of mnemonics is empty.');
    var index = wordIndex();
    var groups = {};
    var common = null;
    var seen = {};
    mnemonics.forEach(function (mn) {
      var s = mnemonicToShare(mn, index);
      if (seen[s.mnemonic]) return;      // identical mnemonics count once (set semantics)
      seen[s.mnemonic] = true;
      var c = [s.identifier, s.extendable, s.iterationExponent, s.groupThreshold, s.groupCount].join('/');
      if (common === null) common = c;
      else if (common !== c) throw MnemonicError('Invalid set of mnemonics. All mnemonics must begin with the same 2 words, must have the same group threshold and the same group count.');
      var g = groups[s.groupIndex] || (groups[s.groupIndex] = []);
      if (g.length && g[0].memberThreshold !== s.memberThreshold) throw MnemonicError('Invalid set of mnemonics. The member_threshold parameters don\'t match.');
      g.push(s);
    });
    var groupIds = Object.keys(groups);
    var first = groups[groupIds[0]][0];
    if (groupIds.length < first.groupThreshold) throw MnemonicError('Insufficient number of mnemonic groups. The required number of groups is ' + first.groupThreshold + '.');
    if (groupIds.length !== first.groupThreshold) throw MnemonicError('Wrong number of mnemonic groups.');
    var groupShares = groupIds.map(function (gi) {
      var g = groups[gi];
      if (g.length !== g[0].memberThreshold) throw MnemonicError('Wrong number of mnemonics. Expected ' + g[0].memberThreshold + ' mnemonics, but ' + g.length + ' were provided.');
      return { x: Number(gi), data: recoverSecret(g[0].memberThreshold, g.map(function (s) { return { x: s.index, data: s.value }; })) };
    });
    var ems = recoverSecret(first.groupThreshold, groupShares);
    return feistel(ems, passphraseBytes(passphrase), first.iterationExponent, first.identifier, first.extendable, true);
  }

  WG.define('slip39', {
    generate: generate,
    combine: combine,
    /** Parse a share's metadata (for display: index, threshold) without combining. */
    describe: function (mnemonic) {
      var s = mnemonicToShare(mnemonic, wordIndex());
      return { index: s.index, memberThreshold: s.memberThreshold, groupIndex: s.groupIndex, identifier: s.identifier, words: s.mnemonic.split(' ').length };
    },
  });
})(window.WG, window.WGVendor);
