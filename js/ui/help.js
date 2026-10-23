/*
 * js/ui/help.js   ->   WG.help
 *
 * PURPOSE
 *   The small "?" buttons next to every option and button. Pressing one
 *   opens a dialog with a short, plain-language explanation (with an example
 *   and an analogy) written for people who know nothing about crypto.
 *   Texts live in js/ui/help-texts.js, per language.
 *
 * USAGE
 *   WG.help.button('passphrase')   -> <button class="help">?</button>
 *
 * NOTES
 *   - One shared <dialog> element; text is set with textContent.
 *   - The click is stopped so a "?" inside a <label> or <summary> does not
 *     also toggle the checkbox / details it sits in.
 */
(function (WG) {
  'use strict';

  var el = WG.dom.el;
  var t = WG.i18n.t;
  var dialog = null;

  /** Help text for a key in the current language (English as fallback). */
  function text(key) {
    var texts = WG.helpTexts[WG.i18n.lang()] || WG.helpTexts.en;
    return texts[key] || WG.helpTexts.en[key] || key;
  }

  /** Open the shared dialog with the text of `key`. */
  function show(key) {
    if (!dialog) {
      dialog = el('dialog', { class: 'help-dialog' });
      // Clicking the dark backdrop (outside the box) closes the dialog.
      dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
      document.body.appendChild(dialog);
    }
    var close = el('button', { type: 'button', class: 'primary' }, t('helpClose'));
    close.addEventListener('click', function () { dialog.close(); });
    WG.dom.append(WG.dom.clear(dialog), [
      el('div', { class: 'help-body' }, text(key).split('\n').map(function (p) { return el('p', null, p); })),
      el('div', { class: 'help-actions' }, close),
    ]);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else window.alert(text(key));        // very old browsers without <dialog>
    close.focus();
  }

  /** A small "?" button that explains `key`. */
  function button(key) {
    var b = el('button', { type: 'button', class: 'help', 'aria-label': t('helpLabel'), title: t('helpLabel') }, '?');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      show(key);
    });
    return b;
  }

  WG.define('help', { button: button, show: show, text: text });
})(window.WG);
