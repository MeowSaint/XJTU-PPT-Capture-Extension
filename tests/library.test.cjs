const test = require('node:test');
const assert = require('node:assert/strict');
const library = require('../library.js');
const batch = require('../batch.js');

function integrityLesson(id, extra = {}) {
  const source = {batchJobId: id, page: 'https://school.invalid/?courseId=42', sourceKey: 'url:https://cdn.invalid/2-' + id + '.mp4?access_token=secret'};
  return {id, source, task: {state: 'done', duration: 10, checkpoint: 9.95, coverage: {
    version: 1, sourceKey: library.key(source), trackKey: batch.trackKey(source), duration: 10, ranges: [{start: 0, end: 9.95}], reachedEnd: true,
  }}, ...extra};
}

test('integrity separates 26 directory entries, scan evidence, empty pages and knowledge review', () => {
  const lessons = Array.from({length: 26}, (_, n) => integrityLesson(n === 25 ? 'unfinished' : n === 24 ? 'legacy' : 'job-' + n));
  lessons[25].task.coverage.ranges = [{start: 0, end: 4}]; lessons[25].task.coverage.reachedEnd = false;
  delete lessons[24].task.coverage;
  lessons[0].suspects = [{start: 9, end: 9.95, time: 9}];
  const jobs = lessons.map(item => ({id: item.id, selected: item.id !== 'job-1', discovery: {state: 'ready'}}));
  const report = library.integrity({batch: {jobs, discovery: {complete: true, total: 26, eligible: 26}}, lessons,
    pages: lessons.filter(item => item.id !== 'job-2').map((item, n) => ({id: n + 1, lessonId: item.id, order: 1024, sourceTime: 1}))});
  assert.equal(report.version, 1); assert.equal(report.directory.total, 26); assert.equal(report.directory.state, 'complete');
  assert.equal(report.lessons.find(x => x.jobId === 'unfinished').scan.reachedEnd, false);
  assert.equal(report.lessons.find(x => x.jobId === 'legacy').scan.verified, false);
  assert.equal(report.lessons.find(x => x.jobId === 'job-2').savedPages, 0);
  assert.equal(report.lessons.find(x => x.jobId === 'job-1').excluded, true);
  assert.equal(report.lessons[0].scan.reachedEnd, true); assert.equal(report.summary.suspectRanges, 1);
  assert(report.lessons.every(item => item.knowledge.state === 'unreviewed')); assert.equal(report.complete, false);
});

test('integrity never invents prefix coverage, merges tracks, or promotes legacy discovery', () => {
  const item = integrityLesson('one'); item.task.coverage.ranges = [{start: 4, end: 9.95}];
  let report = library.integrity({lessons: [item], pages: []});
  assert.equal(report.lessons[0].scan.reachedEnd, false); assert.equal(report.directory.state, 'unknown');
  item.task.coverage.ranges = [{start: 0, end: 9.95}]; item.task.coverage.trackKey = 'different-track';
  report = library.integrity({batch: {jobs: [{id: 'one', state: 'done'}]}, lessons: [item], pages: []});
  assert.equal(report.lessons[0].scan.verified, false); assert.equal(report.lessons[0].discovery.state, 'unknown');
  report = library.integrity({batch: {jobs: [], discovery: {complete: false, total: 26, failures: [{code: 'TIMEOUT'}]}}, lessons: [], pages: []});
  assert.equal(report.directory.state, 'incomplete'); assert.equal(report.summary.directoryFailures, 1); assert.equal(report.complete, false);
});

test('integrity rejects historical coverage for a changed known source duration without mutating history or receipts', () => {
  const item = integrityLesson('duration'), directory = {jobs: [{id: item.id, discovery: {state: 'ready'}}], discovery: {complete: true, total: 1, eligible: 1}};
  item.source.duration = 10;
  const pages = [{id: 17, lessonId: item.id, order: 1, sourceTime: 9}], history = structuredClone(item.task);
  const prior = library.integrity({batch: directory, lessons: [item], pages, exportedAt: '2026-11-08T00:00:00.000Z', format: 'pdf'});
  assert.equal(prior.complete, true); assert.equal(prior.lessons[0].scan.verified, true);
  for (const duration of [20, 5, 0]) {
    item.source.duration = duration;
    const current = library.integrity({batch: directory, lessons: [item], pages, format: 'zip'});
    assert.equal(current.lessons[0].scan.verified, false, `current duration ${duration} differs from historical duration`);
    assert.equal(current.lessons[0].scan.reachedEnd, false); assert.equal(current.complete, false);
    assert.deepEqual(current.pageIds, [17]); assert.equal(current.lessons[0].scan.checkpoint, 9.95);
    assert.deepEqual(item.task, history); assert.equal(prior.complete, true, 'a frozen historical receipt is unchanged');
  }
  delete item.source.duration;
  assert.equal(library.integrity({batch: directory, lessons: [item], pages}).complete, true, 'missing legacy duration does not replace valid task evidence');
});

test('integrity freezes export page order and projects every identity without signed URLs or credentials', () => {
  const item = integrityLesson('safe');
  const secret = 'https://cdn.invalid/private?access_token=hidden&signature=signed';
  item.task.coverage.sourceKey = library.key(item.source);
  item.task.coverage.trackKey = batch.trackKey(item.source);
  item.lessonKey = secret; item.knowledge = {state: 'unreviewed', notes: secret};
  const pages = [{id: 2, lessonId: 'safe', order: 20, sourceTime: 8, sourceKey: secret}, {id: 1, lessonId: 'safe', order: 10, sourceTime: 2, token: secret}];
  const report = library.integrity({batch: {jobs: [{id: 'safe', discovery: {state: 'error', message: secret, code: 'TIMEOUT'}}], discovery: {complete: false, failures: [{code: 'NETWORK', message: secret}]}}, lessons: [item], pages, exportedAt: '2026-11-08T00:00:00.000Z', format: 'pdf'});
  assert.deepEqual(report.pageIds, [1, 2]); assert.deepEqual(report.export.lessons[0].pages, [{id: 1, sourceTime: 2, exportIndex: 1}, {id: 2, sourceTime: 8, exportIndex: 2}]);
  pages[1].sourceTime = 99; item.task.coverage.ranges[0].end = 1;
  assert.equal(report.export.lessons[0].pages[0].sourceTime, 2); assert.equal(report.lessons[0].scan.coverage.ranges[0].end, 9.95);
  const encoded = JSON.stringify(report);
  for (const forbidden of ['https:', 'access_token', 'hidden', 'signature=', 'secret', 'signed']) assert.equal(encoded.includes(forbidden), false, forbidden);
  const malicious = integrityLesson(secret); malicious.id = secret;
  const projected = JSON.stringify(library.integrity({batch: {jobs: [{id: secret, discovery: {state: 'ready'}}]}, lessons: [malicious], pages: [{id: secret, lessonId: secret, sourceTime: 1}]}));
  assert.equal(projected.includes('https:'), false); assert.equal(projected.includes('access_token='), false);
});

test('page limits preserve every valid integer and reject invalid saved values', () => {
  for (let value = 100; value <= 20000; value++) assert.equal(library.pageLimit(value), value);
  for (const value of [undefined, null, '', '1388', {}, [], true, NaN, Infinity, -1, 0, 99, 100.5, 1388.1, 20001]) {
    assert.equal(library.pageLimit(value), 5000, `invalid value: ${String(value)}`);
  }
});

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

function reviewEvidence(lesson, pages) {
  return {sourceKey: lesson.source ? library.key(lesson.source) : lesson.key || null,
    trackKey: lesson.source && (lesson.source.sourceKey || lesson.source.url || lesson.source.sourceName)
      ? library.key({sourceKey: lesson.source.sourceKey || (lesson.source.url ? 'url:' + lesson.source.url : ''), sourceName: lesson.source.sourceName}) : null,
    sourceDuration: Number.isFinite(lesson.source?.duration) && lesson.source.duration > 0 ? lesson.source.duration : null, pageIds: pages.map(p => p.id)};
}
test('learning helpers preserve originals and require four current whole-lesson review fields', () => {
  const lesson = integrityLesson('review'); lesson.source.duration = 3;
  const pages = [1, 2, 3].map(id => ({id, lessonId: lesson.id, order: id, learningExcluded: id === 2}));
  lesson.knowledgeReview = 'no-content'; lesson.knowledgeReviewEvidence = reviewEvidence(lesson, pages);
  const state = () => library.knowledgeState(lesson, pages);
  assert.equal(state(), 'no-content'); assert.deepEqual(library.learningPages(pages), pages);
  assert.equal(library.learningPages(pages)[0], pages[0]);
  assert.deepEqual(library.learningPages(pages, {view: 'learning', knowledgeReview: state()}), []);
  assert.deepEqual(library.learningPages(pages.slice(0, 2), {view: 'learning', knowledgeReview: state()}), []);
  assert.equal(library.knowledgeState(lesson, [...pages].reverse()), 'no-content');
  for (const field of ['sourceKey', 'trackKey', 'sourceDuration', 'pageIds']) {
    const evidence = lesson.knowledgeReviewEvidence; lesson.knowledgeReviewEvidence = {...evidence}; delete lesson.knowledgeReviewEvidence[field];
    assert.equal(state(), 'unreviewed', field); lesson.knowledgeReviewEvidence = evidence;
  }
  lesson.source.duration = 6; assert.equal(state(), 'unreviewed', 'same URL with longer current source, stale coverage stays unchanged');
  lesson.knowledgeReviewEvidence = reviewEvidence(lesson, pages); assert.equal(state(), 'no-content');
  lesson.source.sourceKey = lesson.source.sourceKey.replace('2-review', '0-review'); assert.equal(state(), 'unreviewed', 'same batch job with new track');
  lesson.knowledgeReviewEvidence = reviewEvidence(lesson, pages); assert.equal(state(), 'no-content');
  lesson.source.sourceKey = lesson.source.sourceKey.replace('secret', 'renewed'); assert.equal(state(), 'no-content', 'known signed renewal');
  assert.equal(library.knowledgeState(lesson, [...pages, {id: 4}]), 'unreviewed');
  lesson.knowledgeReview = 'has-content'; assert.deepEqual(library.learningPages(pages, {view: 'learning', knowledgeReview: state()}), [pages[0], pages[2]]);
  for (const duration of [undefined, 0, -1, NaN, Infinity]) {
    lesson.source.duration = duration; lesson.knowledgeReviewEvidence = reviewEvidence(lesson, pages); assert.equal(state(), 'has-content');
    assert.equal(lesson.knowledgeReviewEvidence.sourceDuration, null);
  }
});
test('learning integrity separates requested ranges, full review evidence, physical completion and safe mappings', () => {
  const item = integrityLesson('learning'); item.source.duration = 10; item.task.comparisonVersion = 'mixed';
  const pages = [3, 1, 2].map((id, order) => ({id, order, lessonId: item.id, sourceTime: id, learningExcluded: id === 1}));
  item.knowledgeReview = 'no-content'; item.knowledgeReviewEvidence = reviewEvidence(item, pages);
  const batch = {jobs: [{id: item.id, discovery: {state: 'ready'}}], discovery: {complete: true, total: 1}};
  let report = library.integrity({batch, lessons: [item], pages: pages.slice(1), reviewPages: pages, view: 'learning'});
  assert.equal(report.rawCount, 2); assert.equal(report.exportedCount, 0); assert.equal(report.excludedCount, 2); assert.equal(report.lessons[0].savedPages, 3);
  assert.equal(report.lessons[0].knowledgeReview, 'no-content'); assert.equal(report.lessons[0].comparisonVersion, 'mixed');
  assert.equal(report.complete, true); assert.equal(report.knowledgeComplete, true);
  item.knowledgeReview = 'has-content';
  report = library.integrity({batch, lessons: [item], pages, view: 'learning'});
  assert.deepEqual(report.pageIds, [3, 2]); assert.deepEqual(report.export.lessons[0].pages, [{id: 3, sourceTime: 3, exportIndex: 1}, {id: 2, sourceTime: 2, exportIndex: 2}]);
  assert.equal(report.lessons[0].rawCount, 3); assert.equal(report.lessons[0].excludedCount, 1); assert.equal(report.lessons[0].exportedCount, 2);
  report = library.integrity({batch, lessons: [item], pages}); assert.equal(report.view, 'raw'); assert.equal(report.excludedCount, 0);
  delete item.knowledgeReviewEvidence; report = library.integrity({batch, lessons: [item], pages}); assert.equal(report.complete, true); assert.equal(report.knowledgeComplete, false);
  item.knowledgeReviewEvidence = reviewEvidence(item, pages); item.task.coverage.reachedEnd = false;
  report = library.integrity({batch, lessons: [item], pages}); assert.equal(report.complete, false); assert.equal(report.knowledgeComplete, true);
  const empty = integrityLesson('empty');
  report = library.integrity({batch: {jobs: [{id: 'missing'}]}, lessons: [item, empty], pages});
  assert.equal(report.knowledgeComplete, false); assert.equal(report.lessons[1].knowledgeReview, 'unreviewed'); assert.equal(report.lessons[2].knowledgeReview, 'unreviewed');
  assert.equal(library.integrity({}).knowledgeComplete, false);
  const publicJSON = JSON.stringify(library.integrity({lessons: [item], pages}));
  for (const value of ['knowledgeReviewEvidence', 'secret', 'https:', 'sourceDuration', 'pageIds\":\"']) assert.equal(publicJSON.includes(value), false);
});

// Writes are staged until commit, as in IDB; holding a resolved promise would not model precommit Stop.
function heldBindingDB(initial, failKey = '') {
  const saved = new Map(Object.entries(structuredClone(initial))), transactions = [];
  const db = {transaction(stores, mode) {
    assert.deepEqual([...stores], ['settings']); assert.equal(mode, 'readwrite');
    const writes = new Map(); let state = 'pending';
    const tx = {error: null, objectStore(name) {
      assert.equal(name, 'settings'); return {put(value, key) { if (key === failKey) throw Error('write failed'); writes.set(key, structuredClone(value)); }};
    }, abort() {
      if (state !== 'pending') throw new DOMException('Transaction finished', 'InvalidStateError');
      state = 'aborted'; queueMicrotask(() => tx.onabort?.());
    }, fail(error) { tx.error = error; tx.abort(); }, commit(notify = true) {
      if (state !== 'pending') return false;
      state = 'committed'; for (const [key, value] of writes) saved.set(key, value);
      if (notify) tx.complete(); return true;
    }, complete() { assert.equal(state, 'committed'); tx.oncomplete?.(); }};
    transactions.push(tx); return tx;
  }};
  return {db, saved, transactions};
}
function bindingController() {
  const controller = new AbortController(), signal = controller.signal, listeners = new Set();
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, fn, options) => { if (type === 'abort') listeners.add(fn); add(type, fn, options); };
  signal.removeEventListener = (type, fn, options) => { if (type === 'abort') listeners.delete(fn); remove(type, fn, options); };
  return {controller, signal, listeners};
}
const oldBindingLesson = () => ({id: 'old', course: {name: 'Prior', date: '2026-09-15', start: '08:00:00'},
  source: {sourceKey: 'file:old', sourceName: 'old.mp4', duration: 1}, crop: {x: .1, y: .1, w: .8, h: .8},
  task: {state: 'paused', checkpoint: .5}, suspects: [{start: .2, end: .3}], namingManual: true});

for (const existing of [false, true]) for (const outcome of ['pre-aborted', 'stop-before-commit', 'transaction-failure']) {
  test(`atomic binding API ${outcome} retains prior settings for ${existing ? 'same' : 'new'} source`, async () => {
    const prior = oldBindingLesson(), before = {'lesson:old': prior, activeLesson: 'old'}, h = heldBindingDB(before);
    const {controller, signal, listeners} = bindingController();
    if (outcome === 'pre-aborted') controller.abort();
    const next = {...prior, id: existing ? 'old' : 'new', source: {...prior.source, duration: 2}};
    const pending = library.bind(h.db, next, {signal}), rejected = assert.rejects(pending,
      error => outcome === 'transaction-failure' ? error.message === 'held failure' : error.name === 'AbortError');
    if (outcome !== 'pre-aborted') {
      assert.equal(h.transactions.length, 1); assert.deepEqual(Object.fromEntries(h.saved), before);
      if (outcome === 'transaction-failure') h.transactions[0].fail(Error('held failure'));
      else controller.abort();
      assert.equal(h.transactions[0].commit(), false, 'aborted writes cannot commit');
    } else assert.equal(h.transactions.length, 0, 'pre-aborted binding must not open a transaction');
    await rejected; assert.deepEqual(Object.fromEntries(h.saved), before); assert.equal(listeners.size, 0);
  });
}
for (const lateAbort of ['none', 'after-commit-before-complete', 'after-complete']) {
  test(`atomic binding API publishes one snapshot and commit wins ${lateAbort}`, async () => {
    const h = heldBindingDB({'lesson:old': oldBindingLesson(), activeLesson: 'old'});
    const {controller, signal, listeners} = bindingController(), next = {id: 'new', source: {duration: 2}};
    const pending = library.bind(h.db, next, {signal}); next.source.duration = 99;
    assert.equal(h.transactions.length, 1); assert.equal(h.saved.has('lesson:new'), false);
    h.transactions[0].commit(lateAbort !== 'after-commit-before-complete');
    if (lateAbort !== 'none') controller.abort();
    if (lateAbort === 'after-commit-before-complete') h.transactions[0].complete();
    await pending; assert.equal(h.saved.get('activeLesson'), 'new'); assert.equal(h.saved.get('lesson:new').source.duration, 2);
    assert.equal(listeners.size, 0);
  });
}

function actualBindingHarness() {
  const vm = require('node:vm'), fs = require('node:fs'), prior = oldBindingLesson();
  const h = heldBindingDB({'lesson:old': prior, activeLesson: 'old'}), calls = [];
  const context = vm.createContext({db: h.db, dbReady: Promise.resolve(), lessonSave: Promise.resolve(),
    PPTLibrary: library, PPTCourse: require('../course.js'), sourceCourse: {}, activeBatchJob: null,
    crypto: {randomUUID: () => 'new'}, namingManual: true, namingPage: '', Date,
    lessons: [structuredClone(prior)], activeLesson: null, pages: [{id: 1, lessonId: 'old', bytes: [1, 2, 3]}],
    allPages: [{id: 1, lessonId: 'old', bytes: [1, 2, 3]}], undoState: {ids: [2]},
    namingInfo: () => prior.course, scanSettings: () => ({step: .5}),
    sameMediaSource: (a, b) => batch.trackKey(a) === batch.trackKey(b),
    syncAllPages: () => calls.push('sync'), forgetUndo: () => { context.undoState = null; calls.push('undo'); },
    applyLesson: () => { context.pages = context.allPages.filter(page => page.lessonId === context.activeLesson.id); calls.push('apply'); },
    render: () => calls.push('render'), renderLibrary: () => calls.push('library'), draw: () => calls.push('draw')});
  context.activeLesson = context.lessons[0];
  const source = fs.readFileSync(require.resolve('../capture.js'), 'utf8');
  const start = source.indexOf('async function bindLesson('), end = source.indexOf('async function switchLesson(', start);
  assert(start >= 0 && end > start); vm.runInContext(source.slice(start, end), context);
  const snapshot = () => structuredClone({saved: Object.fromEntries(h.saved), lessons: context.lessons,
    active: context.activeLesson, pages: context.pages, allPages: context.allPages, undo: context.undoState});
  return {...h, context, snapshot, calls};
}
for (const existing of [false, true]) for (const outcome of ['pre-aborted', 'stop-before-commit', 'transaction-failure']) {
  test(`actual bindLesson ${outcome} leaves DB and memory intact for ${existing ? 'same' : 'new'} source`, async () => {
    const h = actualBindingHarness(), before = h.snapshot(), refs = {lesson: h.context.activeLesson, list: h.context.lessons, undo: h.context.undoState};
    const controller = new AbortController(); if (outcome === 'pre-aborted') controller.abort();
    const pending = h.context.bindLesson({sourceKey: existing ? 'file:old' : 'file:new', sourceName: 'changed.mp4', duration: 2}, {}, controller.signal);
    const rejected = assert.rejects(pending, error => outcome === 'transaction-failure' ? error.message === 'held failure' : error.name === 'AbortError');
    await new Promise(setImmediate);
    if (outcome !== 'pre-aborted') {
      assert.deepEqual(h.snapshot(), before, 'staged writes must not publish retained objects');
      assert.equal(h.transactions.length, 1);
      if (outcome === 'transaction-failure') h.transactions[0].fail(Error('held failure'));
      else { controller.abort(); h.transactions[0].commit(); }
    }
    await rejected; assert.deepEqual(h.snapshot(), before); assert.deepEqual(h.calls, []);
    assert.equal(h.context.activeLesson, refs.lesson); assert.equal(h.context.lessons, refs.list); assert.equal(h.context.undoState, refs.undo);
  });
}
for (const existing of [false, true]) test(`actual bindLesson commit-before-Stop stays coherent for ${existing ? 'same' : 'new'} source`, async () => {
  const h = actualBindingHarness(), controller = new AbortController();
  const pending = h.context.bindLesson({sourceKey: existing ? 'file:old' : 'file:new', sourceName: 'changed.mp4', duration: 2}, {}, controller.signal);
  await new Promise(setImmediate); assert.equal(h.transactions.length, 1);
  h.transactions[0].commit(); controller.abort(); await pending;
  assert.equal(h.saved.get('activeLesson'), existing ? 'old' : 'new');
  assert.deepEqual(structuredClone(h.context.activeLesson), h.saved.get('lesson:' + h.context.activeLesson.id));
  assert.equal(h.context.activeLesson.source.duration, 2); assert.equal(h.context.lessons.length, existing ? 1 : 2);
  assert.deepEqual(h.calls, ['sync', 'undo', 'apply', 'render', 'library', 'draw']);
});

test('binding second-write failure aborts the first staged write and removes signal listeners', async () => {
  const before = {'lesson:old': oldBindingLesson(), activeLesson: 'old'}, h = heldBindingDB(before, 'activeLesson');
  const {signal, listeners} = bindingController();
  await assert.rejects(library.bind(h.db, {id: 'new'}, {signal}), /write failed/);
  assert.equal(h.transactions[0].commit(), false); assert.deepEqual(Object.fromEntries(h.saved), before); assert.equal(listeners.size, 0);
  assert.equal(h.transactions[0].oncomplete, null); assert.equal(h.transactions[0].onabort, null); assert.equal(h.transactions[0].onerror, null);
});
test('legacy activation and binding without options remain compatible', async () => {
  const h = heldBindingDB({'lesson:old': oldBindingLesson(), activeLesson: 'old'});
  const activation = library.activate(h.db, 'old'); h.transactions[0].commit(); await activation;
  const binding = library.bind(h.db, {id: 'new'}); h.transactions[1].commit(); await binding;
  assert.equal(h.saved.get('activeLesson'), 'new'); assert.equal(h.saved.get('lesson:old').id, 'old');
  assert.deepEqual(h.saved.get('lesson:new'), {id: 'new'});
});
for (const stop of [true, false]) test(`changed-channel binding stages crop, task and batch confirmation until ${stop ? 'Stop' : 'commit'}`, async () => {
  const h = actualBindingHarness(), prior = h.context.activeLesson;
  prior.source.batchJobId = 'channel-job'; h.saved.set('lesson:old', structuredClone(prior));
  h.context.activeBatchJob = {id: 'channel-job', cropConfirmed: true, course: prior.course};
  const before = h.snapshot(), controller = new AbortController();
  const pending = h.context.bindLesson({...prior.source, sourceKey: 'file:different-channel'}, {}, controller.signal);
  const result = stop ? assert.rejects(pending, error => error.name === 'AbortError') : pending;
  await new Promise(setImmediate); assert.deepEqual(h.snapshot(), before); assert.equal(h.context.activeBatchJob.cropConfirmed, true);
  if (stop) controller.abort(); else h.transactions[0].commit(); await result;
  if (stop) { assert.deepEqual(h.snapshot(), before); assert.equal(h.context.activeBatchJob.cropConfirmed, true); }
  else {
    assert.deepEqual(structuredClone(h.context.activeLesson.crop), {x: 0, y: 0, w: 1, h: 1}); assert.equal(h.context.activeLesson.task, null);
    assert.equal(h.context.activeLesson.ignoreRect, null); assert.equal(h.context.activeLesson.suspects.length, 0);
    assert.equal(h.context.activeBatchJob.cropConfirmed, false);
    assert.deepEqual(structuredClone(h.context.activeLesson), h.saved.get('lesson:old'));
  }
});
