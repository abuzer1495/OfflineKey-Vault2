/*
 * js/secure/bip38.js   ->   WG.bip38
 *
 * PURPOSE
 *   BIP38 password-protected Bitcoin private keys ("6P..."), non-EC-multiply
 *   mode, as printed on classic paper wallets (bitaddress.org compatible):
 *
 *     address     = P2PKH address of the key (compressed or not)
 *     addresshash = SHA256d(address as ASCII)[0..4]
 *     d           = scrypt(NFC(password), salt = addresshash, N=16384, r=8, p=8, 64 bytes)
 *     eh1 = AES-256-ECB_enc(key = d[32..64], privkey[0..16]  xor d[0..16])
 *     eh2 = AES-256-ECB_enc(key = d[32..64], privkey[16..32] xor d[16..32])
 *     out = Base58Check( 0x01 0x42 || flag || addresshash || eh1 || eh2 )
 *           flag = 0xE0 (compressed) or 0xC0 (uncompressed)
 *
 *   decrypt() reverses it and checks the address hash, so the generator can
 *   prove a printed BIP38 string really decrypts to the shown key.
 *   scrypt is deliberately slow (~1-3 s); the async API keeps the page alive.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;
  var E = WG.encode;
  var secp = V.curves.secp256k1;

  var SCRYPT = { N: 16384, r: 8, p: 8, dkLen: 64 };

  /** P2PKH address string (Bitcoin mainnet) for a private key. */
  function addressOf(priv, compressed) {
    var pub = secp.getPublicKey(priv, compressed);
    return E.base58check(B.concat(new Uint8Array([0x00]), E.hash160(pub)));
  }

  /** scrypt-derived 64 bytes from password and address hash (async, reports progress 0..1). */
  function deriveKey(password, addresshash, onProgress) {
    return H.scryptAsync(B.utf8ToBytes(String(password).normalize('NFC')), addresshash,
      Object.assign({ onProgress: onProgress || function () {} }, SCRYPT));
  }

  /** AES-256-ECB without padding, one direction over 16-byte blocks. */
  function aes(key, data, decrypt) {
    var c = V.ciphers.aesEcb(key, { disablePadding: true });
    return decrypt ? c.decrypt(data) : c.encrypt(data);
  }

  function xor(a, b) {
    var out = new Uint8Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
    return out;
  }

  /**
   * Encrypt a private key.
   * @param {Uint8Array} priv  32 bytes
   * @param {string} password  non-empty
   * @param {boolean} [compressed=true]
   * @param {function} [onProgress]
   * @returns {Promise<{encrypted: string, address: string}>}
   */
  async function encrypt(priv, password, compressed, onProgress) {
    B.assertBytes(priv, 32, 'private key');
    if (!password) throw new Error('BIP38 password required');
    compressed = compressed !== false;
    var address = addressOf(priv, compressed);
    var addresshash = E.sha256d(B.utf8ToBytes(address)).slice(0, 4);
    var d = await deriveKey(password, addresshash, onProgress);
    var key = d.slice(32);
    var eh1 = aes(key, xor(priv.slice(0, 16), d.slice(0, 16)));
    var eh2 = aes(key, xor(priv.slice(16), d.slice(16, 32)));
    var out = E.base58check(B.concat(new Uint8Array([0x01, 0x42, compressed ? 0xe0 : 0xc0]), addresshash, eh1, eh2));
    B.wipe(d, key);
    return { encrypted: out, address: address };
  }

  /**
   * Decrypt a "6P..." string (non-EC-multiply only).
   * @returns {Promise<{privateKey: Uint8Array, compressed: boolean, address: string}>}
   */
  async function decrypt(encrypted, password, onProgress) {
    var raw = E.base58checkDecode(encrypted);
    if (raw.length !== 39 || raw[0] !== 0x01 || raw[1] !== 0x42) throw new Error('not a non-EC-multiply BIP38 key');
    var flag = raw[2];
    if (flag !== 0xe0 && flag !== 0xc0) throw new Error('unsupported BIP38 flag byte');
    var compressed = flag === 0xe0;
    var addresshash = raw.slice(3, 7);
    var d = await deriveKey(password, addresshash, onProgress);
    var key = d.slice(32);
    var priv = B.concat(xor(aes(key, raw.slice(7, 23), true), d.slice(0, 16)), xor(aes(key, raw.slice(23, 39), true), d.slice(16, 32)));
    B.wipe(d, key);
    var address = addressOf(priv, compressed);
    if (!B.equal(E.sha256d(B.utf8ToBytes(address)).slice(0, 4), addresshash)) throw new Error('wrong BIP38 password');
    return { privateKey: priv, compressed: compressed, address: address };
  }

  WG.define('bip38', { encrypt: encrypt, decrypt: decrypt, addressOf: addressOf });
})(window.WG, window.WGVendor);
