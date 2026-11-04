/* Reproduces null URL origins and opaque document origins in real browser frames. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {dependency, browserOptions} = require('./runtime.cjs');
const {chromium} = dependency('playwright');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch(browserOptions());
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://bridge.test/**', route => route.fulfill({contentType: 'text/html', body: route.request().url().endsWith('/player') ? '<!doctype html><p>Sandbox URL frame</p>' : `<!doctype html><iframe id="inherited" srcdoc="<p>Inherited origin</p>"></iframe><iframe id="opaque" sandbox="allow-scripts" srcdoc="<p>Opaque origin</p>"></iframe><iframe id="opaque-url" sandbox="allow-scripts" src="https://bridge.test/player"></iframe>`}));
    await page.goto('https://bridge.test/');
    const urls = [];
    for (const id of ['inherited', 'opaque', 'opaque-url']) {
      const frame = await (await page.locator('#' + id).elementHandle()).contentFrame();
      await frame.waitForLoadState();
      const origins = await frame.evaluate(() => ({document: window.origin, url: location.origin}));
      if (id === 'inherited') { assert.equal(origins.url, 'null'); assert.equal(origins.document, 'https://bridge.test'); }
      else assert.equal(origins.document, 'null');
      const video = `https://cdn.example/${id}.mp4`; urls.push(video);
      await frame.evaluate(videoURL => {
        window.__testMessages = [];
        Object.defineProperty(window, 'chrome', {configurable: true, value: {runtime: {id: 'bridge-test', sendMessage: async message => { window.__testMessages.push(message); }, onMessage: {addListener: listener => { window.__testDiscover = listener; }}}}});
        window.fetch = async () => new Response(JSON.stringify({data: {video: videoURL}}), {headers: {'content-type': 'application/json'}});
      }, video);
      for (const script of ['media.js', 'course.js', 'page-hook.js', 'content.js']) await frame.addScriptTag({content: fs.readFileSync(path.join(root, script), 'utf8')});
      assert.deepEqual(errors, [], id + ': bridge must not throw on initialization');
      await frame.evaluate(async () => { await fetch('/fixture.json'); });
      await frame.waitForFunction(url => window.__testMessages.some(m => m.urls?.includes(url)), video, {timeout: 6000});
      // Other windows cannot inject media into this frame, even with targetOrigin '*'.
      await page.evaluate(frameId => document.getElementById(frameId).contentWindow.postMessage({type: 'PPT_CAPTURE_MEDIA_V2', urls: ['https://cdn.example/forged.mp4']}, '*'), id);
      await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 25)));
      const collected = await frame.evaluate(() => new Promise(resolve => window.__testDiscover({type: 'PPT_DISCOVER'}, {}, resolve)));
      assert(collected.urls.includes(video)); assert(!collected.urls.some(url => url.endsWith('/forged.mp4')));
      console.log(`Message bridge: ${id}, URL origin ${origins.url}, document origin ${origins.document}: delivered; foreign window rejected`);
    }
    const lessonPage = await browser.newPage();
    lessonPage.on('pageerror', error => errors.push(error.message));
    await lessonPage.route('https://rms-v5.xjtu.edu.cn/**', route => {
      const {pathname} = new URL(route.request().url());
      if (pathname === '/api/v1/rms-service/study-capture-courses/16220/captures/477014') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              code: '477014',
              course: {id: 16220, name: '光电传感与机器视觉'},
              start_time: '2026-10-20T02:10:00+00:00',
              lesson_videos: [{label: 'ENCODER', download_url: 'https://cdn.example/oss?response-content-disposition=attachment%3B%20filename%3D%222-fallback.mp4%22'}]
            }
          })
        });
      }
      if (pathname === '/api/v1/rms-service/study-capture-courses/16220') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              course_name: '光电传感与机器视觉',
              schedules: [{id: 1, capture_code: '477014', status: 'FINISHED', start_time: '2026-10-20T02:10:00+00:00'}]
            }
          })
        });
      }
      return route.fulfill({contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>课程录播</title><video></video>'});
    });
    for (const targetURL of [
      'https://rms-v5.xjtu.edu.cn/study-capture-courses/16220/preview-detail/477014',
      'https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail'
    ]) {
      await lessonPage.goto(targetURL);
      await lessonPage.evaluate(() => {
        window.__testMessages = [];
        Object.defineProperty(window, 'chrome', {
          configurable: true,
          value: {
            runtime: {
              id: 'bridge-test',
              sendMessage: async message => { window.__testMessages.push(message); },
              onMessage: {addListener: listener => { window.__testDiscover = listener; }}
            }
          }
        });
      });
      for (const script of ['media.js', 'course.js', 'batch.js', 'content.js']) {
        await lessonPage.addScriptTag({content: fs.readFileSync(path.join(root, script), 'utf8')});
      }
      const discovered = await lessonPage.evaluate(() => new Promise(resolve => window.__testDiscover({type: 'PPT_DISCOVER'}, {}, resolve)));
      assert(discovered.urls.some(u => u.includes('2-fallback.mp4')), `API fallback must discover video for ${targetURL}`);
      assert.equal(discovered.course.name, '光电传感与机器视觉');
      assert.equal(discovered.course.date, '2026-10-20');
      assert.equal(discovered.course.start, '10:10:00');
      const sentTypes = await lessonPage.evaluate(() => window.__testMessages.map(m => m.type));
      assert(sentTypes.includes('PPT_MEDIA'), 'API fallback must send PPT_MEDIA');
      assert(sentTypes.includes('PPT_COURSE'), 'API fallback must send PPT_COURSE');
    }
    await lessonPage.close();
    assert.deepEqual(errors, [], 'no recurring postMessage errors');
    console.log('Frame-origin regression tests passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
