/* Bounded ISO BMFF inspection; audio omission never relocates media bytes. */
(function (root) {
  'use strict';
  const READ_LIMIT = 65536, BYTE_LIMIT = 16777216, BOX_LIMIT = 50000, DEPTH_LIMIT = 8, TRACK_LIMIT = 32;
  const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
  const BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4A ', 'dash']);
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts', 'udta', 'meta', 'stsd', 'dref']);
  const ENCRYPTION = new Set(['encv', 'enca', 'sinf', 'tenc', 'pssh', 'senc', 'saiz', 'saio']);
  const REFERENCES = new Set(['tref', 'trgr', 'iods']);
  const text = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const abortError = () => new DOMException('MP4 inspection cancelled', 'AbortError');
  const stop = (code, status = 'unsupported') => { throw Object.assign(new Error(code), {code, status}); };
  const malformed = () => stop('MALFORMED_BOX', 'malformed');
  const timeline = () => stop('UNSUPPORTED_TIMELINE');
  const checkSignal = signal => { if (signal?.aborted) throw abortError(); };
  const safe = n => { if (n > MAX_SAFE) malformed(); return Number(n); };

  function reader(blob, signal, state) {
    return async (start, length) => {
      checkSignal(signal);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start > blob.size - length) malformed();
      if (length > BYTE_LIMIT) stop('LIMIT_EXCEEDED');
      const chunks = [];
      for (let at = start; at < start + length;) {
        checkSignal(signal);
        const count = Math.min(READ_LIMIT, start + length - at);
        if (state.inspectedBytes + count > BYTE_LIMIT) stop('LIMIT_EXCEEDED');
        state.inspectedBytes += count;
        const bytes = await new Promise((resolve, reject) => {
          const cleanup = () => signal?.removeEventListener('abort', onAbort);
          const onAbort = () => { cleanup(); reject(abortError()); };
          signal?.addEventListener('abort', onAbort, {once: true});
          const failed = cause => {
            cleanup();
            reject(signal?.aborted ? abortError() : Object.assign(new Error('Unable to read local MP4 bytes', {cause}), {code: 'LOCAL_READ_FAILED', phase: 'local-read'}));
          };
          try {
            checkSignal(signal);
            Promise.resolve(blob.slice(at, at + count).arrayBuffer()).then(buffer => {
              cleanup();
              if (signal?.aborted) { reject(abortError()); return; }
              try { resolve(new Uint8Array(buffer)); } catch (cause) { failed(cause); }
            }, failed);
          } catch (cause) { failed(cause); }
        });
        checkSignal(signal);
        if (bytes.length !== count) malformed();
        chunks.push(bytes); at += count;
      }
      if (chunks.length === 1) return chunks[0];
      const result = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    };
  }

  async function analyze(blob, signal) {
    checkSignal(signal);
    const result = {format: 'unknown', status: 'unsupported', code: 'OTHER_CONTAINER', tracks: [], movieDuration: null, videoDuration: null, movieTimescale: null, inspectedBytes: 0};
    const state = {boxes: 0, tracks: 0, flags: new Set(), recognized: false, inspectedBytes: 0};
    const read = reader(blob, signal, state), patches = [];
    const data = node => read(node.payload, node.end - node.payload);
    function flags(type) {
      if (type === 'moof' || type === 'mvex') state.flags.add('FRAGMENTED_MP4');
      if (ENCRYPTION.has(type)) state.flags.add('ENCRYPTED');
      if (REFERENCES.has(type)) state.flags.add('TRACK_REFERENCES');
      if (type === 'uuid') state.flags.add('UNSUPPORTED_TRACKS');
    }
    function checkFlags() {
      for (const code of ['FRAGMENTED_MP4', 'ENCRYPTED', 'TRACK_REFERENCES', 'UNSUPPORTED_TRACKS']) if (state.flags.has(code)) stop(code);
    }
    async function brands(node) {
      if (node.end - node.payload < 8) malformed();
      const first = await read(node.payload, 8);
      if (BRANDS.has(text(first, 0))) state.recognized = true;
      if ((node.end - node.payload) % 4) malformed();
      for (let at = node.payload + 8; at < node.end;) {
        const bytes = await read(at, Math.min(READ_LIMIT, node.end - at));
        for (let i = 0; i < bytes.length; i += 4) if (BRANDS.has(text(bytes, i))) state.recognized = true;
        at += bytes.length;
      }
    }
    async function scan(start, end, depth, top = false) {
      if (start < end && depth > DEPTH_LIMIT) stop('LIMIT_EXCEEDED');
      const nodes = [];
      for (let at = start; at < end;) {
        if (state.boxes >= BOX_LIMIT) stop('LIMIT_EXCEEDED');
        if (end - at < 8) malformed();
        const h = await read(at, 8), v = view(h), type = text(h, 4);
        let size = v.getUint32(0), header = 8;
        if (size === 1) {
          if (end - at < 16) malformed();
          size = safe(view(await read(at + 8, 8)).getBigUint64(0)); header = 16;
        } else if (size === 0) {
          if (!top) malformed();
          size = end - at;
        }
        if (type === 'uuid') header += 16;
        if (size < header || size > end - at || !Number.isSafeInteger(at + size)) malformed();
        if (type === 'uuid') await read(at + header - 16, 16);
        state.boxes++; flags(type);
        if (type === 'trak' && ++state.tracks > TRACK_LIMIT) stop('LIMIT_EXCEEDED');
        const node = {type, start: at, payload: at + header, end: at + size, depth, children: []};
        if (type === 'ftyp' && top) await brands(node);
        if (CONTAINERS.has(type)) {
          let prefix = 0, count = null;
          if (type === 'meta') prefix = 4;
          if (type === 'stsd' || type === 'dref') prefix = 8;
          if (node.end - node.payload < prefix) malformed();
          if (prefix) {
            const b = await read(node.payload, prefix);
            if (view(b).getUint32(0) !== 0) stop('UNSUPPORTED_TRACKS');
            if (prefix === 8) count = view(b).getUint32(4);
          }
          node.children = await scan(node.payload + prefix, node.end, depth + 1);
          if (count !== null && count !== node.children.length) malformed();
        }
        nodes.push(node); at = node.end;
      }
      return nodes;
    }
    const children = (node, allowed) => {
      for (const child of node.children) if (!allowed.includes(child.type) && child.type !== 'free' && child.type !== 'skip') stop('UNSUPPORTED_TRACKS');
    };
    const one = (node, type, required = true) => {
      const matches = node.children.filter(n => n.type === type);
      if (matches.length > 1 || (required && matches.length !== 1)) malformed();
      return matches[0];
    };
    async function duration(node, kind) {
      const b = await data(node), v = view(b), version = b[0];
      if (b.length < 4) malformed();
      if (version !== 0 && version !== 1) timeline();
      const length = kind === 'tkhd' ? (version ? 96 : 84) : kind === 'mvhd' ? (version ? 112 : 100) : (version ? 36 : 24);
      if (b.length !== length) malformed();
      const scaleAt = version ? 20 : 12;
      const durationAt = kind === 'tkhd' ? (version ? 28 : 20) : (version ? 24 : 16);
      const ticks = version ? v.getBigUint64(durationAt) : BigInt(v.getUint32(durationAt));
      const sentinel = version ? 0xffffffffffffffffn : 0xffffffffn;
      if (ticks === sentinel || ticks === 0n || ticks > MAX_SAFE) timeline();
      if (kind === 'tkhd') {
        const id = v.getUint32(version ? 20 : 12);
        if (!id) malformed();
        if (v.getUint16(version ? 46 : 34) !== 0) stop('TRACK_REFERENCES');
        return {ticks, id, enabled: !!(b[3] & 1)};
      }
      const scale = v.getUint32(scaleAt);
      if (!scale) timeline();
      return {ticks, scale};
    }
    async function edits(node, tkhd, mdhd, movie) {
      if (!node) {
        if (mdhd.ticks * BigInt(movie.scale) !== tkhd.ticks * BigInt(mdhd.scale)) timeline();
        return;
      }
      children(node, ['elst']);
      const b = await data(one(node, 'elst')), v = view(b), version = b[0];
      if (b.length < 8) malformed();
      if (version !== 0 && version !== 1) timeline();
      const width = version ? 20 : 12, count = v.getUint32(4);
      if (b.length - 8 !== count * width) malformed();
      if (count !== 1) timeline();
      const segment = version ? v.getBigUint64(8) : BigInt(v.getUint32(8));
      const time = version ? v.getBigInt64(16) : BigInt(v.getInt32(12));
      if (segment !== tkhd.ticks || time < 0n || v.getInt16(8 + width - 4) !== 1 || v.getInt16(8 + width - 2) !== 0) timeline();
      if (time * BigInt(movie.scale) + segment * BigInt(mdhd.scale) > mdhd.ticks * BigInt(movie.scale)) timeline();
    }
    function table(bytes, width, prefix = 8) {
      if (bytes.length < prefix || view(bytes).getUint32(0) !== 0) malformed();
      const count = view(bytes).getUint32(prefix - 4);
      if (bytes.length - prefix !== count * width) malformed();
      return {v: view(bytes), count};
    }
    async function sampleTables(stbl, mdhd, mdats, video) {
      children(stbl, ['stsd', 'stts', 'ctts', 'stss', 'stsc', 'stsz', 'stco', 'co64']);
      const sizes = await data(one(stbl, 'stsz'));
      if (sizes.length < 12 || view(sizes).getUint32(0) !== 0) malformed();
      const sv = view(sizes), fixed = sv.getUint32(4), count = sv.getUint32(8);
      if (!count || sizes.length !== 12 + (fixed ? 0 : count * 4)) malformed();
      const sampleSize = i => fixed || sv.getUint32(12 + i * 4);
      const times = table(await data(one(stbl, 'stts')), 8);
      let samples = 0n, ticks = 0n;
      for (let i = 0; i < times.count; i++) {
        const n = times.v.getUint32(8 + i * 8), delta = times.v.getUint32(12 + i * 8);
        if (!n || !delta) malformed();
        samples += BigInt(n); ticks += BigInt(n) * BigInt(delta);
      }
      if (samples !== BigInt(count)) malformed();
      if (video && ticks !== mdhd.ticks) timeline();
      const ctts = one(stbl, 'ctts', false);
      if (ctts) {
        const b = await data(ctts);
        if (b.length < 8) malformed();
        if (b[0] > 1 || b[1] || b[2] || b[3]) timeline();
        const v = view(b), n = v.getUint32(4);
        if (b.length !== 8 + n * 8) malformed();
        let sum = 0n;
        for (let i = 0; i < n; i++) { const value = v.getUint32(8 + i * 8); if (!value) malformed(); sum += BigInt(value); }
        if (sum !== BigInt(count)) malformed();
      }
      const stss = one(stbl, 'stss', false);
      if (stss) {
        const t = table(await data(stss), 4); let previous = 0;
        for (let i = 0; i < t.count; i++) { const n = t.v.getUint32(8 + i * 4); if (n <= previous || n > count) malformed(); previous = n; }
      }
      const stco = one(stbl, 'stco', false), co64 = one(stbl, 'co64', false);
      if (!!stco === !!co64) malformed();
      const offsets = table(await data(stco || co64), co64 ? 8 : 4);
      const chunks = table(await data(one(stbl, 'stsc')), 12);
      if (!offsets.count || !chunks.count) malformed();
      let previous = 0;
      for (let i = 0; i < chunks.count; i++) {
        const first = chunks.v.getUint32(8 + i * 12), n = chunks.v.getUint32(12 + i * 12), description = chunks.v.getUint32(16 + i * 12);
        if ((i === 0 && first !== 1) || first <= previous || first > offsets.count || !n || description !== 1) malformed();
        previous = first;
      }
      let sample = 0, entry = 0;
      for (let i = 0; i < offsets.count; i++) {
        if (entry + 1 < chunks.count && i + 1 === chunks.v.getUint32(8 + (entry + 1) * 12)) entry++;
        const n = chunks.v.getUint32(12 + entry * 12);
        if (n > count - sample) malformed();
        let length = 0n;
        if (fixed) { length = BigInt(n) * BigInt(fixed); sample += n; }
        else for (let j = 0; j < n; j++) { const size = sampleSize(sample++); if (!size) malformed(); length += BigInt(size); }
        const offset = co64 ? offsets.v.getBigUint64(8 + i * 8) : BigInt(offsets.v.getUint32(8 + i * 4));
        if (offset > MAX_SAFE || offset + length > MAX_SAFE) malformed();
        if (video && !mdats.some(m => offset >= BigInt(m.payload) && offset + length <= BigInt(m.end))) malformed();
      }
      if (sample !== count) malformed();
    }
    async function sampleDescription(stbl, dinf, video) {
      children(dinf, ['dref']);
      const references = one(dinf, 'dref');
      if (references.children.length !== 1) stop('TRACK_REFERENCES');
      const ref = references.children[0], refData = await data(ref);
      if (ref.type !== 'url ' || refData.length !== 4 || view(refData).getUint32(0) !== 1) stop('TRACK_REFERENCES');
      const stsd = one(stbl, 'stsd');
      if (stsd.children.length !== 1) stop('UNSUPPORTED_CODEC');
      const entry = stsd.children[0];
      if (ENCRYPTION.has(entry.type)) stop('ENCRYPTED');
      if (video ? !['avc1', 'avc3'].includes(entry.type) : entry.type !== 'mp4a') stop('UNSUPPORTED_CODEC');
      const prefix = video ? 78 : 28;
      if (entry.end - entry.payload < prefix) malformed();
      const b = await read(entry.payload, prefix), v = view(b);
      if (v.getUint16(6) !== 1) stop('TRACK_REFERENCES');
      if (!video && v.getUint16(8) !== 0) stop('UNSUPPORTED_CODEC');
      entry.children = await scan(entry.payload + prefix, entry.end, entry.depth + 1);
      checkFlags();
      for (const child of entry.children) if (!(video ? ['avcC', 'pasp', 'btrt', 'colr', 'clap'] : ['esds', 'btrt']).includes(child.type) && child.type !== 'free' && child.type !== 'skip') stop('UNSUPPORTED_CODEC');
      const config = one(entry, video ? 'avcC' : 'esds');
      if (video) { const c = await data(config); if (c.length < 7 || c[0] !== 1) stop('UNSUPPORTED_CODEC'); }
      // esds is intentionally opaque: broken AAC configuration must not block safe omission.
    }
    function metadata(node) {
      if (node.type === 'udta') children(node, ['udta', 'meta']);
      if (node.type === 'meta') children(node, ['hdlr', 'ilst']);
      for (const child of node.children) if (child.type === 'udta' || child.type === 'meta') metadata(child);
    }
    try {
      if (!Number.isSafeInteger(blob?.size) || blob.size < 0 || typeof blob.slice !== 'function') malformed();
      const top = await scan(0, blob.size, 1, true);
      if (!state.recognized) stop('OTHER_CONTAINER');
      result.format = 'mp4'; checkFlags();
      const rootNode = {children: top};
      one(rootNode, 'ftyp');
      const moov = one(rootNode, 'moov', false), mdats = top.filter(n => n.type === 'mdat');
      for (const node of top) {
        if (['mvhd', 'trak', 'tkhd', 'mdia', 'mdhd', 'stsd'].includes(node.type)) malformed();
        if (!['ftyp', 'moov', 'mdat', 'free', 'skip', 'udta', 'meta'].includes(node.type)) stop('UNSUPPORTED_TRACKS');
        if (node.type === 'udta' || node.type === 'meta') metadata(node);
      }
      if (!moov) {
        if (mdats.some(n => n.end > n.payload)) stop('MISSING_MOOV', 'missing-index');
        stop('MISSING_MOOV');
      }
      children(moov, ['mvhd', 'trak', 'udta', 'meta']);
      for (const node of moov.children) if (node.type === 'udta' || node.type === 'meta') metadata(node);
      const movie = await duration(one(moov, 'mvhd'), 'mvhd');
      result.movieTimescale = movie.scale; result.movieDuration = Number(movie.ticks) / movie.scale;
      const tracks = [], ids = new Set();
      for (const node of moov.children.filter(n => n.type === 'trak')) {
        children(node, ['tkhd', 'mdia', 'edts', 'udta', 'meta']);
        for (const child of node.children) if (child.type === 'udta' || child.type === 'meta') metadata(child);
        const tkhd = await duration(one(node, 'tkhd'), 'tkhd');
        if (ids.has(tkhd.id)) malformed(); ids.add(tkhd.id);
        const mdia = one(node, 'mdia'); children(mdia, ['mdhd', 'hdlr', 'minf']);
        const mdhd = await duration(one(mdia, 'mdhd'), 'mdhd');
        const h = await data(one(mdia, 'hdlr'));
        if (h.length < 24 || view(h).getUint32(0) !== 0) malformed();
        const handler = text(h, 8);
        result.tracks.push({id: tkhd.id, handler}); tracks.push({node, tkhd, mdhd, mdia, handler});
      }
      const videos = tracks.filter(t => t.handler === 'vide'), audio = tracks.filter(t => t.handler === 'soun');
      if (videos.length !== 1 || audio.length + 1 !== tracks.length || tracks.some(t => !t.tkhd.enabled)) stop('UNSUPPORTED_TRACKS');
      const video = videos[0];
      result.videoDuration = Number(video.tkhd.ticks) / movie.scale;
      if (video.tkhd.ticks !== movie.ticks) timeline();
      await edits(one(video.node, 'edts', false), video.tkhd, video.mdhd, movie);
      for (const track of tracks) {
        const minf = one(track.mdia, 'minf'), isVideo = track === video;
        children(minf, [isVideo ? 'vmhd' : 'smhd', 'dinf', 'stbl']);
        const mediaHeader = await data(one(minf, isVideo ? 'vmhd' : 'smhd'));
        if (mediaHeader.length !== (isVideo ? 12 : 8)) malformed();
        const stbl = one(minf, 'stbl');
        await sampleDescription(stbl, one(minf, 'dinf'), isVideo);
        await sampleTables(stbl, track.mdhd, mdats, isVideo);
        if (!isVideo) {
          const edit = one(track.node, 'edts', false);
          if (edit) await edits(edit, track.tkhd, track.mdhd, movie);
          patches.push(track.node.start + 4);
        }
      }
      result.status = audio.length ? 'eligible' : 'video-only'; result.code = audio.length ? 'AUDIO_OMITTED' : 'NO_AUDIO';
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'LOCAL_READ_FAILED') throw error;
      if (!error.status) throw error;
      result.format = state.recognized ? 'mp4' : 'other';
      result.status = state.recognized || error.code === 'LIMIT_EXCEEDED' ? error.status : 'unsupported';
      result.code = state.recognized || error.code === 'LIMIT_EXCEEDED' ? error.code : 'OTHER_CONTAINER';
    }
    checkSignal(signal);
    result.inspectedBytes = state.inspectedBytes;
    return {inspection: result, patches};
  }

  async function inspect(blob, {signal} = {}) { return (await analyze(blob, signal)).inspection; }
  async function prepare(blob, {signal} = {}) {
    const {inspection, patches} = await analyze(blob, signal);
    checkSignal(signal);
    if (inspection.status === 'missing-index' || inspection.status === 'malformed') return {mode: 'reject', blob: null, inspection};
    if (inspection.status !== 'eligible') return {mode: 'original', blob, inspection};
    const parts = []; let at = 0;
    for (const offset of patches) { parts.push(blob.slice(at, offset), new Uint8Array([102, 114, 101, 101])); at = offset + 4; }
    parts.push(blob.slice(at));
    return {mode: 'audio-omitted', blob: new Blob(parts, {type: blob.type}), inspection};
  }
  const api = {inspect, prepare};
  root.PPTMP4 = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
