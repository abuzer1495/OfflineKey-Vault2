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
      wipTitle: 'Geliştirme sürümü',
      wipBody: 'Bu v2 iskeletidir (M0). Entropi toplama ve cüzdan üretimi sonraki aşamalarda eklenecek.',
      vendorTitle: 'Kullanılan kütüphaneler',
      footer: 'Açık kaynak, MIT lisansı. Hiçbir veri ağa gönderilmez.',
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
      wipTitle: 'Development build',
      wipBody: 'This is the v2 skeleton (M0). Entropy collection and wallet generation arrive in later milestones.',
      vendorTitle: 'Bundled libraries',
      footer: 'Open source, MIT license. No data is ever sent to the network.',
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
