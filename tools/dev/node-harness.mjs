/*
 * tools/dev/node-harness.mjs
 *
 * PURPOSE
 *   Developer convenience for fast iteration: loads the same scripts as
 *   tests/test.html into a Node.js VM with minimal browser shims and runs the
 *   registered tests whose id contains the given filter. It is NOT a
 *   substitute for the real browser run (tools/browser-test/run.mjs), which
 *   is what proves the "double-click index.html" rule; DOM-dependent suites
 *   are skipped here.
 *
 * USAGE
 *   node tools/dev/node-harness.mjs [id-filter]
 */

import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const filter = process.argv[2] || '';
const testHtml = readFileSync(join(repo, 'tests', 'test.html'), 'utf8');

// Scripts in test.html order, minus those that need a real DOM (UI, PDF output and their suites).
const SKIP = /test-page\.js|suites\/csp\.js|suites\/entropy\.js|suites\/pdf\.js|js\/ui\/|js\/output\//;
const scripts = [...testHtml.matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map((m) => resolve(join(repo, 'tests'), m[1]))
  .filter((p) => !SKIP.test(p.replace(/\\/g, '/')));

// The CSP test reads the <meta> tag; hand it the real policy from index.html.
const csp = readFileSync(join(repo, 'index.html'), 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];

const ctx = {
  console, crypto: globalThis.crypto, performance: globalThis.performance,
  setTimeout, clearTimeout, TextEncoder, TextDecoder, BigInt, atob, btoa,   // atob/btoa: needed by jsPDF at load
  screen: { width: 0, height: 0 }, devicePixelRatio: 1, navigator: { language: 'en', onLine: false },
  document: { querySelector: () => ({ getAttribute: () => csp }) },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const file of scripts) vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });

const WG = ctx.WG;
await WG.selftest.run({ criticalOnly: true });
const report = await WG.selftest.run({});
let shown = 0;
for (const r of report.results) {
  if (filter && !r.id.includes(filter)) continue;
  shown++;
  if (!r.ok || filter) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.id + ' (' + r.ms + ' ms)' + (r.ok ? '' : '\n      ' + r.error));
}
const failed = report.results.filter((r) => !r.ok && (!filter || r.id.includes(filter))).length;
console.log('\n' + (failed ? 'FAILED ' + failed : 'all passed') + ' — ' + shown + ' shown, ' + report.total + ' total, healthy=' + WG.selftest.isHealthy());
process.exit(failed ? 1 : 0);
