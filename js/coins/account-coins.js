/*
 * js/coins/account-coins.js
 *
 * PURPOSE
 *   Account-model coins on secp256k1 BIP32 keys:
 *     Ethereum  m/44'/60'/0'/0/0   0x + EIP-55( keccak256(pubkey)[12..] )
 *     Tron      m/44'/195'/0'/0/0  Base58Check( 0x41 || keccak256(pubkey)[12..] )
 *     XRP       m/44'/144'/0'/0/0  XRP-alphabet Base58Check( 0x00 || HASH160(pubkey) )
 *   Private keys are shown as 64 hex characters, which MetaMask, TronLink and
 *   most XRP wallets accept for import (the mnemonic is the primary backup).
 */
(function (WG, V) {
  'use strict';

  var E = WG.encode;
  var B = WG.bytes;
  var secp = V.curves.secp256k1;

  /** Compute the address for one coin from a compressed public key. */
  var ADDRESS = {
    eth: function (pub) { return E.eip55(E.ethAccountId(pub)); },
    trx: function (pub) { return E.base58check(B.concat(new Uint8Array([0x41]), E.ethAccountId(pub))); },
    xrp: function (pub) { return E.base58checkXrp(B.concat(new Uint8Array([0x00]), E.hash160(pub))); },
  };

  /** Result for one private key. */
  function build(coin, v, priv) {
    var pub = secp.getPublicKey(priv, true);
    var address = ADDRESS[coin.id](pub);
    var privHex = B.bytesToHex(priv);
    return WG.coins.result(coin, v, {
      address: address,
      privateKey: priv,
      secrets: [{ labelKey: 'lblPrivateKeyHex', value: coin.id === 'eth' ? '0x' + privHex : privHex, qr: true }],
      publics: [{ labelKey: 'lblAddress', value: address, qr: true }, { labelKey: 'lblPublicKey', value: B.bytesToHex(pub) }],
    });
  }

  /** Register one account-model coin. */
  function define(spec) {
    var coin = {
      id: spec.id, name: spec.name, symbol: spec.symbol, order: spec.order, family: 'bip39',
      variants: [{ id: 'bip44', labelKey: 'varBip44', path: spec.path }], defaultVariant: 'bip44',
      singleKey: true, wallets: spec.wallets, notes: spec.notes || [],
      fromSeed: function (ctx) {
        var v = WG.coins.variant(coin, ctx.variant);
        if (ctx.path) v = Object.assign({}, v, { path: ctx.path });   // tests use other paths
        return build(coin, v, WG.hd.secp256k1(ctx.seed, v.path).privateKey);
      },
      fromPrivateKey: function (priv) {
        return build(coin, Object.assign({}, coin.variants[0], { path: null }), priv);
      },
    };
    WG.coins.register(coin);
  }

  define({ id: 'eth', name: 'Ethereum', symbol: 'ETH', order: 40, path: "m/44'/60'/0'/0/0",
    wallets: 'MetaMask, Rabby, Trezor, Ledger', notes: ['noteEvm'] });
  define({ id: 'trx', name: 'Tron', symbol: 'TRX', order: 50, path: "m/44'/195'/0'/0/0",
    wallets: 'TronLink, Trust Wallet, Ledger' });
  define({ id: 'xrp', name: 'XRP', symbol: 'XRP', order: 60, path: "m/44'/144'/0'/0/0",
    wallets: 'Xaman (BIP39 import), Ledger, Trezor', notes: ['noteXrpReserve'] });
})(window.WG, window.WGVendor);
