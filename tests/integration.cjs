/* Runs an isolated headless Edge profile; never uses the user's browser profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), {spawnSync} = require('node:child_process');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright');
const sharp = dependency('sharp');
const {PDFDocument} = dependency('pdf-lib');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.test-output');
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
}
async function main() {
  await fixtures();
  let remoteRequests = 0, headerRequests = 0, crossDomainHeaders = 0;
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
  for (const name of ['manifest.json', 'background.js', 'media.js', 'page-hook.js', 'content.js', 'capture.html', 'capture.js', 'scanner.js', 'style.css', 'pdf.js', 'vendor']) fs.cpSync(path.join(root, name), path.join(ext, name), {recursive: true});
  const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  // Grant only fixture server access in this test copy to avoid a headless permission dialog.
  manifest.host_permissions.push('http://127.0.0.1/*', 'http://localhost/*');
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {...browserOptions(), args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext], acceptDownloads: true});
  const errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(p.url() + ': ' + e.stack)));
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionOrigin = worker.url().replace('/background.js', '');
    // Fulfill the course page locally; no request is sent to the school.
    const course = await context.newPage();
    await course.route('https://rms-v5.xjtu.edu.cn/**', route => {
      if (route.request().url().endsWith('/fixture.json')) return route.fulfill({contentType: 'application/json', body: JSON.stringify({data: {video: origin + '/lecture_2.mp4'}})});
      if (route.request().url().endsWith('/sandbox-player')) return route.fulfill({contentType: 'text/html', body: `<!doctype html><video preload="none" src="${origin}/lecture_1.mp4"></video>`});
      return route.fulfill({contentType: 'text/html', body: `<!doctype html><title>Local course fixture</title><video preload="none" src="${origin}/lecture_1.mp4"></video><video preload="none"></video><iframe sandbox="allow-scripts" src="https://rms-v5.xjtu.edu.cn/sandbox-player"></iframe><script>fetch('/fixture.json').then(r=>r.json());</script>`});
    });
    await course.goto('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477014');
    const page = await context.newPage(); await page.goto(extensionOrigin + '/capture.html');
    let downloads = 0; page.on('download', () => { downloads++; });
    await page.waitForFunction(() => document.querySelector('#sources').options.length >= 3);
    assert.equal(await page.locator('#sources').inputValue(), '', 'wait for manual selection');
    assert.equal(await page.locator('#load').isEnabled(), false);
    assert.doesNotMatch(await page.locator('#sources').textContent(), /★|视频\s*2/);
    await page.locator('#sources').selectOption(origin + '/lecture_2.mp4');
    assert.equal(await page.locator('#load').isEnabled(), true);
    // Real extension fetch + Blob decoding; fixture CDN has no CORS headers.
    await page.locator('#load').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled, {timeout: 15000});
    assert.match(await page.locator('#status').textContent(), /已加载/);
    assert(remoteRequests > 0); assert(headerRequests > 0, 'course Referer must reach the fixture CDN');
    await page.locator('#mode').selectOption('0.5');
    const started = Date.now();
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成') && !document.querySelector('#run').disabled);
    assert.equal(await page.locator('#pages article').count(), 4, 'dense scan captures 4 distinct slides including the one-second slide');
    assert.equal(downloads, 0, 'completing extraction must not trigger a download');
    assert.match(await page.locator('#status').textContent(), /请先筛选页面/);
    assert.equal(await page.locator('#review-notice').isVisible(), true);
    await page.locator('#pages article').last().getByRole('button', {name: '删除'}).click();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 3);
    const download = page.waitForEvent('download'); await page.locator('#pdf').click();
    const pdf = await download; await pdf.saveAs(path.join(output, 'slides-test.pdf'));
    assert.equal(downloads, 1, 'only a manual download action exports the PDF');
    const document = await PDFDocument.load(fs.readFileSync(path.join(output, 'slides-test.pdf')));
    assert.equal(document.getPageCount(), 3); assert.equal(document.getPage(0).getWidth(), 842); assert.equal(document.getPage(0).getHeight(), 473.625);
    await page.screenshot({path: path.join(output, 'verified-interface.png'), fullPage: true});
    console.log(`Dense scan: 4 unique slides; no automatic download; user filtering exports 3 pages; elapsed ${(Date.now() - started) / 1000}s`);
    // Reopening preserves screenshot DB.
    const reopened = await context.newPage(); await reopened.goto(extensionOrigin + '/capture.html');
    await reopened.waitForFunction(() => document.querySelectorAll('#pages article').length === 3); await reopened.close();
    // Clear only fixture data; then test sparse sampling's documented limitation.
    page.once('dialog', d => d.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length === 0 && !document.querySelector('#run').disabled);
    await page.locator('#mode').selectOption('2'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成'));
    assert.equal(await page.locator('#pages article').count(), 3, 'sparse endpoints can miss a brief page between identical frames');
    // HLS uses random-access segments, preserving dense extraction.
    page.once('dialog', d => d.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => !document.querySelector('#load-url').disabled);
    await page.locator('summary').filter({hasText: '手动视频地址'}).click();
    await page.locator('#url').fill(origin + '/lecture_2.m3u8'); await page.locator('#load-url').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled, {timeout: 15000});
    await page.locator('#mode').selectOption('0.5'); await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('提取完成'), {timeout: 30000});
    assert.equal(await page.locator('#pages article').count(), 4);
    assert(crossDomainHeaders > 0, 'cross-domain HLS segments must carry course Referer');
    console.log('Cross-domain HLS scan: 4 unique slides; Referer, persistence, sparse-sampling boundary verified');
    // Local import and prompt cancellation must not erase results; stop keeps committed pages.
    await page.locator('#file').setInputFiles(path.join(output, 'lecture_2.mp4'));
    await page.waitForFunction(() => !document.querySelector('#run').disabled);
    page.once('dialog', d => d.accept()); await page.locator('#clear').click();
    await page.waitForFunction(() => !document.querySelector('#run').disabled);
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelectorAll('#pages article').length >= 1);
    await page.locator('#stop').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('已停止'));
    assert(await page.locator('#pages article').count() >= 1); assert.equal(await page.locator('#pdf').isEnabled(), true);
    // Crop uses image coordinates, excluding letterbox margins, then restores controls.
    await page.locator('#crop-select').click();
    const b = await page.locator('#overlay').boundingBox();
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.25); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.75); await page.mouse.up();
    assert.equal(await page.locator('#overlay').evaluate(el => el.style.pointerEvents), 'none');
    const oldCount = await page.locator('#pages article').count(); await page.locator('#shot').click();
    await page.waitForFunction(n => document.querySelectorAll('#pages article').length === n + 1, oldCount);
    const cropSize = await page.locator('#pages article img').last().evaluate(img => ({w: img.naturalWidth, h: img.naturalHeight}));
    assert(cropSize.w > 600 && cropSize.w < 660); assert.equal(cropSize.h, 360);
    await page.locator('#full').click();
    // A server error must be actionable and preserve all extracted pages.
    const retained = await page.locator('#pages article').count();
    await page.locator('#url').fill(origin + '/missing_2.mp4'); await page.locator('#load-url').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('HTTP 404'));
    assert.equal(await page.locator('#pages article').count(), retained);
    assert.equal(await page.locator('#pdf').isEnabled(), true);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('JSON-only discovery, local import, stop, cropping, HTTP error preservation: passed; browser errors: 0');
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
