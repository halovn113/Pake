import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executableName } from './quick-executable.mjs';
test('produces safe and readable Windows executable names', () => {
  assert.equal(executableName('YouTube'), 'YouTube.exe');
  assert.equal(executableName('Ứng dụng: thử'), 'Ung dung_ thu.exe');
  assert.equal(executableName('CON'), 'WebApp.exe');
  assert.equal(executableName('..'), 'WebApp.exe');
  assert.ok(executableName('A'.repeat(100)).length <= 64);
});
