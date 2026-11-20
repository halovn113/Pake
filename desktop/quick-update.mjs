import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setWindowsAppName } from './windows-metadata.mjs';
import { installedExecutable } from './quick-executable.mjs';

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function updateQuickRuntime({ appsRoot, runtime, id }) {
  if (!idPattern.test(id)) throw new Error('Mã ứng dụng không hợp lệ.');
  const base = await realpath(appsRoot);
  const directory = path.join(base, id);
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(directory)).toLowerCase() !== directory.toLowerCase()) throw new Error('Thư mục ứng dụng không an toàn.');
  const executable = await installedExecutable(directory);
  const exeInfo = await lstat(executable);
  if (!exeInfo.isFile() || exeInfo.isSymbolicLink()) throw new Error('File ứng dụng không hợp lệ.');
  const appInfo = JSON.parse(await readFile(path.join(directory, 'pake-runtime', 'app.json'), 'utf8'));
  if (appInfo.identifier !== `com.webappmaker.app${id.replaceAll('-', '')}` || typeof appInfo.productName !== 'string' || !appInfo.productName.trim()) throw new Error('Định danh ứng dụng không khớp; không thể cập nhật.');
  const icon = await readFile(path.join(directory, 'app.ico'));
  const binary = await setWindowsAppName(await readFile(runtime), appInfo.productName, icon);
  const nonce = randomUUID();
  const staged = path.join(directory, `WebApp-${nonce}.new`);
  const backup = path.join(directory, `WebApp-${nonce}.backup`);
  let backedUp = false;
  let installed = false;
  try {
    await writeFile(staged, binary, { flag: 'wx' });
    // Windows refuses to rename a running executable. Keep the original until
    // the replacement is fully written; restore it if the second rename fails.
    await rename(executable, backup);
    backedUp = true;
    try { await rename(staged, executable); installed = true; }
    catch (error) {
      try { await rename(backup, executable); backedUp = false; }
      catch (rollback) { throw new Error(`Không thể khôi phục file gốc tại ${backup}: ${rollback.message}`); }
      throw error;
    }
    try { await unlink(backup); backedUp = false; }
    catch (error) { console.warn(`Could not remove runtime backup ${backup}: ${error.message}`); }
    return { name: appInfo.productName, backup: backedUp ? backup : null };
  } catch (error) {
    if (!installed && !backedUp) {
      try { await unlink(staged); } catch (cleanup) { if (cleanup.code !== 'ENOENT') console.warn(`Could not remove staged runtime ${staged}: ${cleanup.message}`); }
    }
    if (['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) throw new Error('Không thể thay file ứng dụng. Hãy đóng tất cả cửa sổ của app và thử lại.');
    throw error;
  }
}
