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
 *   On phone-size viewports (< 600 px) each step must fit without horizontal scrolling.
 *   Returns a JSON string { coinCards, checksOk, revealOk, dragOk, typeOk, pdfMsg, restartOk, helpButtons, helpMissing, overflow, error }.
 */
(async () => {
  const $ = (id) => document.getElementById(id);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const until = async (fn, ms) => {
    for (let i = 0; i < ms / 100; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  };
  const out = { helpButtons: 0, helpMissing: [], overflow: [] };
  // On phone-size viewports the page must never scroll sideways; report what sticks out.
  const checkWidth = (step) => {
    if (window.innerWidth >= 600) return;
    const max = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= max + 1) return;
    const wide = [...document.querySelectorAll('#app *')].filter((e) => e.getBoundingClientRect().right > max + 1)
      .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
    out.overflow.push(step + ': ' + document.documentElement.scrollWidth + 'px ' + wide.join(','));
  };
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
    // Ultra-security guide: a link to guide/<lang>.html (multi-file edition), or
    // a button opening the embedded guide in-page (single-file edition).
    const g = $('guide-link');
    if (g.tagName === 'A') {
      out.guideOk = /^guide\/(tr|en)\.html$/.test(g.getAttribute('href')) && g.target === '_blank';
    } else {
      g.click();
      const layer = $('guide-overlay');
      const opened = !!layer && layer.textContent.length > 3000 && !!layer.querySelector('[id]');
      layer.querySelector('.guide-overlay-bar button').click();
      out.guideOk = opened && !$('guide-overlay');
    }
    checkHelp();                           // step 1
    checkWidth('step1');
    $('dice-input').value = '3615244326155142363125642351'.repeat(4).slice(0, 94);
    $('dice-add').click();
    await frame();
    if ($('ent-apply').disabled) throw new Error('apply disabled');
    $('ent-apply').click();
    await frame();
    checkHelp();                           // step 2 (default options)
    checkWidth('step2');

    // Selecting a coin re-renders the settings panel; the page must not jump
    // (Android bug in v0.5.0: it scrolled up to the panel top) and the tapped
    // box must keep the focus.
    out.scrollJumps = [];
    for (const id of ['btc', 'ltc', 'doge', 'eth', 'trx', 'xrp', 'sol', 'xlm', 'ada', 'xmr']) {
      const box = $('coin-' + id);    // re-rendered each time; fetch by id
      if (box.checked) continue;
      box.scrollIntoView({ block: 'center' });
      const before = window.scrollY;
      box.focus({ preventScroll: true });   // a real tap focuses the box; a scripted click() does not
      box.click();
      await frame();
      if (Math.abs(window.scrollY - before) > 3) out.scrollJumps.push(id + ': ' + before + '->' + window.scrollY);
      if (document.activeElement !== $('coin-' + id)) out.scrollJumps.push(id + ': focus lost');
    }
    await frame();
    if ($('generate').disabled) throw new Error('generate disabled: ' + document.querySelector('.problems').textContent);
    $('generate').click();
    await until(() => document.querySelector('.result .coin-card'), 30000);
    out.coinCards = document.querySelectorAll('.result .coin-card').length;
    out.checksOk = document.querySelectorAll('.result .test-list .fail').length === 0 && document.querySelectorAll('.result .test-list .ok').length > 0;
    checkHelp();                           // step 3
    checkWidth('step3');

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
    checkWidth('step4');
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
