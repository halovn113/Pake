import { translateMessage } from './i18n.js';
const alertMessage = (message) => window.alert(translateMessage(message));
const confirmMessage = (message) => window.confirm(translateMessage(message));
const promptMessage = (message, value) => window.prompt(translateMessage(message), value);
const $ = (selector) => document.querySelector(selector);
const categories = { all: 'Tất cả', ai: 'AI', productivity: 'Công việc', social: 'Mạng xã hội', media: 'Giải trí', reading: 'Đọc', developer: 'Lập trình' };
const storageKey = 'pake-studio-drafts-v1';
let recipes = [];
let selectedCategory = 'all';
let editingId = null;
let previousView = 'gallery';
let selectedIcon = null;
const appNavigation = node('button', 'nav', '▣  Ứng dụng của tôi');
appNavigation.dataset.view = 'apps';
document.querySelector('.sidebar nav').append(appNavigation);
const appsView = node('section', 'view');
appsView.id = 'apps-view'; appsView.hidden = true;
appsView.innerHTML = '<div class="page-title"><p class="eyebrow">SẢN PHẨM ĐÃ TẠO</p><h1>Ứng dụng của tôi</h1><p>Các ứng dụng và bộ cài đã tạo.</p></div><div class="launch-toolbar"><label class="search launch-search"><span aria-hidden="true">⌕</span><input id="app-search" type="search" placeholder="Tìm ứng dụng theo tên" aria-label="Tìm ứng dụng theo tên"></label><label class="launch-sort-label">Sắp xếp <select id="app-sort" aria-label="Sắp xếp ứng dụng"><option value="manual">Thủ công</option><option value="name">Tên A–Z</option><option value="recent">Mới nhất</option></select></label><span class="launch-hint" id="app-sort-hint">Kéo thả để sắp xếp</span></div><div id="built-apps" class="launch-grid"></div><p id="apps-empty" class="empty" hidden></p><nav id="app-pages" class="launch-pages" aria-label="Trang ứng dụng"></nav>';
document.querySelector('main').append(appsView);
const addonNavigation = node('button', 'nav', '▧  Addon'); addonNavigation.dataset.view = 'addons'; document.querySelector('.sidebar nav').append(addonNavigation);
const addonsView = node('section', 'view'); addonsView.id = 'addons-view'; addonsView.hidden = true;
addonsView.innerHTML = `<div class="page-title"><h1>Addon</h1><p>Quản lý addon dùng chung. Chỉ nhập addon bạn tin tưởng; addon có thể đọc và thay đổi dữ liệu trang.</p></div><div class="form-card"><div class="addon-actions"><button type="button" class="secondary" id="scan-addons">Dò tìm trong máy</button><label class="secondary addon-file-button">Chọn thư mục<input id="library-files" type="file" webkitdirectory multiple hidden></label><label class="secondary addon-file-button">Chọn file ZIP / CRX<input id="library-archive" type="file" accept=".zip,.crx" hidden></label></div><p class="field-help">Chỉ dò Chrome, Edge và Brave trên Windows. Chọn addon để nhập; dữ liệu đăng nhập không được sao chép. Chỉ dùng ZIP/CRX tin cậy; chữ ký CRX chưa được xác minh.</p><div id="scan-results" class="addon-grid addon-scroll" aria-label="Kết quả dò addon" tabindex="0" hidden></div></div><section class="form-card addon-library-section"><h2>Thư viện addon</h2><p>Các addon đã thêm để dùng khi tạo app.</p><div id="addon-library" class="addon-grid addon-scroll" aria-label="Thư viện addon" tabindex="0"></div></section>`;
document.querySelector('main').append(addonsView);
const profileNavigation = node('button', 'nav', '▤  Dữ liệu ứng dụng'); profileNavigation.dataset.view = 'profiles'; document.querySelector('.sidebar nav').append(profileNavigation);
const profilesView = node('section', 'view'); profilesView.id = 'profiles-view'; profilesView.hidden = true;
profilesView.innerHTML = `<div class="page-title"><h1>Dữ liệu ứng dụng</h1><p>Xem profile còn lưu trên máy. Dữ liệu của app đang dùng và profile chưa xác định không thể xóa ở đây.</p></div><div class="form-card"><div class="profile-toolbar"><button type="button" class="secondary" id="profiles-refresh">Làm mới danh sách</button><button type="button" class="secondary" id="profiles-select-all">Chọn tối đa 30 profile đã gỡ</button><button type="button" class="secondary profile-delete" id="profiles-delete" disabled>Xóa đã chọn</button></div><p class="field-help">Xóa profile sẽ xóa vĩnh viễn dữ liệu và thông tin đăng nhập. Chỉ chọn tối đa 30 profile mỗi lần.</p><p id="profiles-summary" class="profile-summary" aria-live="polite"></p><div id="profiles-list" class="profiles-list" aria-live="polite"></div></div>`;
document.querySelector('main').append(profilesView);


const buildPanel = node('div', 'form-card build-panel');
buildPanel.hidden = true;
buildPanel.innerHTML = '<h2 id="build-status">Đang build</h2><p id="build-description">Quá trình có thể mất vài phút, đặc biệt ở lần đầu.</p><button type="button" class="secondary" id="cancel-build" hidden>Hủy build</button><pre id="build-log" aria-live="polite"></pre>';
document.querySelector('.notice').replaceWith(buildPanel);
const buildButton = node('button', 'primary', 'Tạo ứng dụng');
buildButton.type = 'button'; buildButton.id = 'build-app'; buildButton.textContent = 'Tạo bộ cài'; buildButton.className = 'secondary';
const quickButton = node('button', 'primary', 'Tạo app nhanh');
const createActions = node('div', 'create-actions');
createActions.append(quickButton, buildButton);
document.querySelector('#editor').prepend(createActions);
createActions.after(buildPanel);
quickButton.type = 'button';
quickButton.onclick = async () => { if (!$('#editor').reportValidity()) return; const initialConfig = configFromForm(); if ((initialConfig.hideOnClose || initialConfig.startToTray) && !initialConfig.showSystemTray) { advanced.open = true; const warning = $('#quick-unsupported-warning'); warning.hidden = false; warning.textContent = translateMessage('Hãy bật Biểu tượng khay hệ thống khi dùng Ẩn khi đóng hoặc Khởi động thu nhỏ vào khay.'); warning.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; } const blocked = quickCreationUnsupported(); if (blocked.length) { advanced.open = true; const warning = $('#quick-unsupported-warning'); warning.hidden = false; warning.textContent = translateMessage('Tạo app nhanh chưa hỗ trợ các mục sau:') + ' ' + blocked.map(translateMessage).join(', ') + '. ' + translateMessage('Hãy tắt các mục này để tạo nhanh, hoặc dùng Tạo bộ cài.'); warning.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; } quickButton.disabled = true; let choice; try { choice = await chooseQuickCreation(configFromForm().url); } catch (error) { alertMessage(error.message); quickButton.disabled = false; return; } if (!choice) { quickButton.disabled = false; return; } if (choice.manage) { quickButton.disabled = false; show('apps'); return; } buildPanel.hidden = false; $('#build-status').textContent = 'Đang tạo ứng dụng'; $('#build-description').textContent = 'Đang chuẩn bị icon và đăng ký ứng dụng trong Windows.'; $('#build-log').textContent = ''; try { const response = await fetch('/api/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: localStorage.getItem('webappmaker-language') || 'vi', config: configFromForm(), ...(choice.reinstallId ? { reinstallId: choice.reinstallId } : {}), selectedIcon, addonIds: selectedAddonIds(), extension: await selectedExtension(), archive: await selectedArchive(), injection: { css: $('#inject-css').value, js: $('#inject-js').value, pictureInPicture: $('#editor').elements.namedItem('pictureInPicture').checked } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); $('#build-status').textContent = 'Đã tạo ứng dụng'; $('#build-description').textContent = translateMessage(result.iconSource === 'fallback' ? 'Đã cài ứng dụng với icon chữ cái thay thế; mở từ Start hoặc Ứng dụng của tôi.' : 'Đã cài ứng dụng; mở từ Start hoặc Ứng dụng của tôi.'); if (result.extensionConfigured) $('#build-description').textContent += document.documentElement.lang === 'en' ? ' Add-ons are experimental; verify them because WebView2 may reject installation.' : ' Tiện ích được cấu hình thử nghiệm; hãy tự kiểm tra vì WebView2 có thể từ chối cài.'; $('#build-log').textContent = result.outputs[0].path; } catch (error) { $('#build-status').textContent = 'Không thể tạo ứng dụng'; $('#build-log').textContent = error.message; } finally { quickButton.disabled = false; } };
async function chooseQuickCreation(url) {
  const response = await fetch('/api/reinstall-candidates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể kiểm tra ứng dụng đã tạo.');
  if (!result.candidates.length) return {};
  return await new Promise((resolve) => {
    const dialog = document.createElement('dialog'); dialog.className = 'reinstall-dialog';
    const form = document.createElement('form'); form.method = 'dialog';
    form.append(node('h2', '', 'Ứng dụng cùng website'), node('p', 'reinstall-intro', 'Chọn cách tiếp tục. Cài mới tạo dữ liệu riêng và giữ lại dữ liệu cũ.'));
    const options = node('div', 'reinstall-options');
    function option(value, title, detail) {
      const label = node('label', 'reinstall-option'); const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'creation-choice'; radio.value = value; radio.checked = value === 'new';
      const copy = node('span', 'reinstall-copy'); copy.append(node('strong', '', title)); if (detail) copy.append(node('small', '', detail)); label.append(radio, copy); return label;
    }
    options.append(option('new', 'Cài mới: tạo app và dữ liệu riêng', 'Không thay đổi dữ liệu cũ.'));
    const installed = result.candidates.filter((item) => item.state === 'installed');
    const retained = result.candidates.filter((item) => item.state === 'retained');
    function itemDetail(item) {
      const date = item.createdAt ? new Date(item.createdAt) : null;
      const label = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en' : 'vi', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : translateMessage('Không rõ ngày tạo');
      return `${label} · ID: ${item.id}`;
    }
    for (const item of installed) options.append(option(`installed:${item.id}`, translateMessage('Quản lý app đang cài') + `: ${item.name}`, itemDetail(item)));
    if (retained.length) {
      const group = document.createElement('details'); group.className = 'reinstall-group';
      const summary = document.createElement('summary'); summary.append(node('span', '', 'Cài lại, dùng dữ liệu đã giữ'), node('span', 'reinstall-count', String(retained.length))); group.append(summary);
      const list = node('div', 'reinstall-list'); list.setAttribute('aria-label', translateMessage('Các profile đã giữ')); list.tabIndex = 0;
      for (const item of retained) list.append(option(`retained:${item.id}`, item.name, itemDetail(item)));
      group.append(list); group.addEventListener('toggle', () => { if (!group.open && group.querySelector('input:checked')) options.querySelector('input[value="new"]').checked = true; }); options.append(group);
    }
    form.append(options); const actions = node('div', 'actions'); const cancel = node('button', 'secondary', 'Hủy'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); const proceed = node('button', 'primary', 'Tiếp tục'); proceed.type = 'submit'; actions.append(cancel, proceed); form.append(actions); dialog.append(form); document.body.append(dialog);
    let choice = null; form.onsubmit = (event) => { event.preventDefault(); const selected = form.querySelector('input[name="creation-choice"]:checked'); const [kind, id] = (selected?.value || 'new').split(':'); choice = kind === 'retained' ? { reinstallId: id } : kind === 'installed' ? { manage: true } : {}; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(choice); }, { once: true }); dialog.showModal();
  });
}
const environmentButton = node('button', 'secondary', 'Kiểm tra môi trường');
environmentButton.type = 'button';
document.querySelector('.actions').prepend(environmentButton);
environmentButton.onclick = async () => { buildPanel.hidden = false; $('#build-status').textContent = 'Kiểm tra môi trường'; $('#build-description').textContent = 'Kiểm tra công cụ trên máy.'; try { const response = await fetch('/api/environment'); if (!response.ok) throw new Error('Không thể kiểm tra môi trường.'); const checks = await response.json(); $('#build-log').textContent = checks.map((check) => `${check.ok ? '✓' : '✗'} ${check.label}: ${check.detail}`).join('\n'); } catch (error) { $('#build-log').textContent = error.message; } };
const iconLimit = 1024 * 1024;
const advancedStrings = ['activationShortcut', 'proxyUrl', 'userAgent', 'internalUrlRegex', 'safeDomain'];
const advancedBooleans = ['darkMode', 'hideOnClose', 'showSystemTray', 'startToTray', 'newWindow', 'multiWindow', 'forceInternalNavigation', 'maximize', 'fullscreen', 'passwordAutosave'];
const advancedNumbers = ['minWidth', 'minHeight', 'zoom'];

const originalIconField = document.querySelector('[name="icon"]').closest('label');
const iconField = document.createElement('div');
iconField.className = 'icon-field';
originalIconField.replaceWith(iconField);
let iconReadVersion = 0;
iconField.innerHTML = `<span>Biểu tượng</span><div class="icon-picker"><span class="icon-preview" id="icon-preview">↗</span><span class="icon-info"><strong id="icon-label">Tự động từ website</strong><small id="icon-description">CLI sẽ thử tìm biểu tượng khi build.</small></span><button class="secondary" id="choose-icon" type="button" aria-pressed="false">Chọn từ máy</button><button class="secondary" id="reset-icon" type="button" aria-pressed="true">Tự động</button></div><input id="icon-file" type="file" accept=".png,.jpg,.jpeg,.webp,.ico,.svg" hidden><input name="icon" type="url" placeholder="Hoặc nhập URL biểu tượng" aria-label="URL biểu tượng tùy chỉnh"><small class="field-help">Để trống để tự tìm icon. PNG, JPG, WEBP, ICO hoặc SVG; tối đa 1 MB.</small>`;
const advanced = document.createElement('details');
advanced.className = 'form-card advanced';
advanced.innerHTML = `<summary><span><strong>Cài đặt nâng cao</strong><small>Khởi động, điều hướng và cấu hình website</small></span></summary><div class="advanced-content"><div class="size-fields"><label>Độ rộng tối thiểu<input name="minWidth" type="number" min="0" placeholder="0" /></label><label>Độ cao tối thiểu<input name="minHeight" type="number" min="0" placeholder="0" /></label><label>Thu phóng ban đầu (%)<input name="zoom" type="number" min="50" max="200" step="1" placeholder="100" /></label></div><div class="advanced-toggles"></div><div class="fields advanced-fields"><label>Phím tắt toàn hệ thống<input name="activationShortcut" placeholder="Alt+Space" /></label><label>Proxy<input name="proxyUrl" placeholder="http://127.0.0.1:7890" /></label><label>User agent<input name="userAgent" placeholder="Mặc định của ứng dụng" /></label><label>Biểu thức URL nội bộ<input name="internalUrlRegex" placeholder="Regex cho các liên kết mở trong app" /></label><label>Tên miền an toàn<input name="safeDomain" placeholder="example.com, login.example.com" /></label></div><p class="field-help">CSS/JavaScript tùy chỉnh và chạy cùng Windows chưa được kết nối trong bản xem trước.</p></div>`;
advanced.querySelector('.advanced-content > .field-help').remove();
const injectionFields = document.createElement('div');
injectionFields.className = 'fields advanced-fields';
injectionFields.innerHTML = `<label>CSS tùy chỉnh<textarea id="inject-css" rows="5" placeholder="/* CSS được chèn vào trang */"></textarea></label><label>JavaScript tùy chỉnh<textarea id="inject-js" rows="5" placeholder="// JavaScript được chèn vào trang"></textarea></label><small class="field-help">Khi xuất cấu hình, các đoạn mã sẽ được tải thành tệp riêng. Chỉ dùng mã bạn tin tưởng.</small><small class="field-help">Chạy cùng Windows chưa được kết nối trong bản xem trước.</small>`;
advanced.querySelector('.advanced-content').append(injectionFields);
const quickWarning = node('p', 'quick-unsupported-warning'); quickWarning.id = 'quick-unsupported-warning'; quickWarning.hidden = true; quickWarning.setAttribute('role', 'alert'); advanced.querySelector('.advanced-content').prepend(quickWarning);
const extensionField = document.createElement('div');
extensionField.className = 'fields advanced-fields';
extensionField.innerHTML = `<label class="toggle"><span><strong>Sử dụng addon</strong><small>Chọn từ thư viện hoặc thêm riêng cho app này.</small></span><input id="use-addons" type="checkbox" /></label><div id="addon-options" class="addon-options" hidden><div id="addon-choices" class="addon-choice-list" role="group" aria-label="Chọn addon từ thư viện" tabindex="0"></div><label>Thư mục addon riêng cho app này<input id="extension-files" type="file" webkitdirectory multiple /></label><label>Hoặc file addon ZIP / CRX riêng<input id="extension-archive" type="file" accept=".zip,.crx" /></label><div id="private-addon-status" aria-live="polite"></div><small class="field-help">Chọn addon tin cậy dạng ZIP, CRX hoặc thư mục có manifest.json. Addon có thể đọc và thay đổi dữ liệu trang; chữ ký CRX chưa được xác minh. Tối đa 8 MB; chỉ hỗ trợ tạo app nhanh trên Windows.</small></div>`;
advanced.querySelector('.advanced-content').append(extensionField);
const addonToggle = extensionField.querySelector('#use-addons');
const addonOptions = extensionField.querySelector('#addon-options');
addonToggle.addEventListener('change', () => { addonOptions.hidden = !addonToggle.checked; });
async function readExtensionFiles(input) {
  const files = Array.from(input.files);
  if (!files.length) return undefined;
  if (files.length > 2500 || files.reduce((sum, file) => sum + file.size, 0) > 8000000) throw new Error('Tiện ích vượt giới hạn 2500 file hoặc 8 MB.');
  const result = [];
  for (const file of files) { const parts = file.webkitRelativePath.split('/'); if (parts.length < 2) throw new Error('Không thể đọc cấu trúc thư mục tiện ích.'); const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Không thể đọc file tiện ích.')); reader.readAsDataURL(file); }); result.push({ path: parts.slice(1).join('/'), data }); }
  return { files: result };
}


async function readAddonArchive(input) { const file = input.files[0]; if (!file) return undefined; if (!/\.(zip|crx)$/i.test(file.name) || file.size > 8000000) throw new Error('Chọn file ZIP hoặc CRX tối đa 8 MB.'); const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Không thể đọc file addon.')); reader.readAsDataURL(file); }); return { name: file.name, data }; }
async function selectedExtension() { if ($('#use-addons').checked && $('#extension-files').files.length && $('#extension-archive').files.length) throw new Error('Chỉ chọn một file hoặc một thư mục addon riêng.'); return $('#use-addons').checked ? readExtensionFiles($('#extension-files')) : undefined; }
async function selectedArchive() { return $('#use-addons').checked ? readAddonArchive($('#extension-archive')) : undefined; }
function selectedAddonIds() { return $('#use-addons').checked ? Array.from(document.querySelectorAll('#addon-choices input:checked')).map((input) => input.value) : []; }
function addonCompatibilityBadge(addon) { const risk = addon.compatibility?.status === 'risk'; const badge = node('span', risk ? 'addon-badge addon-risk' : 'addon-badge', risk ? 'Có thể không tương thích' : 'Chưa kiểm tra tương thích'); badge.title = translateMessage(addon.compatibility?.reason || 'Chưa kiểm tra hoạt động.'); if (risk) { const wrapper = node('span', 'addon-compatibility'); wrapper.append(badge, node('small', 'addon-risk-reason', translateMessage(addon.compatibility.reason))); return wrapper; } return badge; }
let privateInspectionVersion = 0;
async function inspectPrivateAddon() {
  const version = ++privateInspectionVersion; const status = $('#private-addon-status'); status.replaceChildren();
  const folder = $('#extension-files'); const archive = $('#extension-archive');
  if (!folder.files.length && !archive.files.length) return;
  if (folder.files.length && archive.files.length) { status.textContent = 'Chỉ chọn một file hoặc một thư mục addon riêng.'; return; }
  status.textContent = 'Đang kiểm tra thông tin addon…';
  try {
    const data = folder.files.length ? { extension: await readExtensionFiles(folder) } : { archive: await readAddonArchive(archive) };
    const response = await fetch('/api/addons/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể kiểm tra addon.');
    if (version !== privateInspectionVersion) return;
    status.replaceChildren(node('strong', '', `${result.name}${result.version ? ` (${result.version})` : ''} `), addonCompatibilityBadge(result));
  } catch (error) { if (version === privateInspectionVersion) status.textContent = error.message; }
}
extensionField.querySelector('#extension-files').addEventListener('change', inspectPrivateAddon);
extensionField.querySelector('#extension-archive').addEventListener('change', inspectPrivateAddon);
async function renderAddonChoices(selected = []) { const root = $('#addon-choices'); root.replaceChildren(); try { const response = await fetch('/api/addons'); if (!response.ok) throw new Error('Không tải được thư viện addon.'); const addons = await response.json(); if (!addons.length) root.append(node('p', 'addon-empty', 'Chưa có addon trong thư viện.')); for (const addon of addons) { const label = node('label', 'addon-choice'); const check = document.createElement('input'); check.type = 'checkbox'; check.value = addon.id; check.checked = selected.includes(addon.id); const copy = node('span', 'addon-choice-copy'); copy.append(node('strong', '', addon.name), node('small', '', addon.version || ''), addonCompatibilityBadge(addon)); label.append(check, icon(addon.icon, addon.name), copy); root.append(label); } } catch (error) { root.append(node('p', 'field-help', error.message)); } }
async function renderAddonLibrary() { const root = $('#addon-library'); root.replaceChildren(); try { const response = await fetch('/api/addons'); if (!response.ok) throw new Error('Không tải được thư viện addon.'); const addons = await response.json(); if (!addons.length) root.append(node('p', 'empty', 'Chưa có addon nào.')); for (const addon of addons) { const row = node('article', 'addon-card'); const head = node('div', 'addon-card-head'); const copy = node('div', 'addon-card-copy'); copy.append(node('strong', '', addon.name), node('small', '', addon.version || '')); head.append(icon(addon.icon, addon.name), copy); const remove = node('button', 'secondary addon-remove', 'Xóa'); remove.type = 'button'; remove.setAttribute('aria-label', translateMessage(`Xóa addon ${addon.name}`)); remove.onclick = async () => { if (!confirmMessage(`Xóa “${addon.name}” khỏi thư viện addon? Các app đã tạo vẫn giữ bản sao riêng.`)) return; remove.disabled = true; try { const response = await fetch('/api/addons/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: addon.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await renderAddonLibrary(); } catch (error) { alertMessage(error.message); remove.disabled = false; } }; row.append(head, node('small', 'addon-card-source', addon.source), addonCompatibilityBadge(addon), remove); root.append(row); } } catch (error) { root.append(node('p', 'empty', error.message)); } }
async function importAddon(data) { const response = await fetch('/api/addons/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await renderAddonLibrary(); return result; }
$('#library-files').onchange = async (event) => { try { const extension = await readExtensionFiles(event.target); if (extension) { await importAddon({ extension }); alertMessage('Đã thêm addon vào thư viện.'); } } catch (error) { alertMessage(error.message); } finally { event.target.value = ''; } };
$('#library-archive').onchange = async (event) => { try { const archive = await readAddonArchive(event.target); if (archive) { await importAddon({ archive }); alertMessage('Đã thêm addon vào thư viện.'); } } catch (error) { alertMessage(error.message); } finally { event.target.value = ''; } };
$('#scan-addons').onclick = async () => { const root = $('#scan-results'); root.hidden = false; root.replaceChildren(node('p', 'addon-empty', 'Đang dò…')); try { const response = await fetch('/api/addons/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const items = await response.json(); if (!response.ok) throw new Error(items.error); root.replaceChildren(); if (!items.length) root.append(node('p', 'field-help', 'Không tìm thấy addon có thể nhập.')); for (const item of items) { const row = node('article', 'addon-card'); const head = node('div', 'addon-card-head'); const copy = node('div', 'addon-card-copy'); copy.append(node('strong', '', item.name), node('small', '', item.version)); head.append(icon(item.icon, item.name), copy); const button = node('button', 'secondary', 'Nhập'); button.type = 'button'; button.onclick = async () => { button.disabled = true; try { await importAddon({ token: item.token }); button.textContent = 'Đã nhập'; } catch (error) { alertMessage(error.message); button.disabled = false; } }; row.append(head, node('small', 'addon-card-source', `${item.browser} / ${item.profile}`), addonCompatibilityBadge(item), button); root.append(row); } } catch (error) { root.replaceChildren(node('p', 'field-help', error.message)); } };

document.querySelector('.actions').before(advanced);
const toggles = [['darkMode','Giao diện tối','Dùng chế độ tối cho cửa sổ.'],['hideOnClose','Ẩn khi đóng cửa sổ','Ứng dụng tiếp tục chạy; nên bật biểu tượng khay.'],['showSystemTray','Biểu tượng khay hệ thống','Hiển thị biểu tượng trong khay.'],['startToTray','Khởi động thu nhỏ vào khay','Nên bật biểu tượng khay hệ thống.'],['newWindow','Cho phép cửa sổ mới','Dùng cho một số cửa sổ đăng nhập và liên kết.'],['multiWindow','Nhiều cửa sổ','Cho phép mở nhiều cửa sổ trong một phiên.'],['forceInternalNavigation','Mở liên kết trong ứng dụng','Giữ mọi liên kết trong cửa sổ ứng dụng.'],['maximize','Mở cửa sổ phóng to','Khởi động với cửa sổ được phóng to.'],['fullscreen','Mở toàn màn hình','Khởi động ở chế độ toàn màn hình.'],['pictureInPicture','Picture-in-Picture','Hiện nút PiP cho video được hỗ trợ.'],['passwordAutosave','Lưu mật khẩu (Windows)','Bật gợi ý lưu mật khẩu của WebView2; không áp dụng trong chế độ riêng tư.']];
for (const [name, title, description] of toggles) { const label = document.createElement('label'); label.className = 'toggle'; const copy = document.createElement('span'); copy.append(node('strong', '', title), node('small', '', description)); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = name; label.append(copy, checkbox); advanced.querySelector('.advanced-toggles').append(label); }

let profileSequence = 0;
function formatProfileSize(bytes) { if (!Number.isFinite(bytes)) return translateMessage('Không rõ dung lượng'); const units = ['B', 'KB', 'MB', 'GB', 'TB']; let amount = bytes; let i = 0; while (amount >= 1024 && i < units.length - 1) { amount /= 1024; i++; } return `${amount.toFixed(i ? 1 : 0)} ${units[i]}`; }
function updateProfileSelection() { const count = document.querySelectorAll('#profiles-list input:checked').length; const button = $('#profiles-delete'); button.disabled = count === 0; button.textContent = count ? `${translateMessage('Xóa đã chọn')} (${count})` : 'Xóa đã chọn'; }
async function renderProfiles() {
  const sequence = ++profileSequence; const root = $('#profiles-list'); root.replaceChildren(node('p', 'field-help', 'Đang kiểm tra dữ liệu…')); $('#profiles-delete').disabled = true; $('#profiles-select-all').disabled = true; $('#profiles-summary').textContent = '';
  try {
    const response = await fetch('/api/profiles/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); if (sequence !== profileSequence) return;
    root.replaceChildren(); if (!result.profiles.length) root.append(node('p', 'empty', 'Không tìm thấy profile nào.'));
    const eligible = result.profiles.filter((profile) => profile.state === 'removed').length;
    const protectedCount = result.profiles.length - eligible;
    $('#profiles-summary').textContent = document.documentElement.lang === 'en' ? `${eligible} available for deletion · ${protectedCount} protected` : `${eligible} profile có thể chọn xóa · ${protectedCount} profile được bảo vệ`;
    $('#profiles-select-all').disabled = eligible === 0;
    const order = { removed: 0, installed: 1, unknown: 2 };
    for (const profile of [...result.profiles].sort((a, b) => (order[a.state] ?? 2) - (order[b.state] ?? 2))) {
      const row = node('label', `profile-row${profile.state === 'removed' ? ' profile-selectable' : ' profile-protected'}`); const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = profile.state !== 'removed'; check.value = profile.id || ''; check.setAttribute('aria-label', `${translateMessage('Chọn profile')}: ${profile.name || profile.path}`); check.addEventListener('change', updateProfileSelection);
      const content = node('div', 'profile-copy'); const title = node('strong', '', profile.name || translateMessage('Profile chưa xác định')); const badge = node('span', `profile-state profile-${profile.state}`, profile.state === 'removed' ? 'App đã gỡ' : profile.state === 'installed' ? 'Đang dùng' : 'Chưa xác định'); const heading = node('div', 'profile-heading'); heading.append(title, badge); content.append(heading);
      if (profile.url) content.append(node('small', '', profile.url));
      if (profile.state === 'unknown') content.append(node('small', 'profile-reason', 'Không xác định được app hoặc trạng thái; profile được bảo vệ.'));
      else if (profile.state === 'installed') content.append(node('small', 'profile-reason', 'App vẫn được cài hoặc đang chạy; profile được bảo vệ.'));
      const date = profile.createdAt ? new Date(profile.createdAt) : null; const time = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en' : 'vi', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : translateMessage('Không rõ ngày tạo');
      content.append(node('small', '', `${time} · ${formatProfileSize(profile.size)}`), node('small', 'profile-path', profile.path)); row.append(check, content); root.append(row);
    }
    updateProfileSelection();
  } catch (error) { if (sequence === profileSequence) root.replaceChildren(node('p', 'field-help', error.message)); }
}
$('#profiles-refresh').onclick = renderProfiles;
$('#profiles-select-all').onclick = () => { const boxes = [...document.querySelectorAll('#profiles-list input:not(:disabled)')]; boxes.forEach((box, index) => { box.checked = index < 30; }); updateProfileSelection(); boxes[0]?.closest('.profile-row')?.scrollIntoView({ block: 'nearest' }); };
$('#profiles-delete').onclick = async () => {
  const selected = [...document.querySelectorAll('#profiles-list input:checked')].map((item) => item.value); if (!selected.length) return;
  if (selected.length > 30) { alertMessage('Chỉ chọn tối đa 30 profile mỗi lần.'); return; }
  const warning = document.documentElement.lang === 'en' ? `Permanently delete ${selected.length} selected profiles and their sign-in data? This cannot be undone.` : `Xóa vĩnh viễn ${selected.length} profile đã chọn cùng thông tin đăng nhập? Không thể hoàn tác.`;
  if (!confirmMessage(warning)) return;
  const button = $('#profiles-delete'); button.disabled = true;
  try { const response = await fetch('/api/profiles/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); const failed = result.results.filter((item) => !item.ok); const done = result.results.length - failed.length; alertMessage(document.documentElement.lang === 'en' ? `Deleted: ${done}. Failed: ${failed.length}.${failed.length ? '\n' + failed.map((item) => `${item.id}: ${translateMessage(item.error)}`).join('\n') : ''}` : `Đã xóa: ${done}. Không xóa được: ${failed.length}.${failed.length ? '\n' + failed.map((item) => `${item.id}: ${translateMessage(item.error)}`).join('\n') : ''}`); await renderProfiles(); } catch (error) { alertMessage(error.message); updateProfileSelection(); }
};

function readDrafts() {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function saveDrafts(value) { localStorage.setItem(storageKey, JSON.stringify(value)); }
function node(tag, className, content) { const element = document.createElement(tag); if (className) element.className = className; if (content != null) element.textContent = content; return element; }
function icon(url, name) { const box = node('span', 'app-icon', name?.slice(0, 1).toUpperCase() || '↗'); if (url) { const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = url; img.onerror = () => img.remove(); box.append(img); } return box; }
function show(view) {
  for (const name of ['gallery', 'drafts', 'editor', 'apps', 'addons', 'profiles']) $(`#${name}-view`).hidden = name !== view;
  document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb').textContent = view === 'gallery' ? 'KHÁM PHÁ' : view === 'drafts' ? 'BẢN NHÁP' : view === 'apps' ? 'ỨNG DỤNG CỦA TÔI' : view === 'addons' ? 'ADDON' : view === 'profiles' ? 'DỮ LIỆU ỨNG DỤNG' : 'CẤU HÌNH';
  if (view === 'drafts') renderDrafts();
  if (view === 'apps') renderApps();
  if (view === 'addons') renderAddonLibrary();
  if (view === 'profiles') renderProfiles();
  window.scrollTo(0, 0);
}
window.addEventListener('focus', () => { if (!appsView.hidden) renderApps(); });
function renderCategories() { const root = $('#categories'); root.replaceChildren(); for (const [id, label] of Object.entries(categories)) { const button = node('button', `chip${id === selectedCategory ? ' selected' : ''}`, label); button.type = 'button'; button.setAttribute('aria-pressed', String(id === selectedCategory)); button.onclick = () => { selectedCategory = id; renderCategories(); renderGallery(); }; root.append(button); } }
function renderGallery() {
  const root = $('#gallery'); root.replaceChildren(); const search = $('#search').value.trim().toLowerCase();
  const shown = recipes.filter((app) => (selectedCategory === 'all' || app.category === selectedCategory) && `${app.name.en} ${app.description.en} ${app.url}`.toLowerCase().includes(search));
  for (const app of shown) { const card = node('button', 'app-card'); card.type = 'button'; card.append(icon(app.icon, app.name.en)); const body = node('span', 'app-copy'); body.append(node('strong', '', app.name.en), node('small', '', app.description.en)); card.append(body, node('span', 'card-arrow', '↗')); card.onclick = () => openEditor({ name: app.name.en, url: app.url }); root.append(card); }
  $('#gallery-empty').hidden = shown.length > 0;
}
function renderDrafts() { const drafts = readDrafts(); $('#draft-count').textContent = drafts.length; const root = $('#draft-list'); root.replaceChildren(); $('#drafts-empty').hidden = drafts.length > 0; for (const draft of drafts) { const row = node('div', 'draft-row'); row.append(icon(draft.selectedIcon?.data || draft.config.icon, draft.config.name)); const body = node('div', 'app-copy'); body.append(node('strong', '', draft.config.name), node('small', '', draft.config.url)); const edit = node('button', 'secondary', 'Chỉnh sửa'); edit.onclick = () => openEditor(draft.config, draft.id, 'drafts', draft.selectedIcon, draft.injection); const remove = node('button', 'text-button', 'Xóa'); remove.onclick = () => { if (confirmMessage(`Xóa bản nháp “${draft.config.name}”?`)) { saveDrafts(readDrafts().filter((item) => item.id !== draft.id)); renderDrafts(); } }; row.append(body, edit, remove); root.append(row); } }
function openEditor(config = {}, id = null, from = 'gallery', savedIcon = null, injection = {}) { renderAddonChoices(injection?.addonIds || []); editingId = id; previousView = from; iconReadVersion++; selectedIcon = savedIcon; const form = $('#editor'); form.reset(); $('#quick-unsupported-warning').hidden = true; privateInspectionVersion++; $('#private-addon-status').replaceChildren(); $('#use-addons').checked = Boolean(injection?.useAddons); addonOptions.hidden = !$('#use-addons').checked; $('#inject-css').value = injection?.css || ''; $('#inject-js').value = injection?.js || ''; form.elements.namedItem('pictureInPicture').checked = injection?.pictureInPicture === true; for (const [key, value] of Object.entries({ width: 1200, height: 780, ...config })) { const field = form.elements.namedItem(key); if (!field || (key === 'icon' && savedIcon)) continue; if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = value; } updateIconPreview(); $('#editor-title').textContent = id ? 'Chỉnh sửa bản nháp' : 'Tạo ứng dụng'; show('editor'); }
function quickCreationUnsupported() {
  const form = $('#editor'); const options = [];
  const unsupported = options.filter(([name]) => form.elements.namedItem(name).checked).map(([, label]) => label);
  if (form.elements.namedItem('safeDomain').value.trim()) unsupported.push('Tên miền an toàn');
  return unsupported;
}
$('#editor').addEventListener('input', () => { const warning = $('#quick-unsupported-warning'); if (!warning || warning.hidden) return; const cfg = configFromForm(); const missingTray = (cfg.hideOnClose || cfg.startToTray) && !cfg.showSystemTray; const blocked = quickCreationUnsupported(); warning.hidden = !missingTray && !blocked.length; if (missingTray) warning.textContent = translateMessage('Hãy bật Biểu tượng khay hệ thống khi dùng Ẩn khi đóng hoặc Khởi động thu nhỏ vào khay.'); else if (blocked.length) warning.textContent = translateMessage('Tạo app nhanh chưa hỗ trợ các mục sau:') + ' ' + blocked.map(translateMessage).join(', ') + '. ' + translateMessage('Hãy tắt các mục này để tạo nhanh, hoặc dùng Tạo bộ cài.'); });
function configFromForm() { const form = $('#editor'); const result = {}; for (const name of ['name', 'url', 'icon', ...advancedStrings]) { const value = form.elements.namedItem(name).value.trim(); if (value) result[name] = value; } for (const name of ['width', 'height', ...advancedNumbers]) { const value = form.elements.namedItem(name).value; if (value !== '') result[name] = Number(value); } for (const name of ['alwaysOnTop', 'incognito', 'enableFind', ...advancedBooleans]) if (form.elements.namedItem(name).checked) result[name] = true; if (selectedIcon) result.icon = selectedIcon.name; return result; }
function updateIconPreview() { const preview = $('#icon-preview'); preview.replaceChildren(); const image = document.createElement('img'); const url = $('#editor').elements.namedItem('icon').value.trim(); let source = selectedIcon?.data || url; let fallbackSource; if (!source) { try { const page = new URL($('#editor').elements.namedItem('url').value); if (['http:', 'https:'].includes(page.protocol)) { fallbackSource = `${page.origin}/favicon.ico`; source = recipes.find((recipe) => recipe.url === page.href)?.icon || fallbackSource; } } catch { /* No preview until the URL is valid. */ } } if (source) { image.alt = ''; image.referrerPolicy = 'no-referrer'; image.onerror = () => { if (fallbackSource && image.src !== fallbackSource) { image.src = fallbackSource; fallbackSource = null; return; } if (image.parentNode === preview) { image.remove(); preview.textContent = ($('#editor').elements.namedItem('name').value.trim().match(/[a-z0-9]/i)?.[0] || 'W').toUpperCase(); } }; image.src = source; preview.append(image); } else preview.textContent = '↗'; $('#choose-icon').setAttribute('aria-pressed', String(Boolean(selectedIcon))); $('#reset-icon').setAttribute('aria-pressed', String(!selectedIcon && !url)); $('#icon-label').textContent = selectedIcon ? selectedIcon.name : url ? 'URL tùy chỉnh' : 'Tự động từ website'; $('#icon-description').textContent = selectedIcon ? 'Ảnh được lưu cùng bản nháp trên trình duyệt.' : url ? 'Sử dụng biểu tượng từ URL này.' : 'Tự lấy favicon hoặc dùng icon chữ cái nếu không tìm được.'; }
$('#choose-icon').onclick = () => $('#icon-file').click();
$('#reset-icon').onclick = () => { iconReadVersion++; selectedIcon = null; $('#icon-file').value = ''; $('#editor').elements.namedItem('icon').value = ''; updateIconPreview(); };
$('#editor').elements.namedItem('icon').oninput = () => { iconReadVersion++; selectedIcon = null; $('#icon-file').value = ''; updateIconPreview(); };
$('#editor').elements.namedItem('url').oninput = updateIconPreview;
$('#icon-file').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; if (!/\.(png|jpe?g|webp|ico|svg)$/i.test(file.name) || file.size > iconLimit) { alertMessage('Vui lòng chọn PNG, JPG, WEBP, ICO hoặc SVG có kích thước tối đa 1 MB.'); event.target.value = ''; return; } const version = ++iconReadVersion; const reader = new FileReader(); reader.onload = () => { if (version !== iconReadVersion) return; selectedIcon = { name: file.name.replace(/[^a-zA-Z0-9._-]/g, '_'), data: reader.result }; $('#editor').elements.namedItem('icon').value = ''; updateIconPreview(); }; reader.onerror = () => alertMessage('Không thể đọc tệp biểu tượng.'); reader.readAsDataURL(file); };
document.querySelectorAll('.nav').forEach((button) => button.onclick = () => show(button.dataset.view));
$('#back').onclick = () => show(previousView);
$('#search').oninput = renderGallery;
$('#url-form').onsubmit = (event) => { event.preventDefault(); const url = $('#url-input').value.trim(); const parsed = new URL(url); openEditor({ url, name: parsed.hostname.replace(/^www\./, '').split('.')[0] }); };
$('#editor').onsubmit = (event) => { event.preventDefault(); const config = configFromForm(); const drafts = readDrafts(); const id = editingId || crypto.randomUUID(); const index = drafts.findIndex((item) => item.id === id); const draft = { id, config, selectedIcon, injection: { css: $('#inject-css').value, js: $('#inject-js').value, pictureInPicture: $('#editor').elements.namedItem('pictureInPicture').checked, useAddons: $('#use-addons').checked, addonIds: selectedAddonIds() } }; if ($('#extension-files').files.length || $('#extension-archive').files.length) alertMessage('Addon riêng từ máy không lưu trong bản nháp; hãy chọn lại khi tạo app.'); if (index < 0) drafts.push(draft); else drafts[index] = draft; try { saveDrafts(drafts); show('drafts'); } catch { alertMessage('Không thể lưu bản nháp. Bộ nhớ trình duyệt có thể đã đầy.'); } };
function download(blob, name) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
$('#export').onclick = async () => { if (!$('#editor').reportValidity()) return; if ($('#use-addons').checked && ($('#extension-files').files.length || $('#extension-archive').files.length || selectedAddonIds().length)) { alertMessage('Tiện ích thử nghiệm không được xuất cùng cấu hình.'); return; } const config = configFromForm(); const css = $('#inject-css').value; let js = $('#inject-js').value; if ($('#editor').elements.namedItem('pictureInPicture').checked) { const response = await fetch('/picture-in-picture.js'); if (!response.ok) { alertMessage('Không thể tải mã Picture-in-Picture.'); return; } js = (await response.text()) + '\n' + js; } if (selectedIcon || css || js) alertMessage('Hãy lưu tất cả tệp tải về trong cùng một thư mục, sau đó chạy lệnh pake từ thư mục đó. Trình duyệt có thể yêu cầu cho phép tải nhiều tệp.'); if (selectedIcon) { const iconData = await fetch(selectedIcon.data).then((response) => response.blob()); download(iconData, selectedIcon.name); } const inject = []; if (css) { inject.push('pake-custom.css'); download(new Blob([css], { type: 'text/css' }), 'pake-custom.css'); } if (js) { inject.push('pake-custom.js'); download(new Blob([js], { type: 'text/javascript' }), 'pake-custom.js'); } if (inject.length) config.inject = inject; download(new Blob([JSON.stringify(config, null, 2) + '\n'], { type: 'application/json' }), 'pake-config.json'); };
const appOrderKey = 'webappmaker-app-order-v1';
const appPageSize = 18;
let appEntries = []; let appPage = 0; let draggedApp = null; let appFetchSequence = 0;
const appSortKey = 'webappmaker-app-sort-v1';
try { const saved = localStorage.getItem(appSortKey); if (['manual', 'name', 'recent'].includes(saved)) $('#app-sort').value = saved; } catch { /* Sorting still works for this session. */ }
function storedAppOrder() { try { const value = JSON.parse(localStorage.getItem(appOrderKey) || '[]'); return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []; } catch { return []; } }
function orderedApps() { const order = new Map(storedAppOrder().map((id, index) => [id, index])); const manual = (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER); const mode = $('#app-sort').value; return [...appEntries].sort((a, b) => mode === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || manual(a, b) : mode === 'recent' ? (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || manual(a, b) : manual(a, b)); }
function moveApp(id, target, after = false) { const ordered = orderedApps(); const index = ordered.findIndex((app) => app.id === id); if (index < 0 || id === target) return; const [item] = ordered.splice(index, 1); const destination = target === null ? ordered.length : ordered.findIndex((app) => app.id === target); if (destination < 0) return; ordered.splice(destination + (after ? 1 : 0), 0, item); try { localStorage.setItem(appOrderKey, JSON.stringify(ordered.map((app) => app.id))); } catch { alertMessage('Không thể lưu thứ tự ứng dụng trong trình duyệt.'); } drawApps(); }
async function renderApps() { const sequence = ++appFetchSequence; try { const response = await fetch('/api/apps'); if (!response.ok) throw new Error('Không thể tải danh sách.'); const entries = await response.json(); if (sequence !== appFetchSequence) return; appEntries = entries; drawApps(); } catch (error) { if (sequence !== appFetchSequence) return; $('#built-apps').replaceChildren(); $('#apps-empty').hidden = false; $('#apps-empty').textContent = error.message; } }
function drawApps() {
  const root = $('#built-apps'); root.replaceChildren(); const manual = $('#app-sort').value === 'manual'; $('#app-sort-hint').textContent = manual ? 'Kéo thả để sắp xếp' : 'Chọn Thủ công để kéo thả'; const query = $('#app-search').value.trim().toLocaleLowerCase(); const all = orderedApps(); const entries = all.filter((app) => app.name.toLocaleLowerCase().includes(query)); const pages = Math.max(1, Math.ceil(entries.length / appPageSize)); appPage = Math.min(appPage, pages - 1);
  const empty = $('#apps-empty'); empty.hidden = entries.length > 0; empty.textContent = query ? 'Không tìm thấy ứng dụng phù hợp.' : 'Chưa có ứng dụng hoặc bộ cài nào.';
  for (const app of entries.slice(appPage * appPageSize, (appPage + 1) * appPageSize)) {
    const row = node('article', 'launch-card'); row.draggable = !query && manual; row.dataset.appId = app.id;
    row.ondragstart = (event) => { if (query) return; draggedApp = app.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', app.id); row.classList.add('dragging'); };
    row.ondragend = () => { draggedApp = null; row.classList.remove('dragging'); };
    row.ondragover = (event) => { if (draggedApp && draggedApp !== app.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } };
    row.ondrop = (event) => { event.preventDefault(); if (draggedApp) moveApp(draggedApp, app.id, event.clientX > row.getBoundingClientRect().left + row.offsetWidth / 2); draggedApp = null; };
    const canOpen = app.kind === 'quick' || (app.kind === 'installed-quick' && app.installed === true);
    const tile = node('button', 'launch-tile'); tile.type = 'button'; tile.disabled = !canOpen; tile.setAttribute('aria-label', canOpen ? translateMessage(`Mở ${app.name}`) : app.name); tile.append(icon(app.kind === 'installed-quick' && app.installed === true ? `/api/app-icon?id=${encodeURIComponent(app.id)}&v=${Date.now()}` : '', app.name), node('strong', '', app.name));
    const badge = node('small', 'launch-badge', app.kind === 'installed-quick' ? (app.installed === true ? 'Ứng dụng' : 'Chưa xác nhận') : app.kind === 'quick' ? 'App cũ' : 'Bộ cài'); tile.append(badge); row.append(tile);
    const details = document.createElement('details'); details.className = 'launch-details'; const summary = document.createElement('summary'); summary.className = 'launch-more'; summary.textContent = '⋯'; summary.setAttribute('aria-label', translateMessage(`Tùy chọn cho ${app.name}`)); details.append(summary); const menu = node('div', 'launch-menu');
if (app.kind === 'installed-quick' && app.installed === false) { const forget = node('button', 'launch-menu-item', 'Xóa khỏi danh sách'); forget.type = 'button'; forget.onclick = async () => { if (!confirmMessage(`Xóa “${app.name}” khỏi danh sách?`)) return; try { const response = await fetch('/api/forget-app', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await renderApps(); } catch (error) { alertMessage(error.message); } }; menu.append(forget); } if (app.kind === 'quick' || (app.kind === 'installed-quick' && app.installed === true)) { const open = node('button', 'launch-menu-item', 'Mở'); open.type = 'button'; open.onclick = async () => { try { const result = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, language: localStorage.getItem('webappmaker-language') || 'vi' }) }); if (!result.ok) throw new Error((await result.json()).error); } catch (error) { alertMessage(error.message); } }; menu.append(open); tile.onclick = () => open.click(); if (app.kind === 'installed-quick') { const cleanShortcut = node('button', 'launch-menu-item', 'Đổi tên Start'); cleanShortcut.type = 'button'; cleanShortcut.onclick = async () => { try { const response = await fetch('/api/clean-shortcut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, language: localStorage.getItem('webappmaker-language') || 'vi' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); alertMessage('Đã đổi tên shortcut trong Start menu.'); } catch (error) { alertMessage(error.message); } }; menu.append(cleanShortcut); const uninstall = node('button', 'launch-menu-item', 'Gỡ ứng dụng'); uninstall.type = 'button'; uninstall.onclick = async () => { try { const response = await fetch('/api/uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, language: localStorage.getItem('webappmaker-language') || 'vi' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); alertMessage('Đã mở trình gỡ. Hoàn tất hoặc hủy trong cửa sổ xác nhận, sau đó tải lại danh sách.'); } catch (error) { alertMessage(error.message); } }; menu.append(uninstall); const addonsButton = node('button', 'launch-menu-item', 'Quản lý addon'); addonsButton.type = 'button'; addonsButton.onclick = () => editAppAddons(app); menu.append(addonsButton); const edit = node('button', 'launch-menu-item', 'Cài đặt cửa sổ'); edit.type = 'button'; edit.onclick = () => editWindowSettings(app); menu.append(edit); const urlButton = node('button', 'launch-menu-item', 'Đổi URL'); urlButton.type = 'button'; urlButton.onclick = () => editAppUrl(app); menu.append(urlButton); const iconButton = node('button', 'launch-menu-item', 'Đổi icon'); iconButton.type = 'button'; iconButton.onclick = () => editAppIcon(app); menu.append(iconButton); const update = node('button', 'launch-menu-item', 'Cập nhật runtime'); update.type = 'button'; update.onclick = async () => { update.disabled = true; try { const response = await fetch('/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, language: localStorage.getItem('webappmaker-language') || 'vi' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể cập nhật.'); alertMessage(translateMessage(result.backup ? `Đã cập nhật ${result.name}. Bản sao lưu: ${result.backup}` : `Đã cập nhật ${result.name}. Dữ liệu đăng nhập được giữ nguyên.`) + (result.warning ? `\n${translateMessage(result.warning)}` : '')); } catch (error) { alertMessage(error.message); } finally { update.disabled = false; } }; menu.append(update); } }
    const info = node('button', 'launch-menu-item', 'Thông tin'); info.type = 'button'; info.onclick = () => { details.open = false; alertMessage([app.name, app.url, ...(app.outputs || []).map((output) => output.path)].filter(Boolean).join('\n')); }; menu.append(info); details.append(menu); row.append(details); root.append(row);
  }
  const nav = $('#app-pages'); nav.replaceChildren(); nav.hidden = pages <= 1; if (pages > 1) {
    const pageButton = (label, page, title) => { const button = node('button', 'launch-page', label); button.type = 'button'; button.setAttribute('aria-label', title); button.disabled = page < 0 || page >= pages; if (page === appPage && /^\d+$/.test(label)) { button.classList.add('active'); button.setAttribute('aria-current', 'page'); } button.onclick = () => { appPage = page; drawApps(); }; if (!query && manual && page >= 0 && page < pages) { button.ondragover = (event) => { if (draggedApp) event.preventDefault(); }; button.ondrop = (event) => { event.preventDefault(); const target = all[page * appPageSize]; if (draggedApp) { appPage = page; moveApp(draggedApp, target?.id ?? null); draggedApp = null; } }; } return button; };
    nav.append(pageButton('‹', appPage - 1, 'Trang trước')); for (let i = 0; i < pages; i++) nav.append(pageButton(String(i + 1), i, translateMessage(`Trang ${i + 1}`))); nav.append(pageButton('›', appPage + 1, 'Trang sau'));
  }
}
$('#app-search').addEventListener('input', () => { appPage = 0; drawApps(); });
$('#app-sort').addEventListener('change', () => { try { localStorage.setItem(appSortKey, $('#app-sort').value); } catch { /* Keep the choice until the page closes. */ } appPage = 0; drawApps(); });
document.addEventListener('click', (event) => { document.querySelectorAll('.launch-details[open]').forEach((details) => { if (!details.contains(event.target)) details.open = false; }); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.launch-details[open]').forEach((details) => { details.open = false; details.querySelector('summary')?.focus(); }); });

async function pollBuild() { try { const response = await fetch('/api/build'); const state = await response.json(); if (!state) return; buildPanel.hidden = false; $('#build-log').textContent = state.log; const active = ['running', 'cancelling', 'finalizing'].includes(state.status); $('#build-status').textContent = ({ running: 'Đang build', cancelling: 'Đang hủy build', finalizing: 'Đang hoàn tất', cancelled: 'Đã hủy build', success: 'Build thành công' })[state.status] || 'Build thất bại'; $('#build-description').textContent = state.status === 'success' ? translateMessage(`Bộ cài: ${state.result.outputs.map((output) => output.path).join(', ')}`) : active ? 'Quá trình có thể mất vài phút, đặc biệt ở lần đầu.' : state.status === 'cancelled' ? 'Đã dừng quá trình; file tạm có thể còn trong thư mục build.' : state.result?.error?.hint || 'Xem chi tiết bên dưới.'; buildButton.disabled = active; const cancel = $('#cancel-build'); cancel.hidden = state.status !== 'running'; cancel.disabled = !state.id; cancel.dataset.buildId = state.id || ''; if (active) setTimeout(pollBuild, 1500); } catch { $('#build-status').textContent = 'Không thể kết nối server'; buildButton.disabled = false; } }
$('#cancel-build').onclick = async () => { const button = $('#cancel-build'); button.disabled = true; try { const response = await fetch('/api/build/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: button.dataset.buildId }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await pollBuild(); } catch (error) { alertMessage(error.message); await pollBuild(); } };

buildButton.onclick = async () => { if (!$('#editor').reportValidity()) return; if ($('#use-addons').checked && ($('#extension-files').files.length || $('#extension-archive').files.length || selectedAddonIds().length)) { alertMessage('Tiện ích thử nghiệm hiện chỉ hỗ trợ tạo app nhanh trên Windows.'); return; } buildButton.disabled = true; buildPanel.hidden = false; $('#build-status').textContent = 'Đang chuẩn bị'; $('#build-log').textContent = ''; try { const response = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: localStorage.getItem('webappmaker-language') || 'vi', config: configFromForm(), selectedIcon, injection: { css: $('#inject-css').value, js: $('#inject-js').value, pictureInPicture: $('#editor').elements.namedItem('pictureInPicture').checked } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể bắt đầu build.'); pollBuild(); } catch (error) { $('#build-status').textContent = 'Không thể bắt đầu build'; $('#build-log').textContent = error.message; buildButton.disabled = false; } };
pollBuild();
renderCategories(); renderDrafts();
fetch('/api/gallery').then((response) => { if (!response.ok) throw new Error('Gallery unavailable'); return response.json(); }).then((data) => { recipes = data; renderGallery(); updateIconPreview(); }).catch(() => { $('#gallery-empty').textContent = 'Không thể tải gallery. Hãy chạy ứng dụng bằng lệnh trong desktop/README.md.'; $('#gallery-empty').hidden = false; });

async function editWindowSettings(app) {
  const request = async (settings) => {
    const response = await fetch('/api/edit-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, ...(settings ? { settings } : {}) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  };
  try {
    const current = await request();
    const dialog = document.createElement('dialog');
    const form = document.createElement('form'); form.method = 'dialog';
    form.append(node('h2', '', translateMessage(`Cài đặt cửa sổ: ${app.name}`)), node('p', '', 'Đóng ứng dụng trước khi lưu. Dữ liệu đăng nhập được giữ nguyên.'));
    const controls = {};
    for (const [key, label, min, max] of [['width', 'Chiều rộng', 1, 10000], ['height', 'Chiều cao', 1, 10000], ['zoom', 'Thu phóng (%)', 50, 200]]) {
      const wrapper = document.createElement('label'); wrapper.textContent = label + ' ';
      const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.required = true; input.value = current[key]; wrapper.append(input); form.append(wrapper, document.createElement('br')); controls[key] = input;
    }
    for (const [key, label] of [['always_on_top', 'Luôn ở trên cùng'], ['maximize', 'Mở tối đa'], ['fullscreen', 'Toàn màn hình']]) {
      const wrapper = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = current[key] === true; wrapper.append(input, document.createTextNode(' ' + label)); form.append(wrapper, document.createElement('br')); controls[key] = input;
    }
    const cancel = node('button', 'secondary', 'Hủy'); cancel.type = 'button'; cancel.onclick = () => dialog.close();
    const save = node('button', '', 'Lưu'); save.type = 'submit'; form.append(cancel, save); dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
    form.onsubmit = async (event) => { event.preventDefault(); save.disabled = true; try { const settings = {}; for (const [key, input] of Object.entries(controls)) settings[key] = input.type === 'checkbox' ? input.checked : Number(input.value); await request(settings); dialog.close(); alertMessage('Đã lưu cài đặt. Mở lại ứng dụng để áp dụng.'); } catch (error) { alertMessage(error.message); } finally { save.disabled = false; } };
    dialog.showModal();
  } catch (error) { alertMessage(error.message); }
}

async function editAppUrl(app) {
  const url = promptMessage('Địa chỉ website mới (đóng ứng dụng trước khi lưu):', app.url);
  if (url === null) return;
  try { const response = await fetch('/api/edit-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, url }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); alertMessage('Đã đổi địa chỉ. Website khác có thể yêu cầu đăng nhập lại.'); await renderApps(); } catch (error) { alertMessage(error.message); }
}
async function editAppIcon(app) {
  const dialog = document.createElement('dialog'); const form = document.createElement('form'); form.method = 'dialog';
  form.append(node('h2', '', translateMessage(`Đổi icon: ${app.name}`)), node('p', '', 'Đóng ứng dụng trước khi lưu. Chọn file hoặc để trống để tự lấy icon của website.'));
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.png,.jpg,.jpeg,.webp,.ico,.svg,image/*'; form.append(input);
  const cancel = node('button', 'secondary', 'Hủy'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); const save = node('button', '', 'Lưu'); save.type = 'submit'; form.append(cancel, save); dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
  form.onsubmit = async (event) => { event.preventDefault(); save.disabled = true; try { let selectedIcon; if (input.files[0]) { const file = input.files[0]; if (file.size > 1000000) throw new Error('File icon quá lớn (tối đa 1 MB).'); selectedIcon = { name: file.name, data: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Không đọc được file icon.')); reader.readAsDataURL(file); }) }; } const response = await fetch('/api/edit-icon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, selectedIcon }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); dialog.close(); alertMessage(result.source === 'fallback' ? 'Đã đổi icon. Không tìm được icon website nên dùng icon dự phòng.' : 'Đã đổi icon. Windows có thể cần thời gian cập nhật bộ nhớ đệm icon.'); } catch (error) { alertMessage(error.message); } finally { save.disabled = false; } };
  dialog.showModal();
}

async function editAppAddons(app) {
  const request = async (enabled) => {
    const response = await fetch('/api/app-addons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, ...(enabled === undefined ? {} : { enabled }) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  };
  try {
    const { addons } = await request();
    const dialog = document.createElement('dialog'); const form = document.createElement('form'); form.method = 'dialog';
    form.append(node('h2', '', translateMessage(`Addon: ${app.name}`)), node('p', '', 'Đóng ứng dụng trước khi lưu. Thay đổi có hiệu lực khi mở lại; dữ liệu đăng nhập được giữ nguyên.'));
    const controls = [];
    if (!addons.length) form.append(node('p', '', 'Ứng dụng này chưa có addon.'));
    for (const addon of addons) {
      const wrapper = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = addon.enabled;
      wrapper.append(input, document.createTextNode(` ${addon.name}${addon.version ? ` (${addon.version})` : ''}`)); form.append(wrapper, document.createElement('br'));
      if (/idm integration module/i.test(addon.name)) form.append(node('p', '', 'IDM có thể không tương thích với WebView2; hãy thử tắt nếu app bị màn hình đen.'));
      controls.push({ id: addon.id, input });
    }
    const cancel = node('button', 'secondary', 'Hủy'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); const save = node('button', '', 'Lưu'); save.type = 'submit'; save.disabled = !addons.length; form.append(cancel, save); dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
    form.onsubmit = async (event) => { event.preventDefault(); save.disabled = true; try { await request(controls.filter(({ input }) => input.checked).map(({ id }) => id)); dialog.close(); alertMessage('Đã lưu. Mở lại ứng dụng để áp dụng.'); } catch (error) { alertMessage(error.message); } finally { save.disabled = false; } };
    dialog.showModal();
  } catch (error) { alertMessage(error.message); }
}
