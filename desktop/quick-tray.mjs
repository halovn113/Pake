// An app hidden on close or at startup needs a tray icon to be reachable.
export function validateQuickTray(config) {
  if ((config.hideOnClose === true || config.startToTray === true) && config.showSystemTray !== true) {
    throw new Error('Hãy bật Biểu tượng khay hệ thống khi dùng Ẩn khi đóng hoặc Khởi động thu nhỏ vào khay.');
  }
}
export function configureQuickTray(pake, config) {
  validateQuickTray(config);
  pake.system_tray.windows = config.showSystemTray === true;
  pake.system_tray_path = config.showSystemTray === true ? 'icon.ico' : '';
}
