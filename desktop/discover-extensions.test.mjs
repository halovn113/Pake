import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverExtensions, readDiscoveredExtension } from './discover-extensions.mjs';
import { writeUnpackedExtension } from './unpacked-extension.mjs';
test('discovers selected browser extension manifests and copies only extension files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-discover-'));
  try {
    const id = 'a'.repeat(32); const base = path.join(root, 'Google', 'Chrome', 'User Data', 'Default'); const folder = path.join(base, 'Extensions', id, '1.0_0');
    await mkdir(folder, { recursive: true }); await writeFile(path.join(base, 'Cookies'), 'do-not-copy');
    await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({manifest_version: 3, name: 'QA addon', version: '1.0'})); await writeFile(path.join(folder, 'script.js'), 'console.log("QA")');
    const found = await discoverExtensions(root); assert.equal(found.length, 1); assert.equal(found[0].name, 'QA addon');
    const extension = await readDiscoveredExtension(found[0].folder); assert.deepEqual(extension.files.map((file) => file.path).sort(), ['manifest.json','script.js']);
    await writeUnpackedExtension(path.join(root, 'destination'), extension, 'addon-test');
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('webappmaker-discover-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});
