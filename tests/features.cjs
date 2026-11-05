/* Installed-extension feature acceptance: synthetic local fixtures, never a real browser profile. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const {spawnSync} = require('node:child_process'), {createHash} = require('node:crypto');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright'), sharp = dependency('sharp');
const root = path.resolve(__dirname, '..'), reportRoot = path.join(root, '.test-output', 'v3.0.1');
fs.mkdirSync(reportRoot, {recursive: true});
const output = fs.mkdtempSync(path.join(reportRoot, 'features-'));
const github = 'https://api.github.com/repos/MeowSaint/XJTU-PPT-Capture-Extension/releases/latest';
const repository = 'https://github.com/MeowSaint/XJTU-PPT-Capture-Extension';
const campus = 'https://rms-v5.xjtu.edu.cn', courseURL = code => `${campus}/my-capture-courses/16220/preview-detail/${code}`;
const results = [], errors = [], unexpected = [], requests = [], updateRequests = [], keyboardTrace = [], timers = new Set();
const pending = {old: [], update: [], load: []};
const consentKey = 'ppt-study-consent', updateKey = 'ppt-update-state';
let context, server, worker, temp, extensionOrigin, origin, alternate, updateOrigin, retained, initialActive = 0, initialPeak = 0;
const copiedHashes = {}, finalHashes = {};
let updateMode = 'current', holdUpdate = false, holdLoad = false, fixturePhase = 'initial';
const transport = 'Temporary background fetch wrapper substitutes ONLY the exact fixed GitHub API URL with local /__update, forwarding the original fetch options. PPTState parsing/cache/storage and serialized background messages are unchanged. Chromium service-worker fetches bypass Playwright context.route.';
async function until(check, message, timeout = 10000) {
  const start = Date.now();
  while (!await check()) { if (Date.now() - start > timeout) throw Error(message); await new Promise(resolve => setTimeout(resolve, 40)); }
}
async function test(name, body) {
  try { await body(); results.push({name, status: 'pass'}); console.log('PASS ' + name); }
  catch (error) { results.push({name, status: 'fail', error: error.stack}); throw error; }
}
function release(kind) { for (const finish of pending[kind].splice(0)) finish(); }
function later(fn, ms) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); }
function sources(phase) {
  if (phase === 'old') return ['late', 'second', 'queued'].map(name => `${origin}/old/${name}.mp4`);
  if (phase === 'permission') return [`${alternate}/permission/video.mp4`];
  if (phase === 'fresh') return [`${origin}/fresh/video.mp4`];
  return ['video.mp4', 'lecture.m3u8', 'login.mp4', 'data.mp4', 'unknown.mp4'].map(name => `${origin}/initial/${name}`);
}
function releaseJSON() {
  const tag = updateMode === 'prerelease' ? 'v9.0.0-beta.1' : updateMode === 'current' ? 'v3.0.1' : 'v3.10.0';
  return {tag_name: tag, draft: false, prerelease: updateMode === 'prerelease', published_at: '2026-11-05T00:00:00Z',
    html_url: `${repository}/releases/tag/${tag}`, assets: [{name: 'ppt-capture.zip', browser_download_url: `${repository}/releases/download/${tag}/ppt-capture.zip`}]};
}
async function setup() {
  const fixture = path.join(output, 'local-fixture.mp4');
  const video = spawnSync(process.env.PPT_TEST_FFMPEG || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=3:size=640x360:rate=10', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '10', '-movflags', '+faststart', fixture], {encoding: 'utf8'});
  assert.equal(video.status, 0, video.stderr || video.error?.message);
  const hls = spawnSync(process.env.PPT_TEST_FFMPEG || 'ffmpeg', ['-y', '-v', 'error', '-stream_loop', '7', '-i', fixture, '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(output, 'local-segment%02d.ts'), path.join(output, 'local-fixture.m3u8')], {encoding: 'utf8'});
  assert.equal(hls.status, 0, hls.stderr || hls.error?.message);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#f8f5ef"/><rect x="35" y="40" width="570" height="80" fill="#a52a35"/><text x="55" y="92" fill="white" font-family="sans-serif" font-size="29">LOCAL TEST FIXTURE</text><text x="55" y="190" font-family="sans-serif" font-size="25">Synthetic retained page</text></svg>';
  const jpeg = await sharp(Buffer.from(svg)).jpeg().toBuffer(); fs.writeFileSync(path.join(output, 'local-retained-page.jpg'), jpeg);
  retained = {id: 42, order: 1024, data: 'data:image/jpeg;base64,' + jpeg.toString('base64'), w: 640, h: 360, time: 1793808000000,
    sourceName: 'LOCAL TEST FIXTURE', course: {name: 'Local fixture', date: '2026-11-05', start: '08:00:00'}, coursePage: ''};
  const mp4 = fs.readFileSync(fixture);
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const record = {path: pathname, method: req.method, range: req.headers.range || '', cookie: req.headers.cookie || '', referer: req.headers.referer || ''};
    if (pathname === '/__update') {
      updateRequests.push(record);
      const send = () => { if (!res.destroyed) { res.writeHead(updateMode === 'offline' ? 503 : 200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(releaseJSON())); } };
      if (holdUpdate) pending.update.push(send); else send(); return;
    }
    requests.push(record);
    const probing = req.headers.range === 'bytes=0-65535';
    if (probing && pathname.startsWith('/initial/')) {
      initialPeak = Math.max(initialPeak, ++initialActive);
      res.once('close', () => { initialActive--; });
    }
    const send = () => {
      if (res.destroyed) return;
      let bytes = mp4, type = 'video/mp4';
      if (pathname.endsWith('/login.mp4')) bytes = Buffer.from('<!doctype html><html><title>Fixture login</title><form>Sign in</form></html>');
      else if (pathname.endsWith('/data.mp4')) bytes = Buffer.from('{"error":"fixture login required"}');
      else if (pathname.endsWith('/unknown.mp4')) { bytes = Buffer.from([0, 3, 8, 17, 42, 99, 255]); type = 'application/octet-stream'; }
      else if (pathname.endsWith('.m3u8')) { bytes = Buffer.from(fs.readFileSync(path.join(output, 'local-fixture.m3u8'), 'utf8').replace(/^local-segment/gm, `${alternate}/local-segment`)); type = 'application/vnd.apple.mpegurl'; }
      else if (/\/local-segment\d+\.ts$/.test(pathname)) { bytes = fs.readFileSync(path.join(output, path.basename(pathname))); type = 'video/mp2t'; }
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      let status = 200, start = 0, end = bytes.length - 1;
      if (range) { status = 206; start = Number(range[1]); end = Math.min(end, range[2] ? Number(range[2]) : end); }
      if (start > end) { res.writeHead(416, {'Content-Range': `bytes */${bytes.length}`}); res.end(); return; }
      res.writeHead(status, {'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? {'Content-Range': `bytes ${start}-${end}/${bytes.length}`} : {})});
      res.end(bytes.subarray(start, end + 1));
    };
    if (pathname.startsWith('/old/')) pending.old.push(send);
    else if (pathname === '/slow-load.mp4' && !probing && holdLoad) pending.load.push(send);
    else later(send, probing ? 180 : 0);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`; alternate = `http://localhost:${server.address().port}`; updateOrigin = `http://updates.test:${server.address().port}`;
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-features-')); const ext = path.join(temp, 'extension'); fs.mkdirSync(ext);
  for (const name of ['manifest.json', 'background.js', 'media.js', 'course.js', 'batch.js', 'page-hook.js', 'content.js', 'capture.html', 'capture.js', 'page-store.js', 'disk-cache.js', 'scanner.js', 'style.css', 'pdf.js', 'extension-state.js', 'preflight.js', 'workspace.js', 'vendor', 'icons']) {
    fs.cpSync(path.join(root, name), path.join(ext, name), {recursive: true});
    if (fs.statSync(path.join(ext, name)).isFile()) copiedHashes[name] = createHash('sha256').update(fs.readFileSync(path.join(ext, name))).digest('hex');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('http://127.0.0.1/*', 'http://localhost/*', 'http://updates.test/*'); fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));
  // Only transport changes in the disposable copy: the real update parser, cache and queue still run.
  const prefix = `const fixtureFetch = globalThis.fetch.bind(globalThis); globalThis.fetch = (input, init) => fixtureFetch((typeof input === 'string' ? input : input.url) === ${JSON.stringify(github)} ? ${JSON.stringify(updateOrigin + '/__update')} : input, init);\n`;
  fs.writeFileSync(path.join(ext, 'background.js'), prefix + fs.readFileSync(path.join(ext, 'background.js'), 'utf8'));
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {...browserOptions(), viewport: {width: 1440, height: 900}, reducedMotion: 'reduce',
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--disable-background-networking', '--host-resolver-rules=MAP updates.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', '--no-proxy-server']});
  const track = page => page.on('pageerror', error => errors.push({url: page.url(), error: error.stack || error.message}));
  context.pages().forEach(track); context.on('page', track);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (['chrome-extension:', 'blob:', 'data:', 'about:'].includes(url.protocol) || url.origin === origin || url.origin === alternate || url.origin === updateOrigin) return route.continue();
    if (url.origin === campus) {
      if (url.pathname.startsWith('/api/')) {
        requests.push({path: url.pathname, courseAPI: true});
        return route.fulfill({contentType: 'application/json', body: JSON.stringify({data: {courseName: 'Local fixture course', lesson_videos: sources(fixturePhase).map((download_url, index) => ({label: 'ENCODER', file_key: `${index}-fixture.mp4`, download_url}))}})});
      }
      return route.fulfill({contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><title>Local fixture course</title><h1 class="course-title">Local fixture course</h1><p>2026.11.05 08:00 - 09:00</p>${sources(fixturePhase).map(url => `<a href="${url}">LOCAL TEST FIXTURE</a>`).join('')}`});
    }
    unexpected.push(req.url()); return route.abort('blockedbyclient');
  });
  context.on('request', req => {
    if (!/^(?:https?|wss?):/.test(req.url())) return;
    const url = new URL(req.url());
    if (![origin, alternate, updateOrigin, campus].includes(url.origin)) unexpected.push(req.url());
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  worker.on('console', message => { if (message.type() === 'error') errors.push({worker: true, error: message.text()}); });
  extensionOrigin = worker.url().replace(/\/background\.js$/, '');
  await context.addCookies([origin, alternate, updateOrigin].map(url => ({name: 'ppt_fixture', value: 'local-only', url, sameSite: 'Lax'})));
  await worker.evaluate(record => new Promise((resolve, reject) => {
    const request = indexedDB.open('course-ppt', 2);
    request.onupgradeneeded = () => { request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true}); request.result.createObjectStore('settings'); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction(['pages', 'settings'], 'readwrite'); tx.objectStore('pages').put(record); tx.objectStore('settings').put({course: record.course, page: '', manual: true}, 'exportNaming'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), retained);
  return fixture;
}
async function storedPages() {
  return worker.evaluate(async () => {
    const snapshot = await new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', 3); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['pages', 'assets']), pages = tx.objectStore('pages').getAll(), assets = tx.objectStore('assets').getAll();
        tx.oncomplete = () => { db.close(); resolve({pages: pages.result, assets: assets.result}); }; tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
    const assets = new Map(snapshot.assets.map(asset => [asset.id, asset]));
    return Promise.all(snapshot.pages.map(async metadata => {
      const asset = assets.get(metadata.id);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(asset.image);
      });
      return {...metadata, data, ...(asset.sig === undefined ? {} : {sig: asset.sig})};
    }));
  });
}
async function openTool() { const page = await context.newPage(); page.setDefaultTimeout(12000); await page.goto(extensionOrigin + '/capture.html'); return page; }
async function accepted(page) { await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click(); await page.waitForFunction(() => !document.querySelector('.app-shell').inert); }
async function settled(page) {
  await page.waitForFunction(wanted => {
    const options = [...document.querySelector('#sources').options].filter(option => option.value);
    return !document.querySelector('#preflight-status').textContent.includes('检测中') && options.every(option => wanted.includes(option.value)) &&
      wanted.filter(url => !/\/(login|data)\.mp4$/.test(url)).every(url => options.some(option => option.value === url));
  }, sources(fixturePhase));
}
async function statusOf(page, url) { return page.locator('#sources option').evaluateAll((options, value) => { const option = options.find(option => option.value === value); return option ? {status: option.dataset.status, disabled: option.disabled, group: option.parentElement.label, title: option.title} : null; }, url); }
async function screenshots(page, name, dialog) {
  for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({width, height}); await page.reload();
    await page.locator('#pages article').first().waitFor();
    if (name === 'normal') { await page.locator('#file').setInputFiles(path.join(output, 'local-fixture.mp4')); await page.waitForFunction(() => !document.querySelector('#run').disabled); }
    if (name === 'update') { await page.waitForFunction(() => !document.querySelector('#check-updates').disabled); await page.locator('#check-updates').click(); }
    if (dialog) await page.locator(dialog + '[open]').waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ': no horizontal page overflow');
    assert.equal(await page.locator('.app-shell').count(), 1, 'one workspace shell'); assert.equal(await page.locator('.app-header').count(), 1, 'one workspace header');
    await page.screenshot({path: path.join(output, `${name}-${width}x${height}.png`)});
    if (dialog) {
      const bounds = await page.locator(dialog).boundingBox(); assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, name + ': dialog fits viewport');
      const reached = new Set();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const focus = await page.locator(dialog).evaluate(node => ({tag: document.activeElement.tagName, id: document.activeElement.id, hasFocus: document.hasFocus(), open: node.open,
          inside: node.contains(document.activeElement), inApp: !!document.activeElement.closest('.app-shell'), shellInert: document.querySelector('.app-shell').inert}));
        keyboardTrace.push({name, width, height, tab: i + 1, ...focus}); reached.add(focus.id);
        assert(focus.open && !focus.inApp, name + ': native modal excludes app controls: ' + JSON.stringify(focus));
        if (name === 'terms') assert(focus.shellInert, 'unaccepted app shell remains inert');
        // Native Chromium can put Tab focus in browser chrome, leaving BODY active; it cannot activate app controls.
        if (!process.argv.includes('--focus-diagnostic')) assert(focus.inside || (focus.tag === 'BODY' && !focus.hasFocus), name + ': only native browser-focus transition may leave dialog: ' + JSON.stringify(focus));
      }
      for (const id of name === 'terms' ? ['terms-agree', 'terms-decline'] : ['update-release', 'update-download', 'update-later']) assert(reached.has(id), name + ': keyboard reaches #' + id);
    }
  }
}
async function resetUpdate(mode, hold = false) { updateMode = mode; holdUpdate = hold; await worker.evaluate(key => chrome.storage.local.remove(key), updateKey); }
async function marker(page) { await page.waitForFunction(() => document.querySelector('#check-updates').dataset.available === 'true'); assert.equal(await page.locator('#update-dialog').evaluate(node => node.open), false); }
async function closeTools() { for (const page of context.pages()) if (page.url().startsWith(extensionOrigin)) await page.close(); }
(async () => {
  let failure;
  try {
    const fixture = await setup(), course = await context.newPage(); await course.goto(courseURL('initial'));
    let page = await openTool();
    if (process.argv.includes('--focus-diagnostic')) {
      await page.locator('#terms-dialog[open]').waitFor(); await test('native terms keyboard diagnostic only', () => screenshots(page, 'terms', '#terms-dialog')); return;
    }
    await test('first-use refusal and storage failure stay inert, retain IndexedDB and send zero active requests', async () => {
      await page.locator('#terms-dialog[open]').waitFor(); await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 1);
      assert.equal(await page.locator('#terms-accept').isDisabled(), true); await page.keyboard.press('Escape');
      assert.equal(await page.locator('#terms-dialog').evaluate(node => node.open), true); await screenshots(page, 'terms', '#terms-dialog');
      await page.locator('#terms-decline').click(); assert.equal(await page.locator('.app-shell').evaluate(node => node.inert), true);
      assert.deepEqual(await storedPages(), [retained]);
      await page.evaluate(key => { const native = chrome.storage.local.set.bind(chrome.storage.local); window.restoreConsentWrite = () => { chrome.storage.local.set = native; }; chrome.storage.local.set = values => key in values ? Promise.reject(Error('Fixture storage write failed')) : native(values); }, consentKey);
      await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click();
      await page.waitForFunction(() => /保存|锁定/.test(document.querySelector('#terms-status').textContent) && !document.querySelector('#terms-accept').disabled);
      assert.equal(await page.locator('.app-shell').evaluate(node => node.inert), true); assert.deepEqual(await storedPages(), [retained]);
      assert.equal(requests.length, 0, 'no course API or media probes before successful consent'); assert.equal(updateRequests.length, 0);
      assert.equal(await worker.evaluate(key => chrome.storage.local.get(key).then(value => value[key] || null), consentKey), null);
      await page.evaluate(() => window.restoreConsentWrite()); await page.locator('#terms-agree').uncheck(); await accepted(page);
      const record = await worker.evaluate(key => chrome.storage.local.get(key).then(value => value[key]), consentKey);
      assert.equal(record.version, 'course-materials-v1'); assert(Number.isSafeInteger(record.acceptedAt));
    });
    await test('automatic preflight groups byte-verified media, filters invalid sources and keeps manual selection', async () => {
      await settled(page); const good = `${origin}/initial/video.mp4`, unknown = `${origin}/initial/unknown.mp4`;
      assert.equal(await page.locator('#sources').inputValue(), '', 'never auto-select a camera');
      assert.equal((await statusOf(page, good)).status, 'valid'); assert.equal((await statusOf(page, good)).group, '预检通过'); assert.equal((await statusOf(page, `${origin}/initial/lecture.m3u8`)).status, 'valid');
      assert.equal((await statusOf(page, unknown)).status, 'unknown'); assert.equal((await statusOf(page, unknown)).group, '待确认 · 可手动加载'); assert.equal(await statusOf(page, `${origin}/initial/login.mp4`), null);
      await page.locator('#source-show-all').check();
      for (const name of ['login.mp4', 'data.mp4']) { const state = await statusOf(page, `${origin}/initial/${name}`); assert.equal(state.status, 'invalid'); assert.equal(state.disabled, true); assert(state.title.length > 0); }
      await page.locator('#source-show-all').uncheck(); await page.locator('#sources').selectOption(unknown); assert.equal(await page.locator('#load').isEnabled(), true, 'unknown retains manual loading');
      await page.locator('#sources').selectOption(good); const before = requests.length; await page.locator('#preflight-authorize').click();
      await until(() => requests.length > before, 'retry did not issue a real probe'); await settled(page);
      assert.equal(await page.locator('#sources').inputValue(), good, 'usable manual selection survives preflight results');
      const probes = requests.filter(item => item.path?.startsWith('/initial/') && item.range === 'bytes=0-65535');
      assert(initialPeak > 0 && initialPeak <= 2, `initial-generation probe concurrency ${initialPeak}`);
      assert(probes.length >= 5); assert(probes.every(item => item.cookie.includes('ppt_fixture=local-only')), 'actual server receives included cookies');
      assert(probes.every(item => item.referer === courseURL('initial')), 'actual server receives course Referer');
      await page.reload(); await settled(page); assert.equal(await page.locator('#terms-dialog').evaluate(node => node.open), false, 'successful consent persists on reload');
      assert.deepEqual(await storedPages(), [retained]);
    });
    await test('real manual MP4 and cross-host HLS decode; preflight preserves HLS segment Referer', async () => {
      await page.locator('summary').filter({hasText: '手动视频地址'}).click(); await page.locator('#url').fill(`${origin}/initial/video.mp4`); await page.locator('#load-url').click();
      await page.waitForFunction(() => !document.querySelector('#run').disabled); assert((await page.locator('#video').evaluate(video => video.duration)) > 0);
      await page.locator('#sources').selectOption(`${origin}/initial/lecture.m3u8`); await page.locator('#load').click(); await page.waitForFunction(() => !document.querySelector('#run').disabled);
      const before = requests.length; await page.locator('#preflight-authorize').click();
      await until(() => requests.length > before, 'HLS retry did not issue a real probe'); await settled(page);
      const afterPreflight = requests.length;
      await page.locator('#video').evaluate(async video => { video.currentTime = 22.5; await video.play(); });
      await until(() => requests.slice(afterPreflight).some(item => item.path.endsWith('.ts')), 'new HLS segment did not reach local server after preflight');
      const segments = requests.slice(afterPreflight).filter(item => item.path.endsWith('.ts')); assert(segments.every(item => item.referer === courseURL('initial')), 'new HLS segments retain course Referer after preflight');
      await page.locator('#video').evaluate(video => video.pause()); await screenshots(page, 'normal');
      await page.locator('#release-cache').click(); await page.waitForFunction(() => !document.querySelector('#discover').disabled);
    });
    await test('domain permission is requested inside the real click gesture before any probe', async () => {
      await page.evaluate(host => {
        const contains = chrome.permissions.contains.bind(chrome.permissions), request = chrome.permissions.request.bind(chrome.permissions); let allowed = false;
        window.fixturePermission = {calls: []};
        chrome.permissions.contains = value => value.origins.some(origin => origin.includes(host)) && !allowed ? Promise.resolve(false) : contains(value);
        chrome.permissions.request = value => { window.fixturePermission.calls.push({origins: value.origins, active: navigator.userActivation.isActive}); allowed = true; return request(value); };
        window.restorePermissions = () => { chrome.permissions.contains = contains; chrome.permissions.request = request; };
      }, `localhost:${server.address().port}`);
      fixturePhase = 'permission'; await course.goto(courseURL('permission')); await page.locator('#discover').click(); await settled(page);
      assert.equal((await statusOf(page, sources('permission')[0])).status, 'permission'); assert.equal(requests.filter(item => item.path.startsWith('/permission/')).length, 0);
      await page.locator('#preflight-authorize').click();
      await page.waitForFunction(url => [...document.querySelector('#sources').options].some(option => option.value === url && option.dataset.status === 'valid'), sources('permission')[0]);
      await settled(page); assert.equal((await statusOf(page, sources('permission')[0])).status, 'valid');
      const calls = await page.evaluate(() => window.fixturePermission.calls); assert.equal(calls.length, 1); assert.equal(calls[0].active, true); assert.deepEqual(calls[0].origins, [`${alternate}/*`]);
      assert(requests.some(item => item.path.startsWith('/permission/'))); await page.evaluate(() => window.restorePermissions());
    });
    await test('course flip cancels queued probes and rejects delayed old-course results', async () => {
      fixturePhase = 'old'; await course.goto(courseURL('old')); await page.locator('#discover').click();
      await until(() => requests.filter(item => item.path.startsWith('/old/')).length >= 2, 'old-course probes did not start');
      const started = requests.filter(item => item.path.startsWith('/old/')).length;
      fixturePhase = 'fresh'; await course.goto(courseURL('fresh')); await page.locator('#discover').click(); await settled(page); release('old');
      assert.equal((await statusOf(page, sources('fresh')[0])).status, 'valid');
      await page.locator('#source-show-all').check(); assert.equal(await page.locator('#sources option').evaluateAll(options => options.some(option => option.value.includes('/old/'))), false);
      assert.equal(requests.filter(item => item.path.startsWith('/old/')).length, started, 'cancelled old queue never starts another request'); await page.close();
    });
    await test('simultaneous tool tabs serialize update GET and claim one 3.10.0 automatic dialog', async () => {
      await resetUpdate('available', true); const before = updateRequests.length;
      const tabs = await Promise.all([openTool(), openTool()]); await until(() => pending.update.length === 1, 'held update request not observed');
      holdUpdate = false; release('update'); await Promise.all(tabs.map(tab => tab.waitForFunction(() => document.querySelector('#check-updates').dataset.available === 'true')));
      await until(async () => (await Promise.all(tabs.map(tab => tab.locator('#update-dialog').evaluate(node => node.open)))).filter(Boolean).length === 1, 'expected exactly one automatic update dialog');
      assert.equal(updateRequests.length - before, 1, 'background serial queue shares one cached GET');
      const opened = await Promise.all(tabs.map(tab => tab.locator('#update-dialog').evaluate(node => node.open))); page = tabs[opened.indexOf(true)];
      assert.equal(await page.locator('#update-current').textContent(), '3.0.1'); assert.equal(await page.locator('#update-version').textContent(), '3.10.0');
      assert.equal(await page.locator('#update-release').getAttribute('href'), `${repository}/releases/tag/v3.10.0`);
      assert.equal(await page.locator('#update-download').getAttribute('href'), `${repository}/releases/download/v3.10.0/ppt-capture.zip`);
      await screenshots(page, 'update', '#update-dialog');
      assert.equal((await Promise.all(tabs.map(tab => tab.locator('#update-dialog').evaluate(node => node.open)))).filter(Boolean).length, 1, 'second tab never opens a duplicate automatic dialog');
      await page.locator('#update-later').click();
      const cachedBefore = updateRequests.length, reopened = await openTool(); await marker(reopened); assert.equal(updateRequests.length, cachedBefore, 'cached reopen sends no extra GET');
      await reopened.locator('#check-updates').click(); await reopened.locator('#update-dialog[open]').waitFor(); assert.equal(updateRequests.length, cachedBefore + 1, 'manual check bypasses cache');
      await closeTools();
    });
    await test('held update results only mark while a real remote load or terms dialog is active', async () => {
      for (const otherDialog of [false, true]) {
        await resetUpdate('available', true); page = await openTool(); await until(() => pending.update.length === 1, 'held automatic update did not start');
        if (otherDialog) { await page.locator('#terms-open').click(); await page.locator('#terms-dialog[open]').waitFor(); }
        else {
          holdLoad = true; await page.locator('summary').filter({hasText: '手动视频地址'}).click(); await page.locator('#url').fill(origin + '/slow-load.mp4'); await page.locator('#load-url').click();
          await until(() => pending.load.length === 1, 'real slow media load did not start'); assert.equal(await page.locator('#stop').isEnabled(), true);
        }
        holdUpdate = false; release('update'); await marker(page);
        if (otherDialog) { assert.equal(await page.locator('#terms-dialog').evaluate(node => node.open), true); await page.locator('#terms-decline').click(); }
        else { holdLoad = false; release('load'); await page.waitForFunction(() => !document.querySelector('#run').disabled); }
        assert.equal(await page.locator('#update-dialog').evaluate(node => node.open), false, 'finishing work must not cause a surprise dialog'); await page.close();
      }
    });
    await test('manual update and read-only terms remain usable during a real remote load', async () => {
      await resetUpdate('current'); page = await openTool();
      await page.waitForFunction(() => !document.querySelector('#check-updates').disabled);
      holdLoad = true; await page.locator('summary').filter({hasText: '手动视频地址'}).click();
      await page.locator('#url').fill(origin + '/slow-load.mp4'); await page.locator('#load-url').click();
      await until(() => pending.load.length === 1, 'real slow media load did not start');
      assert.equal(await page.locator('#terms-open').isEnabled(), true, 'reading terms must not depend on an extraction task');
      assert.equal(await page.locator('#check-updates').isEnabled(), true, 'manual update must not depend on an extraction task');
      await page.locator('#terms-open').click(); await page.locator('#terms-dialog[open]').waitFor();
      assert.equal(await page.locator('#terms-accept').isVisible(), false, 'accepted terms reopen read-only');
      await page.screenshot({path: path.join(output, 'terms-during-load.png')});
      await page.locator('#terms-decline').click();
      updateMode = 'available'; holdUpdate = true;
      await page.locator('#check-updates').click(); await until(() => pending.update.length === 1, 'manual update GET did not start');
      assert.equal(await page.locator('#check-updates').isDisabled(), true, 'only the duplicate update request is disabled');
      assert.equal(await page.locator('#terms-open').isEnabled(), true);
      holdUpdate = false; release('update'); await page.locator('#update-dialog[open]').waitFor();
      assert.equal(await page.locator('#update-version').textContent(), '3.10.0', 'manual results must open while extraction is busy');
      assert.equal(pending.load.length, 1, 'viewing dialogs does not cancel the media load');
      await page.screenshot({path: path.join(output, 'manual-update-during-load.png')});
      await page.locator('#update-later').click(); assert.equal(await page.locator('#stop').isEnabled(), true);
      holdLoad = false; release('load'); await page.waitForFunction(() => !document.querySelector('#run').disabled);
      assert.deepEqual(await storedPages(), [retained]); await page.close();
    });
    await test('terms and manual update do not require screenshot storage to initialize', async () => {
      await resetUpdate('current'); page = await context.newPage(); page.setDefaultTimeout(12000);
      await page.addInitScript(() => {
        const open = indexedDB.open.bind(indexedDB);
        indexedDB.open = (name, ...args) => { if (name === 'course-ppt') throw new DOMException('Synthetic storage unavailable', 'UnknownError'); return open(name, ...args); };
      });
      await page.goto(extensionOrigin + '/capture.html');
      await page.waitForFunction(() => !document.querySelector('.app-shell').inert && document.querySelector('#status').textContent.includes('Synthetic storage unavailable'));
      assert.equal(await page.locator('#terms-open').isEnabled(), true);
      await page.locator('#terms-open').click(); await page.locator('#terms-dialog[open]').waitFor(); await page.locator('#terms-decline').click();
      assert.equal(await page.locator('#check-updates').isEnabled(), true);
      await page.locator('#check-updates').click(); await page.locator('#update-dialog[open]').waitFor();
      assert.match(await page.locator('#update-status').textContent(), /最新/);
      assert.equal(await page.locator('#run').isDisabled(), true, 'capture still requires its database');
      await page.close();
    });
    await test('prerelease ignored; offline automatic check stays quiet and local extraction remains usable', async () => {
      await resetUpdate('prerelease'); page = await openTool(); await page.waitForFunction(() => !document.querySelector('#check-updates').disabled);
      assert.equal(await page.locator('#update-dialog').evaluate(node => node.open), false); await page.locator('#check-updates').click(); await page.locator('#update-dialog[open]').waitFor();
      assert.equal(await page.locator('#update-release').isVisible(), false); assert.match(await page.locator('#update-status').textContent(), /稳定|最新/); await page.close();
      await resetUpdate('offline'); page = await openTool(); await page.waitForFunction(() => !document.querySelector('#check-updates').disabled);
      assert.equal(await page.locator('#update-dialog').evaluate(node => node.open), false); await page.locator('#file').setInputFiles(fixture);
      await page.waitForFunction(() => !document.querySelector('#shot').disabled); await page.locator('#shot').click(); await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 2);
      await page.close();
    });
    await test('obsolete consent version prompts again through actual checkbox and acceptance', async () => {
      await worker.evaluate(key => chrome.storage.local.set({[key]: {version: 'course-materials-v0', acceptedAt: 1}}), consentKey);
      page = await openTool(); await page.locator('#terms-dialog[open]').waitFor(); assert.equal(await page.locator('.app-shell').evaluate(node => node.inert), true);
      assert.equal(await page.locator('#terms-accept').isDisabled(), true); await accepted(page);
      assert.equal((await storedPages()).length, 2); await page.close();
    });
    assert(updateRequests.every(item => !item.cookie && !item.referer && item.method === 'GET'), 'update transport sends no course cookies or Referer');
    assert.deepEqual(errors, [], 'page errors must fail'); assert.deepEqual([...new Set(unexpected)], [], 'unexpected external requests must fail');
  } catch (error) { failure = error.stack || String(error); process.exitCode = 1; console.error(failure); }
  finally {
    try { if (context) await context.close(); } catch (error) { errors.push({cleanup: 'browser', error: error.message}); process.exitCode = 1; }
    for (const timer of timers) clearTimeout(timer); for (const kind of Object.keys(pending)) release(kind);
    try { if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } } catch (error) { errors.push({cleanup: 'server', error: error.message}); process.exitCode = 1; }
    if (temp) { const target = path.resolve(temp); assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert(path.basename(target).startsWith('ppt-features-')); fs.rmSync(target, {recursive: true, force: true}); }
    for (const name of Object.keys(copiedHashes)) finalHashes[name] = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
    if (errors.length || unexpected.length) process.exitCode = 1;
    const changedDuringRun = Object.keys(copiedHashes).filter(name => copiedHashes[name] !== finalHashes[name]);
    const report = {status: process.exitCode ? 'fail' : 'pass', scope: process.argv.includes('--focus-diagnostic') ? 'focus diagnostic only' : 'full feature suite', output, transport, copiedHashes, finalHashes, changedDuringRun, permissionTest: 'Only the disposable extension grants localhost; faithful UI contains/request shim exercises an already-granted host without a headless native prompt.', results, counters: {mediaAndAPI: requests.length, updateGET: updateRequests.length, initialPeak}, requests, updateRequests, keyboardTrace, errors, unexpected: [...new Set(unexpected)], failure};
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(reportRoot, 'feature-test-report.md'), `# v3.0.1 independent browser features\n\nStatus: ${report.status}; scope: ${report.scope}\n\nEvidence: ${path.relative(reportRoot, output)}/results.json\n\n${transport}\n\nPermission timing uses a faithful Chrome API stub over an already-granted local test host. All media and retained pages are synthetic local fixtures.\n\n${results.map(result => `- ${result.status.toUpperCase()}: ${result.name}`).join('\n')}\n\nCounters: ${JSON.stringify(report.counters)}\n\nPage errors: ${errors.length}; unexpected external requests: ${report.unexpected.length}.\n${failure ? '\nFailure:\n```\n' + failure + '\n```\n' : ''}`);
    console.log('Feature evidence: ' + output);
  }
})();
