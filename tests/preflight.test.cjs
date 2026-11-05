const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const {getEventListeners} = require('node:events');
const preflight = require('../preflight.js');

const MP4 = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 0, 0, ...Buffer.from('isommp42')]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, ...Buffer.from('webm')]);
const HLS = '\ufeff#EXTM3U\r\n#EXT-X-TARGETDURATION:6\r\n#EXTINF:6,\r\nsegment.ts\r\n';
const HTML = '<!DOCTYPE html><html><body><form>请登录</form></body></html>';
const JSON_BODY = '{"message":"需要登录","data":null}';
const UNKNOWN = Buffer.from([0xff, 0x00, 0xfe, 0x11, 0x22]);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
async function deadline(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('本地连接未及时关闭')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
async function server(t, handler) {
  const instance = http.createServer(handler);
  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    instance.closeAllConnections();
    await new Promise(resolve => instance.close(resolve));
  });
  return `http://127.0.0.1:${instance.address().port}`;
}
function check(result, status, kind = null) {
  assert.deepEqual(Object.keys(result).sort(), ['kind', 'reason', 'status']);
  assert.equal(result.status, status);
  assert.equal(result.kind, kind);
  assert.match(result.reason, /[\u4e00-\u9fff]/);
}
function browserModule(observed = {}) {
  const timers = new Set();
  const context = vm.createContext({
    fetch, AbortController, DOMException,
    Uint8Array: class extends Uint8Array {
      constructor(...args) {
        super(...args);
        if (typeof args[0] === 'number') (observed.allocations ||= []).push(this.byteLength);
      }
    },
    TextDecoder: class extends TextDecoder {
      decode(bytes, options) {
        (observed.decoded ||= []).push(bytes.byteLength);
        return super.decode(bytes, options);
      }
    },
    setTimeout(fn, ms) {
      const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../preflight.js'), 'utf8'), context);
  return {api: context.PPTPreflight, timers};
}

test('exports PPTPreflight for CommonJS and classic browser scripts', async t => {
  assert.equal(globalThis.PPTPreflight, preflight);
  assert.deepEqual(Object.keys(preflight), ['probe']);
  const {api, timers} = browserModule();
  const base = await server(t, (_, res) => res.end(MP4));
  check(await api.probe(base), 'valid', 'mp4');
  assert.equal(timers.size, 0);
});

test('uses real Range GET headers, included credentials, and byte signatures', async t => {
  const fixtures = {
    '/video.mp4': {body: MP4, type: 'application/octet-stream', status: 206, kind: 'mp4'},
    '/download': {body: WEBM, type: 'application/octet-stream', kind: 'webm'},
    '/playlist': {body: HLS, type: 'application/vnd.apple.mpegurl', kind: 'm3u8'},
    '/hls-as-binary': {body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nchild.m3u8\n', type: 'application/octet-stream', kind: 'm3u8'}
  };
  const requests = [], options = [];
  const base = await server(t, (req, res) => {
    requests.push({path: req.url, method: req.method, range: req.headers.range});
    const fixture = fixtures[req.url], bytes = Buffer.from(fixture.body);
    res.writeHead(fixture.status || 200, {
      'Content-Type': fixture.type,
      'Content-Length': bytes.length,
      ...(fixture.status === 206 ? {'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`} : {})
    });
    res.end(bytes);
  });
  for (const [path, fixture] of Object.entries(fixtures)) {
    await t.test(path, async () => {
      check(await preflight.probe(base + path, {fetchImpl: (url, init) => {
        options.push(init);
        return fetch(url, init);
      }}), 'valid', fixture.kind);
    });
  }
  assert.equal(requests.length, 4);
  assert.ok(requests.every(req => req.method === 'GET' && req.range === 'bytes=0-65535'));
  assert.ok(options.every(init => init.credentials === 'include' && init.signal instanceof AbortSignal));
});

test('rejects explicit HTML/JSON despite video MIME or filenames; unsupported bytes stay unknown', async t => {
  const fixtures = [
    {body: HTML, type: 'text/html', status: 'invalid'},
    {body: '\ufeff \n<HTML><HEAD><title>登录</title></HEAD></HTML>', type: 'video/mp4', status: 'invalid'},
    {body: '<form action="/login"><input name="user"></form>', type: 'video/webm', status: 'invalid'},
    {body: JSON_BODY, type: 'application/json', status: 'invalid'},
    {body: ' \n' + JSON_BODY, type: 'video/mp4', status: 'invalid'},
    {body: '[{"error":"login"}]', type: 'video/webm', status: 'invalid'},
    {body: '{"message":"' + '登录'.repeat(40000), type: 'video/mp4', status: 'invalid'},
    {body: UNKNOWN, type: 'video/mp4', status: 'unknown'},
    {body: UNKNOWN, type: 'application/octet-stream', status: 'unknown'},
    {body: '', type: 'video/mp4', status: 'unknown'},
    {body: '#EXTM3U-not-a-playlist', type: 'application/vnd.apple.mpegurl', status: 'unknown'},
    {body: '<MPD><Period/></MPD>', type: 'application/dash+xml', status: 'unknown'}
  ];
  const base = await server(t, (req, res) => {
    const fixture = fixtures[Number(req.url.slice(1).split('.')[0])];
    res.writeHead(200, {'Content-Type': fixture.type});
    res.end(fixture.body);
  });
  for (const [i, fixture] of fixtures.entries()) {
    await t.test(`${i}: ${fixture.type} -> ${fixture.status}`, async () => {
      check(await preflight.probe(`${base}/${i}.mp4`), fixture.status);
    });
  }
});

test('follows a local redirect to a login page without accepting its video MIME', async t => {
  const seen = [];
  const base = await server(t, (req, res) => {
    seen.push(req.url);
    if (req.url === '/video.mp4') { res.writeHead(302, {Location: '/login'}); res.end(); }
    else { res.writeHead(200, {'Content-Type': 'video/mp4'}); res.end(HTML); }
  });
  check(await preflight.probe(base + '/video.mp4'), 'invalid');
  assert.deepEqual(seen, ['/video.mp4', '/login']);
});

test('distinguishes absent media from authorization, range, rate, and server failures', async t => {
  const base = await server(t, (req, res) => {
    res.writeHead(Number(req.url.slice(1)), {'Content-Type': 'video/mp4'});
    res.end(MP4);
  });
  for (const status of [401, 403, 404, 410, 416, 429, 500, 503, 204]) {
    await t.test(String(status), async () => {
      check(await preflight.probe(`${base}/${status}`), [404, 410].includes(status) ? 'invalid' : 'unknown');
    });
  }
});

test('socket failures remain unknown and do not expose raw network errors', async t => {
  const base = await server(t, (req) => req.socket.destroy());
  const result = await preflight.probe(base);
  check(result, 'unknown');
  assert.doesNotMatch(result.reason, /fetch failed|ECONN|TypeError|undici/);
});

test('bounds retained/inspected bytes and closes finite or infinite ignored-Range bodies', async t => {
  for (const infinite of [false, true]) {
    await t.test(infinite ? 'infinite' : 'large finite', async t => {
      const closed = deferred(), observed = {};
      let sent = 0, range;
      const fullSize = 16 * 1024 * 1024;
      const base = await server(t, (req, res) => {
        range = req.headers.range;
        res.writeHead(200, {'Content-Type': 'video/mp4', ...(!infinite ? {'Content-Length': fullSize} : {})});
        const timer = setInterval(() => {
          res.write(Buffer.alloc(32768, 0x20));
          sent += 32768;
          if (!infinite && sent >= fullSize) { clearInterval(timer); res.end(); }
        }, 2);
        res.once('close', () => { clearInterval(timer); closed.resolve(sent); });
      });
      const {api, timers} = browserModule(observed);
      check(await api.probe(base), 'unknown');
      const bytesSent = await deadline(closed.promise);
      assert.equal(range, 'bytes=0-65535');
      assert.ok(bytesSent >= 65536 && bytesSent < fullSize, `server wrote ${bytesSent} bytes`);
      assert.ok(observed.allocations.length > 0 && observed.allocations.every(size => size <= 65536));
      assert.ok(observed.decoded.length > 0 && observed.decoded.every(size => size <= 65536));
      assert.equal(Math.max(...observed.decoded), 65536);
      assert.equal(timers.size, 0);
    });
  }
});

test('clips oversized HTTP chunks to a smaller budget and the absolute 65536-byte cap', async t => {
  const observed = {}, {api} = browserModule(observed);
  const base = await server(t, (req, res) => {
    assert.equal(req.headers.range, 'bytes=0-65535');
    res.end(' '.repeat(Number(req.url.slice(1))) + HTML);
  });
  check(await api.probe(base + '/32', {maxBytes: 16}), 'unknown');
  assert.ok(observed.decoded.every(size => size <= 16));
  check(await api.probe(base + '/32'), 'invalid');
  observed.allocations = []; observed.decoded = [];
  check(await api.probe(base + '/65536', {maxBytes: 1024 * 1024}), 'unknown');
  assert.ok(observed.allocations.every(size => size <= 65536));
  assert.equal(Math.max(...observed.decoded), 65536);
});

test('timeout before headers or during a stalled body is unknown and closes the request', async t => {
  for (const bodyStarted of [false, true]) {
    await t.test(bodyStarted ? 'stalled body' : 'no headers', async t => {
      const closed = deferred(), controller = new AbortController();
      const base = await server(t, (_, res) => {
        res.once('close', closed.resolve);
        if (bodyStarted) { res.writeHead(200); res.write(UNKNOWN); }
      });
      const {api, timers} = browserModule();
      const result = await api.probe(base, {signal: controller.signal, timeoutMs: 80});
      check(result, 'unknown');
      assert.match(result.reason, /超时/);
      await deadline(closed.promise);
      assert.equal(timers.size, 0);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    });
  }
});

test('external abort rejects AbortError before fetch and while waiting for headers', async t => {
  const controller = new AbortController();
  controller.abort(new Error('private caller details'));
  let calls = 0;
  await assert.rejects(preflight.probe('http://127.0.0.1/', {
    signal: controller.signal,
    fetchImpl: () => { calls++; throw Error('must not fetch'); }
  }), {name: 'AbortError'});
  assert.equal(calls, 0);

  const started = deferred(), closed = deferred(), active = new AbortController();
  const base = await server(t, (_, res) => { res.once('close', closed.resolve); started.resolve(); });
  const {api, timers} = browserModule();
  const pending = api.probe(base, {signal: active.signal});
  const rejected = assert.rejects(pending, error => error.name === 'AbortError' && /[\u4e00-\u9fff]/.test(error.message));
  await deadline(started.promise);
  active.abort(new Error('private caller details'));
  await rejected;
  await deadline(closed.promise);
  assert.equal(timers.size, 0);
  assert.equal(getEventListeners(active.signal, 'abort').length, 0);
});

test('abort during a real pending read cancels reader/controller and prevents a next request', async t => {
  const reading = deferred(), closed = deferred(), controller = new AbortController();
  let calls = 0, reads = 0, cancels = 0, released = 0, internalSignal;
  const base = await server(t, (_, res) => {
    res.once('close', closed.resolve);
    res.writeHead(200); res.write(UNKNOWN);
  });
  const {api, timers} = browserModule();
  const fetchImpl = async (url, init) => {
    calls++; internalSignal = init.signal;
    const response = await fetch(url, init);
    return {
      ok: response.ok, status: response.status, headers: response.headers,
      body: {getReader() {
        const reader = response.body.getReader();
        return {
          read() { if (++reads === 2) reading.resolve(); return reader.read(); },
          cancel() { cancels++; return reader.cancel(); },
          releaseLock() { released++; reader.releaseLock(); }
        };
      }}
    };
  };
  const pending = api.probe(base, {signal: controller.signal, fetchImpl});
  const rejected = assert.rejects(pending, {name: 'AbortError'});
  await deadline(reading.promise);
  controller.abort();
  await rejected;
  await deadline(closed.promise);
  assert.equal(internalSignal.aborted, true);
  assert.equal(cancels, 1);
  assert.equal(released, 1);
  assert.equal(timers.size, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await assert.rejects(api.probe(base, {signal: controller.signal, fetchImpl}), {name: 'AbortError'});
  assert.equal(calls, 1);
  assert.equal(reads, 2);
});

test('successful and invalid probes remove the external listener and timeout', async t => {
  const base = await server(t, (req, res) => {
    res.end(req.url === '/good' ? MP4 : HTML);
  });
  const {api, timers} = browserModule();
  for (const path of ['/good', '/bad']) {
    const controller = new AbortController();
    const result = await api.probe(base + path, {signal: controller.signal});
    assert.equal(result.status, path === '/good' ? 'valid' : 'invalid');
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(timers.size, 0);
    controller.abort();
  }
});
