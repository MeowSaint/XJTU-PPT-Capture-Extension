(() => {
  const core = globalThis.PPTCore;
  if (!core) return;
  if (window.__pptContentCollector) return;
  window.__pptContentCollector = true;
  const found = new Set();
  let last = '', page = location.href, since = 0;
  let hookCourse = {}, lastCourse = '';
  async function api(path) {
    const response = await fetch(path, {credentials: 'include', headers: {'accept': 'application/json'}});
    if (!response.ok) throw Error(`课程接口返回 HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!/json/i.test(type)) throw Error('课程接口没有返回 JSON，请确认登录状态');
    return response.json();
  }
  async function batchDiscover() {
    if (window !== window.top || !globalThis.PPTBatch) throw Error('批量读取只能在课程列表主页面运行');
    const courseId = PPTBatch.courseId(location.href);
    if (!courseId) throw Error('请打开形如“课程 / preview-detail”的录像列表页，不要进入某一节录像');
    const base = `/api/frontend/study-capture-courses/${encodeURIComponent(courseId)}`;
    const scheduleData = await api(`${base}/schedules?in_course_preview=false`), all = PPTBatch.schedules(scheduleData);
    const available = all.filter(PPTBatch.eligible).sort((a, b) => String(a.start_time || a.startTime || '').localeCompare(String(b.start_time || b.startTime || '')));
    const courseName = all.find(item => item.course?.name)?.course?.name || metadata().name || '';
    const jobs = [], failures = [];
    let cursor = 0;
    async function worker() {
      while (cursor < available.length) {
        const schedule = available[cursor++], code = schedule.capture_code || schedule.captureCode;
        try {
          const capture = await api(`${base}/captures/${encodeURIComponent(code)}?in_course_preview=false`);
          const item = PPTBatch.job(schedule, capture, courseName);
          if (item) jobs.push(item); else failures.push({scheduleId: schedule.id, reason: '没有找到可用的 2 路或 0 路视频'});
        } catch (error) { failures.push({scheduleId: schedule.id, reason: error.message}); }
      }
    }
    await Promise.all(Array.from({length: Math.min(4, available.length)}, worker));
    jobs.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    return {courseId, courseName, total: all.length, eligible: available.length, jobs, failures, page: location.href};
  }
  function metadata() { return window === window.top && globalThis.PPTCourse ? {...hookCourse, ...PPTCourse.fromDocument(document)} : {}; }
  function add(raw) { const info = core.mediaInfo(raw, document.baseURI || location.href); if (info) found.add(info.url); }
  function report() {
    if (!chrome.runtime?.id) return;
    if (page !== location.href) { found.clear(); last = ''; hookCourse = {}; lastCourse = ''; page = location.href; since = performance.now(); }
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
    if (message.type === 'PPT_BATCH_DISCOVER') {
      batchDiscover().then(result => respond({ok: true, ...result}), error => respond({ok: false, error: error.message}));
      return true;
    }
    if (message.type !== 'PPT_DISCOVER') return;
    last = ''; report(); respond({urls: [...found].slice(-150), course: metadata(), page: location.href});
  });
  setInterval(report, 2000);
  report();
})();
