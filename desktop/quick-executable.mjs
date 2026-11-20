import path from 'node:path';
import { lstat, readFile } from 'node:fs/promises';

export function executableName(name) {
  let base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 _.-]/g, '_').replace(/^[^a-zA-Z0-9_]+|[ .]+$/g, '').slice(0, 60).replace(/[ .]+$/g, '');
  if (!base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = 'WebApp';
  return `${base}.exe`;
}

export async function installedExecutable(appDir) {
  const metadata = JSON.parse(await readFile(path.join(appDir, 'pake-runtime', 'app.json'), 'utf8'));
  const name = metadata.executableName ?? 'WebApp.exe';
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9 _.-]{0,59}\.exe$/.test(name) || /[ .]\.exe$/i.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Tên file ứng dụng không hợp lệ.');
  const file = path.join(appDir, name); const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('File ứng dụng không hợp lệ.');
  return file;
}
