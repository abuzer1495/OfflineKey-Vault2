/*
 * js/ui/app.js
 *
 * PURPOSE
 *   Entry point of index.html. On load it:
 *     1. shows whether the machine is online (and keeps watching),
 *     2. runs the critical self-tests (WG.selftest) and locks the app if any fail,
 *     3. renders the (M0 placeholder) main panel and vendor versions.
 *   The whole page is re-rendered from `state` on every change, which keeps the
 *   UI logic simple and makes it obvious where each piece of text comes from.
 *
 * SECURITY NOTES
 *   - Renders exclusively through WG.dom (textContent only).
 *   - Holds no secrets yet; future wallet panels must keep secrets out of
 *     `state` once they are displayed and wipe them on "clear".
 */
(function (WG, V) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;

  /** Everything the view depends on. */
  var state = {
    online: navigator.onLine,
    selftest: null,      // null = running, otherwise the report from WG.selftest.run()
  };

  /** Network status banner: warns while online, reassures while offline. */
  function viewNetwork() {
    return el('div', { class: 'banner ' + (state.online ? 'banner-warn' : 'banner-ok'), role: 'status' },
      state.online ? t('netOnline') : t('netOffline'));
  }

  /** Self-test card: running / passed / failed with a per-test list. */
  function viewSelftest() {
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
    return el('section', { class: 'card' }, el('h2', null, t('selftestTitle')), body);
  }

  /** Placeholder for the generator UI (milestones M1+). */
  function viewMain() {
    return el('section', { class: 'card' }, el('h2', null, t('wipTitle')), el('p', null, t('wipBody')));
  }

  /** Versions of the bundled crypto libraries, straight from WGVendor. */
  function viewVendor() {
    var v = V.versions;
    return el('section', { class: 'card' },
      el('details', null,
        el('summary', null, t('vendorTitle')),
        el('ul', null, Object.keys(v).map(function (name) { return el('li', null, name + ' ' + v[name]); }))));
  }

  /** Rebuild the whole page from state. */
  function render() {
    document.title = t('appTitle');
    var root = WG.dom.clear(document.getElementById('app'));
    var nextLang = WG.i18n.lang() === 'tr' ? 'en' : 'tr';
    var langBtn = el('button', { type: 'button', class: 'lang' }, t('langSwitch'));
    langBtn.addEventListener('click', function () { WG.i18n.setLang(nextLang); });

    root.appendChild(el('header', null,
      el('div', { class: 'header-row' }, el('h1', null, t('appTitle')), langBtn),
      el('p', { class: 'muted' }, t('appSubtitle') + ' v' + WG.version)));
    root.appendChild(viewNetwork());
    root.appendChild(el('main', null, viewSelftest(), viewMain(), viewVendor()));
    root.appendChild(el('footer', { class: 'muted' }, t('footer')));
  }

  /** Start-up sequence. */
  function start() {
    document.documentElement.lang = WG.i18n.lang();
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
