import path from 'node:path';
import { lstat, mkdir, readFile, realpath, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readQuickSettings } from './quick-edit.mjs';
const slotPattern = /^(?:selected|addon-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
async function prepare(appsRoot, id) {
  await readQuickSettings({ appsRoot, id });
  const root = await realpath(appsRoot); const runtime = path.join(root, id, 'pake-runtime');
  for (const name of ['extensions', 'extensions-disabled']) {
    const dir = path.join(runtime, name);
    try { const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(dir)).toLowerCase() !== dir.toLowerCase()) throw new Error('Thư mục addon không an toàn.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return runtime;
}
async function entries(runtime, group) {
  const root = path.join(runtime, group); let names;
  try { names = await readdir(root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const items = [];
  for (const slot of names) {
    if (!slotPattern.test(slot)) throw new Error('Thư mục addon không hợp lệ.');
    const dir = path.join(root, slot); const info = await lstat(dir);
    if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(dir)).toLowerCase() !== dir.toLowerCase()) throw new Error('Thư mục addon không an toàn.');
    const manifestFile = path.join(dir, 'manifest.json'); const manifestInfo = await lstat(manifestFile);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 128000) throw new Error('Manifest addon không hợp lệ.');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')); let name = typeof manifest.name === 'string' ? manifest.name : slot;
    if (/^__MSG_[a-zA-Z0-9_]+__$/.test(name)) {
      const key = name.slice(6, -2).toLowerCase();
      for (const locale of [manifest.default_locale, 'en']) {
        if (typeof locale !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(locale)) continue;
        try { const f = path.join(dir, '_locales', locale, 'messages.json'); const info = await lstat(f); if (!info.isFile() || info.isSymbolicLink() || info.size > 500000 || (await realpath(f)).toLowerCase() !== f.toLowerCase()) continue; const messages = JSON.parse(await readFile(f, 'utf8')); const matched = Object.entries(messages).find(([entry]) => entry.toLowerCase() === key); if (typeof matched?.[1]?.message === 'string') { name = matched[1].message; break; } } catch { /* Fall back to a stable identifier. */ }
      }
      if (name.startsWith('__MSG_')) name = slot === 'selected' ? 'Addon riêng' : `Addon ${slot.slice(6, 14)}`;
    }
    items.push({ id: slot, name, version: typeof manifest.version === 'string' ? manifest.version : '', enabled: group === 'extensions' });
  }
  return items;
}
export async function listQuickAddons({ appsRoot, id }) {
  const runtime = await prepare(appsRoot, id);
  const addons = [...await entries(runtime, 'extensions'), ...await entries(runtime, 'extensions-disabled')];
  if (new Set(addons.map((item) => item.id)).size !== addons.length) throw new Error('Danh sách addon bị trùng.');
  return addons;
}
export async function setQuickAddons({ appsRoot, id, enabled }) {
  const addons = await listQuickAddons({ appsRoot, id });
  if (!Array.isArray(enabled) || enabled.some((slot) => typeof slot !== 'string' || !slotPattern.test(slot)) || new Set(enabled).size !== enabled.length || enabled.some((slot) => !addons.some((item) => item.id === slot))) throw new Error('Danh sách addon không hợp lệ.');
  const runtime = await prepare(appsRoot, id); const file = path.join(runtime, 'pake.json'); const original = JSON.parse(await readFile(file, 'utf8'));
  const changes = addons.filter((item) => item.enabled !== enabled.includes(item.id)); const moved = []; const temp = `${file}.${randomUUID()}.new`;
  try {
    for (const item of changes) {
      const from = path.join(runtime, item.enabled ? 'extensions' : 'extensions-disabled', item.id);
      const destDir = path.join(runtime, item.enabled ? 'extensions-disabled' : 'extensions'); await mkdir(destDir, { recursive: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
      const destInfo = await lstat(destDir); if (!destInfo.isDirectory() || destInfo.isSymbolicLink() || (await realpath(destDir)).toLowerCase() !== destDir.toLowerCase()) throw new Error('Thư mục addon không an toàn.');
      const to = path.join(destDir, item.id); try { await lstat(to); throw new Error('Addon đích đã tồn tại.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await rename(from, to); moved.push({ from, to });
    }
    original.browser_extensions = enabled.length > 0;
    await writeFile(temp, JSON.stringify(original, null, 2), { flag: 'wx' }); await rename(temp, file);
  } catch (error) {
    const failures=[]; for (const item of moved.reverse()) { try { await rename(item.to, item.from); } catch (rollback) { failures.push(`${item.to}: ${rollback.message}`); } }
    if (failures.length) throw new Error(`Không thể khôi phục addon: ${failures.join('; ')}`);
    throw error;
  } finally { await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') console.warn(error); }); }
}
