/*
 * tools/vendor-build/build.mjs
 *
 * PURPOSE
 *   Maintainer-only script that (re)creates everything under /vendor from the
 *   exact npm versions pinned in package.json + package-lock.json.
 *   End users never run this; the release zip already contains /vendor.
 *
 * USAGE (from tools/vendor-build/)
 *   npm ci --ignore-scripts   # install exactly what package-lock.json records
 *   npm run build             # writes ../../vendor/*
 *
 * OUTPUT
 *   vendor/wg-crypto.js   noble/scure libraries bundled into one classic script
 *                         exposing window.WGVendor (see entry.js)
 *   vendor/jspdf.umd.js   copied byte-for-byte from the jspdf npm package
 *   vendor/qrcode.js      copied byte-for-byte from the qrcode-generator package
 *   vendor/dejavu-fonts.js  DejaVu Sans Mono (regular + bold) TTF files as base64,
 *                         exposed as window.WGFonts for jsPDF (Unicode text in PDFs)
 *   vendor/DejaVu-LICENSE.txt  the font license, copied verbatim
 *   vendor/SHA256SUMS     sha256 of every vendor file (sha256sum -c compatible)
 *   vendor/VENDOR.md      human-readable provenance table
 *
 * REPRODUCIBILITY
 *   esbuild output is deterministic for identical inputs, and copied files are
 *   untouched, so running this twice must give identical SHA256SUMS. Copied
 *   files can also be compared directly against the npm tarballs.
 */

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendorDir = resolve(here, '..', '..', 'vendor');
const lock = JSON.parse(readFileSync(join(here, 'package-lock.json'), 'utf8'));

/** Read name/version/license of an installed package from node_modules. */
function pkgInfo(name) {
  const pkg = JSON.parse(readFileSync(join(here, 'node_modules', name, 'package.json'), 'utf8'));
  const locked = lock.packages['node_modules/' + name] || {};
  return { name, version: pkg.version, license: pkg.license, integrity: locked.integrity || '' };
}

/** Hex SHA-256 of a file's raw bytes. */
function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Packages bundled into wg-crypto.js (transitive deps are all within this set).
const bundled = ['@noble/curves', '@noble/hashes', '@noble/ciphers', '@scure/base', '@scure/bip32', '@scure/bip39'].map(pkgInfo);
const jspdf = pkgInfo('jspdf');
const qrcode = pkgInfo('qrcode-generator');
const dejavu = pkgInfo('dejavu-fonts-ttf');
const esbuildInfo = pkgInfo('esbuild');

const versions = Object.fromEntries(bundled.map((p) => [p.name, p.version]));

mkdirSync(vendorDir, { recursive: true });

// ---- 1. Bundle noble/scure into a single IIFE ------------------------------
const banner = [
  '/*',
  ' * vendor/wg-crypto.js  --  GENERATED FILE, DO NOT EDIT BY HAND.',
  ' * Rebuild with tools/vendor-build (npm ci --ignore-scripts && npm run build).',
  ' * Bundled with esbuild ' + esbuildInfo.version + ' from:',
  ...bundled.map((p) => ' *   ' + p.name + '@' + p.version + ' (' + p.license + ')'),
  ' * Exposes one read-only global: window.WGVendor (see tools/vendor-build/entry.js).',
  ' */',
].join('\n');

await build({
  entryPoints: [join(here, 'entry.js')],
  absWorkingDir: here,
  outfile: join(vendorDir, 'wg-crypto.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',          // BigInt is required by noble; ES2020 is the floor
  minify: false,             // keep readable for audits
  legalComments: 'inline',   // keep upstream license headers
  charset: 'utf8',
  sourcemap: false,
  banner: { js: banner },
  define: { __VENDOR_VERSIONS__: JSON.stringify(versions) },
  logLevel: 'info',
});

// ---- 2. Copy pre-built browser libraries verbatim --------------------------
copyFileSync(join(here, 'node_modules/jspdf/dist/jspdf.umd.js'), join(vendorDir, 'jspdf.umd.js'));
copyFileSync(join(here, 'node_modules/qrcode-generator/dist/qrcode.js'), join(vendorDir, 'qrcode.js'));

// ---- 3. Fonts for jsPDF ------------------------------------------------------
// jsPDF's built-in fonts only cover WinAnsi; Turkish letters, accented BIP39
// words and box-drawing need an embedded Unicode TTF.
{
  const ttf = (f) => readFileSync(join(here, 'node_modules/dejavu-fonts-ttf/ttf', f)).toString('base64');
  const js = [
    '/*',
    ' * vendor/dejavu-fonts.js  --  GENERATED FILE, DO NOT EDIT BY HAND.',
    ' * DejaVu Sans Mono ' + dejavu.version + ' (regular, bold) from npm dejavu-fonts-ttf, base64-encoded TTF.',
    ' * License: Bitstream Vera / DejaVu public-domain changes, see vendor/DejaVu-LICENSE.txt.',
    ' * Exposes one read-only global: window.WGFonts = { mono: "<base64>", monoBold: "<base64>" }.',
    ' */',
    '(function () {',
    "  'use strict';",
    '  var fonts = Object.freeze({',
    "    mono: '" + ttf('DejaVuSansMono.ttf') + "',",
    "    monoBold: '" + ttf('DejaVuSansMono-Bold.ttf') + "'",
    '  });',
    "  Object.defineProperty(window, 'WGFonts', { value: fonts, writable: false, configurable: false, enumerable: true });",
    '})();',
    '',
  ].join('\n');
  writeFileSync(join(vendorDir, 'dejavu-fonts.js'), js);
  copyFileSync(join(here, 'node_modules/dejavu-fonts-ttf/LICENSE'), join(vendorDir, 'DejaVu-LICENSE.txt'));
}

// ---- 4. Checksums + provenance ---------------------------------------------
const files = ['wg-crypto.js', 'jspdf.umd.js', 'qrcode.js', 'dejavu-fonts.js', 'DejaVu-LICENSE.txt'];
const sums = files.map((f) => ({ file: f, sha256: sha256File(join(vendorDir, f)) }));
writeFileSync(join(vendorDir, 'SHA256SUMS'), sums.map((s) => s.sha256 + '  ' + s.file).join('\n') + '\n');

const md = [
  '# Vendor provenance',
  '',
  'GENERATED by `tools/vendor-build/build.mjs` — do not edit by hand.',
  '',
  '## Files',
  '',
  '| File | SHA-256 | Origin |',
  '|---|---|---|',
  '| `wg-crypto.js` | `' + sums[0].sha256 + '` | esbuild ' + esbuildInfo.version + ' bundle of the packages below |',
  '| `jspdf.umd.js` | `' + sums[1].sha256 + '` | verbatim `jspdf@' + jspdf.version + '/dist/jspdf.umd.js` |',
  '| `qrcode.js` | `' + sums[2].sha256 + '` | verbatim `qrcode-generator@' + qrcode.version + '/dist/qrcode.js` |',
  '| `dejavu-fonts.js` | `' + sums[3].sha256 + '` | base64 of `dejavu-fonts-ttf@' + dejavu.version + '/ttf/DejaVuSansMono{,-Bold}.ttf` |',
  '| `DejaVu-LICENSE.txt` | `' + sums[4].sha256 + '` | verbatim `dejavu-fonts-ttf@' + dejavu.version + '/LICENSE` |',
  '',
  '## Packages',
  '',
  '| Package | Version | License | npm integrity |',
  '|---|---|---|---|',
  ...[...bundled, jspdf, qrcode, dejavu].map((p) => '| ' + p.name + ' | ' + p.version + ' | ' + p.license + ' | `' + p.integrity + '` |'),
  '',
  '## Verify',
  '',
  '```sh',
  'cd vendor && sha256sum -c SHA256SUMS',
  '# rebuild and compare (needs Node.js):',
  'cd tools/vendor-build && npm ci --ignore-scripts && npm run build && git diff --exit-code ../../vendor',
  '```',
  '',
].join('\n');
writeFileSync(join(vendorDir, 'VENDOR.md'), md);

console.log('vendor written:');
for (const s of sums) console.log('  ' + s.sha256 + '  ' + s.file);
