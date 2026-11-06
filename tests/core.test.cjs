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
test('small but substantive text changes beat compression and cursor noise', () => {
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
    runtime: {onMessage: {addListener: fn => { listeners.message = fn; }}},
    tabs: {
      get: async () => tab,
      onRemoved: {addListener: fn => { listeners.removed = fn; }},
      onUpdated: {addListener: fn => { listeners.updated = fn; }}
    },
    action: {onClicked: {addListener() {}}, setBadgeText: badge('text'), setBadgeBackgroundColor: badge('color')},
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
