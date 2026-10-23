# AI security audit specification

You are auditing **OfflineKey Vault** (repository `snipeTR/OfflineKey-Vault`), a static web app that generates cryptocurrency paper wallets offline by opening `index.html` from `file://`.
Report every way an attacker could learn, predict, alter or exfiltrate generated secrets, or make the app produce unrecoverable or wrong keys.

## 1. System facts

1. There is no server, build step or network code; all logic is classic `<script src>` JavaScript loaded in the order listed in `index.html`.
2. Third-party code lives only in `vendor/` (versions and SHA-256 in `vendor/VENDOR.md` and `vendor/SHA256SUMS`, rebuilt reproducibly by `tools/vendor-build/`), and app code reaches crypto only through the frozen global `WGVendor`.
3. App modules register through `WG.define()` into the frozen, non-writable global `WG` (`js/core/namespace.js`).
4. Secret randomness comes only from `js/core/entropy-pool.js`: every extraction is `HKDF-SHA512(64 fresh crypto.getRandomValues bytes || SHA-512 pool state)`; user events (dice, coin flips, pointer, key timing, text, jitter) are only mixed into the pool; "dice-only" mode is the sole exception and equals `SHA-256(roll digits)`.
5. `js/wallet/generator.js` is the only place that creates keys; it supports BIP39, SLIP-39 and single-key modes, keeps Monero on its own seed, and returns a set only after re-decoding every backup and printed key and re-deriving every address.
6. Coin derivations live in `js/derive/` and `js/coins/`; optional security features (SLIP-39, BIP38) live in `js/secure/`.
7. `js/core/selftest*.js` and `js/coins/selftest-coins.js` run known-answer tests at start-up, and `WG.selftest.requireHealthy()` blocks generation if any fails.
8. UI code is in `js/ui/`, PDF output in `js/output/`; all text is inserted with `textContent` via `js/ui/dom.js`; the security guide pages `guide/*.html` are static HTML with no scripts.
9. The Content-Security-Policy `<meta>` in `index.html` sets `default-src 'none'`, `script-src 'self'`, `connect-src 'none'` and `form-action 'none'`; the phone edition `OfflineKey-Vault-X.Y.Z.html`, built by `tools/release/single-file.mjs`, inlines the same files and replaces `'self'` with the SHA-256 hashes of exactly those inlined scripts and stylesheet.
10. `tests/test.html` runs every test against official vectors pinned to upstream commits in `tests/vectors/`, and `tools/browser-test/run.mjs` runs it headless in Chrome, Edge and Firefox.
11. Releases are built, tested and published by `.github/workflows/release.yml` on a pushed `vX.Y.Z` tag, with SHA-pinned actions and GitHub-signed build provenance for the zip and the single-file edition.

## 2. Threat model

Assume the user follows the instructions on an offline machine; consider a malicious or buggy vendor file, a modified copy of the zip, a weak or backdoored `crypto.getRandomValues`, hostile user input, browser extensions, and mistakes that make backups unrecoverable.
Out of scope: a fully compromised operating system, physical theft of printed cards, and screen capture by malware.

## 3. Checks (report each as PASS / FAIL / UNSURE with file:line evidence)

1. **No exfiltration:** no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `navigator.*` network API, `<img>`/`<a>`/`<form>` with remote URLs, `postMessage` to other windows, or storage API (`localStorage`, `sessionStorage`, IndexedDB, cookies) is reachable with secret data outside `vendor/` (inside `vendor/`, only jsPDF's URL-loading helpers use XHR and CSP blocks them).
2. **CSP is effective:** the policy in `index.html`, `tests/test.html` and the generated single-file edition matches §1.9, has no `unsafe-inline` or `unsafe-eval`, the single-file hashes cover only the inlined project files, and no page uses inline handlers, `eval`, `new Function` or string `setTimeout`.
3. **RNG correctness:** every key, mnemonic entropy, SLIP-39 identifier and share randomness, and Monero seed comes from `pool.extract` (or `extractDiceOnly` only when the user chose dice-only); no `Math.random` or library-internal RNG (e.g. `generateMnemonic`, `randomBytes`) feeds secrets.
4. **Mixing cannot reduce strength:** confirm the absorb and extract formulas in `entropy-pool.js` match its header and `selftest-entropy.js`, that user input cannot replace or cancel the CSPRNG bytes, and that the credited-bit gate (`minCreditedBits`) is enforced on every extraction path.
5. **Derivation correctness:** each coin's path, version bytes, address encoding and secret format match its specification, and each is covered by an independent vector in `tests/suites/*.js` and a critical KAT.
6. **Self-verification is real:** every branch of `generator.js` throws instead of returning a wallet when a check fails, and the checks compare independently decoded data rather than reusing the same objects.
7. **Secret handling:** secrets are never logged, never written into attributes, URLs or the DOM before the user presses "Show", the passphrase and BIP38 password are never stored in the wallet set or printed, and `wipe()` zeroes every key buffer it holds.
8. **Tamper resistance:** `WG` and `WGVendor` modules cannot be replaced after load, and a modified vendor file or KAT is detected by `vendor/SHA256SUMS` or by the start-up self-tests.
9. **Vendor and release integrity:** `vendor/SHA256SUMS` matches the files, `tools/vendor-build` reproduces them from `package-lock.json`, the pinned package versions have no known vulnerabilities affecting this use, and `.github/workflows/release.yml` pins every action to a commit SHA, uses only the automatic token with minimal permissions, and publishes exactly what `tools/release/make-zip.mjs` built and the tests checked.
10. **Output safety:** the PDF (`js/output/pdf.js`) contains only data shown in the result panel, background images are re-encoded through a canvas (no metadata), and the UI tells the user to delete the file.
11. **Comment accuracy:** every file's header comment correctly describes what the code does; report any mismatch.
12. **Tests:** `tests/test.html` reports `PASS n/n` in at least two browser engines, and every vector file names its upstream source and commit.

## 4. How to run

1. Open `tests/test.html` by double-click, or run `node tools/browser-test/run.mjs` with Node.js 22+ and an installed browser.
2. Run `cd vendor && sha256sum -c SHA256SUMS`, then `cd tools/vendor-build && npm ci --ignore-scripts && npm run build && git diff --exit-code ../../vendor`.

## 5. Output format

Return a table with columns `#`, `check`, `result`, `severity (critical/high/medium/low/info)`, `evidence (file:line)`, `fix`; then list any finding outside §3 in the same format.
