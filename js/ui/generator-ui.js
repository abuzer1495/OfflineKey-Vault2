/*
 * js/ui/generator-ui.js   ->   WG.generatorUi
 *
 * PURPOSE
 *   "2. Wallet settings" panel: wallet type (BIP39 / SLIP-39 / single keys),
 *   coin selection with address types, BIP39 words and language, optional
 *   passphrase, dice-only mode, SLIP-39 M-of-N, BIP38 password, and the
 *   Generate button. All choices live in a settings object owned by app.js,
 *   so they survive a language switch.
 *
 *   The Generate button is enabled only when problems() is empty: settings
 *   are consistent AND enough user entropy has been collected (credited bits
 *   >= threshold, or enough dice rolls in dice-only mode).
 *
 * SECURITY NOTES
 *   - Passphrase / BIP38 inputs are type="password" with autocomplete off;
 *     their values are passed to the generator and never rendered as text.
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var help = WG.help.button;     // small "?" button with a plain-language explanation

  /** Native names of BIP39 languages. */
  var LANG_NAMES = {
    english: 'English', spanish: 'Español', french: 'Français', italian: 'Italiano', portuguese: 'Português',
    czech: 'Čeština', japanese: '日本語', korean: '한국어', 'simplified-chinese': '简体中文', 'traditional-chinese': '繁體中文',
  };

  /** Default settings object (app.js keeps one instance for the session). */
  function defaults() {
    return {
      mode: 'bip39',
      coins: { btc: true, eth: true },
      variants: { btc: 'p2wpkh', ltc: 'p2wpkh' },
      words: 24,
      language: 'english',
      usePassphrase: false, passphrase: '', passphrase2: '',
      diceOnly: false,
      slip39: { threshold: 2, count: 3, bytes: 16 },
      bip38: { enabled: false, password: '', password2: '' },
    };
  }

  /** Coins usable in a mode (Cardano needs BIP39 entropy). */
  function coinAllowed(coin, mode) {
    if (mode === 'bip39') return true;
    if (coin.needsEntropy) return false;
    return mode === 'slip39' || coin.singleKey;
  }

  /**
   * List of i18n messages explaining why generation is not possible yet.
   * @param {object} s     settings
   * @param {object} pool  entropy pool
   * @param {number} threshold  minimum credited bits
   */
  function problems(s, pool, threshold) {
    var out = [];
    var coins = WG.coins.list().filter(function (c) { return s.coins[c.id] && coinAllowed(c, s.mode); });
    if (!coins.length) out.push(t('pbNoCoin'));
    var usesPass = s.usePassphrase && s.mode !== 'single';
    if (usesPass) {
      if (!s.passphrase) out.push(t('pbPassEmpty'));
      else if (s.passphrase !== s.passphrase2) out.push(t('pbPassMismatch'));
      if (s.mode === 'slip39' && !/^[\x20-\x7e]*$/.test(s.passphrase)) out.push(t('pbPassAscii'));
    }
    if (s.mode === 'slip39') {
      if (s.slip39.threshold > s.slip39.count) out.push(t('pbSlipThreshold'));
      if (s.slip39.threshold === 1 && s.slip39.count > 1) out.push(t('pbSlipOne'));
    }
    if (s.mode === 'single' && s.coins.btc && s.bip38.enabled) {
      if (!s.bip38.password) out.push(t('pbBip38Empty'));
      else if (s.bip38.password !== s.bip38.password2) out.push(t('pbBip38Mismatch'));
    }
    var st = pool.stats();
    if (s.mode === 'bip39' && s.diceOnly) {
      var need = WG.entropy.diceRollsNeeded(WG.bip39.WORDS_TO_BYTES[s.words]);
      if (st.diceRolls < need) out.push(t('pbDiceNeed', { n: need - st.diceRolls }));
    } else if (st.creditedBits < threshold) {
      out.push(t('pbEntropy', { n: Math.ceil(threshold - st.creditedBits) }));
    }
    return out;
  }

  /** <select> helper: options [[value, label]], current value, onChange(value). */
  function select(id, options, value, onChange) {
    var sel = el('select', { id: id }, options.map(function (o) {
      return el('option', { value: String(o[0]), selected: String(o[0]) === String(value) ? 'selected' : null }, o[1]);
    }));
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }

  /** Checkbox with label and a help button. */
  function checkbox(id, checked, label, onChange, helpKey) {
    var box = el('input', { type: 'checkbox', id: id, checked: checked ? 'checked' : null });
    box.addEventListener('change', function () { onChange(box.checked); });
    return el('label', { class: 'check', for: id }, box, ' ', label, help(helpKey));
  }

  /** Password input bound to obj[key]. */
  function password(id, obj, key, placeholder, onInput) {
    var input = el('input', { type: 'password', id: id, autocomplete: 'new-password', spellcheck: 'false', placeholder: placeholder });
    input.value = obj[key];
    input.addEventListener('input', function () { obj[key] = input.value; onInput(); });
    return input;
  }

  /**
   * Build the panel.
   * @param {object} pool
   * @param {{settings: object, threshold: number, onGenerated: function(set), onError: function(Error)}} opts
   */
  function create(pool, opts) {
    var s = opts.settings;
    var section = el('section', { class: 'card generator' });
    var busy = false;

    /**
     * Rebuild the panel content (cheap; called after structural changes).
     * Rebuilding empties the panel for a moment, which made mobile browsers
     * jump up to the panel top and lose the tapped control's focus, so the
     * scroll position and the focused element are restored afterwards.
     */
    function render() {
      var y = window.scrollY;
      var active = document.activeElement;
      var focusId = active && section.contains(active) ? active.id : null;
      build();
      window.scrollTo(0, y);
      var again = focusId && document.getElementById(focusId);
      if (again) again.focus({ preventScroll: true });
    }

    /** Create every control of the panel from the settings. */
    function build() {
      WG.dom.clear(section);
      section.appendChild(el('h2', null, t('genTitle'), help('settings')));

      // Wallet type
      var modes = [['bip39', t('modeBip39'), t('modeBip39Help'), 'modeBip39'], ['slip39', t('modeSlip39'), t('modeSlip39Help'), 'modeSlip39'], ['single', t('modeSingle'), t('modeSingleHelp'), 'modeSingle']];
      section.appendChild(el('fieldset', null, el('legend', null, t('genMode'), help('mode')),
        modes.map(function (m) {
          var r = el('input', { type: 'radio', name: 'mode', id: 'mode-' + m[0], value: m[0], checked: s.mode === m[0] ? 'checked' : null });
          r.addEventListener('change', function () { s.mode = m[0]; render(); });
          return el('div', { class: 'radio-row' }, el('label', { for: 'mode-' + m[0] }, r, ' ', el('strong', null, m[1]), help(m[3])), el('p', { class: 'muted small' }, m[2]));
        })));

      // Coins
      section.appendChild(el('fieldset', null, el('legend', null, t('genCoins'), help('coins')),
        el('div', { class: 'coin-grid' }, WG.coins.list().map(function (c) {
          var allowed = coinAllowed(c, s.mode);
          var box = el('input', { type: 'checkbox', id: 'coin-' + c.id, checked: s.coins[c.id] && allowed ? 'checked' : null, disabled: allowed ? null : 'disabled' });
          box.addEventListener('change', function () { s.coins[c.id] = box.checked; render(); });
          var row = el('div', { class: 'coin-row' + (allowed ? '' : ' disabled') },
            el('label', { for: 'coin-' + c.id }, box, ' ', el('strong', null, c.symbol), ' ', c.name), help('coin_' + c.id));
          if (c.variants.length > 1 && allowed && s.coins[c.id] && !(c.id === 'btc' && s.mode === 'single' && s.bip38.enabled)) {
            row.appendChild(select('variant-' + c.id, c.variants.map(function (v) { return [v.id, t(v.labelKey)]; }), s.variants[c.id] || c.defaultVariant,
              function (val) { s.variants[c.id] = val; update(); }), help('variant'));
          }
          if (!allowed) row.appendChild(el('span', { class: 'muted small' }, t(c.needsEntropy ? 'coinNeedsBip39' : 'coinNoSingle')));
          return row;
        })),
        el('p', { class: 'muted small' }, t('genMoneroNote'))));

      // Mode-specific options
      var opt = el('fieldset', null, el('legend', null, t('genOptions')));
      if (s.mode === 'bip39') {
        opt.appendChild(el('div', { class: 'input-row' },
          el('label', { for: 'words' }, t('genWords')), select('words', [[12, '12'], [24, '24']], s.words, function (v) { s.words = parseInt(v, 10); update(); }), help('words'),
          el('label', { for: 'language' }, t('genLanguage')), select('language', WG.bip39.LANGUAGES.map(function (l) { return [l, LANG_NAMES[l]]; }), s.language, function (v) { s.language = v; render(); }), help('language')));
        if (s.language !== 'english') opt.appendChild(el('p', { class: 'warn small' }, t('genLanguageWarn')));
        opt.appendChild(checkbox('dice-only', s.diceOnly, t('genDiceOnly'), function (v) { s.diceOnly = v; render(); }, 'diceOnly'));
        if (s.diceOnly) opt.appendChild(el('p', { class: 'warn small' }, t('genDiceOnlyWarn', { need: WG.entropy.diceRollsNeeded(WG.bip39.WORDS_TO_BYTES[s.words]) })));
      }
      if (s.mode === 'slip39') {
        var nums = function (from, to) { var a = []; for (var i = from; i <= to; i++) a.push([i, String(i)]); return a; };
        opt.appendChild(el('div', { class: 'input-row' },
          el('label', { for: 'slip-m' }, t('genSlipThreshold')), select('slip-m', nums(1, 16), s.slip39.threshold, function (v) { s.slip39.threshold = parseInt(v, 10); update(); }), help('slipM'),
          el('label', { for: 'slip-n' }, t('genSlipCount')), select('slip-n', nums(1, 16), s.slip39.count, function (v) { s.slip39.count = parseInt(v, 10); update(); }), help('slipN'),
          el('label', { for: 'slip-bits' }, t('genSlipBits')), select('slip-bits', [[16, '128 bit (20 ' + t('words') + ')'], [32, '256 bit (33 ' + t('words') + ')']], s.slip39.bytes, function (v) { s.slip39.bytes = parseInt(v, 10); update(); }), help('slipBits')));
        opt.appendChild(el('p', { class: 'muted small' }, t('genSlipHelp')));
      }
      if (s.mode !== 'single') {
        opt.appendChild(checkbox('use-pass', s.usePassphrase, t(s.mode === 'slip39' ? 'genPassSlip' : 'genPass'), function (v) { s.usePassphrase = v; render(); }, 'passphrase'));
        if (s.usePassphrase) {
          opt.appendChild(el('div', { class: 'input-row' },
            password('pass1', s, 'passphrase', t('genPassPh'), update), password('pass2', s, 'passphrase2', t('genPassPh2'), update)));
          opt.appendChild(el('p', { class: 'warn small' }, t('genPassWarn')));
        }
      }
      if (s.mode === 'single') {
        opt.appendChild(el('p', { class: 'muted small' }, t('genSingleHelp')));
        if (s.coins.btc) {
          opt.appendChild(checkbox('bip38', s.bip38.enabled, t('genBip38'), function (v) { s.bip38.enabled = v; render(); }, 'bip38'));
          if (s.bip38.enabled) {
            opt.appendChild(el('div', { class: 'input-row' },
              password('bip38-1', s.bip38, 'password', t('genPassPh'), update), password('bip38-2', s.bip38, 'password2', t('genPassPh2'), update)));
            opt.appendChild(el('p', { class: 'warn small' }, t('genBip38Warn')));
          }
        }
      }
      section.appendChild(opt);

      // Generate
      problemList = el('ul', { class: 'problems' });
      button = el('button', { type: 'button', class: 'primary big', id: 'generate' }, t('genButton'));
      button.addEventListener('click', run);
      status = el('p', { class: 'muted small', role: 'status' });
      section.appendChild(el('div', { class: 'generate-row' }, button, help('generate'), status));
      section.appendChild(problemList);
      update();
    }

    var problemList, button, status;

    /** Refresh the problem list and the button state (no rebuild). */
    function update() {
      if (!button) return;
      var list = problems(s, pool, opts.threshold);
      WG.dom.clear(problemList);
      list.forEach(function (p) { problemList.appendChild(el('li', null, p)); });
      button.disabled = busy || list.length > 0;
    }

    /** Collect settings into a generator request and run it. */
    async function run() {
      if (busy || problems(s, pool, opts.threshold).length) return;
      busy = true;
      update();
      status.textContent = t('genWorking');
      // Let the browser paint the "working" state before the CPU-heavy part.
      await new Promise(function (r) { setTimeout(r, 30); });
      try {
        var coins = WG.coins.list().filter(function (c) { return s.coins[c.id] && coinAllowed(c, s.mode); }).map(function (c) { return c.id; });
        var set = await WG.generator.generate({
          mode: s.mode, coins: coins, variants: s.variants, words: s.words, language: s.language,
          passphrase: s.usePassphrase && s.mode !== 'single' ? s.passphrase : '',
          diceOnly: s.mode === 'bip39' && s.diceOnly,
          slip39: s.slip39, bip38: { enabled: s.mode === 'single' && s.coins.btc && s.bip38.enabled, password: s.bip38.password },
          minCreditedBits: s.mode === 'bip39' && s.diceOnly ? 0 : opts.threshold,
          onProgress: function (step) { status.textContent = t('genStep_' + step); },
        });
        status.textContent = '';
        opts.onGenerated(set);
      } catch (e) {
        status.textContent = '';
        opts.onError(e);
      } finally {
        busy = false;
        update();
      }
    }

    var unsubscribe = pool.onChange(function () { requestAnimationFrame(update); });
    render();
    return {
      element: section,
      destroy: function () { unsubscribe(); },
    };
  }

  WG.define('generatorUi', { create: create, defaults: defaults, problems: problems, coinAllowed: coinAllowed });
})(window.WG);
