const test = require('node:test');
const assert = require('node:assert/strict');
const library = require('../library.js');
const batch = require('../batch.js');

test('crop reuse validates bounds, zero-track identity and actual aspect within one percent', () => {
  const source = {sourceName: '0-camera.mp4', url: 'https://cdn.invalid/0-camera.mp4?id=1&token=old'};
  const override = {crop: {x: .1, y: .2, w: .7, h: .6}, aspect: 16 / 9, track: batch.trackKey(source)};
  assert.equal(batch.cropMatches(override, {...source, url: source.url.replace('old', 'new')}, override.aspect * 1.01), true);
  assert.equal(batch.cropMatches(override, source, override.aspect * 1.01001), false);
  assert.equal(batch.cropMatches(override, {...source, url: source.url.replace('id=1', 'id=2')}, override.aspect), false);
  assert.equal(batch.cropMatches(override, {...source, sourceName: '2-camera.mp4'}, override.aspect), false);
  for (const crop of [{x: -.1, y: 0, w: 1, h: 1}, {x: .5, y: 0, w: .6, h: 1}, {x: 0, y: 0, w: 0, h: 1}, {x: 0, y: 0, w: NaN, h: 1}]) {
    assert.equal(batch.cropMatches({...override, crop}, source, override.aspect), false);
  }
  assert.equal(batch.cropMatches({...override, aspect: Infinity}, source, override.aspect), false);
  assert.equal(batch.automatic({requiresCrop: true, cropConfirmed: true}), false, 'legacy confirmation alone cannot enable automatic zero-track scanning');
  assert.equal(batch.automatic({requiresCrop: true, cropConfirmed: true, cropOverride: override}), true);
  assert.equal(batch.automatic({requiresCrop: true, cropConfirmed: true, cropOverride: override, cropRejected: true}), false);
});

test('source identity separates courses, local files and independent batch recordings', () => {
  const a = {page: 'https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/1', sourceKey: 'file:["a.mp4",10,1]', sourceName: 'a.mp4'};
  assert.equal(library.key(a), library.key({...a}));
  assert.notEqual(library.key(a), library.key({...a, sourceKey: 'file:["a.mp4",11,1]'}));
  assert.notEqual(library.key(a), library.key({...a, page: a.page.replace('/42/', '/43/')}));
  assert.equal(library.key({...a, batchJobId: 'rec1'}), library.key({...a, batchJobId: 'rec1', sourceKey: 'url:renewed-token'}));
  assert.notEqual(library.key({...a, batchJobId: 'rec1'}), library.key({...a, batchJobId: 'rec2'}));
});

test('signed media links retain lesson identity while resource parameters and opaque downloads stay distinct', () => {
  const sourceKey = value => 'url:https://cdn.invalid/2-record.mp4?id=1&' + new URLSearchParams({token: value, expires: value === 'a' ? '100' : '200'});
  const source = {page: 'https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/1', sourceKey: sourceKey('a')};
  assert.equal(library.key(source), library.key({...source, sourceKey: sourceKey('b')}));
  assert.notEqual(library.key(source), library.key({...source, sourceKey: source.sourceKey.replace('id=1', 'id=2')}));
  assert.notEqual(library.key({sourceKey: 'url:https://cdn.invalid/download?token=one'}), library.key({sourceKey: 'url:https://cdn.invalid/download?token=two'}));
});

test('course identity groups course pages and fallback names without conflating site origins', () => {
  assert.equal(library.courseKey('https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/a'), library.courseKey('https://rms-v5.xjtu.edu.cn/study-capture-courses/42/preview-detail/b'));
  assert.notEqual(library.courseKey('https://a.invalid/?courseId=42'), library.courseKey('https://b.invalid/?courseId=42'));
  assert.equal(library.courseKey('', {name: '  模式识别  '}), library.courseKey('', {name: '模式识别'}));
});

test('interrupted task states and crop settings are restored without mutating stored input', () => {
  const input = {id: 'lesson', task: {id: 'scan', state: 'running', checkpoint: 12}, crop: {x: .1,y: .2,w: .5,h: .6}, suspects: [{start: 3,end: 4,time: 3.5}]};
  const restored = library.recover(input);
  assert.equal(restored.task.state, 'paused'); assert.equal(input.task.state, 'running');
  assert.deepEqual(restored.crop, input.crop); assert.equal(restored.task.checkpoint, 12);
  assert.equal(library.recover({...input,task: {...input.task,state: 'done'}}).task.state, 'done');
});

test('lesson writes remain compatible and optional batch snapshots share one settings transaction', async () => {
  for (const withBatch of [false, true]) {
    const writes = [], transactions = []; let tx;
    const db = {transaction(stores, mode) {
      transactions.push({stores, mode});
      return tx = {objectStore(name) { assert.equal(name, 'settings'); return {get() { return {set onsuccess(fn) { fn(); }}; }, put(value, key) { writes.push({value, key}); }}; }};
    }};
    const lesson = {id: 'one', crop: {x: .1}}, batch = {page: 'local-course', jobs: [{id: 'job', cropConfirmed: true}]};
    const pending = withBatch ? library.put(db, lesson, batch) : library.put(db, lesson);
    let complete = false; pending.then(() => { complete = true; });
    lesson.crop.x = .9; batch.jobs[0].cropConfirmed = false;
    await Promise.resolve(); assert.equal(complete, false);
    assert.deepEqual(transactions, [{stores: ['settings'], mode: 'readwrite'}]);
    assert.deepEqual(writes, [{key: 'lesson:one', value: {id: 'one', crop: {x: .1}}},
      ...(withBatch ? [{key: 'batch:local-course', value: {page: 'local-course', jobs: [{id: 'job', cropConfirmed: true}]}}] : [])]);
    tx.oncomplete(); await pending; assert.equal(complete, true);
  }
});

test('a related batch write exception aborts the lesson transaction and rejects', async () => {
  let aborted = false, transactions = 0;
  const failure = Error('batch write failed');
  const db = {transaction() {
    transactions++;
    return {abort() { aborted = true; }, objectStore() { return {get() { return {set onsuccess(fn) { fn(); }}; }, put(_value, key) { if (key.startsWith('batch:')) throw failure; }}; }};
  }};
  await assert.rejects(library.put(db, {id: 'one'}, {page: 'local-course', jobs: []}), error => error === failure);
  assert.equal(aborted, true); assert.equal(transactions, 1);
});

test('discovery metadata survives explicit batch, legacy batch and related lesson writes', async () => {
  const saved = new Map(); let tx;
  const db = {transaction() {
    tx = {objectStore() { return {
      get(key) { return {result: saved.get(key), set onsuccess(fn) { fn(); }}; },
      put(value, key) { saved.set(key, structuredClone(value)); }
    }; }};
    return tx;
  }};
  const commit = async promise => { tx.oncomplete(); await promise; };
  const discovery = {complete: false, total: 26, progress: {resolved: 26}, failures: [{code: 'TIMEOUT'}]};
  await commit(library.batch(db, 'course', [{id: 'one'}], discovery));
  discovery.total = 0;
  await commit(library.batch(db, 'course', [{id: 'one', selected: false}]));
  await commit(library.put(db, {id: 'lesson'}, {page: 'course', jobs: [{id: 'one', state: 'done'}]}));
  assert.equal(saved.get('batch:course').discovery.total, 26);
  assert.equal(saved.get('batch:course').discovery.complete, false);
  assert.equal(saved.get('batch:course').jobs[0].state, 'done');
  await commit(library.batch(db, 'old', []));
  assert.equal(Object.hasOwn(saved.get('batch:old'), 'discovery'), false, 'legacy snapshot stays unknown');
});

test('suspect ranges merge overlapping intervals, ignore invalid bounds and keep chronological order', () => {
  assert.deepEqual(library.mergeRanges([{start: 5,end: 7,time: 6},{start: 1,end: 2,time: 1}], {start: 1.5,end: 3,time: 2}), [{start: 1,end: 3,time: 1},{start: 5,end: 7,time: 6}]);
  assert.deepEqual(library.mergeRanges([], {start: NaN,end: 5,time: 4}), []);
});
