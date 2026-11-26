import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveZipPayload, readExtensionArchive } from './extension-archive.mjs';

function crc32(data) { let value = 0xffffffff; for (const byte of data) { value ^= byte; for (let i=0;i<8;i++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
function zipOne(name, content) {
  const filename = Buffer.from(name), data = Buffer.from(content); const crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(filename.length,26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt32LE(crc,16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(filename.length,28);
  const directory = Buffer.concat([central,filename]); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(local.length+filename.length+data.length,16);
  return Buffer.concat([local,filename,data,directory,end]);
}
test('reads ZIP and CRX wrappers and preserves extension file bytes', async () => {
  const body = '{"manifest_version":3,"name":"QA","version":"1"}'; const zip = zipOne('package/manifest.json', body);
  const v2 = Buffer.alloc(16); v2.write('Cr24'); v2.writeUInt32LE(2,4); const v3 = Buffer.alloc(12); v3.write('Cr24'); v3.writeUInt32LE(3,4);
  for (const [name, data] of [['addon.zip', zip], ['addon.crx', Buffer.concat([v2,zip])], ['addon.crx', Buffer.concat([v3,zip])]]) {
    const extension = await readExtensionArchive({ name, data: data.toString('base64') }); assert.equal(extension.files[0].path, 'manifest.json'); assert.equal(Buffer.from(extension.files[0].data,'base64').toString(), body); assert.deepEqual(archiveZipPayload(data),zip);
  }
});
test('rejects malformed and oversized CRX headers', () => { const invalid=Buffer.alloc(12); invalid.write('Cr24'); invalid.writeUInt32LE(3,4); invalid.writeUInt32LE(0xffffffff,8); assert.throws(() => archiveZipPayload(invalid), /lỗi/); });
