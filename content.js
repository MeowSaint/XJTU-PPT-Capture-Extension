(() => {
  const core = globalThis.PPTCore;
  if (!core) return;
  if (window.__pptContentCollector) return;
  window.__pptContentCollector = true;
  const found = new Set();
  let last = '', page = location.href, since = 0;
  function add(raw) { const info = core.mediaInfo(raw, document.baseURI || location.href); if (info) found.add(info.url); }
  function report() {
    if (!chrome.runtime?.id) return;
    if (page !== location.href) { found.clear(); last = ''; page = location.href; since = performance.now(); }
    document.querySelectorAll('video,source,a[href]').forEach(el => { add(el.currentSrc); add(el.src || el.href); });
    performance.getEntriesByType('resource').filter(entry => entry.startTime >= since).forEach(entry => add(entry.name));
    const urls = [...found].slice(-150), text = JSON.stringify(urls);
    if (urls.length && text !== last) {
      last = text;
      chrome.runtime.sendMessage({type: 'PPT_MEDIA', urls}).catch(() => {});
    }
    core.postLocalMessage(window, {type: 'PPT_CAPTURE_QUERY_V2'});
  }
  window.addEventListener('message', event => {
    if (!core.isLocalMessage(event, window) || event.data?.type !== 'PPT_CAPTURE_MEDIA_V2' || !Array.isArray(event.data.urls)) return;
    event.data.urls.slice(0, 200).forEach(raw => { if (typeof raw === 'string') add(raw); });
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== 'PPT_DISCOVER') return;
    last = ''; report(); respond({urls: [...found].slice(-150)});
  });
  setInterval(report, 2000);
  report();
})();
