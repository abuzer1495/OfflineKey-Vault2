/*
 * js/derive/bip39.js   ->   WG.bip39
 *
 * PURPOSE
 *   Thin, strict wrapper around @scure/bip39 (via WGVendor) for:
 *     entropy (16/20/24/28/32 bytes) -> mnemonic words (any official language)
 *     mnemonic + optional passphrase -> 64-byte BIP32 seed (PBKDF2-HMAC-SHA512, 2048 rounds)
 *   Entropy always comes from WG.entropy (the library's own RNG is not exposed).
 *
 * NOTES
 *   - Japanese mnemonics are joined with the ideographic space U+3000, as the
 *     BIP39 spec requires; words() splits on both kinds of space.
 *   - The passphrase (BIP39 "25th word") is NFKD-normalised inside the library.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;

  /** Language ids accepted by this module, in UI display order. */
  var LANGUAGES = Object.freeze(['english', 'spanish', 'french', 'italian', 'portuguese', 'czech',
    'japanese', 'korean', 'simplified-chinese', 'traditional-chinese']);

  /** Word count -> entropy bytes. */
  var WORDS_TO_BYTES = Object.freeze({ 12: 16, 15: 20, 18: 24, 21: 28, 24: 32 });

  /** Wordlist array for a language id (throws for unknown ids). */
  function wordlist(lang) {
    var wl = V.bip39.wordlists[lang || 'english'];
    if (!wl) throw new Error('unknown BIP39 language ' + lang);
    return wl;
  }

  /**
   * Encode entropy as a mnemonic.
   * @param {Uint8Array} entropy  16..32 bytes, multiple of 4
   * @param {string} [lang]       language id (default English)
   * @returns {string}            words separated by a space (U+3000 for Japanese)
   */
  function entropyToMnemonic(entropy, lang) {
    B.assertBytes(entropy, undefined, 'entropy');
    if ([16, 20, 24, 28, 32].indexOf(entropy.length) === -1) throw new RangeError('BIP39 entropy must be 16..32 bytes in steps of 4');
    return V.bip39.entropyToMnemonic(entropy, wordlist(lang));
  }

  /** Decode a mnemonic back to its entropy (throws on bad words or checksum). */
  function mnemonicToEntropy(mnemonic, lang) {
    return V.bip39.mnemonicToEntropy(mnemonic, wordlist(lang));
  }

  /** True if every word is in the list and the checksum matches. */
  function validate(mnemonic, lang) {
    return V.bip39.validateMnemonic(mnemonic, wordlist(lang));
  }

  /**
   * Mnemonic + passphrase -> 64-byte seed, straight from the BIP39 text:
   *   PBKDF2-HMAC-SHA512(password = NFKD(mnemonic), salt = "mnemonic" || NFKD(passphrase), 2048, 64)
   * Implemented here (instead of the library call) because the library also
   * enforces 12..24 words, while published reference vectors include shorter
   * phrases. It does NOT validate the mnemonic; callers handling user input
   * must call validate() first. Checked against all Trezor BIP39 vectors.
   */
  function mnemonicToSeed(mnemonic, passphrase) {
    if (typeof mnemonic !== 'string') throw new TypeError('mnemonic must be a string');
    var m = B.utf8ToBytes(mnemonic.normalize('NFKD'));
    var salt = B.utf8ToBytes(('mnemonic' + (passphrase || '')).normalize('NFKD'));
    return V.hashes.pbkdf2(V.hashes.sha512, m, salt, { c: 2048, dkLen: 64 });
  }

  /** Split a mnemonic into words (handles the Japanese ideographic space). */
  function words(mnemonic) {
    return mnemonic.split(/[\s　]+/).filter(Boolean);
  }

  WG.define('bip39', {
    LANGUAGES: LANGUAGES,
    WORDS_TO_BYTES: WORDS_TO_BYTES,
    entropyToMnemonic: entropyToMnemonic,
    mnemonicToEntropy: mnemonicToEntropy,
    mnemonicToSeed: mnemonicToSeed,
    validate: validate,
    words: words,
  });
})(window.WG, window.WGVendor);
