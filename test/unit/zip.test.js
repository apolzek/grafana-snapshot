import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { crc32, zip } from '../../src/data/zip.js';
import { unzip } from './helpers/unzip.js';

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('crc32', () => {
  it('matches the standard check value', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    assert.equal(crc32(new Uint8Array()), 0);
  });
});

describe('zip', () => {
  const files = {
    'hello.txt': 'hello world',
    'dir/unicode-ção.xml': '<a>çãõ ✓</a>',
    'bin.dat': new Uint8Array([0, 1, 2, 255, 254]),
    'big.txt': 'x'.repeat(100_000),
  };

  it('round-trips names and contents', async () => {
    const blob = await zip(files);
    const entries = await unzip(await blob.arrayBuffer());
    assert.deepEqual([...entries.keys()], Object.keys(files));
    const decoder = new TextDecoder();
    assert.equal(decoder.decode(entries.get('hello.txt').data), 'hello world');
    assert.equal(decoder.decode(entries.get('dir/unicode-ção.xml').data), '<a>çãõ ✓</a>');
    assert.deepEqual([...entries.get('bin.dat').data], [0, 1, 2, 255, 254]);
    for (const { data, crc } of entries.values()) assert.equal(crc32(data), crc);
  });

  it('compresses', async () => {
    const blob = await zip({ 'big.txt': files['big.txt'] });
    assert.ok(blob.size < 2_000, `expected compression, got ${blob.size} bytes`);
  });

  it('is accepted by an independent implementation (Python zipfile)', { skip: !hasPython }, async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gx-zip-')), 'test.zip');
    fs.writeFileSync(file, Buffer.from(await (await zip(files)).arrayBuffer()));
    const out = execFileSync('python3', [
      '-c',
      'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(",".join(z.namelist()))',
      file,
    ], { env: { ...process.env, PYTHONUTF8: '1' } }).toString().trim(); // Windows defaults stdout to cp1252
    assert.equal(out, Object.keys(files).join(','));
  });
});
