/*
 * tests/test-page.js
 *
 * PURPOSE
 *   Runs ALL registered tests (critical + full vector suites) and renders a
 *   grouped result table. Also exposes a machine-readable result for headless
 *   runs: document.title = "PASS n/n" | "FAIL f/n" and <pre id="summary">.
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var root = WG.dom.clear(document.getElementById('app'));
  var status = el('p', null, 'Running ' + WG.selftest.count() + ' tests…');
  var tbody = el('tbody');
  var summary = el('pre', { id: 'summary' });

  root.appendChild(el('header', null, el('h1', null, 'Test suite'),
    el('p', { class: 'muted' }, 'OfflineKey Vault v' + WG.version + ' — ' + navigator.userAgent)));
  root.appendChild(el('section', { class: 'card' }, status, summary));
  root.appendChild(el('section', { class: 'card' },
    el('table', { class: 'results' },
      el('thead', null, el('tr', null, el('th', null, ''), el('th', null, 'Test'), el('th', null, 'ms'))),
      tbody)));

  var lastGroup = null;

  /** Append one result row, inserting a group header when the group changes. */
  function addRow(r) {
    if (r.group !== lastGroup) {
      lastGroup = r.group;
      tbody.appendChild(el('tr', { class: 'group' }, el('th', { colspan: '3' }, r.group)));
    }
    tbody.appendChild(el('tr', { class: r.ok ? 'ok' : 'fail' },
      el('td', { class: r.ok ? 'status-good' : 'status-bad' }, r.ok ? '✓' : '✗'),
      el('td', null, r.title + (r.critical ? '  [critical]' : ''), r.ok ? null : el('pre', null, r.error)),
      el('td', { class: 'num' }, String(r.ms))));
  }

  // Run the critical subset first (as index.html does) so that code guarded by
  // WG.selftest.requireHealthy() - e.g. pool.extract() - is unlocked for the full run.
  WG.selftest.run({ criticalOnly: true }).then(function () {
    return WG.selftest.run({ onResult: addRow });
  }).then(function (rep) {
    var ok = rep.failed === 0;
    document.title = ok ? 'PASS ' + rep.passed + '/' + rep.total : 'FAIL ' + rep.failed + '/' + rep.total;
    document.documentElement.setAttribute('data-selftest', ok && WG.selftest.isHealthy() ? 'pass' : 'fail');
    status.textContent = ok
      ? 'All ' + rep.total + ' tests passed.'
      : rep.failed + ' of ' + rep.total + ' tests FAILED.';
    status.className = ok ? 'status-good' : 'status-bad';
    summary.textContent = JSON.stringify({
      passed: rep.passed,
      failed: rep.failed,
      total: rep.total,
      healthy: WG.selftest.isHealthy(),
      failures: rep.results.filter(function (r) { return !r.ok; }).map(function (r) { return { id: r.id, error: r.error }; }),
    }, null, 2);
  });
})(window.WG);
