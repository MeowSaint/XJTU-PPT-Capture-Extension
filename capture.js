'use strict';
const $ = id => document.getElementById(id), video = $('video'), overlay = $('overlay');
const status = message => { $('status').textContent = message; syncWorkspace(); };
let db, pages = [], ready = false, sourceReady = false, studyAccepted = false, stream = null, hls = null, objectURL = null;
let crop = {x: 0, y: 0, w: 1, h: 1}, drag = null, task = null, sourceName = '', sources = [], pendingOrigins = [], pendingURL = '';
let realtimeTimer = null, realtimeBusy = false, candidate = null, candidateSince = 0, last = null, coursePage = '';
let ignoreRect = null, selectionMode = null, selectionRect = null, dedupeContext = null;
let draggedPageId = null, reviewBusy = false, exportBusy = false, pageWrites = 0, undoState = null;
let selectedPages = new Set(), selectionAnchor = null, previewPageId = null, previewReturn = null, loadedIdentity = null;
let similarReview = null;
let batchJobs = [], batchPage = '', batchRunning = false, batchStopRequested = false, activeBatchJob = null, batchDiscoverySerial = 0;
const referrerRule = 16220;
let referrerOrigins = new Set(), referrerPage = '', referrerWrites = Promise.resolve();
let sourceCourse = {}, sourceCoursePage = '', namingPage = '', namingManual = false, namingSave = Promise.resolve(), discoverySerial = 0;
let videoCache = null, previewURL = null, previewLoadingId = null, previewRevision = 0;
let allPages = [], lessons = [], activeLesson = null, savedBatches = [], lessonSave = Promise.resolve(), scanId = '';
let savedPDFOptions = {layout: 'single', timestamps: false, bookmarks: false};
const dbReady = PPTPageStore.open({blocked: () => status('请先关掉其他已打开的截取工具页，再刷新本页。')}).then(async database => {
  db = database;
  const pdf = await new Promise((resolve, reject) => {
    const tx = db.transaction('settings'), request = tx.objectStore('settings').get('exportPDF');
    tx.oncomplete = () => resolve(request.result); tx.onerror = tx.onabort = () => reject(tx.error || Error('PDF 设置读取失败'));
  });
  applyPDFOptions(pdf); savedPDFOptions = pdfOptions();
  await PPTPageStore.prune(db);
  const saved = await PPTLibrary.restore(db);
  allPages = saved.pages; lessons = saved.lessons; savedBatches = saved.batches;
  activeLesson = lessons.find(lesson => lesson.id === saved.activeId) || null;
  if (activeLesson) applyLesson();
  else { namingManual = !!saved.naming?.manual; setNaming(saved.naming?.course || sourceCourse, saved.naming?.page || sourceCoursePage); }
  const batch = savedBatches.find(item => item.page === activeLesson?.page) || savedBatches[0];
  if (batch) { batchPage = batch.page; batchJobs = structuredClone(batch.jobs); renderBatchJobs(); }
  ready = true; render(); renderLibrary(); controls();
});
dbReady.then(() => status('已恢复保存的课次和任务。选择课次后重新加载原视频，即可继续提取或复核。')).catch(e => status('本地存储不可用：' + e.message));
function namingInfo() { return PPTCourse.normalize({name: $('course-name').value, date: $('course-date').value, start: $('course-start').value}); }
function scanSettings() { return {step: Number($('mode').value), threshold: Math.max(0.2, Math.min(10, Number($('diff').value) || 1.2)), dedupe: $('dedupe').checked, stable: Number($('stable').value) || 1.5}; }
function syncAllPages() {
  if (activeLesson) allPages = [...allPages.filter(page => page.lessonId !== activeLesson.id), ...pages];
}
function lessonLabel(lesson) { return [lesson.course?.name || lesson.source?.sourceName || '未命名课次', lesson.course?.date, lesson.course?.start?.slice(0, 5)].filter(Boolean).join(' · '); }
function normalizedIgnore(rect) {
  try { return PPTCore.ignoreMask(rect) ? {x: rect.x, y: rect.y, w: rect.w, h: rect.h} : null; }
  catch { return null; }
}
function sameCrop(a, b) { return !!a && !!b && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(a[key]) && a[key] === b[key]); }
function applyLesson() {
  releaseDedupeContext();
  pages = allPages.filter(page => page.lessonId === activeLesson.id).sort((a, b) => a.order - b.order);
  namingManual = !!activeLesson.namingManual; setNaming(activeLesson.course || {}, activeLesson.page || '');
  sourceName = activeLesson.source?.sourceName || ''; sourceCourse = {...activeLesson.course}; sourceCoursePage = activeLesson.page || '';
  crop = {...(activeLesson.crop || {x: 0, y: 0, w: 1, h: 1})};
  ignoreRect = normalizedIgnore(activeLesson.ignoreRect);
  const saved = activeLesson.settings || activeLesson.task?.settings || {};
  const settings = {step: [0.5, 2, 8].includes(saved.step) ? saved.step : 0.5,
    threshold: Number.isFinite(saved.threshold) && saved.threshold >= 0.2 && saved.threshold <= 10 ? saved.threshold : 1.2,
    dedupe: typeof saved.dedupe === 'boolean' ? saved.dedupe : true,
    stable: Number.isFinite(saved.stable) && saved.stable >= 0.5 && saved.stable <= 10 ? saved.stable : 1.5};
  $('mode').value = String(settings.step); $('diff').value = settings.threshold; $('dedupe').checked = settings.dedupe; $('stable').value = settings.stable;
  selectedPages.clear(); selectionAnchor = null; previewPageId = null; last = candidate = null; candidateSince = 0; cancelSelection();
}
function persistLesson(lesson = activeLesson, relatedBatch = null) {
  if (!lesson) return Promise.resolve();
  if (lesson === activeLesson) Object.assign(lesson, {course: namingInfo(), page: namingPage || lesson.page || '', namingManual, settings: scanSettings(), crop: {...crop}, ignoreRect: ignoreRect && {...ignoreRect}});
  const snapshot = structuredClone(lesson), batchSnapshot = relatedBatch && structuredClone(relatedBatch);
  lessonSave = lessonSave.catch(() => {}).then(() => PPTLibrary.put(db, snapshot, batchSnapshot)).then(() => {
    if (batchSnapshot) retainBatch(batchSnapshot);
  });
  return lessonSave;
}
function saveLessonSettings() {
  if (!ready) return;
  persistLesson(activeLesson, activeBatchJob?.requiresCrop ? jobBatch() : null).then(renderLibrary).catch(e => status('课次设置保存失败：' + e.message));
}
function sameMediaSource(a, b) {
  if (!a || !b) return false;
  return PPTBatch.trackKey(a) === PPTBatch.trackKey(b);
}
async function bindLesson(source) {
  await dbReady; await lessonSave;
  const key = PPTLibrary.key(source);
  let lesson = lessons.find(item => item.source && PPTLibrary.key(item.source) === key);
  if (!lesson) {
    lesson = {id: crypto.randomUUID(), course: {...sourceCourse}, page: source.page || '', source, crop: {x: 0,y: 0,w: 1,h: 1}, settings: {...scanSettings(), step: 0.5}, suspects: [], created: Date.now(), namingManual: false};
    if (!activeLesson) { lesson.course = namingInfo(); lesson.namingManual = namingManual; }
    await PPTLibrary.put(db, lesson); lessons.push(lesson);
  } else {
    const changedChannel = source.batchJobId && !sameMediaSource(lesson.source, source);
    const next = {...lesson, source: {...lesson.source, ...source}, ...(changedChannel ? {crop: {x: 0,y: 0,w: 1,h: 1}, ignoreRect: null, task: null, suspects: []} : {})};
    await PPTLibrary.put(db, next); Object.assign(lesson, next);
    if (changedChannel && activeBatchJob) activeBatchJob.cropConfirmed = false;
  }
  await PPTLibrary.activate(db, lesson.id); syncAllPages(); forgetUndo(); activeLesson = lesson; applyLesson();
  render(); renderLibrary(); draw();
}
async function switchLesson(id) {
  if (busy() || !ready) return;
  const next = lessons.find(lesson => lesson.id === id); if (!next || next === activeLesson) return;
  reviewBusy = true; controls();
  try {
    await persistLesson(); await PPTLibrary.activate(db, id); await releaseSource();
    syncAllPages(); forgetUndo(); activeBatchJob = null; activeLesson = next; applyLesson();
    $('lightbox').close(); render(); renderLibrary(); draw(); status('已切换课次。截图可直接整理和导出；继续提取需重新加载原视频。');
  } catch (e) { status('切换课次失败：' + e.message); }
  finally { reviewBusy = false; renderLibrary(); controls(); }
}
function canResume() {
  const scan = activeLesson?.task;
  return !!scan?.id && ['paused', 'failed', 'running'].includes(scan.state) && Number.isFinite(scan.checkpoint) && scan.checkpoint >= 0 && sourceReady && JSON.stringify(scan.settings) === JSON.stringify(scanSettings()) && JSON.stringify(scan.crop) === JSON.stringify(crop) && JSON.stringify(normalizedIgnore(scan.ignoreRect)) === JSON.stringify(ignoreRect);
}
function currentCourseKey() { return PPTLibrary.courseKey(activeLesson?.page || '', activeLesson?.course || namingInfo()); }
function batchCourseKey() { return batchPage ? PPTLibrary.courseKey(batchPage, batchJobs[0]?.course) : null; }
function currentCourseLessons(key = currentCourseKey()) {
  return lessons.filter(lesson => PPTLibrary.courseKey(lesson.page || '', lesson.course) === key);
}
function renderLibrary() {
  const select = $('lesson-select'); select.replaceChildren();
  if (!lessons.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '尚未保存课次'; select.append(option); }
  for (const lesson of [...lessons].sort((a, b) => (a.course?.date || '').localeCompare(b.course?.date || '') || (a.course?.start || '').localeCompare(b.course?.start || '') || a.created - b.created)) {
    const option = document.createElement('option'); option.value = lesson.id;
    option.textContent = `${lessonLabel(lesson)} · ${allPages.filter(page => page.lessonId === lesson.id).length} 页`; select.append(option);
  }
  select.value = activeLesson?.id || '';
  const scan = activeLesson?.task;
  $('resume-status').textContent = scan ? `${scan.state === 'done' ? '本节扫描已完成' : '上次任务保留到 ' + timecode(scan.checkpoint || 0)}${!sourceReady ? '；重新加载原视频后可继续。' : canResume() ? '；可以继续提取。' : scan.state !== 'done' ? '；设置已变化，下次从头扫描。' : '。'}` : '每节截图、裁剪和提取设置会保存在本机。';
  $('resume-load').hidden = sourceReady || !activeLesson?.source;
  $('resume-load').textContent = activeLesson?.source?.kind === 'file' ? '重新选择本地原视频' : '加载本节原视频';
  const list = $('suspect-ranges'); list.replaceChildren();
  for (const range of activeLesson?.suspects || []) {
    const row = document.createElement('div'), seek = document.createElement('button'), scan = document.createElement('button');
    row.className = 'suspect-range'; seek.textContent = `${timecode(range.start)} – ${timecode(range.end)}`; seek.title = '跳转到视频中回看';
    seek.disabled = busy() || !sourceReady; seek.onclick = async () => { if (busy() || !sourceReady) return; try { await new PPTScanner(video, frame).seek(range.time ?? range.start); } catch (e) { status('回看失败：' + e.message); } };
    scan.textContent = '细查此段'; scan.disabled = busy() || !sourceReady; scan.onclick = () => { if (!busy()) fastScan({range}); };
    const dismiss = document.createElement('button'); dismiss.className = 'suspect-dismiss'; dismiss.textContent = '已确认';
    dismiss.disabled = busy(); dismiss.onclick = () => dismissSuspect(range);
    row.append(seek, scan, dismiss); list.append(row);
  }
  $('suspects-count').textContent = `待复核时间段 · ${activeLesson?.suspects?.length || 0}`;
}
async function dismissSuspect(range) {
  if (busy() || !activeLesson?.suspects?.includes(range)) return;
  reviewBusy = true; controls();
  const lesson = activeLesson;
  try {
    await namingSave.catch(() => {}); await lessonSave.catch(() => {});
    const index = lesson.suspects.indexOf(range);
    if (index < 0) return;
    const suspects = lesson.suspects.filter((_, i) => i !== index);
    await persistLesson({...lesson, suspects});
    lesson.suspects = suspects; renderLibrary(); status('此时间段已确认。');
  } catch (e) { status('确认保存失败，请重试：' + e.message); }
  finally { reviewBusy = false; controls(); }
}
let libraryRemoval = null, libraryWriting = false, libraryRenderRevision = 0;
function confirmLibraryRemoval(group, course = null) {
  if (libraryWriting) return;
  const ids = group.map(lesson => lesson.id), count = allPages.filter(page => ids.includes(page.lessonId)).length;
  libraryRemoval = {lessonIds: ids, course};
  $('library-confirm-text').textContent = `永久删除${course === null ? '课次' : '整门课程'}“${course === null ? lessonLabel(group[0]) : group[0].course?.name || '未命名课程'}”：${group.length} 节、${count} 页。截图、课次设置及关联批量任务会一起删除，无法撤销。`;
  $('library-confirm').hidden = false; $('library-cancel-delete').focus();
}
async function renderLibraryManager() {
  const revision = ++libraryRenderRevision, list = $('library-list'); list.replaceChildren(); $('library-confirm').hidden = true; libraryRemoval = null;
  $('library-status').textContent = lessons.length ? '正在估算截图资源大小…' : '本机尚未保存课次。';
  const groups = new Map();
  for (const lesson of lessons) {
    const key = PPTLibrary.courseKey(lesson.page, lesson.course);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lesson);
  }
  const estimates = [];
  for (const [key, group] of groups) {
    const section = document.createElement('section'), heading = document.createElement('h3'), remove = document.createElement('button');
    section.className = 'library-course'; heading.textContent = group[0].course?.name || '未命名课程';
    remove.textContent = '删除整课'; remove.setAttribute('aria-label', `删除整课 ${heading.textContent}`);
    remove.onclick = () => confirmLibraryRemoval(group, key); section.append(heading, remove);
    if (group[0].page) { const context = document.createElement('p'); context.className = 'note library-context'; context.textContent = '课程页面：' + group[0].page; section.append(context); }
    for (const lesson of group) {
      const row = document.createElement('div'), text = document.createElement('span'), button = document.createElement('button');
      row.className = 'library-lesson'; row.dataset.lessonId = lesson.id;
      const retained = allPages.filter(page => page.lessonId === lesson.id), label = `${lessonLabel(lesson)} · ${retained.length} 页`;
      text.textContent = label + ' · 估算中'; button.textContent = '删除课次'; button.setAttribute('aria-label', `删除课次 ${lessonLabel(lesson)}`);
      button.onclick = () => confirmLibraryRemoval([lesson]); row.append(text, button); section.append(row);
      estimates.push({text, retained, label});
    }
    list.append(section);
  }
  let missing = 0;
  try {
    for (const item of estimates) {
      if (!$('library-dialog').open || !item.text.isConnected) return;
      const estimate = await PPTPageStore.estimate(db, item.retained);
      if (revision !== libraryRenderRevision || !$('library-dialog').open) return;
      missing += estimate.missing;
      item.text.textContent = `${item.label} · 约 ${(estimate.bytes / 1024 ** 2).toFixed(2)} MB`;
    }
    if ($('library-dialog').open) $('library-status').textContent = missing ? `${missing} 页的资源缺失，估算未包含这些资源。` : lessons.length ? '大小估算完成。' : '本机尚未保存课次。';
  } catch (error) { if (revision === libraryRenderRevision && $('library-dialog').open) $('library-status').textContent = '大小估算失败：' + error.message; }
}
$('library-manage').onclick = async () => {
  if (busy() || !ready) return;
  reviewBusy = true; controls(); $('library-dialog').showModal();
  await namingSave.catch(() => {}); await lessonSave.catch(() => {}); renderLibraryManager();
};
function closeLibrary() {
  if (libraryWriting) return;
  libraryRenderRevision++; $('library-dialog').close(); libraryRemoval = null; reviewBusy = false; controls(); $('library-manage').focus();
}
$('library-close').onclick = closeLibrary;
$('library-dialog').oncancel = event => { event.preventDefault(); closeLibrary(); };
$('library-cancel-delete').onclick = () => { libraryRemoval = null; $('library-confirm').hidden = true; };
$('library-delete').onclick = async () => {
  if (!libraryRemoval || libraryWriting) return;
  libraryWriting = true; libraryRenderRevision++;
  $('library-dialog').querySelectorAll('button').forEach(button => { button.disabled = true; });
  let committed = false;
  const request = libraryRemoval, activeRemoved = request.lessonIds.includes(activeLesson?.id);
  const undoIds = undoState?.removed.filter(item => request.lessonIds.includes(item.page.lessonId)).map(item => item.page.id) || [];
  try {
    await namingSave.catch(() => {}); await lessonSave.catch(() => {});
    const saved = await PPTLibrary.remove(db, {...request, undoIds}); committed = true;
    // The disk commit is final. Detach the removed lesson before source cleanup can save it again.
    let cleanupError;
    if (activeRemoved) {
      activeLesson = null; undoState = null; activeBatchJob = null; selectedPages.clear(); selectionAnchor = null;
      previewPageId = null; $('lightbox').close(); previewRevision++; previewLoadingId = null;
      if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; $('lightbox-img').removeAttribute('src'); releaseDedupeContext();
      try { await releaseSource(); } catch (error) { cleanupError = error; }
    }
    lessons = saved.lessons; allPages = saved.pages; savedBatches = saved.batches;
    activeLesson = lessons.find(lesson => lesson.id === (activeRemoved ? saved.activeId : activeLesson?.id)) || null;
    const batch = savedBatches.find(item => item.page === batchPage);
    batchJobs = batch ? structuredClone(batch.jobs) : []; if (!batch) batchPage = '';
    if (activeBatchJob && loadedIdentity?.coursePage === batchPage) activeBatchJob = batchJobs.find(job => job.id === activeBatchJob.id && sameMediaSource(job, loadedIdentity)) || activeBatchJob;
    if (activeRemoved) {
      if (activeLesson) applyLesson();
      else { pages = []; sourceName = ''; sourceCourse = {}; sourceCoursePage = ''; crop = {x: 0, y: 0, w: 1, h: 1}; ignoreRect = null; cancelSelection(); restoreNaming(saved.naming || {course: {}, page: '', manual: false}); }
    }
    batchDiscoverySerial++; render(); renderLibrary(); renderBatchJobs(); draw(); await renderLibraryManager();
    $('library-status').textContent = cleanupError ? '课次已永久删除；视频缓存释放失败：' + cleanupError.message : '已永久删除所选课次及关联批量任务。';
  } catch (error) { $('library-status').textContent = (committed ? '课次已永久删除；界面更新失败，请刷新：' : '删除失败，课次和截图仍保留：') + error.message; }
  finally { libraryWriting = false; $('library-dialog').querySelectorAll('button').forEach(button => { button.disabled = false; }); controls(); }
};
function retainBatch(snapshot) {
  const existing = savedBatches.findIndex(item => item.page === snapshot.page);
  if (existing < 0) savedBatches.push(snapshot); else savedBatches[existing] = snapshot;
}
function jobBatch(job = activeBatchJob) {
  if (!job) return null;
  const page = batchJobs.includes(job) ? batchPage : loadedIdentity?.coursePage || activeLesson?.page || batchPage;
  if (!page) return null;
  const jobs = page === batchPage ? batchJobs : savedBatches.find(item => item.page === page)?.jobs || [];
  return {page, jobs: jobs.some(item => item.id === job.id) ? jobs.map(item => item.id === job.id ? job : item) : [...jobs, job]};
}
function persistBatch(job = null) {
  const related = job ? jobBatch(job) : batchPage ? {page: batchPage, jobs: batchJobs} : null;
  if (!related) return Promise.resolve();
  const snapshot = structuredClone(related);
  return PPTLibrary.batch(db, snapshot.page, snapshot.jobs).then(() => retainBatch(snapshot));
}
function syncWorkspace() {
  const selected = sources.find(source => source.url === $('sources').value);
  const source = sourceReady ? `已加载 · ${sourceName}` : selected ? `待加载 · ${selected.name}` : sourceName ? `未加载 · ${sourceName}` : '等待加载视频';
  $('ledger-source').textContent = source; $('ledger-source').title = source;
  $('preview-empty').hidden = sourceReady || !!stream;
  document.body.classList.toggle('has-pages', pages.length > 0);
}
const settingTabs = [...document.querySelectorAll('.setting-tabs [role="tab"]')];
function activateTab(id, focus = false) {
  for (const tab of settingTabs) {
    const active = tab.id === id;
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focus) tab.focus();
  }
}
settingTabs.forEach((tab, index) => {
  tab.onclick = () => activateTab(tab.id);
  tab.onkeydown = event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % settingTabs.length;
    if (event.key === 'ArrowLeft') next = (index + settingTabs.length - 1) % settingTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = settingTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault(); activateTab(settingTabs[next].id, true);
  };
});
function previewName() {
  const name = PPTCourse.filename(namingInfo());
  $('filename-preview').textContent = name ? `下载文件名：${name}` : '填好课程名称、上课日期和开始时间后，这里会显示导出文件名。';
  syncWorkspace();
}
function setNaming(info, page) {
  info = PPTCourse.normalize(info); namingPage = page;
  $('course-name').value = info.name || ''; $('course-date').value = info.date || ''; $('course-start').value = info.start || '';
  previewName();
}
function persistNaming() {
  const snapshot = {course: namingInfo(), page: namingPage, manual: namingManual}, lessonId = activeLesson?.id;
  namingSave = namingSave.catch(() => {}).then(async () => {
    await dbReady;
    lessonSave = lessonSave.catch(() => {}).then(async () => {
      const current = lessons.find(item => item.id === lessonId), change = {course: snapshot.course, page: snapshot.page, namingManual: snapshot.manual};
      const lesson = current && {...current, ...change};
      await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite'), store = tx.objectStore('settings'); store.put(snapshot, 'exportNaming');
        if (lesson) store.put(lesson, 'lesson:' + lesson.id);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || Error('命名信息未能保存')); tx.onabort = () => reject(tx.error || Error('命名信息保存已取消'));
      });
      if (current) { Object.assign(current, change); renderLibrary(); }
    });
    await lessonSave;
  });
  namingSave.catch(e => status('命名信息保存失败：' + e.message));
  return namingSave;
}
function acceptCourse(info, page) {
  if (sourceCoursePage !== page) sourceCourse = {};
  sourceCoursePage = page; sourceCourse = {...sourceCourse, ...PPTCourse.normalize(info)};
  dbReady.then(() => {
    if (sourceCoursePage !== page || reviewBusy || pageWrites || exportBusy) return;
    // Keep the naming tied to the course of the retained screenshots.
    if (!namingManual && (!activeLesson || (!activeLesson.source && !pages.length))) {
      setNaming(sourceCourse, page); persistNaming();
    }
  }).catch(() => {});
}
for (const id of ['course-name', 'course-date', 'course-start']) $(id).oninput = () => {
  namingManual = true; namingPage = activeLesson?.page || pages[0]?.coursePage || coursePage;
  previewName(); persistNaming();
};
function pdfOptions() { return {layout: $('pdf-layout').value, timestamps: $('pdf-timestamps').checked, bookmarks: $('pdf-bookmarks').checked}; }
function applyPDFOptions(options) {
  $('pdf-layout').value = options?.layout === 'handout' ? 'handout' : 'single';
  $('pdf-timestamps').checked = options?.timestamps === true; $('pdf-bookmarks').checked = options?.bookmarks === true;
}
for (const id of ['pdf-layout', 'pdf-timestamps', 'pdf-bookmarks']) $(id).onchange = async () => {
  if (busy() || !ready) { applyPDFOptions(savedPDFOptions); return; }
  const options = pdfOptions(); reviewBusy = true; controls();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(options, 'exportPDF');
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error('PDF 设置未能保存'));
    });
    savedPDFOptions = options;
  } catch (e) { applyPDFOptions(savedPDFOptions); status('PDF 设置保存失败：' + e.message); }
  finally { reviewBusy = false; controls(); }
};
async function writePage(metadata, asset) {
  pageWrites++; controls();
  try { return await PPTPageStore.add(db, metadata, asset); }
  finally { pageWrites--; controls(); }
}
async function putPages(values) {
  pageWrites++; controls();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pages', 'readwrite'), store = tx.objectStore('pages');
      values.forEach(page => store.put(page));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || Error('本地保存失败或已取消')); tx.onabort = () => reject(tx.error || Error('本地保存已取消'));
    });
  } finally { pageWrites--; controls(); }
}
async function persistOrder(ordered) {
  const next = ordered.map((page, index) => ({...page, order: (index + 1) * 1024}));
  await putPages(next);
  pages = next; syncAllPages();
}
function timecode(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor(s / 60 % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; /* taste-skill-ignore */
}
function busy() { return !studyAccepted || !!task || !!realtimeTimer || realtimeBusy || batchRunning || reviewBusy || exportBusy || pageWrites > 0; }
function namingSnapshot() { return {course: namingInfo(), page: namingPage, manual: namingManual}; }
function restoreNaming(snapshot) { namingManual = snapshot.manual; setNaming(snapshot.course, snapshot.page); }
function forgetUndo() {
  const removed = undoState?.removed.map(item => item.page.id) || []; undoState = null;
  if (removed.length) PPTPageStore.discard(db, removed).catch(() => {}); // Startup also reclaims orphaned assets.
}
function invalidateUndo() { forgetUndo(); selectedPages.clear(); selectionAnchor = null; updateSelection(); }
async function reviewTransaction({remove = [], restore = [], naming, clear = false}) {
  await dbReady; await namingSave.catch(() => {}); await lessonSave;
  const lesson = activeLesson && {...activeLesson, course: naming.course, namingManual: naming.manual, page: naming.page, ...(clear ? {task: null, suspects: []} : {})};
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['pages', 'settings', 'assets'], 'readwrite'), store = tx.objectStore('pages'), assets = tx.objectStore('assets');
    if (clear) { pages.forEach(page => { store.delete(page.id); assets.delete(page.id); }); undoState?.removed.forEach(item => assets.delete(item.page.id)); }
    else if (remove.length) undoState?.removed.forEach(item => assets.delete(item.page.id));
    remove.forEach(id => store.delete(id)); restore.forEach(page => store.put(page));
    tx.objectStore('settings').put(naming, 'exportNaming');
    if (lesson) tx.objectStore('settings').put(lesson, 'lesson:' + lesson.id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || Error('本地保存失败或已取消')); tx.onabort = () => reject(tx.error || Error('本地保存已取消'));
  });
  if (lesson) Object.assign(activeLesson, lesson);
}
async function deletePages(ids) {
  if (busy() || !ready) return;
  const wanted = new Set(ids), removed = pages.flatMap((page, index) => wanted.has(page.id) ? [{page, index}] : []);
  if (!removed.length) return;
  reviewBusy = true; controls();
  const naming = namingSnapshot(), remaining = pages.filter(page => !wanted.has(page.id));
  const nextNaming = naming;
  const previewIndex = pages.findIndex(page => page.id === previewPageId);
  try {
    await reviewTransaction({remove: removed.map(item => item.page.id), naming: nextNaming});
    undoState = {removed, naming}; pages = remaining; syncAllPages(); last = null; restoreNaming(nextNaming);
    removed.forEach(item => selectedPages.delete(item.page.id));
    if (wanted.has(previewPageId)) previewPageId = pages[Math.min(previewIndex, pages.length - 1)]?.id ?? null;
    render(); if (batchJobs.length) renderBatchJobs();
    status(`已删除 ${removed.length} 页，可点击“撤销删除”恢复。`);
  } catch (e) { status('删除失败：' + e.message); }
  finally { reviewBusy = false; controls(); }
}
async function undoDelete() {
  if (busy() || !undoState) return;
  reviewBusy = true; controls();
  const snapshot = undoState, restored = pages.slice();
  snapshot.removed.forEach(item => restored.splice(item.index, 0, item.page));
  try {
    await reviewTransaction({restore: snapshot.removed.map(item => item.page), naming: snapshot.naming});
    pages = restored; syncAllPages(); restoreNaming(snapshot.naming); undoState = null; last = null;
    render(); if (batchJobs.length) renderBatchJobs(); status(`已恢复 ${snapshot.removed.length} 页。`);
  } catch (e) { status('撤销失败：' + e.message); }
  finally { reviewBusy = false; controls(); }
}
function sameTimeline(a, b) {
  return typeof a.sourceKey === 'string' && !!a.sourceKey.trim() && a.sourceKey === b.sourceKey && !!a.sourceName?.trim() && a.sourceName === b.sourceName && (a.coursePage || '') === (b.coursePage || '') && (a.batchJobId || '') === (b.batchJobId || '');
}
function validSignature(page) {
  return (page.sig instanceof Uint8ClampedArray || page.sig instanceof Uint8Array) && page.sig.length === 192 * 108 * 4 && Number.isFinite(page.w) && Number.isFinite(page.h) && page.w > 0 && page.h > 0;
}
function createDedupeContext(signal) {
  releaseDedupeContext();
  const context = {lessonId: activeLesson?.id, crop: {...crop}, mask: PPTCore.ignoreMask(ignoreRect), signal, signatures: new Map(), valid: true};
  dedupeContext = context;
  return context;
}
function releaseDedupeContext(context = dedupeContext) {
  if (!context) return;
  context.valid = false; context.signatures.clear(); context.mask = null;
  if (dedupeContext === context) dedupeContext = null;
}
function checkDedupeContext(context) {
  context?.signal?.throwIfAborted();
  if (context && (!context.valid || context.lessonId !== activeLesson?.id)) throw new DOMException('比较任务已停止', 'AbortError');
}
function cacheSignature(context, id, sig) {
  if (!context?.valid || context.signatures.size >= 1000 && !context.signatures.has(id)) return;
  const valid = (sig instanceof Uint8ClampedArray || sig instanceof Uint8Array) && sig.length === 192 * 108 * 4;
  context.signatures.set(id, valid ? (sig.buffer.byteLength === sig.byteLength ? sig : sig.slice()) : null);
}
function comparisonMask(a, b, geometry = crop, mask = PPTCore.ignoreMask(ignoreRect)) {
  return sameCrop(a, geometry) && sameCrop(b, geometry) ? mask : null;
}
async function hasSimilar(signature, threshold, context = null, signatureCrop = crop) {
  const scope = pages, geometry = context?.crop || crop, mask = context ? context.mask : PPTCore.ignoreMask(ignoreRect);
  for (let offset = 0; offset < scope.length; offset += 32) {
    checkDedupeContext(context);
    const batch = scope.slice(offset, offset + 32), missing = batch.filter(page => !context?.signatures.has(page.id));
    const records = missing.length ? await PPTPageStore.assets(db, missing.map(page => page.id)) : [];
    checkDedupeContext(context);
    for (let i = 0; i < missing.length; i++) cacheSignature(context, missing[i].id, records[i]?.sig);
    for (const page of batch) {
      const sig = context?.signatures.has(page.id) ? context.signatures.get(page.id) : records[missing.indexOf(page)]?.sig;
      if (validSignature({...page, sig}) && PPTCore.similar(signature, sig, threshold, comparisonMask(signatureCrop, page.signatureCrop, geometry, mask))) return true;
    }
  }
  return false;
}
function releaseSimilarImages(review) {
  review.urls.forEach(url => URL.revokeObjectURL(url)); review.urls = [];
  for (const side of ['earlier', 'later']) $('similar-' + side + '-img').removeAttribute('src');
}
function closeSimilar() {
  if (!similarReview) return;
  releaseSimilarImages(similarReview); similarReview = null;
  $('similar-dialog').close(); reviewBusy = false; controls();
}
async function nextSimilar(review) {
  releaseSimilarImages(review); review.pair = null;
  $('similar-pair').hidden = true; $('similar-choices').hidden = true; $('similar-confirm').hidden = true;
  $('similar-status').textContent = '正在检查相邻页面…';
  try {
    while (review.next < review.pages.length) {
      const a = review.pages[review.survivor], b = review.pages[review.next++];
      if (sameTimeline(a, b) && Number.isFinite(a.sourceTime) && Number.isFinite(b.sourceTime) && a.sourceTime < b.sourceTime && a.w === b.w && a.h === b.h) {
        const [first, second] = await PPTPageStore.assets(db, [a.id, b.id]);
        if (similarReview !== review) return;
        if (validSignature({...a, sig: first?.sig}) && validSignature({...b, sig: second?.sig}) && PPTCore.similar(first.sig, second.sig, review.threshold, comparisonMask(a.signatureCrop, b.signatureCrop))) {
          if (!first.image || !second.image) throw Error('候选截图不可用，请重新提取');
          review.pair = [a, b]; review.found = true;
          for (const [index, side] of ['earlier', 'later'].entries()) {
            const page = review.pair[index], image = $('similar-' + side + '-img');
            const label = `第 ${review.pages.indexOf(page) + 1} 页 · ${timecode(page.sourceTime)}`;
            $('similar-' + side + '-meta').textContent = label; image.alt = label;
            const url = URL.createObjectURL([first, second][index].image); review.urls.push(url); image.src = url;
          }
          await Promise.all(['earlier', 'later'].map(side => $('similar-' + side + '-img').decode()));
          if (similarReview !== review) return;
          $('similar-status').textContent = `请选择保留方式；已暂定删除 ${review.remove.length} 页，最终确认前不会删除。`;
          $('similar-pair').hidden = false; $('similar-choices').hidden = false; $('similar-both').focus();
          return;
        }
      }
      review.survivor = review.next - 1;
    }
    if (!review.found) { closeSimilar(); status('没有发现相邻的相似页面。'); return; }
    review.complete = true;
    $('similar-status').textContent = review.remove.length ? `对比完成。确认删除 ${review.remove.length} 页？可一次撤销；取消将放弃全部选择。` : '对比完成，所有页面都会保留。';
    $('similar-confirm').textContent = review.remove.length ? `确认删除 ${review.remove.length} 页` : '完成并保留全部';
    $('similar-confirm').hidden = false; $('similar-cancel').focus();
  } catch (e) {
    if (similarReview !== review) return;
    closeSimilar(); status('相似页检查失败：' + e.message);
  }
}
async function cleanSimilar() {
  if (busy()) return;
  const review = {pages: pages.slice(), survivor: 0, next: 1, remove: [], urls: [], found: false, complete: false,
    threshold: Math.max((Number($('diff').value) || 1.2) * 2.5, 3)};
  similarReview = review; reviewBusy = true; controls();
  $('similar-dialog').showModal(); await nextSimilar(review);
}
function chooseSimilar(choice) {
  const review = similarReview;
  if (!review?.pair) return;
  const [a, b] = review.pair;
  if (choice === 'earlier') review.remove.push(b.id);
  else {
    if (choice === 'later') review.remove.push(a.id);
    review.survivor = review.next - 1;
  }
  return nextSimilar(review);
}
for (const choice of ['earlier', 'later', 'both']) $('similar-' + choice).onclick = () => chooseSimilar(choice);
$('similar-cancel').onclick = closeSimilar;
$('similar-dialog').addEventListener('cancel', event => { event.preventDefault(); closeSimilar(); });
$('similar-dialog').addEventListener('close', () => { if (!$('similar-dialog').open) closeSimilar(); });
$('similar-confirm').onclick = async () => {
  if (!similarReview?.complete) return;
  const remove = similarReview.remove; closeSimilar();
  if (remove.length) await deletePages(remove); else status('已保留全部页面。');
};
function updateSelection() {
  selectedPages = new Set([...selectedPages].filter(id => pages.some(page => page.id === id)));
  if (!pages.some(page => page.id === selectionAnchor)) selectionAnchor = null;
  $('lightbox-select').textContent = selectedPages.has(previewPageId) ? '取消选中 (S)' : '选中此页 (S)';
  $('lightbox-select').setAttribute('aria-pressed', String(selectedPages.has(previewPageId)));
  $('selected-count').textContent = `已选 ${selectedPages.size} 页`;
  $('select-all').checked = pages.length > 0 && selectedPages.size === pages.length;
  $('select-all').indeterminate = selectedPages.size > 0 && selectedPages.size < pages.length;
  document.querySelectorAll('#pages article').forEach(card => {
    const selected = selectedPages.has(Number(card.dataset.pageId));
    card.classList.toggle('selected', selected); card.querySelector('.page-select').checked = selected;
  });
}
function seekPage(page) {
  if (busy()) return;
  let message = '';
  if (!sourceReady || stream || !loadedIdentity || !page.sourceKey || PPTLibrary.key(page) !== PPTLibrary.key(loadedIdentity)) message = '视频与截图来源不一致，请重新加载对应的视频再回看。';
  else if (!Number.isFinite(page.sourceTime) || page.sourceTime < 0 || !Number.isFinite(video.duration) || page.sourceTime > video.duration) message = '这张截图没有可用的视频时间。';
  else {
    let seekable = false;
    for (let i = 0; i < video.seekable.length; i++) if (page.sourceTime >= video.seekable.start(i) && page.sourceTime <= video.seekable.end(i)) seekable = true;
    if (!seekable) message = '这个位置还没加载好，稍等一下再回看。';
    else {
      try { video.pause(); video.currentTime = page.sourceTime; message = `已定位到 ${timecode(page.sourceTime)}。`; }
      catch (e) { message = '视频定位失败：' + e.message; }
    }
  }
  status(message); if ($('lightbox').open) $('lightbox-status').textContent = message;
}
function updatePreview() {
  if (!$('lightbox').open) return;
  const index = pages.findIndex(page => page.id === previewPageId), page = pages[index];
  if (!page) { $('lightbox').close(); return; }
  $('lightbox-meta').textContent = `第 ${index + 1} / ${pages.length} 页 · ${page.sourceName || '历史截图'}${Number.isFinite(page.sourceTime) ? ' · ' + timecode(page.sourceTime) : ''}`;
  $('lightbox-img').alt = `第 ${index + 1} 页放大预览`;
  if (previewLoadingId !== page.id) {
    previewLoadingId = page.id; const revision = ++previewRevision;
    if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; $('lightbox-img').removeAttribute('src');
    PPTPageStore.asset(db, page.id).then(record => {
      if (revision !== previewRevision || !$('lightbox').open) return;
      previewURL = URL.createObjectURL(record.image); $('lightbox-img').src = previewURL;
    }).catch(e => { if (revision === previewRevision) $('lightbox-status').textContent = '图片读取失败：' + e.message; });
  }
  $('lightbox-prev').disabled = busy() || index === 0; $('lightbox-next').disabled = busy() || index === pages.length - 1;
  $('lightbox-delete').disabled = busy(); $('lightbox-seek').disabled = busy(); $('lightbox-select').disabled = busy();
  updateSelection();
  if (!$('lightbox').contains(document.activeElement)) $('lightbox-close').focus();
}
function openPreview(page) {
  if (busy()) return;
  previewPageId = page.id; previewReturn = {id: page.id, element: document.activeElement}; $('lightbox-status').textContent = '';
  $('lightbox').showModal(); updatePreview(); $('lightbox-close').focus();
}
function movePreview(delta) {
  if (busy()) return;
  const index = pages.findIndex(page => page.id === previewPageId), page = pages[index + delta];
  if (page) { previewPageId = page.id; $('lightbox-status').textContent = ''; updatePreview(); }
}
$('select-all').onchange = () => { if (busy()) return; selectedPages = new Set($('select-all').checked ? pages.map(page => page.id) : []); updateSelection(); controls(); };
$('clear-selection').onclick = () => { if (busy()) return; selectedPages.clear(); selectionAnchor = null; updateSelection(); controls(); };
$('delete-selected').onclick = () => deletePages([...selectedPages]);
$('undo').onclick = undoDelete; $('clean-similar').onclick = cleanSimilar;
$('lightbox-prev').onclick = () => movePreview(-1); $('lightbox-next').onclick = () => movePreview(1);
$('lightbox-delete').onclick = () => deletePages([previewPageId]);
$('lightbox-seek').onclick = () => { const page = pages.find(item => item.id === previewPageId); if (page) seekPage(page); };
$('lightbox-select').onclick = () => {
  if (busy() || previewPageId === null) return;
  if (selectedPages.has(previewPageId)) selectedPages.delete(previewPageId); else selectedPages.add(previewPageId);
  updateSelection(); controls();
};
$('lightbox-close').onclick = () => $('lightbox').close();
$('lightbox').addEventListener('close', () => {
  previewRevision++; previewLoadingId = null;
  if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; $('lightbox-img').removeAttribute('src');
  const previous = previewReturn; previewReturn = null;
  const target = previous?.element?.isConnected ? previous.element : document.querySelector(`#pages article[data-page-id="${previous?.id}"] img`) || $('pages');
  target.focus({preventScroll: true});
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoDelete(); return; }
  if (!$('lightbox').open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Tab') {
    const buttons = [...$('lightbox').querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons.at(-1);
    if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); movePreview(event.key === 'ArrowLeft' ? -1 : 1); }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deletePages([previewPageId]); }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); $('lightbox-select').click(); }
  if (event.key.toLowerCase() === 'v') { event.preventDefault(); $('lightbox-seek').click(); }
});
function controls() {
  const active = busy();
  for (const id of ['load-url', 'url', 'file', 'share', 'sources', 'course', 'discover', 'mode', 'diff', 'dedupe', 'stable', 'full', 'course-name', 'course-date', 'course-start', 'pdf-layout', 'pdf-timestamps', 'pdf-bookmarks']) $(id).disabled = active;
  $('load').disabled = active || !$('sources').value;
  $('full').disabled = active || !sourceReady;
  $('crop-select').disabled = active || !sourceReady;
  $('crop-select').textContent = selectionMode === 'crop' ? '取消框选' : '框选 PPT 区域';
  $('crop-select').setAttribute('aria-pressed', String(selectionMode === 'crop'));
  $('ignore-select').disabled = active || !sourceReady;
  $('ignore-clear').disabled = active || !sourceReady || !ignoreRect;
  $('ignore-select').textContent = selectionMode === 'ignore' ? '取消忽略区框选' : '框选忽略区';
  $('ignore-select').setAttribute('aria-pressed', String(selectionMode === 'ignore'));
  $('ignore-status').textContent = `${ignoreRect ? '已设置忽略区，虚线内不参与比较。' : '未设置忽略区。'}截图和导出保留完整内容。框选时方向键移动，Shift+方向键调整大小，Enter 确认，Esc 取消。`;
  $('run').disabled = active || !sourceReady || !ready;
  $('run').textContent = stream ? '开始实时截取' : canResume() ? `继续提取 · ${timecode(activeLesson.task.checkpoint)}` : '开始快速提取';
  $('lesson-select').disabled = active || !ready || !lessons.length;
  $('library-manage').disabled = active || !ready;
  $('crop-reuse').disabled = active || !canReuseCrop();
  $('resume-load').disabled = active || !ready;
  $('restart-scan').hidden = !activeLesson?.task || !!stream; $('restart-scan').disabled = active || !sourceReady;
  $('course-zip').disabled = active || !currentCourseLessons().some(lesson => allPages.some(page => page.lessonId === lesson.id));
  $('batch-course-zip').disabled = active || !batchCourseKey();
  $('course-pdf').disabled = $('course-zip').disabled;
  $('batch-course-pdf').disabled = $('batch-course-zip').disabled;
  document.querySelectorAll('#suspect-ranges button').forEach(button => { button.disabled = active || (!button.classList.contains('suspect-dismiss') && !sourceReady); });
  $('stop').disabled = !task && !realtimeTimer && !batchRunning;
  $('shot').disabled = active || !sourceReady || !ready;
  $('clear').disabled = active || !ready || !pages.length;
  $('pdf').disabled = active || !pages.length; $('export-zip').disabled = active || !pages.length;
  $('undo').disabled = active || !undoState;
  $('clean-similar').disabled = active || pages.length < 2;
  $('select-all').disabled = active || !pages.length;
  $('clear-selection').disabled = active || !selectedPages.size; $('delete-selected').disabled = active || !selectedPages.size;
  $('selected-pdf').disabled = active || !selectedPages.size; $('selected-zip').disabled = active || !selectedPages.size;
  document.querySelectorAll('#pages article').forEach(card => {
    card.draggable = !active;
    card.querySelector('button').disabled = active; card.querySelector('.page-select').disabled = active;
    card.querySelector('img').setAttribute('aria-disabled', String(active)); card.querySelector('.slide-time').setAttribute('aria-disabled', String(active));
  });
  $('end').disabled = !stream || active;
  $('release-cache').disabled = active || !(sourceReady || objectURL || hls || stream || videoCache);
  $('batch-discover').disabled = active;
  $('batch-select').disabled = active || !batchJobs.length;
  $('batch-start').disabled = active || !batchJobs.some(job => PPTBatch.automatic(job) && job.selected && job.state !== 'done');
  document.querySelectorAll('#batch-jobs input').forEach(input => {
    const job = batchJobs.find(item => item.id === input.closest('.batch-job')?.dataset.jobId);
    input.disabled = active || !job || job.state === 'done' || !PPTBatch.automatic(job);
  });
  document.querySelectorAll('#batch-jobs .batch-manual select, #batch-jobs .batch-manual button').forEach(control => { control.disabled = active; });
  document.querySelectorAll('#batch-jobs .batch-job > button').forEach(button => {
    const job = batchJobs.find(item => item.id === button.parentElement.dataset.jobId);
    button.disabled = active || !job || (button.classList.contains('batch-view') ? !batchLesson(job) : !batchPageCount(job));
  });
  updatePreview();
  video.controls = sourceReady && !active && !stream;
  overlay.style.pointerEvents = active || !sourceReady || !selectionMode ? 'none' : 'auto';
  syncWorkspace();
  window.PPTWorkspace?.syncControls();
}
const thumbnailStates = new Map(), thumbnailQueue = new Set();
let thumbnailReads = 0;
function releaseThumbnail(image, state = thumbnailStates.get(image)) {
  if (state?.url) URL.revokeObjectURL(state.url);
  if (state) { state.url = null; state.revision++; }
  image.removeAttribute('src');
}
function loadThumbnails() {
  while (thumbnailReads < 2 && thumbnailQueue.size) {
    const image = thumbnailQueue.values().next().value; thumbnailQueue.delete(image);
    const state = thumbnailStates.get(image);
    if (!state?.visible || state.loading || state.url || !image.isConnected) continue;
    state.loading = true; thumbnailReads++; const revision = state.revision;
    PPTPageStore.thumbnail(db, state.id).then(blob => {
      if (thumbnailStates.get(image) !== state || !state.visible || revision !== state.revision || !image.isConnected) return;
      state.url = URL.createObjectURL(blob); image.src = state.url;
    }).catch(e => {
      if (thumbnailStates.get(image) === state && revision === state.revision) { state.failed = true; image.title = '缩略图读取失败：' + e.message; }
    }).finally(() => {
      state.loading = false; thumbnailReads--;
      if (thumbnailStates.get(image) === state && state.visible && !state.url && !state.failed && image.isConnected) thumbnailQueue.add(image);
      loadThumbnails();
    });
  }
}
const thumbnailObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const image = entry.target, state = thumbnailStates.get(image);
    if (!state) continue;
    state.visible = entry.isIntersecting; state.failed = false;
    if (state.visible) thumbnailQueue.add(image);
    else { thumbnailQueue.delete(image); releaseThumbnail(image, state); }
  }
  loadThumbnails();
}, {root: $('pages'), rootMargin: '200px 0px'});
function addCard(page, index) {
  const article = document.createElement('article'), image = document.createElement('img');
  const handle = document.createElement('span'), label = document.createElement('span'), button = document.createElement('button'), choose = document.createElement('input');
  article.dataset.pageId = String(page.id); article.draggable = !busy();
  image.alt = `第 ${index + 1} 页`; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
  image.tabIndex = 0; image.setAttribute('role', 'button'); image.setAttribute('aria-label', `放大第 ${index + 1} 页`);
  image.onclick = () => openPreview(page);
  image.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPreview(page); } };
  handle.className = 'drag-handle'; handle.title = '拖动调整页序';
  handle.innerHTML = '<svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.25"/><circle cx="9" cy="3" r="1.25"/><circle cx="3" cy="7" r="1.25"/><circle cx="9" cy="7" r="1.25"/><circle cx="3" cy="11" r="1.25"/><circle cx="9" cy="11" r="1.25"/></svg>';
  label.className = 'slide-time'; label.tabIndex = 0; label.setAttribute('role', 'button');
  label.textContent = `${index + 1} · ${Number.isFinite(page.sourceTime) ? timecode(page.sourceTime) : new Date(page.time).toLocaleTimeString()}`;
  label.setAttribute('aria-label', `回看第 ${index + 1} 页${Number.isFinite(page.sourceTime) ? ' ' + timecode(page.sourceTime) : ''}`);
  label.onclick = () => seekPage(page);
  label.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); seekPage(page); } };
  choose.type = 'checkbox'; choose.className = 'page-select'; choose.setAttribute('aria-label', `选择第 ${index + 1} 页`);
  choose.onclick = event => {
    if (busy()) { event.preventDefault(); return; }
    const anchor = pages.findIndex(item => item.id === selectionAnchor), end = pages.findIndex(item => item.id === page.id);
    const range = event.shiftKey && anchor >= 0 ? pages.slice(Math.min(anchor, end), Math.max(anchor, end) + 1) : [page];
    for (const item of range) { if (choose.checked) selectedPages.add(item.id); else selectedPages.delete(item.id); }
    if (!event.shiftKey) selectionAnchor = page.id;
    updateSelection(); controls();
  };
  article.title = `${page.sourceName || '历史截图'}（拖动可调整导出页序）`; button.textContent = '删除'; button.draggable = false;
  article.ondragstart = event => {
    if (busy() || event.target.closest('button, input')) { event.preventDefault(); return; }
    draggedPageId = page.id; article.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(page.id));
  };
  article.ondragover = event => {
    if (busy() || draggedPageId === null || draggedPageId === page.id) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    const rect = article.getBoundingClientRect(), after = event.clientX >= rect.left + rect.width / 2;
    article.classList.toggle('drop-before', !after); article.classList.toggle('drop-after', after);
  };
  article.ondragleave = () => article.classList.remove('drop-before', 'drop-after');
  article.ondrop = async event => {
    event.preventDefault(); article.classList.remove('drop-before', 'drop-after');
    const from = pages.findIndex(item => item.id === draggedPageId);
    if (busy() || from < 0 || page.id === draggedPageId) return;
    const rect = article.getBoundingClientRect(), after = event.clientX >= rect.left + rect.width / 2;
    const ordered = pages.slice(), [moved] = ordered.splice(from, 1);
    let to = ordered.findIndex(item => item.id === page.id); if (after) to++;
    ordered.splice(to, 0, moved); draggedPageId = null; reviewBusy = true; controls();
    try { await persistOrder(ordered); forgetUndo(); render(); status(`已调整截图顺序：第 ${to + 1} 页。`); }
    catch (e) { status('顺序保存失败：' + e.message); }
    finally { reviewBusy = false; controls(); }
  };
  article.ondragend = () => { draggedPageId = null; document.querySelectorAll('#pages article').forEach(card => card.classList.remove('dragging', 'drop-before', 'drop-after')); };
  button.onclick = () => deletePages([page.id]);
  article.append(handle, image, choose, label, button);
  thumbnailStates.set(image, {id: page.id, url: null, visible: false, loading: false, revision: 0});
  $('pages').append(article); thumbnailObserver.observe(image);
  return article;
}
function render() {
  const container = $('pages'), scrollTop = container.scrollTop;
  const existing = new Map([...container.children].map(card => [Number(card.dataset.pageId), card]));
  const retained = new Set(pages.map(page => page.id));
  for (const [id, card] of existing) if (!retained.has(id)) {
    const image = card.querySelector('img'); thumbnailObserver.unobserve(image); thumbnailQueue.delete(image);
    releaseThumbnail(image); thumbnailStates.delete(image); card.remove();
  }
  pages.forEach((page, index) => {
    const card = existing.get(page.id) || addCard(page, index), image = card.querySelector('img'), label = card.querySelector('.slide-time');
    image.alt = `第 ${index + 1} 页`; image.setAttribute('aria-label', `放大第 ${index + 1} 页`);
    label.textContent = `${index + 1} · ${Number.isFinite(page.sourceTime) ? timecode(page.sourceTime) : new Date(page.time).toLocaleTimeString()}`;
    label.setAttribute('aria-label', `回看第 ${index + 1} 页${Number.isFinite(page.sourceTime) ? ' ' + timecode(page.sourceTime) : ''}`);
    card.querySelector('.page-select').setAttribute('aria-label', `选择第 ${index + 1} 页`);
    if (container.children[index] !== card) container.insertBefore(card, container.children[index] || null);
  });
  $('count').textContent = `共 ${pages.length} 页`;
  container.scrollTop = scrollTop; $('review-notice').hidden = !pages.length;
  updateSelection(); renderLibrary(); controls();
}
function bounds() {
  const width = video.clientWidth, height = video.clientHeight;
  const scale = Math.min(width / (video.videoWidth || width), height / (video.videoHeight || height));
  const w = (video.videoWidth || width) * scale, h = (video.videoHeight || height) * scale;
  return {x: (width - w) / 2, y: (height - h) / 2, w, h};
}
function draw() {
  overlay.width = video.clientWidth; overlay.height = video.clientHeight;
  overlay.style.width = video.clientWidth + 'px'; overlay.style.height = video.clientHeight + 'px';
  const ctx = overlay.getContext('2d'), b = bounds();
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (sourceReady && crop) {
    const shownCrop = selectionMode === 'crop' && selectionRect || crop;
    const stroke = r => ctx.strokeRect(b.x + r.x * b.w, b.y + r.y * b.h, r.w * b.w, r.h * b.h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; stroke(shownCrop);
    ctx.strokeStyle = '#9e2437'; ctx.lineWidth = 2; stroke(shownCrop);
    const ignored = selectionMode === 'ignore' ? selectionRect : ignoreRect && {x: crop.x + ignoreRect.x * crop.w, y: crop.y + ignoreRect.y * crop.h, w: ignoreRect.w * crop.w, h: ignoreRect.h * crop.h};
    if (ignored) {
      ctx.setLineDash([7, 5]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; stroke(ignored);
      ctx.strokeStyle = '#9e2437'; ctx.lineWidth = 2; stroke(ignored);
    }
  }
}
new ResizeObserver(draw).observe(video);
function pos(event) {
  const rect = overlay.getBoundingClientRect(), b = bounds();
  return {x: Math.max(0, Math.min(1, (event.clientX - rect.left - b.x) / b.w)), y: Math.max(0, Math.min(1, (event.clientY - rect.top - b.y) / b.h))};
}
function cancelSelection() { drag = null; selectionMode = null; selectionRect = null; }
function startSelection(mode) {
  if (busy() || !sourceReady) return;
  if (selectionMode === mode) cancelSelection();
  else {
    selectionMode = mode;
    const rect = mode === 'ignore' ? ignoreRect || {x: .6, y: .6, w: .3, h: .3} : {x: 0, y: 0, w: 1, h: 1};
    selectionRect = {x: crop.x + rect.x * crop.w, y: crop.y + rect.y * crop.h, w: rect.w * crop.w, h: rect.h * crop.h};
    overlay.focus();
  }
  controls(); draw(); status(selectionMode ? `请框选${mode === 'ignore' ? '忽略区' : 'PPT 区域'}；可拖动或用方向键，Enter 确认，Esc 取消。` : '已取消框选。');
}
async function setComparisonRegion(nextCrop, nextIgnore, message, confirmCrop = false) {
  const previous = {crop, ignoreRect, lesson: activeLesson && structuredClone(activeLesson),
    job: activeBatchJob && structuredClone(activeBatchJob)};
  const cleared = !sameCrop(crop, nextCrop) && !!ignoreRect;
  crop = {...nextCrop}; ignoreRect = nextIgnore && {...nextIgnore};
  last = candidate = null; candidateSince = 0; cancelSelection(); releaseDedupeContext();
  if (confirmCrop && activeBatchJob?.requiresCrop) {
    activeBatchJob.cropConfirmed = true; activeBatchJob.cropRejected = false; activeBatchJob.manualPrepared = true;
    activeBatchJob.cropOverride = {crop: {...crop}, aspect: video.videoWidth / video.videoHeight, track: PPTBatch.trackKey(activeBatchJob), manual: true};
  }
  reviewBusy = true; controls(); draw();
  try {
    const relatedBatch = confirmCrop && activeBatchJob?.requiresCrop ? jobBatch() : null;
    await persistLesson(activeLesson, relatedBatch);
    status(message + (cleared ? ' 裁剪已变化，旧忽略区已清除，请重新设置。' : ''));
  } catch (error) {
    crop = previous.crop; ignoreRect = previous.ignoreRect;
    if (activeLesson && previous.lesson) {
      for (const key of Object.keys(activeLesson)) if (!Object.hasOwn(previous.lesson, key)) delete activeLesson[key];
      Object.assign(activeLesson, previous.lesson);
    }
    if (activeBatchJob && previous.job) {
      for (const key of Object.keys(activeBatchJob)) if (!Object.hasOwn(previous.job, key)) delete activeBatchJob[key];
      Object.assign(activeBatchJob, previous.job);
    }
    status('范围保存失败，已恢复原设置：' + error.message);
  } finally { reviewBusy = false; controls(); draw(); renderLibrary(); }
}
function commitSelection() {
  if (!selectionMode || !selectionRect || busy()) return;
  if (selectionMode === 'crop') {
    const next = selectionRect.w < .03 || selectionRect.h < .03 ? {x: 0, y: 0, w: 1, h: 1} : selectionRect;
    return setComparisonRegion(next, sameCrop(crop, next) ? ignoreRect : null, '截取范围已设置，可以开始提取。', true);
  }
  const left = Math.max(crop.x, selectionRect.x), top = Math.max(crop.y, selectionRect.y);
  const right = Math.min(crop.x + crop.w, selectionRect.x + selectionRect.w), bottom = Math.min(crop.y + crop.h, selectionRect.y + selectionRect.h);
  const rect = {x: (left - crop.x) / crop.w, y: (top - crop.y) / crop.h, w: (right - left) / crop.w, h: (bottom - top) / crop.h};
  // Clamp roundoff at the normalized right/bottom edges before validation.
  rect.w = Math.min(rect.w, 1 - rect.x); rect.h = Math.min(rect.h, 1 - rect.y);
  try { PPTCore.ignoreMask(rect); }
  catch (error) { cancelSelection(); controls(); draw(); status(error.message + '，原忽略区已保留。'); return; }
  return setComparisonRegion(crop, rect, '忽略区已设置，仅影响比较；截图和导出保留原图。');
}
overlay.onpointerdown = event => { if (!sourceReady || !selectionMode || busy()) return; drag = pos(event); overlay.setPointerCapture(event.pointerId); };
overlay.onpointermove = event => {
  if (!drag) return;
  const p = pos(event); selectionRect = {x: Math.min(p.x, drag.x), y: Math.min(p.y, drag.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y)}; draw();
};
overlay.onpointerup = () => { if (!drag) return; drag = null; commitSelection(); };
overlay.onpointercancel = () => { cancelSelection(); controls(); draw(); };
overlay.onkeydown = event => {
  if (!selectionMode || busy()) return;
  if (!['Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  if (event.key === 'Escape') { cancelSelection(); controls(); draw(); status('已取消框选，原设置已保留。'); return; }
  if (event.key === 'Enter') { commitSelection(); return; }
  const r = selectionRect, horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key), delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -.01 : .01;
  const key = event.shiftKey ? horizontal ? 'w' : 'h' : horizontal ? 'x' : 'y';
  const maximum = event.shiftKey ? 1 - r[horizontal ? 'x' : 'y'] : 1 - r[horizontal ? 'w' : 'h'];
  r[key] = Math.max(event.shiftKey ? .01 : 0, Math.min(maximum, r[key] + delta)); draw();
};
$('crop-select').onclick = () => startSelection('crop');
$('ignore-select').onclick = () => startSelection('ignore');
$('ignore-clear').onclick = () => { if (!busy() && sourceReady) setComparisonRegion(crop, null, '已清除忽略区。'); };
$('full').onclick = () => { if (busy() || !sourceReady) return; const full = {x: 0, y: 0, w: 1, h: 1}; setComparisonRegion(full, sameCrop(crop, full) ? ignoreRect : null, '将截取整个视频画面。', true); };
function frame(sourceTime = video.currentTime) {
  if (video.readyState < 2 || !video.videoWidth) throw Error('视频画面尚未就绪');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * crop.w)); canvas.height = Math.max(1, Math.round(video.videoHeight * crop.h));
  canvas.getContext('2d').drawImage(video, video.videoWidth * crop.x, video.videoHeight * crop.y, video.videoWidth * crop.w, video.videoHeight * crop.h, 0, 0, canvas.width, canvas.height);
  const small = document.createElement('canvas'); small.width = 192; small.height = 108;
  const ctx = small.getContext('2d', {willReadFrequently: true}); ctx.drawImage(canvas, 0, 0, 192, 108);
  return {canvas, sig: ctx.getImageData(0, 0, 192, 108).data, sourceTime, signatureCrop: {...crop}};
}
async function save(f, context = null) {
  const signal = context?.signal || task?.signal, lessonId = activeLesson?.id;
  const check = () => { signal?.throwIfAborted(); checkDedupeContext(context); if (activeLesson?.id !== lessonId) throw new DOMException('课次已切换', 'AbortError'); };
  await dbReady; check();
  if (scanId && pages.some(page => page.scanId === scanId && Math.abs(page.sourceTime - f.sourceTime) < 0.001)) return false;
  if (pages.length >= 1000) throw Error('本节已达 1000 页，请先导出 PDF，再清空本节继续');
  if (!pages.length) await persistNaming();
  check();
  const asset = {...await PPTPageStore.encode(f.canvas), sig: f.sig};
  check();
  const page = {lessonId, signatureCrop: f.signatureCrop && {...f.signatureCrop}, scanId, w: f.canvas.width, h: f.canvas.height, time: Date.now(), sourceTime: f.sourceTime, sourceName, sourceKey: loadedIdentity?.sourceKey || '', course: {...sourceCourse}, coursePage, batchJobId: activeBatchJob?.id || ''};
  let insertAt = pages.length, lastMatch = -1;
  if (Number.isFinite(page.sourceTime)) {
    for (let i = 0; i < pages.length; i++) {
      const current = pages[i], sameTimeline = current.sourceName === page.sourceName && current.coursePage === page.coursePage && current.batchJobId === page.batchJobId && Number.isFinite(current.sourceTime);
      if (!sameTimeline) continue;
      lastMatch = i;
      if (current.sourceTime > page.sourceTime) { insertAt = i; break; }
    }
    if (insertAt === pages.length && lastMatch >= 0) insertAt = lastMatch + 1;
  }
  const before = pages[insertAt - 1]?.order, after = pages[insertAt]?.order;
  if (Number.isFinite(before) && Number.isFinite(after)) page.order = (before + after) / 2;
  else if (Number.isFinite(before)) page.order = before + 1024;
  else if (Number.isFinite(after)) page.order = after - 1024;
  else page.order = 1024;
  page.id = await writePage(page, asset); cacheSignature(context, page.id, f.sig);
  pages.splice(insertAt, 0, page); syncAllPages(); forgetUndo(); last = f.sig;
  render(); return true;
}
async function releaseSource() {
  releaseDedupeContext(); cancelSelection();
  let persistenceError;
  if (activeLesson && ready && sourceReady) try { await persistLesson(); } catch (error) { persistenceError = error; }
  window.PPTWorkspace?.cancelPreflight();
  if (stream) { stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; }
  hls?.destroy(); hls = null; video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null; sourceReady = false; loadedIdentity = null;
  crop = {...(activeLesson?.crop || {x: 0, y: 0, w: 1, h: 1})}; ignoreRect = normalizedIgnore(activeLesson?.ignoreRect); candidate = null; candidateSince = 0; last = null; controls(); draw();
  referrerOrigins.clear(); referrerPage = '';
  referrerWrites = referrerWrites.catch(() => {}).then(() => window.chrome?.declarativeNetRequest?.updateSessionRules({removeRuleIds: [referrerRule]})).catch(() => {});
  const cached = videoCache; videoCache = null;
  try { await Promise.all([referrerWrites, cached?.remove().catch(error => { videoCache ||= cached; throw error; })]); }
  catch (error) { if (persistenceError) throw Error(`${persistenceError.message}；缓存清理失败：${error.message}`); throw error; }
  if (persistenceError) throw persistenceError;
}
async function releaseFailedSource(error) {
  try { await releaseSource(); return error; }
  catch (cleanup) { return Error(`${error.message}；清理失败：${cleanup.message}`, {cause: error}); }
}
$('release-cache').onclick = async () => {
  if (busy() || !(sourceReady || objectURL || hls || stream || videoCache)) return;
  task = new AbortController(); controls();
  try {
    await releaseSource(); activeBatchJob = null; if (batchJobs.length) renderBatchJobs();
    status('已释放视频缓存，截图和命名信息已保留；需要回看或补截时重新加载视频即可。');
  } catch (e) { status('释放视频缓存失败：' + e.message); }
  finally { task = null; controls(); }
};
async function setCourseReferrer(origins, page = coursePage) {
  if (!page || page !== coursePage || !window.chrome?.declarativeNetRequest) return;
  if (referrerPage !== page) { referrerOrigins.clear(); referrerPage = page; }
  origins.forEach(origin => referrerOrigins.add(origin));
  const domains = [...new Set([...referrerOrigins].map(origin => new URL(origin).hostname))];
  referrerWrites = referrerWrites.catch(() => {}).then(async () => {
    if (page !== coursePage || referrerPage !== page) return;
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [referrerRule], addRules: [{
      id: referrerRule, priority: 1,
      action: {type: 'modifyHeaders', requestHeaders: [{header: 'referer', operation: 'set', value: page}]},
      condition: {initiatorDomains: [chrome.runtime.id], requestDomains: domains, excludedRequestDomains: ['api.github.com'], resourceTypes: ['xmlhttprequest', 'media']}
    }]});
  });
  return referrerWrites;
}
async function awaitVideo(signal) {
  signal?.throwIfAborted();
  if (video.readyState >= 2) return;
  await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadeddata', done); video.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(Error('浏览器无法解码视频，或地址已失效；请刷新课程页重新捕获或导入本地 MP4')); };
    const abort = () => { cleanup(); reject(new DOMException('已停止', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(Error('加载视频超时，请检查网络或导入本地视频')); }, 45000);
    video.addEventListener('loadeddata', done); video.addEventListener('error', fail); signal?.addEventListener('abort', abort, {once: true});
  });
}
function originPattern(url) { const u = new URL(url); return `${u.protocol}//${u.host}/*`; }
async function fetchVideo(url, signal) {
  status('正在缓存视频到本地磁盘，完成后即可快速提取…');
  videoCache = await PPTDiskCache.create('video');
  signal?.throwIfAborted();
  const response = await fetch(url, {credentials: 'include', signal});
  if (!response.ok || /text\/html|application\/json/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel();
    throw Error(!response.ok ? `视频服务器返回 HTTP ${response.status}，请刷新课程页获取新地址，或下载视频后导入` : '地址返回登录页或接口数据，不是视频文件');
  }
  if (!response.body) throw Error('视频服务器没有返回可读取的内容');
  const total = Number(response.headers.get('content-length')) || 0, reader = response.body.getReader();
  let received = 0, lastUpdate = 0, complete = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const {value, done} = await reader.read(); if (done) break;
      signal?.throwIfAborted();
      await videoCache.write(value); received += value.byteLength;
      if (Date.now() - lastUpdate > 250) {
        lastUpdate = Date.now(); $('progress').value = total ? received / total : 0;
        status(`正在写入磁盘：${(received / 1024 ** 2).toFixed(1)} MB${total ? ' / ' + (total / 1024 ** 2).toFixed(1) + ' MB' : ''}…`);
      }
    }
    signal?.throwIfAborted();
    if (!received) throw Error('视频文件为空');
    const file = await videoCache.finish(/webm/i.test(url) ? 'video/webm' : 'video/mp4');
    complete = true; return file;
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function inspectPlaylist(url, signal, visited = new Set(), depth = 0, origins = new Set()) {
  if (visited.has(url) || visited.size >= 16 || depth > 3) return;
  visited.add(url);
  const pattern = originPattern(url);
  origins.add(pattern);
  if (!await chrome.permissions.contains({origins: [pattern]})) { pendingOrigins.push(pattern); return; }
  await setCourseReferrer([...origins]);
  const response = await fetch(url, {credentials: 'include', signal});
  if (!response.ok) throw Error(`播放列表返回 HTTP ${response.status}，请重新捕获视频地址`);
  const text = await response.text();
  if (!text.trimStart().startsWith('#EXTM3U')) throw Error('该地址不是 HLS 播放列表，可能已过期或需要登录');
  if (!/#EXT-X-ENDLIST/.test(text) && !/#EXT-X-STREAM-INF/.test(text)) throw Error('检测到直播流；快速提取需要已录制完成、可跳转的视频');
  const children = [];
  for (const line of text.split(/\r?\n/)) {
    const uris = line.startsWith('#') ? [...line.matchAll(/URI="([^"]+)"/g)].map(m => m[1]) : [line.trim()];
    for (const raw of uris.filter(Boolean)) {
      const child = new URL(raw, response.url || url);
      if (!/^https?:$/.test(child.protocol)) continue;
      const childPattern = originPattern(child.href);
      origins.add(childPattern);
      if (!await chrome.permissions.contains({origins: [childPattern]})) pendingOrigins.push(childPattern);
      else if (/\.m3u8(?:$|\?)/i.test(child.href)) children.push(child.href);
    }
  }
  await setCourseReferrer([...origins]);
  for (const child of children) await inspectPlaylist(child, signal, visited, depth + 1, origins);
}
async function loadRemote(raw, options = {}) {
  if (!studyAccepted || task || realtimeTimer || realtimeBusy || reviewBusy || exportBusy || pageWrites || (batchRunning && !options.batchJob)) return false;
  const batchJob = options.batchJob || null;
  if (!batchJob) activeBatchJob = null;
  const info = PPTCore.mediaInfo(raw);
  if (!info) { status('请输入完整的 HTTP(S) MP4、WebM 或 m3u8 视频地址'); return false; }
  if (info.kind === 'mpd') { status('当前不支持 DASH (.mpd)，请导入下载的 MP4 视频'); return false; }
  if (pendingURL !== info.url) { pendingOrigins = []; pendingURL = info.url; }
  // Call synchronously from the click handler so Chrome retains the user gesture.
  const approval = options.permissionGranted ? Promise.resolve(true) : chrome.permissions.request({origins: [...new Set([originPattern(info.url), ...pendingOrigins])]});
  let loaded = false;
  task = new AbortController(); const controller = task; controls();
  try {
    if (!await approval) throw Error('未获得该视频域名访问权限，可改用本地视频导入');
    await dbReady; await namingSave;
    controller.signal.throwIfAborted(); invalidateUndo(); await releaseSource(); task = controller; activeBatchJob = batchJob; controls();
    await setCourseReferrer([originPattern(info.url), ...pendingOrigins]);
    sourceName = options.sourceName || info.name; $('progress').value = 0;
    if (info.kind === 'm3u8') {
      pendingOrigins = []; status('正在检查 HLS 播放列表与分片域名…');
      await inspectPlaylist(info.url, controller.signal);
      pendingOrigins = [...new Set(pendingOrigins)];
      if (pendingOrigins.length) throw Error(`视频分片还需要访问 ${pendingOrigins.join('、')}，再点一次加载按钮即可授权`);
      if (!window.Hls?.isSupported()) throw Error('当前浏览器不支持 HLS 解码，请导入本地 MP4');
      hls = new Hls({enableWorker: false, maxBufferLength: 8, maxMaxBufferLength: 15, backBufferLength: 0, xhrSetup: xhr => { xhr.withCredentials = true; }});
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { (task || controller).abort(Error('HLS 加载失败：' + data.details + '，请检查分片域名权限或导入本地 MP4')); } });
      hls.loadSource(info.url); hls.attachMedia(video); await awaitVideo(controller.signal);
    } else {
      // A Blob URL gives an origin-clean canvas even if the CDN omits CORS headers.
      const blob = await fetchVideo(info.url, controller.signal);
      controller.signal.throwIfAborted(); objectURL = URL.createObjectURL(blob); video.src = objectURL; await awaitVideo(controller.signal);
    }
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw Error('视频没有可用的完整时长，无法快速扫描');
    sourceReady = true; loadedIdentity = {sourceName, coursePage, batchJobId: batchJob?.id || '', sourceKey: 'url:' + info.url};
    await bindLesson({kind: 'remote', url: info.url, ...loadedIdentity, page: coursePage, duration: video.duration});
    await applyBatchCrop(batchJob);
    video.pause(); frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${sourceName} · ${timecode(video.duration)} · ${video.videoWidth} × ${video.videoHeight}。可框选 PPT 或直接开始快速提取。`);
    pendingOrigins = []; loaded = true;
  } catch (e) {
    const reason = await releaseFailedSource(controller.signal.aborted ? controller.signal.reason : e);
    if (activeBatchJob === batchJob) activeBatchJob = null;
    status(reason.name === 'AbortError' ? '视频加载已停止。可以重新加载。' : '加载失败：' + reason.message);
  } finally { task = null; controls(); }
  return loaded;
}
$('load').onclick = () => { const source = sources.find(x => x.url === $('sources').value); if (source) loadRemote(source.url); else status('未发现可加载的视频，请先在课程页播放再刷新列表'); };
$('load-url').onclick = () => loadRemote($('url').value.trim());
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file || busy()) return;
  invalidateUndo(); activeBatchJob = null; task = new AbortController(); controls();
  try {
    await releaseSource(); task.signal.throwIfAborted(); sourceName = file.name;
    const sourceKey = 'file:' + JSON.stringify([file.name, file.size, file.lastModified]);
    if (activeLesson?.source?.sourceKey === sourceKey) { coursePage = activeLesson.source.page || ''; sourceCourse = {...activeLesson.course}; sourceCoursePage = coursePage; }
    objectURL = URL.createObjectURL(file); video.src = objectURL; await awaitVideo(task.signal);
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw Error('本地视频时长无效');
    sourceReady = true; loadedIdentity = {sourceName, coursePage, batchJobId: '', sourceKey};
    await bindLesson({kind: 'file', ...loadedIdentity, page: coursePage, duration: video.duration}); frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${file.name} · ${timecode(video.duration)}。开始提取即可快速扫描。`);
  } catch (e) { const reason = await releaseFailedSource(e); status(reason.name === 'AbortError' ? '加载已停止。' : '加载失败：' + reason.message); }
  finally { task = null; $('file').value = ''; controls(); }
};
const downloadURLs = new Set();
function downloadBlob(blob, name, cache) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  downloadURLs.add(url); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url); downloadURLs.delete(url);
    cache.remove().catch(e => status('下载临时文件清理失败：' + e.message));
  }, 60000);
}
window.addEventListener('pagehide', () => {
  for (const url of downloadURLs) URL.revokeObjectURL(url);
  if (previewURL) URL.revokeObjectURL(previewURL);
  for (const [image, state] of thumbnailStates) releaseThumbnail(image, state);
});
async function downloadPages(list, name, {kind = 'pdf', layout = 'single', timestamps = false, bookmarks = false} = {}) {
  if (!list.length) throw Error('还没有截图');
  const cache = await PPTDiskCache.create('export');
  let count = 0;
  try {
    const options = {layout, timestamps, bookmarks, write: cache.write, readImage: async page => {
      status(`正在导出第 ${++count} / ${list.length} 页…`);
      $('progress').value = (count - 1) / list.length;
      return PPTPageStore.imageBytes(db, page.id);
    }};
    if (kind === 'zip') await writeZIP(list, options); else await writePDF(list, options);
    const file = await cache.finish(kind === 'zip' ? 'application/zip' : 'application/pdf');
    downloadBlob(file, name, cache); $('progress').value = 1;
  } catch (error) {
    try { await cache.remove(); } catch (cleanup) { throw Error(`${error.message}；${cleanup.message}`); }
    throw error;
  }
}
async function downloadPDF(list, course, options = pdfOptions()) {
  const name = PPTCourse.filename(course);
  if (!name) throw Error('请先补填课程名称、上课日期和开始时间');
  await downloadPages(list.map(page => ({...page})), name, options);
}
async function exportRetained(kind, selected = false) {
  if (busy()) return;
  const list = pages.filter(page => !selected || selectedPages.has(page.id)).map(page => ({...page}));
  if (!list.length) return;
  const options = pdfOptions();
  exportBusy = true; controls();
  try {
    await namingSave.catch(() => {});
    const name = PPTCourse.filename(namingInfo());
    if (!name) {
      activateTab('tab-export');
      const missing = ['course-name', 'course-date', 'course-start'].find(id => !$(id).value) || 'course-name';
      // Focus after the export guard releases disabled naming fields.
      exportBusy = false; controls(); $(missing).focus();
      throw Error('请先补填课程名称、上课日期和开始时间');
    }
    const filename = name.replace(/\.pdf$/i, `${selected ? '-selected' : ''}${kind === 'zip' ? '-slides.zip' : '.pdf'}`);
    await downloadPages(list, filename, {...options, kind});
    status(`已生成${selected ? '所选' : '全部'} ${list.length} 页的${kind === 'zip' ? '图片包' : options.layout === 'handout' ? '笔记讲义 PDF' : 'PDF'}。`);
  } catch (e) { status('导出失败：' + e.message); }
  finally { exportBusy = false; controls(); }
}
$('pdf').onclick = () => exportRetained('pdf'); $('export-zip').onclick = () => exportRetained('zip');
$('selected-pdf').onclick = () => exportRetained('pdf', true); $('selected-zip').onclick = () => exportRetained('zip', true);
$('course-zip').onclick = () => exportCourseZIP();
$('batch-course-zip').onclick = () => exportCourseZIP(batchCourseKey(), 'batch-status');
$('course-pdf').onclick = () => exportCoursePDF();
$('batch-course-pdf').onclick = () => exportCoursePDF(batchCourseKey(), 'batch-status');
async function exportCoursePDF(courseKey, statusId = 'status') {
  if (busy()) return;
  const report = message => { status(message); if (statusId !== 'status') $(statusId).textContent = message; };
  const {layout, timestamps} = pdfOptions();
  exportBusy = true; controls(); let cache;
  try {
    await namingSave; await lessonSave; syncAllPages();
    if (courseKey === undefined) courseKey = currentCourseKey();
    if (!courseKey) throw Error('请先读取课程录像列表');
    const course = currentCourseLessons(courseKey).sort((a, b) => (a.course?.date || '').localeCompare(b.course?.date || '') || (a.course?.start || '').localeCompare(b.course?.start || '') || a.created - b.created);
    const title = PPTCourse.normalize(course[0]?.course || {}).name || '未命名课程';
    const entries = course.map((lesson, index) => {
      const info = PPTCourse.normalize(lesson.course || {});
      return {title: `第 ${index + 1} 课 · ${info.date || '未知日期'} ${info.start || '未知时间'}`,
        pages: allPages.filter(page => page.lessonId === lesson.id).sort((a, b) => a.order - b.order).map(page => ({...page}))};
    });
    const nonempty = entries.filter(entry => entry.pages.length), total = nonempty.reduce((sum, entry) => sum + entry.pages.length, 0);
    if (!total) throw Error('本课程还没有截图');
    const unfinished = course.filter((lesson, index) => entries[index].pages.length && lesson.task?.state !== 'done').length;
    const knownJobs = new Set(savedBatches.filter(batch => PPTLibrary.courseKey(batch.page, batch.jobs[0]?.course) === courseKey).flatMap(batch => batch.jobs.map(job => job.id)));
    const empty = course.length - nonempty.length + [...knownJobs].filter(id => !course.some(lesson => lesson.source?.batchJobId === id)).length;
    cache = await PPTDiskCache.create('export'); let count = 0;
    await writeCoursePDF(entries, {title, layout, timestamps, write: cache.write, readImage: async page => {
      report(`正在合并整课 PDF：第 ${++count} / ${total} 页…`); $('progress').value = (count - 1) / total;
      return PPTPageStore.imageBytes(db, page.id);
    }});
    const file = await cache.finish('application/pdf'), name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    downloadBlob(file, `${name}-整课.pdf`, cache); cache = null; $('progress').value = 1;
    report(`已生成整课合并 PDF，含 ${nonempty.length} 节，共 ${total} 页。${empty ? `跳过 ${empty} 个空课次（尚无截图）。` : ''}${unfinished ? `其中 ${unfinished} 节尚未完成整节扫描，文件为当前已保留截图。` : ''}`);
  } catch (e) {
    let message = e.message; if (cache) try { await cache.remove(); } catch (cleanup) { message += '；临时文件清理失败：' + cleanup.message; }
    report('整课导出失败：' + message);
  } finally { exportBusy = false; controls(); }
}
async function exportCourseZIP(courseKey, statusId = 'status') {
  if (busy()) return;
  const report = message => { status(message); if (statusId !== 'status') $(statusId).textContent = message; };
  const options = pdfOptions();
  exportBusy = true; controls(); let cache;
  try {
    await namingSave; await lessonSave; syncAllPages();
    // Local lessons are grouped by name, which pending saves may change.
    if (courseKey === undefined) courseKey = currentCourseKey();
    if (!courseKey) throw Error('请先读取课程录像列表');
    const course = currentCourseLessons(courseKey).sort((a, b) => (a.course?.date || '').localeCompare(b.course?.date || '') || (a.course?.start || '').localeCompare(b.course?.start || '') || a.created - b.created);
    const entries = course.map((lesson, index) => ({name: `${String(index + 1).padStart(3, '0')}-${PPTCourse.filename(lesson.course) || lessonLabel(lesson) + '.pdf'}`, pages: allPages.filter(page => page.lessonId === lesson.id).sort((a, b) => a.order - b.order).map(page => ({...page}))}));
    const nonempty = entries.filter(entry => entry.pages.length), total = nonempty.reduce((sum, entry) => sum + entry.pages.length, 0);
    if (!nonempty.length) throw Error('本课程还没有截图');
    cache = await PPTDiskCache.create('export'); let count = 0;
    await writeCourseZIP(entries, {...options, write: cache.write, readImage: async page => {
      report(`正在打包课程 PDF：第 ${++count} / ${total} 页…`); $('progress').value = (count - 1) / total;
      return PPTPageStore.imageBytes(db, page.id);
    }});
    const file = await cache.finish('application/zip'), name = (course[0]?.course?.name || '课程').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    downloadBlob(file, `${name}-课次PDF.zip`, cache); cache = null; $('progress').value = 1;
    const unfinished = course.filter((lesson, index) => entries[index].pages.length && lesson.task?.state !== 'done').length;
    const knownJobs = new Set(savedBatches.filter(batch => PPTLibrary.courseKey(batch.page, batch.jobs[0]?.course) === courseKey).flatMap(batch => batch.jobs.map(job => job.id)));
    const empty = course.length - nonempty.length + [...knownJobs].filter(id => !course.some(lesson => lesson.source?.batchJobId === id)).length;
    report(`已生成 ${nonempty.length} 节 PDF 的课程包，共 ${total} 页。${empty ? `跳过 ${empty} 个空课次（尚无截图）。` : ''}${unfinished ? `其中 ${unfinished} 节尚未完成整节扫描，包内为当前已保留截图。` : ''}`);
  } catch (e) {
    let message = e.message; if (cache) try { await cache.remove(); } catch (cleanup) { message += '；临时文件清理失败：' + cleanup.message; }
    report('整课导出失败：' + message);
  } finally { exportBusy = false; controls(); }
}
async function fastScan({restart = false, range = null} = {}) {
  if (task || realtimeTimer || realtimeBusy || reviewBusy || exportBusy || pageWrites || !sourceReady || !ready || !activeLesson) return null;
  if (activeBatchJob?.requiresCrop && (!activeBatchJob.cropConfirmed || activeBatchJob.cropRejected)) {
    selectionMode = 'crop'; selectionRect = {...crop}; draw(); status('本节 0 路视频需要手动确认 PPT 裁剪区域。'); return null;
  }
  const resume = !range && !restart && canResume(), settings = scanSettings(), originalRanges = structuredClone(activeLesson.suspects || []);
  const hasBaseline = resume && Object.hasOwn(activeLesson.task, 'baselineTime'), baselineTime = hasBaseline ? activeLesson.task.baselineTime : null;
  const start = range ? range.start : hasBaseline ? activeLesson.task.checkpoint : 0, end = range ? Math.min(range.end, video.duration) : video.duration;
  task = new AbortController(); const controller = task, before = pages.length, manualJob = activeBatchJob?.requiresCrop && !batchRunning && !range ? activeBatchJob : null;
  scanId = resume ? activeLesson.task.id : crypto.randomUUID();
  if (!range) activeLesson.task = {id: scanId, state: 'running', checkpoint: start, baselineTime, duration: video.duration, settings, crop: {...crop}, ignoreRect: ignoreRect && {...ignoreRect}};
  const context = createDedupeContext(controller.signal);
  let outcome = null, discovered = [];
  cancelSelection(); controls(); video.pause(); $('progress').value = 0;
  status(range ? '正在细查所选时间段…' : resume ? `正在从 ${timecode(start)} 继续扫描…` : '正在快速扫描，请保持工具页打开…');
  const started = performance.now();
  try {
    await persistLesson();
    const scanner = new PPTScanner(video, frame);
    const result = await scanner.scan({step: range ? 0.5 : settings.step, threshold: settings.threshold, dedupe: range ? true : settings.dedupe, start, end, baselineTime, signal: controller.signal, save: f => save(f, context),
      compare: (a, b, threshold) => PPTCore.similar(a, b, threshold, context.mask),
      isDuplicate: (sig, threshold) => hasSimilar(sig, threshold, context, context.crop),
      suspect: async item => {
        discovered = PPTLibrary.mergeRanges(discovered, item);
        const previous = activeLesson.suspects; activeLesson.suspects = PPTLibrary.mergeRanges(previous, item);
        try { await persistLesson(); } catch (e) { activeLesson.suspects = previous; throw e; }
      },
      checkpoint: async p => {
        if (range) return;
        const previous = activeLesson.task; activeLesson.task = {...previous, checkpoint: p.time, baselineTime: p.baselineTime};
        try { await persistLesson(); } catch (e) { activeLesson.task = previous; throw e; }
      },
      progress: p => { $('progress').value = p.ratio; status(`扫描 ${timecode(p.time)} / ${timecode(p.duration)} · ${(p.ratio * 100).toFixed(1)}% · 新增 ${p.saved} 页 · 耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒`); }
    });
    const remaining = originalRanges.flatMap(item => item.end < start || item.start > end ? [item] : [
      ...(item.start < start ? [{...item, end: start, time: Math.min(item.time ?? item.start, start)}] : []),
      ...(item.end > end ? [{...item, start: end, time: Math.max(item.time ?? item.end, end)}] : [])
    ]);
    const pendingSuspects = activeLesson.suspects, pendingTask = activeLesson.task;
    activeLesson.suspects = discovered.reduce((list, item) => PPTLibrary.mergeRanges(list, item), remaining);
    if (!range) activeLesson.task = {...activeLesson.task, state: 'done'};
    try { await persistLesson(); } catch (e) { activeLesson.suspects = pendingSuspects; activeLesson.task = pendingTask; throw e; }
    status(`${range ? '局部细查' : '提取'}完成：新增 ${result.saved} 页，本节共 ${pages.length} 页，耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒。${activeLesson.suspects.length ? `还有 ${activeLesson.suspects.length} 个时间段待复核。` : ''}\n请先筛选页面，再下载 PDF 或图片包。`);
    outcome = result;
  } catch (e) {
    let message = e.name === 'AbortError' ? `已停止，本次新增 ${pages.length - before} 页。` : '提取中断，已截页面已保留：' + e.message;
    if (!range) activeLesson.task = {...activeLesson.task, state: e.name === 'AbortError' ? 'paused' : 'failed'};
    try { await persistLesson(); } catch (storage) { message += '；任务状态未能保存：' + storage.message; }
    status(message);
  } finally {
    releaseDedupeContext(context); scanId = ''; task = null; video.pause();
    if (manualJob) {
      const count = batchPageCount(manualJob); manualJob.pages = count;
      manualJob.state = outcome ? 'done' : count ? 'partial' : 'failed'; manualJob.error = outcome ? '' : $('status').textContent;
      try { await persistBatch(manualJob); } catch (e) { status('批量状态保存失败：' + e.message); }
      renderBatchJobs();
      $('batch-status').textContent = outcome ? `本节 0 路视频已完成，共 ${count} 页；可继续回看和细查。` : `本节 0 路视频未完成，已保留 ${count} 页。`;
    }
    renderLibrary(); controls();
  }
  return outcome;
}
function canReuseCrop() {
  return sourceReady && activeBatchJob?.requiresCrop && activeBatchJob.cropConfirmed && !activeBatchJob.cropRejected && PPTBatch.zeroTrack(activeBatchJob)
    && PPTBatch.validCrop(crop) && video.videoWidth > 0 && video.videoHeight > 0 && activeLesson?.page === batchPage;
}
function cropReuseTargets() {
  const course = PPTLibrary.courseKey(activeLesson?.page, activeLesson?.course);
  return batchJobs.filter(job => job !== activeBatchJob && job.requiresCrop && PPTBatch.zeroTrack(job) && job.state !== 'done'
    && batchLesson(job)?.task?.state !== 'done' && !job.manualPrepared && job.state !== 'manual' && !(job.cropConfirmed && !job.cropOverride)
    && !job.cropOverride?.manual && PPTLibrary.courseKey(batchPage, job.course) === course);
}
let cropReusePlan = null, cropReuseWriting = false;
$('crop-reuse').onclick = () => {
  if (busy() || !canReuseCrop()) return;
  const jobs = cropReuseTargets();
  cropReusePlan = {ids: jobs.map(job => job.id), crop: {...crop}, aspect: video.videoWidth / video.videoHeight};
  $('crop-reuse-summary').textContent = `将“${lessonLabel(activeLesson)}”的裁剪用于本课程 ${jobs.length} 个课次：${jobs.map(job => [job.course.date, job.course.start?.slice(0, 5), job.sourceName].filter(Boolean).join(' ')).join('、') || '暂无符合条件的课次'}。`;
  $('crop-reuse-agree').checked = false; $('crop-reuse-apply').disabled = true; $('crop-reuse-status').textContent = '';
  reviewBusy = true; controls(); $('crop-reuse-dialog').showModal();
};
$('crop-reuse-agree').onchange = () => { $('crop-reuse-apply').disabled = !cropReusePlan?.ids.length || !$('crop-reuse-agree').checked || cropReuseWriting; };
function closeCropReuse() {
  if (cropReuseWriting) return;
  $('crop-reuse-dialog').close(); cropReusePlan = null; reviewBusy = false; controls(); $('crop-reuse').focus();
}
$('crop-reuse-cancel').onclick = closeCropReuse;
$('crop-reuse-dialog').oncancel = event => { event.preventDefault(); closeCropReuse(); };
$('crop-reuse-apply').onclick = async () => {
  if (cropReuseWriting || !cropReusePlan?.ids.length || !$('crop-reuse-agree').checked) return;
  cropReuseWriting = true; $('crop-reuse-apply').disabled = true; $('crop-reuse-cancel').disabled = true;
  let committed = false;
  try {
    await namingSave; await lessonSave;
    const eligible = new Set(cropReuseTargets().map(job => job.id));
    const jobs = batchJobs.map(job => !eligible.has(job.id) || !cropReusePlan.ids.includes(job.id) ? structuredClone(job) : {...structuredClone(job),
      cropOverride: {crop: {...cropReusePlan.crop}, aspect: cropReusePlan.aspect, track: PPTBatch.trackKey(job), manual: false},
      cropConfirmed: true, cropRejected: false, selected: true, state: 'pending', error: ''});
    await PPTLibrary.put(db, activeLesson, {page: batchPage, jobs}); committed = true;
    retainBatch(structuredClone({page: batchPage, jobs}));
    const sourceId = activeBatchJob.id; batchJobs = jobs; activeBatchJob = batchJobs.find(job => job.id === sourceId);
    cropReuseWriting = false; closeCropReuse(); renderBatchJobs(); status('已保存裁剪复用设置。可开始批量提取；每节载入后会核对视频轨道和宽高比。');
  } catch (error) {
    const message = (committed ? '复用设置已保存；界面更新失败，请刷新：' : '复用设置保存失败，原设置仍保留：') + error.message;
    $('crop-reuse-status').textContent = message; if (committed) status(message);
  }
  finally { cropReuseWriting = false; $('crop-reuse-cancel').disabled = false; $('crop-reuse-agree').onchange(); }
};
async function applyBatchCrop(job) {
  if (!job?.requiresCrop || !job.cropOverride) return;
  const valid = PPTBatch.cropMatches(job.cropOverride, loadedIdentity, video.videoWidth / video.videoHeight);
  const nextJob = {...job, cropConfirmed: valid, cropRejected: !valid, ...(valid ? {} : {selected: false, state: 'needs-crop', error: '视频轨道或宽高比与裁剪设置不匹配，请手动框选。'})};
  const nextLesson = {...activeLesson, ...(valid ? {crop: {...job.cropOverride.crop}, ignoreRect: sameCrop(crop, job.cropOverride.crop) ? ignoreRect : null} : {})};
  const related = jobBatch(job), snapshot = {page: related.page, jobs: related.jobs.map(item => item.id === job.id ? nextJob : item)};
  await PPTLibrary.put(db, nextLesson, snapshot);
  Object.assign(job, nextJob); Object.assign(activeLesson, nextLesson); retainBatch(structuredClone(snapshot));
  crop = {...(nextLesson.crop || crop)}; ignoreRect = normalizedIgnore(nextLesson.ignoreRect); releaseDedupeContext();
  if (!valid) { selectionMode = 'crop'; selectionRect = {...crop}; }
}
function batchLesson(job, page = job === activeBatchJob ? jobBatch(job)?.page || batchPage : batchPage) { return lessons.find(lesson => lesson.source && PPTLibrary.key(lesson.source) === PPTLibrary.key({batchJobId: job.id, page})); }
function batchPages(job) { const lesson = batchLesson(job); return lesson ? allPages.filter(page => page.lessonId === lesson.id).sort((a, b) => a.order - b.order) : []; }
function batchPageCount(job) { return batchPages(job).length; }
function syncBatchJob(job) {
  const count = batchPageCount(job);
  if (!count && ['done', 'partial'].includes(job.state) && batchLesson(job) && batchLesson(job).task?.state !== 'done') {
    job.state = PPTBatch.automatic(job) ? 'pending' : 'needs-crop'; job.selected = PPTBatch.automatic(job); job.error = '';
  }
  return count;
}
function renderBatchJobs() {
  const container = $('batch-jobs'); container.replaceChildren();
  const labels = {'needs-crop': '需要手动框选', manual: '等待框选/提取', pending: '等待', loading: '下载中', scanning: '提取中', done: '已完成', partial: '部分完成', failed: '失败', stopped: '已停止'};
  for (const job of batchJobs) {
    const count = syncBatchJob(job);
    const row = document.createElement('div'), choose = document.createElement('input'), title = document.createElement('span'), state = document.createElement('span'), download = document.createElement('button');
    row.className = 'batch-job'; row.dataset.jobId = job.id;
    choose.type = 'checkbox'; choose.checked = !!job.selected; choose.disabled = batchRunning || job.state === 'done' || !PPTBatch.automatic(job);
    choose.onchange = () => { job.selected = choose.checked; persistBatch().catch(e => status('批量选择保存失败：' + e.message)); controls(); };
    const size = job.size ? ` · ${(job.size / 1024 ** 2).toFixed(0)} MB` : '';
    title.textContent = `${job.course.date || '未知日期'} ${String(job.course.start || '').slice(0, 5)} · ${job.sourceName}${size}${job.requiresCrop ? ' · 仅有 0 路视频' : ''}`;
    state.className = `batch-state ${job.state}`; state.textContent = `${labels[job.state] || job.state} · ${count} 页`;
    if (job.error) state.title = job.error;
    download.textContent = '下载本节 PDF'; download.disabled = batchRunning || !count;
    download.onclick = async () => {
      if (busy()) return;
      exportBusy = true; controls();
      try { await downloadPDF(batchPages(job), batchLesson(job)?.course || job.course); }
      catch (error) { $('batch-status').textContent = '导出失败：' + error.message; }
      finally { exportBusy = false; controls(); }
    };
    row.append(choose, title, state);
    if (job.requiresCrop) {
      const manual = document.createElement('span'), select = document.createElement('select'), prepare = document.createElement('button');
      manual.className = 'batch-manual';
      for (const item of job.options) { const option = document.createElement('option'); option.value = item.url; option.textContent = item.sourceName; select.append(option); }
      select.value = job.url; select.disabled = batchRunning || !!task;
      select.onchange = async () => {
        if (busy()) return;
        const item = job.options.find(candidate => candidate.url === select.value);
        if (!item) return;
        const changed = !sameMediaSource(job, item), next = {...job, ...item, ...(changed ? {cropConfirmed: false, cropRejected: true, manualPrepared: false, selected: false, state: 'needs-crop'} : {})};
        reviewBusy = true; controls();
        try {
          const jobs = batchJobs.map(value => value === job ? next : value);
          await PPTLibrary.batch(db, batchPage, jobs); retainBatch(structuredClone({page: batchPage, jobs}));
          Object.assign(job, next);
          if (changed && activeBatchJob === job) { await releaseSource(); activeBatchJob = null; }
        } catch (error) { status('视频选择保存失败：' + error.message); }
        finally { reviewBusy = false; renderBatchJobs(); }
      };
      prepare.textContent = count ? '继续用 0 路处理' : '加载 0 路并框选'; prepare.disabled = batchRunning || !!task;
      prepare.onclick = () => { if (!busy()) prepareManualBatchJob(job, chrome.permissions.request({origins: [originPattern(job.url)]})); };
      manual.append(select, prepare); row.append(manual);
    }
    const view = document.createElement('button'); view.className = 'batch-view'; view.textContent = '查看截图';
    view.onclick = async () => {
      if (busy()) return;
      const lesson = batchLesson(job); if (!lesson) return;
      await switchLesson(lesson.id);
      if (activeLesson !== lesson || busy()) return;
      $('suspects-panel').open = true; $('suspects-panel').scrollIntoView({block: 'nearest'});
      $('pages').scrollTop = 0; $('pages').focus({preventScroll: true});
    };
    row.append(view, download); container.append(row);
  }
  const selected = batchJobs.filter(job => PPTBatch.automatic(job) && job.selected && job.state !== 'done').length, manual = batchJobs.filter(job => job.requiresCrop && !PPTBatch.automatic(job) && job.state !== 'done').length;
  $('batch-count').textContent = batchJobs.length ? `共 ${batchJobs.length} 节，自动 ${selected} 节${manual ? `，需框选 ${manual} 节` : ''}` : '未读取';
  controls();
}
async function discoverBatch(tabId = Number($('course').value), automatic = false) {
  if (busy() || !tabId) return;
  const serial = ++batchDiscoverySerial;
  let current = () => serial === batchDiscoverySerial && !busy();
  $('batch-panel').open = true; $('batch-status').textContent = automatic ? '检测到课程列表页，正在读取全部课次…' : '正在读取课程列表和录像信息…';
  try {
    await dbReady; if (!current()) return;
    const selected = $('course').value, lessonId = activeLesson?.id, page = coursePage;
    current = () => serial === batchDiscoverySerial && !busy() && $('course').value === selected && activeLesson?.id === lessonId && coursePage === page;
    const result = await chrome.tabs.sendMessage(tabId, {type: 'PPT_BATCH_DISCOVER'}, {frameId: 0});
    if (!current()) return;
    if (!result?.ok) throw Error(result?.error || '课程页没有返回批量数据');
    const previous = savedBatches.find(item => item.page === result.page)?.jobs || (batchPage === result.page ? batchJobs : []);
    const jobs = result.jobs.map(job => {
      const existing = previous.find(old => old.id === job.id);
      if (job.requiresCrop && existing) {
        const options = job.options || [], option = options.find(item => sameMediaSource(existing, item));
        if (option) job = {...job, ...option};
      }
      const unchanged = sameMediaSource(existing, job), lesson = batchLesson(job, result.page), count = lesson ? allPages.filter(page => page.lessonId === lesson.id).length : 0;
      const done = (lesson?.task?.state === 'done' && sameMediaSource(lesson.source, job)) || (unchanged && existing?.state === 'done');
      const next = {...job, ...(existing?.cropOverride ? {cropOverride: structuredClone(existing.cropOverride)} : {}),
        manualPrepared: !!existing?.manualPrepared, cropRejected: !!existing?.cropRejected || (!!existing?.cropOverride && !unchanged), cropConfirmed: unchanged && !!existing?.cropConfirmed};
      return {...next, selected: done || !PPTBatch.automatic(next) ? false : existing?.selected ?? true,
        state: done ? 'done' : count ? 'partial' : unchanged && ['failed', 'stopped', 'manual'].includes(existing?.state) ? existing.state : PPTBatch.automatic(next) ? 'pending' : 'needs-crop', error: unchanged ? existing?.error || '' : ''};
    });
    await PPTLibrary.batch(db, result.page, jobs); retainBatch(structuredClone({page: result.page, jobs}));
    if (!current()) return;
    batchPage = result.page; batchJobs = jobs;
    if (activeBatchJob && loadedIdentity?.coursePage === batchPage) activeBatchJob = batchJobs.find(job => job.id === activeBatchJob.id && sameMediaSource(job, loadedIdentity)) || activeBatchJob;
    renderBatchJobs();
    const skipped = result.total - result.eligible, missing = result.failures?.length || 0, manual = batchJobs.filter(job => job.requiresCrop && !PPTBatch.automatic(job) && job.state !== 'done').length;
    $('batch-status').textContent = `读取完成：${result.total} 个课次，找到 ${batchJobs.length} 个视频${skipped ? `，跳过 ${skipped} 个未完成/转码中课次` : ''}${missing ? `，${missing} 个录像缺少可用视频` : ''}${manual ? `。其中 ${manual} 节只有 0 路视频，请逐节选择并框选 PPT 区域` : ''}。`;
  } catch (error) {
    if (!current()) return;
    renderBatchJobs(); $('batch-status').textContent = '批量读取失败：' + error.message;
  }
}
async function prepareManualBatchJob(job, permission) {
  if (busy()) return;
  job.state = 'loading'; job.error = ''; renderBatchJobs();
  $('batch-status').textContent = `正在加载 ${job.course.date} ${String(job.course.start).slice(0, 5)} 的 0 路视频…`;
  try {
    if (!await permission) throw Error('未获得该视频域名访问权限');
    coursePage = batchPage; sourceCourse = {...job.course}; sourceCoursePage = coursePage;
    const loaded = await loadRemote(job.url, {permissionGranted: true, sourceName: job.sourceName, batchJob: job});
    if (!loaded) throw Error($('status').textContent || '视频加载失败');
    reviewBusy = true; controls();
    const related = jobBatch(job), nextJob = {...job, state: 'manual', manualPrepared: true};
    const snapshot = {page: related.page, jobs: related.jobs.map(item => item.id === job.id ? nextJob : item)};
    await PPTLibrary.batch(db, snapshot.page, snapshot.jobs);
    Object.assign(job, nextJob); retainBatch(structuredClone(snapshot));
    if (!job.cropConfirmed) { selectionMode = 'crop'; selectionRect = {...crop}; } renderBatchJobs(); draw();
    const prompt = job.cropConfirmed ? '已恢复本节裁剪区域，可继续提取或调整框选。' : '本节只有 0 路视频。请在预览中框选 PPT 区域，再点击“开始快速提取”。';
    status(prompt); $('batch-status').textContent = prompt;
  } catch (error) {
    const loaded = sourceReady && activeBatchJob === job;
    if (loaded) {
      const retained = savedBatches.find(item => item.page === jobBatch(job)?.page)?.jobs.find(item => item.id === job.id);
      job.state = retained?.state || (job.cropConfirmed ? 'pending' : 'needs-crop');
    } else {
      job.state = batchPageCount(job) ? 'partial' : 'failed'; job.error = error.message;
      if (activeBatchJob === job) activeBatchJob = null;
    }
    renderBatchJobs(); $('batch-status').textContent = (loaded ? '0 路视频已加载，但准备状态保存失败；仍需确认裁剪：' : '0 路视频未就绪：') + error.message;
  } finally { reviewBusy = false; controls(); }
}
async function runBatch(permission) {
  const selected = batchJobs.filter(job => PPTBatch.automatic(job) && job.selected && job.state !== 'done');
  if (!selected.length || busy()) return;
  batchRunning = true; batchStopRequested = false; coursePage = batchPage; controls();
  let startupError = '';
  try {
    if (!await permission) throw Error('未获得视频域名访问权限');
    for (let index = 0; index < selected.length; index++) {
      if (batchStopRequested) break;
      const job = selected[index]; activeBatchJob = job; job.state = 'loading'; job.error = ''; await persistBatch(); renderBatchJobs();
      $('batch-status').textContent = `第 ${index + 1} / ${selected.length} 节：正在加载 ${job.course.date} ${String(job.course.start).slice(0, 5)}…`;
      coursePage = batchPage; sourceCourse = {...job.course}; sourceCoursePage = coursePage;
      const loaded = await loadRemote(job.url, {permissionGranted: true, sourceName: job.sourceName, batchJob: job});
      if (!loaded) { job.state = batchStopRequested ? 'stopped' : 'failed'; job.error = $('status').textContent; await persistBatch(); renderBatchJobs(); continue; }
      if (batchStopRequested) { job.state = 'stopped'; await releaseSource(); renderBatchJobs(); break; }
      if (job.requiresCrop && (!job.cropConfirmed || job.cropRejected)) {
        job.state = 'needs-crop'; job.selected = false; await persistBatch(); await releaseSource(); renderBatchJobs(); continue;
      }
      job.state = 'scanning'; await persistBatch(); renderBatchJobs();
      $('batch-status').textContent = `第 ${index + 1} / ${selected.length} 节：正在提取 PPT…`;
      const result = await fastScan(); job.pages = batchPageCount(job);
      if (!result) { job.state = batchStopRequested ? 'stopped' : 'failed'; job.error = $('status').textContent; }
      else job.state = 'done';
      await releaseSource(); await persistBatch(); renderBatchJobs();
    }
  } catch (error) { startupError = error.message; }
  finally {
    try { if (sourceReady || objectURL || hls || stream || videoCache) await releaseSource(); }
    catch (error) { startupError ||= error.message; }
    try { await persistBatch(); } catch (error) { startupError ||= '状态保存失败：' + error.message; }
    activeBatchJob = null; batchRunning = false;
    const done = batchJobs.filter(job => job.state === 'done').length, failed = batchJobs.filter(job => job.state === 'failed').length;
    $('batch-status').textContent = startupError ? `批量任务未完成：${startupError}` : batchStopRequested ? `批量任务已停止；已完成 ${done} 节，截图均已保留。` : `批量任务结束：完成 ${done} 节${failed ? `，失败 ${failed} 节` : ''}。可逐节检查并下载 PDF。`;
    batchStopRequested = false; renderBatchJobs(); controls();
  }
}
$('batch-discover').onclick = () => discoverBatch();
$('batch-select').onclick = () => {
  const selectable = batchJobs.filter(job => PPTBatch.automatic(job) && job.state !== 'done'), choose = selectable.some(job => !job.selected);
  selectable.forEach(job => { job.selected = choose; }); persistBatch().catch(e => status('批量选择保存失败：' + e.message)); renderBatchJobs();
};
$('batch-start').onclick = () => {
  if (busy()) return;
  const origins = [...new Set(batchJobs.filter(job => PPTBatch.automatic(job) && job.selected && job.state !== 'done').map(job => originPattern(job.url)))];
  const permission = origins.length ? chrome.permissions.request({origins}) : Promise.resolve(false);
  runBatch(permission);
};
function stopRealtime() { clearInterval(realtimeTimer); realtimeTimer = null; candidate = last = null; candidateSince = 0; releaseDedupeContext(); controls(); }
async function realTick() {
  if (realtimeBusy || !realtimeTimer) return;
  realtimeBusy = true;
  const context = dedupeContext;
  try {
    checkDedupeContext(context);
    const f = frame(), threshold = Math.max(0.2, Math.min(10, Number($('diff').value) || 1.2));
    if (last && PPTCore.similar(f.sig, last, threshold, context?.mask)) { candidate = null; return; }
    if (!candidate || !PPTCore.similar(f.sig, candidate, 0.8, context?.mask)) { candidate = f.sig; candidateSince = Date.now(); return; }
    if (Date.now() - candidateSince >= (Number($('stable').value) || 1.5) * 1000) {
      const duplicate = $('dedupe').checked && await hasSimilar(f.sig, threshold, context, f.signatureCrop);
      if (!realtimeTimer) return;
      if (!duplicate) { await save(f, context); status(`实时截取：已保存 ${pages.length} 页。`); }
      last = f.sig; candidate = null;
    }
  } catch (e) { stopRealtime(); status('实时截取已停止：' + e.message); }
  finally { realtimeBusy = false; controls(); }
}
$('run').onclick = () => {
  if (busy()) return;
  if (activeBatchJob?.requiresCrop && !activeBatchJob.cropConfirmed) {
    if (selectionMode !== 'crop') startSelection('crop');
    const prompt = '请先在 0 路视频画面中框选 PPT 区域；PPT 已占满画面时，点击“使用完整画面”即可。';
    status(prompt); $('batch-status').textContent = prompt; return;
  }
  if (stream) { cancelSelection(); last = candidate = null; candidateSince = 0; createDedupeContext(); realtimeTimer = setInterval(realTick, 350); controls(); status('正在实时截取，请保持课程视频播放。'); }
  else fastScan();
};
$('stop').onclick = () => {
  if (batchRunning) batchStopRequested = true;
  task?.abort(); stopRealtime();
  if (!task) status(batchRunning ? '正在停止批量任务，已完成的截图会保留。' : '已停止实时截取，截图已保留。');
};
$('shot').onclick = async () => {
  if (busy()) return;
  task = new AbortController(); controls();
  try { await save(frame()); status(`已保存当前页，共 ${pages.length} 页。`); }
  catch (e) { status('保存失败：' + e.message); }
  finally { task = null; controls(); }
};
$('clear').onclick = async () => {
  if (busy() || !ready || !confirm('确定清空本节全部截图吗？其他课次会保留。')) return;
  reviewBusy = true; controls();
  const naming = namingSnapshot();
  try {
    await reviewTransaction({clear: true, naming});
    pages = []; syncAllPages(); last = null; invalidateUndo(); restoreNaming(naming);
    render(); if (batchJobs.length) renderBatchJobs(); status('已清空截图。');
  }
  catch (e) { status('清空失败：' + e.message); }
  finally { reviewBusy = false; controls(); }
};
async function endSharing() {
  stopRealtime();
  try { await releaseSource(); status('共享已结束，截图已保留。'); }
  catch (error) { status('共享已结束，视频缓存清理失败：' + error.message); }
}
$('share').onclick = async () => {
  if (busy()) return;
  activeBatchJob = null;
  task = new AbortController(); controls();
  let selected;
  try {
    selected = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 5}, audio: false});
    task.signal.throwIfAborted();
    invalidateUndo(); await releaseSource(); task.signal.throwIfAborted(); stream = selected; selected = null;
    sourceName = '共享画面'; video.srcObject = stream; await video.play(); sourceReady = true;
    await bindLesson({kind: 'share', sourceKey: 'share:' + crypto.randomUUID(), sourceName, page: coursePage});
    stream.getVideoTracks()[0].onended = endSharing;
    draw(); status('请框选 PPT 区域，然后开始实时截取。');
  } catch (e) {
    selected?.getTracks().forEach(track => track.stop());
    const reason = await releaseFailedSource(e); status('未开始共享：' + reason.message);
  } finally { task = null; controls(); }
};
$('end').onclick = endSharing;
async function discover() {
  if (busy()) return;
  window.PPTWorkspace?.cancelPreflight();
  if (!window.chrome?.tabs) { $('source-status').textContent = '从课程页点扩展图标可自动找视频，也可以直接导入本地视频。'; return; }
  const revision = ++discoverySerial;
  try {
    const selected = $('course').value || new URLSearchParams(location.search).get('tab');
    const tabs = await chrome.tabs.query({url: 'https://rms-v5.xjtu.edu.cn/*'});
    if (revision !== discoverySerial) return;
    $('course').replaceChildren();
    for (const tab of tabs) { const option = document.createElement('option'); option.value = String(tab.id); option.textContent = tab.title || tab.url; $('course').append(option); }
    if (tabs.some(t => String(t.id) === selected)) $('course').value = selected;
    if (!tabs.length) { coursePage = ''; acceptCourse({}, ''); sources = []; updateSources(); $('source-status').textContent = '未找到课程标签页，请先在此浏览器打开课程网站并登录。'; return; }
    const id = Number($('course').value), nextPage = tabs.find(t => t.id === id)?.url || '';
    if (coursePage !== nextPage) { invalidateUndo(); updateSelection(); }
    // A previously loaded video belongs to the old course, not the new selector.
    if (coursePage && coursePage !== nextPage && sourceReady && !task && !realtimeTimer) await releaseSource();
    if (revision !== discoverySerial) return;
    coursePage = nextPage;
    if (batchPage && batchPage !== coursePage) { batchPage = ''; batchJobs = []; renderBatchJobs(); }
    acceptCourse({}, coursePage);
    await chrome.scripting.executeScript({target: {tabId: id, allFrames: true}, world: 'MAIN', files: ['media.js', 'course.js', 'page-hook.js']}).catch(() => {});
    await chrome.scripting.executeScript({target: {tabId: id, allFrames: true}, files: ['media.js', 'course.js', 'batch.js', 'extension-state.js', 'content.js']}).catch(() => {});
    let discovered = await chrome.tabs.sendMessage(id, {type: 'PPT_DISCOVER'}, {frameId: 0}).catch(() => null);
    const courseReply = await chrome.tabs.sendMessage(id, {type: 'PPT_COURSE'}, {frameId: 0}).catch(() => null);
    if (revision !== discoverySerial) return;
    const key = 'media-' + id, tabUrl = tabs.find(t => t.id === id)?.url;
    let entry = (await chrome.storage.session.get(key))[key];
    if (revision !== discoverySerial) return;
    sources = entry?.page === tabUrl ? entry.items : [];
    if (!sources.length) {
      await new Promise(resolve => setTimeout(resolve, 350));
      if (revision !== discoverySerial) return;
      discovered = await chrome.tabs.sendMessage(id, {type: 'PPT_DISCOVER'}, {frameId: 0}).catch(() => discovered);
      const mediaReply = await chrome.tabs.sendMessage(id, {type: 'PPT_GET_MEDIA'}, {frameId: 0}).catch(() => null);
      entry = (await chrome.storage.session.get(key))[key];
      if (revision !== discoverySerial) return;
      sources = entry?.page === tabUrl ? entry.items : [];
      if (!sources.length) {
        const fallbackUrls = mediaReply?.page === tabUrl && Array.isArray(mediaReply.urls) ? mediaReply.urls : discovered?.page === tabUrl && Array.isArray(discovered.urls) ? discovered.urls : [];
        sources = fallbackUrls.map(raw => PPTCore.mediaInfo(raw, tabUrl)).filter(Boolean).map(info => ({...info, source: '页面 / 播放器', seen: Date.now()}));
      }
      if (mediaReply?.page === coursePage) acceptCourse(mediaReply.course, coursePage);
    }
    if (entry?.page === coursePage) acceptCourse(entry.course, coursePage);
    if (courseReply?.page === coursePage) acceptCourse(courseReply.course, coursePage);
    if (discovered?.page === coursePage) acceptCourse(discovered.course, coursePage);
    updateSources(true);
    $('source-status').textContent = sources.length ? `已发现 ${sources.length} 个视频地址，选好后点击“加载选中视频”。` : '还没找到视频。请刷新课程页并播放一次，再点“刷新视频列表”。';
    if (PPTBatch.courseId(coursePage) && batchPage !== coursePage) await discoverBatch(id, true);
  } catch (e) { $('source-status').textContent = '发现视频失败：' + e.message + '。请刷新课程页，或使用手动地址 / 本地视频。'; }
}
function updateSources(reset = false) {
  window.PPTWorkspace?.refreshSources(sources, coursePage, {reset});
  controls();
}
$('discover').onclick = discover; $('course').onchange = discover; $('sources').onchange = controls;
for (const id of ['mode', 'diff', 'dedupe', 'stable']) $(id).onchange = () => { saveLessonSettings(); controls(); };
if (window.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
  const value = changes['media-' + $('course').value]?.newValue;
  if (area === 'session' && value?.page === coursePage) { sources = value.items; acceptCourse(value.course, value.page); updateSources(); $('source-status').textContent = `已发现 ${sources.length} 个视频地址，选好后点击“加载选中视频”。`; }
});
$('lesson-select').onchange = () => switchLesson($('lesson-select').value);
$('resume-load').onclick = () => {
  if (busy() || !activeLesson?.source) return;
  const source = activeLesson.source;
  coursePage = activeLesson.page || ''; sourceCourse = {...activeLesson.course}; sourceCoursePage = coursePage;
  if (source.kind === 'file') { activateTab('tab-source'); $('file').click(); return; }
  if (source.kind === 'share' || !source.url) { activateTab('tab-source'); status('请重新选择视频地址或共享画面；历史截图会保留。'); return; }
  const ownerJobs = batchPage === coursePage ? batchJobs : structuredClone(savedBatches.find(item => item.page === coursePage)?.jobs || []);
  const candidate = source.batchJobId && ownerJobs.find(job => job.id === source.batchJobId && sameMediaSource(job, source));
  const batchJob = source.batchJobId ? candidate || {id: source.batchJobId, course: {...activeLesson.course}, url: source.url, sourceName: source.sourceName, requiresCrop: /(?:^|\/)0-[^/]+\.mp4(?:$|\?)/i.test(source.sourceName), cropConfirmed: false} : null;
  loadRemote(candidate ? candidate.url : source.url, {sourceName: source.sourceName, batchJob});
};
$('restart-scan').onclick = () => { if (!busy()) fastScan({restart: true}); };
controls(); previewName();
window.addEventListener('beforeunload', event => { if (task || realtimeTimer) { event.preventDefault(); event.returnValue = ''; } });
