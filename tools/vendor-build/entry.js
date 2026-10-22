/*
 * tools/vendor-build/entry.js
 *
 * PURPOSE
 *   Bundle entry point for vendor/wg-crypto.js. esbuild follows these imports,
 *   pulls the pinned npm packages (see package.json / package-lock.json) and
 *   emits ONE classic browser script (IIFE) that works from file:// URLs,
 *   where ES modules are blocked by Chrome.
 *
 * OUTPUT
 *   A single read-only global: window.WGVendor. Application code under /js
 *   must reach third-party crypto ONLY through this object, so an auditor can
 *   see every external primitive the app relies on in this one file.
 *
 * SECURITY NOTES
 *   - Nothing here implements cryptography; it only re-exports audited
 *     libraries (noble / scure by Paul Miller, MIT licensed).
 *   - The container objects are frozen and the global is non-writable, so
 *     later scripts cannot silently swap a primitive (e.g. replace sha256).
 */

// ---- Elliptic curves (@noble/curves) ---------------------------------------
// secp256k1: Bitcoin, Litecoin, Dogecoin, Ethereum, Tron, XRP keys.
// schnorr:   BIP340 x-only keys, needed for Bitcoin Taproot (BIP86) addresses.
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
// ed25519:   Solana, Stellar, Cardano and Monero (Monero uses raw point math).
import { ed25519 } from '@noble/curves/ed25519.js';
// Modular arithmetic helpers (mod, invert, Field) for Monero/Cardano scalar math.
import * as modular from '@noble/curves/abstract/modular.js';
// Number <-> byte conversions (little/big endian) used by scalar code.
import * as curveUtils from '@noble/curves/utils.js';

// ---- Hash functions and KDFs (@noble/hashes) -------------------------------
import { sha256, sha512 } from '@noble/hashes/sha2.js';          // Bitcoin, BIP39, entropy pool
import { sha3_256, keccak_256 } from '@noble/hashes/sha3.js';    // Ethereum/Tron/Monero use Keccak-256 (pre-NIST padding)
import { ripemd160 } from '@noble/hashes/legacy.js';             // HASH160 = RIPEMD160(SHA256(x)) for BTC-family/XRP
import { blake2b } from '@noble/hashes/blake2.js';               // Cardano address hashing (BLAKE2b-224/256)
import { hmac } from '@noble/hashes/hmac.js';                    // HMAC for BIP32/SLIP-0010 and entropy mixing
import { hkdf } from '@noble/hashes/hkdf.js';                    // HKDF-SHA512 entropy extraction
import { pbkdf2, pbkdf2Async } from '@noble/hashes/pbkdf2.js';   // BIP39 seed, Cardano Icarus master key
import { scrypt, scryptAsync } from '@noble/hashes/scrypt.js';   // BIP38 password encryption
import * as hashUtils from '@noble/hashes/utils.js';             // bytes/hex/utf8 helpers, randomBytes

// ---- Symmetric cipher (@noble/ciphers) -------------------------------------
import { ecb } from '@noble/ciphers/aes.js';                     // AES-256-ECB, required by BIP38

// ---- Encodings (@scure/base) -----------------------------------------------
// base58 / base58check (BTC-family WIF+addresses), base58xmr (Monero),
// base58xrp (XRP alphabet), bech32 / bech32m (SegWit, Taproot, Cardano),
// base32 (Stellar StrKey), hex, utf8.
import * as base from '@scure/base';

// ---- HD wallets (@scure/bip32, @scure/bip39) -------------------------------
import { HDKey, HARDENED_OFFSET } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
// All official BIP39 wordlists, so the UI can offer every standard language.
import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { wordlist as czech } from '@scure/bip39/wordlists/czech.js';
import { wordlist as french } from '@scure/bip39/wordlists/french.js';
import { wordlist as italian } from '@scure/bip39/wordlists/italian.js';
import { wordlist as japanese } from '@scure/bip39/wordlists/japanese.js';
import { wordlist as korean } from '@scure/bip39/wordlists/korean.js';
import { wordlist as portuguese } from '@scure/bip39/wordlists/portuguese.js';
import { wordlist as simplifiedChinese } from '@scure/bip39/wordlists/simplified-chinese.js';
import { wordlist as spanish } from '@scure/bip39/wordlists/spanish.js';
import { wordlist as traditionalChinese } from '@scure/bip39/wordlists/traditional-chinese.js';

// __VENDOR_VERSIONS__ is replaced at build time by build.mjs (esbuild "define")
// with the exact installed versions, so the running app can display/verify them.
/* global __VENDOR_VERSIONS__ */

/**
 * Freeze a plain container object (shallow) and return it.
 * Library objects themselves are NOT frozen because some of them cache
 * precomputed tables lazily; only our grouping objects are locked.
 */
function lock(obj) {
  return Object.freeze(obj);
}

const WGVendor = lock({
  versions: lock(__VENDOR_VERSIONS__),
  curves: lock({ secp256k1, schnorr, ed25519, modular, utils: curveUtils }),
  hashes: lock({
    sha256, sha512, sha3_256, keccak_256, ripemd160, blake2b,
    hmac, hkdf, pbkdf2, pbkdf2Async, scrypt, scryptAsync,
    utils: hashUtils,
  }),
  ciphers: lock({ aesEcb: ecb }),
  base,
  bip32: lock({ HDKey, HARDENED_OFFSET }),
  // generateMnemonic is deliberately NOT exported: every secret must come
  // from the app's own entropy pool (js/core/entropy-pool.js), never from a
  // library-internal random source that bypasses user-supplied entropy.
  bip39: lock({
    entropyToMnemonic: bip39.entropyToMnemonic,
    mnemonicToEntropy: bip39.mnemonicToEntropy,
    mnemonicToSeedSync: bip39.mnemonicToSeedSync,
    mnemonicToSeed: bip39.mnemonicToSeed,
    validateMnemonic: bip39.validateMnemonic,
    wordlists: lock({
      english, czech, french, italian, japanese, korean, portuguese,
      'simplified-chinese': simplifiedChinese, spanish,
      'traditional-chinese': traditionalChinese,
    }),
  }),
});

// Publish as a non-writable, non-configurable global: it cannot be reassigned
// or deleted by any script that runs after this one.
Object.defineProperty(globalThis, 'WGVendor', {
  value: WGVendor,
  writable: false,
  configurable: false,
  enumerable: true,
});
