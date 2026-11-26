import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { managerPaths } from './manager-paths.mjs';

test('keeps development data in its existing location and supports a separate absolute data root', () => {
  const base = path.resolve('manager'); const data = path.resolve('user-data');
  assert.equal(managerPaths(base).storage, path.join(base, 'builds.local'));
  assert.equal(managerPaths(base, data).addonRoot, path.join(data, 'addons.local'));
  assert.throws(() => managerPaths(base, 'relative'), /absolute/);
  assert.throws(() => managerPaths(base, ''), /absolute/);
});
