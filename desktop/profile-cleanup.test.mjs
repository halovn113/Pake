import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat, rm, realpath, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listProfiles, removeRetainedProfile } from './profile-cleanup.mjs';

test('lists profiles separately and only removes an explicitly selected unused known profile', async () => {
  const tempRoot = await realpath(os.tmpdir()); const root = await mkdtemp(path.join(tempRoot, 'webappmaker-profiles-'));
  const kept = '11111111-1111-4111-8111-111111111111'; const running = '22222222-2222-4222-8222-222222222222';
  const profile = (id) => path.join(root, `com.webappmaker.app${id.replaceAll('-', '')}`);
  const entries = [kept, running].map((id) => ({ id, kind: 'installed-quick', name: 'QA', url: 'https://example.com/' }));
  const checkState = async (entry) => entry.id === kept ? 'removed' : 'installed';
  try {
    await mkdir(profile(kept)); await writeFile(path.join(profile(kept), 'qa.txt'), 'hello'); await mkdir(profile(running)); await mkdir(path.join(root, 'com.webappmaker.app33333333333343338333333333333333'));
    const found = await listProfiles({ profileRoot: root, entries, checkState });
    assert.equal(found.find((entry) => entry.id === kept).size, 5);
    assert.equal(found.find((entry) => entry.id === running).state, 'installed');
    assert.equal(found.find((entry) => !entry.id).state, 'unknown');
    await assert.rejects(removeRetainedProfile({ profileRoot: root, entries, id: running, checkState }), /không thể xác nhận/i);
    await assert.rejects(removeRetainedProfile({ profileRoot: root, entries, id: '../bad', checkState }), /không hợp lệ/);
    let calls = 0; await assert.rejects(removeRetainedProfile({ profileRoot: root, entries, id: kept, checkState: async () => ++calls === 1 ? 'removed' : 'installed' }), /thay đổi/);
    await stat(profile(kept));
    await removeRetainedProfile({ profileRoot: root, entries, id: kept, checkState });
    await assert.rejects(stat(profile(kept)), { code: 'ENOENT' }); await stat(profile(running));
  } finally { if (!path.resolve(root).startsWith(path.resolve(tempRoot) + path.sep) || !path.basename(root).startsWith('webappmaker-profiles-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});

test('refuses a profile containing a directory link', async () => {
  const tempRoot = await realpath(os.tmpdir()); const root = await mkdtemp(path.join(tempRoot, 'webappmaker-profile-links-'));
  const id = '44444444-4444-4444-8444-444444444444'; const profileRoot = path.join(root, 'profiles'); const target = path.join(root, 'outside');
  try {
    await mkdir(profileRoot); await mkdir(target); await writeFile(path.join(target, 'keep.txt'), 'keep');
    const profile = path.join(profileRoot, `com.webappmaker.app${id.replaceAll('-', '')}`); await mkdir(profile); await symlink(target, path.join(profile, 'link'), 'junction');
    const entries = [{ id, kind: 'installed-quick', name: 'QA' }];
    await assert.rejects(removeRetainedProfile({ profileRoot, entries, id, checkState: async () => 'removed' }), /liên kết|toàn bộ/);
    await stat(path.join(target, 'keep.txt')); await stat(profile);
  } finally { if (!path.resolve(root).startsWith(path.resolve(tempRoot) + path.sep) || !path.basename(root).startsWith('webappmaker-profile-links-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
});
