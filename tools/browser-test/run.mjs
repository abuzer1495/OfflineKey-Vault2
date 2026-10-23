/*
 * tools/browser-test/run.mjs
 *
 * PURPOSE
 *   Developer convenience: opens index.html and tests/test.html from file://
 *   in every installed desktop browser (headless, throw-away profile) and
 *   reports the self-test outcome plus any console/CSP errors. It proves the
 *   "double-click and it works" rule in real engines (Blink + Gecko).
 *   Safari/WebKit must still be checked by hand on macOS/iOS.
 *
 * USAGE
 *   node tools/browser-test/run.mjs            # all browsers found
 *   node tools/browser-test/run.mjs firefox    # only names containing "firefox"
 *
 * HOW IT READS RESULTS
 *   Pages set <html data-selftest="pass|fail"> when their run finishes, and
 *   tests/test.html also sets document.title to "PASS n/n" | "FAIL f/n".
 *   Chromium: --dump-dom after a virtual-time budget; console via stderr.
 *   Firefox:  WebDriver BiDi over WebSocket (no --dump-dom in Firefox).
 *   Firefox also runs the full UI flow in smoke.js (entropy -> generate -> PDF);
 *   with WG_SAMPLE_DIR=<dir> it writes the sample PDFs of samples.js there,
 *   with WG_SHOT_DIR=<dir> full-page screenshots of step 1 and step 4.
 *
 * Needs only Node.js >= 22 (global WebSocket); no npm packages.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const pages = ['index.html', 'tests/test.html'];
const filter = (process.argv[2] || '').toLowerCase();

/** Known install locations per OS; the first existing path per browser wins. */
const candidates = {
  win32: [
    ['chrome', 'chromium', ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']],
    ['edge', 'chromium', ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']],
    ['firefox', 'firefox', ['C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe']],
  ],
  darwin: [
    ['chrome', 'chromium', ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']],
    ['edge', 'chromium', ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']],
    ['firefox', 'firefox', ['/Applications/Firefox.app/Contents/MacOS/firefox']],
  ],
  linux: [
    ['chrome', 'chromium', ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']],
    ['edge', 'chromium', ['/usr/bin/microsoft-edge']],
    ['firefox', 'firefox', ['/usr/bin/firefox']],
  ],
}[process.platform] || [];

const browsers = candidates
  .map(([name, kind, paths]) => ({ name, kind, exe: paths.find((p) => existsSync(p)) }))
  .filter((b) => b.exe && b.name.includes(filter));

/**
 * Filter for console lines that are expected and harmless:
 *  - the deliberate CSP canary request made by tests/suites/csp.js
 *  - messages from the browser's own built-in extensions (e.g. Edge components)
 */
function notExpected(line) {
  return !/wg-csp-canary|chrome-extension:\/\//.test(line);
}

/** Run a process, collect stdout/stderr, kill it after timeoutMs. */
function runProcess(exe, args, timeoutMs) {
  return new Promise((res) => {
    const p = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.on('close', () => { clearTimeout(timer); res({ out, err }); });
  });
}

/** Chromium: dump the DOM after the page had 60s of virtual time to finish. */
async function testChromium(b, url) {
  const profile = mkdtempSync(join(tmpdir(), 'wg-' + b.name + '-'));
  try {
    const { out, err } = await runProcess(b.exe, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profile, '--enable-logging=stderr', '--v=0',
      '--virtual-time-budget=60000', '--dump-dom', url,
    ], 180000);
    const status = (out.match(/data-selftest="(\w+)"/) || [])[1] || 'none';
    const title = (out.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const problems = err.split(/\r?\n/).filter((l) => /CONSOLE|Content Security Policy|Refused|Uncaught/i.test(l)).filter(notExpected);
    return { status, title, problems };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Firefox: drive the page through WebDriver BiDi and poll for the result. */
async function testFirefox(b, url) {
  const profile = mkdtempSync(join(tmpdir(), 'wg-firefox-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const p = spawn(b.exe, ['--headless', '--remote-debugging-port=' + port, '-profile', profile, '-no-remote'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // Wait until Firefox announces the BiDi endpoint.
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('firefox did not start BiDi')), 60000);
      const onData = (d) => { if (/WebDriver BiDi listening/.test(String(d))) { clearTimeout(timer); res(); } };
      p.stderr.on('data', onData);
      p.stdout.on('data', onData);
    });
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/session');
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('BiDi websocket failed')); });
    let nextId = 1;
    const pending = new Map();
    const problems = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      if (msg.method === 'log.entryAdded') {
        const e = msg.params;
        if ((e.level === 'error' || e.level === 'warn') && notExpected(e.text)) problems.push(e.level + ': ' + e.text);
      }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, (msg) => (msg.type === 'error' ? rej(new Error(method + ': ' + msg.message)) : res(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
    await send('session.new', { capabilities: {} });
    await send('session.subscribe', { events: ['log.entryAdded'] });
    const tree = await send('browsingContext.getTree', {});
    const context = tree.contexts[0].context;
    await send('browsingContext.navigate', { context, url, wait: 'complete' });
    const evalStr = async (expr) => (await send('script.evaluate', { expression: expr, target: { context }, awaitPromise: false })).result.value;
    let status = 'none';
    for (let i = 0; i < 120 && status === 'none'; i++) {
      status = (await evalStr("document.documentElement.getAttribute('data-selftest') || 'none'")) || 'none';
      if (status === 'none') await new Promise((r) => setTimeout(r, 500));
    }
    const title = await evalStr('document.title');
    // UI smoke test on the app page: commit 6 dice through the buffered input,
    // flip one coin and expect 6 x 2.585 + 1 = 16.5 credited bits on the meter.
    if (status === 'pass' && url.endsWith('/index.html')) {
      const meter = (await send('script.evaluate', {
        expression: `(async () => {
          document.getElementById('dice-input').value = '1 2 3, 4 5 6';
          document.getElementById('dice-add').click();
          document.getElementById('coin-heads').click();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return document.querySelector('.meter-text').textContent;
        })()`,
        target: { context }, awaitPromise: true,
      })).result.value;
      if (!/^16 \/ 256 bit$/.test(meter)) problems.push('ui smoke: meter shows "' + meter + '", expected "16 / 256 bit"');
      // Optional screenshots (full page) for visual review.
      const shot = async (name) => {
        if (!process.env.WG_SHOT_DIR) return;
        const r = await send('browsingContext.captureScreenshot', { context, origin: 'document' });
        writeFileSync(join(process.env.WG_SHOT_DIR, name + '.png'), Buffer.from(r.data, 'base64'));
      };
      await shot('step1');
      // Full user flow: entropy -> all coins -> generate -> PDF (see smoke.js).
      const smoke = JSON.parse((await send('script.evaluate', {
        expression: readFileSync(join(here, 'smoke.js'), 'utf8'), target: { context }, awaitPromise: true,
      })).result.value);
      await shot('step4');
      if (smoke.error || smoke.coinCards !== 10 || !smoke.checksOk || !smoke.revealOk || !smoke.dragOk || !smoke.typeOk || !smoke.pdfMsg || !smoke.restartOk) problems.push('ui flow: ' + JSON.stringify(smoke));
      // Optional sample PDFs for visual review.
      if (process.env.WG_SAMPLE_DIR) {
        const samples = JSON.parse((await send('script.evaluate', {
          expression: readFileSync(join(here, 'samples.js'), 'utf8'), target: { context }, awaitPromise: true,
        })).result.value);
        for (const [name, data] of Object.entries(samples)) writeFileSync(join(process.env.WG_SAMPLE_DIR, name + '.pdf'), Buffer.from(data, 'base64'));
      }
    }
    await send('session.end', {}).catch(() => {});
    ws.close();
    return { status, title, problems };
  } finally {
    p.kill();
    await new Promise((r) => setTimeout(r, 1000));
    rmSync(profile, { recursive: true, force: true });
  }
}

let failures = 0;
if (!browsers.length) {
  console.error('no supported browser found');
  process.exit(2);
}
for (const b of browsers) {
  for (const page of pages) {
    const url = pathToFileURL(join(repo, page)).href;
    let r;
    try {
      r = b.kind === 'firefox' ? await testFirefox(b, url) : await testChromium(b, url);
    } catch (e) {
      r = { status: 'error', title: e.message, problems: [] };
    }
    const ok = r.status === 'pass' && r.problems.length === 0;
    if (!ok) failures++;
    console.log((ok ? 'OK   ' : 'FAIL ') + b.name.padEnd(8) + page.padEnd(18) + 'selftest=' + r.status + (r.title ? '  title="' + r.title + '"' : ''));
    for (const line of r.problems) console.log('       ' + line.trim());
  }
}
process.exit(failures ? 1 : 0);
