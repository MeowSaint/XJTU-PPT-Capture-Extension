const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Scanner = vm.runInNewContext(fs.readFileSync(require.resolve('../scanner.js'), 'utf8') + '\nPPTScanner', {
  PPTCore: {...require('../media.js'), similar: (a, b) => a === b},
});
test('real comparator retains one-pixel A-B-A changes with dedupe, stable and ignore controls', async () => {
  const core = require('../media.js');
  const RealScanner = vm.runInNewContext(fs.readFileSync(require.resolve('../scanner.js'), 'utf8') + '\nPPTScanner', {PPTCore: core});
  const a = new Uint8ClampedArray(82944).fill(255), b = a.slice(); b[400] = b[401] = b[402] = 0;
  for (const dedupe of [false, true]) for (const masked of [false, true]) {
    const saved = [], mask = new Uint8Array(20736); if (masked) mask[100] = 1;
    const scanner = new RealScanner({duration: 3}, null);
    scanner.seek = async time => ({sig: time >= 1 && time < 2 ? b : a, sourceTime: time});
    const result = await scanner.scan(options({step: .5, dedupe, compare: (x, y, t) => core.similar(x, y, t, mask), save: async frame => saved.push(frame)}));
    assert.deepEqual(saved.map(f => f.sourceTime), masked ? [.25] : dedupe ? [.25, 1.25] : [.25, 1.25, 2.25]);
    assert.deepEqual(saved.map(f => f.sig[400]), masked ? [255] : dedupe ? [255, 0] : [255, 0, 255]);
    assert.equal(result.unstable, 0);
  }
  const scanner = new RealScanner({duration: 1}, null), saved = [], suspects = [];
  scanner.seek = async time => ({sig: time === 0 ? a : b, sourceTime: time});
  const result = await scanner.scan(options({step: .5, save: async frame => saved.push(frame.sourceTime), suspect: async item => suspects.push(item.time)}));
  assert.equal(result.unstable, 1); assert.deepEqual(suspects, [0]); assert.deepEqual(saved, [.75]);
});

test('completedTo is the last checkpointed safe sample and waits for its commit', async () => {
  const {scanner} = rangeFixture(4), entered = gate(), release = gate();
  let returned = false;
  const pending = scanner.scan(options({save: async () => {}, checkpoint: async point => {
    if (point.time === 3.95) { entered.resolve(); await release.promise; }
  }})).then(result => { returned = true; return result; });
  await entered.promise; assert.equal(returned, false); release.resolve();
  assert.deepEqual({...await pending}, {saved: 1, unstable: 0, completedTo: 3.95});
  assert.equal((await rangeFixture().scanner.scan(options({start: 2, end: 4.1, save: async () => {}}))).completedTo, 4.1);
});

test('failed or cancelled final checkpoint never returns completedTo success', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController(); let successes = 0;
    const pending = rangeFixture(1).scanner.scan(options({signal: controller.signal, save: async () => {}, checkpoint: async point => {
      if (point.time === .95) { if (cancel) controller.abort(Error('tail cancelled')); else throw Error('tail commit failed'); }
    }})).then(result => { successes++; return result; });
    await assert.rejects(pending, cancel ? /tail cancelled/ : /tail commit failed/); assert.equal(successes, 0);
  }
});

test('default precise sampling retains a one-second A to B to A excursion', async () => {
  const {scanner} = rangeFixture(4, time => time >= 1 && time < 2 ? 'B' : 'A');
  const saved = [];
  await scanner.scan(options({step: undefined, dedupe: false, save: async frame => saved.push(frame.sig)}));
  assert.deepEqual(saved, ['A', 'B', 'A']);
});
test('optional comparator masks animation in transitions, confirmations and fallback dedupe', async () => {
  const core = require('../media.js'), mask = core.ignoreMask({x: .5, y: 0, w: .5, h: 1}, 4, 2);
  const scanner = new Scanner({duration: 3}, null), saved = [], thresholds = new Set();
  scanner.seek = async time => {
    const sig = new Uint8ClampedArray(4 * 2 * 4);
    for (let p = 0; p < 8; p++) {
      const value = mask[p] ? Math.round(time * 100) % 256 : time >= 1 && time < 2 ? 200 : 0;
      sig.set([value, value, value, 255], p * 4);
    }
    return {sig, sourceTime: time};
  };
  const result = await scanner.scan(options({step: undefined,
    compare: (a, b, threshold) => { thresholds.add(threshold); return core.similar(a, b, threshold, mask); },
    save: async frame => saved.push(frame.sourceTime)}));
  assert.equal(result.unstable, 0); assert.deepEqual(saved, [.25, 1.25]);
  assert.deepEqual([...thresholds].sort(), [.8, 1.2]);
});
function fixture() {
  const scanner = new Scanner({duration: 4}, null);
  scanner.seek = async time => ({sig: ['A', 'B', 'A', 'C'][Math.floor(time)], sourceTime: time});
  return scanner;
}
function rangeFixture(duration = 10, signature = () => 'A') {
  const scanner = new Scanner({duration}, null), sought = [];
  scanner.seek = async time => { sought.push(time); return {sig: signature(time), sourceTime: time}; };
  return {scanner, sought};
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

test('partial scans bound coarse, fine, and confirmation seeks and report local progress', async () => {
  const {scanner, sought} = rangeFixture(10, time => time < 3 ? 'A' : 'B');
  const saved = [], checkpoints = [], updates = [];
  const result = await scanner.scan(options({start: 2, end: 4.1, step: 2,
    save: async frame => saved.push(frame.sourceTime),
    checkpoint: async point => checkpoints.push({...point}), progress: point => updates.push({...point}),
  }));
  assert.ok(sought.every(time => time >= 2 && time <= 4.1), sought.join(', '));
  assert.ok(sought.includes(2.5), 'changed coarse frames should still trigger fine samples');
  assert.deepEqual(saved, [2.25, 3.25]);
  assert.deepEqual(checkpoints.map(point => point.time), [2, 4, 4.1]);
  assert.deepEqual(updates.map(point => point.ratio), [1 / 3, 2 / 3, 1]);
  assert.ok(updates.every(point => point.duration === 10));
  assert.deepEqual(checkpoints.at(-1), {time: 4.1, duration: 10, saved: 2, unstable: 0, baselineTime: 3.25});
  assert.equal(result.saved, 2);
});

test('confirmation at a partial end clamps to the exact requested end', async () => {
  const {scanner, sought} = rangeFixture();
  const saved = [], checkpoints = [];
  await scanner.scan(options({start: 2, end: 2.1, step: 3,
    save: async frame => saved.push(frame.sourceTime), checkpoint: async point => checkpoints.push(point.time),
  }));
  assert.deepEqual(sought, [2, 2.1, 2.1]);
  assert.deepEqual(saved, [2.1]);
  assert.deepEqual(checkpoints, [2, 2.1]);
});

test('full scans keep the existing sample progress and safe video tail', async () => {
  const {scanner, sought} = rangeFixture(4);
  const checkpoints = [], ratios = [];
  await scanner.scan(options({step: 2, save: async () => {},
    checkpoint: async point => checkpoints.push(point.time), progress: point => ratios.push(point.ratio),
  }));
  assert.deepEqual(sought, [0, 0.25, 2, 3.95]);
  assert.deepEqual(checkpoints, [0, 2, 3.95]);
  assert.deepEqual(ratios, [1 / 3, 2 / 3, 1]);
});

test('resume replays its start boundary and idempotent false saves do not add pages', async () => {
  const {scanner, sought} = rangeFixture(3, time => Math.floor(time));
  const stored = new Set([1.25]), attempted = [], checkpoints = [];
  const result = await scanner.scan(options({start: 1, end: 2, dedupe: false,
    save: async frame => {
      attempted.push(frame.sourceTime);
      if (stored.has(frame.sourceTime)) return false;
      stored.add(frame.sourceTime);
    }, checkpoint: async point => checkpoints.push({...point}),
  }));
  assert.equal(sought[0], 1);
  assert.ok(sought.every(time => time >= 1 && time <= 2));
  assert.deepEqual(attempted, [1.25, 2]);
  assert.equal(result.saved, 1);
  assert.deepEqual(checkpoints.map(point => point.saved), [0, 1]);
});

test('resume on an unchanged slide matches uninterrupted timestamps with dedupe disabled', async () => {
  const signature = time => time < 10 ? 'A' : 'B', uninterrupted = [], resumed = [];
  await rangeFixture(12, signature).scanner.scan(options({step: 2, dedupe: false,
    save: async frame => uninterrupted.push(frame.sourceTime),
  }));
  const controller = new AbortController(); let safe;
  await assert.rejects(rangeFixture(12, signature).scanner.scan(options({step: 2, dedupe: false, signal: controller.signal,
    save: async frame => resumed.push(frame.sourceTime), checkpoint: async point => {
      safe = {...point}; if (point.time === 4) controller.abort(Error('stop at checkpoint four'));
    },
  })), /stop at checkpoint four/);
  const {scanner, sought} = rangeFixture(12, signature);
  await scanner.scan(options({start: safe.time, baselineTime: safe.baselineTime, step: 2, dedupe: false,
    save: async frame => { if (resumed.includes(frame.sourceTime)) return false; resumed.push(frame.sourceTime); },
  }));
  assert.deepEqual(uninterrupted, [.25, 10.25]);
  assert.deepEqual(resumed, uninterrupted, 'replaying an unchanged checkpoint must not add a same-slide page');
  assert.equal(safe.baselineTime, .25); assert.deepEqual(sought.slice(0, 2), [.25, 4]);
});

test('a baseline seed warms comparison without saving or contributing progress', async () => {
  for (const baselineTime of [0, .25, 4]) {
    const {scanner, sought} = rangeFixture(4), points = [], ratios = [];
    const result = await scanner.scan(options({start: 2, end: 3, baselineTime,
      save: async () => assert.fail('unchanged seed must not create a page'),
      checkpoint: async point => points.push({...point}), progress: point => ratios.push(point.ratio),
    }));
    assert.deepEqual(sought, [baselineTime, 2, 3]); assert.equal(result.saved, 0);
    assert.deepEqual(points.map(point => point.baselineTime), [baselineTime, baselineTime]);
    assert.deepEqual(ratios, [.5, 1]);
  }
});

test('checkpoint baseline time follows the captured frame even when disk dedupe skips it', async () => {
  const {scanner} = rangeFixture(4, time => time < 1 ? 'A' : 'B'), points = [];
  await scanner.scan(options({end: 1.01, isDuplicate: async () => true,
    save: async () => assert.fail('duplicate must not be saved'), checkpoint: async point => points.push({...point}),
  }));
  assert.deepEqual(points.map(point => [point.time, point.baselineTime]), [[0, .25], [1, 1], [1.01, 1]]);
});

test('an unstable confirmation leaves the checkpoint baseline null until a stable capture', async () => {
  const {scanner} = rangeFixture(4, time => time === 0 ? 'transition' : 'B'), points = [], saved = [];
  await scanner.scan(options({end: 1, save: async frame => saved.push(frame.sourceTime), checkpoint: async point => points.push({...point})}));
  assert.deepEqual(saved, [.75], 'the changed coarse frame triggers a stable fine-sample confirmation');
  assert.deepEqual(points.map(point => [point.time, point.baselineTime]), [[0, null], [1, .75]]);
});

test('a failed baseline seed rejects before pages, checkpoints or progress', async () => {
  const {scanner, sought} = rangeFixture(4), seek = scanner.seek, callbacks = [];
  scanner.seek = async time => { if (time === .25) { sought.push(time); throw Error('baseline decode failed'); } return seek(time); };
  await assert.rejects(scanner.scan(options({start: 2, baselineTime: .25,
    save: async () => callbacks.push('save'), checkpoint: async () => callbacks.push('checkpoint'), progress: () => callbacks.push('progress'),
  })), /baseline decode failed/);
  assert.deepEqual(sought, [.25]); assert.deepEqual(callbacks, []);
});

test('abort during baseline hydration prevents all scan callbacks and later seeks', async () => {
  const {scanner, sought} = rangeFixture(4), seek = scanner.seek, controller = new AbortController(), callbacks = [];
  scanner.seek = async time => {
    const frame = await seek(time);
    if (time === .25) controller.abort(Error('stopped during baseline seed'));
    return frame;
  };
  await assert.rejects(scanner.scan(options({start: 2, baselineTime: .25, signal: controller.signal,
    save: async () => callbacks.push('save'), checkpoint: async () => callbacks.push('checkpoint'), progress: () => callbacks.push('progress'),
  })), /stopped during baseline seed/);
  assert.deepEqual(sought, [.25]); assert.deepEqual(callbacks, []);
});

test('invalid baseline timestamps reject before seeking or writing', async () => {
  for (const baselineTime of [-1, NaN, Infinity, 4.01, '0', false]) {
    const {scanner, sought} = rangeFixture(4);
    await assert.rejects(scanner.scan(options({start: 2, baselineTime,
      save: async () => assert.fail('invalid seed must not save'), checkpoint: async () => assert.fail('invalid seed must not checkpoint'),
    })), /无效/);
    assert.deepEqual(sought, []);
  }
});

test('a false save does not add its signature to in-memory dedupe', async () => {
  const {scanner} = rangeFixture(3, time => ['A', 'B', 'A'][Math.floor(time)]);
  const attempted = [];
  const result = await scanner.scan(options({end: 2, save: async frame => {
    attempted.push(frame.sig); return attempted.length === 1 ? false : undefined;
  }}));
  assert.deepEqual(attempted, ['A', 'B', 'A']);
  assert.equal(result.saved, 2);
});

test('checkpoints await page commits and block the next coarse interval', async () => {
  const {scanner, sought} = rangeFixture(3, time => Math.floor(time));
  const saveEntered = gate(), saveRelease = gate(), checkpointEntered = gate(), checkpointRelease = gate();
  const events = [];
  const pending = scanner.scan(options({end: 2, save: async frame => {
    events.push(`save:${frame.sourceTime}`);
    if (frame.sourceTime === 0.25) { saveEntered.resolve(); await saveRelease.promise; }
    events.push(`committed:${frame.sourceTime}`);
  }, checkpoint: async point => {
    events.push(`checkpoint:${point.time}`);
    if (point.time === 0) { checkpointEntered.resolve(); await checkpointRelease.promise; }
  }}));
  await saveEntered.promise;
  assert.deepEqual(events, ['save:0.25']);
  assert.deepEqual(sought, [0, 0.25]);
  saveRelease.resolve();
  await Promise.race([checkpointEntered.promise, pending.then(() => assert.fail('scan finished without a checkpoint'))]);
  assert.deepEqual(events, ['save:0.25', 'committed:0.25', 'checkpoint:0']);
  assert.deepEqual(sought, [0, 0.25]);
  checkpointRelease.resolve(); await pending;
  assert.deepEqual(events, [
    'save:0.25', 'committed:0.25', 'checkpoint:0',
    'save:1.25', 'committed:1.25', 'checkpoint:1',
    'save:2', 'committed:2', 'checkpoint:2',
  ]);
});

test('a coarse checkpoint follows all fine and coarse page commits in its interval', async () => {
  const {scanner} = rangeFixture(3, time => time < 0.8 ? 'A' : time < 1.8 ? 'B' : 'C');
  const events = [];
  await scanner.scan(options({end: 2, step: 2,
    save: async frame => { await Promise.resolve(); events.push(`saved:${frame.sourceTime}`); },
    checkpoint: async point => events.push(`checkpoint:${point.time}:${point.saved}`),
  }));
  assert.deepEqual(events, ['saved:0.25', 'checkpoint:0:1', 'saved:1.25', 'saved:2', 'checkpoint:2:3']);
});

test('unstable confirmations await a bounded suspect record before their checkpoint', async () => {
  const {scanner, sought} = rangeFixture(4, time => time === 1 ? 'transition' : 'B');
  const suspectEntered = gate(), suspectRelease = gate(), suspects = [], checkpoints = [];
  const pending = scanner.scan(options({start: 1, end: 1.3,
    save: async () => {}, suspect: async range => {
      suspects.push({...range}); suspectEntered.resolve(); await suspectRelease.promise;
    }, checkpoint: async point => checkpoints.push({...point}),
  }));
  await Promise.race([suspectEntered.promise, pending.then(() => assert.fail('scan finished without a suspect record'))]);
  assert.deepEqual(suspects, [{start: 1, end: 1.3, time: 1}]);
  assert.deepEqual(sought, [1, 1.25]);
  assert.deepEqual(checkpoints, []);
  suspectRelease.resolve();
  const result = await pending;
  assert.deepEqual(checkpoints.map(point => [point.time, point.unstable]), [[1, 1], [1.3, 1]]);
  assert.equal(result.unstable, 1);
});

test('an unstable fine sample is recorded before its coarse checkpoint', async () => {
  const {scanner} = rangeFixture(4, time => time < 1 ? 'A' : time === 1 ? 'transition' : 'B');
  const events = [];
  await scanner.scan(options({start: 0.5, end: 2, step: 2, save: async () => {},
    suspect: async range => { await Promise.resolve(); events.push(['suspect', {...range}]); },
    checkpoint: async point => events.push(['checkpoint', point.time]),
  }));
  assert.deepEqual(events, [
    ['checkpoint', 0.5], ['suspect', {start: 0.5, end: 1.5, time: 1}], ['checkpoint', 2],
  ]);
});

test('checkpoint failure rejects and prevents later seeks or page writes', async () => {
  const {scanner, sought} = rangeFixture();
  let writes = 0;
  await assert.rejects(scanner.scan(options({save: async () => { writes++; },
    checkpoint: async () => { throw Error('checkpoint commit failed'); },
  })), /checkpoint commit failed/);
  assert.equal(writes, 1);
  assert.deepEqual(sought, [0, 0.25]);
});

test('a failed page commit preserves only checkpoints from earlier intervals', async () => {
  const checkpoints = [];
  await assert.rejects(fixture().scan(options({save: async frame => {
    if (frame.sig === 'B') throw Error('page commit failed');
  }, checkpoint: async point => checkpoints.push(point.time)})), /page commit failed/);
  assert.deepEqual(checkpoints, [0]);
});

test('a failed suspect commit rejects before a checkpoint can mark that interval safe', async () => {
  const {scanner, sought} = rangeFixture(4, time => time === 0 ? 'transition' : 'B');
  const checkpoints = [];
  await assert.rejects(scanner.scan(options({save: async () => {},
    suspect: async () => { throw Error('suspect commit failed'); },
    checkpoint: async point => checkpoints.push(point.time),
  })), /suspect commit failed/);
  assert.deepEqual(checkpoints, []);
  assert.deepEqual(sought, [0, 0.25]);
});

test('abort during a committed save prevents an unsafe next checkpoint', async () => {
  const controller = new AbortController(), checkpoints = [], saved = [];
  await assert.rejects(fixture().scan(options({signal: controller.signal, save: async frame => {
    saved.push(frame.sig);
    if (frame.sig === 'B') controller.abort(new Error('stopped during save'));
  }, checkpoint: async point => checkpoints.push(point.time)})), /stopped during save/);
  assert.deepEqual(saved, ['A', 'B']);
  assert.deepEqual(checkpoints, [0]);
});

test('abort during suspect commit prevents its next checkpoint', async () => {
  const {scanner} = rangeFixture(4, time => time === 0 ? 'transition' : 'B');
  const controller = new AbortController(), checkpoints = [];
  await assert.rejects(scanner.scan(options({signal: controller.signal, save: async () => {},
    suspect: async () => { controller.abort(new Error('stopped during suspect')); },
    checkpoint: async point => checkpoints.push(point.time),
  })), /stopped during suspect/);
  assert.deepEqual(checkpoints, []);
});

test('abort after an asynchronous duplicate result cannot checkpoint the skipped page', async () => {
  const {scanner} = rangeFixture(0.1);
  const controller = new AbortController(), checkpoints = [];
  await assert.rejects(scanner.scan(options({signal: controller.signal,
    isDuplicate: async () => { controller.abort(new Error('stopped after duplicate')); return true; },
    save: async () => assert.fail('duplicate page must not be saved'),
    checkpoint: async point => checkpoints.push(point.time),
  })), /stopped after duplicate/);
  assert.deepEqual(checkpoints, []);
});

test('a zero-length playable range samples its boundary once without confirming outside it', async () => {
  const {scanner, sought} = rangeFixture();
  const saved = [], checkpoints = [], ratios = [];
  const result = await scanner.scan(options({start: 2, end: 2,
    save: async frame => saved.push(frame.sourceTime), checkpoint: async point => checkpoints.push(point.time),
    progress: point => ratios.push(point.ratio),
  }));
  assert.deepEqual(sought, [2]);
  assert.deepEqual(saved, [2]);
  assert.deepEqual(checkpoints, [2]);
  assert.deepEqual(ratios, [1]);
  assert.equal(result.saved, 1);
});

test('invalid duration, step, and bounds reject before seeking or writing', async () => {
  const invalid = [
    [0, {}], [-1, {}], [NaN, {}], [Infinity, {}],
    [4, {step: 0}], [4, {step: -1}], [4, {step: NaN}], [4, {step: Infinity}],
    [4, {step: Number.MIN_VALUE}], [4, {start: -1}], [4, {start: NaN}], [4, {start: Infinity}],
    [4, {end: NaN}], [4, {end: Infinity}], [4, {end: 5}], [4, {start: 2, end: 1}],
    [4, {start: 4, end: 4}], [4, {start: 3.99}],
  ];
  for (const [duration, extra] of invalid) {
    const {scanner, sought} = rangeFixture(duration);
    await assert.rejects(scanner.scan(options({...extra,
      save: async () => assert.fail('invalid scan must not save'),
      checkpoint: async () => assert.fail('invalid scan must not checkpoint'),
    })), /无效/, `duration=${duration}, options=${JSON.stringify(extra)}`);
    assert.deepEqual(sought, []);
  }
});


test('native seek shares source-aware diagnostics, cleans listeners and retains the 30s deadline', async () => {
  for (const mode of ['error', 'timeout', 'abort', 'setter']) {
    const listeners = new Set(), timers = new Set(); let timeout, milliseconds, cleared = 0;
    const v = Object.assign(new EventTarget(), {readyState: 0, seeking: true, error: {code: 3}});
    const add = v.addEventListener.bind(v), remove = v.removeEventListener.bind(v);
    v.addEventListener = (type, fn, opts) => { listeners.add(fn); add(type, fn, opts); };
    v.removeEventListener = (type, fn) => { listeners.delete(fn); remove(type, fn); };
    Object.defineProperty(v, 'currentTime', {get: () => 0, set() { if (mode === 'setter') throw Error('setter failed'); }});
    const Seek = vm.runInNewContext(fs.readFileSync(require.resolve('../scanner.js'), 'utf8') + '\nPPTScanner', {
      PPTCore: require('../media.js'), DOMException,
      setTimeout(fn, ms) { timeout = fn; milliseconds = ms; timers.add(fn); return fn; },
      clearTimeout(fn) { timers.delete(fn); cleared++; },
    });
    const controller = new AbortController(), pending = new Seek(v, () => assert.fail('must not capture'), {local: true, audioOmitted: true}).seek(7.5, controller.signal);
    if (mode === 'error') v.dispatchEvent(new Event('error'));
    if (mode === 'timeout') timeout();
    if (mode === 'abort') controller.abort();
    await assert.rejects(pending, error => {
      if (mode === 'abort') return error.name === 'AbortError';
      assert.equal(error.phase, 'seek'); assert.equal(error.time, 7.5);
      assert.doesNotMatch(error.message, /刷新|服务器|网络/); return true;
    });
    assert.equal(milliseconds, 30000); assert.equal(listeners.size, 0); assert.equal(timers.size, 0); assert(cleared > 0);
  }
});

test('legacy two-argument scanner infers local Blob media context', () => {
  const scanner = new Scanner({src: 'blob:http://127.0.0.1/local'}, () => {});
  assert.equal(scanner.mediaContext.local, true);
});


test('seek at the same time still decodes when loadeddata came only from audio', async () => {
  let sought = 0;
  const v = Object.assign(new EventTarget(), {readyState: 2, seeking: false, getVideoPlaybackQuality: () => ({totalVideoFrames: 0})});
  Object.defineProperty(v, 'currentTime', {get: () => 0, set() { sought++; queueMicrotask(() => v.dispatchEvent(new Event('seeked'))); }});
  const Seek = vm.runInNewContext(fs.readFileSync(require.resolve('../scanner.js'), 'utf8') + '\nPPTScanner', {PPTCore: require('../media.js'), DOMException, setTimeout, clearTimeout});
  await new Seek(v, () => {}).seek(0);
  assert.equal(sought, 1);
});

function presentedVideo({time = 0, frames = 1, normalize = value => value} = {}) {
  const callbacks = new Map(), timers = new Set(), listeners = new Set(), captures = [], cancelled = [];
  let clock = time, now = 100, next = 0, sets = 0, timeout, setterError = false;
  const v = Object.assign(new EventTarget(), {src: 'blob:one', currentSrc: 'blob:one', srcObject: null, readyState: 2, seeking: false, paused: true, videoWidth: 192, videoHeight: 108,
    getVideoPlaybackQuality: () => ({totalVideoFrames: frames, droppedVideoFrames: 0}), pixel: 'blue', error: {code: 3},
    requestVideoFrameCallback(fn) { const id = ++next; callbacks.set(id, fn); return id; },
    cancelVideoFrameCallback(id) { cancelled.push(id); callbacks.delete(id); }});
  const add = v.addEventListener.bind(v), remove = v.removeEventListener.bind(v);
  v.addEventListener = (type, fn, opts) => { listeners.add(fn); add(type, fn, opts); };
  v.removeEventListener = (type, fn) => { listeners.delete(fn); remove(type, fn); };
  Object.defineProperty(v, 'currentTime', {get: () => clock, set(value) { sets++; if (setterError) throw Error('setter failed'); clock = normalize(value); now++; v.seeking = true; }});
  const Seek = vm.runInNewContext(fs.readFileSync(require.resolve('../scanner.js'), 'utf8') + '\nPPTScanner', {
    PPTCore: require('../media.js'), DOMException, performance: {now: () => now},
    setTimeout(fn, ms) { assert.ok(ms === 30000 || ms === 45000); timeout = fn; timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); },
  });
  const scanner = new Seek(v, requested => { const frame = {requested, nativeTime: clock, pixel: v.pixel}; captures.push(frame); return frame; }, {local: true, audioOmitted: true});
  return {v, scanner, Seek, callbacks, captures, cancelled, listeners, timers, get sets() { return sets; },
    failSetter() { setterError = true; }, timeout() { timeout(); },
    seeked() { v.seeking = false; v.dispatchEvent(new Event('seeked')); },
    frame({presentationTime = 102, mediaTime = 4, pixel = 'red'} = {}) {
      v.pixel = pixel; const pending = [...callbacks.values()]; callbacks.clear();
      for (const fn of pending) fn(++now, {presentationTime, mediaTime, presentedFrames: next}); return pending;
    },
    clean() { assert.equal(callbacks.size, 0); assert.equal(listeners.size, 0); assert.equal(timers.size, 0); },
  };
}

test('pre-src observation preserves the initial paused presentation for a later scanner', async () => {
  const f = presentedVideo(), observation = f.Seek.prime(f.v, undefined, {local: true});
  f.v.src = f.v.currentSrc = 'blob:loaded'; f.v.dispatchEvent(new Event('loadstart'));
  let ready = false; observation.ready.then(() => { ready = true; });
  f.v.dispatchEvent(new Event('loadeddata')); await Promise.resolve(); assert.equal(ready, false, 'decode counters alone cannot certify initial pixels');
  f.frame({presentationTime: 99, mediaTime: 0, pixel: 'blue'}); await Promise.resolve(); assert.equal(ready, false, 'queued old submission cannot certify the new source');
  f.frame({mediaTime: 0, pixel: 'blue'}); await observation.ready; observation.verify(); observation.dispose(); f.clean();
  const scanner = new f.Seek(f.v, time => ({time, pixel: f.v.pixel}));
  assert.equal((await scanner.seek(0)).pixel, 'blue'); assert.equal(f.sets, 0, 'confirmed initial sample does not need an identical seek'); f.clean();
});

test('load completion revalidates source generation, native time and decoded counters', async () => {
  for (const mode of ['source', 'time', 'counts', 'dimensions', 'seeking', 'generation', 'abort']) {
    const f = presentedVideo(), controller = new AbortController(), observation = f.Seek.prime(f.v, controller.signal);
    f.v.dispatchEvent(new Event('loadstart')); f.frame({mediaTime: 0}); await observation.ready; observation.verify();
    if (mode === 'source') f.v.src = f.v.currentSrc = 'blob:replacement';
    if (mode === 'time') f.v.currentTime = 1;
    if (mode === 'counts') f.v.getVideoPlaybackQuality = () => ({totalVideoFrames: 11, droppedVideoFrames: 0});
    if (mode === 'dimensions') f.v.videoWidth = 2;
    if (mode === 'seeking') f.v.seeking = true;
    if (mode === 'generation') { const next = f.Seek.prime(f.v); next.dispose(); await assert.rejects(next.ready, {name: 'AbortError'}); }
    if (mode === 'abort') controller.abort();
    assert.throws(() => observation.verify(), error => mode === 'abort' ? error.name === 'AbortError' : error.phase === 'load'); observation.dispose(); f.clean();
  }
});

test('source observation owns cancellation, errors, timeout, replacement and late callbacks', async () => {
  for (const mode of ['preabort', 'abort', 'error', 'timeout', 'dispose', 'source', 'emptied', 'generation']) {
    const f = presentedVideo(), controller = new AbortController();
    if (mode === 'preabort') { controller.abort(); assert.throws(() => f.Seek.prime(f.v, controller.signal), {name: 'AbortError'}); f.clean(); continue; }
    const observation = f.Seek.prime(f.v, controller.signal, {local: true});
    f.v.dispatchEvent(new Event('loadstart')); const late = [...f.callbacks.values()];
    if (mode === 'abort') controller.abort();
    if (mode === 'error' || mode === 'emptied') f.v.dispatchEvent(new Event(mode));
    if (mode === 'timeout') f.timeout();
    if (mode === 'dispose') observation.dispose();
    if (mode === 'source') { f.v.src = f.v.currentSrc = 'blob:replacement'; f.v.dispatchEvent(new Event('loadstart')); }
    if (mode === 'generation') { const next = f.Seek.prime(f.v); next.dispose(); await assert.rejects(next.ready, {name: 'AbortError'}); }
    await assert.rejects(observation.ready, error => /abort|dispose|generation/.test(mode) ? error.name === 'AbortError' : error.phase === 'load');
    for (const callback of late) callback(200, {presentationTime: 200, mediaTime: 0});
    observation.dispose(); f.clean(); assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('initial audio-only loading and frame/seeked order share one source certificate', async () => {
  for (const first of ['frame', 'seeked']) {
    const f = presentedVideo({frames: 0}), observation = f.Seek.prime(f.v);
    f.v.dispatchEvent(new Event('loadstart')); f.v.dispatchEvent(new Event('loadeddata'));
    const pending = f.scanner.seek(.1); f.v.dispatchEvent(new Event('seeking'));
    f.frame({presentationTime: 99, mediaTime: 0, pixel: 'blue'}); await Promise.resolve(); assert.deepEqual(f.captures, []);
    f.v.getVideoPlaybackQuality = () => ({totalVideoFrames: 1, droppedVideoFrames: 0});
    if (first === 'frame') f.frame({presentationTime: 200, mediaTime: 0}); else f.seeked();
    if (first === 'frame') f.seeked(); else f.frame({presentationTime: 200, mediaTime: 0});
    assert.equal((await pending).requested, .1); await observation.ready; observation.dispose(); f.clean();
    const other = new f.Seek(f.v, time => time); assert.equal(await other.seek(.1), .1); assert.equal(f.sets, 1); f.clean();
  }
});

test('seeked cannot expose old pixels, including an already queued old frame callback', async () => {
  const f = presentedVideo(), pending = f.scanner.seek(4);
  f.seeked(); await Promise.resolve();
  assert.deepEqual(f.captures, [], 'seeked still exposes blue; red is not presented yet');
  f.frame({presentationTime: 99, mediaTime: 0, pixel: 'blue'}); await Promise.resolve();
  assert.deepEqual(f.captures, [], 'queued callback for the previous presentation cannot release capture');
  f.frame(); const frame = await pending;
  assert.equal(frame.requested, 4); assert.equal(frame.nativeTime, 4); assert.equal(frame.pixel, 'red'); f.clean();
});

test('queued same-target seeking retains a confirmed frame until seeked', async () => {
  const f = presentedVideo({time: 2.5}), controller = new AbortController(), pending = f.scanner.seek(1.25, controller.signal);
  pending.catch(() => {});
  try {
    f.frame({mediaTime: 1.2}); f.v.dispatchEvent(new Event('seeking')); f.seeked();
    await Promise.resolve();
    assert.equal(f.captures.length, 1, 'the queued seeking event must retain the already confirmed target frame');
    assert.deepEqual(await pending, {requested: 1.25, nativeTime: 1.25, pixel: 'red'}); f.clean();
  } finally {
    controller.abort(); await pending.catch(() => {}); f.clean();
    assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('frame and seeked may arrive in either order without imposing a frame-rate tolerance', async () => {
  for (const first of ['frame', 'seeked']) {
    const f = presentedVideo(), pending = f.scanner.seek(4);
    if (first === 'frame') f.frame({mediaTime: 2.2}); else f.seeked();
    await Promise.resolve(); assert.deepEqual(f.captures, []);
    if (first === 'frame') f.seeked(); else f.frame({mediaTime: 2.2});
    assert.equal((await pending).pixel, 'red'); f.clean();
  }
});

test('same-time paused requests await frame evidence and first audio-only requests drive decoding', async () => {
  for (const frames of [0, 1]) {
    const f = presentedVideo({time: 4, frames}), pending = f.scanner.seek(4);
    assert.equal(f.sets, 1); f.seeked(); await Promise.resolve(); assert.deepEqual(f.captures, []);
    f.frame(); assert.equal((await pending).pixel, 'red'); f.clean();
  }
});

test('an unproven current sample cannot use callback time labels as initial provenance', async () => {
  const f = presentedVideo({time: 4}), pending = f.scanner.seek(4);
  assert.equal(f.sets, 1); f.seeked();
  f.frame({presentationTime: 99, mediaTime: 0, pixel: 'blue'}); await Promise.resolve(); assert.deepEqual(f.captures, []);
  f.frame({presentationTime: 99, mediaTime: 4, pixel: 'blue'}); await Promise.resolve(); assert.deepEqual(f.captures, []);
  f.frame({mediaTime: 4, pixel: 'blue'}); assert.equal((await pending).pixel, 'blue'); f.clean();
});

test('entry adoption cannot bypass audio-only, not-ready, seeking, playback, or an intervening seek', async () => {
  for (const mode of ['audio', 'not-ready', 'seeking', 'playing', 'missing-quality', 'intervening']) {
    const f = presentedVideo({time: 4, frames: mode === 'audio' ? 0 : 1});
    if (mode === 'not-ready') f.v.readyState = 1;
    if (mode === 'seeking') f.v.seeking = true;
    if (mode === 'playing') f.v.paused = false;
    if (mode === 'missing-quality') f.v.getVideoPlaybackQuality = undefined;
    const pending = f.scanner.seek(4);
    if (mode === 'intervening') { assert.equal(f.sets, 1); f.v.currentTime = 4; f.v.dispatchEvent(new Event('seeking')); }
    assert.equal(f.sets, mode === 'intervening' ? 2 : 1, mode); f.v.readyState = 2; f.seeked();
    f.frame({presentationTime: 99, mediaTime: 4, pixel: 'blue'}); await Promise.resolve(); assert.deepEqual(f.captures, [], mode);
    f.frame(); assert.equal((await pending).pixel, 'red'); f.clean();
  }
});

test('load-owner native health failure is terminal while ordinary zero-to-frame seek still waits', async () => {
  const invalid = presentedVideo({frames: 0}), failure = Object.assign(Error('no decoded video'), {code: 'MEDIA_NO_VIDEO', phase: 'load'});
  const health = new invalid.Seek(invalid.v, () => assert.fail('invalid video captured'), {local: true}, () => { throw failure; });
  const rejected = health.seek(.1); rejected.catch(() => {}); invalid.seeked();
  assert.equal(invalid.timers.size, 0, 'the old load health decision must not wait on an absent presentation');
  await assert.rejects(rejected, error => error === failure); invalid.clean();
  const valid = presentedVideo({frames: 0}), pending = valid.scanner.seek(.1); valid.seeked();
  await Promise.resolve(); assert.deepEqual(valid.captures, []); assert.equal(valid.timers.size, 1);
  valid.v.getVideoPlaybackQuality = () => ({totalVideoFrames: 1, droppedVideoFrames: 0}); valid.frame({mediaTime: 0});
  assert.equal((await pending).requested, .1); valid.clean();
});

test('native fractional setter normalization preserves requested labels and confirmed repeats', async () => {
  const requested = 4 / 3, f = presentedVideo({normalize: value => Math.trunc(value * 1e6) / 1e6});
  const pending = f.scanner.seek(requested); pending.catch(() => {}); f.v.dispatchEvent(new Event('seeking'));
  assert.equal(f.timers.size, 1, 'the legitimate normalized native target is still pending');
  f.seeked(); f.frame({mediaTime: 1.3}); const frame = await pending;
  assert.equal(frame.requested, requested); assert.equal(frame.nativeTime, 1.333333); f.clean();
  assert.equal((await f.scanner.seek(requested)).requested, requested); assert.equal(f.sets, 1); f.clean();
});

test('new scanners reuse the confirmed native fractional position without losing its raw label', async t => {
  const requested = 4 / 3, f = presentedVideo({normalize: value => Math.trunc(value * 1e6) / 1e6});
  t.after(() => { if (f.timers.size) f.timeout(); f.clean(); });
  const first = f.scanner.seek(requested); f.seeked(); f.frame({mediaTime: 1.3}); await first;
  const nativeTime = f.v.currentTime, proof = f.Seek.frames.get(f.v).proof; f.clean();
  for (const argument of [nativeTime, requested]) {
    const pending = new f.Seek(f.v, f.scanner.capture).seek(argument); pending.catch(() => {});
    assert.equal(f.sets, 1, 'a confirmed exact position must not set the paused native clock again'); f.clean();
    assert.deepEqual(await pending, {requested: argument, nativeTime, pixel: 'red'});
    assert.equal(f.Seek.frames.get(f.v).proof, proof, 'cache hits preserve the original raw/native association'); f.clean();
  }
  assert.deepEqual(f.captures.map(frame => frame.requested), [requested, nativeTime, requested]);
});

test('a different native seek terminates the superseded request without waiting for its deadline', async () => {
  for (const stage of ['before-events', 'after-frame', 'after-seeked']) {
    const f = presentedVideo(), pending = f.scanner.seek(4);
    if (stage === 'after-frame') f.frame();
    if (stage === 'after-seeked') f.seeked();
    const late = [...f.callbacks.values()]; f.v.currentTime = 2; f.v.dispatchEvent(new Event('seeking'));
    assert.equal(f.timers.size, 0, 'an unreachable requested time must release its busy owner immediately');
    await assert.rejects(pending, error => error.phase === 'seek' && error.time === 4);
    for (const callback of late) callback(200, {presentationTime: 200, mediaTime: 2});
    assert.deepEqual(f.captures, []); f.clean();
  }
});

test('abort after either event or both events prevents capture and tolerates late callbacks', async () => {
  for (const phase of ['frame', 'seeked', 'both']) {
    const f = presentedVideo(), controller = new AbortController(), pending = f.scanner.seek(4, controller.signal);
    const late = [...f.callbacks.values()];
    if (phase !== 'seeked') f.frame(); if (phase !== 'frame') f.seeked();
    controller.abort(); await assert.rejects(pending, {name: 'AbortError'});
    for (const callback of late) callback(200, {presentationTime: 200, mediaTime: 4});
    assert.deepEqual(f.captures, []); f.clean();
  }
});

test('repeated calls do not reuse another request or source presentation', async () => {
  const f = presentedVideo();
  for (const source of ['blob:one', 'blob:two']) {
    f.v.src = f.v.currentSrc = source;
    const pending = f.scanner.seek(4); f.seeked(); await Promise.resolve();
    assert.equal(f.captures.length, source === 'blob:one' ? 0 : 1);
    f.frame({presentationTime: 200}); assert.equal((await pending).pixel, 'red'); f.clean();
  }
});

test('native fence cleans callbacks on abort, error, timeout, source replacement, and setter failure', async () => {
  for (const mode of ['preabort', 'abort', 'error', 'timeout', 'seeked-timeout', 'frame-timeout', 'source', 'stream', 'emptied', 'setter']) {
    const f = presentedVideo(), controller = new AbortController();
    if (mode === 'preabort') controller.abort(); if (mode === 'setter') f.failSetter();
    const pending = f.scanner.seek(4, controller.signal), late = [...f.callbacks.values()];
    if (mode === 'abort') controller.abort();
    if (mode === 'error' || mode === 'emptied') f.v.dispatchEvent(new Event(mode));
    if (mode === 'timeout') f.timeout();
    if (mode === 'seeked-timeout') { f.seeked(); f.timeout(); }
    if (mode === 'frame-timeout') { f.frame(); f.timeout(); }
    if (mode === 'source') { f.v.src = f.v.currentSrc = 'blob:two'; f.seeked(); f.frame(); }
    if (mode === 'stream') { f.v.srcObject = {}; f.seeked(); f.frame(); }
    await assert.rejects(pending, error => {
      if (mode.includes('abort')) return error.name === 'AbortError';
      assert.equal(error.phase, 'seek'); assert.equal(error.time, 4); assert.doesNotMatch(error.message, /刷新|服务器|网络/); return true;
    });
    for (const fn of late) fn(200, {presentationTime: 200, mediaTime: 4});
    f.seeked(); await Promise.resolve(); assert.deepEqual(f.captures, []); f.clean();
    assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
    if (mode === 'preabort') assert.equal(f.sets, 0);
  }
});

test('cached presentation is invalidated by time, source, dimensions, playback, or missing decode evidence', async () => {
  for (const mode of ['time', 'source', 'dimensions', 'playing', 'no-quality', 'audio-only', 'invalid-quality']) {
    const f = presentedVideo(); let pending = f.scanner.seek(4); f.seeked(); f.frame(); await pending;
    if (mode === 'time') f.v.currentTime = 3;
    if (mode === 'source') f.v.src = f.v.currentSrc = 'blob:new';
    if (mode === 'dimensions') f.v.videoWidth = 200;
    if (mode === 'playing') f.v.paused = false;
    if (mode === 'no-quality') f.v.getVideoPlaybackQuality = undefined;
    if (mode === 'audio-only') f.v.getVideoPlaybackQuality = () => ({totalVideoFrames: 0, droppedVideoFrames: 0});
    if (mode === 'invalid-quality') f.v.getVideoPlaybackQuality = () => ({totalVideoFrames: Infinity, droppedVideoFrames: 0});
    const before = f.sets; pending = f.scanner.seek(4); assert.equal(f.sets, before + 1, mode);
    f.seeked(); f.frame({presentationTime: 200}); await pending; f.clean();
  }
});

test('a proven paused frame can serve an exact repeat only while source and counters agree', async () => {
  const f = presentedVideo(); let pending = f.scanner.seek(4); f.seeked(); f.frame(); await pending; f.clean();
  assert.equal((await f.scanner.seek(4)).pixel, 'red'); assert.equal(f.sets, 1); f.clean();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.scanner.seek(4, controller.signal), {name: 'AbortError'}); assert.equal(f.captures.length, 2); f.clean();
  f.v.getVideoPlaybackQuality = () => ({totalVideoFrames: 2, droppedVideoFrames: 0});
  pending = f.scanner.seek(4); assert.equal(f.sets, 2); f.seeked(); f.frame({presentationTime: 200}); await pending; f.clean();
});
