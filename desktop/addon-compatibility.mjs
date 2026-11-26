export function assessAddon(manifest, name = '') {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { status: 'unknown', reason: 'Không đọc được thông tin tương thích.' };
  const permissions = [...(Array.isArray(manifest.permissions) ? manifest.permissions : []), ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : [])];
  if (/^IDM Integration Module$/i.test(name.trim()) && manifest.version === '6.42.64') return { status: 'risk', reason: 'Phiên bản này từng gây màn hình đen khi thử với YouTube trên WebAppMaker.' };
  if (permissions.includes('nativeMessaging')) return { status: 'risk', reason: 'Addon cần kết nối phần mềm bên ngoài; kết nối này có thể không hoạt động trong WebView2.' };
  return { status: 'unknown', reason: 'Chưa kiểm tra hoạt động; đọc manifest không bảo đảm addon tương thích.' };
}
