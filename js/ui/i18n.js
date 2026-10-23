/*
 * js/ui/i18n.js   ->   WG.i18n
 *
 * PURPOSE
 *   Minimal Turkish/English UI text dictionary. Default language follows the
 *   browser (tr* -> Turkish, anything else -> English); the choice is NOT
 *   persisted because the app never writes to browser storage.
 *
 * USAGE
 *   WG.i18n.t('key')            -> text in the current language
 *   WG.i18n.t('key', {n: 3})    -> "{n}" placeholders replaced
 *   WG.i18n.setLang('en')       -> switch and notify listeners
 *   WG.i18n.onChange(fn)        -> fn(lang) after every switch
 */
(function (WG) {
  'use strict';

  var dict = {
    tr: {
      appTitle: 'Çevrimdışı Kâğıt Cüzdan Üreticisi',
      appSubtitle: 'Bitcoin, Ethereum, Monero ve diğerleri için tarayıcıda, internetsiz cüzdan üretimi.',
      langSwitch: 'English',
      netOnline: 'İnternete bağlısınız. Gerçek bir cüzdan üretmeden önce bağlantıyı kesin (Wi-Fi/kablo) ve sayfayı yeniden açın.',
      netOffline: 'Çevrimdışısınız. Güvenli üretim için doğru ortam.',
      selftestTitle: 'Öz test',
      selftestRunning: 'Kriptografik öz testler çalışıyor…',
      selftestPassed: 'Tüm kritik testler geçti ({passed}/{total}). Kriptografi doğru çalışıyor.',
      selftestFailed: '{failed} kritik test BAŞARISIZ. Cüzdan üretimi kilitlendi; bu tarayıcıyı veya dosyaları kullanmayın.',
      selftestDetails: 'Test ayrıntıları',
      fullTests: 'Tüm testleri çalıştır (tests/test.html)',
      wipTitle: 'Cüzdan üretimi',
      wipBody: 'Geliştirme sürümü (M1): entropi toplama hazır. Cüzdan üretimi bir sonraki aşamada (M2) eklenecek.',
      vendorTitle: 'Kullanılan kütüphaneler',
      footer: 'Açık kaynak, MIT lisansı. Hiçbir veri ağa gönderilmez.',

      entTitle: '1. Entropi (rastgelelik) toplama',
      entIntro: 'Tarayıcının güvenli rastgele sayı üreteci her zaman kullanılır. Buradaki kaynaklar ona ek bir güvenlik katmanı ekler: üreteç hatalı ya da arka kapılı olsa bile anahtarlarınız sizin rastgeleliğinize dayanır. Kullanıcı girdisi güvenliği asla düşüremez.',
      entThreshold: 'Gereken minimum:',
      entReady: 'Yeterli kullanıcı entropisi toplandı.',
      entNeedMore: 'Devam etmek için yaklaşık {n} bit daha gerekli.',
      entPadTitle: 'Fare / dokunma',
      entPadHint: 'Bu alanda fareyi veya parmağınızı rastgele hareket ettirin. Her kabul edilen örnek 0,5 bit sayılır.',
      entDiceTitle: 'Zar (en güçlü kaynak)',
      entDiceHint: 'Gerçek bir zar atın ve sonuçları yazın ya da düğmelerle girin; sonra "Ekle"ye basın. Her atış 2,585 bit sayılır. Eklemeden önce yazım hatalarını düzeltebilirsiniz.',
      entDieFace: 'Zar yüzü {v}',
      entAdd: 'Ekle',
      entDiceInvalid: 'Yalnızca 1–6 arası rakamlar girilebilir (boşluk ve virgül serbest).',
      entDiceAdded: '{n} atış eklendi.',
      entDiceOnlyInfo: 'Eklenen zar atışı: {n}. "Sadece zar" modu için 12 kelimede en az {need128}, 24 kelimede en az {need256} atış gerekir.',
      entCoinTitle: 'Yazı-tura',
      entHeads: 'Tura',
      entTails: 'Yazı',
      entTextTitle: 'Serbest metin',
      entTextHint: 'Rastgele tuşlara basın veya aklınıza geleni yazın. Metin karıştırılır ama kredi verilmez; tuş zamanlamaları ise sayılır.',
      entTextPlaceholder: 'örn. asdkj 83jd …',
      entMix: 'Karıştır',
      entBreakdown: 'Kaynaklara göre dağılım',
      entSource: 'Kaynak',
      entEvents: 'Olay',
      entBits: 'Bit',
      entCreditNote: 'Bit değerleri kasıtlı olarak düşük tahmin edilir; yalnızca "yeterince katkı yapıldı mı" kontrolü için kullanılır.',
      entReset: 'Entropiyi sıfırla',
      entResetConfirm: 'Toplanan tüm entropi silinecek. Emin misiniz?',
      src_dice: 'Zar',
      src_coin: 'Yazı-tura',
      src_pointer: 'Fare / dokunma',
      src_keyboard: 'Tuş zamanlaması',
      src_text: 'Serbest metin (0 kredi)',
      src_jitter: 'Zamanlayıcı titreşimi (0 kredi)',
    },
    en: {
      appTitle: 'Offline Paper Wallet Generator',
      appSubtitle: 'In-browser, offline wallet generation for Bitcoin, Ethereum, Monero and more.',
      langSwitch: 'Türkçe',
      netOnline: 'You are online. Disconnect (Wi-Fi/cable) and reopen this page before generating a real wallet.',
      netOffline: 'You are offline. This is the right environment for safe generation.',
      selftestTitle: 'Self-test',
      selftestRunning: 'Running cryptographic self-tests…',
      selftestPassed: 'All critical tests passed ({passed}/{total}). Cryptography works correctly.',
      selftestFailed: '{failed} critical test(s) FAILED. Wallet generation is locked; do not use this browser or these files.',
      selftestDetails: 'Test details',
      fullTests: 'Run the full test suite (tests/test.html)',
      wipTitle: 'Wallet generation',
      wipBody: 'Development build (M1): entropy collection is ready. Wallet generation arrives in the next milestone (M2).',
      vendorTitle: 'Bundled libraries',
      footer: 'Open source, MIT license. No data is ever sent to the network.',

      entTitle: '1. Collect entropy (randomness)',
      entIntro: 'The browser\'s secure random generator is always used. The sources below add an extra layer: even if that generator were broken or backdoored, your keys would still rest on your own randomness. User input can never lower security.',
      entThreshold: 'Required minimum:',
      entReady: 'Enough user entropy collected.',
      entNeedMore: 'About {n} more bits needed to continue.',
      entPadTitle: 'Mouse / touch',
      entPadHint: 'Move your mouse or finger randomly inside this area. Each accepted sample counts as 0.5 bit.',
      entDiceTitle: 'Dice (strongest source)',
      entDiceHint: 'Roll a real die and type the results or use the buttons, then press "Add". Each roll counts as 2.585 bits. You can fix typos before adding.',
      entDieFace: 'Die face {v}',
      entAdd: 'Add',
      entDiceInvalid: 'Only digits 1–6 are allowed (spaces and commas are fine).',
      entDiceAdded: '{n} roll(s) added.',
      entDiceOnlyInfo: 'Dice rolls added: {n}. "Dice only" mode needs at least {need128} rolls for 12 words and {need256} for 24 words.',
      entCoinTitle: 'Coin flips',
      entHeads: 'Heads',
      entTails: 'Tails',
      entTextTitle: 'Free text',
      entTextHint: 'Mash random keys or type anything. The text is mixed in but credited 0 bits; key timings do count.',
      entTextPlaceholder: 'e.g. asdkj 83jd …',
      entMix: 'Mix in',
      entBreakdown: 'Breakdown by source',
      entSource: 'Source',
      entEvents: 'Events',
      entBits: 'Bits',
      entCreditNote: 'Bit values are deliberately underestimated; they only answer "has the user contributed enough?".',
      entReset: 'Reset entropy',
      entResetConfirm: 'All collected entropy will be discarded. Are you sure?',
      src_dice: 'Dice',
      src_coin: 'Coin flips',
      src_pointer: 'Mouse / touch',
      src_keyboard: 'Key timing',
      src_text: 'Free text (0 credit)',
      src_jitter: 'Timer jitter (0 credit)',
    },
  };

  var lang = /^tr\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '') ? 'tr' : 'en';
  var listeners = [];

  /** Translate a key, substituting {name} placeholders from vars. Unknown keys return the key itself. */
  function t(key, vars) {
    var s = (dict[lang] && dict[lang][key]) || dict.en[key] || key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; });
    }
    return s;
  }

  /** Switch language ('tr' | 'en') and notify listeners. */
  function setLang(next) {
    if (!dict[next]) throw new Error('unsupported language ' + next);
    lang = next;
    document.documentElement.lang = next;
    listeners.forEach(function (fn) { fn(lang); });
  }

  WG.define('i18n', {
    t: t,
    setLang: setLang,
    lang: function () { return lang; },
    languages: Object.freeze(Object.keys(dict)),
    onChange: function (fn) { listeners.push(fn); },
  });
})(window.WG);
