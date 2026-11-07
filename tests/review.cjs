/* Focused desktop review tests: loopback fixtures, a fresh Chromium context, no extension or real profile. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawnSync} = require('node:child_process');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright'), sharp = dependency('sharp');
const {PDFDocument} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..');
const scratch = path.join(root, '.test-output', 'v3.1.2');
fs.mkdirSync(scratch, {recursive: true});
const output = fs.mkdtempSync(path.join(scratch, 'review-'));
const fixture = path.join(output, 'review-video.mp4');
const naming = {course: {name: '模式识别', date: '2026-11-04', start: '08:00:00'}, page: '', manual: true};
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const results = [], errors = [], blocked = [];
let browser, context, page, images, server;

async function idle() { await page.waitForFunction(() => ready && !busy()); }
async function count(value) {
  await page.waitForFunction(n => document.querySelectorAll('#pages article').length === n && !busy(), value);
}
async function ids() { return page.locator('#pages article').evaluateAll(cards => cards.map(card => Number(card.dataset.pageId))); }
async function stored() {
  return page.evaluate(async () => {
    const snapshot = await new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result, tx = database.transaction(['pages', 'settings', 'assets']);
        const pages = tx.objectStore('pages').getAll(), naming = tx.objectStore('settings').get('exportNaming'), assets = tx.objectStore('assets').getAll();
        const lesson = tx.objectStore('settings').get('lesson:' + activeLesson?.id);
        tx.oncomplete = () => { database.close(); resolve({pages: pages.result.sort((a, b) => a.order - b.order), naming: naming.result, assets: assets.result, lesson: lesson.result}); };
        tx.onerror = () => { database.close(); reject(tx.error); };
      };
    });
    const assets = new Map(snapshot.assets.map(asset => [asset.id, asset]));
    const pages = await Promise.all(snapshot.pages.map(async metadata => {
      const asset = assets.get(metadata.id);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(asset.image);
      });
      return {...metadata, data, ...(asset.sig === undefined ? {} : {sig: asset.sig})};
    }));
    return {pages, naming: snapshot.naming, lesson: snapshot.lesson};
  });
}
async function seed(specs, exportNaming = naming) {
  await idle();
  const captureURL = page.url();
  await page.evaluate(async () => { await namingSave.catch(() => {}); await lessonSave.catch(() => {}); db.close(); });
  await page.goto(new URL('/fixture.html', captureURL).href);
  await page.evaluate(async ({specs, images, naming}) => {
    const prepared = await Promise.all(specs.map(async (spec, index) => {
      const data = images[spec.image || 0], image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 192, 108);
      const record = {id: index + 1, lessonId: 'review-fixture', order: (index + 1) * 1024, data, w: 640, h: 360, time: 1793808000000,
        sourceName: 'review-video.mp4', sourceTime: index / 4, course: naming.course, coursePage: '', batchJobId: '',
        sig: ctx.getImageData(0, 0, 192, 108).data, ...spec};
      delete record.image; delete record.signature;
      if (spec.signature === false) delete record.sig;
      if (spec.signature === 'short') record.sig = new Uint8ClampedArray(4);
      return record;
    }));
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('course-ppt');
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Fixture database reset is blocked'));
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true}); request.result.createObjectStore('settings'); };
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
  await page.goto(captureURL); await count(specs.length);
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
  if (process.env.PPT_TEST_FILTER && !new RegExp(process.env.PPT_TEST_FILTER).test(name)) return;
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
    // OPFS requires a trusted origin; file:// cannot exercise disk-backed exports.
    server = http.createServer((req, res) => {
      if (req.url === '/fixture.html') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<!doctype html><title>Synthetic fixture setup</title>'); return; }
      const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (error, bytes) => {
        if (error) { res.writeHead(404); res.end(); return; }
        const type = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png'}[path.extname(file)] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': type}); res.end(bytes);
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({...browserOptions(), downloadsPath: output});
    context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(blob|data):/.test(url) || new URL(url).origin === origin) return route.continue();
      blocked.push(url); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/capture.html');
    await page.locator('#terms-dialog').waitFor({state: 'visible'});
    assert.equal(await page.locator('.app-shell').evaluate(shell => shell.inert), true);
    await page.locator('#terms-decline').click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#terms-dialog').isVisible(), true, 'decline and Escape keep the workspace locked');
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); await count(0);

    if (!process.argv.includes('--motion-only')) await test('source, batch and export scopes are discoverable in desktop and narrow workspaces', async () => {
      assert.equal(await page.locator('#batch-panel').evaluate(panel => !!panel.closest('.workspace-sheet') && !panel.closest('.setting-panel')), true, 'batch work has a permanent wide workspace entry');
      assert.equal(await page.locator('#pdf, #export-zip, #selected-pdf, #selected-zip, #filename-preview, #export-settings').evaluateAll(nodes => nodes.length === 6 && nodes.every(node => node.closest('#results'))), true, 'scope, filename and settings shortcut are beside results');
      assert.match(await page.locator('#export-scope').textContent(), /本节全部.*0.*页/);
      assert.match(await page.locator('#current-lesson').textContent(), /当前整理/);
      assert.match(await page.locator('#batch-course-context').textContent(), /批量列表/);
      await page.locator('#export-settings').click();
      assert.equal(await page.locator('#tab-export').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#course-name').evaluate(input => input === document.activeElement), true, 'shortcut immediately focuses editable naming');
      await page.locator('#tab-source').click();
      const name = '0-' + '光电传感与机器视觉课堂录像完整来源名称'.repeat(5) + '.mp4';
      await page.evaluate(({origin, name}) => { sources = [{name, url: origin + '/0-long-source.mp4', source: '合成来源'}]; updateSources(); }, {origin, name});
      await page.locator('#sources').selectOption(origin + '/0-long-source.mp4');
      assert.equal(await page.locator('#selected-source-name').textContent(), name);
      assert.match(await page.locator('#source-track-hint').textContent(), /0 路.*框选/);
      for (const [width, height] of [[1440, 900], [390, 844]]) {
        await page.setViewportSize({width, height});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'long source names never cause horizontal overflow');
        assert.equal(await page.locator('#selected-source-name').evaluate(node => node.scrollWidth <= node.clientWidth && getComputedStyle(node).whiteSpace !== 'nowrap'), true, 'full selected name wraps instead of truncating');
        await page.locator('#batch-panel > summary').click();
        const batch = await page.locator('#batch-panel').boundingBox(); assert(batch.width > (width === 390 ? 340 : 850), 'batch controls use workspace width');
        await page.locator('#batch-panel > summary').click();
      }
      await page.setViewportSize({width: 1440, height: 900});
    });
    await test('rapid tab reversal, immediate typing and preview close remain usable during motion; live reduce cancels it', async () => {
      assert.equal(await page.evaluate(() => typeof window.PPTMotion?.reveal), 'function', 'shared motion layer is loaded');
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.locator('#tab-source').focus();
      for (const key of ['ArrowRight', 'ArrowLeft', 'End', 'ArrowLeft', 'End']) await page.keyboard.press(key);
      assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
      await page.locator('#export-settings').click(); await page.keyboard.type('motion input');
      assert.equal(await page.locator('#course-name').inputValue(), 'motion input', 'typing is not deferred until panel motion finishes');
      await page.locator('#tab-source').focus(); await page.keyboard.press('ArrowRight');
      const beforeReverse = await page.locator('#tab-marker').boundingBox();
      await page.keyboard.press('ArrowLeft');
      const afterReverse = await page.locator('#tab-marker').boundingBox();
      assert(Math.abs(afterReverse.x - beforeReverse.x) < beforeReverse.width * .65, 'reversal continues from its rendered position instead of snapping to a tab endpoint');
      await page.keyboard.press('ArrowRight');
      assert(await page.evaluate(() => document.getAnimations().some(animation => animation.playState === 'running')), 'normal mode provides local feedback');
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
      assert.equal(await page.locator('#panel-extraction').evaluate(node => getComputedStyle(node).transform), 'none', 'live reduce leaves no spatial offset');
      await seed([{id: 1}, {id: 2, image: 1}]); await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.locator('#pages article img').first().focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => previewURL !== null);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !$('lightbox').open && previewURL === null && !$('lightbox-img').hasAttribute('src'));
      assert.equal(await page.locator('#pages article img').first().evaluate(image => image === document.activeElement), true, 'closing during entry restores the original focus');
      assert.equal(await page.locator('#lightbox').evaluate(dialog => dialog.getAnimations({subtree: true}).length), 0, 'closed preview has no residual motion');
      await page.emulateMedia({reducedMotion: 'reduce'}); await seed([]);
    });
    await test('committed new pages animate only twelve visible cards and ordinary renders preserve their nodes and scroll', async () => {
      await seed([]); await page.emulateMedia({reducedMotion: 'no-preference'}); await page.setViewportSize({width: 1920, height: 2000});
      const result = await page.evaluate(async () => {
        await bindLesson({kind: 'file', sourceKey: 'motion-cards', sourceName: '合成动效课次', page: ''});
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const context = canvas.getContext('2d'); context.fillStyle = '#e9e4dc'; context.fillRect(0, 0, 320, 180);
        const asset = await PPTPageStore.encode(canvas);
        for (let i = 0; i < 32; i++) {
          const metadata = {lessonId: activeLesson.id, w: 320, h: 180, time: 1, order: (i + 1) * 1024};
          metadata.id = await PPTPageStore.add(db, metadata, asset); pages.push(metadata);
        }
        syncAllPages(); render({revealNew: true});
        const cards = [...$('pages').children], rect = $('pages').getBoundingClientRect();
        const visible = cards.filter(card => { const r = card.getBoundingClientRect(); return r.top < rect.bottom && r.bottom > rect.top; }).length;
        const animated = cards.filter(card => card.getAnimations().length).length;
        PPTMotion.cancelAll(); $('pages').scrollTop = 50; const scroll = $('pages').scrollTop;
        render();
        return {visible, animated, reused: cards.every((card, i) => card === $('pages').children[i]), preservedScroll: $('pages').scrollTop === scroll,
          residual: $('pages').getAnimations({subtree: true}).length};
      });
      assert(result.visible > 12, 'fixture has enough visible cards to exercise the budget'); assert.equal(result.animated, 12);
      assert.equal(result.reused && result.preservedScroll, true); assert.equal(result.residual, 0);
      await page.setViewportSize({width: 1440, height: 900}); await page.emulateMedia({reducedMotion: 'reduce'}); await seed([]);
    });
    if (process.argv.includes('--ui-only') || process.argv.includes('--motion-only')) {
      assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({passed: results, errors, blocked, output, focused: true}, null, 2));
      console.log(`${results.length} focused UI groups passed. Evidence: ${output}`); return;
    }

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

    await test('last-page deletion retains lesson naming, Undo is atomic and clear invalidates history', async () => {
      await seed([{id: 12, order: 8128}], {...naming, course: {...naming.course, name: '删除前命名'}});
      const original = await stored(); await page.locator('#pages article button').click(); await count(0);
      assert.equal(await page.locator('#course-name').inputValue(), '删除前命名');
      const empty = await stored(); assert.deepEqual(empty.naming, original.naming); assert.deepEqual(empty.lesson, original.lesson);
      await page.reload(); await count(0); assert.equal(await page.locator('#course-name').inputValue(), '删除前命名');
      assert.deepEqual(await stored(), empty, 'empty lesson naming persists after reload');
      await seed([{id: 12, order: 8128}], {...naming, course: {...naming.course, name: '删除前命名'}});
      await page.locator('#pages article button').click(); await count(0);
      await page.locator('#pages').focus(); await page.keyboard.press(modifier + '+z'); await count(1);
      assert.deepEqual(await stored(), original); await page.reload(); await count(1); assert.deepEqual(await stored(), original);
      await seed([{id: 1}, {id: 2, image: 1}]); await page.locator('#pages article button').first().click(); await count(1);
      page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click(); await count(0);
      assert.equal(await page.locator('#undo').isDisabled(), true); assert.equal((await stored()).pages.length, 0);
    });

    await test('Shift checkbox ranges follow reordered display order, deselect and reset invalid anchors', async () => {
      await seed([{id: 10, order: 4096}, {id: 20, order: 1024}, {id: 30, order: 3072}, {id: 40, order: 2048}]);
      const check = id => page.locator(`#pages article[data-page-id="${id}"] .page-select`);
      const selected = () => page.evaluate(() => pages.filter(item => selectedPages.has(item.id)).map(item => item.id));
      assert.deepEqual(await ids(), [20, 40, 30, 10]);
      await check(40).click(); await check(10).click({modifiers: ['Shift']}); assert.deepEqual(await selected(), [40, 30, 10]);
      await check(10).click(); await check(40).click({modifiers: ['Shift']}); assert.deepEqual(await selected(), []);
      await check(20).focus(); await page.keyboard.press('Space'); assert.deepEqual(await selected(), [20]);
      await page.locator('#pages').evaluate(container => {
        const [first, second] = container.children, transfer = new DataTransfer(), r = second.getBoundingClientRect();
        first.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: transfer}));
        second.dispatchEvent(new DragEvent('drop', {bubbles: true, dataTransfer: transfer, clientX: r.right - 1, clientY: r.y + 5}));
        first.dispatchEvent(new DragEvent('dragend', {bubbles: true, dataTransfer: transfer}));
      });
      await idle(); assert.deepEqual(await ids(), [40, 20, 30, 10]);
      await check(10).click({modifiers: ['Shift']}); assert.deepEqual(await selected(), [20, 30, 10]);
      await page.locator('#pages article[data-page-id="20"] button').click(); await count(3);
      await check(40).click({modifiers: ['Shift']}); assert.deepEqual(await selected(), [40, 30, 10]);
      await page.locator('#clear-selection').click(); await check(10).click({modifiers: ['Shift']}); assert.deepEqual(await selected(), [10]);
      page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click(); await count(0);
      assert.equal(await page.evaluate(() => selectionAnchor), null);
    });

    await test('lightbox selection and S/V shortcuts synchronize cards and ignore editable controls', async () => {
      await seed([{id: 1}, {id: 2, image: 1}]);
      await page.locator('#pages article img').first().click();
      await page.locator('#lightbox-select').click(); assert.equal(await page.locator('#lightbox-select').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#pages .page-select').first().isChecked(), true);
      await page.keyboard.press('s'); assert.equal(await page.locator('#pages .page-select').first().isChecked(), false);
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('S');
      assert.equal(await page.locator('#pages .page-select').nth(1).isChecked(), true);
      await page.keyboard.press('v'); assert.match(await page.locator('#lightbox-status').textContent(), /重新加载/);
      const original = await stored();
      for (const tag of ['input', 'textarea', 'select', 'div']) {
        await page.evaluate(tag => {
          const field = document.createElement(tag); field.id = 'review-editable';
          if (tag === 'div') field.contentEditable = 'true';
          if (tag === 'select') field.innerHTML = '<option>value</option>';
          $('lightbox').append(field); field.focus(); $('lightbox-status').textContent = 'unchanged';
        }, tag);
        for (const key of ['s', 'v', 'ArrowLeft', 'Backspace', 'Delete']) await page.keyboard.press(key);
        assert.match(await page.locator('#lightbox-meta').textContent(), /第 2 \/ 2 页/);
        assert.equal(await page.locator('#pages .page-select').nth(1).isChecked(), true);
        assert.equal(await page.locator('#lightbox-status').textContent(), 'unchanged');
        assert.deepEqual(await stored(), original);
        await page.locator('#review-editable').evaluate(field => field.remove());
      }
      await page.locator('#lightbox-close').click(); await page.locator('#pages .page-select').nth(1).click();
      await page.locator('#pages article img').nth(1).click(); assert.equal(await page.locator('#lightbox-select').getAttribute('aria-pressed'), 'false');
      await page.keyboard.press('Escape');
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
      await load(wrong); await atTime(2.5); await count(0);
      const wrongKey = await page.evaluate(() => loadedIdentity.sourceKey);
      assert.notEqual(wrongKey, captured.sourceKey, 'same-name files with different bytes have distinct persisted identities');
      assert.notEqual(await page.evaluate(() => activeLesson.id), captured.lessonId, 'loading a different file selects its own lesson');
      assert.deepEqual((await stored()).pages, [captured], 'the original lesson retains its exact screenshot and metadata');
      await seed([{id: 1, sourceTime: 1.25, sourceKey: captured.sourceKey},
        {id: 2, sourceTime: 1.25, sourceKey: captured.sourceKey, coursePage: 'https://example.invalid/other-course'},
        {id: 3, sourceTime: 1.25, sourceKey: captured.sourceKey, batchJobId: 'other-batch'},
        {id: 4, sourceTime: 1.25}, {id: 5, sourceTime: 1.25, sourceKey: wrongKey}]);
      await load(fixture); await atTime(2.5);
      for (const index of [1, 2, 3, 4]) { await page.locator('#pages .slide-time').nth(index).click(); assert.match(await page.locator('#status').textContent(), /来源不一致/); assert.equal(await page.locator('#video').evaluate(video => video.currentTime), 2.5); }
      await page.locator('#pages .slide-time').first().focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => Math.abs(document.querySelector('#video').currentTime - 1.25) < 0.01);
      await atTime(2.5); await page.locator('#pages article img').first().click(); await page.keyboard.press('v');
      await page.waitForFunction(() => Math.abs(document.querySelector('#video').currentTime - 1.25) < 0.01);
      await page.keyboard.press('Escape');
      await page.locator('#release-cache').click(); await idle(); await page.locator('#pages .slide-time').first().click();
      assert.match(await page.locator('#status').textContent(), /重新加载/); await count(5);
    });

    await test('similar review cancels unchanged, follows the survivor through chains and releases candidate URLs', async () => {
      const specs = [1, 2, 3].map(id => ({id, sourceTime: id, sourceKey: 'file:chain'}));
      await seed(specs); const original = await stored();
      await page.evaluate(() => { const revoke = URL.revokeObjectURL; window.reviewRevoked = []; URL.revokeObjectURL = url => { window.reviewRevoked.push(url); revoke(url); }; });
      await page.locator('#clean-similar').click(); await page.locator('#similar-both').waitFor({state: 'visible'});
      assert.equal(await page.evaluate(() => document.activeElement.id), 'similar-both');
      assert.match(await page.locator('#similar-earlier-meta').textContent(), /第 1 页.*00:01/);
      assert.match(await page.locator('#similar-later-meta').textContent(), /第 2 页.*00:02/);
      const firstURLs = await page.evaluate(() => similarReview.urls.slice());
      await page.locator('#similar-earlier').click(); await page.locator('#similar-both').waitFor({state: 'visible'});
      assert.deepEqual(await page.evaluate(() => similarReview.pair.map(item => item.id)), [1, 3]);
      assert(await page.evaluate(urls => urls.every(url => window.reviewRevoked.includes(url)), firstURLs));
      const secondURLs = await page.evaluate(() => similarReview.urls.slice());
      await page.keyboard.press('Escape'); await idle(); assert.deepEqual(await stored(), original);
      assert(await page.evaluate(urls => urls.every(url => window.reviewRevoked.includes(url)), secondURLs));
      assert.equal(await page.locator('#undo').isDisabled(), true);
      await page.locator('#clean-similar').click(); await page.locator('#similar-earlier').click(); await page.locator('#similar-later').click();
      await page.locator('#similar-confirm').waitFor({state: 'visible'}); assert.deepEqual(await stored(), original);
      await page.locator('#similar-cancel').click(); await idle(); assert.deepEqual(await stored(), original);
      await page.locator('#clean-similar').click(); await page.locator('#similar-earlier').click(); await page.locator('#similar-later').click();
      await page.locator('#similar-confirm').click(); await count(1); assert.deepEqual(await ids(), [3]);
      await page.locator('#undo').click(); await count(3); assert.deepEqual(await stored(), original);
      await page.waitForFunction(() => [...document.querySelectorAll('#pages img')].every(image => image.complete && image.naturalWidth));
      await page.locator('#clean-similar').click(); await page.locator('#similar-both').click(); await page.locator('#similar-earlier').click();
      await page.locator('#similar-confirm').click(); await count(2); assert.deepEqual(await ids(), [1, 2]);
      await page.locator('#undo').click(); await count(3);
      await page.locator('#clean-similar').click(); await page.locator('#similar-later').click(); await page.locator('#similar-both').click();
      await page.locator('#similar-confirm').click(); await count(2); assert.deepEqual(await ids(), [2, 3]);
      await page.locator('#undo').click(); await count(3);
      await page.locator('#clean-similar').click(); await page.locator('#similar-both').click(); await page.locator('#similar-both').click();
      await page.locator('#similar-confirm').click(); await count(3); assert.deepEqual(await stored(), original);
    });

    await test('cancellation during a candidate read ignores late results and advance failure releases images', async () => {
      await seed([1, 2, 3].map(id => ({id, sourceTime: id, sourceKey: 'file:chain'}))); const original = await stored();
      await page.evaluate(() => {
        const read = PPTPageStore.assets;
        PPTPageStore.assets = async (...args) => {
          PPTPageStore.assets = read; const assets = await read(...args);
          await new Promise(resolve => { window.releaseCandidate = resolve; }); return assets;
        };
      });
      await page.locator('#clean-similar').click(); await page.waitForFunction(() => !!window.releaseCandidate);
      await page.locator('#similar-cancel').click(); await idle();
      await page.evaluate(async () => { window.releaseCandidate(); await new Promise(resolve => requestAnimationFrame(resolve)); });
      assert.equal(await page.locator('#similar-dialog').evaluate(dialog => dialog.open), false);
      assert.equal(await page.locator('#similar-earlier-img').getAttribute('src'), null); assert.deepEqual(await stored(), original);
      await page.evaluate(() => {
        const read = PPTPageStore.assets, revoke = URL.revokeObjectURL; let reads = 0;
        window.reviewRevoked = []; URL.revokeObjectURL = url => { window.reviewRevoked.push(url); revoke(url); };
        PPTPageStore.assets = async (...args) => {
          if (++reads === 2) { PPTPageStore.assets = read; throw Error('Injected advance failure'); }
          return read(...args);
        };
      });
      await page.locator('#clean-similar').click(); await page.locator('#similar-both').waitFor({state: 'visible'});
      const urls = await page.evaluate(() => similarReview.urls.slice());
      await page.locator('#similar-earlier').click(); await idle();
      assert.match(await page.locator('#status').textContent(), /Injected advance failure/);
      assert(await page.evaluate(urls => urls.every(url => window.reviewRevoked.includes(url)), urls));
      assert.equal(await page.locator('#similar-dialog').evaluate(dialog => dialog.open), false);
      assert.deepEqual(await stored(), original);
    });

    await test('similar review reevaluates nontransitive candidates and preserves pages on read or commit failure', async () => {
      await seed([1, 2, 3].map(id => ({id, sourceTime: id, sourceKey: 'file:chain'})));
      await page.evaluate(async () => {
        const signatures = [0, .5, 1].map(percent => {
          const sig = new Uint8ClampedArray(192 * 108 * 4);
          for (let i = 0; i < Math.floor(192 * 108 * percent / 100); i++) sig.fill(255, i * 4, i * 4 + 3);
          return sig;
        });
        if (!PPTCore.similar(signatures[0], signatures[1], 3) || !PPTCore.similar(signatures[1], signatures[2], 3) || PPTCore.similar(signatures[0], signatures[2], 3)) throw Error('Invalid nontransitive fixture');
        const assets = await PPTPageStore.assets(db, [1, 2, 3]), tx = db.transaction(['assets'], 'readwrite');
        assets.forEach((asset, i) => tx.objectStore('assets').put({...asset, sig: signatures[i]}));
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
      });
      const original = await stored();
      await page.locator('#clean-similar').click(); await page.locator('#similar-earlier').click();
      await page.locator('#similar-confirm').waitFor({state: 'visible'});
      assert.deepEqual(await page.evaluate(() => similarReview.remove), [2], 'A/C must be compared after retaining A, not the deleted B/C pair');
      await abortNextReview(); await page.locator('#similar-confirm').click(); await count(3);
      assert.match(await page.locator('#status').textContent(), /删除失败/); assert.deepEqual(await stored(), original);
      await page.evaluate(() => { const read = PPTPageStore.assets; PPTPageStore.assets = async () => { PPTPageStore.assets = read; throw Error('Injected candidate read failure'); }; });
      await page.locator('#clean-similar').click(); await idle(); assert.deepEqual(await stored(), original);
      assert.match(await page.locator('#status').textContent(), /Injected candidate read failure/);
      assert.equal(await page.locator('#similar-dialog').evaluate(dialog => dialog.open), false);
      assert.equal(await page.locator('#similar-earlier-img').getAttribute('src'), null);
      await seed([{id: 1, sourceTime: 1, sourceKey: 'a'}, {id: 2, sourceTime: 2, sourceKey: 'a', w: 320}]);
      await page.locator('#clean-similar').click(); await idle(); assert.match(await page.locator('#status').textContent(), /没有发现/);
      await seed([]); assert.equal(await page.locator('#clean-similar').isDisabled(), true);
      await page.evaluate(() => cleanSimilar()); await count(0); assert.equal(await page.locator('#similar-dialog').evaluate(dialog => dialog.open), false);
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
      await page.locator('#clean-similar').click();
      await page.locator('#similar-later').click(); await page.locator('#similar-later').click();
      await page.locator('#similar-confirm').waitFor({state: 'visible'});
      assert.deepEqual(await stored(), original, 'pending decisions never delete before final confirmation');
      await page.locator('#similar-confirm').click(); await count(14);
      assert.deepEqual(await ids(), Array.from({length: 14}, (_, i) => i + 3));
      assert.deepEqual((await stored()).pages.slice(-2), legacy, 'keyless legacy pair is retained unchanged');
      await page.locator('#undo').click(); await count(16); assert.deepEqual(await stored(), original);
      await page.locator('#clean-similar').click();
      await page.locator('#similar-later').click(); await page.locator('#similar-later').click();
      await page.locator('#similar-confirm').waitFor({state: 'visible'});
      assert.deepEqual(await stored(), original, 'pending decisions never delete before final confirmation');
      await page.locator('#similar-confirm').click(); await count(14);
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

    await test('expanded running batch keeps shared Stop visible and hit-testable at desktop and narrow sizes', async () => {
      const geometry = [];
      for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [390, 844]]) {
        await page.setViewportSize({width, height}); await seed([{id: 101}, {id: 102, image: 1}]);
        const before = await stored();
        await page.evaluate(async ({url, course}) => {
          batchPage = location.origin + '/study-capture-courses/stop-visibility/preview-detail/list';
          batchJobs = [
            {id: 'stop-auto', course, sourceName: '2-自动课次.mp4', url, selected: true, state: 'pending', requiresCrop: false, options: []},
            {id: 'stop-zero', course, sourceName: '0-待确认 PPT 区域.mp4', url: url + '?track=0', selected: false, state: 'needs-crop', requiresCrop: true, cropConfirmed: false, options: []}
          ];
          await persistBatch(); renderBatchJobs();
          window.chrome ||= {}; chrome.permissions = {request: async () => true};
          window.__stopFixture = {entered: false, aborted: false, originalScan: PPTScanner.prototype.scan};
          PPTScanner.prototype.scan = async function ({signal, save}) {
            // Keep the real controller/fastScan/save/Stop path; bound only the scanner's wait for cancellation.
            await save(frame()); window.__stopFixture.entered = true;
            await new Promise((resolve, reject) => {
              const deadline = setTimeout(() => reject(Error('Stop fixture exceeded its 15-second cancellation deadline')), 15000);
              signal.addEventListener('abort', () => {
                clearTimeout(deadline); window.__stopFixture.aborted = true; reject(signal.reason);
              }, {once: true});
            });
          };
        }, {url: origin + '/' + path.relative(root, fixture).split(path.sep).join('/'), course: {...naming.course, date: '2026-11-07'}});
        await page.locator('#batch-panel > summary').click();
        await page.locator('#batch-start').click();
        await page.waitForFunction(() => window.__stopFixture.entered && batchRunning && task && pages.length === 1);
        assert.equal(await page.locator('#batch-panel').evaluate(panel => panel.open), true);
        assert.equal(await page.locator('#stop').count(), 1);
        assert.equal(await page.locator('#batch-jobs .batch-job').count(), 2);
        assert.match(await page.locator('[data-job-id="stop-zero"]').textContent(), /需要手动框选/);
        // These frames synchronize the actual screenshot only, not controller progress or button state.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const measured = await page.evaluate(() => {
          const rect = node => { const r = node.getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height}; };
          const clipping = node => {
            const clips = [{name: 'viewport', x: 0, y: 0, right: innerWidth, bottom: innerHeight, clipX: true, clipY: true}];
            for (let parent = node.parentElement; parent; parent = parent.parentElement) {
              const css = getComputedStyle(parent), clipX = /auto|scroll|hidden|clip/.test(css.overflowX), clipY = /auto|scroll|hidden|clip/.test(css.overflowY);
              if (clipX || clipY) { const r = parent.getBoundingClientRect(); clips.push({name: parent.id || parent.className || parent.tagName,
                x: r.x + parent.clientLeft, y: r.y + parent.clientTop, right: r.x + parent.clientLeft + parent.clientWidth,
                bottom: r.y + parent.clientTop + parent.clientHeight, clipX, clipY}); }
            }
            return clips;
          };
          const contained = (r, clips) => clips.every(c => (!c.clipX || (r.x >= c.x && r.right <= c.right)) && (!c.clipY || (r.y >= c.y && r.bottom <= c.bottom)));
          const hit = (node, x, y) => { const target = document.elementFromPoint(x, y); return target === node || node.contains(target); };
          const stop = $('stop'), r = rect(stop), region = rect(stop.parentElement);
          const targets = [[r.x + 3, r.y + 3], [r.right - 3, r.y + 3], [r.x + 3, r.bottom - 3], [r.right - 3, r.bottom - 3], [r.x + r.width / 2, r.y + r.height / 2]];
          const essential = ['#batch-panel > summary', '#tab-source', '#tab-extraction', '#tab-export', '#crop-select', '#full', '#shot'].map(selector => {
            const node = document.querySelector(selector), bounds = rect(node), visible = contained(bounds, clipping(node));
            const overlap = bounds.x < region.right && bounds.right > region.x && bounds.y < region.bottom && bounds.bottom > region.y;
            return {selector, visible, overlap, hit: visible ? hit(node, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) : null};
          });
          return {width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, enabled: !stop.disabled,
            stop: r, region, editor: rect(document.querySelector('.editor-layout')), clips: clipping(stop), targets: targets.map(([x, y]) => ({x, y, hit: hit(stop, x, y)})), essential,
            captureScroll: $('panel-capture').scrollTop, batchOpen: $('batch-panel').open, running: batchRunning, taskRunning: activeLesson.task.state};
        });
        geometry.push(measured); fs.writeFileSync(path.join(output, 'fix-1-stop-geometry.json'), JSON.stringify(geometry, null, 2));
        assert.equal(measured.enabled && measured.running && measured.batchOpen, true);
        assert.equal(measured.taskRunning, 'running'); assert.equal(measured.captureScroll, 0, 'fixture never pre-scrolls the capture pane');
        assert(measured.documentWidth <= width, 'running actions do not add horizontal overflow');
        if (width > 1020) assert(measured.editor.bottom <= measured.region.y, 'desktop action row reserves space below both panes');
        for (const clip of measured.clips) assert((!clip.clipX || (measured.stop.x >= clip.x && measured.stop.right <= clip.right)) &&
          (!clip.clipY || (measured.stop.y >= clip.y && measured.stop.bottom <= clip.bottom)), `enabled Stop escapes its actual clipping context ${clip.name}: ${JSON.stringify(measured)}`);
        assert(measured.targets.every(target => target.hit), 'all four Stop corners and center are hit-testable before any scroll or click');
        measured.essential.filter(control => control.visible).forEach(control => assert(!control.overlap && control.hit, `action row covers ${control.selector}`));
        await page.screenshot({path: path.join(output, `fix-1-expanded-running-${width}x${height}.png`)});
        const during = await stored(); assert.equal(during.pages.length, before.pages.length + 1);
        const center = measured.targets[4]; await page.mouse.click(center.x, center.y);
        assert.equal(await page.evaluate(() => window.__stopFixture.aborted), true, 'the real Stop click aborts the active scan immediately');
        await page.waitForFunction(() => !batchRunning && !busy() && batchJobs[0].state === 'stopped');
        assert.equal(await page.locator('#batch-panel').evaluate(panel => panel.open), true, 'Stop keeps the batch disclosure expanded');
        assert.equal(await page.locator('#stop').isDisabled(), true);
        assert.match(await page.locator('#batch-status').textContent(), /已停止.*截图均已保留/);
        const after = await stored(); assert.deepEqual(after.pages, during.pages, 'Stop retains existing and newly committed page bytes');
        before.pages.forEach(record => assert.deepEqual(after.pages.find(page => page.id === record.id), record));
        assert.equal(await page.locator('#pages article').count(), 1);
        measured.cancellation = {immediateAbort: true, retainedBefore: before.pages.length, retainedDuring: during.pages.length,
          retainedAfter: after.pages.length, activeCards: 1, state: 'stopped', batchStillOpen: true};
        fs.writeFileSync(path.join(output, 'fix-1-stop-geometry.json'), JSON.stringify(geometry, null, 2));
        await page.evaluate(() => { PPTScanner.prototype.scan = window.__stopFixture.originalScan; });
      }
      await page.setViewportSize({width: 1440, height: 900}); await seed([]);
    });

    await test('1280×800, 1440×900 and 1920×1080 keep video beside a bounded independently scrolling contact sheet', async () => {
      await seed([]); await load(fixture); const sourceKey = await page.evaluate(() => loadedIdentity.sourceKey);
      await seed(Array.from({length: 72}, (_, i) => ({id: i + 1, image: i % 3, sourceTime: i / 20, sourceKey}))); await load(fixture); await atTime(0.25);
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
        assert(measured.tools.width >= 260 && measured.tools.width <= 280, 'inspector has readable width'); assert(measured.video.right < measured.results.x, 'video is beside the review pane');
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
    await test('real workspace screenshots cover narrow stacking, wide batch, dark, contrast and reduced motion', async () => {
      const settleLayout = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.app-shell').count(), 1);
      await page.setViewportSize({width: 1440, height: 900}); await page.locator('#tab-source').click();
      await page.evaluate(() => {
        batchPage = location.origin + '/study-capture-courses/72/preview-detail/list';
        const course = {name: '机器学习 · 批量课程', date: '2026-11-07', start: '10:00:00'};
        batchJobs = [
          {id: 'visual-auto', course, sourceName: '2-第二节课堂录像.mp4', url: location.origin + '/2-fixture.mp4', selected: true, state: 'pending', requiresCrop: false, options: []},
          {id: 'visual-zero', course, sourceName: '0-第三节课堂录像（待确认 PPT 区域）.mp4', url: location.origin + '/0-fixture.mp4', selected: false, state: 'needs-crop', requiresCrop: true, cropConfirmed: false, options: []}
        ]; renderBatchJobs();
        sources = [{name: '0-' + '光电传感与机器视觉课堂录像完整来源名称'.repeat(5) + '.mp4', url: location.origin + '/0-long-source.mp4', source: '合成课程页'}]; updateSources();
      });
      await page.locator('#sources').selectOption(origin + '/0-long-source.mp4');
      await page.locator('#batch-panel > summary').click();
      await page.screenshot({path: path.join(output, 'batch-wide-1440x900.png')});
      await page.locator('#batch-panel > summary').click();
      await page.setViewportSize({width: 390, height: 844}); await settleLayout();
      const narrow = await page.evaluate(() => ({documentWidth: document.documentElement.scrollWidth, width: innerWidth,
        inspectorBottom: $('workspace-tools').getBoundingClientRect().bottom, workspaceTop: document.querySelector('.workspace-sheet').getBoundingClientRect().top,
        resultsTop: $('results').getBoundingClientRect().top, videoBottom: $('panel-capture').getBoundingClientRect().bottom}));
      assert(narrow.documentWidth <= narrow.width && narrow.workspaceTop >= narrow.inspectorBottom && narrow.resultsTop >= narrow.videoBottom);
      fs.writeFileSync(path.join(output, 'narrow-geometry.json'), JSON.stringify(narrow, null, 2));
      await page.screenshot({path: path.join(output, 'stacked-390x844.png')});
      await page.locator('#results').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(output, 'results-390x844.png')});
      await page.locator('#export-settings').click();
      assert.equal(await page.locator('#course-name').evaluate(input => input === document.activeElement), true);
      assert.equal(await page.locator('#panel-export').evaluate(panel => { const r = panel.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), true, 'narrow export shortcut brings its focused fields into view');
      await page.locator('#tab-source').click(); await page.setViewportSize({width: 1440, height: 900});
      await page.evaluate(() => scrollTo(0, 0)); await settleLayout();
      await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'no-preference'}); await settleLayout();
      await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
      await page.screenshot({path: path.join(output, 'dark-1440x900.png')});
      await page.emulateMedia({contrast: 'more'});
      await page.screenshot({path: path.join(output, 'contrast-dark-1440x900.png')});
      await page.emulateMedia({colorScheme: 'light', contrast: 'no-preference', reducedMotion: 'reduce'});
      await page.locator('#tab-export').click();
      assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0);
      await page.screenshot({path: path.join(output, 'reduce-1440x900.png')});
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
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
})();
