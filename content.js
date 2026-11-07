(() => {
  const core = globalThis.PPTCore;
  if (!core) return;
  if (typeof window.__pptContentCollector === 'function') { window.__pptContentCollector(); return; }
  if (window.__pptContentCollector) return;
  const found = new Set();
  let last = '', page = location.href, since = 0;
  let hookCourse = {}, lastCourse = '';
  let probe = null, discovery = null, requestSerial = 0;
  async function api(path, {signal} = {}) {
    if (!globalThis.PPTState || !await PPTState.hasConsent()) throw Error('请先在截取工具中同意课程资料使用约定');
    return PPTBatch.requestJSON(path, {signal});
  }
  function invalidate() {
    probe?.controller.abort(); probe = null;
    discovery?.controller.abort(); discovery = null;
  }
  function checkPage() {
    if (page === location.href) return;
    invalidate(); found.clear(); last = ''; hookCourse = {}; lastCourse = ''; page = location.href; since = performance.now();
  }
  function onNavigation() { if (page !== location.href) probeCurrentPageApi(); }
  window.addEventListener('pagehide', invalidate);
  window.addEventListener('popstate', onNavigation);
  window.addEventListener('hashchange', onNavigation);
  function pageRoute(href = location.href) {
    try {
      const url = new URL(href);
      const match = (url.pathname + url.hash).match(/\/(?:my|study)-capture-courses\/([^/?#]+)\/preview-detail(?:\/([^/?#]+))?/);
      const courseId = match?.[1] || (globalThis.PPTBatch ? PPTBatch.courseId(href) : '') || url.searchParams.get('courseId') || url.searchParams.get('course_id') || '';
      const captureCode = match?.[2] || url.searchParams.get('captureCode') || url.searchParams.get('capture_code') || url.searchParams.get('captureId') || url.searchParams.get('capture_id') || '';
      return {courseId, captureCode};
    } catch { return {courseId: '', captureCode: ''}; }
  }
  function probeCurrentPageApi() {
    checkPage();
    if (probe?.page === location.href) return probe.promise;
    const current = {page: location.href, controller: new AbortController()}; probe = current;
    current.promise = runPageProbe(current.page, current.controller.signal).finally(() => { if (probe === current) probe = null; });
    return current.promise;
  }
  async function runPageProbe(currentPage, signal) {
    const {courseId, captureCode} = pageRoute(currentPage);
    if (!courseId) return;
    const base = `/api/v1/rms-service/study-capture-courses/${encodeURIComponent(courseId)}`;
    try {
      let courseData = null, latest = null, captureData = null;
      if (captureCode) {
        captureData = await api(`${base}/captures/${encodeURIComponent(captureCode)}`, {signal});
      } else {
        courseData = await api(base, {signal});
        const detail = courseData?.data?.data ?? courseData?.data ?? courseData;
        const list = [
          ...(globalThis.PPTBatch ? PPTBatch.schedules(courseData) : []),
          ...(Array.isArray(detail?.schedules) ? detail.schedules : []),
          ...(Array.isArray(detail?.captures) ? detail.captures : []),
          ...(Array.isArray(detail?.lessons) ? detail.lessons : [])
        ].filter(item => item && typeof item === 'object' && (item.capture_code || item.captureCode || item.code));
        const eligible = globalThis.PPTBatch ? list.filter(PPTBatch.eligible) : [];
        const pool = (eligible.length ? eligible : list).sort((a, b) => String(a.start_time || a.startTime || '').localeCompare(String(b.start_time || b.startTime || '')));
        latest = pool.at(-1) || null;
        const resolvedCode = detail?.capture_code || detail?.captureCode || detail?.latest_capture_code || detail?.latestCaptureCode
          || detail?.latest_capture?.capture_code || detail?.latest_capture?.captureCode || detail?.latest_capture?.code
          || detail?.latestCapture?.capture_code || detail?.latestCapture?.captureCode || detail?.latestCapture?.code
          || latest?.capture_code || latest?.captureCode || latest?.code || '';
        if (resolvedCode) captureData = await api(`${base}/captures/${encodeURIComponent(resolvedCode)}`, {signal}).catch(() => null);
      }
      if (location.href !== currentPage || signal.aborted) return;
      for (const payload of [courseData, latest, captureData].filter(Boolean)) {
        if (core.extractUrls) core.extractUrls(payload, currentPage).forEach(url => add(url));
        if (globalThis.PPTCourse) {
          const detail = payload?.data?.data ?? payload?.data ?? payload;
          const fallback = detail && typeof detail === 'object' ? PPTCourse.normalize({
            name: detail.course?.name || detail.course_name || detail.courseName || '',
            ...PPTCourse.startParts(detail.start_time || detail.startTime || detail.capture_start_time || '')
          }) : {};
          hookCourse = {...hookCourse, ...fallback, ...PPTCourse.normalize(PPTCourse.fromJSON(payload, currentPage))};
        }
      }
      const urls = [...found].slice(-150);
      if (urls.length && chrome.runtime?.id) {
        last = JSON.stringify(urls);
        chrome.runtime.sendMessage({type: 'PPT_MEDIA', urls}).catch(() => {});
      }
      const course = metadata();
      if (Object.keys(course).length && chrome.runtime?.id) {
        lastCourse = JSON.stringify(course);
        chrome.runtime.sendMessage({type: 'PPT_COURSE', course, page: currentPage}).catch(() => {});
      }
    } catch { /* Ignore non-JSON or unavailable API fallback responses. */ }
  }
  function startDiscovery(message) {
    checkPage();
    if (window !== window.top || !globalThis.PPTBatch) throw Error('批量读取只能在课程列表主页面运行');
    if (!PPTBatch.courseId(page)) throw Error('请回到这门课的录像列表页，再读取课次');
    if (discovery?.pending && discovery.page === page) return discovery;
    const current = {requestId: `discovery-${Date.now()}-${++requestSerial}`, page, pending: true, controller: new AbortController(), progress: null, result: null};
    discovery = current;
    PPTBatch.discover({page, readJSON: api, signal: current.controller.signal, previous: message.previous || [], retryOnly: !!message.retryOnly,
      onProgress: result => { if (discovery === current && location.href === current.page) { current.result = result; current.progress = result.progress; } }
    }).then(result => {
      if (discovery === current && location.href === current.page) current.result = result;
    }, error => { current.error = {code: error.code || 'DISCOVERY', message: error.message}; }).finally(() => { current.pending = false; });
    return current;
  }
  function metadata() { return globalThis.PPTCourse ? (window === window.top ? {...hookCourse, ...PPTCourse.fromDocument(document)} : {...hookCourse}) : {}; }
  function add(raw) { const info = core.mediaInfo(raw, document.baseURI || location.href); if (info) found.add(info.url); }
  function report() {
    if (!chrome.runtime?.id) return;
    if (page !== location.href) { checkPage(); probeCurrentPageApi(); }
    document.querySelectorAll('video,source,a[href]').forEach(el => { add(el.currentSrc); add(el.src || el.href); });
    performance.getEntriesByType('resource').filter(entry => entry.startTime >= since).forEach(entry => add(entry.name));
    const urls = [...found].slice(-150), text = JSON.stringify(urls);
    if (urls.length && text !== last) {
      last = text;
      chrome.runtime.sendMessage({type: 'PPT_MEDIA', urls}).catch(() => {});
    }
    core.postLocalMessage(window, {type: 'PPT_CAPTURE_QUERY_V2'});
    const course = metadata(), courseText = JSON.stringify(course);
    if (Object.keys(course).length && courseText !== lastCourse) {
      lastCourse = courseText;
      chrome.runtime.sendMessage({type: 'PPT_COURSE', course, page}).catch(() => {});
    }
  }
  window.addEventListener('message', event => {
    if (!core.isLocalMessage(event, window) || event.data?.type !== 'PPT_CAPTURE_MEDIA_V2' || !Array.isArray(event.data.urls)) return;
    if (event.data.page && event.data.page !== location.href) return;
    event.data.urls.slice(0, 200).forEach(raw => { if (typeof raw === 'string') add(raw); });
    if (window === window.top && event.data.page === location.href && globalThis.PPTCourse) hookCourse = {...hookCourse, ...PPTCourse.normalize(event.data.course)};
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type.startsWith('PPT_BATCH_')) {
      checkPage();
      try {
        if (message.type === 'PPT_BATCH_DISCOVER') {
          const current = startDiscovery(message);
          respond({ok: true, requestId: current.requestId, pending: true});
        } else {
          if (!discovery || discovery.page !== location.href || message.requestId !== discovery.requestId) throw Error('课程读取请求已失效');
          if (message.type === 'PPT_BATCH_CANCEL') discovery.controller.abort();
          respond({ok: true, requestId: discovery.requestId, pending: discovery.pending, progress: discovery.progress, result: discovery.result, ...(discovery.error ? {error: discovery.error} : {})});
        }
      } catch (error) { respond({ok: false, error: error.message}); }
      return;
    }
    if (message.type === 'PPT_COURSE') {
      lastCourse = ''; report();
      respond({course: metadata(), page: location.href});
      return;
    }
    if (message.type === 'PPT_GET_MEDIA') {
      respond({urls: [...found].slice(-150), course: metadata(), page: location.href});
      return;
    }
    if (message.type !== 'PPT_DISCOVER') return;
    last = ''; lastCourse = ''; report();
    probeCurrentPageApi().finally(() => {
      respond({urls: [...found].slice(-150), course: metadata(), page: location.href});
    });
    return true;
  });
  window.__pptContentCollector = () => { last = ''; lastCourse = ''; report(); probeCurrentPageApi(); };
  setInterval(report, 2000);
  report();
  probeCurrentPageApi();
})();
