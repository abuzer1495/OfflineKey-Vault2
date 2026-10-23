/*
 * tests/suites/coins.js
 *
 * PURPOSE
 *   Runs every coin module against the official / reference vectors loaded
 *   from tests/vectors/*.js. One test per vector so failures are precise.
 *
 *   Sources (see each vector file header for the pinned commit):
 *     BIP84/BIP86 (bitcoin/bips), SLIP-0010 (satoshilabs/slips), SEP-0005
 *     (stellar-protocol), CIP-3 (cardano-foundation/CIPs), Monero functional
 *     tests (monero-project/monero), Trezor firmware fixtures, Ian Coleman's
 *     BIP39 tool tests.
 */
(function (WG) {
  'use strict';

  var B = WG.bytes;
  var C = WG.coins;
  var reg = WG.selftest.register;
  var VEC = WG.vectors;

  /** Memoised BIP39 seed per mnemonic+passphrase (PBKDF2 is slow-ish). */
  var seedCache = {};
  function seedOf(mnemonic, passphrase) {
    var k = mnemonic + '\u0000' + (passphrase || '');
    if (!seedCache[k]) seedCache[k] = WG.bip39.mnemonicToSeed(mnemonic, passphrase || '');
    return seedCache[k];
  }

  /** Find a labelled item (by i18n label key) in a result list. */
  function item(list, labelKey) {
    var x = list.filter(function (i) { return i.labelKey === labelKey; })[0];
    return x ? x.value : undefined;
  }

  // ---- BIP84 / BIP86 -----------------------------------------------------------
  var b = VEC.bip84bip86;
  b.bip84.entries.forEach(function (e) {
    reg({
      id: 'coin.bip84.' + e.path, group: 'Bitcoin BIP84 (' + b.source + ')', title: 'BIP84 ' + e.path,
      run: function (t) {
        var r = C.get('btc').fromSeed({ seed: seedOf(b.bip84.mnemonic), variant: 'p2wpkh', path: e.path });
        t.equal(r.address, e.address, 'address');
        t.equal(item(r.secrets, 'lblWif'), e.privkey, 'WIF private key');
        t.equal(item(r.publics, 'lblPublicKey'), e.pubkey, 'public key');
      },
    });
  });
  reg({
    id: 'coin.bip84.account-zpub', group: 'Bitcoin BIP84 (' + b.source + ')', title: "BIP84 account m/84'/0'/0' zpub (watch-only)",
    run: function (t) {
      // Expected value: "Account 0, root = m/84'/0'/0'" xpub line of BIP84's test vectors.
      var r = C.get('btc').fromSeed({ seed: seedOf(b.bip84.mnemonic), variant: 'p2wpkh' });
      t.equal(item(r.watch, 'lblZpub'), 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs', 'account zpub');
    },
  });
  b.bip86.entries.forEach(function (e) {
    reg({
      id: 'coin.bip86.' + e.path, group: 'Bitcoin BIP86 (' + b.source + ')', title: 'BIP86 ' + e.path,
      run: function (t) {
        var r = C.get('btc').fromSeed({ seed: seedOf(b.bip86.mnemonic), variant: 'p2tr', path: e.path });
        t.equal(r.address, e.address, 'address');
        t.equal(item(r.publics, 'lblTaprootOutputKey'), e.output_key, 'output key');
        t.equal(item(r.publics, 'lblPublicKey').slice(2), e.internal_key, 'internal key');
      },
    });
  });

  // ---- Trezor firmware fixtures ("all" x12) -------------------------------------
  var tz = VEC.trezor;
  var TREZOR_MAP = {
    'bitcoin-p2pkh': ['btc', 'p2pkh'], 'bitcoin-p2wpkh': ['btc', 'p2wpkh'], 'bitcoin-p2tr': ['btc', 'p2tr'],
    'litecoin-p2pkh': ['ltc', 'p2pkh'], xrp: ['xrp'], ethereum: ['eth'], solana: ['sol'],
  };
  tz.cases.forEach(function (c, i) {
    reg({
      id: 'coin.trezor.' + i, group: 'Trezor fixtures (' + tz.source.slice(0, 40) + '…)', title: c.coin + ' ' + c.path,
      run: function (t) {
        var r;
        if (c.coin === 'cardano-base') {
          var entropy = WG.bip39.mnemonicToEntropy(tz.mnemonic);
          r = C.get('ada').fromSeed({ entropy: entropy, passphrase: '', paths: { payment: c.path, stake: c.stakingPath } });
        } else {
          var m = TREZOR_MAP[c.coin];
          r = C.get(m[0]).fromSeed({ seed: seedOf(tz.mnemonic), variant: m[1], path: c.path });
        }
        t.equal(r.address, c.address, 'address');
      },
    });
  });

  // ---- Ian Coleman BIP39 tool ("abandon abandon ability" etc.) ------------------
  var ic = VEC.iancoleman;
  var IC_MAP = { 'litecoin-p2pkh': ['ltc', 'p2pkh'], dogecoin: ['doge', 'p2pkh'], tron: ['trx'], xrp: ['xrp'], stellar: ['xlm'] };
  ic.cases.forEach(function (c) {
    reg({
      id: 'coin.iancoleman.' + c.coin, group: 'Ian Coleman BIP39 tool (' + ic.source.slice(0, 40) + '…)', title: c.network + ' ' + c.path,
      run: function (t) {
        var m = IC_MAP[c.coin];
        var r = C.get(m[0]).fromSeed({ seed: seedOf(c.mnemonic), variant: m[1], path: c.path });
        t.equal(r.address, c.address, 'address');
        var secret = r.secrets[0].value.replace(/^0x/, '');
        t.equal(secret, c.privKey.replace(/^0x/, ''), 'private key');
        if (c.coin !== 'stellar') t.equal(item(r.publics, 'lblPublicKey'), c.pubKey, 'public key');
      },
    });
  });

  // ---- Litecoin native segwit (composed vector) -------------------------------
  reg({
    id: 'coin.ltc.p2wpkh-composed', group: 'Litecoin bech32 (composed)',
    title: "LTC ltc1 address = bech32('ltc', HASH160 of the Trezor-verified key at m/44'/2'/0'/0/0)",
    run: function (t) {
      // Same key as the Trezor legacy vector; only the encoding differs (SLIP-0173 hrp "ltc").
      var legacy = tz.cases.filter(function (c) { return c.coin === 'litecoin-p2pkh'; })[0];
      var h160 = WG.encode.base58checkDecode(legacy.address).slice(1);
      var expected = WGVendor.base.bech32.encode('ltc', [0].concat(WGVendor.base.bech32.toWords(h160)));
      var r = C.get('ltc').fromSeed({ seed: seedOf(tz.mnemonic), variant: 'p2wpkh', path: legacy.path });
      t.equal(r.address, expected, 'address');
      t.ok(/^ltc1q/.test(r.address), 'ltc1q prefix');
    },
  });

  // ---- SLIP-0010 ed25519 -----------------------------------------------------
  VEC.slip10.vectors.forEach(function (v) {
    v.chains.forEach(function (c) {
      reg({
        id: 'coin.slip10.' + v.name + c.path, group: 'SLIP-0010 ed25519 (' + VEC.slip10.source + ')', title: v.name + ' ' + c.path,
        run: function (t) {
          var k = WG.hd.slip10Ed25519(B.hexToBytes(v.seed), c.path);
          t.equalHex(k.privateKey, c.privateKey, 'private key');
          t.equalHex(k.chainCode, c.chainCode, 'chain code');
          t.equalHex(B.concat(new Uint8Array([0]), k.publicKey), c.publicKey, 'public key');
        },
      });
    });
  });

  // ---- SEP-0005 Stellar --------------------------------------------------------
  VEC.sep5.tests.forEach(function (tc, i) {
    reg({
      id: 'coin.sep5.' + i, group: 'Stellar SEP-0005 (' + VEC.sep5.source + ')',
      title: 'SEP-0005 test ' + (i + 1) + ' (' + WG.bip39.words(tc.mnemonic).length + ' words' + (tc.passphrase ? ' + passphrase' : '') + ', ' + tc.keys.length + ' keys)',
      run: function (t) {
        var seed = seedOf(tc.mnemonic, tc.passphrase);
        tc.keys.forEach(function (k) {
          var r = C.get('xlm').fromSeed({ seed: seed, path: k.path });
          t.equal(r.address, k.address, k.path + ' address');
          t.equal(item(r.secrets, 'lblStellarSecret'), k.secret, k.path + ' secret');
        });
      },
    });
  });

  // ---- CIP-3 Icarus master key -----------------------------------------------
  VEC.cip3.cases.forEach(function (c, i) {
    reg({
      id: 'coin.cip3.' + i, group: 'Cardano CIP-3 (' + VEC.cip3.source + ')', title: 'Icarus master key' + (c.passphrase ? ' with passphrase' : ''),
      run: function (t) {
        var entropy = WG.bip39.mnemonicToEntropy(c.mnemonic);
        t.equalHex(WG.cardanoKeys.icarusMaster(entropy, c.passphrase), c.masterKey, 'master key');
      },
    });
  });

  // ---- Monero ------------------------------------------------------------------
  VEC.monero.wallets.forEach(function (w, i) {
    reg({
      id: 'coin.monero.' + i, group: 'Monero (' + VEC.monero.source + ')', title: 'Monero wallet "' + w.mnemonic.split(' ').slice(0, 2).join(' ') + ' …"',
      run: function (t) {
        var spend = WG.monero.mnemonicDecode(w.mnemonic);
        if (w.spendKey) t.equalHex(spend, w.spendKey, 'mnemonic -> spend key');
        var k = WG.monero.keysFromSpend(spend);
        if (w.viewKey) t.equalHex(k.view, w.viewKey, 'view key');
        if (w.publicSpendKey) t.equalHex(k.pubSpend, w.publicSpendKey, 'public spend key');
        if (w.publicViewKey) t.equalHex(k.pubView, w.publicViewKey, 'public view key');
        t.equal(k.address, w.address, 'address');
        t.equal(WG.monero.mnemonicEncode(spend), w.mnemonic, 'spend key -> mnemonic (round trip)');
        var r = C.get('xmr').fromKeyMaterial(spend);
        t.equal(r.address, w.address, 'coin module address');
      },
    });
  });
  reg({
    id: 'coin.monero.checksum', group: 'Monero negative', title: 'Monero mnemonic with a wrong checksum word is rejected',
    run: function (t) {
      var words = VEC.monero.wallets[0].mnemonic.split(' ');
      words[24] = words[24] === 'abbey' ? 'zoom' : 'abbey';
      t.throws(function () { WG.monero.mnemonicDecode(words.join(' ')); }, 'checksum');
    },
  });

  // ---- Encoding KATs from the specifications -------------------------------
  reg({
    id: 'coin.eip55-spec', group: 'Encodings', title: 'EIP-55 examples from the specification',
    run: function (t) {
      ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
        '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb'].forEach(function (a) {
        t.equal(WG.encode.eip55(B.hexToBytes(a.slice(2).toLowerCase())), a, a);
      });
    },
  });
  reg({
    id: 'coin.crc-checks', group: 'Encodings', title: 'CRC-32 and CRC16-XModem check values ("123456789")',
    run: function (t) {
      var x = B.utf8ToBytes('123456789');
      t.equal(WG.monero.crc32(x), 0xcbf43926, 'CRC-32');
      t.equal(WG.encode.crc16xmodem(x), 0x31c3, 'CRC16-XModem');
    },
  });
})(window.WG);
