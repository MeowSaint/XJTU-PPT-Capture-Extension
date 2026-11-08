/* Decode only requested timestamps, not real-time playback. */
class PPTScanner {
  static frames = new WeakMap();
  static source(video) { return [video.currentSrc, video.src, video.srcObject]; }
  static quality(video) {
    const q = video.getVideoPlaybackQuality?.();
    return q && Number.isFinite(q.totalVideoFrames) && Number.isFinite(q.droppedVideoFrames) && q.droppedVideoFrames >= 0 &&
      q.totalVideoFrames > q.droppedVideoFrames && video.videoWidth > 0 && video.videoHeight > 0 ? [q.totalVideoFrames, q.droppedVideoFrames, video.videoWidth, video.videoHeight] : null;
  }
  // The load owner must arm before attaching the new source: a paused initial frame
  // need not produce another callback when a scanner is constructed later.
  static prime(video, signal, mediaContext = {}) {
    signal?.throwIfAborted();
    PPTScanner.frames.get(video)?.dispose?.();
    const state = {}; PPTScanner.frames.set(video, state);
    if (typeof video.requestVideoFrameCallback !== 'function' || typeof video.cancelVideoFrameCallback !== 'function') return {ready: Promise.resolve(), verify() { signal?.throwIfAborted(); }, dispose() {}};
    let dispose;
    const ready = new Promise((resolve, reject) => {
      let settled = false, callback, attached, candidate, started = performance.now();
      const matches = source => source[1] === video.src && source[2] === video.srcObject && (!source[0] || source[0] === video.currentSrc);
      const failure = cause => Object.assign(PPTCore.mediaError(video.error, {local: /^(blob:|file:)/i.test(video.currentSrc || video.src || ''), ...mediaContext, phase: 'load'}), cause ? {cause} : {});
      const cleanup = () => {
        clearTimeout(timer); if (callback !== undefined) video.cancelVideoFrameCallback(callback);
        for (const [type, fn] of listeners) video.removeEventListener(type, fn);
        signal?.removeEventListener('abort', abort); delete state.dispose;
      };
      const finish = error => {
        if (settled) return; settled = true; cleanup();
        if (error) { delete state.proof; reject(error); } else resolve(state.proof);
      };
      const check = () => {
        if (settled) return;
        if (PPTScanner.frames.get(video) !== state || attached && !matches(attached)) { finish(failure()); return; }
        const counts = PPTScanner.quality(video);
        if (candidate && matches(candidate.source) && video.readyState >= 2 && !video.seeking && video.currentTime === candidate.nativeTime && counts) {
          state.proof = {...candidate, time: video.currentTime, counts}; finish();
        }
      };
      const fail = () => finish(failure()), abort = () => finish(new DOMException('已停止', 'AbortError'));
      const load = () => { if (attached) { fail(); return; } attached = PPTScanner.source(video); state.source = attached; check(); };
      const emptied = () => { if (attached) fail(); };
      const moved = () => { candidate = null; started = performance.now(); };
      const frame = (now, metadata) => {
        if (settled) return; callback = undefined;
        if (attached && metadata.presentationTime > started) candidate = {source: PPTScanner.source(video), nativeTime: video.currentTime, metadata};
        check(); if (!settled) callback = video.requestVideoFrameCallback(frame);
      };
      const listeners = [['loadstart', load], ['loadeddata', check], ['seeked', check], ['seeking', moved], ['emptied', emptied], ['error', fail]];
      const timer = setTimeout(() => finish(PPTCore.mediaError({code: 'MEDIA_TIMEOUT'}, {...mediaContext, phase: 'load'})), 45000);
      dispose = abort; state.dispose = dispose;
      for (const [type, fn] of listeners) video.addEventListener(type, fn);
      signal?.addEventListener('abort', abort, {once: true});
      try { callback = video.requestVideoFrameCallback(frame); } catch (error) { finish(failure(error)); }
    });
    // The attachment or old readiness checks may fail before the owner awaits ready.
    // Own that rejection immediately; the owner still receives the original promise.
    ready.catch(() => {});
    return {ready, dispose: () => dispose(), verify() {
      signal?.throwIfAborted();
      const proof = state.proof, counts = PPTScanner.quality(video), source = PPTScanner.source(video);
      if (PPTScanner.frames.get(video) !== state || !state.source || state.source[1] !== source[1] || state.source[2] !== source[2] || state.source[0] && state.source[0] !== source[0] || !proof || video.seeking || video.readyState < 2 || proof.nativeTime !== video.currentTime ||
        !proof.source.every((value, i) => value === source[i]) || !counts || !counts.every((value, i) => value === proof.counts?.[i])) {
        throw PPTCore.mediaError(video.error, {...mediaContext, phase: 'load'});
      }
    }};
  }
  constructor(video, capture, mediaContext = {}, onSeeked) { this.video = video; this.capture = capture; this.onSeeked = onSeeked; this.mediaContext = {local: /^(blob:|file:)/i.test(video.currentSrc || video.src || ''), ...mediaContext}; }
  async seek(time, signal) {
    signal?.throwIfAborted();
    const v = this.video;
    const framed = typeof v.requestVideoFrameCallback === 'function' && typeof v.cancelVideoFrameCallback === 'function';
    const source = PPTScanner.source(v), state = PPTScanner.frames.get(v) || {};
    PPTScanner.frames.set(v, state);
    const sameSource = () => PPTScanner.frames.get(v) === state && source.every((value, i) => value === PPTScanner.source(v)[i]);
    const failure = cause => Object.assign(PPTCore.mediaError(v.error, {...this.mediaContext, phase: 'seek', time}), cause ? {cause} : {});
    const previous = state.proof, counts = framed ? PPTScanner.quality(v) : null;
    let nativeTime = v.currentTime;
    // Exact paused reuse needs confirmed presentation provenance from this source
    // generation, whether established by its load owner or a prior scanner seek.
    const reuse = framed && previous && v.paused && !v.seeking && v.readyState >= 2 &&
      previous.time === time && previous.nativeTime === v.currentTime && previous.source.every((value, i) => value === source[i]) && counts && counts.every((value, i) => value === previous.counts?.[i]);
    delete state.proof;
    if (!reuse && (framed || Math.abs(v.currentTime - time) > 0.015 || v.readyState < 2 || v.getVideoPlaybackQuality && !v.getVideoPlaybackQuality().totalVideoFrames)) {
      await new Promise((resolve, reject) => {
        let settled = false, seeked = false, presented = !framed, callback;
        // presentationTime identifies compositor submission, not callback delivery. A callback
        // queued before this request can run after currentTime has already changed.
        const started = framed ? performance.now() : 0;
        const cleanup = () => {
          clearTimeout(timer); if (callback !== undefined) v.cancelVideoFrameCallback(callback);
          v.removeEventListener('seeked', done); v.removeEventListener('error', fail); v.removeEventListener('emptied', fail); v.removeEventListener('seeking', moved); signal?.removeEventListener('abort', abort);
        };
        const finish = error => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(); };
        const ready = () => {
          if (settled) return;
          if (!sameSource()) { finish(failure()); return; }
          if (seeked && presented && v.readyState >= 2 && !v.seeking && v.currentTime === nativeTime) finish();
        };
        const moved = () => { if (v.currentTime !== nativeTime) { finish(failure()); return; } seeked = false; presented = !framed; };
        const done = () => {
          if (settled) return;
          if (!sameSource()) { finish(failure()); return; }
          try { this.onSeeked?.(); seeked = true; ready(); } catch (error) { finish(error); }
        };
        const fail = () => finish(failure());
        const abort = () => finish(new DOMException('已停止', 'AbortError'));
        const frame = (now, metadata) => {
          if (settled) return; callback = undefined;
          if (!sameSource()) { finish(failure()); return; }
          // Do not compare mediaTime with an invented FPS tolerance: sparse/VFR samples
          // legitimately precede the requested time. Native seek selects that sample.
          if (metadata.presentationTime > started) { presented = true; ready(); }
          else callback = v.requestVideoFrameCallback(frame);
        };
        const timer = setTimeout(() => finish(PPTCore.mediaError({code: 'MEDIA_TIMEOUT'}, {...this.mediaContext, phase: 'seek', time})), 30000);
        v.addEventListener('seeked', done); v.addEventListener('error', fail); v.addEventListener('emptied', fail); v.addEventListener('seeking', moved); signal?.addEventListener('abort', abort, {once: true});
        try {
          // Register before the setter so a fast decoder cannot outrun the observer.
          // Unproven/audio-only requests still need a presentation; never force playback.
          if (framed) callback = v.requestVideoFrameCallback(frame);
          // Match the browser's actual setter result while retaining capture(time).
          v.currentTime = time; nativeTime = v.currentTime;
        } catch (error) { finish(failure(error)); }
      });
    }
    if (!sameSource() || v.currentTime !== nativeTime || v.seeking) throw failure();
    signal?.throwIfAborted();
    if (framed) state.proof = {time, nativeTime: v.currentTime, source, counts: PPTScanner.quality(v)};
    return this.capture(time);
  }
  async scan({step = 0.5, threshold, dedupe, signal, save, progress, previous = [], isDuplicate, compare = PPTCore.similar,
    start = 0, end = this.video.duration, baselineTime = null, checkpoint = async () => {}, suspect = async () => {}}) {
    const duration = this.video.duration;
    if (!(duration > 0) || !Number.isFinite(duration) || !(step > 0) || !Number.isFinite(step) || duration + step === duration) throw Error('视频时长或采样间隔无效');
    const limit = Math.min(end, duration - Math.min(0.05, duration / 2));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration || start > end || start > limit) throw Error('视频扫描区间无效');
    if (baselineTime !== null && (!Number.isFinite(baselineTime) || baselineTime < 0 || baselineTime > duration)) throw Error('视频基准时间无效');
    const times = PPTCore.sampleTimes(duration, step, start).filter(time => time <= limit);
    if (times.at(-1) !== limit) times.push(limit);
    const seen = isDuplicate ? null : previous.filter(Boolean).slice();
    let baseline = null, lastCoarse = null, previousTime = start, saved = 0, unstable = 0;
    const same = (a, b) => compare(a, b, threshold);
    if (baselineTime !== null) {
      signal.throwIfAborted();
      baseline = (await this.seek(baselineTime, signal)).sig;
      signal.throwIfAborted();
    }
    const consider = async (time, known) => {
      signal.throwIfAborted();
      const first = known || await this.seek(time, signal);
      if (baseline && same(first.sig, baseline)) return;
      const confirmTime = Math.min(limit, time + 0.25);
      const confirmed = confirmTime > time + 0.02 ? await this.seek(confirmTime, signal) : first;
      if (!compare(first.sig, confirmed.sig, Math.min(threshold, 0.8))) {
        unstable++;
        await suspect({start: Math.max(start, time - 0.5), end: Math.min(end, time + 0.5), time});
        signal.throwIfAborted();
        return;
      }
      baseline = confirmed.sig; baselineTime = confirmTime > time + 0.02 ? confirmTime : time;
      if (dedupe && (isDuplicate ? await isDuplicate(confirmed.sig, threshold) : seen.some(sig => same(confirmed.sig, sig)))) return;
      signal.throwIfAborted();
      const added = await save(confirmed);
      signal.throwIfAborted();
      if (added !== false) { seen?.push(confirmed.sig); saved++; }
    };
    for (let i = 0; i < times.length; i++) {
      signal.throwIfAborted();
      const time = times[i], coarse = await this.seek(time, signal);
      if (lastCoarse && !same(lastCoarse.sig, coarse.sig) && time - previousTime > 0.55) {
        for (let fine = previousTime + 0.5; fine < time - 0.02; fine += 0.5) await consider(fine);
      }
      await consider(time, coarse);
      lastCoarse = coarse; previousTime = time;
      signal.throwIfAborted();
      await checkpoint({time, duration, saved, unstable, baselineTime});
      signal.throwIfAborted();
      progress({ratio: (i + 1) / times.length, time, duration, saved, unstable});
    }
    signal.throwIfAborted();
    return {saved, unstable, completedTo: times.at(-1)};
  }
}
