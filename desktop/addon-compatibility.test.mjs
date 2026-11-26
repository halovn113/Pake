import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAddon } from './addon-compatibility.mjs';

test('addon compatibility warnings distinguish evidence from unknown', () => {
  assert.equal(assessAddon({ permissions: ['nativeMessaging'] }, 'Example').status, 'risk');
  assert.equal(assessAddon({ optional_permissions: ['nativeMessaging'] }, 'Example').status, 'risk');
  assert.match(assessAddon({ version: '6.42.64' }, 'IDM Integration Module').reason, /màn hình đen/);
  assert.equal(assessAddon({ version: '6.42.65' }, 'IDM Integration Module').status, 'unknown');
  assert.equal(assessAddon({ permissions: ['storage'] }, 'Example').status, 'unknown');
  assert.equal(assessAddon(null).status, 'unknown');
});
