import { test } from 'node:test';
import assert from 'node:assert/strict';

test('translates common static and interpolated messages without changing app names', async () => {
  let language = 'en';
  globalThis.localStorage = { getItem: () => language };
  globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.document = {
    documentElement: {}, body: { nodeType: 1, tagName: 'BODY', childNodes: [], getAttribute() { return null; } },
    createElement: () => ({ setAttribute() {}, className: '', innerHTML: '', value: '' }),
    querySelector: () => ({ append() {} }),
  };
  const { translateMessage } = await import('./i18n.js');
  assert.equal(translateMessage('Hủy'), 'Cancel');
  assert.equal(translateMessage('Không thể xác nhận profile đã ngừng sử dụng.'), 'Could not confirm that the profile is no longer in use.');
  assert.equal(translateMessage('Addon cần kết nối phần mềm bên ngoài; kết nối này có thể không hoạt động trong WebView2.'), 'This add-on requires an external application; the connection may not work in WebView2.');
  assert.equal(translateMessage('Xóa addon $& Tool'), 'Delete add-on $& Tool');
  assert.equal(translateMessage('Cài đặt cửa sổ: $& YouTube'), 'Window settings: $& YouTube');
  assert.equal(translateMessage('Xóa bản nháp “YouTube”?'), 'Delete draft “YouTube”?');
  assert.equal(translateMessage('unrecognized'), 'unrecognized');
  language = 'vi';
  assert.equal(translateMessage('Hủy'), 'Hủy');
});
