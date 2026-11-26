import { assessAddon } from './addon-compatibility.mjs';
import path from 'node:path';
import { readdir, lstat, readFile, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

async function directories(root) { try { return (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => d.name); } catch (error) { if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) return []; throw error; } }
async function regularDirectory(dir) { const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(dir)).toLowerCase() !== path.resolve(dir).toLowerCase()) throw new Error('Thư mục addon không an toàn.'); }
export async function findManifestIcon(folder, manifest) {
  const icons = manifest.icons && typeof manifest.icons === 'object' ? Object.entries(manifest.icons).filter(([size, value]) => /^\d+$/.test(size) && typeof value === 'string').sort((a,b) => Number(b[0]) - Number(a[0])) : [];
  for (const [, value] of icons) {
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' }[path.extname(value).toLowerCase()];
    if (!mime || value.includes('\\') || value.includes(':')) continue;
    const target = path.resolve(folder, value); if (!target.toLowerCase().startsWith(path.resolve(folder).toLowerCase() + path.sep)) continue;
    try { const info = await lstat(target); if (!info.isFile() || info.isSymbolicLink() || info.size > 65536 || (await realpath(target)).toLowerCase() !== target.toLowerCase()) continue; return `data:${mime};base64,${(await readFile(target)).toString('base64')}`; } catch { /* Icon is optional. */ }
  }
}
export async function discoverExtensions(localAppData) {
  if (!localAppData) return [];
  try { localAppData = await realpath(localAppData); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const browsers = [['Chrome', ['Google','Chrome','User Data']], ['Edge', ['Microsoft','Edge','User Data']], ['Brave', ['BraveSoftware','Brave-Browser','User Data']]];
  const results = [];
  for (const [browser, parts] of browsers) {
    const base = path.join(localAppData, ...parts);
    for (const profile of (await directories(base)).filter((name) => /^(Default|Profile [0-9]+)$/.test(name))) {
      const extensions = path.join(base, profile, 'Extensions');
      for (const extensionId of (await directories(extensions)).filter((name) => /^[a-p]{32}$/.test(name))) {
        const parent = path.join(extensions, extensionId);
        const versions = (await directories(parent)).filter((v) => /^[0-9][0-9._-]*$/.test(v)).sort((a,b) => b.localeCompare(a, 'en', { numeric: true }));
        for (const version of versions.slice(0, 1)) {
          const folder = path.join(parent, version);
          try { await regularDirectory(folder); const manifestFile = path.join(folder, 'manifest.json'); const m = await lstat(manifestFile); if (!m.isFile() || m.isSymbolicLink() || m.size > 128000) continue; const manifest = JSON.parse(await readFile(manifestFile, 'utf8')); if (typeof manifest.name !== 'string' || ![2,3].includes(manifest.manifest_version)) continue; results.push({ token: randomUUID(), browser, profile, name: manifest.name.startsWith('__MSG_') ? extensionId : manifest.name, version: String(manifest.version || version), icon: await findManifestIcon(folder, manifest), compatibility: assessAddon(manifest, manifest.name), folder }); } catch { /* An unreadable or invalid extension is not imported. */ }
          if (results.length >= 1000) return results;
        }
      }
    }
  }
  return results;
}
export async function readDiscoveredExtension(folder) {
  await regularDirectory(folder); const files = []; let total = 0;
  async function walk(dir, relative) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '_metadata') continue;
      if (entry.isSymbolicLink()) throw new Error('Addon chứa liên kết không được hỗ trợ.');
      const absolute = path.join(dir, entry.name); const rel = [...relative, entry.name];
      if (entry.isDirectory()) { await regularDirectory(absolute); await walk(absolute, rel); }
      else if (entry.isFile()) { const info = await lstat(absolute); if (!info.isFile() || info.isSymbolicLink()) throw new Error('File addon không an toàn.'); total += info.size; if (total > 8000000 || files.length >= 2500) throw new Error('Addon vượt giới hạn 8 MB hoặc 2500 file.'); files.push({ path: rel.join('/'), data: (await readFile(absolute)).toString('base64') }); }
    }
  }
  await walk(folder, []); return { files };
}
