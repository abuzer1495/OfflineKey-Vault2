/*
 * js/ui/app.js
 *
 * PURPOSE
 *   Entry point of index.html. It owns the page state and the order of the
 *   panels:
 *     network banner -> self-test -> 1. entropy -> 2. wallet settings
 *     -> 3. generated wallet -> 4. print/PDF -> bundled libraries
 *   On load it starts the page-wide entropy collectors, runs the critical
 *   self-tests and only then shows panels 1-4.
 *
 * STRUCTURE
 *   Each panel lives in a fixed "slot" and is re-rendered on its own, so
 *   typing in one panel is never interrupted by another. A language switch
 *   rebuilds everything; state (pool, settings, layout, wallet) is kept.
 *
 * SECURITY NOTES
 *   - Renders only through WG.dom (textContent).
 *   - Nothing is rendered beyond the self-test card if a critical test fails.
 *   - "Clear" wipes the wallet set and the passphrase/password fields.
 */
(function (WG, V) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var pool = WG.entropy.pool;

  /** Everything the view depends on. */
  var state = {
    online: navigator.onLine,
    selftest: null,                         // report of the start-up run (null while running)
    threshold: 256,                         // credited user bits required before generation
    settings: WG.generatorUi.defaults(),    // panel 2 choices
    layout: WG.pdf.defaults(),              // panel 4 choices
    wallet: null,                           // generated wallet set
    error: null,                            // last generation error message
  };

  var SLOTS = ['network', 'selftest', 'entropy', 'generator', 'result', 'pdf', 'vendor'];
  var slots = {};
  var panels = {};                          // slot -> {destroy()} of the panel currently shown

  /** Replace the content of a slot, destroying the previous panel there. */
  function mount(name, panel) {
    if (panels[name]) panels[name].destroy();
    panels[name] = panel && panel.destroy ? panel : null;
    WG.dom.clear(slots[name]);
    if (panel) slots[name].appendChild(panel.element || panel);
  }

  /** Network status banner. */
  function renderNetwork() {
    mount('network', el('div', { class: 'banner ' + (state.online ? 'banner-warn' : 'banner-ok'), role: 'status' },
      state.online ? t('netOnline') : t('netOffline')));
  }

  /** Self-test card. */
  function renderSelftest() {
    var r = state.selftest;
    var body = el('p', null, t('selftestRunning'));
    if (r) {
      var failed = r.results.filter(function (x) { return !x.ok; });
      body = [
        el('p', { class: failed.length ? 'status-bad' : 'status-good' },
          failed.length ? t('selftestFailed', { failed: failed.length }) : t('selftestPassed', { passed: r.passed, total: r.total })),
        el('details', failed.length ? { open: 'open' } : null,
          el('summary', null, t('selftestDetails')),
          el('ul', { class: 'test-list' }, r.results.map(function (x) {
            return el('li', { class: x.ok ? 'ok' : 'fail' }, (x.ok ? '✓ ' : '✗ ') + x.title + (x.ok ? '' : ' — ' + x.error));
          }))),
        el('p', null, el('a', { href: 'tests/test.html' }, t('fullTests'))),
      ];
    }
    mount('selftest', el('section', { class: 'card' }, el('h2', null, t('selftestTitle')), body));
  }

  /** Panels 1 and 2 (shown only after the self-tests passed). */
  function renderEntropyAndGenerator() {
    if (!WG.selftest.isHealthy()) { mount('entropy', null); mount('generator', null); return; }
    mount('entropy', WG.entropyUi.create(pool, {
      threshold: state.threshold,
      onThreshold: function (v) { state.threshold = v; renderEntropyAndGenerator(); },
    }));
    mount('generator', WG.generatorUi.create(pool, {
      settings: state.settings,
      threshold: state.threshold,
      onGenerated: function (set) {
        if (state.wallet) state.wallet.wipe();
        state.wallet = set;
        state.error = null;
        renderResultAndPdf();
        slots.result.scrollIntoView({ behavior: 'smooth' });
      },
      onError: function (e) {
        state.error = t('genError', { msg: e.message });
        renderResultAndPdf();
      },
    }));
  }

  /** Panels 3 and 4. */
  function renderResultAndPdf() {
    if (state.error) {
      mount('result', el('section', { class: 'card' }, el('p', { class: 'status-bad', role: 'alert' }, state.error)));
    } else if (state.wallet) {
      mount('result', WG.resultUi.create(state.wallet, {
        onPdf: function () { slots.pdf.scrollIntoView({ behavior: 'smooth' }); },
        onClear: clearWallet,
      }));
    } else {
      mount('result', null);
    }
    mount('pdf', state.wallet ? WG.pdfUi.create(state.wallet, state.layout) : null);
  }

  /** Wipe the wallet set and every typed secret, then remove panels 3 and 4. */
  function clearWallet() {
    if (state.wallet) state.wallet.wipe();
    state.wallet = null;
    state.error = null;
    var s = state.settings;
    s.passphrase = s.passphrase2 = s.bip38.password = s.bip38.password2 = '';
    state.layout.bgFront = state.layout.bgBack = null;
    renderEntropyAndGenerator();
    renderResultAndPdf();
  }

  /** Versions of the bundled libraries. */
  function renderVendor() {
    var v = V.versions;
    mount('vendor', el('section', { class: 'card' },
      el('details', null,
        el('summary', null, t('vendorTitle')),
        el('ul', null, Object.keys(v).map(function (name) { return el('li', null, name + ' ' + v[name]); })))));
  }

  /** Build the page skeleton and fill every slot (initial load and language switch). */
  function renderAll() {
    document.title = t('appTitle');
    // Detach the listeners of the panels being thrown away (language switch).
    SLOTS.forEach(function (name) { if (panels[name]) panels[name].destroy(); panels[name] = null; });
    var root = WG.dom.clear(document.getElementById('app'));
    var langBtn = el('button', { type: 'button', class: 'lang' }, t('langSwitch'));
    langBtn.addEventListener('click', function () { WG.i18n.setLang(WG.i18n.lang() === 'tr' ? 'en' : 'tr'); });
    SLOTS.forEach(function (name) { slots[name] = el('div'); });
    root.appendChild(el('header', null,
      el('div', { class: 'header-row' }, el('h1', null, t('appTitle')), langBtn),
      el('p', { class: 'muted' }, t('appSubtitle') + ' v' + WG.version)));
    root.appendChild(slots.network);
    root.appendChild(el('main', null, SLOTS.slice(1).map(function (name) { return slots[name]; })));
    root.appendChild(el('footer', { class: 'muted' }, t('footer')));
    renderNetwork();
    renderSelftest();
    renderEntropyAndGenerator();
    renderResultAndPdf();
    renderVendor();
  }

  /** Start-up sequence. */
  function start() {
    document.documentElement.lang = WG.i18n.lang();
    WG.entropySources.attachKeyboard(document, pool);
    WG.entropySources.collectJitter(pool, 64);
    WG.i18n.onChange(renderAll);
    window.addEventListener('online', function () { state.online = true; renderNetwork(); });
    window.addEventListener('offline', function () { state.online = false; renderNetwork(); });
    renderAll();
    WG.selftest.run({ criticalOnly: true }).then(function (report) {
      state.selftest = report;
      // Machine-readable outcome for tools/browser-test/run.mjs (headless checks).
      document.documentElement.setAttribute('data-selftest', report.failed === 0 && WG.selftest.isHealthy() ? 'pass' : 'fail');
      renderSelftest();
      renderEntropyAndGenerator();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.WG, window.WGVendor);
