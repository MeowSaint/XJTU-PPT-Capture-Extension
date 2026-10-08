/* MAIN-world response observer; retains media URLs, never credentials or bodies. */
(() => {
  const core = globalThis.PPTCore;
  if (!core) return;
  if (window.__pptMediaHook) return;
  window.__pptMediaHook = true;
  const found = new Set(); let page = location.href;
  function collect(value, depth = 0) {
    if (depth > 12 || found.size > 300) return;
    if (typeof value === 'string') {
      const info = core.mediaInfo(value, document.baseURI || location.href);
      if (info) found.add(info.url);
    } else if (Array.isArray(value)) value.slice(0, 2000).forEach(x => collect(x, depth + 1));
    else if (value && typeof value === 'object') Object.values(value).slice(0, 2000).forEach(x => collect(x, depth + 1));
  }
  function emit() {
    if (page !== location.href) { found.clear(); page = location.href; }
    if (found.size) core.postLocalMessage(window, {type: 'PPT_CAPTURE_MEDIA_V2', urls: [...found]});
  }
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    return originalFetch.apply(this, args).then(response => {
      collect(response.url);
      const type = response.headers.get('content-type') || '';
      const size = Number(response.headers.get('content-length'));
      if (/json/i.test(type) && (!size || size < 2_000_000)) {
        (async () => {
          const reader = response.clone().body.getReader(), chunks = []; let length = 0;
          while (true) {
            const {done, value} = await reader.read(); if (done) break;
            length += value.length; if (length > 2_000_000) { reader.cancel().catch(() => {}); return; }
            chunks.push(value);
          }
          const bytes = new Uint8Array(length); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          collect(JSON.parse(new TextDecoder().decode(bytes))); emit();
        })().catch(() => {});
      }
      emit(); return response;
    });
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      collect(this.responseURL);
      try {
        if (this.responseType === 'json') collect(this.response);
        else if ((!this.responseType || this.responseType === 'text') && this.responseText.length < 2_000_000 && /json/i.test(this.getResponseHeader('content-type') || '')) collect(JSON.parse(this.responseText));
      } catch { /* Not a relevant JSON response. */ }
      emit();
    }, {once: true});
    return open.apply(this, args);
  };
  window.addEventListener('message', event => {
    if (core.isLocalMessage(event, window) && event.data?.type === 'PPT_CAPTURE_QUERY_V2') emit();
  });
})();
