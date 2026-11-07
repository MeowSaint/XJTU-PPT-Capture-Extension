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

for (const cacheKind of ['absent', 'successful', 'rejecting']) {
  test(`downloadBlob delayed cleanup handles ${cacheKind} cache without retaining URLs`, async () => {
    const captureSource = fs.readFileSync(path.join(__dirname, '../capture.js'), 'utf8');
    const start = captureSource.indexOf('const downloadURLs = new Set();');
    const end = captureSource.indexOf("window.addEventListener('pagehide'", start);
    assert(start >= 0 && end > start, 'exercise the production download helper');
    const timers = [], revoked = [], messages = [], actions = []; let removals = 0;
    const context = vm.createContext({
      URL: {createObjectURL: () => 'blob:fixture-download', revokeObjectURL: url => revoked.push(url)},
      document: {createElement: () => ({click: () => actions.push('click'), remove: () => actions.push('remove')}),
        body: {append: () => actions.push('append')}},
      setTimeout: (fn, delay) => { assert.equal(delay, 60000); timers.push(fn); }, status: message => messages.push(message)
    });
    vm.runInContext(captureSource.slice(start, end), context);
    context.cache = cacheKind === 'absent' ? undefined : {remove: async () => { removals++; if (cacheKind === 'rejecting') throw Error('synthetic cleanup failure'); }};
    vm.runInContext("downloadBlob({}, '课程完整性报告.json', cache)", context);
    assert.deepEqual(actions, ['append', 'click', 'remove']); assert.equal(timers.length, 1);
    assert.equal(vm.runInContext('downloadURLs.size', context), 1);
    assert.doesNotThrow(() => timers[0]()); await new Promise(setImmediate);
    assert.deepEqual(revoked, ['blob:fixture-download']); assert.equal(vm.runInContext('downloadURLs.size', context), 0);
    assert.equal(removals, cacheKind === 'absent' ? 0 : 1);
    assert.deepEqual(messages, cacheKind === 'rejecting' ? ['下载临时文件清理失败：synthetic cleanup failure'] : []);
  });
}
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

function outlines(pdf) {
  const root = pdf.catalog.lookup(PDFName.of('Outlines'));
  if (!root) return [];
  const result = [], refs = new Set(); let ref = root.get(PDFName.of('First')), previous;
  while (ref) {
    assert(!refs.has(ref.toString()), 'outline links must terminate'); refs.add(ref.toString());
    const item = pdf.context.lookup(ref);
    assert.equal(item.get(PDFName.of('Parent')).toString(), pdf.catalog.get(PDFName.of('Outlines')).toString());
    assert.equal(item.get(PDFName.of('Prev'))?.toString(), previous?.toString());
    result.push({title: item.get(PDFName.of('Title')).decodeText(), dest: item.lookup(PDFName.of('Dest'))});
    previous = ref; ref = item.get(PDFName.of('Next'));
  }
  assert.equal(root.get(PDFName.of('Last')).toString(), previous.toString());
  assert.equal(root.get(PDFName.of('Count')).asNumber(), result.length);
  return result;
}

for (const layout of ['single', 'handout']) for (const timestamps of [false, true]) for (const bookmarks of [false, true]) {
  test(`${layout} timestamps=${timestamps} bookmarks=${bookmarks}: independent options, JPEG order, outlines and stream parity`, async () => {
    const api = exportsWith(), options = {layout, timestamps, bookmarks};
    const originals = [page(3661.9, 1920, 1080), page(0, 900, 1600), page(NaN)];
    originals.forEach((p, i) => { p.data = 'data:image/jpeg;base64,' + Buffer.concat([jpeg, Buffer.from([i])]).toString('base64'); });
    for (const count of [0, 1, 2, 3]) {
      const slides = originals.slice(0, count), chunks = [], reads = [];
      const bytes = Buffer.from(await api.makePDF(slides, options).arrayBuffer());
      await api.writePDF(metadata(slides), {...options, readImage: async p => {
        reads.push(p.id); return Uint8Array.from(Buffer.from(slides[p.id].data.split(',')[1], 'base64'));
      }, write: async bytes => { chunks.push(Buffer.from(bytes)); }});
      assert.deepEqual(Buffer.concat(chunks), bytes); assert.deepEqual(reads, slides.map((_, i) => i));
      if (!timestamps && !bookmarks) assert.deepEqual(bytes, Buffer.from(await api.makePDF(slides, {layout}).arrayBuffer()));
      const pdf = await PDFDocument.load(bytes), entries = outlines(pdf);
      assert.equal(entries.length, bookmarks ? count : 0);
      assert.equal(pdf.getPageCount(), Math.ceil(count / (layout === 'handout' ? 2 : 1)));
      for (let i = 0; i < count; i++) {
        const handout = layout === 'handout', sheet = pdf.getPage(handout ? Math.floor(i / 2) : i), commands = content(pdf, sheet);
        const image = sheet.node.Resources().lookup(PDFName.of('XObject')).lookup(PDFName.of('Im' + (handout ? i % 2 : 0)));
        assert.deepEqual(Buffer.from(image.contents), Buffer.from(slides[i].data.split(',')[1], 'base64'));
        const time = ['01:01:01', '00:00:00', ''][i];
        if (time) assert.equal(commands.includes(time), timestamps);
        if (handout) assert(commands.includes(`(${i + 1}${timestamps && time ? ' - ' + time : ''}) Tj`));
        else {
          const height = 842 * slides[i].h / slides[i].w, footer = timestamps && time ? 28 : 0;
          assert.equal(sheet.getHeight(), height + footer);
          assert(commands.includes(`0 ${footer} cm /Im0 Do Q`));
          if (footer) assert.match(commands, /24 10 Td \(\d+:\d{2}:\d{2}\) Tj/);
        }
        if (bookmarks) {
          assert.equal(entries[i].title, `Page ${i + 1}${time ? ' - ' + time : ''}`);
          assert.equal(entries[i].dest.get(0).toString(), sheet.ref.toString());
          assert.equal(entries[i].dest.get(1).toString(), '/XYZ');
          const top = entries[i].dest.get(3).asNumber();
          assert.equal(top, handout ? (i % 2 ? 364 : 758) : sheet.getHeight());
          assert(top >= 0 && top <= sheet.getHeight());
        }
      }
    }
  });
}

test('PDF annotations omit invalid time values and accept only boolean true options', async () => {
  const {makePDF} = exportsWith(), slides = [-1, NaN, Infinity, -Infinity, undefined, null, '60', 0, 360000.9].map(time => ({...page(), sourceTime: time}));
  for (const layout of ['single', 'handout']) {
    const pdf = await PDFDocument.load(await makePDF(slides, {layout, timestamps: true, bookmarks: true}).arrayBuffer());
    const titles = outlines(pdf).map(entry => entry.title);
    assert.deepEqual(titles, ['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5', 'Page 6', 'Page 7', 'Page 8 - 00:00:00', 'Page 9 - 100:00:00']);
    const text = pdf.getPages().map(p => content(pdf, p)).join('\n');
    assert.equal((text.match(/\d+:\d{2}:\d{2}/g) || []).length, 2);
    const original = Buffer.from(await makePDF(slides, {layout}).arrayBuffer());
    assert.deepEqual(Buffer.from(await makePDF(slides, {layout, timestamps: 'true', bookmarks: 1}).arrayBuffer()), original);
  }
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

const formats = [
  {name: 'single PDF', make: 'makePDF', write: 'writePDF', options: {}, hash: '2ff871ef819f0177e796cb8796b97f9dfd23dfb6737f5e8c73cb1a12effb7095'},
  {name: 'handout PDF', make: 'makeHandoutPDF', write: 'writePDF', options: {layout: 'handout'}, hash: '5e13dffc79ce0921cd166927fdceff21a7433606b9c140cdee9335ea4214999d'},
  {name: 'ZIP', make: 'makeZIP', write: 'writeZIP', options: {}, hash: '50853a6f79a7cfd498034215bb3bc94ba6b9165acd48dcbc8833667b5987a46d'},
  {name: 'annotated single PDF', make: 'makePDF', write: 'writePDF', options: {timestamps: true, bookmarks: true}},
  {name: 'annotated handout PDF', make: 'makePDF', write: 'writePDF', options: {layout: 'handout', timestamps: true, bookmarks: true}}
];
function metadata(pages) {
  return pages.map(({data, ...p}, id) => Object.defineProperty({...p, id}, 'data', {
    get() { assert.fail('streaming exports must read JPEGs through readImage'); }
  }));
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

for (const format of formats) {
  if (format.hash) test(`${format.name} preserves legacy multi-page byte fingerprints`, async () => {
    const api = exportsWith();
    const images = [Buffer.from([0xff, 0xd8, 0, 0x80, 0xff, 0xd9]), Buffer.from('second image'), Buffer.from([0, 1, 255])];
    const pages = images.map((bytes, i) => ({data: 'data:image/jpeg;base64,' + bytes.toString('base64'), w: [7, 3, 1920][i], h: [3, 7, 1080][i], sourceTime: [3661.9, -20, Number.MAX_VALUE][i]}));
    const bytes = Buffer.from(await api[format.make](pages).arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), format.hash);
  });

  test(`streaming ${format.name} matches synchronous bytes for empty, even, and odd page counts`, async () => {
    const api = exportsWith();
    assert.equal(typeof api[format.write], 'function');
    const fixtures = [page(3661.9), page(-20, 3, 7), page(NaN, 1920, 1080), page(Infinity), page(Number.MAX_VALUE), page()];
    delete fixtures[5].sourceTime;
    fixtures[1].data = 'data:image/jpeg;base64,' + Buffer.concat([jpeg, Buffer.from([0, 255, 128])]).toString('base64');
    for (const count of [0, 1, 2, 3, 6]) {
      const originals = fixtures.slice(0, count), pages = metadata(originals), chunks = [], reads = [];
      const result = await api[format.write](pages, {
        ...format.options,
        async readImage(p) {
          assert.equal(p, pages[reads.length]);
          reads.push(p);
          return Uint8Array.from(Buffer.from(originals[p.id].data.split(',')[1], 'base64'));
        },
        async write(chunk) {
          assert.ok(chunk instanceof Uint8Array);
          chunks.push(Buffer.from(chunk));
        }
      });
      assert.equal(result, undefined);
      assert.deepEqual(reads, pages);
      assert.deepEqual(Buffer.concat(chunks), Buffer.from(await api[format.make](originals, format.options).arrayBuffer()), `${count} pages`);
    }
  });

  test(`streaming ${format.name} waits for every asynchronous read and write`, {timeout: 5000}, async () => {
    const api = exportsWith();
    assert.equal(typeof api[format.write], 'function');
    const pages = metadata([page(), page(1), page(2)]), pending = [], events = [];
    let image = null, reads = 0, payloads = 0, finished = false;
    const exporting = api[format.write](pages, {
      ...format.options,
      readImage(p) {
        assert.equal(image, null, 'the previous JPEG must be written before another is read');
        assert.equal(p, pages[reads++]);
        image = Uint8Array.of(255, p.id, 0, 128);
        events.push('read');
        return new Promise(resolve => pending.push(() => resolve(image)));
      },
      write(chunk) {
        assert.ok(chunk instanceof Uint8Array);
        events.push('write');
        return new Promise(resolve => pending.push(() => {
          if (chunk === image) { image = null; payloads++; }
          resolve();
        }));
      }
    });
    exporting.then(() => { finished = true; }, () => { finished = true; });
    while (!finished) {
      await nextTurn();
      if (finished) break;
      assert.equal(pending.length, 1, 'only one read or write may be in flight');
      const count = events.length;
      await nextTurn();
      assert.equal(events.length, count, 'a pending operation must stop generation');
      pending.shift()();
    }
    await exporting;
    assert.equal(pending.length, 0);
    assert.equal(reads, pages.length);
    assert.equal(payloads, pages.length);
    assert.equal(image, null);
  });

  test(`streaming ${format.name} reads 1000 metadata-only pages one JPEG at a time`, async () => {
    const api = exportsWith();
    assert.equal(typeof api[format.write], 'function');
    const pages = Array.from({length: 1000}, (_, id) => ({id, w: 7, h: 3, sourceTime: id}));
    let image = null, reads = 0, payloads = 0, writing = false;
    await api[format.write](pages, {
      ...format.options,
      async readImage(p) {
        assert.equal(writing, false);
        assert.equal(image, null, 'no JPEG read-ahead or whole-export buffering');
        assert.equal(p, pages[reads++]);
        await Promise.resolve();
        image = Uint8Array.of(p.id & 255, 0, 255);
        return image;
      },
      async write(chunk) {
        assert.equal(writing, false);
        writing = true;
        await Promise.resolve();
        if (chunk === image) { image = null; payloads++; }
        writing = false;
      }
    });
    assert.equal(reads, 1000);
    assert.equal(payloads, 1000);
    assert.equal(image, null);
    assert.equal(writing, false);
  });

  for (const failAt of ['read', 'image write', 'final write']) {
    test(`streaming ${format.name} propagates ${failAt} errors and stops`, async () => {
      const api = exportsWith();
      assert.equal(typeof api[format.write], 'function');
      const pages = metadata([page(), page(1), page(2)]), failure = new Error(`${failAt} failed`);
      let image, reads = 0, writes = 0;
      await assert.rejects(api[format.write](pages, {
        ...format.options,
        async readImage(p) {
          reads++;
          await Promise.resolve();
          if (failAt === 'read' && p.id === 1) throw failure;
          image = Uint8Array.of(p.id, 255);
          return image;
        },
        async write(chunk) {
          writes++;
          await Promise.resolve();
          const final = format.name === 'ZIP' ? chunk.length === 22 && new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true) === 0x06054b50 : Buffer.from(chunk).toString('ascii').endsWith('%%EOF');
          if ((failAt === 'image write' && chunk === image) || (failAt === 'final write' && final)) throw failure;
        }
      }), error => error === failure);
      assert.equal(reads, failAt === 'read' ? 2 : failAt === 'image write' ? 1 : 3);
      const stopped = {reads, writes};
      await nextTurn();
      assert.deepEqual({reads, writes}, stopped);
    });
  }
}

// Simulate ZIP32 byte lengths without allocating gigabytes or iterating payloads.
function sizedImage(length) {
  return Object.defineProperty(new Uint8Array(), 'length', {value: length});
}

test('streaming ZIP accepts the exact ZIP32 size limit and rejects one byte more before CRC or writes', async () => {
  const {writeZIP} = exportsWith();
  assert.equal(typeof writeZIP, 'function');
  const max = 0xffffffff, nameSize = Buffer.byteLength('001-00-00-00.jpg');
  const payloadSize = max - (30 + nameSize) - (46 + nameSize) - 22;
  const image = sizedImage(payloadSize), headers = [];
  let length = 0;
  await writeZIP([{sourceTime: 0}], {
    async readImage() { return image; },
    async write(chunk) {
      length += chunk.length;
      if (chunk !== image) headers.push(Buffer.from(chunk));
    }
  });
  assert.equal(length, max);
  assert.equal(headers.length, 3);
  assert.equal(headers[0].readUInt32LE(18), payloadSize);
  assert.equal(headers[1].readUInt32LE(20), payloadSize);
  assert.equal(headers[1].readUInt32LE(42), 0);
  assert.equal(headers[2].readUInt32LE(16), 30 + nameSize + payloadSize);
  assert.equal(headers[2].readUInt32LE(12), 46 + nameSize);
  for (const size of [payloadSize + 1, max, max + 1]) {
    const oversized = sizedImage(size);
    oversized[Symbol.iterator] = () => { assert.fail('overflow must be checked before CRC iteration'); };
    let writes = 0;
    await assert.rejects(writeZIP([{}], {
      async readImage() { return oversized; },
      async write() { writes++; }
    }), /ZIP32.*(limit|overflow)/i);
    assert.equal(writes, 0);
  }
});

test('streaming ZIP includes accumulated local and central headers in ZIP32 overflow checks', async () => {
  const {writeZIP} = exportsWith();
  assert.equal(typeof writeZIP, 'function');
  const nameSize = Buffer.byteLength('001-00-00-00.jpg');
  const first = sizedImage(0xffffffff - (30 + nameSize) - (46 + nameSize) - 22 - 1);
  let reads = 0, writes = 0;
  await assert.rejects(writeZIP([{}, {}], {
    async readImage() { return reads++ === 0 ? first : new Uint8Array(); },
    async write() { writes++; }
  }), /ZIP32.*(limit|overflow)/i);
  assert.equal(reads, 2);
  assert.equal(writes, 2, 'only the first local header and image may have been written');
});

test('streaming ZIP accepts 65535 entries and rejects 65536 before reads or writes', async () => {
  const {writeZIP} = exportsWith();
  assert.equal(typeof writeZIP, 'function');
  let reads = 0, end;
  await writeZIP(Array.from({length: 65535}, () => ({})), {
    async readImage() { reads++; return new Uint8Array(); },
    async write(chunk) { if (chunk.length === 22) end = Buffer.from(chunk); }
  });
  assert.equal(reads, 65535);
  assert.equal(end.readUInt32LE(0), 0x06054b50);
  assert.equal(end.readUInt16LE(8), 65535);
  assert.equal(end.readUInt16LE(10), 65535);
  await assert.rejects(writeZIP({length: 65536}, {
    async readImage() { assert.fail('entry count overflow must precede reads'); },
    async write() { assert.fail('entry count overflow must precede writes'); }
  }), /ZIP32.*(limit|overflow)/i);
});

// Parse the central directory and each local record independently; descriptors end
// at the next recorded local offset, rather than trusting their reported sizes.
function readCourseZIP(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt32LE(end + 4), 0);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const count = bytes.readUInt16LE(end + 10), directory = bytes.readUInt32LE(end + 16);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  assert.equal(directory + bytes.readUInt32LE(end + 12), end);
  const entries = [];
  let central = directory;
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.equal(bytes.readUInt16LE(central + 4), 20);
    assert.equal(bytes.readUInt16LE(central + 6), 20);
    assert.equal(bytes.readUInt16LE(central + 8), 0x0808);
    assert.equal(bytes.readUInt16LE(central + 10), 0);
    assert.equal(bytes.readUInt16LE(central + 12), 0);
    assert.equal(bytes.readUInt16LE(central + 14), 33);
    const size = bytes.readUInt32LE(central + 20), nameSize = bytes.readUInt16LE(central + 28);
    assert.equal(bytes.readUInt32LE(central + 24), size);
    assert.equal(bytes.readUInt16LE(central + 30), 0);
    assert.equal(bytes.readUInt16LE(central + 32), 0);
    assert.equal(bytes.readUInt16LE(central + 34), 0);
    assert.equal(bytes.readUInt16LE(central + 36), 0);
    assert.equal(bytes.readUInt32LE(central + 38), 0);
    const nameBytes = bytes.subarray(central + 46, central + 46 + nameSize);
    entries.push({name: nameBytes.toString('utf8'), nameBytes, size,
      checksum: bytes.readUInt32LE(central + 16), offset: bytes.readUInt32LE(central + 42)});
    central += 46 + nameSize;
  }
  assert.equal(central, end);
  let offset = 0;
  for (const [i, entry] of entries.entries()) {
    assert.equal(entry.offset, offset);
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    assert.equal(bytes.readUInt16LE(offset + 4), 20);
    assert.equal(bytes.readUInt16LE(offset + 6), 0x0808);
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    assert.equal(bytes.readUInt16LE(offset + 10), 0);
    assert.equal(bytes.readUInt16LE(offset + 12), 33);
    assert.equal(bytes.readUInt32LE(offset + 14), 0);
    assert.equal(bytes.readUInt32LE(offset + 18), 0);
    assert.equal(bytes.readUInt32LE(offset + 22), 0);
    assert.equal(bytes.readUInt16LE(offset + 26), entry.nameBytes.length);
    assert.equal(bytes.readUInt16LE(offset + 28), 0);
    const start = offset + 30 + entry.nameBytes.length;
    assert.deepEqual(bytes.subarray(offset + 30, start), entry.nameBytes);
    offset = entries[i + 1]?.offset ?? directory;
    const descriptor = offset - 16;
    entry.data = bytes.subarray(start, descriptor);
    assert.equal(bytes.readUInt32LE(descriptor), 0x08074b50);
    assert.equal(bytes.readUInt32LE(descriptor + 4), crc32(entry.data));
    assert.equal(bytes.readUInt32LE(descriptor + 8), entry.data.length);
    assert.equal(bytes.readUInt32LE(descriptor + 12), entry.data.length);
    assert.equal(entry.checksum, crc32(entry.data));
    assert.equal(entry.size, entry.data.length);
  }
  assert.equal(offset, directory);
  return entries;
}

for (const layout of ['single', 'handout']) {
  test(`course ZIP stores ordered Chinese PDF members with ${layout} layout and skips empty lessons`, async () => {
    const api = exportsWith();
    assert.equal(typeof api.writeCourseZIP, 'function');
    const originals = [[page(), page(1, 3, 7), page(2)], [page(3, 3, 7)]];
    const lessons = [
      {name: '001-第一课 绪论.pdf', pages: []},
      {name: '001-第一课 绪论.pdf', pages: metadata(originals[0])},
      {name: '空课次', pages: []},
      {name: '002-第九课.PDF', pages: metadata(originals[1])},
      {name: '末尾空课次', pages: []}
    ];
    const expectedReads = lessons.flatMap(lesson => lesson.pages), reads = [], chunks = [];
    const result = await api.writeCourseZIP(lessons, {
      ...(layout === 'handout' ? {layout} : {}),
      async readImage(p) {
        assert.equal(p, expectedReads[reads.length]);
        reads.push(p);
        return Uint8Array.from(jpeg);
      },
      async write(chunk) { chunks.push(Buffer.from(chunk)); }
    });
    assert.equal(result, undefined);
    assert.deepEqual(reads, expectedReads);
    const entries = readCourseZIP(Buffer.concat(chunks));
    assert.deepEqual(entries.map(entry => entry.name), ['001-第一课 绪论.pdf', '002-第九课.PDF']);
    for (const [i, entry] of entries.entries()) {
      const pdf = await PDFDocument.load(entry.data);
      assert.equal(pdf.getPageCount(), Math.ceil(originals[i].length / (layout === 'handout' ? 2 : 1)));
      for (const [j, sheet] of pdf.getPages().entries()) {
        assert.deepEqual(sheet.getSize(), layout === 'handout' ? {width: 595, height: 842}
          : {width: 842, height: 842 * originals[i][j].h / originals[i][j].w});
      }
      assert.deepEqual(entry.data, Buffer.from(await api.makePDF(originals[i], {layout}).arrayBuffer()));
    }
  });
}

test('course ZIP forwards every annotation combination to every PDF member', async () => {
  const api = exportsWith(), originals = [[page(3661), page(NaN), page(60)], [page(0)]];
  for (const layout of ['single', 'handout']) for (const timestamps of [false, true]) for (const bookmarks of [false, true]) {
    const options = {layout, timestamps, bookmarks}, chunks = [];
    await api.writeCourseZIP(originals.map((slides, i) => ({name: `lesson-${i}.pdf`, pages: metadata(slides)})), {
      ...options, readImage: async () => Uint8Array.from(jpeg), write: async bytes => { chunks.push(Buffer.from(bytes)); }
    });
    const members = readCourseZIP(Buffer.concat(chunks)); assert.equal(members.length, 2);
    for (const [i, member] of members.entries()) {
      assert.deepEqual(member.data, Buffer.from(await api.makePDF(originals[i], options).arrayBuffer()));
      const pdf = await PDFDocument.load(member.data);
      assert.equal(outlines(pdf).length, bookmarks ? originals[i].length : 0);
      assert.equal(content(pdf, pdf.getPage(0)).includes(i ? '00:00:00' : '01:01:01'), timestamps);
    }
  }
});

test('course ZIP preserves safe names and resolves sanitized and duplicate names without taking unique names', async () => {
  const {writeCourseZIP} = exportsWith();
  assert.equal(typeof writeCourseZIP, 'function');
  const names = ['001-中文 课次.pdf', '重复.pdf', '重复.pdf', '重复 (2).pdf', '../坏\\名?.pdf',
    'CON.pdf', ' . ', '尾点. ', 'chapter', '终章.PDF', '控制\0\t\n符.pdf', 'chapter.pdf'];
  const chunks = [];
  await writeCourseZIP(names.map(name => ({name, pages: [page()]})), {
    async readImage() { return Uint8Array.from(jpeg); },
    async write(chunk) { chunks.push(Buffer.from(chunk)); }
  });
  const entries = readCourseZIP(Buffer.concat(chunks));
  assert.deepEqual(entries.map(entry => entry.name), ['001-中文 课次.pdf', '重复.pdf', '重复 (3).pdf',
    '重复 (2).pdf', '.._坏_名_.pdf', '_CON.pdf', 'lesson.pdf', '尾点.pdf', 'chapter.pdf',
    '终章.PDF', '控制___符.pdf', 'chapter (2).pdf']);
  assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
  for (const entry of entries) {
    assert.doesNotMatch(entry.name, /[\\/<>:"|?*\u0000-\u001f\u007f]|[ .]$/);
    assert.equal((await PDFDocument.load(entry.data)).getPageCount(), 1);
  }
});

test('course ZIP writes a valid empty archive and counts only nonempty lessons', async () => {
  const {writeCourseZIP} = exportsWith();
  assert.equal(typeof writeCourseZIP, 'function');
  const lessons = Array.from({length: 65536}, () => ({name: 'empty', pages: []})), chunks = [];
  await writeCourseZIP(lessons, {
    async readImage() { assert.fail('empty lessons must not read images'); },
    async write(chunk) { chunks.push(Buffer.from(chunk)); }
  });
  assert.equal(Buffer.concat(chunks).length, 22);
  assert.deepEqual(readCourseZIP(Buffer.concat(chunks)), []);
});

for (const layout of ['single', 'handout']) for (const annotations of [false, true]) {
  test(`course ZIP ${layout} annotations=${annotations} waits for each asynchronous operation and writes JPEGs directly`, {timeout: 5000}, async () => {
    const {writeCourseZIP} = exportsWith({
      Blob: class { constructor() { assert.fail('course ZIP must not collect a PDF Blob'); } },
      atob() { assert.fail('course ZIP must use readImage'); }
    });
    assert.equal(typeof writeCourseZIP, 'function');
    const pages = metadata([page(), page(1), page(2), page(3), page(4)]), pending = [], events = [];
    const lessons = [{name: '第一节', pages: pages.slice(0, 3)}, {name: 'empty', pages: []},
      {name: '第二节', pages: pages.slice(3)}];
    let image = null, reads = 0, payloads = 0, finished = false;
    const exporting = writeCourseZIP(lessons, {
      layout, timestamps: annotations, bookmarks: annotations,
      readImage(p) {
        assert.equal(image, null, 'the previous JPEG must reach the outer writer before the next read');
        assert.equal(p, pages[reads++]);
        image = Uint8Array.of(255, p.id, 0, 128);
        events.push('read');
        return new Promise(resolve => pending.push(() => resolve(image)));
      },
      write(chunk) {
        assert.ok(chunk instanceof Uint8Array);
        events.push('write');
        return new Promise(resolve => pending.push(() => {
          if (chunk === image) { image = null; payloads++; }
          resolve();
        }));
      }
    });
    exporting.then(() => { finished = true; }, () => { finished = true; });
    while (!finished) {
      await nextTurn();
      if (finished) break;
      assert.equal(pending.length, 1, 'only one read or write may be in flight');
      const count = events.length;
      await nextTurn();
      assert.equal(events.length, count, 'a pending operation must stop PDF and ZIP generation');
      pending.shift()();
    }
    await exporting;
    assert.equal(pending.length, 0);
    assert.equal(reads, pages.length);
    assert.equal(payloads, pages.length);
    assert.equal(image, null);
  });
}

test('course ZIP streams 1000 metadata-only pages across lessons one JPEG at a time', async () => {
  const {writeCourseZIP} = exportsWith();
  assert.equal(typeof writeCourseZIP, 'function');
  const pages = Array.from({length: 1000}, (_, id) => ({id, w: 7, h: 3}));
  let image = null, reads = 0, payloads = 0, writing = false;
  await writeCourseZIP([{name: 'first', pages: pages.slice(0, 700)}, {name: 'second', pages: pages.slice(700)}], {
    async readImage(p) {
      assert.equal(writing, false);
      assert.equal(image, null, 'no JPEG read-ahead or whole-PDF buffering');
      assert.equal(p, pages[reads++]);
      await Promise.resolve();
      image = Uint8Array.of(p.id & 255, 0, 255);
      return image;
    },
    async write(chunk) {
      assert.equal(writing, false);
      writing = true;
      await Promise.resolve();
      if (chunk === image) { image = null; payloads++; }
      writing = false;
    }
  });
  assert.equal(reads, 1000);
  assert.equal(payloads, 1000);
  assert.equal(image, null);
});

for (const failAt of ['read', 'local write', 'image write', 'descriptor write', 'central write', 'final write']) {
  test(`course ZIP propagates ${failAt} errors and stops`, async () => {
    const {writeCourseZIP} = exportsWith();
    assert.equal(typeof writeCourseZIP, 'function');
    const pages = metadata([page(), page(1), page(2), page(3), page(4)]);
    const failure = new Error(`${failAt} failed`);
    let image, reads = 0, writes = 0;
    await assert.rejects(writeCourseZIP([{name: 'first', pages: pages.slice(0, 3)},
      {name: 'second', pages: pages.slice(3)}], {
      async readImage(p) {
        reads++;
        await Promise.resolve();
        if (failAt === 'read' && p.id === 1) throw failure;
        image = Uint8Array.of(p.id, 255);
        return image;
      },
      async write(chunk) {
        writes++;
        await Promise.resolve();
        const signature = chunk.byteLength >= 4 ? new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true) : 0;
        if ((failAt === 'local write' && signature === 0x04034b50)
          || (failAt === 'image write' && chunk === image)
          || (failAt === 'descriptor write' && signature === 0x08074b50)
          || (failAt === 'central write' && signature === 0x02014b50)
          || (failAt === 'final write' && signature === 0x06054b50)) throw failure;
      }
    }), error => error === failure);
    assert.equal(reads, {'read': 2, 'local write': 0, 'image write': 1, 'descriptor write': 3,
      'central write': 5, 'final write': 5}[failAt]);
    const stopped = {reads, writes};
    await nextTurn();
    assert.deepEqual({reads, writes}, stopped);
  });
}

// Size the existing PDF stream using zero-allocation JPEG stand-ins.
async function imageSizeForPDF(api, target) {
  let size = target;
  for (let attempt = 0; attempt < 5; attempt++) {
    let length = 0;
    await api.writePDF([{w: 7, h: 3}], {
      async readImage() { return sizedImage(size); },
      async write(chunk) { length += chunk.length; }
    });
    if (length === target) return size;
    size += target - length;
  }
  assert.fail('PDF size calculation must converge');
}

test('course ZIP accepts the exact ZIP32 byte limit and rejects oversized chunks before CRC or payload writes', async () => {
  const api = exportsWith();
  assert.equal(typeof api.writeCourseZIP, 'function');
  const max = 0xffffffff, name = '课次.pdf', nameSize = Buffer.byteLength(name);
  const pdfSize = max - (30 + nameSize) - 16 - (46 + nameSize) - 22;
  const imageSize = await imageSizeForPDF(api, pdfSize), image = sizedImage(imageSize), headers = [];
  let length = 0;
  await api.writeCourseZIP([{name, pages: [{w: 7, h: 3}]}], {
    async readImage() { return image; },
    async write(chunk) {
      length += chunk.length;
      if (chunk !== image && chunk.byteLength >= 4) {
        const signature = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true);
        if ([0x04034b50, 0x08074b50, 0x02014b50, 0x06054b50].includes(signature)) headers.push(Buffer.from(chunk));
      }
    }
  });
  assert.equal(length, max);
  assert.equal(headers.length, 4);
  assert.equal(headers[0].readUInt32LE(18), 0);
  assert.equal(headers[1].readUInt32LE(8), pdfSize);
  assert.equal(headers[2].readUInt32LE(20), pdfSize);
  assert.equal(headers[2].readUInt32LE(42), 0);
  assert.equal(headers[3].readUInt32LE(16), 30 + nameSize + pdfSize + 16);
  assert.equal(headers[3].readUInt32LE(12), 46 + nameSize);
  const oneByteOver = sizedImage(imageSize + 1);
  let wroteEnd = false;
  await assert.rejects(api.writeCourseZIP([{name, pages: [{w: 7, h: 3}]}], {
    async readImage() { return oneByteOver; },
    async write(chunk) {
      if (chunk !== oneByteOver && chunk.byteLength >= 4
        && new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true) === 0x06054b50) wroteEnd = true;
    }
  }), /ZIP32.*(limit|overflow)/i);
  assert.equal(wroteEnd, false, 'overflow must not produce a completed archive');
  for (const size of [max, max + 1]) {
    const oversized = sizedImage(size);
    oversized[Symbol.iterator] = () => { assert.fail('overflow must precede CRC iteration'); };
    await assert.rejects(api.writeCourseZIP([{name, pages: [{w: 7, h: 3}]}], {
      async readImage() { return oversized; },
      async write(chunk) { assert.notEqual(chunk, oversized, 'overflow must precede the payload write'); }
    }), /ZIP32.*(limit|overflow)/i);
  }
});

test('course ZIP reserves all local headers, descriptors and central records before consuming remaining space', async () => {
  const api = exportsWith();
  assert.equal(typeof api.writeCourseZIP, 'function');
  const nameSize = Buffer.byteLength('a.pdf');
  const pdfSize = 0xffffffff - 2 * (30 + nameSize + 16 + 46 + nameSize) - 22 - 1;
  const image = sizedImage(await imageSizeForPDF(api, pdfSize));
  let reads = 0, descriptors = 0;
  await assert.rejects(api.writeCourseZIP([{name: 'a.pdf', pages: [{w: 7, h: 3}]},
    {name: 'b.pdf', pages: [{w: 7, h: 3}]}], {
    async readImage() { reads++; return image; },
    async write(chunk) {
      if (chunk !== image && chunk.byteLength >= 4
        && new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true) === 0x08074b50) descriptors++;
    }
  }), /ZIP32.*(limit|overflow)/i);
  assert.equal(reads, 1, 'second PDF must fail before reading another JPEG');
  assert.equal(descriptors, 1);
});

test('course ZIP checks UTF-8 filename lengths and minimum archive totals before I/O', async () => {
  const api = exportsWith();
  assert.equal(typeof api.writeCourseZIP, 'function');
  const name = '中'.repeat(21843) + 'aa.pdf'; // Exactly 65535 UTF-8 bytes.
  const chunks = [];
  await api.writeCourseZIP([{name, pages: [page()]}], {
    async readImage() { return Uint8Array.from(jpeg); },
    async write(chunk) { chunks.push(Buffer.from(chunk)); }
  });
  assert.equal(readCourseZIP(Buffer.concat(chunks))[0].name, name);
  const noIO = {
    async readImage() { assert.fail('metadata overflow must precede image reads'); },
    async write() { assert.fail('metadata overflow must precede writes'); }
  };
  for (const invalid of [name + 'a', 'a'.repeat(65536)]) {
    await assert.rejects(api.writeCourseZIP([{name: invalid, pages: [page()]}], noIO), /ZIP32.*(limit|overflow)/i);
  }
  const largeNames = exportsWith({TextEncoder: class extends TextEncoder {
    encode() { return sizedImage(65535); }
  }});
  await assert.rejects(largeNames.writeCourseZIP(Array.from({length: 32768}, (_, i) => ({name: `${i}.pdf`, pages: [page()]})), noIO),
    /ZIP32.*(limit|overflow)/i);
});

test('course ZIP accepts 65535 nonempty members and rejects 65536 before reads or writes', async () => {
  const {writeCourseZIP} = exportsWith();
  assert.equal(typeof writeCourseZIP, 'function');
  const pages = [{w: 7, h: 3}];
  const lessons = Array.from({length: 65535}, (_, i) => ({name: `${i}.pdf`, pages}));
  let reads = 0, end;
  await writeCourseZIP(lessons, {
    async readImage() { reads++; return new Uint8Array(); },
    async write(chunk) {
      if (chunk.byteLength === 22 && new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0, true) === 0x06054b50) end = Buffer.from(chunk);
    }
  });
  assert.equal(reads, 65535);
  assert.equal(end.readUInt16LE(8), 65535);
  assert.equal(end.readUInt16LE(10), 65535);
  lessons.push({name: 'overflow.pdf', pages});
  await assert.rejects(writeCourseZIP(lessons, {
    async readImage() { assert.fail('entry count overflow must precede reads'); },
    async write() { assert.fail('entry count overflow must precede writes'); }
  }), /ZIP32.*(limit|overflow)/i);
});

// Validate every link and expanded descendant count, including nested sibling chains.
function courseOutlines(pdf) {
  const seen = new Set(), key = name => PDFName.of(name);
  function children(parent, parentRef) {
    const result = []; let ref = parent.get(key('First')), previous, count = 0;
    while (ref) {
      assert(!seen.has(ref.toString()), 'outline tree must be acyclic'); seen.add(ref.toString());
      const item = pdf.context.lookup(ref);
      assert.equal(item.get(key('Parent')).toString(), parentRef.toString());
      assert.equal(item.get(key('Prev'))?.toString(), previous?.toString());
      const nested = children(item, ref), dest = item.lookup(key('Dest'));
      assert.equal(dest.get(1).toString(), '/XYZ'); assert.equal(dest.get(2).asNumber(), 0);
      assert.equal(dest.get(4).toString(), 'null');
      result.push({title: item.get(key('Title')).decodeText(), dest, children: nested.items});
      count += 1 + nested.count;
      previous = ref; ref = item.get(key('Next'));
    }
    assert.equal(parent.get(key('Last'))?.toString(), previous?.toString());
    assert.equal(parent.get(key('Count'))?.asNumber(), result.length ? count : undefined);
    return {items: result, count};
  }
  const ref = pdf.catalog.get(key('Outlines'));
  return ref ? children(pdf.context.lookup(ref), ref).items : [];
}
async function coursePDF(lessons, options = {}) {
  const chunks = [];
  await exportsWith().writeCoursePDF(lessons, {...options,
    readImage: async p => Uint8Array.from(Buffer.concat([jpeg, Buffer.from([p.id])])),
    write: async bytes => { chunks.push(Buffer.from(bytes)); }});
  return PDFDocument.load(Buffer.concat(chunks));
}

for (const layout of ['single', 'handout']) for (const timestamps of [false, true]) {
  test(`course PDF ${layout} timestamps=${timestamps} has full Unicode hierarchy and shared sheet destinations`, async () => {
    const title = '中文😀 (课程)\\标题\ud800', duplicate = '重复课次😀 (括号)\\尾\udc00';
    const slides = metadata([page(0), page(3661.9, 3, 7), page(-1), page(360000.9)]);
    const pdf = await coursePDF([{title: '空课', pages: []}, {title: duplicate, pages: slides.slice(0, 3)},
      {title: duplicate, pages: slides.slice(3)}, {title: '尾空课', pages: []}], {title, layout, timestamps, bookmarks: false});
    assert.equal(pdf.catalog.get(PDFName.of('PageMode')).toString(), '/UseOutlines');
    const tree = courseOutlines(pdf); assert.equal(tree.length, 1);
    assert.equal(tree[0].title, '中文😀 (课程)\\标题�');
    assert.deepEqual(tree[0].children.map(x => x.title), [duplicate.replace('\udc00', '�'), duplicate.replace('\udc00', '�')]);
    assert.deepEqual(tree[0].children.map(x => x.children.map(y => y.title)), [
      ['第 1 页 · 00:00:00', '第 2 页 · 01:01:01', '第 3 页'], ['第 1 页 · 100:00:00']]);
    const handout = layout === 'handout'; assert.equal(pdf.getPageCount(), handout ? 3 : 4);
    const leaves = tree[0].children.flatMap(x => x.children), indices = handout ? [0, 0, 1, 2] : [0, 1, 2, 3];
    for (const [i, leaf] of leaves.entries()) {
      const sheet = pdf.getPage(indices[i]), row = handout && i === 1 ? 1 : 0;
      assert.equal(leaf.dest.get(0).toString(), sheet.ref.toString());
      assert.equal(leaf.dest.get(3).asNumber(), handout ? row ? 364 : 758 : sheet.getHeight());
      const image = sheet.node.Resources().lookup(PDFName.of('XObject')).lookup(PDFName.of('Im' + row));
      assert.deepEqual(Buffer.from(image.contents), Buffer.concat([jpeg, Buffer.from([i])]));
      const commands = content(pdf, sheet), time = ['00:00:00', '01:01:01', '', '100:00:00'][i];
      if (time) assert.equal(commands.includes(time), timestamps);
      if (handout) assert(commands.includes(`(${i + 1}${timestamps && time ? ' - ' + time : ''}) Tj`));
      else assert.equal(sheet.getHeight(), 842 * slides[i].h / slides[i].w + (timestamps && time ? 28 : 0));
    }
    for (const parent of [tree[0], ...tree[0].children]) {
      const first = parent.children[0]; assert.equal(parent.dest.toString(), first.dest.toString());
    }
    if (handout) pdf.getPages().forEach((sheet, i) => assert(content(pdf, sheet).includes(`(${i + 1} / 3) Tj`)));
  });
}
for (const sizes of [[3, 1], [1, 1], [2, 3]]) {
  test(`course handout [${sizes}] starts every lesson at the upper row without numbering gaps`, async () => {
    let id = 0;
    const lessons = sizes.map(size => ({title: '课次', pages: Array.from({length: size}, () => ({id: id++, w: 7, h: 3}))}));
    const pdf = await coursePDF(lessons, {layout: 'handout'}), tree = courseOutlines(pdf)[0];
    assert.equal(tree.title, '未命名课程'); assert.equal(pdf.getPageCount(), sizes.reduce((sum, n) => sum + Math.ceil(n / 2), 0));
    let sheetIndex = 0, number = 0;
    for (const [index, size] of sizes.entries()) {
      const lesson = tree.children[index];
      assert.equal(lesson.dest.get(0).toString(), pdf.getPage(sheetIndex).ref.toString());
      assert.equal(lesson.dest.get(3).asNumber(), 758);
      for (let i = 0; i < size; i++) {
        const sheet = pdf.getPage(sheetIndex + Math.floor(i / 2)), row = i % 2, leaf = lesson.children[i];
        const image = sheet.node.Resources().lookup(PDFName.of('XObject')).lookup(PDFName.of('Im' + row));
        assert.deepEqual(Buffer.from(image.contents), Buffer.concat([jpeg, Buffer.from([number])]));
        assert(content(pdf, sheet).includes(`(${++number}) Tj`));
        assert.equal(leaf.title, `第 ${i + 1} 页`); assert.equal(leaf.dest.get(0).toString(), sheet.ref.toString());
        assert.equal(leaf.dest.get(3).asNumber(), row ? 364 : 758);
      }
      sheetIndex += Math.ceil(size / 2);
    }
  });
}
test('course PDF omits invalid outline times and accepts empty lessons as a valid zero-page file', async () => {
  const times = [-1, NaN, Infinity, -Infinity, undefined, null, '60', 0, 360000.9];
  const pdf = await coursePDF([{title: '课', pages: times.map((sourceTime, id) => ({id, w: 7, h: 3, sourceTime}))}]);
  assert.deepEqual(courseOutlines(pdf)[0].children[0].children.map(x => x.title),
    times.map((_, i) => `第 ${i + 1} 页` + (i === 7 ? ' · 00:00:00' : i === 8 ? ' · 100:00:00' : '')));
  for (const lessons of [[], [{title: '空', pages: []}]]) {
    const empty = await coursePDF(lessons); assert.equal(empty.getPageCount(), 0); assert.deepEqual(courseOutlines(empty), []);
  }
});

for (const layout of ['single', 'handout']) {
  test(`course PDF ${layout} honors controlled backpressure across lesson boundaries without collecting images`, {timeout: 5000}, async () => {
    const {writeCoursePDF} = exportsWith({Blob: class { constructor() { assert.fail('no course Blob'); } }, atob() { assert.fail('no data URL reads'); }});
    assert.equal(typeof writeCoursePDF, 'function');
    const slides = metadata([page(), page(), page(), page()]), pending = [];
    let image = null, reads = 0, payloads = 0, finished = false;
    const exporting = writeCoursePDF([{title: '一', pages: slides.slice(0, 3)}, {title: '二', pages: slides.slice(3)}], {
      layout, title: '课程', readImage(p) {
        assert.equal(image, null); assert.equal(p, slides[reads++]); image = Uint8Array.of(p.id, 255);
        return new Promise(resolve => pending.push(() => resolve(image)));
      }, write(chunk) {
        return new Promise(resolve => pending.push(() => { if (chunk === image) { image = null; payloads++; } resolve(); }));
      }});
    exporting.then(() => { finished = true; }, () => { finished = true; });
    while (!finished) {
      await nextTurn(); if (finished) break;
      assert.equal(pending.length, 1); await nextTurn(); assert.equal(pending.length, 1); pending.shift()();
    }
    await exporting; assert.equal(reads, 4); assert.equal(payloads, 4); assert.equal(image, null);
  });
}
test('course PDF streams 1000 metadata-only pages with one original JPEG in flight', async () => {
  const pages = Array.from({length: 1000}, (_, id) => ({id, w: 7, h: 3}));
  let image = null, reads = 0, payloads = 0, writing = false;
  await exportsWith().writeCoursePDF([{title: '一', pages: pages.slice(0, 701)}, {title: '二', pages: pages.slice(701)}], {
    readImage: async p => { assert(!writing); assert.equal(image, null); assert.equal(p, pages[reads++]); await Promise.resolve(); return image = Uint8Array.of(p.id & 255); },
    write: async chunk => { assert(!writing); writing = true; await Promise.resolve(); if (chunk === image) { image = null; payloads++; } writing = false; }});
  assert.equal(reads, 1000); assert.equal(payloads, 1000); assert.equal(image, null);
});
for (const failAt of ['read', 'header write', 'image write', 'outline write', 'xref write', 'final write']) {
  test(`course PDF propagates ${failAt} failure and stops later reads and writes`, async () => {
    const failure = Error(failAt), slides = metadata([page(), page(), page()]); let image, reads = 0, writes = 0;
    await assert.rejects(exportsWith().writeCoursePDF([{title: '课', pages: slides}], {
      readImage: async p => { reads++; if (failAt === 'read' && p.id === 1) throw failure; return image = Uint8Array.of(p.id, 255); },
      write: async chunk => {
        writes++; const text = Buffer.from(chunk).toString('ascii');
        if (failAt === 'header write' && text.startsWith('%PDF') || failAt === 'image write' && chunk === image
          || failAt === 'outline write' && text.startsWith('<< /Type /Outlines') || failAt === 'xref write' && text.startsWith('xref\n')
          || failAt === 'final write' && text.endsWith('%%EOF')) throw failure;
      }}), error => error === failure);
    assert.equal(reads, {'read': 2, 'header write': 0, 'image write': 1, 'outline write': 3, 'xref write': 3, 'final write': 3}[failAt]);
    const stopped = {reads, writes}; await nextTurn(); assert.deepEqual({reads, writes}, stopped);
  });
}

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
