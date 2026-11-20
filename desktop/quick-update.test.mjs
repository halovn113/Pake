import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveQuickIcon } from './quick-icon.mjs';
import { updateQuickRuntime } from './quick-update.mjs';

const runtime = path.resolve('src-tauri/target/release/pake.exe');
const id = '01234567-89ab-4cde-8fab-0123456789ab';
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-update-test-'));
  const appsRoot = path.join(root, 'apps');
  const app = path.join(appsRoot, id);
  await mkdir(path.join(app, 'pake-runtime'), { recursive: true });
  const config = JSON.stringify({ identifier: `com.webappmaker.app${id.replaceAll('-', '')}`, productName: 'Ứng dụng thử' });
  await writeFile(path.join(app, 'pake-runtime', 'app.json'), config);
  await writeFile(path.join(app, 'pake-runtime', 'pake.json'), '{"keep":true}');
  await writeFile(path.join(app, 'pake-runtime', 'custom.js'), 'keep code');
  await writeFile(path.join(app, 'WebApp.exe'), await readFile(runtime));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
  const icon = await resolveQuickIcon({ selectedIcon: { data: `data:image/svg+xml;base64,${svg.toString('base64')}` }, name: 'Test' });
  await writeFile(path.join(app, 'app.ico'), icon.ico);
  const profile = path.join(root, 'profile'); await mkdir(profile); await writeFile(path.join(profile, 'login'), 'keep login');
  return { root, appsRoot, app, config, profile };
}
async function cleanup(root) {
  const base = path.resolve(os.tmpdir());
  if (!path.resolve(root).startsWith(base + path.sep) || !path.basename(root).startsWith('webappmaker-update-test-')) throw new Error('Unsafe cleanup path');
  await rm(root, { recursive: true, force: true });
}

test('updates only the executable and keeps identity, settings, icon and login data', async () => {
  const f = await fixture();
  try {
    const beforeIcon = await readFile(path.join(f.app, 'app.ico'));
    const result = await updateQuickRuntime({ appsRoot: f.appsRoot, runtime, id });
    assert.equal(result.name, 'Ứng dụng thử');
    assert.equal(await readFile(path.join(f.app, 'pake-runtime', 'app.json'), 'utf8'), f.config);
    assert.equal(await readFile(path.join(f.app, 'pake-runtime', 'pake.json'), 'utf8'), '{"keep":true}');
    assert.equal(await readFile(path.join(f.app, 'pake-runtime', 'custom.js'), 'utf8'), 'keep code');
    assert.deepEqual(await readFile(path.join(f.app, 'app.ico')), beforeIcon);
    assert.equal(await readFile(path.join(f.profile, 'login'), 'utf8'), 'keep login');
    assert.deepEqual((await readdir(f.app)).sort(), ['WebApp.exe', 'app.ico', 'pake-runtime']);
  } finally { await cleanup(f.root); }
});

test('refuses mismatched identity and leaves the executable unchanged', async () => {
  const f = await fixture();
  try {
    const before = await readFile(path.join(f.app, 'WebApp.exe'));
    await writeFile(path.join(f.app, 'pake-runtime', 'app.json'), JSON.stringify({ identifier: 'com.other.app', productName: 'Wrong' }));
    await assert.rejects(updateQuickRuntime({ appsRoot: f.appsRoot, runtime, id }), /không khớp/);
    assert.deepEqual(await readFile(path.join(f.app, 'WebApp.exe')), before);
    await assert.rejects(updateQuickRuntime({ appsRoot: f.appsRoot, runtime, id: '../bad' }), /không hợp lệ/);
  } finally { await cleanup(f.root); }
});
