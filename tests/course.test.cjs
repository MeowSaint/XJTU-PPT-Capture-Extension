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
test('course opening dates never become recording dates through JSON or DOM fallback', () => {
  assert.deepEqual(course.fromText('课程名称：A\n开课时间：2026-09-14 00:00'), {name: 'A'});
  assert.deepEqual(course.fromDocument({title: '资源管理平台', body: {innerText: '课程名称：A\n开课时间\n2026-09-14 00:00'}, querySelector: () => null}), {name: 'A'});
  assert.deepEqual(course.fromText('课程名称：A\n课程日期：2026-09-14 00:00'), {name: 'A'});
  const documentWithHeading = heading => ({title: '旧标签名', body: {innerText: ''}, querySelector: selector => selector === 'h1' ? {textContent: heading} : null});
  assert.deepEqual(course.fromDocument(documentWithHeading('A')), {name: 'A'});
  assert.deepEqual(course.fromDocument(documentWithHeading('录播预览')), {name: '旧标签名'});
  assert.deepEqual(course.fromText('课程名称：A\n开课时间：2026-09-14 00:00 上课时间：2026-09-15 16:40'), {name: 'A', date: '2026-09-15', start: '16:40:00'});
  for (const field of ['start_time', 'coursedate', 'startDateTime']) {
    assert.deepEqual(course.fromJSON({course: {id: 16220, name: 'A', [field]: '2026-09-14 00:00'}}, page), {name: 'A'});
    assert.deepEqual(course.fromJSON({courseId: 16220, courseName: 'A', [field]: '2026-09-14 00:00'}, page), {name: 'A'});
  }
});
test('explicit course and subject entities keep opening times out despite capture pointers and envelopes', () => {
  const route = 'https://local.invalid/study-capture-courses/42/preview-detail/a';
  const detail = {id: 42, name: 'A', capture_code: 'a', start_time: '2026-09-14 00:00'};
  const envelopes = [value => value, value => ({data: value}), value => ({data: {data: value}}), value => ({result: {details: value}})];
  for (const entity of ['course', 'subject']) for (const wrap of envelopes) {
    assert.deepEqual(course.fromJSON({[entity]: wrap(detail)}, route), {name: 'A'});
    assert.deepEqual(course.fromJSON(wrap({[entity]: detail}), route), {name: 'A'});
    assert.deepEqual(course.fromJSON({[entity]: wrap({...detail, capture_code: 'b'})}, route), {name: 'A'}, 'a related-record pointer is not the course identity');
    assert.deepEqual(course.fromJSON({[entity]: wrap({...detail, lesson_start_time: '2026-09-15 16:40'})}, route), {name: 'A', date: '2026-09-15', start: '16:40:00'});
  }
});
test('recording entities and explicit lesson fields retain matched nested metadata on my and study routes', () => {
  const wanted = {name: 'A', date: '2026-09-15', start: '16:40:00'};
  for (const route of [page, page.replace('/my-', '/study-'), page.replace('/my-', '/#/study-')]) {
    assert.deepEqual(course.fromJSON({course: {id: 16220, name: 'A', start_time: '2026-09-14 00:00'}, captures: [
      {id: 1, data: {start_time: '2026-09-13 12:00'}},
      {id: 477014, data: {details: {start_time: '2026-09-15T08:40:00Z'}}}
    ]}, route), wanted);
    assert.deepEqual(course.fromJSON({courseId: 99, captureId: 477014, lesson_start_time: '2026-09-15 16:40'}, route), {});
    assert.deepEqual(course.fromJSON({courseId: 16220, captureId: 999, record_start_time: '2026-09-15 16:40'}, route), {});
    assert.deepEqual(course.fromJSON({capture: {data: {id: 999, start_time: '2026-09-15 16:40'}}}, route), {});
    assert.deepEqual(course.fromJSON({capture: {code: 999, start_time: '2026-09-15 16:40'}}, route), {});
    assert.deepEqual(course.fromJSON({course: {data: {id: 99, name: 'B', lesson_start_time: '2026-09-15 16:40'}}}, route), {});
    assert.deepEqual(course.fromJSON({course: {data: {id: 16220, name: 'A'}}, capture: {data: {id: 477014, start_time: '2026-09-15T08:40:00Z'}}}, route), wanted);
  }
  for (const key of ['capture_start_time', 'lesson_start_time', 'record_start_time', 'class_start_time']) {
    assert.deepEqual(course.fromJSON({courseName: 'A', [key]: '2026-09-15 16:40'}, page), wanted);
  }
  assert.deepEqual(course.fromJSON({courseName: 'A', lessons: [{start_time: '2026-09-15 16:40'}, {start_time: '2026-09-16 16:40'}]}, page), {name: 'A'});
  assert.deepEqual(course.fromJSON({course: {id: 16220, name: 'A'}, capture: {id: 477014, data: {course: {name: 'A', start_time: '2026-09-14 00:00'}, start_time: '2026-09-15 16:40'}}}, page), wanted);
});
test('binding uses detected values unless the same source has explicit manual edits', () => {
  const detected = {name: 'A', date: '2026-09-15', start: '16:40:00'}, displayed = {name: '旧名称', date: '2026-09-14', start: '00:00:00'};
  assert.deepEqual(course.forBinding(detected, displayed), detected);
  assert.deepEqual(course.forBinding(detected, displayed, {manual: true}), detected);
  assert.deepEqual(course.forBinding(detected, displayed, {sameSource: true}), detected);
  assert.deepEqual(course.forBinding(detected, displayed, {manual: true, sameSource: true}), displayed);
  assert.deepEqual(course.forBinding({name: 'A'}, displayed), {name: 'A'});
  assert.deepEqual(course.forBinding(detected, {name: '我的手动名称'}, {manual: true, sameSource: true}), {name: '我的手动名称'});
});
test('background stores only normalized top-frame metadata and isolates navigation', async () => {
  let listener; const storage = {}, tab = {url: page};
  const chrome = {
    runtime: {onMessage: {addListener: fn => { listener = fn; }}},
    tabs: {get: async () => tab, onRemoved: {addListener() {}}, onUpdated: {addListener() {}}},
    action: {
      onClicked: {addListener() {}},
      setBadgeText: (_details, callback) => queueMicrotask(callback),
      setBadgeBackgroundColor: (_details, callback) => queueMicrotask(callback)
    },
    webRequest: {onBeforeRequest: {addListener() {}}},
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
