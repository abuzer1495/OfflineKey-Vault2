/*
 * js/core/bytes.js   ->   WG.bytes
 *
 * PURPOSE
 *   Small, strict helpers for Uint8Array handling used everywhere else:
 *   hex/UTF-8 conversion, concatenation, constant-time comparison and
 *   best-effort wiping of secret buffers.
 *
 * SECURITY NOTES
 *   - Conversions are strict: malformed hex throws instead of being silently
 *     truncated (a truncated key would be a catastrophic, silent bug).
 *   - equal() runs in time independent of where the first difference is.
 *   - wipe() overwrites buffers with zeros. JavaScript gives no guarantee that
 *     no other copy exists (GC, string interning), so this reduces, but does
 *     not eliminate, the lifetime of secrets in memory.
 */
(function (WG, V) {
  'use strict';

  var hu = V.hashes.utils;

  /** True if x is a Uint8Array (rejects plain arrays, strings, Buffers from other realms). */
  function isBytes(x) {
    return x instanceof Uint8Array;
  }

  /** Throw unless x is a Uint8Array, optionally of an exact length. */
  function assertBytes(x, len, label) {
    if (!isBytes(x)) throw new TypeError((label || 'value') + ' must be a Uint8Array');
    if (len !== undefined && x.length !== len) {
      throw new RangeError((label || 'value') + ' must be ' + len + ' bytes, got ' + x.length);
    }
    return x;
  }

  /** Lower-case hex string -> bytes. Rejects odd length and non-hex characters. */
  function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
      throw new TypeError('invalid hex string');
    }
    return hu.hexToBytes(hex.toLowerCase());
  }

  /** Bytes -> lower-case hex string. */
  function bytesToHex(bytes) {
    return hu.bytesToHex(assertBytes(bytes));
  }

  /** JS string -> UTF-8 bytes (NFKD normalisation is the caller's job where a spec needs it). */
  function utf8ToBytes(str) {
    if (typeof str !== 'string') throw new TypeError('utf8ToBytes expects a string');
    return hu.utf8ToBytes(str);
  }

  /** Concatenate any number of Uint8Arrays into a new one. */
  function concat() {
    var parts = Array.prototype.slice.call(arguments);
    parts.forEach(function (p, i) { assertBytes(p, undefined, 'concat argument ' + i); });
    return hu.concatBytes.apply(null, parts);
  }

  /** Constant-time equality of two byte arrays (length difference returns false). */
  function equal(a, b) {
    assertBytes(a); assertBytes(b);
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /** Overwrite every given Uint8Array with zeros (ignores null/undefined). */
  function wipe() {
    for (var i = 0; i < arguments.length; i++) {
      var b = arguments[i];
      if (isBytes(b)) b.fill(0);
    }
  }

  WG.define('bytes', {
    isBytes: isBytes,
    assertBytes: assertBytes,
    hexToBytes: hexToBytes,
    bytesToHex: bytesToHex,
    utf8ToBytes: utf8ToBytes,
    concat: concat,
    equal: equal,
    wipe: wipe,
  });
})(window.WG, window.WGVendor);
