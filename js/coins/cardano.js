/*
 * js/coins/cardano.js
 *
 * PURPOSE
 *   Cardano Shelley base address (CIP-1852 / CIP-19), mainnet:
 *     payment key  m/1852'/1815'/0'/0/0
 *     stake key    m/1852'/1815'/0'/2/0
 *     address      bech32("addr", 0x01 || BLAKE2b-224(payment pub) || BLAKE2b-224(stake pub))
 *     stake addr   bech32("stake", 0xe1 || BLAKE2b-224(stake pub))
 *     account key  bech32("acct_xvk", A || chain code) of m/1852'/1815'/0'  (watch-only)
 *   Keys come from the Icarus master key (js/derive/cardano-keys.js), which is
 *   computed from the BIP39 ENTROPY and passphrase, not from the 64-byte seed.
 *   Therefore Cardano is unavailable for SLIP-39 backups and single-key mode.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var E = WG.encode;
  var K = WG.cardanoKeys;

  /** BLAKE2b-224 key hash. */
  function keyHash(pub) {
    return V.hashes.blake2b(pub, { dkLen: 28 });
  }

  var coin = {
    id: 'ada', name: 'Cardano', symbol: 'ADA', order: 90, family: 'bip39',
    variants: [{ id: 'shelley', labelKey: 'varShelley', path: "m/1852'/1815'/0'/0/0", stake: "m/1852'/1815'/0'/2/0", account: "m/1852'/1815'/0'" }],
    defaultVariant: 'shelley',
    singleKey: false,
    needsEntropy: true,
    wallets: 'Yoroi, Eternl, Lace, Daedalus (15/24 words), Trezor (12-21 words)',
    notes: ['noteCardano'],
    /**
     * @param ctx.entropy     BIP39 entropy (required)
     * @param ctx.passphrase  BIP39 passphrase
     * @param ctx.paths       optional override {payment, stake} (used by tests)
     */
    fromSeed: function (ctx) {
      if (!ctx.entropy) throw new Error('Cardano needs a BIP39 mnemonic (not available for SLIP-39 or single keys)');
      var v = WG.coins.variant(coin, ctx.variant);
      var paths = ctx.paths || { payment: v.path, stake: v.stake, account: v.account };
      var master = K.icarusMaster(ctx.entropy, ctx.passphrase);
      var pay = K.derive(master, paths.payment);
      var stake = K.derive(master, paths.stake);
      var address = E.bech32Long('addr', B.concat(new Uint8Array([0x01]), keyHash(pay.publicKey), keyHash(stake.publicKey)));
      var stakeAddress = E.bech32Long('stake', B.concat(new Uint8Array([0xe1]), keyHash(stake.publicKey)));
      var account = paths.account ? K.derive(master, paths.account) : null;
      var result = WG.coins.result(coin, Object.assign({}, v, { path: paths.payment }), {
        address: address,
        privateKey: null,
        secrets: [],   // the mnemonic is the backup; extended private keys are not printed
        publics: [{ labelKey: 'lblAddress', value: address, qr: true }, { labelKey: 'lblStakeAddress', value: stakeAddress }],
        watch: account ? [{ labelKey: 'lblAcctXvk', value: E.bech32Long('acct_xvk', B.concat(account.publicKey, account.chainCode)), qr: true }] : [],
      });
      B.wipe(master, pay.xprv, stake.xprv, account && account.xprv);
      return result;
    },
  };
  WG.coins.register(coin);
})(window.WG, window.WGVendor);
