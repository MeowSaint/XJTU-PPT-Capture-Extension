/* Course-list batch discovery helpers shared by content and tool pages. */
(function (root) {
  'use strict';
  function courseId(page) {
    try {
      const url = new URL(page);
      return (url.pathname + url.hash).match(/\/(?:my|study)-capture-courses\/([^/?#]+)\/preview-detail(?:\/([^/?#]+))?/)?.[1]
        || url.searchParams.get('courseId')
        || url.searchParams.get('course_id')
        || '';
    } catch { return ''; }
  }
  function payload(value) {
    for (let n = 0; n < 10 && value?.data && !Array.isArray(value); n++) value = value.data;
    return value;
  }
  function directory(value) {
    let next;
    for (let n = 0; n < 20 && value && !Array.isArray(value); n++) {
      if (Object.hasOwn(value, 'next')) next = value.next;
      const inner = value.data ?? value.results ?? value.items;
      if (inner === undefined) break;
      value = inner;
    }
    return {rows: (Array.isArray(value) ? value : []).filter(row => row && typeof row === 'object'), next, valid: Array.isArray(value)};
  }
  function schedules(value) { return directory(value).rows; }
  function failure(code, message, status = 0, attempts = 0) {
    return Object.assign(Error(message), {code, status, attempts});
  }
  function cancelled(attempts = 0) { return failure('CANCELLED', '读取已停止', 0, attempts); }
  function wait(ms, signal, attempts) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(cancelled(attempts)); };
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, {once: true});
      timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    });
  }
  async function requestJSON(path, {signal, fetchImpl = globalThis.fetch, timeoutMs = 15000, retries = 2, retryDelays = [500, 1500]} = {}) {
    for (let attempts = 1; ; attempts++) {
      if (signal?.aborted) throw cancelled(attempts - 1);
      const controller = new AbortController(); let timer, abort;
      try {
        const boundary = new Promise((_, reject) => {
          abort = () => { reject(cancelled(attempts)); controller.abort(); };
          signal?.addEventListener('abort', abort, {once: true});
          timer = setTimeout(() => { reject(failure('TIMEOUT', '课程接口读取超时', 0, attempts)); controller.abort(); }, timeoutMs);
        });
        const operation = (async () => {
          const response = await fetchImpl(path, {signal: controller.signal, credentials: 'include', headers: {accept: 'application/json'}});
          if (!response.ok) throw failure('HTTP', `课程接口返回 HTTP ${response.status}`, response.status, attempts);
          if (!/json/i.test(response.headers.get('content-type') || '')) throw failure('NON_JSON', '课程接口没有返回 JSON，请确认登录状态', response.status, attempts);
          try { return await response.json(); }
          catch (error) { if (error instanceof SyntaxError || error.name === 'SyntaxError') throw failure('NON_JSON', '课程接口返回了无效 JSON', response.status, attempts); throw error; }
        })();
        return await Promise.race([operation, boundary]);
      } catch (error) {
        controller.abort();
        const current = signal?.aborted ? cancelled(attempts) : ['HTTP', 'NON_JSON', 'TIMEOUT', 'CANCELLED'].includes(error.code) ? error : failure('NETWORK', error.message || '课程接口网络错误', 0, attempts);
        const retryable = ['NETWORK', 'TIMEOUT'].includes(current.code) || current.code === 'HTTP' && (current.status === 408 || current.status === 429 || current.status >= 500);
        if (!retryable || attempts > retries) throw current;
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        await wait(retryDelays[attempts - 1] ?? retryDelays.at(-1) ?? 0, signal, attempts);
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
  }
  async function discover({page, readJSON, signal, previous = [], retryOnly = false, onProgress = () => {}}) {
    const id = courseId(page);
    if (!id) throw failure('COURSE', '请回到这门课的录像列表页，再读取课次');
    const base = `/api/frontend/study-capture-courses/${encodeURIComponent(id)}`, endpoint = new URL(base + '/schedules', page);
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) abort();
    const jobs = structuredClone(previous), byId = new Map(jobs.map(item => [item.id, item]));
    for (const item of jobs) item.discovery ||= {state: item.url ? 'ready' : 'unavailable', code: '', message: '', attempts: 0};
    const result = {courseId: id, courseName: jobs[0]?.course?.name || '', total: jobs.length, eligible: 0, jobs, failures: [], page, complete: false};
    let publication = Promise.resolve(), publicationError, enumerated = false, phase = 'schedules';
    const detailFailures = new Map(jobs.filter(item => item.discovery.state === 'error').map(item => [item.id, {jobId: item.id, scheduleId: item.scheduleId, ...item.discovery}]));
    const publish = () => {
      result.jobs.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
      result.total = jobs.length;
      result.eligible = jobs.filter(item => item.discovery?.state !== 'skipped').length;
      result.failures = [...result.failures.filter(item => !item.jobId), ...detailFailures.values()];
      result.progress = {phase, resolved: jobs.filter(item => item.discovery?.state !== 'pending').length, total: jobs.length};
      const snapshot = structuredClone(result);
      publication = publication.then(() => onProgress(snapshot)).catch(error => { publicationError = error; controller.abort(); throw error; });
      return publication;
    };
    const state = (item, name, code = '', message = '', attempts = 0) => { item.discovery = {state: name, code, message, attempts}; };
    const queue = [];
    try {
      if (retryOnly) {
        for (const item of jobs) {
          item.discovery ||= {state: item.url ? 'ready' : 'unavailable', code: '', message: '', attempts: 0};
          if (item.discovery.state === 'error' && item.captureCode) { detailFailures.delete(item.id); state(item, 'pending'); queue.push(item); }
        }
        await publish();
      } else {
        let next = new URL(endpoint); next.searchParams.set('in_course_preview', 'false');
        const visited = new Set();
        for (let n = 0; next && !controller.signal.aborted; n++) {
          if (n === 100 || visited.has(next.href)) {
            result.failures.push({code: n === 100 ? 'PAGINATION_LIMIT' : 'PAGINATION_LOOP', message: n === 100 ? '课程目录超过 100 页，已保留已知课次' : '课程目录分页出现循环，已保留已知课次', attempts: 0}); break;
          }
          visited.add(next.href);
          let value;
          try { value = await readJSON(next.href, {signal: controller.signal}); }
          catch (error) { result.failures.push({code: error.code || 'NETWORK', message: error.message, status: error.status || 0, attempts: error.attempts || 0}); break; }
          const listing = directory(value);
          if (!listing.valid) { result.failures.push({code: 'DIRECTORY_JSON', message: '课程目录响应没有可识别的课次数组', attempts: 0}); break; }
          for (const row of listing.rows) {
            const captureCode = String(row.capture_code || row.captureCode || ''), key = captureCode || String(row.id || '');
            if (!key) continue;
            let item = byId.get(key) || jobs.find(old => row.id && old.scheduleId === String(row.id));
            if (item && queue.includes(item)) continue;
            const started = row.start_time || row.startTime || '', parts = dateTime(started);
            result.courseName ||= row.course?.name || row.name || '';
            if (!item) {
              item = {id: key, scheduleId: String(row.id || ''), captureCode, course: {name: row.course?.name || result.courseName || '课程PPT', ...parts}, startTime: started, selected: false, state: 'pending'};
              jobs.push(item); byId.set(key, item);
            }
            item.scheduleId = String(row.id || item.scheduleId || ''); item.captureCode = captureCode;
            item.scheduleStatus = row.status || ''; detailFailures.delete(item.id);
            if (eligible(row)) { state(item, 'pending'); queue.push(item); }
            else state(item, 'skipped', 'INELIGIBLE', captureCode ? `课次尚不可用（${row.status || '未知状态'}）` : '课次缺少录像编号');
          }
          await publish();
          if (!listing.next) { enumerated = true; break; }
          try {
            const candidate = new URL(listing.next, next);
            if (candidate.origin !== endpoint.origin || candidate.pathname !== endpoint.pathname || candidate.username || candidate['pass' + 'word'] || candidate.hash) throw Error();
            next = candidate;
          } catch { result.failures.push({code: 'PAGINATION_URL', message: '拒绝不属于本课程目录的分页地址', attempts: 0}); break; }
        }
      }
      // Old rows remain part of a partial refresh, and every persisted row gets an explicit state.
      for (const item of jobs) item.discovery ||= {state: item.url ? 'ready' : 'unavailable', code: '', message: '', attempts: 0};
      phase = 'details'; await publish();
      let cursor = 0;
      async function worker() {
        while (cursor < queue.length && !controller.signal.aborted) {
          const item = queue[cursor++];
          try {
            const detail = await readJSON(`${base}/captures/${encodeURIComponent(item.captureCode)}?in_course_preview=false`, {signal: controller.signal});
            if (controller.signal.aborted) break;
            const discovered = job({id: item.scheduleId, capture_code: item.captureCode, start_time: item.startTime, course: item.course}, detail, result.courseName);
            if (discovered) {
              const existed = previous.find(old => old.id === item.id || old.scheduleId && old.scheduleId === item.scheduleId);
              const retained = {...item};
              Object.assign(item, discovered, existed ? retained : {});
              // Refresh media metadata while retaining extraction, selection, crop and history fields.
              for (const key of ['url', 'sourceName', 'label', 'size', 'options', 'requiresCrop']) item[key] = discovered[key];
              state(item, 'ready', '', '', 1);
            } else state(item, 'unavailable', 'NO_VIDEO', '没有找到可用的 2 路或 0 路视频', 1);
          } catch (error) {
            state(item, 'error', error.code || 'NETWORK', error.message || '详情读取失败', error.attempts || 1);
            detailFailures.set(item.id, {jobId: item.id, scheduleId: item.scheduleId, ...item.discovery, status: error.status || 0});
          }
          await publish();
        }
      }
      const workers = await Promise.allSettled(Array.from({length: Math.min(4, queue.length)}, worker));
      if (publicationError) throw publicationError;
      const rejected = workers.find(item => item.status === 'rejected'); if (rejected) throw rejected.reason;
      if (controller.signal.aborted) {
        for (const item of jobs) if (item.discovery.state === 'pending') {
          state(item, 'error', 'CANCELLED', '读取已停止');
          detailFailures.set(item.id, {jobId: item.id, scheduleId: item.scheduleId, ...item.discovery});
        }
      }
      phase = controller.signal.aborted ? 'cancelled' : 'done';
      result.complete = enumerated && !controller.signal.aborted;
      await publish(); return result;
    } finally { signal?.removeEventListener('abort', abort); }
  }
  function dateTime(value) {
    return root.PPTCourse?.startParts(value) || {};
  }
  function videoList(value) {
    const detail = payload(value) || {};
    return detail.lesson_videos || detail.lessonVideos || detail.videos || detail.record?.videos || [];
  }
  function videoName(video) { return String(video.file_key || video.fileKey || video.download_url || video.downloadUrl || ''); }
  function videoURL(video) { return video.download_url || video.downloadUrl || video.play_url || video.playUrl || ''; }
  function selectVideo(value) {
    const videos = videoList(value).filter(video => video && typeof video === 'object');
    return videos.find(video => String(video.label || '').toUpperCase() === 'ENCODER' && /(?:^|\/)2-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)))
      || videos.find(video => /(?:^|\/)2-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)))
      || videos.find(video => String(video.label || '').toUpperCase() === 'ENCODER' && !/(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)))
      || null;
  }
  function fallbackVideos(value) {
    return videoList(value).filter(video => video && typeof video === 'object'
      && /^https?:\/\//i.test(videoURL(video))
      && /(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(videoName(video)));
  }
  function option(video) {
    const url = videoURL(video);
    return {url, sourceName: String(video.file_key || video.fileKey || new URL(url).pathname.split('/').pop() || '0.mp4'), label: String(video.label || ''), size: Number(video.size) || 0};
  }
  function job(schedule, capture, fallbackCourseName = '') {
    let video = selectVideo(capture), requiresCrop = false, options = [];
    let url = video && videoURL(video);
    if (!video || !/^https?:\/\//i.test(url)) {
      options = fallbackVideos(capture).map(option);
      if (!options.length) return null;
      requiresCrop = true; video = null; ({url} = options[0]);
    }
    const captureCode = schedule.capture_code || schedule.captureCode || payload(capture)?.code || '';
    const started = schedule.start_time || schedule.startTime || '', parts = dateTime(started);
    const course = schedule.course || {}, name = course.name || schedule.name || fallbackCourseName || '课程PPT';
    return {
      id: String(captureCode || schedule.id), scheduleId: String(schedule.id || ''), captureCode: String(captureCode),
      url, sourceName: requiresCrop ? options[0].sourceName : String(video.file_key || video.fileKey || new URL(url).pathname.split('/').pop() || '2.mp4'),
      course: {name, date: parts.date, start: parts.start}, startTime: started,
      label: requiresCrop ? options[0].label : String(video.label || ''), size: requiresCrop ? options[0].size : Number(video.size) || 0,
      options, requiresCrop, cropConfirmed: false, selected: !requiresCrop, state: requiresCrop ? 'needs-crop' : 'pending'
    };
  }
  function eligible(schedule) {
    const status = String(schedule?.status || '').toUpperCase();
    return !!(schedule?.capture_code || schedule?.captureCode) && !['UPCOMING', 'TRANSCODING', 'LIVE', 'CANCELLED'].includes(status);
  }
  function trackKey(source) {
    return root.PPTLibrary.key({sourceKey: source?.sourceKey || (source?.url ? 'url:' + source.url : ''), sourceName: source?.sourceName});
  }
  function zeroTrack(source) { return /(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(source?.sourceName || ''); }
  function validCrop(rect) {
    return !!rect && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= 1 && rect.y + rect.h <= 1;
  }
  function cropMatches(override, source, aspect) {
    return validCrop(override?.crop) && Number.isFinite(override.aspect) && override.aspect > 0 && Number.isFinite(aspect) && aspect > 0 && zeroTrack(source)
      && override.track === trackKey(source) && Math.abs(aspect / override.aspect - 1) <= .01 + Number.EPSILON;
  }
  function automatic(job) {
    if (job.discovery && (job.discovery.state !== 'ready' || !job.url)) return false;
    return !job.requiresCrop || !!(job.cropConfirmed && job.cropOverride && !job.cropRejected);
  }
  const api = {courseId, schedules, selectVideo, fallbackVideos, job, eligible, trackKey, zeroTrack, validCrop, cropMatches, automatic, requestJSON, discover};
  root.PPTBatch = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
