/*
 * js/coins/encode.js   ->   WG.encode
 *
 * PURPOSE
 *   Address and key encodings shared by the coin modules. Every function is
 *   small and maps 1:1 to a published specification:
 *     hash160            RIPEMD160(SHA256(x))                         (Bitcoin)
 *     base58check        payload || SHA256d(payload)[0..4], Bitcoin alphabet
 *     base58checkXrp     same checksum, XRP alphabet ("rpshnaf39w...")
 *     p2pkh / wif        Base58Check with a version byte (BIP13 / WIF)
 *     p2wpkh             BIP173 bech32, witness v0, 20-byte program
 *     p2tr               BIP341/BIP86 key-path-only output, bech32m (BIP350)
 *     eip55              EIP-55 mixed-case checksummed Ethereum address
 *     strkey             Stellar StrKey: base32(version || data || CRC16-XModem LE)
 *     bech32Long         bech32 without the 90-char limit (CIP-19 Cardano addresses)
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;
  var base = V.base;
  var secp = V.curves.secp256k1;
  var schnorr = V.curves.schnorr;
  var U = V.curves.utils;

  /** SHA256(SHA256(x)). */
  function sha256d(x) { return H.sha256(H.sha256(x)); }

  /** RIPEMD160(SHA256(x)) - the 20-byte "HASH160". */
  function hash160(x) { return H.ripemd160(H.sha256(x)); }

  var b58c = base.createBase58check(H.sha256);

  /** Base58Check (Bitcoin alphabet). */
  function base58check(payload) { return b58c.encode(payload); }

  /** Decode Base58Check, verifying the checksum. */
  function base58checkDecode(str) { return b58c.decode(str); }

  /** Base58Check with the XRP alphabet (same double-SHA256 checksum). */
  function base58checkXrp(payload) {
    return base.base58xrp.encode(B.concat(payload, sha256d(payload).slice(0, 4)));
  }

  /** Legacy pay-to-pubkey-hash address with a one-byte version (0x00 BTC, 0x30 LTC, 0x1e DOGE). */
  function p2pkh(pubkey33, version) {
    return base58check(B.concat(new Uint8Array([version]), hash160(pubkey33)));
  }

  /** Wallet Import Format for a compressed-key private key (0x80 BTC, 0xb0 LTC, 0x9e DOGE). */
  function wif(priv32, version, compressed) {
    B.assertBytes(priv32, 32, 'private key');
    var parts = [new Uint8Array([version]), priv32];
    if (compressed !== false) parts.push(new Uint8Array([0x01]));
    return base58check(B.concat.apply(null, parts));
  }

  /** Native segwit v0 P2WPKH address (BIP173), e.g. hrp "bc" or "ltc". */
  function p2wpkh(pubkey33, hrp) {
    return base.bech32.encode(hrp, [0].concat(base.bech32.toWords(hash160(pubkey33))));
  }

  /**
   * BIP86 key-path-only Taproot output key and address.
   * Q = lift_x(P) + int(taggedHash("TapTweak", P)) * G ; address = bech32m(hrp, [1] || x(Q))
   * @param {Uint8Array} pubkey33  compressed internal public key
   */
  function p2tr(pubkey33, hrp) {
    var internal = pubkey33.slice(1);                         // x-only internal key
    var P = schnorr.utils.lift_x(U.bytesToNumberBE(internal)); // even-y point
    var t = U.bytesToNumberBE(schnorr.utils.taggedHash('TapTweak', internal));
    if (t >= secp.Point.Fn.ORDER) throw new Error('taproot tweak out of range');
    var Q = P.add(secp.Point.BASE.multiply(t));
    var outputKey = Q.toBytes(true).slice(1);
    return {
      internalKey: internal,
      outputKey: outputKey,
      address: base.bech32m.encode(hrp, [1].concat(base.bech32m.toWords(outputKey))),
    };
  }

  /** 20-byte Ethereum account id from a public key: keccak256(uncompressed[1..])[12..]. */
  function ethAccountId(pubkey) {
    var full = secp.Point.fromBytes(pubkey).toBytes(false);   // 65 bytes, 0x04 || X || Y
    return H.keccak_256(full.slice(1)).slice(12);
  }

  /** EIP-55 checksummed "0x..." address. */
  function eip55(accountId20) {
    var hex = B.bytesToHex(accountId20);
    var hash = B.bytesToHex(H.keccak_256(B.utf8ToBytes(hex)));
    var out = '0x';
    for (var i = 0; i < hex.length; i++) {
      out += parseInt(hash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
    }
    return out;
  }

  /** CRC16-XModem (poly 0x1021, init 0) used by Stellar StrKey. */
  function crc16xmodem(bytes) {
    var crc = 0;
    for (var i = 0; i < bytes.length; i++) {
      crc ^= bytes[i] << 8;
      for (var j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  }

  /**
   * Stellar StrKey.
   * @param {number} versionByte  6<<3 = 48 for account ids ("G..."), 18<<3 = 144 for secret seeds ("S...")
   */
  function strkey(versionByte, data32) {
    var payload = B.concat(new Uint8Array([versionByte]), data32);
    var crc = crc16xmodem(payload);
    return base.base32.encode(B.concat(payload, new Uint8Array([crc & 255, crc >>> 8]))).replace(/=+$/, '');
  }

  /** bech32 (not bech32m) with no length limit, for long Cardano addresses/keys. */
  function bech32Long(hrp, bytes) {
    return base.bech32.encode(hrp, base.bech32.toWords(bytes), false);
  }

  WG.define('encode', {
    sha256d: sha256d,
    hash160: hash160,
    base58check: base58check,
    base58checkDecode: base58checkDecode,
    base58checkXrp: base58checkXrp,
    p2pkh: p2pkh,
    wif: wif,
    p2wpkh: p2wpkh,
    p2tr: p2tr,
    ethAccountId: ethAccountId,
    eip55: eip55,
    crc16xmodem: crc16xmodem,
    strkey: strkey,
    bech32Long: bech32Long,
  });
})(window.WG, window.WGVendor);
