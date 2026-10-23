/*
 * tools/browser-test/samples.js
 *
 * PURPOSE
 *   Evaluated inside index.html by run.mjs when WG_SAMPLE_DIR is set: builds
 *   sample PDFs covering every card type and layout path, for visual review.
 *   Uses throw-away entropy pools; nothing here is a real wallet.
 *   Returns JSON { name: base64Pdf, ... }.
 */
(async () => {
  const pool = () => { const p = WG.entropy.createPool(); for (let i = 0; i < 260; i++) p.addCoin(i % 2 === 0); return p; };
  const all = WG.coins.list().map((c) => c.id);
  const L = (o) => Object.assign(WG.pdf.defaults(), o);
  const b64 = (doc) => doc.output('datauristring').split(',')[1];
  const out = {};

  const bip39 = await WG.generator.generate({ mode: 'bip39', coins: all, words: 24, passphrase: 'x', pool: pool(), minCreditedBits: 256 });
  out['1-bip39-a4'] = b64(WG.pdf.build(bip39, L({})));

  const slip = await WG.generator.generate({ mode: 'slip39', coins: ['btc', 'eth', 'xmr'], slip39: { threshold: 2, count: 3, bytes: 32 }, pool: pool(), minCreditedBits: 256 });
  out['2-slip39-separate-landscape'] = b64(WG.pdf.build(slip, L({ separate: true, orientation: 'l', coinSecrets: true, textShadow: true, textBg: '#ffe9c7' })));

  const single = await WG.generator.generate({ mode: 'single', coins: ['btc', 'eth', 'sol', 'xlm'], bip38: { enabled: true, password: 'test' }, pool: pool(), minCreditedBits: 256 });
  out['3-single-fit'] = b64(WG.pdf.build(single, L({ pageSize: 'fit', manual: false })));

  const jp = await WG.generator.generate({ mode: 'bip39', coins: ['btc'], words: 12, language: 'japanese', pool: pool(), minCreditedBits: 256 });
  out['4-japanese-a5'] = b64(WG.pdf.build(jp, L({ pageSize: 'a5', cardWidth: 90, cardHeight: 55, gap: 6, marginLeft: 5 })));
  return JSON.stringify(out);
})()
