import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const maxBytes = 2 * 1024 * 1024;
const sizes = [16, 24, 32, 48, 64, 128, 256];

function validIco(data) {
  if (data.length < 22 || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) return false;
  const count = data.readUInt16LE(4);
  if (!count || count > 64 || data.length < 6 + count * 16) return false;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const length = data.readUInt32LE(entry + 8);
    const offset = data.readUInt32LE(entry + 12);
    if (!length || offset < 6 + count * 16 || offset + length > data.length) return false;
  }
  return true;
}

async function makeIco(input, { normalize = false } = {}) {
  if (validIco(input)) return input;
  let sharp;
  try { sharp = require('sharp'); }
  catch (error) {
    try { sharp = createRequire(fileURLToPath(new URL('./deps.local/package.json', import.meta.url)))('sharp'); }
    catch { throw error; }
  }
  let image = sharp(input, { limitInputPixels: 16_000_000 });
  if (normalize) {
    const { data, info } = await image.clone().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 20) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (right >= left && bottom >= top) image = image.extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
  }
  const frames = await Promise.all(sizes.map((size) => {
    const inner = normalize ? Math.max(1, Math.round(size * 0.88)) : size;
    const padding = size - inner;
    return image.clone().resize(inner, inner, { fit: 'contain', background: '#00000000' }).extend({ left: Math.floor(padding / 2), right: Math.ceil(padding / 2), top: Math.floor(padding / 2), bottom: Math.ceil(padding / 2), background: '#00000000' }).png().toBuffer();
  }));
  const headerSize = 6 + sizes.length * 16;
  const output = Buffer.alloc(headerSize + frames.reduce((total, frame) => total + frame.length, 0));
  output.writeUInt16LE(1, 2); output.writeUInt16LE(sizes.length, 4);
  let offset = headerSize;
  frames.forEach((frame, index) => { const entry = 6 + index * 16; output[entry] = sizes[index] === 256 ? 0 : sizes[index]; output[entry + 1] = output[entry]; output.writeUInt16LE(1, entry + 4); output.writeUInt16LE(32, entry + 6); output.writeUInt32LE(frame.length, entry + 8); output.writeUInt32LE(offset, entry + 12); frame.copy(output, offset); offset += frame.length; });
  return output;
}

async function downloadIcon(url) {
  let parsed = new URL(url);
  const signal = AbortSignal.timeout(5000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Icon URL must use HTTP or HTTPS.');
    const response = await fetch(parsed, { signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('Invalid icon redirect.');
      parsed = new URL(location, parsed);
      continue;
    }
    if (!response.ok || !response.body) throw new Error('Could not download the icon.');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > maxBytes) throw new Error('Icon exceeds 2 MB.'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many icon redirects.');
}

export async function resolveQuickIcon({ pageUrl, iconUrl, autoIconUrl, selectedIcon, name }) {
  if (selectedIcon) {
    if (typeof selectedIcon.data !== 'string' || !/^data:image\/(png|jpeg|webp|x-icon|vnd.microsoft.icon|svg\+xml);base64,/i.test(selectedIcon.data) || selectedIcon.data.length > 1_500_000) throw new Error('Biểu tượng không hợp lệ.');
    return { ico: await makeIco(Buffer.from(selectedIcon.data.split(',')[1], 'base64')), source: 'custom' };
  }
  if (iconUrl) return { ico: await makeIco(await downloadIcon(iconUrl)), source: 'custom' };
  for (const candidate of [autoIconUrl, new URL('/favicon.ico', pageUrl).href].filter(Boolean)) {
    try { return { ico: await makeIco(await downloadIcon(candidate), { normalize: true }), source: 'website' }; }
    catch { /* Try the next automatic source. */ }
  }
  const initial = (name.trim().match(/[a-z0-9]/i)?.[0] || 'W').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="54" fill="#6d60dc"/><text x="128" y="174" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="150" fill="white">${initial}</text></svg>`;
  return { ico: await makeIco(Buffer.from(svg)), source: 'fallback' };
}
