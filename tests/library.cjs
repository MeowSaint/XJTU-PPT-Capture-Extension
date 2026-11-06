/* Library regressions use loopback fixtures and a fresh headless Chromium context, never a real profile. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawnSync} = require('node:child_process');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright'), sharp = dependency('sharp');
const {PDFDocument, PDFName} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..'), scratch = path.join(root, '.test-output', 'v3.1.0');
fs.mkdirSync(scratch, {recursive: true});
const output = fs.mkdtempSync(path.join(scratch, 'library-'));
const fixture = path.join(output, 'library-video.mp4'), moving = path.join(output, 'library-moving.mp4'), continuity = path.join(output, 'library-continuity.mp4');
const course = {name: '模式识别', date: '2026-11-04', start: '08:00:00'};
const settings = {step: 2, threshold: 1.2, dedupe: true, stable: 1.5}, full = {x: 0, y: 0, w: 1, h: 1};
const passed = [], errors = [], blocked = [];
let browser, context, page, server, origin, images, fileKey;

async function idle() { await page.waitForFunction(() => ready && !busy()); }
async function count(n) { await page.waitForFunction(n => !busy() && document.querySelectorAll('#pages article').length === n, n); }
async function ids() { return page.locator('#pages article').evaluateAll(cards => cards.map(card => Number(card.dataset.pageId))); }
async function settled() { await page.evaluate(async () => { await namingSave; await lessonSave; }); await idle(); }
async function open() {
  await page.goto(origin + '/capture.html');
  await page.waitForFunction(() => ready);
  if (await page.locator('#terms-dialog').isVisible()) {
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click();
  }
  await idle();
}
async function load(file = fixture) {
  await page.locator('#tab-source').click(); await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(() => sourceReady && !busy() && document.querySelector('#video').seekable.length > 0);
}
async function choose(id) {
  await page.locator('#lesson-select').selectOption(id);
  await page.waitForFunction(id => activeLesson?.id === id && !busy(), id);
}
async function stored() {
  return page.evaluate(async () => {
    const tx = db.transaction(['pages', 'settings', 'assets']);
    const pageRead = tx.objectStore('pages').getAll(), keys = tx.objectStore('settings').getAllKeys();
    const values = tx.objectStore('settings').getAll(), assets = tx.objectStore('assets').getAll();
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });
    const saved = new Map(keys.result.map((key, i) => [key, values.result[i]]));
    const imageRead = await Promise.all(assets.result.map(async asset => ({id: asset.id,
      image: btoa(String.fromCharCode(...new Uint8Array(await asset.image.arrayBuffer()))),
      signatureLength: asset.sig?.length || 0})));
    return {version: db.version, pages: pageRead.result.sort((a, b) => a.order - b.order), assets: imageRead,
      lessons: [...saved].filter(([key]) => String(key).startsWith('lesson:')).map(([, value]) => value),
      batches: [...saved].filter(([key]) => String(key).startsWith('batch:')).map(([, value]) => value),
      activeId: saved.get('activeLesson')};
  });
}
function lesson(id, options = {}) {
  return {id, course: {...course}, page: '', source: {kind: 'file', sourceKey: fileKey, sourceName: path.basename(fixture), page: ''},
    crop: {...full}, settings: {...settings}, suspects: [], created: 1000, namingManual: true, ...options};
}
async function seed({version = 3, pages = [], lessons = [], activeId = lessons[0]?.id || '', batches = [], naming = {course, page: '', manual: true}} = {}) {
  await page.goto(origin + '/fixture.html');
  await page.evaluate(async ({version, specs, lessons, activeId, batches, naming, images}) => {
    const prepared = await Promise.all(specs.map(async (spec, index) => {
      const data = images[spec.image ?? index % images.length], image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 192, 108);
      const record = {id: index + 1, order: (index + 1) * 1024, w: 640, h: 360, time: 1793808000000,
        sourceTime: index / 4, course: naming.course, coursePage: '', batchJobId: '', ...spec,
        data, sig: ctx.getImageData(0, 0, 192, 108).data};
      delete record.image; return record;
    }));
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('course-ppt'); request.onsuccess = resolve;
      request.onerror = () => reject(request.error); request.onblocked = () => reject(Error('Fixture reset blocked'));
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', version);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true});
        request.result.createObjectStore('settings');
        if (version === 3) request.result.createObjectStore('assets', {keyPath: 'id'});
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result, tx = database.transaction(version === 3 ? ['pages', 'settings', 'assets'] : ['pages', 'settings'], 'readwrite');
        for (const record of prepared) {
          if (version === 2) tx.objectStore('pages').put(record);
          else {
            const {data, sig, ...metadata} = record;
            const raw = atob(data.split(',')[1]), image = new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], {type: 'image/jpeg'});
            tx.objectStore('pages').put(metadata); tx.objectStore('assets').put({id: metadata.id, image, sig});
          }
        }
        const store = tx.objectStore('settings'); store.put(naming, 'exportNaming'); store.put(activeId, 'activeLesson');
        lessons.forEach(lesson => store.put(lesson, 'lesson:' + lesson.id));
        batches.forEach(batch => store.put(batch, 'batch:' + batch.page));
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = tx.onabort = () => { database.close(); reject(tx.error); };
      };
    });
  }, {version, specs: pages, lessons, activeId, batches, naming, images});
  await open();
}
async function test(name, body) { await body(); passed.push(name); console.log('PASS ' + name); }
function zipEntries(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50, 'ZIP end directory');
  const count = bytes.readUInt16LE(end + 10), entries = [];
  let central = bytes.readUInt32LE(end + 16);
  assert.equal(central + bytes.readUInt32LE(end + 12), end);
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.equal(bytes.readUInt16LE(central + 10), 0, 'PDF entries are stored intact');
    assert(bytes.readUInt16LE(central + 8) & 0x800, 'Chinese ZIP names use UTF-8');
    const size = bytes.readUInt32LE(central + 20), nameLength = bytes.readUInt16LE(central + 28);
    const local = bytes.readUInt32LE(central + 42), name = bytes.toString('utf8', central + 46, central + 46 + nameLength);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    entries.push({name, bytes: bytes.subarray(start, start + size)});
    central += 46 + nameLength + bytes.readUInt16LE(central + 30) + bytes.readUInt16LE(central + 32);
  }
  assert.equal(central, end); return entries;
}

(async () => {
  try {
    const ffmpeg = process.env.PPT_TEST_FFMPEG || 'ffmpeg';
    const inputs = ['0x24354a:d=2', '0x9e2437:d=1', '0x24354a:d=1', '0x596779:d=2'];
    const generated = spawnSync(ffmpeg, ['-y', '-v', 'error', ...inputs.flatMap(color => ['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=20`]),
      '-filter_complex', '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixture], {encoding: 'utf8'});
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
    const animated = spawnSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=2:size=640x360:rate=20', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', moving], {encoding: 'utf8'});
    assert.equal(animated.status, 0, animated.stderr || animated.error?.message);
    const stationary = spawnSync(ffmpeg, ['-y', '-v', 'error', ...['0x24354a:d=10', '0x9e2437:d=2'].flatMap(color => ['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=20`]),
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', continuity], {encoding: 'utf8'});
    assert.equal(stationary.status, 0, stationary.stderr || stationary.error?.message);
    fs.utimesSync(fixture, 1793808000, 1793808000);
    const stat = fs.statSync(fixture); fileKey = 'file:' + JSON.stringify([path.basename(fixture), stat.size, stat.mtimeMs]);
    const wrong = path.join(output, 'other', path.basename(fixture)); fs.mkdirSync(path.dirname(wrong));
    fs.writeFileSync(wrong, Buffer.concat([fs.readFileSync(fixture), Buffer.from('different size, identical file name')]));
    images = await Promise.all(['#24354a', '#9e2437', '#596779'].map(async color => 'data:image/jpeg;base64,' +
      (await sharp({create: {width: 640, height: 360, channels: 3, background: color}}).jpeg({quality: 95}).toBuffer()).toString('base64')));
    server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/fixture.html') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<!doctype html><title>Isolated library fixture</title>'); return; }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (error, bytes) => {
        if (error) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {'Content-Type': {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png'}[path.extname(file)] || 'application/octet-stream'}); res.end(bytes);
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({...browserOptions(), downloadsPath: output});
    context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(blob|data):/.test(url) || new URL(url).origin === origin) return route.continue();
      blocked.push(url); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await open();

    await test('v2 migration separates lesson identities and preserves every JPEG/signature asset', async () => {
      const second = {...course, date: '2026-11-05', start: '10:00:00'};
      const specs = [
        {id: 41, sourceKey: fileKey, sourceName: path.basename(fixture), image: 0},
        {id: 7, sourceKey: fileKey, sourceName: path.basename(fixture), image: 1},
        {id: 99, sourceKey: 'file:["second.mp4",200,1]', sourceName: 'second.mp4', course: second, image: 2},
        {id: 13, sourceKey: 'file:["second.mp4",200,1]', sourceName: 'second.mp4', course: second, image: 0},
        {id: 88, sourceKey: 'url:https://media.invalid/recording.mp4', sourceName: '历史远程录像', coursePage: 'https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/old', image: 1},
      ];
      await seed({version: 2, pages: specs}); await count(2);
      const snapshot = await stored(); assert.equal(snapshot.version, 3); assert.equal(snapshot.lessons.length, 3);
      assert.equal(snapshot.pages.length, specs.length); assert.equal(snapshot.assets.length, specs.length);
      for (const spec of specs) {
        const metadata = snapshot.pages.find(page => page.id === spec.id), asset = snapshot.assets.find(asset => asset.id === spec.id);
        assert(metadata.lessonId); assert.equal(metadata.sourceKey, spec.sourceKey);
        assert.equal(Object.hasOwn(metadata, 'data'), false); assert.equal(Object.hasOwn(metadata, 'sig'), false);
        assert.equal(asset.image, images[spec.image].split(',')[1]); assert.equal(asset.signatureLength, 192 * 108 * 4);
      }
      const firstId = snapshot.pages.find(page => page.id === 41).lessonId;
      assert.equal(snapshot.pages.find(page => page.id === 7).lessonId, firstId);
      assert.notEqual(snapshot.pages.find(page => page.id === 99).lessonId, firstId);
      const remoteId = snapshot.pages.find(page => page.id === 88).lessonId;
      await choose(remoteId); await count(1);
      assert.equal(await page.evaluate(() => sourceReady), false); assert.equal(await page.locator('#video').getAttribute('src'), null);
      assert.equal(snapshot.lessons.find(lesson => lesson.id === remoteId).source.kind, 'remote');
      await choose(firstId); await count(2); assert.deepEqual(await ids(), [41, 7]);
    });

    await test('lesson switching isolates naming, settings, crop, reorder, delete and clear across reload', async () => {
      const snapshot = await stored(), firstId = snapshot.pages.find(page => page.id === 41).lessonId;
      const secondId = snapshot.pages.find(page => page.id === 99).lessonId;
      await choose(secondId); await count(2); assert.deepEqual(await ids(), [99, 13]);
      assert.equal(await page.locator('#course-date').inputValue(), '2026-11-05');
      await settled(); const other = (await stored()).pages.filter(page => page.lessonId === secondId);
      await choose(firstId); await load(); assert.equal(await page.evaluate(() => activeLesson.id), firstId);
      await page.locator('#tab-export').click(); await page.locator('#course-name').fill('甲课次手工名称');
      await page.locator('#tab-source').click(); await page.locator('#share-panel').evaluate(panel => { panel.open = true; });
      await page.locator('#stable').fill('2.5'); await page.locator('#tab-extraction').click();
      await page.locator('#mode').selectOption('0.5'); await page.locator('#diff').fill('2.4'); await page.locator('#dedupe').uncheck();
      await page.locator('#crop-select').click();
      const box = await page.locator('#overlay').evaluate(canvas => { const r = canvas.getBoundingClientRect(), b = bounds(); return {x: r.x + b.x, y: r.y + b.y, w: b.w, h: b.h}; });
      await page.mouse.move(box.x + box.w * .1, box.y + box.h * .15); await page.mouse.down();
      await page.mouse.move(box.x + box.w * .75, box.y + box.h * .85); await page.mouse.up(); await settled();
      const edited = (await stored()).lessons.find(lesson => lesson.id === firstId);
      assert.deepEqual(edited.settings, {step: .5, threshold: 2.4, dedupe: false, stable: 2.5});
      assert(Math.abs(edited.crop.x - .1) < .01 && Math.abs(edited.crop.y - .15) < .01);
      assert(Math.abs(edited.crop.w - .65) < .01 && Math.abs(edited.crop.h - .7) < .01);
      await page.locator('#pages').evaluate(container => {
        const [first, second] = container.children, transfer = new DataTransfer(), r = second.getBoundingClientRect();
        first.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: transfer}));
        second.dispatchEvent(new DragEvent('drop', {bubbles: true, dataTransfer: transfer, clientX: r.right - 1, clientY: r.y + 5}));
        first.dispatchEvent(new DragEvent('dragend', {bubbles: true, dataTransfer: transfer}));
      });
      await page.waitForFunction(() => !busy() && document.querySelector('#pages article')?.dataset.pageId === '7');
      await page.reload(); await count(2); assert.deepEqual(await ids(), [7, 41]);
      const restored = (await stored()).lessons.find(lesson => lesson.id === firstId);
      assert.deepEqual(restored.crop, edited.crop); assert.deepEqual(restored.settings, edited.settings);
      assert.equal(await page.locator('#course-name').inputValue(), '甲课次手工名称');
      assert.equal(await page.evaluate(() => sourceReady), false);
      await page.locator('#pages article button').first().click(); await count(1); assert.deepEqual(await ids(), [41]);
      page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click(); await count(0);
      const cleared = await stored(); assert.deepEqual(cleared.pages.filter(page => page.lessonId === secondId), other);
      assert(!cleared.assets.some(asset => [41, 7].includes(asset.id)), 'clear removes only this lesson and its undo assets');
      assert(cleared.assets.some(asset => asset.id === 99) && cleared.assets.some(asset => asset.id === 13));
      await choose(secondId); await count(2); assert.deepEqual(await ids(), [99, 13]);
      assert.equal(await page.locator('#course-name').inputValue(), course.name);
      assert.equal(await page.locator('#mode').inputValue(), '0.5'); assert.equal(await page.locator('#dedupe').isChecked(), true);
      assert.deepEqual(await page.evaluate(() => crop), full);
      await page.reload(); await count(2); assert.deepEqual(await ids(), [99, 13]);
    });

    await test('unloading preserves crop through later edits and frees video/cache when lesson persistence fails', async () => {
      const savedCrop = {x: .1, y: .15, w: .65, h: .7};
      await seed({lessons: [lesson('release', {crop: savedCrop})], pages: [{id: 60, lessonId: 'release', sourceKey: fileKey, sourceName: path.basename(fixture)}]});
      await load(); await settled(); const before = await stored();
      assert.deepEqual(await page.evaluate(() => crop), savedCrop);
      await page.locator('#release-cache').click();
      await page.waitForFunction(() => !busy() && !sourceReady && document.querySelector('#status').textContent.includes('已释放视频缓存'));
      assert.deepEqual(await page.evaluate(() => crop), savedCrop);
      assert.equal(await page.locator('#video').getAttribute('src'), null);
      await page.locator('#tab-extraction').click(); await page.locator('#mode').selectOption('0.5');
      await page.locator('#diff').fill('2.4'); await page.locator('#dedupe').uncheck();
      await page.locator('#tab-export').click(); await page.locator('#course-name').fill('卸载后编辑的课次'); await settled();
      await page.reload(); await count(1);
      const edited = (await stored()).lessons.find(lesson => lesson.id === 'release');
      assert.deepEqual(edited.crop, savedCrop); assert.deepEqual(await page.evaluate(() => crop), savedCrop);
      assert.deepEqual(edited.settings, {...settings, step: .5, threshold: 2.4, dedupe: false});
      assert.equal(await page.locator('#course-name').inputValue(), '卸载后编辑的课次');
      await load(); await settled();
      const filesBefore = await page.evaluate(async () => {
        videoCache = await PPTDiskCache.create('library-release'); await videoCache.write(new Uint8Array([1, 2, 3])); await videoCache.finish();
        window.libraryCacheEntries = async () => {
          const parent = await (await navigator.storage.getDirectory()).getDirectoryHandle('ppt-capture-cache'), files = [];
          for await (const [sessionName, directory] of parent.entries()) {
            if (directory.kind === 'directory') for await (const [name] of directory.entries()) if (name.startsWith('library-release-')) files.push(sessionName + '/' + name);
          }
          return files;
        };
        PPTLibrary.put = async () => { throw Error('Injected lesson persistence failure'); };
        return window.libraryCacheEntries();
      });
      assert.equal(filesBefore.length, 1, 'a real isolated OPFS cache exists before the failure');
      await page.locator('#release-cache').click();
      await page.waitForFunction(() => !busy() && !sourceReady && document.querySelector('#status').textContent.includes('Injected lesson persistence failure'));
      assert.match(await page.locator('#status').textContent(), /释放视频缓存失败/);
      assert.deepEqual(await page.evaluate(() => ({sourceReady, objectURL, hls, stream, videoCache, loadedIdentity})),
        {sourceReady: false, objectURL: null, hls: null, stream: null, videoCache: null, loadedIdentity: null});
      assert.deepEqual(await page.evaluate(() => window.libraryCacheEntries()), [], 'persistence failure must not strand the real cache');
      assert.equal(await page.locator('#video').getAttribute('src'), null);
      assert.deepEqual((await stored()).pages, before.pages); assert.deepEqual(await page.evaluate(() => crop), savedCrop);
      await page.reload(); await count(1);
      assert.deepEqual((await stored()).lessons.find(lesson => lesson.id === 'release').crop, savedCrop);
    });

    await test('a task paused at checkpoint zero retains its task identity when resumed', async () => {
      const task = {id: 'zero-checkpoint-task', state: 'paused', checkpoint: 0, baselineTime: null, duration: 6, settings, crop: full};
      await seed({lessons: [lesson('zero-checkpoint', {task})]});
      assert.equal(await page.locator('#run').isDisabled(), true);
      await load(); assert.match(await page.locator('#run').textContent(), /继续提取/);
      await page.locator('#run').click(); await page.waitForFunction(() => !busy() && activeLesson.task?.state === 'done');
      const complete = await stored(), saved = complete.lessons.find(lesson => lesson.id === 'zero-checkpoint');
      assert.equal(saved.task.id, task.id); assert.equal(saved.task.checkpoint, 5.95);
      assert.equal(complete.pages.length, 3); assert(complete.pages.every(page => page.scanId === task.id));
    });

    await test('a stable-slide checkpoint resumes without extra pages when dedupe is off', async () => {
      await seed(); await load(continuity); await page.locator('#tab-extraction').click(); await page.locator('#mode').selectOption('2'); await page.locator('#dedupe').uncheck(); await settled();
      await page.locator('#run').click(); await page.waitForFunction(() => !busy() && activeLesson.task?.state === 'done');
      const uninterrupted = (await stored()).pages.map(page => page.sourceTime); assert.deepEqual(uninterrupted, [.25, 10.25]);
      await seed(); await load(continuity); await page.locator('#tab-extraction').click(); await page.locator('#mode').selectOption('2'); await page.locator('#dedupe').uncheck(); await settled();
      await page.evaluate(() => {
        const put = PPTLibrary.put; window.continuityProbe = {held: false};
        PPTLibrary.put = async (...args) => {
          await put(...args);
          if (args[1].task?.state === 'running' && args[1].task.checkpoint === 4) {
            window.continuityProbe.held = true; await new Promise(resolve => { window.continuityProbe.release = resolve; });
          }
        };
      });
      await page.locator('#run').click(); await page.waitForFunction(() => window.continuityProbe.held);
      const checkpoint = await stored(), original = checkpoint.lessons.find(lesson => lesson.id === checkpoint.activeId);
      assert.equal(original.task.checkpoint, 4); assert.deepEqual(checkpoint.pages.map(page => page.sourceTime), [.25]);
      await page.locator('#stop').click(); await page.evaluate(() => window.continuityProbe.release()); await count(1);
      await page.reload(); await count(1); assert.equal(await page.evaluate(() => sourceReady), false);
      await load(continuity);
      await page.evaluate(() => {
        const scan = PPTScanner.prototype.scan; window.continuityResume = {checkpoints: []};
        PPTScanner.prototype.scan = function (options) {
          const checkpoint = options.checkpoint; Object.assign(window.continuityResume, {start: options.start, baselineTime: options.baselineTime});
          return scan.call(this, {...options, checkpoint: async point => { window.continuityResume.checkpoints.push(point.time); await checkpoint(point); }});
        };
      });
      await page.locator('#run').click(); await page.waitForFunction(() => !busy() && activeLesson.task?.state === 'done');
      const complete = await stored(), finalTask = complete.lessons.find(lesson => lesson.id === original.id).task;
      assert.deepEqual(complete.pages.map(page => page.sourceTime), uninterrupted, 'an unchanged checkpoint cannot manufacture a same-slide page');
      assert.equal(original.task.baselineTime, .25); assert.equal(finalTask.id, original.task.id); assert.equal(finalTask.baselineTime, 10.25);
      assert.deepEqual(await page.evaluate(() => window.continuityResume), {start: 4, baselineTime: .25, checkpoints: [4, 6, 8, 10, 11.95]});
      assert(complete.pages.every(page => page.scanId === original.task.id));
    });

    await test('a legacy task without a baseline replays from zero under the same task identity', async () => {
      const legacy = {id: 'legacy-task', state: 'paused', checkpoint: 2, duration: 6, settings: {...settings, dedupe: false}, crop: full};
      await seed({lessons: [lesson('legacy-resume', {task: legacy, settings: legacy.settings})], pages: [
        {id: 70, lessonId: 'legacy-resume', scanId: legacy.id, sourceKey: fileKey, sourceName: path.basename(fixture), sourceTime: .25, image: 0},
        {id: 71, lessonId: 'legacy-resume', scanId: legacy.id, sourceKey: fileKey, sourceName: path.basename(fixture), sourceTime: 2.25, image: 1},
      ]});
      await load();
      await page.evaluate(() => {
        const scan = PPTScanner.prototype.scan; window.legacyResumeStart = null;
        PPTScanner.prototype.scan = function (options) { window.legacyResumeStart = options.start; return scan.call(this, options); };
      });
      await page.locator('#run').click(); await page.waitForFunction(() => !busy() && activeLesson.task?.state === 'done');
      const complete = await stored(), task = complete.lessons.find(lesson => lesson.id === 'legacy-resume').task;
      assert.equal(await page.evaluate(() => window.legacyResumeStart), 0); assert.equal(task.id, legacy.id);
      assert.deepEqual(complete.pages.map(page => page.sourceTime), [.25, 2.25, 3.25, 4.25]);
      assert(complete.pages.every(page => page.scanId === legacy.id));
    });

    await test('committed partial intervals resume the same task without duplicates and reject same-name different files', async () => {
      await seed(); await load();
      await page.locator('#tab-extraction').click(); await page.locator('#mode').selectOption('2'); await page.locator('#dedupe').uncheck(); await settled();
      await page.evaluate(() => {
        const add = PPTPageStore.add, put = PPTLibrary.put;
        window.libraryProbe = {committed: [], checkpoints: [], inflight: 0, held: false};
        PPTPageStore.add = async (...args) => {
          const probe = window.libraryProbe; probe.inflight++;
          const id = await add(...args); probe.committed.push(args[1].sourceTime);
          if (Math.abs(args[1].sourceTime - 3.25) < .001) {
            probe.held = true; await new Promise(resolve => { probe.release = resolve; });
          }
          probe.inflight--; return id;
        };
        PPTLibrary.put = async (database, lesson) => {
          const probe = window.libraryProbe;
          if (lesson.task?.state === 'running') probe.checkpoints.push({time: lesson.task.checkpoint, committed: [...probe.committed], inflight: probe.inflight});
          return put(database, lesson);
        };
      });
      await page.locator('#run').click(); await page.waitForFunction(() => window.libraryProbe.held);
      const during = await stored(), first = during.lessons.find(lesson => lesson.id === during.activeId);
      assert.equal(first.task.checkpoint, 2); assert.equal(first.task.state, 'running');
      assert.deepEqual(during.pages.map(page => page.sourceTime), [.25, 2.25, 3.25]);
      assert(during.pages.every(page => during.assets.some(asset => asset.id === page.id)), 'page metadata and image commits are atomic');
      const checkpoints = await page.evaluate(() => window.libraryProbe.checkpoints);
      assert(checkpoints.some(point => point.time === 2 && point.committed.includes(2.25)));
      assert(checkpoints.every(point => point.inflight === 0), 'no checkpoint starts while a page write is pending');
      await page.locator('#stop').click(); await page.evaluate(() => window.libraryProbe.release()); await count(3);
      assert.match(await page.locator('#status').textContent(), /已停止/);
      assert.equal((await stored()).lessons.find(lesson => lesson.id === first.id).task.checkpoint, 2);
      await page.reload(); await count(3);
      assert.equal(await page.evaluate(() => sourceReady), false); assert.equal(await page.locator('#run').isDisabled(), true);
      assert.equal((await stored()).lessons.find(lesson => lesson.id === first.id).task.state, 'paused');
      await load(wrong); await count(0);
      const separate = await stored(); assert.notEqual(separate.activeId, first.id);
      assert.equal(separate.lessons.find(lesson => lesson.id === separate.activeId).task, undefined);
      assert.notEqual(separate.lessons.find(lesson => lesson.id === separate.activeId).source.sourceKey, fileKey);
      assert.deepEqual(separate.pages.filter(page => page.lessonId === first.id), during.pages);
      await choose(first.id); await count(3); assert.equal(await page.locator('#run').isDisabled(), true);
      const chooser = page.waitForEvent('filechooser'); await page.locator('#resume-load').click(); await (await chooser).setFiles(fixture);
      await page.waitForFunction(() => sourceReady && !busy()); assert.match(await page.locator('#run').textContent(), /继续提取/);
      await page.evaluate(() => {
        const scan = PPTScanner.prototype.scan; window.resumeProbe = {checkpoints: []};
        PPTScanner.prototype.scan = function (options) {
          const checkpoint = options.checkpoint; Object.assign(window.resumeProbe, {start: options.start, baselineTime: options.baselineTime});
          return scan.call(this, {...options, checkpoint: async point => { window.resumeProbe.checkpoints.push(point.time); await checkpoint(point); }});
        };
      });
      await page.locator('#run').click(); await page.waitForFunction(() => !busy() && activeLesson.task?.state === 'done');
      const complete = await stored(), scan = complete.lessons.find(lesson => lesson.id === first.id).task;
      assert.equal(scan.id, first.task.id);
      assert.deepEqual(await page.evaluate(() => window.resumeProbe), {start: 2, baselineTime: 2.25, checkpoints: [2, 4, 5.95]});
      const retained = complete.pages.filter(page => page.lessonId === first.id);
      assert.deepEqual(retained.map(page => page.sourceTime), [.25, 2.25, 3.25, 4.25]);
      assert(retained.every(page => page.scanId === scan.id));
      assert.equal(new Set(retained.map(page => `${page.scanId}:${page.sourceTime}`)).size, retained.length);
      assert.equal(scan.checkpoint, 5.95); assert.equal(await page.locator('#dedupe').isChecked(), false);
    });

    await test('unstable confirmations persist suspects across reload', async () => {
      await seed(); await load(moving);
      await page.locator('#tab-extraction').click(); await page.locator('#mode').selectOption('0.5'); await settled();
      await page.locator('#run').click(); await page.waitForFunction(() => !busy() && activeLesson.task?.state === 'done');
      const before = await stored(), current = before.lessons.find(lesson => lesson.id === before.activeId);
      assert(current.suspects.length > 0, 'moving synthetic frames must produce an unstable confirmation');
      assert(current.suspects.every(range => range.start >= 0 && range.end <= 2 && range.end >= range.start));
      await page.reload(); await idle();
      assert.deepEqual((await stored()).lessons.find(lesson => lesson.id === current.id).suspects, current.suspects);
      assert.equal(await page.locator('#suspect-ranges .suspect-range').count(), current.suspects.length);
      assert.equal(await page.locator('#suspect-ranges button').first().isDisabled(), true, 'review requires reselecting the local video');
    });

    await test('local suspect rescan uses only its half-second range and resolves only after success', async () => {
      const ranges = [{start: 2, end: 2.9, time: 2}, {start: 4.5, end: 5.5, time: 5}];
      const task = {id: 'completed-main-task', state: 'done', checkpoint: 5.95, baselineTime: 4.25, duration: 6, settings: {...settings, step: 8}, crop: full};
      await seed({lessons: [lesson('review', {suspects: ranges, task, settings: {...settings, step: 8}})], pages: [
        {id: 101, lessonId: 'review', sourceKey: fileKey, sourceName: path.basename(fixture), sourceTime: .25, image: 0},
        {id: 102, lessonId: 'review', sourceKey: fileKey, sourceName: path.basename(fixture), sourceTime: 4.25, image: 2},
      ]});
      await load(); await page.locator('#suspects-panel').evaluate(panel => { panel.open = true; });
      const before = await stored();
      await page.evaluate(() => {
        const seek = PPTScanner.prototype.seek; window.rangeSeeks = [];
        PPTScanner.prototype.seek = function (time, ...args) { window.rangeSeeks.push(time); return seek.call(this, time, ...args); };
      });
      await page.locator('#suspect-ranges .suspect-range').first().getByRole('button', {name: '细查此段'}).click();
      await page.waitForFunction(() => !busy() && document.querySelector('#status').textContent.includes('局部细查完成'));
      const success = await stored(), reviewed = success.lessons.find(lesson => lesson.id === 'review');
      assert.deepEqual(reviewed.suspects, [ranges[1]]); assert.deepEqual(reviewed.task, task);
      assert.equal(await page.locator('#mode').inputValue(), '8', 'range scan does not overwrite lesson settings');
      const seeks = await page.evaluate(() => window.rangeSeeks); assert(seeks.every(time => time >= 2 && time <= 2.9));
      assert(seeks.includes(2.5) && seeks.includes(2.9), 'local scan forces half-second samples and its exact end');
      assert.equal(success.pages.length, 3); assert.equal(success.pages.find(page => ![101, 102].includes(page.id)).sourceTime, 2.25);
      for (const original of before.pages) assert.deepEqual(success.pages.find(page => page.id === original.id), original);
      await page.reload(); await count(3); await load();
      assert.deepEqual((await stored()).lessons.find(lesson => lesson.id === 'review').suspects, [ranges[1]]);
      await page.locator('#suspects-panel').evaluate(panel => { panel.open = true; });
      await page.evaluate(() => { PPTScanner.prototype.seek = async () => { throw Error('Injected local rescan failure'); }; });
      await page.locator('#suspect-ranges').getByRole('button', {name: '细查此段'}).click();
      await page.waitForFunction(() => !busy() && document.querySelector('#status').textContent.includes('Injected local rescan failure'));
      const failed = await stored(); assert.deepEqual(failed.lessons.find(lesson => lesson.id === 'review').suspects, [ranges[1]]);
      assert.deepEqual(failed.pages, success.pages); assert.deepEqual(failed.lessons.find(lesson => lesson.id === 'review').task, task);
    });

    await test('course ZIP contains ordered independent Chinese-named PDFs, skips empty/other courses and restores batch state', async () => {
      const base = 'https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/';
      const early = lesson('early', {page: base + 'a', course, task: {state: 'done'}});
      const late = lesson('late', {page: base + 'b', course: {...course, date: '2026-11-05', start: '10:00:00'}, task: {state: 'failed'}});
      const empty = lesson('empty', {page: base + 'empty', course: {...course, date: '2026-11-03'}});
      const other = lesson('other', {page: base.replace('/42/', '/99/') + 'c', course});
      const batchPage = base + 'b', jobs = [
        {id: 'done-job', sourceName: '已完成录像', course, selected: false, state: 'done', requiresCrop: false},
        {id: 'interrupted-job', sourceName: '已中断录像', course, selected: true, state: 'scanning', requiresCrop: false},
        {id: 'failed-job', sourceName: '失败录像', course, selected: false, state: 'failed', error: '保留的错误', requiresCrop: false},
      ];
      early.source = {...early.source, batchJobId: 'done-job', page: batchPage};
      await seed({lessons: [late, empty, other, early], activeId: 'late', batches: [{page: batchPage, jobs}], pages: [
        {id: 3, lessonId: 'early', order: 2048, image: 0}, {id: 8, lessonId: 'early', order: 1024, image: 1},
        {id: 5, lessonId: 'late', order: 1024, image: 2}, {id: 6, lessonId: 'other', order: 1024, image: 0},
      ]});
      await count(1); assert.equal(await page.locator('#batch-jobs .batch-job').count(), 3);
      assert.match(await page.locator('[data-job-id="done-job"] .batch-state').textContent(), /已完成 · 2 页/);
      assert.match(await page.locator('[data-job-id="interrupted-job"] .batch-state').textContent(), /已停止/);
      assert.equal(await page.locator('[data-job-id="interrupted-job"] input').isChecked(), true);
      assert.equal(await page.locator('[data-job-id="failed-job"] .batch-state').getAttribute('title'), '保留的错误');
      await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      await page.locator('[data-job-id="interrupted-job"] input').uncheck();
      await page.waitForFunction(async () => {
        const request = db.transaction('settings').objectStore('settings').get('batch:' + batchPage);
        const saved = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        return saved?.jobs.find(job => job.id === 'interrupted-job')?.selected === false;
      });
      await page.reload(); await count(1);
      assert.equal(await page.locator('[data-job-id="interrupted-job"] input').isChecked(), false);
      await page.locator('#tab-export').click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#course-zip').click()]);
      assert.equal(download.suggestedFilename(), course.name + '-课次PDF.zip');
      const zipPath = path.join(output, download.suggestedFilename()); await download.saveAs(zipPath); await idle();
      const entries = zipEntries(fs.readFileSync(zipPath)); assert.equal(entries.length, 2);
      assert.deepEqual(entries.map(entry => entry.name.replace(/^\d+-/, '')), [
        '模式识别-2026-11-04-08-00-00.pdf', '模式识别-2026-11-05-10-00-00.pdf',
      ]);
      const expected = [[1, 0], [2]];
      for (const [index, entry] of entries.entries()) {
        const document = await PDFDocument.load(entry.bytes); assert.equal(document.getPageCount(), expected[index].length);
        for (const [number, image] of expected[index].entries()) {
          const resources = document.getPage(number).node.Resources().lookup(PDFName.of('XObject'));
          const embedded = document.context.lookup(resources.get(PDFName.of('Im0')));
          assert.deepEqual(Buffer.from(embedded.contents), Buffer.from(images[image].split(',')[1], 'base64'), 'PDF page order follows each lesson, not global IDs');
        }
      }
      assert.match(await page.locator('#status').textContent(), /2 节 PDF.*共 3 页/);
      assert.match(await page.locator('#status').textContent(), /跳过 3 个空课次/, 'one empty lesson and two persisted batch jobs have no screenshots');
      assert.match(await page.locator('#status').textContent(), /1 节尚未完成整节扫描/);
    });
    assert.deepEqual(errors, [], 'no browser script errors'); assert.deepEqual(blocked, [], 'no nonlocal network requests');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({passed, errors, blocked, output}, null, 2));
    console.log(`${passed.length} focused library groups passed. Evidence: ${output}`);
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({path: path.join(output, 'failure.png')}).catch(() => {});
      console.error('Browser diagnostics:', await page.evaluate(() => ({status: document.querySelector('#status')?.textContent,
        active: typeof activeLesson === 'undefined' ? null : activeLesson, busy: typeof busy === 'undefined' ? null : busy(),
        ids: [...document.querySelectorAll('#pages article')].map(card => card.dataset.pageId)})).catch(() => null));
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({passed, error: error.stack, errors, blocked, output}, null, 2));
    console.error(error); console.error('Evidence: ' + output); process.exitCode = 1;
  } finally {
    if (context) await context.close(); if (browser) await browser.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
})();
