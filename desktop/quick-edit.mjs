import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setWindowsAppName } from './windows-metadata.mjs';
import { installedExecutable } from './quick-executable.mjs';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields = { width: [1, 10000], height: [1, 10000], zoom: [50, 200], always_on_top: 'boolean', fullscreen: 'boolean', maximize: 'boolean' };

async function configPath(appsRoot, id) {
  if (!idPattern.test(id)) throw new Error('Mã ứng dụng không hợp lệ.');
  const root = await realpath(appsRoot);
  let current = root;
  for (const part of [id, 'pake-runtime']) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(current)).toLowerCase() !== current.toLowerCase()) throw new Error('Thư mục ứng dụng không an toàn.');
  }
  for (const name of ['app.json', 'pake.json']) {
    const info = await lstat(path.join(current, name));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Cấu hình ứng dụng không an toàn.');
  }
  const app = JSON.parse(await readFile(path.join(current, 'app.json'), 'utf8'));
  if (app.identifier !== `com.webappmaker.app${id.replaceAll('-', '')}`) throw new Error('Định danh ứng dụng không khớp.');
  return path.join(current, 'pake.json');
}

export async function readQuickSettings({ appsRoot, id }) {
  const file = await configPath(appsRoot, id);
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(config.windows) || !config.windows[0]) throw new Error('Cấu hình cửa sổ không hợp lệ.');
  return { ...Object.fromEntries(Object.keys(fields).map((key) => [key, (config.windows[0][key] ?? (key === 'zoom' ? 100 : undefined))])), url: config.windows[0].url };
}

export async function editQuickSettings({ appsRoot, id, settings }) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).some((key) => !(key in fields))) throw new Error('Cài đặt không hợp lệ.');
  for (const [key, value] of Object.entries(settings)) {
    const rule = fields[key];
    if (rule === 'boolean' ? typeof value !== 'boolean' : !Number.isInteger(value) || value < rule[0] || value > rule[1]) throw new Error(`Cài đặt ${key} không hợp lệ.`);
  }
  const file = await configPath(appsRoot, id);
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(config.windows) || !config.windows[0]) throw new Error('Cấu hình cửa sổ không hợp lệ.');
  Object.assign(config.windows[0], settings);
  const temp = `${file}.${randomUUID()}.new`;
  try {
    await writeFile(temp, JSON.stringify(config, null, 2), { flag: 'wx' });
    await rename(temp, file);
  } finally { await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') console.warn(error); }); }
}


// Stage all replacements before touching installed files and restore originals on failure.
async function replaceFiles(replacements) {
  const nonce = randomUUID(); const items = replacements.map(([file, data]) => ({ file, data, temp: `${file}.${nonce}.new`, backup: `${file}.${nonce}.bak`, backed: false, installed: false }));
  try {
    for (const item of items) { const info = await lstat(item.file); if (!info.isFile() || info.isSymbolicLink()) throw new Error('File ứng dụng không an toàn.'); await writeFile(item.temp, item.data, { flag: 'wx' }); }
    for (const item of items) { await rename(item.file, item.backup); item.backed = true; await rename(item.temp, item.file); item.installed = true; }
  } catch (error) {
    const failures = [];
    for (const item of items.slice().reverse()) if (item.backed) { try { if (item.installed) await unlink(item.file); await rename(item.backup, item.file); item.backed = false; } catch (rollback) { failures.push(`${item.backup}: ${rollback.message}`); } }
    if (failures.length) throw new Error(`Không thể khôi phục một số file: ${failures.join('; ')}`);
    throw error;
  } finally { for (const item of items) await unlink(item.temp).catch(() => {}); }
  for (const item of items) await unlink(item.backup).catch(() => {});
}

export async function editQuickUrl({ appsRoot, profileRoot, id, url }) {
  let page; try { page = new URL(url); } catch { throw new Error('Địa chỉ website không hợp lệ.'); }
  if (!['http:', 'https:'].includes(page.protocol)) throw new Error('Chỉ hỗ trợ URL http hoặc https.');
  const file = await configPath(appsRoot, id);
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (!config.windows?.[0]) throw new Error('Cấu hình cửa sổ không hợp lệ.');
  if (config.windows[0].url === page.href) return page.href;
  const profileBase = await realpath(profileRoot);
  const profile = path.join(profileBase, `com.webappmaker.app${id.replaceAll('-', '')}`);
  const last = path.join(profile, 'last-url.txt'); const backup = `${last}.${randomUUID()}.bak`;
  let moved = false;
  try {
    try { const info = await lstat(profile); if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(profile)).toLowerCase() !== profile.toLowerCase()) throw new Error('Thư mục dữ liệu ứng dụng không an toàn.'); const lastInfo = await lstat(last); if (!lastInfo.isFile() || lastInfo.isSymbolicLink()) throw new Error('File URL đã lưu không an toàn.'); await rename(last, backup); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    config.windows[0].url = page.href; config.windows[0].url_type = 'web';
    await replaceFiles([[file, JSON.stringify(config, null, 2)]]);
  } catch (error) { if (moved) { try { await rename(backup, last); moved = false; } catch (rollback) { throw new Error(`Không thể khôi phục URL cũ tại ${backup}: ${rollback.message}`); } } throw error; }
  if (moved) await unlink(backup).catch(() => {});
  return page.href;
}

export async function editQuickIcon({ appsRoot, id, ico }) {
  const config = await configPath(appsRoot, id); const runtimeDir = path.dirname(config); const appDir = path.dirname(runtimeDir);
  const app = JSON.parse(await readFile(path.join(runtimeDir, 'app.json'), 'utf8'));
  const exe = await installedExecutable(appDir);
  const binary = await setWindowsAppName(await readFile(exe), app.productName, ico);
  await replaceFiles([[exe, binary], [path.join(appDir, 'app.ico'), ico], [path.join(runtimeDir, 'icon.ico'), ico]]);
}
