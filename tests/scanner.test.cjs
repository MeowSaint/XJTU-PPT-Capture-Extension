const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Scanner = vm.runInNewContext(fs.readFileSync(require.resolve('../scanner.js'), 'utf8') + '\nPPTScanner', {
  PPTCore: {sampleTimes: () => [0, 1, 2, 3], similar: (a, b) => a === b},
});
function fixture() {
  const scanner = new Scanner({duration: 4}, null);
  scanner.seek = async time => ({sig: ['A', 'B', 'A', 'C'][Math.floor(time)], sourceTime: time});
  return scanner;
}
function options(extra = {}) {
  return {step: 1, threshold: 1.2, dedupe: true, signal: new AbortController().signal, progress() {}, ...extra};
}
function gate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

test('scanner retains its previous-signature API for callers without a disk lookup', async () => {
  const saved = [];
  const result = await fixture().scan(options({previous: ['B'], save: async frame => saved.push(frame.sig)}));
  assert.deepEqual(saved, ['A', 'C']);
  assert.equal(result.saved, 2);
});

test('disk dedupe awaits lookup and page commit before checking the next frame', async () => {
  const lookupEntered = gate(), lookupRelease = gate(), saveEntered = gate(), saveRelease = gate();
  const stored = new Set(), checked = [], saved = [];
  const previous = new Proxy([], {get() { throw Error('disk dedupe must not copy retained signatures'); }});
  const pending = fixture().scan(options({previous, isDuplicate: async (signature, threshold) => {
    checked.push(signature); assert.equal(threshold, 1.2);
    if (checked.length === 1) { lookupEntered.resolve(); await lookupRelease.promise; }
    return stored.has(signature);
  }, save: async frame => {
    if (!saved.length) { saveEntered.resolve(); await saveRelease.promise; }
    stored.add(frame.sig); saved.push(frame.sig);
  }}));
  await lookupEntered.promise;
  assert.deepEqual(saved, []);
  lookupRelease.resolve(); await saveEntered.promise;
  assert.deepEqual(checked, ['A']);
  saveRelease.resolve();
  const result = await pending;
  assert.deepEqual(checked, ['A', 'B', 'A', 'C']);
  assert.deepEqual(saved, ['A', 'B', 'C']);
  assert.equal(result.saved, 3);
});

test('cancel during an asynchronous disk lookup prevents the pending page save', async () => {
  const controller = new AbortController();
  let writes = 0;
  await assert.rejects(fixture().scan(options({signal: controller.signal, isDuplicate: async () => {
    controller.abort(new Error('cancelled during disk lookup')); return false;
  }, save: async () => { writes++; }})), /cancelled during disk lookup/);
  assert.equal(writes, 0);
});

test('a failed disk lookup stops scanning without saving or silently accepting the page', async () => {
  let writes = 0;
  await assert.rejects(fixture().scan(options({isDuplicate: async () => { throw Error('IndexedDB read failed'); },
    save: async () => { writes++; }})), /IndexedDB read failed/);
  assert.equal(writes, 0);
});

test('disabled dedupe skips disk reads and still preserves returning slides', async () => {
  const saved = [];
  await fixture().scan(options({dedupe: false, isDuplicate: async () => { throw Error('unexpected disk read'); },
    save: async frame => saved.push(frame.sig)}));
  assert.deepEqual(saved, ['A', 'B', 'A', 'C']);
});
