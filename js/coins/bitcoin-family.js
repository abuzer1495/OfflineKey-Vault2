/*
 * js/coins/bitcoin-family.js
 *
 * PURPOSE
 *   Bitcoin, Litecoin and Dogecoin. All three use secp256k1 BIP32 keys and
 *   differ only in derivation coin type, version bytes and bech32 prefix:
 *
 *            coin type  P2PKH ver  WIF ver  bech32 hrp
 *   Bitcoin      0        0x00       0x80     bc
 *   Litecoin     2        0x30       0xb0     ltc
 *   Dogecoin     3        0x1e       0x9e     (no segwit)
 *
 *   Address types: P2WPKH native segwit (BIP84, default), P2TR taproot
 *   (BIP86, Bitcoin only) and legacy P2PKH (BIP44).
 */
(function (WG, V) {
  'use strict';

  var E = WG.encode;
  var B = WG.bytes;
  var secp = V.curves.secp256k1;

  /**
   * Build one address result from a key pair.
   * @param {object} coin    coin definition
   * @param {object} v       variant {id, path, account}
   * @param {Uint8Array} priv  32-byte private key
   * @param {object} params  {p2pkh, wif, hrp}
   * @param {string} [watchKey] account extended public key (HD only)
   */
  function build(coin, v, priv, params, watchKey) {
    var pub = secp.getPublicKey(priv, true);
    var address, extraPublics = [];
    if (v.id === 'p2wpkh') {
      address = E.p2wpkh(pub, params.hrp);
    } else if (v.id === 'p2tr') {
      var tr = E.p2tr(pub, params.hrp);
      address = tr.address;
      extraPublics.push({ labelKey: 'lblTaprootOutputKey', value: B.bytesToHex(tr.outputKey) });
    } else {
      address = E.p2pkh(pub, params.p2pkh);
    }
    return WG.coins.result(coin, v, {
      address: address,
      privateKey: priv,
      secrets: [{ labelKey: v.id === 'p2tr' ? 'lblWifTaproot' : 'lblWif', value: E.wif(priv, params.wif, true), qr: true }],
      publics: [{ labelKey: 'lblAddress', value: address, qr: true }, { labelKey: 'lblPublicKey', value: B.bytesToHex(pub) }].concat(extraPublics),
      watch: watchKey ? [{ labelKey: v.id === 'p2wpkh' ? 'lblZpub' : 'lblXpub', value: watchKey, qr: true }] : [],
    });
  }

  /** Register one Bitcoin-family coin. */
  function define(spec) {
    var coin = {
      id: spec.id, name: spec.name, symbol: spec.symbol, order: spec.order, family: 'bip39',
      variants: spec.variants, defaultVariant: spec.variants[0].id, singleKey: true,
      wallets: spec.wallets, notes: spec.notes || [],
      /** HD derivation from the shared seed. */
      // ctx.path overrides the variant path (used by tests for other indices).
      fromSeed: function (ctx) {
        var v = WG.coins.variant(coin, ctx.variant);
        if (ctx.path) v = Object.assign({}, v, { path: ctx.path });
        var key = WG.hd.secp256k1(ctx.seed, v.path);
        var versions = v.id === 'p2wpkh' && spec.id === 'btc' ? WG.hd.VERSIONS.zpub : WG.hd.VERSIONS.xpub;
        var account = ctx.path ? null : WG.hd.secp256k1(ctx.seed, v.account, versions).publicExtendedKey;
        return build(coin, v, key.privateKey, spec, account);
      },
      /** Classic single-key paper wallet. */
      fromPrivateKey: function (priv, variantId) {
        var v = Object.assign({}, WG.coins.variant(coin, variantId), { path: null });
        return build(coin, v, priv, spec, null);
      },
    };
    WG.coins.register(coin);
  }

  define({
    id: 'btc', name: 'Bitcoin', symbol: 'BTC', order: 10, p2pkh: 0x00, wif: 0x80, hrp: 'bc',
    wallets: 'Sparrow, Electrum, BlueWallet, Trezor, Ledger',
    notes: ['noteTaproot'],
    variants: [
      { id: 'p2wpkh', labelKey: 'varP2wpkh', path: "m/84'/0'/0'/0/0", account: "m/84'/0'/0'" },
      { id: 'p2tr', labelKey: 'varP2tr', path: "m/86'/0'/0'/0/0", account: "m/86'/0'/0'" },
      { id: 'p2pkh', labelKey: 'varP2pkh', path: "m/44'/0'/0'/0/0", account: "m/44'/0'/0'" },
    ],
  });

  define({
    id: 'ltc', name: 'Litecoin', symbol: 'LTC', order: 20, p2pkh: 0x30, wif: 0xb0, hrp: 'ltc',
    wallets: 'Electrum-LTC, Litewallet, Trezor, Ledger',
    variants: [
      { id: 'p2wpkh', labelKey: 'varP2wpkh', path: "m/84'/2'/0'/0/0", account: "m/84'/2'/0'" },
      { id: 'p2pkh', labelKey: 'varP2pkh', path: "m/44'/2'/0'/0/0", account: "m/44'/2'/0'" },
    ],
  });

  define({
    id: 'doge', name: 'Dogecoin', symbol: 'DOGE', order: 30, p2pkh: 0x1e, wif: 0x9e, hrp: null,
    wallets: 'Dogecoin Core, MyDoge, Trezor, Ledger',
    variants: [
      { id: 'p2pkh', labelKey: 'varP2pkh', path: "m/44'/3'/0'/0/0", account: "m/44'/3'/0'" },
    ],
  });
})(window.WG, window.WGVendor);
