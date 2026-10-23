/*
 * tools/release/make-zip.mjs
 *
 * PURPOSE
 *   Builds the end-user downloads:
 *     dist/OfflineKey-Vault-<version>.zip   every git-tracked file (so node_modules
 *                                           and local junk never ship) in one folder
 *     dist/OfflineKey-Vault-<version>.html  single-file edition for phones
 *                                           (tools/release/single-file.mjs)
 *     dist/SHA256SUMS                       checksums of both
 *
 * WHERE IT RUNS
 *   Normally on GitHub Actions (.github/workflows/release.yml) when a vX.Y.Z
 *   tag is pushed. It refuses to run with uncommitted changes, because it
 *   reads the files from the working tree.
 *
 * REPRODUCIBLE
 *   Files are sorted, every entry gets the timestamp of the last commit and
 *   fixed attributes, so the same commit always yields the same zip hash.
 *   No npm packages: the ZIP format is written by hand (deflate via zlib).
 *
 * USAGE
 *   node tools/release/make-zip.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSingleFile } from './single-file.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (cmd) => execSync('git ' + cmd, { cwd: repo, encoding: 'utf8' });

// Files are read from the working tree, so it must equal the commit exactly:
// uncommitted changes would silently end up in a release.
if (git('status --porcelain').trim()) {
  console.error('working tree has uncommitted changes; commit or stash them first:\n' + git('status --short'));
  process.exit(1);
}

const version = readFileSync(join(repo, 'js/core/namespace.js'), 'utf8').match(/value: '([^']+)'/)[1];
const name = 'OfflineKey-Vault-' + version;
const files = git('ls-files').split('\n').filter(Boolean).sort();

// DOS date/time of the last commit (local fields of the UTC time; 2-second resolution).
const when = new Date(Number(git('log -1 --format=%ct').trim()) * 1000);
const dosTime = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1);
const dosDate = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate();

const local = [];
const central = [];
let offset = 0;

for (const f of files) {
  const data = readFileSync(join(repo, f));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name + '/' + f, 'utf8');
  const crc = crc32(data);

  // Local file header (signature 0x04034b50), flag 0x0800 = UTF-8 names, method 8 = deflate.
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(packed.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
  local.push(lh, nameBuf, packed);

  // Central directory entry (signature 0x02014b50).
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(packed.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, nameBuf);
  offset += lh.length + nameBuf.length + packed.length;
}

const cd = Buffer.concat(central);
const end = Buffer.alloc(22);   // end of central directory record
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, cd, end]);

mkdirSync(join(repo, 'dist'), { recursive: true });
writeFileSync(join(repo, 'dist', name + '.zip'), zip);
const single = buildSingleFile(repo);
writeFileSync(join(repo, 'dist', name + '.html'), single);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const sums = sha(zip) + '  ' + name + '.zip\n' + sha(Buffer.from(single, 'utf8')) + '  ' + name + '.html\n';
writeFileSync(join(repo, 'dist', 'SHA256SUMS'), sums);
console.log(files.length + ' files -> dist/' + name + '.zip (' + zip.length + ' bytes), dist/' + name + '.html (' + Buffer.byteLength(single) + ' bytes)\n' + sums);
