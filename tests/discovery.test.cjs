'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
global.PPTCourse = require('../course.js');
const batch = require('../batch.js');
const page = 'http://127.0.0.1/study-capture-courses/42/preview-detail';
const rows = n => Array.from({length: n}, (_, i) => ({id: String(i + 1), capture_code: 'c' + (i + 1), status: 'FINISHED', start_time: `2026-10-${String(i + 1).padStart(2, '0')}T08:00:00+08:00`, course: {name: 'Synthetic course'}}));
const capture = id => ({data: {lesson_videos: [{file_key: `2-${id}.mp4`, download_url: `http://127.0.0.1/2-${id}.mp4`}]}});
const response = (value, status = 200, type = 'application/json') => ({ok: status < 400, status, headers: {get: () => type}, json: async () => value});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
async function until(check) { for (let n = 0; n < 100; n++) { if (check()) return; await new Promise(setImmediate); } assert.fail('condition did not settle'); }

test('requestJSON bounds headers and successful JSON body, even when fetch ignores abort', async () => {
  for (const body of [false, true]) {
    let aborted = 0;
    const fetchImpl = async (_path, {signal}) => {
      signal.addEventListener('abort', () => aborted++);
      return body ? {...response(null), json: () => new Promise(() => {})} : new Promise(() => {});
    };
    await assert.rejects(batch.requestJSON('/fixture', {fetchImpl, timeoutMs: 8, retries: 0}), e => e.code === 'TIMEOUT' && e.attempts === 1 && e.status === 0);
    assert.equal(aborted, 1);
  }
});

test('requestJSON retries only transient failures and cancellation interrupts backoff', async () => {
  for (const status of [401, 403, 404]) {
    let calls = 0;
    await assert.rejects(batch.requestJSON('/fixture', {fetchImpl: async () => { calls++; return response({}, status); }, retryDelays: [0, 0]}), e => e.status === status && e.attempts === 1);
    assert.equal(calls, 1);
  }
  for (const bad of [response({}, 200, 'text/html'), {...response({}), json: async () => { throw new SyntaxError('bad JSON'); }}]) {
    let calls = 0;
    await assert.rejects(batch.requestJSON('/fixture', {fetchImpl: async () => { calls++; return bad; }}), e => e.code === 'NON_JSON' && e.attempts === 1);
    assert.equal(calls, 1);
  }
  for (const status of [408, 429, 503, 0]) {
    let calls = 0;
    const result = await batch.requestJSON('/fixture', {retryDelays: [0, 0], fetchImpl: async () => {
      if (++calls < 3) { if (!status) throw new TypeError('network'); return response({}, status); } return response({yes: true});
    }});
    assert.deepEqual(result, {yes: true}); assert.equal(calls, 3);
  }
  const controller = new AbortController(), first = deferred(); let calls = 0;
  const pending = batch.requestJSON('/fixture', {signal: controller.signal, retryDelays: [500, 1500], fetchImpl: async () => { calls++; first.resolve(); return response({}, 503); }});
  await first.promise; await new Promise(setImmediate); controller.abort();
  await assert.rejects(pending, e => e.code === 'CANCELLED' && e.attempts === 1); assert.equal(calls, 1);
});

test('external cancellation bounds headers and bodies and removes caller listeners', async () => {
  for (const body of [false, true]) {
    const controller = new AbortController(), listeners = new Set(), started = deferred(); let aborted = 0;
    const signal = {get aborted() { return controller.signal.aborted; },
      addEventListener(type, fn, options) { listeners.add(fn); controller.signal.addEventListener(type, fn, options); },
      removeEventListener(type, fn) { listeners.delete(fn); controller.signal.removeEventListener(type, fn); }};
    const pending = batch.requestJSON('/fixture', {signal, fetchImpl: async (_path, options) => {
      options.signal.addEventListener('abort', () => aborted++); started.resolve();
      return body ? {...response({}), json: () => new Promise(() => {})} : new Promise(() => {});
    }});
    await started.promise; await new Promise(setImmediate); controller.abort();
    await assert.rejects(pending, error => error.code === 'CANCELLED' && error.attempts === 1);
    assert.equal(aborted, 1); assert.equal(listeners.size, 0);
    let calls = 0;
    await assert.rejects(batch.requestJSON('/fixture', {signal, fetchImpl: () => { calls++; }}), error => error.code === 'CANCELLED');
    assert.equal(calls, 0);
  }
  let calls = 0;
  await batch.requestJSON('/fixture', {retryDelays: [0, 0], fetchImpl: async () => {
    if (++calls < 3) throw Object.assign(Error('socket closed'), {code: 'ECONNRESET'});
    return response({});
  }});
  assert.equal(calls, 3, 'coded network errors are transient too');
});

test('every progress snapshot preserves old selection, crops and sources through failed details', async () => {
  const previous = [{id: 'c1', scheduleId: '1', captureCode: 'c1', url: 'http://127.0.0.1/old.mp4', selected: true, state: 'stopped', cropOverride: {manual: true}, history: ['saved']},
    {id: 'historical', url: 'http://127.0.0.1/history.mp4', selected: false, state: 'done'}];
  const snapshots = [];
  const result = await batch.discover({page, previous, onProgress: snapshot => snapshots.push(snapshot), readJSON: async path => {
    if (path.includes('/schedules')) return rows(1);
    throw Object.assign(Error('HTTP 503'), {code: 'HTTP', status: 503, attempts: 3});
  }});
  for (const snapshot of snapshots) assert(snapshot.jobs.every(job => job.discovery));
  assert.equal(result.jobs.length, 2); const failed = result.jobs.find(job => job.id === 'c1');
  assert.equal(failed.selected, true); assert.equal(failed.url, previous[0].url); assert.equal(failed.state, 'stopped');
  assert.deepEqual(failed.cropOverride, previous[0].cropOverride); assert.deepEqual(failed.history, ['saved']);
  const malformed = await batch.discover({page, previous, readJSON: async () => ({data: {error: 'invalid directory'}})});
  assert.equal(malformed.complete, false); assert.equal(malformed.jobs.length, 2); assert.equal(malformed.failures[0].code, 'DIRECTORY_JSON');
});

test('26 schedules retain 21 successes, four 503s and one deadline; retry touches exactly five', async () => {
  let active = 0, maxActiveDetails = 0, retry = false; const retriedDetailIds = [], snapshots = [];
  const readJSON = async (path, {signal}) => {
    if (path.includes('/schedules')) return {data: {results: rows(26)}};
    const id = path.match(/captures\/(c\d+)/)[1]; if (retry) retriedDetailIds.push(id);
    active++; maxActiveDetails = Math.max(maxActiveDetails, active);
    try { return await batch.requestJSON(path, {signal, timeoutMs: 8, retries: 0, fetchImpl: async () => {
      if (!retry && id === 'c26') return new Promise(() => {});
      return response(capture(id), !retry && Number(id.slice(1)) >= 22 ? 503 : 200);
    }}); } finally { active--; }
  };
  const result = await batch.discover({page, readJSON, onProgress: async value => { snapshots.push(structuredClone(value)); }});
  assert.equal(result.jobs.length, 26);
  assert.equal(result.jobs.filter(j => j.discovery.state === 'error').length, 5);
  assert.equal(result.jobs.filter(j => j.discovery.state === 'ready').length, 21);
  assert.equal(result.failures.length, 5); assert.equal(result.total, 26); assert.equal(result.complete, true);
  assert.equal(maxActiveDetails <= 4, true);
  assert(snapshots.some(s => s.jobs.length === 26 && s.jobs.some(j => j.discovery.state === 'pending')));
  const previous = structuredClone(result.jobs); previous[0].state = 'done'; previous[0].selected = false; previous[0].cropOverride = {manual: true};
  retry = true;
  const retried = await batch.discover({page, readJSON, previous, retryOnly: true});
  assert.equal(retriedDetailIds.length, 5); assert.equal(retried.failures.length, 0); assert.equal(retried.jobs[0].state, 'done');
  assert.equal(retried.complete, false, 'retry-only cannot prove directory completeness from jobs');
  assert.deepEqual(retried.jobs[0].cropOverride, {manual: true}); assert.equal(retried.jobs[0].selected, false);
  const failedRefresh = await batch.discover({page, previous: retried.jobs, readJSON: async () => { throw Object.assign(Error('offline'), {code: 'NETWORK', attempts: 3}); }});
  assert.equal(failedRefresh.jobs.length, 26); assert.equal(failedRefresh.complete, false); assert.equal(failedRefresh.jobs[0].url, retried.jobs[0].url);
});

test('pagination unwraps, deduplicates, rejects untrusted next and retains a failed middle page', async () => {
  for (const next of ['http://evil.invalid/schedules', '/api/frontend/study-capture-courses/43/schedules', '/api/frontend/study-capture-courses/42/captures/a']) {
    let calls = 0;
    const result = await batch.discover({page, readJSON: async path => { calls++; return path.includes('/schedules') ? {data: {results: rows(1), next}} : capture('c1'); }});
    assert.equal(result.complete, false); assert.equal(result.jobs.length, 1); assert.equal(calls, 2); assert(result.failures.some(f => f.code === 'PAGINATION_URL'));
  }
  for (const mode of ['success', 'loop', 'failure', 'limit']) {
    let scheduleCalls = 0;
    const result = await batch.discover({page, readJSON: async path => {
      if (!path.includes('/schedules')) return capture('x');
      scheduleCalls++;
      if (mode === 'failure' && scheduleCalls === 2) throw Error('middle failed');
      if (mode === 'limit') return {results: rows(1), next: '?page=' + (scheduleCalls + 1)};
      if (scheduleCalls === 1) return {data: {data: {results: rows(2), next: '?page=2'}}};
      return {data: {results: {results: [...rows(2), rows(3)[2]], next: mode === 'loop' ? '?page=2' : null}}};
    }});
    assert.equal(result.complete, mode === 'success');
    assert.equal(result.jobs.length, mode === 'failure' ? 2 : mode === 'limit' ? 1 : 3);
    assert.equal(scheduleCalls, mode === 'limit' ? 100 : 2);
  }
});

test('unavailable and skipped entries stay visible; persistence errors propagate', async () => {
  const schedules = rows(3); schedules[1].status = 'TRANSCODING'; delete schedules[2].capture_code;
  const result = await batch.discover({page, readJSON: async path => path.includes('/schedules') ? schedules : {videos: []}});
  assert.deepEqual(result.jobs.map(j => j.discovery.state), ['unavailable', 'skipped', 'skipped']);
  assert(result.jobs.every(j => !batch.automatic(j)));
  await assert.rejects(batch.discover({page, readJSON: async () => rows(1), onProgress: async () => { throw Error('disk full'); }}), /disk full/);
});

function contentHarness(fetchImpl, {hasConsent = async () => true, initialPage = page, text = ''} = {}) {
  let listener; const events = {}, location = {href: initialPage}, ticks = [], messages = [];
  const context = vm.createContext({URL, AbortController, DOMException, structuredClone, setTimeout, clearTimeout, queueMicrotask,
    setInterval(fn) { ticks.push(fn); }, performance: {now: () => 0, getEntriesByType: () => []}, location,
    document: {baseURI: initialPage, title: '资源管理平台', body: {innerText: text}, querySelector: () => null, querySelectorAll: () => []}, fetch: fetchImpl,
    PPTCore: {mediaInfo: url => url ? {url} : null, extractUrls: payload => payload.urls || [], postLocalMessage() {}, isLocalMessage: () => false},
    PPTState: {hasConsent},
    chrome: {runtime: {id: 'synthetic', sendMessage: async message => { messages.push(message); }, onMessage: {addListener: fn => { listener = fn; }}}}});
  context.window = context; context.top = context; context.addEventListener = (name, fn) => { events[name] = fn; };
  vm.runInContext(fs.readFileSync(require.resolve('../course.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../batch.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../content.js'), 'utf8'), context);
  return {send: message => new Promise(resolve => listener(message, {}, resolve)), events, location, tick: () => ticks.forEach(fn => fn()), messages};
}

test('API recording time wins over DOM and generic course opening fallback is rejected', async () => {
  const h = contentHarness(async () => response({data: {courseId: 42, captureId: 'c1', courseName: 'A', start_time: '2026-09-15T08:40:00Z'}}),
    {initialPage: page + '/c1', text: '课程名称：DOM\n上课时间：2026-09-14 00:00'});
  try {
    const result = await h.send({type: 'PPT_DISCOVER'});
    assert.deepEqual(JSON.parse(JSON.stringify(result.course)), {name: 'A', date: '2026-09-15', start: '16:40:00'});
  } finally { h.events.pagehide(); }
  const directory = contentHarness(async () => response({data: {courseId: 42, courseName: 'A', start_time: '2026-09-14 00:00'}}),
    {text: '课程名称：A\n开课时间：2026-09-14 00:00'});
  try { assert.deepEqual(JSON.parse(JSON.stringify((await directory.send({type: 'PPT_DISCOVER'})).course)), {name: 'A'}); }
  finally { directory.events.pagehide(); }
});

test('course endpoint context rejects opening times with a capture pointer through response envelopes', async () => {
  for (const wrap of [value => value, value => ({data: value}), value => ({data: {data: value}})]) {
    const calls = [], url = 'https://video.invalid/a.mp4';
    const h = contentHarness(async path => {
      calls.push(path);
      return response(path.endsWith('/captures/a') ? {capture_code: 'a', urls: [url]} : wrap({id: 42, name: 'A', capture_code: 'a', start_time: '2026-09-14 00:00'}));
    });
    try {
      const result = await h.send({type: 'PPT_DISCOVER'});
      assert.deepEqual(calls, ['/api/v1/rms-service/study-capture-courses/42', '/api/v1/rms-service/study-capture-courses/42/captures/a']);
      assert.deepEqual([...result.urls], [url]);
      assert.deepEqual(JSON.parse(JSON.stringify(result.course)), {name: 'A'});
    } finally { h.events.pagehide(); }
  }
});

for (const alias of ['latest_capture', 'latestCapture']) for (const matched of [true, false]) {
  test(`directory probe ${matched ? 'uses matched' : 'rejects mismatched'} ${alias} time with a time-less capture response`, async () => {
    for (const wrap of [value => value, value => ({data: value}), value => ({data: {data: value}})]) for (const key of ['capture_code', 'captureCode', 'code']) {
      const calls = [], url = 'https://video.invalid/a.mp4';
      const detail = {courseId: 42, courseName: 'A', start_time: '2026-09-14 00:00',
        ...(matched ? {} : {latest_capture_code: 'a'}), [alias]: {[key]: matched ? 'a' : 'b', start_time: '2026-09-15 16:40'}};
      const h = contentHarness(async path => {
        calls.push(path);
        return response(path.endsWith('/captures/a') ? {capture_code: 'a', urls: [url]} : wrap(detail));
      });
      try {
        const result = await h.send({type: 'PPT_DISCOVER'});
        assert.deepEqual(calls, ['/api/v1/rms-service/study-capture-courses/42', '/api/v1/rms-service/study-capture-courses/42/captures/a']);
        assert.deepEqual([...result.urls], [url]);
        assert.deepEqual(JSON.parse(JSON.stringify(result.course)), matched ? {name: 'A', date: '2026-09-15', start: '16:40:00'} : {name: 'A'});
      } finally { h.events.pagehide(); }
    }
  });
}

for (const fixture of [
  {label: 'explicit latest pointer differs from last schedule', capture: {start_time: '2026-09-15 16:40'}, matching: true, expected: {name: 'A', date: '2026-09-15', start: '16:40:00'}},
  {label: 'matched schedule supplies missing capture time', capture: {}, matching: true, expected: {name: 'A', date: '2026-09-15', start: '16:40:00'}},
  {label: 'no matching schedule retains capture time', capture: {start_time: '2026-09-15 16:40'}, matching: false, expected: {name: 'A', date: '2026-09-15', start: '16:40:00'}},
  {label: 'no matching schedule leaves missing fields absent', capture: {}, matching: false, expected: {name: 'A'}},
  {label: 'no matching schedule cannot fill a missing date', capture: {start_time: '16:40'}, matching: false, expected: {name: 'A', start: '16:40:00'}}
]) test(`directory probe binds selected media to its recording metadata: ${fixture.label}`, async () => {
  const calls = [], url = 'https://video.invalid/a.mp4';
  const schedules = [
    ...(fixture.matching ? [{courseId: 42, capture_code: 'a', start_time: '2026-09-15 16:40', status: 'SUCCESS'}] : []),
    {courseId: 42, capture_code: 'b', start_time: '2026-09-16 09:00', status: 'SUCCESS'}
  ];
  const h = contentHarness(async path => {
    calls.push(path);
    return response(path.endsWith('/captures/a') ? {capture_code: 'a', ...fixture.capture, urls: [url]} : {courseId: 42, courseName: 'A', latest_capture_code: 'a', schedules});
  });
  try {
    const result = await h.send({type: 'PPT_DISCOVER'});
    assert.deepEqual(calls, ['/api/v1/rms-service/study-capture-courses/42', '/api/v1/rms-service/study-capture-courses/42/captures/a']);
    assert.deepEqual([...result.urls], [url], 'the discovered media must belong to the explicitly selected recording A');
    assert.deepEqual(JSON.parse(JSON.stringify(result.course)), fixture.expected, 'recording B cannot supply any missing date/time field');
  } finally { h.events.pagehide(); }
});

test('content discovery starts immediately, joins request IDs, cancels fetch and rejects stale requests', async () => {
  let cancelledFetches = 0, detailStarted = false;
  const h = contentHarness(async (path, {signal}) => {
    if (!path.includes('/api/frontend/')) return response({});
    if (path.includes('/schedules')) return response(rows(1));
    detailStarted = true;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelledFetches++; reject(new DOMException('aborted', 'AbortError')); }, {once: true}));
  });
  const firstStart = await h.send({type: 'PPT_BATCH_DISCOVER'}), secondStart = await h.send({type: 'PPT_BATCH_DISCOVER'});
  assert.equal(firstStart.ok, true); assert.equal(firstStart.pending, true); assert(firstStart.requestId);
  assert.equal(secondStart.requestId, firstStart.requestId);
  await until(() => detailStarted);
  await h.send({type: 'PPT_BATCH_CANCEL', requestId: firstStart.requestId});
  let status;
  for (let i = 0; i < 30; i++) { status = await h.send({type: 'PPT_BATCH_STATUS', requestId: firstStart.requestId}); if (!status.pending) break; await new Promise(setImmediate); }
  assert.equal(status.pending, false); assert.equal(status.result.jobs.length, 1); assert.equal(status.result.complete, false);
  assert.equal(cancelledFetches > 0, true);
  assert.equal((await h.send({type: 'PPT_BATCH_STATUS', requestId: 'unknown'})).ok, false);
  h.location.href = page.replace('/42/', '/43/'); h.events.pagehide();
  assert.equal((await h.send({type: 'PPT_BATCH_STATUS', requestId: firstStart.requestId})).ok, false);
});

test('last detail completion racing cancel retains data without declaring a cancelled directory complete', async () => {
  const controller = new AbortController();
  const result = await batch.discover({page, signal: controller.signal, readJSON: async path => {
    if (path.includes('/schedules')) return rows(1);
    controller.abort(); return capture('c1');
  }});
  assert.equal(result.jobs.length, 1); assert.equal(result.complete, false);
});

for (const initial of ['consent rejection', 'HTTP failure', 'incomplete response']) {
  test(`settled automatic probe permits explicit same-page retry after ${initial}`, async () => {
    let consent = initial !== 'consent rejection', recovered = false, calls = 0;
    const url = 'http://127.0.0.1/2-recovered.mp4';
    const h = contentHarness(async () => {
      calls++;
      return recovered ? response({urls: [url]}) : response({}, initial === 'HTTP failure' ? 403 : 200);
    }, {hasConsent: async () => consent});
    await new Promise(setImmediate); // Let the failed/empty startup probe settle before retrying.
    const initialCalls = initial === 'consent rejection' ? 0 : 1;
    assert.equal(calls, initialCalls);
    consent = true; recovered = true;
    const reply = await h.send({type: 'PPT_DISCOVER'});
    assert.equal(calls, initialCalls + 1, 'a settled probe must not cache the fallback forever');
    assert.deepEqual([...reply.urls], [url]);
  });
}

test('old probe completion cannot clear a newer active same-page single flight', async () => {
  const consentHold = deferred(), currentHold = deferred(); let consentCalls = 0, calls = 0;
  const h = contentHarness(async () => { calls++; return currentHold.promise; },
    {hasConsent: () => ++consentCalls === 1 ? consentHold.promise : Promise.resolve(true)});
  let first, joined;
  try {
    h.location.href = page.replace('/42/', '/43/');
    first = h.send({type: 'PPT_DISCOVER'});
    await until(() => calls === 1);
    consentHold.resolve(true); await new Promise(setImmediate); // Old aborted probe finishes while the new one is active.
    joined = h.send({type: 'PPT_DISCOVER'}); await new Promise(setImmediate);
    assert.equal(calls, 1, 'old completion must leave the current probe registered');
    currentHold.resolve(response({urls: ['http://127.0.0.1/2-current.mp4']}));
    const replies = await Promise.all([first, joined]);
    for (const reply of replies) assert.deepEqual([...reply.urls], ['http://127.0.0.1/2-current.mp4']);
  } finally {
    consentHold.resolve(true); currentHold.resolve(response({})); h.events.pagehide();
    await Promise.all([first, joined]);
  }
});

for (const navigation of ['popstate', 'hashchange']) {
  test(`${navigation} navigation automatically probes the new route on the report tick`, async () => {
    const hold = deferred(), calls = [], media = id => `http://127.0.0.1/2-${id}.mp4`;
    const h = contentHarness(async (path, {signal}) => {
      calls.push({path, signal});
      return path.endsWith('/43') ? hold.promise : response({urls: [media(path.endsWith('/42') ? '42' : '44')]});
    });
    try {
      await new Promise(setImmediate); assert.equal(calls.length, 1);
      h.location.href = navigation === 'hashchange' ? 'http://127.0.0.1/#/study-capture-courses/43/preview-detail' : page.replace('/42/', '/43/');
      h.events[navigation](); h.tick(); await new Promise(setImmediate);
      assert.equal(calls.length, 2, 'the navigation event must not consume automatic fallback detection');
      assert(calls[1].path.endsWith('/43'));
      h.tick(); await new Promise(setImmediate); assert.equal(calls.length, 2, 'report ticks must coalesce with the active route probe');
      h.location.href = h.location.href.replace('/43/', '/44/'); h.events[navigation](); h.tick();
      await new Promise(setImmediate);
      assert.equal(calls[1].signal.aborted, true); assert.equal(calls.length, 3); assert(calls[2].path.endsWith('/44'));
      hold.resolve(response({urls: [media('43')]})); await new Promise(setImmediate);
      const published = h.messages.filter(message => message.type === 'PPT_MEDIA').flatMap(message => [...message.urls]);
      assert(published.includes(media('44'))); assert(!published.includes(media('43')), 'old route completion cannot publish media');
    } finally { hold.resolve(response({})); h.events.pagehide(); }
  });
}

test('automatic API probing coalesces same-page requests and aborts on pagehide', async () => {
  const hold = deferred(); let calls = 0, cancelled = 0;
  const h = contentHarness(async (_path, {signal}) => { calls++; signal.addEventListener('abort', () => cancelled++); return hold.promise; });
  const a = h.send({type: 'PPT_DISCOVER'}), b = h.send({type: 'PPT_DISCOVER'});
  await until(() => calls > 0); assert.equal(calls, 1);
  h.events.pagehide(); hold.resolve(response({})); await Promise.all([a, b]); assert.equal(cancelled > 0, true);
});
