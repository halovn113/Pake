import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir, writeFile, stat, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readExtensionArchive } from './extension-archive.mjs';
import { assessAddon } from './addon-compatibility.mjs';
import { removeLibraryAddon } from './remove-library-addon.mjs';
import { discoverExtensions, readDiscoveredExtension, findManifestIcon } from './discover-extensions.mjs';
import { writeUnpackedExtension, extensionIcon, inspectUnpackedExtension } from './unpacked-extension.mjs';
import { resolveQuickIcon } from './quick-icon.mjs';
import { setWindowsAppName } from './windows-metadata.mjs';
import { executableName, installedExecutable } from './quick-executable.mjs';
import { updateQuickRuntime } from './quick-update.mjs';
import { readQuickSettings, editQuickSettings, editQuickUrl, editQuickIcon } from './quick-edit.mjs';
import { listQuickAddons, setQuickAddons } from './quick-addons.mjs';
import { managerPaths } from './manager-paths.mjs';
import { validateQuickTray, configureQuickTray } from './quick-tray.mjs';
import { findReinstallCandidates } from './reinstall-candidates.mjs';
import { listProfiles, removeRetainedProfile } from './profile-cleanup.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '..');
const gallery = path.join(root, 'gallery', 'apps');
const { storage, addonRoot } = managerPaths(directory, process.env.WEBAPPMAKER_DATA_ROOT);
let discoveredAddons = new Map();
const uninstaller = path.join(directory, 'bin.local', 'WebAppMaker.Uninstaller.exe');
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/main.js': ['main.js', 'text/javascript; charset=utf-8'], '/picture-in-picture.js': ['picture-in-picture.js', 'text/javascript; charset=utf-8'], '/i18n.js': ['i18n.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
let build = null;
let buildChild = null;
let preparing = false;
const run = promisify(execFile);
async function environment() { const checks = await Promise.all([['Rust', 'rustc'], ['Cargo', 'cargo']].map(async ([label, command]) => { try { const result = await run(command, ['--version'], { cwd: root, timeout: 10000, windowsHide: true }); return { label, ok: true, detail: result.stdout.trim() }; } catch { return { label, ok: false, detail: 'Chưa tìm thấy hoặc không chạy được. Kiểm tra rustup và toolchain dự án.' }; } })); checks.unshift({ label: 'Node.js', ok: true, detail: process.version }); try { await stat(path.join(root, 'node_modules', '@tauri-apps', 'cli')); checks.push({ label: 'Tauri CLI', ok: true, detail: 'Đã cài trong dự án' }); } catch { checks.push({ label: 'Tauri CLI', ok: false, detail: 'Chạy pnpm install trong thư mục dự án.' }); } if (process.platform === 'win32') { try { const vswhere = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'); const result = await run(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { timeout: 10000, windowsHide: true }); if (!result.stdout.trim()) throw new Error('missing'); checks.push({ label: 'Visual C++', ok: true, detail: result.stdout.trim() }); } catch { checks.push({ label: 'Visual C++', ok: false, detail: 'Cài Visual Studio Build Tools với C++ desktop development.' }); } } return checks; }

function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(value)); }
function safeOrigin(request) { return request.headers.origin === 'http://127.0.0.1:4175' && request.headers.host === '127.0.0.1:4175'; }
async function body(request) { let text = ''; for await (const chunk of request) { text += chunk; if (text.length > 16_000_000) throw new Error('Dữ liệu quá lớn.'); } return JSON.parse(text); }
async function apps() { try { return JSON.parse(await readFile(path.join(storage, 'apps.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
async function ensureAppClosed(id) { const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); try { await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'windows-running.ps1'), '-AppId', id], { windowsHide: true, timeout: 15000 }); } catch (error) { if (error.code === 10) throw new Error('Hãy đóng ứng dụng trước khi cập nhật.'); throw new Error(`Không thể kiểm tra ứng dụng đang chạy: ${error.message}`); } }
async function profileState(entry) {
  if (process.platform !== 'win32' || !addonIdPattern.test(entry.id || '')) throw new Error('Không thể kiểm tra trạng thái ứng dụng.');
  const expectedDir = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps', entry.id);
  const executable = entry.outputs?.[0]?.path;
  if (typeof executable !== 'string' || path.dirname(path.resolve(executable)).toLowerCase() !== path.resolve(expectedDir).toLowerCase()) throw new Error('Không xác định được ứng dụng.');
  const exeName = path.basename(executable);
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9 _.-]{0,59}\.exe$/i.test(exeName)) throw new Error('Không xác định được ứng dụng.');
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'profile-state.ps1'), '-AppId', entry.id, '-ExeName', exeName], { windowsHide: true, timeout: 15000 });
  const state = result.stdout.trim(); if (!['installed', 'removed'].includes(state)) throw new Error('Không xác định được ứng dụng.'); return state;
}
async function ensureUninstaller() { try { await stat(uninstaller); } catch { throw new Error('Chưa có trình gỡ đồ họa. Chạy desktop/build-uninstaller.ps1 trước.'); } }
async function upgradeUninstaller(id, language) { await ensureUninstaller(); const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'windows-install.ps1'), '-Action', 'UpgradeUninstaller', '-AppId', id, '-UninstallerPath', uninstaller, '-Language', language === 'en' ? 'en' : 'vi'], { windowsHide: true, timeout: 30000 }); }
async function galleryIcon(pageUrl) {
  const files = await readdir(gallery);
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const recipe = JSON.parse(await readFile(path.join(gallery, file), 'utf8'));
    if (recipe.url === pageUrl) return recipe.icon;
  }
}

const addonIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function addonList() {
  let ids; try { ids = await readdir(addonRoot); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const id of ids.filter((value) => addonIdPattern.test(value))) {
    try { const dir = path.join(addonRoot, id); const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink()) continue; const meta = JSON.parse(await readFile(path.join(dir, 'info.json'), 'utf8')); if (typeof meta.name === 'string') { let manifest; try { const f = path.join(dir, 'extensions', 'selected', 'manifest.json'); const info = await lstat(f); if (info.isFile() && !info.isSymbolicLink() && info.size <= 128000) manifest = JSON.parse(await readFile(f, 'utf8')); } catch { /* An unavailable manifest remains untested. */ } let icon = typeof meta.icon === 'string' && /^data:image\/(png|jpeg|webp|x-icon);base64,[A-Za-z0-9+/]*={0,2}$/.test(meta.icon) && meta.icon.length <= 90050 ? meta.icon : undefined; if (!icon) { try { const folder = path.join(dir, 'extensions', 'selected'); const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8')); icon = await findManifestIcon(folder, manifest); } catch { /* Older addons may not have a usable icon. */ } } result.push({ id, name: meta.name, version: meta.version || '', source: meta.source || 'Thủ công', icon, compatibility: assessAddon(manifest, meta.name) }); } } catch { /* Skip incomplete library entries. */ }
  }
  return result;
}
async function addToLibrary(extension, source) {
  await mkdir(addonRoot, { recursive: true }); const rootInfo = await lstat(addonRoot); if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (await realpath(addonRoot)).toLowerCase() !== path.resolve(addonRoot).toLowerCase()) throw new Error('Thư mục addon không an toàn.');
  const id = randomUUID(); const folder = path.join(addonRoot, id); await mkdir(folder, { recursive: false });
  const info = await writeUnpackedExtension(folder, extension);
  const manifest = JSON.parse(Buffer.from(extension.files.find((file) => file.path.toLowerCase() === 'manifest.json').data, 'base64').toString('utf8'));
  const meta = { name: info.name, version: typeof manifest.version === 'string' ? manifest.version : '', source, icon: extensionIcon(extension, manifest) };
  await writeFile(path.join(folder, 'info.json'), JSON.stringify(meta), { flag: 'wx' }); return { id, ...meta };
}

function appendLog(text) { build.log = (build.log + text).slice(-60000); }
async function createQuick(data) {
  if (process.platform !== 'win32') throw new Error('Tạo nhanh hiện chỉ hỗ trợ Windows.');
  const config = data?.config;
  if (!config || typeof config.name !== 'string' || !config.name.trim() || config.name.length > 100 || /[\u0000-\u001f]/.test(config.name)) throw new Error('Tên ứng dụng không hợp lệ.');
  let page; try { page = new URL(config.url); } catch { throw new Error('Địa chỉ website không hợp lệ.'); }
  if (!['http:', 'https:'].includes(page.protocol)) throw new Error('Chỉ hỗ trợ URL http hoặc https.');
  if (config.icon && !data.selectedIcon && !/^https?:\/\//i.test(config.icon)) throw new Error('URL biểu tượng không hợp lệ.');
  if (config.safeDomain) throw new Error('Tạo nhanh chưa hỗ trợ danh sách tên miền an toàn.');
  validateQuickTray(config);
  const fields = { width:'width', height:'height', minWidth:'min_width', minHeight:'min_height', zoom:'zoom', alwaysOnTop:'always_on_top', incognito:'incognito', enableFind:'enable_find', darkMode:'dark_mode', hideOnClose:'hide_on_close', startToTray:'start_to_tray', newWindow:'new_window', forceInternalNavigation:'force_internal_navigation', maximize:'maximize', fullscreen:'fullscreen', passwordAutosave:'password_autosave', activationShortcut:'activation_shortcut', internalUrlRegex:'internal_url_regex' };
  const allowed = new Set(['name', 'url', 'icon', 'proxyUrl', 'userAgent', 'multiWindow', 'showSystemTray', 'safeDomain', ...Object.keys(fields)]);
  if (Object.keys(config).some((key) => !allowed.has(key))) throw new Error('Cài đặt này chưa được hỗ trợ trong chế độ tạo nhanh.');
  for (const key of ['width', 'height', 'minWidth', 'minHeight', 'zoom']) if (config[key] !== undefined && (!Number.isInteger(config[key]) || config[key] < (key === 'width' || key === 'height' ? 1 : key === 'zoom' ? 50 : 0) || config[key] > (key === 'zoom' ? 200 : 10000))) throw new Error('Kích thước hoặc thu phóng không hợp lệ.');
  for (const key of ['alwaysOnTop', 'incognito', 'enableFind', 'darkMode', 'hideOnClose', 'startToTray', 'newWindow', 'forceInternalNavigation', 'maximize', 'fullscreen', 'passwordAutosave', 'multiWindow', 'showSystemTray']) if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error('Cài đặt không hợp lệ.');
  for (const key of ['activationShortcut', 'internalUrlRegex', 'userAgent', 'proxyUrl']) if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error('Cài đặt không hợp lệ.');
  const injection = data.injection || {}; if (['css', 'js'].some((key) => injection[key] != null && (typeof injection[key] !== 'string' || injection[key].length > 200000))) throw new Error('Mã tùy chỉnh không hợp lệ.');
  if (injection.pictureInPicture !== undefined && typeof injection.pictureInPicture !== 'boolean') throw new Error('Cài đặt Picture-in-Picture không hợp lệ.');
  if (injection.pictureInPicture) injection.js = (await readFile(path.join(directory, 'picture-in-picture.js'), 'utf8')) + '\n' + (injection.js || '');
  const runtime = path.join(root, 'src-tauri', 'target', 'release', 'pake.exe');
  try { await stat(runtime); } catch { throw new Error('Chưa có runtime template. Hãy build runtime trước.'); }
  await ensureUninstaller();
  let id = randomUUID(); let retained = null;
  if (data.reinstallId !== undefined) {
    const candidates = await findReinstallCandidates({ entries: await apps(), url: page.href, appsRoot: path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'), profileRoot: process.env.APPDATA });
    const match = candidates.find((item) => item.id === data.reinstallId && item.state === 'retained');
    if (!match) throw new Error('Không tìm thấy dữ liệu đã giữ hoặc ứng dụng đã được cài lại.');
    id = match.id; retained = match;
  }
  const work = path.join(storage, randomUUID()); const runtimeDir = path.join(work, 'pake-runtime'); await mkdir(runtimeDir, { recursive: true });
  const addonIds = data.addonIds || []; if (!Array.isArray(addonIds) || addonIds.length > 8 || addonIds.some((id) => typeof id !== 'string' || !addonIdPattern.test(id)) || new Set(addonIds).size !== addonIds.length) throw new Error('Danh sách addon không hợp lệ.');
  const available = new Set((await addonList()).map((addon) => addon.id));
  for (const id of addonIds) { if (!available.has(id)) throw new Error('Không tìm thấy addon đã chọn.'); const ext = await readDiscoveredExtension(path.join(addonRoot, id, 'extensions', 'selected')); await writeUnpackedExtension(runtimeDir, ext, `addon-${id}`); }
  if (data.extension && data.archive) throw new Error('Chỉ chọn một file hoặc một thư mục addon riêng.');
  const privateExtension = data.archive ? await readExtensionArchive(data.archive) : data.extension;
  if (privateExtension) await writeUnpackedExtension(runtimeDir, privateExtension);
  const pake = JSON.parse(await readFile(path.join(root, 'src-tauri', 'pake.json'), 'utf8'));
  pake.browser_extensions = Boolean(privateExtension || addonIds.length);
  const window = pake.windows[0]; window.url = retained?.url || page.href; window.url_type = 'web'; window.hide_on_close = false;
  for (const [key, field] of Object.entries(fields)) if (config[key] !== undefined) window[field] = config[key];
  configureQuickTray(pake, config); pake.multi_window = config.multiWindow === true; pake.proxy_url = config.proxyUrl || '';
  if (config.userAgent) pake.user_agent.windows = config.userAgent;
  if (injection.css || injection.js) { const css = injection.css ? `window.addEventListener('DOMContentLoaded',()=>{const css=${JSON.stringify(injection.css)};if(window.__PAKE_INJECT_STYLE__)window.__PAKE_INJECT_STYLE__(css);else{const s=document.createElement('style');s.textContent=css;document.head.appendChild(s)}});` : ''; const js = injection.js ? `window.addEventListener('DOMContentLoaded',()=>{\n${injection.js}\n});` : ''; await writeFile(path.join(runtimeDir, 'custom.js'), css + '\n' + js); }
  const exeName = executableName(config.name.trim()); const executable = path.join(work, exeName);
  await writeFile(path.join(runtimeDir, 'pake.json'), JSON.stringify(pake, null, 2));
  await writeFile(path.join(runtimeDir, 'app.json'), JSON.stringify({ identifier: `com.webappmaker.app${id.replaceAll('-', '')}`, productName: config.name.trim(), executableName: exeName }, null, 2));
  const autoIconUrl = await galleryIcon(page.href);
  const icon = await resolveQuickIcon({ pageUrl: page.href, iconUrl: data.selectedIcon ? undefined : config.icon, autoIconUrl, selectedIcon: data.selectedIcon, name: config.name });
  await writeFile(executable, await setWindowsAppName(await readFile(runtime), config.name, icon.ico));
  await writeFile(path.join(work, 'app.ico'), icon.ico);
  await writeFile(path.join(runtimeDir, 'icon.ico'), icon.ico);
  const helper = path.join(directory, 'windows-install.ps1');
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const install = await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', 'Install', '-AppId', id, '-Source', work, '-Name', config.name.trim(), '-ExeName', exeName, '-UninstallerPath', uninstaller, '-Language', data.language === 'en' ? 'en' : 'vi'], { windowsHide: true, timeout: 30000 });
  const installed = JSON.parse(install.stdout.trim());
  const expected = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps', id);
  if (path.resolve(installed.path).toLowerCase() !== path.resolve(expected).toLowerCase()) throw new Error('Đường dẫn cài đặt không hợp lệ.');
  if (retained && retained.url !== page.href) {
    try { await editQuickUrl({ appsRoot: path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'), profileRoot: process.env.APPDATA, id, url: page.href }); }
    catch (error) { try { await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', 'Remove', '-AppId', id, '-SilentError'], { windowsHide: true, timeout: 30000 }); } catch (cleanup) { throw new Error(`Không hoàn tất cài lại; hãy gỡ app trong Windows: ${cleanup.message}`); } throw error; }
  }
  const entries = (await apps()).filter((item) => item.id !== id); const entry = { id, name: config.name.trim(), url: page.href, kind: 'installed-quick', iconSource: icon.source, extensionConfigured: Boolean(privateExtension || addonIds.length), outputs: [{ path: path.join(expected, exeName), format: 'exe' }], createdAt: new Date().toISOString() }; entries.unshift(entry);
  try { await writeFile(path.join(storage, 'apps.json'), JSON.stringify(entries, null, 2)); }
  catch (error) { try { await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Action', 'Remove', '-AppId', id, '-SilentError'], { windowsHide: true, timeout: 30000 }); } catch (cleanup) { throw new Error(`Không lưu được danh sách; gỡ ứng dụng ${config.name} trong Windows: ${cleanup.message}`); } throw error; }
  return entry;
}
async function startBuild(data) {
  if (['running', 'cancelling', 'finalizing'].includes(build?.status)) throw new Error('Một build khác đang chạy.');
  if (data?.extension || data?.archive || data?.addonIds?.length) throw new Error('Tiện ích thử nghiệm hiện chỉ hỗ trợ tạo app nhanh trên Windows.');
  if (!data || typeof data.config !== 'object' || !data.config || Array.isArray(data.config)) throw new Error('Cấu hình không hợp lệ.');
  const config = { ...data.config };
  const schema = JSON.parse(await readFile(path.join(root, 'schema', 'pake.schema.json'), 'utf8'));
  for (const key of Object.keys(config)) if (!schema.properties[key] || ['inject', 'icon'].includes(key) && typeof config[key] !== 'string') throw new Error('Trường cấu hình không hợp lệ.');
  let parsed; try { parsed = new URL(config.url); } catch { throw new Error('Địa chỉ website không hợp lệ.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || typeof config.name !== 'string' || !config.name.trim()) throw new Error('Hãy nhập tên và URL http hoặc https.');
  if (config.icon && !/^https?:\/\//i.test(config.icon) && !data.selectedIcon) throw new Error('URL biểu tượng không hợp lệ.');
  const icon = data.selectedIcon;
  if (icon && (typeof icon.data !== 'string' || !/^data:image\/(png|jpeg|webp|x-icon|vnd.microsoft.icon|svg\+xml);base64,/i.test(icon.data) || !/\.(png|jpe?g|webp|ico|svg)$/i.test(icon.name || '') || icon.data.length > 1_500_000)) throw new Error('Biểu tượng không hợp lệ.');
  const injection = data.injection || {};
  if (['css', 'js'].some((key) => injection[key] != null && (typeof injection[key] !== 'string' || injection[key].length > 200000))) throw new Error('Mã tùy chỉnh không hợp lệ.');
  if (injection.pictureInPicture !== undefined && typeof injection.pictureInPicture !== 'boolean') throw new Error('Cài đặt Picture-in-Picture không hợp lệ.');
  if (injection.pictureInPicture) injection.js = (await readFile(path.join(directory, 'picture-in-picture.js'), 'utf8')) + '\n' + (injection.js || '');
  const id = randomUUID(); const work = path.join(storage, id); await mkdir(work, { recursive: true });
  if (icon) { const ext = path.extname(icon.name).toLowerCase(); config.icon = path.join(work, `icon${ext}`); await writeFile(config.icon, Buffer.from(icon.data.split(',')[1], 'base64')); }
  const inject = [];
  for (const ext of ['css', 'js']) if (injection[ext]) { const filename = path.join(work, `custom.${ext}`); await writeFile(filename, injection[ext]); inject.push(filename); }
  if (inject.length) config.inject = inject;
  const configPath = path.join(work, 'config.json'); await writeFile(configPath, JSON.stringify(config, null, 2));
  build = { id, status: 'running', log: 'Đang chuẩn bị build…\n', result: null, name: config.name };
  let child;
  try { child = spawn(process.execPath, [path.join(root, 'dist', 'cli.js'), '--config', configPath, '--json'], { cwd: work, windowsHide: true, env: { ...process.env, CI: 'true', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { build.status = 'failed'; appendLog(`\n${error.message}`); throw error; }
  buildChild = child;
  let stdout = ''; child.stdout.on('data', (chunk) => { stdout += chunk.toString(); }); child.stderr.on('data', (chunk) => appendLog(chunk.toString()));
  child.on('error', (error) => { build.status = 'failed'; appendLog(`\n${error.message}`); });
  child.on('close', async (code) => {
    if (buildChild === child) buildChild = null;
    if (build.status === 'cancelling') { build.processClosed = true; if (build.cancelConfirmed) build.status = 'cancelled'; return; }
    build.status = 'finalizing';
    try {
      const result = JSON.parse(stdout); build.result = result;
      if (code !== 0 || !result.ok || !Array.isArray(result.outputs) || result.outputs.length === 0) throw new Error(result.error?.message || `Build thất bại (mã ${code}).`);
      for (const output of result.outputs) { const absolute = path.resolve(output.path); if (!absolute.startsWith(work + path.sep) || !(await stat(absolute)).isFile()) throw new Error('Không xác nhận được file build.'); }
      const entries = await apps(); entries.unshift({ id, name: result.name, url: config.url, outputs: result.outputs, createdAt: new Date().toISOString() }); await writeFile(path.join(storage, 'apps.json'), JSON.stringify(entries, null, 2));
      build.status = 'success';
    } catch (error) { build.status = 'failed'; appendLog(`\n${error.message}`); }
  });
  return build;
}
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'POST') { if (!safeOrigin(request) || !request.headers['content-type']?.startsWith('application/json')) return json(response, 403, { error: 'Yêu cầu không được phép.' }); if (pathname === '/api/build/cancel') { const { id } = await body(request); if (process.platform !== 'win32') return json(response, 400, { error: 'Hủy build hiện chỉ hỗ trợ Windows.' }); if (!build || build.id !== id || build.status !== 'running' || !buildChild || !Number.isInteger(buildChild.pid) || buildChild.exitCode !== null || buildChild.signalCode !== null) return json(response, 409, { error: 'Build không còn chạy hoặc không thể hủy lúc này.' }); const current = build; const child = buildChild; current.status = 'cancelling'; try { const taskkill = path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'); await run(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 30000 }); current.cancelConfirmed = true; if (current.processClosed) current.status = 'cancelled'; appendLog('\nĐã yêu cầu dừng build. File tạm có thể còn trong thư mục build.'); return json(response, 200, { ok: true }); } catch (error) { current.status = current.processClosed ? 'failed' : 'running'; appendLog(`\nKhông xác nhận được việc hủy build: ${error.message}`); return json(response, 500, { error: 'Không thể xác nhận đã dừng toàn bộ tiến trình build. Xem chi tiết trong log.' }); } } if (pathname === '/api/profiles/list') { await body(request); return json(response, 200, { profiles: await listProfiles({ profileRoot: process.env.APPDATA, entries: await apps(), checkState: profileState }) }); } if (pathname === '/api/profiles/delete') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); const { ids } = await body(request); if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some((id) => typeof id !== 'string' || !addonIdPattern.test(id)) || new Set(ids).size !== ids.length) throw new Error('Danh sách profile không hợp lệ.'); preparing = true; try { const entries = await apps(); const results = []; for (const id of ids) { try { await removeRetainedProfile({ profileRoot: process.env.APPDATA, entries, id, checkState: profileState }); results.push({ id, ok: true }); } catch (error) { results.push({ id, ok: false, error: error.message }); } } return json(response, 200, { results }); } finally { preparing = false; } } if (pathname === '/api/reinstall-candidates') { const { url } = await body(request); const candidates = await findReinstallCandidates({ entries: await apps(), url, appsRoot: path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'), profileRoot: process.env.APPDATA }); return json(response, 200, { candidates }); } if (pathname === '/api/addons/inspect') { const data = await body(request); if (Boolean(data.extension) === Boolean(data.archive)) throw new Error('Chọn một file hoặc một thư mục addon.'); const extension = data.archive ? await readExtensionArchive(data.archive) : data.extension; const { manifest } = inspectUnpackedExtension(extension); return json(response, 200, { name: manifest.name, version: manifest.version || '', compatibility: assessAddon(manifest, manifest.name) }); } if (pathname === '/api/addons/delete') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const { id } = await body(request); if (!addonIdPattern.test(id || '') || !(await addonList()).some((addon) => addon.id === id)) return json(response, 404, { error: 'Không tìm thấy addon.' }); await removeLibraryAddon(addonRoot, id); return json(response, 200, { ok: true }); } finally { preparing = false; } } if (pathname === '/api/addons/scan') { const found = await discoverExtensions(process.env.LOCALAPPDATA); discoveredAddons = new Map(found.map((item) => [item.token, item])); return json(response, 200, found.map(({ folder, ...item }) => item)); } if (pathname === '/api/addons/import') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const data = await body(request); if (data.extension && data.archive) throw new Error('Chỉ chọn một file hoặc một thư mục addon.'); let extension = data.archive ? await readExtensionArchive(data.archive) : data.extension; let source = 'Thủ công'; if (data.token) { const item = discoveredAddons.get(data.token); if (!item) throw new Error('Kết quả dò đã hết hạn. Hãy dò lại.'); extension = await readDiscoveredExtension(item.folder); source = `${item.browser} / ${item.profile}`; } return json(response, 201, await addToLibrary(extension, source)); } finally { preparing = false; } } if (pathname === '/api/forget-app') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const { id } = await body(request); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error('Mã ứng dụng không hợp lệ.'); const entries = await apps(); const entry = entries.find((app) => app.id === id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng.' }); const appDir = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps', id); try { await stat(appDir); throw new Error('Ứng dụng vẫn còn trong máy. Hãy gỡ ứng dụng trước.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } const file = path.join(storage, 'apps.json'); const temp = path.join(storage, `apps-${randomUUID()}.tmp`); try { await writeFile(temp, JSON.stringify(entries.filter((app) => app.id !== id), null, 2), { flag: 'wx' }); await rename(temp, file); } finally { await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') console.warn(error); }); } return json(response, 200, { ok: true }); } finally { preparing = false; } } if (pathname === '/api/clean-shortcut') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const { id, language } = await body(request); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error('Mã ứng dụng không hợp lệ.'); const entry = (await apps()).find((app) => app.id === id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng đã cài.' }); await ensureAppClosed(id); await upgradeUninstaller(id, language); const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); const result = await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'windows-install.ps1'), '-Action', 'CleanShortcut', '-AppId', id], { windowsHide: true, timeout: 30000 }); return json(response, 200, { ok: true, ...JSON.parse(result.stdout.trim()) }); } finally { preparing = false; } } if (pathname === '/api/uninstall') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); const { id, language: localStorageLanguage } = await body(request); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return json(response, 400, { error: 'Mã ứng dụng không hợp lệ.' }); const entry = (await apps()).find((app) => app.id === id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng đã cài.' }); await installedExecutable(path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps', id)); await ensureAppClosed(id); await upgradeUninstaller(id, localStorageLanguage); const child = spawn(uninstaller, [id], { detached: true, stdio: 'ignore', windowsHide: false }); await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref(); return json(response, 200, { ok: true }); } if (pathname === '/api/edit-url' || pathname === '/api/edit-icon') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const data = await body(request); const entry = (await apps()).find((app) => app.id === data.id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng đã cài.' }); const appsRoot = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'); await ensureAppClosed(data.id); if (pathname === '/api/edit-url') { const url = await editQuickUrl({ appsRoot, profileRoot: process.env.APPDATA, id: data.id, url: data.url }); return json(response, 200, { ok: true, url }); } const current = await readQuickSettings({ appsRoot, id: data.id }); const icon = await resolveQuickIcon({ pageUrl: current.url, autoIconUrl: await galleryIcon(current.url), selectedIcon: data.selectedIcon, name: entry.name }); await editQuickIcon({ appsRoot, id: data.id, ico: icon.ico }); return json(response, 200, { ok: true, source: icon.source }); } finally { preparing = false; } } if (pathname === '/api/app-addons') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const { id, enabled } = await body(request); const entry = (await apps()).find((app) => app.id === id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng đã cài.' }); const appsRoot = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'); if (enabled === undefined) return json(response, 200, { addons: await listQuickAddons({ appsRoot, id }) }); await ensureAppClosed(id); await setQuickAddons({ appsRoot, id, enabled }); return json(response, 200, { ok: true }); } finally { preparing = false; } } if (pathname === '/api/edit-settings') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const { id, settings } = await body(request); const entry = (await apps()).find((app) => app.id === id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng đã cài.' }); const appsRoot = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'); if (settings === undefined) return json(response, 200, await readQuickSettings({ appsRoot, id })); await ensureAppClosed(id); await editQuickSettings({ appsRoot, id, settings }); return json(response, 200, { ok: true }); } finally { preparing = false; } } if (pathname === '/api/update') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); preparing = true; try { const { id, language } = await body(request); const entry = (await apps()).find((app) => app.id === id && app.kind === 'installed-quick'); if (!entry) return json(response, 404, { error: 'Không tìm thấy ứng dụng đã cài.' }); await ensureAppClosed(id); await ensureUninstaller(); const result = await updateQuickRuntime({ appsRoot: path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'), runtime: path.join(root, 'src-tauri', 'target', 'release', 'pake.exe'), id }); try { await upgradeUninstaller(id, language); } catch (error) { return json(response, 200, { ok: true, ...result, warning: `Đã cập nhật runtime nhưng chưa đổi trình gỡ: ${error.message}` }); } return json(response, 200, { ok: true, ...result }); } finally { preparing = false; } } if (pathname === '/api/open') { if (preparing) return json(response, 409, { error: 'Đang thực hiện thao tác khác.' }); const { id } = await body(request); const entry = (await apps()).find((app) => app.id === id && ['quick', 'installed-quick'].includes(app.kind)); if (!entry || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return json(response, 404, { error: 'Không tìm thấy ứng dụng.' }); const appDir = entry.kind === 'quick' ? path.join(storage, id) : path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps', id); const executable = entry.kind === 'quick' ? path.join(appDir, 'WebApp.exe') : await installedExecutable(appDir); await stat(executable); const child = spawn(executable, [], { cwd: appDir, detached: true, stdio: 'ignore', windowsHide: false }); await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref(); return json(response, 200, { ok: true }); } if (pathname === '/api/quick') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Đang tạo ứng dụng khác.' }); preparing = true; try { return json(response, 201, await createQuick(await body(request))); } finally { preparing = false; } } if (pathname === '/api/build') { if (preparing || ['running', 'cancelling', 'finalizing'].includes(build?.status)) return json(response, 409, { error: 'Một build khác đang chạy.' }); preparing = true; try { return json(response, 202, await startBuild(await body(request))); } finally { preparing = false; } } return json(response, 404, { error: 'Not found' }); }
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    if (pathname === '/api/addons') return json(response, 200, await addonList());
    if (pathname === '/api/build') return json(response, 200, build);
    if (pathname === '/api/environment') return json(response, 200, await environment());
    if (pathname === '/api/app-icon') { if (request.headers.host !== '127.0.0.1:4175') return json(response, 403, { error: 'Yêu cầu không được phép.' }); const id = new URL(request.url, 'http://localhost').searchParams.get('id'); if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) || !(await apps()).some((entry) => entry.id === id && entry.kind === 'installed-quick')) return json(response, 404, { error: 'Không tìm thấy icon.' }); try { const appsRoot = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'); await readQuickSettings({ appsRoot, id }); const iconPath = path.join(appsRoot, id, 'app.ico'); const info = await lstat(iconPath); if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error('Icon không hợp lệ.'); const data = await readFile(iconPath); return response.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(data); } catch { return json(response, 404, { error: 'Không tìm thấy icon.' }); } }
    if (pathname === '/api/apps') { const entries = await apps(); const visible = []; for (const entry of entries) { if (entry.kind === 'installed-quick' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.id)) { const appsRoot = path.join(process.env.LOCALAPPDATA, 'WebAppMaker', 'apps'); const appDir = path.join(appsRoot, entry.id); try { await lstat(appDir); } catch (error) { if (error.code === 'ENOENT') continue; entry.installed = null; visible.push(entry); continue; } try { await installedExecutable(appDir); entry.installed = true; try { entry.url = (await readQuickSettings({ appsRoot, id: entry.id })).url; } catch { /* Preserve the listing if configuration is unavailable. */ } } catch { entry.installed = null; } } visible.push(entry); } return json(response, 200, visible); }
    if (pathname === '/api/gallery') { const names = (await readdir(gallery)).filter((name) => name.endsWith('.json')).sort(); const result = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(gallery, name), 'utf8')))); return json(response, 200, result); }
    const file = files[pathname]; if (!file) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).end(await readFile(path.join(directory, file[0])));
  } catch (error) { json(response, 400, { error: error.message || 'Không thể xử lý yêu cầu.' }); }
});
server.listen(4175, '127.0.0.1', () => console.log('WebAppEz: http://127.0.0.1:4175'));
