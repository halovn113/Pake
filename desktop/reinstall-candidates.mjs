import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function origin(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null; } catch { return null; }
}
async function directoryState(base, child) {
  const candidate = path.join(base, child);
  try {
    const info = await lstat(candidate);
    if (!info.isDirectory() || info.isSymbolicLink()) return 'unknown';
    const root = await realpath(base); const actual = await realpath(candidate);
    return path.resolve(actual).toLowerCase() === path.resolve(root, child).toLowerCase() ? 'present' : 'unknown';
  } catch (error) { return error.code === 'ENOENT' ? 'absent' : 'unknown'; }
}
export async function findReinstallCandidates({ entries, url, appsRoot, profileRoot }) {
  const site = origin(url); if (!site) throw new Error('Địa chỉ website không hợp lệ.');
  if (!Array.isArray(entries)) throw new Error('Danh sách ứng dụng không hợp lệ.');
  const results = []; const seen = new Set();
  for (const item of entries) {
    if (item?.kind !== 'installed-quick' || typeof item.id !== 'string' || !idPattern.test(item.id) || seen.has(item.id) || typeof item.name !== 'string' || origin(item.url) !== site) continue;
    seen.add(item.id);
    const app = await directoryState(appsRoot, item.id);
    const profile = await directoryState(profileRoot, `com.webappmaker.app${item.id.replaceAll('-', '')}`);
    if (app === 'unknown' || profile === 'unknown') continue;
    const createdAt = typeof item.createdAt === 'string' && item.createdAt.length <= 40 && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : null;
    if (app === 'present') results.push({ id: item.id, name: item.name, url: item.url, createdAt, state: 'installed' });
    else if (profile === 'present') results.push({ id: item.id, name: item.name, url: item.url, createdAt, state: 'retained' });
  }
  return results;
}
