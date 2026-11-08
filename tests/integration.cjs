/* Runs an isolated headless Edge profile; never uses the user's browser profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), {spawnSync} = require('node:child_process');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright');
const sharp = dependency('sharp');
const {PDFDocument} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..'), output = process.env.PPT_TEST_OUTPUT || path.join(root, '.test-output');
function command(exe, args) {
  const r = spawnSync(exe, args, {encoding: 'utf8'});
  if (r.status !== 0) throw Error(exe + ': ' + (r.stderr || r.error));
}
async function fixtures() {
  fs.mkdirSync(output, {recursive: true});
  const colors = ['#315fb4', '#238166', '#aa4d69', '#946612'];
  for (let i = 0; i < 4; i++) {
    const svg = `<svg width="1280" height="720"><rect width="1280" height="720" fill="#ffffff"/><rect width="1280" height="100" fill="${colors[i]}"/><rect x="80" y="180" width="${260 + i * 120}" height="180" fill="${colors[i]}"/><text x="60" y="65" font-size="42" font-family="Arial" fill="white">LECTURE SLIDE ${i + 1}</text><text x="80" y="450" font-size="56" font-family="Arial">Distinct page ${i + 1}</text><text x="80" y="560" font-size="32" font-family="Arial">Local extraction and PDF verification</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(output, `slide${i + 1}.png`));
  }
  const sequence = [1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 4, 4, 4, 4, 4, 4];
  sequence.forEach((slide, i) => fs.copyFileSync(path.join(output, `slide${slide}.png`), path.join(output, `frame${String(i).padStart(2, '0')}.png`)));
  command('ffmpeg', ['-y', '-v', 'error', '-framerate', '2', '-i', path.join(output, 'frame%02d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '2', '-movflags', '+faststart', path.join(output, 'lecture_2.mp4')]);
  command('ffmpeg', ['-y', '-v', 'error', '-i', path.join(output, 'lecture_2.mp4'), '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(output, 'segment%02d.ts'), path.join(output, 'lecture_2.m3u8')]);
  fs.copyFileSync(path.join(output, 'lecture_2.mp4'), path.join(output, '0-screen.mp4'));
  fs.copyFileSync(path.join(output, 'lecture_2.mp4'), path.join(output, 'lecture_other.mp4'));
  command('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', path.join(output, 'slide1.png'), '-t', '8', '-r', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '2', '-movflags', '+faststart', path.join(output, '0-teacher.mp4')]);
  assert(!fs.readFileSync(path.join(output, '0-screen.mp4')).equals(fs.readFileSync(path.join(output, '0-teacher.mp4'))), 'fallback channels contain distinct actual videos');
}
async function savedBatchJob(page, id) {
  return page.evaluate(async id => {
    await dbReady; await lessonSave;
    return new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('batch:' + batchPage);
      request.onsuccess = () => resolve(request.result?.jobs.find(job => job.id === id)); request.onerror = () => reject(request.error);
    });
  }, id);
}
async function pauseScan(page) {
  await page.locator('#run').click();
  await page.waitForFunction(() => !!task && activeLesson.task?.state === 'running' && activeLesson.task.checkpoint > 0);
  await page.locator('#stop').click();
  await page.waitForFunction(() => !task && activeLesson.task?.state === 'paused');
  return page.evaluate(() => structuredClone(activeLesson.task));
}
async function storedPageSnapshot(page) {
  return page.evaluate(async () => {
    const assets = await PPTPageStore.assets(db, allPages.map(p => p.id));
    const data = await Promise.all(assets.map(asset => new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(asset.image);
    })));
    return allPages.map((metadata, index) => ({...metadata, data: data[index]}))
      .sort((a, b) => a.lessonId.localeCompare(b.lessonId) || a.order - b.order || a.id - b.id);
  });
}
async function verifyCacheRelease(page, label) {
  const retained = async () => ({pages: await storedPageSnapshot(page), ...await page.evaluate(() => ({
    activePageIds: pages.map(page => page.id), naming: namingInfo(), manual: namingManual, namingPage,
    fields: ['course-name', 'course-date', 'course-start'].map(id => document.getElementById(id).value),
    preview: document.getElementById('filename-preview').textContent
  }))});
  const before = await retained(), oldURL = await page.evaluate(() => objectURL);
  assert.equal(await page.locator('#release-cache').isEnabled(), true, label + ': cache can be released');
  await page.locator('#release-cache').click();
  // Edge can retain the last currentSrc string after detachment. Verify the
  // unloaded player, empty buffers and revoked URL instead of that stale label.
  await page.waitForFunction(() => !task && !sourceReady && !objectURL && !hls && !stream && video.readyState === 0 && video.buffered.length === 0).catch(async error => {
    console.error('Release diagnostics (' + label + '):', await page.evaluate(() => ({task: !!task, sourceReady, objectURL, hls: !!hls, stream: !!stream, video: {src: video.getAttribute('src'), currentSrc: video.currentSrc, readyState: video.readyState}, status: document.querySelector('#status').textContent})));
    throw error;
  });
  assert.deepEqual(await retained(), before, label + ': all lessons’ screenshots and active naming must remain unchanged');
  assert.equal(await page.locator('#video').getAttribute('src'), null);
  assert.equal(await page.locator('#video').evaluate(el => el.srcObject), null);
  assert.equal(await page.locator('#release-cache').isEnabled(), false);
  assert.equal(await page.locator('#run').isEnabled(), false); assert.equal(await page.locator('#shot').isEnabled(), false);
  assert.equal(await page.locator('#pdf').isEnabled(), before.activePageIds.length > 0);
  assert.match(await page.locator('#status').textContent(), /截图和命名信息已保留/);
  assert.equal(await page.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).some(rule => rule.id === referrerRule)), false);
  if (oldURL) assert.equal(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, oldURL), true, label + ': revoked Blob URL must not be readable');
  console.log(`Cache release (${label}): video detached, Blob/HLS cleared; screenshots, naming and export preserved`);
}
async function main() {
  await fixtures();
  let remoteRequests = 0, headerRequests = 0, crossDomainHeaders = 0, fallbackRevision = 0, screenAvailable = true, fallbackOptions = [];
  let holdBatchReply = false, releaseBatchReply, markBatchReplyHeld;
  const batchReplyHeld = new Promise(resolve => { markBatchReplyHeld = resolve; });
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://localhost').pathname), file = path.join(output, name);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    remoteRequests++; if (req.headers.referer?.startsWith('https://rms-v5.xjtu.edu.cn/')) {
      headerRequests++; if (req.headers.host.startsWith('localhost:')) crossDomainHeaders++;
    }
    res.setHeader('Content-Type', name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.ts') ? 'video/mp2t' : 'video/mp4');
    if (name.endsWith('.m3u8')) {
      const text = fs.readFileSync(file, 'utf8').replace(/^segment/gm, `http://localhost:${server.address().port}/segment`);
      res.setHeader('Content-Length', Buffer.byteLength(text)); res.end(text);
    } else { res.setHeader('Content-Length', fs.statSync(file).size); fs.createReadStream(file).pipe(res); }
  });
  await new Promise(resolve => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-capture-test-')), ext = path.join(temp, 'extension');
  fs.mkdirSync(ext);
  for (const name of ['manifest.json', 'background.js', 'media.js', 'course.js', 'batch.js', 'page-hook.js', 'content.js', 'capture.html', 'capture.js', 'mp4-recovery.js', 'page-store.js', 'library.js', 'disk-cache.js', 'workspace.js', 'extension-state.js', 'preflight.js', 'scanner.js', 'style.css', 'motion.js', 'pdf.js', 'vendor', 'icons']) fs.cpSync(path.join(root, name), path.join(ext, name), {recursive: true});
  const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  // Grant only fixture server access in this test copy to avoid a headless permission dialog.
  manifest.host_permissions.push('http://127.0.0.1/*', 'http://localhost/*');
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {...browserOptions(), args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext,
    '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', '--no-proxy-server'], acceptDownloads: true});
  const errors = [], blocked = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['chrome-extension:', 'blob:', 'data:', 'about:'].includes(url.protocol) || ['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    blocked.push(url.href); return route.abort('blockedbyclient');
  });
  context.on('page', p => p.on('pageerror', e => errors.push(p.url() + ': ' + e.stack)));
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    // Worker requests are not intercepted by page routes: mock the public check here.
    await worker.evaluate(version => {
      const fetchFixture = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, options) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.startsWith('https://api.github.com/')) return Promise.resolve(new Response(JSON.stringify({
          tag_name: `v${version}`, draft: false, prerelease: false, published_at: '2026-11-05T00:00:00Z',
          html_url: `https://github.com/MeowSaint/XJTU-PPT-Capture-Extension/releases/tag/v${version}`,
          assets: [{name: 'ppt-capture.zip', browser_download_url: `https://github.com/MeowSaint/XJTU-PPT-Capture-Extension/releases/download/v${version}/ppt-capture.zip`}]
        }), {headers: {'Content-Type': 'application/json'}}));
        return fetchFixture(input, options);
      };
    }, manifest.version);
    const extensionOrigin = worker.url().replace('/background.js', '');
    const courseName = '传感网络与大数据技术', expectedFilename = courseName + '-2026-09-07-15-30-00.pdf';
    // Simulate a pre-v2.3.1 database: migration preserves existing screenshots.
    const legacyData = 'data:image/png;base64,' + fs.readFileSync(path.join(output, 'slide1.png')).toString('base64');
    await worker.evaluate(data => new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true});
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('pages', 'readwrite');
        tx.objectStore('pages').add({data, w: 1280, h: 720, time: Date.now(), sourceName: 'legacy.mp4'});
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    }), legacyData);
    // Fulfill the course page locally; no request is sent to the school.
    const course = await context.newPage();
    await course.route('https://rms-v5.xjtu.edu.cn/**', async route => {
      const requestURL = new URL(route.request().url()), pathname = requestURL.pathname;
      if (pathname.endsWith('/fixture.json')) {
        const other = requestURL.searchParams.get('capture') === '477015';
        return route.fulfill({contentType: 'application/json', body: JSON.stringify({data: {video: origin + (other ? '/lecture_other.mp4' : '/lecture_2.mp4'), courseId: 16220, captureId: other ? 477015 : 477014, courseName: other ? '另一门课程' : courseName, startTime: other ? '2026-09-08 08:00:00' : '2026-09-07 15:30:00'}})});
      }
      if (pathname.endsWith('/sandbox-player')) return route.fulfill({contentType: 'text/html', body: `<!doctype html><video preload="none" src="${origin}/lecture_1.mp4"></video>`});
      if (pathname.endsWith('/study-capture-courses/16220/schedules')) return route.fulfill({contentType: 'application/json', body: JSON.stringify({data: [
        {id: 700001, capture_code: 'batch-a', status: 'FINISHED', start_time: '2026-09-10T02:10:00+00:00', course: {name: courseName}},
        {id: 700002, capture_code: 'batch-b', status: 'FINISHED', start_time: '2026-09-11T02:10:00+00:00', course: {name: courseName}},
        {id: 700003, capture_code: 'batch-c', status: 'FINISHED', start_time: '2026-09-12T02:10:00+00:00', course: {name: courseName}},
        {id: 700004, capture_code: null, status: 'TRANSCODING', start_time: '2026-09-13T02:10:00+00:00', course: {name: courseName}}
      ]})});
      const batchCode = pathname.match(/\/study-capture-courses\/16220\/captures\/(batch-[abc])$/)?.[1];
      if (batchCode === 'batch-c') {
        if (holdBatchReply) {
          holdBatchReply = false; markBatchReplyHeld();
          await new Promise(resolve => { releaseBatchReply = resolve; });
        }
        const revision = ++fallbackRevision;
        fallbackOptions = ['teacher', ...(screenAvailable ? ['screen'] : [])].map(channel => ({
          label: channel === 'teacher' ? 'INSTRUCTOR' : 'SCREEN', file_key: `12345/0-batch-c-${channel}.mp4`,
          download_url: `${origin}/0-${channel}.mp4?token=${channel}-${revision}&expires=${1794000000 + revision}`
        }));
        return route.fulfill({contentType: 'application/json', body: JSON.stringify({data: {code: batchCode, lesson_videos: fallbackOptions}})});
      }
      if (batchCode) return route.fulfill({contentType: 'application/json', body: JSON.stringify({data: {code: batchCode, lesson_videos: [
        {label: 'INSTRUCTOR', file_key: `12345/0-${batchCode}.mp4`, download_url: origin + '/lecture_2.mp4'},
        {label: 'ENCODER', file_key: `12345/2-${batchCode}.mp4`, download_url: origin + '/lecture_2.mp4', size: 1024}
      ]}})});
      const changed = pathname.includes('/477015');
      return route.fulfill({contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><title>资源管理平台</title>${changed ? '<h1 class="course-title">另一门课程</h1><p>2026.09.08 周二 08:00 - 09:40</p>' : ''}<video preload="none" src="${origin}/lecture_1.mp4"></video><video preload="none"></video><iframe sandbox="allow-scripts" src="https://rms-v5.xjtu.edu.cn/sandbox-player"></iframe><script>fetch('/fixture.json?capture=${changed ? 477015 : 477014}').then(r=>r.json());</script>`});
    });
    await course.goto('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477014');
    const page = await context.newPage(); await page.goto(extensionOrigin + '/capture.html');
    let downloads = 0; page.on('download', () => { downloads++; });
    await page.locator('#terms-dialog').waitFor({state: 'visible'});
    await page.waitForFunction(() => ready && pages.length === 1);
    assert.equal(await page.evaluate(async () => {
      const asset = await PPTPageStore.asset(db, pages[0].id);
      return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(asset.image);
      });
    }), legacyData, 'v1 migration preserves the exact original PNG bytes');
    assert.equal(await page.locator('.app-shell').evaluate(shell => shell.inert), true);
    await page.locator('#terms-decline').click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#terms-dialog').isVisible(), true);
    assert.equal(await page.locator('#pages article').count(), 1, 'declining consent preserves the migrated legacy screenshot');
    await page.locator('#terms-agree').check(); await page.locator('#terms-accept').click();
    await page.waitForFunction(() => !document.querySelector('.app-shell').inert);
    await page.locator('#source-show-all').check().catch(async error => {
      await page.screenshot({path: path.join(output, 'source-checkbox-failure.png'), fullPage: true});
      console.error('Source checkbox diagnostics:', await page.locator('#source-show-all').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {checked: node.checked, x: rect.x, y: rect.y, hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML,
          sourceCount: document.querySelector('#sources').options.length, status: document.querySelector('#preflight-status').textContent};
      }));
      throw error;
    });
    await page.waitForFunction(() => document.querySelector('#sources').options.length >= 3);
    const badge = await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({url})).find(tab => tab.url === url);
      if (!tab) throw Error('Fixture course tab not found');
      let snapshot;
      for (let attempt = 0; attempt < 30; attempt++) {
        const key = 'media-' + tab.id, entry = (await chrome.storage.session.get(key))[key];
        snapshot = {count: entry?.items?.length || 0, text: await chrome.action.getBadgeText({tabId: tab.id})};
        if (snapshot.count >= 2 && snapshot.text === String(snapshot.count)) return snapshot;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return snapshot;
    }, course.url());
    assert(badge.count >= 2, 'fixture course discovered media is stored in the real extension cache');
    assert.equal(badge.text, String(badge.count), 'real Chrome action badge matches the discovered media cache count');
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 1);
    assert.equal(await page.locator('#course-name').inputValue(), '', 'legacy screenshot must not acquire an unrelated course name');
    await page.locator('#pdf').click();
    assert.match(await page.locator('#status').textContent(), /请先补填/);
    assert.equal(downloads, 0);
    page.once('dialog', d => d.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 0);
    assert.equal(await page.locator('#course-name').inputValue(), '', 'clearing the legacy lesson retains its empty naming');
    assert.equal(await page.locator('#sources').inputValue(), '', 'wait for manual selection');
    assert.equal(await page.locator('#load').isEnabled(), false);
    assert.equal(await page.locator('#release-cache').isEnabled(), false, 'no loaded video to release');
    assert.doesNotMatch(await page.locator('#sources').textContent(), /★|视频\s*2/);
    await page.locator('#tab-source').click();
    await page.locator('#sources').selectOption(origin + '/lecture_2.mp4');
    assert.equal(await page.locator('#load').isEnabled(), true);
    // Real extension fetch + Blob decoding; fixture CDN has no CORS headers.
    await page.locator('#load').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled, {timeout: 15000});
    assert.match(await page.locator('#status').textContent(), /已加载/);
    await page.waitForFunction(name => document.querySelector('#course-name').value === name && document.querySelector('#course-start').value === '15:30:00', courseName);
    assert.equal(await page.locator('#course-date').inputValue(), '2026-09-07');
    assert.match(await page.locator('#filename-preview').textContent(), /2026-09-07-15-30-00\.pdf/);
    assert(remoteRequests > 0); assert(headerRequests > 0, 'course Referer must reach the fixture CDN');
    await page.locator('#tab-extraction').click();
    await page.locator('#mode').selectOption('0.5');
    const started = Date.now();
    await page.locator('#run').click();
    assert.equal(await page.locator('#release-cache').isEnabled(), false, 'cannot release during an active scan');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成') && !document.querySelector('#run').disabled);
    assert.equal(await page.locator('#pages article').count(), 4, 'dense scan captures 4 distinct slides including the one-second slide');
    assert.equal(downloads, 0, 'completing extraction must not trigger a download');
    assert.match(await page.locator('#status').textContent(), /请先筛选页面/);
    assert.equal(await page.locator('#review-notice').isVisible(), true);
    await page.locator('#pages article').last().getByRole('button', {name: '删除'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 3);
    await verifyCacheRelease(page, 'remote MP4 / automatic naming');
    const download = page.waitForEvent('download'); await page.locator('#pdf').click();
    const pdf = await download; await pdf.saveAs(path.join(output, 'slides-test.pdf'));
    assert.equal(pdf.suggestedFilename(), expectedFilename, 'download uses the class start, not today or the video filename');
    assert.equal(downloads, 1, 'only a manual download action exports the PDF');
    const document = await PDFDocument.load(fs.readFileSync(path.join(output, 'slides-test.pdf')));
    assert.equal(document.getPageCount(), 3); assert.equal(document.getPage(0).getWidth(), 842); assert.equal(document.getPage(0).getHeight(), 473.625);
    await page.screenshot({path: path.join(output, 'verified-interface.png'), fullPage: true});
    console.log(`Dense scan: 4 unique slides; no automatic download; user filtering exports 3 pages; elapsed ${(Date.now() - started) / 1000}s`);
    // A new load recreates a working video after explicit release.
    await page.locator('#tab-source').click();
    await page.locator('#load').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled);
    // Reopening preserves screenshot DB.
    const reopened = await context.newPage(); await reopened.goto(extensionOrigin + '/capture.html');
    await reopened.waitForFunction(() => document.querySelectorAll('#pages article').length === 3);
    assert.equal(await reopened.locator('#course-name').inputValue(), courseName); await reopened.close();
    await course.goto('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477015');
    await page.locator('#discover').click();
    await page.waitForFunction(() => sourceCourse.name === '另一门课程').catch(async error => {
      console.error('First switch diagnostics:', await page.evaluate(() => ({sourceCourse, coursePage, sourceCoursePage, namingManual, status: document.querySelector('#source-status').textContent})));
      console.error('Course fixture:', await course.locator('body').innerText());
      console.error('Page errors:', errors);
      throw error;
    });
    assert.equal(await page.locator('#course-name').inputValue(), courseName, 'retained screenshots keep original auto naming after switching course');
    assert.equal(await page.locator('#run').isEnabled(), false, 'changing course releases the previous video to avoid mislabelling');
    await course.goto('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477014');
    await page.locator('#discover').click();
    await page.waitForFunction(name => sourceCourse.name === name, courseName);
    // Manual correction is reflected in the actual download and persists across reloads.
    await page.locator('#tab-export').click();
    await page.locator('#course-name').fill('手动/课程'); await page.locator('#course-start').fill('15:31:00');
    const manualDownload = page.waitForEvent('download'); await page.locator('#pdf').click();
    assert.equal((await manualDownload).suggestedFilename(), '手动_课程-2026-09-07-15-31-00.pdf');
    await page.evaluate(() => namingSave); await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 3);
    assert.equal(await page.locator('#course-name').inputValue(), '手动/课程');
    assert.equal(await page.locator('#course-start').inputValue(), '15:31:00');
    await course.goto('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477015');
    await page.locator('#discover').click();
    await page.waitForFunction(() => sourceCourse.name === '另一门课程').catch(async error => {
      console.error('Naming diagnostics:', await page.evaluate(() => ({sourceCourse, coursePage, sourceCoursePage, namingManual, status: document.querySelector('#source-status').textContent})));
      throw error;
    });
    assert.equal(await page.locator('#course-name').inputValue(), '手动/课程', 'new course cannot overwrite retained page naming');
    // Loading the other source selects its own lesson and preserves the previous lesson exactly.
    const firstLesson = await storedPageSnapshot(page);
    await page.locator('summary').filter({hasText: '手动视频地址'}).click();
    await page.locator('#url').fill(origin + '/lecture_other.mp4'); await page.locator('#load-url').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled);
    assert.equal(await page.locator('#pages article').count(), 0, 'new lesson starts with its own empty review list');
    assert.deepEqual(await storedPageSnapshot(page), firstLesson, 'course switch preserves original page bytes, metadata and order');
    console.log('Course naming: exact filename, JSON-only metadata, legacy migration, manual corrections and course switch isolation passed');
    // Sparse and fine scans operate on this lesson while the original lesson stays saved.
    await page.waitForFunction(() => document.querySelector('#course-name').value === '另一门课程');
    assert.equal(await page.locator('#course-date').inputValue(), '2026-09-08');
    await page.locator('#tab-extraction').click();
    await page.locator('#mode').selectOption('2'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成'));
    assert.equal(await page.locator('#pages article').count(), 3, 'sparse endpoints can miss a brief page between identical frames');
    const coarseIds = await page.evaluate(() => pages.map(item => item.id));
    await page.locator('#mode').selectOption('0.5'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成'));
    assert.equal(await page.locator('#pages article').count(), 4, 'fine scan adds the brief page missed by the coarse scan');
    const merged = await page.evaluate(ids => ({
      times: pages.map(item => item.sourceTime),
      insertedAt: pages.findIndex(item => !ids.includes(item.id))
    }), coarseIds);
    assert.deepEqual(merged.times, [...merged.times].sort((a, b) => a - b), 'fine-scan pages are merged in video-time order');
    assert(merged.insertedAt >= 0 && merged.insertedAt < merged.times.length - 1, 'the recovered middle page is inserted, not appended');
    // HLS uses random-access segments, preserving dense extraction.
    page.once('dialog', d => d.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => !document.querySelector('#load-url').disabled);
    // The manual address panel is already open after reloading the source above.
    await page.locator('#tab-source').click();
    await page.locator('#url').fill(origin + '/lecture_2.m3u8'); await page.locator('#load-url').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled, {timeout: 15000});
    await page.locator('#tab-extraction').click();
    await page.locator('#mode').selectOption('0.5'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成'), {timeout: 30000});
    assert.equal(await page.locator('#pages article').count(), 4);
    const originalOrder = await page.evaluate(() => pages.map(item => item.id));
    const firstCard = page.locator('#pages article').first(), lastCard = page.locator('#pages article').last();
    await firstCard.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.__integrationFirstDrag = null;
      document.querySelector('#pages').addEventListener('dragstart', event => {
        window.__integrationFirstDrag = {id: event.target.closest('article')?.dataset.pageId, trusted: event.isTrusted};
      }, {once: true, capture: true, passive: true});
    });
    const firstDragBox = await firstCard.boundingBox(), dragStartPoint = {x: firstDragBox.x + firstDragBox.width / 2, y: firstDragBox.y + firstDragBox.height / 2};
    await page.mouse.move(dragStartPoint.x, dragStartPoint.y); await page.mouse.down();
    try {
      // Lock the native source before normal target scrolling moves other cards beneath the pointer.
      await page.mouse.move(dragStartPoint.x + 12, dragStartPoint.y, {steps: 3});
      await page.waitForFunction(() => window.__integrationFirstDrag);
      const nativeSourceStart = await page.evaluate(() => window.__integrationFirstDrag);
      assert.deepEqual(nativeSourceStart, {id: String(originalOrder[0]), trusted: true}, 'native drag starts on the original first card');
      console.log('Native drag source:', JSON.stringify(nativeSourceStart));
      await lastCard.scrollIntoViewIfNeeded();
      const lastBox = await lastCard.boundingBox(), galleryBox = await page.locator('#pages').boundingBox(), viewport = page.viewportSize();
      const left = Math.max(lastBox.x + lastBox.width / 2, galleryBox.x, 0), right = Math.min(lastBox.x + lastBox.width, galleryBox.x + galleryBox.width, viewport.width);
      const top = Math.max(lastBox.y, galleryBox.y, 0), bottom = Math.min(lastBox.y + lastBox.height, galleryBox.y + galleryBox.height, viewport.height);
      assert(right - left > 8 && bottom - top > 8, 'the last card has a visible right-half drop area inside the gallery and viewport');
      const dropPoint = {x: Math.floor(right - 4), y: Math.floor((top + bottom) / 2)};
      assert(dropPoint.x > left && dropPoint.x < right && dropPoint.y > top && dropPoint.y < bottom, 'rounded native drop coordinates stay inside that area');
      assert.equal(await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.closest('#pages article')?.dataset.pageId, dropPoint), String(originalOrder.at(-1)), 'native drop point hits the intended last card');
      console.log('Native drag target:', JSON.stringify({id: originalOrder.at(-1), point: dropPoint, visible: {left, right, top, bottom}}));
      await page.mouse.move(dropPoint.x, dropPoint.y, {steps: 10});
    } finally {
      await page.mouse.up(); await page.evaluate(() => { delete window.__integrationFirstDrag; });
    }
    await page.waitForFunction(id => pages.at(-1)?.id === id, originalOrder[0]);
    const draggedOrder = await page.evaluate(() => pages.map(item => item.id));
    assert.deepEqual(draggedOrder, [...originalOrder.slice(1), originalOrder[0]], 'dragging changes the export order');
    const orderCheck = await context.newPage(); await orderCheck.goto(extensionOrigin + '/capture.html');
    await orderCheck.waitForFunction(expected => pages.length === expected.length && pages.every((item, index) => item.id === expected[index]), draggedOrder);
    await orderCheck.close();
    assert(crossDomainHeaders > 0, 'cross-domain HLS segments must carry course Referer');
    console.log('Cross-domain HLS scan: 4 unique slides; chronological fine-scan merge, drag order persistence and Referer verified');
    await page.locator('#tab-export').click();
    assert.equal(await page.locator('#course-date').inputValue(), '', 'unmatched HLS source has no inherited recording date');
    await page.locator('#course-name').fill('手动HLS课程'); await page.locator('#course-date').fill('2026-09-08'); await page.locator('#course-start').fill('08:05:00');
    await page.evaluate(() => namingSave);
    await verifyCacheRelease(page, 'HLS / manual naming');
    const releasedDownload = page.waitForEvent('download'); await page.locator('#pdf').click();
    const releasedPDF = await releasedDownload;
    assert.equal(releasedPDF.suggestedFilename(), '手动HLS课程-2026-09-08-08-05-00.pdf');
    assert.equal((await PDFDocument.load(fs.readFileSync(await releasedPDF.path()))).getPageCount(), 4, 'PDF export remains usable after HLS release');
    // Local import selects its own lesson; other saved screenshots remain exact.
    const beforeLocal = await storedPageSnapshot(page);
    await page.locator('#tab-source').click();
    await page.locator('#file').setInputFiles(path.join(output, 'lecture_2.mp4'));
    await page.waitForFunction(() => !document.querySelector('#run').disabled);
    assert.equal(await page.locator('#pages article').count(), 0);
    assert.deepEqual(await storedPageSnapshot(page), beforeLocal, 'local import preserves the source lessons');
    assert.equal(await page.locator('#clear').isDisabled(), true, 'empty current lesson cannot clear another lesson');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length >= 1);
    await page.locator('#stop').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('已停止'));
    assert(await page.locator('#pages article').count() >= 1); assert.equal(await page.locator('#pdf').isEnabled(), true);
    const stoppedPages = await storedPageSnapshot(page);
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('#clear').click();
    assert.deepEqual(await storedPageSnapshot(page), stoppedPages, 'cancelling clear preserves all original screenshots');
    // Crop uses image coordinates, excluding letterbox margins, then restores controls.
    await page.locator('#crop-select').click();
    const cropInput = await page.locator('#overlay').evaluate(overlay => {
      const video = document.querySelector('video'), box = overlay.getBoundingClientRect();
      const client = {width: video.clientWidth, height: video.clientHeight}, raw = {width: video.videoWidth, height: video.videoHeight};
      const scale = Math.min(client.width / raw.width, client.height / raw.height);
      const image = {x: box.x + (client.width - raw.width * scale) / 2, y: box.y + (client.height - raw.height * scale) / 2, width: raw.width * scale, height: raw.height * scale};
      return {client, raw, canvas: {width: overlay.width, height: overlay.height}, overlay: {x: box.x, y: box.y, width: box.width, height: box.height}, image,
        start: {x: image.x + image.width * 0.25, y: image.y + image.height * 0.25}, end: {x: image.x + image.width * 0.75, y: image.y + image.height * 0.75},
        wholeOverlayHalfHeight: raw.height * box.height / (2 * image.height)};
    });
    console.log('Public crop input geometry:', JSON.stringify(cropInput));
    assert.equal(cropInput.raw.height, 720, 'local crop fixture retains its public native height');
    await page.mouse.move(cropInput.start.x, cropInput.start.y); await page.mouse.down();
    await page.mouse.move(cropInput.end.x, cropInput.end.y); await page.mouse.up();
    console.log('Read-only crop after native input:', await page.evaluate(() => ({...crop})));
    assert.equal(await page.locator('#overlay').evaluate(el => el.style.pointerEvents), 'none');
    const oldCount = await page.locator('#pages article').count(); await page.locator('#shot').click();
    await page.waitForFunction(n => document.querySelectorAll('#pages article').length === n + 1, oldCount);
    const croppedImage = page.locator('#pages article img').last();
    await croppedImage.scrollIntoViewIfNeeded(); await croppedImage.click();
    await page.waitForFunction(() => { const image = document.querySelector('#lightbox-img'); return image.complete && image.naturalWidth > 0; });
    const cropSize = await page.locator('#lightbox-img').evaluate(async img => { await img.decode(); return {w: img.naturalWidth, h: img.naturalHeight}; });
    console.log('Decoded crop dimensions:', cropSize);
    assert(cropSize.w > 600 && cropSize.w < 660); assert.equal(cropSize.h, 360);
    await page.locator('#lightbox-close').click(); await page.locator('#full').click();
    await verifyCacheRelease(page, 'local video');
    // A server error must be actionable and preserve all extracted pages.
    const retained = await page.locator('#pages article').count(), beforeError = await storedPageSnapshot(page);
    await page.locator('#url').fill(origin + '/missing_2.mp4'); await page.locator('#load-url').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('HTTP 404'));
    assert.equal(await page.locator('#pages article').count(), retained);
    assert.deepEqual(await storedPageSnapshot(page), beforeError, 'HTTP failure preserves all lessons and original image bytes');
    assert.equal(await page.locator('#pdf').isEnabled(), true);
    // Opening only the course list page supplies 2- PPT videos and preserves a manual crop path for 0-only lessons.
    await course.goto('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail');
    await page.locator('#discover').click();
    await page.waitForFunction(() => !batchDiscovery && batchJobs.length === 4 && document.querySelector('#batch-status').textContent.includes('目录已列举完整')).catch(async error => {
      console.error('Batch fixture diagnostics:', await page.evaluate(() => ({coursePage, sourceCourse, batchPage, jobs: batchJobs.map(job => ({id: job.id, state: job.state, reason: job.reason})), status: document.querySelector('#batch-status').textContent, sourceStatus: document.querySelector('#source-status').textContent})));
      throw error;
    });
    assert.equal(await page.locator('#batch-jobs .batch-job').count(), 4);
    assert.deepEqual(await page.evaluate(() => batchJobs.map(job => ({id: job.id, acquisition: job.discovery?.state}))), [
      {id: 'batch-a', acquisition: 'ready'}, {id: 'batch-b', acquisition: 'ready'}, {id: 'batch-c', acquisition: 'ready'}, {id: '700004', acquisition: 'skipped'}
    ], 'discovery retains the unfinished row and three usable recordings');
    const skippedRow = page.locator('#batch-jobs .batch-job[data-job-id="700004"]');
    assert.equal(await skippedRow.locator('input[type="checkbox"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => PPTBatch.automatic(batchJobs.find(job => job.id === '700004'))), false);
    assert.match(await page.locator('#batch-status').textContent(), /跳过 1/);
    assert.match(await page.locator('#batch-jobs .batch-job[data-job-id="batch-c"]').textContent(), /仅有 0 路视频/);
    assert.equal(await page.locator('#batch-jobs button').filter({hasText: '加载 0 路并框选'}).count(), 1);
    const currentLessonId = await page.evaluate(() => activeLesson.id), otherLessons = (await storedPageSnapshot(page)).filter(item => item.lessonId !== currentLessonId);
    assert(otherLessons.length > 0, 'batch regression begins with saved pages in other lessons');
    page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => pages.length === 0 && !busy());
    assert.deepEqual(await storedPageSnapshot(page), otherLessons, 'clear removes only the current lesson');
    await page.locator('#tab-extraction').click();
    await page.locator('#mode').selectOption('0.5');
    await page.locator('#tab-source').click();
    holdBatchReply = true;
    await page.evaluate(() => { globalThis.batchRaceFixture = {refresh: discoverBatch()}; });
    await Promise.race([batchReplyHeld, new Promise((_, reject) => setTimeout(() => reject(Error('Batch discovery fixture was not held')), 5000))]);
    assert.equal(await page.locator('#batch-start').isDisabled(), true, 'discovery prevents a concurrent batch start');
    await page.locator('#stop').click(); await page.waitForFunction(() => !batchDiscovery);
    assert.match(await page.locator('#batch-status').textContent(), /课程读取已停止/);
    await page.evaluate(() => { batchRaceFixture.jobs = batchJobs; batchRaceFixture.page = batchPage; });
    await page.locator('#batch-start').click();
    await page.waitForFunction(() => batchRunning && ['loading', 'scanning'].includes(batchJobs[0].state));
    releaseBatchReply(); await page.evaluate(() => batchRaceFixture.refresh);
    assert.deepEqual(await page.evaluate(() => ({sameArray: batchJobs === batchRaceFixture.jobs,
      sameJobs: batchJobs.every((job, index) => job === batchRaceFixture.jobs[index]), samePage: batchPage === batchRaceFixture.page})),
    {sameArray: true, sameJobs: true, samePage: true}, 'a delayed list refresh cannot replace running batch objects or its course page');
    await page.waitForFunction(() => !batchRunning && batchJobs.filter(job => job.discovery?.state === 'ready' && !job.requiresCrop).every(job => job.state === 'done'), {timeout: 60000});
    assert.deepEqual(await page.evaluate(() => batchJobs.map(job => batchPages(job).length)), [4, 4, 0, 0]);
    assert.equal((await savedBatchJob(page, 'batch-a')).state, 'done');
    assert.equal((await savedBatchJob(page, 'batch-b')).state, 'done', 'both original running jobs persist completion after the stale reply');
    await page.locator('#batch-discover').click();
    await page.waitForFunction(() => !batchDiscovery && document.querySelector('#batch-status').textContent.includes('目录已列举完整'));
    console.log('Delayed real batch discovery reply preserves running job identities, course page and both persisted completions');
    const originalIds = new Set(otherLessons.map(item => item.id));
    assert.deepEqual((await storedPageSnapshot(page)).filter(item => originalIds.has(item.id)), otherLessons, 'batch processing preserves previously saved lessons exactly');
    assert.equal(await page.locator('#batch-jobs button').filter({hasText: '下载本节 PDF'}).count(), 4);
    assert.equal(await skippedRow.getByRole('button', {name: '下载本节 PDF'}).isDisabled(), true);
    const fallbackRow = page.locator('#batch-jobs .batch-job[data-job-id="batch-c"]'), screenName = '12345/0-batch-c-screen.mp4';
    assert.equal(await fallbackRow.locator('select option').count(), 2);
    assert.equal(await fallbackRow.locator('select').inputValue(), fallbackOptions[0].download_url, 'teacher channel is the default first option');
    await fallbackRow.locator('select').selectOption(fallbackOptions[1].download_url);
    assert.equal((await savedBatchJob(page, 'batch-c')).sourceName, screenName);
    await fallbackRow.getByRole('button', {name: '加载 0 路并框选'}).click();
    await page.waitForFunction(() => sourceReady && activeBatchJob?.id === 'batch-c' && selectionMode === 'crop');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('请先在 0 路视频画面中'));
    assert.equal(await page.evaluate(() => selectionMode), 'crop', 'the scan guard keeps the required crop selection active');
    const fallbackBox = await page.locator('#overlay').boundingBox();
    await page.mouse.move(fallbackBox.x + fallbackBox.width * 0.2, fallbackBox.y + fallbackBox.height * 0.2); await page.mouse.down();
    await page.mouse.move(fallbackBox.x + fallbackBox.width * 0.8, fallbackBox.y + fallbackBox.height * 0.8); await page.mouse.up();
    const screenCrop = await page.evaluate(() => ({...crop}));
    assert.equal((await savedBatchJob(page, 'batch-c')).cropConfirmed, true, 'drawing a crop persists confirmation before any scan or later write');
    await page.reload(); await page.waitForFunction(() => ready && batchJobs.length === 4);
    assert.equal(await page.evaluate(() => sourceReady), false, 'reload restores metadata without loading a video or resuming a scan');
    assert.equal((await savedBatchJob(page, 'batch-c')).sourceName, screenName);
    assert.equal((await savedBatchJob(page, 'batch-c')).cropConfirmed, true, 'crop confirmation survives an immediate reload');
    assert.deepEqual(await page.evaluate(() => crop), screenCrop);
    await page.locator('#tab-source').click();
    if (!await page.locator('#batch-panel').evaluate(panel => panel.open)) await page.locator('#batch-panel > summary').click();
    await fallbackRow.locator('.batch-manual button').click();
    await page.waitForFunction(() => sourceReady && !task && activeBatchJob?.id === 'batch-c');
    assert.equal(await page.evaluate(() => selectionMode), null, 'restored screen crop is already confirmed');
    const screenTask = await pauseScan(page);
    assert.equal(await page.evaluate(() => canResume()), true);
    for (let refresh = 0; refresh < 2; refresh++) {
      const beforeURL = await fallbackRow.locator('select').inputValue(), revision = fallbackRevision;
      await page.locator('#batch-discover').click();
      await page.waitForFunction(url => !batchDiscovery && document.querySelector('#batch-status').textContent.includes('目录已列举完整') && batchJobs.find(job => job.id === 'batch-c')?.url !== url, beforeURL);
      assert(fallbackRevision > revision, 'refresh obtains a new signed URL from the real content discovery path');
      const selected = await savedBatchJob(page, 'batch-c');
      assert.equal(selected.sourceName, screenName, 'refresh retains the chosen second channel');
      assert.equal(selected.url, fallbackOptions[1].download_url, 'retained channel uses its newly signed URL');
      assert.equal(await fallbackRow.locator('select').inputValue(), selected.url);
      assert.equal(selected.cropConfirmed, true, 'URL signing renewal preserves the matching crop confirmation');
      await fallbackRow.locator('.batch-manual button').click();
      await page.waitForFunction(url => sourceReady && !task && activeLesson.source.url === url, selected.url);
      assert.deepEqual(await page.evaluate(() => crop), screenCrop);
      assert.deepEqual(await page.evaluate(() => activeLesson.task), screenTask, 'the same channel retains its real paused checkpoint across URL renewals');
      assert.equal(await page.evaluate(() => canResume()), true);
    }
    await page.reload(); await page.waitForFunction(() => ready && batchJobs.length === 4);
    assert.equal((await savedBatchJob(page, 'batch-c')).sourceName, screenName);
    assert.equal((await savedBatchJob(page, 'batch-c')).cropConfirmed, true);
    assert.deepEqual(await page.evaluate(() => activeLesson.task), screenTask);
    assert.equal(await page.evaluate(() => sourceReady || !!task), false);
    await page.locator('#tab-source').click();
    if (!await page.locator('#batch-panel').evaluate(panel => panel.open)) await page.locator('#batch-panel > summary').click();
    await fallbackRow.locator('.batch-manual button').click();
    await page.waitForFunction(() => sourceReady && !task && activeBatchJob?.id === 'batch-c');
    assert.equal(await page.evaluate(() => canResume()), true);
    await page.locator('#run').click();
    await page.waitForFunction(() => !task && batchJobs.find(job => job.id === 'batch-c')?.state === 'done', {timeout: 60000});
    assert.equal(await page.evaluate(() => batchPages(batchJobs.find(job => job.id === 'batch-c')).length), 4);
    const abandonedTask = await pauseScan(page);
    assert.equal(await page.evaluate(() => canResume()), true);
    // A stored review range belongs to the old channel just like its real paused task.
    await page.evaluate(async () => { activeLesson.suspects = [{start: 0.5, end: 1, time: 0.75}]; await persistLesson(); renderLibrary(); });
    const beforeChannelChange = await storedPageSnapshot(page), oldScreenURL = await fallbackRow.locator('select').inputValue();
    screenAvailable = false;
    await page.locator('#batch-discover').click();
    await page.waitForFunction(url => !batchDiscovery && document.querySelector('#batch-status').textContent.includes('目录已列举完整') && batchJobs.find(job => job.id === 'batch-c')?.url !== url, oldScreenURL);
    const replacement = await savedBatchJob(page, 'batch-c');
    assert.equal(replacement.sourceName, '12345/0-batch-c-teacher.mp4');
    assert.equal(replacement.url, fallbackOptions[0].download_url);
    assert.equal(await fallbackRow.locator('select option').count(), 1);
    assert.equal(replacement.cropConfirmed, false, 'a missing selected channel cannot transfer crop confirmation to the default channel');
    await fallbackRow.locator('.batch-manual button').click();
    await page.waitForFunction(url => sourceReady && !task && activeLesson.source.url === url, replacement.url);
    assert.equal(await page.evaluate(() => activeLesson.task), null, 'changing the underlying channel discards its old scan task ' + abandonedTask.id);
    assert.deepEqual(await page.evaluate(() => activeLesson.suspects), [], 'old-channel review ranges cannot follow the replacement video');
    assert.deepEqual(await page.evaluate(() => crop), {x: 0, y: 0, w: 1, h: 1});
    assert.equal(await page.evaluate(() => selectionMode), 'crop', 'replacement video requires a new crop');
    assert.equal(await page.evaluate(() => canResume()), false);
    assert.deepEqual(await storedPageSnapshot(page), beforeChannelChange, 'channel replacement keeps every original screenshot, order and asset byte');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('请先在 0 路视频画面中'));
    assert.equal(await page.evaluate(() => !!task), false, 'the old checkpoint is not resumed before confirming the new channel');
    await page.locator('#full').click();
    assert.equal((await savedBatchJob(page, 'batch-c')).cropConfirmed, true, 'using the full frame persists confirmation before any later write');
    await page.reload(); await page.waitForFunction(() => ready && batchJobs.length === 4);
    assert.equal((await savedBatchJob(page, 'batch-c')).cropConfirmed, true);
    assert.equal((await savedBatchJob(page, 'batch-c')).sourceName, replacement.sourceName);
    assert.equal(await page.evaluate(() => activeLesson.task), null);
    assert.deepEqual(await storedPageSnapshot(page), beforeChannelChange);
    await page.locator('#tab-source').click();
    if (!await page.locator('#batch-panel').evaluate(panel => panel.open)) await page.locator('#batch-panel > summary').click();
    await fallbackRow.locator('.batch-manual button').click();
    await page.waitForFunction(() => sourceReady && !task && activeBatchJob?.id === 'batch-c');
    assert.equal(await page.evaluate(() => selectionMode), null, 'full-frame confirmation survives an immediate reload');
    await page.locator('#run').click();
    await page.waitForFunction(() => !task && batchJobs.find(job => job.id === 'batch-c')?.state === 'done', {timeout: 60000});
    console.log('Two 0-channel videos: selected screen, renewed URLs, immediate crop/full-frame reload, paused checkpoint and missing-channel invalidation passed');
    const fallbackLessonId = await page.evaluate(() => activeLesson.id), beforeFallbackClear = await storedPageSnapshot(page);
    const confirmedFallbackCrop = await page.evaluate(() => ({crop: activeLesson.crop, cropOverride: batchJobs.find(job => job.id === 'batch-c').cropOverride}));
    assert(confirmedFallbackCrop.cropOverride, 'the completed 0-only lesson has a reusable confirmed crop');
    page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => pages.length === 0 && !busy() && batchJobs.filter(job => job.discovery?.state === 'ready' && !job.requiresCrop).every(job => job.state === 'done') && batchJobs.find(job => job.id === 'batch-c')?.state === 'pending' && batchJobs.find(job => job.id === 'batch-c').selected);
    assert.deepEqual(await page.evaluate(() => {
      const job = batchJobs.find(job => job.id === 'batch-c');
      return {crop: activeLesson.crop, cropOverride: job.cropOverride, cropConfirmed: job.cropConfirmed, cropRejected: !!job.cropRejected,
        state: job.state, selected: job.selected, task: activeLesson.task, suspects: activeLesson.suspects};
    }), {...confirmedFallbackCrop, cropConfirmed: true, cropRejected: false, state: 'pending', selected: true, task: null, suspects: []}, 'clear retains the confirmed crop and queues the eligible 0-only lesson while resetting extraction state');
    assert.deepEqual(await page.evaluate(() => batchJobs.map(job => batchPages(job).length)), [4, 4, 0, 0]);
    assert.deepEqual(await storedPageSnapshot(page), beforeFallbackClear.filter(item => item.lessonId !== fallbackLessonId), 'clearing the 0-only lesson preserves both completed automatic lessons and original data');
    assert.equal(await fallbackRow.locator('input[type="checkbox"]').isChecked(), true, 'the cleared eligible 0-only lesson checkbox reflects its selected model');
    await fallbackRow.locator('input[type="checkbox"]').uncheck();
    assert.equal(await page.evaluate(() => batchJobs.find(job => job.id === 'batch-c').selected), false, 'only the cleared 0-only lesson is explicitly deselected');
    assert.deepEqual(await page.evaluate(() => batchJobs.filter(job => job.discovery?.state === 'ready' && !job.requiresCrop).map(job => ({id: job.id, state: job.state}))), [{id: 'batch-a', state: 'done'}, {id: 'batch-b', state: 'done'}], 'both completed native lessons remain done');
    assert.equal(await page.locator('#batch-start').isDisabled(), true, 'completed automatic lessons are not queued again when the cleared 0-only lesson is unselected');
    const repeatLessonId = await page.evaluate(() => batchLesson(batchJobs.find(job => job.id === 'batch-a')).id);
    await page.locator('#lesson-select').selectOption(repeatLessonId);
    await page.waitForFunction(id => activeLesson.id === id && pages.length === 4 && !busy(), repeatLessonId);
    const beforeRepeat = (await storedPageSnapshot(page)).filter(item => item.lessonId !== repeatLessonId);
    page.once('dialog', dialog => dialog.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => pages.length === 0 && !busy() && batchJobs.find(job => job.id === 'batch-a').state === 'pending' && batchJobs.find(job => job.id === 'batch-a').selected);
    assert.deepEqual(await page.evaluate(() => batchJobs.map(job => batchPages(job).length)), [0, 4, 0, 0]);
    assert.deepEqual(await storedPageSnapshot(page), beforeRepeat);
    await page.locator('#batch-start').click();
    await page.waitForFunction(() => !batchRunning && batchJobs.filter(job => job.discovery?.state === 'ready' && !job.requiresCrop).every(job => job.state === 'done'), {timeout: 60000});
    assert.deepEqual(await page.evaluate(() => batchJobs.map(job => batchPages(job).length)), [4, 4, 0, 0]);
    assert.deepEqual((await storedPageSnapshot(page)).filter(item => item.lessonId !== repeatLessonId), beforeRepeat, 'rerunning one cleared lesson preserves completed lessons, original bytes and order');
    assert.equal(errors.length, 0, errors.join('\n')); assert.deepEqual(blocked, [], 'no external network requests');
    console.log('JSON-only discovery, local import, stop, cropping, isolated lesson clear, batch rerun and HTTP error preservation: passed; browser errors: 0');
  } finally {
    await context.close(); await new Promise(resolve => server.close(resolve));
    if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('ppt-capture-test-')) throw Error('Unexpected test directory');
    fs.rmSync(temp, {recursive: true, force: true});
  }
  // Render all pages for visual review using the actual PDF writer output.
  command('pdftoppm', ['-png', '-scale-to-x', '1280', '-scale-to-y', '-1', path.join(output, 'slides-test.pdf'), path.join(output, 'pdf-page')]);
  for (let i = 1; i <= 3; i++) {
    const image = await sharp(path.join(output, `pdf-page-${i}.png`)).raw().toBuffer({resolveWithObject: true});
    assert.equal(image.info.width, 1280); assert.equal(image.info.height, 720);
    const expected = await sharp(path.join(output, `slide${i}.png`)).removeAlpha().raw().toBuffer();
    let mean = 0; for (let j = 0; j < expected.length; j++) mean += Math.abs(expected[j] - image.data[j]);
    mean /= expected.length; assert(mean < 4, `PDF page ${i} rendering differs from source (mean ${mean})`);
  }
  console.log('PDF render: all 3 retained pages correct aspect ratio, order, and visual content');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
