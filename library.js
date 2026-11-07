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
  function transaction(db, stores, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite'); let result;
      tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('课次信息保存失败'));
      try { result = action(tx); } catch (error) { tx.abort(); reject(error); }
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
  const api = {pageLimit, key, courseKey, recover, mergeRanges, restore, put, activate, batch, remove};
  root.PPTLibrary = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
