/*
 * js/coins/registry.js   ->   WG.coins
 *
 * PURPOSE
 *   Central list of supported coins. Every coin module calls
 *   WG.coins.register(def) with the same shape, so the generator, the UI
 *   and the PDF code can treat all coins uniformly.
 *
 * COIN DEFINITION
 *   {
 *     id, name, symbol, order,
 *     family:    'bip39'  -> derived from the shared seed (BIP39 or SLIP-39 master secret)
 *                'monero' -> has its own 25-word seed, independent of BIP39
 *     variants:  [{ id, labelKey, path, account? }]   address types / derivation paths
 *     defaultVariant,
 *     singleKey: true if a random standalone private key ("classic paper wallet") is supported
 *     needsEntropy: true if derivation needs the BIP39 entropy (Cardano), not just the seed
 *     wallets:   compatible wallet apps (shown on screen and in the PDF manual)
 *     notes:     i18n keys of coin-specific warnings
 *     fromSeed(ctx)          ctx = { seed, entropy, passphrase, variant } -> result
 *     fromPrivateKey(k, v)   (singleKey coins) random key bytes -> result
 *   }
 *
 * RESULT (what every derivation returns)
 *   { coin, name, symbol, variant, path, address,
 *     secrets: [{ labelKey, value, qr }],   private material (hidden by default)
 *     publics: [{ labelKey, value, qr }],   safe to share
 *     watch:   [{ labelKey, value, qr }],   watch-only material (xpub, view key, ...)
 *     notes:   [i18n keys] }
 */
(function (WG) {
  'use strict';

  var defs = {};

  /** Register a coin definition (ids are unique). */
  function register(def) {
    if (!def || !/^[a-z]+$/.test(def.id)) throw new Error('coin id required');
    if (defs[def.id]) throw new Error('coin already registered: ' + def.id);
    if (def.family !== 'bip39' && def.family !== 'monero') throw new Error('unknown coin family ' + def.family);
    defs[def.id] = Object.freeze(def);
  }

  /** All coins in display order. */
  function list() {
    return Object.keys(defs).map(function (k) { return defs[k]; })
      .sort(function (a, b) { return a.order - b.order; });
  }

  /** One coin by id (throws for unknown ids). */
  function get(id) {
    if (!defs[id]) throw new Error('unknown coin ' + id);
    return defs[id];
  }

  /** Variant object of a coin (default variant when id is omitted). */
  function variant(coin, variantId) {
    var id = variantId || coin.defaultVariant;
    var v = coin.variants.filter(function (x) { return x.id === id; })[0];
    if (!v) throw new Error('unknown variant ' + id + ' for ' + coin.id);
    return v;
  }

  /** Build a result object with the common fields filled in. */
  function result(coin, v, fields) {
    return Object.freeze(Object.assign({
      coin: coin.id, name: coin.name, symbol: coin.symbol, variant: v ? v.id : null,
      path: v ? v.path : null, secrets: [], publics: [], watch: [], notes: coin.notes || [],
    }, fields));
  }

  WG.define('coins', { register: register, list: list, get: get, variant: variant, result: result });
})(window.WG);
