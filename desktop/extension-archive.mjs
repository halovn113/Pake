import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('./archive-deps.local/package.json', import.meta.url)));

// CRX containers wrap a ZIP payload. Signatures are not verified; users must trust the source.
export function archiveZipPayload(buffer) {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'Cr24') {
    if (buffer.length < 12) throw new Error('File CRX bị lỗi.');
    const version = buffer.readUInt32LE(4); let offset;
    if (version === 2) { if (buffer.length < 16) throw new Error('File CRX bị lỗi.'); offset = 16 + buffer.readUInt32LE(8) + buffer.readUInt32LE(12); }
    else if (version === 3) offset = 12 + buffer.readUInt32LE(8);
    else throw new Error('Phiên bản CRX chưa được hỗ trợ.');
    if (!Number.isSafeInteger(offset) || offset > buffer.length - 4) throw new Error('File CRX bị lỗi.');
    buffer = buffer.subarray(offset);
  }
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('File ZIP hoặc CRX không hợp lệ.');
  return buffer;
}

export async function readExtensionArchive(archive) {
  if (!archive || typeof archive.name !== 'string' || !/\.(zip|crx)$/i.test(archive.name) || typeof archive.data !== 'string' || archive.data.length > 10_700_000 || (archive.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(archive.data))) throw new Error('Chọn file ZIP hoặc CRX hợp lệ, tối đa 8 MB.');
  let yauzl; try { yauzl = require('yauzl'); } catch { throw new Error('Chưa cài thư viện đọc addon ZIP/CRX. Xem desktop/README.md.'); }
  const buffer = archiveZipPayload(Buffer.from(archive.data, 'base64'));
  return await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(new Error(`Không đọc được addon: ${error.message}`));
      const files = []; let total = 0; let failed = false;
      const fail = (err) => { if (failed) return; failed = true; zip.close(); reject(err); };
      zip.on('error', fail);
      zip.on('entry', (entry) => {
        if (failed) return;
        if (entry.generalPurposeBitFlag & 1) return fail(new Error('Addon nén được mã hóa không được hỗ trợ.'));
        if ((entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) return fail(new Error('Addon chứa liên kết không được hỗ trợ.'));
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
        if (files.length >= 2500 || entry.uncompressedSize > 8_000_000 || total + entry.uncompressedSize > 8_000_000) return fail(new Error('Addon vượt giới hạn 8 MB hoặc 2500 file.'));
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError);
          const chunks = []; let length = 0;
          stream.on('data', (chunk) => { length += chunk.length; if (length > entry.uncompressedSize || total + length > 8_000_000) { stream.destroy(); fail(new Error('Addon vượt giới hạn kích thước.')); } else chunks.push(chunk); });
          stream.on('error', fail);
          stream.on('end', () => { if (failed) return; total += length; files.push({ path: entry.fileName, data: Buffer.concat(chunks).toString('base64') }); zip.readEntry(); });
        });
      });
      zip.on('end', () => {
        if (failed) return;
        if (!files.some((file) => file.path.toLowerCase() === 'manifest.json')) {
          const roots = new Set(files.map((file) => file.path.split('/')[0]));
          if (roots.size === 1 && files.every((file) => file.path.includes('/'))) for (const file of files) file.path = file.path.slice(file.path.indexOf('/') + 1);
        }
        resolve({ files });
      });
      zip.readEntry();
    });
  });
}
