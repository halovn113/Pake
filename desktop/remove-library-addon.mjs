import path from 'node:path';
import { lstat, readdir, realpath, rm } from 'node:fs/promises';
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function removeLibraryAddon(root, id) {
  if (!idPattern.test(id)) throw new Error('Mã addon không hợp lệ.');
  const base = await realpath(root);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || base.toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error('Thư mục addon không an toàn.');
  const target = path.join(base, id);
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(target)).toLowerCase() !== target.toLowerCase()) throw new Error('Thư mục addon không an toàn.');
  async function check(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name); const item = await lstat(child);
      if (item.isSymbolicLink() || (item.isDirectory() && (await realpath(child)).toLowerCase() !== child.toLowerCase())) throw new Error('Addon chứa liên kết không an toàn.');
      if (item.isDirectory()) await check(child);
      else if (!item.isFile()) throw new Error('Addon chứa file không hợp lệ.');
    }
  }
  await check(target);
  await rm(target, { recursive: true });
}
