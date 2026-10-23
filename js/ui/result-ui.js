/*
 * js/ui/result-ui.js   ->   WG.resultUi
 *
 * PURPOSE
 *   "3. Your wallet" panel: shows a generated, verified wallet set:
 *     - safety instructions and the list of verification checks that passed,
 *     - the backup (BIP39 words, SLIP-39 shares) and, per coin, the address
 *       with QR code, public / watch-only data and private keys.
 *
 * SECURITY NOTES
 *   - Secrets (words, private keys) are written into the DOM only after the
 *     user presses "Show" and removed again on "Hide"; their QR codes are
 *     drawn only while shown.
 *   - Text goes through WG.dom (textContent only).
 *   - "Clear" asks app.js to wipe the set and remove this panel.
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var help = WG.help.button;     // small "?" button with a plain-language explanation

  var HIDDEN = '•••• •••• •••• ••••';

  /** Which help text explains an item, by its label key. */
  var HELP_FOR = {
    lblAddress: 'address', lblPublicKey: 'publicKey', lblTaprootOutputKey: 'publicKey', lblStakeAddress: 'stake',
    lblZpub: 'watch', lblXpub: 'watch', lblAcctXvk: 'watch', lblViewKey: 'watch',
    lblWif: 'privateKey', lblWifTaproot: 'privateKey', lblPrivateKeyHex: 'privateKey', lblSolanaSecret: 'privateKey',
    lblStellarSecret: 'privateKey', lblSpendKey: 'privateKey', lblMoneroMnemonic: 'mnemonic', lblBip38: 'bip38key',
  };

  /** Item label with its help button. */
  function label(labelKey) {
    return el('span', { class: 'label' }, t(labelKey), help(HELP_FOR[labelKey] || 'wallet'));
  }

  /**
   * A secret value block. The value is written into the DOM only while
   * shown, and removed again on "Hide" (not merely blurred).
   */
  function secretBlock(labelKey, value, withQr) {
    var text = el('div', { class: 'secret-value mono muted' }, HIDDEN);
    var qrSlot = el('div', { class: 'qr-slot' });
    var shown = false;
    var btn = el('button', { type: 'button', class: 'reveal' }, t('btnShow'));
    btn.addEventListener('click', function () {
      shown = !shown;
      text.textContent = shown ? value : HIDDEN;
      text.classList.toggle('muted', !shown);
      btn.textContent = shown ? t('btnHide') : t('btnShow');
      WG.dom.clear(qrSlot);
      if (shown && withQr) qrSlot.appendChild(sizedQr(value, 150));
    });
    return el('div', { class: 'item secret' }, el('div', { class: 'item-head' }, label(labelKey), btn), text, qrSlot);
  }

  /** A public value block (always visible) with an optional QR. */
  function publicBlock(labelKey, value, withQr) {
    return el('div', { class: 'item public' },
      el('div', { class: 'item-head' }, label(labelKey)),
      el('div', { class: 'mono value' }, value),
      withQr ? el('div', { class: 'qr-slot' }, sizedQr(value, 150)) : null);
  }

  /** QR canvas at a CSS size (set through CSSOM, which the CSP allows). */
  function sizedQr(text, px) {
    var c = WG.qr.toCanvas(text, px);
    c.style.width = px + 'px';
    c.style.height = px + 'px';
    return c;
  }

  /** Numbered word grid for BIP39 words or a SLIP-39 share; words exist in the DOM only while shown. */
  function wordGrid(words) {
    var grid = el('ol', { class: 'word-grid' });
    var shown = false;
    var btn = el('button', { type: 'button', class: 'reveal' }, t('btnShow'));
    btn.addEventListener('click', function () {
      shown = !shown;
      WG.dom.clear(grid);
      words.forEach(function (w) { grid.appendChild(el('li', shown ? null : { class: 'muted' }, shown ? w : '••••')); });
      btn.textContent = shown ? t('btnHide') : t('btnShow');
    });
    words.forEach(function () { grid.appendChild(el('li', { class: 'muted' }, '••••')); });
    return el('div', { class: 'words' }, btn, grid);
  }

  /** Variant label of a result (address type / derivation scheme). */
  function variantLabel(r) {
    var coin = WG.coins.get(r.coin);
    var v = coin.variants.filter(function (x) { return x.id === r.variant; })[0];
    return v ? t(v.labelKey) : '';
  }

  /** One coin card. */
  function coinCard(r, set) {
    var coin = WG.coins.get(r.coin);
    var where = r.coin === 'xmr' ? t('ownSeed') : (r.path ? r.path : t('singleKey'));
    return el('article', { class: 'coin-card' },
      el('h3', null, r.name + ' (' + r.symbol + ')', help('coin_' + r.coin)),
      el('p', { class: 'muted small' }, variantLabel(r) + ' · ' + where),
      r.publics.map(function (p) { return publicBlock(p.labelKey, p.value, p.qr); }),
      r.watch.map(function (p) { return publicBlock(p.labelKey, p.value, p.qr); }),
      r.secrets.map(function (p) { return secretBlock(p.labelKey, p.value, p.qr); }),
      r.secrets.length || r.coin === 'xmr' ? null : el('p', { class: 'muted small' }, t(set.mode === 'slip39' ? 'backupIsShares' : 'backupIsMnemonic')),
      el('p', { class: 'muted small' }, t('compatWallets') + ' ' + coin.wallets),
      r.notes.map(function (n) { return el('p', { class: 'warn small' }, t(n)); }));
  }

  /**
   * Build the panel.
   * @param {object} set  wallet set from WG.generator.generate
   * @param {{onClear: function}} opts
   */
  function create(set, opts) {
    var created = new Date(set.createdAt);
    var section = el('section', { class: 'card result', id: 'result' });
    section.appendChild(el('h2', null, t('resTitle'), help('wallet')));
    section.appendChild(el('p', { class: 'muted small' }, t('resCreated', { date: created.toLocaleString() })));
    section.appendChild(el('ul', { class: 'warn-list' }, ['resWarn1', 'resWarn2', 'resWarn3', 'resWarn4'].map(function (k) { return el('li', null, t(k)); })));
    section.appendChild(el('details', null,
      el('summary', null, t('resChecks', { n: set.checks.length }), help('checks')),
      el('ul', { class: 'test-list' }, set.checks.map(function (c) { return el('li', { class: c.ok ? 'ok' : 'fail' }, (c.ok ? '✓ ' : '✗ ') + c.what); }))));

    // Backup
    if (set.mnemonic) {
      var words = WG.bip39.words(set.mnemonic);
      section.appendChild(el('div', { class: 'backup' },
        el('h3', null, t('resMnemonic', { n: words.length, lang: set.language }), help('mnemonic')),
        set.diceOnly ? el('p', { class: 'muted small' }, t('resDiceOnly')) : null,
        wordGrid(words),
        set.hasPassphrase ? el('p', { class: 'warn' }, t('resHasPass')) : null));
    }
    if (set.shares) {
      section.appendChild(el('div', { class: 'backup' },
        el('h3', null, t('resShares', { m: set.slip39.threshold, n: set.slip39.count }), help('shares')),
        el('p', { class: 'muted small' }, t('resSharesHelp')),
        set.shares.map(function (sh, i) {
          return el('div', { class: 'share' }, el('h4', null, t('resShare', { i: i + 1, n: set.shares.length, m: set.slip39.threshold })), wordGrid(sh.split(' ')));
        }),
        set.hasPassphrase ? el('p', { class: 'warn' }, t('resHasPass')) : null));
    }

    // Coins
    section.appendChild(el('div', { class: 'coin-cards' }, set.results.map(function (r) { return coinCard(r, set); })));

    var clearBtn = el('button', { type: 'button', class: 'danger' }, t('resClear'));
    clearBtn.addEventListener('click', function () { if (window.confirm(t('resClearConfirm'))) opts.onClear(); });
    section.appendChild(el('div', { class: 'input-row' }, clearBtn, help('clear')));
    return { element: section, destroy: function () {} };
  }

  WG.define('resultUi', { create: create, variantLabel: variantLabel });
})(window.WG);
