# OfflineKey Vault — Offline Paper Wallet Generator

A portable, fully offline paper-wallet generator that runs in any modern
browser by opening a single HTML file, and prints cut-ready wallet cards.

**Coins:** Bitcoin (Native SegWit / Taproot / Legacy), Litecoin, Dogecoin,
Ethereum, Tron, XRP, Solana, Stellar, Cardano, Monero.

**Wallet types:** BIP39 recovery words (12/24, all official languages,
optional passphrase) · SLIP-39 Shamir shares (M-of-N, Trezor compatible) ·
single keys (classic paper wallet, optional BIP38 for Bitcoin). Monero
always gets its own 25-word seed.

**Entropy:** the browser CSPRNG is always used and mixed (HKDF-SHA512) with
your own dice rolls, coin flips, mouse/touch movement and key timings; an
optional verifiable "dice only" mode follows the Coldcard method.

An **"ultra security" guide** (button at the top of the app, `guide/tr.html`,
`guide/en.html`) explains step by step how to create and print the wallet on
a verified, offline live Linux (Tails), with a USB-cable printer or by hand.

Every option and button has a small **?** button that explains it in plain
language, with an example and an everyday analogy — no crypto knowledge needed.

> Status: pre-release. Read the safety notes below and test-restore
> every wallet with a small amount before trusting it with real funds.

## Use

1. Download the release zip from https://github.com/snipeTR/OfflineKey-Vault/releases,
   verify it (`sha256sum -c SHA256SUMS`), extract it.
2. Disconnect the computer from the internet (for maximum safety follow the
   ultra security guide: boot Tails from USB in Offline Mode).
3. Double-click `index.html`. The page runs its cryptographic self-tests and
   refuses to generate keys if any of them fails.
4. Follow the four steps with **Next / Back**: collect entropy and press
   **Apply and continue** (or **Skip** to rely on the browser CSPRNG only),
   choose coins and options and press **Generate wallet**, check the wallet,
   then arrange the cards on the 2/5-scale page preview (drag the lines or
   type the values) and press **Create and download PDF**.
5. Print the PDF, cut along the guides, delete the PDF file, close the browser.

## Phones

Phones cannot open the multi-file zip edition (Android opens local files
through `content://` URLs, so `js/` and `css/` next to the page cannot load).
Each release therefore also ships **`OfflineKey-Vault-X.Y.Z.html`**, a
single-file edition with everything inlined (its CSP allows only the
inlined code, by SHA-256 hash). Open it on Android with Chrome or Firefox in
airplane mode. iPhone/iPad cannot run local HTML files offline. The layout
adapts to phone screens and touch input. A phone is not an air-gapped
computer — see section 14 of the guide.

## Safety

- Every generated wallet is verified before it is shown: backups are decoded
  again, addresses re-derived, printed keys decoded and compared.
- Nothing is ever sent to the network: a Content-Security-Policy blocks all
  connections (verified by `tests/test.html` in each browser).
- Never photograph or scan the secret sides; keep the passphrase (if any)
  separately — it is never printed.

## Verify / audit

- `tests/test.html` — 218 tests: official vectors from BIP32/39/84/86/38,
  SLIP-0010/0039, SEP-0005, CIP-3, the Monero project, Trezor firmware and
  Ian Coleman's BIP39 tool, all pinned to upstream commits.
- `vendor/VENDOR.md` + `vendor/SHA256SUMS` — exact third-party versions
  (noble/scure crypto, jsPDF, qrcode-generator, DejaVu font), rebuilt
  reproducibly by `tools/vendor-build`.
- **Release files are built by GitHub Actions** (`.github/workflows/release.yml`),
  not on a personal computer, and carry GitHub-signed build provenance.
  On an online computer with the GitHub CLI:
  `gh attestation verify OfflineKey-Vault-X.Y.Z.zip --repo snipeTR/OfflineKey-Vault`
  (same for the `.html`). You can also rebuild the single-file edition from
  the tag with `node tools/release/single-file.mjs out.html` and compare its
  SHA-256 with `SHA256SUMS`.
- `docs/AI_SECURITY_AUDIT.md` — a compact specification for auditing the
  project with an AI model.
- `docs/PLAN.md` — design and progress log.

## Project layout

| Path | Content |
|---|---|
| `index.html` | the app (the only file a user opens) |
| `js/core/` | namespace, byte helpers, self-tests, entropy pool and collectors |
| `js/derive/`, `js/coins/` | BIP39, BIP32/SLIP-0010, Cardano keys; one module per coin family |
| `js/secure/`, `js/wallet/` | SLIP-39, BIP38; the self-verifying generator |
| `js/ui/`, `js/output/` | panels, TR/EN texts, QR codes, PDF cards and manual |
| `vendor/` | pinned third-party code |
| `tests/` | offline test page, official vectors, suites |
| `tools/` | maintainer tools (vendor build, vector import, browser tests, release zip) |

## Maintainers

```sh
node tools/browser-test/run.mjs                 # index.html + tests in Chrome/Edge/Firefox
node tools/dev/node-harness.mjs [filter]        # fast test loop in Node.js
cd tools/vendor-build && npm ci --ignore-scripts && npm run build
node tools/release/make-zip.mjs                 # local dry run: dist/*.zip, *.html, SHA256SUMS
```

Releasing: bump the version in `js/core/namespace.js`, add
`docs/release-notes/vX.Y.Z.md` (first line `# title`), commit, push, then
`git tag vX.Y.Z && git push origin vX.Y.Z`. GitHub Actions tests, builds,
attests and publishes the release.

---

## Türkçe

Tek bir HTML dosyası açılarak tüm güncel tarayıcılarda **tamamen
çevrimdışı** çalışan, kesilip saklanmaya hazır kâğıt cüzdan kartları basan
taşınabilir cüzdan üreticisi.

**Kullanım:** Release zip'ini indirin, `SHA256SUMS` ile doğrulayın, açın;
internet bağlantısını kesin; `index.html`'e çift tıklayın. Dört adımı
**İleri / Geri** ile izleyin: entropi toplayıp **Uygula ve devam et**'e basın
(ya da **Atla**), coin ve seçenekleri belirleyip **Cüzdan üret**'e basın,
cüzdanı kontrol edin, kartları 2/5 ölçekli sayfa önizlemesinde çizgileri
sürükleyerek veya değer yazarak yerleştirin ve **PDF oluştur ve indir**'e basın. PDF'i yazdırın, kılavuz çizgilerinden kesin,
dosyayı silin ve tarayıcıyı kapatın.

**Güvenlik:** Her cüzdan gösterilmeden önce otomatik doğrulanır; sayfa ağa
hiçbir veri gönderemez (CSP). Gizli yüzlerin fotoğrafını çekmeyin;
passphrase hiçbir kâğıda basılmaz, ayrı saklayın. Gerçek para koymadan önce
küçük bir miktarla geri yükleme testi yapın.

License: MIT — see [LICENSE](LICENSE).
