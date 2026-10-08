const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
const course = require('../course.js'), core = require('../media.js');
const page = 'https://rms-v5.xjtu.edu.cn/my-capture-courses/16220/preview-detail/477014';
const expected = {name: '传感网络与大数据技术', date: '2026-09-07', start: '15:30:00'};

test('course filename matches exact requested format and requires actual class time', () => {
  assert.equal(course.filename(expected), '传感网络与大数据技术-2026-09-07-15-30-00.pdf');
  assert.equal(course.filename({...expected, start: '15:30'}), course.filename(expected));
  assert.equal(course.filename({name: '课程'}), '');
  assert.equal(course.filename({...expected, date: '2026-02-29'}), '');
  assert.equal(course.filename({...expected, start: '24:30'}), '');
  assert.equal(course.filename({...expected, start: '15:30:99'}), '');
  assert.equal(course.filename({...expected, name: '课程/名称:*?"<>|'}), '课程_名称_______-2026-09-07-15-30-00.pdf');
});
test('wall-clock / China timezone timestamps preserve class date, not export date', () => {
  assert.deepEqual(course.startParts('2026年9月7日 15：30：00'), {date: expected.date, start: expected.start});
  assert.deepEqual(course.startParts('2026-09-07T07:30:00Z'), {date: expected.date, start: expected.start});
  assert.deepEqual(course.startParts(Date.parse('2026-09-07T07:30:00Z') / 1000), {date: expected.date, start: expected.start});
  assert.deepEqual(course.startParts('2026-09-07 15:30:00'), {date: expected.date, start: expected.start});
});
test('visible labels and course headings supply metadata, platform titles do not', () => {
  assert.deepEqual(course.fromText('课程名称：传感网络与大数据技术\n上课时间：2026-09-07 15:30:00 ~ 17:10:00', '资源管理平台'), expected);
  assert.deepEqual(course.fromText('上课时间\n2026年9月7日 15:30-17:10', '资源管理平台', expected.name), expected);
  assert.deepEqual(course.fromText('', '资源管理平台'), {});
  assert.deepEqual(course.fromText('2026-09-07 15:30\n2026-09-08 13:00', '资源管理平台'), {});
  assert.deepEqual(course.fromText('传感网络与大数据技术(202620271INSM40103201)\n第3节\n2026.09.15 周二 10:10 - 11:00\n50:00', expected.name), {...expected, date: '2026-09-15', start: '10:10:00'});
  assert.equal(course.fromText('2026.09.15 周二 10:10 - 11:00', '', expected.name + '(202620271INSM40103201)').name, expected.name);
  assert.deepEqual(course.fromDocument({title: expected.name, body: {innerText: '2026.09.15 周二 10:10 - 11:00'}, querySelector: () => null}), {...expected, date: '2026-09-15', start: '10:10:00'});
});
test('JSON fields are filtered by course and recording ID; ambiguous lists are not guessed', () => {
  assert.deepEqual(course.fromJSON({data: {courseId: 16220, captureId: 477014, courseName: expected.name, startTime: '2026-09-07 15:30:00', password: 'not-retained'}}, page), expected);
  assert.deepEqual(course.fromJSON({data: {course: {id: 16220, name: expected.name}, captures: [{id: 477000, startTime: '2026-01-01 00:00'}, {id: 477014, startTime: '2026-09-07 15:30'}]}}, page), expected);
  assert.deepEqual(course.fromJSON({courseId: 99, courseName: 'Other course', startTime: '2026-01-01 00:00'}, page), {});
  const ambiguous = course.fromJSON({rows: [{courseName: 'A', startTime: '2026-01-01 00:00'}, {courseName: 'B', startTime: '2026-01-02 12:00'}]}, page);
  assert.deepEqual(ambiguous, {});
});
test('background stores only normalized top-frame metadata and isolates navigation', async () => {
  let listener; const storage = {}, tab = {url: page};
  const chrome = {
    runtime: {onMessage: {addListener: fn => { listener = fn; }}},
    tabs: {get: async () => tab, onRemoved: {addListener() {}}},
    action: {onClicked: {addListener() {}}}, webRequest: {onBeforeRequest: {addListener() {}}},
    storage: {session: {get: async k => ({[k]: storage[k]}), set: async v => Object.assign(storage, v), remove() {}}}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), {chrome, PPTCore: core, PPTCourse: course, importScripts() {}, URL, Date});
  const message = {type: 'PPT_COURSE', course: {...expected, token: 'never-store'}, page};
  await new Promise(resolve => listener(message, {url: page, frameId: 0, tab: {id: 42}}, resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(storage['media-42'].course)), expected);
  assert.equal(listener(message, {url: page, frameId: 1, tab: {id: 42}}, () => {}), undefined);
  tab.url = page.replace('477014', '477015');
  await new Promise(resolve => listener(message, {url: page, frameId: 0, tab: {id: 42}}, resolve));
  assert.equal(storage['media-42'].page, page, 'stale metadata must not be attributed to the new tab URL');
});
