import './i18n.js';
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
appsView.innerHTML = '<div class="page-title"><p class="eyebrow">SẢN PHẨM ĐÃ TẠO</p><h1>Ứng dụng của tôi</h1><p>Các ứng dụng và bộ cài đã tạo.</p></div><div id="built-apps" class="draft-list"></div><p id="apps-empty" class="empty" hidden>Chưa có ứng dụng hoặc bộ cài nào.</p>';
document.querySelector('main').append(appsView);
const buildPanel = node('div', 'form-card build-panel');
buildPanel.hidden = true;
buildPanel.innerHTML = '<h2 id="build-status">Đang build</h2><p id="build-description">Quá trình có thể mất vài phút, đặc biệt ở lần đầu.</p><pre id="build-log" aria-live="polite"></pre>';
document.querySelector('.notice').replaceWith(buildPanel);
const buildButton = node('button', 'primary', 'Tạo ứng dụng');
buildButton.type = 'button'; buildButton.id = 'build-app'; buildButton.textContent = 'Tạo bộ cài'; buildButton.className = 'secondary';
const quickButton = node('button', 'primary', 'Tạo app nhanh');
const createActions = node('div', 'create-actions');
createActions.append(quickButton, buildButton);
document.querySelector('#editor').prepend(createActions);
createActions.after(buildPanel);
quickButton.type = 'button';
quickButton.onclick = async () => { if (!$('#editor').reportValidity()) return; quickButton.disabled = true; buildPanel.hidden = false; $('#build-status').textContent = 'Đang tạo ứng dụng'; $('#build-description').textContent = 'Đang chuẩn bị icon và đăng ký ứng dụng trong Windows.'; $('#build-log').textContent = ''; try { const response = await fetch('/api/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: localStorage.getItem('webappmaker-language') || 'vi', config: configFromForm(), selectedIcon, injection: { css: $('#inject-css').value, js: $('#inject-js').value } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); $('#build-status').textContent = 'Đã tạo ứng dụng'; $('#build-description').textContent = result.iconSource === 'fallback' ? 'Đã cài ứng dụng với icon chữ cái thay thế; mở từ Start hoặc Ứng dụng của tôi.' : 'Đã cài ứng dụng; mở từ Start hoặc Ứng dụng của tôi.'; $('#build-log').textContent = result.outputs[0].path; } catch (error) { $('#build-status').textContent = 'Không thể tạo ứng dụng'; $('#build-log').textContent = error.message; } finally { quickButton.disabled = false; } };
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
document.querySelector('.actions').before(advanced);
const toggles = [['darkMode','Giao diện tối','Dùng chế độ tối cho cửa sổ.'],['hideOnClose','Ẩn khi đóng cửa sổ','Ứng dụng tiếp tục chạy; nên bật biểu tượng khay.'],['showSystemTray','Biểu tượng khay hệ thống','Hiển thị biểu tượng trong khay.'],['startToTray','Khởi động thu nhỏ vào khay','Nên bật biểu tượng khay hệ thống.'],['newWindow','Cho phép cửa sổ mới','Dùng cho một số cửa sổ đăng nhập và liên kết.'],['multiWindow','Nhiều cửa sổ','Cho phép mở nhiều cửa sổ trong một phiên.'],['forceInternalNavigation','Mở liên kết trong ứng dụng','Giữ mọi liên kết trong cửa sổ ứng dụng.'],['maximize','Mở cửa sổ phóng to','Khởi động với cửa sổ được phóng to.'],['fullscreen','Mở toàn màn hình','Khởi động ở chế độ toàn màn hình.'],['passwordAutosave','Lưu mật khẩu (Windows)','Bật gợi ý lưu mật khẩu của WebView2; không áp dụng trong chế độ riêng tư.']];
for (const [name, title, description] of toggles) { const label = document.createElement('label'); label.className = 'toggle'; const copy = document.createElement('span'); copy.append(node('strong', '', title), node('small', '', description)); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = name; label.append(copy, checkbox); advanced.querySelector('.advanced-toggles').append(label); }

function readDrafts() {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function saveDrafts(value) { localStorage.setItem(storageKey, JSON.stringify(value)); }
function node(tag, className, content) { const element = document.createElement(tag); if (className) element.className = className; if (content != null) element.textContent = content; return element; }
function icon(url, name) { const box = node('span', 'app-icon', name?.slice(0, 1).toUpperCase() || '↗'); if (url) { const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = url; img.onerror = () => img.remove(); box.append(img); } return box; }
function show(view) {
  for (const name of ['gallery', 'drafts', 'editor', 'apps']) $(`#${name}-view`).hidden = name !== view;
  document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb').textContent = view === 'gallery' ? 'KHÁM PHÁ' : view === 'drafts' ? 'BẢN NHÁP' : view === 'apps' ? 'ỨNG DỤNG CỦA TÔI' : 'CẤU HÌNH';
  if (view === 'drafts') renderDrafts();
  if (view === 'apps') renderApps();
  window.scrollTo(0, 0);
}
function renderCategories() { const root = $('#categories'); root.replaceChildren(); for (const [id, label] of Object.entries(categories)) { const button = node('button', `chip${id === selectedCategory ? ' selected' : ''}`, label); button.type = 'button'; button.setAttribute('aria-pressed', String(id === selectedCategory)); button.onclick = () => { selectedCategory = id; renderCategories(); renderGallery(); }; root.append(button); } }
function renderGallery() {
  const root = $('#gallery'); root.replaceChildren(); const search = $('#search').value.trim().toLowerCase();
  const shown = recipes.filter((app) => (selectedCategory === 'all' || app.category === selectedCategory) && `${app.name.en} ${app.description.en} ${app.url}`.toLowerCase().includes(search));
  for (const app of shown) { const card = node('button', 'app-card'); card.type = 'button'; card.append(icon(app.icon, app.name.en)); const body = node('span', 'app-copy'); body.append(node('strong', '', app.name.en), node('small', '', app.description.en)); card.append(body, node('span', 'card-arrow', '↗')); card.onclick = () => openEditor({ name: app.name.en, url: app.url }); root.append(card); }
  $('#gallery-empty').hidden = shown.length > 0;
}
function renderDrafts() { const drafts = readDrafts(); $('#draft-count').textContent = drafts.length; const root = $('#draft-list'); root.replaceChildren(); $('#drafts-empty').hidden = drafts.length > 0; for (const draft of drafts) { const row = node('div', 'draft-row'); row.append(icon(draft.selectedIcon?.data || draft.config.icon, draft.config.name)); const body = node('div', 'app-copy'); body.append(node('strong', '', draft.config.name), node('small', '', draft.config.url)); const edit = node('button', 'secondary', 'Chỉnh sửa'); edit.onclick = () => openEditor(draft.config, draft.id, 'drafts', draft.selectedIcon, draft.injection); const remove = node('button', 'text-button', 'Xóa'); remove.onclick = () => { if (confirm(`Xóa bản nháp “${draft.config.name}”?`)) { saveDrafts(readDrafts().filter((item) => item.id !== draft.id)); renderDrafts(); } }; row.append(body, edit, remove); root.append(row); } }
function openEditor(config = {}, id = null, from = 'gallery', savedIcon = null, injection = {}) { editingId = id; previousView = from; iconReadVersion++; selectedIcon = savedIcon; const form = $('#editor'); form.reset(); $('#inject-css').value = injection?.css || ''; $('#inject-js').value = injection?.js || ''; for (const [key, value] of Object.entries({ width: 1200, height: 780, ...config })) { const field = form.elements.namedItem(key); if (!field || (key === 'icon' && savedIcon)) continue; if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = value; } updateIconPreview(); $('#editor-title').textContent = id ? 'Chỉnh sửa bản nháp' : 'Tạo ứng dụng'; show('editor'); }
function configFromForm() { const form = $('#editor'); const result = {}; for (const name of ['name', 'url', 'icon', ...advancedStrings]) { const value = form.elements.namedItem(name).value.trim(); if (value) result[name] = value; } for (const name of ['width', 'height', ...advancedNumbers]) { const value = form.elements.namedItem(name).value; if (value !== '') result[name] = Number(value); } for (const name of ['alwaysOnTop', 'incognito', 'enableFind', ...advancedBooleans]) if (form.elements.namedItem(name).checked) result[name] = true; if (selectedIcon) result.icon = selectedIcon.name; return result; }
function updateIconPreview() { const preview = $('#icon-preview'); preview.replaceChildren(); const image = document.createElement('img'); const url = $('#editor').elements.namedItem('icon').value.trim(); let source = selectedIcon?.data || url; let fallbackSource; if (!source) { try { const page = new URL($('#editor').elements.namedItem('url').value); if (['http:', 'https:'].includes(page.protocol)) { fallbackSource = `${page.origin}/favicon.ico`; source = recipes.find((recipe) => recipe.url === page.href)?.icon || fallbackSource; } } catch { /* No preview until the URL is valid. */ } } if (source) { image.alt = ''; image.referrerPolicy = 'no-referrer'; image.onerror = () => { if (fallbackSource && image.src !== fallbackSource) { image.src = fallbackSource; fallbackSource = null; return; } if (image.parentNode === preview) { image.remove(); preview.textContent = ($('#editor').elements.namedItem('name').value.trim().match(/[a-z0-9]/i)?.[0] || 'W').toUpperCase(); } }; image.src = source; preview.append(image); } else preview.textContent = '↗'; $('#choose-icon').setAttribute('aria-pressed', String(Boolean(selectedIcon))); $('#reset-icon').setAttribute('aria-pressed', String(!selectedIcon && !url)); $('#icon-label').textContent = selectedIcon ? selectedIcon.name : url ? 'URL tùy chỉnh' : 'Tự động từ website'; $('#icon-description').textContent = selectedIcon ? 'Ảnh được lưu cùng bản nháp trên trình duyệt.' : url ? 'Sử dụng biểu tượng từ URL này.' : 'Tự lấy favicon hoặc dùng icon chữ cái nếu không tìm được.'; }
$('#choose-icon').onclick = () => $('#icon-file').click();
$('#reset-icon').onclick = () => { iconReadVersion++; selectedIcon = null; $('#icon-file').value = ''; $('#editor').elements.namedItem('icon').value = ''; updateIconPreview(); };
$('#editor').elements.namedItem('icon').oninput = () => { iconReadVersion++; selectedIcon = null; $('#icon-file').value = ''; updateIconPreview(); };
$('#editor').elements.namedItem('url').oninput = updateIconPreview;
$('#icon-file').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; if (!/\.(png|jpe?g|webp|ico|svg)$/i.test(file.name) || file.size > iconLimit) { alert('Vui lòng chọn PNG, JPG, WEBP, ICO hoặc SVG có kích thước tối đa 1 MB.'); event.target.value = ''; return; } const version = ++iconReadVersion; const reader = new FileReader(); reader.onload = () => { if (version !== iconReadVersion) return; selectedIcon = { name: file.name.replace(/[^a-zA-Z0-9._-]/g, '_'), data: reader.result }; $('#editor').elements.namedItem('icon').value = ''; updateIconPreview(); }; reader.onerror = () => alert('Không thể đọc tệp biểu tượng.'); reader.readAsDataURL(file); };
document.querySelectorAll('.nav').forEach((button) => button.onclick = () => show(button.dataset.view));
$('#back').onclick = () => show(previousView);
$('#search').oninput = renderGallery;
$('#url-form').onsubmit = (event) => { event.preventDefault(); const url = $('#url-input').value.trim(); const parsed = new URL(url); openEditor({ url, name: parsed.hostname.replace(/^www\./, '').split('.')[0] }); };
$('#editor').onsubmit = (event) => { event.preventDefault(); const config = configFromForm(); const drafts = readDrafts(); const id = editingId || crypto.randomUUID(); const index = drafts.findIndex((item) => item.id === id); const draft = { id, config, selectedIcon, injection: { css: $('#inject-css').value, js: $('#inject-js').value } }; if (index < 0) drafts.push(draft); else drafts[index] = draft; try { saveDrafts(drafts); show('drafts'); } catch { alert('Không thể lưu bản nháp. Bộ nhớ trình duyệt có thể đã đầy.'); } };
function download(blob, name) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
$('#export').onclick = async () => { if (!$('#editor').reportValidity()) return; const config = configFromForm(); const css = $('#inject-css').value; const js = $('#inject-js').value; if (selectedIcon || css || js) alert('Hãy lưu tất cả tệp tải về trong cùng một thư mục, sau đó chạy lệnh pake từ thư mục đó. Trình duyệt có thể yêu cầu cho phép tải nhiều tệp.'); if (selectedIcon) { const iconData = await fetch(selectedIcon.data).then((response) => response.blob()); download(iconData, selectedIcon.name); } const inject = []; if (css) { inject.push('pake-custom.css'); download(new Blob([css], { type: 'text/css' }), 'pake-custom.css'); } if (js) { inject.push('pake-custom.js'); download(new Blob([js], { type: 'text/javascript' }), 'pake-custom.js'); } if (inject.length) config.inject = inject; download(new Blob([JSON.stringify(config, null, 2) + '\n'], { type: 'application/json' }), 'pake-config.json'); };
async function renderApps() { const root = $('#built-apps'); root.replaceChildren(); try { const response = await fetch('/api/apps'); if (!response.ok) throw new Error('Không thể tải danh sách.'); const entries = await response.json(); $('#apps-empty').hidden = entries.length > 0; for (const app of entries) { const row = node('div', 'draft-row'); row.append(icon('', app.name)); const body = node('div', 'app-copy'); body.append(node('strong', '', app.name), node('small', '', app.url)); if (app.installed === false) body.append(node('small', '', 'Không tìm thấy ứng dụng; có thể đã gỡ trong Windows.')); for (const output of app.outputs) { const pathLine = node('code', 'artifact-path', output.path); body.append(pathLine); } row.append(body); if (['quick', 'installed-quick'].includes(app.kind) && app.installed !== false) { const open = node('button', 'secondary', 'Mở'); open.type = 'button'; open.onclick = async () => { try { const result = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, language: localStorage.getItem('webappmaker-language') || 'vi' }) }); if (!result.ok) throw new Error((await result.json()).error); } catch (error) { alert(error.message); } }; row.append(open); if (app.kind === 'installed-quick') { const edit = node('button', 'secondary', 'Cài đặt cửa sổ'); edit.type = 'button'; edit.onclick = () => editWindowSettings(app); row.append(edit); const urlButton = node('button', 'secondary', 'Đổi URL'); urlButton.type = 'button'; urlButton.onclick = () => editAppUrl(app); row.append(urlButton); const iconButton = node('button', 'secondary', 'Đổi icon'); iconButton.type = 'button'; iconButton.onclick = () => editAppIcon(app); row.append(iconButton); const update = node('button', 'secondary', 'Cập nhật runtime'); update.type = 'button'; update.onclick = async () => { update.disabled = true; try { const response = await fetch('/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, language: localStorage.getItem('webappmaker-language') || 'vi' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể cập nhật.'); alert((result.backup ? `Đã cập nhật ${result.name}. Bản sao lưu: ${result.backup}` : `Đã cập nhật ${result.name}. Dữ liệu đăng nhập được giữ nguyên.`) + (result.warning ? `\n${result.warning}` : '')); } catch (error) { alert(error.message); } finally { update.disabled = false; } }; row.append(update); } } root.append(row); } } catch (error) { root.append(node('p', 'empty', error.message)); } }
async function pollBuild() { try { const response = await fetch('/api/build'); const state = await response.json(); if (!state) return; buildPanel.hidden = false; $('#build-log').textContent = state.log; $('#build-status').textContent = state.status === 'running' ? 'Đang build' : state.status === 'success' ? 'Build thành công' : 'Build thất bại'; $('#build-description').textContent = state.status === 'success' ? `Bộ cài: ${state.result.outputs.map((output) => output.path).join(', ')}` : state.status === 'running' ? 'Quá trình có thể mất vài phút, đặc biệt ở lần đầu.' : state.result?.error?.hint || 'Xem chi tiết bên dưới.'; buildButton.disabled = state.status === 'running'; if (state.status === 'running') setTimeout(pollBuild, 1500); } catch { $('#build-status').textContent = 'Không thể kết nối server'; buildButton.disabled = false; } }
buildButton.onclick = async () => { if (!$('#editor').reportValidity()) return; buildButton.disabled = true; buildPanel.hidden = false; $('#build-status').textContent = 'Đang chuẩn bị'; $('#build-log').textContent = ''; try { const response = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: localStorage.getItem('webappmaker-language') || 'vi', config: configFromForm(), selectedIcon, injection: { css: $('#inject-css').value, js: $('#inject-js').value } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không thể bắt đầu build.'); pollBuild(); } catch (error) { $('#build-status').textContent = 'Không thể bắt đầu build'; $('#build-log').textContent = error.message; buildButton.disabled = false; } };
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
    form.append(node('h2', '', `Cài đặt cửa sổ: ${app.name}`), node('p', '', 'Đóng ứng dụng trước khi lưu. Dữ liệu đăng nhập được giữ nguyên.'));
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
    form.onsubmit = async (event) => { event.preventDefault(); save.disabled = true; try { const settings = {}; for (const [key, input] of Object.entries(controls)) settings[key] = input.type === 'checkbox' ? input.checked : Number(input.value); await request(settings); dialog.close(); alert('Đã lưu cài đặt. Mở lại ứng dụng để áp dụng.'); } catch (error) { alert(error.message); } finally { save.disabled = false; } };
    dialog.showModal();
  } catch (error) { alert(error.message); }
}

async function editAppUrl(app) {
  const url = prompt('Địa chỉ website mới (đóng ứng dụng trước khi lưu):', app.url);
  if (url === null) return;
  try { const response = await fetch('/api/edit-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, url }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); alert('Đã đổi địa chỉ. Website khác có thể yêu cầu đăng nhập lại.'); await renderApps(); } catch (error) { alert(error.message); }
}
async function editAppIcon(app) {
  const dialog = document.createElement('dialog'); const form = document.createElement('form'); form.method = 'dialog';
  form.append(node('h2', '', `Đổi icon: ${app.name}`), node('p', '', 'Đóng ứng dụng trước khi lưu. Chọn file hoặc để trống để tự lấy icon của website.'));
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.png,.jpg,.jpeg,.webp,.ico,.svg,image/*'; form.append(input);
  const cancel = node('button', 'secondary', 'Hủy'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); const save = node('button', '', 'Lưu'); save.type = 'submit'; form.append(cancel, save); dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove());
  form.onsubmit = async (event) => { event.preventDefault(); save.disabled = true; try { let selectedIcon; if (input.files[0]) { const file = input.files[0]; if (file.size > 1000000) throw new Error('File icon quá lớn (tối đa 1 MB).'); selectedIcon = { name: file.name, data: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Không đọc được file icon.')); reader.readAsDataURL(file); }) }; } const response = await fetch('/api/edit-icon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: app.id, selectedIcon }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); dialog.close(); alert(result.source === 'fallback' ? 'Đã đổi icon. Không tìm được icon website nên dùng icon dự phòng.' : 'Đã đổi icon. Windows có thể cần thời gian cập nhật bộ nhớ đệm icon.'); } catch (error) { alert(error.message); } finally { save.disabled = false; } };
  dialog.showModal();
}
