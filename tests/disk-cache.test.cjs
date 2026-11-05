const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Blob, File} = require('node:buffer');
const {randomUUID} = require('node:crypto');

const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
const failure = (name, message = name) => new DOMException(message, name);

// Model committed disk bytes separately from a writable's uncommitted contents.
function disk() {
  const events = [], nodes = new Map(), pauses = [];
  let hook = () => {};
  async function step(op, path, detail) {
    events.push({op, path, ...detail});
    await hook(op, path, detail);
    const index = pauses.findIndex(pause => pause.op === op && pause.match(path));
    if (index >= 0) {
      const pause = pauses.splice(index, 1)[0];
      pause.started.resolve();
      await pause.resume.promise;
    }
  }
  function directory(name, path) {
    const children = new Map();
    const handle = {
      kind: 'directory', name, path, children,
      async getDirectoryHandle(child, {create = false} = {}) {
        const full = path ? `${path}/${child}` : child;
        await step('directory', full);
        if (!children.has(child) && create) children.set(child, directory(child, full));
        const found = children.get(child);
        if (!found) throw failure('NotFoundError');
        if (found.kind !== 'directory') throw failure('TypeMismatchError');
        return found;
      },
      async getFileHandle(child, {create = false} = {}) {
        const full = `${path}/${child}`;
        await step('file', full);
        if (!children.has(child) && create) {
          const node = {kind: 'file', name: child, path: full, data: Buffer.alloc(0), writers: new Set()};
          nodes.set(full, node);
          node.createWritable = async () => {
            await step('open', full);
            let bytes = Buffer.alloc(0), closed = false, writing = false;
            const stream = {
              async write(chunk) {
                assert.equal(closed, false, 'a closed writable cannot accept bytes');
                assert.equal(writing, false, 'the disk must never see overlapping writes');
                writing = true;
                try {
                  await step('write', full);
                  const value = typeof chunk === 'string' ? Buffer.from(chunk) : chunk instanceof Blob ? Buffer.from(await chunk.arrayBuffer()) : Buffer.from(chunk);
                  bytes = Buffer.concat([bytes, value]);
                  events.push({op: 'written', path: full, size: value.length});
                } finally { writing = false; }
              },
              async close() {
                await step('close', full);
                assert.equal(writing, false);
                closed = true; node.data = bytes; node.writers.delete(stream);
              },
              async abort() {
                await step('abort', full);
                assert.equal(writing, false);
                closed = true; node.writers.delete(stream);
              }
            };
            node.writers.add(stream);
            return stream;
          };
          node.getFile = async () => {
            await step('snapshot', full);
            const file = new File([node.data], child, {lastModified: 123});
            file.arrayBuffer = () => { throw Error('disk snapshots must not be materialized by the cache'); };
            return file;
          };
          children.set(child, node);
        }
        const found = children.get(child);
        if (!found) throw failure('NotFoundError');
        if (found.kind !== 'file') throw failure('TypeMismatchError');
        return found;
      },
      async removeEntry(child, {recursive = false} = {}) {
        const full = path ? `${path}/${child}` : child;
        await step('remove', full, {recursive});
        const found = children.get(child);
        if (!found) throw failure('NotFoundError');
        const descendants = entry => entry.kind === 'file' ? [entry] : [...entry.children.values()].flatMap(descendants);
        for (const node of descendants(found)) {
          if (node.writers.size) throw failure('NoModificationAllowedError', 'writer still open');
        }
        if (found.kind === 'directory' && found.children.size && !recursive) throw failure('InvalidModificationError');
        for (const node of descendants(found)) nodes.delete(node.path);
        children.delete(child);
      },
      async *entries() {
        await step('entries', path);
        yield* [...children.entries()];
      }
    };
    return handle;
  }
  const root = directory('', '');
  return {
    root, nodes, events,
    storage: {async getDirectory() { await step('root', ''); return root; }},
    setHook(value) { hook = value; },
    pause(op, match = () => true) {
      const pause = {op, match, started: deferred(), resume: deferred()};
      pauses.push(pause);
      return {started: pause.started.promise, release: pause.resume.resolve, reject: pause.resume.reject};
    }
  };
}

function webLocks() {
  const held = new Map(), events = [];
  let failNext;
  return {
    held, events,
    fail(error) { failNext = error; },
    forPage(owner) {
      return {async request(name, options, callback) {
        events.push({owner, name, ...options});
        assert.equal(options.mode, 'exclusive');
        if (failNext) { const error = failNext; failNext = undefined; throw error; }
        if (held.has(name)) {
          assert.equal(options.ifAvailable, true, 'cache initialization must not wait on another page');
          return callback(null);
        }
        const crashed = deferred(), lease = {owner, crashed};
        held.set(name, lease);
        try { return await Promise.race([Promise.resolve().then(() => callback({name, mode: 'exclusive'})), crashed.promise]); }
        finally { if (held.get(name) === lease) held.delete(name); }
      }};
    },
    async crash(owner) {
      for (const lease of held.values()) if (lease.owner === owner) lease.crashed.resolve();
      await tick();
    }
  };
}

function page(store, locks, overrides = {}) {
  const owner = randomUUID(), listeners = new Map(), wrappers = [];
  class DiskFile extends File {
    constructor(parts, name, options) { super(parts, name, options); wrappers.push({parts, name, options}); }
  }
  const context = {
    navigator: {storage: store.storage, locks: locks.forPage(owner)},
    crypto: {randomUUID}, File: DiskFile,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    setTimeout() { throw Error('the cache must not expire files on its own'); },
    setInterval() { throw Error('the cache must not expire files on its own'); },
    ...overrides
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../disk-cache.js'), 'utf8'), context);
  return {
    owner, api: context.PPTDiskCache, context, wrappers,
    hide() { for (const listener of listeners.get('pagehide') || []) listener({type: 'pagehide'}); }
  };
}
async function dispose(...pages) {
  pages.forEach(item => item.hide());
  await tick();
}
async function text(file) { return Buffer.from(await Blob.prototype.arrayBuffer.call(file)).toString(); }

test('concurrent writes respect call order and finish waits for physical write backpressure', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const cache = await tab.api.create('movie');
  const gate = store.pause('write');
  let firstDone = false, finishDone = false;
  const first = cache.write(new Uint8Array([65, 66])).then(() => { firstDone = true; });
  await gate.started;
  const second = cache.write(new Uint8Array([67]));
  const final = cache.finish('video/mp4').then(file => { finishDone = true; return file; });
  await tick();
  assert.equal(firstDone, false);
  assert.equal(finishDone, false);
  assert.equal(store.events.filter(event => event.op === 'write').length, 1);
  assert.equal(store.events.filter(event => event.op === 'close').length, 0);
  gate.release();
  await Promise.all([first, second]);
  const file = await final;
  assert.ok(file instanceof File);
  assert.equal(file.type, 'video/mp4');
  assert.equal(await text(file), 'ABC');
  assert.equal(tab.wrappers.length, 1);
  assert.equal(tab.wrappers[0].parts.length, 1);
  assert.ok(tab.wrappers[0].parts[0] instanceof File);
  assert.equal(store.nodes.size, 1, 'finish must retain the file for the download owner');
  await tick();
  assert.equal(store.nodes.size, 1);
  await cache.remove();
  await dispose(tab);
  assert.equal(locks.held.size, 0);
});

test('distinct caches share one page session, finish without a MIME type works, and closed writes reject', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const [a, b] = await Promise.all([tab.api.create('../same/name'), tab.api.create('../same/name')]);
  await Promise.all([a.write('one'), b.write('two')]);
  const [one, two] = await Promise.all([a.finish(), b.finish('')]);
  assert.equal(await text(one), 'one');
  assert.equal(await text(two), 'two');
  assert.notEqual(one.name, two.name);
  assert.equal(one.name.includes('/'), false);
  assert.equal(locks.held.size, 1);
  assert.equal(await a.finish(), one, 'repeated finish must not close the stream a second time');
  await assert.rejects(a.write('late'), /关闭|完成/);
  await a.remove(); await a.remove(); await b.remove();
  assert.equal(store.nodes.size, 0);
  await dispose(tab);
});

test('startup reclaims crashed sessions, skips active sessions, and preserves unrelated OPFS entries', async () => {
  const store = disk(), locks = webLocks();
  const unrelated = await store.root.getDirectoryHandle('other-module', {create: true});
  await unrelated.getFileHandle('keep', {create: true});
  const crashed = page(store, locks), staleCache = await crashed.api.create('stale');
  await staleCache.write('abandoned'); await staleCache.finish();
  const stalePath = [...store.nodes.keys()].find(path => !path.startsWith('other-module/'));
  await locks.crash(crashed.owner);
  const active = page(store, locks), liveCache = await active.api.create('live');
  await liveCache.write('live'); await liveCache.finish();
  const livePath = [...store.nodes.keys()].find(path => !path.startsWith('other-module/'));
  assert.equal(store.nodes.has(stalePath), false);
  const newcomer = page(store, locks);
  await tick();
  assert.equal(store.nodes.has(livePath), true, 'another page must retain its finished download file');
  assert.equal(store.nodes.has('other-module/keep'), true);
  assert.ok(locks.events.some(event => event.owner === newcomer.owner && event.ifAvailable));
  await liveCache.remove();
  await dispose(active, newcomer);
  assert.equal(locks.held.size, 0);
  assert.equal(store.nodes.has('other-module/keep'), true);
});

test('a new session takes its lock before publishing its directory', async () => {
  const store = disk(), locks = webLocks();
  const gate = store.pause('directory', path => path.split('/').length === 2);
  const first = page(store, locks), opening = first.api.create('new');
  await gate.started;
  assert.equal(locks.held.size, 1);
  const other = page(store, locks);
  await tick();
  gate.release();
  const cache = await opening;
  await cache.write('survived concurrent startup');
  assert.equal(await text(await cache.finish()), 'survived concurrent startup');
  await cache.remove();
  await dispose(first, other);
  assert.equal(locks.held.size, 0);
});

test('startup holds a stale session lock until recursive deletion has finished', async () => {
  const store = disk(), locks = webLocks(), crashed = page(store, locks);
  const cache = await crashed.api.create('stale');
  await cache.write('stale'); await cache.finish();
  const oldLock = locks.events.find(event => event.owner === crashed.owner).name;
  await locks.crash(crashed.owner);
  const gate = store.pause('remove', path => path === oldLock);
  const cleaner = page(store, locks);
  await gate.started;
  assert.equal(locks.held.get(oldLock).owner, cleaner.owner);
  const other = page(store, locks);
  await tick();
  assert.equal(store.events.filter(event => event.op === 'remove' && event.path === oldLock).length, 1);
  gate.release(); await tick();
  assert.equal(store.nodes.size, 0);
  assert.equal(locks.held.has(oldLock), false);
  await dispose(cleaner, other);
});

test('queued writes and finish reject after a write failure and expose any cleanup failure', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const cache = await tab.api.create('failed-queue');
  const gate = store.pause('write');
  const first = assert.rejects(cache.write('first'), /disk I\/O.*delete denied/);
  await gate.started;
  const second = assert.rejects(cache.write('queued'), /disk I\/O.*delete denied/);
  const final = assert.rejects(cache.finish(), /disk I\/O.*delete denied/);
  store.setHook(op => { if (op === 'remove') throw Error('delete denied'); });
  gate.reject(Error('disk I/O'));
  await Promise.all([first, second, final]);
  assert.equal(store.events.filter(event => event.op === 'write').length, 1);
  assert.equal([...store.nodes.values()][0].writers.size, 0);
  store.setHook(() => {});
  await cache.remove();
  assert.equal(store.nodes.size, 0);
  await dispose(tab);
});

test('remove shares an in-flight operation, propagates deletion failure, and allows a later idempotent retry', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const cache = await tab.api.create('remove');
  await cache.write('partial');
  const gate = store.pause('remove', path => store.nodes.has(path));
  let deny = true;
  store.setHook((op, path) => {
    if (op === 'remove' && store.nodes.has(path) && deny) { deny = false; throw Error('delete denied'); }
  });
  await assert.rejects(cache.remove(), /delete denied/);
  assert.equal([...store.nodes.values()][0].writers.size, 0);
  const first = cache.remove(), second = cache.remove();
  await gate.started;
  gate.release();
  await Promise.all([first, second]);
  const removals = store.events.filter(event => event.op === 'remove' && !event.recursive).length;
  await cache.remove();
  assert.equal(store.events.filter(event => event.op === 'remove' && !event.recursive).length, removals);
  assert.equal(store.nodes.size, 0);
  await assert.rejects(cache.finish(), /删除|关闭|取消/);
  await dispose(tab);
});

test('remove cancels queued writes and waits for the one already writing before aborting', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const cache = await tab.api.create('cancel');
  const gate = store.pause('write');
  const first = cache.write('first');
  await gate.started;
  const queued = assert.rejects(cache.write('second'), /删除|关闭|取消/);
  const removed = cache.remove();
  await tick();
  assert.equal(store.events.some(event => event.op === 'abort'), false);
  gate.release();
  await Promise.all([first, queued, removed]);
  assert.equal(store.events.filter(event => event.op === 'write').length, 1);
  assert.equal(store.nodes.size, 0);
  await dispose(tab);
});

test('quota, write, close, and snapshot errors close resources and delete partial products', async () => {
  for (const op of ['file', 'open', 'write', 'close', 'snapshot']) {
    for (const error of [failure('QuotaExceededError'), Error(`${op} failed`)]) {
      const store = disk(), locks = webLocks(), tab = page(store, locks);
      let thrown = false;
      store.setHook(current => { if (current === op && !thrown) { thrown = true; throw error; } });
      let cache;
      await assert.rejects(async () => {
        cache = await tab.api.create('fail');
        await cache.write('bytes');
        await cache.finish();
      }, error.name === 'QuotaExceededError' ? /空间不足.*释放/ : /失败|failed/);
      assert.equal(store.nodes.size, 0, `${op} must not leave a partial file`);
      if (cache) await cache.remove();
      await dispose(tab);
      assert.equal(locks.held.size, 0, `${op} must release the session on pagehide`);
    }
  }
});

test('remove falls back to close after abort failure, and reports failure when neither can close', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const cache = await tab.api.create('abort');
  await cache.write('bytes');
  store.setHook(op => { if (op === 'abort') throw Error('abort denied'); });
  await cache.remove();
  assert.equal(store.nodes.size, 0);
  assert.ok(store.events.some(event => event.op === 'close'));
  const broken = await tab.api.create('broken');
  store.setHook(op => { if (op === 'abort' || op === 'close') throw Error('cannot close'); });
  await assert.rejects(broken.remove(), /cannot close/);
  assert.ok(store.events.some(event => event.op === 'remove' && !event.recursive));
  store.setHook(() => {});
  await broken.remove();
  await dispose(tab);
});

test('missing APIs produce Chinese guidance and failed initialization can retry without leaking a lock', async () => {
  for (const navigator of [{}, {storage: {}}, {storage: {getDirectory() {}}, locks: {}}]) {
    const store = disk(), locks = webLocks(), tab = page(store, locks, {navigator});
    await assert.rejects(tab.api.create('no-api'), /磁盘缓存.*(不支持|无法|不可用)/);
    await dispose(tab);
    assert.equal(locks.held.size, 0);
  }
  const store = disk(), locks = webLocks();
  locks.fail(Error('locks unavailable'));
  const tab = page(store, locks);
  await tick();
  assert.equal(locks.held.size, 0);
  store.setHook(op => { if (op === 'entries') throw Error('initialize failed'); });
  await assert.rejects(tab.api.create('retry'), /initialize failed/);
  assert.equal(locks.held.size, 0, 'initialization failure after acquisition must release its lock');
  store.setHook(() => {});
  const cache = await tab.api.create('ok');
  await cache.write('works');
  assert.equal(await text(await cache.finish()), 'works');
  await cache.remove();
  await dispose(tab);
  assert.equal(locks.held.size, 0);
});

test('pagehide during initialization or file opening cleans its directory and releases its lock', async () => {
  for (const op of ['root', 'entries', 'file', 'open']) {
    const store = disk(), locks = webLocks();
    const gate = store.pause(op);
    const tab = page(store, locks);
    const pending = assert.rejects(tab.api.create('leaving'), /关闭|退出|取消/);
    await gate.started;
    tab.hide();
    gate.release();
    await pending;
    await tick();
    assert.equal(store.nodes.size, 0, `${op}: no late-created file may survive pagehide`);
    assert.equal(locks.held.size, 0, `${op}: session lock must be released`);
    await assert.rejects(tab.api.create('too-late'), /关闭|退出|取消/);
  }
});

test('pagehide drains an active write and cleanup rejection stays handled for later startup recovery', async () => {
  const store = disk(), locks = webLocks(), tab = page(store, locks);
  const cache = await tab.api.create('leaving');
  const gate = store.pause('write');
  const written = cache.write('held write');
  await gate.started;
  tab.hide();
  await tick();
  assert.equal(locks.held.size, 1, 'the live writer must keep its lease until it settles');
  store.setHook(op => { if (op === 'remove') throw Error('cleanup denied'); });
  gate.release();
  await written; await tick();
  assert.equal(locks.held.size, 0, 'pagehide must release even when best-effort deletion fails');
  assert.equal(store.nodes.size, 1);
  store.setHook(() => {});
  const next = page(store, locks);
  await tick();
  assert.equal(store.nodes.size, 0);
  await dispose(next);
});
