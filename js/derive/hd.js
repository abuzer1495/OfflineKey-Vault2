/*
 * js/derive/hd.js   ->   WG.hd
 *
 * PURPOSE
 *   Hierarchical deterministic key derivation for both curve families:
 *     secp256k1(seed, path)  BIP32 via @scure/bip32 (Bitcoin-family, ETH, TRX, XRP)
 *     slip10Ed25519(seed, path)  SLIP-0010 ed25519, hardened only (Solana, Stellar)
 *   plus account-level extended public keys for watch-only cards.
 *
 * PATHS
 *   "m/84'/0'/0'/0/0" style; ' or h marks a hardened index.
 *
 * SLIP-0010 (ed25519), implemented here because @scure/bip32 is secp256k1-only:
 *   I = HMAC-SHA512(key = "ed25519 seed", data = seed)          -> k = I[0..32], c = I[32..64]
 *   child i (hardened only): I = HMAC-SHA512(c, 0x00 || k || ser32(i | 2^31))
 *   public key = ed25519 public key of k (RFC 8032 key derivation)
 *   Verified against the official SLIP-0010 vectors in tests/.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;
  var HARDENED = 0x80000000;

  /** Parse "m/44'/0'/0'/0/0" into [{index, hardened}], rejecting anything malformed. */
  function parsePath(path) {
    if (typeof path !== 'string' || !/^m(\/\d+['h]?)*$/.test(path)) throw new Error('invalid derivation path ' + path);
    return path.split('/').slice(1).map(function (part) {
      var hardened = /['h]$/.test(part);
      var index = parseInt(part, 10);
      if (!(index >= 0 && index < HARDENED)) throw new Error('path index out of range in ' + path);
      return { index: index, hardened: hardened };
    });
  }

  /** Canonical "'" notation (accepts h). */
  function normPath(path) {
    return path.replace(/h/g, "'");
  }

  /**
   * BIP32 secp256k1 derivation.
   * @param {Uint8Array} seed  16..64 byte seed
   * @param {string} path
   * @param {{private:number, public:number}} [versions]  extended-key version bytes (xpub/zpub/...)
   * @returns HDKey (privateKey, publicKey (33 bytes), publicExtendedKey, ...)
   */
  function secp256k1(seed, path, versions) {
    var root = V.bip32.HDKey.fromMasterSeed(seed, versions);
    return root.derive(normPath(path));
  }

  /** 4-byte big-endian. */
  function ser32(i) {
    return new Uint8Array([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);
  }

  /**
   * SLIP-0010 ed25519 derivation (all levels must be hardened).
   * @returns {{privateKey: Uint8Array, chainCode: Uint8Array, publicKey: Uint8Array}}
   *          publicKey is the raw 32-byte ed25519 key (SLIP-0010 prints it with a 0x00 prefix)
   */
  function slip10Ed25519(seed, path) {
    B.assertBytes(seed, undefined, 'seed');
    var I = H.hmac(H.sha512, B.utf8ToBytes('ed25519 seed'), seed);
    var k = I.slice(0, 32), c = I.slice(32);
    parsePath(path).forEach(function (step) {
      if (!step.hardened) throw new Error('SLIP-0010 ed25519 supports hardened indices only: ' + path);
      var data = B.concat(new Uint8Array([0]), k, ser32((step.index | HARDENED) >>> 0));
      var J = H.hmac(H.sha512, c, data);
      B.wipe(k, I);
      I = J;
      k = J.slice(0, 32);
      c = J.slice(32);
    });
    B.wipe(I);
    return { privateKey: k, chainCode: c, publicKey: V.curves.ed25519.getPublicKey(k) };
  }

  WG.define('hd', {
    HARDENED: HARDENED,
    parsePath: parsePath,
    secp256k1: secp256k1,
    slip10Ed25519: slip10Ed25519,
    /** Extended-key version bytes for watch-only exports. */
    VERSIONS: Object.freeze({
      xpub: Object.freeze({ private: 0x0488ade4, public: 0x0488b21e }),   // BIP32 / BIP44 / BIP86
      zpub: Object.freeze({ private: 0x04b2430c, public: 0x04b24746 }),   // BIP84 native segwit
    }),
  });
})(window.WG, window.WGVendor);
