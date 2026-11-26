import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { listQuickAddons, setQuickAddons } from './quick-addons.mjs';

test('per-app addon selection preserves files and supports toggling back', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wam-addons-test-')));
  const id = '11111111-1111-4111-8111-111111111111';
  const a = 'addon-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'addon-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const runtime = path.join(root, id, 'pake-runtime');
  try {
    for (const slot of [a,b]) { const dir = path.join(runtime, 'extensions', slot); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ name: slot, version: '1' })); }
    await writeFile(path.join(runtime, 'app.json'), JSON.stringify({ identifier: `com.webappmaker.app${id.replaceAll('-', '')}` }));
    await writeFile(path.join(runtime, 'pake.json'), JSON.stringify({ windows: [{ url: 'https://example.com' }], browser_extensions: true }));
    await writeFile(path.join(runtime, 'custom.js'), 'preserved');
    assert.equal((await listQuickAddons({ appsRoot: root, id })).length, 2);
    await setQuickAddons({ appsRoot: root, id, enabled: [b] });
    assert.deepEqual((await listQuickAddons({ appsRoot: root, id })).map(x => [x.id,x.enabled]).sort(), [[a,false],[b,true]]);
    assert.equal(JSON.parse(await readFile(path.join(runtime, 'pake.json'))).browser_extensions, true);
    await setQuickAddons({ appsRoot: root, id, enabled: [] });
    assert.equal(JSON.parse(await readFile(path.join(runtime, 'pake.json'))).browser_extensions, false);
    await setQuickAddons({ appsRoot: root, id, enabled: [a,b] });
    assert.equal(JSON.parse(await readFile(path.join(runtime, 'pake.json'))).browser_extensions, true);
    assert.equal(await readFile(path.join(runtime, 'custom.js'), 'utf8'), 'preserved');
    for (const enabled of [['../bad'], [a,a], ['addon-cccccccc-cccc-4ccc-8ccc-cccccccccccc']]) await assert.rejects(setQuickAddons({ appsRoot: root, id, enabled }));
    assert.equal((await listQuickAddons({ appsRoot: root, id })).filter(x => x.enabled).length, 2);
  } finally { if (!path.basename(root).startsWith('wam-addons-test-') || path.dirname(root).toLowerCase() !== (await realpath(os.tmpdir())).toLowerCase()) throw new Error('Unexpected test directory'); await rm(root, { recursive: true, force: true }); }
});
