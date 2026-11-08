/* Observe MAIN-world fetch/XHR responses to collect media URLs and course info. */
(() => {
  const core = globalThis.PPTCore;
  if (!core) return;
  if (window.__pptMediaHook) return;
  window.__pptMediaHook = true;
  const found = new Set(); let page = location.href, course = {}, candidates = [];
  function resetPage() { if (page !== location.href) { found.clear(); course = {}; candidates = []; page = location.href; } }
  function collect(value, endpoint) {
    resetPage();
    for (const url of core.extractUrls(value, document.baseURI || location.href)) if (found.size < 300) found.add(url);
    if (globalThis.PPTCourse) {
      if (window === window.top) course = {...course, ...PPTCourse.fromResponse(value, location.href, endpoint)};
      candidates = PPTCourse.mergeCandidates(candidates, PPTCourse.mediaCandidates(value, location.href, endpoint));
    }
  }
  function emit() {
    resetPage();
    if (found.size || Object.keys(course).length) core.postLocalMessage(window, {type: 'PPT_CAPTURE_MEDIA_V2', urls: [...found], candidates, course, page});
  }
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const requestedPage = location.href;
    return originalFetch.apply(this, args).then(response => {
      if (location.href !== requestedPage) return response;
      const endpoint = response.url || args[0]?.url || args[0];
      collect(response.url, endpoint);
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
          if (location.href === requestedPage) { collect(JSON.parse(new TextDecoder().decode(bytes)), endpoint); emit(); }
        })().catch(() => {});
      }
      emit(); return response;
    });
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    const requestedPage = location.href;
    this.addEventListener('load', () => {
      if (location.href !== requestedPage) return;
      const endpoint = this.responseURL || args[1];
      collect(this.responseURL, endpoint);
      try {
        if (this.responseType === 'json') collect(this.response, endpoint);
        else if ((!this.responseType || this.responseType === 'text') && this.responseText.length < 2_000_000 && /json/i.test(this.getResponseHeader('content-type') || '')) collect(JSON.parse(this.responseText), endpoint);
      } catch { /* Not a relevant JSON response. */ }
      emit();
    }, {once: true});
    return open.apply(this, args);
  };
  window.addEventListener('message', event => {
    if (core.isLocalMessage(event, window) && event.data?.type === 'PPT_CAPTURE_QUERY_V2') emit();
  });
})();
