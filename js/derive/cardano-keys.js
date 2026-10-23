/*
 * js/derive/cardano-keys.js   ->   WG.cardanoKeys
 *
 * PURPOSE
 *   Cardano Shelley key derivation (the scheme used by Yoroi, Eternl, Daedalus
 *   and Trezor for 12/15/18/21-word mnemonics):
 *
 *   Icarus master key (CIP-3):
 *     xprv = PBKDF2-HMAC-SHA512(password = passphrase, salt = BIP39 entropy,
 *                               iterations = 4096, length = 96)
 *     xprv[0]  &= 0xf8 ; xprv[31] &= 0x1f ; xprv[31] |= 0x40
 *     layout: kL (32) || kR (32) || chain code (32)
 *
 *   BIP32-Ed25519 child derivation (Khovratovich/Law "V2", little-endian index):
 *     hardened i: Z = HMAC512(c, 0x00 || kL || kR || le32(i)),  c' = HMAC512(c, 0x01 || kL || kR || le32(i))[32..]
 *     soft i:     Z = HMAC512(c, 0x02 || A  || le32(i)),        c' = HMAC512(c, 0x03 || A  || le32(i))[32..]
 *     kL' = 8 * int_le(Z[0..28]) + int_le(kL)      kR' = (int_le(Z[32..64]) + int_le(kR)) mod 2^256
 *     A   = int_le(kL) * G  (ed25519 base point, no clamping/hashing)
 *
 * NOTE
 *   For 24-word mnemonics Trezor historically used a different master-key
 *   derivation ("ICARUS_TREZOR"); this module implements the standard Icarus
 *   scheme used by software wallets. The UI tells users which wallets match.
 *   Verified against CIP-3 vectors and Trezor fixtures in tests/.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;
  var U = V.curves.utils;
  var Point = V.curves.ed25519.Point;
  var N = Point.Fn.ORDER;            // ed25519 group order
  var TWO256 = BigInt(1) << BigInt(256);

  /** Little-endian 4-byte encoding of a derivation index. */
  function le32(i) {
    return new Uint8Array([i & 255, (i >>> 8) & 255, (i >>> 16) & 255, (i >>> 24) & 255]);
  }

  /**
   * CIP-3 Icarus master key from BIP39 entropy.
   * @param {Uint8Array} entropy    BIP39 entropy (NOT the 64-byte BIP39 seed)
   * @param {string} [passphrase]   optional BIP39 passphrase (UTF-8)
   * @returns {Uint8Array} 96 bytes  kL || kR || chainCode
   */
  function icarusMaster(entropy, passphrase) {
    B.assertBytes(entropy, undefined, 'entropy');
    var x = H.pbkdf2(H.sha512, B.utf8ToBytes(passphrase || ''), entropy, { c: 4096, dkLen: 96 });
    x[0] &= 0xf8;
    x[31] &= 0x1f;
    x[31] |= 0x40;
    return x;
  }

  /** Public key A = kL * G for an extended private key. */
  function publicKey(xprv) {
    var scalar = U.bytesToNumberLE(xprv.slice(0, 32)) % N;
    if (scalar === BigInt(0)) throw new Error('invalid Cardano key (zero scalar)');
    return Point.BASE.multiply(scalar).toBytes();
  }

  /** One child derivation step. */
  function deriveChild(xprv, index) {
    var kL = xprv.slice(0, 32), kR = xprv.slice(32, 64), c = xprv.slice(64, 96);
    var hardened = index >= WG.hd.HARDENED;
    var zData, cData;
    if (hardened) {
      zData = B.concat(new Uint8Array([0x00]), kL, kR, le32(index));
      cData = B.concat(new Uint8Array([0x01]), kL, kR, le32(index));
    } else {
      var A = publicKey(xprv);
      zData = B.concat(new Uint8Array([0x02]), A, le32(index));
      cData = B.concat(new Uint8Array([0x03]), A, le32(index));
    }
    var Z = H.hmac(H.sha512, c, zData);
    var cc = H.hmac(H.sha512, c, cData).slice(32);
    var zl = U.bytesToNumberLE(Z.slice(0, 28));
    var zr = U.bytesToNumberLE(Z.slice(32, 64));
    var newKL = BigInt(8) * zl + U.bytesToNumberLE(kL);
    if (newKL >= TWO256) throw new Error('Cardano derivation overflow');
    var newKR = (zr + U.bytesToNumberLE(kR)) % TWO256;
    var out = B.concat(U.numberToBytesLE(newKL, 32), U.numberToBytesLE(newKR, 32), cc);
    B.wipe(Z, kL, kR, zData, cData);
    return out;
  }

  /**
   * Derive along a path from an Icarus master key.
   * @param {Uint8Array} master  96-byte xprv
   * @param {string} path        e.g. "m/1852'/1815'/0'/0/0"
   * @returns {{xprv: Uint8Array, publicKey: Uint8Array, chainCode: Uint8Array}}
   */
  function derive(master, path) {
    var x = master.slice();
    WG.hd.parsePath(path).forEach(function (step) {
      var next = deriveChild(x, step.hardened ? (step.index + WG.hd.HARDENED) >>> 0 : step.index);
      B.wipe(x);
      x = next;
    });
    return { xprv: x, publicKey: publicKey(x), chainCode: x.slice(64, 96) };
  }

  WG.define('cardanoKeys', {
    icarusMaster: icarusMaster,
    derive: derive,
    publicKey: publicKey,
  });
})(window.WG, window.WGVendor);
