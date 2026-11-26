import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
export function inspectUnpackedExtension(extension) {
  if (!extension || !Array.isArray(extension.files) || !extension.files.length || extension.files.length > 2500) throw new Error('Thư mục tiện ích không hợp lệ.');
  const files = new Map(); let total = 0;
  for (const file of extension.files) {
    if (!file || typeof file.path !== 'string' || file.path.length > 240 || typeof file.data !== 'string' || (file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))) throw new Error('File tiện ích không hợp lệ.');
    const parts = file.path.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || /[\\:*?"<>|\x00-\x1f]/.test(part) || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Đường dẫn tiện ích không an toàn.');
    const key = parts.join('/').toLowerCase(); if (files.has(key)) throw new Error('Đường dẫn tiện ích bị trùng.');
    const data = Buffer.from(file.data, 'base64'); total += data.length; if (total > 8_000_000) throw new Error('Tiện ích quá lớn (tối đa 8 MB).');
    files.set(key, { parts, data });
  }
  const manifest = files.get('manifest.json'); if (!manifest) throw new Error('Không tìm thấy manifest.json ở gốc thư mục.');
  let info; try { info = JSON.parse(manifest.data.toString('utf8')); } catch { throw new Error('manifest.json không hợp lệ.'); }
  if (typeof info.name !== 'string' || ![2, 3].includes(info.manifest_version)) throw new Error('Manifest tiện ích không hợp lệ.');
  return { files, manifest: info };
}

export async function writeUnpackedExtension(root, extension, slot = 'selected') {
  if (!/^[a-z0-9-]{1,50}$/.test(slot)) throw new Error('Mã tiện ích không hợp lệ.');
  const { files, manifest: info } = inspectUnpackedExtension(extension);
  const target = path.join(root, 'extensions', slot);
  for (const { parts, data } of files.values()) { const targetFile = path.join(target, ...parts); await mkdir(path.dirname(targetFile), { recursive: true }); await writeFile(targetFile, data, { flag: 'wx' }); }
  return { name: info.name };
}

export function extensionIcon(extension, manifest) {
  const icons = manifest && typeof manifest.icons === 'object' && manifest.icons ? Object.entries(manifest.icons).filter(([size, value]) => /^\d+$/.test(size) && typeof value === 'string').sort((a, b) => Number(b[0]) - Number(a[0])) : [];
  for (const [, value] of icons) {
    const file = extension.files.find((item) => item.path.toLowerCase() === value.replace(/^\.\//, '').toLowerCase());
    const ext = path.extname(value).toLowerCase(); const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' }[ext];
    if (file && mime && file.data.length <= 90000 && /^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) return `data:${mime};base64,${file.data}`;
  }
  return undefined;
}
