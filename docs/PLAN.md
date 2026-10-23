# Plan — kripto_wallet_offline_yet: portable, çevrimdışı, çoklu coin kâğıt cüzdan üreticisi

Durum: taslak (2026-10-22). Repo: `snipeTR/kripto_wallet_offline_yet` (2026-10-23'te ayrı repoya taşındı, temiz geçmiş). Odak: basılıp kesilmeye uygun kâğıt cüzdan kartları. Önceki proje `monero-PDF-wallet-generator` (PHP, yalnızca Monero) GitHub'dan kaldırıldı; tam geçmişi yerel bir git bundle yedeğinde duruyor.

## 1. Değişmez kurallar

1. Tüm güncel tarayıcılarda (Chrome, Edge, Firefox, Safari — son ~3 yıl) aşağı yukarı aynı çalışır.
2. Tamamen çevrimdışı çalışır; hiçbir ağ isteği yapılmaz.
3. Zip indirilir, açılır, `index.html` çift tıklanır — kurulum, sunucu, build yok.
4. Tüm kodda ne yaptığını anlatan yorumlar bulunur.
5. Projeyi bir yapay zekâya en az cümleyle eksiksiz anlatan güvenlik denetim tarifnamesi bulunur (`docs/AI_SECURITY_AUDIT.md`).

## 2. Kuralların teknik sonuçları

| Kural | Karar |
|---|---|
| `file://` ile açılma | Chrome `file://` altında ES module, `fetch()`, dosyadan Worker yüklemeyi engeller → tüm kod **klasik `<script src>`**, veriler (kelime listeleri, test vektörleri) **JS dosyası** olarak gelir. |
| Tarayıcı uyumu | ES2020 (`BigInt`) tabanı; IE desteklenmez. Uyumluluk matrisi M6'da test edilir. |
| Çevrimdışı | CDN / font / ağ çağrısı yok. CSP meta: `default-src 'none'; connect-src 'none'; form-action 'none'` + gerekli izinler (file:// davranışı tarayıcı bazında test edilecek). PHP kaldırılır, PDF tarayıcıda üretilir. |
| Yorum zorunluluğu | Her dosya başında amaç/girdi/çıktı/güvenlik notu; her fonksiyonda açıklama. Vendor kütüphaneler minify edilmez. |

## 3. Kripto altyapısı — kendi kriptomuzu yazmıyoruz

Denetlenmiş, bağımlılıksız kütüphaneler, sürüm sabitlenerek `vendor/` altına:

| Kütüphane | Kullanım |
|---|---|
| @noble/curves | secp256k1, ed25519 |
| @noble/hashes | SHA-2, SHA-3/Keccak, RIPEMD-160, BLAKE2b, HMAC, HKDF, PBKDF2, scrypt |
| @noble/ciphers | AES (BIP38) |
| @scure/bip39 | Mnemonic + tüm resmi kelime listeleri |
| @scure/bip32 | secp256k1 HD türetme |
| @scure/base | base58, base58check, base58xmr, base58 (XRP alfabesi), bech32/bech32m, base32 |
| jsPDF | PDF üretimi |
| qrcode-generator (Arase) | QR kod |

npm paketleri ESM olduğu için `tools/vendor-build/` içindeki tekrar üretilebilir bir script bunları bir kez IIFE (global) bundle'a çevirir. `vendor/VENDOR.md`: paket, sürüm, kaynak URL, lisans, SHA-256. Son kullanıcı bu adımı çalıştırmaz.

Kütüphanede olmayan ve bizim yazacağımız kısımlar (en yüksek risk — hepsi resmi test vektörüne bağlanır):
- SLIP-0010 ed25519 türetme (Solana, Stellar)
- BIP32-Ed25519 / CIP-3 Icarus master key (Cardano)
- Monero 25 kelime mnemonic (crc32 checksum) + adres
- Stellar StrKey (base32 + CRC16-XModem)
- SLIP-39 Shamir paylaşımı (GF(256) + Feistel şifreleme)
- BIP38 şifreleme

## 4. Proje yapısı

```
index.html                 Tek giriş noktası
css/app.css                Ekran + baskı stilleri
js/core/
  namespace.js             window.WG global ad alanı
  bytes.js                 hex/bytes/karşılaştırma/sıfırlama yardımcıları
  entropy-pool.js          Entropi havuzu, karıştırma, bit sayacı
  entropy-sources.js       Fare, dokunma, klavye zamanlaması, zar, yazı-tura, metin, jitter
  selftest.js              Açılışta test vektörleri; başarısızsa üretim kilitlenir
js/derive/
  bip39.js                 Mnemonic + passphrase sarmalayıcı
  slip10.js                ed25519 SLIP-0010
  bip32-ed25519.js         Cardano Icarus / BIP32-Ed25519
js/coins/
  registry.js              Ortak coin arayüzü: {id, name, derive(seed, opts), validate(addr), exportFormats}
  bitcoin.js litecoin.js dogecoin.js ethereum.js tron.js
  solana.js stellar.js xrp.js cardano.js monero.js
js/secure/
  slip39.js                Shamir paylaşımı
  bip38.js                 Şifreli BTC anahtarı
js/output/
  card-layout.js           Eski projenin kart ayarları (marj, boyut, kılavuz, renk, şeffaflık, gölge)
  pdf.js                   Ön/arka kart, QR, yerel arka plan resmi (FileReader)
js/ui/
  app.js entropy-ui.js i18n.js (TR/EN)
vendor/                    Sabit kütüphaneler + VENDOR.md
tests/test.html            Tarayıcıda açılan test sayfası
tests/vectors/*.js         Resmi test vektörleri
tools/                     vendor build, release zip, SHA256SUMS
docs/PLAN.md               Bu dosya
docs/AI_SECURITY_AUDIT.md  Yapay zekâ denetim tarifnamesi
README.md LICENSE (MIT)
```

## 5. Entropi tasarımı

İlke: kullanıcı entropisi rastgeleliği **asla zayıflatamaz, yalnızca güçlendirir**.

1. **Taban:** `crypto.getRandomValues` 64 bayt — her zaman kullanılır, devre dışı bırakılamaz (zar-only modu hariç, bkz. 5).
2. **Ek kaynaklar** → olay bazında SHA-512 zincirli havuz:
   fare/dokunma (koordinat + `performance.now()`), tuş zamanlaması, zar (d6/d20), yazı-tura, serbest metin, toplama sırasında zaman jitter'ı.
3. **Karıştırma:** `HKDF-SHA512(ikm = CSPRNG ‖ havuz, salt = "WG-v2-entropy", info = amaç)` → 128/256 bit.
4. **Muhafazakâr sayaç:** zar/yazı-tura tam puan (d6 = 2.585 bit), fare/klavye çok düşük puan; eşik dolmadan üret butonu kapalı (eşik ayarlanabilir, varsayılan 256 bit).
5. **Zar-only modu (gelişmiş):** seed yalnızca zarlardan; harici araçla doğrulanabilir; açık uyarı.
6. **Çapraz doğrulama:** adres ikinci kez bağımsız türetilir ve karşılaştırılır; uyuşmazlıkta hiçbir şey gösterilmez.

## 6. Coin kapsamı ve uyumluluk

Tek BIP39 seed'inden seçilen coinler türetilir (Monero hariç). Her coin için hedef cüzdanla doğrulama yapılır.

| Coin | Eğri | Türetme yolu | Adres | Doğrulama cüzdanı |
|---|---|---|---|---|
| Bitcoin | secp256k1 | BIP84 `m/84'/0'/0'/0/0` (vars.), BIP86 `m/86'/0'/0'/0/0`, BIP44 `m/44'/0'/0'/0/0` | bc1q / bc1p / 1… | Electrum, Sparrow |
| Litecoin | secp256k1 | BIP84 `m/84'/2'/0'/0/0` | ltc1q… | Electrum-LTC |
| Dogecoin | secp256k1 | BIP44 `m/44'/3'/0'/0/0` | D… | Dogecoin Core / Trust |
| Ethereum | secp256k1 | BIP44 `m/44'/60'/0'/0/0` | 0x… EIP-55 | MetaMask |
| Tron | secp256k1 | BIP44 `m/44'/195'/0'/0/0` | T… (0x41 + base58check) | TronLink |
| XRP | secp256k1 | BIP44 `m/44'/144'/0'/0/0` | r… (XRP base58 alfabesi) | Ledger Live / Xaman (BIP39 içe aktarma) |
| Solana | ed25519 | SLIP-0010 `m/44'/501'/0'/0'` | base58 pubkey | Phantom, Solflare |
| Stellar | ed25519 | SEP-0005 `m/44'/148'/0'` | G… StrKey | Lobstr, Stellar Lab |
| Cardano | ed25519 (BIP32-Ed25519) | CIP-1852 `m/1852'/1815'/0'/0/0` + stake `/2/0`, Icarus master (CIP-3) | addr1… (Shelley base) | Yoroi, Eternl |
| Monero | ed25519 | Kendi seed'i (BIP39 değil) | 4… | Monero GUI/CLI, Feather |

Notlar (karta/arayüze yazılacak):
- XRP ve Stellar hesapları aktifleşmek için minimum rezerv bakiyesi ister.
- Monero standart dışı yollarla BIP39'dan türetilmez; her zaman ayrı 25 kelime.
- Cardano en karmaşık türetme; CIP-3 vektörleri geçmeden yayına girmez.

## 7. Seçilebilir güvenli cüzdan seçenekleri

Kullanıcı arayüzde ayrı ayrı açıp kapatabilir:

| Seçenek | Kapsam | Not |
|---|---|---|
| BIP39 passphrase | BIP39 kullanan tüm coinler | Passphrase kartta basılmaz; ayrı saklanması uyarısı. |
| SLIP-39 Shamir (M-of-N) | Master secret | Trezor uyumlu. SLIP-39 payları BIP39 kelimeleriyle aynı adresleri **vermez**; seçilince arayüz bunu açıkça belirtir. |
| BIP38 şifreli anahtar | Bitcoin tek anahtar kâğıt cüzdanı | scrypt (N=16384) — tarayıcıda birkaç saniye sürer. |
| Tek anahtar (non-HD) mod | BTC, LTC, DOGE, ETH, TRX | Klasik kâğıt cüzdan: tek özel anahtar + adres. |
| Görüntüleme kartı | Monero (view key), BTC/LTC (xpub/zpub) | Fonları harcamadan izleme kartı. |

## 8. Güvenlik sertleştirme

- Gizli veri DOM'a yalnızca `textContent` ile; `eval`, `Function`, `innerHTML` (gizli veriyle) yok.
- `localStorage` / `sessionStorage` / IndexedDB kullanılmaz; `console.log` ile gizli veri basılmaz.
- "Temizle" butonu bellek dizilerini sıfırlar, formu boşaltır.
- `navigator.onLine` açıksa kalıcı uyarı bandı.
- Açılışta selftest; başarısızsa üretim kilitlenir.
- Release: `SHA256SUMS` + doğrulama talimatı; zip içeriği tekrar üretilebilir.

## 9. Test

- `tests/test.html` (çevrimdışı, çift tıkla): BIP39, BIP32, BIP84, BIP86, EIP-55, SLIP-0010, SEP-0005, CIP-3, BIP38, SLIP-39 resmi vektörleri + Monero bilinen mnemonic→adres + her coin için referans cüzdandan alınmış örnek.
- Entropi modülü: CSPRNG'nin her yolda karıştığını, aynı kullanıcı girdisinin farklı seed ürettiğini (zar-only hariç) doğrulayan testler.
- Tarayıcı matrisi: Chrome, Edge, Firefox, Safari (macOS/iOS), Android Chrome — `file://` ile.

## 10. Aşamalar

| # | İçerik |
|---|---|
| M0 | İskelet, vendor bundle, selftest + test sayfası altyapısı |
| M1 | Entropi modülü + arayüz |
| M2 | BIP39 + Bitcoin, Litecoin, Dogecoin, Ethereum, Tron, XRP |
| M3 | SLIP-0010: Solana, Stellar |
| M4 | Monero |
| M5 | Cardano (BIP32-Ed25519) |
| M6 | Güvenli seçenekler: passphrase, SLIP-39, BIP38, tek anahtar, görüntüleme kartı |
| M7 | PDF kartlar (eski layout seçenekleri taşınır, coin başına şablon) |
| M8 | CSP + sertleştirme, tarayıcı matrisi, `AI_SECURITY_AUDIT.md`, README, release zip |

## 11. İlerleme

### M0 — tamamlandı (2026-10-22)
- Kod 2026-10-23'te temiz geçmişle bu yeni repoya taşındı; eski repo (`monero-PDF-wallet-generator`) GitHub'dan silindi, yerelde git bundle yedeği var.
- `vendor/wg-crypto.js`: noble/scure 2.4.0, esbuild 0.28.2 ile IIFE; tek salt-okunur global `WGVendor`. Build iki kez çalıştırıldığında aynı SHA-256 → tekrar üretilebilir. `generateMnemonic` bilerek dışa açılmadı (tüm sırlar entropi havuzundan gelmeli).
- `vendor/jspdf.umd.js` (4.2.1) ve `vendor/qrcode.js` (2.0.4) npm paketinden birebir kopya. jsPDF'te yalnızca URL'den dosya yükleme yolunda XHR var; CSP `connect-src 'none'` engeller.
- Çekirdek: `WG.define` (dondurulmuş, değiştirilemez modüller), `WG.bytes`, `WG.selftest` (`requireHealthy()` kapısı), 20 kritik KAT (FIPS/RFC/BIP; CSP meta, CSPRNG, vendor kilidi dâhil).
- Test sayfası: 68 test (24 BIP39 Trezor + 17 BIP32 resmi vektör, çekirdek testleri, CSP kanarya testi). Vektörler commit'e sabitlenmiş kaynaktan `tools/vectors/import-vectors.mjs` ile üretildi.
- `tools/browser-test/run.mjs`: Chrome, Edge (dump-dom) ve Firefox (WebDriver BiDi) ile `file://` testleri — 6/6 geçti. Mutasyon kontrolü: tek bir yanlış beklenen değer üretimi kilitliyor.
- Doğrulanan: `script-src 'self'` CSP'si Chrome, Edge ve Firefox'ta `file://` altında çalışıyor ve `fetch()` engelleniyor. Safari elle test edilecek.
- Karar: kod yorumları İngilizce (açık kaynak erişimi için); arayüz TR/EN.

## 12. AI güvenlik denetim tarifnamesi — iskelet

Kod bittiğinde gerçek yapıya göre yazılır; en az cümle, eksiksiz:
1. Amaç ve tehdit modeli (çevrimdışı, tek kullanıcı, kötü niyetli ağ/eklenti/kopya zip).
2. Veri akışı: entropi → seed → anahtar → adres → PDF.
3. Dosya haritası ve her dosyanın sorumluluğu.
4. Kontrol listesi: ağ çağrısı/CSP, CSPRNG'nin her yolda kullanımı, karıştırma doğruluğu, türetme yolları, test vektörleri, gizli verinin DOM/log/storage'a sızması, vendor hash doğrulaması, yorum–kod tutarlılığı, zip bütünlüğü.
5. Beklenen çıktı formatı (bulgu, dosya:satır, ciddiyet, kanıt).
