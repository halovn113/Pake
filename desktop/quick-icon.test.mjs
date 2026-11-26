import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolveQuickIcon } from './quick-icon.mjs';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = createRequire(new URL('./deps.local/package.json', import.meta.url))('sharp'); }

async function visibleWidth(ico) {
  const entry = 6 + (ico.readUInt16LE(4) - 1) * 16;
  const offset = ico.readUInt32LE(entry + 12);
  const size = ico.readUInt32LE(entry + 8);
  const { data, info } = await sharp(ico.subarray(offset, offset + size)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 20) { left = Math.min(left, x); right = Math.max(right, x); }
  return right - left + 1;
}

test('encodes icon frames and accepts the resulting ICO without changes', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
  const first = await resolveQuickIcon({ selectedIcon: { data: `data:image/svg+xml;base64,${svg.toString('base64')}` }, name: 'Test' });
  assert.equal(first.ico.readUInt16LE(4), 7);
  const second = await resolveQuickIcon({ selectedIcon: { data: `data:image/x-icon;base64,${first.ico.toString('base64')}` }, name: 'Test' });
  assert.deepEqual(second.ico, first.ico);
});

test('generates a fallback when automatic retrieval fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const icon = await resolveQuickIcon({ pageUrl: 'https://example.com', name: 'Example' });
    assert.equal(icon.source, 'fallback');
    assert.equal(icon.ico.readUInt16LE(2), 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('follows an HTTP icon redirect and uses the returned image', async () => {
  const originalFetch = globalThis.fetch;
  const visited = [];
  globalThis.fetch = async (url) => {
    visited.push(String(url));
    if (visited.length === 1) return new Response(null, { status: 302, headers: { location: '/icon.svg' } });
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>', { status: 200 });
  };
  try {
    const icon = await resolveQuickIcon({ pageUrl: 'https://example.com', name: 'Example' });
    assert.equal(icon.source, 'website');
    assert.deepEqual(visited, ['https://example.com/favicon.ico', 'https://example.com/icon.svg']);
  } finally { globalThis.fetch = originalFetch; }
});

test('enlarges padded automatic icons while preserving selected image padding', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="64" y="96" width="128" height="64" fill="red"/></svg>';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(svg, { status: 200 });
  try {
    const automatic = await resolveQuickIcon({ pageUrl: 'https://example.com', name: 'Example' });
    const custom = await resolveQuickIcon({ selectedIcon: { data: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }, name: 'Example' });
    assert.ok(await visibleWidth(automatic.ico) >= 220);
    assert.equal(await visibleWidth(custom.ico), 128);
  } finally { globalThis.fetch = originalFetch; }
});

test('retries an automatic favicon after a temporary network failure', async () => {
  const originalFetch = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async () => { if (++attempts === 1) throw new Error('temporary failure'); return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>', { status: 200 }); };
  try { const result = await resolveQuickIcon({ pageUrl: 'https://example.com', name: 'Example' }); assert.equal(result.source, 'website'); assert.equal(attempts, 2); }
  finally { globalThis.fetch = originalFetch; }
});
