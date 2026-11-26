import path from 'node:path';
import { lstat, readdir, realpath, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const folderPattern = /^com\.webappmaker\.app([0-9a-f]{32})$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const profileName = (id) => `com.webappmaker.app${id.replaceAll('-', '')}`;
const key = (value) => path.resolve(value).toLowerCase();
async function safeDirectory(root, child) {
  const info = await lstat(root); const resolved = await realpath(root);
  if (!info.isDirectory() || info.isSymbolicLink() || key(root) !== key(resolved)) throw new Error('Thư mục dữ liệu không an toàn.');
  const target = path.join(resolved, child); const targetInfo = await lstat(target);
  if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink() || key(await realpath(target)) !== key(target)) throw new Error('Profile không an toàn.');
  return target;
}
async function sizeOf(dir) {
  let size = 0; let count = 0; const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name); const info = await lstat(file);
      if (++count > 100000 || info.isSymbolicLink()) throw new Error('Không thể kiểm tra toàn bộ profile.');
      if (info.isDirectory()) { if (key(await realpath(file)) !== key(file)) throw new Error('Profile chứa liên kết.'); stack.push(file); }
      else if (info.isFile()) size += info.size; else throw new Error('Profile chứa file không hợp lệ.');
    }
  }
  return size;
}
export async function listProfiles({ profileRoot, entries, checkState }) {
  if (!Array.isArray(entries)) throw new Error('Danh sách ứng dụng không hợp lệ.');
  const root = await realpath(profileRoot); const rootInfo = await lstat(profileRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || key(root) !== key(profileRoot)) throw new Error('Thư mục dữ liệu không an toàn.');
  const known = new Map();
  for (const entry of entries) { if (entry?.kind !== 'installed-quick' || !idPattern.test(entry.id || '')) continue; const name = profileName(entry.id); known.set(name, known.has(name) ? null : entry); }
  const found = [];
  for (const name of await readdir(root)) {
    if (!folderPattern.test(name)) continue;
    const entry = known.get(name); let target; try { target = await safeDirectory(root, name); } catch { continue; }
    let state = 'unknown'; if (entry) { try { state = await checkState(entry); } catch { state = 'unknown'; } }
    if (!['installed', 'removed'].includes(state)) state = 'unknown';
    let size = null; try { size = await sizeOf(target); } catch { /* Report incomplete size as unknown. */ }
    found.push({ id: entry?.id || null, name: typeof entry?.name === 'string' ? entry.name : null, url: typeof entry?.url === 'string' ? entry.url : null, createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : null, path: target, state, size });
  }
  return found;
}
export async function removeRetainedProfile({ profileRoot, entries, id, checkState }) {
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Mã profile không hợp lệ.');
  const records = entries.filter((entry) => entry?.kind === 'installed-quick' && entry.id === id);
  if (records.length !== 1 || await checkState(records[0]) !== 'removed') throw new Error('Không thể xác nhận profile đã ngừng sử dụng.');
  const target = await safeDirectory(profileRoot, profileName(id));
  await sizeOf(target); // Reject links and unexpected file types before removal.
  if (await checkState(records[0]) !== 'removed') throw new Error('Trạng thái ứng dụng đã thay đổi.');
  const quarantine = path.join(path.dirname(target), `.webappmaker-delete-${randomUUID()}`);
  await rename(target, quarantine);
  try { await sizeOf(quarantine); await rm(quarantine, { recursive: true }); }
  catch (error) { try { await rename(quarantine, target); } catch (rollback) { throw new Error(`Không thể khôi phục profile tại ${quarantine}: ${rollback.message}`); } throw error; }
}
