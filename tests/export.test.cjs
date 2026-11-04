const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {dependency} = require('./runtime.cjs');
const {PDFDocument, PDFName} = dependency('pdf-lib');
const sharp = dependency('sharp');
const source = fs.readFileSync(path.join(__dirname, '../pdf.js'), 'utf8');
const jpeg = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAcDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCcAAVZf//Z', 'base64');
const page = (sourceTime = 0, w = 7, h = 3) => ({data: 'data:image/jpeg;base64,' + jpeg.toString('base64'), w, h, sourceTime});
function exportsWith(overrides = {}) {
  const context = vm.createContext({TextEncoder, Uint8Array, DataView, Blob, atob, ...overrides});
  vm.runInContext(source, context);
  return context;
}
function content(pdf, page) {
  return Buffer.from(pdf.context.lookup(page.node.get(PDFName.of('Contents'))).contents).toString('ascii');
}

test('default PDF keeps legacy bytes, exact unrounded geometry, and page.data JPEG bytes', async () => {
  const {makePDF} = exportsWith();
  const blob = makePDF([page()]);
  assert.equal(blob.type, 'application/pdf');
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '0d0c1d6d0542ef9e59639c9cc4df58bfac1d52e2cafb4a76aeca0f6542bf4a20');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), {width: 842, height: 842 * 3 / 7});
  assert.ok(bytes.includes(jpeg));
  assert.deepEqual(Buffer.from(await makePDF([page()], {layout: 'single'}).arrayBuffer()), bytes);
  const portrait = await PDFDocument.load(await makePDF([page(), page(0, 3, 7)]).arrayBuffer());
  assert.equal(portrait.getPageCount(), 2);
  assert.deepEqual(portrait.getPage(1).getSize(), {width: 842, height: 842 * 7 / 3});
});

test('handout PDF fits landscape/portrait slides, notes, and visible page numbers on A4', async () => {
  const {makePDF} = exportsWith();
  const pages = [page(0, 1920, 1080), page(60, 900, 1600), page(90, 7, 3)];
  const pdf = await PDFDocument.load(await makePDF(pages, {layout: 'handout'}).arrayBuffer());
  assert.equal(pdf.getPageCount(), 2);
  let slide = 0;
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const sheet = pdf.getPage(i);
    assert.deepEqual(sheet.getSize(), {width: 595, height: 842});
    const stream = content(pdf, sheet);
    const images = [...stream.matchAll(/q ([\d.e+-]+) 0 0 ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) cm \/Im\d+ Do Q/g)];
    assert.equal(images.length, i === 0 ? 2 : 1);
    for (const match of images) {
      const [w, h, x, y] = match.slice(1).map(Number);
      assert.ok(w > 0 && w <= 310 && h > 0 && h <= 210);
      assert.ok(x >= 40 && x + w <= 350 && y >= 40 && y + h <= 802);
      assert.ok(Math.abs(w / h - pages[slide].w / pages[slide].h) < 1e-10);
      assert.ok(stream.includes(`(${++slide}) Tj`));
    }
    const lines = [...stream.matchAll(/360 ([\d.]+) m 555 \1 l S/g)];
    assert.equal(lines.length, images.length * 8);
    assert.ok(stream.includes('0.75 G 0.5 w'));
    assert.ok(stream.includes(`(${i + 1} / 2) Tj`));
    const font = pdf.context.lookup(sheet.node.Resources().lookup(PDFName.of('Font')).get(PDFName.of('F1')));
    assert.equal(font.get(PDFName.of('BaseFont')).toString(), '/Helvetica');
    assert.equal(font.get(PDFName.of('Subtype')).toString(), '/Type1');
  }
  assert.equal(slide, pages.length);
});

test('empty exports contain zero PDF pages and a valid empty ZIP directory', async () => {
  const {makePDF, makeZIP} = exportsWith();
  for (const options of [{}, {layout: 'handout'}]) {
    const pdf = await PDFDocument.load(await makePDF([], options).arrayBuffer());
    assert.equal(pdf.getPageCount(), 0);
  }
  const bytes = Buffer.from(await makeZIP([]).arrayBuffer());
  assert.equal(bytes.length, 22);
  assert.equal(bytes.readUInt32LE(0), 0x06054b50);
  assert.equal(bytes.readUInt16LE(10), 0);
  assert.equal(bytes.readUInt32LE(12), 0);
  assert.equal(bytes.readUInt32LE(16), 0);
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function readZIP(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt32LE(end + 4), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const centralOffset = bytes.readUInt32LE(end + 16);
  assert.equal(centralOffset + bytes.readUInt32LE(end + 12), end);
  let central = centralOffset, offset = 0;
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    assert.equal(bytes.readUInt16LE(offset + 6), 0);
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    assert.equal(bytes.readUInt16LE(offset + 10), 0);
    assert.equal(bytes.readUInt16LE(offset + 12), 33);
    const checksum = bytes.readUInt32LE(offset + 14), size = bytes.readUInt32LE(offset + 18);
    assert.equal(bytes.readUInt32LE(offset + 22), size);
    const nameSize = bytes.readUInt16LE(offset + 26);
    assert.equal(bytes.readUInt16LE(offset + 28), 0);
    const name = bytes.toString('utf8', offset + 30, offset + 30 + nameSize);
    const data = bytes.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size);
    assert.equal(crc32(data), checksum);
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.equal(bytes.readUInt16LE(central + 8), 0);
    assert.equal(bytes.readUInt16LE(central + 10), 0);
    assert.equal(bytes.readUInt16LE(central + 12), 0);
    assert.equal(bytes.readUInt16LE(central + 14), 33);
    assert.equal(bytes.readUInt32LE(central + 16), checksum);
    assert.equal(bytes.readUInt32LE(central + 20), size);
    assert.equal(bytes.readUInt32LE(central + 24), size);
    assert.equal(bytes.readUInt16LE(central + 28), nameSize);
    assert.equal(bytes.readUInt16LE(central + 30), 0);
    assert.equal(bytes.readUInt16LE(central + 32), 0);
    assert.equal(bytes.readUInt16LE(central + 34), 0);
    assert.equal(bytes.readUInt32LE(central + 42), offset);
    assert.equal(bytes.toString('utf8', central + 46, central + 46 + nameSize), name);
    entries.push({name, data});
    central += 46 + nameSize;
    offset += 30 + nameSize + size;
  }
  assert.equal(offset, centralOffset);
  assert.equal(central, end);
  return entries;
}

test('ZIP stores ordered verbatim JPEGs with CRC32 and unique clamped timestamp names', async () => {
  const {makeZIP} = exportsWith();
  const pages = [page(3661.9), page(0), page(-20), page(NaN), page(Infinity), page(360000), page()];
  delete pages[6].sourceTime;
  pages[1].data = 'data:image/jpeg;base64,' + Buffer.concat([jpeg, Buffer.from('second')]).toString('base64');
  const blob = makeZIP(pages);
  assert.equal(blob.type, 'application/zip');
  const entries = readZIP(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual(entries.map(x => x.name), [
    '001-01-01-01.jpg', '002-00-00-00.jpg', '003-00-00-00.jpg', '004-00-00-00.jpg',
    '005-00-00-00.jpg', '006-100-00-00.jpg', '007-00-00-00.jpg'
  ]);
  for (let i = 0; i < entries.length; i++) assert.deepEqual(entries[i].data, Buffer.from(pages[i].data.split(',')[1], 'base64'));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('ZIP rejects ZIP32 count and byte overflows before allocating or truncating', () => {
  const {makeZIP} = exportsWith();
  assert.throws(() => makeZIP({length: 65536}), /ZIP32.*(limit|overflow)/i);
  const large = exportsWith({atob: () => ({length: 0xffffffff})});
  assert.throws(() => large.makeZIP([page()]), /ZIP32.*(limit|overflow)/i);
});

test('manifest icons are exact square RGBA PNGs derived from the approved art', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  for (const size of [16, 32, 48, 128]) {
    assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    const image = sharp(path.join(__dirname, '..', manifest.icons[size]));
    const metadata = await image.metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.equal(metadata.channels, 4);
    assert.equal(metadata.hasAlpha, true);
    const stats = await image.stats();
    assert.ok(stats.channels[0].max > 150 && stats.channels[0].min < 150);
  }
});
