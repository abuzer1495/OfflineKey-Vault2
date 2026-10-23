/*
 * tools/browser-test/smoke.js
 *
 * PURPOSE
 *   UI smoke test evaluated INSIDE index.html by run.mjs (Firefox, WebDriver
 *   BiDi). It drives the real interface like a user would:
 *     1. (run.mjs already added 6 dice + 1 coin flip = 16 bits)
 *     2. 94 more dice          -> enough entropy (259 >= 256 bits), "Apply"
 *     3. select all 10 coins, press "Generate wallet"
 *     4. the result step must show 10 coin cards and only passing checks
 *     5. a secret appears in the DOM only after "Show" and leaves on "Hide"
 *     6. "Print" step: dragging the card-width line changes the form field,
 *        typing a left margin moves the line
 *     7. press "Create and download PDF" -> success message
 *     8. "Clear and start over" -> back to step 1 with the meter at 0, and
 *        one pointer move adds exactly 0.5 bit (no duplicate listeners)
 *   On steps 1-4 every "?" help button is clicked: its dialog must show a
 *   real explanation, and TR/EN help texts must cover the same keys.
 *   Returns a JSON string { coinCards, checksOk, revealOk, dragOk, typeOk, pdfMsg, restartOk, helpButtons, helpMissing, error }.
 */
(async () => {
  const $ = (id) => document.getElementById(id);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const until = async (fn, ms) => {
    for (let i = 0; i < ms / 100; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  };
  const out = { helpButtons: 0, helpMissing: [] };
  // Click every visible "?" and check that its dialog holds a real sentence.
  const checkHelp = () => {
    document.querySelectorAll('#app button.help').forEach((b) => {
      b.click();
      const d = document.querySelector('dialog.help-dialog');
      const text = d.querySelector('.help-body').textContent;
      if (!d.open || text.length < 30 || !/ /.test(text)) out.helpMissing.push(text.slice(0, 40));
      d.close();
      out.helpButtons++;
    });
  };
  const tr = Object.keys(WG.helpTexts.tr).sort().join(), en = Object.keys(WG.helpTexts.en).sort().join();
  if (tr !== en) out.helpMissing.push('TR/EN help keys differ');
  try {
    checkHelp();                           // step 1
    $('dice-input').value = '3615244326155142363125642351'.repeat(4).slice(0, 94);
    $('dice-add').click();
    await frame();
    if ($('ent-apply').disabled) throw new Error('apply disabled');
    $('ent-apply').click();
    await frame();
    checkHelp();                           // step 2 (default options)

    for (const id of ['btc', 'ltc', 'doge', 'eth', 'trx', 'xrp', 'sol', 'xlm', 'ada', 'xmr']) {
      const box = $('coin-' + id);
      if (!box.checked) box.click();     // re-renders the panel; fetch by id each time
    }
    await frame();
    if ($('generate').disabled) throw new Error('generate disabled: ' + document.querySelector('.problems').textContent);
    $('generate').click();
    await until(() => document.querySelector('.result .coin-card'), 30000);
    out.coinCards = document.querySelectorAll('.result .coin-card').length;
    out.checksOk = document.querySelectorAll('.result .test-list .fail').length === 0 && document.querySelectorAll('.result .test-list .ok').length > 0;
    checkHelp();                           // step 3

    // Secrets must not be in the DOM until "Show", and must leave it on "Hide".
    const secret = document.querySelector('.result .item.secret');
    const value = () => secret.querySelector('.secret-value').textContent;
    const before = value();
    secret.querySelector('.reveal').click();
    const shown = value();
    secret.querySelector('.reveal').click();
    out.revealOk = /•/.test(before) && !/•/.test(shown) && shown.length > 20 && value() === before;

    $('to-print').click();
    await frame();
    checkHelp();                           // step 4
    // Drag the card-width line 20 px to the right.
    const width0 = $('pdf-cardWidth').value;
    const line = document.querySelectorAll('.handle-x')[1];   // x-handles in order: marginLeft, cardWidth, gap
    const r = line.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    line.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    document.querySelector('svg.page-preview').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 20, clientY: y, pointerId: 1 }));
    document.querySelector('svg.page-preview').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    out.dragOk = Number($('pdf-cardWidth').value) > Number(width0);
    // Type a left margin: the marginLeft line must move to x = 20 mm.
    $('pdf-marginLeft').value = '20';
    $('pdf-marginLeft').dispatchEvent(new Event('input', { bubbles: true }));
    out.typeOk = document.querySelectorAll('.handle-x')[0].querySelector('line').getAttribute('x1') === '20';
    // Restore sizes that fit before building the PDF.
    $('pdf-marginLeft').value = '10'; $('pdf-marginLeft').dispatchEvent(new Event('input', { bubbles: true }));
    $('pdf-cardWidth').value = width0; $('pdf-cardWidth').dispatchEvent(new Event('input', { bubbles: true }));

    $('pdf-build').click();
    out.pdfMsg = await until(() => { const m = document.querySelector('.pdf .field-msg').textContent; return /PDF/.test(m) && !/…/.test(m) ? m : null; }, 30000);

    window.confirm = () => true;          // accept the "start over" question
    $('restart').click();
    await frame();
    const zero = document.querySelector('.meter-text').textContent;
    const pad = document.querySelector('canvas.pad');
    const pr = pad.getBoundingClientRect();
    pad.dispatchEvent(new PointerEvent('pointermove', { clientX: pr.left + 30, clientY: pr.top + 30, pointerType: 'mouse' }));
    await frame();
    out.restartOk = /^0 \//.test(zero) && /^0\.5 \//.test(document.querySelector('.meter-text').textContent);
  } catch (e) {
    out.error = e.message;
  }
  return JSON.stringify(out);
})()
