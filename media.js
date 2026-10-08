/* Shared, dependency-free URL selection and frame comparison. */
(function (root) {
  'use strict';
  function mediaInfo(raw, base) {
    try {
      const url = new URL(raw, base);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      let path = decodeURIComponent(url.pathname);
      let match = path.match(/\.(mp4|m4v|webm|mov|m3u8|mpd)$/i);
      if (!match) {
        for (const key of ['filename', 'file', 'name', 'path', 'url']) {
          const value = url.searchParams.get(key);
          if (value && /\.(mp4|m4v|webm|mov|m3u8|mpd)(?:$|\?)/i.test(value)) {
            path = value.split('?')[0]; match = path.match(/\.(mp4|m4v|webm|mov|m3u8|mpd)$/i); break;
          }
        }
      }
      if (!match) return null; // Ignore numbered .ts segments and thumbnails.
      const kind = match[1].toLowerCase(), parts = path.split('/').filter(Boolean);
      const file = parts.at(-1);
      url.hash = '';
      return {url: url.href, name: file, kind};
    } catch { return null; }
  }
  function frameDistance(a, b) {
    if (!a || !b || a.length !== b.length) return {changed: 100, mean: 100};
    let total = 0, changed = 0, biasR = 0, biasG = 0, biasB = 0;
    for (let i = 0; i < a.length; i += 4) { biasR += a[i] - b[i]; biasG += a[i + 1] - b[i + 1]; biasB += a[i + 2] - b[i + 2]; }
    const pixels = a.length / 4;
    biasR = Math.abs(biasR / pixels) <= 8 ? biasR / pixels : 0;
    biasG = Math.abs(biasG / pixels) <= 8 ? biasG / pixels : 0;
    biasB = Math.abs(biasB / pixels) <= 8 ? biasB / pixels : 0;
    for (let i = 0; i < a.length; i += 4) {
      const dr = Math.abs(a[i] - b[i] - biasR), dg = Math.abs(a[i + 1] - b[i + 1] - biasG), db = Math.abs(a[i + 2] - b[i + 2] - biasB);
      total += dr + dg + db;
      if (Math.max(dr, dg, db) >= 24) changed++;
    }
    return {changed: changed * 100 / (a.length / 4), mean: total * 100 / (a.length / 4 * 765)};
  }
  function similar(a, b, threshold = 1.2) {
    const d = frameDistance(a, b);
    return d.changed < threshold && d.mean < Math.max(0.25, threshold / 2);
  }
  function sampleTimes(duration, step, start = 0) {
    const end = Math.max(0, duration - Math.min(0.05, duration / 2));
    if (!(duration > 0) || !(step > 0) || !Number.isFinite(duration)) throw Error('视频时长或采样间隔无效');
    const times = [];
    for (let t = Math.max(0, start); t < end; t += step) times.push(t);
    if (!times.length || end - times.at(-1) > 1e-9) times.push(end);
    return times;
  }
  function messageOrigin(target) {
    // window.origin reflects the document's origin; location.origin describes
    // its URL. They differ for inherited about:blank/srcdoc and sandbox frames.
    return typeof target.origin === 'string' ? target.origin : target.location.origin;
  }
  function postLocalMessage(target, message) {
    const origin = messageOrigin(target);
    // Only address this very same window, never parent/top/other frames.
    target.postMessage(message, origin === 'null' ? '*' : origin);
  }
  function isLocalMessage(event, target) {
    return event.source === target && event.origin === messageOrigin(target);
  }
  const api = {mediaInfo, frameDistance, similar, sampleTimes, postLocalMessage, isLocalMessage};
  root.PPTCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
