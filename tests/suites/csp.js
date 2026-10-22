/*
 * tests/suites/csp.js
 *
 * PURPOSE
 *   Proves that the Content-Security-Policy network kill-switch is actually
 *   enforced by THIS browser for pages opened from file://. It attempts a
 *   request to a local "discard" port (127.0.0.1:9, nothing leaves the
 *   machine even if CSP were broken) and expects the browser to block it
 *   with a connect-src violation before any connection is attempted.
 *
 *   Only tests/test.html loads this file; index.html never makes a request.
 *   The URL contains "wg-csp-canary" so tooling can ignore the expected
 *   console error.
 */
(function (WG) {
  'use strict';

  var CANARY = 'http://127.0.0.1:9/wg-csp-canary';

  /** Resolve with the violated directive for the canary URL, or null after a timeout. */
  function waitForViolation(ms) {
    return new Promise(function (resolve) {
      function onViolation(e) {
        if (String(e.blockedURI || '').indexOf('127.0.0.1') !== -1) {
          document.removeEventListener('securitypolicyviolation', onViolation);
          resolve(e.effectiveDirective || e.violatedDirective || '');
        }
      }
      document.addEventListener('securitypolicyviolation', onViolation);
      setTimeout(function () {
        document.removeEventListener('securitypolicyviolation', onViolation);
        resolve(null);
      }, ms);
    });
  }

  WG.selftest.register({
    id: 'csp.connect-blocked', group: 'Content-Security-Policy',
    title: 'fetch() to the network is blocked by CSP connect-src (canary request)',
    run: async function (t) {
      var violation = waitForViolation(3000);
      var rejected = await fetch(CANARY).then(function () { return false; }, function () { return true; });
      t.ok(rejected, 'fetch() was rejected');
      var directive = await violation;
      t.ok(directive !== null, 'a securitypolicyviolation event fired');
      t.equal(String(directive).split(' ')[0], 'connect-src', 'violated directive');
    },
  });
})(window.WG);
