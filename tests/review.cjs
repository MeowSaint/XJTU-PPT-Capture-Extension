/* Focused desktop review tests: local files, a fresh Chromium context, no extension or real profile. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawnSync} = require('node:child_process');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright'), sharp = dependency('sharp');
const {PDFDocument} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..');
const scratch = path.join(root, '.test-output', 'v2.6.0');
fs.mkdirSync(scratch, {recursive: true});
const output = fs.mkdtempSync(path.join(scratch, 'review-'));
const fixture = path.join(output, 'review-video.mp4');
const naming = {course: {name: '模式识别', date: '2026-11-04', start: '08:00:00'}, page: '', manual: true};
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const results = [], errors = [], blocked = [];
let browser, context, page, images;

async function idle() { await page.waitForFunction(() => ready && !busy()); }
async function count(value) {
  await page.waitForFunction(n => document.querySelectorAll('#pages article').length === n && !busy(), value);
}
async function ids() { return page.locator('#pages article').evaluateAll(cards => cards.map(card => Number(card.dataset.pageId))); }
async function stored() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('course-ppt', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, tx = database.transaction(['pages', 'settings']);
      const pages = tx.objectStore('pages').getAll(), naming = tx.objectStore('settings').get('exportNaming');
      tx.oncomplete = () => { database.close(); resolve({pages: pages.result.sort((a, b) => a.order - b.order), naming: naming.result}); };
      tx.onerror = () => { database.close(); reject(tx.error); };
    };
  }));
}
async function seed(specs, exportNaming = naming) {
  await idle();
  await page.evaluate(async ({specs, images, naming}) => {
    const prepared = await Promise.all(specs.map(async (spec, index) => {
      const data = images[spec.image || 0], image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 192, 108);
      const record = {id: index + 1, order: (index + 1) * 1024, data, w: 640, h: 360, time: 1793808000000,
        sourceName: 'review-video.mp4', sourceTime: index / 4, course: naming.course, coursePage: '', batchJobId: '',
        sig: ctx.getImageData(0, 0, 192, 108).data, ...spec};
      delete record.image; delete record.signature;
      if (spec.signature === false) delete record.sig;
      if (spec.signature === 'short') record.sig = new Uint8ClampedArray(4);
      return record;
    }));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result, tx = database.transaction(['pages', 'settings'], 'readwrite');
        const store = tx.objectStore('pages'); store.clear(); prepared.forEach(record => store.put(record));
        tx.objectStore('settings').put(naming, 'exportNaming');
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
      };
    });
  }, {specs, images, naming: exportNaming});
  await page.reload(); await count(specs.length);
}
async function abortNextReview() {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (names, mode, ...options) {
      const tx = original.call(this, names, mode, ...options);
      if (mode === 'readwrite' && Array.isArray(names) && names.includes('pages') && names.includes('settings')) {
        IDBDatabase.prototype.transaction = original;
        queueMicrotask(() => tx.abort());
      }
      return tx;
    };
  });
}
async function atTime(time) {
  await page.locator('#video').evaluate((video, time) => new Promise(resolve => {
    if (Math.abs(video.currentTime - time) < 0.001) return resolve();
    video.addEventListener('seeked', resolve, {once: true}); video.currentTime = time;
  }), time);
}
async function load(file) {
  await page.locator('#tab-source').click();
  await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(() => sourceReady && !busy() && document.querySelector('#video').seekable.length > 0);
}
async function test(name, body) {
  await body(); results.push(name); console.log('PASS ' + name);
}
function zipEntries(bytes) {
  const entries = []; let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'ZIP entries preserve JPEG bytes without transcoding');
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    entries.push({name: bytes.subarray(offset + 30, offset + 30 + nameLength).toString(), bytes: bytes.subarray(start, start + size)});
    offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'ZIP has a central directory');
  return entries;
}

(async () => {
  try {
    const video = spawnSync(process.env.PPT_TEST_FFMPEG || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=4:size=640x360:rate=10', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixture], {encoding: 'utf8'});
    assert.equal(video.status, 0, video.stderr || video.error?.message);
    const wrong = path.join(output, 'other', path.basename(fixture)); fs.mkdirSync(path.dirname(wrong));
    fs.writeFileSync(wrong, Buffer.concat([fs.readFileSync(fixture), Buffer.from('different file with the same name')]));
    images = await Promise.all(['#24354a', '#9e2437', '#596779'].map(async (color, index) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#ffffff"/><rect x="35" y="35" width="570" height="70" fill="${color}"/><text x="55" y="82" font-family="sans-serif" font-size="30" fill="white">Review slide ${index + 1}</text><path d="M55 160h480M55 210h400M55 260h450" stroke="${color}" stroke-width="16"/></svg>`;
      return 'data:image/jpeg;base64,' + (await sharp(Buffer.from(svg)).jpeg({quality: 95}).toBuffer()).toString('base64');
    }));
    browser = await chromium.launch({...browserOptions(), downloadsPath: output});
    context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      if (/^(file|blob|data):/.test(route.request().url())) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'capture.html')).href);
    await page.locator('#terms-dialog').waitFor({state: 'visible'});
    assert.equal(await page.locator('.app-shell').evaluate(shell => shell.inert), true);
    await page.locator('#terms-decline').click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#terms-dialog').isVisible(), true, 'decline and Escape keep the workspace locked');
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); await count(0);

    await test('three accessible setting tabs and desktop first layout', async () => {
      assert.equal(await page.locator('[role="tab"][aria-selected="true"]').getAttribute('id'), 'tab-source');
      assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
      await page.locator('#tab-source').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#tab-extraction').getAttribute('aria-selected'), 'true');
      await page.keyboard.press('End'); assert.equal(await page.locator('#tab-export').getAttribute('aria-selected'), 'true');
      await page.keyboard.press('Home'); assert.equal(await page.locator('#tab-source').getAttribute('aria-selected'), 'true');
      await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#tab-export').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#pdf-layout').inputValue(), 'single');
      assert.equal(await page.locator('#stable').inputValue(), '1.5');
      await page.locator('#tab-source').click();
      await page.screenshot({path: path.join(output, 'first-layout-1440.png')});
    });

    await test('multi-delete, native input undo, atomic failure, Undo and reload preserve exact order/naming', async () => {
      const specs = [{id: 41, order: 1024}, {id: 7, order: 2048, image: 1}, {id: 99, order: 3072, image: 2}, {id: 13, order: 4096}];
      await seed(specs); const original = await stored();
      await page.locator('#pages article .page-select').nth(1).check(); await page.locator('#pages article .page-select').nth(2).check();
      assert.equal(await page.locator('#selected-count').textContent(), '已选 2 页');
      await page.locator('#delete-selected').click(); await count(2); assert.deepEqual(await ids(), [41, 13]);
      assert.deepEqual((await stored()).pages.map(page => page.id), [41, 13]);
      await page.locator('#tab-export').click(); await page.locator('#course-name').focus();
      await page.keyboard.press('End'); await page.keyboard.type(' edit'); await page.keyboard.press(modifier + '+z');
      await count(2); assert.equal(await page.locator('#undo').isEnabled(), true, 'input undo must not consume deletion history');
      await page.evaluate(() => { window.inputUndoPrevented = null; const listen = event => { if (event.key.toLowerCase() === 'z') { window.inputUndoPrevented = event.defaultPrevented; document.removeEventListener('keydown', listen); } }; document.addEventListener('keydown', listen); });
      await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => window.inputUndoPrevented), false, 'Ctrl+Z in input is not intercepted');
      await page.locator('#undo').click(); await count(4); assert.deepEqual(await stored(), original);
      await page.reload(); await count(4); assert.deepEqual(await ids(), [41, 7, 99, 13]);
      await abortNextReview(); await page.locator('#pages article button').first().click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('删除失败'));
      await count(4); assert.deepEqual(await stored(), original, 'aborted delete changes neither pages nor naming');
      await page.locator('#pages article button').nth(1).click(); await count(3);
      const afterDelete = await stored(); await abortNextReview(); await page.locator('#undo').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('撤销失败'));
      await count(3); assert.deepEqual(await stored(), afterDelete, 'aborted Undo changes neither pages nor naming');
      assert.equal(await page.locator('#undo').isEnabled(), true, 'failed Undo remains available');
      await page.locator('#undo').click(); await count(4); assert.deepEqual(await stored(), original);
    });

    await test('last-page Undo restores naming atomically and clear invalidates history', async () => {
      await seed([{id: 12, order: 8128}], {...naming, course: {...naming.course, name: '删除前命名'}});
      const original = await stored(); await page.locator('#pages article button').click(); await count(0);
      assert.equal(await page.locator('#course-name').inputValue(), '');
      await page.locator('#pages').focus(); await page.keyboard.press(modifier + '+z'); await count(1);
      assert.deepEqual(await stored(), original); await page.reload(); await count(1); assert.deepEqual(await stored(), original);
      await seed([{id: 1}, {id: 2, image: 1}]); await page.locator('#pages article button').first().click(); await count(1);
      page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click(); await count(0);
      assert.equal(await page.locator('#undo').isDisabled(), true); assert.equal((await stored()).pages.length, 0);
    });

    await test('lightbox keyboard, focus containment/restoration and safe last-page close', async () => {
      await seed([{id: 1}, {id: 2, image: 1}, {id: 3, image: 2}]);
      await page.locator('#pages article img').first().focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#lightbox').evaluate(dialog => dialog.open), true);
      for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.querySelector('#lightbox').contains(document.activeElement)), true); }
      await page.keyboard.press('ArrowRight'); assert.match(await page.locator('#lightbox-meta').textContent(), /第 2 \/ 3 页/);
      await page.keyboard.press('Backspace'); await count(2); assert.deepEqual(await ids(), [1, 3]);
      await page.keyboard.press(modifier + '+z'); await count(3);
      await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Delete'); await count(2);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#lightbox').evaluate(dialog => dialog.open), false);
      await page.waitForFunction(() => document.activeElement === document.querySelector('#pages'));
      await seed([{id: 15}]); await page.locator('#pages article img').focus(); await page.keyboard.press('Space');
      await page.keyboard.press('Escape'); await page.waitForFunction(() => document.activeElement === document.querySelector('#pages article img'));
      await page.keyboard.press('Enter'); await page.keyboard.press('Delete'); await count(0);
      assert.equal(await page.locator('#lightbox').evaluate(dialog => dialog.open), false);
      await page.waitForFunction(() => document.activeElement === document.querySelector('#pages'));
    });

    await test('seek requires matching persisted source identity, rejects same-name files, other course/batch and legacy identity', async () => {
      await seed([]); await load(fixture); await atTime(1.25); await page.locator('#shot').click(); await count(1);
      const captured = (await stored()).pages[0]; assert.match(captured.sourceKey, /^file:/);
      await atTime(2.5); await page.locator('#pages .slide-time').click();
      await page.waitForFunction(() => Math.abs(document.querySelector('#video').currentTime - 1.25) < 0.01);
      await load(wrong); await atTime(2.5); await page.locator('#pages .slide-time').click();
      assert.match(await page.locator('#status').textContent(), /来源不一致/);
      assert.equal(await page.locator('#video').evaluate(video => video.currentTime), 2.5, 'same name does not prove same video');
      await seed([{id: 1, sourceTime: 1.25, sourceKey: captured.sourceKey},
        {id: 2, sourceTime: 1.25, sourceKey: captured.sourceKey, coursePage: 'https://example.invalid/other-course'},
        {id: 3, sourceTime: 1.25, sourceKey: captured.sourceKey, batchJobId: 'other-batch'},
        {id: 4, sourceTime: 1.25}]);
      await load(fixture); await atTime(2.5);
      for (const index of [1, 2, 3]) { await page.locator('#pages .slide-time').nth(index).click(); assert.match(await page.locator('#status').textContent(), /来源不一致/); assert.equal(await page.locator('#video').evaluate(video => video.currentTime), 2.5); }
      await page.locator('#pages .slide-time').first().focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => Math.abs(document.querySelector('#video').currentTime - 1.25) < 0.01);
      await page.locator('#release-cache').click(); await idle(); await page.locator('#pages .slide-time').first().click();
      assert.match(await page.locator('#status').textContent(), /重新加载/); await count(4);
    });

    await test('conservative adjacent cleanup requires persisted identity and is one reversible deletion batch', async () => {
      await seed([]); await load(fixture); await atTime(0.25); await page.locator('#shot').click(); await count(1);
      const sourceKey = (await stored()).pages[0].sourceKey; assert.match(sourceKey, /^file:/);
      const specs = [
        {id: 1, sourceTime: 0}, {id: 2, sourceTime: 1}, {id: 3, sourceTime: 2},
        {id: 4, sourceTime: 3, sourceName: 'other.mp4'}, {id: 5, sourceTime: 4}, {id: 6, sourceTime: 4}, {id: 7, sourceTime: 3},
        {id: 8, sourceTime: 5, coursePage: 'other'}, {id: 9, sourceTime: 6, coursePage: 'other', batchJobId: 'other'},
        {id: 10, sourceTime: 7, signature: false}, {id: 11, sourceTime: 8, signature: 'short'},
        {id: 12, sourceTime: 9, image: 1}, {id: 13, sourceTime: 10, sourceKey: 'file:key1'}, {id: 14, sourceTime: 11, sourceKey: 'file:key2'}
      ].map(spec => ({sourceKey, ...spec}));
      specs.push({id: 15, sourceTime: 12}, {id: 16, sourceTime: 13});
      await seed(specs); const original = await stored(), legacy = original.pages.slice(-2);
      assert(legacy.every(record => !Object.hasOwn(record, 'sourceKey') && record.sig.length === 192 * 108 * 4));
      assert.deepEqual(legacy[0].sig, legacy[1].sig); assert(legacy[0].sourceTime < legacy[1].sourceTime);
      await page.locator('#clean-similar').click(); await count(14);
      assert.deepEqual(await ids(), Array.from({length: 14}, (_, i) => i + 3));
      assert.deepEqual((await stored()).pages.slice(-2), legacy, 'keyless legacy pair is retained unchanged');
      await page.locator('#undo').click(); await count(16); assert.deepEqual(await stored(), original);
      await page.locator('#clean-similar').click(); await count(14);
    });

    await test('ZIP and A4 handout download every retained page regardless of selection; invalid naming surfaces export pane', async () => {
      await page.locator('#pages .page-select').first().check(); const expected = (await stored()).pages;
      const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#export-zip').click()]);
      assert.equal(zip.suggestedFilename(), '模式识别-2026-11-04-08-00-00-slides.zip');
      const zipPath = path.join(output, zip.suggestedFilename()); await zip.saveAs(zipPath);
      const entries = zipEntries(fs.readFileSync(zipPath)); assert.equal(entries.length, expected.length);
      entries.forEach((entry, index) => {
        assert.match(entry.name, new RegExp('^' + String(index + 1).padStart(3, '0') + '-'));
        assert.deepEqual(entry.bytes, Buffer.from(expected[index].data.split(',')[1], 'base64'));
      });
      await page.locator('#tab-export').click(); await page.locator('#pdf-layout').selectOption('handout');
      const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('#pdf').click()]);
      const pdfPath = path.join(output, pdf.suggestedFilename().replace(/\.pdf$/, '-handout.pdf')); await pdf.saveAs(pdfPath);
      const document = await PDFDocument.load(fs.readFileSync(pdfPath)); assert.equal(document.getPageCount(), Math.ceil(expected.length / 2));
      document.getPages().forEach(page => assert.deepEqual(page.getSize(), {width: 595, height: 842}));
      await page.locator('#course-name').fill(''); await page.locator('#tab-source').click(); await page.locator('#pdf').click(); await idle();
      assert.equal(await page.locator('#tab-export').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#course-name').evaluate(input => input === document.activeElement), true);
      assert.match(await page.locator('#status').textContent(), /导出失败/);
    });

    await test('1280×800, 1440×900 and 1920×1080 keep video beside a bounded independently scrolling contact sheet', async () => {
      await seed(Array.from({length: 72}, (_, i) => ({id: i + 1, image: i % 3, sourceTime: i / 20}))); await load(fixture); await atTime(0.25);
      const geometry = [];
      for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
        await page.setViewportSize({width, height});
        const measured = await page.evaluate(() => {
          const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom}; };
          return {width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
            tools: rect('workspace-tools'), video: rect('panel-capture'), results: rect('results'), pages: rect('pages'),
            scrollHeight: document.querySelector('#pages').scrollHeight, scrollClient: document.querySelector('#pages').clientHeight,
            actions: ['pdf', 'export-zip', 'run', 'stop', 'shot', 'clear', 'clean-similar', 'undo'].map(rect)};
        });
        assert(measured.documentWidth <= width && measured.documentHeight <= height, JSON.stringify(measured));
        assert.equal(measured.tools.width, 240); assert(measured.video.right < measured.results.x, 'video is beside the review pane');
        assert(measured.pages.bottom <= height && measured.pages.height > 250 && measured.scrollHeight > measured.scrollClient);
        measured.actions.forEach(action => assert(action.x >= 0 && action.y >= 0 && action.right <= width && action.bottom <= height));
        await page.locator('#pages').evaluate(sheet => { sheet.scrollTop = sheet.scrollHeight; });
        assert.equal(await page.evaluate(() => scrollY), 0); assert(await page.locator('#pages').evaluate(sheet => sheet.scrollTop > 0));
        await page.locator('#pages').evaluate(sheet => { sheet.scrollTop = 0; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({path: path.join(output, `desktop-${width}x${height}.png`)}); geometry.push(measured);
      }
      fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(geometry, null, 2));
    });
    assert.deepEqual(errors, [], 'no browser script errors'); assert.deepEqual(blocked, [], 'no external network requests');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({passed: results, errors, blocked, output}, null, 2));
    console.log(`${results.length} focused review groups passed. Evidence: ${output}`);
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
      console.error('Browser diagnostics:', await page.evaluate(() => ({active: document.activeElement?.outerHTML.slice(0, 250), dialog: document.querySelector('#lightbox').open,
        ids: [...document.querySelectorAll('#pages article')].map(card => card.dataset.pageId), status: document.querySelector('#status').textContent})).catch(() => null));
    }
    console.error(error); console.error('Evidence: ' + output); process.exitCode = 1;
  } finally {
    if (context) await context.close(); if (browser) await browser.close();
  }
})();
