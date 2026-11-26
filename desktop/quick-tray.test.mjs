import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuickTray, configureQuickTray } from './quick-tray.mjs';
test('requires a tray icon for hiding on close or startup', () => {
  for (const options of [{ hideOnClose: true }, { startToTray: true }, { hideOnClose: true, startToTray: true }]) assert.throws(() => validateQuickTray(options), /khay hệ thống/);
  for (const options of [{}, { showSystemTray: true }, { showSystemTray: true, hideOnClose: true, startToTray: true }]) assert.doesNotThrow(() => validateQuickTray(options));
});
test('uses the per-app runtime icon when the tray is enabled', () => {
  const pake = { system_tray: { windows: false }, system_tray_path: '' };
  configureQuickTray(pake, { showSystemTray: true }); assert.equal(pake.system_tray.windows, true); assert.equal(pake.system_tray_path, 'icon.ico');
  configureQuickTray(pake, {}); assert.equal(pake.system_tray.windows, false); assert.equal(pake.system_tray_path, '');
});
