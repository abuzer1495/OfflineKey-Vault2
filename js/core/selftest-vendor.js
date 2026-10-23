/*
 * js/core/selftest-vendor.js
 *
 * PURPOSE
 *   Known-answer tests for every third-party primitive exposed by
 *   vendor/wg-crypto.js, plus checks of the browser CSPRNG and of the
 *   read-only protection of the vendor global. Expected values come from the
 *   published standards (FIPS, RFCs, BIPs), NOT from running the library,
 *   so a wrong, outdated or tampered bundle fails here.
 *
 *   Tests flagged `critical: true` run on every start of index.html and gate
 *   key generation (see WG.selftest.requireHealthy). Slow tests are
 *   non-critical and only run in tests/test.html.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;
  var reg = WG.selftest.register;
  var u8 = B.utf8ToBytes;
  var hx = B.hexToBytes;

  /** Bytes 0x00, 0x01, ... (n-1): a common RFC test pattern. */
  function seq(n, start) {
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = (start || 0) + i;
    return out;
  }

  // ---- Environment ---------------------------------------------------------

  reg({
    id: 'env.csprng', group: 'environment', critical: true,
    title: 'crypto.getRandomValues exists and returns non-repeating data',
    run: function (t) {
      t.ok(window.crypto && typeof window.crypto.getRandomValues === 'function', 'Web Crypto CSPRNG available');
      var a = new Uint8Array(32), b = new Uint8Array(32);
      window.crypto.getRandomValues(a);
      window.crypto.getRandomValues(b);
      t.ok(!B.equal(a, new Uint8Array(32)), 'random output is not all zero');
      t.ok(!B.equal(a, b), 'two random draws differ');
    },
  });

  reg({
    id: 'env.bigint', group: 'environment', critical: true,
    title: 'BigInt arithmetic available (required by noble curves)',
    run: function (t) {
      t.ok(typeof BigInt === 'function', 'BigInt exists');
      t.equal((BigInt(2) ** BigInt(255) - BigInt(19)).toString(16).length, 64, '2^255-19 has 64 hex digits');
    },
  });

  reg({
    id: 'env.vendor-locked', group: 'environment', critical: true,
    title: 'WGVendor global and its groups are read-only',
    run: function (t) {
      var d = Object.getOwnPropertyDescriptor(window, 'WGVendor');
      t.ok(d && !d.writable && !d.configurable, 'window.WGVendor is non-writable and non-configurable');
      ['curves', 'hashes', 'ciphers', 'bip32', 'bip39', 'versions'].forEach(function (k) {
        t.ok(Object.isFrozen(V[k]), 'WGVendor.' + k + ' is frozen');
      });
      t.ok(Object.isFrozen(V), 'WGVendor is frozen');
      t.ok(!('generateMnemonic' in V.bip39), 'library-internal mnemonic RNG is not exposed');
    },
  });

  reg({
    id: 'env.output-libs', group: 'environment', critical: true,
    title: 'PDF, QR and font libraries are loaded (jsPDF, qrcode-generator, DejaVu font)',
    run: function (t) {
      // A script blocked by the CSP or missing from the folder would otherwise
      // only show up after the wallet was generated, when the PDF is built.
      t.ok(window.jspdf && typeof window.jspdf.jsPDF === 'function', 'vendor/jspdf.umd.js');
      t.ok(typeof window.qrcode === 'function', 'vendor/qrcode.js');
      t.ok(window.WGFonts && window.WGFonts.mono && window.WGFonts.monoBold, 'vendor/dejavu-fonts.js');
    },
  });

  reg({
    id: 'env.csp-meta', group: 'environment', critical: true,
    title: 'Page declares the network kill-switch CSP (connect-src and form-action \'none\')',
    run: function (t) {
      var meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      t.ok(meta, 'CSP <meta> present');
      // Parse "directive value; directive value" into a map for exact checks.
      var policy = {};
      String(meta.getAttribute('content')).split(';').forEach(function (part) {
        var tokens = part.trim().split(/\s+/);
        if (tokens[0]) policy[tokens[0].toLowerCase()] = tokens.slice(1).join(' ');
      });
      t.equal(policy['default-src'], "'none'", 'default-src');
      t.equal(policy['connect-src'], "'none'", 'connect-src');
      t.equal(policy['form-action'], "'none'", 'form-action');
      // 'self' (multi-file edition) or only exact hashes of the inlined scripts
      // (single-file edition); never unsafe-inline, unsafe-eval or remote hosts.
      var scriptSrc = policy['script-src'] || '';
      t.ok(scriptSrc === "'self'" || /^('sha256-[A-Za-z0-9+/]+=*'\s*)+$/.test(scriptSrc.trim()), "script-src is 'self' or hashes only: " + scriptSrc.slice(0, 40));
    },
  });

  // ---- Hashes --------------------------------------------------------------

  reg({
    id: 'hash.sha256', group: 'hashes', critical: true, title: 'SHA-256("abc") — FIPS 180-4',
    run: function (t) { t.equalHex(H.sha256(u8('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); },
  });

  reg({
    id: 'hash.sha512', group: 'hashes', critical: true, title: 'SHA-512("abc") — FIPS 180-4',
    run: function (t) {
      t.equalHex(H.sha512(u8('abc')),
        'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
    },
  });

  reg({
    id: 'hash.keccak256', group: 'hashes', critical: true,
    title: 'Keccak-256("") — original Keccak padding used by Ethereum/Monero',
    run: function (t) { t.equalHex(H.keccak_256(new Uint8Array(0)), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'); },
  });

  reg({
    id: 'hash.sha3-256', group: 'hashes', critical: true,
    title: 'SHA3-256("") — must differ from Keccak-256 (padding check)',
    run: function (t) { t.equalHex(H.sha3_256(new Uint8Array(0)), 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'); },
  });

  reg({
    id: 'hash.ripemd160', group: 'hashes', critical: true, title: 'RIPEMD-160("" and "abc")',
    run: function (t) {
      t.equalHex(H.ripemd160(new Uint8Array(0)), '9c1185a5c5e9fc54612808977ee8f548b2258d31', 'empty');
      t.equalHex(H.ripemd160(u8('abc')), '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc', 'abc');
    },
  });

  reg({
    id: 'hash.blake2b', group: 'hashes', critical: true, title: 'BLAKE2b-512("abc") — RFC 7693 Appendix A',
    run: function (t) {
      t.equalHex(H.blake2b(u8('abc')),
        'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
    },
  });

  // ---- MAC / KDF -----------------------------------------------------------

  reg({
    id: 'kdf.hmac-sha256', group: 'kdf', critical: true, title: 'HMAC-SHA256 — RFC 4231 test case 2',
    run: function (t) {
      t.equalHex(H.hmac(H.sha256, u8('Jefe'), u8('what do ya want for nothing?')),
        '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    },
  });

  reg({
    id: 'kdf.hkdf-sha256', group: 'kdf', critical: true, title: 'HKDF-SHA256 — RFC 5869 test case 1',
    run: function (t) {
      var ikm = new Uint8Array(22).fill(0x0b);
      var salt = seq(13);           // 0x00..0x0c
      var info = seq(10, 0xf0);     // 0xf0..0xf9
      t.equalHex(H.hkdf(H.sha256, ikm, salt, info, 42),
        '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
    },
  });

  reg({
    id: 'kdf.pbkdf2-sha256', group: 'kdf', critical: true, title: 'PBKDF2-HMAC-SHA256("password","salt",c=1)',
    run: function (t) {
      t.equalHex(H.pbkdf2(H.sha256, u8('password'), u8('salt'), { c: 1, dkLen: 32 }),
        '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    },
  });

  reg({
    id: 'kdf.scrypt', group: 'kdf', critical: false, title: 'scrypt — RFC 7914 vector 2 (N=1024, r=8, p=16; slow)',
    run: function (t) {
      t.equalHex(H.scrypt(u8('password'), u8('NaCl'), { N: 1024, r: 8, p: 16, dkLen: 64 }),
        'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640');
    },
  });

  // ---- Cipher --------------------------------------------------------------

  reg({
    id: 'cipher.aes128-ecb', group: 'cipher', critical: true, title: 'AES-128 single block — FIPS 197 Appendix C.1',
    run: function (t) {
      var aes = V.ciphers.aesEcb(seq(16), { disablePadding: true });
      t.equalHex(aes.encrypt(hx('00112233445566778899aabbccddeeff')), '69c4e0d86a7b0430d8cdb78070b4c55a');
    },
  });

  // ---- Curves --------------------------------------------------------------

  reg({
    id: 'curve.secp256k1-g', group: 'curves', critical: true, title: 'secp256k1: private key 1 -> generator point G',
    run: function (t) {
      var one = new Uint8Array(32); one[31] = 1;
      t.equalHex(V.curves.secp256k1.getPublicKey(one, true),
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    },
  });

  reg({
    id: 'curve.ed25519-rfc8032', group: 'curves', critical: true, title: 'Ed25519 — RFC 8032 section 7.1 test 1',
    run: function (t) {
      var sk = hx('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
      var ed = V.curves.ed25519;
      t.equalHex(ed.getPublicKey(sk), 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'public key');
      t.equalHex(ed.sign(new Uint8Array(0), sk),
        'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
        'signature');
    },
  });

  // ---- Encodings -----------------------------------------------------------

  reg({
    id: 'enc.base58check', group: 'encodings', critical: true,
    title: 'Base58Check P2PKH address of private key 1 (compressed)',
    run: function (t) {
      var b58c = V.base.createBase58check(H.sha256);
      var h160 = hx('751e76e8199196d454941c45d1b3a323f1433bd6');
      t.equal(b58c.encode(B.concat(new Uint8Array([0x00]), h160)), '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
    },
  });

  reg({
    id: 'enc.bech32', group: 'encodings', critical: true, title: 'Bech32 P2WPKH — BIP173 example address',
    run: function (t) {
      var bech32 = V.base.bech32;
      var program = hx('751e76e8199196d454941c45d1b3a323f1433bd6');
      var words = [0].concat(bech32.toWords(program));
      t.equal(bech32.encode('bc', words), 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    },
  });

  // ---- BIP39 / BIP32 (first official vector of each; full sets in tests/) --

  reg({
    id: 'bip.bip39-vector0', group: 'bip', critical: true,
    title: 'BIP39: zero entropy -> "abandon ... about" -> seed (passphrase TREZOR)',
    run: function (t) {
      var bip39 = V.bip39;
      var m = bip39.entropyToMnemonic(new Uint8Array(16), bip39.wordlists.english);
      t.equal(m, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 'mnemonic');
      t.equalHex(bip39.mnemonicToSeedSync(m, 'TREZOR'),
        'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
        'seed');
    },
  });

  reg({
    id: 'bip.bip32-vector1', group: 'bip', critical: true, title: 'BIP32 test vector 1: master and m/0\'/1 keys',
    run: function (t) {
      var root = V.bip32.HDKey.fromMasterSeed(seq(16));
      t.equal(root.privateExtendedKey,
        'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi', 'm xprv');
      t.equal(root.derive("m/0'/1").publicExtendedKey,
        'xpub6ASuArnXKPbfEwhqN6e3mwBcDTgzisQN1wXN9BJcM47sSikHjJf3UFHKkNAWbWMiGj7Wf5uMash7SyYq527Hqck2AxYysAA7xmALppuCkwQ', "m/0'/1 xpub");
    },
  });
})(window.WG, window.WGVendor);
