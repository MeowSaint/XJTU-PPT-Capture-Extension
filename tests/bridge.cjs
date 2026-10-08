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
      for (const script of ['media.js', 'page-hook.js', 'content.js']) await frame.addScriptTag({content: fs.readFileSync(path.join(root, script), 'utf8')});
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
    assert.deepEqual(errors, [], 'no recurring postMessage errors');
    console.log('Frame-origin regression tests passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
