import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setWindowsAppName } from './windows-metadata.mjs';
import { resolveQuickIcon } from './quick-icon.mjs';

const require = createRequire(import.meta.url);
async function editor() {
  try { return await require('resedit/cjs').load(); }
  catch { return await createRequire(new URL('./deps.local/package.json', import.meta.url))('resedit/cjs').load(); }
}
async function values(binary) {
  const library = await editor();
  const resources = library.NtExecutableResource.from(library.NtExecutable.from(binary));
  return library.Resource.VersionInfo.fromEntries(resources.entries).flatMap((version) => version.getAvailableLanguages().map((language) => version.getStringValues(language)));
}

test('round trips executable metadata, preserves version and leaves original untouched', async () => {
  const original = await readFile(new URL('../src-tauri/target/release/pake.exe', import.meta.url));
  const before = await values(original);
  assert.ok(before.length);
  for (const name of ['YouTube', 'Ứng dụng thử']) {
    const changed = await setWindowsAppName(original, name);
    const after = await values(changed);
    assert.equal(after.length, before.length);
    for (let i = 0; i < after.length; i++) {
      assert.equal(after[i].FileDescription, name);
      assert.equal(after[i].ProductName, name);
      assert.equal(after[i].FileVersion, before[i].FileVersion);
    }
  }
  assert.deepEqual(await values(original), before);
});

test('rejects malformed binaries and invalid names', async () => {
  await assert.rejects(setWindowsAppName(Buffer.from('not a PE'), 'Test'));
  await assert.rejects(setWindowsAppName(Buffer.alloc(0), 'Test\0bad'));
});

test('round trips the selected icon through executable resources', async () => {
  const original = await readFile(new URL('../src-tauri/target/release/pake.exe', import.meta.url));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
  const icon = await resolveQuickIcon({ selectedIcon: { data: `data:image/svg+xml;base64,${svg.toString('base64')}` }, name: 'Test' });
  const changed = await setWindowsAppName(original, 'YouTube', icon.ico);
  const library = await editor();
  const resources = library.NtExecutableResource.from(library.NtExecutable.from(changed));
  const groups = library.Resource.IconGroupEntry.fromEntries(resources.entries);
  assert.ok(groups.length);
  const expected = library.Data.IconFile.from(icon.ico).icons.map((item) => Buffer.from(item.data.bin));
  for (const group of groups) {
    const actual = group.getIconItemsFromEntries(resources.entries).map((item) => Buffer.from(item.bin));
    assert.deepEqual(actual, expected);
  }
  assert.equal((await values(changed))[0].FileDescription, 'YouTube');
});
