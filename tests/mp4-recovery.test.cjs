const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {getEventListeners} = require('node:events');
const mp4 = require('../mp4-recovery.js');

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const full = (v = 0, flags = 0) => Buffer.from([v, flags >> 16, flags >> 8, flags]);
const join = parts => Buffer.concat(parts);
function box(type, ...parts) {
  const payload = join(parts);
  return join([u32(payload.length + 8), Buffer.from(type), payload]);
}
function extended(type, payload) { return join([u32(1), Buffer.from(type), u64(payload.length + 16), payload]); }
const ftyp = (brand = 'isom') => box('ftyp', Buffer.from(brand), u32(0), Buffer.from(brand));
function movieHeader({version = 0, duration = 8000, scale = 1000} = {}) {
  const b = Buffer.alloc(version ? 112 : 100); full(version).copy(b);
  b.writeUInt32BE(scale, version ? 20 : 12);
  if (version) b.writeBigUInt64BE(BigInt(duration), 24); else b.writeUInt32BE(duration, 16);
  b.writeUInt32BE(65536, version ? 32 : 20);
  b.writeUInt16BE(256, version ? 36 : 24);
  for (const [i, n] of [[0, 65536], [4, 65536], [8, 1073741824]]) b.writeUInt32BE(n, (version ? 48 : 36) + i * 4);
  b.writeUInt32BE(100, b.length - 4);
  return box('mvhd', b);
}
function trackHeader({id = 1, version = 0, duration = 8000, enabled = true, audio = false} = {}) {
  const b = Buffer.alloc(version ? 96 : 84); full(version, enabled ? 3 : 2).copy(b);
  b.writeUInt32BE(id, version ? 20 : 12);
  if (version) b.writeBigUInt64BE(BigInt(duration), 28); else b.writeUInt32BE(duration, 20);
  for (const [i, n] of [[0, 65536], [4, 65536], [8, 1073741824]]) b.writeUInt32BE(n, (version ? 52 : 40) + i * 4);
  if (audio) b.writeUInt16BE(256, version ? 48 : 36);
  else { b.writeUInt32BE(16 * 65536, b.length - 8); b.writeUInt32BE(16 * 65536, b.length - 4); }
  return box('tkhd', b);
}
function mediaHeader({version = 0, mediaDuration = 8000, mediaScale = 1000} = {}) {
  const b = Buffer.alloc(version ? 36 : 24); full(version).copy(b);
  b.writeUInt32BE(mediaScale, version ? 20 : 12);
  if (version) b.writeBigUInt64BE(BigInt(mediaDuration), 24); else b.writeUInt32BE(mediaDuration, 16);
  return box('mdhd', b);
}
const handler = name => box('hdlr', full(), u32(0), Buffer.from(name), Buffer.alloc(12));
function edit({version = 0, edits = [{duration: 8000, time: 0, rate: 1, fraction: 0}]} = {}) {
  return box('edts', box('elst', full(version), u32(edits.length), ...edits.map(e => {
    const time = Buffer.alloc(version ? 8 : 4);
    if (version) time.writeBigInt64BE(BigInt(e.time)); else time.writeInt32BE(e.time);
    const rate = Buffer.alloc(4); rate.writeInt16BE(e.rate); rate.writeInt16BE(e.fraction || 0, 2);
    return join([version ? u64(e.duration) : u32(e.duration), time, rate]);
  })));
}
function sampleEntry({audio = false, codec = audio ? 'mp4a' : 'avc1', audioVersion = 0, entryExtra = [], esds = Buffer.from([255, 0, 1])} = {}) {
  const b = Buffer.alloc(audio ? 28 : 78); b.writeUInt16BE(1, 6);
  if (audio) { b.writeUInt16BE(audioVersion, 8); b.writeUInt16BE(2, 16); b.writeUInt16BE(16, 18); b.writeUInt32BE(48000 * 65536, 24); }
  else { b.writeUInt16BE(16, 24); b.writeUInt16BE(16, 26); b.writeUInt32BE(72 * 65536, 28); b.writeUInt32BE(72 * 65536, 32); b.writeUInt16BE(1, 40); b.writeUInt16BE(24, 74); b.writeInt16BE(-1, 76); }
  return box(codec, b, audio ? box('esds', esds) : box('avcC', Buffer.from([1, 66, 0, 30, 255, 225, 0])), ...entryExtra);
}
function track(o = {}) {
  const audio = o.audio || false, count = o.samples || 1;
  const dataRef = o.external ? box('url ', full(), Buffer.from('https://invalid.example/media\0')) : box('url ', full(0, 1));
  const stsz = box('stsz', full(), u32(o.variable ? 0 : 4), u32(count), ...(o.variable ? Array.from({length: count}, () => u32(4)) : []));
  const tables = [
    box('stsd', full(), u32(1), sampleEntry(o)),
    box('stts', full(), u32(1), u32(count), u32((o.mediaDuration ?? 8000) / count)),
    box('stsc', full(), u32(1), u32(1), u32(count), u32(1)), stsz,
    box(o.co64 ? 'co64' : 'stco', full(), u32(1), o.co64 ? u64(o.offset || 0) : u32(o.offset || 0)),
    ...(o.tables || [])
  ];
  return box('trak', trackHeader(o), ...(o.edit ? [edit(o.edit)] : []), ...(o.trackExtra || []),
    box('mdia', mediaHeader(o), handler(o.handler || (audio ? 'soun' : 'vide')),
      box('minf', audio ? box('smhd', full(), Buffer.alloc(4)) : box('vmhd', full(0, 1), Buffer.alloc(8)),
        box('dinf', box('dref', full(), u32(1), dataRef)), box('stbl', ...tables))));
}
function fixture(o = {}) {
  const tracks = o.tracks || [{}, {audio: true, id: 2}];
  const media = box('mdat', Buffer.from(Array.from({length: o.payloadSize || 32}, (_, i) => i % 251)));
  const makeMoov = offset => box('moov', movieHeader(o), ...tracks.map(t => track({...t, offset: t.offset ?? offset})), ...(o.moovExtra || []));
  let moov = makeMoov(0);
  const offset = ftyp().length + (o.tail ? 0 : moov.length) + 8;
  moov = makeMoov(offset);
  const bytes = join(o.tail ? [ftyp(), media, moov] : [ftyp(), moov, media]);
  return {bytes, blob: new Blob([bytes], {type: 'video/mp4'})};
}
// Record every requested byte interval; never materialize the sparse file itself.
function observed(bytes, {size = bytes.length, regions = [], delay, failure, failureAt} = {}) {
  const reads = [];
  const blob = {
    size, type: 'video/mp4',
    slice(start, end) {
      reads.push([start, end]);
      return {async arrayBuffer() {
        if (delay) await delay();
        if (failure && (failureAt === undefined || reads.length === failureAt)) throw failure;
        const out = Buffer.alloc(end - start);
        for (const [at, data] of [[0, bytes], ...regions]) {
          const lo = Math.max(start, at), hi = Math.min(end, at + data.length);
          if (hi > lo) data.copy(out, lo - start, lo - at, hi - at);
        }
        return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
      }};
    }
  };
  return {blob, reads};
}
function locate(bytes, type) {
  const offsets = []; let at = 0;
  while ((at = bytes.indexOf(Buffer.from(type), at)) !== -1) { offsets.push(at); at += 4; }
  return offsets;
}
function changed(bytes, type, mutate, occurrence = 0) {
  const b = Buffer.from(bytes), at = locate(b, type)[occurrence]; assert.notEqual(at, undefined);
  mutate(b, at - 4); return new Blob([b]);
}
async function passthrough(blob, code) {
  const r = await mp4.prepare(blob);
  assert.equal(r.mode, 'original'); assert.equal(r.blob, blob);
  assert.equal(r.inspection.status, 'unsupported');
  if (code) assert.equal(r.inspection.code, code);
  return r.inspection;
}
async function rejected(blob, status = 'malformed') {
  const r = await mp4.prepare(blob); assert.equal(r.mode, 'reject'); assert.equal(r.blob, null);
  assert.equal(r.inspection.status, status); return r.inspection;
}

test('exact CommonJS and classic-script APIs and public schema, duration seconds', async () => {
  assert.deepEqual(Object.keys(mp4).sort(), ['inspect', 'prepare']); assert.equal(globalThis.PPTMP4, mp4);
  const context = vm.createContext({Blob, DOMException, Uint8Array, DataView});
  vm.runInContext(fs.readFileSync(require.resolve('../mp4-recovery.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.PPTMP4).sort(), ['inspect', 'prepare']);
  const r = await context.PPTMP4.inspect(fixture().blob);
  assert.deepEqual(Object.keys(r).sort(), ['code', 'format', 'inspectedBytes', 'movieDuration', 'movieTimescale', 'status', 'tracks', 'videoDuration']);
  assert.equal(r.status, 'eligible'); assert.equal(r.code, 'AUDIO_OMITTED'); assert.equal(r.format, 'mp4');
  assert.equal(r.movieDuration, 8); assert.equal(r.videoDuration, 8); assert.equal(r.movieTimescale, 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(r.tracks)), [{id: 1, handler: 'vide'}, {id: 2, handler: 'soun'}]);
  assert.ok(r.inspectedBytes > 0);
});

test('head/tail moov, avc1/avc3, multiple AAC tracks: only audio trak type bytes change', async () => {
  for (const tail of [false, true]) for (const co64 of [false, true]) {
    const {bytes, blob} = fixture({tail, tracks: [{codec: 'avc3', co64, tables: [box('ctts', full(1), u32(1), u32(1), u32(0)), box('stss', full(), u32(1), u32(1))]}, {audio: true, id: 2}, {audio: true, id: 3}]});
    const r = await mp4.prepare(blob); assert.equal(r.mode, 'audio-omitted');
    assert.deepEqual(Object.keys(r).sort(), ['blob', 'inspection', 'mode']);
    assert.equal(r.blob.size, blob.size); assert.equal(r.blob.type, blob.type);
    const patched = Buffer.from(await r.blob.arrayBuffer()), types = locate(bytes, 'trak').slice(1);
    const changes = [...bytes.keys()].filter(i => bytes[i] !== patched[i]);
    assert.ok(changes.length > 0); assert.ok(changes.every(i => types.some(at => i >= at && i < at + 4)));
    assert.equal(changes.length, types.length * 3); // trak/free both contain r at index 1.
    for (const at of types) assert.equal(patched.toString('ascii', at, at + 4), 'free');
    const restored = Buffer.from(patched); for (const at of types) Buffer.from('trak').copy(restored, at);
    assert.deepEqual(restored, bytes); // Includes all mdat, stco/co64, PTS/DTS, edits and duration bytes.
  }
});

test('video only returns the original Blob; opaque corrupt AAC esds remains eligible', async () => {
  const blob = fixture({tracks: [{}]}).blob, r = await mp4.prepare(blob);
  assert.equal(r.mode, 'original'); assert.equal(r.blob, blob); assert.equal(r.inspection.status, 'video-only'); assert.equal(r.inspection.code, 'NO_AUDIO');
  assert.equal((await mp4.inspect(fixture({tracks: [{}, {audio: true, id: 2, esds: Buffer.from('not a box sinf tenc')}]}).blob)).status, 'eligible');
});

test('v0/v1 timing and positive unit edits use presentation duration, preserving raw 8.1 seconds', async () => {
  for (const version of [0, 1]) {
    const {blob, bytes} = fixture({version, tracks: [{version, mediaDuration: 8100, edit: {version, edits: [{duration: 8000, time: 100, rate: 1}]}}, {audio: true, id: 2}]});
    const r = await mp4.prepare(blob); assert.equal(r.mode, 'audio-omitted');
    assert.equal(r.inspection.videoDuration, 8); assert.equal(r.inspection.movieDuration, 8);
    const patched = Buffer.from(await r.blob.arrayBuffer());
    for (const type of ['mvhd', 'tkhd', 'mdhd', 'elst', 'stts']) for (const at of locate(bytes, type)) {
      const length = bytes.readUInt32BE(at - 4); assert.deepEqual(patched.subarray(at - 4, at - 4 + length), bytes.subarray(at - 4, at - 4 + length));
    }
  }
});

test('missing index requires a complete recognized nonfragmented file and nonempty mdat', async () => {
  for (const bytes of [ftyp(), join([ftyp(), box('free', Buffer.alloc(3))]), join([ftyp(), box('skip')]), join([ftyp(), box('mdat')])]) await passthrough(new Blob([bytes]));
  const missing = new Blob([ftyp(), box('mdat', Buffer.from([1, 2, 3])), box('free')]);
  const r = await rejected(missing, 'missing-index'); assert.equal(r.code, 'MISSING_MOOV');
  await passthrough(new Blob([ftyp('zzzz'), box('mdat', Buffer.from([1]))]), 'OTHER_CONTAINER');
  for (const bytes of [Buffer.from('not an mp4'), join([ftyp('zzzz'), u32(200), Buffer.from('moov')])]) {
    const r = await passthrough(new Blob([bytes]), 'OTHER_CONTAINER'); assert.notEqual(r.format, 'mp4');
  }
});

test('supports extended headers, top-level size zero and multiple mdat without reading payload', async () => {
  const {bytes} = fixture({tail: true});
  const md = locate(bytes, 'mdat')[0] - 4, moov = locate(bytes, 'moov')[0] - 4;
  const base = join([bytes.subarray(0, md), extended('mdat', bytes.subarray(md + 8, moov)), bytes.subarray(moov)]);
  // Rebuild with extended mdat before moov; adjust the one retained chunk offset.
  const patched = Buffer.from(base); patched.writeUInt32BE(ftyp().length + 16, locate(patched, 'stco')[0] + 12);
  const extra = join([patched, box('mdat', Buffer.from([3, 4])), u32(0), Buffer.from('free'), Buffer.alloc(3)]);
  const watch = observed(extra); const r = await mp4.inspect(watch.blob); assert.equal(r.status, 'eligible');
  const payloads = [[ftyp().length + 16, moov + 8], [patched.length + 8, patched.length + 10]];
  assert.ok(watch.reads.every(([lo, hi]) => payloads.every(([a, b]) => hi <= a || lo >= b)));
  assert.equal(r.inspectedBytes, watch.reads.reduce((n, [a, b]) => n + b - a, 0));
  const zero = fixture().bytes; zero.writeUInt32BE(0, locate(zero, 'mdat')[0] - 4);
  assert.equal((await mp4.inspect(new Blob([zero]))).status, 'eligible');
});

test('4 GiB sparse extended mdat and co64 remain safe without giant allocation', async () => {
  const offset = 2 ** 32 + 100, prefix = join([ftyp(), u32(1), Buffer.from('mdat'), u64(offset - ftyp().length)]);
  const moov = box('moov', movieHeader(), track({offset: ftyp().length + 16, co64: true}), track({audio: true, id: 2, offset: ftyp().length + 20, co64: true}));
  const watch = observed(prefix, {size: offset + moov.length, regions: [[offset, moov]]});
  assert.equal((await mp4.inspect(watch.blob)).status, 'eligible');
  assert.ok(watch.reads.some(([a]) => a > 2 ** 32));
  assert.ok(watch.reads.every(([a, b]) => b <= prefix.length || a >= offset));
  assert.ok(watch.reads.every(([a, b]) => b - a <= 65536));
});

test('truncated, duplicate, nested zero and unsafe headers are confirmed malformed only for recognized MP4', async () => {
  const {bytes} = fixture();
  const bad = [
    new Blob([bytes.subarray(0, bytes.length - 1)]),
    new Blob([bytes, movieHeader()]),
    new Blob([bytes, bytes.subarray(locate(bytes, 'moov')[0] - 4, locate(bytes, 'mdat')[0] - 4)]),
    changed(bytes, 'tkhd', (b, at) => b.writeUInt32BE(0, at)),
    changed(bytes, 'stsd', (b, at) => b.writeUInt32BE(0xffffffff, at + 12)),
    changed(bytes, 'dref', (b, at) => b.writeUInt32BE(0xffffffff, at + 12)),
    changed(bytes, 'stts', (b, at) => b.writeUInt32BE(0xffffffff, at + 12)),
    changed(bytes, 'stco', (b, at) => b.writeUInt32BE(0, at + 16)),
    new Blob([ftyp(), u32(1), Buffer.from('mdat'), u64(2n ** 63n)]),
    new Blob([ftyp(), u32(12), Buffer.from('uuid'), Buffer.alloc(4)]),
    new Blob([ftyp(), u32(7), Buffer.from('free')]),
    new Blob([ftyp(), Buffer.from([0, 0, 0])])
  ];
  for (const blob of bad) assert.equal((await rejected(blob)).code, 'MALFORMED_BOX');
  const at = locate(bytes, 'tkhd')[0] - 4, end = at + bytes.readUInt32BE(at);
  const duplicated = join([bytes.subarray(0, end), bytes.subarray(at, end), bytes.subarray(end)]);
  for (const type of ['moov', 'trak']) duplicated.writeUInt32BE(duplicated.readUInt32BE(locate(duplicated, type)[0] - 4) + end - at, locate(duplicated, type)[0] - 4);
  await rejected(new Blob([duplicated]));
});

test('fragmentation, encryption, track dependencies, codecs, brands and unknown structures passthrough', async () => {
  for (const blob of [new Blob([ftyp(), box('moof')]), fixture({moovExtra: [box('mvex')]}).blob]) await passthrough(blob, 'FRAGMENTED_MP4');
  for (const type of ['pssh', 'senc', 'saiz', 'saio', 'sinf', 'tenc']) await passthrough(fixture({moovExtra: [box(type)]}).blob, 'ENCRYPTED');
  for (const type of ['tref', 'trgr', 'iods']) await passthrough(fixture({moovExtra: [box(type)]}).blob, 'TRACK_REFERENCES');
  await passthrough(fixture({tracks: [{}, {audio: true, id: 2, external: true}]}).blob, 'TRACK_REFERENCES');
  for (const tracks of [[{}, {audio: true, id: 2, codec: 'Opus'}], [{codec: 'hvc1'}, {audio: true, id: 2}], [{}, {audio: true, id: 2, audioVersion: 1}]]) await passthrough(fixture({tracks}).blob, 'UNSUPPORTED_CODEC');
  for (const codec of ['encv', 'enca']) await passthrough(fixture({tracks: [{}, {audio: true, id: 2, codec}]}).blob, 'ENCRYPTED');
  await passthrough(fixture({tracks: [{entryExtra: [box('sinf')]}, {audio: true, id: 2}]}).blob, 'ENCRYPTED');
  for (const tracks of [[{}, {id: 2}], [{}, {audio: true, id: 2, handler: 'text'}], [{enabled: false}, {audio: true, id: 2}]]) await passthrough(fixture({tracks}).blob, 'UNSUPPORTED_TRACKS');
  for (const extra of [box('zzzz'), box('uuid', Buffer.alloc(16)), extended('uuid', Buffer.alloc(16))]) await passthrough(fixture({moovExtra: [extra]}).blob);
  const {blob} = fixture({moovExtra: [box('free', Buffer.from('sinf')), box('skip'), box('udta', box('meta', full(), box('ilst', Buffer.from('opaque'))))]});
  assert.equal((await mp4.inspect(blob)).status, 'eligible');
  assert.equal((await mp4.inspect(new Blob([ftyp('zzzz'), ftyp().subarray(4)]))).code, 'OTHER_CONTAINER');
});

test('unsafe timelines never rewrite; raw timescale relations are exact', async () => {
  const blobs = [
    fixture({scale: 0}).blob, fixture({duration: 0}).blob, fixture({duration: 0xffffffff}).blob,
    fixture({version: 1, duration: 2n ** 64n - 1n}).blob,
    fixture({tracks: [{duration: 7999}, {audio: true, id: 2}]}).blob,
    fixture({tracks: [{mediaScale: 0}, {audio: true, id: 2}]}).blob,
    fixture({tracks: [{mediaDuration: 8100}, {audio: true, id: 2}]}).blob,
    ...[
      [{duration: 8000, time: -1, rate: 1}],
      [{duration: 4000, time: 0, rate: 1}, {duration: 4000, time: 4000, rate: 1}],
      [{duration: 8000, time: 0, rate: 0}], [{duration: 8000, time: 0, rate: 2}],
      [{duration: 8000, time: 0, rate: 1, fraction: 1}], [{duration: 7999, time: 0, rate: 1}],
      [{duration: 8000, time: 101, rate: 1}]
    ].map(edits => fixture({tracks: [{mediaDuration: 8100, edit: {edits}}, {audio: true, id: 2}]}).blob)
  ];
  for (const blob of blobs) await passthrough(blob, 'UNSUPPORTED_TIMELINE');
  const precise = fixture({scale: 3, duration: 1, tracks: [{duration: 1, mediaScale: 6, mediaDuration: 2}, {audio: true, id: 2}]});
  assert.equal((await mp4.inspect(precise.blob)).videoDuration, 1 / 3);
  await passthrough(fixture({scale: 3, duration: 1, tracks: [{duration: 1, mediaScale: 7, mediaDuration: 2}, {audio: true, id: 2}]}).blob, 'UNSUPPORTED_TIMELINE');
});

test('alternate groups block omission', async () => {
  for (const version of [0, 1]) {
    const bytes = fixture({tracks: [{version}, {audio: true, id: 2}]}).bytes;
    await passthrough(changed(bytes, 'tkhd', (b, at) => b.writeUInt16BE(1, at + (version ? 54 : 42))), 'TRACK_REFERENCES');
  }
});

test('truncated timing headers are malformed', async () => {
  const broken = box('moov', box('mvhd'), track(), track({audio: true, id: 2}));
  await rejected(new Blob([ftyp(), broken, box('mdat', Buffer.alloc(32))]));
});

test('recognized compatible brands and extended moov preserve offsets; unknown entry extensions block rewrite', async () => {
  const {bytes} = fixture({tail: true});
  const moovAt = locate(bytes, 'moov')[0] - 4;
  const moov = extended('moov', bytes.subarray(moovAt + 8));
  const blob = new Blob([bytes.subarray(0, moovAt), moov]);
  const r = await mp4.prepare(blob); assert.equal(r.mode, 'audio-omitted'); assert.equal(r.blob.size, blob.size);
  const brand = new Blob([box('ftyp', Buffer.from('zzzz'), u32(0), Buffer.from('isom')), bytes.subarray(ftyp().length)]);
  assert.equal((await mp4.inspect(brand)).status, 'eligible');
  await passthrough(fixture({tracks: [{entryExtra: [box('zzzz')]}, {audio: true, id: 2}]}).blob, 'UNSUPPORTED_CODEC');
  const childZero = changed(fixture().bytes, 'avcC', (b, at) => b.writeUInt32BE(0, at));
  await rejected(childZero);
  const beyondSafe = changed(fixture({tracks: [{co64: true}, {audio: true, id: 2}]}).bytes, 'co64', (b, at) => b.writeBigUInt64BE(2n ** 53n, at + 16));
  await rejected(beyondSafe);
});

test('invalid track IDs and sample table shapes cannot be partially rewritten', async () => {
  for (const tracks of [[{id: 0}, {audio: true, id: 2}], [{}, {audio: true, id: 1}]]) await rejected(fixture({tracks}).blob);
  for (const [type, offset, value] of [['stsc', 16, 2], ['stsc', 24, 2], ['stsz', 16, 2], ['stts', 16, 0], ['stts', 20, 0]]) {
    await rejected(changed(fixture().bytes, type, (b, at) => b.writeUInt32BE(value, at + offset)));
  }
  const missing = changed(fixture().bytes, 'stts', (b, at) => Buffer.from('free').copy(b, at + 4));
  await rejected(missing);
});

test('read size budget chunks a real large valid table and never reads mdat payload', async () => {
  const {bytes} = fixture({payloadSize: 80000, tracks: [{samples: 20000, variable: true, mediaDuration: 80000, duration: 8000, mediaScale: 10000}, {audio: true, id: 2}]});
  const watch = observed(bytes), r = await mp4.inspect(watch.blob);
  assert.equal(r.status, 'eligible'); assert.ok(watch.reads.some(([a, b]) => b - a === 65536));
  assert.ok(watch.reads.every(([a, b]) => b - a <= 65536));
  const payload = locate(bytes, 'mdat')[0] + 4;
  assert.ok(watch.reads.every(([, b]) => b <= payload));
});

test('cumulative byte budget is reached by sparse metadata, options cannot raise it', async () => {
  const boundary = 16777216, allowed = observed(join([u32(boundary), Buffer.from('ftypisom'), u32(0)]), {size: boundary});
  const control = await mp4.inspect(allowed.blob);
  assert.notEqual(control.code, 'LIMIT_EXCEEDED'); assert.equal(control.inspectedBytes, boundary);
  const size = 18 * 1024 * 1024, prefix = join([u32(size), Buffer.from('ftypisom'), u32(0)]);
  const watch = observed(prefix, {size}), r = await mp4.inspect(watch.blob, {maxBytes: Infinity});
  assert.equal(r.status, 'unsupported'); assert.equal(r.code, 'LIMIT_EXCEEDED');
  const total = watch.reads.reduce((n, [a, b]) => n + b - a, 0);
  assert.ok(total > 16 * 1024 * 1024 - 65536); assert.ok(total <= 16777216);
  assert.equal(r.inspectedBytes, total); assert.ok(watch.reads.every(([a, b]) => b - a <= 65536));
});

test('box budget has a positive boundary control and refuses the next actual box', async () => {
  const shell = n => new Blob([ftyp(), Buffer.concat(Array.from({length: n}, () => box('free')))]);
  const allowed = await mp4.inspect(shell(49999)); assert.notEqual(allowed.code, 'LIMIT_EXCEEDED');
  const bytes = Buffer.from(await shell(50000).arrayBuffer()), watch = observed(bytes);
  const r = await mp4.inspect(watch.blob); assert.equal(r.code, 'LIMIT_EXCEEDED');
  assert.equal(r.status, 'unsupported'); assert.ok(watch.reads.length >= 50000);
  assert.ok(watch.reads.every(([a]) => a < bytes.length - 8));
});

test('depth budget and 32-track budget each have meaningful positive controls', async () => {
  const nested = depth => { let b = box('free'); for (let n = 1; n < depth; n++) b = box('udta', b); return new Blob([ftyp(), b]); };
  assert.notEqual((await mp4.inspect(nested(8))).code, 'LIMIT_EXCEEDED');
  assert.equal((await mp4.inspect(nested(9))).code, 'LIMIT_EXCEEDED');
  let empty = box('udta'); for (let n = 1; n < 8; n++) empty = box('udta', empty);
  assert.notEqual((await mp4.inspect(new Blob([ftyp(), empty]))).code, 'LIMIT_EXCEEDED');
  const tracks = Array.from({length: 32}, (_, i) => ({audio: i > 0, id: i + 1}));
  assert.equal((await mp4.inspect(fixture({tracks}).blob)).status, 'eligible');
  assert.equal((await mp4.inspect(fixture({tracks: [...tracks, {audio: true, id: 33}]}).blob)).code, 'LIMIT_EXCEEDED');
});

test('pre-abort does not read, and abort settles immediately with no late continuation or listeners', async () => {
  for (const method of ['inspect', 'prepare']) {
    const early = new AbortController(); early.abort(); const watch = observed(fixture().bytes);
    await assert.rejects(mp4[method](watch.blob, {signal: early.signal}), {name: 'AbortError'}); assert.equal(watch.reads.length, 0);
    for (const failLate of [false, true]) {
      let release; const gate = new Promise(resolve => { release = resolve; });
      const late = observed(fixture().bytes, {delay: () => gate, failure: failLate ? new Error('late read') : null});
      const controller = new AbortController(); const pending = mp4[method](late.blob, {signal: controller.signal});
      controller.abort(); let timer;
      try {
        await assert.rejects(Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('abort did not settle')), 500); })]), {name: 'AbortError'});
        assert.equal(getEventListeners(controller.signal, 'abort').length, 0); const count = late.reads.length;
        release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(late.reads.length, count);
      } finally { clearTimeout(timer); release(); }
    }
  }
});

test('true read failures preserve code, phase and cause for both APIs; listeners cleaned on success/failure', async () => {
  for (const method of ['inspect', 'prepare']) {
    const cause = new Error('local disk unavailable'), controller = new AbortController();
    for (const failureAt of [1, 4, 10]) {
      const watch = observed(fixture().bytes, {failure: cause, failureAt});
      await assert.rejects(mp4[method](watch.blob, {signal: controller.signal}), e => e.code === 'LOCAL_READ_FAILED' && e.phase === 'local-read' && e.cause === cause);
      assert.equal(watch.reads.length, failureAt); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    }
    await mp4[method](fixture().blob, {signal: controller.signal}); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    const synchronous = {size: 100, slice() { throw cause; }};
    await assert.rejects(mp4[method](synchronous), e => e.cause === cause && e.code === 'LOCAL_READ_FAILED' && e.phase === 'local-read');
  }
});
