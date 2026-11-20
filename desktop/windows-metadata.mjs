import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

async function loadResourceEditor() {
  try { return await require('resedit/cjs').load(); }
  catch (error) {
    try { return await createRequire(fileURLToPath(new URL('./deps.local/package.json', import.meta.url)))('resedit/cjs').load(); }
    catch { throw error; }
  }
}

// Only edit a new, unsigned runtime copy. ResEdit refuses signed inputs by
// default, so this never silently invalidates an Authenticode signature.
export async function setWindowsAppName(binary, name, icon) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw new Error('Tên ứng dụng không hợp lệ.');
  const editor = await loadResourceEditor();
  const exe = editor.NtExecutable.from(binary);
  const resources = editor.NtExecutableResource.from(exe);
  const versions = editor.Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) throw new Error('Runtime không có thông tin phiên bản Windows.');
  for (const version of versions) {
    const languages = version.getAvailableLanguages();
    if (!languages.length) throw new Error('Runtime không có thông tin ngôn ngữ phiên bản.');
    for (const language of languages) version.setStringValues(language, { FileDescription: name.trim(), ProductName: name.trim() });
    version.outputToResourceEntries(resources.entries);
  }
  if (icon) {
    const groups = editor.Resource.IconGroupEntry.fromEntries(resources.entries);
    if (!groups.length) throw new Error('Runtime không có nhóm biểu tượng Windows.');
    const icons = editor.Data.IconFile.from(icon).icons.map((item) => item.data);
    if (!icons.length) throw new Error('Biểu tượng Windows không hợp lệ.');
    for (const group of groups) editor.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
  }
  resources.outputResource(exe);
  return Buffer.from(exe.generate());
}
