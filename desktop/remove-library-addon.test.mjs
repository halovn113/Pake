import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { removeLibraryAddon } from './remove-library-addon.mjs';
test('removes only the selected addon and rejects invalid identifiers', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'webappmaker-remove-addon-')));
  const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    await mkdir(path.join(root, first)); await mkdir(path.join(root, second));
    await writeFile(path.join(root, first, 'manifest.json'), '{}'); await writeFile(path.join(root, second, 'keep.txt'), 'keep');
    await assert.rejects(removeLibraryAddon(root, '../bad'), /không hợp lệ/);
    await removeLibraryAddon(root, first);
    await assert.rejects(readFile(path.join(root, first, 'manifest.json')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(root, second, 'keep.txt'), 'utf8'), 'keep');
  } finally { if (!path.resolve(root).toLowerCase().startsWith((await realpath(os.tmpdir())).toLowerCase() + path.sep) || !path.basename(root).startsWith('webappmaker-remove-addon-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});
