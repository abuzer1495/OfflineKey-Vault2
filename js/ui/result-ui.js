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
 *   - Every secret starts masked (blurred, not selectable); QR codes of
 *     secrets are only drawn after the user presses "Show".
 *   - Text goes through WG.dom (textContent only).
 *   - "Clear" asks app.js to wipe the set and remove this panel.
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;

  /** A secret value block: masked text + reveal button + lazy QR. */
  function secretBlock(label, value, withQr) {
    var text = el('div', { class: 'secret-value masked mono', 'aria-hidden': 'true' }, value);
    var qrSlot = el('div', { class: 'qr-slot' });
    var shown = false;
    var btn = el('button', { type: 'button', class: 'reveal' }, t('btnShow'));
    btn.addEventListener('click', function () {
      shown = !shown;
      text.classList.toggle('masked', !shown);
      text.setAttribute('aria-hidden', shown ? 'false' : 'true');
      btn.textContent = shown ? t('btnHide') : t('btnShow');
      WG.dom.clear(qrSlot);
      if (shown && withQr) qrSlot.appendChild(sizedQr(value, 150));
    });
    return el('div', { class: 'item secret' }, el('div', { class: 'item-head' }, el('span', { class: 'label' }, label), btn), text, qrSlot);
  }

  /** A public value block (always visible) with an optional QR. */
  function publicBlock(label, value, withQr) {
    return el('div', { class: 'item public' },
      el('div', { class: 'item-head' }, el('span', { class: 'label' }, label)),
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

  /** Numbered word grid (masked) for BIP39 words or a SLIP-39 share. */
  function wordGrid(words) {
    var grid = el('ol', { class: 'word-grid masked', 'aria-hidden': 'true' }, words.map(function (w) { return el('li', null, w); }));
    var btn = el('button', { type: 'button', class: 'reveal' }, t('btnShow'));
    btn.addEventListener('click', function () {
      var masked = grid.classList.toggle('masked');
      grid.setAttribute('aria-hidden', masked ? 'true' : 'false');
      btn.textContent = masked ? t('btnShow') : t('btnHide');
    });
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
      el('h3', null, r.name + ' (' + r.symbol + ')'),
      el('p', { class: 'muted small' }, variantLabel(r) + ' · ' + where),
      r.publics.map(function (p) { return publicBlock(t(p.labelKey), p.value, p.qr); }),
      r.watch.map(function (p) { return publicBlock(t(p.labelKey), p.value, p.qr); }),
      r.secrets.map(function (p) { return secretBlock(t(p.labelKey), p.value, p.qr); }),
      r.secrets.length || r.coin === 'xmr' ? null : el('p', { class: 'muted small' }, t(set.mode === 'slip39' ? 'backupIsShares' : 'backupIsMnemonic')),
      el('p', { class: 'muted small' }, t('compatWallets') + ' ' + coin.wallets),
      r.notes.map(function (n) { return el('p', { class: 'warn small' }, t(n)); }));
  }

  /**
   * Build the panel.
   * @param {object} set  wallet set from WG.generator.generate
   * @param {{onClear: function, onPdf: function}} opts
   */
  function create(set, opts) {
    var created = new Date(set.createdAt);
    var section = el('section', { class: 'card result', id: 'result' });
    section.appendChild(el('h2', null, t('resTitle')));
    section.appendChild(el('p', { class: 'muted small' }, t('resCreated', { date: created.toLocaleString() })));
    section.appendChild(el('ul', { class: 'warn-list' }, ['resWarn1', 'resWarn2', 'resWarn3', 'resWarn4'].map(function (k) { return el('li', null, t(k)); })));
    section.appendChild(el('details', null,
      el('summary', null, t('resChecks', { n: set.checks.length })),
      el('ul', { class: 'test-list' }, set.checks.map(function (c) { return el('li', { class: c.ok ? 'ok' : 'fail' }, (c.ok ? '✓ ' : '✗ ') + c.what); }))));

    // Backup
    if (set.mnemonic) {
      var words = WG.bip39.words(set.mnemonic);
      section.appendChild(el('div', { class: 'backup' },
        el('h3', null, t('resMnemonic', { n: words.length, lang: set.language })),
        set.diceOnly ? el('p', { class: 'muted small' }, t('resDiceOnly')) : null,
        wordGrid(words),
        set.hasPassphrase ? el('p', { class: 'warn' }, t('resHasPass')) : null));
    }
    if (set.shares) {
      section.appendChild(el('div', { class: 'backup' },
        el('h3', null, t('resShares', { m: set.slip39.threshold, n: set.slip39.count })),
        el('p', { class: 'muted small' }, t('resSharesHelp')),
        set.shares.map(function (sh, i) {
          return el('div', { class: 'share' }, el('h4', null, t('resShare', { i: i + 1, n: set.shares.length, m: set.slip39.threshold })), wordGrid(sh.split(' ')));
        }),
        set.hasPassphrase ? el('p', { class: 'warn' }, t('resHasPass')) : null));
    }

    // Coins
    section.appendChild(el('div', { class: 'coin-cards' }, set.results.map(function (r) { return coinCard(r, set); })));

    var pdfBtn = el('button', { type: 'button', class: 'primary' }, t('resToPdf'));
    pdfBtn.addEventListener('click', opts.onPdf);
    var clearBtn = el('button', { type: 'button', class: 'danger' }, t('resClear'));
    clearBtn.addEventListener('click', function () { if (window.confirm(t('resClearConfirm'))) opts.onClear(); });
    section.appendChild(el('div', { class: 'input-row' }, pdfBtn, clearBtn));
    return { element: section, destroy: function () {} };
  }

  WG.define('resultUi', { create: create, variantLabel: variantLabel });
})(window.WG);
