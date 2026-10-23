/*
 * tools/browser-test/smoke.js
 *
 * PURPOSE
 *   UI smoke test evaluated INSIDE index.html by run.mjs (Firefox, WebDriver
 *   BiDi). It drives the real interface like a user would:
 *     1. 6 dice + 1 coin flip  -> meter must show 16 bits
 *     2. 94 more dice          -> enough entropy (259 >= 256 bits)
 *     3. select all 10 coins, press "Generate wallet"
 *     4. the result panel must show 10 coin cards and only passing checks
 *     5. press "Create and download PDF" -> success message
 *   Returns a JSON string { meter16, coinCards, checksOk, pdfMsg, error }.
 */
(async () => {
  const $ = (id) => document.getElementById(id);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const until = async (fn, ms) => {
    for (let i = 0; i < ms / 100; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  };
  const out = {};
  try {
    $('dice-input').value = '1 2 3, 4 5 6';
    $('dice-add').click();
    $('coin-heads').click();
    await frame();
    out.meter16 = document.querySelector('.meter-text').textContent;

    $('dice-input').value = '3615244326155142363125642351'.repeat(4).slice(0, 94);
    $('dice-add').click();
    await frame();

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

    $('pdf-build').click();
    out.pdfMsg = await until(() => { const m = document.querySelector('.pdf .field-msg').textContent; return /PDF/.test(m) && !/…/.test(m) ? m : null; }, 30000);
  } catch (e) {
    out.error = e.message;
  }
  return JSON.stringify(out);
})()
