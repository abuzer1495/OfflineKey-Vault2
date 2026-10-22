/*
 * js/core/selftest.js   ->   WG.selftest
 *
 * PURPOSE
 *   Known-answer test (KAT) registry and runner. Modules register tests next to
 *   the code they verify; index.html runs the "critical" subset at start-up and
 *   tests/test.html runs everything.
 *
 * CONTRACT
 *   - Key generation code MUST call WG.selftest.requireHealthy() first.
 *     It throws unless a critical run has completed with zero failures, so a
 *     broken or tampered primitive blocks wallet creation instead of silently
 *     producing wrong (unrecoverable) keys.
 *   - Tests are registered with:
 *       WG.selftest.register({ id, group, title, critical, run: function (t) {...} })
 *     run() may be sync or return a Promise; it signals failure by throwing.
 *     `t` offers assertion helpers: t.ok, t.equal, t.equalHex, t.throws.
 */
(function (WG) {
  'use strict';

  var tests = [];          // registered test descriptors, in registration order
  var ids = {};            // id -> true, prevents duplicate registration
  var healthy = false;     // true only after a passing critical run
  var lastReport = null;   // most recent run() result

  /** Error type for assertion failures (distinguishes them from crashes). */
  function AssertionError(message) {
    this.name = 'AssertionError';
    this.message = message;
    this.stack = new Error(message).stack;
  }
  AssertionError.prototype = Object.create(Error.prototype);

  /** Assertion helpers passed to every test's run(t). */
  var t = Object.freeze({
    /** Fail unless cond is truthy. */
    ok: function (cond, label) {
      if (!cond) throw new AssertionError((label || 'assertion') + ' failed');
    },
    /** Fail unless actual === expected (for strings/numbers/booleans). */
    equal: function (actual, expected, label) {
      if (actual !== expected) {
        throw new AssertionError((label || 'value') + ': expected ' + JSON.stringify(expected) +
          ', got ' + JSON.stringify(actual));
      }
    },
    /** Compare bytes (or a hex string) against an expected hex string. */
    equalHex: function (actual, expectedHex, label) {
      var hex = typeof actual === 'string' ? actual.toLowerCase() : WG.bytes.bytesToHex(actual);
      if (hex !== expectedHex.toLowerCase()) {
        throw new AssertionError((label || 'bytes') + ': expected ' + expectedHex + ', got ' + hex);
      }
    },
    /** Fail unless fn() throws. */
    throws: function (fn, label) {
      try { fn(); } catch (e) { return; }
      throw new AssertionError((label || 'function') + ' was expected to throw');
    },
  });

  /**
   * Register a test.
   * @param {{id:string, group:string, title:string, critical?:boolean, run:function}} test
   */
  function register(test) {
    if (!test || typeof test.id !== 'string' || typeof test.run !== 'function') {
      throw new Error('selftest.register: id and run are required');
    }
    if (ids[test.id]) throw new Error('selftest.register: duplicate test id ' + test.id);
    ids[test.id] = true;
    tests.push(Object.freeze({
      id: test.id,
      group: test.group || 'misc',
      title: test.title || test.id,
      critical: !!test.critical,
      run: test.run,
    }));
  }

  /** Current time in ms (high resolution where available). */
  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  /**
   * Run tests one after another.
   * @param {{criticalOnly?: boolean, onResult?: function}} [opts]
   *   criticalOnly: run only tests flagged critical (start-up mode)
   *   onResult:     callback(result) after each test, for progressive UIs
   * @returns {Promise<{passed:number, failed:number, total:number, criticalOnly:boolean, results:Array}>}
   */
  async function run(opts) {
    opts = opts || {};
    var selected = tests.filter(function (x) { return opts.criticalOnly ? x.critical : true; });
    var results = [];
    var failed = 0;
    for (var i = 0; i < selected.length; i++) {
      var test = selected[i];
      var start = now();
      var result = { id: test.id, group: test.group, title: test.title, critical: test.critical, ok: true, ms: 0, error: null };
      try {
        await test.run(t);
      } catch (e) {
        result.ok = false;
        result.error = (e && e.message) ? e.message : String(e);
        failed++;
      }
      result.ms = Math.round(now() - start);
      results.push(Object.freeze(result));
      if (opts.onResult) opts.onResult(result);
      // Yield to the event loop so the page stays responsive between tests.
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    var criticalFailed = results.some(function (r) { return r.critical && !r.ok; });
    var criticalTotal = tests.filter(function (x) { return x.critical; }).length;
    var criticalRan = results.filter(function (r) { return r.critical; }).length;
    // Healthy requires every critical test to have run in THIS run and passed.
    healthy = criticalTotal > 0 && criticalRan === criticalTotal && !criticalFailed;
    lastReport = Object.freeze({
      passed: results.length - failed,
      failed: failed,
      total: results.length,
      criticalOnly: !!opts.criticalOnly,
      results: Object.freeze(results),
    });
    return lastReport;
  }

  /** Throw unless the last run proved every critical primitive correct. */
  function requireHealthy() {
    if (!healthy) throw new Error('Self-test has not passed; key generation is locked.');
  }

  WG.define('selftest', {
    register: register,
    run: run,
    requireHealthy: requireHealthy,
    isHealthy: function () { return healthy; },
    lastReport: function () { return lastReport; },
    count: function () { return tests.length; },
  });
})(window.WG);
