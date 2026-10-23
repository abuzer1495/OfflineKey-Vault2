/*
 * js/coins/monero.js   ->   WG.monero  (+ registers coin "xmr")
 *
 * PURPOSE
 *   Monero standard wallet, compatible with Monero GUI/CLI, Feather and Cake:
 *     spend   = sc_reduce32(32 random bytes)            (private spend key)
 *     view    = sc_reduce32(Keccak-256(spend))           (private view key)
 *     Pspend  = spend * G,  Pview = view * G             (ed25519 points)
 *     address = base58xmr( 0x12 || Pspend || Pview || Keccak-256(...)[0..4] )   mainnet
 *   sc_reduce32 = little-endian integer mod l, l = 2^252 + 27742317777372353535851937790883648493.
 *
 *   25-word mnemonic (Electrum-style, English list, unique prefix 3):
 *     for each 4-byte little-endian chunk x of the spend key (n = 1626):
 *       w1 = x mod n ; w2 = (x div n + w1) mod n ; w3 = (x div n^2 + w2) mod n
 *     checksum word = word[ CRC32(concat of the first 3 letters of all 24 words) mod 24 ]
 *
 *   Monero does NOT use BIP39; its seed is independent of the shared seed.
 *   Verified against the Monero project's own functional-test wallets in tests/.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var U = V.curves.utils;
  var Point = V.curves.ed25519.Point;
  var keccak = V.hashes.keccak_256;
  var L = (BigInt(1) << BigInt(252)) + BigInt('27742317777372353535851937790883648493');

  /** CRC-32 (IEEE 802.3, reflected, poly 0xEDB88320) table, built once. */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  /** CRC-32 of a byte array; crc32(utf8("123456789")) = 0xCBF43926. */
  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** sc_reduce32: 32 bytes little-endian -> value mod l -> 32 bytes little-endian. */
  function scReduce32(bytes32) {
    B.assertBytes(bytes32, 32, 'scalar');
    return U.numberToBytesLE(U.bytesToNumberLE(bytes32) % L, 32);
  }

  /** Scalar (32 bytes LE, already reduced) times the base point. */
  function scalarMultBase(sc) {
    var n = U.bytesToNumberLE(sc);
    if (n === BigInt(0) || n >= L) throw new Error('invalid Monero scalar');
    return Point.BASE.multiply(n).toBytes();
  }

  /** Mainnet standard address from the two public keys. */
  function address(pubSpend, pubView) {
    var data = B.concat(new Uint8Array([0x12]), pubSpend, pubView);
    return V.base.base58xmr.encode(B.concat(data, keccak(data).slice(0, 4)));
  }

  /** All keys and the address for a private spend key. */
  function keysFromSpend(spend) {
    var view = scReduce32(keccak(spend));
    var pubSpend = scalarMultBase(spend);
    var pubView = scalarMultBase(view);
    return { spend: spend, view: view, pubSpend: pubSpend, pubView: pubView, address: address(pubSpend, pubView) };
  }

  /** Checksum word index for 24 data words. */
  function checksumIndex(words, prefixLen) {
    var prefixes = words.map(function (w) { return Array.from(w).slice(0, prefixLen).join(''); }).join('');
    return crc32(B.utf8ToBytes(prefixes)) % words.length;
  }

  /** Encode a 32-byte spend key as 25 words. */
  function mnemonicEncode(spend) {
    B.assertBytes(spend, 32, 'spend key');
    var list = WG.moneroWordlist.words;
    var n = list.length;
    var words = [];
    for (var i = 0; i < 32; i += 4) {
      var x = (spend[i] | (spend[i + 1] << 8) | (spend[i + 2] << 16) | (spend[i + 3] << 24)) >>> 0;
      var w1 = x % n;
      var w2 = (Math.floor(x / n) + w1) % n;
      var w3 = (Math.floor(Math.floor(x / n) / n) + w2) % n;
      words.push(list[w1], list[w2], list[w3]);
    }
    words.push(words[checksumIndex(words, WG.moneroWordlist.prefixLength)]);
    return words.join(' ');
  }

  /** Decode 25 words back to the spend key (throws on unknown words or bad checksum). */
  function mnemonicDecode(phrase) {
    var list = WG.moneroWordlist.words;
    var prefixLen = WG.moneroWordlist.prefixLength;
    var n = list.length;
    var words = phrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 25) throw new Error('Monero mnemonic must have 25 words');
    // Monero matches words by their unique 3-letter prefix.
    var byPrefix = {};
    list.forEach(function (w, i) { byPrefix[w.slice(0, prefixLen)] = i; });
    var idx = words.map(function (w) {
      var i = byPrefix[w.slice(0, prefixLen)];
      if (i === undefined) throw new Error('unknown Monero word: ' + w);
      return i;
    });
    var data = words.slice(0, 24);
    if (data[checksumIndex(data, prefixLen)].slice(0, prefixLen) !== words[24].slice(0, prefixLen)) {
      throw new Error('Monero mnemonic checksum mismatch');
    }
    var out = new Uint8Array(32);
    for (var j = 0; j < 8; j++) {
      var w1 = idx[3 * j], w2 = idx[3 * j + 1], w3 = idx[3 * j + 2];
      var x = w1 + n * (((w2 - w1) % n + n) % n) + n * n * (((w3 - w2) % n + n) % n);
      if (x % n !== w1 || x > 0xffffffff) throw new Error('invalid Monero mnemonic');
      out[4 * j] = x & 255; out[4 * j + 1] = (x >>> 8) & 255; out[4 * j + 2] = (x >>> 16) & 255; out[4 * j + 3] = (x >>> 24) & 255;
    }
    return out;
  }

  WG.define('monero', {
    L: L,
    crc32: crc32,
    scReduce32: scReduce32,
    keysFromSpend: keysFromSpend,
    address: address,
    mnemonicEncode: mnemonicEncode,
    mnemonicDecode: mnemonicDecode,
  });

  var coin = {
    id: 'xmr', name: 'Monero', symbol: 'XMR', order: 100, family: 'monero',
    variants: [{ id: 'standard', labelKey: 'varMoneroStandard', path: null }], defaultVariant: 'standard',
    singleKey: true,
    wallets: 'Monero GUI/CLI, Feather, Cake Wallet, Monerujo',
    notes: ['noteMoneroRestoreHeight'],
    /**
     * Build the wallet from 32 bytes of key material (reduced to a valid spend key).
     * @param {Uint8Array} material  32 bytes from the entropy pool (or dice)
     */
    fromKeyMaterial: function (material) {
      var spend = scReduce32(material);
      var k = keysFromSpend(spend);
      var mnemonic = mnemonicEncode(spend);
      return WG.coins.result(coin, coin.variants[0], {
        address: k.address,
        privateKey: spend,
        mnemonic: mnemonic,
        secrets: [
          { labelKey: 'lblMoneroMnemonic', value: mnemonic, qr: true },
          { labelKey: 'lblSpendKey', value: B.bytesToHex(spend), qr: true },
        ],
        publics: [{ labelKey: 'lblAddress', value: k.address, qr: true }],
        watch: [{ labelKey: 'lblViewKey', value: B.bytesToHex(k.view), qr: true }],
      });
    },
  };
  coin.fromPrivateKey = coin.fromKeyMaterial;
  WG.coins.register(coin);
})(window.WG, window.WGVendor);
