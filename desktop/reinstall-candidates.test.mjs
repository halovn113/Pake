import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findReinstallCandidates } from './reinstall-candidates.mjs';

test('finds installed apps and retained profiles for the exact website origin', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'webappmaker-candidates-'));
  const appsRoot = path.join(root, 'apps'); const profileRoot = path.join(root, 'profiles');
  const installed = '11111111-1111-4111-8111-111111111111'; const retained = '22222222-2222-4222-8222-222222222222'; const removed = '33333333-3333-4333-8333-333333333333';
  try {
    await mkdir(appsRoot); await mkdir(profileRoot); await mkdir(path.join(appsRoot, installed)); await mkdir(path.join(profileRoot, `com.webappmaker.app${retained.replaceAll('-', '')}`));
    const entries = [installed, retained, removed].map((id) => ({ id, name: id, url: 'https://www.youtube.com/watch?v=1', kind: 'installed-quick', createdAt: '2026-11-24T03:00:00.000Z' }));
    entries.push({ ...entries[0], id: '44444444-4444-4444-8444-444444444444', url: 'https://evil.youtube.com/' });
    const result = await findReinstallCandidates({ entries, url: 'https://www.youtube.com/', appsRoot, profileRoot });
    assert.deepEqual(result.map(({ id, state }) => [id, state]), [[installed, 'installed'], [retained, 'retained']]);
    assert.equal(result[1].createdAt, '2026-11-24T03:00:00.000Z');
    entries[1].createdAt = 'invalid';
    assert.equal((await findReinstallCandidates({ entries, url: 'https://www.youtube.com/', appsRoot, profileRoot }))[1].createdAt, null);
    assert.deepEqual(await findReinstallCandidates({ entries, url: 'https://youtube.com/', appsRoot, profileRoot }), []);
    await assert.rejects(findReinstallCandidates({ entries, url: 'file:///x', appsRoot, profileRoot }), /không hợp lệ/);
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(root).startsWith('webappmaker-candidates-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});
