const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const project = path.resolve(__dirname, '..');
const release = path.join(project, 'scripts', 'release.cjs');
const output = path.join(project, '.test-output');
if (!fs.existsSync(output)) fs.mkdirSync(output);
assert.ok(fs.lstatSync(output).isDirectory() && !fs.lstatSync(output).isSymbolicLink());
assert.equal(fs.realpathSync(output), output, 'test output must stay inside the repository');
const suite = fs.mkdtempSync(path.join(output, 'node-release-'));
const files = [
  'manifest.json', 'background.js', 'media.js', 'course.js', 'batch.js', 'content.js',
  'page-hook.js', 'capture.html', 'capture.js', 'scanner.js', 'pdf.js', 'style.css',
  'extension-state.js', 'preflight.js', 'workspace.js', 'disk-cache.js', 'page-store.js', 'library.js',
  'README.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'vendor/hls.min.js', 'vendor/hls.LICENSE',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png',
  'icons/browsers/chrome.svg', 'icons/browsers/edge.svg', 'icons/browsers/brave.svg',
  'icons/browsers/LICENSE.txt', 'icons/logo-1024.png',
];

function fixture(label, omitted) {
  const root = fs.mkdtempSync(path.join(suite, `${label}-`));
  for (const name of [...files, 'package.json']) {
    if (name === omitted) continue;
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(project, name), path.join(root, name));
  }
  return root;
}

function setVersion(root, version, name) {
  for (const file of name ? [name] : ['manifest.json', 'package.json']) {
    const target = path.join(root, file);
    const data = JSON.parse(fs.readFileSync(target, 'utf8'));
    data.version = version;
    fs.writeFileSync(target, JSON.stringify(data));
  }
}

function run(root, options = {}) {
  const result = spawnSync(process.execPath, [options.script || release, ...(root === undefined ? [] : [root])], {
    cwd: options.cwd || suite, encoding: 'utf8', timeout: 20000,
  });
  assert.ifError(result.error);
  return result;
}

function build(root, options) {
  const result = run(root, options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Inspect both header sets independently of the release script, including every payload CRC.
function inspectZip(buffer) {
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  assert.equal(buffer.readUInt32LE(end + 4), 0, 'single-disk ZIP');
  assert.equal(buffer.readUInt16LE(end + 20), 0, 'no ZIP comment');
  const count = buffer.readUInt16LE(end + 10);
  assert.equal(buffer.readUInt16LE(end + 8), count);
  let cursor = buffer.readUInt32LE(end + 16);
  assert.equal(cursor + buffer.readUInt32LE(end + 12), end);
  const result = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const packed = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const local = buffer.readUInt32LE(cursor + 42);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50);
    assert.equal(buffer.readUInt16LE(local + 6), flags);
    assert.equal(buffer.readUInt16LE(local + 8), method);
    const localNameLength = buffer.readUInt16LE(local + 26);
    assert.equal(buffer.toString('utf8', local + 30, local + 30 + localNameLength), name);
    if (!(flags & 8)) {
      assert.equal(buffer.readUInt32LE(local + 14), crc);
      assert.equal(buffer.readUInt32LE(local + 18), packed);
      assert.equal(buffer.readUInt32LE(local + 22), size);
    }
    const start = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + packed);
    assert.ok(method === 0 || method === 8, 'supported ZIP compression');
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    assert.equal(data.length, size, name);
    assert.equal(crc32(data), crc, `${name} CRC`);
    assert.ok(!result.has(name), 'no duplicate member');
    result.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end);
  return result;
}

function latest(root) {
  return fs.readFileSync(path.join(root, 'ppt-capture.zip'));
}

function zipNames(directory) {
  return fs.readdirSync(directory).filter(name => /\.zip$/i.test(name)).sort();
}

function snapshot(root) {
  const result = {};
  for (const folder of ['', 'last-release']) {
    const directory = path.join(root, folder);
    if (!fs.existsSync(directory)) continue;
    for (const name of zipNames(directory)) result[path.join(folder, name)] = fs.readFileSync(path.join(directory, name));
  }
  return result;
}

function seedArchives(root) {
  fs.mkdirSync(path.join(root, 'last-release'));
  for (const name of ['ppt-capture.zip', 'legacy.zip', 'last-release/ppt-capture-v1.0.0.zip', 'last-release/legacy.zip']) {
    fs.writeFileSync(path.join(root, name), `preserve every byte: ${name}\u0000\u00ff`);
  }
}

function failedWithoutChangingZips(root, pattern) {
  const before = snapshot(root);
  const result = run(root);
  assert.notEqual(result.status, 0, 'invalid build must fail');
  assert.match(result.stderr, pattern);
  assert.deepEqual(snapshot(root), before, 'every pre-existing root and history ZIP must be unchanged');
}

// Fixed ZIP32 samples generated once with Node Buffer/zlib; no external fixture files or tools.
const oldZips = [
  {
    label: 'Store', name: 'manifest.json', version: '1.2',
    bytes: 'UEsDBBQAAAAAAAAAAAADpV89EQAAABEAAAANAAAAbWFuaWZlc3QuanNvbnsidmVyc2lvbiI6IjEuMiJ9UEsBAhQAFAAAAAAAAAAAAAOlXz0RAAAAEQAAAA0AAAAAAAAAAAAAAAAAAAAAAG1hbmlmZXN0Lmpzb25QSwUGAAAAAAEAAQA7AAAAPAAAAAAA',
  },
  {
    label: 'Deflate', name: 'manifest.json', version: '1.2.3',
    bytes: 'UEsDBBQAAAAIAAAAAADXf5x1FQAAABMAAAANAAAAbWFuaWZlc3QuanNvbqtWKkstKs7Mz1OyUjLUM9IzVqoFAFBLAQIUABQAAAAIAAAAAADXf5x1FQAAABMAAAANAAAAAAAAAAAAAAAAAAAAAABtYW5pZmVzdC5qc29uUEsFBgAAAAABAAEAOwAAAEAAAAAAAA==',
  },
  {
    label: 'descriptor and nested manifest', name: 'old extension/manifest.json', version: '1.2.3.4',
    bytes: 'UEsDBBQACAAIAAAAAAAAAAAAAAAAAAAAAAAbAAAAb2xkIGV4dGVuc2lvbi9tYW5pZmVzdC5qc29uq1YqSy0qzszPU7JSMtQz0jPWM1GqBQBQSwcIQBqB8xcAAAAVAAAAUEsBAhQAFAAIAAgAAAAAAEAagfMXAAAAFQAAABsAAAAAAAAAAAAAAAAAAAAAAG9sZCBleHRlbnNpb24vbWFuaWZlc3QuanNvblBLBQYAAAAAAQABAEkAAABgAAAAAAA=',
  },
];

test('packs exactly 32 members with original LICENSE, notices and every resource byte', () => {
  const root = fixture('contents');
  fs.writeFileSync(path.join(root, '.env'), 'must never be packaged');
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'private.txt'), 'must never be packaged');
  build(root);
  const entries = inspectZip(latest(root));
  assert.equal(entries.size, 32);
  assert.deepEqual([...entries.keys()].sort(), [...files].sort());
  for (const name of files) assert.deepEqual(entries.get(name), fs.readFileSync(path.join(root, name)), name);
  assert.deepEqual(entries.get('LICENSE'), fs.readFileSync(path.join(project, 'LICENSE')));
  assert.match(entries.get('LICENSE').toString(), /Permission is hereby granted/);
  assert.match(entries.get('LICENSE').toString(), /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.deepEqual(zipNames(root), ['ppt-capture.zip']);
  assert.deepEqual(fs.readdirSync(path.join(root, 'tmp')), []);
});

test('archives by the old embedded version and preserves legacy.zip under its name', () => {
  const root = fixture('history');
  setVersion(root, '1.0.0');
  build(root);
  const old = latest(root);
  fs.copyFileSync(path.join(root, 'ppt-capture.zip'), path.join(root, 'legacy.zip'));
  setVersion(root, '2.4.0');
  build(root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'last-release', 'ppt-capture-v1.0.0.zip')), old);
  assert.deepEqual(fs.readFileSync(path.join(root, 'last-release', 'legacy.zip')), old);
  assert.equal(JSON.parse(inspectZip(latest(root)).get('manifest.json')).version, '2.4.0');
  assert.deepEqual(zipNames(root), ['ppt-capture.zip']);
});

test('same-version collisions retain all historical ZIPs byte for byte', () => {
  const root = fixture('collisions');
  setVersion(root, '2.4.0');
  fs.mkdirSync(path.join(root, 'last-release'));
  const sentinel = Buffer.from('existing version archive\u0000');
  const legacy = Buffer.from('existing legacy archive\u0000');
  const incomingLegacy = Buffer.from('incoming legacy archive\u0000');
  fs.writeFileSync(path.join(root, 'last-release', 'ppt-capture-v2.4.0.zip'), sentinel);
  fs.writeFileSync(path.join(root, 'last-release', 'legacy.zip'), legacy);
  fs.writeFileSync(path.join(root, 'legacy.zip'), incomingLegacy);
  const expected = [sentinel, legacy, incomingLegacy];
  for (let index = 0; index < 4; index++) {
    fs.appendFileSync(path.join(root, 'course.js'), `\n// fixture build ${index}\n`);
    build(root);
    if (index < 3) expected.push(latest(root));
  }
  const history = path.join(root, 'last-release');
  const names = zipNames(history);
  assert.equal(names.length, 6);
  assert.deepEqual(fs.readFileSync(path.join(history, 'ppt-capture-v2.4.0.zip')), sentinel);
  assert.deepEqual(fs.readFileSync(path.join(history, 'legacy.zip')), legacy);
  for (const name of names.filter(name => name !== 'legacy.zip' && name !== 'ppt-capture-v2.4.0.zip')) {
    assert.match(name, /^(?:legacy|ppt-capture-v2\.4\.0)-\d{8}-\d{6}-[1-9]\d*\.zip$/);
  }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(names.map(name => hash(fs.readFileSync(path.join(history, name)))).sort(), expected.map(hash).sort());
  assert.deepEqual(zipNames(root), ['ppt-capture.zip']);
});

for (const sample of oldZips) {
  test(`recognizes old ${sample.label} ZIP without external tools`, () => {
    const root = fixture('old-zip');
    const bytes = Buffer.from(sample.bytes, 'base64');
    assert.equal(JSON.parse(inspectZip(bytes).get(sample.name)).version, sample.version);
    fs.writeFileSync(path.join(root, 'ppt-capture.zip'), bytes);
    build(root);
    assert.deepEqual(fs.readFileSync(path.join(root, 'last-release', `ppt-capture-v${sample.version}.zip`)), bytes);
  });
}

test('preserves unreadable old ZIPs as unknown instead of discarding them', () => {
  const root = fixture('unknown');
  const old = Buffer.from('not a valid ZIP\u0000\u00ff');
  fs.writeFileSync(path.join(root, 'ppt-capture.zip'), old);
  build(root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'last-release', 'ppt-capture-vunknown.zip')), old);
});

test('missing input leaves all existing root and historical ZIPs untouched', () => {
  const root = fixture('missing', 'course.js');
  seedArchives(root);
  failedWithoutChangingZips(root, /Missing release file: course\.js/);
});

test('manifest and package version mismatch leaves every existing ZIP untouched', () => {
  const root = fixture('mismatch');
  seedArchives(root);
  setVersion(root, '9.9.9', 'package.json');
  failedWithoutChangingZips(root, /manifest\.json and package\.json versions differ/);
});

for (const version of ['2.5', '2.5.2-beta', '2.5.2\n', 252]) {
  test(`rejects non-x.y.z release version ${JSON.stringify(version)} before changing ZIPs`, () => {
    const root = fixture('invalid-version');
    seedArchives(root);
    setVersion(root, version);
    failedWithoutChangingZips(root, /Invalid release version/);
  });
}

test('explicit Chinese and space root works from an unrelated cwd, including relative paths', () => {
  const root = fixture('中文 空格');
  const cwd = fs.mkdtempSync(path.join(suite, 'unrelated-cwd-'));
  build(root, { cwd });
  const old = latest(root);
  build(path.relative(cwd, root), { cwd });
  const version = JSON.parse(inspectZip(old).get('manifest.json')).version;
  assert.deepEqual(fs.readFileSync(path.join(root, 'last-release', `ppt-capture-v${version}.zip`)), old);
  assert.equal(inspectZip(latest(root)).size, 32);
});

test('CLI defaults to its own repository root independently of cwd', () => {
  const root = fixture('default root 默认');
  fs.mkdirSync(path.join(root, 'scripts'));
  const script = path.join(root, 'scripts', 'release.cjs');
  fs.copyFileSync(release, script);
  const cwd = fs.mkdtempSync(path.join(suite, 'default-unrelated-'));
  build(undefined, { script, cwd });
  assert.equal(inspectZip(latest(root)).size, 32);
  assert.deepEqual(fs.readdirSync(cwd), [], 'must not create archives in cwd');
});

for (const directory of ['last-release', 'tmp']) {
  test(`rejects ${directory} symlink escape before touching ZIPs or its target`, () => {
    const root = fixture('directory-link');
    const outside = fs.mkdtempSync(path.join(suite, 'outside-'));
    fs.writeFileSync(path.join(outside, 'sentinel.zip'), 'outside ZIP must not change');
    const old = Buffer.from('existing root ZIP');
    fs.writeFileSync(path.join(root, 'ppt-capture.zip'), old);
    fs.symlinkSync(outside, path.join(root, directory), process.platform === 'win32' ? 'junction' : 'dir');
    const before = fs.readdirSync(outside).map(name => [name, fs.readFileSync(path.join(outside, name))]);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe release directory/);
    assert.deepEqual(latest(root), old);
    assert.deepEqual(fs.readdirSync(outside).map(name => [name, fs.readFileSync(path.join(outside, name))]), before);
    assert.deepEqual(zipNames(root), ['ppt-capture.zip']);
  });
}
