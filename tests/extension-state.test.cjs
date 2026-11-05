const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const state = require('../extension-state.js');

const REPOSITORY = 'https://github.com/MeowSaint/XJTU-PPT-Capture-Extension';
const ENDPOINT = 'https://api.github.com/repos/MeowSaint/XJTU-PPT-Capture-Extension/releases/latest';
const DAY = 86400000;

function localStorage(initial = {}) {
  const values = structuredClone(initial), calls = {get: [], set: []};
  const failures = {get: null, set: null};
  return {
    calls, failures,
    snapshot: () => structuredClone(values),
    async get(key) {
      assert.equal(typeof key, 'string');
      calls.get.push(key);
      if (failures.get === key || failures.get === true) throw Error('storage read failed');
      return Object.hasOwn(values, key) ? {[key]: structuredClone(values[key])} : {};
    },
    async set(updates) {
      calls.set.push(structuredClone(updates));
      if (failures.set) throw Error('storage write failed');
      Object.assign(values, structuredClone(updates));
    }
  };
}

function accepted(initial = {}) {
  return localStorage({[state.CONSENT_KEY]: {version: state.TERMS_VERSION, acceptedAt: 0}, ...initial});
}

function release(version = '2.10.0', overrides = {}) {
  const tag = `v${version}`;
  return {
    tag_name: tag, draft: false, prerelease: false, published_at: '2026-11-05T00:00:00Z',
    html_url: `${REPOSITORY}/releases/tag/${tag}`,
    assets: [{name: 'ppt-capture.zip', browser_download_url: `${REPOSITORY}/releases/download/${tag}/ppt-capture.zip`}],
    ...overrides
  };
}

function metadata(version = '2.10.0') {
  return {version, url: `${REPOSITORY}/releases/tag/v${version}`, downloadURL: `${REPOSITORY}/releases/download/v${version}/ppt-capture.zip`};
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
}

function browserModule(extra = {}) {
  const sandbox = {AbortController, URL, setTimeout, clearTimeout, ...extra};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension-state.js'), 'utf8'), sandbox);
  return sandbox.PPTState;
}

test('exports the exact CommonJS and browser API without a DOM', async () => {
  const names = ['TERMS_VERSION', 'CONSENT_KEY', 'UPDATE_KEY', 'hasConsent', 'acceptConsent', 'compareVersions', 'checkForUpdate', 'claimNotification'];
  assert.deepEqual(Object.keys(state).sort(), names.sort());
  assert.equal(globalThis.PPTState, state);
  assert.equal(state.TERMS_VERSION, 'course-materials-v1');
  assert.equal(state.CONSENT_KEY, 'ppt-study-consent');
  assert.equal(state.UPDATE_KEY, 'ppt-update-state');
  const storage = localStorage();
  let requests = 0;
  const api = browserModule({chrome: {storage: {local: storage}}, fetch: async () => { requests++; return json(release()); }});
  assert.deepEqual(Object.keys(api).sort(), names.sort());
  await api.acceptConsent(undefined, 1234);
  assert.equal(await api.hasConsent(), true);
  assert.equal((await api.checkForUpdate('2.9.9', {now: 2000})).status, 'available');
  assert.equal(await api.claimNotification('2.10.0'), true);
  assert.equal(requests, 1);
});

test('consent persists the version and time, survives reload, and preserves unrelated data', async () => {
  const storage = localStorage({screenshots: ['keep'], [state.CONSENT_KEY]: {version: 'old-terms', acceptedAt: 1}});
  assert.equal(await state.hasConsent(storage), false);
  assert.equal(await state.acceptConsent(storage, 42), undefined);
  assert.deepEqual(storage.snapshot(), {screenshots: ['keep'], [state.CONSENT_KEY]: {version: 'course-materials-v1', acceptedAt: 42}});
  assert.equal(await state.hasConsent(localStorage(storage.snapshot())), true);
  const copy = await storage.get(state.CONSENT_KEY);
  copy[state.CONSENT_KEY].version = 'mutated';
  assert.equal(await state.hasConsent(storage), true, 'storage reads must be independent copies');
});

test('missing, malformed, or unreadable consent stays locked; failed persistence rejects', async () => {
  for (const record of [undefined, null, true, {}, {version: state.TERMS_VERSION}, {version: state.TERMS_VERSION, acceptedAt: '42'}, {version: state.TERMS_VERSION, acceptedAt: -1}]) {
    assert.equal(await state.hasConsent(localStorage({[state.CONSENT_KEY]: record})), false);
  }
  const storage = localStorage();
  storage.failures.set = true;
  await assert.rejects(state.acceptConsent(storage, 42), /storage write failed/);
  assert.equal(await state.hasConsent(storage), false);
  assert.deepEqual(storage.snapshot(), {});
  storage.failures.get = true;
  assert.equal(await state.hasConsent(storage), false);
  assert.equal(await state.hasConsent(null), false);
  await assert.rejects(state.acceptConsent(null, 42));
});

test('compares ordinary three/four-part versions numerically and rejects unknown/prerelease versions', () => {
  for (const [a, b, expected] of [
    ['2.10.0', '2.9.9', 1], ['2.9.9', '2.10.0', -1], ['v2.10.0', '2.10.0', 0],
    ['2.10.0.1', '2.10.0', 1], ['2.10.0', '2.10.0.0', 0], ['2.10.0.9', '2.10.0.10', -1], ['10.0.0', '9.99.99', 1]
  ]) assert.equal(state.compareVersions(a, b), expected, `${a} compared with ${b}`);
  for (const value of ['2.10.0-beta.1', 'v2.10.0-rc1', '2.10.0+build', '2.10', '2', '2.10.0.0.1', '2.a.0', '', ' 2.10.0 ', null, 210, {}, '9007199254740992.0.0']) {
    assert.equal(state.compareVersions(value, '2.9.9'), null);
    assert.equal(state.compareVersions('2.9.9', value), null);
  }
});

test('unaccepted/old/unreadable consent makes zero network requests even with force', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; throw Error('must not fetch'); };
  for (const storage of [localStorage(), localStorage({[state.CONSENT_KEY]: {version: 'old', acceptedAt: 1}}), null]) {
    assert.deepEqual(await state.checkForUpdate('2.9.9', {storage, fetchImpl, force: true, now: 100}), {status: 'unaccepted', release: null, cached: false});
    if (storage) assert.equal(storage.calls.set.length, 0);
  }
  const storage = accepted();
  storage.failures.get = state.CONSENT_KEY;
  assert.equal((await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100})).status, 'unaccepted');
  assert.equal(requests, 0);
});

test('requests only the fixed public endpoint without cookies, referrer, body, or redirects', async () => {
  const storage = accepted({course: {url: 'https://course.invalid/private', token: 'never-send'}});
  let requests = 0;
  const result = await state.checkForUpdate('2.9.9', {storage, now: 100, fetchImpl: async (url, options) => {
    requests++;
    assert.equal(url, ENDPOINT);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    assert.deepEqual(options.headers, {Accept: 'application/vnd.github+json'});
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.stringify({url, options}).includes('never-send'), false);
    return json(release());
  }});
  assert.deepEqual(result, {status: 'available', release: metadata(), cached: false});
  assert.deepEqual(storage.snapshot()[state.UPDATE_KEY], {lastAttemptAt: 100, release: metadata(), notifiedVersion: null});
  assert.equal(requests, 1);
});

test('caches from timestamp zero through interval minus one, then refreshes at exactly 86400000ms', async () => {
  const storage = accepted();
  let requests = 0;
  const fetchImpl = async () => { requests++; return json(release()); };
  assert.equal((await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 0})).cached, false);
  for (const now of [0, 1, DAY - 1]) {
    assert.deepEqual(await state.checkForUpdate('2.9.9', {storage, fetchImpl, now}), {status: 'available', release: metadata(), cached: true});
  }
  assert.equal(requests, 1);
  assert.equal((await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: DAY})).cached, false);
  assert.equal(storage.snapshot()[state.UPDATE_KEY].lastAttemptAt, DAY);
  assert.equal(requests, 2);
});

test('manual force bypasses a fresh cache', async () => {
  const storage = accepted();
  let requests = 0;
  const fetchImpl = async () => json(release(++requests === 1 ? '2.10.0' : '2.11.0'));
  await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100});
  assert.deepEqual(await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 101, force: true}), {status: 'available', release: metadata('2.11.0'), cached: false});
  assert.equal(requests, 2);
});

test('cached release comparison reflects an extension upgrade without another fetch', async () => {
  const storage = accepted();
  let requests = 0;
  const fetchImpl = async () => { requests++; return json(release()); };
  await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100});
  for (const version of ['2.10.0', '2.10.0.0', '2.11.0']) {
    assert.deepEqual(await state.checkForUpdate(version, {storage, fetchImpl, now: 101}), {status: 'current', release: metadata(), cached: true});
  }
  assert.equal(requests, 1);
});

test('missing, negative, future, and nonnumeric attempt timestamps cannot poison the cache', async () => {
  for (const lastAttemptAt of [undefined, -1, 101, '100', NaN]) {
    const storage = accepted({[state.UPDATE_KEY]: {lastAttemptAt, release: metadata(), notifiedVersion: null}});
    let requests = 0;
    const result = await state.checkForUpdate('2.9.9', {storage, now: 100, fetchImpl: async () => { requests++; return json(release()); }});
    assert.equal(result.cached, false);
    assert.equal(result.status, 'available');
    assert.equal(requests, 1);
  }
});

test('ignores draft, prerelease, and unrecognizable release tags', async () => {
  for (const payload of [release('2.10.0', {draft: true}), release('2.10.0', {prerelease: true}), release('2.10.0-beta.1'), release('unknown')]) {
    const storage = accepted();
    let requests = 0;
    const fetchImpl = async () => { requests++; return json(payload); };
    assert.deepEqual(await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100}), {status: 'current', release: null, cached: false});
    assert.deepEqual(await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 101}), {status: 'current', release: null, cached: true});
    assert.equal(requests, 1);
  }
});

test('rejects unpublished/malformed releases and missing installation assets', async () => {
  for (const payload of [null, [], {}, {draft: false, prerelease: false}, release('2.10.0', {draft: undefined}), release('2.10.0', {prerelease: undefined}), release('2.10.0', {published_at: null}), release('2.10.0', {published_at: 'invalid'}), release('2.10.0', {assets: []}), release('2.10.0', {assets: [{name: 'other.zip', browser_download_url: metadata().downloadURL}]})]) {
    const result = await state.checkForUpdate('2.9.9', {storage: accepted(), now: 100, fetchImpl: async () => json(payload)});
    assert.equal(result.status, 'error');
    assert.equal(result.release, null);
    assert.equal(result.cached, false);
    assert.equal(typeof result.error, 'string');
  }
});

test('rejects external, wrong-repository/tag, credentialed, insecure, and query-bearing asset URLs', async () => {
  const expected = metadata().downloadURL;
  const credentialed = new URL(expected);
  credentialed.username = 'user';
  credentialed['pass' + 'word'] = 'example';
  for (const url of [
    'https://evil.invalid/ppt-capture.zip', expected.replace('MeowSaint/', 'other/'), expected.replace('v2.10.0/', 'v2.9.0/'),
    expected.replace('https://', 'http://'), expected.replace('github.com/', 'github.com.evil.invalid/'),
    credentialed.href, `${expected}?token=example`, `${expected}#fragment`
  ]) {
    const payload = release('2.10.0', {assets: [{name: 'ppt-capture.zip', browser_download_url: url}]});
    assert.equal((await state.checkForUpdate('2.9.9', {storage: accepted(), now: 100, fetchImpl: async () => json(payload)})).status, 'error', url);
  }
  const badPage = release('2.10.0', {html_url: 'https://evil.invalid/release'});
  assert.equal((await state.checkForUpdate('2.9.9', {storage: accepted(), now: 100, fetchImpl: async () => json(badPage)})).status, 'error');
});

test('accepts numeric tags without v and four-part versions with matching repository URLs', async () => {
  const payload = release('2.10.0.1', {
    tag_name: '2.10.0.1', html_url: `${REPOSITORY}/releases/tag/2.10.0.1`,
    assets: [{name: 'ppt-capture.zip', browser_download_url: `${REPOSITORY}/releases/download/2.10.0.1/ppt-capture.zip`}]
  });
  const result = await state.checkForUpdate('2.10.0', {storage: accepted(), now: 100, fetchImpl: async () => json(payload)});
  assert.deepEqual(result, {status: 'available', release: {version: '2.10.0.1', url: payload.html_url, downloadURL: payload.assets[0].browser_download_url}, cached: false});
});

test('HTTP/rate/network/JSON errors return an error and back off until the exact boundary', async () => {
  const failures = [async () => json({message: 'rate limited'}, 403), async () => json({}, 429), async () => json({}, 503), async () => { throw TypeError('offline'); }, async () => new Response('not JSON')];
  for (const fail of failures) {
    const storage = accepted();
    let requests = 0;
    const fetchImpl = async (...args) => { requests++; return fail(...args); };
    const result = await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100});
    assert.equal(result.status, 'error');
    assert.equal(result.release, null);
    assert.equal(result.cached, false);
    assert.ok(result.error);
    assert.equal(storage.snapshot()[state.UPDATE_KEY].lastAttemptAt, 100);
    assert.deepEqual(await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100 + DAY - 1}), {...result, cached: true});
    assert.equal(requests, 1);
    assert.equal((await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100 + DAY})).cached, false);
    assert.equal(requests, 2);
  }
});

test('manual force can recover from a cached failure', async () => {
  const storage = accepted();
  await state.checkForUpdate('2.9.9', {storage, now: 100, fetchImpl: async () => { throw Error('offline'); }});
  assert.equal((await state.checkForUpdate('2.9.9', {storage, now: 101, force: true, fetchImpl: async () => json(release())})).status, 'available');
  assert.equal(Object.hasOwn(storage.snapshot()[state.UPDATE_KEY], 'error'), false);
});

test('unreadable update state and failed update writes do not escape into the caller', async () => {
  const storage = accepted();
  let requests = 0;
  const fetchImpl = async () => { requests++; return json(release()); };
  storage.failures.get = state.UPDATE_KEY;
  assert.equal((await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 100})).status, 'error');
  assert.equal(requests, 0);
  storage.failures.get = null;
  storage.failures.set = true;
  assert.equal((await state.checkForUpdate('2.9.9', {storage, fetchImpl, now: 101})).status, 'error');
  assert.equal(await state.claimNotification('2.10.0', storage), false);
});

test('invalid cached URLs are rejected without exposing an unsafe download', async () => {
  const storage = accepted({[state.UPDATE_KEY]: {lastAttemptAt: 100, release: {...metadata(), downloadURL: 'https://evil.invalid/file.zip'}, notifiedVersion: null}});
  const result = await state.checkForUpdate('2.9.9', {storage, now: 101, fetchImpl: async () => json(release())});
  assert.notEqual(result.release?.downloadURL, 'https://evil.invalid/file.zip');
  assert.equal(await state.claimNotification('2.10.0', localStorage({[state.UPDATE_KEY]: {lastAttemptAt: 100, release: {...metadata(), url: 'https://evil.invalid'}, notifiedVersion: null}})), false);
});

test('malformed cached errors still return a string error and back off', async () => {
  const storage = accepted({[state.UPDATE_KEY]: {lastAttemptAt: 100, release: null, notifiedVersion: null, error: {message: 'corrupt'}}});
  let requests = 0;
  const result = await state.checkForUpdate('2.9.9', {storage, now: 101, fetchImpl: async () => { requests++; return json(release()); }});
  assert.equal(result.status, 'error');
  assert.equal(result.cached, true);
  assert.equal(typeof result.error, 'string');
  assert.equal(requests, 0);
});

test('notification claims require a cached attempt timestamp as well as a matching release', async () => {
  for (const lastAttemptAt of [undefined, -1, '100']) {
    const storage = localStorage({[state.UPDATE_KEY]: {lastAttemptAt, release: metadata(), notifiedVersion: null}});
    assert.equal(await state.claimNotification('2.10.0', storage), false);
    assert.equal(storage.calls.set.length, 0);
  }
});

test('notification claims persist once per matching release and survive refresh/reload', async () => {
  const storage = accepted();
  assert.equal(await state.claimNotification('2.10.0', storage), false);
  await state.checkForUpdate('2.9.9', {storage, now: 100, fetchImpl: async () => json(release())});
  assert.equal(await state.claimNotification('2.11.0', storage), false);
  assert.equal(await state.claimNotification('2.10.0', storage), true);
  assert.equal(await state.claimNotification('2.10.0', storage), false);
  assert.deepEqual(storage.snapshot()[state.UPDATE_KEY], {lastAttemptAt: 100, release: metadata(), notifiedVersion: '2.10.0'});
  assert.equal(await state.claimNotification('2.10.0', localStorage(storage.snapshot())), false);
  await state.checkForUpdate('2.9.9', {storage, now: 101, force: true, fetchImpl: async () => { throw Error('offline'); }});
  assert.equal(storage.snapshot()[state.UPDATE_KEY].notifiedVersion, '2.10.0');
  await state.checkForUpdate('2.9.9', {storage, now: 101 + DAY, fetchImpl: async () => json(release())});
  assert.equal(await state.claimNotification('2.10.0', storage), false);
  await state.checkForUpdate('2.9.9', {storage, now: 101 + DAY, force: true, fetchImpl: async () => json(release('2.11.0'))});
  assert.equal(await state.claimNotification('2.11.0', storage), true);
  assert.equal(await state.claimNotification('2.11.0', storage), false);
});

test('notification storage failures never report a successful claim', async () => {
  const storage = accepted();
  await state.checkForUpdate('2.9.9', {storage, now: 100, fetchImpl: async () => json(release())});
  storage.failures.set = true;
  assert.equal(await state.claimNotification('2.10.0', storage), false);
  assert.equal(storage.snapshot()[state.UPDATE_KEY].notifiedVersion, null);
  storage.failures.set = false;
  assert.equal(await state.claimNotification('2.10.0', storage), true);
  storage.failures.get = true;
  assert.equal(await state.claimNotification('2.10.0', storage), false);
});

test('the supported timeout bounds pending fetch and response-body work and clears its timer', async () => {
  for (const stallBody of [false, true]) {
    let timer, cleared = false, requestSignal, started;
    const fetching = new Promise(resolve => { started = resolve; });
    const storage = accepted();
    const api = browserModule({
      setTimeout(callback, milliseconds) { timer = {callback, milliseconds}; return timer; },
      clearTimeout(handle) { assert.equal(handle, timer); cleared = true; },
      fetch: async (_url, {signal}) => {
        requestSignal = signal;
        if (!stallBody) {
          started();
          return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
        }
        return new Response(new ReadableStream({
          start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), {once: true}); },
          pull() { started(); }
        }, {highWaterMark: 0}));
      }
    });
    const pending = api.checkForUpdate('2.9.9', {storage, now: 100});
    await fetching;
    assert.equal(timer.milliseconds, 8000);
    timer.callback();
    const result = await pending;
    assert.equal(result.status, 'error');
    assert.match(result.error, /timed? out|timeout/i);
    assert.equal(requestSignal.aborted, true);
    assert.equal(cleared, true);
    assert.equal(storage.snapshot()[state.UPDATE_KEY].lastAttemptAt, 100);
  }
});

test('caller cancellation returns a nonthrowing error, and an already aborted signal makes no request', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  assert.equal((await state.checkForUpdate('2.9.9', {storage: accepted(), now: 100, signal: controller.signal, fetchImpl: async () => { requests++; return json(release()); }})).status, 'error');
  assert.equal(requests, 0);
  const running = new AbortController();
  let started;
  const fetching = new Promise(resolve => { started = resolve; });
  const pending = state.checkForUpdate('2.9.9', {storage: accepted(), now: 100, signal: running.signal, fetchImpl: async (_url, {signal}) => {
    started();
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  }});
  await fetching;
  running.abort();
  assert.equal((await pending).status, 'error');
});
