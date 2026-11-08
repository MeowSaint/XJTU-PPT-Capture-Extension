/* Isolated Chromium regression: synthetic data only; JS heap figures are not process RSS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'v3.1.3'), `memory-${Date.now()}`);
fs.mkdirSync(output, {recursive: true});
const report = {node: process.version, platform: process.platform, results: [], errors: [], heap: {}, evidence: [],
  scope: 'Fresh Chromium contexts, localhost, synthetic images, injected failures, 256 MiB generated stream; JSHeapUsedSize is not RSS.'};
let browser, server, origin;
const contexts = new Set();

function instrument() {
  const live = new Map(), revoked = [];
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  const animate = Element.prototype.animate, animatedCards = [];
  Element.prototype.animate = function(...args) { if (this.matches('#pages article')) animatedCards.push(this.dataset.pageId); return animate.apply(this, args); };
  URL.createObjectURL = blob => { const url = create(blob); live.set(url, {size: blob.size, type: blob.type}); return url; };
  URL.revokeObjectURL = url => { live.delete(url); revoked.push(url); return revoke(url); };
  window.__memory = {
    live, revoked, animatedCards,
    async files() {
      const files = [];
      async function walk(directory, prefix) {
        for await (const [name, handle] of directory.entries()) {
          if (handle.kind === 'directory') await walk(handle, prefix + name + '/');
          else files.push({path: prefix + name, size: (await handle.getFile()).size});
        }
      }
      await walk(await navigator.storage.getDirectory(), '');
      return files.sort((a, b) => a.path.localeCompare(b.path));
    },
    read(db, store) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store), request = tx.objectStore(store).getAll();
        tx.oncomplete = () => resolve(request.result); tx.onabort = tx.onerror = () => reject(tx.error);
      });
    },
    count(db, store) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store), request = tx.objectStore(store).count();
        tx.oncomplete = () => resolve(request.result); tx.onabort = tx.onerror = () => reject(tx.error);
      });
    },
    async fixture() {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 1280, 720);
      gradient.addColorStop(0, '#143e72'); gradient.addColorStop(1, '#f3cf74'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#ffffff'; ctx.font = '52px sans-serif'; ctx.fillText('Synthetic memory regression', 60, 140);
      for (let i = 0; i < 12; i++) ctx.fillRect(60, 210 + i * 32, 1100 - i * 30, 4);
      const asset = await PPTPageStore.encode(canvas);
      const png = canvas.toDataURL('image/png'), webp = canvas.toDataURL('image/webp');
      const bytes = new Uint8Array(await asset.image.arrayBuffer());
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      const jpeg = canvas.toDataURL('image/jpeg', 0.95); canvas.width = canvas.height = 0;
      return {...asset, jpeg, png, webp, sha256};
    }
  };
  window.addEventListener('unhandledrejection', event => { console.error('UNHANDLED_REJECTION', String(event.reason)); });
}

async function fresh() {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  contexts.add(context);
  await context.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith(origin + '/') || url.startsWith('blob:' + origin + '/') ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addInitScript(instrument);
  context.on('page', page => {
    page.on('pageerror', error => report.errors.push(error.stack || error.message));
    page.on('console', message => { if (message.type() === 'error' && message.text().startsWith('UNHANDLED_REJECTION')) report.errors.push(message.text()); });
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  await page.goto(origin + '/__storage.html');
  return {context, page};
}
async function dispose(context) { await context.close(); contexts.delete(context); }
async function test(name, action, page) {
  if (process.env.PPT_TEST_FILTER && !new RegExp(process.env.PPT_TEST_FILTER).test(name)) return;
  const start = Date.now();
  try {
    const details = await action(); report.results.push({name, pass: true, milliseconds: Date.now() - start, details}); console.log('PASS', name);
  } catch (error) {
    report.results.push({name, pass: false, milliseconds: Date.now() - start, error: error.stack || String(error)}); console.error('FAIL', name, error.message);
    if (page && !page.isClosed()) {
      const filename = path.join(output, `failure-${report.results.length}.png`);
      await page.screenshot({path: filename}).then(() => report.evidence.push(filename)).catch(() => {});
    }
  }
}
async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Performance.getMetrics')).metrics.find(item => item.name === 'JSHeapUsedSize').value;
}
async function settleThumbnails(page) {
  await page.waitForFunction(() => thumbnailReads === 0 && thumbnailQueue.size === 0 && [...thumbnailStates.values()].some(state => state.url));
}
async function screenshot(page, name) {
  const filename = path.join(output, name); await page.screenshot({path: filename}); report.evidence.push(filename);
}

async function migration(version) {
  const {context, page} = await fresh();
  try {
    const result = await page.evaluate(async version => {
      const fixture = await __memory.fixture();
      const records = [
        {id: 7, order: 2048, data: fixture.jpeg, sig: new Uint8ClampedArray([1, 7, 19, 255]), w: 1280, h: 720, time: 1234, sourceTime: 17, sourceName: 'legacy second', course: {name: 'Legacy synthetic'}, coursePage: 'https://synthetic.invalid/course'},
        {id: 3, order: 1024, data: fixture.png, sig: new Uint8Array([9, 2, 8, 255]), w: 1280, h: 720, time: 1200, sourceTime: 3, sourceName: 'legacy first'},
        {id: 9, order: 3072, data: fixture.webp, sig: new Uint8Array([4, 5, 6, 255]), w: 1280, h: 720, time: 1300, sourceTime: 21, sourceName: 'legacy WebP'}
      ];
      const naming = {course: {name: 'Legacy synthetic', date: '2026-01-02', start: '08:00'}, page: 'https://synthetic.invalid/course', manual: true};
      const old = await new Promise((resolve, reject) => {
        const request = indexedDB.open('course-ppt', version);
        request.onupgradeneeded = () => { request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true}); request.result.createObjectStore('settings'); };
        request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
      });
      await new Promise((resolve, reject) => {
        const tx = old.transaction(['pages', 'settings'], 'readwrite'); records.forEach(record => tx.objectStore('pages').put(record)); tx.objectStore('settings').put(naming, 'exportNaming');
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      }); old.close();
      const db = await PPTPageStore.open(), metadata = await __memory.read(db, 'pages');
      const checks = [];
      for (const previous of records) {
        const {data, sig, ...expected} = previous, current = metadata.find(row => row.id === previous.id), asset = await PPTPageStore.asset(db, previous.id);
        const actual = new Uint8Array(await asset.image.arrayBuffer()), raw = atob(data.split(',')[1]);
        const jpeg = await PPTPageStore.imageBytes(db, previous.id), thumbnail = await PPTPageStore.thumbnail(db, previous.id);
        const bitmap = await createImageBitmap(thumbnail), thumbnailWidth = bitmap.width; bitmap.close();
        checks.push({metadata: JSON.stringify(current) === JSON.stringify(expected), signature: Array.from(asset.sig).join() === Array.from(sig).join(),
          bytes: actual.length === raw.length && actual.every((byte, i) => byte === raw.charCodeAt(i)), type: asset.image.type,
          jpeg: jpeg[0] === 255 && jpeg[1] === 216, thumbnailWidth});
      }
      const saved = await __memory.read(db, 'settings');
      const result = {version: db.version, order: metadata.sort((a, b) => a.order - b.order).map(row => row.id), checks, naming: JSON.stringify(saved[0]) === JSON.stringify(naming)};
      db.close(); return result;
    }, version);
    assert.equal(result.version, 3); assert.deepEqual(result.order, [3, 7, 9]); assert.equal(result.naming, true);
    for (const check of result.checks) { assert.equal(check.metadata && check.signature && check.bytes && check.jpeg, true); assert.ok(check.thumbnailWidth <= 320); }
    assert.deepEqual(result.checks.map(check => check.type), ['image/jpeg', 'image/png', 'image/webp']);
    return result;
  } finally { await dispose(context); }
}

async function failedMigration() {
  const {context, page} = await fresh();
  try {
    const result = await page.evaluate(async () => {
      const fixture = await __memory.fixture(), request = indexedDB.open('course-ppt', 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true}); request.result.createObjectStore('settings'); };
      const old = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise((resolve, reject) => {
        const tx = old.transaction(['pages', 'settings'], 'readwrite');
        tx.objectStore('pages').put({id: 1, data: fixture.jpeg, sig: new Uint8Array([1, 2, 3]), order: 1024});
        tx.objectStore('pages').put({id: 2, data: 'data:image/jpeg;base64,%%%broken', sig: new Uint8Array([4, 5]), order: 2048});
        tx.objectStore('settings').put({course: {name: 'Keep me'}, manual: true}, 'exportNaming');
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
      const before = JSON.stringify([await __memory.read(old, 'pages'), await __memory.read(old, 'settings')]); old.close();
      let error; try { await PPTPageStore.open(); } catch (caught) { error = caught.message; }
      const after = await new Promise((resolve, reject) => { const req = indexedDB.open('course-ppt'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const result = {error, version: after.version, unchanged: before === JSON.stringify([await __memory.read(after, 'pages'), await __memory.read(after, 'settings')]), stores: [...after.objectStoreNames]};
      after.close(); return result;
    });
    assert.ok(result.error); assert.equal(result.version, 2); assert.equal(result.unchanged, true); assert.deepEqual(result.stores, ['pages', 'settings']);
    return result;
  } finally { await dispose(context); }
}

async function cacheSessions() {
  const {context, page} = await fresh();
  try {
    await page.evaluate(async () => { window.__cache = await PPTDiskCache.create('live'); await __cache.write('active original'); await __cache.finish(); });
    const active = (await page.evaluate(() => __memory.files()))[0].path;
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory(), parent = await root.getDirectoryHandle('ppt-capture-cache');
      const stale = await parent.getDirectoryHandle('session-memory-stale', {create: true}), file = await stale.getFileHandle('orphan', {create: true}), writer = await file.createWritable(); await writer.write('orphan'); await writer.close();
      const unrelated = await root.getFileHandle('unrelated-memory', {create: true}), keep = await unrelated.createWritable(); await keep.write('keep'); await keep.close();
    });
    const other = await context.newPage(); await other.goto(origin + '/__storage.html');
    await other.evaluate(async () => { window.__cache = await PPTDiskCache.create('second'); await __cache.write('active second'); await __cache.finish(); });
    const files = await page.evaluate(() => __memory.files());
    assert.ok(files.some(file => file.path === active)); assert.ok(files.some(file => file.path === 'unrelated-memory'));
    assert.ok(!files.some(file => file.path.includes('session-memory-stale'))); assert.equal(files.filter(file => file.path.startsWith('ppt-capture-cache/')).length, 2);
    const locks = await page.evaluate(async () => (await navigator.locks.query()).held.map(lock => lock.name)); assert.equal(locks.filter(name => name.startsWith('ppt-capture-cache/session-')).length, 2);
    await page.evaluate(async () => { await __cache.remove(); await __cache.remove(); }); await other.evaluate(() => __cache.remove());
    assert.deepEqual(await page.evaluate(() => __memory.files()), [{path: 'unrelated-memory', size: 4}]);
    return {activeSessions: locks.length, staleReclaimed: true, unrelatedPreserved: true};
  } finally { await dispose(context); }
}

function zipSummary(filename, expectedHash) {
  const fd = fs.openSync(filename, 'r'), size = fs.fstatSync(fd).size, header = Buffer.alloc(46), chunk = Buffer.alloc(65536), names = [], offsets = [];
  let offset = 0, imageBytes = 0;
  try {
    while (true) {
      assert.equal(fs.readSync(fd, header, 0, 30, offset), 30);
      if (header.readUInt32LE(0) !== 0x04034b50) break;
      assert.equal(header.readUInt16LE(8), 0);
      const length = header.readUInt32LE(18), nameLength = header.readUInt16LE(26), extra = header.readUInt16LE(28), name = Buffer.alloc(nameLength);
      fs.readSync(fd, name, 0, nameLength, offset + 30); names.push(name.toString()); offsets.push(offset);
      let position = offset + 30 + nameLength + extra, remaining = length;
      const hash = crypto.createHash('sha256');
      while (remaining) { const read = fs.readSync(fd, chunk, 0, Math.min(remaining, chunk.length), position); assert.ok(read); hash.update(chunk.subarray(0, read)); position += read; remaining -= read; }
      assert.equal(hash.digest('hex'), expectedHash); imageBytes += length; offset = position;
    }
    const directoryStart = offset;
    for (let index = 0; index < names.length; index++) {
      assert.equal(fs.readSync(fd, header, 0, 46, offset), 46); assert.equal(header.readUInt32LE(0), 0x02014b50); assert.equal(header.readUInt32LE(42), offsets[index]);
      const length = header.readUInt16LE(28), name = Buffer.alloc(length); fs.readSync(fd, name, 0, length, offset + 46); assert.equal(name.toString(), names[index]);
      offset += 46 + length + header.readUInt16LE(30) + header.readUInt16LE(32);
    }
    fs.readSync(fd, header, 0, 22, offset); assert.equal(header.readUInt32LE(0), 0x06054b50); assert.equal(header.readUInt16LE(10), names.length); assert.equal(header.readUInt32LE(16), directoryStart); assert.equal(offset + 22, size);
    return {entries: names.length, size, imageBytes, first: names[0], last: names.at(-1), everyImageSHA256: expectedHash};
  } finally { fs.closeSync(fd); }
}

async function workspace() {
  const {context, page} = await fresh();
  try {
    let fixture;
    await test('1000 pages persist metadata separately from JPEGs and signatures', async () => {
      fixture = await page.evaluate(async () => {
        const fixture = await __memory.fixture(), db = await PPTPageStore.open(), sig = new Uint8ClampedArray(192 * 108 * 4).fill(23);
        for (let i = 0; i < 1000; i++) await PPTPageStore.add(db, {w: 1280, h: 720, order: (1000 - i) * 1024, time: 1000 + i, sourceTime: i * 5, sourceName: 'synthetic.mp4', sourceKey: 'memory-regression', course: {name: 'Synthetic memory'}, coursePage: '', batchJobId: ''}, {image: fixture.image, thumbnail: fixture.thumbnail, sig});
        await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({course: {name: 'Synthetic memory', date: '2026-01-02', start: '08:00'}, page: '', manual: true}, 'exportNaming'); tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
        db.close(); return {imageSize: fixture.image.size, thumbnailSize: fixture.thumbnail.size, sha256: fixture.sha256};
      });
      await page.goto(origin + '/capture.html'); await page.waitForFunction(() => typeof ready !== 'undefined' && ready);
      await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); await page.waitForFunction(() => studyAccepted && !busy());
      await settleThumbnails(page);
      const result = await page.evaluate(async () => {
        const metadata = await __memory.read(db, 'pages'), assets = await __memory.count(db, 'assets');
        const forbidden = value => value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value) || (value && typeof value === 'object' && Object.values(value).some(forbidden));
        return {count: pages.length, records: metadata.length, assets, metadataOnly: [...pages, ...metadata].every(row => !('data' in row) && !('sig' in row) && !forbidden(row)), order: [pages[0].id, pages.at(-1).id], cards: $('pages').children.length};
      });
      assert.deepEqual(result, {count: 1000, records: 1000, assets: 1000, metadataOnly: true, order: [1000, 1], cards: 1000});
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false, 'restore is checked with normal motion enabled');
      assert.deepEqual(await page.evaluate(() => __memory.animatedCards), [], '1000 restored cards never get entry animation');
      return {...result, ...fixture, syntheticImagesRepeat: true};
    }, page);
    if (!fixture || !(await page.evaluate(() => typeof ready !== 'undefined' && ready))) return;
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    report.heap.metadata1000 = await heap(cdp);
    await test('thumbnail reads stay at two and scroll revokes old URLs without replacing cards', async () => {
      await page.evaluate(() => {
        window.__cards = [...$('pages').children]; render(); window.__oldURLs = [...thumbnailStates.values()].flatMap(state => state.url ? [state.url] : []);
        const original = PPTPageStore.thumbnail; window.__thumbMetrics = {active: 0, max: 0};
        PPTPageStore.thumbnail = async (...args) => { __thumbMetrics.active++; __thumbMetrics.max = Math.max(__thumbMetrics.max, __thumbMetrics.active); try { return await original(...args); } finally { __thumbMetrics.active--; } };
        $('pages').scrollTop = $('pages').scrollHeight;
      });
      await page.waitForFunction(() => $('pages').lastElementChild.querySelector('img').hasAttribute('src')); await settleThumbnails(page);
      const result = await page.evaluate(() => {
        const scroll = $('pages').scrollTop; render();
        const preservedScroll = $('pages').scrollTop === scroll && scroll > 0;
        const rect = $('pages').getBoundingClientRect(), states = [...thumbnailStates];
        const inside = image => { const r = image.getBoundingClientRect(); return r.bottom >= rect.top - 201 && r.top <= rect.bottom + 201 && r.right >= rect.left && r.left <= rect.right; };
        return {preservedScroll, animations: __memory.animatedCards.length, maxReads: __thumbMetrics.max, activeURLs: states.filter(([, state]) => state.url).length, allowedImages: states.filter(([image]) => inside(image)).length,
          bounded: states.every(([image, state]) => !state.url || inside(image)), oldRevoked: __oldURLs.every(url => __memory.revoked.includes(url) && !__memory.live.has(url)), reused: __cards.every((card, index) => $('pages').children[index] === card)};
      });
      assert.equal(result.preservedScroll, true); assert.equal(result.animations, 0);
      assert.equal(result.maxReads, 2); assert.equal(result.bounded && result.oldRevoked && result.reused, true); assert.ok(result.activeURLs > 0 && result.activeURLs <= result.allowedImages && result.activeURLs < 100);
      return result;
    }, page);
    await test('task signature cache reads 1000 assets once in batches of 32 and releases 82944000 bytes', async () => {
      const result = await page.evaluate(async () => {
        const original = PPTPageStore.assets, batches = [], context = createDedupeContext();
        PPTPageStore.assets = (db, ids) => { batches.push(ids.length); return original(db, ids); };
        try {
          const sig = new Uint8ClampedArray(192 * 108 * 4).fill(250);
          const first = await hasSimilar(sig, .1, context), initial = batches.length;
          const second = await hasSimilar(sig, .1, context);
          const bytes = [...context.signatures.values()].reduce((sum, sig) => sum + (sig?.buffer.byteLength || 0), 0);
          const count = context.signatures.size, typedOnly = [...context.signatures.values()].every(sig => sig === null || sig instanceof Uint8Array || sig instanceof Uint8ClampedArray);
          releaseDedupeContext(context);
          return {first, second, initial, batches, bytes, count, typedOnly, released: context.signatures.size === 0 && dedupeContext === null};
        } finally { PPTPageStore.assets = original; releaseDedupeContext(context); }
      });
      assert.equal(result.first || result.second, false); assert.equal(Math.max(...result.batches), 32); assert.equal(result.batches.reduce((sum, count) => sum + count, 0), 1000);
      assert.equal(result.batches.length, result.initial); assert.equal(result.count, 1000); assert.equal(result.bytes, 82944000); assert(result.typedOnly && result.released);
      return result;
    }, page);
    await test('preview switches and close revoke all full-size image URLs', async () => {
      const used = [];
      await page.evaluate(() => openPreview(pages.at(-1)));
      for (let i = 0; i < 4; i++) {
        await page.waitForFunction(() => previewURL && $('lightbox-img').complete && $('lightbox-img').naturalWidth > 0);
        used.push(await page.evaluate(() => previewURL));
        if (i < 3) await page.evaluate(() => movePreview(-1));
      }
      await screenshot(page, 'preview-1000-pages.png');
      await page.locator('#lightbox-close').click(); await page.waitForFunction(() => previewURL === null && !$('lightbox-img').hasAttribute('src'));
      assert.equal(await page.evaluate(urls => urls.every(url => !__memory.live.has(url) && __memory.revoked.includes(url)), used), true);
      return {previewURLsRevoked: used.length};
    }, page);
    await test('256 MiB fetch writes real OPFS sequentially, matches checksum, and releases source', async () => {
      report.heap.videoBefore = await heap(cdp);
      await page.evaluate(() => {
        const originalFetch = fetch, originalCreate = PPTDiskCache.create;
        window.__streamMetrics = {produced: 0, written: 0, writing: 0, overlaps: 0};
        PPTDiskCache.create = async (...args) => { const cache = await originalCreate(...args); return {...cache, write: async chunk => { __streamMetrics.writing++; try { await cache.write(chunk); __streamMetrics.written++; } finally { __streamMetrics.writing--; } }}; };
        window.fetch = async () => new Response(new ReadableStream({pull(controller) {
          if (__streamMetrics.writing) __streamMetrics.overlaps++;
          if (__streamMetrics.produced === 256) { controller.close(); return; }
          controller.enqueue(new Uint8Array(1024 * 1024).fill(__streamMetrics.produced++ % 251));
        }}, {highWaterMark: 0}), {headers: {'content-type': 'video/mp4', 'content-length': String(256 * 1024 ** 2)}});
        window.__videoTransfer = fetchVideo(location.origin + '/synthetic.mp4', new AbortController().signal).then(file => { window.__videoFile = file; return file.size; }).finally(() => { window.fetch = originalFetch; PPTDiskCache.create = originalCreate; });
      });
      await page.waitForFunction(() => __streamMetrics.written >= 128); report.heap.videoDuring = await heap(cdp);
      const size = await page.evaluate(() => __videoTransfer); assert.equal(size, 256 * 1024 ** 2);
      report.heap.videoFinished = await heap(cdp);
      const result = await page.evaluate(async () => {
        let hash = 0x811c9dc5; const reader = __videoFile.stream().getReader();
        try { while (true) { const {value, done} = await reader.read(); if (done) break; for (const byte of value) hash = Math.imul(hash ^ byte, 0x01000193); } } finally { reader.releaseLock(); }
        const files = await __memory.files(), checksum = (hash >>> 0).toString(16).padStart(8, '0');
        video.preload = 'none'; objectURL = URL.createObjectURL(__videoFile); const oldURL = objectURL; video.src = objectURL; sourceReady = true;
        await releaseSource(); const after = await __memory.files(); delete window.__videoFile; delete window.__videoTransfer;
        return {size: files.reduce((sum, file) => sum + file.size, 0), checksum, metrics: __streamMetrics, cleaned: after.length === 0 && videoCache === null && objectURL === null && !video.hasAttribute('src') && video.srcObject === null && !__memory.live.has(oldURL), screenshots: pages.length};
      });
      let hash = 0x811c9dc5; const chunk = new Uint8Array(1024 * 1024);
      for (let i = 0; i < 256; i++) { chunk.fill(i % 251); for (const byte of chunk) hash = Math.imul(hash ^ byte, 0x01000193); }
      assert.equal(result.checksum, (hash >>> 0).toString(16).padStart(8, '0')); assert.equal(result.size, size); assert.equal(result.metrics.overlaps, 0); assert.equal(result.metrics.written, 256); assert.equal(result.cleaned, true); assert.equal(result.screenshots, 1000);
      report.heap.videoReleased = await heap(cdp); report.heap.videoSampledDelta = Math.max(report.heap.videoDuring, report.heap.videoFinished) - report.heap.videoBefore;
      assert.ok(report.heap.videoSampledDelta < 64 * 1024 ** 2, `JS heap grew by ${report.heap.videoSampledDelta} bytes`);
      return result;
    }, page);
    await test('video quota and cancellation UI clean partial OPFS files and retain screenshots', async () => {
      const results = [];
      for (const failure of ['quota', 'cancel']) {
        results.push(await page.evaluate(async failure => {
          const originalFetch = fetch, originalWrite = FileSystemWritableFileStream.prototype.write;
          let produced = 0, cancelled = false;
          window.fetch = async () => new Response(new ReadableStream({pull(controller) { if (failure === 'cancel' && produced === 3) task.abort(); controller.enqueue(new Uint8Array(1024 * 1024).fill(produced++)); }, cancel() { cancelled = true; }}, {highWaterMark: 0}), {headers: {'content-type': 'video/mp4'}});
          if (failure === 'quota') FileSystemWritableFileStream.prototype.write = function () { return Promise.reject(new DOMException('synthetic quota', 'QuotaExceededError')); };
          try {
            const loaded = await loadRemote(location.origin + '/injected.mp4', {permissionGranted: true});
            return {failure, loaded, cancelled, files: (await __memory.files()).length, pages: pages.length, status: $('status').textContent, busy: busy()};
          } finally { window.fetch = originalFetch; FileSystemWritableFileStream.prototype.write = originalWrite; }
        }, failure));
      }
      for (const result of results) { assert.equal(result.loaded, false); assert.equal(result.cancelled, true); assert.equal(result.files, 0); assert.equal(result.pages, 1000); assert.equal(result.busy, false); }
      assert.match(results[0].status, /空间不足/); assert.match(results[1].status, /已停止/); return results;
    }, page);
    await test('capture quota keeps existing metadata, assets, naming and export controls usable', async () => {
      const result = await page.evaluate(async () => {
        await deletePages([pages.at(-1).id]);
        const before = {pages: JSON.stringify(pages), assets: await __memory.count(db, 'assets'), naming: JSON.stringify(namingInfo())};
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; canvas.getContext('2d').fillRect(0, 0, 640, 360);
        stream = canvas.captureStream(2); video.srcObject = stream; await video.play(); sourceReady = true; controls();
        const originalAdd = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) { if (this.name === 'pages' && this.transaction.db === db) throw new DOMException('synthetic page quota', 'QuotaExceededError'); return originalAdd.apply(this, args); };
        try { await $('shot').onclick(); }
        finally { IDBObjectStore.prototype.add = originalAdd; await releaseSource(); }
        const result = {retained: before.pages === JSON.stringify(pages), records: (await __memory.read(db, 'pages')).length, assetsRetained: before.assets === await __memory.count(db, 'assets'), naming: before.naming === JSON.stringify(namingInfo()), status: $('status').textContent, exportEnabled: !$('export-zip').disabled, busy: busy()};
        return result;
      });
      assert.equal(result.retained && result.assetsRetained && result.naming && result.exportEnabled, true); assert.equal(result.records, 999); assert.equal(result.busy, false); assert.match(result.status, /保存失败/);
      await screenshot(page, 'quota-preserves-pages.png'); await page.evaluate(() => undoDelete()); return result;
    }, page);
    await test('1000-page ZIP downloads byte-correct JPEGs and releases its file after the retention timer', async () => {
      await page.clock.install(); report.heap.exportBefore = await heap(cdp);
      const pending = page.waitForEvent('download'); await page.evaluate(() => exportRetained('zip'));
      const download = await pending, filename = path.join(output, 'synthetic-1000-slides.zip'); await download.saveAs(filename); assert.equal(await download.failure(), null);
      const result = zipSummary(filename, fixture.sha256); assert.equal(result.entries, 1000); assert.equal(result.imageBytes, fixture.imageSize * 1000); assert.equal(result.first, '001-01-23-15.jpg'); assert.equal(result.last, '1000-00-00-00.jpg');
      const retained = await page.evaluate(() => __memory.files()); assert.equal(retained.length, 1); assert.equal(retained[0].size, result.size);
      report.heap.exportFinished = await heap(cdp); await page.clock.fastForward(60001); await page.waitForFunction(async () => (await __memory.files()).length === 0 && downloadURLs.size === 0);
      report.evidence.push(filename); return {...result, filename: download.suggestedFilename(), retainedUntilTimer: true, timerAdvancedMilliseconds: 60001};
    }, page);
    await test('failed export removes partial files and retains all 1000 pages', async () => {
      const result = await page.evaluate(async () => {
        const original = FileSystemWritableFileStream.prototype.write; let writes = 0;
        FileSystemWritableFileStream.prototype.write = function (...args) { if (++writes === 3) return Promise.reject(new DOMException('synthetic export quota', 'QuotaExceededError')); return original.apply(this, args); };
        try { await exportRetained('zip'); return {writes, files: (await __memory.files()).length, status: $('status').textContent, pages: pages.length, busy: busy()}; }
        finally { FileSystemWritableFileStream.prototype.write = original; }
      });
      assert.equal(result.writes, 3); assert.equal(result.files, 0); assert.equal(result.pages, 1000); assert.equal(result.busy, false); assert.match(result.status, /导出失败.*空间不足/); return result;
    }, page);
    await cdp.detach();
    await test('another tool page protects undo images until all shared page leases end', async () => {
      const deleted = await page.evaluate(async () => {
        const id = pages.at(-1).id, record = await PPTPageStore.asset(db, id);
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await record.image.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
        await deletePages([id]); return {id, sha256, undo: undoState?.removed.some(item => item.page.id === id), pages: pages.length};
      });
      assert.equal(deleted.undo, true); assert.equal(deleted.pages, 999);
      const other = await context.newPage(); await other.goto(origin + '/capture.html'); await other.waitForFunction(() => ready);
      const protectedImage = await other.evaluate(async id => ({pages: pages.length, assetSize: (await PPTPageStore.asset(db, id)).image.size,
        leases: (await navigator.locks.query()).held.filter(lock => lock.name === 'ppt-capture-pages').map(lock => lock.mode)}), deleted.id);
      assert.equal(protectedImage.pages, 999); assert.equal(protectedImage.assetSize, fixture.imageSize); assert.deepEqual(protectedImage.leases, ['shared', 'shared']);
      const restored = await page.evaluate(async id => {
        await undoDelete(); const record = await PPTPageStore.asset(db, id);
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await record.image.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
        const result = {pages: pages.length, id: pages.find(row => row.id === id)?.id, sha256};
        await deletePages([id]); return result;
      }, deleted.id);
      assert.equal(restored.pages, 1000); assert.equal(restored.id, deleted.id); assert.equal(restored.sha256, deleted.sha256);
      await other.close(); await page.close();
      const reopened = await context.newPage(); await reopened.goto(origin + '/__storage.html');
      await reopened.waitForFunction(async () => !(await navigator.locks.query()).held.some(lock => lock.name === 'ppt-capture-pages'));
      const orphanSize = await reopened.evaluate(async id => { const db = await PPTPageStore.open(); try { return (await PPTPageStore.asset(db, id)).image.size; } finally { db.close(); } }, deleted.id);
      assert.equal(orphanSize, fixture.imageSize);
      await reopened.goto(origin + '/capture.html'); await reopened.waitForFunction(() => ready);
      const reclaimed = await reopened.evaluate(async id => ({pages: pages.length, assets: await __memory.count(db, 'assets'), missing: !(await PPTPageStore.assets(db, [id]))[0]}), deleted.id);
      assert.deepEqual(reclaimed, {pages: 999, assets: 999, missing: true});
      return {protectedImage, restored, orphanSizeBeforeStartup: orphanSize, reclaimed};
    }, page);
  } finally { await dispose(context); }
}

async function longWorkspace() {
  const {context, page} = await fresh();
  try {
    const fixture = await page.evaluate(async () => {
      const fixture = await __memory.fixture(), db = await PPTPageStore.open(), sig = new Uint8ClampedArray(192 * 108 * 4).fill(23);
      for (let i = 0; i < 2000; i++) await PPTPageStore.add(db, {order: (i + 1) * 1024, w: 1280, h: 720, time: 1000 + i, sourceTime: i * 5,
        sourceName: 'long-synthetic.mp4', sourceKey: 'long-memory', course: {name: 'Synthetic 2000', date: '2026-01-02', start: '08:00'}}, {image: fixture.image, thumbnail: fixture.thumbnail, sig});
      db.close(); return {sha256: fixture.sha256, imageSize: fixture.image.size};
    });
    await page.goto(origin + '/capture.html'); await page.waitForFunction(() => ready);
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); await page.waitForFunction(() => studyAccepted && !busy());
    await settleThumbnails(page);
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    report.heap.metadata2000 = await heap(cdp);
    const restored = await page.evaluate(async () => ({pages: pages.length, cards: $('pages').children.length, assets: await __memory.count(db, 'assets'),
      metadataOnly: pages.every(row => !('data' in row) && !('sig' in row) && !Object.values(row).some(value => value instanceof Blob || ArrayBuffer.isView(value))),
      first: pages[0].sourceTime, last: pages.at(-1).sourceTime}));
    assert.deepEqual(restored, {pages: 2000, cards: 2000, assets: 2000, metadataOnly: true, first: 0, last: 9995});
    const cache = await page.evaluate(async () => {
      const original = PPTPageStore.assets, context = createDedupeContext(), batches = [];
      PPTPageStore.assets = (db, ids) => { batches.push(ids.length); return original(db, ids); };
      try {
        await hasSimilar(new Uint8ClampedArray(192 * 108 * 4).fill(250), .1, context);
        return {count: context.signatures.size, bytes: [...context.signatures.values()].reduce((sum, sig) => sum + (sig?.byteLength || 0), 0), batches};
      } finally { PPTPageStore.assets = original; releaseDedupeContext(context); }
    });
    assert.equal(cache.count, 1000); assert.equal(cache.bytes, 82944000); assert.equal(Math.max(...cache.batches), 32); assert.equal(cache.batches.reduce((a, b) => a + b), 2000);
    report.heap.signatures2000Released = await heap(cdp);
    await page.evaluate(() => {
      window.longCards = [...$('pages').children]; window.longRead = {active: 0, max: 0};
      const thumbnail = PPTPageStore.thumbnail;
      PPTPageStore.thumbnail = async (...args) => { longRead.active++; longRead.max = Math.max(longRead.max, longRead.active); try { return await thumbnail(...args); } finally { longRead.active--; } };
      $('pages').scrollTop = $('pages').scrollHeight;
    });
    await page.waitForFunction(() => $('pages').lastElementChild.querySelector('img').hasAttribute('src')); await settleThumbnails(page);
    const thumbnails = await page.evaluate(() => {
      const rect = $('pages').getBoundingClientRect(), states = [...thumbnailStates];
      const inside = image => { const r = image.getBoundingClientRect(); return r.bottom >= rect.top - 201 && r.top <= rect.bottom + 201 && r.right >= rect.left && r.left <= rect.right; };
      return {maxReads: longRead.max, live: states.filter(([, state]) => state.url).length, allowed: states.filter(([image]) => inside(image)).length,
        bounded: states.every(([image, state]) => !state.url || inside(image)), reused: longCards.every((card, i) => $('pages').children[i] === card), releasedCache: dedupeContext === null};
    });
    assert.equal(thumbnails.maxReads, 2); assert(thumbnails.live > 0 && thumbnails.live <= thumbnails.allowed && thumbnails.live < 100);
    assert(thumbnails.bounded && thumbnails.reused && thumbnails.releasedCache);
    await page.evaluate(() => {
      const imageBytes = PPTPageStore.imageBytes; window.longExport = {active: 0, max: 0, reads: 0};
      PPTPageStore.imageBytes = async (...args) => { longExport.active++; longExport.max = Math.max(longExport.max, longExport.active); longExport.reads++;
        try { return await imageBytes(...args); } finally { longExport.active--; } };
    });
    await page.clock.install(); report.heap.export2000Before = await heap(cdp);
    const pending = page.waitForEvent('download'); await page.evaluate(() => exportRetained('zip'));
    const download = await pending, filename = path.join(output, 'synthetic-2000-slides.zip'); await download.saveAs(filename); assert.equal(await download.failure(), null);
    const zip = zipSummary(filename, fixture.sha256), reads = await page.evaluate(() => longExport);
    assert.equal(zip.entries, 2000); assert.equal(zip.imageBytes, fixture.imageSize * 2000); assert.deepEqual(reads, {active: 0, max: 1, reads: 2000});
    report.heap.export2000Finished = await heap(cdp); report.heap.export2000SampledDelta = report.heap.export2000Finished - report.heap.export2000Before;
    assert(report.heap.export2000SampledDelta < 64 * 1024 ** 2);
    await page.clock.fastForward(60001); await page.waitForFunction(async () => downloadURLs.size === 0 && (await __memory.files()).length === 0);
    assert.equal(await page.evaluate(() => [...__memory.live.values()].filter(value => value.type === 'image/jpeg').length), thumbnails.live);
    const append = await page.evaluate(async () => {
      const container = $('pages'), scroll = container.scrollTop, id = pages.at(-1).id;
      selectedPages = new Set([id]); updateSelection();
      let added = 0, removed = 0;
      const observer = new MutationObserver(records => { for (const row of records) { added += row.addedNodes.length; removed += row.removedNodes.length; } });
      observer.observe(container, {childList: true});
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18; canvas.getContext('2d').fillRect(0, 0, 32, 18);
      await save({canvas, sig: new Uint8ClampedArray(192 * 108 * 4), sourceTime: 10000, signatureCrop: {...crop}});
      await Promise.resolve(); observer.disconnect(); canvas.width = canvas.height = 0;
      return {pages: pages.length, cards: container.children.length, added, removed, scrollPreserved: scroll > 0 && container.scrollTop === scroll,
        reused: longCards.every((card, i) => container.children[i] === card), selectionPreserved: selectedPages.has(id) && selectedPages.size === 1};
    });
    assert.deepEqual(append, {pages: 2001, cards: 2001, added: 1, removed: 0, scrollPreserved: true, reused: true, selectionPreserved: true});
    await cdp.detach(); report.evidence.push(filename);
    return {restored, cache, thumbnails, zip, reads, append, cleanup: true, syntheticImagesRepeat: true, measurement: 'sampled Chromium JS heap, not process RSS or a measured peak'};
  } finally { await dispose(context); }
}

async function learningMemory() {
  const {context, page} = await fresh(); let cdp;
  try {
    await page.evaluate(async () => {
      const fixture = await __memory.fixture(), db = await PPTPageStore.open(), sig = new Uint8ClampedArray(192 * 108 * 4).fill(128);
      for (let i = 0; i < 1001; i++) await PPTPageStore.add(db, {w: 1280, h: 720, order: i * 1024, sourceTime: i * 30, sourceName: 'synthetic.mp4', sourceKey: 'learning-memory', course: {name: 'Learning memory'}, time: i}, {image: fixture.image, thumbnail: fixture.thumbnail, sig});
      db.close();
    });
    await page.goto(origin + '/capture.html'); await page.waitForFunction(() => ready);
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); await page.waitForFunction(() => !busy());
    await settleThumbnails(page); cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const before = await heap(cdp);
    const result = await page.evaluate(async () => {
      const get = PPTPageStore.assets, batches = []; let live = 0, peak = 0, released = 0;
      PPTPageStore.assets = async (db, ids) => {
        const records = await get(db, ids); batches.push(ids.length); live += records.length; peak = Math.max(peak, live);
        return new Proxy(records, {set(target, key, value) { if (value === null && target[key]) { live--; released++; } return Reflect.set(target, key, value); }});
      };
      const metadata = JSON.stringify(pages);
      try {
        await $('learning-suggest').onclick();
        const suggestions = $('learning-suggestions').children.length;
        closeLearningSuggestions();
        return {batches, peak, live, released, suggestions, unchanged: metadata === JSON.stringify(pages), cache: dedupeContext?.signatures.size || 0, fullRaw: allPages.length};
      } finally { PPTPageStore.assets = get; closeLearningSuggestions(); }
    });
    assert.equal(result.batches.reduce((a, b) => a + b, 0), 1001); assert.equal(Math.max(...result.batches), 32);
    assert.equal(result.peak, 32); assert.equal(result.live, 0); assert.equal(result.released, 1001); assert.equal(result.cache, 0); assert.equal(result.fullRaw, 1001); assert.equal(result.unchanged, true); assert(result.suggestions > 0);
    const after = await heap(cdp); assert(after - before < 24 * 1024 * 1024, 'closed suggestions do not retain 1001 signature buffers or JPEGs');
    const cancelled = await page.evaluate(async () => {
      const get = PPTPageStore.assets; let release;
      PPTPageStore.assets = async (...args) => { const records = await get(...args); await new Promise(resolve => { release = resolve; }); return records; };
      try {
        const running = $('learning-suggest').onclick();
        while (!release) await new Promise(resolve => requestAnimationFrame(resolve));
        closeLearningSuggestions(); release(); await running;
        return {closed: learningSuggestion === null && !$('learning-dialog').open, flags: pages.some(page => page.learningExcluded), nodes: $('learning-suggestions').children.length};
      } finally { PPTPageStore.assets = get; }
    });
    assert.deepEqual(cancelled, {closed: true, flags: false, nodes: 0});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.evaluate(async () => { await setLearningExcluded(pages.slice(0, 2).map(page => page.id), true); $('learning-view').value = 'kept'; $('learning-view').onchange(); });
    assert.equal(await page.locator('#pages article').count(), 999); assert.equal(await page.evaluate(() => pages.length), 1001);
    await page.locator('#select-all').check(); assert.equal(await page.evaluate(() => selectedPages.size), 999);
    await page.locator('#learning-view').selectOption('excluded'); assert.equal(await page.evaluate(() => selectedPages.size), 0); assert.equal(await page.locator('#pages article').count(), 2);
    return {...result, cancelled, heapBefore: before, heapAfter: after, reducedMotion: true};
  } finally { await cdp?.detach(); await dispose(context); }
}

async function main() {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/__storage.html') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8"><title>Synthetic storage test</title><script src="/disk-cache.js"></script><script src="/page-store.js"></script>'); return; }
      const filename = path.resolve(root, '.' + pathname);
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'};
      const body = await fs.promises.readFile(filename);
      response.writeHead(200, {'content-type': mime[path.extname(filename)] || 'application/octet-stream'}); response.end(body);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch(browserOptions()); report.browser = browser.version();
    await test('v1 migration preserves image bytes, signatures, metadata, order and naming', () => migration(1));
    await test('v2 migration preserves JPEG/PNG/WebP and converts non-JPEG images when exporting', () => migration(2));
    await test('failed migration rolls back the full upgrade and keeps the v2 database intact', failedMigration);
    await test('real OPFS startup reclaims unlocked sessions and protects another active page', cacheSessions);
    await test('learning suggestions stream 1001 assets, cancel safely and preserve bounded gallery views', learningMemory);
    await workspace();
    await test('2000 pages restore with bounded caches, thumbnails and byte-correct streaming ZIP', longWorkspace);
  } catch (error) { report.errors.push(error.stack || String(error)); }
  finally {
    for (const context of contexts) await context.close().catch(error => report.errors.push(error.message));
    if (browser) await browser.close().catch(error => report.errors.push(error.message));
    await new Promise(resolve => server.close(resolve));
    const filename = path.join(output, 'report.json'); fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log('REPORT', filename); console.log('HEAP_JS_BYTES', JSON.stringify(report.heap));
    if (report.errors.length || report.results.some(result => !result.pass)) process.exitCode = 1;
    console.log(`${report.results.filter(result => result.pass).length}/${report.results.length} passed; ${report.errors.length} browser errors`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
