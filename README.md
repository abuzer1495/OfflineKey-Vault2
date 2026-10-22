# kripto_wallet_offline_yet — Offline Paper Wallet Generator (in development)

> **Status:** milestone M0 (skeleton). It does **not** generate wallets yet.
> Successor of [monero-PDF-wallet-generator](https://github.com/snipeTR/monero-PDF-wallet-generator/tree/v1-legacy) (legacy PHP/TCPDF Monero version).
> Roadmap: [docs/PLAN.md](docs/PLAN.md).

A portable, fully offline paper-wallet generator focused on printable,
cut-ready wallet cards. It runs in any modern browser by opening a single
HTML file. Planned coins: Bitcoin, Litecoin, Dogecoin,
Ethereum, Tron, XRP, Solana, Stellar, Cardano and Monero, with extra user
entropy (dice, coin flips, mouse, keyboard) mixed into the browser CSPRNG and
optional security features (BIP39 passphrase, SLIP-39 Shamir shares, BIP38).

## Use

1. Download the release zip and extract it.
2. Disconnect from the internet.
3. Double-click `index.html`.

No server, no install, no build step. The page refuses to generate keys unless
its cryptographic self-tests pass in your browser.

## Verify

- Open `tests/test.html` to run the full test suite (official BIP39/BIP32
  vectors, FIPS/RFC known answers, CSP network-block check).
- `cd vendor && sha256sum -c SHA256SUMS` checks the bundled libraries;
  `vendor/VENDOR.md` lists their exact npm versions.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The app (only file an end user opens) |
| `js/core/` | Namespace, byte helpers, self-test registry and known-answer tests |
| `js/ui/` | i18n (TR/EN), DOM builder (textContent only), app entry |
| `vendor/` | Pinned, audited libraries (noble/scure, jsPDF, qrcode-generator) |
| `tests/` | Offline test page, official vectors, test suites |
| `tools/` | Maintainer tools: vendor bundling, vector import, headless browser tests |
| `docs/` | Plan and (later) the AI security-audit specification |

## Maintainers

```sh
# Rebuild /vendor from pinned npm packages (reproducible)
cd tools/vendor-build && npm ci --ignore-scripts && npm run build

# Run index.html and tests/test.html headless in installed Chrome/Edge/Firefox
node tools/browser-test/run.mjs
```

---

## Türkçe özet

Tek bir HTML dosyası açılarak tüm güncel tarayıcılarda tamamen çevrimdışı
çalışan, taşınabilir kâğıt cüzdan üreticisi. **Şu an M0 iskelet aşamasında,
henüz cüzdan üretmez.** Kullanım: zip'i indir, aç, internet bağlantısını kes,
`index.html` dosyasına çift tıkla. Tüm testler için `tests/test.html`.
Yol haritası: [docs/PLAN.md](docs/PLAN.md). Önceki proje: [monero-PDF-wallet-generator](https://github.com/snipeTR/monero-PDF-wallet-generator/tree/v1-legacy) (eski PHP sürümü).

License: MIT — see [LICENSE](LICENSE).
