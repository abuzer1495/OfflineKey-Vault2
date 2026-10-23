/*
 * js/coins/selftest-coins.js
 *
 * PURPOSE
 *   Critical start-up known-answer tests: one published address per coin,
 *   derived through the same code path the generator uses. If any coin
 *   module, curve or encoding is wrong or tampered with, key generation is
 *   locked before a single wallet is produced. (The complete vector sets run
 *   in tests/test.html.)
 *
 *   Expected values and their sources:
 *     "abandon x11 about"        BIP84 / BIP86 test vectors (bitcoin/bips)
 *     "all x12"                  Trezor firmware test fixtures
 *     "abandon abandon ability"  Ian Coleman BIP39 tool test-suite
 *     "illness spike ..."        SEP-0005 test 1 (stellar-protocol)
 *     "velvet lymph ..."         Monero functional tests (monero-project)
 */
(function (WG) {
  'use strict';

  var C = WG.coins;
  var reg = WG.selftest.register;

  var ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  var ALL = 'all all all all all all all all all all all all';
  var ABILITY = 'abandon abandon ability';
  var ILLNESS = 'illness spike retreat truth genius clock brain pass fit cave bargain toe';
  var VELVET = 'velvet lymph giddy number token physics poetry unquoted nibs useful sabotage limits benches ' +
    'lifestyle eden nitrogen anvil fewest avoid batch vials washing fences goat unquoted';

  /** BIP39 seeds are computed lazily and cached for the run (PBKDF2 is slow). */
  var cache = {};
  function seed(m) { return cache[m] || (cache[m] = WG.bip39.mnemonicToSeed(m, '')); }

  /** Register one critical address KAT. */
  function kat(id, title, fn, expected) {
    reg({
      id: 'coinkat.' + id, group: 'coins', critical: true, title: title,
      run: function (t) { t.equal(fn().address, expected, 'address'); },
    });
  }

  kat('btc-p2wpkh', "Bitcoin BIP84 m/84'/0'/0'/0/0 (BIP84 vector)",
    function () { return C.get('btc').fromSeed({ seed: seed(ABANDON), variant: 'p2wpkh' }); },
    'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  kat('btc-p2tr', "Bitcoin BIP86 taproot m/86'/0'/0'/0/0 (BIP86 vector)",
    function () { return C.get('btc').fromSeed({ seed: seed(ABANDON), variant: 'p2tr' }); },
    'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  kat('btc-p2pkh', "Bitcoin legacy m/44'/0'/0'/0/0 (Trezor fixture)",
    function () { return C.get('btc').fromSeed({ seed: seed(ALL), variant: 'p2pkh' }); },
    '1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL');
  kat('ltc', "Litecoin legacy m/44'/2'/0'/0/0 (Trezor fixture)",
    function () { return C.get('ltc').fromSeed({ seed: seed(ALL), variant: 'p2pkh' }); },
    'LcubERmHD31PWup1fbozpKuiqjHZ4anxcL');
  kat('doge', "Dogecoin m/44'/3'/0'/0/0 (Ian Coleman tool)",
    function () { return C.get('doge').fromSeed({ seed: seed(ABILITY) }); },
    'DPQH2AtuzkVSG6ovjKk4jbUmZ6iXLpgbJA');
  kat('eth', "Ethereum m/44'/60'/0'/0/0 (Trezor fixture)",
    function () { return C.get('eth').fromSeed({ seed: seed(ALL) }); },
    '0x73d0385F4d8E00C5e6504C6030F47BF6212736A8');
  kat('trx', "Tron m/44'/195'/0'/0/0 (Ian Coleman tool)",
    function () { return C.get('trx').fromSeed({ seed: seed(ABILITY) }); },
    'TA891Fu7vVz595BGQpNX2MCzr7yBcxuoC7');
  kat('xrp', "XRP m/44'/144'/0'/0/0 (Trezor fixture)",
    function () { return C.get('xrp').fromSeed({ seed: seed(ALL) }); },
    'rNaqKtKrMSwpwZSzRckPf7S96DkimjkF4H');
  kat('sol', "Solana m/44'/501'/0'/0' (Trezor fixture)",
    function () { return C.get('sol').fromSeed({ seed: seed(ALL) }); },
    '14CCvQzQzHCVgZM3j9soPnXuJXh1RmCfwLVUcdfbZVBS');
  kat('xlm', "Stellar m/44'/148'/0' (SEP-0005 test 1)",
    function () { return C.get('xlm').fromSeed({ seed: seed(ILLNESS) }); },
    'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6');
  kat('ada', "Cardano base address, account 4' (Trezor fixture)",
    function () {
      return C.get('ada').fromSeed({ entropy: WG.bip39.mnemonicToEntropy(ALL), passphrase: '',
        paths: { payment: "m/1852'/1815'/4'/0/0", stake: "m/1852'/1815'/4'/2/0" } });
    },
    'addr1q8v42wjda8r6mpfj40d36znlgfdcqp7jtj03ah8skh6u8wnrqua2vw243tmjfjt0h5wsru6appuz8c0pfd75ur7myyeqsx9990');
  kat('xmr', 'Monero 25-word seed -> address (Monero functional tests)',
    function () { return C.get('xmr').fromKeyMaterial(WG.monero.mnemonicDecode(VELVET)); },
    '42ey1afDFnn4886T7196doS9GPMzexD9gXpsZJDwVjeRVdFCSoHnv7KPbBeGpzJBzHRCAs9UxqeoyFQMYbqSWYTfJJQAWDm');
})(window.WG);
