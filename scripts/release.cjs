const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');

const files = [
  'manifest.json', 'background.js', 'media.js', 'course.js', 'batch.js', 'content.js',
  'page-hook.js', 'capture.html', 'capture.js', 'scanner.js', 'pdf.js', 'style.css',
  'extension-state.js', 'preflight.js', 'workspace.js', 'disk-cache.js', 'page-store.js', 'library.js',
  'README.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'vendor/hls.min.js', 'vendor/hls.LICENSE',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png',
  'icons/browsers/chrome.svg', 'icons/browsers/edge.svg', 'icons/browsers/brave.svg',
  'icons/browsers/LICENSE.txt', 'icons/logo-1024.png', 'icons/readme-banner.svg',
];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(inputs) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const { name, data } of inputs) {
    const filename = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    if (data.length >= 0xffffffff || compressed.length >= 0xffffffff) throw new Error('Release exceeds ZIP32 limits');
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // ZIP's minimum DOS date, 1980-01-01.
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    filename.copy(central, 46);
    parts.push(local, compressed);
    directory.push(central);
    offset += local.length + compressed.length;
    if (offset >= 0xffffffff) throw new Error('Release exceeds ZIP32 limits');
  }
  const central = Buffer.concat(directory);
  if (offset + central.length >= 0xffffffff) throw new Error('Release exceeds ZIP32 limits');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(inputs.length, 8);
  end.writeUInt16LE(inputs.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}

function requireRange(buffer, offset, size) {
  if (offset < 0 || size < 0 || offset + size > buffer.length) throw new Error('Truncated ZIP');
}

function zipEntries(buffer) {
  let end = buffer.length - 22;
  for (; end >= Math.max(0, buffer.length - 65557); end--) {
    if (buffer.readUInt32LE(end) === 0x06054b50 && end + 22 + buffer.readUInt16LE(end + 20) === buffer.length) break;
  }
  if (end < Math.max(0, buffer.length - 65557)) throw new Error('ZIP directory not found');
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  let cursor = buffer.readUInt32LE(end + 16);
  // shortcut: ZIP32 single-disk archives only; add ZIP64 only if release sizes require it.
  if (buffer.readUInt32LE(end + 4) !== 0 || buffer.readUInt16LE(end + 8) !== count || count === 0xffff || cursor + size !== end) {
    throw new Error('Unsupported ZIP directory');
  }
  const entries = [];
  for (let index = 0; index < count; index++) {
    requireRange(buffer, cursor, 46);
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory entry');
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const length = 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
    requireRange(buffer, cursor, length);
    if (cursor + length > end || buffer.readUInt16LE(cursor + 34) !== 0) throw new Error('Invalid ZIP directory entry');
    entries.push({
      name: buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength),
      flags: buffer.readUInt16LE(cursor + 8), method: buffer.readUInt16LE(cursor + 10),
      crc: buffer.readUInt32LE(cursor + 16), packed: buffer.readUInt32LE(cursor + 20),
      size: buffer.readUInt32LE(cursor + 24), offset: buffer.readUInt32LE(cursor + 42),
      directory: buffer.readUInt32LE(end + 16),
    });
    cursor += length;
  }
  if (cursor !== end) throw new Error('Invalid ZIP directory size');
  return entries;
}

function zipData(buffer, entry) {
  const local = entry.offset;
  requireRange(buffer, local, 30);
  if (buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 6) !== entry.flags ||
      buffer.readUInt16LE(local + 8) !== entry.method || (entry.flags & 1)) throw new Error('Unsupported ZIP entry');
  const nameLength = buffer.readUInt16LE(local + 26);
  const start = local + 30 + nameLength + buffer.readUInt16LE(local + 28);
  requireRange(buffer, local + 30, nameLength);
  requireRange(buffer, start, entry.packed);
  if (start + entry.packed > entry.directory || buffer.toString('utf8', local + 30, local + 30 + nameLength) !== entry.name) {
    throw new Error('Invalid ZIP local entry');
  }
  const compressed = buffer.subarray(start, start + entry.packed);
  // Central-directory sizes also cover old entries that use a data descriptor.
  const data = entry.method === 0 ? compressed : entry.method === 8
    ? zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) }) : null;
  if (!data || data.length !== entry.size || crc32(data) !== entry.crc) throw new Error('ZIP payload validation failed');
  return data;
}

function parseJson(data) {
  return JSON.parse(data.toString('utf8').replace(/^\uFEFF/, ''));
}

function oldVersion(file) {
  try {
    const buffer = fs.readFileSync(file);
    const entries = zipEntries(buffer);
    const manifest = entries.find(entry => entry.name === 'manifest.json') || entries.find(entry => /(^|\/)manifest\.json$/.test(entry.name));
    if (manifest && manifest.size <= 1024 * 1024) {
      const version = String(parseJson(zipData(buffer, manifest)).version);
      if (/^\d+(?:\.\d+){1,3}$/.test(version) && version.trim() === version) return version;
    }
  } catch { /* Unreadable old archives must still be preserved. */ }
  console.warn('Old ZIP version could not be read; preserving it as unknown.');
  return 'unknown';
}

function exists(file) {
  return fs.lstatSync(file, { throwIfNoEntry: false }) !== undefined;
}

function checkDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(directory, fs.realpathSync(directory)) !== '') {
    throw new Error(`Unsafe release directory: ${directory}`);
  }
}

function checkChild(file, directory) {
  checkDirectory(directory);
  if (path.dirname(path.resolve(file)) !== directory) throw new Error('Archive target escapes release directory');
}

function checkFile(file, directory) {
  checkChild(file, directory);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || path.relative(file, fs.realpathSync(file)) !== '') {
    throw new Error(`Unsafe release file: ${file}`);
  }
}

function removeFile(file, directory) {
  checkFile(file, directory);
  fs.unlinkSync(file);
}

function moveFile(source, destination, sourceDirectory, destinationDirectory) {
  checkFile(source, sourceDirectory);
  checkChild(destination, destinationDirectory);
  // COPYFILE_EXCL preserves history even if another process claims the name after our check.
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  checkFile(destination, destinationDirectory);
  removeFile(source, sourceDirectory);
}

function archiveDestination(history, name) {
  let destination = path.join(history, name);
  if (exists(destination)) {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const base = name.slice(0, -4);
    let counter = 1;
    do { destination = path.join(history, `${base}-${stamp}-${counter++}.zip`); } while (exists(destination));
  }
  return destination;
}

function release(rootArgument) {
  const root = fs.realpathSync(path.resolve(rootArgument === undefined ? path.join(__dirname, '..') : rootArgument));
  checkDirectory(root);
  const inputs = files.map(name => {
    const file = path.join(root, name);
    if (!exists(file) || !fs.lstatSync(file).isFile()) throw new Error(`Missing release file: ${name}`);
    if (path.relative(file, fs.realpathSync(file)) !== '') throw new Error(`Unsafe release file: ${name}`);
    return { name, data: fs.readFileSync(file) };
  });
  const manifest = parseJson(inputs[0].data);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.version.trim() !== manifest.version) {
    throw new Error('Invalid release version');
  }
  const packageFile = path.join(root, 'package.json');
  checkFile(packageFile, root);
  if (parseJson(fs.readFileSync(packageFile)).version !== manifest.version) throw new Error('manifest.json and package.json versions differ');
  const history = path.join(root, 'last-release');
  const temporary = path.join(root, 'tmp');
  for (const directory of [history, temporary]) {
    checkDirectory(root);
    if (!exists(directory)) fs.mkdirSync(directory);
    checkDirectory(directory);
  }
  const staged = path.join(temporary, `release-${randomUUID()}.zip`);
  let stagedExists = false;
  try {
    const data = makeZip(inputs);
    checkChild(staged, temporary);
    fs.writeFileSync(staged, data, { flag: 'wx' });
    stagedExists = true;
    checkFile(staged, temporary);
    const buffer = fs.readFileSync(staged);
    const entries = zipEntries(buffer);
    if (entries.length !== files.length || entries.some((entry, index) => entry.name !== inputs[index].name || !zipData(buffer, entry).equals(inputs[index].data))) {
      throw new Error('Release ZIP validation failed');
    }
    const oldFiles = fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => /\.zip$/i.test(entry.name) && !entry.isDirectory())
      .map(entry => path.join(root, entry.name));
    for (const old of oldFiles) checkFile(old, root);
    for (const old of oldFiles) {
      const original = path.basename(old);
      const name = original.toLowerCase() === 'ppt-capture.zip' ? `ppt-capture-v${oldVersion(old)}.zip` : original;
      const destination = archiveDestination(history, name);
      moveFile(old, destination, root, history);
      console.log(`Archived: ${destination}`);
    }
    const latest = path.join(root, 'ppt-capture.zip');
    moveFile(staged, latest, temporary, root);
    stagedExists = false;
    console.log(`Latest v${manifest.version}: ${latest}`);
  } finally {
    if (stagedExists) removeFile(staged, temporary);
  }
}

try {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/release.cjs [root]');
  release(process.argv[2]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
