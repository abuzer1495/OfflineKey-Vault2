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
  var toTop = false;    // set while go() renders a new step

  function go(step) {
    state.step = step;
    toTop = true;
    render();
    toTop = false;
  }

  /** Button helper (the id is used by the automated UI test). */
  function button(label, cls, onClick, id) {
    var b = el('button', { type: 'button', class: cls || null, id: id || null }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  /**
   * The "ultra security" guide button.
   * Multi-file edition: a link opening guide/<lang>.html in a new tab (the
   * wallet state here is kept). Single-file edition (tools/release/single-file.mjs
   * embeds the guides as <template id="guide-tr|en">): the guide opens in-page.
   */
  function guideButton() {
    var label = '🛡 ' + t('guideButton');
    if (!document.getElementById('guide-tr')) {
      return el('a', { class: 'guide-btn', id: 'guide-link', href: 'guide/' + WG.i18n.lang() + '.html', target: '_blank', rel: 'noopener' }, label);
    }
    return button(label, 'guide-btn', function () { openGuide(WG.i18n.lang()); }, 'guide-link');
  }

  /** Show an embedded guide as a full-screen layer (single-file edition). */
  function openGuide(lang) {
    var layer = el('div', { class: 'guide-overlay', role: 'dialog', 'aria-modal': 'true', id: 'guide-overlay' });
    function show(l) {
      WG.dom.clear(layer);
      var bar = el('div', { class: 'guide-overlay-bar' }, button('✕ ' + t('helpClose'), 'primary', function () { layer.remove(); }));
      var body = el('div', { class: 'guide' });
      body.appendChild(document.getElementById('guide-' + l).content.cloneNode(true));
      WG.dom.append(layer, [bar, body]);
      layer.scrollTop = 0;
    }
    // Links inside the guide: "back to the app" closes, tr/en switch language, #anchors scroll.
    layer.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/index\.html$/.test(href)) { e.preventDefault(); layer.remove(); }
      else if (/^(tr|en)\.html$/.test(href)) { e.preventDefault(); show(href.slice(0, 2)); }
      else if (href.charAt(0) === '#') {
        e.preventDefault();
        var target = layer.querySelector('[id="' + href.slice(1) + '"]');
        if (target) target.scrollIntoView();
      }
    });
    show(lang);
    document.body.appendChild(layer);
  }

  /** A navigation button together with its "?" help button. */
  function navItem(btn, helpKey) {
    return el('span', { class: 'nav-item' }, btn, WG.help.button(helpKey));
  }

  /** Self-test status (a single line once everything passed). */
  function viewSelftest() {
    var r = state.selftest;
    if (!r) return el('section', { class: 'card' }, el('p', null, t('selftestRunning')));
    var failed = r.results.filter(function (x) { return !x.ok; });
    return el('section', { class: 'card selftest' },
      el('p', { class: failed.length ? 'status-bad' : 'status-good' },
        failed.length ? t('selftestFailed', { failed: failed.length }) : '✓ ' + t('selftestPassed', { passed: r.passed, total: r.total }),
        WG.help.button('selftest')),
      el('details', failed.length ? { open: 'open' } : null,
        el('summary', null, t('selftestDetails')),
        el('ul', { class: 'test-list' }, r.results.map(function (x) {
          return el('li', { class: x.ok ? 'ok' : 'fail' }, (x.ok ? '✓ ' : '✗ ') + x.title + (x.ok ? '' : ' — ' + x.error));
        })),
        // tests/test.html only exists in the multi-file edition.
        document.getElementById('guide-tr') ? null : el('p', null, el('a', { href: 'tests/test.html' }, t('fullTests')))));
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
      nav.appendChild(navItem(button(t('entSkip'), null, function () {
        if (window.confirm(t('entSkipConfirm'))) { state.skipped = true; go(2); }
      }, 'ent-skip'), 'skip'));
      nav.appendChild(navItem(apply, 'apply'));
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
      nav.appendChild(navItem(button('← ' + t('stepEntropy'), null, function () { go(1); }), 'navBack'));
      if (state.wallet) nav.appendChild(navItem(button(t('stepWallet') + ' →', null, function () { go(3); }), 'navForward'));
    } else if (state.step === 3) {
      panel = WG.resultUi.create(state.wallet, { onClear: function () { clearWallet(); go(2); } });
      nav.appendChild(navItem(button('← ' + t('stepSettings'), null, function () { go(2); }), 'navBack'));
      nav.appendChild(navItem(button(t('stepPrint') + ' →', 'primary big', function () { go(4); }, 'to-print'), 'toPrint'));
    } else {
      panel = WG.pdfUi.create(state.wallet, state.layout);
      nav.appendChild(navItem(button('← ' + t('stepWallet'), null, function () { go(3); }), 'navBack'));
      nav.appendChild(navItem(button(t('btnRestart'), 'danger', function () {
        // Start over = new wallet from scratch: also forget the collected entropy.
        if (window.confirm(t('restartConfirm'))) { clearWallet(); pool.reset(); state.skipped = false; go(1); }
      }, 'restart'), 'restart'));
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
    // Same-step re-renders (threshold, language, online/offline) keep the
    // scroll position; a step change (go) starts at the top.
    var y = toTop ? 0 : window.scrollY;
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
        el('div', { class: 'header-row' }, el('h1', null, t('appTitle')), navItem(langBtn, 'lang')),
        el('p', { class: 'muted' }, t('appSubtitle') + ' v' + WG.version),
        el('p', { class: 'guide-row' }, guideButton(), WG.help.button('guide'))),
      el('div', { class: 'banner ' + (state.online ? 'banner-warn' : 'banner-ok'), role: 'status' }, state.online ? t('netOnline') : t('netOffline'), WG.help.button('offline')),
      viewSelftest(),
      healthy ? viewStepper() : null,
      healthy ? el('main', null, viewStep()) : null,
      el('footer', { class: 'muted' },
        el('details', null, el('summary', null, t('vendorTitle'), WG.help.button('vendor')),
          el('ul', null, Object.keys(v).map(function (name) { return el('li', null, name + ' ' + v[name]); }))),
        el('p', null, t('footer'))),
    ]);
    window.scrollTo(0, y);
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
