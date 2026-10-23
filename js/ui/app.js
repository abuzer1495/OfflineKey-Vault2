/*
 * js/ui/app.js
 *
 * PURPOSE
 *   Entry point of index.html. On load it:
 *     1. starts the page-wide entropy collectors (key timing, timer jitter),
 *     2. shows whether the machine is online (and keeps watching),
 *     3. runs the critical self-tests (WG.selftest); only if they pass is the
 *        entropy panel (and, from M2, the generator) shown,
 *     4. renders vendor versions.
 *
 * STRUCTURE
 *   The page is built once into fixed "slots" (network, selftest, entropy,
 *   main, vendor). Status changes re-render only their own slot, so typing
 *   in the entropy panel is never interrupted. A language switch rebuilds
 *   everything (the entropy panel is destroyed and re-created; the pool and
 *   everything already mixed into it are kept).
 *
 * SECURITY NOTES
 *   - Renders exclusively through WG.dom (textContent only).
 *   - If any critical self-test fails, the entropy/generation UI is not
 *     rendered at all (and WG.selftest.requireHealthy() blocks extraction).
 */
(function (WG, V) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var pool = WG.entropy.pool;

  /** Everything the view depends on. */
  var state = {
    online: navigator.onLine,
    selftest: null,      // null = running, otherwise the report from WG.selftest.run()
    threshold: 256,      // credited user bits required before generation (user-selectable)
  };

  var slots = {};            // name -> container element
  var entropyPanel = null;   // current WG.entropyUi panel (destroyed on rebuild)

  /** Network status banner: warns while online, reassures while offline. */
  function renderNetwork() {
    WG.dom.clear(slots.network).appendChild(
      el('div', { class: 'banner ' + (state.online ? 'banner-warn' : 'banner-ok'), role: 'status' },
        state.online ? t('netOnline') : t('netOffline')));
  }

  /** Self-test card: running / passed / failed with a per-test list. */
  function renderSelftest() {
    var r = state.selftest;
    var body;
    if (!r) {
      body = el('p', null, t('selftestRunning'));
    } else {
      var failed = r.results.filter(function (x) { return !x.ok; });
      body = [
        el('p', { class: failed.length ? 'status-bad' : 'status-good' },
          failed.length ? t('selftestFailed', { failed: failed.length }) : t('selftestPassed', { passed: r.passed, total: r.total })),
        el('details', failed.length ? { open: 'open' } : null,
          el('summary', null, t('selftestDetails')),
          el('ul', { class: 'test-list' }, r.results.map(function (x) {
            return el('li', { class: x.ok ? 'ok' : 'fail' },
              (x.ok ? '✓ ' : '✗ ') + x.title + (x.ok ? '' : ' — ' + x.error));
          }))),
        el('p', null, el('a', { href: 'tests/test.html' }, t('fullTests'))),
      ];
    }
    WG.dom.clear(slots.selftest).appendChild(el('section', { class: 'card' }, el('h2', null, t('selftestTitle')), body));
  }

  /** Entropy panel: only shown once the self-tests have passed. */
  function renderEntropy() {
    if (entropyPanel) { entropyPanel.destroy(); entropyPanel = null; }
    WG.dom.clear(slots.entropy);
    if (!WG.selftest.isHealthy()) return;
    entropyPanel = WG.entropyUi.create(pool, {
      threshold: state.threshold,
      onThreshold: function (v) { state.threshold = v; renderEntropy(); },
    });
    slots.entropy.appendChild(entropyPanel.element);
  }

  /** Placeholder for the generator UI (milestone M2). */
  function renderMain() {
    WG.dom.clear(slots.main);
    if (!WG.selftest.isHealthy()) return;
    slots.main.appendChild(el('section', { class: 'card' }, el('h2', null, t('wipTitle')), el('p', null, t('wipBody'))));
  }

  /** Versions of the bundled crypto libraries, straight from WGVendor. */
  function renderVendor() {
    var v = V.versions;
    WG.dom.clear(slots.vendor).appendChild(el('section', { class: 'card' },
      el('details', null,
        el('summary', null, t('vendorTitle')),
        el('ul', null, Object.keys(v).map(function (name) { return el('li', null, name + ' ' + v[name]); })))));
  }

  /** Build the page skeleton and fill every slot (initial load and language switch). */
  function renderAll() {
    document.title = t('appTitle');
    var root = WG.dom.clear(document.getElementById('app'));
    var nextLang = WG.i18n.lang() === 'tr' ? 'en' : 'tr';
    var langBtn = el('button', { type: 'button', class: 'lang' }, t('langSwitch'));
    langBtn.addEventListener('click', function () { WG.i18n.setLang(nextLang); });

    ['network', 'selftest', 'entropy', 'main', 'vendor'].forEach(function (name) { slots[name] = el('div'); });
    root.appendChild(el('header', null,
      el('div', { class: 'header-row' }, el('h1', null, t('appTitle')), langBtn),
      el('p', { class: 'muted' }, t('appSubtitle') + ' v' + WG.version)));
    root.appendChild(slots.network);
    root.appendChild(el('main', null, slots.selftest, slots.entropy, slots.main, slots.vendor));
    root.appendChild(el('footer', { class: 'muted' }, t('footer')));

    renderNetwork();
    renderSelftest();
    renderEntropy();
    renderMain();
    renderVendor();
  }

  /** Start-up sequence. */
  function start() {
    document.documentElement.lang = WG.i18n.lang();
    // Page-wide collectors start immediately; they only feed the pool.
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
      renderEntropy();
      renderMain();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.WG, window.WGVendor);
