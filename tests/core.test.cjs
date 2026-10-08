const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../media.js');
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
});
test('timestamps cover first and last frame without exceeding duration', () => {
  assert.deepEqual(core.sampleTimes(4, 2), [0, 2, 3.95]);
  assert.equal(core.sampleTimes(0.02, 2).at(-1), 0.01);
  assert.throws(() => core.sampleTimes(Infinity, 2)); assert.throws(() => core.sampleTimes(3, 0));
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
test('simultaneous background discoveries survive; session cache is page-specific', async () => {
  const listeners = {}, storage = {}, tab = {url: 'https://rms-v5.xjtu.edu.cn/course/A'};
  const chrome = {
    runtime: {onMessage: {addListener: fn => { listeners.message = fn; }}},
    tabs: {get: async () => tab, onRemoved: {addListener() {}}},
    action: {onClicked: {addListener() {}}},
    webRequest: {onBeforeRequest: {addListener: fn => { listeners.request = fn; }}},
    storage: {session: {get: async k => ({[k]: storage[k]}), set: async value => Object.assign(storage, value), remove: async k => delete storage[k]}}
  };
  const context = vm.createContext({chrome, PPTCore: core, importScripts() {}, URL, Date});
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const send = url => new Promise(resolve => listeners.message({type: 'PPT_MEDIA', urls: [url]}, {tab: {id: 42}, url: tab.url}, resolve));
  await Promise.all([send('https://cdn.example/A_1.mp4'), send('https://cdn.example/A_2.mp4')]);
  assert.equal(storage['media-42'].items.length, 2);
  await new Promise(resolve => listeners.message({type: 'PPT_MEDIA', urls: ['https://cdn.example/iframe.mp4']}, {tab: {id: 42}, url: 'about:srcdoc'}, resolve));
  assert.equal(storage['media-42'].items.length, 3);
  tab.url = 'https://rms-v5.xjtu.edu.cn/course/B'; await send('https://cdn.example/B_2.mp4');
  assert.equal(storage['media-42'].items.length, 1); assert.equal(storage['media-42'].items[0].name, 'B_2.mp4');
});
