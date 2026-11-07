/* Library regressions use loopback fixtures and a fresh headless Chromium context, never a real profile. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawnSync} = require('node:child_process');
const {gzipSync} = require('node:zlib');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright'), sharp = dependency('sharp');
const {PDFDocument, PDFName} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..'), scratch = process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'v3.1.2');
fs.mkdirSync(scratch, {recursive: true});
const output = fs.mkdtempSync(path.join(scratch, 'library-'));
const fixture = path.join(output, 'library-video.mp4'), moving = path.join(output, 'library-moving.mp4'), continuity = path.join(output, 'library-continuity.mp4');
const resized = path.join(output, 'library-small.mp4');
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
// Run both real discovery producers on a synthetic page, then feed their reply through
// the workspace's actual discovery/preflight/select/load/bind path. No injected course values.
async function producerReply({base, payload, capture = {}, transport = 'fetch', extra = []}) {
  const producer = await context.newPage(), calls = []; let session;
  producer.on('pageerror', error => errors.push('producer: ' + error.message));
  try {
    await producer.route(origin + '/study-capture-courses/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>资源管理平台</title><p>课程名称：A</p><p>开课时间：2026-09-14 00:00</p>'}));
    await producer.route(origin + '/api/**', route => {
      const pathname = new URL(route.request().url()).pathname; calls.push(pathname);
      return route.fulfill({contentType: 'application/json', body: JSON.stringify(/\/captures\//.test(pathname) ? capture : payload)});
    });
    await producer.goto(base);
    for (const script of ['media.js', 'course.js', 'page-hook.js']) await producer.addScriptTag({content: fs.readFileSync(path.join(root, script), 'utf8')});
    session = await context.newCDPSession(producer);
    const {frameTree} = await session.send('Page.getFrameTree');
    const {executionContextId} = await session.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName: 'acquisition-isolated'});
    const isolated = async expression => {
      const result = await session.send('Runtime.evaluate', {contextId: executionContextId, expression, awaitPromise: true, returnByValue: true});
      assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.text); return result.result.value;
    };
    await isolated(`window.fixtureMessages = []; window.chrome = {runtime: {id: 'producer-fixture',
      sendMessage: async message => fixtureMessages.push(message), onMessage: {addListener: fn => { window.fixtureDiscover = fn; }}}};
      window.PPTState = {hasConsent: async () => true};`);
    for (const script of ['media.js', 'course.js', 'batch.js', 'content.js']) await isolated(fs.readFileSync(path.join(root, script), 'utf8'));
    await producer.evaluate(async ({transport, extra}) => {
      const endpoint = '/api/v1/rms-service/study-capture-courses/42';
      if (transport === 'xhr') await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest(); xhr.open('GET', endpoint); xhr.responseType = 'json'; xhr.onload = resolve; xhr.onerror = reject; xhr.send();
      });
      else await fetch(endpoint);
      for (const url of extra) { const video = document.createElement('video'); video.src = url; document.body.append(video); }
    }, {transport, extra});
    const reply = await isolated("new Promise(resolve => fixtureDiscover({type: 'PPT_DISCOVER'}, {}, resolve))");
    // Drain cross-world postMessage tasks after the explicit MAIN query.
    await isolated('new Promise(resolve => setTimeout(resolve, 30))');
    const final = await isolated("new Promise(resolve => fixtureDiscover({type: 'PPT_GET_MEDIA'}, {}, resolve))");
    fs.writeFileSync(path.join(output, `producer-${transport}-${Date.now()}.json`), JSON.stringify({reply, final, calls}, null, 2));
    return final;
  } finally { if (session) await session.detach(); await producer.close(); }
}
async function discoverReply(base, reply, {storageFirst = false} = {}) {
  await page.evaluate(async ({base, reply, storageFirst}) => {
    batchPage = base;
    chrome.permissions = {contains: async () => true, request: async () => true};
    chrome.scripting = {executeScript: async () => []};
    chrome.tabs = {query: async () => [{id: 42, url: base, title: '资源管理平台'}], sendMessage: async () => reply};
    chrome.storage = {...chrome.storage, session: {get: async key => storageFirst ? {[key]: {page: base, course: reply.course,
      items: reply.urls.map(url => ({...PPTCore.mediaInfo(url), source: 'synthetic observed', seen: 1}))}} : {}}};
    await discover();
  }, {base, reply, storageFirst});
  await page.waitForFunction(() => !$('sources').disabled && !$('preflight-status').textContent.includes('正在检测') && !$('preflight-status').textContent.includes('等待检测'));
}
async function selectedLoad(url) {
  await page.locator('#tab-source').click(); await page.locator('#sources').selectOption(url); await page.locator('#load').click();
  await page.waitForFunction(url => sourceReady && !busy() && activeLesson?.source?.url === url, url);
  await settled();
}
async function test(name, body) {
  if (process.env.PPT_TEST_FILTER && !new RegExp(process.env.PPT_TEST_FILTER).test(name)) return;
  await body(); passed.push(name); console.log('PASS ' + name);
}
// Only seek/decode is synthetic: production scan(), save(), encoding and IDB commits remain real.
async function boundedScanner(duration = 694) {
  await page.evaluate(async duration => {
    Object.defineProperty(video, 'duration', {configurable: true, value: duration});
    if (activeLesson?.source) await bindLesson({...activeLesson.source, duration: video.duration});
    window.longProbe = {seeks: [], commits: [], maximumSignatures: 0, maximumSignatureBytes: 0, estimates: []};
    const seek = PPTScanner.prototype.seek, add = PPTPageStore.add, cache = cacheSignature;
    PPTScanner.prototype.seek = async function(time, signal) {
      if (!sourceReady) return seek.call(this, time, signal); // Loading still proves real native video readiness.
      signal?.throwIfAborted(); longProbe.seeks.push(time);
      const index = Math.floor(time / .5), canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = index % 2 ? '#ffffff' : '#000000'; ctx.fillRect(0, 0, 32, 18);
      ctx.fillStyle = '#9e2437'; ctx.fillText(String(index), 0, 12);
      return {canvas, sig: new Uint8ClampedArray(192 * 108 * 4).fill(index % 2 ? 255 : 0), sourceTime: time, signatureCrop: {...crop}};
    };
    PPTPageStore.add = async (...args) => { const id = await add(...args); longProbe.commits.push({id, scanId: args[1].scanId, time: args[1].sourceTime}); return id; };
    cacheSignature = (...args) => {
      cache(...args); longProbe.maximumSignatures = Math.max(longProbe.maximumSignatures, args[0]?.signatures.size || 0);
      longProbe.maximumSignatureBytes = Math.max(longProbe.maximumSignatureBytes, [...(args[0]?.signatures.values() || [])].reduce((sum, sig) => sum + (sig?.byteLength || 0), 0));
    };
    window.restoreBoundedScanner = () => { PPTScanner.prototype.seek = seek; PPTPageStore.add = add; cacheSignature = cache; delete video.duration; };
    $('mode').value = '0.5'; $('dedupe').checked = false;
  }, duration);
}
async function scanEvidence() {
  return page.evaluate(async () => {
    const tx = db.transaction(['pages', 'assets', 'settings']), rows = tx.objectStore('pages').getAll(), assets = tx.objectStore('assets').count(), saved = tx.objectStore('settings').get('lesson:' + activeLesson.id);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
    const times = rows.result.map(row => row.sourceTime);
    return {pages: rows.result.length, assets: assets.result, task: saved.result.task, first: Math.min(...times), last: Math.max(...times),
      duplicateScanTimes: rows.result.length - new Set(rows.result.map(row => `${row.scanId}:${row.sourceTime}`)).size,
      probe: structuredClone(longProbe), status: $('status').textContent, canResume: canResume()};
  });
}
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
    const scaled = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', fixture, '-vf', 'scale=320:180', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', resized], {encoding: 'utf8'});
    assert.equal(scaled.status, 0, scaled.stderr || scaled.error?.message);
    const animated = spawnSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=2:size=640x360:rate=20', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', moving], {encoding: 'utf8'});
    assert.equal(animated.status, 0, animated.stderr || animated.error?.message);
    const stationary = spawnSync(ffmpeg, ['-y', '-v', 'error', ...['0x24354a:d=10', '0x9e2437:d=2'].flatMap(color => ['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=20`]),
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', continuity], {encoding: 'utf8'});
    assert.equal(stationary.status, 0, stationary.stderr || stationary.error?.message);
    fs.utimesSync(fixture, 1793808000, 1793808000);
    const stat = fs.statSync(fixture); fileKey = 'file:' + JSON.stringify([path.basename(fixture), stat.size, stat.mtimeMs]);
    const wrong = path.join(output, 'other', path.basename(fixture)); fs.mkdirSync(path.dirname(wrong));
    fs.writeFileSync(wrong, Buffer.concat([fs.readFileSync(fixture), Buffer.from([0, 0, 0, 8]), Buffer.from('free')])); // Valid extra box: different size, identical filename.
    images = await Promise.all(['#24354a', '#9e2437', '#596779'].map(async color => 'data:image/jpeg;base64,' +
      (await sharp({create: {width: 640, height: 360, channels: 3, background: color}}).jpeg({quality: 95}).toBuffer()).toString('base64')));
    server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/fixture.html') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<!doctype html><title>Isolated library fixture</title>'); return; }
      if (pathname.startsWith('/media-transport/')) {
        const kind = pathname.split('/').pop();
        if (kind === 'header-stall') return;
        if (kind === '403') { res.writeHead(403); res.end('denied'); return; }
        if (kind === 'html') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<html>login</html>'); return; }
        if (kind === 'body-stall') { res.writeHead(200, {'Content-Type': 'video/mp4'}); res.flushHeaders(); res.write('A'); return; }
        if (kind === 'range-bad' || kind === 'range-ok') { res.writeHead(206, {'Content-Range': kind === 'range-ok' ? 'bytes 0-1/2' : 'bytes 1-2/3'}); res.end('AB'); return; }
        if (kind === 'encoded') { const zipped = gzipSync('AB'); res.writeHead(200, {'Content-Encoding': 'gzip', 'Content-Length': zipped.length}); res.end(zipped); return; }
        if (kind === 'interrupted') { res.writeHead(200, {'Content-Length': 100, Connection: 'close'}); res.write('A'); res.socket.destroy(); return; }
        res.writeHead(200); res.end(); return;
      }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (error, bytes) => {
        if (error) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {'Content-Type': {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png'}[path.extname(file)] || 'application/octet-stream'}); res.end(bytes);
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({...browserOptions(), downloadsPath: output, args: ['--mute-audio', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', '--no-proxy-server']});
    fs.writeFileSync(path.join(output, 'environment.json'), JSON.stringify({node: process.version, platform: process.platform, arch: process.arch,
      playwright: dependency('playwright/package.json').version, browser: browser.version(), executablePath: process.env.PPT_TEST_BROWSER || 'runtime default'}, null, 2));
    context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(blob|data):/.test(url) || new URL(url).origin === origin) return route.continue();
      blocked.push(url); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await open();


    await test('media native fixed AAC configuration differential and conservative controls', async () => {
      const media = {}, log = [];
      const run = (name, args) => {
        const result = spawnSync(ffmpeg, ['-y', '-v', 'error', ...args], {encoding: 'utf8'});
        log.push({command: [ffmpeg, '-y', '-v', 'error', ...args], stdout: result.stdout, stderr: result.stderr, exit: result.status});
        fs.writeFileSync(path.join(output, 'media-ffmpeg.json'), JSON.stringify(log, null, 2));
        assert.equal(result.status, 0, result.stderr || result.error?.message);
      };
      media.av = path.join(output, 'media-av.mp4');
      run('av', [...['0x24354a:d=3', '0x9e2437:d=2', '0x596779:d=3'].flatMap(color => ['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=20`]),
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=7.9', '-filter_complex',
        '[0:v]drawbox=x=20:y=20:w=50:h=30:color=white:t=fill[a];[1:v]drawbox=x=20:y=20:w=100:h=30:color=white:t=fill[b];[2:v]drawbox=x=20:y=20:w=150:h=30:color=white:t=fill[c];[a][b][c]concat=n=3:v=1:a=0[v]',
        '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '20', '-bf', '0', '-c:a', 'aac', '-af', 'asetpts=PTS+1024/SR/TB', '-t', '8', '-use_editlist', '0', '-movflags', '+faststart', media.av]);
      const ungroup = file => {
        const bytes = fs.readFileSync(file);
        function walk(start, end) {
          for (let at = start; at < end;) {
            const size = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8);
            assert(size >= 8 && at + size <= end, 'fixture uses ordinary bounded boxes');
            if (type === 'tkhd') { assert.equal(bytes[at + 8], 0); bytes.writeUInt16BE(0, at + 8 + 34); }
            if (type === 'sgpd' || type === 'sbgp') bytes.write('free', at + 4);
            if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(at + 8, at + size);
            at += size;
          }
        }
        // Remove only explicit grouping metadata in this synthetic control, without altering samples or offsets.
        walk(0, bytes.length);
        fs.writeFileSync(file, bytes);
      };
      // FFmpeg marks its single audio track as alternate_group=1. Our control deliberately has no grouping.
      // This changes no sample data and does not broaden the parser's conservative group rejection.
      media.raw = path.join(output, 'media-raw-ffmpeg.mp4'); fs.copyFileSync(media.av, media.raw); ungroup(media.av);
      for (const [name, args] of [['video', ['-an', '-movflags', '+faststart']], ['tail', []], ['fragmented', ['-movflags', '+frag_keyframe+empty_moov']]]) {
        media[name] = path.join(output, `media-${name}.mp4`); run(name, ['-i', media.av, '-c', 'copy', '-use_editlist', '0', ...args, media[name]]); ungroup(media[name]);
      }
      const bytes = fs.readFileSync(media.av), badAudio = Buffer.from(bytes);
      const esds = badAudio.indexOf(Buffer.from('esds')), config = badAudio.indexOf(Buffer.from([5, 128, 128, 128, 5]), esds);
      assert(esds > 0 && config > esds && config < esds + 100, 'fixed FFmpeg AAC descriptor layout');
      Buffer.from([0x17, 0x80, 0, 0, 0]).copy(badAudio, config + 5); // AAC LC, explicit zero sampling frequency; box sizes unchanged.
      media.badAudio = path.join(output, 'media-bad-aac.mp4'); fs.writeFileSync(media.badAudio, badAudio);
      const badVideo = Buffer.from(bytes), avcC = badVideo.indexOf(Buffer.from('avcC'));
      assert(avcC > 0); badVideo.fill(0, avcC + 4, avcC + badVideo.readUInt32BE(avcC - 4) - 4);
      media.badVideo = path.join(output, 'media-bad-video.mp4'); fs.writeFileSync(media.badVideo, badVideo);
      const withoutIndex = Buffer.from(bytes); const moov = withoutIndex.indexOf(Buffer.from('moov'));
      withoutIndex.write('free', moov); media.missing = path.join(output, 'media-missing-moov.mp4'); fs.writeFileSync(media.missing, withoutIndex);
      const probe = await context.newPage();
      const results = {fixtureHashes: Object.fromEntries(Object.entries(media).map(([name, file]) => [name, require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
      try {
        await probe.goto(origin + '/fixture.html');
        for (const name of ['media.js', 'scanner.js', 'mp4-recovery.js']) await probe.addScriptTag({url: origin + '/' + name});
        const decode = (file, prepare = false) => probe.evaluate(async ({url, prepare}) => {
          const original = await (await fetch(url)).blob(), v = document.createElement('video'); v.muted = true; v.preload = 'auto'; document.body.append(v);
          let objectURL, timer, listeners = [], inspection, mode = 'original';
          const result = {nativeFailed: false, decoded: false, reachedEnd: false, slidePixels: [], sourceTimes: []};
          try {
            let blob = original;
            if (prepare) {
               const prepared = await PPTMP4.prepare(original); ({inspection, mode} = prepared); blob = prepared.blob;
               if (mode === 'audio-omitted') {
                 const before = new Uint8Array(await original.arrayBuffer()), after = new Uint8Array(await blob.arrayBuffer());
                 const text = new TextDecoder('latin1').decode(before), audioTypeOffset = text.lastIndexOf('trak', text.indexOf('soun'));
                 result.changedOffsets = [...before.keys()].filter(i => before[i] !== after[i]); result.audioTypeOffset = audioTypeOffset;
                 if (before.length !== after.length || result.changedOffsets.some(i => i < audioTypeOffset || i >= audioTypeOffset + 4)) throw Error('rewrite altered non-audio-type bytes');
               }
             }
            Object.assign(result, {mode, inspection}); if (!blob) return result;
            await new Promise((resolve, reject) => {
              const done = () => resolve(), fail = () => reject(PPTCore.mediaError(v.error));
              listeners = [['loadeddata', done], ['error', fail]]; listeners.forEach(([type, fn]) => v.addEventListener(type, fn, {once: true}));
              timer = setTimeout(() => reject(Error('native probe timeout')), 5000);
              objectURL = URL.createObjectURL(blob); v.src = objectURL;
            }).finally(() => { clearTimeout(timer); listeners.forEach(([type, fn]) => v.removeEventListener(type, fn)); listeners = []; });
            const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
            const scanner = new PPTScanner(v, time => { canvas.getContext('2d').drawImage(v, 320, 180, 1, 1, 0, 0, 1, 1); return {pixel: [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data], time, nativeTime: v.currentTime}; });
            for (const time of [.1, 4, 7.9]) { const frame = await scanner.seek(time, new AbortController().signal); result.slidePixels.push(frame.pixel); result.sourceTimes.push([frame.time, frame.nativeTime]); }
            result.decoded = v.videoWidth > 0 && result.slidePixels.every(pixel => pixel[3] === 255); result.reachedEnd = Math.abs(v.currentTime - 7.9) < .05; result.duration = v.duration;
          } catch (error) { result.nativeFailed = true; result.error = {message: error.message, nativeCode: v.error?.code || null}; }
          finally { clearTimeout(timer); listeners.forEach(([type, fn]) => v.removeEventListener(type, fn)); v.pause(); v.removeAttribute('src'); v.load(); v.remove(); if (objectURL) URL.revokeObjectURL(objectURL); }
          return result;
        }, {url: origin + '/' + path.relative(root, file).split(path.sep).join('/'), prepare});
        results.cleanControl = await decode(media.av); assert.equal(results.cleanControl.decoded, true);
        // Establish the original result before asking the parser to prepare the SAME deterministic bad AAC bytes.
        results.originalBadAudio = await decode(media.badAudio);
        results.preparedBadAudio = await decode(media.badAudio, true);
        results.differential = results.originalBadAudio.nativeFailed && results.preparedBadAudio.mode === 'audio-omitted' && results.preparedBadAudio.decoded;
        results.gap = results.preparedBadAudio.mode !== 'audio-omitted' ? 'parser-profile-passthrough' : !results.originalBadAudio.nativeFailed ? 'browser-tolerates-damaged-audio' : null;
        assert.equal(results.preparedBadAudio.decoded, true);
        assert.deepEqual(results.preparedBadAudio.slidePixels, results.cleanControl.slidePixels);
        assert.deepEqual(results.preparedBadAudio.sourceTimes, results.cleanControl.sourceTimes);
        assert.equal(results.preparedBadAudio.reachedEnd, true);
        if (results.differential) assert.equal(results.originalBadAudio.nativeFailed, true);
        for (const name of ['raw', 'av', 'video', 'tail', 'fragmented', 'missing', 'badVideo']) results[name] = await decode(media[name], true);
        assert.equal(results.raw.mode, 'original');
        assert.equal(results.av.mode, 'audio-omitted'); assert.equal(results.tail.mode, 'audio-omitted');
        assert.equal(results.preparedBadAudio.mode, 'audio-omitted'); assert.equal(results.preparedBadAudio.changedOffsets.length, 3);
        assert.equal(results.video.mode, 'original'); assert.equal(results.fragmented.mode, 'original');
        assert.equal(results.missing.mode, 'reject'); assert.equal(results.badVideo.mode, 'original'); assert.equal(results.badVideo.decoded, false, 'invalid AVC is never reported as recovered');
        for (const name of ['raw', 'av', 'video', 'tail', 'fragmented']) assert.equal(results[name].decoded, true, name);
        for (const [pixel, expected] of results.cleanControl.slidePixels.map((pixel, i) => [pixel, [[36, 53, 74], [158, 36, 55], [89, 103, 121]][i]])) {
          expected.forEach((value, i) => assert(Math.abs(value - pixel[i]) <= 4)); assert.equal(pixel[3], 255);
        }
      } finally { fs.writeFileSync(path.join(output, 'media-native.json'), JSON.stringify(results, null, 2)); await probe.close(); }
      console.log('Native media result:', results.differential ? 'original muted failure → prepared pixels/times recovered' : 'EXPLICIT GAP: ' + results.gap);
    });

    await test('media prepared load preserves original file identity, settings, lesson and screenshots', async () => {
      await seed();
      assert.equal(await page.locator('#video-only').isChecked(), true);
      const source = path.join(output, 'media-av.mp4');
      // This group also runs independently of the native-only filter.
      if (!fs.existsSync(source)) {
        const result = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', fixture, '-f', 'lavfi', '-i', 'sine=duration=5.8', '-c:v', 'copy', '-c:a', 'aac', '-use_editlist', '0', '-shortest', source], {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        const bytes = fs.readFileSync(source); let at = 0;
        while ((at = bytes.indexOf(Buffer.from('tkhd'), at)) >= 0) { bytes.writeUInt16BE(0, at + 4 + 34); at += 4; }
        fs.writeFileSync(source, bytes);
      }
      await load(source); await settled();
      const before = await stored(), stat = fs.statSync(source), originalKey = 'file:' + JSON.stringify([path.basename(source), stat.size, Math.trunc(stat.mtimeMs)]);
      assert.equal(before.lessons[0].source.sourceKey, originalKey);
      assert.equal(await page.evaluate(() => mediaContext.audioOmitted), true);
      await page.locator('#shot').click(); await count(1); const saved = await stored();
      await page.locator('#release-cache').click(); await idle(); await load(source); await settled();
      assert.equal((await stored()).activeId, before.activeId); assert.deepEqual((await stored()).assets, saved.assets);
      await page.locator('#video-only').uncheck(); await page.evaluate(async () => { await mediaRecoverySave; }); await page.reload(); await idle();
      assert.equal(await page.locator('#video-only').isChecked(), false); await load(source);
      assert.equal(await page.evaluate(() => mediaContext.audioOmitted), false); assert.equal((await stored()).activeId, before.activeId);
    });

    await test('media loopback transport statuses, body hangs, cancellation and encoded lengths clean caches', async () => {
      await seed({lessons: [lesson('transport-old')], pages: [{lessonId: 'transport-old', sourceKey: fileKey, image: 1}]});
      const before = await stored();
      const results = await page.evaluate(async origin => {
        const results = [];
        for (const [kind, cancel] of [['403'], ['html'], ['empty'], ['range-bad'], ['range-ok'], ['encoded'], ['interrupted'], ['header-stall'], ['body-stall'], ['header-stall', true], ['body-stall', true]]) {
          const controller = new AbortController(); let timer;
          if (cancel) timer = setTimeout(() => controller.abort(), 10);
          try { const file = await fetchVideo(origin + '/media-transport/' + kind, controller.signal, {timeoutMs: 80}); results.push({kind, size: file.size}); }
          catch (error) { results.push({kind, cancel: !!cancel, code: error.code, name: error.name, phase: error.phase}); }
          finally { clearTimeout(timer); await releaseSource(); }
          if (videoCache || objectURL || sourceReady || video.getAttribute('src')) throw Error('transport leaked its owner');
        }
        return results;
      }, origin);
      assert.deepEqual(results.slice(0, 4).map(result => result.code), ['HTTP_STATUS', 'NOT_VIDEO', 'EMPTY_MEDIA', 'INCOMPLETE_RESPONSE']);
      assert.deepEqual(results.slice(4, 6).map(result => result.size), [2, 2]);
      assert.equal(results[6].code, 'FETCH_FAILED');
      assert.deepEqual(results.slice(7, 9).map(result => result.code), ['MEDIA_TIMEOUT', 'MEDIA_TIMEOUT']);
      assert.ok(results.slice(9).every(result => result.name === 'AbortError'));
      assert.deepEqual(await stored(), before);
      fs.writeFileSync(path.join(output, 'media-transport.json'), JSON.stringify(results, null, 2));
    });

    await test('media late prepare and loadeddata cancellation cannot bind or remove prior screenshots', async () => {
      await seed({lessons: [lesson('media-old')], pages: [{lessonId: 'media-old', sourceKey: fileKey}]});
      const before = await stored();
      for (const late of ['prepare', 'loadeddata']) {
        await page.evaluate(late => {
          window.oldPrepare = PPTMP4.prepare; window.oldAwaitVideo = awaitVideo;
          window.mediaEntered = false;
          const delay = () => new Promise(resolve => { window.mediaEntered = true; window.mediaRelease = resolve; });
          if (late === 'prepare') PPTMP4.prepare = async () => { await delay(); return {mode: 'original', blob: new Blob(['late'])}; };
          else awaitVideo = async () => { await delay(); };
        }, late);
        await page.locator('#file').setInputFiles(fixture); await page.waitForFunction(() => window.mediaEntered);
        await page.locator('#stop').click(); await page.evaluate(() => mediaRelease()); await idle();
        assert.equal(await page.evaluate(() => sourceReady), false); assert.equal(await page.evaluate(() => objectURL), null);
        assert.deepEqual(await stored(), before);
        await page.evaluate(() => { PPTMP4.prepare = oldPrepare; awaitVideo = oldAwaitVideo; delete window.mediaRelease; });
      }
    });


    await test('media remote preparation owns cache URLs and rejects local failures without rebinding', async () => {
      await seed({lessons: [lesson('media-keep')], pages: [{lessonId: 'media-keep', sourceKey: fileKey}]});
      const before = await stored();
      const source = path.join(output, 'media-av.mp4'); assert(fs.existsSync(source), 'native fixture group precedes remote acceptance');
      const url = origin + '/' + path.relative(root, source).split(path.sep).join('/');
      await page.evaluate(() => {
        chrome.permissions = {contains: async () => true, request: async () => true};
        window.mediaResources = {created: [], revoked: [], removed: []};
        const create = PPTDiskCache.create, createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
        URL.createObjectURL = blob => { const url = createURL(blob); mediaResources.created.push(url); return url; };
        URL.revokeObjectURL = url => { mediaResources.revoked.push({url, detached: !video.getAttribute('src')}); revokeURL(url); };
        PPTDiskCache.create = async kind => { const cache = await create(kind), remove = cache.remove; if (kind === 'video') cache.remove = async () => { mediaResources.removed.push({detached: !video.getAttribute('src'), revoked: mediaResources.revoked.some(item => item.url === mediaResources.owner)}); await remove(); }; return cache; };
        window.restoreMediaResources = () => { PPTDiskCache.create = create; URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; };
      });
      try {
        assert.equal(await page.evaluate(url => loadRemote(url, {permissionGranted: true}), url), true);
        assert.equal(await page.evaluate(() => mediaContext.audioOmitted), true);
        const remote = await page.evaluate(() => { mediaResources.owner = objectURL; return {key: activeLesson.source.sourceKey, url: activeLesson.source.url, id: activeLesson.id, context: mediaContext}; });
        assert.equal(remote.key, 'url:' + url); assert.equal(remote.url, url);
        const samples = await page.evaluate(async () => {
          const result = []; for (const time of [.1, 4, 7.9]) { const f = await new PPTScanner(video, frame, mediaContext).seek(time, new AbortController().signal); result.push({sourceTime: f.sourceTime, nativeTime: video.currentTime}); } return result;
        });
        assert.deepEqual(samples, [.1, 4, 7.9].map(time => ({sourceTime: time, nativeTime: time})));
        await page.evaluate(() => releaseSource()); await idle();
        const resources = await page.evaluate(() => mediaResources);
        assert.equal(resources.created.filter(url => url === resources.owner).length, 1); assert.deepEqual(resources.revoked.filter(item => item.url === resources.owner), [{url: resources.owner, detached: true}]);
        assert.deepEqual(resources.removed, [{detached: true, revoked: true}]);
        assert.equal(await page.evaluate(() => videoCache), null);
        assert.deepEqual((await stored()).assets, before.assets); assert.equal((await stored()).pages.length, 1);
        // A local read rejection has no native retry, does not lose stored pages, and is not missing-index.
        await page.evaluate(() => { window.savedMediaPrepare = PPTMP4.prepare; PPTMP4.prepare = async () => { throw Object.assign(Error('controlled disk failure'), {code: 'LOCAL_READ_FAILED', phase: 'local-read'}); }; });
        const saved = await stored();
        await page.locator('#file').setInputFiles(source); await page.waitForFunction(() => !busy());
        assert.equal(await page.evaluate(() => sourceReady), false); assert.equal(await page.evaluate(() => objectURL), null);
        assert.deepEqual(await stored(), saved); assert.doesNotMatch(await page.locator('#status').textContent(), /刷新|moov|索引/);
        await page.evaluate(() => { PPTMP4.prepare = savedMediaPrepare; });
      } finally { await page.evaluate(() => { if (window.savedMediaPrepare) PPTMP4.prepare = savedMediaPrepare; restoreMediaResources(); }); }
    });

    await test('media invalid video initialization never binds while valid black frames remain usable', async () => {
      await seed({lessons: [lesson('media-video-keep')], pages: [{lessonId: 'media-video-keep', sourceKey: fileKey}]});
      const before = await stored();
      await page.locator('#video-only').uncheck(); await page.evaluate(() => mediaRecoverySave);
      await page.locator('#file').setInputFiles(path.join(output, 'media-bad-video.mp4')); await page.waitForFunction(() => !busy());
      assert.equal(await page.evaluate(() => sourceReady), false); assert.equal(await page.evaluate(() => objectURL), null);
      assert.deepEqual(await stored(), before); assert.match(await page.locator('#status').textContent(), /视频画面|格式|解码/);
      const black = path.join(output, 'media-black.mp4');
      const blackArgs = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=20:d=1', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', black];
      const generated = spawnSync(ffmpeg, blackArgs, {encoding: 'utf8'});
      fs.writeFileSync(path.join(output, 'media-black-ffmpeg.json'), JSON.stringify({command: [ffmpeg, ...blackArgs], stdout: generated.stdout, stderr: generated.stderr, exit: generated.status}, null, 2));
      assert.equal(generated.status, 0, generated.stderr); await load(black);
      assert.equal(await page.evaluate(() => sourceReady && video.videoWidth === 640 && video.videoHeight === 360), true);
    });

    await test('binding cancellation holds native IDB before commit for new and same local and remote sources', async () => {
      const evidence = [], url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      for (const kind of ['file', 'remote']) for (const existing of [false, true]) for (const outcome of ['pre-aborted', 'stop', 'failure', 'commit-stop', 'success']) {
        const sourceKey = kind === 'file' ? fileKey : 'url:' + url;
        const prior = lesson('binding-old', {source: {kind, sourceKey: existing ? sourceKey : 'file:prior', sourceName: 'prior.mp4', ...(kind === 'remote' ? {url} : {})},
          task: {id: 'paused', state: 'paused', checkpoint: .5}, suspects: [{start: .2, end: .3}], ignoreRect: {x: .1, y: .1, w: .1, h: .1}});
        await seed({lessons: [prior, lesson('binding-unrelated', {source: {kind: 'file', sourceKey: 'file:unrelated', sourceName: 'unrelated.mp4'}})], pages: [{id: 101, lessonId: prior.id}, {id: 102, lessonId: prior.id}, {id: 103, lessonId: 'binding-unrelated'}]});
        await page.evaluate(async () => { await deletePages([102]); selectedPages.add(101); selectionAnchor = 101; controls(); }); await settled();
        const before = await stored();
        const memory = await page.evaluate(outcome => {
          const originalBind = PPTLibrary.bind, originalTransaction = db.transaction;
          const snapshot = () => structuredClone({lessons, active: activeLesson, pages, allPages, undo: undoState, selected: [...selectedPages], anchor: selectionAnchor});
          window.bindingMemory = snapshot;
          window.bindingRefs = {lesson: activeLesson, list: lessons, pages, allPages, undo: undoState};
          const probe = window.bindingProbe = {entered: false, intercept: false, release: false, fail: false, reads: 0, events: [], timedOut: false, transactions: 0};
          PPTLibrary.bind = (...args) => { probe.intercept = true; try { return originalBind(...args); } finally { probe.intercept = false; } };
          db.transaction = function(...args) {
            const tx = originalTransaction.apply(this, args);
            if (probe.intercept) {
              probe.transactions++; probe.tx = tx; probe.entered = true;
              const terminal = name => { probe.events.push(name); probe.error = tx.error?.name; clearTimeout(probe.watchdog); probe.watchdog = null; };
              tx.addEventListener('abort', () => terminal('abort'), {once: true});
              tx.addEventListener('complete', () => { terminal('complete'); if (outcome === 'commit-stop') $('stop').click(); }, {once: true});
              probe.watchdog = setTimeout(() => { probe.timedOut = true; try { tx.abort(); } catch {} }, 5000);
              const settings = tx.objectStore('settings');
              // Every keepalive is a real IDB request. No transaction has committed while this loop holds it.
              const hold = () => {
                const request = settings.get('activeLesson');
                request.onsuccess = () => {
                  probe.reads++;
                  if (probe.fail) { settings.add('duplicate', 'activeLesson'); return; }
                  if (!probe.release) hold();
                };
              };
              hold();
            }
            return tx;
          };
          window.restoreBindingProbe = () => {
            probe.release = true; clearTimeout(probe.watchdog);
            if (probe.tx && !probe.events.length) try { probe.tx.abort(); } catch {}
            PPTLibrary.bind = originalBind; db.transaction = originalTransaction;
          };
          return snapshot();
        }, outcome);
        try {
          if (outcome === 'pre-aborted') {
            const result = await page.evaluate(async ({kind, sourceKey, url}) => {
              const controller = new AbortController(); controller.abort();
              try { await bindLesson({kind, sourceKey, sourceName: 'changed.mp4', ...(kind === 'remote' ? {url} : {})}, {}, controller.signal); return 'resolved'; }
              catch (error) { return error.name; }
            }, {kind, sourceKey, url});
            assert.equal(result, 'AbortError');
          } else {
            if (kind === 'file') await page.locator('#file').setInputFiles(fixture);
            else await page.evaluate(url => { window.bindingLoad = loadRemote(url, {permissionGranted: true}); }, url);
            await page.waitForFunction(() => bindingProbe.entered && bindingProbe.reads > 0);
            assert.deepEqual(await page.evaluate(() => bindingProbe.events), [], 'native transaction is held BEFORE commit');
            if (outcome === 'stop') await page.locator('#stop').click();
            else await page.evaluate(outcome => { bindingProbe.fail = outcome === 'failure'; bindingProbe.release = true; }, outcome);
            await idle(); if (kind === 'remote') await page.evaluate(() => bindingLoad);
          }
          const after = await stored(), probe = await page.evaluate(() => ({reads: bindingProbe.reads, events: bindingProbe.events,
            error: bindingProbe.error, timedOut: bindingProbe.timedOut, transactions: bindingProbe.transactions, sourceReady, objectURL,
            references: activeLesson === bindingRefs.lesson && lessons === bindingRefs.list && pages === bindingRefs.pages && allPages === bindingRefs.allPages && undoState === bindingRefs.undo}));
          evidence.push({kind, existing, outcome, ...probe, activeId: after.activeId, retained: after.lessons.map(item => item.id)});
          fs.writeFileSync(path.join(output, 'binding-cancellation.json'), JSON.stringify(evidence, null, 2));
          assert.equal(probe.timedOut, false);
          if (['pre-aborted', 'stop', 'failure'].includes(outcome)) {
            assert.deepEqual(after, before, `${kind}/${existing}/${outcome} retains settings and every image byte`);
            assert.deepEqual(await page.evaluate(() => bindingMemory()), memory); assert.equal(probe.references, true);
            assert.equal(probe.sourceReady, false); assert.equal(probe.objectURL, null);
            assert.deepEqual(probe.events, outcome === 'pre-aborted' ? [] : ['abort']);
            if (outcome === 'failure') assert.equal(probe.error, 'ConstraintError');
          } else {
            assert.deepEqual(probe.events, ['complete']); assert.equal(probe.transactions, 1);
            const active = await page.evaluate(() => structuredClone(activeLesson));
            assert.deepEqual(active, after.lessons.find(lesson => lesson.id === after.activeId));
            assert.equal(active.source.sourceKey, sourceKey); assert.equal(after.lessons.length, existing ? 2 : 3);
            assert.equal(existing ? active.id === prior.id : active.id !== prior.id, true);
            assert.deepEqual(after.pages, before.pages); assert.deepEqual(after.assets, before.assets.filter(asset => asset.id !== 102));
            assert.equal(probe.sourceReady, outcome === 'success');
            if (outcome === 'commit-stop') { assert.equal(probe.objectURL, null); assert.notEqual(active.task?.state, 'done'); }
          }
          await page.evaluate(() => restoreBindingProbe());
          await page.reload(); await idle();
          const reloaded = await stored();
          assert.deepEqual(reloaded.lessons, after.lessons); assert.equal(reloaded.activeId, after.activeId); assert.deepEqual(reloaded.pages, after.pages);
          assert.deepEqual(reloaded.assets.filter(asset => asset.id !== 102), after.assets.filter(asset => asset.id !== 102), 'reload preserves every retained page image; orphaned undo assets may be pruned');
        } finally { await page.evaluate(() => { if (window.restoreBindingProbe) { task?.abort(); restoreBindingProbe(); } }).catch(() => {}); }
      }
    });

    for (const transport of ['fetch', 'xhr']) await test(`acquisition boundary course opening stays absent through ${transport}, selection, binding and reload`, async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a';
      const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/') + '?capture=a';
      await seed({naming: {course: {}, page: '', manual: false}});
      const reply = await producerReply({base, transport, payload: {data: {id: 42, courseName: 'A', capture_code: 'a', start_time: '2026-09-14 00:00'}},
        capture: {data: {capture_code: 'a', lesson_videos: [{download_url: url}]}}});
      assert.deepEqual(reply.course, {name: 'A'}, 'MAIN must not reintroduce the course opening date');
      await discoverReply(base, reply); await selectedLoad(url);
      const saved = (await stored()).lessons[0];
      assert.deepEqual(saved.course, {name: 'A'}); assert.equal(saved.source.url, url); assert.equal(saved.source.sourceKey, 'url:' + url);
      await page.reload(); await idle(); assert.deepEqual((await stored()).lessons[0], saved);
      assert.equal(await page.locator('#course-date').inputValue(), ''); assert.equal(await page.locator('#course-start').inputValue(), '');
    });

    await test('acquisition boundary matched recording endpoints, latest aliases and schedules retain their selected time', async () => {
      const directory = origin + '/study-capture-courses/42/preview-detail';
      const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/') + '?capture=a';
      const wanted = {name: 'A', date: '2026-09-15', start: '16:40:00'};
      for (const variant of ['capture', 'latest_capture', 'latestCapture', 'schedules']) {
        await seed({naming: {course: {}, page: '', manual: false}});
        const record = {capture_code: 'a', start_time: '2026-09-15T08:40:00Z', lesson_videos: [{download_url: url}]};
        const payload = {id: 42, courseName: 'A', latest_capture_code: 'a', start_time: '2026-09-14 00:00',
          ...(variant === 'schedules' ? {schedules: [record, {capture_code: 'b', start_time: '2026-09-16 09:00'}]} : variant === 'capture' ? {} : {[variant]: {data: record}})};
        const reply = await producerReply({base: directory, payload: {data: {data: payload}}, transport: 'xhr',
          capture: {data: variant === 'capture' ? record : {capture_code: 'a', lesson_videos: [{download_url: url}]}}});
        await discoverReply(directory, reply); await selectedLoad(url);
        assert.deepEqual((await stored()).lessons[0].course, wanted, variant);
        await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => namingInfo()), wanted);
        await page.evaluate(() => { chrome.permissions = {request: async () => true}; });
        await page.locator('#tab-source').click(); await page.locator('#resume-load').click();
        await page.waitForFunction(() => sourceReady && !busy());
        assert.deepEqual((await stored()).lessons[0].course, wanted, 'same-source reopen preserves valid metadata before discovery');
        if (variant === 'capture') {
          const id = (await stored()).lessons[0].id;
          await page.locator('#tab-source').click(); await page.getByText('手动视频地址', {exact: true}).click();
          await page.locator('#url').fill(url + '&token=renewed'); await page.locator('#load-url').click();
          await page.waitForFunction(() => sourceReady && !busy()); await settled();
          const renewed = (await stored()).lessons;
          assert.equal(renewed.length, 1); assert.equal(renewed[0].id, id);
          assert.deepEqual(renewed[0].course, wanted, 'canonical same-source identity retains metadata across signing renewal');
        }
      }
    });

    await test('acquisition selection directory maps A and B separately and leaves unmapped time absent after preflight and reload', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail';
      const videoURL = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const urls = {a: videoURL + '?capture=a', b: videoURL + '?capture=b', unmapped: videoURL + '?capture=unknown'};
      const expected = {a: {name: 'A', date: '2026-09-15', start: '16:40:00'}, b: {name: 'A', date: '2026-09-16', start: '09:00:00'}, unmapped: {name: 'A'}};
      for (const selected of ['a', 'b', 'unmapped']) {
        await seed({naming: {course: {}, page: '', manual: false}});
        const reply = await producerReply({base, payload: {data: {id: 42, courseName: 'A', latest_capture_code: 'b', schedules: [
          {capture_code: 'a', start_time: '2026-09-15 16:40', lesson_videos: [{download_url: urls.a}]},
          {capture_code: 'b', start_time: '2026-09-16 09:00', lesson_videos: [{download_url: urls.b}]}
        ]}}, capture: {capture_code: 'b', urls: [urls.b]}, extra: [urls.unmapped]});
        await discoverReply(base, reply, {storageFirst: selected === 'b'});
        const options = await page.locator('#sources option').evaluateAll(options => options.filter(option => !option.disabled).map(option => option.value));
        for (const url of Object.values(urls)) assert(options.includes(url), 'all usable candidates must remain selectable');
        await selectedLoad(urls[selected]); const saved = (await stored()).lessons[0];
        assert.deepEqual(saved.course, expected[selected], selected); assert.equal(saved.source.sourceKey, 'url:' + urls[selected]);
        await page.reload(); await idle(); assert.deepEqual((await stored()).lessons[0], saved); assert.deepEqual(await page.evaluate(() => namingInfo()), expected[selected]);
      }
    });

    await test('acquisition selection corrects only selected automatic history and preserves manual identities, crop, scans and assets', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail', other = base.replace('/42/', '/99/');
      const videoURL = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const urls = {a: videoURL + '?capture=a', b: videoURL + '?capture=b'};
      const stale = {name: 'A', date: '2026-09-14', start: '00:00:00'}, wanted = {name: 'A', date: '2026-09-15', start: '16:40:00'};
      const auto = lesson('selected-auto', {course: stale, page: base, namingManual: false, source: {kind: 'remote', page: base, url: urls.a, sourceKey: 'url:' + urls.a},
        crop: {x: .1, y: .1, w: .7, h: .7}, ignoreRect: {x: .2, y: .2, w: .1, h: .1}, task: {id: 'saved-scan', state: 'paused', checkpoint: 3}, suspects: [{start: 1, end: 2}]});
      const manual = lesson('selected-manual', {course: {...stale, name: '我的手动名称'}, page: base, source: {kind: 'remote', page: base, url: urls.b, sourceKey: 'url:' + urls.b}});
      const unrelated = lesson('selected-other-course', {page: other});
      for (const selected of ['a', 'b']) {
        await seed({lessons: [auto, manual, unrelated], pages: [{id: 401, lessonId: auto.id}, {id: 402, lessonId: manual.id}, {id: 403, lessonId: unrelated.id}]});
        const before = await stored();
        const reply = await producerReply({base, payload: {id: 42, courseName: 'A', latest_capture_code: 'b', schedules: [
          {capture_code: 'a', start_time: '2026-09-15 16:40', urls: [urls.a]}, {capture_code: 'b', start_time: '2026-09-16 09:00', urls: [urls.b]}
        ]}, capture: {capture_code: 'b', urls: [urls.b]}});
        await discoverReply(base, reply); await selectedLoad(urls[selected]); const after = await stored();
        assert.deepEqual(after.pages, before.pages); assert.deepEqual(after.assets, before.assets);
        assert.equal(after.lessons.length, before.lessons.length);
        const savedManual = after.lessons.find(item => item.id === manual.id), beforeManual = before.lessons.find(item => item.id === manual.id);
        assert.deepEqual({...savedManual, source: beforeManual.source}, beforeManual);
        assert.equal(savedManual.source.sourceKey, beforeManual.source.sourceKey); assert.equal(savedManual.source.url, urls.b);
        assert.deepEqual(after.lessons.find(item => item.id === unrelated.id), unrelated);
        const savedAuto = after.lessons.find(item => item.id === auto.id);
        assert.deepEqual(savedAuto.course, selected === 'a' ? wanted : stale); assert.equal(savedAuto.id, auto.id);
        for (const key of ['crop', 'ignoreRect', 'task', 'suspects', 'settings', 'created']) assert.deepEqual(savedAuto[key], auto[key], key);
        await page.reload(); await idle(); assert.deepEqual(await stored(), after);
      }
    });

    await test('acquisition selection late session-cache updates refresh exact candidate metadata before loading', async () => {
      await page.addInitScript(() => {
        window.fixtureStorageListeners = [];
        window.chrome = window.chrome || {};
        chrome.storage = {onChanged: {addListener: listener => fixtureStorageListeners.push(listener)}};
      });
      const base = origin + '/study-capture-courses/42/preview-detail';
      const videoURL = origin + '/' + path.relative(root, fixture).split(path.sep).join('/'), a = videoURL + '?capture=a', b = videoURL + '?capture=b';
      await seed({naming: {course: {}, page: '', manual: false}});
      const reply = await producerReply({base, payload: {id: 42, courseName: 'A', latest_capture_code: 'b', schedules: [
        {capture_code: 'a', start_time: '2026-09-15 16:40', urls: [a]}, {capture_code: 'b', start_time: '2026-09-16 09:00', urls: [b]}
      ]}, capture: {capture_code: 'b', urls: [b]}});
      await discoverReply(base, {...reply, candidates: []}, {storageFirst: true});
      await page.evaluate(async ({base, reply}) => {
        chrome.tabs.sendMessage = async () => reply;
        if (fixtureStorageListeners.length !== 1) throw Error('expected actual capture session-cache listener');
        await fixtureStorageListeners[0]({'media-42': {newValue: {page: base, course: reply.course,
          items: reply.urls.map(url => ({...PPTCore.mediaInfo(url), source: 'late synthetic observed', seen: 2}))}}}, 'session');
      }, {base, reply});
      await page.waitForFunction(() => !$('sources').disabled && !$('preflight-status').textContent.includes('正在检测') && !$('preflight-status').textContent.includes('等待检测'));
      await selectedLoad(a);
      assert.deepEqual((await stored()).lessons[0].course, {name: 'A', date: '2026-09-15', start: '16:40:00'});
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => namingInfo()), {name: 'A', date: '2026-09-15', start: '16:40:00'});
    });

    await test('recording metadata first remote bind persists detected time and protects same-source manual edits on reopen', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const detected = {name: 'A', date: '2026-09-15', start: '16:40:00'};
      await seed({naming: {course: {name: 'A', date: '2026-09-14', start: '00:00:00'}, page: base, manual: false}});
      assert.equal(await page.evaluate(async ({base, url, detected}) => {
        coursePage = base; chrome.permissions = {request: async () => true};
        acceptCourse(detected, base); acceptCandidates([{url, course: detected, courseId: '42', captureCode: 'a'}], base); await namingSave;
        return loadRemote(url, {permissionGranted: true});
      }, {base, url, detected}), true);
      await settled(); const first = (await stored()).lessons[0];
      assert.deepEqual(first.course, detected); assert.equal(first.namingManual, false);
      assert.deepEqual(await page.evaluate(() => namingInfo()), detected);
      assert.match(await page.locator('#current-course-context').textContent(), /A.*2026-09-15.*16:40/);
      await page.reload(); await idle();
      assert.deepEqual(await page.evaluate(() => namingInfo()), detected);
      assert.deepEqual((await stored()).lessons[0].course, detected);
      await page.evaluate(async () => { setNaming({name: 'A', date: '2026-09-14', start: '00:00:00'}, activeLesson.page); await persistLesson(); });
      await page.evaluate(({base, detected, url}) => { coursePage = base; acceptCandidates([{url, course: detected, courseId: '42', captureCode: 'a'}], base); acceptCourse(detected, base); }, {base, detected, url});
      await settled(); assert.deepEqual((await stored()).lessons[0].course, detected);
      assert.equal(await page.evaluate(() => sourceReady), false, 'refresh corrects automatic history without reloading video');
      await page.locator('#tab-export').click(); await page.locator('#course-name').fill('A 手工名称'); await settled();
      const manual = {...detected, name: 'A 手工名称'};
      assert.equal(await page.evaluate(async ({base, url}) => {
        coursePage = base; chrome.permissions = {request: async () => true};
        acceptCourse({name: '自动名称', date: '2026-09-16', start: '09:00:00'}, base); await namingSave;
        return loadRemote(url, {permissionGranted: true});
      }, {base, url}), true);
      await settled(); assert.deepEqual((await stored()).lessons[0].course, manual);
      assert.equal((await stored()).lessons[0].namingManual, true);
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => namingInfo()), manual);
    });

    await test('recording metadata batch binds job course over stale manual form and corrects automatic history only', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail', url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const detected = {name: 'A', date: '2026-09-15', start: '16:40:00'}, stale = {name: '旧手工课', date: '2026-09-14', start: '00:00:00'};
      await seed({naming: {course: stale, page: base, manual: true}});
      const job = {id: 'metadata-job', course: detected, url, sourceName: '2-recording.mp4', requiresCrop: false, selected: true, state: 'pending'};
      assert.equal(await page.evaluate(async ({base, job}) => {
        coursePage = batchPage = base; batchJobs = [job]; sourceCourse = {...job.course};
        acceptCandidates([{url: job.url, course: {name: '其他候选', date: '2026-09-16', start: '09:00:00'}, courseId: '42', captureCode: 'b'}], base);
        chrome.permissions = {request: async () => true};
        return loadRemote(job.url, {permissionGranted: true, batchJob: job, sourceName: job.sourceName});
      }, {base, job}), true);
      await settled(); const first = (await stored()).lessons[0];
      assert.deepEqual(first.course, detected); assert.equal(first.namingManual, false);
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => namingInfo()), detected);
      // Simulate a previously persisted automatic opening date, then reload the same actual source.
      await page.evaluate(async stale => { setNaming(stale, activeLesson.page); await persistLesson(); }, stale);
      assert.equal(await page.evaluate(async ({base, job}) => {
        coursePage = batchPage = base; batchJobs = [job]; sourceCourse = {...job.course};
        acceptCandidates([{url: job.url, course: {name: '其他候选', date: '2026-09-16', start: '09:00:00'}, courseId: '42', captureCode: 'b'}], base);
        chrome.permissions = {request: async () => true};
        return loadRemote(job.url, {permissionGranted: true, batchJob: job});
      }, {base, job}), true);
      await settled(); assert.deepEqual((await stored()).lessons[0].course, detected);
      await page.locator('#tab-export').click(); await page.locator('#course-name').fill('保留手工课次'); await settled();
      const manual = {...detected, name: '保留手工课次'};
      assert.equal(await page.evaluate(async ({base, job}) => {
        coursePage = base; chrome.permissions = {request: async () => true};
        return loadRemote(job.url, {permissionGranted: true, batchJob: {...job, course: {...job.course, date: '2026-09-16'}}});
      }, {base, job}), true);
      await settled(); assert.deepEqual((await stored()).lessons[0].course, manual);
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => namingInfo()), manual);
    });

    await test('recording metadata unknown times and course switches never inherit previous manual naming', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', other = base.replace('/42/', '/99/');
      const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const old = lesson('metadata-old', {course: {...course, name: 'A 手工'}, page: base, source: {kind: 'remote', url, page: base, sourceKey: 'url:' + url}});
      await seed({lessons: [old]});
      assert.equal(await page.evaluate(async ({other, url}) => {
        coursePage = other; acceptCourse({name: 'B'}, other); await namingSave;
        chrome.permissions = {request: async () => true};
        return loadRemote(url + '?course=B', {permissionGranted: true});
      }, {other, url}), true);
      await settled(); const snapshot = await stored(), current = snapshot.lessons.find(item => item.id === snapshot.activeId);
      assert.deepEqual(current.course, {name: 'B'}); assert.equal(current.namingManual, false);
      assert.deepEqual(await page.evaluate(() => namingInfo()), {name: 'B'});
      assert.deepEqual(snapshot.lessons.find(item => item.id === old.id), old);
      await page.reload(); await idle(); assert.deepEqual(await page.evaluate(() => namingInfo()), {name: 'B'});
      assert.equal(await page.locator('#course-date').inputValue(), ''); assert.equal(await page.locator('#course-start').inputValue(), '');
      // The recognized name updates selector text while the tab id remains its option value.
      await page.evaluate(({other}) => {
        $('course').replaceChildren(new Option('资源管理平台', '99')); coursePage = other;
        acceptCourse({name: 'B'}, other);
      }, {other}); await settled();
      assert.equal(await page.locator('#course').inputValue(), '99');
      assert.match(await page.locator('#course option:checked').textContent(), /B/);
    });

    await test('recording metadata directory refresh repairs automatic lessons only and explains zero single-source candidates', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail';
      const stale = {name: 'A', date: '2026-09-14', start: '00:00:00'}, detected = {name: 'A', date: '2026-09-15', start: '16:40:00'};
      const auto = lesson('metadata-refresh-auto', {course: stale, page: base, namingManual: false,
        source: {kind: 'remote', page: base, batchJobId: 'refresh-auto', url: origin + '/2-auto.mp4'},
        ignoreRect: {x: .1, y: .1, w: .2, h: .2}, task: {status: 'paused', lastSuccess: 2}, suspects: [{start: 1, end: 2}]});
      const manual = lesson('metadata-refresh-manual', {course: {...stale, name: '我的手动名称'}, page: base,
        source: {kind: 'remote', page: base, batchJobId: 'refresh-manual', url: origin + '/2-manual.mp4'}});
      const jobs = [auto, manual].map(item => ({id: item.source.batchJobId, course: detected, url: item.source.url,
        sourceName: '2-recording.mp4', selected: true, state: 'pending', discovery: {state: 'ready', attempts: 1}}));
      await seed({lessons: [auto, manual], batches: [{page: base, jobs}], pages: [{id: 71, lessonId: auto.id}, {id: 72, lessonId: manual.id}]});
      const before = await stored();
      await page.evaluate(async ({base, jobs}) => {
        coursePage = base; sources = []; $('course').replaceChildren(new Option('资源管理平台', '42'));
        acceptCourse({name: 'A'}, base);
        chrome.tabs = {sendMessage: async () => ({ok: true, page: base, jobs, total: 2, eligible: 2, complete: true, failures: []})};
        await discoverBatch(42);
      }, {base, jobs});
      await settled(); const after = await stored();
      assert.deepEqual(after.lessons.find(item => item.id === auto.id), {...auto, course: detected});
      assert.deepEqual(after.lessons.find(item => item.id === manual.id), manual);
      assert.deepEqual(after.pages, before.pages); assert.deepEqual(after.assets, before.assets);
      assert.match(await page.locator('#source-status').textContent(), /A.*批量目录 2 节.*候选 0 个/);
      assert.match(await page.locator('#ledger-source').textContent(), /A.*批量目录 2 节/);
      assert.doesNotMatch(await page.locator('#source-status').textContent(), /还没找到视频/);
      assert.equal(await page.locator('#course').inputValue(), '42');
      assert.equal(await page.locator('#course option:checked').textContent(), 'A');
      assert.equal(await page.evaluate(() => sourceReady || video.hasAttribute('src')), false);
      await page.reload(); await idle();
      assert.deepEqual((await stored()).lessons.find(item => item.id === auto.id).course, detected);
      assert.deepEqual((await stored()).lessons.find(item => item.id === manual.id), manual);
      const standalone = {...auto, id: 'metadata-unidentified', source: {...auto.source, batchJobId: ''}};
      await seed({lessons: [standalone]});
      await page.evaluate(({base, detected}) => { coursePage = base; acceptCourse(detected, base); }, {base, detected});
      await settled(); assert.deepEqual((await stored()).lessons[0], standalone, 'directory metadata cannot identify an older standalone recording');
    });

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

    await test('saved batch rows jump to retained pages and suspects without loading media and reset range anchors', async () => {
      const batchPage = 'https://example.invalid/course?courseId=synthetic', other = lesson('jump-other');
      const saved = lesson('jump-saved', {page: batchPage, source: {kind: 'remote', batchJobId: 'job-saved', page: batchPage, url: 'https://example.invalid/unloaded.mp4'}, suspects: [{start: 1, end: 2}]});
      const empty = lesson('jump-empty', {page: batchPage, source: {kind: 'remote', batchJobId: 'job-empty', page: batchPage}, suspects: [{start: 3, end: 4}]});
      const jobs = ['saved', 'empty', 'missing'].map(name => ({id: 'job-' + name, course, sourceName: name, url: 'https://example.invalid/unloaded.mp4', state: 'done', selected: false}));
      await seed({lessons: [other, saved, empty], activeId: other.id, batches: [{page: batchPage, jobs}], pages: [
        {id: 10, lessonId: other.id}, {id: 20, lessonId: saved.id}, {id: 30, lessonId: saved.id}, {id: 40, lessonId: saved.id},
      ]});
      await page.locator('#pages .page-select').click();
      await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      const view = name => page.locator(`[data-job-id="job-${name}"] .batch-view`);
      assert.equal(await view('missing').isDisabled(), true); assert.equal(await view('empty').isDisabled(), false);
      const before = await stored();
      await page.evaluate(() => { exportBusy = true; controls(); }); assert.equal(await view('saved').isDisabled(), true);
      await page.evaluate(() => { exportBusy = false; controls(); });
      await view('saved').click(); await count(3); assert.deepEqual(await ids(), [20, 30, 40]);
      assert.equal(await page.evaluate(() => activeLesson.id), saved.id);
      assert.equal(await page.locator('#suspects-panel').evaluate(panel => panel.open), true);
      assert.equal(await page.locator('#suspect-ranges .suspect-range').count(), 1);
      assert.deepEqual(await page.evaluate(() => ({sourceReady, src: video.getAttribute('src'), selected: [...selectedPages], selectionAnchor})), {sourceReady: false, src: null, selected: [], selectionAnchor: null});
      await page.locator('#pages .page-select').last().click({modifiers: ['Shift']});
      assert.deepEqual(await page.evaluate(() => [...selectedPages]), [40]);
      await view('empty').click(); await count(0); assert.equal(await page.locator('#suspect-ranges .suspect-range').count(), 1);
      assert.deepEqual((await stored()).pages, before.pages); assert.deepEqual((await stored()).assets, before.assets);
      assert.equal(await page.evaluate(() => sourceReady), false);
    });

    await test('saved zero-track batch exposes pending crop and manual preparation without loading media', async () => {
      const batchPage = origin + '/study-capture-courses/72/preview-detail/zero';
      const job = {id: 'pending-zero', course: {...course, name: '待框选课程'}, url: origin + '/0-zero.mp4', sourceName: '0-' + '待确认的完整课堂录像名称'.repeat(5) + '.mp4',
        requiresCrop: true, cropConfirmed: false, state: 'needs-crop', selected: false, options: []};
      await seed({lessons: [lesson('zero-unloaded')], batches: [{page: batchPage, jobs: [job]}], pages: []});
      assert.match(await page.locator('#batch-panel > summary').textContent(), /待框选 1 节/);
      await page.locator('#batch-panel > summary').click();
      assert.match(await page.locator('#batch-course-context').textContent(), /待框选课程/);
      assert.equal(await page.locator('[data-job-id="pending-zero"] .batch-manual').isVisible(), true);
      assert.match(await page.locator('[data-job-id="pending-zero"] .batch-state').textContent(), /框选/);
      assert.equal(await page.locator('#batch-start').isDisabled(), true);
      assert.equal(await page.evaluate(() => sourceReady || video.hasAttribute('src')), false);
      assert.equal(await page.locator('#batch-panel').evaluate(panel => panel.getBoundingClientRect().width > 850), true);
    });

    await test('discovery polling retains 26 rows, shows failures, retries and restores metadata', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail';
      await seed({lessons: [lesson('directory')]});
      await page.evaluate(base => {
        coursePage = base; $('course').replaceChildren(new Option('Synthetic course', '1'));
        window.directoryMessages = []; window.directoryFinish = false; window.directoryPolls = [];
        const jobs = Array.from({length: 26}, (_, index) => ({id: 'c' + index, captureCode: 'c' + index,
          course: {name: 'Synthetic course', date: '2026-11-07'}, state: 'pending', selected: true,
          ...(index < 21 ? {url: location.origin + '/2-' + index + '.mp4', sourceName: '2-' + index + '.mp4'} : {}),
          discovery: index < 21 ? {state: 'ready', code: '', message: '', attempts: 1} : {state: 'error', code: index === 25 ? 'TIMEOUT' : 'HTTP', message: index === 25 ? 'body timeout' : 'HTTP 503', attempts: 3}}));
        window.directorySnapshot = {page: base, jobs, total: 26, eligible: 26, complete: false, failures: []};
        chrome.tabs = {sendMessage: async (_tab, message) => {
          directoryMessages.push(structuredClone(message));
          if (message.type === 'PPT_BATCH_DISCOVER') {
            window.directoryRetry = message.retryOnly;
            return {ok: true, pending: true, requestId: message.retryOnly ? 'retry' : 'initial'};
          }
          if (message.type === 'PPT_BATCH_STATUS') {
            directoryPolls.push(Date.now());
            const result = structuredClone(directorySnapshot);
            if (directoryRetry) for (const job of result.jobs.filter(job => job.discovery.state === 'error')) {
              job.url = location.origin + '/2-' + job.id + '.mp4'; job.sourceName = '2-' + job.id + '.mp4'; job.discovery = {state: 'ready', code: '', message: '', attempts: 1};
            }
            result.complete = directoryRetry || directoryFinish;
            return {ok: true, requestId: message.requestId, pending: !directoryRetry && !directoryFinish, result};
          }
          return {ok: true, requestId: message.requestId};
        }};
        window.directoryRun = discoverBatch(1);
      }, base);
      await page.waitForFunction(() => batchJobs.length === 26);
      assert.equal(await page.locator('#batch-start').isDisabled(), true, 'running discovery owns busy guard');
      assert.equal(await page.locator('#stop').isDisabled(), false);
      assert.equal(await page.locator('#batch-jobs .batch-job').count(), 26);
      assert.match(await page.locator('#batch-status').textContent(), /读取成功 21.*失败 5/);
      assert.match(await page.locator('[data-job-id="c25"] .batch-state').textContent(), /TIMEOUT.*body timeout.*3 次/);
      assert.equal(await page.locator('[data-job-id="c25"] input').isDisabled(), true);
      await page.screenshot({path: path.join(output, 'discovery-progress.png')});
      await page.waitForFunction(() => directoryPolls.length >= 2);
      assert.equal(await page.evaluate(() => directoryPolls[1] - directoryPolls[0] >= 900), true);
      await page.evaluate(() => { directoryFinish = true; }); await page.evaluate(() => directoryRun);
      assert.equal(await page.locator('#batch-start').isDisabled(), false);
      assert.equal(await page.locator('#batch-retry').isDisabled(), false);
      await page.locator('#batch-retry').click(); await page.waitForFunction(() => !batchDiscovery && batchJobs.every(job => job.discovery.state === 'ready'));
      assert.equal(await page.evaluate(() => directoryMessages.find(message => message.retryOnly)?.previous.length), 26);
      assert.equal(await page.locator('#batch-retry').isDisabled(), true);
      await page.evaluate(async () => {
        const snapshot = savedBatches.find(item => item.page === batchPage);
        await PPTLibrary.batch(db, batchPage, batchJobs);
        await PPTLibrary.put(db, activeLesson, {page: batchPage, jobs: batchJobs});
        retainBatch({page: batchPage, jobs: batchJobs});
        if (!snapshot.discovery.complete || !savedBatches.find(item => item.page === batchPage).discovery.complete) throw Error('metadata lost');
      });
      await page.reload(); await page.waitForFunction(() => ready);
      assert.equal((await stored()).batches.find(item => item.page === base).discovery.complete, true);
      assert.match(await page.locator('#batch-status').textContent(), /读取成功 26.*目录已列举完整/);
      assert.equal(await page.evaluate(() => sourceReady || video.hasAttribute('src')), false);
      await page.evaluate(async base => {
        coursePage = base; $('course').replaceChildren(new Option('Synthetic course', '1'));
        const snapshot = savedBatches.find(item => item.page === base);
        snapshot.discovery = {...snapshot.discovery, complete: false, total: 40, eligible: 35, failures: [{code: 'PAGINATION_LIMIT', message: 'partial listing'}]};
        await PPTLibrary.batch(db, base, batchJobs, snapshot.discovery);
        chrome.tabs = {sendMessage: async () => ({ok: true, page: base, jobs: structuredClone(batchJobs), total: 26, eligible: 26, complete: true})};
        await discoverBatch(1, false, true);
      }, base);
      const retriedPartial = (await stored()).batches.find(item => item.page === base).discovery;
      assert.equal(retriedPartial.complete, false); assert.equal(retriedPartial.total, 40); assert.equal(retriedPartial.eligible, 35);
      assert.equal(retriedPartial.failures[0].code, 'PAGINATION_LIMIT');
      assert.match(await page.locator('#batch-status').textContent(), /已知 40.*目录不完整/);
    });

    await test('discovery Stop settles promptly, ignores late results and bounds stalled messages', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail';
      await seed({lessons: [lesson('cancel-directory')]});
      await page.evaluate(base => {
        coursePage = base; $('course').replaceChildren(new Option('Synthetic course', '1'));
        window.directoryCancelled = []; window.releaseDirectoryStatus = null;
        chrome.tabs = {sendMessage: async (_tab, message) => {
          if (message.type === 'PPT_BATCH_DISCOVER') return {ok: true, pending: true, requestId: 'stop'};
          if (message.type === 'PPT_BATCH_CANCEL') { directoryCancelled.push(message.requestId); return {ok: true}; }
          return new Promise(resolve => { window.releaseDirectoryStatus = resolve; });
        }};
        window.directoryRun = discoverBatch(1);
      }, base);
      await page.waitForFunction(() => !!window.releaseDirectoryStatus);
      const stopped = Date.now(); await page.locator('#stop').click(); await page.waitForFunction(() => !batchDiscovery);
      assert(Date.now() - stopped < 1500, 'Stop does not wait for the hung status response');
      assert.equal(await page.evaluate(() => directoryCancelled.includes('stop')), true);
      await page.evaluate(base => { releaseDirectoryStatus({ok: true, pending: false, requestId: 'stop', result: {page: base, jobs: [{id: 'late'}]}}); }, base);
      assert.equal((await stored()).batches.length, 0, 'late result cannot write stale rows');
      await page.evaluate(() => {
        window.originalDirectoryTimeout = window.setTimeout; window.directoryDeadline = [];
        window.setTimeout = (fn, delay, ...args) => { directoryDeadline.push(delay); return originalDirectoryTimeout(fn, delay === 10000 ? 20 : delay, ...args); };
        chrome.tabs.sendMessage = () => new Promise(() => {});
        window.directoryRun = discoverBatch(1);
      });
      await page.waitForFunction(() => !batchDiscovery);
      assert.match(await page.locator('#batch-status').textContent(), /10000ms/);
      assert.equal(await page.evaluate(() => directoryDeadline.includes(10000)), true);
      await page.evaluate(() => { window.setTimeout = originalDirectoryTimeout; });
      for (const mismatch of ['request', 'page', 'tab']) {
        await page.evaluate(({base, mismatch}) => {
          coursePage = base; $('course').value = '1';
          chrome.tabs.sendMessage = async (_tab, message) => {
            if (message.type === 'PPT_BATCH_DISCOVER') return {ok: true, requestId: 'expected', pending: true};
            if (message.type === 'PPT_BATCH_CANCEL') return {ok: true};
            if (mismatch === 'tab') $('course').replaceChildren(new Option('Other course', '2'));
            return {ok: true, requestId: mismatch === 'request' ? 'wrong' : 'expected', pending: false,
              result: {page: mismatch === 'page' ? base + '/other' : base, jobs: [{id: 'stale'}], complete: true}};
          };
          window.directoryRun = discoverBatch(1);
        }, {base, mismatch});
        await page.evaluate(() => directoryRun);
        assert.equal((await stored()).batches.length, 0, mismatch + ' mismatch must not write');
      }
    });

    await test('stopped discovery persists partial rows, selection, sources and failure metadata', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail';
      const retained = {id: 'retained', captureCode: 'retained', url: origin + '/2-retained.mp4', sourceName: '2-retained.mp4', course: {name: 'Synthetic course'},
        state: 'stopped', selected: true, history: ['retained'], cropOverride: {manual: true}, discovery: {state: 'ready', code: '', message: '', attempts: 1}};
      await seed({lessons: [lesson('partial-directory')], batches: [{page: base, jobs: [retained]}]});
      await page.evaluate(base => {
        coursePage = base; $('course').replaceChildren(new Option('Synthetic course', '1')); window.partialPolls = 0; window.releasePartial = null;
        chrome.tabs = {sendMessage: async (_tab, message) => {
          if (message.type === 'PPT_BATCH_DISCOVER') {
            window.partialJobs = [...message.previous.map(job => ({...job, discovery: {state: 'pending', code: '', message: '', attempts: 0}})),
              {id: 'new-row', captureCode: 'new-row', course: {name: 'Synthetic course'}, selected: false, state: 'pending', discovery: {state: 'pending', code: '', message: '', attempts: 0}}];
            return {ok: true, pending: true, requestId: 'partial'};
          }
          if (message.type === 'PPT_BATCH_CANCEL') return {ok: true};
          if (++partialPolls === 1) return {ok: true, pending: true, requestId: 'partial', result: {page: base, jobs: structuredClone(partialJobs), total: 2, eligible: 2, complete: false, failures: []}};
          return new Promise(resolve => { window.releasePartial = resolve; });
        }};
        window.directoryRun = discoverBatch(1);
      }, base);
      await page.waitForFunction(() => !!window.releasePartial); await page.locator('#stop').click(); await page.evaluate(() => directoryRun);
      const snapshot = (await stored()).batches.find(item => item.page === base), first = snapshot.jobs.find(job => job.id === retained.id);
      assert.equal(snapshot.jobs.length, 2); assert.equal(snapshot.discovery.complete, false);
      assert.equal(snapshot.discovery.progress.phase, 'cancelled'); assert.equal(snapshot.discovery.failures.length, 2);
      assert(snapshot.discovery.failures.every(item => item.code === 'CANCELLED'));
      assert.equal(first.selected, true); assert.equal(first.url, retained.url); assert.equal(first.state, 'stopped');
      assert.deepEqual(first.cropOverride, retained.cropOverride); assert.deepEqual(first.history, retained.history);
      assert.equal(await page.locator('#batch-start').isDisabled(), true); assert.equal(await page.locator('#batch-retry').isDisabled(), false);
      await page.evaluate(base => releasePartial({ok: true, requestId: 'partial', pending: false, result: {page: base, jobs: [], complete: true}}), base);
      assert.deepEqual((await stored()).batches.find(item => item.page === base), snapshot);
    });

    for (const mode of ['Stop', 'message failure']) {
      await test(`discovery recovery persistence failure remains visible after ${mode}`, async () => {
        const base = origin + '/study-capture-courses/42/preview-detail';
        await seed({lessons: [lesson('recovery-save-failure')]});
        await page.evaluate(base => {
          coursePage = base; $('course').replaceChildren(new Option('Synthetic course', '1')); window.recoveryPolls = 0;
          chrome.tabs = {sendMessage: async (_tab, message) => {
            if (message.type === 'PPT_BATCH_DISCOVER') return {ok: true, pending: true, requestId: 'recovery'};
            if (message.type === 'PPT_BATCH_CANCEL') return {ok: true};
            if (++recoveryPolls === 1) return {ok: true, pending: true, requestId: 'recovery', result: {page: base,
              jobs: [{id: 'pending-row', course: {name: 'Synthetic course'}, state: 'pending', selected: false, discovery: {state: 'pending', code: '', message: '', attempts: 0}}],
              total: 1, eligible: 1, complete: false, failures: [], progress: {phase: 'details', total: 1, resolved: 0}}};
            return new Promise(resolve => { window.releaseRecoveryStatus = resolve; });
          }};
          window.directoryRun = discoverBatch(1);
        }, base);
        await page.waitForFunction(() => !!window.releaseRecoveryStatus);
        const before = (await stored()).batches;
        await page.evaluate(base => {
          const put = IDBObjectStore.prototype.put; window.recoverySaveAttempts = 0;
          IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === 'settings' && key === 'batch:' + base && ['cancelled', 'error'].includes(value.discovery?.progress?.phase)) {
              recoverySaveAttempts++; throw new DOMException('synthetic disk full', 'QuotaExceededError');
            }
            return put.call(this, value, key);
          };
          window.restoreRecoveryPut = () => { IDBObjectStore.prototype.put = put; };
        }, base);
        try {
          if (mode === 'Stop') await page.locator('#stop').click();
          else await page.evaluate(() => releaseRecoveryStatus({ok: false, error: 'synthetic message unavailable'}));
          await page.evaluate(() => directoryRun);
        } finally { await page.evaluate(() => restoreRecoveryPut()); }
        const finalStatus = await page.locator('#batch-status').textContent();
        assert.match(finalStatus, /目录保存失败.*synthetic disk full/);
        assert.match(finalStatus, /状态未保存.*上次成功保存/);
        assert(!finalStatus.includes('已保留已知课次'), 'failed recovery must not claim its state update was retained');
        if (mode !== 'Stop') assert.match(finalStatus, /synthetic message unavailable/);
        assert.equal(await page.evaluate(() => recoverySaveAttempts), 1);
        assert.deepEqual((await stored()).batches, before, 'aborted recovery leaves the last durable pending snapshot intact');
        assert.equal(await page.evaluate(() => batchJobs[0].discovery.state), 'pending');
        assert.equal(await page.evaluate(() => batchDiscovery), null);
        if (mode === 'Stop') await page.evaluate(() => releaseRecoveryStatus({ok: true, requestId: 'recovery', pending: false}));
        await page.reload(); await idle();
        assert.equal((await stored()).batches[0].jobs[0].discovery.state, 'pending');
      });
    }

    await test('suspect confirmation removes exactly one record write-first, retries failures and survives reload without video', async () => {
      const suspects = [{start: 1, end: 3, time: 1}, {start: 1, end: 3, time: 1}, {start: 2, end: 4}, {start: 4, end: 5}];
      await seed({lessons: [lesson('dismiss', {suspects}), lesson('untouched', {suspects: [{start: 1, end: 8}]})]});
      const before = await stored();
      await page.locator('#suspects-panel').evaluate(panel => { panel.open = true; });
      assert.equal(await page.locator('.suspect-dismiss').first().isDisabled(), false);
      assert.equal(await page.locator('.suspect-range button').first().isDisabled(), true);
      await page.evaluate(() => {
        const put = PPTLibrary.put, transaction = IDBDatabase.prototype.transaction;
        PPTLibrary.put = async (...args) => { await new Promise(resolve => { window.releaseDismiss = resolve; }); return put(...args); };
        window.restoreDismiss = () => { PPTLibrary.put = put; };
        IDBDatabase.prototype.transaction = function (names, mode, ...args) {
          const tx = transaction.call(this, names, mode, ...args);
          if (mode === 'readwrite' && names.includes('settings')) { IDBDatabase.prototype.transaction = transaction; queueMicrotask(() => tx.abort()); }
          return tx;
        };
      });
      await page.locator('.suspect-dismiss').nth(1).click(); await page.waitForFunction(() => !!window.releaseDismiss);
      assert.equal(await page.locator('.suspect-range').count(), 4);
      assert.deepEqual(await page.evaluate(() => activeLesson.suspects), suspects);
      assert.deepEqual(await stored(), before); assert.equal(await page.locator('.suspect-dismiss').first().isDisabled(), true);
      await page.evaluate(() => { window.restoreDismiss(); window.releaseDismiss(); }); await idle();
      assert.match(await page.locator('#status').textContent(), /确认保存失败/);
      assert.deepEqual(await stored(), before); assert.deepEqual(await page.evaluate(() => activeLesson.suspects), suspects);
      assert.equal(await page.locator('.suspect-range').count(), 4); assert.equal(await page.locator('.suspect-dismiss').nth(1).isDisabled(), false);
      await page.locator('.suspect-dismiss').nth(1).click(); await idle();
      const after = await stored(), remaining = [suspects[0], suspects[2], suspects[3]];
      assert.deepEqual(after.lessons.find(item => item.id === 'dismiss'), {...before.lessons.find(item => item.id === 'dismiss'), suspects: remaining});
      assert.deepEqual(after.lessons.find(item => item.id === 'untouched'), before.lessons.find(item => item.id === 'untouched'));
      assert.deepEqual(await page.evaluate(() => activeLesson.suspects), remaining); assert.equal(await page.locator('.suspect-range').count(), 3);
      await page.reload(); await idle(); assert.deepEqual((await stored()).lessons.find(item => item.id === 'dismiss').suspects, remaining);
      assert.equal(await page.evaluate(() => sourceReady), false);
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

    await test('long session global limits restore valid values and normalize invalid saved and entered values', async () => {
      for (const value of [undefined, '1388', 99, 20001, 100.5, 100, 20000, 1388]) {
        await seed();
        await page.evaluate(async value => {
          const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({maxPages: value}, 'captureLimits');
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
        }, value);
        await open();
        assert.equal(await page.locator('#page-limit').inputValue(), String(Number.isInteger(value) && value >= 100 && value <= 20000 ? value : 5000));
      }
      await page.locator('#tab-extraction').click(); await page.locator('#page-limit').fill('100.5');
      await page.evaluate(() => $('page-limit').onchange());
      assert.equal(await page.locator('#page-limit').inputValue(), '5000');
      assert.deepEqual(await page.evaluate(() => ({limits: captureLimits, settings: scanSettings()})), {limits: {maxPages: 5000}, settings: {...settings, step: .5}});
      const failed = await page.evaluate(async () => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) { if (key === 'captureLimits') throw Error('synthetic limit setting write failure'); return put.apply(this, arguments); };
        try { $('page-limit').value = '2000'; await $('page-limit').onchange(); }
        finally { IDBObjectStore.prototype.put = put; }
        return {limits: captureLimits, input: $('page-limit').value, settled: await limitsSave.then(() => true), message: $('status').textContent};
      });
      assert.deepEqual(failed.limits, {maxPages: 5000}); assert.equal(failed.input, '5000'); assert.equal(failed.settled, true); assert.match(failed.message, /synthetic limit setting write failure/);
    });

    await test('long session real scanner commits 1388 pages and reaches the end under the default limit', async () => {
      await seed(); await load(); await boundedScanner();
      try {
        await page.evaluate(() => fastScan());
        const evidence = await scanEvidence();
        fs.writeFileSync(path.join(output, 'long-default.json'), JSON.stringify(evidence, null, 2));
        assert.equal(evidence.pages, 1388); assert.equal(evidence.assets, 1388);
        assert.equal(evidence.task.state, 'done'); assert.equal(evidence.task.checkpoint, 693.95);
        assert.equal(evidence.first, .25); assert.equal(evidence.last, 693.75); assert.equal(evidence.duplicateScanTimes, 0);
        assert.equal(evidence.probe.commits.length, 1388); assert(evidence.probe.seeks.includes(693.95));
        assert.equal(evidence.probe.maximumSignatures, 1000); assert.equal(evidence.probe.maximumSignatureBytes, 82944000);
      } finally { await page.evaluate(() => restoreBoundedScanner()); }
    });

    await test('long session page limit pauses safely then resumes the same scan after a persisted global change', async () => {
      await seed(); await load(); await boundedScanner();
      try {
        await page.locator('#tab-extraction').click();
        const input = page.locator('#page-limit'); assert.equal(await input.inputValue(), '5000');
        await input.fill('1000'); await input.dispatchEvent('change'); await page.evaluate(() => limitsSave);
        const before = await page.evaluate(() => scanSettings());
        await page.evaluate(() => fastScan()); const paused = await scanEvidence();
        assert.equal(paused.pages, 1000); assert.equal(paused.assets, 1000); assert.equal(paused.task.state, 'paused');
        assert.equal(paused.task.reason, 'PAGE_LIMIT'); assert.equal(paused.task.checkpoint, 499.5); assert.equal(paused.task.baselineTime, 499.75);
        assert.equal(paused.canResume, true); assert.match(paused.status, /上限|1000/);
        const tail = await page.evaluate(() => {
          window.tailCards = [...$('pages').children]; selectedPages.add(pages[0].id); selectionAnchor = pages[0].id; updateSelection();
          $('pages').scrollTop = 120; window.tailScroll = $('pages').scrollTop;
          const renderAll = render; window.tailFullRenders = 0; render = (...args) => { tailFullRenders++; return renderAll(...args); };
          const mutations = []; window.tailMutations = mutations;
          window.tailObserver = new MutationObserver(rows => mutations.push(...rows.map(row => ({removed: row.removedNodes.length, added: row.addedNodes.length}))));
          tailObserver.observe($('pages'), {childList: true});
          window.tailCleanup = () => { render = renderAll; tailObserver.disconnect(); };
          return {selection: [...selectedPages], anchor: selectionAnchor};
        });
        await input.fill('1388'); await input.dispatchEvent('change'); await page.evaluate(() => limitsSave);
        assert.deepEqual(await page.evaluate(() => scanSettings()), before); assert.equal(await page.evaluate(() => canResume()), true);
        await page.evaluate(() => fastScan()); const done = await scanEvidence();
        assert.equal(done.pages, 1388); assert.equal(done.assets, 1388); assert.equal(done.task.state, 'done');
        assert.equal(done.task.id, paused.task.id); assert.equal(done.task.checkpoint, 693.95); assert.equal(done.duplicateScanTimes, 0);
        const cards = await page.evaluate(() => ({same: tailCards.every((card, i) => $('pages').children[i] === card), fullRenders: tailFullRenders,
          removed: tailMutations.reduce((sum, row) => sum + row.removed, 0), added: tailMutations.reduce((sum, row) => sum + row.added, 0),
          selection: [...selectedPages], anchor: selectionAnchor, scroll: $('pages').scrollTop, previousScroll: tailScroll}));
        assert.equal(cards.same, true); assert.equal(cards.fullRenders, 0); assert.equal(cards.removed, 0); assert.equal(cards.added, 388);
        assert.deepEqual(cards.selection, tail.selection); assert.equal(cards.anchor, tail.anchor); assert.equal(cards.scroll, cards.previousScroll);
        fs.writeFileSync(path.join(output, 'long-resume.json'), JSON.stringify({paused, done, cards}, null, 2));
        await page.evaluate(() => tailCleanup());
      } finally { await page.evaluate(() => { window.tailCleanup?.(); restoreBoundedScanner(); }); }
      await page.reload(); await idle(); assert.equal(await page.locator('#page-limit').inputValue(), '1388');
      await page.evaluate(async () => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({maxPages: 20001}, 'captureLimits'); await new Promise(resolve => { tx.oncomplete = resolve; }); });
      await page.reload(); await idle(); assert.equal(await page.locator('#page-limit').inputValue(), '5000');
    });

    await test('long session storage estimates pause before the next commit at start and every 25 committed pages', async () => {
      for (const lowAt of [0, 25]) {
        await seed(); await load(); await boundedScanner(15);
        try {
          await page.evaluate(lowAt => { navigator.storage.estimate = async () => {
            longProbe.estimates.push(longProbe.commits.length); return {quota: 64 * 1024 ** 2, usage: longProbe.commits.length >= lowAt ? 33 * 1024 ** 2 : 0};
          }; }, lowAt);
          await page.evaluate(() => fastScan()); const paused = await scanEvidence();
          assert.equal(paused.pages, lowAt); assert.equal(paused.assets, lowAt); assert.equal(paused.task.reason, 'STORAGE_LOW');
          assert.equal(paused.task.state, 'paused'); assert.equal(paused.task.checkpoint, lowAt ? 12 : 0); assert.equal(paused.canResume, true);
          assert.deepEqual(paused.probe.estimates, lowAt ? [0, 25] : [0]);
          await page.evaluate(() => { navigator.storage.estimate = async () => ({quota: 64 * 1024 ** 2, usage: 0}); });
          await page.evaluate(() => fastScan()); const done = await scanEvidence();
          assert.equal(done.task.id, paused.task.id); assert.equal(done.task.state, 'done'); assert.equal(done.pages, 30); assert.equal(done.assets, 30); assert.equal(done.duplicateScanTimes, 0);
          fs.writeFileSync(path.join(output, `storage-low-${lowAt}.json`), JSON.stringify({paused, done}, null, 2));
        } finally { await page.evaluate(() => { delete navigator.storage.estimate; restoreBoundedScanner(); }); }
      }
      for (const mode of ['missing', 'throws', 'unknown', 'nonfinite', 'boundary']) {
        await seed(); await load(); await boundedScanner(1);
        try {
          await page.evaluate(mode => { navigator.storage.estimate = mode === 'missing' ? undefined : async () => {
            if (mode === 'throws') throw Error('synthetic estimate unavailable');
            return mode === 'unknown' ? {} : mode === 'nonfinite' ? {quota: Infinity, usage: NaN} : {quota: 33554432, usage: 0};
          }; }, mode);
          await page.evaluate(() => fastScan()); const done = await scanEvidence();
          assert.equal(done.task.state, 'done', mode); assert.equal(done.pages, 2, mode);
        } finally { await page.evaluate(() => { delete navigator.storage.estimate; restoreBoundedScanner(); }); }
      }
    });

    await test('long session aborted quota transaction retains assets and resumes without duplicate scan times', async () => {
      await seed(); await load(); await boundedScanner(3);
      try {
        await page.evaluate(() => {
          const put = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function(...args) {
            if (this.name === 'assets' && longProbe.commits.length === 2) {
              const tx = this.transaction; Object.defineProperty(tx, 'error', {value: new DOMException('synthetic IDB quota', 'QuotaExceededError')}); tx.abort(); return;
            }
            return put.apply(this, args);
          };
          window.restoreQuotaPut = () => { IDBObjectStore.prototype.put = put; };
        });
        await page.evaluate(() => fastScan()); const paused = await scanEvidence();
        assert.equal(paused.task.reason, 'STORAGE_LOW'); assert.equal(paused.task.state, 'paused');
        assert.equal(paused.pages, 2); assert.equal(paused.assets, 2); assert.equal(paused.task.checkpoint, .5); assert.equal(paused.task.baselineTime, .75);
        await page.evaluate(() => restoreQuotaPut()); await page.evaluate(() => fastScan()); const done = await scanEvidence();
        assert.equal(done.pages, 6); assert.equal(done.assets, 6); assert.equal(done.task.id, paused.task.id); assert.equal(done.task.state, 'done'); assert.equal(done.duplicateScanTimes, 0);
        fs.writeFileSync(path.join(output, 'quota-resume.json'), JSON.stringify({paused, done}, null, 2));
      } finally { await page.evaluate(() => { window.restoreQuotaPut?.(); restoreBoundedScanner(); }); }
    });

    await test('long session batch storage stops before later loads while page limits allow the next lesson', async () => {
      for (const failure of ['estimate', 'quota-load', 'quota-scan', 'page-limit']) {
        const batchPage = 'https://synthetic.invalid/batch-guards';
        const jobs = ['guard-a', 'guard-b'].map(id => ({id, url: origin + '/' + path.relative(root, fixture) + '?job=' + id, sourceName: id + '.mp4', course: {...course}, selected: true, state: 'pending', requiresCrop: false}));
        await seed({batches: [{page: batchPage, jobs}]}); await boundedScanner(failure === 'page-limit' ? 51 : 1);
        try {
          await page.evaluate(failure => {
            window.batchGuardProbe = {loads: [], caches: [], scans: 0};
            const load = loadRemote, create = PPTDiskCache.create, scan = PPTScanner.prototype.scan, put = IDBObjectStore.prototype.put;
            loadRemote = (...args) => { batchGuardProbe.loads.push(args[0]); return load(...args); };
            PPTDiskCache.create = (...args) => { batchGuardProbe.caches.push(args[0]); if (failure === 'quota-load') throw new DOMException('synthetic OPFS quota', 'QuotaExceededError'); return create(...args); };
            PPTScanner.prototype.scan = function(options) { batchGuardProbe.scans++; return scan.call(this, options); };
            if (failure === 'estimate') { let estimates = 0; navigator.storage.estimate = async () => ({quota: 33554432, usage: ++estimates > 1 ? 1 : 0}); }
            if (failure === 'quota-scan') IDBObjectStore.prototype.put = function(...args) {
              if (this.name === 'assets') { const tx = this.transaction; Object.defineProperty(tx, 'error', {value: new DOMException('synthetic IDB quota', 'QuotaExceededError')}); tx.abort(); return; }
              return put.apply(this, args);
            };
            if (failure === 'page-limit') captureLimits = {maxPages: 100};
            window.restoreBatchGuards = () => { loadRemote = load; PPTDiskCache.create = create; PPTScanner.prototype.scan = scan; IDBObjectStore.prototype.put = put; delete navigator.storage.estimate; };
          }, failure);
          await page.evaluate(() => runBatch(Promise.resolve(true)));
          const result = await page.evaluate(async () => ({probe: batchGuardProbe, jobs: structuredClone(batchJobs), status: $('batch-status').textContent,
            lessons: (await PPTLibrary.restore(db)).lessons, cache: videoCache, sourceReady, busy: busy()}));
          if (failure === 'page-limit') {
            assert.equal(result.probe.loads.length, 2); assert.equal(result.probe.scans, 2);
            assert(result.lessons.every(lesson => lesson.task.state === 'paused' && lesson.task.reason === 'PAGE_LIMIT'));
            assert(result.jobs.every(job => job.state === 'partial' && job.pages === 100));
          } else {
            assert.equal(result.probe.loads.length, 1, failure); assert.equal(result.jobs[1].state, 'pending');
            assert.match(result.status, /空间不足|剩余空间/);
            if (failure !== 'quota-load') assert.equal(result.lessons[0].task.reason, 'STORAGE_LOW');
          }
          assert.equal(result.cache, null); assert.equal(result.sourceReady, false); assert.equal(result.busy, false);
          await page.evaluate(() => { restoreBatchGuards(); captureLimits = {maxPages: 5000}; });
          await page.evaluate(() => runBatch(Promise.resolve(true)));
          const resumed = await page.evaluate(async () => {
            const saved = await PPTLibrary.restore(db);
            return {jobs: structuredClone(batchJobs), tasks: saved.lessons.map(lesson => lesson.task),
              pages: saved.pages.length, duplicateScanTimes: saved.pages.length - new Set(saved.pages.map(row => `${row.lessonId}:${row.scanId}:${row.sourceTime}`)).size};
          });
          assert(resumed.jobs.every(job => job.state === 'done'), `${failure}: unfinished jobs restart after space/limit recovery`);
          assert(resumed.tasks.every(task => task.state === 'done')); assert.equal(resumed.duplicateScanTimes, 0);
          if (result.lessons[0]?.task) assert.equal(resumed.tasks.find(task => task.id === result.lessons[0].task.id)?.state, 'done');
          assert.equal(resumed.pages, failure === 'page-limit' ? 204 : 4);
          fs.writeFileSync(path.join(output, `batch-${failure}.json`), JSON.stringify({interrupted: result, resumed}, null, 2));
        } finally { await page.evaluate(() => { window.restoreBatchGuards?.(); restoreBoundedScanner(); }); }
      }
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
      assert.equal(await page.evaluate(() => PPTLibrary.integrity({lessons, pages: allPages}).lessons[0].scan.reachedEnd), false, 'local rescan cannot certify a legacy full task');
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

    await test('integrity coverage uses committed checkpoints, never invents legacy prefix, and restarts mismatched tracks', async () => {
      const legacy = {id: 'old-checkpoint', state: 'paused', checkpoint: 2, baselineTime: .25, duration: 4, settings: {...settings, step: .5, dedupe: false}, crop: full};
      await seed({lessons: [lesson('coverage', {task: legacy, settings: legacy.settings})]}); await load(); await boundedScanner(4);
      try {
        await page.evaluate(() => fastScan());
        let evidence = await scanEvidence();
        assert.equal(evidence.task.coverage.ranges[0].start, 2); assert.equal(evidence.task.coverage.reachedEnd, true);
        assert.equal(await page.evaluate(() => PPTLibrary.integrity({lessons, pages: allPages}).lessons[0].scan.reachedEnd), false);
        await page.evaluate(async () => { activeLesson.task.coverage.trackKey = 'wrong-track'; activeLesson.task.state = 'paused'; await persistLesson(); });
        await page.evaluate(() => fastScan()); evidence = await scanEvidence();
        assert.notEqual(evidence.task.id, legacy.id); assert.equal(evidence.task.coverage.ranges[0].start, 0);
        assert.equal(await page.evaluate(() => PPTLibrary.integrity({lessons, pages: allPages}).lessons[0].scan.reachedEnd), true);
      } finally { await page.evaluate(() => restoreBoundedScanner()); }
      await seed({lessons: [lesson('failed-coverage')]}); await load(); await boundedScanner(4);
      try {
        await page.evaluate(() => {
          const put = IDBObjectStore.prototype.put; let failed = false;
          IDBObjectStore.prototype.put = function(value, key) {
            if (!failed && this.name === 'settings' && key === 'lesson:' + activeLesson.id && value.task?.checkpoint >= 1) {
              failed = true; throw Error('Injected coverage checkpoint failure');
            }
            return put.apply(this, arguments);
          };
          window.restoreCoveragePut = () => { IDBObjectStore.prototype.put = put; };
        });
        await page.evaluate(() => fastScan());
        const evidence = await scanEvidence(), live = await page.evaluate(() => structuredClone(activeLesson.task));
        assert.equal(evidence.task.coverage.ranges.at(-1).end, .5); assert.equal(evidence.task.checkpoint, .5);
        assert.equal(evidence.task.coverage.reachedEnd, false); assert.deepEqual(live, evidence.task);
        assert.match(evidence.status, /Injected coverage checkpoint failure/);
      } finally { await page.evaluate(() => { window.restoreCoveragePut?.(); restoreBoundedScanner(); }); }
    });

    await test('integrity duration reload retains historical pages and checkpoints but cannot certify the longer source or new receipt', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/duration', url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const job = {id: 'duration-job', course, url, sourceName: '2-duration.mp4', discovery: {state: 'ready'}};
      await seed({batches: [{page: base, jobs: [job], discovery: {complete: true, total: 1, eligible: 1}}]});
      const reload = () => page.evaluate(async ({base, job}) => {
        coursePage = base; sourceCourse = {...job.course}; sourceCoursePage = base;
        return loadRemote(job.url, {permissionGranted: true, batchJob: job, sourceName: job.sourceName});
      }, {base, job});
      assert.equal(await reload(), true); await boundedScanner(3);
      try { await page.evaluate(() => fastScan()); } finally { await page.evaluate(() => restoreBoundedScanner()); }
      const historical = await stored(), savedLesson = historical.lessons[0];
      assert.equal(savedLesson.task.coverage.reachedEnd, true); assert.equal(savedLesson.task.checkpoint, 2.95);
      const readReport = async label => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#course-report').click()]);
        const target = path.join(output, label + '.json'); await download.saveAs(target); await idle();
        return JSON.parse(fs.readFileSync(target, 'utf8'));
      };
      const oldReport = await readReport('duration-before-reload'); assert.equal(oldReport.complete, true);
      await page.locator('#tab-export').click();
      const [oldPDF] = await Promise.all([page.waitForEvent('download'), page.locator('#course-pdf').click()]);
      await oldPDF.saveAs(path.join(output, 'duration-before-reload.pdf')); await idle();
      const priorReceipt = (await readReport('duration-old-receipt')).lastExport; assert.equal(priorReceipt.complete, true);
      assert.equal(await reload(), true); await settled();
      const reloaded = await stored(); assert.equal(reloaded.lessons.length, 1); assert.equal(reloaded.lessons[0].source.duration, 6);
      assert.deepEqual(reloaded.lessons[0].task, savedLesson.task); assert.deepEqual(reloaded.pages, historical.pages); assert.deepEqual(reloaded.assets, historical.assets);
      const current = await readReport('duration-after-reload');
      assert.equal(current.lessons[0].scan.verified, false); assert.equal(current.lessons[0].scan.reachedEnd, false); assert.equal(current.complete, false);
      assert.deepEqual(current.lastExport, priorReceipt, 'the old successful receipt remains a frozen historical snapshot');
      const [newZIP] = await Promise.all([page.waitForEvent('download'), page.locator('#course-zip').click()]);
      await newZIP.saveAs(path.join(output, 'duration-after-reload.zip')); await idle();
      const latest = await readReport('duration-new-receipt');
      assert.equal(latest.lastExport.complete, false); assert.equal(latest.lastExport.lessons[0].scan.verified, false);
      assert.deepEqual(latest.lastExport.pageIds, priorReceipt.pageIds); assert.equal(latest.lastExport.export.format, 'zip');
      assert.deepEqual((await stored()).lessons[0].task, savedLesson.task);
      await boundedScanner(6); try { await page.evaluate(() => fastScan()); } finally { await page.evaluate(() => restoreBoundedScanner()); }
      const rescanned = await readReport('duration-rescanned'); assert.equal(rescanned.complete, true);
      assert.notEqual((await stored()).lessons[0].task.id, savedLesson.task.id); assert.deepEqual(rescanned.lastExport, latest.lastExport);
      assert(historical.pages.every(old => rescanned.pageIds.includes(old.id)), 'a new compatible full scan retains every historical page');
    });

    await test('integrity same-course directory pages retain all known rows and explicitly scope current and batch receipts', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', other = base.replace('/a', '/b');
      const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const job = {id: 'shared-job', course, url, sourceName: '2-shared.mp4', discovery: {state: 'ready'}};
      const missing = {id: 'new-unscanned-job', course, url: url + '?recording=new', sourceName: '2-new.mp4', discovery: {state: 'ready'}};
      await seed({batches: [{page: base, jobs: [job], discovery: {complete: true, total: 1, eligible: 1}}]});
      assert.equal(await page.evaluate(async ({base, job}) => {
        coursePage = base; sourceCourse = {...job.course}; sourceCoursePage = base;
        return loadRemote(job.url, {permissionGranted: true, batchJob: job, sourceName: job.sourceName});
      }, {base, job}), true);
      await boundedScanner(6); try { await page.evaluate(() => fastScan()); } finally { await page.evaluate(() => restoreBoundedScanner()); }
      const history = await stored(); assert(history.pages.length > 0);
      await page.evaluate(async ({other, job, missing}) => {
        const snapshot = {page: other, jobs: [job, missing], discovery: {complete: true, total: 2, eligible: 2}};
        await PPTLibrary.batch(db, snapshot.page, snapshot.jobs, snapshot.discovery); retainBatch(structuredClone(snapshot));
        batchPage = other; batchJobs = structuredClone(snapshot.jobs); renderBatchJobs(); controls();
      }, {other, job, missing});
      const readReport = async (button, label) => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
        const target = path.join(output, label + '.json'); await download.saveAs(target); await idle();
        return JSON.parse(fs.readFileSync(target, 'utf8'));
      };
      await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      const current = await readReport('#course-report', 'same-course-current'), batchReport = await readReport('#batch-course-report', 'same-course-batch');
      const checkRows = report => {
        assert.deepEqual(report.lessons.map(row => row.jobId).sort(), [missing.id, job.id].sort());
        assert.equal(report.directory.known, 2); assert.equal(report.summary.notReachedEnd, 1); assert.equal(report.complete, false);
        assert.equal(report.lessons.find(row => row.jobId === job.id).scan.reachedEnd, true);
        assert.equal(report.lessons.find(row => row.jobId === missing.id).scan.reachedEnd, false);
      };
      checkRows(current); checkRows(batchReport);
      assert.equal(current.directory.total, 2); assert.equal(current.directory.eligible, 1); assert.equal(current.directory.state, 'incomplete');
      assert.equal(batchReport.directory.total, 2); assert.equal(batchReport.directory.eligible, 2); assert.equal(batchReport.directory.state, 'complete');
      await page.evaluate(() => { savedBatches.reverse(); });
      const reordered = await readReport('#batch-course-report', 'same-course-reordered');
      assert.deepEqual(reordered, batchReport, 'insertion order must not select a different directory');
      await page.locator('#tab-export').click();
      const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('#course-pdf').click()]);
      await pdf.saveAs(path.join(output, 'same-course-current.pdf')); await idle();
      const currentReceipt = (await readReport('#course-report', 'same-course-current-receipt')).lastExport;
      checkRows(currentReceipt); assert.equal(currentReceipt.directory.eligible, 1); assert.equal(currentReceipt.directory.state, 'incomplete'); assert.equal(currentReceipt.export.format, 'pdf');
      assert.deepEqual(currentReceipt.pageIds, history.pages.map(page => page.id));
      const [zip] = await Promise.all([page.waitForEvent('download'), page.locator('#batch-course-zip').click()]);
      await zip.saveAs(path.join(output, 'same-course-batch.zip')); await idle();
      const batchReceipt = (await readReport('#batch-course-report', 'same-course-batch-receipt')).lastExport;
      checkRows(batchReceipt); assert.equal(batchReceipt.directory.total, 2); assert.equal(batchReceipt.directory.eligible, 2); assert.equal(batchReceipt.export.format, 'zip');
      assert.deepEqual(batchReceipt.pageIds, currentReceipt.pageIds); assert.deepEqual((await stored()).pages, history.pages);
      assert.equal(await page.evaluate(async ({other, missing}) => {
        coursePage = other; sourceCourse = {...missing.course}; sourceCoursePage = other;
        return loadRemote(missing.url, {permissionGranted: true, batchJob: missing, sourceName: missing.sourceName});
      }, {other, missing}), true);
      await boundedScanner(6); try { await page.evaluate(() => fastScan()); } finally { await page.evaluate(() => restoreBoundedScanner()); }
      const setHistorical = metadata => page.evaluate(async ({base, metadata}) => {
        const previous = savedBatches.find(batch => batch.page === base);
        const snapshot = {...previous, discovery: metadata, jobs: previous.jobs.map(job => ({...job, discovery: {state: 'error', code: 'NETWORK'}}))};
        await PPTLibrary.batch(db, snapshot.page, snapshot.jobs, snapshot.discovery); retainBatch(snapshot);
      }, {base, metadata});
      for (const [label, metadata] of [['unknown', {total: 2}], ['failed', {complete: false, total: 2, failures: [{code: 'NETWORK'}]}]]) {
        await setHistorical(metadata);
        const reconciled = await readReport('#batch-course-report', 'same-course-reconciled-' + label);
        assert.equal(reconciled.complete, true, 'the requested complete listing covers all known IDs/totals despite old ' + label);
        assert.equal(reconciled.directory.state, 'complete'); assert.equal(reconciled.summary.directoryFailures, 0);
        assert(reconciled.lessons.every(row => row.scan.reachedEnd && row.discovery.state === 'ready'));
        assert.deepEqual(reconciled.lastExport, batchReceipt, 'new scans and directory reads do not rewrite a frozen prior receipt');
      }
      await page.reload(); await idle();
      await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      assert.equal(await page.evaluate(() => batchPage), other, 'the requested complete directory is restored with the active lesson');
      const [completeZIP] = await Promise.all([page.waitForEvent('download'), page.locator('#batch-course-zip').click()]);
      await completeZIP.saveAs(path.join(output, 'same-course-complete.zip')); await idle();
      const successful = await readReport('#batch-course-report', 'same-course-complete-receipt'); assert.equal(successful.lastExport.complete, true);
      assert(successful.lastExport.pageIds.length > batchReceipt.pageIds.length);
      await setHistorical({complete: false, total: 26, failures: [{code: 'NETWORK'}]});
      const larger = await readReport('#batch-course-report', 'same-course-larger-total');
      assert.equal(larger.directory.total, 26); assert.equal(larger.directory.known, 2); assert.equal(larger.directory.state, 'incomplete');
      assert.equal(larger.complete, false); assert.equal(larger.summary.directoryFailures, 1); assert.deepEqual(larger.lastExport, successful.lastExport);
    });

    await test('integrity report buttons isolate A and B, export freezes after pending saves and retains only successful receipts', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', other = base.replace('/42/', '/99/');
      const a = lesson('report-a', {page: base}), b = lesson('report-b', {page: other, course: {...course, name: '课程B'}});
      await seed({lessons: [a, b], activeId: a.id, batches: [{page: other, jobs: [{id: 'b-job', course: b.course, discovery: {state: 'ready'}}], discovery: {complete: true, total: 1}}], pages: [
        {id: 801, lessonId: a.id, order: 2048, sourceTime: 2}, {id: 802, lessonId: a.id, order: 1024, sourceTime: 1}, {id: 803, lessonId: b.id},
      ]});
      const readReport = async button => {
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
        const target = path.join(output, button.slice(1) + '.json'); await download.saveAs(target); await idle();
        return JSON.parse(fs.readFileSync(target, 'utf8'));
      };
      const current = await readReport('#course-report'); assert.deepEqual(current.lessons.map(item => item.lessonId), [a.id]);
      await page.locator('#batch-panel').evaluate(panel => { panel.open = true; });
      const batchReport = await readReport('#batch-course-report');
      assert(batchReport.lessons.some(item => item.lessonId === b.id)); assert(!batchReport.lessons.some(item => item.lessonId === a.id));
      await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put; let held = true;
        IDBObjectStore.prototype.put = function(value, key) {
          const request = put.apply(this, arguments);
          if (this.name === 'settings' && (key === 'exportNaming' || key === 'lesson:' + activeLesson.id)) {
            const keepAlive = () => { if (held) this.get('exportNaming').onsuccess = keepAlive; };
            this.get('exportNaming').onsuccess = keepAlive;
          }
          return request;
        };
        window.releaseReportNaming = () => { held = false; IDBObjectStore.prototype.put = put; };
        const create = PPTDiskCache.create; window.reportCacheStarted = false;
        PPTDiskCache.create = async (...args) => { window.reportCacheStarted = true; return create(...args); };
        window.restoreReportCache = () => { PPTDiskCache.create = create; };
        $('course-name').value = '保存后的课程A'; namingManual = true; persistNaming(); persistLesson();
        const writer = writeCoursePDF;
        writeCoursePDF = async (entries, options) => {
          window.frozenEntryIds = entries.flatMap(entry => entry.pages.map(page => page.id));
          allPages.find(page => page.id === 801).order = 1; allPages.find(page => page.id === 801).sourceTime = 99;
          return writer(entries, options);
        };
        window.restoreReportWriter = () => { writeCoursePDF = writer; };
        window.pendingReportExport = exportCoursePDF();
      });
      assert.equal(await page.evaluate(() => window.reportCacheStarted), false);
      try {
        const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => releaseReportNaming())]);
        await download.saveAs(path.join(output, 'frozen-course.pdf')); await page.evaluate(() => pendingReportExport); await idle();
        const key = await page.evaluate(() => currentCourseKey());
        const receipt = await page.evaluate(async key => {
          const tx = db.transaction('settings'), read = tx.objectStore('settings').get('courseExport:' + key);
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); }); return read.result.lastExport;
        }, key);
        assert.deepEqual(receipt.pageIds, [802, 801]); assert.deepEqual(await page.evaluate(() => frozenEntryIds), receipt.pageIds);
        assert.deepEqual(receipt.export.lessons[0].pages.map(p => p.sourceTime), [1, 2]); assert.equal(receipt.export.format, 'pdf');
        assert.match(await page.locator('#status').textContent(), /未确认到尾部.*目录.*待复核/);
        const before = structuredClone(receipt); let downloads = 0; const onDownload = () => downloads++; page.on('download', onDownload);
        await page.evaluate(async () => { writeCoursePDF = async () => { throw Error('Injected integrity export failure'); }; await exportCoursePDF(); });
        page.off('download', onDownload); assert.equal(downloads, 0);
        const after = await page.evaluate(async key => {
          const tx = db.transaction('settings'), read = tx.objectStore('settings').get('courseExport:' + key);
          await new Promise(resolve => { tx.oncomplete = resolve; }); return read.result.lastExport;
        }, key);
        assert.deepEqual(after, before); assert.match(await page.locator('#status').textContent(), /Injected integrity export failure/);
        const fresh = await readReport('#course-report'); assert.deepEqual(fresh.lastExport, before);
      } finally { await page.evaluate(() => { window.releaseReportNaming?.(); window.restoreReportCache?.(); window.restoreReportWriter?.(); }); }
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
      assert.match(await page.locator('[data-job-id="done-job"] .batch-state').textContent(), /尾部待核对 · 2 页/);
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
      assert.match(await page.locator('#status').textContent(), /未确认到尾部 5 节/);
      assert.match(await page.locator('#status').textContent(), /其中 1 节尚未完成本次扫描。旧任务尾部待核对 1 节。/);
      const readReceipt = () => page.evaluate(async () => {
        const tx = db.transaction('settings'), read = tx.objectStore('settings').get('courseExport:' + currentCourseKey());
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); }); return read.result?.lastExport;
      });
      const zipReceipt = await readReceipt(); assert.equal(zipReceipt.export.format, 'zip'); assert.deepEqual(zipReceipt.pageIds, [8, 3, 5]);
      const zipWriter = await page.evaluate(() => { window.savedZIPWriter = writeCourseZIP; writeCourseZIP = async () => { throw Error('Injected ZIP receipt failure'); }; return true; });
      try { await page.evaluate(() => exportCourseZIP()); assert.deepEqual(await readReceipt(), zipReceipt); assert.match(await page.locator('#status').textContent(), /Injected ZIP receipt failure/); }
      finally { if (zipWriter) await page.evaluate(() => { writeCourseZIP = window.savedZIPWriter; }); }
      const [merged] = await Promise.all([page.waitForEvent('download'), page.locator('#course-pdf').click()]);
      assert.equal(merged.suggestedFilename(), course.name + '-整课.pdf');
      const mergedPath = path.join(output, merged.suggestedFilename()); await merged.saveAs(mergedPath); await idle();
      const pdf = await PDFDocument.load(fs.readFileSync(mergedPath)); assert.equal(pdf.getPageCount(), 3);
      assert.equal(pdf.catalog.get(PDFName.of('PageMode')).toString(), '/UseOutlines');
      const root = pdf.catalog.lookup(PDFName.of('Outlines')), courseNode = pdf.context.lookup(root.get(PDFName.of('First')));
      assert.equal(courseNode.get(PDFName.of('Title')).decodeText(), course.name);
      const titles = []; let ref = courseNode.get(PDFName.of('First'));
      while (ref) { const node = pdf.context.lookup(ref); titles.push(node.get(PDFName.of('Title')).decodeText()); ref = node.get(PDFName.of('Next')); }
      assert.deepEqual(titles, ['第 2 课 · 2026-11-04 08:00:00', '第 3 课 · 2026-11-05 10:00:00']);
      for (const [index, image] of [1, 0, 2].entries()) {
        const embedded = pdf.getPage(index).node.Resources().lookup(PDFName.of('XObject')).lookup(PDFName.of('Im0'));
        assert.deepEqual(Buffer.from(embedded.contents), Buffer.from(images[image].split(',')[1], 'base64'));
      }
      assert.match(await page.locator('#status').textContent(), /含 2 节，共 3 页.*跳过 3 个空课次.*未确认到尾部 5 节/);
    });
    await test('library estimates stream legacy assets and use committed size metadata for new pages', async () => {
      await seed({lessons: [lesson('sizes'), lesson('empty-size')], activeId: 'empty-size', pages: [
        {id: 201, lessonId: 'sizes'}, {id: 202, lessonId: 'sizes'}, {id: 203, lessonId: 'sizes'},
      ]});
      const result = await page.evaluate(async () => {
        const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll;
        let concurrent = 0, maximum = 0, reads = 0;
        IDBObjectStore.prototype.get = function(key) {
          const request = get.call(this, key);
          if (this.name === 'assets') { reads++; maximum = Math.max(maximum, ++concurrent); request.addEventListener('success', () => { concurrent--; }); }
          return request;
        };
        IDBObjectStore.prototype.getAll = function(...args) { if (this.name === 'assets') throw Error('unbounded asset read'); return getAll.apply(this, args); };
        try {
          const estimate = await PPTPageStore.estimate(db, allPages), metadata = {lessonId: 'empty-size', order: 1024};
          await PPTPageStore.add(db, metadata, {image: new Blob(['image']), thumbnail: new Blob(['thumb']), sig: new Uint8Array(12)});
          const before = reads, known = await PPTPageStore.estimate(db, [metadata]), missing = await PPTPageStore.estimate(db, [{id: 999999}]);
          return {estimate, maximum, legacyReads: before, metadata: metadata.assetBytes, known, cachedReads: reads - before - 1, missing};
        } finally { IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.getAll = getAll; }
      });
      assert(result.estimate.bytes > 3 * 192 * 108 * 4); assert.equal(result.maximum, 1); assert.equal(result.legacyReads, 3);
      assert.equal(result.metadata, 22); assert.deepEqual(result.known, {bytes: 22, missing: 0}); assert.equal(result.cachedReads, 0);
      assert.deepEqual(result.missing, {bytes: 0, missing: 1});
      await page.locator('#library-manage').click(); await page.waitForFunction(() => $('library-status').textContent === '大小估算完成。');
      assert.match(await page.locator('[data-lesson-id="sizes"]').textContent(), /3 页.*约 .* MB/);
      assert.match(await page.locator('#library-dialog').textContent(), /截图.*缩略图.*签名/);
      await page.locator('#library-close').click();
    });
    await test('management cancellation and transaction abort preserve disk, active source, selection and undo', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', other = origin + '/study-capture-courses/99/preview-detail/a';
      const a = lesson('manage-active', {page: base}), b = lesson('manage-inactive', {page: base, source: {batchJobId: 'shared', page: base, sourceName: '2-b.mp4'}});
      const otherLesson = lesson('manage-other', {page: other, source: {batchJobId: 'shared', page: other, sourceName: '2-other.mp4'}});
      const jobs = [{id: 'shared', course, sourceName: '2-b.mp4', requiresCrop: false, selected: true, state: 'pending'}, {id: 'queued', course, requiresCrop: false, state: 'pending'}];
      await seed({lessons: [a, b, lesson('manage-empty', {page: base}), otherLesson], batches: [{page: base, jobs}, {page: other, jobs: [jobs[0]]}], pages: [
        {id: 301, lessonId: a.id}, {id: 302, lessonId: a.id}, {id: 303, lessonId: b.id}, {id: 304, lessonId: otherLesson.id},
      ]});
      await load(); await page.evaluate(async () => { await deletePages([302]); selectedPages.add(301); selectionAnchor = 301; controls(); });
      await page.waitForFunction(() => !thumbnailReads && !thumbnailQueue.size);
      await page.evaluate(async () => {
        const tx = db.transaction('assets', 'readwrite'), store = tx.objectStore('assets'), request = store.get(301);
        request.onsuccess = () => store.put({...request.result, id: 900});
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
      });
      const before = await stored(), live = await page.evaluate(() => ({active: activeLesson.id, undo: undoState, selected: [...selectedPages], anchor: selectionAnchor, source: objectURL}));
      await page.locator('#library-manage').click(); await page.locator('[data-lesson-id="manage-inactive"] button').click();
      assert.match(await page.locator('#library-confirm-text').textContent(), /模式识别.*1 节、1 页.*无法撤销/);
      await page.locator('#library-cancel-delete').click(); assert.deepEqual(await stored(), before);
      await page.locator('[data-lesson-id="manage-inactive"] button').click();
      await page.evaluate(() => {
        window.originalSettingsPut = IDBObjectStore.prototype.put; window.failedDeletionWrites = 0;
        IDBObjectStore.prototype.put = function(value, key) {
          if (this.name === 'settings' && key === 'activeLesson') return this.add(value, key);
          return window.originalSettingsPut.call(this, value, key);
        };
      });
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && $('library-status').textContent.includes('删除失败'));
      await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalSettingsPut; });
      assert.deepEqual(await stored(), before);
      assert.deepEqual(await page.evaluate(() => ({active: activeLesson.id, undo: undoState, selected: [...selectedPages], anchor: selectionAnchor, source: objectURL})), live);
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && !lessons.some(lesson => lesson.id === 'manage-inactive'));
      const after = await stored(); assert(!after.assets.some(asset => asset.id === 303)); assert(after.assets.some(asset => asset.id === 900));
      assert(after.assets.some(asset => asset.id === 302), 'unrelated active undo asset retained');
      assert.deepEqual(after.batches.find(batch => batch.page === base).jobs.map(job => job.id), ['queued']);
      assert.deepEqual(after.batches.find(batch => batch.page === other).jobs.map(job => job.id), ['shared']);
      assert.deepEqual(after.assets.filter(asset => asset.id !== 303), before.assets.filter(asset => asset.id !== 303));
      assert.deepEqual(await page.evaluate(() => ({active: activeLesson.id, undo: undoState, selected: [...selectedPages], anchor: selectionAnchor, source: objectURL})), live);
      await page.locator('#library-close').click(); await page.locator('#undo').click(); await count(2);
      await page.reload(); await count(2); assert(!(await stored()).lessons.some(lesson => lesson.id === 'manage-inactive'));
      await page.evaluate(async ({base, jobs}) => {
        coursePage = base;
        chrome.tabs = {sendMessage: async () => ({ok: true, page: base, jobs, total: jobs.length, eligible: jobs.length})};
        await discoverBatch(1);
      }, {base, jobs});
      const rediscovered = await stored();
      assert(!rediscovered.lessons.some(lesson => lesson.id === 'manage-inactive')); assert(!rediscovered.pages.some(page => page.id === 303));
      assert(!rediscovered.assets.some(asset => asset.id === 303));
      assert.equal(rediscovered.batches.find(batch => batch.page === base).jobs.find(job => job.id === 'shared').state, 'pending');
    });
    await test('active, empty and whole-course deletion release transient state without resurrecting history', async () => {
      await load(); await page.evaluate(async () => { await deletePages([302]); selectedPages.add(301); selectionAnchor = 301; controls(); });
      await page.locator('#library-manage').click(); await page.locator('[data-lesson-id="manage-active"] button').click();
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && !lessons.some(lesson => lesson.id === 'manage-active'));
      assert.deepEqual(await page.evaluate(() => ({ready: sourceReady, url: objectURL, cache: videoCache, undo: undoState, selected: [...selectedPages], anchor: selectionAnchor, preview: previewURL, thumbnails: thumbnailStates.size})),
        {ready: false, url: null, cache: null, undo: null, selected: [], anchor: null, preview: null, thumbnails: 0});
      const after = await stored(); assert(!after.assets.some(asset => [301, 302].includes(asset.id))); assert(!after.pages.some(page => [301, 302].includes(page.id)));
      await page.locator('[data-lesson-id="manage-empty"] button').click(); assert.match(await page.locator('#library-confirm-text').textContent(), /1 节、0 页/);
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && !lessons.some(lesson => lesson.id === 'manage-empty'));
      await page.locator('#library-close').click(); await page.reload(); await count(1);
      assert.deepEqual((await stored()).lessons.map(lesson => lesson.id), ['manage-other']);
      await page.locator('#library-manage').click(); await page.locator('.library-course > button').click();
      assert.match(await page.locator('#library-confirm-text').textContent(), /整门课程.*模式识别.*1 节、1 页/);
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && lessons.length === 0);
      const empty = await stored(); assert.deepEqual(empty.pages, []); assert.deepEqual(empty.lessons, []); assert.equal(empty.activeId, '');
      assert(!empty.batches.some(batch => batch.page.includes('/99/')));
      await page.locator('#library-close').click(); await page.reload(); await count(0); assert.equal(await page.locator('#library-manage').isDisabled(), false);
    });
    await test('whole-course deletion removes all lessons and course batch snapshots including queued references', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', sibling = base.replace('/a', '/b'), other = base.replace('/42/', '/99/');
      const jobs = [{id: 'queued', course, requiresCrop: false, state: 'pending', selected: true}];
      await seed({lessons: [lesson('course-a', {page: base}), lesson('course-b', {page: sibling}), lesson('course-empty', {page: base}), lesson('course-other', {page: other})],
        batches: [{page: base, jobs}, {page: sibling, jobs}, {page: other, jobs}], pages: [{id: 341, lessonId: 'course-a'}, {id: 342, lessonId: 'course-b'}, {id: 343, lessonId: 'course-other'}]});
      await page.locator('#library-manage').click(); await page.locator('.library-course:has([data-lesson-id="course-a"]) > button').click();
      assert.match(await page.locator('#library-confirm-text').textContent(), /整门课程.*3 节、2 页/);
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && lessons.length === 1);
      const saved = await stored(); assert.deepEqual(saved.lessons.map(lesson => lesson.id), ['course-other']);
      assert.deepEqual(saved.pages.map(page => page.id), [343]); assert.deepEqual(saved.assets.map(asset => asset.id), [343]);
      assert.deepEqual(saved.batches.map(batch => batch.page), [other]);
      await page.locator('#library-close').click(); await page.reload(); await count(1);
    });
    await test('committed library deletion reports cleanup failure honestly and retains unrelated assets', async () => {
      await seed({lessons: [lesson('cleanup-active'), lesson('cleanup-retained')], pages: [{id: 351, lessonId: 'cleanup-active'}, {id: 352, lessonId: 'cleanup-retained'}]});
      await load();
      await page.evaluate(() => {
        const release = releaseSource;
        releaseSource = async () => { await release(); throw Error('synthetic cache release failure'); };
      });
      await page.locator('#library-manage').click(); await page.locator('[data-lesson-id="cleanup-active"] button').click();
      await page.locator('#library-delete').click(); await page.waitForFunction(() => !libraryWriting && $('library-status').textContent.includes('synthetic cache release failure'));
      assert.match(await page.locator('#library-status').textContent(), /已永久删除.*缓存释放失败/);
      const saved = await stored(); assert.deepEqual(saved.lessons.map(lesson => lesson.id), ['cleanup-retained']); assert.equal(saved.activeId, 'cleanup-retained');
      assert.deepEqual(saved.pages.map(page => page.id), [352]); assert.deepEqual(saved.assets.map(asset => asset.id), [352]);
      await page.locator('#library-close').click(); await page.reload(); await count(1);
    });
    await test('crop reuse waits for pending naming before saving the source lesson and related batch', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/naming', other = base.replace('/42/', '/99/');
      const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const jobs = ['naming-source', 'naming-target'].map((id, index) => ({id, course: {...course, date: `2026-11-${10 + index}`},
        url: url + '?id=' + id, sourceName: '0-' + id + '.mp4', requiresCrop: true, selected: false, cropConfirmed: false,
        state: 'needs-crop', options: [{url: url + '?id=' + id, sourceName: '0-' + id + '.mp4'}]}));
      const retained = jobs.map(job => lesson(job.id, {course: job.course, page: base, namingManual: false,
        source: {kind: 'remote', batchJobId: job.id, page: base, sourceKey: 'url:' + job.url, sourceName: job.sourceName}}));
      const unrelated = lesson('naming-unrelated', {page: other, source: {kind: 'file', sourceKey: 'unrelated', page: other}});
      await seed({lessons: [...retained, unrelated], pages: [{id: 601, lessonId: unrelated.id}],
        batches: [{page: base, jobs}, {page: other, jobs: [{...jobs[1], id: 'unrelated-job'}]}]});
      const expectedCrop = {x: .1, y: .2, w: .6, h: .6};
      await page.evaluate(async ({base, expectedCrop}) => {
        batchPage = base; batchJobs = structuredClone(savedBatches.find(batch => batch.page === base).jobs);
        chrome.permissions = {request: async () => true}; renderBatchJobs();
        await prepareManualBatchJob(batchJobs[0], Promise.resolve(true));
        await setComparisonRegion(expectedCrop, null, 'crop', true);
      }, {base, expectedCrop});
      await settled();
      const before = await stored(), sourceId = await page.evaluate(() => activeLesson.id);
      const sourceBefore = before.lessons.find(item => item.id === sourceId);
      assert.equal(sourceBefore.namingManual, false);
      await page.evaluate(() => {
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
      const renamed = {name: '手工修改后的模式识别', date: '2026-12-03', start: '14:25:00'};
      try {
        await page.locator('#tab-export').click();
        // One real input event snapshots all fields; later queued renames must not mask a stale reuse write.
        await page.locator('#course-date').evaluate((input, value) => { input.value = value; }, renamed.date);
        await page.locator('#course-start').evaluate((input, value) => { input.value = value; }, renamed.start);
        await page.locator('#course-name').fill(renamed.name);
        await page.waitForFunction(() => !!window.releaseNaming);
        assert.deepEqual(await page.evaluate(() => namingInfo()), renamed);
        assert.deepEqual(await page.evaluate(() => ({course: activeLesson.course, namingManual: activeLesson.namingManual})),
          {course: sourceBefore.course, namingManual: false}, 'queued naming writes have not published to the live lesson');
        await page.locator('#tab-extraction').click(); await page.locator('#crop-reuse').click();
        assert.match(await page.locator('#crop-reuse-summary').textContent(), /本课程 1 个课次/);
        await page.locator('#crop-reuse-agree').check(); await page.locator('#crop-reuse-apply').click();
        assert.equal(await page.evaluate(() => cropReuseWriting), true);
        assert.equal(await page.locator('#crop-reuse-apply').isDisabled(), true);
        assert.equal(await page.evaluate(() => batchJobs.find(job => job.id === 'naming-target').cropOverride), undefined,
          'pending naming cannot publish a target crop override');
      } finally { await page.evaluate(() => window.releaseNaming?.()); }
      await settled();
      const after = await stored(), sourceAfter = after.lessons.find(item => item.id === sourceId);
      assert.deepEqual(sourceAfter, {...sourceBefore, course: renamed, namingManual: true});
      assert.deepEqual(after.lessons.filter(item => item.id !== sourceId), before.lessons.filter(item => item.id !== sourceId));
      assert.deepEqual(after.pages, before.pages); assert.deepEqual(after.assets, before.assets);
      const expectedBatch = structuredClone(before.batches.find(item => item.page === base));
      const target = expectedBatch.jobs.find(job => job.id === 'naming-target');
      Object.assign(target, {cropOverride: {crop: expectedCrop, aspect: 640 / 360, track: await page.evaluate(() => PPTBatch.trackKey(batchJobs.find(job => job.id === 'naming-target'))), manual: false},
        cropConfirmed: true, cropRejected: false, selected: true, state: 'pending', error: ''});
      assert.deepEqual(after.batches.find(item => item.page === base), expectedBatch);
      assert.deepEqual(after.batches.find(item => item.page === other), before.batches.find(item => item.page === other));
      await page.reload(); await idle();
      assert.deepEqual(await page.evaluate(() => ({course: activeLesson.course, namingManual: activeLesson.namingManual, input: namingInfo()})),
        {course: renamed, namingManual: true, input: renamed});
      assert.deepEqual(await stored(), after);
    });
    await test('same-camera confirmation atomically reuses crop only for unfinished unprepared zero-track lessons', async () => {
      const base = origin + '/study-capture-courses/42/preview-detail/a', other = base.replace('/42/', '/99/');
      const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
      const jobs = ['source', 'target', 'stopped', 'failed', 'done', 'manual'].map((id, index) => ({id, course: {...course, date: `2026-11-${10 + index}`},
        url: url + '?id=' + id + '&token=old', sourceName: '0-' + id + '.mp4', requiresCrop: true, selected: false, cropConfirmed: false,
        state: ['stopped', 'failed', 'done', 'manual'].includes(id) ? id : 'needs-crop', ...(id === 'manual' ? {manualPrepared: true} : {}),
        options: [{url: url + '?id=' + id + '&token=old', sourceName: '0-' + id + '.mp4'}]}));
      const smaller = origin + '/' + path.relative(root, resized).split(path.sep).join('/') + '?id=target&token=old';
      jobs[1].url = smaller; jobs[1].options[0].url = smaller;
      await seed({batches: [{page: base, jobs}, {page: other, jobs: [{...jobs[1], id: 'other-course'}]}]});
      await page.evaluate(async base => {
        batchPage = base; batchJobs = structuredClone(savedBatches.find(batch => batch.page === base).jobs);
        chrome.permissions = {request: async () => true}; renderBatchJobs();
        await prepareManualBatchJob(batchJobs[0], Promise.resolve(true));
        await setComparisonRegion({x: .1, y: .2, w: .6, h: .6}, null, 'crop', true);
      }, base);
      await idle(); await page.locator('#tab-extraction').click();
      assert.equal(await page.locator('#crop-reuse').isEnabled(), true);
      const before = await stored(); await page.locator('#crop-reuse').click();
      assert.match(await page.locator('#crop-reuse-summary').textContent(), /本课程 3 个课次/);
      assert.equal(await page.locator('#crop-reuse-apply').isDisabled(), true);
      assert.equal(await page.locator('#library-manage').isDisabled(), true);
      await page.locator('#crop-reuse-cancel').click(); assert.deepEqual(await stored(), before);
      await page.locator('#crop-reuse').click(); await page.locator('#crop-reuse-agree').check();
      await page.evaluate(() => {
        window.cropOriginalPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
          if (this.name === 'settings' && key === 'batch:' + batchPage) return this.add(value, 'lesson:' + activeLesson.id);
          return window.cropOriginalPut.call(this, value, key);
        };
      });
      await page.locator('#crop-reuse-apply').click(); await page.waitForFunction(() => !cropReuseWriting && $('crop-reuse-status').textContent.includes('保存失败'));
      await page.evaluate(() => { IDBObjectStore.prototype.put = window.cropOriginalPut; });
      assert.deepEqual(await stored(), before); assert.equal(await page.evaluate(() => batchJobs.some(job => job.cropOverride?.manual === false)), false);
      await page.locator('#crop-reuse-apply').click(); await idle();
      const after = await stored(), saved = after.batches.find(batch => batch.page === base).jobs;
      for (const id of ['target', 'stopped', 'failed']) {
        const job = saved.find(job => job.id === id); assert.deepEqual(job.cropOverride.crop, {x: .1, y: .2, w: .6, h: .6});
        assert.equal(job.cropOverride.aspect, 640 / 360); assert.equal(job.cropOverride.manual, false); assert.equal(job.selected, true);
        assert.equal(job.cropConfirmed, true); assert.equal(job.state, 'pending');
      }
      for (const id of ['done', 'manual']) assert.deepEqual(saved.find(job => job.id === id), before.batches.find(batch => batch.page === base).jobs.find(job => job.id === id));
      assert.deepEqual(after.batches.find(batch => batch.page === other), before.batches.find(batch => batch.page === other));
      await page.locator('#crop-reuse').click(); await page.locator('#crop-reuse-agree').check();
      await page.evaluate(() => { window.cropRenderBatch = renderBatchJobs; renderBatchJobs = () => { throw Error('synthetic crop render failure'); }; });
      await page.locator('#crop-reuse-apply').click(); await page.waitForFunction(() => !cropReuseWriting && $('status').textContent.includes('synthetic crop render failure'));
      assert.match(await page.locator('#status').textContent(), /复用设置已保存.*界面更新失败/);
      await page.evaluate(() => { renderBatchJobs = window.cropRenderBatch; });
      assert.deepEqual((await stored()).batches, after.batches);
      await page.reload(); await idle();
      assert.deepEqual((await stored()).batches.find(batch => batch.page === base), after.batches.find(batch => batch.page === base));
    });
    await test('rediscovery retains overrides through signed URL refresh and stop or failure', async () => {
      const first = await page.evaluate(async () => {
        const original = structuredClone(batchJobs.filter(job => ['target', 'stopped', 'failed'].includes(job.id)).map(job => job.cropOverride));
        const discovered = batchJobs.map(job => ({...job, url: job.url.replace('token=old', 'token=new'),
          options: job.options.map(item => ({...item, url: item.url.replace('token=old', 'token=new')})), cropConfirmed: false, cropOverride: undefined, state: 'needs-crop'}));
        coursePage = batchPage;
        chrome.tabs = {sendMessage: async () => ({ok: true, page: batchPage, jobs: discovered})};
        chrome.permissions = {request: async () => true};
        await discoverBatch(1);
        const after = batchJobs.filter(job => ['target', 'stopped', 'failed'].includes(job.id));
        window.cropScan = PPTScanner.prototype.scan; window.observedCrops = []; window.observedDimensions = [];
        PPTScanner.prototype.scan = async function() { window.observedCrops.push({...crop}); window.observedDimensions.push([video.videoWidth, video.videoHeight]); $('stop').click(); throw new DOMException('synthetic stop', 'AbortError'); };
        await runBatch(Promise.resolve(true));
        PPTScanner.prototype.scan = window.cropScan;
        return {original, overrides: after.map(job => job.cropOverride), confirmed: after.map(job => job.cropConfirmed), observed: window.observedCrops, dimensions: window.observedDimensions, target: batchJobs.find(job => job.id === 'target').state};
      });
      assert.deepEqual(first.overrides, first.original); assert.deepEqual(first.confirmed, [true, true, true]);
      assert.deepEqual(first.observed, [{x: .1, y: .2, w: .6, h: .6}]); assert.equal(first.target, 'stopped');
      assert.deepEqual(first.dimensions, [[320, 180]], 'normalized 640×360 source crop is reused on a real 320×180 target');
      await page.reload(); await idle();
      const second = await page.evaluate(async () => {
        chrome.permissions = {request: async () => true};
        const original = structuredClone(batchJobs.filter(job => ['target', 'stopped', 'failed'].includes(job.id)).map(job => job.cropOverride));
        const scan = PPTScanner.prototype.scan; let calls = 0;
        PPTScanner.prototype.scan = async function() { calls++; throw Error('synthetic extraction failure'); };
        try { await runBatch(Promise.resolve(true)); } finally { PPTScanner.prototype.scan = scan; }
        const jobs = batchJobs.filter(job => ['target', 'stopped', 'failed'].includes(job.id));
        return {original, overrides: jobs.map(job => job.cropOverride), states: jobs.map(job => job.state), calls};
      });
      assert.deepEqual(second.overrides, second.original); assert.deepEqual(second.states, ['failed', 'failed', 'failed']); assert.equal(second.calls, 3);
      await page.reload(); await idle();
      assert.deepEqual(await page.evaluate(() => batchJobs.filter(job => ['target', 'stopped', 'failed'].includes(job.id)).map(job => job.cropOverride)), second.original);
    });
    await test('actual target loads reject mismatched aspect and identity to manual crop before any scan', async () => {
      const result = await page.evaluate(async () => {
        chrome.permissions = {request: async () => true};
        const target = batchJobs.find(job => job.id === 'target'), stopped = batchJobs.find(job => job.id === 'stopped'), failed = batchJobs.find(job => job.id === 'failed');
        target.cropOverride.aspect = 4 / 3;
        stopped.cropOverride.track = PPTBatch.trackKey({...stopped, url: stopped.url.replace('id=stopped', 'id=other-recording')});
        failed.cropOverride.crop = {x: .8, y: 0, w: .5, h: 1};
        const expected = structuredClone([target, stopped, failed].map(job => job.cropOverride));
        await persistBatch(); const scan = PPTScanner.prototype.scan; let calls = 0;
        PPTScanner.prototype.scan = async () => { calls++; throw Error('must not scan'); };
        try { await runBatch(Promise.resolve(true)); } finally { PPTScanner.prototype.scan = scan; }
        return {calls, expected, jobs: [target, stopped, failed].map(job => ({state: job.state, confirmed: job.cropConfirmed, selected: job.selected, rejected: job.cropRejected, override: job.cropOverride}))};
      });
      assert.equal(result.calls, 0);
      for (const [index, job] of result.jobs.entries()) {
        assert.equal(job.state, 'needs-crop'); assert.equal(job.confirmed, false); assert.equal(job.selected, false); assert.equal(job.rejected, true);
        assert.deepEqual(job.override, result.expected[index], 'invalid override retained for inspection and manual adjustment');
      }
      await page.reload(); await idle();
      assert.deepEqual(await page.evaluate(() => batchJobs.filter(job => ['target', 'stopped', 'failed'].includes(job.id)).map(job => job.cropOverride)), result.expected);
      const adjusted = await page.evaluate(async () => {
        const job = batchJobs.find(job => job.id === 'target');
        await prepareManualBatchJob(job, Promise.resolve(true));
        await setComparisonRegion({x: .2, y: .1, w: .5, h: .7}, null, 'crop', true);
        const scan = PPTScanner.prototype.scan; let observed;
        PPTScanner.prototype.scan = async () => { observed = {...crop}; return {complete: true, suspects: []}; };
        try { await fastScan(); } finally { PPTScanner.prototype.scan = scan; }
        return {observed, override: job.cropOverride, confirmed: job.cropConfirmed, rejected: job.cropRejected};
      });
      assert.deepEqual(adjusted.observed, {x: .2, y: .1, w: .5, h: .7}); assert.equal(adjusted.override.manual, true);
      assert.equal(adjusted.override.aspect, 640 / 360); assert.equal(adjusted.confirmed, true); assert.equal(adjusted.rejected, false);
    });
    await test('reopened crop adjustments belong to the saved batch independently of the displayed batch', async () => {
      for (const sameCourse of [false, true]) {
        const a = origin + '/study-capture-courses/42/preview-detail/a', b = sameCourse ? a.replace('/a', '/b') : a.replace('/42/', '/99/');
        const url = origin + '/' + path.relative(root, fixture).split(path.sep).join('/');
        const oldCrop = {x: .1, y: .1, w: .7, h: .7}, adjusted = {x: .2, y: .2, w: .5, h: .5};
        const jobs = [a, b].map((page, index) => ({id: sameCourse ? 'job-' + index : 'shared', course, url: url + '?id=' + index, sourceName: '0-camera.mp4', requiresCrop: true,
          state: 'pending', selected: true, cropConfirmed: true, options: [], cropOverride: {crop: oldCrop, aspect: 640 / 360, manual: false}}));
        const savedLessons = [a, b].map((page, index) => lesson('owner-' + index, {page, crop: oldCrop, source: {kind: 'remote', batchJobId: jobs[index].id, page,
          coursePage: page, url: jobs[index].url, sourceKey: 'url:' + jobs[index].url, sourceName: jobs[index].sourceName}}));
        await seed({lessons: savedLessons, batches: [{page: a, jobs: [jobs[0]]}, {page: b, jobs: [jobs[1]]}]});
        await page.evaluate(async () => {
          chrome.permissions = {request: async () => true};
          for (const snapshot of savedBatches) {
            const job = snapshot.jobs[0]; job.cropOverride.track = PPTBatch.trackKey(job);
            await PPTLibrary.batch(db, snapshot.page, snapshot.jobs);
          }
          batchJobs = structuredClone(savedBatches.find(item => item.page === batchPage).jobs);
        });
        await choose('owner-1'); await page.locator('#resume-load').click(); await page.waitForFunction(() => sourceReady && !busy());
        assert.equal(await page.evaluate(async a => {
          const active = activeBatchJob, jobs = structuredClone(batchJobs);
          coursePage = a;
          chrome.tabs = {sendMessage: async () => ({ok: true, page: a, jobs, total: jobs.length, eligible: jobs.length})};
          await discoverBatch(1);
          return activeBatchJob === active;
        }, a), true, 'refreshing displayed A preserves loaded B ownership');
        const before = await stored();
        const retained = await page.evaluate(() => structuredClone(savedBatches));
        assert.equal(await page.evaluate(() => batchPage), a, 'reopening B leaves displayed batch A intact');
        await page.evaluate(async ({b, adjusted}) => {
          const put = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function(value, key) {
            if (this.name === 'settings' && key === 'batch:' + b) return this.add(value, 'lesson:' + activeLesson.id);
            return put.call(this, value, key);
          };
          try { await setComparisonRegion(adjusted, null, 'adjusted', true); } finally { IDBObjectStore.prototype.put = put; }
        }, {b, adjusted});
        assert.match(await page.locator('#status').textContent(), /范围保存失败/);
        assert.deepEqual(await stored(), before, 'owning-batch failure atomically rolls back lesson and both batches');
        assert.deepEqual(await page.evaluate(() => savedBatches), retained, 'failed save does not publish the owning snapshot');
        assert.deepEqual(await page.evaluate(() => crop), oldCrop);
        await page.evaluate(async adjusted => {
          await setComparisonRegion(adjusted, null, 'adjusted', true); saveLessonSettings(); await lessonSave;
          const scan = PPTScanner.prototype.scan;
          PPTScanner.prototype.scan = async () => ({saved: 0});
          try { await fastScan(); } finally { PPTScanner.prototype.scan = scan; }
        }, adjusted);
        const saved = await stored();
        assert.equal(saved.batches.find(item => item.page === b).jobs[0].state, 'done', 'manual scan status persists to B while A is displayed');
        assert.deepEqual(saved.lessons.find(item => item.id === 'owner-1').crop, adjusted);
        assert.deepEqual(saved.batches.find(item => item.page === b).jobs[0].cropOverride.crop, adjusted);
        assert.deepEqual(saved.batches.find(item => item.page === a), before.batches.find(item => item.page === a));
        assert.equal(await page.evaluate(() => batchPage), a);
        await page.reload(); await idle(); await page.evaluate(() => { chrome.permissions = {request: async () => true}; });
        await page.locator('#resume-load').click(); await page.waitForFunction(() => sourceReady && !busy());
        assert.deepEqual(await page.evaluate(() => crop), adjusted);
        assert.deepEqual((await stored()).batches.find(item => item.page === b).jobs[0].cropOverride.crop, adjusted);
      }
    });
    await test('final manual preparation save failure retains the loaded zero-track crop guard', async () => {
      for (const rejected of [false, true]) {
        const base = origin + '/study-capture-courses/42/preview-detail/a';
        const job = {id: 'guard', course, url: origin + '/' + path.relative(root, fixture).split(path.sep).join('/'), sourceName: '0-guard.mp4',
          requiresCrop: true, cropConfirmed: false, state: 'needs-crop', selected: false, options: []};
        await seed({batches: [{page: base, jobs: [job]}]});
        const result = await page.evaluate(async rejected => {
          const job = batchJobs[0];
          if (rejected) job.cropOverride = {crop: {x: .1, y: .1, w: .5, h: .5}, aspect: 4 / 3, track: PPTBatch.trackKey(job), manual: false};
          await persistBatch();
          const save = PPTLibrary.batch, scan = PPTScanner.prototype.scan; let failures = 0, calls = 0;
          PPTLibrary.batch = async (db, page, jobs) => {
            if (jobs.some(item => item.state === 'manual')) { failures++; throw Error('final manual save failure'); }
            return save(db, page, jobs);
          };
          try { await prepareManualBatchJob(job, Promise.resolve(true)); } finally { PPTLibrary.batch = save; }
          const afterFailure = {ready: sourceReady, job: activeBatchJob && structuredClone(activeBatchJob), message: $('batch-status').textContent};
          PPTScanner.prototype.scan = async () => { calls++; return {saved: 0}; };
          try {
            await fastScan(); const blocked = calls;
            await setComparisonRegion({x: .2, y: .2, w: .5, h: .5}, null, 'explicit confirmation', true);
            await fastScan();
            return {failures, afterFailure, blocked, calls};
          } finally { PPTScanner.prototype.scan = scan; }
        }, rejected);
        assert.equal(result.failures, 1); assert.match(result.afterFailure.message, /final manual save failure/);
        assert.equal(result.blocked, 0, 'Start cannot enter scanner after only the final save fails');
        assert.equal(result.afterFailure.ready, true); assert.equal(result.afterFailure.job.cropConfirmed, false);
        assert.equal(Object.hasOwn(result.afterFailure.job, 'manualPrepared'), false, 'failed preparation does not publish new flags');
        if (rejected) assert.equal(result.afterFailure.job.cropRejected, true);
        assert.equal(result.calls, 1, 'explicit crop confirmation permits retry');
        await page.reload(); await idle();
        assert.deepEqual((await stored()).batches[0].jobs[0].cropOverride.crop, {x: .2, y: .2, w: .5, h: .5});
      }
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
    if (page && !page.isClosed()) await page.evaluate(async () => { if (typeof task !== 'undefined') task?.abort(); if (typeof releaseSource === 'function') await releaseSource(); }).catch(() => {});
    if (context) await context.close(); if (browser) await browser.close();
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
})();
