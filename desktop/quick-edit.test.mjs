import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveQuickIcon } from './quick-icon.mjs';
import { editQuickSettings, readQuickSettings, editQuickUrl, editQuickIcon } from './quick-edit.mjs';

test('edits window settings while preserving identity and unrelated configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-edit-'));
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const dir = path.join(root, id, 'pake-runtime');
  try {
    await mkdir(dir, { recursive: true });
    const identity = { identifier: `com.webappmaker.app${id.replaceAll('-', '')}`, productName: 'QA' };
    const original = { windows: [{ url: 'https://example.com/', width: 800, height: 600, zoom: 100, always_on_top: false, fullscreen: false, maximize: false, extra: 1 }], proxy_url: 'proxy', unknown: { keep: true } };
    await writeFile(path.join(dir, 'app.json'), JSON.stringify(identity));
    await writeFile(path.join(dir, 'pake.json'), JSON.stringify(original));
    await editQuickSettings({ appsRoot: root, id, settings: { width: 900, always_on_top: true } });
    assert.equal((await readQuickSettings({ appsRoot: root, id })).width, 900);
    const changed = JSON.parse(await readFile(path.join(dir, 'pake.json')));
    assert.deepEqual(changed, { ...original, windows: [{ ...original.windows[0], width: 900, always_on_top: true }] });
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'app.json'))), identity);
    await assert.rejects(editQuickSettings({ appsRoot: root, id, settings: { width: 0 } }));
    await assert.rejects(editQuickSettings({ appsRoot: root, id: '../outside', settings: {} }));
    await assert.rejects(editQuickSettings({ appsRoot: root, id, settings: { url: 'https://bad.example' } }));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('changes the startup URL and preserves the profile, identity and custom code', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-edit-url-'));
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const appsRoot = path.join(root, 'apps'); const dir = path.join(appsRoot, id, 'pake-runtime'); const profileRoot = path.join(root, 'profiles'); const profile = path.join(profileRoot, `com.webappmaker.app${id.replaceAll('-', '')}`);
  try {
    await mkdir(dir, { recursive: true }); await mkdir(profile, { recursive: true });
    await writeFile(path.join(dir, 'app.json'), JSON.stringify({ identifier: `com.webappmaker.app${id.replaceAll('-', '')}` }));
    await writeFile(path.join(dir, 'pake.json'), JSON.stringify({ windows: [{ url: 'https://old.example/', url_type: 'web' }], keep: true }));
    await writeFile(path.join(dir, 'custom.js'), 'keep'); await writeFile(path.join(profile, 'last-url.txt'), 'https://old.example/video'); await writeFile(path.join(profile, 'cookies'), 'keep login');
    await editQuickUrl({ appsRoot, profileRoot, id, url: 'https://new.example/path' });
    assert.equal((await readQuickSettings({ appsRoot, id })).url, 'https://new.example/path');
    await assert.rejects(readFile(path.join(profile, 'last-url.txt')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(profile, 'cookies'), 'utf8'), 'keep login'); assert.equal(await readFile(path.join(dir, 'custom.js'), 'utf8'), 'keep');
    await assert.rejects(editQuickUrl({ appsRoot, profileRoot, id, url: 'file:///etc/passwd' }));
    assert.equal((await readQuickSettings({ appsRoot, id })).url, 'https://new.example/path');
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('webappmaker-edit-url-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});


test('replaces both icon files and executable while keeping application data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-edit-icon-')); const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const app = path.join(root, id); const dir = path.join(app, 'pake-runtime');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'app.json'), JSON.stringify({ identifier: `com.webappmaker.app${id.replaceAll('-', '')}`, productName: 'QA' }));
    await writeFile(path.join(dir, 'pake.json'), JSON.stringify({ windows: [{ url: 'https://example.com/' }] }));
    await writeFile(path.join(dir, 'custom.js'), 'keep'); await writeFile(path.join(app, 'WebApp.exe'), await readFile(path.resolve('src-tauri/target/release/pake.exe')));
    await writeFile(path.join(app, 'app.ico'), 'old'); await writeFile(path.join(dir, 'icon.ico'), 'old');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
    const { ico } = await resolveQuickIcon({ selectedIcon: { data: `data:image/svg+xml;base64,${svg.toString('base64')}` }, name: 'QA' });
    await editQuickIcon({ appsRoot: root, id, ico });
    assert.deepEqual(await readFile(path.join(app, 'app.ico')), ico); assert.deepEqual(await readFile(path.join(dir, 'icon.ico')), ico); assert.equal(await readFile(path.join(dir, 'custom.js'), 'utf8'), 'keep');
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('webappmaker-edit-icon-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});


test('leaves the executable and icon unchanged when a required icon file is missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-edit-failure-')); const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const app = path.join(root, id); const dir = path.join(app, 'pake-runtime');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'app.json'), JSON.stringify({ identifier: `com.webappmaker.app${id.replaceAll('-', '')}`, productName: 'QA' }));
    await writeFile(path.join(dir, 'pake.json'), JSON.stringify({ windows: [{ url: 'https://example.com/' }] }));
    const exe = await readFile(path.resolve('src-tauri/target/release/pake.exe')); await writeFile(path.join(app, 'WebApp.exe'), exe); await writeFile(path.join(app, 'app.ico'), 'old icon');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
    const { ico } = await resolveQuickIcon({ selectedIcon: { data: `data:image/svg+xml;base64,${svg.toString('base64')}` }, name: 'QA' });
    await assert.rejects(editQuickIcon({ appsRoot: root, id, ico }), { code: 'ENOENT' });
    assert.deepEqual(await readFile(path.join(app, 'WebApp.exe')), exe); assert.equal(await readFile(path.join(app, 'app.ico'), 'utf8'), 'old icon');
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('webappmaker-edit-failure-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});
