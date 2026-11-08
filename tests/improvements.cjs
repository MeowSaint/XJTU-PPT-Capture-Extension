/* Improvement integrations: loopback only, synthetic canvas/video and fresh browser contexts. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright');
const {PDFDocument, PDFName} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..');
let browser, server, page, passed = 0;
const blocked = [];
async function test(name, run) { if (process.env.PPT_TEST_FILTER && !new RegExp(process.env.PPT_TEST_FILTER).test(name)) return; await run(); passed++; console.log('PASS ' + name); }
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
    await test('learning neutral suggestions preserve local details and require separate confirmation', async () => {
      const local = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'}), p = await local.newPage();
      await local.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      try {
        await p.goto(origin + '/capture.html'); await p.waitForFunction(() => ready); await p.locator('#terms-agree').check(); await p.locator('#terms-accept').click();
        const result = await p.evaluate(async () => {
          activeLesson = {id: 'suggestions', source: {sourceKey: 'synthetic', sourceName: 'synthetic'}, course: {}, crop: {x: 0, y: 0, w: 1, h: 1}, suspects: []}; lessons = [activeLesson]; pages = []; allPages = [];
          const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 192, 108); const asset = await PPTPageStore.encode(canvas);
          const plain = ctx.getImageData(0, 0, 192, 108).data, detail = plain.slice(); detail[40] += 64;
          for (let i = 0; i < 41; i++) { const page = {lessonId: activeLesson.id, order: i * 1024, w: 192, h: 108, sourceKey: 'synthetic', sourceName: 'synthetic', sourceTime: i < 8 ? i : 100 + i * 30, signatureCrop: {...activeLesson.crop}, learningExcluded: false}; page.id = await PPTPageStore.add(db, page, {...asset, sig: i === 2 ? detail : plain}); pages.push(page); }
          syncAllPages(); render(); controls(); await persistLesson();
          const reads = [], releases = [], get = PPTPageStore.assets;
          PPTPageStore.assets = async (db, ids) => { reads.push(ids.length); const values = await get(db, ids); return new Proxy(values, {set(target, key, value) { if (value === null) releases.push(target[key]?.id); return Reflect.set(target, key, value); }}); };
          try { await $('learning-suggest').onclick(); } finally { PPTPageStore.assets = get; }
          const rows = [...$('learning-suggestions').children].map(row => ({type: row.dataset.type, ids: [...row.querySelectorAll('input')].map(input => Number(input.value)), text: row.textContent}));
          const cut = plain.slice(), pixels = cut.length / 4;
          for (let i = 0; i < Math.floor(pixels * .05); i++) cut.fill(200, i * 4, i * 4 + 3);
          const at95 = lowChangeSignature(cut), mask = new Uint8Array(pixels); mask.fill(1, 0, Math.ceil(pixels * .05));
          cut.fill(200, Math.floor(pixels * .05) * 4, Math.floor(pixels * .05) * 4 + 3);
          return {rows, ids: pages.map(p => p.id), reads, releases, at95, below95: lowChangeSignature(cut), ignored: lowChangeSignature(cut, mask), flags: pages.map(p => p.learningExcluded), review: activeLesson.knowledgeReview || null};
        });
        assert(result.reads.every(n => n <= 32)); assert.equal(result.releases.length, 41); assert.equal(result.at95, true); assert.equal(result.below95, false); assert.equal(result.ignored, true);
        assert.deepEqual([...new Set(result.rows.map(row => row.type))].sort(), ['adjacent', 'dense', 'low-change']);
        assert(result.rows.some(row => row.type === 'adjacent' && row.ids.join() === result.ids.slice(0, 2).join()));
        assert(!result.rows.some(row => row.type === 'adjacent' && row.ids.includes(result.ids[2])), 'single local addition remains a distinct page');
        assert.deepEqual(result.rows.filter(row => row.type === 'dense').map(row => row.ids[0]), result.ids.slice(0, 8));
        assert(result.flags.every(flag => flag === false)); assert.equal(result.review, null);
        assert(!result.rows.some(row => /桌面|公式无效|无知识/.test(row.text)));
        await p.getByRole('button', {name: '对照两页', exact: true}).first().click(); await p.waitForFunction(() => !$('similar-pair').hidden); await p.locator('#similar-cancel').click();
        await p.locator('#learning-suggestions input:not(:disabled)').first().check(); await p.locator('#learning-cancel').click();
        await p.locator('#learning-suggest').click(); await p.waitForFunction(() => $('learning-status').textContent.includes('条线索'));
        assert.equal(await p.locator('#learning-suggestions input:checked').count(), 0); assert.equal(await p.locator('#learning-confirm').isDisabled(), true);
        assert.equal(await p.evaluate(() => pages.some(page => page.learningExcluded)), false);
        await p.locator('#learning-suggestions input:not(:disabled)').first().check(); await p.locator('#learning-confirm').click(); await p.waitForFunction(() => !busy());
        assert.deepEqual(await p.evaluate(() => pages.filter(page => page.learningExcluded).map(page => page.id)), [result.ids[0]]);
        await p.locator('#undo').click(); await p.waitForFunction(() => !busy()); assert.equal(await p.evaluate(() => pages.some(page => page.learningExcluded)), false);
        await p.evaluate(async () => { await setLearningExcluded([pages[0].id], true); $('learning-view').value = 'kept'; $('learning-view').onchange(); });
        await p.locator('#learning-suggest').click(); await p.waitForFunction(() => $('learning-status').textContent.includes('条线索'));
        await p.locator(`.learning-suggestion[data-type="low-change"]:has(input[value="${result.ids[0]}"]) button`).click();
        assert.equal(await p.locator('#lightbox').isVisible(), true, 'suggestions can preview an original page hidden by the gallery view');
        await p.waitForFunction(() => $('lightbox-img').complete && $('lightbox-img').naturalWidth > 0);
        await p.locator('#lightbox-close').click(); await p.locator('#learning-cancel').click(); await p.locator('#undo').click(); await p.waitForFunction(() => !busy());
        fs.mkdirSync(process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'learning-task-2'), {recursive: true});
        fs.writeFileSync(path.join(process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'learning-task-2'), 'suggestions.json'), JSON.stringify(result, null, 2));
      } finally { await local.close(); }
    });
    await test('local detail Canvas/scanner/save pipeline and comparison provenance', async () => {
      const local = await browser.newContext({viewport: {width: 1440, height: 1000}});
      const errors = []; const localPage = await local.newPage(); localPage.on('pageerror', error => errors.push(error.message));
      await local.route('**/*', route => {
        if (route.request().url().startsWith(origin + '/')) return route.continue();
        blocked.push(route.request().url()); return route.abort();
      });
      try {
        await localPage.goto(origin + '/capture.html'); await localPage.waitForFunction(() => ready);
        await localPage.locator('#terms-agree').check(); await localPage.locator('#terms-accept').click();
        const evidenceRoot = process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'learning-task-1'); fs.mkdirSync(evidenceRoot, {recursive: true});
        const output = fs.mkdtempSync(path.join(evidenceRoot, 'canvas-'));
        await localPage.exposeFunction('recordLocalDetailInput', packet => {
          packet.frames.forEach((f, i) => {
            fs.writeFileSync(path.join(output, `input-${i}.rgba`), Buffer.from(f.sig));
            fs.writeFileSync(path.join(output, `input-${i}.jpg`), Buffer.from(f.image));
            fs.writeFileSync(path.join(output, `input-${i}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
          });
          delete packet.frames;
          fs.writeFileSync(path.join(output, 'input.json'), JSON.stringify(packet, null, 2) + '\n');
          console.log('Local detail input: ' + JSON.stringify(packet));
          console.log('Local detail evidence: ' + output);
        });
        await localPage.exposeFunction('recordLocalDetailCleanup', state => {
          fs.writeFileSync(path.join(output, 'cleanup.json'), JSON.stringify(state, null, 2) + '\n');
          console.log('Local detail cleanup: ' + JSON.stringify(state));
          assert(Object.values(state).every(Boolean), 'local detail resources restore even on input failure');
        });
        const result = await localPage.evaluate(async () => {
          // Synthetic seek events drive the real scanner; frame still crops and resizes actual Canvas pixels.
          const canvas = document.createElement('canvas'); canvas.width = 710; canvas.height = 378;
          const ctx = canvas.getContext('2d'), drawImage = CanvasRenderingContext2D.prototype.drawImage;
          let paint = () => {}, clock = 0, duration = 6;
          // Signature-cell geometry keeps these tiny glyphs observable without system-font rasterization.
          const glyph = (rows, x, baseline) => {
            const sx = canvas.width / 192, sy = canvas.height / 108;
            const left = Math.round(x / sx), top = Math.round(baseline / sy) - rows.length;
            rows.forEach((row, y) => [...row].forEach((ink, x) => { if (ink === '1') ctx.fillRect((left + x) * sx, (top + y) * sy, sx, sy); }));
          };
          const paintStage = time => {
            const stage = Math.floor(time); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 710, 378);
            ctx.fillStyle = '#000'; ctx.font = '28px serif'; ctx.fillText('E = mc     x     Data:', 50, 100);
            if (stage >= 1) glyph(['011', '010', '110'], 161, 80);
            if (stage >= 2) glyph(['1', '0', '1'], 183, 110);
            if (stage >= 3) glyph(['010', '110', '111'], 331, 100);
            // Exact 48/8 signature-pixel controls are tested separately below.
            if (stage >= 4) { ctx.font = '22px serif'; ctx.fillText('+ C', 360, 100); }
            if (stage >= 5) { ctx.fillStyle = '#d00000'; ctx.fillRect(400, 140, 20, 8); }
          };
          const properties = ['readyState', 'videoWidth', 'videoHeight', 'duration', 'seeking', 'currentTime', 'requestVideoFrameCallback', 'cancelVideoFrameCallback'];
          const descriptors = properties.map(name => Object.getOwnPropertyDescriptor(video, name)), callbacks = new Map();
          let callbackId = 0, render, seeking = false, presentedFrames = 0;
          Object.defineProperties(video, {
            readyState: {configurable: true, get: () => 2}, videoWidth: {configurable: true, get: () => canvas.width}, videoHeight: {configurable: true, get: () => canvas.height},
            duration: {configurable: true, get: () => duration}, seeking: {configurable: true, get: () => seeking},
            requestVideoFrameCallback: {configurable: true, value: callback => { const id = ++callbackId; callbacks.set(id, callback); return id; }},
            cancelVideoFrameCallback: {configurable: true, value: id => callbacks.delete(id)},
            currentTime: {configurable: true, get: () => clock, set: time => {
              clock = time; seeking = true;
              render = requestAnimationFrame(() => {
                render = undefined; paint(time); seeking = false; presentedFrames++;
                const metadata = {presentationTime: performance.now(), mediaTime: time, presentedFrames, width: canvas.width, height: canvas.height};
                video.dispatchEvent(new Event('seeked'));
                const pending = [...callbacks.values()]; callbacks.clear();
                for (const callback of pending) callback(performance.now(), metadata);
              });
            }}
          });
          CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) { return drawImage.call(this, source === video ? canvas : source, ...args); };
          const reset = async (name, dedupe = true) => {
            activeLesson = {id: 'local-' + name, course: {}, source: {kind: 'file', sourceKey: 'synthetic-local', sourceName: 'synthetic-local'}, crop: {x: 0, y: 0, w: 1, h: 1}, suspects: [], created: Date.now()};
            lessons.push(activeLesson); applyLesson(); sourceReady = true; loadedIdentity = {...activeLesson.source}; sourceName = 'synthetic-local';
            $('mode').value = '0.5'; $('diff').value = '1.2'; $('dedupe').checked = dedupe; ignoreRect = null;
            await persistLesson();
          };
          const imageBytes = async id => {
            const asset = await PPTPageStore.asset(db, id); return {sig: [...asset.sig], image: [...new Uint8Array(await asset.image.arrayBuffer())]};
          };
          try {
            await reset('knowledge'); paint = paintStage; paint(0);
            const distances = [], expected = [], inputFrames = [], preconditions = [];
            for (let stage = 0; stage < 6; stage++) {
              paint(stage); const f = frame(stage + .25), encoded = await PPTPageStore.encode(f.canvas);
              expected.push({sig: f.sig, image: [...new Uint8Array(await encoded.image.arrayBuffer())]});
              inputFrames.push({sig: [...f.sig], image: expected[stage].image, png: f.canvas.toDataURL()});
              if (stage) distances.push(PPTCore.frameDistance(expected[stage - 1].sig, f.sig));
              if (stage >= 1 && stage <= 3) {
                const previous = expected[stage - 1].sig, pixels = f.sig.length / 4, bias = [0, 0, 0], raw = [], strong = [];
                for (let at = 0; at < f.sig.length; at += 4) for (let c = 0; c < 3; c++) bias[c] += previous[at + c] - f.sig[at + c];
                for (let c = 0; c < 3; c++) bias[c] = Math.abs(bias[c] / pixels) <= 8 ? bias[c] / pixels : 0;
                for (let at = 0; at < f.sig.length; at += 4) {
                  const delta = [0, 1, 2].map(c => previous[at + c] - f.sig[at + c]);
                  const pixel = {pixel: at / 4, before: [...previous.slice(at, at + 4)], after: [...f.sig.slice(at, at + 4)]};
                  if (Math.max(...delta.map(Math.abs)) >= 48) raw.push(pixel);
                  if (Math.max(...delta.map((n, c) => Math.abs(n - bias[c]))) >= 48) strong.push(pixel);
                }
                preconditions.push({stage, raw, strong, bias, distance: distances.at(-1), local: PPTCore.hasLocalChange(previous, f.sig)});
              }
            }
            await window.recordLocalDetailInput({userAgent: navigator.userAgent, dpr: devicePixelRatio, canvas: [710, 378], signature: [192, 108], frames: inputFrames, preconditions});
            for (const p of preconditions) {
              if (!(p.raw.length >= 1 && p.raw.length < 8 && p.strong.length >= 1 && p.strong.length < 8 && p.distance.changed < 1.2 && p.distance.mean < .6 && p.local)) {
                throw Error('Tiny glyph input precondition failed before scanner: ' + JSON.stringify(p));
              }
            }
            paint(0); const scan = await fastScan(), saved = [];
            for (let i = 0; i < pages.length; i++) {
              const p = pages[i], stage = Math.floor(p.sourceTime), asset = await imageBytes(p.id), previous = expected[Math.max(0, stage - 1)].sig;
              const changedPixels = [];
              for (let at = 0; at < asset.sig.length; at += 4) if (Math.max(...[0, 1, 2].map(c => Math.abs(asset.sig[at + c] - previous[at + c]))) >= 48) changedPixels.push({pixel: at / 4, before: [...previous.slice(at, at + 3)], after: asset.sig.slice(at, at + 3)});
              saved.push({id: p.id, sourceTime: p.sourceTime, sourceKey: p.sourceKey, imageEqual: JSON.stringify(asset.image) === JSON.stringify(expected[stage].image),
                sigEqual: asset.sig.every((n, j) => n === expected[stage].sig[j]), changedPixels, signature: asset.sig, image: asset.image});
            }
            const knowledgeVersion = activeLesson.task.comparisonVersion;
            const knowledgePages = pages.slice(); pages = knowledgePages.slice(0, 2); await cleanSimilar(); const detailCandidate = !!similarReview?.pair; closeSimilar(); pages = knowledgePages;
            const controls = [];
            canvas.width = 192; canvas.height = 108; duration = 3;
            for (const [name, count, dedupe, masked] of [['formula', 48, true, false], ['annotation', 8, true, false], ['single-on', 1, true, false], ['single-off', 1, false, false], ['ignored', 1, true, true], ['brightness', 0, true, false]]) {
              await reset(name, dedupe); if (masked) ignoreRect = {x: 0, y: 0, w: .1, h: .1};
              paint = time => {
                ctx.fillStyle = name === 'brightness' && time >= 1 && time < 2 ? '#f7f7f7' : '#fff'; ctx.fillRect(0, 0, 192, 108);
                if (time >= 1 && time < 2) { ctx.fillStyle = name === 'annotation' ? '#ff0000' : '#000'; ctx.fillRect(0, 0, count, count ? 1 : 0); }
              };
              paint(0); const outcome = await fastScan();
              if (!outcome) throw Error(name + ': ' + $('status').textContent);
              const assets = []; for (const p of pages) { const asset = await imageBytes(p.id); assets.push({id: p.id, sourceTime: p.sourceTime, pixel: asset.sig.slice(0, 4)}); }
              controls.push({name, saved: outcome.saved, unstable: outcome.unstable, assets});
            }
            // Real adjacent-review candidates still work for identical pages; choosing both preserves IDs.
            await reset('manual'); paint = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 192, 108); }; paint();
            await save(frame(0)); await save(frame(1)); const manualIds = pages.map(p => p.id);
            await cleanSimilar(); const duplicateCandidate = similarReview?.pair?.map(p => p.id); await chooseSimilar('both'); await $('similar-confirm').onclick();
            const manualAfter = pages.map(p => p.id);
            // Resume at an actual safe checkpoint, using each provenance class without changing settings.
            const resumes = [];
            for (const version of [null, 'old-v0', 'local-v1', 'mixed']) {
              await reset('resume-' + version); duration = 3;
              activeLesson.task = {id: 'checkpoint-' + version, state: 'paused', checkpoint: 1, baselineTime: .25, duration, settings: scanSettings(), crop: {...crop}, ignoreRect: null,
                ...(version === null ? {} : {comparisonVersion: version})};
              await save(frame(.25)); const retained = pages[0], before = await imageBytes(retained.id), seeks = [];
              paint = time => { seeks.push(time); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 192, 108); };
              const settings = JSON.stringify(scanSettings()), context = createDedupeContext(); cacheSignature(context, retained.id, new Uint8Array(before.sig));
              const eligible = canResume(); await fastScan(); const after = await imageBytes(retained.id);
              const stored = await new Promise((resolve, reject) => { const r = db.transaction('settings').objectStore('settings').get('lesson:' + activeLesson.id); r.onsuccess = () => resolve(r.result.task); r.onerror = () => reject(r.error); });
              resumes.push({version, eligible, id: activeLesson.task.id, comparisonVersion: activeLesson.task.comparisonVersion, storedVersion: stored.comparisonVersion,
                checkpoint: activeLesson.task.checkpoint, seeks, settingsEqual: settings === JSON.stringify(scanSettings()), retainedId: pages[0].id === retained.id,
                imageEqual: JSON.stringify(before) === JSON.stringify(after), count: pages.length});
            }
            return {saved, scan, distances, knowledgeVersion, detailCandidate, controls, manualIds, duplicateCandidate, manualAfter, resumes};
          } finally {
            closeSimilar(); releaseDedupeContext(); CanvasRenderingContext2D.prototype.drawImage = drawImage; sourceReady = false;
            if (render !== undefined) cancelAnimationFrame(render); callbacks.clear();
            properties.forEach((name, i) => { if (descriptors[i]) Object.defineProperty(video, name, descriptors[i]); else delete video[name]; });
            await window.recordLocalDetailCleanup({drawImageRestored: CanvasRenderingContext2D.prototype.drawImage === drawImage, dedupeReleased: dedupeContext === null, reviewClosed: similarReview === null, sourceReleased: !sourceReady,
              videoRestored: properties.every((name, i) => JSON.stringify(Object.getOwnPropertyDescriptor(video, name)) === JSON.stringify(descriptors[i])), callbacksReleased: callbacks.size === 0});
          }
        });
        result.saved.forEach((p, i) => {
          fs.writeFileSync(path.join(output, `knowledge-${i}-${p.id}.jpg`), Buffer.from(p.image));
          fs.writeFileSync(path.join(output, `knowledge-${i}-${p.id}.rgba`), Buffer.from(p.signature)); delete p.image; delete p.signature;
        });
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(result, null, 2) + '\n'); console.log('Local detail evidence: ' + output);
        assert.deepEqual(result.saved.map(p => p.sourceTime), [.25, 1.25, 2.25, 3.25, 4.25, 5.25]);
        assert.equal(new Set(result.saved.map(p => p.id)).size, 6);
        assert(result.saved.every(p => p.imageEqual && p.sigEqual && p.sourceKey === 'synthetic-local'));
        assert(result.distances.every(d => d.changed < 1.2 && d.mean < .6), 'all increments pass the old global rule');
        assert(result.saved.slice(1, 4).every(p => p.changedPixels.length >= 1 && p.changedPixels.length < 8), 'superscript/subscript/digit need fewer than eight pixels');
        assert.equal(result.knowledgeVersion, 'local-v1'); assert.equal(result.detailCandidate, false);
        for (const c of result.controls) {
          const ignored = ['ignored', 'brightness'].includes(c.name), returning = c.name === 'single-off';
          assert.deepEqual(c.assets.map(p => p.sourceTime), ignored ? [.25] : returning ? [.25, 1.25, 2.25] : [.25, 1.25], c.name);
          assert.equal(c.unstable, 0); assert.equal(c.assets[0].pixel[0], 255);
          if (!ignored) assert.equal(c.assets[1].pixel[c.name === 'annotation' ? 1 : 0], 0, c.name);
        }
        assert.deepEqual(result.duplicateCandidate, result.manualIds); assert.deepEqual(result.manualAfter, result.manualIds);
        for (const r of result.resumes) {
          assert(r.eligible && r.settingsEqual && r.retainedId && r.imageEqual); assert.equal(r.count, 1);
          assert.equal(r.id, 'checkpoint-' + r.version); assert.equal(r.checkpoint, 2.95); assert.deepEqual(r.seeks.slice(0, 2), [.25, 1]);
          assert.equal(r.comparisonVersion, r.version === 'local-v1' ? 'local-v1' : 'mixed'); assert.equal(r.storedVersion, r.comparisonVersion);
        }
        assert.deepEqual(errors, []);
      } finally { await local.close(); }
    });
    if (process.env.PPT_TEST_LOCAL_DETAIL_ONLY) { assert.deepEqual(blocked, []); return; }
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
          const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
          const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          PPTPageStore.assets = async () => [{sig: a, image}, {sig: b, image}]; deletePages = async ids => { deleted.push(...ids); };
          await cleanSimilar(); const deferred = deleted.length === 0 && similarReview?.pair?.length === 2;
          await chooseSimilar('later'); const deferredConfirmation = deleted.length === 0 && similarReview.complete;
          await $('similar-confirm').onclick(); const maskedCleanup = deferred && deferredConfirmation && deleted.join(',') === '1';
          deleted = []; delete pages[0].signatureCrop; await cleanSimilar();
          return {ignoredTransition, ignoredConfirmation, realTransition, maskedCleanup, legacyKept: deleted.length === 0 && similarReview === null};
        } finally { closeSimilar(); stopRealtime(); frame = originalFrame; save = originalSave; PPTPageStore.assets = originalAssets; deletePages = originalDelete; pages = originalPages; }
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
    // Task 4 gets its own empty browser storage; all JPEGs are synthetic canvas drawings.
    await context.close();
    const exportContext = await browser.newContext({viewport: {width: 1440, height: 1000}});
    await exportContext.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    page = await exportContext.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/capture.html'); await page.waitForFunction(() => ready);
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click();
    const scratch = process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'v3.1.3'); fs.mkdirSync(scratch, {recursive: true});
    const output = fs.mkdtempSync(path.join(scratch, 'task4-')); console.log('Task4 artifacts: ' + output);
    const idle = () => page.waitForFunction(() => ready && !busy());
    const download = async (selector, label) => {
      const [file] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
      const destination = path.join(output, label + path.extname(file.suggestedFilename())); await file.saveAs(destination); await idle();
      return {name: file.suggestedFilename(), bytes: fs.readFileSync(destination)};
    };
    function members(bytes) {
      const end = bytes.length - 22; assert.equal(bytes.readUInt32LE(end), 0x06054b50);
      let at = bytes.readUInt32LE(end + 16); const entries = [];
      for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
        assert.equal(bytes.readUInt32LE(at), 0x02014b50);
        const size = bytes.readUInt32LE(at + 20), nameLength = bytes.readUInt16LE(at + 28), local = bytes.readUInt32LE(at + 42);
        const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
        entries.push({name: bytes.toString('utf8', at + 46, at + 46 + nameLength), bytes: bytes.subarray(start, start + size)});
        at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
      }
      return entries;
    }
    async function inspectPDF(bytes, expected, {annotated = false, sheets = expected.length} = {}) {
      const pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(), sheets);
      const actual = [], titles = [], texts = [];
      for (const sheet of pdf.getPages()) {
        const images = sheet.node.Resources().lookup(PDFName.of('XObject'));
        for (const key of images.keys()) actual.push(Buffer.from(images.lookup(key).contents));
        texts.push(Buffer.from(pdf.context.lookup(sheet.node.get(PDFName.of('Contents'))).contents).toString('ascii'));
      }
      assert.deepEqual(actual, expected.map(image => Buffer.from(image, 'base64')));
      let ref = pdf.catalog.lookup(PDFName.of('Outlines'))?.get(PDFName.of('First'));
      while (ref) { const item = pdf.context.lookup(ref); titles.push(item.get(PDFName.of('Title')).decodeText()); ref = item.get(PDFName.of('Next')); }
      assert.equal(titles.length, annotated ? expected.length : 0);
      if (annotated) assert.match(texts.join('\n'), /\d{2}:\d{2}:\d{2}/);
      return {pdf, titles, texts};
    }
    async function inspectCourse(bytes, expected, title, {sheets = expected.length, times = true} = {}) {
      const pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(), sheets);
      assert.equal(pdf.catalog.get(PDFName.of('PageMode')).toString(), '/UseOutlines');
      const originals = [], texts = [], leaves = [], lessonTitles = [];
      for (const sheet of pdf.getPages()) {
        const objects = sheet.node.Resources().lookup(PDFName.of('XObject'));
        for (const key of objects.keys()) originals.push(Buffer.from(objects.lookup(key).contents));
        texts.push(Buffer.from(pdf.context.lookup(sheet.node.get(PDFName.of('Contents'))).contents).toString('ascii'));
      }
      assert.deepEqual(originals, expected.map(image => Buffer.from(image, 'base64')));
      const root = pdf.catalog.lookup(PDFName.of('Outlines')), course = pdf.context.lookup(root.get(PDFName.of('First')));
      assert.equal(course.get(PDFName.of('Title')).decodeText(), title);
      assert.equal(root.get(PDFName.of('Next')), undefined);
      let ref = course.get(PDFName.of('First'));
      while (ref) {
        const lesson = pdf.context.lookup(ref); lessonTitles.push(lesson.get(PDFName.of('Title')).decodeText());
        let leaf = lesson.get(PDFName.of('First'));
        while (leaf) { const node = pdf.context.lookup(leaf); leaves.push(node.get(PDFName.of('Title')).decodeText()); leaf = node.get(PDFName.of('Next')); }
        ref = lesson.get(PDFName.of('Next'));
      }
      assert.equal(leaves.length, expected.length);
      if (times) assert.match(texts.join('\n'), /\d{2}:\d{2}:\d{2}/); else assert(!texts.join('\n').match(/\d{2}:\d{2}:\d{2}/));
      return {pdf, lessonTitles, leaves, texts};
    }
    let images;
    await test('PDF defaults, zero selection guards, and synthetic export fixtures', async () => {
      assert(await page.locator('#selected-pdf').isDisabled()); assert(await page.locator('#selected-zip').isDisabled());
      assert(await page.locator('#batch-course-zip').isDisabled());
      assert.deepEqual(await page.evaluate(() => pdfOptions()), {layout: 'single', timestamps: false, bookmarks: false});
      images = await page.evaluate(async () => {
        const A = {name: 'Synthetic A', date: '2026-11-06', start: '08:00:00'}, B = {...A, name: 'Synthetic B'};
        const aPage = 'https://rms-v5.xjtu.edu.cn/study-capture-courses/101/preview-detail/a';
        const bPage = 'https://rms-v5.xjtu.edu.cn/study-capture-courses/202/preview-detail/b';
        const make = (id, course, page, state) => ({id, course, page, source: {kind: 'file', sourceKey: id, sourceName: id, page, batchJobId: id === 'B' ? 'B-job' : ''},
          crop: {x: 0, y: 0, w: 1, h: 1}, suspects: [], created: 1, namingManual: true, task: {state}});
        lessons = [make('A', A, aPage, 'done'), make('B', B, bPage, 'paused'), make('B-empty', B, bPage, 'done')];
        for (const lesson of lessons) await PPTLibrary.put(db, lesson);
        const originals = []; allPages = [];
        for (let i = 0; i < 5; i++) {
          const canvas = document.createElement('canvas'); canvas.width = i === 1 ? 540 : 960; canvas.height = i === 1 ? 960 : 540;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = ['#e6f1ff', '#ffe6d9', '#def5e4', '#f2e6ff', '#fff3c4'][i]; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#203040'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
          ctx.fillStyle = '#203040'; ctx.font = '36px sans-serif'; ctx.fillText(`Synthetic ${i < 3 ? 'A' : 'B'} slide ${i + 1}`, 24, 64);
          ctx.font = '20px sans-serif'; ctx.fillText('Image edges must remain visible', 24, canvas.height - 30);
          const encoded = await PPTPageStore.encode(canvas); originals.push(btoa(String.fromCharCode(...new Uint8Array(await encoded.image.arrayBuffer()))));
          const metadata = {lessonId: i < 3 ? 'A' : 'B', order: [2048, 3072, 1024, 2048, 1024][i], w: canvas.width, h: canvas.height,
            sourceTime: i === 1 ? null : 61 + i, time: 1, course: i < 3 ? A : B};
          metadata.id = await PPTPageStore.add(db, metadata, encoded); allPages.push(metadata);
        }
        batchPage = bPage; batchJobs = [{id: 'B-job', course: B, sourceName: 'B', state: 'partial', requiresCrop: false, selected: false},
          {id: 'B-future', course: B, sourceName: 'Upcoming', state: 'pending', requiresCrop: false, selected: true}];
        await persistBatch(); activeLesson = lessons[0]; await PPTLibrary.activate(db, activeLesson.id); applyLesson(); render(); renderLibrary(); renderBatchJobs(); controls();
        return originals;
      });
      await idle(); assert(await page.locator('#selected-pdf').isDisabled());
      assert.match(await page.locator('#current-lesson').textContent(), /当前整理.*Synthetic A/);
      assert.match(await page.locator('#current-course-context').textContent(), /当前课次所属课程.*Synthetic A/);
      assert.match(await page.locator('#batch-course-context').textContent(), /批量列表课程.*Synthetic B/);
      assert.equal(await page.locator('#export-view').inputValue(), 'raw');
      assert.equal(await page.locator('#export-scope').textContent(), '原始全部 · 3 / 3 页');
      const all = await download('#pdf', 'default-all'); assert(!all.name.includes('-selected'));
      await inspectPDF(all.bytes, [images[2], images[0], images[1]]);
      await page.locator('#tab-export').click();
      const merged = await download('#course-pdf', 'merged-default-A'); assert.equal(merged.name, 'Synthetic A-整课.pdf');
      const parsed = await inspectCourse(merged.bytes, [images[2], images[0], images[1]], 'Synthetic A', {times: false});
      assert.deepEqual(parsed.lessonTitles, ['第 1 课 · 2026-11-06 08:00:00']);
      assert.deepEqual(parsed.leaves, ['第 1 页 · 00:01:03', '第 2 页 · 00:01:01', '第 3 页']);
    });
    await test('selected PDF/image ZIP export zero, one and many in displayed order; all-retained ignores selection', async () => {
      const cards = page.locator('#pages article');
      await cards.nth(2).locator('.page-select').check();
      const one = await download('#selected-pdf', 'selected-one'); assert.match(one.name, /-selected\.pdf$/);
      await inspectPDF(one.bytes, [images[1]]);
      const oneZIP = await download('#selected-zip', 'selected-one-images'); assert.match(oneZIP.name, /-selected-slides\.zip$/);
      assert.deepEqual(members(oneZIP.bytes).map(x => x.bytes), [Buffer.from(images[1], 'base64')]);
      await cards.nth(0).locator('.page-select').check();
      const selected = await download('#selected-pdf', 'selected-many'); await inspectPDF(selected.bytes, [images[2], images[1]]);
      const zip = await download('#selected-zip', 'selected-images'); assert.match(zip.name, /-selected-slides\.zip$/);
      assert.deepEqual(members(zip.bytes).map(x => x.bytes), [images[2], images[1]].map(x => Buffer.from(x, 'base64')));
      const all = await download('#pdf', 'all-with-selection'); await inspectPDF(all.bytes, [images[2], images[0], images[1]]);
      const allZIP = await download('#export-zip', 'all-images'); assert(!allZIP.name.includes('-selected'));
      assert.deepEqual(members(allZIP.bytes).map(x => x.bytes), [images[2], images[0], images[1]].map(x => Buffer.from(x, 'base64')));
      await page.locator('#clear-selection').click(); assert(await page.locator('#selected-pdf').isDisabled()); assert(await page.locator('#selected-zip').isDisabled());
    });
    await test('PDF preferences persist, normalize old records, and roll back storage failure', async () => {
      await page.locator('#tab-export').click();
      await page.locator('#pdf-timestamps').check(); await idle(); await page.locator('#pdf-bookmarks').check(); await idle();
      await page.reload(); await idle();
      assert.deepEqual(await page.evaluate(() => pdfOptions()), {layout: 'single', timestamps: true, bookmarks: true});
      const single = await download('#pdf', 'annotated-single'); await inspectPDF(single.bytes, [images[2], images[0], images[1]], {annotated: true});
      await page.locator('#tab-export').click(); await page.locator('#pdf-layout').selectOption('handout'); await idle();
      const failure = await page.evaluate(async () => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'settings' && key === 'exportPDF') { this.transaction.abort(); throw Error('synthetic PDF settings failure'); } return original.call(this, value, key); };
        try { $('pdf-timestamps').checked = false; await $('pdf-timestamps').onchange(); }
        finally { IDBObjectStore.prototype.put = original; }
        return {options: pdfOptions(), message: $('status').textContent};
      });
      assert.deepEqual(failure.options, {layout: 'handout', timestamps: true, bookmarks: true}); assert.match(failure.message, /synthetic PDF settings failure/);
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => pdfOptions()), failure.options);
      await page.evaluate(async () => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({layout: 'unknown', timestamps: 'true', bookmarks: 1}, 'exportPDF'); await new Promise(resolve => tx.oncomplete = resolve); });
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => pdfOptions()), {layout: 'single', timestamps: false, bookmarks: false});
      await page.locator('#tab-export').click();
      await page.locator('#pdf-layout').selectOption('handout'); await idle(); await page.locator('#pdf-timestamps').check(); await idle(); await page.locator('#pdf-bookmarks').check(); await idle();
    });
    await test('annotations reach all/selected PDFs, per-job PDFs and both course ZIP entry points with independent batch scope', async () => {
      const all = await download('#pdf', 'annotated-handout'); await inspectPDF(all.bytes, [images[2], images[0], images[1]], {annotated: true, sheets: 2});
      await page.locator('#pages article').nth(1).locator('.page-select').check();
      const selected = await download('#selected-pdf', 'annotated-selected'); await inspectPDF(selected.bytes, [images[0]], {annotated: true, sheets: 1});
      await page.locator('#tab-export').click();
      const course = await download('#course-zip', 'course-A'); assert.equal(course.name, 'Synthetic A-课次PDF.zip');
      const entries = members(course.bytes); assert.equal(entries.length, 1); await inspectPDF(entries[0].bytes, [images[2], images[0], images[1]], {annotated: true, sheets: 2});
      await page.locator('#tab-source').click(); await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      // Switching lessons must not redirect the batch panel to the active lesson's course.
      await page.locator('#lesson-select').selectOption('B'); await idle(); await page.locator('#lesson-select').selectOption('A'); await idle();
      const job = await download('[data-job-id="B-job"] button:not(.batch-view)', 'job-B');
      const jobPDF = await inspectPDF(job.bytes, [images[4], images[3]], {annotated: true, sheets: 1});
      assert.equal(jobPDF.titles.length, 2); assert(jobPDF.texts[0].includes('00:01:05'));
      const batch = await download('#batch-course-zip', 'batch-course-B'); assert.equal(batch.name, 'Synthetic B-课次PDF.zip');
      const batchEntries = members(batch.bytes); assert.equal(batchEntries.length, 1);
      assert.deepEqual(batchEntries[0].bytes, job.bytes);
      const message = await page.locator('#batch-status').textContent(); assert.match(message, /共 2 页/); assert.match(message, /跳过 2 个空课次/); assert.match(message, /1 节尚未完成/);
      assert.equal(await page.locator('#lesson-select').inputValue(), 'A');
    });
    await test('merged PDF buttons keep active and batch courses independent, including unselected partial lessons', async () => {
      await page.locator('#tab-export').click();
      const main = await download('#course-pdf', 'merged-handout-A'); assert.equal(main.name, 'Synthetic A-整课.pdf');
      await inspectCourse(main.bytes, [images[2], images[0], images[1]], 'Synthetic A', {sheets: 2});
      await page.locator('#tab-source').click(); await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      const batch = await download('#batch-course-pdf', 'merged-handout-B'); assert.equal(batch.name, 'Synthetic B-整课.pdf');
      const parsed = await inspectCourse(batch.bytes, [images[4], images[3]], 'Synthetic B', {sheets: 1});
      assert.deepEqual(parsed.leaves, ['第 1 页 · 00:01:05', '第 2 页 · 00:01:04']);
      assert.match(await page.locator('#batch-status').textContent(), /共 2 页.*跳过 2 个空课次.*1 节尚未完成/);
      assert.equal(await page.locator('#lesson-select').inputValue(), 'A');
    });
    await test('merged export freezes metadata, title, warnings and options during actual writes and rejects competing work', async () => {
      await page.evaluate(() => {
        window.originalCreate = PPTDiskCache.create;
        PPTDiskCache.create = async kind => {
          const cache = await originalCreate(kind), write = cache.write; let held = false;
          cache.write = async bytes => { if (!held) { held = true; await new Promise(resolve => window.releaseExport = resolve); } return write(bytes); };
          return cache;
        };
        window.exportPromise = exportCoursePDF();
      });
      await page.waitForFunction(() => !!window.releaseExport && exportBusy);
      for (const id of ['selected-pdf', 'selected-zip', 'pdf', 'export-zip', 'course-zip', 'batch-course-zip', 'course-pdf', 'batch-course-pdf', 'pdf-layout', 'pdf-timestamps', 'pdf-bookmarks']) assert(await page.locator('#' + id).isDisabled());
      const event = page.waitForEvent('download');
      await page.evaluate(async () => {
        await exportCoursePDF(batchCourseKey()); await exportCourseZIP(); await exportRetained('pdf');
        activeLesson.course.name = 'Mutated'; activeLesson.task.state = 'paused'; lessons.reverse(); allPages.reverse();
        selectedPages.clear(); pages.reverse(); pages[1].sourceTime = 999;
        $('pdf-layout').value = 'single'; $('pdf-timestamps').checked = false; $('pdf-bookmarks').checked = false;
        releaseExport();
      });
      const file = await event, destination = path.join(output, 'merged-snapshot.pdf'); await file.saveAs(destination);
      await page.evaluate(async () => {
        await exportPromise; PPTDiskCache.create = originalCreate; delete window.releaseExport;
        activeLesson.course.name = 'Synthetic A'; activeLesson.task.state = 'done'; lessons.reverse(); allPages.reverse(); pages.reverse(); pages[1].sourceTime = 61;
        applyPDFOptions(savedPDFOptions); render(); controls();
      });
      assert.equal(file.suggestedFilename(), 'Synthetic A-整课.pdf');
      await inspectCourse(fs.readFileSync(destination), [images[2], images[0], images[1]], 'Synthetic A', {sheets: 2});
      assert(!await page.locator('#status').textContent().then(text => text.includes('尚未完成')));
    });
    await test('selected export snapshots metadata/options before asynchronous writes and locks competing exports', async () => {
      await page.locator('#select-all').click();
      await page.evaluate(() => {
        window.originalCreate = PPTDiskCache.create;
        PPTDiskCache.create = async kind => { await new Promise(resolve => window.releaseExport = resolve); return originalCreate(kind); };
        window.exportPromise = exportRetained('pdf', true);
      });
      await page.waitForFunction(() => !!window.releaseExport);
      for (const id of ['selected-pdf', 'selected-zip', 'pdf', 'export-zip', 'course-zip', 'batch-course-zip', 'pdf-timestamps', 'pdf-bookmarks']) assert(await page.locator('#' + id).isDisabled());
      const event = page.waitForEvent('download');
      await page.evaluate(() => { selectedPages.clear(); pages.reverse(); pages[1].sourceTime = 999; $('pdf-timestamps').checked = false; $('pdf-bookmarks').checked = false; releaseExport(); });
      const file = await event; const destination = path.join(output, 'snapshot.pdf'); await file.saveAs(destination);
      await page.evaluate(async () => { await exportPromise; PPTDiskCache.create = originalCreate; pages.reverse(); pages[1].sourceTime = 61; applyPDFOptions(savedPDFOptions); render(); controls(); });
      await inspectPDF(fs.readFileSync(destination), [images[2], images[0], images[1]], {annotated: true, sheets: 2});
    });
    await test('batch course ZIP reports missing scope, empty courses and unavailable images without sticking busy', async () => {
      const result = await page.evaluate(async () => {
        const messages = []; await exportCourseZIP(null, 'batch-status'); messages.push($('batch-status').textContent);
        await exportCourseZIP('missing-course', 'batch-status'); messages.push($('batch-status').textContent);
        const read = PPTPageStore.imageBytes; PPTPageStore.imageBytes = async () => { throw Error('synthetic unavailable image'); };
        try { await exportCourseZIP(batchCourseKey(), 'batch-status'); messages.push($('batch-status').textContent); }
        finally { PPTPageStore.imageBytes = read; }
        return {messages, busy: busy(), enabled: !$('batch-course-zip').disabled};
      });
      assert.match(result.messages[0], /请先读取课程录像列表/); assert.match(result.messages[1], /本课程还没有截图/); assert.match(result.messages[2], /synthetic unavailable image/);
      assert.equal(result.busy, false); assert.equal(result.enabled, true);
    });
    await test('merged course export rejects missing/empty scopes, honors real busy guards and cleans failed caches', async () => {
      const result = await page.evaluate(async () => {
        const messages = [], create = PPTDiskCache.create, read = PPTPageStore.imageBytes; let created = 0, removed = 0;
        await exportCoursePDF(null, 'batch-status'); messages.push($('batch-status').textContent);
        await exportCoursePDF('missing-course', 'batch-status'); messages.push($('batch-status').textContent);
        try {
          PPTDiskCache.create = async () => { created++; throw Error('guard bypass'); };
          const reset = () => { studyAccepted = true; task = null; realtimeTimer = null; realtimeBusy = false; reviewBusy = false; batchRunning = false; exportBusy = false; pageWrites = 0; };
          for (const guard of [() => studyAccepted = false, () => task = {}, () => realtimeTimer = 1, () => realtimeBusy = true,
            () => reviewBusy = true, () => batchRunning = true, () => exportBusy = true, () => pageWrites = 1]) {
            guard(); await exportCoursePDF(batchCourseKey(), 'batch-status'); reset();
          }
          if (created) throw Error('merged export ignored a busy guard');
          for (const stage of ['read', 'write', 'finish', 'cleanup']) {
            PPTDiskCache.create = async kind => {
              const cache = await create(kind), remove = cache.remove; created++;
              cache.remove = async () => { await remove(); removed++; if (stage === 'cleanup') throw Error('synthetic cleanup failure'); };
              if (stage === 'write') cache.write = async () => { throw Error('synthetic write failure'); };
              if (stage === 'finish') cache.finish = async () => { throw Error('synthetic finish failure'); };
              return cache;
            };
            PPTPageStore.imageBytes = stage === 'read' || stage === 'cleanup' ? async () => { throw Error('synthetic unavailable image'); } : read;
            await exportCoursePDF(batchCourseKey(), 'batch-status'); messages.push($('batch-status').textContent);
            if (busy() || $('batch-course-pdf').disabled) throw Error('merged export retained busy state');
          }
        } finally { PPTDiskCache.create = create; PPTPageStore.imageBytes = read; controls(); }
        return {messages, created, removed, busy: busy()};
      });
      assert.match(result.messages[0], /请先读取课程录像列表/); assert.match(result.messages[1], /本课程还没有截图/);
      assert.match(result.messages[2], /synthetic unavailable image/); assert.match(result.messages[3], /synthetic write failure/);
      assert.match(result.messages[4], /synthetic finish failure/); assert.match(result.messages[5], /synthetic unavailable image.*临时文件清理失败.*synthetic cleanup failure/);
      assert.equal(result.created, 4); assert.equal(result.removed, 4); assert.equal(result.busy, false);
    });
    await test('main course ZIP waits for a pending local rename before choosing its course group', async () => {
      await idle();
      await page.evaluate(async () => {
        await namingSave; await lessonSave;
        // Keep a nonempty sibling in the old name group: stale scope would silently export it.
        for (const id of ['A', 'B']) {
          const lesson = lessons.find(item => item.id === id);
          lesson.page = ''; lesson.source.page = ''; lesson.course = {...lesson.course, name: 'Old local course'};
          await PPTLibrary.put(db, lesson);
        }
        activeLesson = lessons.find(item => item.id === 'A'); coursePage = '';
        applyLesson(); render(); renderLibrary(); controls();
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
          const request = original.call(this, value, key);
          if (this.name === 'settings' && key === 'exportNaming') {
            IDBObjectStore.prototype.put = original;
            let held = true; window.releaseNaming = () => { held = false; };
            const keepAlive = () => { if (held) this.get('exportNaming').onsuccess = keepAlive; };
            keepAlive();
          }
          return request;
        };
      });
      await page.locator('#tab-export').click();
      await page.locator('#course-name').fill('Renamed local course');
      await page.waitForFunction(() => !!window.releaseNaming);
      assert.equal(await page.evaluate(() => activeLesson.course.name), 'Old local course');
      const event = page.waitForEvent('download');
      try {
        await page.locator('#course-zip').click();
        assert(await page.locator('#course-zip').isDisabled());
        assert.equal(await page.evaluate(() => exportBusy), true);
        assert.equal(await page.evaluate(() => activeLesson.course.name), 'Old local course');
      } finally { await page.evaluate(() => releaseNaming()); }
      const file = await event, destination = path.join(output, 'renamed-local-course.zip');
      await file.saveAs(destination); await idle();
      const entries = members(fs.readFileSync(destination));
      assert.equal(entries.length, 1);
      await inspectPDF(entries[0].bytes, [images[2], images[0], images[1]], {annotated: true, sheets: 2});
      assert.equal(file.suggestedFilename(), 'Renamed local course-课次PDF.zip');
      assert.match(entries[0].name, /Renamed local course/);
      assert.equal(await page.evaluate(() => lessons.find(lesson => lesson.id === 'B').course.name), 'Old local course');
    });
    await test('main merged PDF resolves its default group after a real naming transaction commits', async () => {
      // The preceding document delivered ten downloads; isolate this case from the observed burst suppression.
      await page.reload(); await idle();
      await page.evaluate(async () => {
        await namingSave; await lessonSave;
        activeLesson.course.name = 'Old local course'; await PPTLibrary.put(db, activeLesson); applyLesson(); render(); controls();
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
          const request = original.call(this, value, key);
          if (this.name === 'settings' && key === 'exportNaming') {
            IDBObjectStore.prototype.put = original;
            let held = true; window.releaseNaming = () => { held = false; };
            const keepAlive = () => { if (held) this.get('exportNaming').onsuccess = keepAlive; }; keepAlive();
          }
          return request;
        };
      });
      await page.locator('#tab-export').click();
      await page.locator('#course-name').fill('中文😀 (课程) / 标题');
      await page.waitForFunction(() => !!window.releaseNaming);
      const event = page.waitForEvent('download');
      try {
        await page.locator('#course-pdf').click();
        assert.equal(await page.evaluate(() => activeLesson.course.name), 'Old local course');
        assert.equal(await page.evaluate(() => exportBusy), true); assert(await page.locator('#course-pdf').isDisabled());
      } finally { await page.evaluate(() => { releaseNaming(); delete window.releaseNaming; }); }
      const file = await event, destination = path.join(output, 'merged-pending-naming.pdf'); await file.saveAs(destination); await idle();
      assert.equal(file.suggestedFilename(), '中文😀 (课程) _ 标题-整课.pdf');
      await inspectCourse(fs.readFileSync(destination), [images[2], images[0], images[1]], '中文😀 (课程) / 标题', {sheets: 2});
      assert.equal(await page.evaluate(() => lessons.find(lesson => lesson.id === 'B').course.name), 'Old local course');
    });
    await test('main merged PDF waits for a real library put commit before scope, title and fallback snapshots', async () => {
      await page.evaluate(async () => {
        await namingSave; await lessonSave;
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
          const request = original.call(this, value, key);
          if (this.name === 'settings' && key === 'lesson:A') {
            IDBObjectStore.prototype.put = original;
            let held = true; window.releaseLesson = () => { held = false; };
            const keepAlive = () => { if (held) this.get('lesson:A').onsuccess = keepAlive; }; keepAlive();
          }
          return request;
        };
        // The library clones at call and updates the retained record only after its real transaction completes.
        lessonSave = lessonSave.then(async () => {
          const next = {...activeLesson, course: {}};
          await PPTLibrary.put(db, next); Object.assign(activeLesson, next);
        });
      });
      await page.waitForFunction(() => !!window.releaseLesson);
      const event = page.waitForEvent('download');
      try {
        await page.locator('#course-pdf').click();
        assert.equal(await page.evaluate(() => activeLesson.course.name), '中文😀 (课程) / 标题');
        assert.equal(await page.evaluate(() => exportBusy), true);
      } finally { await page.evaluate(() => { releaseLesson(); delete window.releaseLesson; }); }
      const file = await event, destination = path.join(output, 'merged-pending-lesson.pdf'); await file.saveAs(destination); await idle();
      assert.equal(file.suggestedFilename(), '未命名课程-整课.pdf');
      const parsed = await inspectCourse(fs.readFileSync(destination), [images[2], images[0], images[1]], '未命名课程', {sheets: 2});
      assert.deepEqual(parsed.lessonTitles, ['第 1 课 · 未知日期 未知时间']);
      assert.deepEqual(await page.evaluate(async () => {
        const request = db.transaction('settings').objectStore('settings').get('lesson:A');
        return new Promise(resolve => request.onsuccess = () => resolve(request.result.course));
      }), {});
    });
    await test('main course requests reject an owner change during pending saves before creating a writer', async () => {
      const result = await page.evaluate(async () => {
        await namingSave; await lessonSave;
        const owner = activeLesson, originalSave = namingSave, create = PPTDiskCache.create; let calls = 0, release;
        namingSave = new Promise(resolve => release = resolve);
        PPTDiskCache.create = async () => { calls++; throw Error('synthetic writer must not start after owner change'); };
        try {
          const request = exportCoursePDF(PPTLibrary.courseKey(owner.page, owner.course), 'batch-status', owner.page);
          activeLesson = lessons.find(lesson => lesson.id !== owner.id); release(); await request;
          return {calls, message: $('batch-status').textContent, exporting: exportBusy};
        } finally { activeLesson = owner; namingSave = originalSave; PPTDiskCache.create = create; controls(); }
      });
      assert.equal(result.calls, 0, 'pending save cannot redirect a course request to another active lesson');
      assert.match(result.message, /当前课次已变化/); assert.equal(result.exporting, false);
    });
    assert.deepEqual(errors, []); await exportContext.close();
    assert.deepEqual(blocked, []); console.log(`${passed} focused improvement groups passed; no external requests.`);
  } finally {
    try { await browser?.close(); } finally { if (server) await new Promise(resolve => server.close(resolve)); }
    const cleanup = {browserClosed: !browser?.isConnected(), contextsClosed: !browser?.contexts().length, serverClosed: !server?.listening};
    console.log('Improvement cleanup: ' + JSON.stringify(cleanup)); assert(Object.values(cleanup).every(Boolean));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
