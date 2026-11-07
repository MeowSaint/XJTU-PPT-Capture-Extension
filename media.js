/* Media URL matching, frame comparison, and same-window messaging. */
(function (root) {
  'use strict';
  const MEDIA_EXT = /\.(mp4|m4v|webm|mov|m3u8|mpd)$/i;
  const QUERY_KEYS = ['filename', 'file', 'name', 'path', 'url', 'response-content-disposition', 'key', 'file_key', 'download_url', 'video_url', 'src'];
  function decodePart(value) {
    let text = String(value || '');
    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded === text) break;
        text = decoded;
      } catch { break; }
    }
    return text;
  }
  function matchSegment(text) {
    const decoded = decodePart(text);
    const disposition = decoded.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)?.[1];
    const candidate = (disposition || decoded).split(/[?#"'&;]/)[0];
    const segments = candidate.split('/').map(s => decodePart(s).trim()).filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i], match = seg.match(MEDIA_EXT);
      if (match) return {file: seg, kind: match[1].toLowerCase()};
    }
    const inline = decoded.match(/([^/?#"'=;,\s]+\.(mp4|m4v|webm|mov|m3u8|mpd))(?:$|[?#"';,\s&])/i);
    if (inline) return {file: inline[1], kind: inline[2].toLowerCase()};
    return null;
  }
  function mediaInfo(raw, base) {
    try {
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const url = new URL(raw, base);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      let hit = matchSegment(url.pathname);
      if (!hit) {
        for (const key of QUERY_KEYS) {
          const value = url.searchParams.get(key);
          if (value) { hit = matchSegment(value); if (hit) break; }
        }
      }
      if (!hit) {
        for (const [key, value] of url.searchParams.entries()) {
          if (QUERY_KEYS.includes(key.toLowerCase()) || QUERY_KEYS.includes(key.replace(/[A-Z]/g, c => '_' + c.toLowerCase()))) {
            hit = matchSegment(value); if (hit) break;
          }
        }
      }
      if (!hit) return null; // Ignore numbered .ts segments and thumbnails.
      url.hash = '';
      return {url: url.href, name: hit.file, kind: hit.kind};
    } catch { return null; }
  }
  function extractUrls(payload, base) {
    const found = new Set();
    function visit(value, depth = 0) {
      if (value == null || depth > 12 || found.size > 300) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { visit(JSON.parse(trimmed), depth + 1); return; } catch {}
        }
        const info = mediaInfo(trimmed, base);
        if (info) found.add(info.url);
        return;
      }
      if (Array.isArray(value)) value.slice(0, 2000).forEach(x => visit(x, depth + 1));
      else if (typeof value === 'object') Object.values(value).slice(0, 2000).forEach(x => visit(x, depth + 1));
    }
    visit(payload, 0);
    return [...found];
  }
  function ignoreMask(rect, width = 192, height = 108) {
    if (rect == null) return null;
    const {x, y, w, h} = rect;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 || y + h > 1 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw Error('忽略区范围无效');
    const left = Math.floor(x * width), top = Math.floor(y * height), right = Math.min(width, Math.ceil((x + w) * width)), bottom = Math.min(height, Math.ceil((y + h) * height));
    if ((right - left) * (bottom - top) >= width * height) throw Error('忽略区不能覆盖整个 PPT 区域');
    const mask = new Uint8Array(width * height);
    for (let row = top; row < bottom; row++) mask.fill(1, row * width + left, row * width + right);
    return mask;
  }
  function frameDistance(a, b, mask = null) {
    if (!a || !b || !a.length || a.length % 4 || a.length !== b.length || (mask && mask.length !== a.length / 4)) return {changed: 100, mean: 100};
    let total = 0, changed = 0, biasR = 0, biasG = 0, biasB = 0, pixels = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (mask?.[i / 4]) continue;
      pixels++; biasR += a[i] - b[i]; biasG += a[i + 1] - b[i + 1]; biasB += a[i + 2] - b[i + 2];
    }
    if (!pixels) return {changed: 100, mean: 100};
    biasR = Math.abs(biasR / pixels) <= 8 ? biasR / pixels : 0;
    biasG = Math.abs(biasG / pixels) <= 8 ? biasG / pixels : 0;
    biasB = Math.abs(biasB / pixels) <= 8 ? biasB / pixels : 0;
    for (let i = 0; i < a.length; i += 4) {
      if (mask?.[i / 4]) continue;
      const dr = Math.abs(a[i] - b[i] - biasR), dg = Math.abs(a[i + 1] - b[i + 1] - biasG), db = Math.abs(a[i + 2] - b[i + 2] - biasB);
      total += dr + dg + db;
      if (Math.max(dr, dg, db) >= 24) changed++;
    }
    return {changed: changed * 100 / pixels, mean: total * 100 / (pixels * 765)};
  }
  function similar(a, b, threshold = 1.2, mask = null) {
    const d = frameDistance(a, b, mask);
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
    // Post to the current window only.
    target.postMessage(message, origin === 'null' ? '*' : origin);
  }
  function isLocalMessage(event, target) {
    return event.source === target && event.origin === messageOrigin(target);
  }
  function mediaError(mediaError, {phase = 'load', local = false, audioOmitted = false, time = null} = {}) {
    const nativeCode = typeof mediaError?.code === 'number' ? mediaError.code : null;
    const code = typeof mediaError?.code === 'string' ? mediaError.code : ({1: 'MEDIA_ABORTED', 2: 'MEDIA_NETWORK_FAILED', 3: 'MEDIA_DECODE_FAILED', 4: 'MEDIA_UNSUPPORTED'}[nativeCode] || 'MEDIA_LOAD_FAILED');
    const source = local ? '本地文件或缓存' : '视频地址';
    let detail;
    if (code === 'MEDIA_TIMEOUT') detail = local ? '读取或解码等待超时，请检查本地文件与磁盘，或重新下载后导入。' : '等待视频响应超时，请检查网络或重新获取视频地址。';
    else if (nativeCode === 3) detail = audioOmitted ? '忽略音轨后，视频或容器仍无法解码；可能存在损坏数据或不受支持的编码，尚不能确定具体故障原因。' : '浏览器解码失败；仅凭此错误无法确定是哪条轨道或哪段数据有问题。请尝试重新下载或换用浏览器支持的文件。';
    else if (nativeCode === 4) detail = '浏览器不支持此格式，或媒体数据无效。请确认文件完整并使用受支持的编码。';
    else if (nativeCode === 2) detail = local ? '本地读取失败，请检查文件与磁盘，或重新下载后导入。' : '媒体网络读取失败，请检查连接与地址是否仍有效。';
    else if (nativeCode === 1) detail = '媒体加载已中止。';
    else detail = local ? '无法加载或读取本地媒体，请检查文件是否完整。' : '无法加载视频，请检查地址响应与格式。';
    const position = Number.isFinite(time) ? `（${time} 秒）` : '';
    const error = Error(`${phase === 'seek' ? '跳转' : '加载'}${source}${position}：${detail}${audioOmitted ? '本次已忽略音轨，此处理不代表已确诊原文件的故障原因。' : ''}`);
    return Object.assign(error, {code, phase, nativeCode, time: Number.isFinite(time) ? time : null});
  }
  const api = {mediaError, mediaInfo, extractUrls, ignoreMask, frameDistance, similar, sampleTimes, postLocalMessage, isLocalMessage};
  root.PPTCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
