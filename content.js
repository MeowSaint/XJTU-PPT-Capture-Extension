(() => {
  const core = globalThis.PPTCore;
  if (!core) return;
  if (typeof window.__pptContentCollector === 'function') { window.__pptContentCollector(); return; }
  if (window.__pptContentCollector) return;
  const found = new Set();
  let last = '', page = location.href, since = 0;
  let hookCourse = {}, apiCourse = {}, lastCourse = '', candidates = [];
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
    invalidate(); found.clear(); last = ''; hookCourse = {}; apiCourse = {}; candidates = []; lastCourse = ''; page = location.href; since = performance.now();
  }
  function onNavigation() { if (page !== location.href) probeCurrentPageApi(); }
  window.addEventListener('pagehide', invalidate);
  window.addEventListener('popstate', onNavigation);
  window.addEventListener('hashchange', onNavigation);
  function pageRoute(href = location.href) {
    if (!core.isCoursePage(href)) return {courseId: '', captureCode: ''};
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
      let courseData = null, latest = null, captureData = null, resolvedCode = captureCode;
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
        const lastSchedule = pool.at(-1);
        resolvedCode = detail?.capture_code || detail?.captureCode || detail?.latest_capture_code || detail?.latestCaptureCode
          || detail?.latest_capture?.capture_code || detail?.latest_capture?.captureCode || detail?.latest_capture?.code
          || detail?.latestCapture?.capture_code || detail?.latestCapture?.captureCode || detail?.latestCapture?.code
          || lastSchedule?.capture_code || lastSchedule?.captureCode || lastSchedule?.code || '';
        latest = pool.filter(item => String(item.capture_code || item.captureCode || item.code) === String(resolvedCode)).at(-1) || null;
        if (resolvedCode) captureData = await api(`${base}/captures/${encodeURIComponent(resolvedCode)}`, {signal}).catch(() => null);
      }
      if (location.href !== currentPage || signal.aborted) return;
      // Directory metadata must be filtered against the recording whose media was selected.
      const metadataPage = new URL(currentPage);
      if (resolvedCode) metadataPage.searchParams.set('captureCode', resolvedCode);
      for (const [payload, entity] of [[courseData, 'course'], [captureData, 'capture'], [latest, 'schedule']]) {
        if (!payload) continue;
        if (core.extractUrls) core.extractUrls(payload, currentPage).forEach(url => add(url));
        if (globalThis.PPTCourse) {
          const endpoint = entity === 'course' ? base : entity === 'capture' ? `${base}/captures/${encodeURIComponent(resolvedCode)}` : `${base}/schedules`;
          candidates = PPTCourse.mergeCandidates(candidates, PPTCourse.mediaCandidates(payload, currentPage, endpoint));
          apiCourse = {...apiCourse, ...PPTCourse.fromResponse(payload, metadataPage.href, endpoint)};
        }
      }
      const urls = [...found].slice(-150);
      if (urls.length && chrome.runtime?.id) {
        last = JSON.stringify(urls);
        chrome.runtime.sendMessage({type: 'PPT_MEDIA', ...mediaReply()}).catch(() => {});
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
    if (!core.isCoursePage(page)) throw Error('当前网站支持单视频提取；整课目录暂仅支持思源学堂');
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
  function metadata() {
    if (!core.isCoursePage(location.href)) return window === window.top && document.title ? {name: document.title.trim().slice(0, 120)} : {};
    return globalThis.PPTCourse ? (window === window.top ? {...PPTCourse.fromDocument(document), ...hookCourse, ...apiCourse} : {...hookCourse, ...apiCourse}) : {};
  }
  function add(raw) { const info = core.mediaInfo(raw, document.baseURI || location.href); if (info) found.add(info.url); }
  function mediaReply() {
    const course = metadata(), urls = [...found].slice(-150);
    return {urls, course, page: location.href, candidates: urls.map(url => {
      const candidate = candidates.find(item => item.url === url);
      return {...candidate, url, course: globalThis.PPTCourse ? PPTCourse.forMedia(url, candidates, course) : {}};
    })};
  }
  function report() {
    if (!chrome.runtime?.id) return;
    if (page !== location.href) { checkPage(); probeCurrentPageApi(); }
    const route = pageRoute(), domCandidates = [];
    document.querySelectorAll('video,source,a[href]').forEach(el => {
      for (const raw of [el.currentSrc, el.src || el.href]) {
        add(raw);
        const media = core.mediaInfo(raw, document.baseURI || location.href);
        if (media && route.captureCode && /^(?:VIDEO|SOURCE)$/.test(el.tagName)) domCandidates.push({url: media.url, courseId: route.courseId, captureCode: route.captureCode, course: metadata()});
      }
    });
    if (globalThis.PPTCourse) candidates = PPTCourse.mergeCandidates(domCandidates, candidates);
    performance.getEntriesByType('resource').filter(entry => entry.startTime >= since).forEach(entry => add(entry.name));
    const urls = [...found].slice(-150), text = JSON.stringify([urls, candidates]);
    if (urls.length && text !== last) {
      last = text;
      chrome.runtime.sendMessage({type: 'PPT_MEDIA', ...mediaReply()}).catch(() => {});
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
    checkPage();
    event.data.urls.slice(0, 200).forEach(raw => { if (typeof raw === 'string') add(raw); });
    if (globalThis.PPTCourse && event.data.page === location.href) candidates = PPTCourse.mergeCandidates(candidates, Array.isArray(event.data.candidates) ? event.data.candidates : []);
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
      respond(mediaReply());
      return;
    }
    if (message.type !== 'PPT_DISCOVER') return;
    last = ''; lastCourse = ''; report();
    probeCurrentPageApi().finally(() => {
      respond(mediaReply());
    });
    return true;
  });
  window.__pptContentCollector = async () => { last = ''; lastCourse = ''; report(); await probeCurrentPageApi(); return mediaReply(); };
  setInterval(report, 2000);
  report();
  probeCurrentPageApi();
})();
