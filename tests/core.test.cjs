const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../media.js');
test('ignore masks rasterize edges and reject invalid or fully covered comparison images', () => {
  assert.equal(core.ignoreMask(null), null);
  assert.deepEqual([...core.ignoreMask({x: .26, y: 0, w: .25, h: .5}, 4, 2)], [0, 1, 1, 0, 0, 0, 0, 0]);
  for (const rect of [{x: -1, y: 0, w: 1, h: 1}, {x: 0, y: 0, w: 0, h: 1}, {x: 0, y: NaN, w: 1, h: 1}, {x: 0, y: 0, w: 2, h: 1}, {x: 0, y: 0, w: 1, h: 1}, {x: .001, y: .001, w: .998, h: .998}]) assert.throws(() => core.ignoreMask(rect));
  const a = new Uint8Array(8);
  assert.equal(core.similar(a, a, 1.2, new Uint8Array([1, 1])), false);
  assert.equal(core.similar(a, a, 1.2, new Uint8Array(1)), false);
});
test('masked comparison excludes ignored pixels from bias and both denominators without mutation', () => {
  const a = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const b = new Uint8ClampedArray([107, 107, 107, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const mask = new Uint8Array([0, 1, 1]), original = [a.slice(), b.slice(), mask.slice()];
  assert.deepEqual(core.frameDistance(a, b, mask), {changed: 0, mean: 0});
  b[0] = b[1] = b[2] = 151;
  assert.deepEqual(core.frameDistance(a, b, mask), {changed: 100, mean: 20});
  b[0] = b[1] = b[2] = 107;
  assert.deepEqual([a, b, mask], original);
  assert.equal(core.similar(a, b), false);
});
global.PPTCourse = require('../course.js');
const batch = require('../batch.js');
test('parses video URLs equally without filename preference; excludes segments', () => {
  const a = core.mediaInfo('https://cdn.example/course_1.mp4?sign=abc');
  const b = core.mediaInfo('https://cdn.example/course_2.mp4?sign=xyz');
  assert.deepEqual(Object.keys(a), ['url', 'name', 'kind']);
  assert.deepEqual(Object.keys(b), ['url', 'name', 'kind']);
  assert.equal(b.url, 'https://cdn.example/course_2.mp4?sign=xyz');
  assert.equal(core.mediaInfo('https://cdn.example/segment2.ts'), null);
  assert.equal(core.mediaInfo('javascript:alert(2)'), null);
  assert.equal(core.mediaInfo('https://user:password@cdn.example/file_2.mp4'), null);
  assert.equal(core.mediaInfo('/recording/index.m3u8', 'https://cdn.example').kind, 'm3u8');
  assert.equal(core.mediaInfo('https://cdn.example/download?filename=lecture.mp4').kind, 'mp4');
  assert.equal(core.mediaInfo('https://cdn.example/oss/object?response-content-disposition=attachment%3B%20filename%3D%222-lecture.mp4%22&sign=1').name, '2-lecture.mp4');
  assert.equal(core.mediaInfo('https://cdn.example/get?key=captures%2F2-key.mp4').name, '2-key.mp4');
  assert.equal(core.mediaInfo('https://cdn.example/get?file_key=12345/2-filekey.m4v').kind, 'm4v');
  assert.equal(core.mediaInfo('https://cdn.example/proxy?download_url=https%3A%2F%2Foss.example%2F2-dl.webm%3Ftoken%3D1').kind, 'webm');
  assert.equal(core.mediaInfo('https://cdn.example/proxy?video_url=%2Fstream%2F2-vid.mov').kind, 'mov');
  assert.equal(core.mediaInfo('https://cdn.example/proxy?src=https%3A%2F%2Foss.example%2Fplay.m3u8').kind, 'm3u8');
  assert.equal(core.mediaInfo('https://cdn.example/files/12345%2F2-segment-path.mp4/download?token=abc').name, '2-segment-path.mp4');
  assert.deepEqual(core.extractUrls('{"data":{"video":"https://cdn.example/stringified.mp4","nested":"[{\\"src\\":\\"/hls/2-nested.m3u8\\"}]"}}', 'https://rms-v5.xjtu.edu.cn'), [
    'https://cdn.example/stringified.mp4',
    'https://rms-v5.xjtu.edu.cn/hls/2-nested.m3u8'
  ]);
});
test('timestamps cover first and last frame without exceeding duration', () => {
  assert.deepEqual(core.sampleTimes(4, 2), [0, 2, 3.95]);
  assert.equal(core.sampleTimes(0.02, 2).at(-1), 0.01);
  assert.throws(() => core.sampleTimes(Infinity, 2)); assert.throws(() => core.sampleTimes(3, 0));
});
test('course-list batch discovery selects the ENCODER 2- video and skips unfinished lessons', () => {
  assert.equal(batch.courseId('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail'), '16220');
  assert.equal(batch.courseId('https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477014'), '16220');
  assert.equal(batch.courseId('https://rms-v5.xjtu.edu.cn/study-capture-courses/16220/preview-detail'), '16220');
  assert.equal(batch.courseId('https://rms-v5.xjtu.edu.cn/study-capture-courses/16220/preview-detail/477014'), '16220');
  assert.equal(batch.courseId('https://rms-v5.xjtu.edu.cn/player?courseId=16220'), '16220');
  assert.equal(batch.courseId('https://rms-v5.xjtu.edu.cn/player?course_id=16220'), '16220');
  const schedule = {id: 593018, capture_code: 'abc', status: 'FINISHED', start_time: '2026-10-20T02:10:00+00:00', course: {name: '传感网络与大数据技术'}};
  assert.equal(batch.eligible(schedule), true);
  assert.equal(batch.eligible({...schedule, capture_code: null, status: 'TRANSCODING'}), false);
  const capture = {data: {lesson_videos: [
    {label: 'INSTRUCTOR', file_key: '12345/0-class.mp4', download_url: 'https://cdn.example/0-class.mp4'},
    {label: 'ENCODER', file_key: '12345/2-class.mp4', download_url: 'https://cdn.example/2-class.mp4', size: 123}
  ]}};
  assert.equal(batch.selectVideo(capture).label, 'ENCODER');
  const job = batch.job(schedule, capture);
  assert.equal(job.url, 'https://cdn.example/2-class.mp4');
  assert.deepEqual(job.course, {name: '传感网络与大数据技术', date: '2026-10-20', start: '10:10:00'});
  const fallback = batch.job({...schedule, capture_code: 'only-zero'}, {data: {lesson_videos: [
    {label: 'INSTRUCTOR', file_key: '12345/0-only-zero.mp4', download_url: 'https://cdn.example/0-only-zero.mp4'}
  ]}});
  assert.equal(fallback.requiresCrop, true);
  assert.equal(fallback.selected, false);
  assert.equal(fallback.state, 'needs-crop');
  assert.equal(fallback.options[0].sourceName, '12345/0-only-zero.mp4');
});
test('message bridge handles inherited and opaque origins, rejecting other windows', () => {
  const calls = [], frame = {origin: 'https://rms-v5.xjtu.edu.cn', location: {origin: 'null'}, postMessage: (...args) => calls.push(args)};
  core.postLocalMessage(frame, {type: 'query'});
  assert.equal(calls[0][1], 'https://rms-v5.xjtu.edu.cn');
  frame.origin = 'null'; frame.location.origin = 'https://rms-v5.xjtu.edu.cn';
  core.postLocalMessage(frame, {type: 'query'}); assert.equal(calls[1][1], '*');
  assert.equal(core.isLocalMessage({source: frame, origin: 'null'}, frame), true);
  assert.equal(core.isLocalMessage({source: {}, origin: 'null'}, frame), false);
  assert.equal(core.isLocalMessage({source: frame, origin: 'https://other.example'}, frame), false);
});
test('extraction merges minor formula and annotation changes; manual review protects them', () => {
  const a = new Uint8ClampedArray(82944).fill(255);
  for (const [label, count, channels] of [['superscript', 2, 3], ['subscript', 1, 3], ['single digit', 1, 3], ['formula', 48, 3], ['annotation', 8, 1]]) {
    const b = a.slice();
    for (let p = 0; p < count; p++) for (let c = 0; c < channels; c++) b[p * 4 + c] = 0;
    const d = core.frameDistance(a, b);
    assert(d.changed < 1.2 && d.mean < .6, label + ' passes the old global rule');
    assert.equal(core.similar(a, b), true, label);
    assert.equal(core.similarForReview(a, b), false, label);
    assert.equal(core.hasLocalChange(a, b), true, label);
  }
});
test('local protection uses exact floating bias, RGB maximum, edges and per-pixel masks', () => {
  const a = new Uint8ClampedArray(82944).fill(128), mask = new Uint8Array(192 * 108);
  for (const p of [0, 191, 192 * 107, 192 * 108 - 1, 10001]) for (const channel of [0, 1, 2]) {
    for (const delta of [47, 48]) {
      const b = a.slice(); b[p * 4 + channel] += delta;
      // Opposite differences below 48 cancel the exact per-channel mean.
      b[((p + 1) % mask.length) * 4 + channel] -= 24;
      b[((p + 2) % mask.length) * 4 + channel] -= delta - 24;
      assert.equal(core.hasLocalChange(a, b), delta === 48, `${p}/${channel}/${delta}`);
      assert.equal(core.similar(a, b), true);
      assert.equal(core.similarForReview(a, b), delta === 47);
    }
    const b = a.slice(); b[p * 4 + channel] += 48;
    assert.equal(core.hasLocalChange(a, b), false, 'raw 48 falls below 48 after fractional bias');
    b[p * 4 + channel] = 255; mask.fill(0); mask[p] = 1;
    assert.equal(core.similarForReview(a, b, 1.2, mask), true, 'fully masked single pixel');
    b[((p + 1) % mask.length) * 4 + channel] = 255;
    assert.equal(core.similarForReview(a, b, 1.2, mask), false, 'partially masked change');
  }
  for (const delta of [-8, 0, 8]) {
    const b = a.map((value, index) => index % 4 === 3 ? value : value + delta);
    assert.equal(core.hasLocalChange(a, b), false); assert.equal(core.similar(a, b), true);
  }
  const uncorrected = a.map((value, index) => index % 4 === 3 ? value : value + 9);
  assert.equal(core.frameDistance(a, uncorrected).changed, 0); assert.equal(core.hasLocalChange(a, uncorrected), false);
  assert(core.frameDistance(a, uncorrected).mean >= .6, 'brightness control independently reaches the mean threshold');
  assert.equal(core.similar(a, uncorrected), false, 'the old mean threshold still applies above the brightness tolerance');
  const weak = a.slice();
  for (let p = 0; p < 256; p++) weak[p * 4] += p % 2 ? -30 : 30;
  const weakDistance = core.frameDistance(a, weak);
  assert.equal(core.hasLocalChange(a, weak), false);
  assert(weakDistance.changed >= 1.2, 'weak changes reach the changed-percentage threshold');
  assert(weakDistance.mean < .6, 'weak changes stay below the independent mean threshold');
  assert.equal(core.similar(a, weak), false, 'the changed-percentage threshold independently rejects weak changes');
  const alpha = a.slice(); for (let i = 3; i < alpha.length; i += 4) alpha[i] = 0;
  assert.equal(core.similar(a, alpha), true, 'alpha does not affect RGB comparison');
  for (const [x, y, m] of [[null, a], [a, a.slice(4)], [a, a, new Uint8Array(1)], [a, a, new Uint8Array(20736).fill(1)]]) {
    assert.equal(core.similar(x, y, 1.2, m), false); assert.equal(core.hasLocalChange(x, y, m), true);
  }
  const legacyA = new Uint8Array(1000 * 4), legacyB = legacyA.slice(); legacyB[0] = 255;
  assert.equal(core.similar(legacyA, legacyB), true, 'noncanonical lengths retain global-only logic');
  assert.equal(core.hasLocalChange(legacyA, legacyB), false);
});
test('v2.4.0 detection tolerates isolated pixels and slight brightness changes but keeps larger edits', () => {
  const pixels = 192 * 108, a = new Uint8ClampedArray(pixels * 4).fill(255), b = a.slice();
  for (let i = 0; i < 8; i++) b[i * 4] = 0;
  assert.equal(core.similar(a, b), true);
  b.set(a); for (let i = 0; i < b.length; i += 4) b[i] = b[i + 1] = b[i + 2] = 249;
  assert.equal(core.similar(a, b), true);
  for (let i = 0; i < 400; i++) b[i * 4] = b[i * 4 + 1] = b[i * 4 + 2] = 0;
  assert.equal(core.similar(a, b), false);
});
function backgroundHarness() {
  const listeners = {}, storage = {}, badges = [], tab = {url: 'https://rms-v5.xjtu.edu.cn/course/A'};
  const state = {badgeFailure: '', beforeSet: async () => {}};
  const badge = method => (details, callback) => {
    badges.push({method, ...details});
    if (state.badgeFailure === 'promise') return Promise.reject(new Error('No tab with id: 42'));
    queueMicrotask(() => {
      if (state.badgeFailure === 'callback') chrome.runtime.lastError = {message: 'No tab with id: 42'};
      callback();
      delete chrome.runtime.lastError;
    });
  };
  const chrome = {
    runtime: {getURL: file => 'chrome-extension://fixture/' + file, onMessage: {addListener: fn => { listeners.message = fn; }}},
    tabs: {
      get: async () => tab,
      create: async details => { state.createdTab = details; },
      onRemoved: {addListener: fn => { listeners.removed = fn; }},
      onUpdated: {addListener: fn => { listeners.updated = fn; }}
    },
    scripting: {executeScript: async details => { (state.injections ||= []).push(details); return []; }},
    action: {onClicked: {addListener: fn => { listeners.clicked = fn; }}, setBadgeText: badge('text'), setBadgeBackgroundColor: badge('color')},
    webRequest: {onBeforeRequest: {addListener: fn => { listeners.request = fn; }}},
    storage: {session: {
      get: async k => ({[k]: storage[k]}),
      set: async value => { await state.beforeSet(); Object.assign(storage, value); },
      remove: async k => { delete storage[k]; }
    }}
  };
  const context = vm.createContext({chrome, PPTCore: core, importScripts() {}, URL, Date});
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const send = (...urls) => new Promise(resolve => listeners.message({type: 'PPT_MEDIA', urls}, {tab: {id: 42}, url: tab.url}, resolve));
  const flush = () => vm.runInContext('queue', context);
  return {listeners, storage, badges, tab, state, send, flush};
}

test('simultaneous background discoveries survive; session cache is page-specific', async () => {
  const {listeners, storage, tab, send} = backgroundHarness();
  await Promise.all([send('https://cdn.example/A_1.mp4'), send('https://cdn.example/A_2.mp4')]);
  assert.equal(storage['media-42'].items.length, 2);
  await new Promise(resolve => listeners.message({type: 'PPT_MEDIA', urls: ['https://cdn.example/iframe.mp4']}, {tab: {id: 42}, url: 'about:srcdoc'}, resolve));
  assert.equal(storage['media-42'].items.length, 3);
  tab.url = 'https://rms-v5.xjtu.edu.cn/course/B'; await send('https://cdn.example/B_2.mp4');
  assert.equal(storage['media-42'].items.length, 1); assert.equal(storage['media-42'].items[0].name, 'B_2.mp4');
});

test('generic toolbar entry retains its tab and injects collectors; restricted pages open manual import', async () => {
  const {listeners, state} = backgroundHarness();
  await listeners.clicked({id: 17, url: 'https://lectures.example/watch?v=1'});
  assert.equal(state.createdTab.url, 'chrome-extension://fixture/capture.html?tab=17');
  assert.equal(state.injections.length, 2);
  assert(state.injections.every(call => call.target.tabId === 17 && call.target.allFrames));
  assert.equal(state.injections[0].world, 'MAIN');
  await listeners.clicked({id: 18, url: 'chrome://extensions/'});
  assert.equal(state.createdTab.url, 'chrome-extension://fixture/capture.html');
  assert.equal(state.injections.length, 2);
});

test('generic background sources stay scoped to the current page and reject stale top-frame reports', async () => {
  const {tab, storage, send, listeners} = backgroundHarness();
  tab.url = 'https://lectures.example/watch?courseId=42';
  await send('https://cdn.example/lesson.webm');
  assert.equal(storage['media-42'].page, tab.url);
  tab.url = 'https://lectures.example/next';
  await new Promise(resolve => listeners.message({type: 'PPT_MEDIA', urls: ['https://cdn.example/stale.mp4'], page: 'https://lectures.example/watch?courseId=42'}, {tab: {id: 42}, url: tab.url, frameId: 0}, resolve));
  assert.equal(storage['media-42'].items.length, 1);
  await send('https://cdn.example/next.mp4');
  assert.deepEqual(Array.from(storage['media-42'].items, item => item.name), ['next.mp4']);
  assert.equal(core.isCoursePage('https://lectures.example/watch?courseId=42'), false);
  assert.equal(core.isCoursePage('https://rms-v5.xjtu.edu.cn.evil.example/'), false);
  for (const url of ['blob:https://lectures.example/id', 'javascript:alert(1)', 'chrome://settings', 'https://user:secret@example.org/']) assert.equal(core.isWebPage(url), false);
});

test('badge counts only unique valid sources for the current tab and clears zero', async () => {
  const {storage, badges, tab, send} = backgroundHarness();
  storage['media-42'] = {page: tab.url, items: [
    {url: 'https://cdn.example/A.mp4'}, {url: 'https://cdn.example/A.mp4'},
    {url: 'https://cdn.example/segment.ts'}, {url: 'javascript:alert(1)'}
  ]};
  await send('https://cdn.example/A.mp4', 'https://cdn.example/B.mp4', 'https://cdn.example/segment.ts');
  assert.deepEqual(badges.filter(x => x.method === 'text').at(-1), {method: 'text', tabId: 42, text: '2'});
  assert.deepEqual(badges.filter(x => x.method === 'color').at(-1), {method: 'color', tabId: 42, color: '#b91c1c'});
  tab.url = 'https://rms-v5.xjtu.edu.cn/course/B';
  await send('https://cdn.example/segment.ts');
  assert.equal(badges.filter(x => x.method === 'text').at(-1).text, '');
  assert.equal(storage['media-42'].items.length, 0);
});

test('navigation and reload clear stale badges/cache after pending media writes', async () => {
  const {storage, badges, tab, state, send, listeners, flush} = backgroundHarness();
  let release, started;
  const writing = new Promise(resolve => { started = resolve; });
  state.beforeSet = () => { started(); return new Promise(resolve => { release = resolve; }); };
  const pending = send('https://cdn.example/A.mp4');
  await writing;
  tab.url = 'https://rms-v5.xjtu.edu.cn/course/B';
  listeners.updated(42, {url: tab.url, status: 'loading'}, tab);
  release();
  await pending;
  await flush();
  assert.equal(storage['media-42'], undefined);
  assert.equal(badges.filter(x => x.method === 'text').at(-1).text, '');
  state.beforeSet = async () => {};
  await send('https://cdn.example/B.mp4');
  listeners.updated(42, {status: 'complete'}, tab);
  await flush();
  assert.equal(storage['media-42'].items.length, 1);
  listeners.updated(42, {status: 'loading'}, tab);
  await flush();
  assert.equal(storage['media-42'], undefined);
  await send('https://cdn.example/B.mp4');
  tab.url = 'https://example.org/';
  listeners.updated(42, {url: tab.url}, tab);
  await flush();
  assert.equal(storage['media-42'], undefined);
  assert.equal(badges.filter(x => x.method === 'text').at(-1).text, '');
});

test('closed-tab badge callback errors and promise rejections do not lose cache writes', async () => {
  const {storage, badges, state, send, listeners, flush} = backgroundHarness();
  state.badgeFailure = 'callback';
  assert.equal((await send('https://cdn.example/A.mp4')).ok, true);
  assert.equal(badges.length, 2);
  state.badgeFailure = 'promise';
  assert.equal((await send('https://cdn.example/B.mp4')).ok, true);
  assert.equal(badges.length, 4);
  assert.equal(storage['media-42'].items.length, 2);
  listeners.removed(42);
  await flush();
  assert.equal(storage['media-42'], undefined);
});


test('media errors retain stage and native uncertainty with source-aware guidance', () => {
  for (const phase of ['load', 'seek']) for (const local of [false, true]) {
    const error = core.mediaError({code: 3}, {phase, local, audioOmitted: true, time: 12.5});
    assert.equal(error.code, 'MEDIA_DECODE_FAILED'); assert.equal(error.phase, phase);
    assert.equal(error.nativeCode, 3); assert.equal(error.time, 12.5);
    assert.match(error.message, /12\.5/); assert.match(error.message, /已忽略音轨/);
    assert.doesNotMatch(error.message, /音频损坏|视频损坏|刷新课程/);
    assert.match(core.mediaError({code: 4}, {phase, local}).message, /不支持|格式/);
  }
  for (const code of [2, 'MEDIA_TIMEOUT']) {
    const local = core.mediaError({code}, {local: true, phase: 'seek', time: 4});
    assert.doesNotMatch(local.message, /刷新|服务器|网络|过期/);
    assert.match(local.message, /本地|磁盘|文件/);
  }
});

function mediaHarness(extra = {}) {
  const source = fs.readFileSync(require.resolve('../capture.js'), 'utf8');
  const nodes = new Map();
  const video = Object.assign(new EventTarget(), {readyState: 0, error: null, duration: 8, videoWidth: 640, videoHeight: 360, currentTime: 0, getVideoPlaybackQuality: () => ({totalVideoFrames: 1, droppedVideoFrames: 0})});
  const sandbox = {PPTCore: core, DOMException, AbortController, Blob, URL, setTimeout, clearTimeout, video,
    status: () => {}, $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
    PPTScanner: class { static prime(_video, signal) { signal?.throwIfAborted(); return {ready: Promise.resolve(), verify() {}, dispose() {}}; } async seek(time, signal) { signal?.throwIfAborted(); video.currentTime = time; } },
    videoCache: null, mediaContext: {}, mediaRecovery: {omitAudio: true},
    PPTDiskCache: {create: async () => { const chunks = []; return {write: async chunk => { chunks.push(chunk); }, finish: async () => new Blob(chunks), remove: async () => {}}; }}, ...extra};
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('async function awaitVideo('), source.indexOf('async function inspectPlaylist(')), sandbox);
  return sandbox;
}
test('fetchVideo validates status, complete ranges and comparable body lengths', async () => {
  for (const [response, code] of [
    [new Response('x', {status: 403}), 'HTTP_STATUS'],
    [new Response('<html>', {headers: {'content-type': 'text/html'}}), 'NOT_VIDEO'],
    [new Response(''), 'EMPTY_MEDIA'],
    [new Response('xx', {status: 206, headers: {'content-range': 'bytes 1-2/3'}}), 'INCOMPLETE_RESPONSE'],
    [new Response('xx', {status: 206}), 'INCOMPLETE_RESPONSE'],
    [new Response('xx', {headers: {'content-length': '3'}}), 'INCOMPLETE_RESPONSE'],
    [new Response('xx', {status: 206, headers: {'content-range': 'bytes 0-2/3'}}), 'INCOMPLETE_RESPONSE'],
  ]) {
    const h = mediaHarness({fetch: async () => response});
    await assert.rejects(h.fetchVideo('http://127.0.0.1/a.mp4'), error => error.code === code && error.phase === 'fetch');
  }
  for (const headers of [{'content-range': 'bytes 0-1/2', 'content-length': '2'}, {'content-encoding': 'gzip', 'content-length': '999'}]) {
    const h = mediaHarness({fetch: async () => new Response('xx', {status: headers['content-range'] ? 206 : 200, headers})});
    assert.equal((await h.fetchVideo('http://127.0.0.1/a.mp4')).size, 2);
  }
});
test('fetchVideo deadlines and cancellation settle stalled headers/read without a lifetime limit', async () => {
  for (const body of [false, true]) for (const cancel of [false, true]) {
    let aborted = false, readCancelled = false;
    const h = mediaHarness({fetch: async (_url, {signal}) => {
      signal.addEventListener('abort', () => { aborted = true; });
      if (!body) return new Promise(() => {});
      return new Response(new ReadableStream({pull() {}, cancel() { readCancelled = true; }}));
    }});
    const controller = new AbortController(), pending = h.fetchVideo('http://127.0.0.1/a.mp4', controller.signal, {timeoutMs: 15});
    if (cancel) setTimeout(() => controller.abort(), 2);
    await assert.rejects(pending, error => cancel ? error.name === 'AbortError' : error.code === 'MEDIA_TIMEOUT');
    assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(aborted, true); if (body) assert.equal(readCancelled, true);
  }
  let writes = 0;
  const h = mediaHarness({fetch: async () => new Response(new ReadableStream({async pull(controller) {
    await new Promise(resolve => setTimeout(resolve, 8));
    if (++writes <= 4) controller.enqueue(new Uint8Array([1])); else controller.close();
  }}))});
  assert.equal((await h.fetchVideo('http://127.0.0.1/a.mp4', undefined, {timeoutMs: 20})).size, 4);
  assert.equal(writes, 5, 'each progressing read gets a new deadline');
});
test('awaitVideo rejects late loadeddata on abort and guards duration only for omitted audio', async () => {
  const h = mediaHarness(), controller = new AbortController();
  const pending = h.awaitVideo(controller.signal); controller.abort(); h.video.readyState = 2;
  h.video.dispatchEvent(new Event('loadeddata')); await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(require('node:events').getEventListeners(h.video, 'loadeddata').length, 0);
  assert.equal(require('node:events').getEventListeners(h.video, 'error').length, 0);
  h.video.duration = 9;
  h.mediaContext = {audioOmitted: true, inspection: {videoDuration: 8, movieTimescale: 1000}};
  await assert.rejects(h.awaitVideo(), error => error.code === 'MEDIA_DURATION_MISMATCH');
  h.mediaContext.audioOmitted = false; await h.awaitVideo();
});

test('attachment primes before src, awaits old readiness and presentation, and always disposes', async () => {
  for (const mode of ['success', 'attach-error', 'duration', 'abort', 'presentation-error', 'native-error']) {
    const calls = [], primary = Error(mode), controller = new AbortController(); let complete, reject, disposed = 0, settled = false;
    const ready = new Promise((resolve, fail) => { complete = resolve; reject = fail; }); ready.catch(() => {});
    const h = mediaHarness({PPTScanner: class { static prime(video, signal) {
      assert.equal(video.readyState, 0); assert.equal(signal, controller.signal); calls.push('prime');
      return {ready, verify() { calls.push('verify'); }, dispose() { disposed++; reject(new DOMException('stopped', 'AbortError')); }};
    } }});
    if (mode === 'duration') h.mediaContext = {audioOmitted: true, inspection: {videoDuration: 7, movieTimescale: 1000}};
    const pending = h.attachVideo(() => {
      calls.push('attach'); if (mode === 'attach-error') throw primary;
      if (mode !== 'native-error') h.video.readyState = 2;
    }, controller.signal);
    pending.then(() => { settled = true; }, () => {});
    assert.deepEqual(calls, ['prime', 'attach']); await Promise.resolve(); assert.equal(settled, false);
    if (mode === 'native-error') { h.video.error = {code: 3}; h.video.dispatchEvent(new Event('error')); }
    if (mode === 'presentation-error') reject(primary);
    if (mode === 'abort') { complete(); controller.abort(); }
    if (mode === 'success') { complete(); await pending; assert.equal(settled, true); assert.deepEqual(calls, ['prime', 'attach', 'verify']); }
    else await assert.rejects(pending, error => mode.endsWith('-error') && mode !== 'native-error' ? error === primary : mode === 'duration' ? error.code === 'MEDIA_DURATION_MISMATCH' : mode === 'native-error' ? error.phase === 'load' : error.name === 'AbortError');
    assert.equal(disposed, 1, mode); assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('load health checks distinguish explicit no-video evidence from unknown counters and delayed presentation', async () => {
  for (const mode of ['zero', 'positive', 'unknown']) {
    let counts = mode === 'unknown' ? {} : {totalVideoFrames: 0, droppedVideoFrames: 0}, seeks = 0;
    const h = mediaHarness({PPTScanner: class {
      constructor(_video, _capture, _context, onSeeked) { this.check = onSeeked; }
      async seek() { seeks++; if (mode === 'positive') counts = {totalVideoFrames: 1, droppedVideoFrames: 0}; this.check();
        if (mode === 'unknown') counts = {totalVideoFrames: 1, droppedVideoFrames: 0}; }
    }});
    h.video.readyState = 2; h.video.getVideoPlaybackQuality = () => counts;
    if (mode === 'zero') { await assert.rejects(h.awaitVideo(), error => error.code === 'MEDIA_NO_VIDEO' && error.phase === 'load' && error.time === .1); assert.equal(seeks, 1); }
    else { await h.awaitVideo(); assert.equal(seeks, 2); }
  }
});

test('native loadeddata without a decoded video track cannot become ready', async () => {
  const h = mediaHarness(); h.video.readyState = 2; h.video.videoWidth = h.video.videoHeight = 0;
  await assert.rejects(h.awaitVideo(), error => error.code === 'MEDIA_NO_VIDEO' && error.phase === 'load');
});


test('preparation retains the original Blob for disabled, unsupported and video-only paths', async () => {
  const file = new Blob(['0123456789']);
  for (const status of ['disabled', 'unsupported', 'video-only']) {
    let prepares = 0;
    const h = mediaHarness({mediaRecovery: {omitAudio: status !== 'disabled'}, PPTMP4: {prepare: async input => {
      prepares++; return {mode: 'original', blob: input, inspection: {status, code: 'CONTROL'}};
    }}});
    assert.equal(await h.prepareMedia(file), file); assert.equal(h.mediaContext.audioOmitted, false);
    assert.equal(prepares, status === 'disabled' ? 0 : 1);
  }
});
test('local parser reads reject by actual source, enforce per-read deadlines, and ignore late outcomes', async () => {
  for (const stalled of [false, true]) {
    const file = new Blob(['0123456789']), original = file.slice.bind(file); let release;
    file.slice = (...args) => { const part = original(...args); part.arrayBuffer = stalled ? () => new Promise(resolve => { release = resolve; }) : async () => { throw Error('disk offline'); }; return part; };
    const h = mediaHarness({PPTMP4: require('../mp4-recovery.js')});
    await assert.rejects(h.prepareMedia(file, undefined, {timeoutMs: 10}), error => {
      assert.equal(error.code, 'LOCAL_READ_FAILED'); assert.equal(error.phase, 'local-read');
      assert.doesNotMatch(error.message, /moov|索引|刷新/); return true;
    });
    if (release) release(new ArrayBuffer(8));
    assert.equal(h.mediaContext.audioOmitted, false);
  }
  let release;
  const h = mediaHarness({PPTMP4: {prepare: () => new Promise(resolve => { release = resolve; })}}), controller = new AbortController();
  const pending = h.prepareMedia(new Blob(['0123456789']), controller.signal);
  await Promise.resolve(); controller.abort(); await assert.rejects(pending, {name: 'AbortError'});
  release({mode: 'audio-omitted', blob: new Blob(['late']), inspection: {status: 'eligible'}}); await Promise.resolve();
  assert.equal(h.mediaContext.audioOmitted, false);
});


test('screenshot time seeks use the same cancellable native diagnostics', async () => {
  const source = fs.readFileSync(require.resolve('../capture.js'), 'utf8'); let message = '', seeks = 0;
  const h = {AbortController, sourceReady: true, stream: null, loadedIdentity: {sourceKey: 'original'}, mediaContext: {local: true}, task: null,
    busy: () => false, controls: () => {}, status: text => { message = text; }, timecode: String, $: () => ({open: false}),
    PPTLibrary: {key: value => value.sourceKey}, video: {duration: 8, currentTime: 0, pause() {}, seekable: {length: 1, start: () => 0, end: () => 8}},
    PPTScanner: class { async seek(time, signal) { seeks++; assert.equal(signal.aborted, false); throw core.mediaError({code: 2}, {phase: 'seek', local: true, time}); }}};
  vm.createContext(h); vm.runInContext(source.slice(source.search(/(?:async )?function seekPage\(/), source.indexOf('function updatePreview(')), h);
  await h.seekPage({sourceKey: 'original', sourceTime: 4});
  assert.equal(seeks, 1); assert.match(message, /跳转本地/); assert.match(message, /4/); assert.doesNotMatch(message, /刷新|服务器/); assert.equal(h.task, null);
});


test('metadata-only video cannot become ready without an actual decoded frame', async () => {
  const h = mediaHarness(); h.video.readyState = 2; h.video.getVideoPlaybackQuality = () => ({totalVideoFrames: 0, droppedVideoFrames: 0});
  await assert.rejects(h.awaitVideo(), error => error.code === 'MEDIA_NO_VIDEO' && error.phase === 'load');
});
