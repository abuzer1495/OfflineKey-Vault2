/*
 * js/core/namespace.js
 *
 * PURPOSE
 *   Creates the single application global `window.WG` and the module
 *   registration function `WG.define()`. Every other file under /js adds
 *   itself through WG.define(), so the whole app has one predictable shape:
 *   WG.bytes, WG.selftest, WG.entropy, WG.coins, ...
 *
 * LOAD ORDER
 *   Must be the first app script, right after vendor/wg-crypto.js.
 *
 * SECURITY NOTES
 *   - WG itself is non-writable and non-configurable on window.
 *   - A module, once defined, is frozen and cannot be replaced or redefined,
 *     so a later (possibly injected) script cannot swap e.g. the entropy pool.
 *   - WG.vectors is the only intentionally mutable area; it holds test data
 *     for tests/test.html and is never read by key-generation code.
 */
(function (global) {
  'use strict';

  // The crypto bundle must be present; without it nothing can work safely.
  if (!global.WGVendor) {
    throw new Error('vendor/wg-crypto.js must be loaded before js/core/namespace.js');
  }
  if (global.WG) {
    throw new Error('WG namespace is already defined (script loaded twice?)');
  }

  var WG = {};

  /** Application version shown in the UI and printed on generated cards. */
  Object.defineProperty(WG, 'version', { value: '0.6.0', enumerable: true });

  /**
   * Register a module under WG[name].
   * @param {string} name  module name, e.g. "bytes"
   * @param {object} api   public functions/constants of the module
   * @returns {object}     the frozen api object
   */
  function define(name, api) {
    if (typeof name !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      throw new Error('WG.define: invalid module name ' + name);
    }
    if (Object.prototype.hasOwnProperty.call(WG, name)) {
      throw new Error('WG.define: module "' + name + '" already defined');
    }
    var frozen = Object.freeze(api);
    Object.defineProperty(WG, name, { value: frozen, enumerable: true, writable: false, configurable: false });
    return frozen;
  }
  Object.defineProperty(WG, 'define', { value: define });

  /** Test-vector data store filled by tests/vectors/*.js (tests only). */
  Object.defineProperty(WG, 'vectors', { value: {}, enumerable: true });

  Object.defineProperty(global, 'WG', { value: WG, writable: false, configurable: false, enumerable: true });
})(window);
