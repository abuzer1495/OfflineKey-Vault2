# Plan — kripto_wallet_offline_yet: portable, çevrimdışı, çoklu coin kâğıt cüzdan üreticisi

Durum: v0.1.0 yayımlandı (2026-10-23). Repo: `snipeTR/kripto_wallet_offline_yet` (2026-10-23'te ayrı repoya taşındı, temiz geçmiş). Odak: basılıp kesilmeye uygun kâğıt cüzdan kartları. Önceki proje `monero-PDF-wallet-generator` (PHP, yalnızca Monero) GitHub'dan kaldırıldı; tam geçmişi yerel bir git bundle yedeğinde duruyor.

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

### M1 — tamamlandı (2026-10-23)
- `js/core/entropy-pool.js` (`WG.entropy`): uygulamadaki tek gizli rastgelelik kaynağı. absorb = SHA-512 zinciri; extract = HKDF-SHA512(taze CSPRNG 64 B ‖ havuz) + ratchet; `extract()` öz test geçmeden ve istenen minimum kredi yoksa çalışmaz.
- Kaynaklar ve kredi: zar d6 2,585 bit, yazı-tura 1, fare/dokunma örneği 0,5 (≥10 ms ve ≥4 px aralıkla), tuş zamanlaması 1 (≥15 ms, tekrar yok, tuşun kendisi kaydedilmez), serbest metin / zamanlayıcı titreşimi 0.
- Sadece zar modu (Coldcard uyumlu): SHA-256(atış rakamları). 128 bit için 50, 256 bit için **100** atış (99 atış = 255,9 bit olduğundan Coldcard'ın 99'u yerine katı ≥256 seçildi). Kullanılan atışlar silinir, tekrar kullanılamaz.
- Arayüz: bit sayacı + eşik seçimi (128/256/512, vars. 256), fare/dokunma alanı, zar tamponu (düzeltilebilir, "Ekle" ile işlenir), yazı-tura, serbest metin, kaynak dağılımı, sıfırlama. Sayfa sabit bölmelerle çiziliyor; yazarken arayüz yeniden kurulmuyor.
- 4 yeni kritik KAT (beklenen değerler Node.js crypto ile bağımsız hesaplandı) + 8 davranış testi → toplam 80 test, Chrome/Edge/Firefox'ta geçti. Firefox'ta arayüz duman testi (6 zar + 1 tura = 16 bit).

### M2–M6 — tamamlandı (2026-10-23)
- 10 coin: BTC (BIP84/86/44), LTC (BIP84/44), DOGE, ETH, TRX, XRP, SOL, XLM, ADA (Icarus + BIP32-Ed25519, Shelley base adres), XMR (kendi 25 kelimesi). BIP39 seed fonksiyonu doğrudan spesifikasyon metninden yazıldı (kütüphane 3 kelimelik referans vektörleri reddettiği için).
- SLIP-39 (python-shamir-mnemonic'in satır satır çevirisi; 45 resmi vektörün tamamı geçiyor), BIP38 (non-EC-multiply; resmi vektörler).
- `js/wallet/generator.js`: bip39 / slip39 / tek anahtar modları; her cüzdan dönmeden önce yedekler yeniden çözülüyor, adresler yeniden türetiliyor, basılan her anahtar geri çözülüp karşılaştırılıyor. Cardano SLIP-39 ve tek anahtar modunda yok (BIP39 entropisi gerekir).
- Test vektörleri commit'e sabitlenmiş kaynaklardan: bitcoin/bips, satoshilabs/slips, stellar SEP-5, CIP-3, Monero fonksiyonel testleri, Trezor firmware fixture'ları, Ian Coleman. Litecoin ltc1 için bağımsız vektör bulunamadı; Trezor LTC anahtarı + BIP84 kodlaması + SLIP-0173 "ltc" önekinden birleştirilmiş vektör kullanıldı.
- Her coin için bir kritik başlangıç KAT'ı (`js/coins/selftest-coins.js`).

### M7 — tamamlandı (2026-10-23)
- Panel 2 (ayarlar), 3 (sonuç; gizli bilgiler yalnızca "Göster"e basılınca DOM'a yazılır), 4 (PDF).
- PDF: ön yüz gizli / arka yüz açık kartlar, eski projenin tüm düzen ayarları, köşe kesim kılavuzları, çift taraflı baskı için aynalanmış sayfalar, "sığdır", arka plan resimleri (canvas ile JPEG'e yeniden kodlanır, meta veri silinir), gömülü DejaVu Sans Mono, CJK kelimeler için canvas, TR/EN kılavuz sayfası.
- Firefox'ta tam kullanıcı akışı testi: entropi → 10 coin → üret → PDF.

### M8 — tamamlandı (2026-10-23)
- `docs/AI_SECURITY_AUDIT.md`, README, LICENSE üçüncü taraf notları.
- `tools/release/make-zip.mjs`: git'te izlenen dosyalardan tekrar üretilebilir zip + SHA256SUMS; v0.1.0 GitHub pre-release.
- Safari / iOS elle test edilmedi (bu makinede yok).

### v0.2.0 (2026-10-23)
- Tek sayfa yerine 4 adımlı sihirbaz (Geri/İleri): Entropi → Ayarlar → Cüzdan → Yazdır. Entropi adımında "Atla" (onayla, yalnızca CSPRNG) ve "Uygula ve devam et" (eşik dolunca).
- Yazdır adımında görsel düzenleyici: sayfanın 2/5 ölçekli SVG önizlemesi; üst/sol boşluk, kart genişliği/yüksekliği ve kartlar arası boşluk çizgi sürükleyerek veya alanlardan ayarlanır, iki yön senkron. Önizleme ve PDF aynı `WG.pdf.placements()` fonksiyonunu kullanır.
- Firefox akış testi sihirbazı, sürüklemeyi ve alan→çizgi senkronunu da sınıyor.
- Hata düzeltmesi: "Temizle ve baştan başla" entropi havuzunu sıfırlamıyordu; sayaç eski değerden devam ediyordu. Artık havuz sıfırlanıyor; akış testi bunu ve tek fare hareketinin tam 0,5 bit eklediğini kontrol ediyor.
- Kural: her sürüm GitHub release olarak yayımlanır (`tools/release/make-zip.mjs` + `gh release create`).

### v0.3.0 (2026-10-23)
- Her seçenek ve butonun yanında küçük "?" yardım butonu (`js/ui/help.js`, metinler `js/ui/help-texts.js`, TR/EN): kripto bilmeyen birine örnek ve benzetmeyle kısa açıklama; tek ortak `<dialog>`, metin `textContent` ile.
- Akış testi 4 adımın her birinde ekrandaki bütün "?" butonlarına basıyor (124 buton), metinlerin dolu olduğunu ve TR/EN anahtarlarının aynı olduğunu kontrol ediyor.
- Eski `monero-PDF-wallet-generator` yerel klasörü kullanıcının isteğiyle silindi (geçmiş `_backup` bundle'ında).

## 12. AI güvenlik denetim tarifnamesi

Bkz. [`docs/AI_SECURITY_AUDIT.md`](AI_SECURITY_AUDIT.md).
