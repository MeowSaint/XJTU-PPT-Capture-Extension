/* Generic website entry -> source selection -> extraction -> real PDF download.
   Uses two loopback hostnames and an isolated profile; no real account/site access. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const {spawnSync} = require('node:child_process');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright'), sharp = dependency('sharp');
const {PDFDocument} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..'), output = process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output', 'generic');
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}
async function main() {
  fs.mkdirSync(output, {recursive: true});
  for (let i = 0; i < 2; i++) {
    const png = await sharp(Buffer.from(`<svg width="640" height="360"><rect width="640" height="360" fill="white"/><rect x="30" y="30" width="${180 + i * 220}" height="120" fill="${i ? '#aa3344' : '#227755'}"/><text x="30" y="240" font-size="40">Slide ${i + 1}</text></svg>`)).png().toBuffer();
    for (let j = 0; j < 4; j++) fs.writeFileSync(path.join(output, `frame${i * 4 + j}.png`), png);
  }
  ffmpeg(['-framerate', '2', '-i', path.join(output, 'frame%d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '2', '-movflags', '+faststart', path.join(output, 'lesson.mp4')]);
  ffmpeg(['-i', path.join(output, 'lesson.mp4'), '-c:v', 'libvpx-vp9', '-an', path.join(output, 'lesson.webm')]);
  ffmpeg(['-i', path.join(output, 'lesson.mp4'), '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(output, 'part%d.ts'), path.join(output, 'lesson.m3u8')]);
  const requests = [], errors = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    const url = new URL(req.url, 'http://' + req.headers.host), name = path.basename(url.pathname);
    const origin = `http://127.0.0.1:${server.address().port}`, other = `http://localhost:${server.address().port}`;
    if (url.pathname === '/watch') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(`<title>${req.headers.host.startsWith('localhost') ? 'Other website' : 'Generic lecture'}</title><video controls preload="metadata" src="${origin}/lesson.${req.headers.host.startsWith('localhost') ? 'webm' : 'mp4'}"></video>${req.headers.host.startsWith('localhost') ? '' : `<iframe src="${other}/player"></iframe>`}`); return;
    }
    if (url.pathname === '/player') { res.setHeader('content-type', 'text/html'); res.end(`<video preload="metadata" src="${origin}/lesson.webm"></video>`); return; }
    if (url.pathname === '/api/media') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({url: origin + '/lesson.m3u8'})); return; }
    if (url.pathname === '/encrypted.m3u8') { res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\npart0.ts\n#EXT-X-ENDLIST'); return; }
    const file = path.join(output, name);
    if (!/\.(mp4|webm|m3u8|ts)$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const bytes = fs.readFileSync(file);
    res.setHeader('Content-Type', name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.ts') ? 'video/mp2t' : name.endsWith('.webm') ? 'video/webm' : 'video/mp4');
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]), end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
      res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1}); res.end(bytes.subarray(start, end + 1));
    } else { res.setHeader('Content-Length', bytes.length); res.end(bytes); }
  });
  await new Promise(resolve => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, other = `http://localhost:${server.address().port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-generic-')), ext = path.join(temp, 'extension'); fs.mkdirSync(ext);
  for (const name of fs.readdirSync(root).filter(name => /\.(js|html|css)$/.test(name))) fs.copyFileSync(path.join(root, name), path.join(ext, name));
  for (const name of ['icons', 'vendor']) fs.cpSync(path.join(root, name), path.join(ext, name), {recursive: true});
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  // Static grants substitute for the browser's toolbar/permission UI in headless mode.
  manifest.host_permissions.push('http://127.0.0.1/*', 'http://localhost/*');
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(ext, 'background.js'), 'const registerClick = chrome.action.onClicked.addListener.bind(chrome.action.onClicked); chrome.action.onClicked.addListener = listener => { globalThis.fixtureClick = listener; registerClick(listener); };\n' + fs.readFileSync(path.join(root, 'background.js'), 'utf8'));
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {...browserOptions(), args: ['--load-extension=' + ext, '--disable-extensions-except=' + ext, '--disable-background-networking', '--no-proxy-server'], acceptDownloads: true});
    await context.route('https://**/*', route => route.abort());
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extension = worker.url().replace('/background.js', '');
    await worker.evaluate(() => chrome.storage.local.set({'ppt-study-consent': {version: 'course-materials-v1', acceptedAt: Date.now()}}));
    // Avoid update network traffic from the service worker (outside page routing).
    await worker.evaluate(() => { const fetchOriginal = fetch; globalThis.fetch = (input, options) => String(input).startsWith('https://api.github.com/') ? Promise.resolve(new Response('{}', {status: 404})) : fetchOriginal(input, options); });
    async function openFrom(source) {
      const created = context.waitForEvent('page', {predicate: page => page !== source});
      await worker.evaluate(async url => {
        const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
        await globalThis.fixtureClick(tab);
      }, source.url());
      const tool = await created;
      await tool.waitForURL(extension + '/capture.html?tab=*');
      await tool.waitForFunction(() => studyAccepted && ready);
      await tool.waitForFunction(() => sources.length > 0);
      return tool;
    }
    async function extract(tool, url, label) {
      await tool.locator('#sources').selectOption(url);
      await tool.locator('#load').click();
      await tool.waitForFunction(() => !task && sourceReady, {timeout: 30000});
      await tool.locator('#run').click();
      await tool.waitForFunction(() => !task && activeLesson?.task?.state === 'done', {timeout: 30000});
      const result = await tool.evaluate(() => ({id: activeLesson.id, page: activeLesson.page, count: pages.length, name: activeLesson.course.name}));
      assert.equal(result.count, 2, label + ': both distinct slides retained');
      assert.match(await tool.locator('#filename-preview').innerText(), /下载文件名：/);
      const download = tool.waitForEvent('download'); await tool.locator('#pdf').click();
      const file = await download; await file.saveAs(path.join(output, label + '.pdf'));
      const pdf = await PDFDocument.load(fs.readFileSync(path.join(output, label + '.pdf')));
      assert.equal(pdf.getPageCount(), result.count);
      console.log(label + ': selected, decoded, extracted 2 slides, downloaded 2-page PDF');
      return result;
    }
    const sourceA = await context.newPage(); await sourceA.goto(origin + '/watch?courseId=42');
    const toolA = await openFrom(sourceA);
    assert.equal(await toolA.evaluate(() => coursePage), sourceA.url());
    await toolA.waitForFunction(() => sources.some(source => source.url.endsWith('.webm')));
    assert.equal(await toolA.locator('#batch-discover').isDisabled(), true);
    assert.doesNotMatch(await toolA.locator('#source-track-hint').innerText(), /2 路|0 路/);
    assert(!requests.some(url => url.includes('/rms-service/')), 'no platform-specific API on generic pages');
    await sourceA.evaluate(() => fetch('/api/media'));
    await toolA.locator('#discover').click();
    await toolA.waitForFunction(() => sources.some(source => source.kind === 'm3u8'));
    const mp4 = await extract(toolA, origin + '/lesson.mp4', 'generic-mp4');
    const hls = await extract(toolA, origin + '/lesson.m3u8', 'generic-hls');
    assert.notEqual(hls.id, mp4.id);
    await toolA.evaluate(() => { globalThis.fixturePermissionRequest = chrome.permissions.request; chrome.permissions.request = async () => false; });
    await toolA.locator('#source-authorize').click();
    await toolA.waitForFunction(() => document.getElementById('source-status').textContent.includes('未授予'));
    assert.equal(await toolA.evaluate(() => pages.length), 2, 'permission denial preserves screenshots');
    assert.equal(await toolA.evaluate(url => loadRemote(url), origin + '/lesson.mp4'), false);
    assert.match(await toolA.locator('#status').innerText(), /未获得该视频域名访问权限/);
    assert.equal(await toolA.evaluate(() => pages.length), 2, 'video domain denial preserves screenshots');
    await toolA.evaluate(() => { chrome.permissions.request = globalThis.fixturePermissionRequest; });
    assert.equal(await toolA.evaluate(url => loadRemote(url, {permissionGranted: true}), origin + '/encrypted.m3u8'), false);
    assert.match(await toolA.locator('#status').innerText(), /未加密/);
    await toolA.screenshot({path: path.join(output, 'generic-desktop.png'), fullPage: true});
    const sourceB = await context.newPage(); await sourceB.goto(other + '/watch');
    const toolB = await openFrom(sourceB);
    const webm = await extract(toolB, origin + '/lesson.webm', 'generic-webm');
    assert.equal(webm.page, sourceB.url()); assert.notEqual(webm.id, mp4.id);
    // Same media URL on another route gets a separate durable lesson.
    await sourceB.evaluate(() => { history.pushState({}, '', '/next'); document.title = 'Next lecture'; });
    await toolB.locator('#discover').click();
    await toolB.waitForFunction(() => coursePage.endsWith('/next') && sources.length === 1);
    const next = await extract(toolB, origin + '/lesson.webm', 'generic-next');
    assert.notEqual(next.id, webm.id);
    assert.equal(await toolB.evaluate(id => allPages.filter(page => page.lessonId === id).length, webm.id), 2, 'previous route screenshots retained');
    await toolB.setViewportSize({width: 390, height: 844});
    await toolB.screenshot({path: path.join(output, 'generic-mobile.png'), fullPage: true});
    await sourceB.close(); await toolB.locator('#discover').click();
    await toolB.waitForFunction(() => !sources.length && coursePage === '');
    assert.equal(await toolB.evaluate(() => pages.length), 2, 'closing source preserves saved pages');
    assert.match(await toolB.locator('#source-status').innerText(), /已关闭或访问权限已失效/);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({mp4, hls, webm, next, errors, browser: context.browser()?.version(), note: 'Loopback fixture host grants; real toolbar grants and external sites remain unverified.'}, null, 2));
    console.log('Generic website regression passed: two hostnames, MP4/WebM/HLS, iframe, late fetch, permission denial, navigation isolation, PDF downloads');
  } finally { await context?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
