/* Task 1 integration: loopback only, synthetic canvas/video and a fresh browser context. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright');
const root = path.resolve(__dirname, '..');
let browser, server, page, passed = 0;
const blocked = [];
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
(async () => {
  try {
    server = http.createServer((req, res) => {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'}[path.extname(file)];
        res.writeHead(200, {'Content-Type': mime || 'application/octet-stream'}).end(data);
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(browserOptions());
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    page = await context.newPage();
    await page.goto(origin + '/capture.html'); await page.waitForFunction(() => ready);
    if (await page.locator('#terms-dialog').isVisible()) { await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); }
    await test('fresh precise default preserves explicit coarse modes and checkpoint settings', async () => {
      assert.equal(await page.locator('#mode').inputValue(), '0.5');
      const result = await page.evaluate(async () => {
        const make = (id, settings) => ({id, crop: {x: 0, y: 0, w: 1, h: 1}, course: {}, settings, suspects: []});
        const modes = [];
        for (const step of [2, 8]) { activeLesson = make('mode-' + step, {step}); applyLesson(); modes.push(scanSettings().step); }
        const old = make('checkpoint'); old.task = {settings: {step: 2, threshold: 2, dedupe: false, stable: 3}, checkpoint: 12};
        activeLesson = old; lessons = [old]; applyLesson(); modes.push(scanSettings().step);
        await persistLesson();
        return {modes, checkpoint: activeLesson.task.checkpoint};
      });
      assert.deepEqual(result, {modes: [2, 8, 2], checkpoint: 12});
    });
    // Live video frames come only from an in-memory canvas, never user media.
    await page.evaluate(async () => {
      window.fixtureCanvas = document.createElement('canvas'); fixtureCanvas.width = 192; fixtureCanvas.height = 108;
      const ctx = fixtureCanvas.getContext('2d'); ctx.fillStyle = '#345678'; ctx.fillRect(0, 0, 192, 108);
      ctx.fillStyle = '#ee2233'; ctx.fillRect(96, 0, 96, 108);
      window.fixtureStream = fixtureCanvas.captureStream(5); video.srcObject = fixtureStream; video.muted = true; await video.play();
      sourceReady = true; crop = {x: 0, y: 0, w: 1, h: 1}; controls(); draw();
    });
    await page.waitForFunction(() => video.readyState >= 2);
    await page.locator('#tab-extraction').click();
    await test('keyboard ignore selection persists, cancels, rejects full mask and rolls back failed persistence', async () => {
      await page.locator('#ignore-select').click(); await page.locator('#overlay').press('ArrowLeft'); await page.locator('#overlay').press('Enter');
      await page.waitForFunction(() => !reviewBusy && !!ignoreRect);
      const saved = await page.evaluate(() => ({...ignoreRect})); assert(Math.abs(saved.x - .59) < 1e-8);
      const manual = await page.evaluate(async () => {
        activeBatchJob = {requiresCrop: true, cropConfirmed: false};
        await setComparisonRegion(crop, ignoreRect, 'ignore'); const ignored = activeBatchJob.cropConfirmed;
        await setComparisonRegion(crop, ignoreRect, 'crop', true); const confirmed = activeBatchJob.cropConfirmed;
        activeBatchJob = null; return {ignored, confirmed};
      });
      assert.deepEqual(manual, {ignored: false, confirmed: true});
      await page.locator('#ignore-select').click(); await page.locator('#overlay').press('ArrowLeft'); await page.locator('#overlay').press('Escape');
      assert.deepEqual(await page.evaluate(() => ignoreRect), saved);
      const result = await page.evaluate(async () => {
        const tx = db.transaction('settings'), request = tx.objectStore('settings').get('lesson:' + activeLesson.id);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
        const persisted = request.result.ignoreRect;
        selectionMode = 'ignore'; selectionRect = {...crop}; await commitSelection();
        const fullRejected = JSON.stringify(ignoreRect) === JSON.stringify(persisted);
        const original = PPTLibrary.put; PPTLibrary.put = async () => { throw Error('synthetic settings failure'); };
        await setComparisonRegion(crop, null, 'clear'); PPTLibrary.put = original;
        return {persisted, fullRejected, rolledBack: ignoreRect, failure: $('status').textContent};
      });
      assert.deepEqual(result.persisted, saved); assert(result.fullRejected); assert.deepEqual(result.rolledBack, saved); assert.match(result.failure, /synthetic settings failure/);
    });
    await test('pointer ignore selection maps to cropped coordinates; crop change resets persisted mask', async () => {
      await page.evaluate(async () => { await setComparisonRegion({x: .1, y: .1, w: .8, h: .8}, null, 'crop'); });
      await page.locator('#ignore-select').click();
      const coords = await page.evaluate(() => { const r = overlay.getBoundingClientRect(), b = bounds(); return {x: r.left + b.x, y: r.top + b.y, w: b.w, h: b.h}; });
      await page.mouse.move(coords.x + coords.w * .5, coords.y + coords.h * .5); await page.mouse.down();
      await page.mouse.move(coords.x + coords.w * .8, coords.y + coords.h * .8); await page.mouse.up();
      await page.waitForFunction(() => !reviewBusy && !!ignoreRect);
      const mask = await page.evaluate(() => ignoreRect); assert(Math.abs(mask.x - .5) < .01); assert(Math.abs(mask.w - .375) < .01);
      await page.locator('#full').click(); await page.waitForFunction(() => !reviewBusy && !ignoreRect);
      assert.match(await page.locator('#status').textContent(), /旧忽略区已清除/);
      assert.equal(await page.evaluate(() => activeLesson.ignoreRect), null);
    });
    await test('frame geometry snapshots and saved JPEG/signature keep ignored content byte-for-byte', async () => {
      const result = await page.evaluate(async () => {
        video.pause(); ignoreRect = {x: .5, y: 0, w: .5, h: 1};
        const captured = frame(0), original = await PPTPageStore.encode(captured.canvas), raw = captured.sig.slice();
        crop = {...crop, x: .1, w: .9};
        const snapshot = {...captured.signatureCrop}; crop = {x: 0, y: 0, w: 1, h: 1};
        const cache = createDedupeContext(); await save(captured, cache);
        const metadata = pages.at(-1), asset = await PPTPageStore.asset(db, metadata.id);
        const bytes = new Uint8Array(await asset.image.arrayBuffer()), expected = new Uint8Array(await original.image.arrayBuffer());
        const download = downloadBlob; let exported;
        downloadBlob = (file, name, cache) => { exported = file.arrayBuffer().then(buffer => ({buffer, cache})); };
        let pdfContainsJPEG;
        try {
          await downloadPages([metadata], 'synthetic.pdf');
          const {buffer, cache: outputCache} = await exported, pdf = new Uint8Array(buffer);
          pdfContainsJPEG = pdf.some((byte, start) => byte === bytes[0] && bytes.every((n, offset) => n === pdf[start + offset]));
          await outputCache.remove();
        } finally { downloadBlob = download; }
        const result = {snapshot, geometry: metadata.signatureCrop, pdfContainsJPEG, jpegEqual: bytes.length === expected.length && bytes.every((n, i) => n === expected[i]),
          sigEqual: asset.sig.every((n, i) => n === raw[i]), ignoredRed: asset.sig[(60 * 192 + 150) * 4] > 200,
          metadataOnly: !('sig' in metadata) && !('image' in metadata), committedCached: cache.signatures.has(metadata.id)};
        releaseDedupeContext(cache); return result;
      });
      assert.deepEqual(result.snapshot, {x: 0, y: 0, w: 1, h: 1}); assert.deepEqual(result.geometry, result.snapshot);
      assert(result.pdfContainsJPEG && result.jpegEqual && result.sigEqual && result.ignoredRed && result.metadataOnly && result.committedCached);
    });
    await test('cache reuses valid/invalid/missing signatures and compares legacy geometry unmasked', async () => {
      const result = await page.evaluate(async () => {
        const original = PPTPageStore.assets, originalPages = pages, full = {...crop}, size = 192 * 108 * 4;
        const a = new Uint8ClampedArray(size), b = a.slice();
        for (let y = 0; y < 108; y++) for (let x = 96; x < 192; x++) b[(y * 192 + x) * 4] = 255;
        let reads = 0; PPTPageStore.assets = async (_, ids) => { reads += ids.length; return ids.map(id => id === 1 ? {sig: a} : id === 2 ? {sig: new Uint8Array(10)} : undefined); };
        pages = [1, 2, 3].map(id => ({id, w: 192, h: 108, signatureCrop: full}));
        const cache = createDedupeContext();
        try {
          const masked = await hasSimilar(b, 1.2, cache);
          delete pages[0].signatureCrop; const legacy = await hasSimilar(b, 1.2, cache);
          pages[0].signatureCrop = {...full, x: .1}; const mismatch = await hasSimilar(b, 1.2, cache);
          await hasSimilar(b, 1.2, cache);
          const backing = new Uint8Array(size + 10); cacheSignature(cache, 4, backing.subarray(5, size + 5));
          return {masked, legacy, mismatch, reads, invalid: cache.signatures.get(2), missing: cache.signatures.get(3), exactBacking: cache.signatures.get(4).buffer.byteLength};
        } finally { pages = originalPages; PPTPageStore.assets = original; releaseDedupeContext(cache); }
      });
      assert.deepEqual(result, {masked: true, legacy: false, mismatch: false, reads: 3, invalid: null, missing: null, exactBacking: 82944});
    });
    await test('realtime transitions and confirmation plus adjacent cleanup use the same ignore rule', async () => {
      const result = await page.evaluate(async () => {
        const originalFrame = frame, originalSave = save, originalAssets = PPTPageStore.assets, originalDelete = deletePages, originalPages = pages;
        const a = new Uint8ClampedArray(82944), b = a.slice(), c = a.slice();
        for (let y = 0; y < 108; y++) for (let x = 96; x < 192; x++) b[(y * 192 + x) * 4] = 255;
        for (let y = 0; y < 108; y++) for (let x = 0; x < 96; x++) c[(y * 192 + x) * 4] = 255;
        let current = b, saved = 0, deleted = [];
        frame = () => ({sig: current, signatureCrop: {...crop}}); save = async () => { saved++; };
        createDedupeContext(); realtimeTimer = setInterval(() => {}, 60000); $('dedupe').checked = false;
        try {
          last = a; candidate = null; await realTick(); const ignoredTransition = saved === 0 && candidate === null;
          last = null; candidate = a; candidateSince = 0; await realTick(); const ignoredConfirmation = saved === 1;
          current = c; await realTick(); const realTransition = candidate === c;
          stopRealtime();
          pages = [1, 2].map(id => ({id, w: 192, h: 108, signatureCrop: {...crop}, sourceKey: 'synthetic', sourceName: 'synthetic', sourceTime: id}));
          PPTPageStore.assets = async () => [{sig: a}, {sig: b}]; deletePages = async ids => { deleted.push(...ids); };
          await cleanSimilar(); const maskedCleanup = deleted.join(',') === '1';
          deleted = []; delete pages[0].signatureCrop; await cleanSimilar();
          return {ignoredTransition, ignoredConfirmation, realTransition, maskedCleanup, legacyKept: deleted.length === 0};
        } finally { stopRealtime(); frame = originalFrame; save = originalSave; PPTPageStore.assets = originalAssets; deletePages = originalDelete; pages = originalPages; }
      });
      assert.deepEqual(result, {ignoredTransition: true, ignoredConfirmation: true, realTransition: true, maskedCleanup: true, legacyKept: true});
    });
    await test('cache overflow compares every retained page and never exceeds 1000 signatures', async () => {
      const result = await page.evaluate(async () => {
        const original = PPTPageStore.assets, originalPages = pages, size = 192 * 108 * 4;
        const a = new Uint8ClampedArray(size), b = a.slice(); b.fill(255);
        let reads = 0, maximum = 0;
        PPTPageStore.assets = async (_, ids) => { reads += ids.length; maximum = Math.max(maximum, ids.length); return ids.map(id => ({sig: id === 1001 ? b : a})); };
        pages = Array.from({length: 1001}, (_, i) => ({id: i + 1, w: 192, h: 108}));
        const cache = createDedupeContext();
        try { const found = await hasSimilar(b, .1, cache); return {found, reads, maximum, count: cache.signatures.size}; }
        finally { pages = originalPages; PPTPageStore.assets = original; releaseDedupeContext(cache); }
      });
      assert.deepEqual(result, {found: true, reads: 1001, maximum: 32, count: 1000});
    });
    await test('read failures propagate; abort during read or encoding prevents later commits', async () => {
      const result = await page.evaluate(async () => {
        const assets = PPTPageStore.assets, encode = PPTPageStore.encode, add = PPTPageStore.add;
        let failure = '', aborted = '', encodedAbort = '', writes = 0;
        let cache = createDedupeContext();
        try {
          PPTPageStore.assets = async () => { throw Error('synthetic read failure'); };
          try { await hasSimilar(new Uint8ClampedArray(82944), 1.2, cache); } catch (e) { failure = e.message; }
          const controller = new AbortController(); cache = createDedupeContext(controller.signal);
          PPTPageStore.assets = async () => { controller.abort(); return []; };
          try { await hasSimilar(new Uint8ClampedArray(82944), 1.2, cache); } catch (e) { aborted = e.name; }
          const second = new AbortController(); cache = createDedupeContext(second.signal);
          PPTPageStore.encode = async canvas => { const asset = await encode(canvas); second.abort(); return asset; };
          PPTPageStore.add = async (...args) => { writes++; return add(...args); };
          try { await save(frame(1), cache); } catch (e) { encodedAbort = e.name; }
          const empty = cache.signatures.size === 0;
          releaseDedupeContext(cache); return {failure, aborted, encodedAbort, writes, empty, released: dedupeContext === null};
        } finally { PPTPageStore.assets = assets; PPTPageStore.encode = encode; PPTPageStore.add = add; releaseDedupeContext(cache); }
      });
      assert.deepEqual(result, {failure: 'synthetic read failure', aborted: 'AbortError', encodedAbort: 'AbortError', writes: 0, empty: true, released: true});
    });
    await test('failed page commits never enter cache; lesson/source/realtime stop invalidate it', async () => {
      const result = await page.evaluate(async () => {
        const original = PPTPageStore.add; const cache = createDedupeContext(); let failed = '';
        PPTPageStore.add = async () => { throw Error('synthetic commit failure'); };
        try { await save(frame(2), cache); } catch (e) { failed = e.message; } finally { PPTPageStore.add = original; }
        const empty = cache.signatures.size === 0;
        cacheSignature(cache, 1, new Uint8Array(82944)); stopRealtime(); const stopped = !cache.valid && cache.signatures.size === 0;
        const lessonCache = createDedupeContext(); applyLesson(); const switched = !lessonCache.valid;
        const sourceCache = createDedupeContext(); await releaseSource(); const released = !sourceCache.valid;
        fixtureStream.getTracks().forEach(track => track.stop()); return {failed, empty, stopped, switched, released};
      });
      assert.deepEqual(result, {failed: 'synthetic commit failure', empty: true, stopped: true, switched: true, released: true});
    });
    await test('ignore rectangle survives full reload and changes invalidate resume compatibility', async () => {
      const rect = {x: .6, y: .2, w: .3, h: .4};
      await page.evaluate(async rect => {
        ignoreRect = rect; await persistLesson(); await PPTLibrary.activate(db, activeLesson.id);
      }, rect);
      await page.reload(); await page.waitForFunction(() => ready);
      assert.deepEqual(await page.evaluate(() => ignoreRect), rect);
      const result = await page.evaluate(() => {
        sourceReady = true;
        activeLesson.task = {id: 'resume', state: 'paused', checkpoint: 2, settings: scanSettings(), crop: {...crop}, ignoreRect: {...ignoreRect}};
        const unchanged = canResume(); ignoreRect = {...ignoreRect, x: .5}; const changed = canResume();
        sourceReady = false; return {unchanged, changed};
      });
      assert.deepEqual(result, {unchanged: true, changed: false});
    });
    await test('legacy lesson failure restores its exact property set and leaves ignore-only batch state untouched', async () => {
      const result = await page.evaluate(async () => {
        activeLesson = {id: 'legacy-failure', course: {}, suspects: []}; lessons.push(activeLesson); applyLesson();
        await PPTLibrary.put(db, activeLesson); await PPTLibrary.activate(db, activeLesson.id);
        batchPage = 'synthetic-course'; batchJobs = [{id: 'manual', requiresCrop: true, course: {}, options: [], sourceName: 'synthetic', state: 'needs-crop'}]; activeBatchJob = batchJobs[0];
        await persistBatch();
        const before = structuredClone(activeLesson), batches = structuredClone(savedBatches), job = structuredClone(activeBatchJob);
        const put = PPTLibrary.put, batch = PPTLibrary.batch; let batchWrites = 0;
        PPTLibrary.put = async () => { throw Error('synthetic legacy failure'); };
        PPTLibrary.batch = async () => { batchWrites++; };
        try { await setComparisonRegion(crop, {x: .2, y: .2, w: .3, h: .3}, 'ignore'); }
        finally { PPTLibrary.put = put; PPTLibrary.batch = batch; }
        return {before, after: activeLesson, batches, afterBatches: savedBatches, job, afterJob: activeBatchJob,
          ignore: ignoreRect, batchWrites, message: $('status').textContent};
      });
      assert.deepEqual(result.after, result.before); assert.equal(Object.hasOwn(result.after, 'ignoreRect'), false);
      assert.deepEqual(result.afterBatches, result.batches); assert.deepEqual(result.afterJob, result.job);
      assert.equal(result.ignore, null); assert.equal(result.batchWrites, 0); assert.match(result.message, /synthetic legacy failure/);
      await page.reload(); await page.waitForFunction(() => ready);
      assert.deepEqual(await page.evaluate(() => activeLesson), result.before);
    });
    await test('batch request failure atomically rolls back lesson and confirmation in live and reloaded state', async () => {
      const result = await page.evaluate(async () => {
        activeBatchJob = batchJobs[0];
        const before = {lesson: structuredClone(activeLesson), batches: structuredClone(savedBatches), job: structuredClone(activeBatchJob), crop: {...crop}, ignore: ignoreRect};
        const put = IDBObjectStore.prototype.put; let lessonSucceeded = 0, batchFailed = 0;
        IDBObjectStore.prototype.put = function(value, key) {
          // A duplicate-key add fails asynchronously, after the preceding lesson put succeeds.
          if (this.name === 'settings' && key === 'batch:' + batchPage) {
            const request = this.add(value, 'lesson:' + activeLesson.id);
            request.addEventListener('error', () => { batchFailed++; }); return request;
          }
          const request = put.call(this, value, key);
          if (this.name === 'settings' && key === 'lesson:' + activeLesson.id) request.addEventListener('success', () => { lessonSucceeded++; });
          return request;
        };
        try { await setComparisonRegion({x: .1, y: .1, w: .8, h: .8}, null, 'crop', true); }
        finally { IDBObjectStore.prototype.put = put; }
        return {before, after: {lesson: activeLesson, batches: savedBatches, job: activeBatchJob, crop, ignore: ignoreRect},
          lessonSucceeded, batchFailed, message: $('status').textContent};
      });
      assert.equal(result.lessonSucceeded, 1); assert.equal(result.batchFailed, 1);
      assert.deepEqual(result.after, result.before); assert.match(result.message, /范围保存失败/);
      await page.reload(); await page.waitForFunction(() => ready);
      assert.deepEqual(await page.evaluate(() => ({lesson: activeLesson, batches: savedBatches, job: batchJobs[0], crop, ignore: ignoreRect})), result.before);
      const success = await page.evaluate(async () => {
        activeBatchJob = batchJobs[0];
        await setComparisonRegion({x: .1, y: .1, w: .8, h: .8}, null, 'crop', true);
        return {lesson: activeLesson, batches: savedBatches, job: activeBatchJob, crop, ignore: ignoreRect};
      });
      assert.deepEqual(success.crop, {x: .1, y: .1, w: .8, h: .8}); assert.equal(success.job.cropConfirmed, true);
      assert.equal(success.batches.find(item => item.page === 'synthetic-course').jobs[0].cropConfirmed, true);
      await page.reload(); await page.waitForFunction(() => ready);
      assert.deepEqual(await page.evaluate(() => ({lesson: activeLesson, batches: savedBatches, job: batchJobs[0], crop, ignore: ignoreRect})), success);
    });
    await test('standalone batch failure preserves the last successfully retained snapshot', async () => {
      const result = await page.evaluate(async () => {
        const before = structuredClone(savedBatches), original = PPTLibrary.batch; let error;
        batchJobs[0].cropConfirmed = false;
        PPTLibrary.batch = async () => { throw Error('synthetic batch failure'); };
        try { await persistBatch(); } catch (failure) { error = failure.message; }
        finally { PPTLibrary.batch = original; }
        return {before, after: savedBatches, error};
      });
      assert.deepEqual(result.after, result.before); assert.equal(result.error, 'synthetic batch failure');
      await page.reload(); await page.waitForFunction(() => ready);
      assert.deepEqual(await page.evaluate(() => savedBatches), result.before);
    });
    assert.deepEqual(blocked, []); console.log(`${passed} focused improvement groups passed; no external requests.`);
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
