/* Inspect the first 64 KB of a media URL to classify MP4, WebM, or HLS sources. */
(function (root) {
  'use strict';
  const unknown = reason => ({status: 'unknown', kind: null, reason});
  const invalid = reason => ({status: 'invalid', kind: null, reason});
  const valid = (kind, reason) => ({status: 'valid', kind, reason});
  const aborted = () => new DOMException('已取消视频预检', 'AbortError');

  function classify(bytes) {
    if (!bytes.length) return unknown('响应为空，可直接尝试加载');
    const text = new TextDecoder().decode(bytes).trimStart();
    if (/^<(?:!doctype\s+html\b|html\b|head\b|body\b|form\b|input\b|script\b|title\b|meta\b|div\b|p\b|!--)/i.test(text)) {
      return invalid('返回的是网页，可能需要重新登录');
    }
    let json = false;
    try { JSON.parse(text); json = true; } catch {}
    if (json || /^\{\s*"[^"\r\n]*"\s*:/.test(text) || /^\[\s*[\[{\"]/.test(text)) {
      return invalid('返回的是接口数据，不是视频');
    }
    if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return valid('mp4', 'MP4 视频');
    }
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return valid('webm', 'WebM 视频');
    }
    if (/^#EXTM3U(?:\r?\n|$)/.test(text)) return valid('m3u8', 'HLS 播放列表');
    return unknown('格式待确认，可直接尝试加载');
  }

  async function probe(url, {signal, fetchImpl = globalThis.fetch, timeoutMs = 8000, maxBytes = 65536} = {}) {
    if (signal?.aborted) throw aborted();
    const controller = new AbortController();
    const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.min(65536, Math.floor(maxBytes))) : 65536;
    let response, reader, timedOut = false;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, {once: true});
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      response = await fetchImpl(url, {
        credentials: 'include', headers: {Range: 'bytes=0-65535'}, signal: controller.signal
      });
      if (signal?.aborted) throw aborted();
      if (response.status === 404 || response.status === 410) return invalid('视频地址不存在或已失效');
      if (response.status === 401 || response.status === 403) return unknown('需要登录或授权，可直接尝试加载');
      if (!response.ok) return unknown('服务器暂未响应，可直接尝试加载');
      if (!response.body) return unknown('响应为空，可直接尝试加载');
      reader = response.body.getReader();
      const bytes = new Uint8Array(limit);
      let length = 0;
      while (length < limit) {
        const {done, value} = await reader.read();
        if (signal?.aborted) throw aborted();
        if (done) break;
        const part = value.subarray(0, limit - length);
        bytes.set(part, length);
        length += part.byteLength;
      }
      if (timedOut) return unknown('检测超时，可直接尝试加载');
      return classify(bytes.subarray(0, length));
    } catch {
      if (signal?.aborted) throw aborted();
      return unknown(timedOut ? '检测超时，可直接尝试加载' : '暂时无法连接该地址，可直接尝试加载');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      controller.abort();
      try {
        if (reader) await reader.cancel();
        else if (response?.body) await response.body.cancel();
      } catch {}
      if (reader) { try { reader.releaseLock(); } catch {} }
    }
  }

  const api = {probe};
  root.PPTPreflight = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
