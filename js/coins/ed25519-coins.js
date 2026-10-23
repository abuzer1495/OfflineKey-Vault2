/*
 * js/coins/ed25519-coins.js
 *
 * PURPOSE
 *   ed25519 coins derived with SLIP-0010 (hardened-only paths):
 *     Solana   m/44'/501'/0'/0'  address = base58(public key)
 *              secret = base58(private seed (32) || public key (32)), the
 *              64-byte format Phantom and Solflare import ("private key")
 *     Stellar  m/44'/148'/0'      (SEP-0005)
 *              address = StrKey "G..." of the public key
 *              secret  = StrKey "S..." of the private seed
 */
(function (WG, V) {
  'use strict';

  var E = WG.encode;
  var B = WG.bytes;
  var ed = V.curves.ed25519;
  var base58 = V.base.base58;

  /** Result for one 32-byte ed25519 private seed. */
  var BUILD = {
    sol: function (coin, v, seed32) {
      var pub = ed.getPublicKey(seed32);
      var address = base58.encode(pub);
      return WG.coins.result(coin, v, {
        address: address, privateKey: seed32,
        secrets: [{ labelKey: 'lblSolanaSecret', value: base58.encode(B.concat(seed32, pub)), qr: true }],
        publics: [{ labelKey: 'lblAddress', value: address, qr: true }],
      });
    },
    xlm: function (coin, v, seed32) {
      var pub = ed.getPublicKey(seed32);
      var address = E.strkey(6 << 3, pub);
      return WG.coins.result(coin, v, {
        address: address, privateKey: seed32,
        secrets: [{ labelKey: 'lblStellarSecret', value: E.strkey(18 << 3, seed32), qr: true }],
        publics: [{ labelKey: 'lblAddress', value: address, qr: true }],
      });
    },
  };

  /** Register one SLIP-0010 ed25519 coin. */
  function define(spec) {
    var coin = {
      id: spec.id, name: spec.name, symbol: spec.symbol, order: spec.order, family: 'bip39',
      variants: [{ id: 'slip10', labelKey: 'varSlip10', path: spec.path }], defaultVariant: 'slip10',
      singleKey: true, wallets: spec.wallets, notes: spec.notes || [],
      fromSeed: function (ctx) {
        var v = WG.coins.variant(coin, ctx.variant);
        if (ctx.path) v = Object.assign({}, v, { path: ctx.path });   // tests use other paths
        var k = WG.hd.slip10Ed25519(ctx.seed, v.path);
        return BUILD[coin.id](coin, v, k.privateKey);
      },
      fromPrivateKey: function (seed32) {
        return BUILD[coin.id](coin, Object.assign({}, coin.variants[0], { path: null }), seed32);
      },
    };
    WG.coins.register(coin);
  }

  define({ id: 'sol', name: 'Solana', symbol: 'SOL', order: 70, path: "m/44'/501'/0'/0'",
    wallets: 'Phantom, Solflare, Backpack, Trezor, Ledger' });
  define({ id: 'xlm', name: 'Stellar', symbol: 'XLM', order: 80, path: "m/44'/148'/0'",
    wallets: 'Lobstr, Freighter, Stellar Laboratory, Trezor, Ledger', notes: ['noteXlmReserve'] });
})(window.WG, window.WGVendor);
