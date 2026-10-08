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
  async scan({step, threshold, dedupe, signal, save, progress, previous = []}) {
    const duration = this.video.duration;
    const times = PPTCore.sampleTimes(duration, step);
    const seen = previous.filter(Boolean).slice();
    let baseline = null, lastCoarse = null, previousTime = 0, saved = 0, unstable = 0;
    const same = (a, b) => PPTCore.similar(a, b, threshold);
    const consider = async (time, known) => {
      signal.throwIfAborted();
      const first = known || await this.seek(time, signal);
      if (baseline && same(first.sig, baseline)) return;
      const confirmTime = Math.min(duration - Math.min(0.05, duration / 2), time + 0.25);
      const confirmed = confirmTime > time + 0.02 ? await this.seek(confirmTime, signal) : first;
      if (!PPTCore.similar(first.sig, confirmed.sig, Math.min(threshold, 0.8))) { unstable++; return; }
      baseline = confirmed.sig;
      if (dedupe && seen.some(sig => same(confirmed.sig, sig))) return;
      await save(confirmed); seen.push(confirmed.sig); saved++;
    };
    for (let i = 0; i < times.length; i++) {
      signal.throwIfAborted();
      const time = times[i], coarse = await this.seek(time, signal);
      if (lastCoarse && !same(lastCoarse.sig, coarse.sig) && time - previousTime > 0.55) {
        for (let fine = previousTime + 0.5; fine < time - 0.02; fine += 0.5) await consider(fine);
      }
      await consider(time, coarse);
      lastCoarse = coarse; previousTime = time;
      progress({ratio: (i + 1) / times.length, time, duration, saved, unstable});
    }
    return {saved, unstable};
  }
}
