import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('./picture-in-picture.js', import.meta.url), 'utf8');
function fixture(enabled = true) {
  let button, requests = 0, exits = 0; const listeners = {}; const toasts = [];
  const video = { readyState: 1, paused: false, ended: false, disablePictureInPicture: false, getBoundingClientRect() { return {left: 10, right: 410, top: 10, bottom: 310, width: 400, height: 300}; }, requestPictureInPicture() { requests++; return Promise.resolve(); } };
  const document = { pictureInPictureEnabled: enabled, pictureInPictureElement: null, createElement: () => (button = { style: {}, setAttribute() {}, addEventListener: (name, handler) => { listeners[name] = handler; } }), querySelectorAll: () => [video], addEventListener: (name, handler) => { listeners[name] = handler; }, body: { appendChild() {} }, exitPictureInPicture() { exits++; return Promise.resolve(); } };
  const window = { innerWidth: 1024, pakeToast: (message) => toasts.push(message) }; window.top = window;
  runInNewContext(source, { window, document, MutationObserver: class { observe() {} }, requestAnimationFrame: (callback) => callback(), console: { error() {} }, Promise, Array, Object });
  return { document, listeners, video, toasts, get button() { return button; }, get requests() { return requests; }, get exits() { return exits; } };
}
test('only shows a PiP control when the webview supports it and toggles on a user click', () => {
  const unsupported = fixture(false); assert.equal(unsupported.button, undefined);
  const f = fixture(); assert.equal(f.button.style.display, 'none');
  f.listeners.pointermove({clientX: 100, clientY: 100, target: f.video}); assert.equal(f.button.style.display, 'block');
  f.listeners.click({ isTrusted: false }); assert.equal(f.requests, 0);
  f.listeners.click({ isTrusted: true }); assert.equal(f.requests, 1);
  f.document.pictureInPictureElement = {}; f.listeners.click({ isTrusted: true }); assert.equal(f.exits, 1);
});


test('hides the control for videos disabled by the page and after playback ends', () => {
  const f = fixture();
  f.video.disablePictureInPicture = true;
  f.listeners.loadedmetadata();
  assert.equal(f.button.style.display, 'none');
  f.video.disablePictureInPicture = false;
  f.video.ended = true;
  f.listeners.ended();
  assert.equal(f.button.style.display, 'none');
});


test('shows the button only over the video and hides it when the pointer leaves', () => {
  const f = fixture();
  f.listeners.pointermove({ clientX: 120, clientY: 120, target: f.video });
  assert.equal(f.button.style.display, 'block');
  f.listeners.pointermove({ clientX: 600, clientY: 600, target: {} });
  assert.equal(f.button.style.display, 'none');
});

test('reports a video PiP request rejected by the website', async () => {
  const f = fixture();
  f.video.requestPictureInPicture = () => Promise.reject(new Error('Not allowed'));
  f.listeners.click({ isTrusted: true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.toasts.length, 1);
});
