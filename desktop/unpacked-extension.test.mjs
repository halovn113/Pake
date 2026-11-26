import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeUnpackedExtension, extensionIcon, inspectUnpackedExtension } from './unpacked-extension.mjs';
const encode = (data) => Buffer.from(data).toString('base64');
test('copies a selected unpacked extension and rejects unsafe paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-extension-'));
  try {
    const extension = { files: [{ path: 'manifest.json', data: encode('{"manifest_version":3,"name":"QA","version":"1.0"}') }, { path: 'scripts/main.js', data: encode('ok') }] };
    assert.equal((await writeUnpackedExtension(root, extension)).name, 'QA');
    assert.equal(await readFile(path.join(root, 'extensions', 'selected', 'scripts', 'main.js'), 'utf8'), 'ok');
    await assert.rejects(writeUnpackedExtension(root, { files: [{ path: '../outside', data: encode('bad') }] }), /không an toàn/);
    await assert.rejects(writeUnpackedExtension(root, { files: [{ path: 'x', data: encode('bad') }] }), /manifest/);
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('webappmaker-extension-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});


test('returns a supported icon and ignores unsupported image formats', () => {
  const extension = { files: [{ path: 'icon.png', data: encode('icon') }, { path: 'icon.svg', data: encode('<svg/>') }] };
  assert.equal(extensionIcon(extension, { icons: { 32: 'icon.png' } }), `data:image/png;base64,${encode('icon')}`);
  assert.equal(extensionIcon(extension, { icons: { 32: 'icon.svg' } }), undefined);
});


test('accepts a large valid base64 file without overflowing the stack', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'webappmaker-large-addon-')));
  try {
    const extension = { files: [{ path: 'manifest.json', data: encode('{"manifest_version":3,"name":"Large QA","version":"1"}') }, { path: 'large.js', data: Buffer.alloc(4_400_000, 65).toString('base64') }] };
    await writeUnpackedExtension(root, extension);
    assert.equal((await readFile(path.join(root, 'extensions', 'selected', 'large.js'))).length, 4_400_000);
    await assert.rejects(writeUnpackedExtension(root, { files: [{ path: 'x', data: 'AB$=' }] }), /không hợp lệ/);
  } finally { if (!root.toLowerCase().startsWith((await realpath(os.tmpdir())).toLowerCase() + path.sep) || !path.basename(root).startsWith('webappmaker-large-addon-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});

test('inspects private addon manifest without installing and rejects unsafe entries', () => {
  const manifest = { manifest_version: 3, name: 'QA', permissions: ['nativeMessaging'] };
  const result = inspectUnpackedExtension({ files: [{ path: 'manifest.json', data: encode(JSON.stringify(manifest)) }] });
  assert.deepEqual(result.manifest, manifest);
  assert.throws(() => inspectUnpackedExtension({ files: [{ path: '../manifest.json', data: encode(JSON.stringify(manifest)) }] }), /không an toàn/);
});
