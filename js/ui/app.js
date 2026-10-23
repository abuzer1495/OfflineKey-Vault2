/*
 * js/ui/app.js
 *
 * PURPOSE
 *   Entry point of index.html: a four-step wizard with Back / Next buttons.
 *     1. Entropy   collect randomness; "Apply and continue" (needs the chosen
 *                  minimum) or "Skip" (browser CSPRNG only, after a warning)
 *     2. Settings  wallet type, coins, options, "Generate wallet"
 *     3. Wallet    the generated, verified wallet
 *     4. Print     visual PDF layout and download
 *   Above the steps: network banner and self-test status. Steps are shown
 *   only after the critical self-tests passed.
 *
 * STATE
 *   One `state` object; render() rebuilds the page from it. The entropy pool,
 *   settings, layout and wallet live outside the panels, so going back and
 *   forth or switching language loses nothing.
 *
 * SECURITY NOTES
 *   - Renders only through WG.dom (textContent).
 *   - "Skip" sets the required user entropy to 0; the CSPRNG is always used.
 *   - "Clear" wipes the wallet set and every typed passphrase/password.
 */
(function (WG, V) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var pool = WG.entropy.pool;

  var state = {
    online: navigator.onLine,
    selftest: null,                         // start-up self-test report (null while running)
    step: 1,                                // 1..4
    threshold: 256,                         // credited user bits for "Apply"
    skipped: false,                         // user chose "Skip" in step 1
    settings: WG.generatorUi.defaults(),
    layout: WG.pdf.defaults(),
    wallet: null,
    error: null,
  };

  var panel = null;          // panel object of the current step ({element, destroy})
  var unsubscribe = null;    // pool listener of step 1's navigation bar

  var STEPS = ['stepEntropy', 'stepSettings', 'stepWallet', 'stepPrint'];

  /** Go to a step and scroll to the top. */
  function go(step) {
    state.step = step;
    render();
    window.scrollTo(0, 0);
  }

  /** Button helper (the id is used by the automated UI test). */
  function button(label, cls, onClick, id) {
    var b = el('button', { type: 'button', class: cls || null, id: id || null }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  /** Self-test status (a single line once everything passed). */
  function viewSelftest() {
    var r = state.selftest;
    if (!r) return el('section', { class: 'card' }, el('p', null, t('selftestRunning')));
    var failed = r.results.filter(function (x) { return !x.ok; });
    return el('section', { class: 'card selftest' },
      el('p', { class: failed.length ? 'status-bad' : 'status-good' },
        failed.length ? t('selftestFailed', { failed: failed.length }) : '✓ ' + t('selftestPassed', { passed: r.passed, total: r.total })),
      el('details', failed.length ? { open: 'open' } : null,
        el('summary', null, t('selftestDetails')),
        el('ul', { class: 'test-list' }, r.results.map(function (x) {
          return el('li', { class: x.ok ? 'ok' : 'fail' }, (x.ok ? '✓ ' : '✗ ') + x.title + (x.ok ? '' : ' — ' + x.error));
        })),
        el('p', null, el('a', { href: 'tests/test.html' }, t('fullTests')))));
  }

  /** Step indicator: 1 Entropy › 2 Settings › 3 Wallet › 4 Print. */
  function viewStepper() {
    return el('ol', { class: 'stepper' }, STEPS.map(function (key, i) {
      var n = i + 1;
      return el('li', { class: n === state.step ? 'current' : (n < state.step ? 'done' : null) }, n + '. ' + t(key));
    }));
  }

  /** Current step: its panel and its navigation bar. */
  function viewStep() {
    var nav = el('div', { class: 'wizard-nav' });
    if (state.step === 1) {
      panel = WG.entropyUi.create(pool, {
        threshold: state.threshold,
        onThreshold: function (v) { state.threshold = v; render(); },
      });
      var apply = button(t('entApply'), 'primary big', function () { state.skipped = false; go(2); }, 'ent-apply');
      var refresh = function () { apply.disabled = pool.stats().creditedBits < state.threshold; };
      refresh();
      unsubscribe = pool.onChange(function () { requestAnimationFrame(refresh); });
      nav.appendChild(button(t('entSkip'), null, function () {
        if (window.confirm(t('entSkipConfirm'))) { state.skipped = true; go(2); }
      }, 'ent-skip'));
      nav.appendChild(apply);
    } else if (state.step === 2) {
      panel = WG.generatorUi.create(pool, {
        settings: state.settings,
        threshold: state.skipped ? 0 : state.threshold,
        onGenerated: function (set) {
          if (state.wallet) state.wallet.wipe();
          state.wallet = set;
          state.error = null;
          go(3);
        },
        onError: function (e) { state.error = t('genError', { msg: e.message }); render(); },
      });
      nav.appendChild(button('← ' + t('stepEntropy'), null, function () { go(1); }));
      if (state.wallet) nav.appendChild(button(t('stepWallet') + ' →', null, function () { go(3); }));
    } else if (state.step === 3) {
      panel = WG.resultUi.create(state.wallet, { onClear: function () { clearWallet(); go(2); } });
      nav.appendChild(button('← ' + t('stepSettings'), null, function () { go(2); }));
      nav.appendChild(button(t('stepPrint') + ' →', 'primary big', function () { go(4); }, 'to-print'));
    } else {
      panel = WG.pdfUi.create(state.wallet, state.layout);
      nav.appendChild(button('← ' + t('stepWallet'), null, function () { go(3); }));
      nav.appendChild(button(t('btnRestart'), 'danger', function () {
        // Start over = new wallet from scratch: also forget the collected entropy.
        if (window.confirm(t('restartConfirm'))) { clearWallet(); pool.reset(); state.skipped = false; go(1); }
      }, 'restart'));
    }
    var notes = [];
    if (state.step === 2 && state.skipped) notes.push(el('p', { class: 'banner banner-warn' }, t('entSkipped')));
    if (state.step === 2 && state.error) notes.push(el('p', { class: 'status-bad', role: 'alert' }, state.error));
    return [notes, panel.element, nav];
  }

  /** Wipe the wallet and every typed secret. */
  function clearWallet() {
    if (state.wallet) state.wallet.wipe();
    state.wallet = null;
    state.error = null;
    var s = state.settings;
    s.passphrase = s.passphrase2 = s.bip38.password = s.bip38.password2 = '';
    state.layout.bgFront = state.layout.bgBack = null;
  }

  /** Rebuild the page from state. */
  function render() {
    if (panel && panel.destroy) panel.destroy();
    if (unsubscribe) unsubscribe();
    panel = null;
    unsubscribe = null;
    if (state.step > 2 && !state.wallet) state.step = 2;     // nothing to show without a wallet
    document.title = t('appTitle');
    var langBtn = button(t('langSwitch'), 'lang', function () { WG.i18n.setLang(WG.i18n.lang() === 'tr' ? 'en' : 'tr'); });
    var healthy = WG.selftest.isHealthy();
    var v = V.versions;
    WG.dom.append(WG.dom.clear(document.getElementById('app')), [
      el('header', null,
        el('div', { class: 'header-row' }, el('h1', null, t('appTitle')), langBtn),
        el('p', { class: 'muted' }, t('appSubtitle') + ' v' + WG.version)),
      el('div', { class: 'banner ' + (state.online ? 'banner-warn' : 'banner-ok'), role: 'status' }, state.online ? t('netOnline') : t('netOffline')),
      viewSelftest(),
      healthy ? viewStepper() : null,
      healthy ? el('main', null, viewStep()) : null,
      el('footer', { class: 'muted' },
        el('details', null, el('summary', null, t('vendorTitle')),
          el('ul', null, Object.keys(v).map(function (name) { return el('li', null, name + ' ' + v[name]); }))),
        el('p', null, t('footer'))),
    ]);
  }

  /** Start-up sequence. */
  function start() {
    document.documentElement.lang = WG.i18n.lang();
    WG.entropySources.attachKeyboard(document, pool);
    WG.entropySources.collectJitter(pool, 64);
    WG.i18n.onChange(render);
    window.addEventListener('online', function () { state.online = true; render(); });
    window.addEventListener('offline', function () { state.online = false; render(); });
    render();
    WG.selftest.run({ criticalOnly: true }).then(function (report) {
      state.selftest = report;
      // Machine-readable outcome for tools/browser-test/run.mjs (headless checks).
      document.documentElement.setAttribute('data-selftest', report.failed === 0 && WG.selftest.isHealthy() ? 'pass' : 'fail');
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.WG, window.WGVendor);
