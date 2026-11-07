/* Durable lesson metadata shares the existing settings store; image assets stay separate. */
(function (root) {
  'use strict';
  function pageLimit(value) {
    return Number.isInteger(value) && value >= 100 && value <= 20000 ? value : 5000;
  }
  function courseKey(page = '', course = {}) {
    try {
      const url = new URL(page), id = (url.pathname + url.hash).match(/\/(?:my|study)-capture-courses\/([^/?#]+)/)?.[1] || url.searchParams.get('courseId') || url.searchParams.get('course_id');
      if (id) return JSON.stringify([url.origin, id]);
    } catch {}
    return JSON.stringify(['name', String(course.name || '').trim()]);
  }
  function key(source = {}) {
    let identity = source.sourceKey || source.sourceName || '';
    if (identity.startsWith('url:')) {
      try {
        const url = new URL(identity.slice(4));
        // Renewing a known signing parameter does not change the recording; media IDs remain part of its identity.
        if (/\.(?:mp4|webm|m4v|mov|m3u8)$/i.test(url.pathname)) for (const name of [...url.searchParams.keys()]) if (/^(?:token|access_token|auth_key|signature|expires|x-amz-.+|x-oss-.+)$/i.test(name)) url.searchParams.delete(name);
        identity = 'url:' + url.href;
      } catch {}
    }
    return source.batchJobId
      ? JSON.stringify(['batch', courseKey(source.page || source.coursePage, source.course), source.batchJobId])
      : JSON.stringify(['source', source.page || source.coursePage || '', identity, identity ? '' : source.course || {}]);
  }
  function recover(lesson) {
    const copy = structuredClone(lesson);
    if (copy.task?.state === 'running') copy.task.state = 'paused';
    copy.suspects ||= [];
    return copy;
  }
  function mergeRanges(ranges, range) {
    const ordered = [...ranges, range].filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start).map(item => ({...item})).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const item of ordered) {
      const previous = merged.at(-1);
      if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
      else merged.push(item);
    }
    return merged;
  }
  function integrity({batch, lessons = [], pages = [], exportedAt = null, format = null}) {
    // Project an explicit schema. Even legacy IDs and normalized source keys can contain signed URLs.
    const aliases = new Map(), opaque = (kind, value) => {
      if (!value) return null;
      const identity = kind + ':' + String(value);
      if (!aliases.has(identity)) aliases.set(identity, kind + '-' + (aliases.size + 1));
      return aliases.get(identity);
    };
    const id = (kind, value) => Number.isSafeInteger(value) ? value : typeof value === 'string' && /^[\w-]{1,160}$/.test(value) ? value : opaque(kind, value);
    const number = value => Number.isFinite(value) && value >= 0 ? value : null;
    const code = value => typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value) ? value : '';
    const ranges = values => (Array.isArray(values) ? values : []).filter(item => item && number(item.start) !== null && number(item.end) !== null && item.end >= item.start)
      .map(item => ({start: item.start, end: item.end, ...(number(item.time) !== null ? {time: item.time} : {})}));
    const discovery = value => ({state: ['ready', 'error', 'pending', 'skipped', 'unavailable'].includes(value?.state) ? value.state : 'unknown',
      code: code(value?.code), attempts: number(value?.attempts)});
    const jobs = batch?.jobs || [], rows = lessons.map(lesson => ({lesson, job: jobs.find(job => job.id === lesson.source?.batchJobId)}));
    for (const job of jobs) if (!rows.some(row => row.job === job)) rows.push({lesson: null, job});
    const result = rows.map(({lesson, job}) => {
      const task = lesson?.task, coverage = task?.coverage, duration = number(task?.duration), source = lesson?.source || {};
      const track = key({sourceKey: source.sourceKey || (source.url ? 'url:' + source.url : ''), sourceName: source.sourceName});
      const validRanges = ranges(coverage?.ranges);
      const verified = !!(coverage?.version === 1 && duration > 0 && coverage.duration === duration
        && (!Number.isFinite(source.duration) || source.duration === duration) && coverage.sourceKey === key(source)
        && coverage.trackKey === track && Array.isArray(coverage.ranges) && validRanges.length === coverage.ranges.length
        && validRanges.every(range => range.end <= duration));
      const merged = verified ? validRanges.reduce((list, range) => mergeRanges(list, range), []) : [];
      const reachedEnd = verified && coverage.reachedEnd === true && merged[0]?.start === 0 && merged[0].end >= duration - Math.min(.05, duration / 2);
      const retained = lesson ? pages.filter(page => page.lessonId === lesson.id).sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)) : [];
      return {lessonId: id('lesson', lesson?.id), jobId: id('job', job?.id || source.batchJobId), excluded: job?.selected === false || job?.discovery?.state === 'skipped',
        discovery: discovery(job?.discovery), savedPages: retained.length,
        scan: {verified, reachedEnd, state: reachedEnd ? 'reached-end' : verified ? 'partial' : task ? 'legacy-unknown' : 'not-started',
          taskState: ['running', 'paused', 'failed', 'done'].includes(task?.state) ? task.state : null, duration, checkpoint: number(task?.checkpoint),
          coverage: coverage ? {version: 1, sourceKey: opaque('source', coverage.sourceKey), trackKey: opaque('track', coverage.trackKey),
            duration: number(coverage.duration), ranges: merged, reachedEnd: verified && coverage.reachedEnd === true} : null,
          suspects: ranges(lesson?.suspects)},
        knowledge: {state: ['reviewed', 'partial'].includes(lesson?.knowledge?.state) ? lesson.knowledge.state : 'unreviewed'},
        exportPages: retained.map(page => ({id: id('page', page.id), sourceTime: number(page.sourceTime)}))};
    });
    const metadata = batch?.discovery;
    const failures = (metadata?.failures || []).filter(item => !item.jobId).map(item => ({code: code(item.code), status: number(item.status), attempts: number(item.attempts)}));
    const directory = {state: metadata?.complete === true ? 'complete' : metadata?.complete === false ? 'incomplete' : 'unknown',
      total: Number.isSafeInteger(metadata?.total) && metadata.total >= 0 ? metadata.total : null, known: jobs.length, eligible: number(metadata?.eligible), failures};
    const summary = {notReachedEnd: result.filter(item => !item.scan.reachedEnd).length, directoryFailures: failures.length,
      directoryUnknown: directory.state === 'unknown' ? 1 : 0, discoveryFailures: result.filter(item => item.discovery.state === 'error').length,
      discoveryUnknown: result.filter(item => ['unknown', 'pending', 'unavailable'].includes(item.discovery.state)).length,
      suspectRanges: result.reduce((sum, item) => sum + item.scan.suspects.length, 0), emptyLessons: result.filter(item => !item.savedPages).length,
      excluded: result.filter(item => item.excluded).length};
    const snapshot = result.filter(item => item.exportPages.length).map(item => ({lessonId: item.lessonId, pages: item.exportPages}));
    return {version: 1, complete: directory.state === 'complete' && directory.total === jobs.length && result.length > 0
        && !summary.notReachedEnd && !summary.suspectRanges && !summary.directoryFailures && !summary.discoveryFailures && !summary.discoveryUnknown,
      directory, summary, lessons: result.map(({exportPages, ...item}) => item), pageIds: snapshot.flatMap(item => item.pages.map(page => page.id)),
      export: {exportedAt: typeof exportedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(exportedAt) ? exportedAt : null,
        format: ['pdf', 'zip'].includes(format) ? format : null, lessons: snapshot}};
  }
  function transaction(db, stores, action, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const tx = db.transaction(stores, 'readwrite'); let result, abortReason, settled = false;
      const finish = (settle, value) => {
        if (settled) return; settled = true;
        signal?.removeEventListener('abort', abort);
        tx.oncomplete = tx.onerror = tx.onabort = null; settle(value);
      };
      const abort = () => {
        abortReason = signal.reason;
        try { tx.abort(); }
        catch (error) {
          // A committed transaction cannot be rolled back; its completion still publishes the binding.
          abortReason = undefined;
          if (error.name !== 'InvalidStateError') finish(reject, error);
        }
      };
      tx.oncomplete = () => finish(resolve, typeof result === 'function' ? result() : result);
      tx.onerror = tx.onabort = () => finish(reject, abortReason ?? tx.error ?? Error('课次信息保存失败'));
      signal?.addEventListener('abort', abort, {once: true});
      try { result = action(tx); } catch (error) { tx.abort(); finish(reject, error); }
    });
  }
  function saveBatch(settings, snapshot) {
    const name = 'batch:' + snapshot.page;
    if (snapshot.discovery !== undefined) { settings.put(snapshot, name); return; }
    const read = settings.get(name);
    read.onsuccess = () => {
      if (read.result?.discovery !== undefined) snapshot.discovery = structuredClone(read.result.discovery);
      settings.put(snapshot, name);
    };
  }
  function put(db, lesson, relatedBatch = null) {
    const snapshot = structuredClone(lesson), batchSnapshot = relatedBatch && structuredClone(relatedBatch);
    return transaction(db, ['settings'], tx => {
      const settings = tx.objectStore('settings');
      settings.put(snapshot, 'lesson:' + snapshot.id);
      if (batchSnapshot) saveBatch(settings, batchSnapshot);
    });
  }
  function activate(db, id) {
    return transaction(db, ['settings'], tx => { tx.objectStore('settings').put(id, 'activeLesson'); });
  }
  function bind(db, lesson, {signal} = {}) {
    const snapshot = structuredClone(lesson);
    return transaction(db, ['settings'], tx => {
      const settings = tx.objectStore('settings');
      settings.put(snapshot, 'lesson:' + snapshot.id); settings.put(snapshot.id, 'activeLesson');
    }, signal);
  }
  function batch(db, page, jobs, discovery = undefined) {
    const snapshot = structuredClone({page, jobs, ...(discovery === undefined ? {} : {discovery})});
    return transaction(db, ['settings'], tx => { saveBatch(tx.objectStore('settings'), snapshot); });
  }
  function restore(db) {
    return transaction(db, ['pages', 'settings'], tx => {
      const pagesStore = tx.objectStore('pages'), settings = tx.objectStore('settings');
      const pageRead = pagesStore.getAll(), values = settings.getAll(), keys = settings.getAllKeys();
      let result;
      keys.onsuccess = () => {
        try {
          const saved = new Map(keys.result.map((key, i) => [key, values.result[i]]));
          const lessons = [...saved].filter(([key]) => typeof key === 'string' && key.startsWith('lesson:')).map(([, lesson]) => recover(lesson));
          const known = new Map(lessons.map(lesson => [lesson.id, lesson])), naming = saved.get('exportNaming');
          const pages = pageRead.result.sort((a, b) => (Number.isFinite(a.order) ? a.order : a.id) - (Number.isFinite(b.order) ? b.order : b.id));
          const needsOrder = pages.some(page => !Number.isFinite(page.order));
          for (const [index, page] of pages.entries()) {
            const migrated = !page.lessonId;
            page.lessonId ||= 'legacy:' + key(page);
            if (needsOrder) page.order = (index + 1) * 1024;
            if (migrated || needsOrder) pagesStore.put(page);
            if (!known.has(page.lessonId)) {
              const source = {kind: page.sourceKey?.startsWith('file:') ? 'file' : 'remote', sourceKey: page.sourceKey || '', sourceName: page.sourceName || '历史截图', page: page.coursePage || '', batchJobId: page.batchJobId || ''};
              if (page.sourceKey?.startsWith('url:')) source.url = page.sourceKey.slice(4);
              const lesson = {id: page.lessonId, course: {...page.course}, page: page.coursePage || '', source, suspects: [], created: page.time || Date.now(), namingManual: false};
              known.set(lesson.id, lesson); lessons.push(lesson);
            }
          }
          const activeId = known.has(saved.get('activeLesson')) ? saved.get('activeLesson') : lessons[0]?.id || '';
          const active = known.get(activeId);
          // The legacy naming belongs to the old view, and must not overwrite later per-lesson edits.
          if (active && !saved.has('lesson:' + active.id) && naming && (lessons.length === 1 || naming.page === active.page)) {
            active.course = {...naming.course}; active.page = naming.page || active.page; active.namingManual = !!naming.manual;
          }
          for (const lesson of lessons) settings.put(lesson, 'lesson:' + lesson.id);
          settings.put(activeId, 'activeLesson');
          const batches = [...saved].filter(([key]) => typeof key === 'string' && key.startsWith('batch:')).map(([, value]) => ({...value, jobs: value.jobs.map(job => ({...job, state: ['loading', 'scanning'].includes(job.state) ? 'stopped' : job.state}))}));
          result = {pages, lessons, activeId, batches, naming};
        } catch (error) { tx.abort(); }
      };
      return () => result;
    });
  }
  function remove(db, {lessonIds, course = null, undoIds = []}) {
    const wanted = new Set(lessonIds);
    return transaction(db, ['pages', 'assets', 'settings'], tx => {
      const pageStore = tx.objectStore('pages'), assets = tx.objectStore('assets'), settings = tx.objectStore('settings');
      const pageRead = pageStore.getAll(), values = settings.getAll(), keys = settings.getAllKeys();
      let result;
      keys.onsuccess = () => {
        try {
          const saved = new Map(keys.result.map((key, i) => [key, values.result[i]]));
          const storedLessons = [...saved].filter(([key]) => typeof key === 'string' && key.startsWith('lesson:')).map(([, value]) => value);
          const removed = storedLessons.filter(lesson => wanted.has(lesson.id));
          const lessons = storedLessons.filter(lesson => !wanted.has(lesson.id));
          const pages = pageRead.result.filter(page => !wanted.has(page.lessonId)), retained = new Set(pages.map(page => page.id));
          for (const page of pageRead.result) if (wanted.has(page.lessonId)) { pageStore.delete(page.id); assets.delete(page.id); }
          // Only this view's explicitly removed undo assets are ours to discard. Other live leases stay intact.
          for (const id of undoIds) if (!retained.has(id)) assets.delete(id);
          for (const id of wanted) settings.delete('lesson:' + id);
          const batches = [];
          for (const [name, value] of saved) {
            if (typeof name !== 'string' || !name.startsWith('batch:')) continue;
            if (course !== null && courseKey(value.page, value.jobs[0]?.course) === course) { settings.delete(name); continue; }
            const jobs = value.jobs.filter(job => !removed.some(lesson => lesson.source?.batchJobId === job.id && courseKey(lesson.page, lesson.course) === courseKey(value.page, job.course)));
            const next = {...value, jobs}; settings.put(next, name); batches.push(next);
          }
          const oldActive = saved.get('activeLesson');
          const activeId = wanted.has(oldActive) ? lessons[0]?.id || '' : oldActive || '';
          settings.put(activeId, 'activeLesson');
          let naming = saved.get('exportNaming');
          if (wanted.has(oldActive)) {
            const active = lessons.find(lesson => lesson.id === activeId);
            naming = {course: active?.course || {}, page: active?.page || '', manual: !!active?.namingManual};
            settings.put(naming, 'exportNaming');
          }
          result = {lessons, pages, batches, activeId, naming};
        } catch { tx.abort(); }
      };
      return () => result;
    });
  }
  const api = {pageLimit, key, courseKey, recover, mergeRanges, integrity, restore, put, activate, bind, batch, remove};
  root.PPTLibrary = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
