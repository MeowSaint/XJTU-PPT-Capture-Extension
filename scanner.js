/* Decode only requested timestamps, not real-time playback. */
class PPTScanner {
  constructor(video, capture) { this.video = video; this.capture = capture; }
  async seek(time, signal) {
    signal?.throwIfAborted();
    const v = this.video;
    if (Math.abs(v.currentTime - time) > 0.015 || v.readyState < 2) {
      await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); v.removeEventListener('seeked', done); v.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
        const done = () => { if (v.readyState >= 2 && !v.seeking) { cleanup(); resolve(); } };
        const fail = () => { cleanup(); reject(Error('视频解码失败，请尝试 MP4 或本地视频')); };
        const abort = () => { cleanup(); reject(new DOMException('已停止', 'AbortError')); };
        const timer = setTimeout(() => { cleanup(); reject(Error('跳转视频超时，服务器可能不支持随机访问或网络较慢')); }, 30000);
        v.addEventListener('seeked', done); v.addEventListener('error', fail); signal?.addEventListener('abort', abort, {once: true});
        v.currentTime = time;
      });
    }
    signal?.throwIfAborted();
    return this.capture(time);
  }
  async scan({step, threshold, dedupe, signal, save, progress, previous = [], isDuplicate,
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
    const same = (a, b) => PPTCore.similar(a, b, threshold);
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
      if (!PPTCore.similar(first.sig, confirmed.sig, Math.min(threshold, 0.8))) {
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
    return {saved, unstable};
  }
}
