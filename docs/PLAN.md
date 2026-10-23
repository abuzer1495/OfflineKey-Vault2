# Plan — OfflineKey Vault: portable, çevrimdışı, çoklu coin kâğıt cüzdan üreticisi

**Durum:** v0.6.0 (2026-10-24, pre-release). Repo: [`snipeTR/OfflineKey-Vault`](https://github.com/snipeTR/OfflineKey-Vault) (eski adı `kripto_wallet_offline_yet`), dal `main`.
Odak: basılıp kesilmeye uygun kâğıt cüzdan kartları.
Önceki proje `monero-PDF-wallet-generator` (PHP, yalnızca Monero) GitHub'dan ve yerelden kaldırıldı; geçmişi yalnızca yerel bir git bundle yedeğinde duruyor.

## 1. Değişmez kurallar

1. Tüm güncel tarayıcılarda (Chrome, Edge, Firefox, Safari — son ~3 yıl) aşağı yukarı aynı çalışır.
2. Tamamen çevrimdışı çalışır; hiçbir ağ isteği yapılmaz.
3. Zip indirilir, açılır, `index.html` çift tıklanır — kurulum, sunucu, build yok.
4. Tüm kodda ne yaptığını anlatan yorumlar bulunur (yorumlar İngilizce, arayüz TR/EN).
5. Projeyi bir yapay zekâya en az cümleyle eksiksiz anlatan güvenlik denetim tarifnamesi bulunur: [`docs/AI_SECURITY_AUDIT.md`](AI_SECURITY_AUDIT.md).
6. Kod mümkün olduğunca sade tutulur.
7. Her bitmiş değişiklik sürüm numarası artırılarak GitHub release olarak yayımlanır (özellik → ikinci hane, düzeltme → üçüncü hane). Release dosyalarını kişisel bilgisayar değil GitHub Actions üretir: sürüm numarası + `docs/release-notes/vX.Y.Z.md` commit'lenir, `vX.Y.Z` etiketi push'lanır, `.github/workflows/release.yml` test eder, üretir, köken belgesini (build provenance) imzalar ve yayımlar.

## 2. Kuralların teknik sonuçları

| Kural | Karar |
|---|---|
| `file://` ile açılma | Chrome `file://` altında ES module, `fetch()` ve dosyadan Worker'ı engeller → tüm kod **klasik `<script src>`**; kelime listeleri ve test vektörleri de **JS dosyası**. |
| Tarayıcı uyumu | ES2020 (`BigInt`) tabanı; IE desteklenmez. |
| Çevrimdışı | CDN, uzak font, ağ çağrısı yok. CSP meta: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'`. Chrome, Edge ve Firefox'ta `file://` altında çalıştığı ve `fetch()`'i engellediği test ediliyor. PDF tarayıcıda üretilir. |
| Yorum zorunluluğu | Her dosyanın başında amaç / girdi-çıktı / güvenlik notu; fonksiyonlarda açıklama. Vendor dosyaları minify edilmez. |

## 3. Kripto altyapısı — kendi kriptomuzu yazmıyoruz

Denetlenmiş, bağımlılıksız kütüphaneler, sürümü sabitlenmiş olarak `vendor/` altında:

| Dosya | İçerik |
|---|---|
| `vendor/wg-crypto.js` | @noble/curves, @noble/hashes, @noble/ciphers, @scure/base, @scure/bip32, @scure/bip39 (hepsi 2.4.0), esbuild 0.28.2 ile tek IIFE; salt-okunur global `WGVendor`. Kütüphanenin kendi `generateMnemonic`'i bilerek dışa açılmaz. |
| `vendor/jspdf.umd.js` | jsPDF 4.2.1, npm paketinden birebir. |
| `vendor/qrcode.js` | qrcode-generator 2.0.4, birebir. |
| `vendor/dejavu-fonts.js` | DejaVu Sans Mono (normal + kalın) base64 — PDF'te Türkçe ve aksanlı karakterler için. |

`tools/vendor-build/` bunları `package-lock.json`'dan tekrar üretilebilir şekilde kurar; `vendor/SHA256SUMS` ve `vendor/VENDOR.md` sürüm, lisans ve hash'leri listeler.

Kütüphanede olmadığı için bizim yazdığımız kısımlar (hepsi resmi test vektörlerine bağlı):
- BIP39 seed fonksiyonu (spesifikasyon metninden; kütüphane kısa referans ifadelerini reddettiği için)
- SLIP-0010 ed25519 türetme (Solana, Stellar)
- Cardano CIP-3 Icarus ana anahtarı + BIP32-Ed25519 türetme
- Monero 25 kelime (CRC-32 kontrol kelimesi), `sc_reduce32`, adres
- Stellar StrKey (base32 + CRC16-XModem), Taproot tweak, EIP-55, XRP base58check
- SLIP-39 (python-shamir-mnemonic'in satır satır çevirisi), BIP38 (non-EC-multiply)

## 4. Proje yapısı

```
index.html                    Tek giriş noktası (CSP + script yükleme sırası)
css/app.css                   Tüm stiller (açık/koyu tema)
js/core/
  namespace.js                WG global ad alanı; WG.define() modülleri dondurur
  bytes.js                    hex/bytes, sabit zamanlı karşılaştırma, wipe
  selftest.js                 Test kaydı + requireHealthy() kilidi
  selftest-vendor.js          Kütüphane KAT'ları (FIPS/RFC/BIP), CSPRNG, CSP, vendor kilidi
  entropy-pool.js             Tek gizli rastgelelik kaynağı (havuz, HKDF çıkarımı, zar modu)
  entropy-sources.js          Fare/dokunma, tuş zamanlaması, zamanlayıcı titreşimi
  selftest-entropy.js         Havuz formüllerinin KAT'ları
js/data/                      Monero İngilizce ve SLIP-39 kelime listeleri
js/derive/
  bip39.js                    Mnemonic ↔ entropi, seed
  hd.js                       BIP32 (secp256k1) ve SLIP-0010 (ed25519)
  cardano-keys.js             Icarus ana anahtar + BIP32-Ed25519
js/coins/
  registry.js                 Ortak coin arayüzü ve sonuç biçimi
  encode.js                   hash160, base58check, bech32/bech32m, taproot, WIF, EIP-55, StrKey…
  bitcoin-family.js           BTC, LTC, DOGE
  account-coins.js            ETH, TRX, XRP
  ed25519-coins.js            SOL, XLM
  cardano.js                  ADA
  monero.js                   XMR (kendi seed'i)
  selftest-coins.js           Her coin için bir kritik başlangıç KAT'ı
js/secure/
  slip39.js                   Shamir payları
  bip38.js                    Parola ile şifreli BTC anahtarı
js/wallet/generator.js        Tek anahtar üretim noktası; her cüzdanı dönmeden önce doğrular
js/output/
  qr.js                       QR (ekranda canvas, PDF'te vektör)
  pdf.js                      Kart PDF'i; placements() önizlemeyle ortak
  pdf-manual.js               PDF kullanım kılavuzu sayfası
js/ui/
  i18n.js dom.js              Metinler (TR/EN), DOM üretici (yalnızca textContent)
  help.js help-texts.js       "?" yardım butonları ve metinleri
  entropy-ui.js               1. adım
  generator-ui.js             2. adım
  result-ui.js                3. adım
  pdf-ui.js pdf-preview.js    4. adım ve 2/5 ölçekli sürüklenebilir sayfa önizlemesi
  app.js                      Sihirbaz (adımlar, Geri/İleri, durum)
vendor/                       Sabitlenmiş üçüncü taraf kodu (bkz. §3)
tests/test.html               Tarayıcıda açılan tam test sayfası
tests/suites/*.js             Test grupları;  tests/vectors/*.js  resmi vektörler
tools/browser-test/           Chrome/Edge/Firefox'ta file:// testi, Firefox'ta tam arayüz akışı
tools/dev/node-harness.mjs    Hızlı geliştirme döngüsü (Node VM)
tools/vectors/                Resmi vektörleri commit'e sabitli kaynaklardan içe aktarma
tools/vendor-build/           vendor/ dosyalarını tekrar üretme
tools/release/make-zip.mjs    Tekrar üretilebilir release zip + tek dosya sürümü + SHA256SUMS
tools/release/single-file.mjs Telefonlar için tek dosya sürümü (her şey gömülü, CSP özetli)
.github/workflows/release.yml Etiket push'lanınca GitHub'da test, üretim, köken belgesi ve yayın
docs/release-notes/           Her sürümün release notu (ilk satır başlık)
guide/tr.html guide/en.html   Ultra güvenlik rehberi (statik, script yok)
docs/PLAN.md                  Bu dosya
docs/AI_SECURITY_AUDIT.md     Yapay zekâ denetim tarifnamesi
```

## 5. Entropi tasarımı

İlke: kullanıcı entropisi rastgeleliği **asla zayıflatamaz, yalnızca güçlendirir**.

1. **Havuz:** başlangıç `SHA-512("WG-pool-init-v1" ‖ CSPRNG(64) ‖ bağlam)`; her olay `SHA-512(durum ‖ sayaç ‖ etiket ‖ veri)` ile eklenir.
2. **Çıkarım:** `HKDF-SHA512(ikm = taze CSPRNG(64) ‖ havuz, salt = "WG-entropy-v1", info = "wg-extract/" ‖ amaç)`, ardından havuz ileri sarılır (ratchet). Öz testler geçmeden veya istenen minimum kredi yoksa çalışmaz.
3. **Kredi (muhafazakâr):** zar d6 2,585 bit, yazı-tura 1, fare/dokunma örneği 0,5 (≥10 ms ve ≥4 px aralık), tuş zamanlaması 1 (≥15 ms, tekrar yok, tuşun kendisi kaydedilmez), serbest metin ve zamanlayıcı titreşimi 0.
4. **Eşik:** 128 / 256 / 512 bit seçilebilir (varsayılan 256). "Atla" ile eşik 0'a iner; CSPRNG her durumda kullanılır.
5. **Sadece zar modu (Coldcard uyumlu):** `SHA-256(atış rakamları)`; 128 bit için 50, 256 bit için 100 atış. Kullanılan atışlar silinir.
6. **Baştan başla** havuzu da sıfırlar.

## 6. Coin kapsamı ve uyumluluk

| Coin | Eğri | Türetme yolu (varsayılan ilk) | Adres | Uyumlu cüzdanlar |
|---|---|---|---|---|
| Bitcoin | secp256k1 | BIP84 `m/84'/0'/0'/0/0`, BIP86 `m/86'/0'/0'/0/0`, BIP44 `m/44'/0'/0'/0/0` | bc1q / bc1p / 1… | Sparrow, Electrum, BlueWallet, Trezor, Ledger |
| Litecoin | secp256k1 | BIP84 `m/84'/2'/0'/0/0`, BIP44 `m/44'/2'/0'/0/0` | ltc1q / L… | Electrum-LTC, Litewallet, Trezor, Ledger |
| Dogecoin | secp256k1 | BIP44 `m/44'/3'/0'/0/0` | D… | Dogecoin Core, MyDoge, Trezor, Ledger |
| Ethereum | secp256k1 | BIP44 `m/44'/60'/0'/0/0` | 0x… (EIP-55) | MetaMask, Rabby, Trezor, Ledger |
| Tron | secp256k1 | BIP44 `m/44'/195'/0'/0/0` | T… | TronLink, Trust Wallet, Ledger |
| XRP | secp256k1 | BIP44 `m/44'/144'/0'/0/0` | r… | Xaman (BIP39), Ledger, Trezor |
| Solana | ed25519 | SLIP-0010 `m/44'/501'/0'/0'` | base58 | Phantom, Solflare, Backpack, Trezor, Ledger |
| Stellar | ed25519 | SEP-0005 `m/44'/148'/0'` | G… | Lobstr, Freighter, Stellar Laboratory, Trezor, Ledger |
| Cardano | BIP32-Ed25519 | CIP-1852 `m/1852'/1815'/0'/0/0` + stake `/2/0`, Icarus | addr1… | Yoroi, Eternl, Lace, Daedalus, Trezor (12–21 kelime) |
| Monero | ed25519 | Kendi 25 kelimelik seed'i | 4… | Monero GUI/CLI, Feather, Cake Wallet, Monerujo |

Notlar (arayüzde ve kılavuz sayfasında gösterilir): XRP ve Stellar minimum rezerv ister; Trezor 24 kelimelik Cardano'yu farklı türetir; Monero geri yüklemede oluşturma tarihi girilmeli; Taproot'ta kelimeler önerilir.

## 7. Cüzdan türleri ve güvenlik seçenekleri

| Seçenek | Kapsam | Not |
|---|---|---|
| BIP39 kelimeleri (12/24, 10 dil) | 9 coin (Monero hariç) | Varsayılan mod; isteğe bağlı sadece-zar. |
| BIP39 passphrase | BIP39 coinleri | Hiçbir kâğıda basılmaz. |
| SLIP-39 Shamir (M-of-N, 128/256 bit) | Cardano hariç | Trezor uyumlu; passphrase Feistel şifrelemesine girer (yalnızca ASCII). |
| Tek anahtar | BTC, LTC, DOGE, ETH, TRX, XRP, SOL, XLM | Klasik kâğıt cüzdan. |
| BIP38 | Tek anahtar BTC (legacy adres) | Kâğıtta yalnızca `6P…`; scrypt birkaç saniye sürer. |
| Monero | Her modda | Her zaman kendi ayrı 25 kelimesi. |
| İzleme bilgisi | BTC/LTC/DOGE xpub/zpub, Cardano hesap anahtarı, Monero view key | Arka yüzde ve sonuçta gösterilir. |

## 8. Arayüz

- **Sihirbaz:** 1 Entropi (Atla / Uygula ve devam et) → 2 Ayarlar (Cüzdan üret) → 3 Cüzdan → 4 Yazdır; her adımda Geri/İleri.
- **Gizli bilgiler** yalnızca "Göster"e basılınca DOM'a yazılır, "Gizle"de silinir; gizli QR'lar da yalnızca açıkken çizilir.
- **Yazdır:** sayfanın 2/5 ölçekli SVG önizlemesi; üst/sol boşluk, kart genişliği/yüksekliği ve kartlar arası boşluk çizgi sürükleyerek veya alanlardan ayarlanır. Önizleme ve PDF aynı `WG.pdf.placements()` fonksiyonunu kullanır.
- **PDF:** ön yüz gizli / arka yüz açık kartlar; eski projenin tüm düzen ayarları (marj, kart boyutu, boşluk, iç/dış kılavuz ve rengi, yazı rengi, yazı arka planı ve opaklığı, gölge, A4/A5/sığdır, dikey/yatay, çift taraflı baskı için aynalı sayfalar, ön/arka arka plan resmi), gömülü Unicode font, CJK kelimeler için canvas, TR/EN kılavuz sayfası (A5 seçilince A5 dikey, değilse A4; gerektiği kadar sayfaya, başlık sayfa dibinde yalnız kalmayacak ve paragrafın tek satırı ayrılmayacak şekilde bölünür). Her kartın iki yüzünün başlığı, ön ve arka yüzü kesildikten sonra eşleştirmek için "-xxxxx" (adresin son 5 karakteri; kelime/pay kartlarında ilk coinin adresi) ile biter; adresin kendisine eklenmez ki kopyalanırken karışmasın.
- **Yardım:** her seçenek ve butonun yanında küçük "?" butonu; kripto bilmeyen birine örnek ve benzetmeyle kısa açıklama (82 konu, TR/EN).
- **Ultra güvenlik rehberi:** üstteki yeşil buton yeni sekmede `guide/tr.html` / `guide/en.html`'i açar. Statik sayfa (script yok, aynı CSP). İçerik: neden günlük bilgisayar kullanılmamalı, canlı Linux'un RAM'de çalışması, Tails önerisi (7.15.1, ~1,8 GB; yedek Linux Mint 22.3 Xfce), indirme ve sitenin/dosyanın doğrulanması (Tails doğrulama aracı, SHA-256), USB hazırlama, ağın kesilmesi ve nedeni (hava boşluğu), Tails'i Offline Mode ile başlatma, uygulamayı Ev klasöründen Tor Browser'da açma (güvenlik seviyesi Standard), USB kablolu yazıcıyla çevrimdışı baskı, elle yazma, saklama, sık hatalar. Teknik terimler parantez içinde açıklanır. Bilgiler Ekim 2026'da tails.net ve linuxmint.com'dan doğrulandı. 14. bölüm telefon/tablet kullanımının risklerini ve yapılacakları anlatır.
- **Mobil:** 600 px altı ekranlarda daha dar kenar boşlukları, 2×2 adım göstergesi, alt alta gezinme butonları, 2 sütun kelime ızgarası; dokunmatik ekranlarda (`pointer: coarse`) büyütülmüş "?" butonları, en az 40 px yükseklikte kontroller ve önizlemede geniş tutma alanı. Izgaralar ekrandan geniş olamaz (`minmax(min(…, 100%), 1fr)`).
- **Tek dosya sürümü (telefonlar):** Android dosya yöneticileri HTML'i `content://` ile açtığından yan dosyalar yüklenemez; `OfflineKey-Vault-X.Y.Z.html` her şeyi gömülü taşır, rehberler `<template>` olarak gömülür ve sayfa içinde açılır. iPhone/iPad yerel HTML'de kod çalıştırmadığı için desteklenmez.

## 9. Güvenlik sertleştirme

- Gizli veri DOM'a yalnızca `textContent` ile; `eval`, `new Function`, `innerHTML` yok (kod taramasıyla doğrulandı).
- `localStorage` / `sessionStorage` / IndexedDB / çerez yok; `console` ile gizli veri basılmaz.
- `WG` ve `WGVendor` modülleri yüklendikten sonra değiştirilemez.
- Açılışta 37 kritik test (kripto, CSPRNG, CSP, vendor kilidi ve PDF/QR/font kütüphanelerinin yüklendiği dahil); biri bile düşerse üretim kilitlenir.
- Üretici her cüzdanı göstermeden önce yedeği yeniden çözer, adresleri yeniden türetir, basılacak her anahtarı geri çözüp karşılaştırır.
- "Temizle" anahtar dizilerini sıfırlar, girilen parolaları boşaltır; "Baştan başla" entropiyi de siler.
- Arka plan resimleri canvas'tan geçirilip JPEG'e çevrilir (EXIF/konum silinir).
- Release: tekrar üretilebilir zip, telefonlar için tek dosya sürümü (yalnızca gömülü script'lerin SHA-256 özetlerine izin veren CSP) ve ikisini kapsayan `SHA256SUMS`. Dosyaları GitHub Actions üretir (eylemler commit SHA'sına sabitli, yalnızca otomatik token, en az izin) ve GitHub imzalı köken belgesi ekler: `gh attestation verify <dosya> --repo snipeTR/OfflineKey-Vault`. Release aracı commit'lenmemiş değişiklik varsa çalışmaz.

## 10. Test

- `tests/test.html`: 218 test — kütüphane KAT'ları, 24 BIP39 + 17 BIP32 vektörü, BIP84/86, SLIP-0010, SEP-0005, CIP-3, 45 SLIP-39 vektörü, BIP38, Monero, Trezor ve Ian Coleman vektörleri, entropi, üretici, CSP kanarya testi. Vektörler commit'e sabitlenmiş resmi kaynaklardan gelir.
- `tools/browser-test/run.mjs`: Chrome, Edge ve Firefox'ta `file://` üzerinden `index.html`, `tests/test.html`, iki rehber sayfası ve her çalıştırmada yeniden üretilen tek dosya sürümü (CSP/konsol hatası olmamalı). Firefox'ta tam arayüz akışı (entropi → 10 coin → üret → göster/gizle → önizlemede sürükleme → PDF dosyasının gerçekten inmesi → baştan başla) ve bütün "?" butonları: masaüstünde `index.html` ile, 360×740 telefon boyutunda tek dosya sürümüyle; telefon turunda her adımda yatay taşma olmamalı. Test indirmeleri geçici profil klasörüne gider.
- Her release'ten önce zip'ten çıkan kopya da aynı testlerden geçirilir; yayımlanan zip'in hash'i indirilerek doğrulanır.
- Litecoin ltc1 için bağımsız vektör bulunamadı; Trezor LTC anahtarı + BIP84 kodlaması + SLIP-0173 "ltc" önekinden birleştirilmiş vektör kullanılıyor.

## 11. Sürüm geçmişi

| Sürüm | İçerik |
|---|---|
| M0–M1 | İskelet, vendor bundle, öz test kilidi, test sayfası; entropi havuzu ve arayüzü. |
| M2–M6 | 10 coin, SLIP-39, BIP38, kendini doğrulayan üretici, coin başına başlangıç KAT'ı. |
| M7 | Sonuç ve PDF panelleri, PDF kartlar, kılavuz sayfası. |
| v0.1.0 | AI denetim tarifnamesi, README, release aracı; ilk pre-release. |
| v0.2.0 | 4 adımlı sihirbaz (Atla / Uygula), 2/5 ölçekli sürüklenebilir sayfa önizlemesi; "Baştan başla" entropiyi sıfırlamıyordu — düzeltildi. |
| v0.3.0 | Her seçenek ve butona "?" yardım butonu (81 konu, TR/EN); akış testi bütün butonlara basıyor. |
| v0.3.1 | PLAN.md koda göre baştan güncellendi. |
| v0.4.0 | "Ultra güvenlik istiyorsanız bunu okuyun" butonu ve TR/EN rehber sayfaları (Tails ile çevrimdışı üretim ve baskı). |
| v0.4.1 | Proje adı **OfflineKey Vault** oldu (repo `snipeTR/OfflineKey-Vault`); başlıklar, belgeler, PDF bilgisi ve release zip adı (`OfflineKey-Vault-X.Y.Z.zip`) güncellendi. |
| v0.5.0 | Mobil uyum: telefon/dokunmatik düzeni, telefonlar için tek dosya sürümü (`OfflineKey-Vault-X.Y.Z.html`, gömülü rehber, özet tabanlı CSP), rehbere telefon/tablet bölümü, PDF/QR/font kütüphaneleri için kritik başlangıç testi; testler telefon boyutunda da çalışıyor ve indirmeler artık kullanıcının İndirilenler klasörüne düşmüyor. |
| v0.5.1 | Android'de coin seçince sayfanın yukarı zıplaması düzeltildi (panel yeniden kurulurken kaydırma konumu ve odak korunuyor; akış testi kontrol ediyor). PDF kartlarının iki yüzüne eşleşme kodu "-xxxxx". A5 seçilince kılavuz da A5 ve gerektiği kadar sayfaya bölünüyor. 3 yeni PDF testi. |
| v0.6.0 | Release'ler GitHub Actions'ta üretiliyor ve yayımlanıyor (testler, zip'ten çıkan kopyada tarayıcı testleri, GitHub imzalı köken belgesi); release aracı commit'lenmemiş değişiklikte durur. Uygulamada değişiklik yok. |

## 12. Açık işler

- Safari (macOS) ve gerçek Android cihazlar elle test edilmedi (bu makinede yok); tek dosya sürümü masaüstü tarayıcılarda ve 360×740 telefon boyutunda test ediliyor. iPhone/iPad yerel HTML dosyasında kod çalıştırmadığı için desteklenmiyor.
- Litecoin ltc1 için bağımsız bir referans vektörü bulunursa birleştirilmiş vektörün yerine konacak.
- Ekranda önizlemenin tam 2/5 boyutu, ekran ölçeklemesi %100 iken geçerli.
- Rehberdeki Tails adımları (Offline Mode, Tor Browser'da yerel dosya, yazıcı ekleme) belgelere dayanıyor; gerçek bir Tails oturumunda uçtan uca denenmedi. Tails sürümü değiştikçe rehberdeki sürüm/boyut bilgisi güncellenmeli.

## 13. AI güvenlik denetim tarifnamesi

Bkz. [`docs/AI_SECURITY_AUDIT.md`](AI_SECURITY_AUDIT.md).
