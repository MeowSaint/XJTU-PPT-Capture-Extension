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
let batchDiscovery = null;
const referrerRule = 16220;
let referrerOrigins = new Set(), referrerPage = '', referrerWrites = Promise.resolve();
let sourceCourse = {}, sourceCoursePage = '', namingPage = '', namingManual = false, namingSave = Promise.resolve(), discoverySerial = 0;
let sourceCandidates = [], candidatesPage = '';
let videoCache = null, previewURL = null, previewLoadingId = null, previewRevision = 0;
let allPages = [], lessons = [], activeLesson = null, savedBatches = [], lessonSave = Promise.resolve(), scanId = '';
let savedPDFOptions = {layout: 'single', timestamps: false, bookmarks: false};
let captureLimits = {maxPages: 5000}, limitsSave = Promise.resolve(), lastAcquisitionFailure = '';
let mediaRecovery = {omitAudio: true}, mediaRecoverySave = Promise.resolve(), mediaContext = {};
const manualStorageGuard = {committed: 0, checked: false};
const dbReady = PPTPageStore.open({blocked: () => status('请先关掉其他已打开的截取工具页，再刷新本页。')}).then(async database => {
  db = database;
  const {pdf, limits, recovery} = await new Promise((resolve, reject) => {
    const tx = db.transaction('settings'), settings = tx.objectStore('settings');
    const pdf = settings.get('exportPDF'), limits = settings.get('captureLimits'), recovery = settings.get('mediaRecovery');
    tx.oncomplete = () => resolve({pdf: pdf.result, limits: limits.result, recovery: recovery.result}); tx.onerror = tx.onabort = () => reject(tx.error || Error('提取设置读取失败'));
  });
  captureLimits = {maxPages: PPTLibrary.pageLimit(limits?.maxPages)}; $('page-limit').value = captureLimits.maxPages;
  mediaRecovery = {omitAudio: recovery?.omitAudio !== false}; $('video-only').checked = mediaRecovery.omitAudio;
  applyPDFOptions(pdf); savedPDFOptions = pdfOptions();
  await PPTPageStore.prune(db);
  const saved = await PPTLibrary.restore(db);
  allPages = saved.pages; lessons = saved.lessons; savedBatches = saved.batches;
  activeLesson = lessons.find(lesson => lesson.id === saved.activeId) || null;
  if (activeLesson) applyLesson();
  else { namingManual = !!saved.naming?.manual; setNaming(saved.naming?.course || sourceCourse, saved.naming?.page || sourceCoursePage); }
  const batch = savedBatches.find(item => item.page === activeLesson?.page) || savedBatches[0];
  if (batch) { batchPage = batch.page; batchJobs = structuredClone(batch.jobs); renderBatchJobs(); $('batch-status').textContent = discoverySummary(batchJobs, batch.discovery); }
  ready = true; render(); renderLibrary(); controls();
});
dbReady.then(() => status('已恢复保存的课次和任务。选择课次后重新加载原视频，即可继续提取或复核。')).catch(e => status('本地存储不可用：' + e.message));
$('video-only').onchange = () => {
  const next = {omitAudio: $('video-only').checked}; mediaRecovery = next;
  mediaRecoverySave = mediaRecoverySave.catch(() => {}).then(async () => {
    await dbReady;
    const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(next, 'mediaRecovery');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });
  });
  mediaRecoverySave.catch(error => status('媒体设置保存失败：' + error.message));
  if (sourceReady) status('媒体设置已更新，重新加载视频后生效。');
};
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
async function bindLesson(source, detectedCourse = sourceCourse, signal) {
  await dbReady; await lessonSave; signal?.throwIfAborted();
  const key = PPTLibrary.key(source);
  let lesson = lessons.find(item => item.source && PPTLibrary.key(item.source) === key);
  const detected = source.batchJobId ? activeBatchJob?.course || {} : detectedCourse;
  const changedChannel = lesson && source.batchJobId && !sameMediaSource(lesson.source, source);
  let next;
  if (!lesson) {
    // A course-level form is not a manual override for a newly selected batch lesson.
    const manual = !source.batchJobId && !activeLesson && namingManual && namingPage === (source.page || '');
    next = {id: crypto.randomUUID(), course: PPTCourse.forBinding(detected, namingInfo(), {manual, sameSource: manual}), page: source.page || '', source, crop: {x: 0,y: 0,w: 1,h: 1}, settings: {...scanSettings(), step: 0.5}, suspects: [], created: Date.now(), namingManual: manual};
  } else {
    const course = PPTCourse.forBinding(detected, lesson.course, {manual: lesson.namingManual, sameSource: true});
    next = {...lesson, course, source: {...lesson.source, ...source}, ...(changedChannel ? {crop: {x: 0,y: 0,w: 1,h: 1}, ignoreRect: null, task: null, suspects: []} : {})};
  }
  await PPTLibrary.bind(db, next, {signal});
  // Commit is the boundary: once it wins, publish the same binding even if Stop arrives afterward.
  syncAllPages(); forgetUndo();
  if (lesson) Object.assign(lesson, next); else { lesson = next; lessons.push(lesson); }
  if (changedChannel && activeBatchJob) activeBatchJob.cropConfirmed = false;
  activeLesson = lesson; applyLesson();
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
  return !!scan?.id && ['paused', 'failed', 'running'].includes(scan.state) && Number.isFinite(scan.checkpoint) && scan.checkpoint >= 0 && sourceReady
    && (!scan.coverage || (scan.coverage.version === 1 && scan.coverage.sourceKey === PPTLibrary.key(activeLesson.source) && scan.coverage.trackKey === PPTBatch.trackKey(activeLesson.source) && scan.coverage.duration === video.duration))
    && JSON.stringify(scan.settings) === JSON.stringify(scanSettings()) && JSON.stringify(scan.crop) === JSON.stringify(crop) && JSON.stringify(normalizedIgnore(scan.ignoreRect)) === JSON.stringify(ignoreRect);
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
  const evidence = scan && PPTLibrary.integrity({lessons: [activeLesson]}).lessons[0].scan;
  $('resume-status').textContent = scan ? `${evidence.reachedEnd ? '已从头连续扫到尾部' : evidence.verified ? '尚无从头连续扫到尾部的证据' : '旧任务，需核对尾部'}；断点 ${timecode(scan.checkpoint || 0)}${!sourceReady ? '；重新加载原视频后可继续。' : canResume() ? '；可以继续提取。' : scan.state !== 'done' ? '；设置已变化，下次从头扫描。' : '。'}` : '每节截图、裁剪和提取设置会保存在本机。';
  $('resume-load').hidden = sourceReady || !activeLesson?.source;
  $('resume-load').textContent = activeLesson?.source?.kind === 'file' ? '重新选择本地原视频' : '加载本节原视频';
  const list = $('suspect-ranges'); list.replaceChildren();
  for (const range of activeLesson?.suspects || []) {
    const row = document.createElement('div'), seek = document.createElement('button'), scan = document.createElement('button');
    row.className = 'suspect-range'; seek.textContent = `${timecode(range.start)} – ${timecode(range.end)}`; seek.title = '跳转到视频中回看';
    seek.disabled = busy() || !sourceReady; seek.onclick = async () => { if (busy() || !sourceReady) return; try { await new PPTScanner(video, frame, mediaContext).seek(range.time ?? range.start); } catch (e) { status('回看失败：' + e.message); } };
    scan.textContent = '细查此段'; scan.disabled = busy() || !sourceReady; scan.onclick = () => { if (!busy()) fastScan({range}); };
    const dismiss = document.createElement('button'); dismiss.className = 'suspect-dismiss'; dismiss.textContent = '已确认';
    dismiss.disabled = busy(); dismiss.onclick = () => dismissSuspect(range);
    row.append(seek, scan, dismiss); list.append(row);
  }
  $('suspects-count').textContent = `待复核时间段 · ${activeLesson?.suspects?.length || 0}`;
  syncWorkspace();
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
  if (snapshot.discovery === undefined && savedBatches[existing]?.discovery !== undefined) snapshot.discovery = structuredClone(savedBatches[existing].discovery);
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
  const batchContext = batchJobs.length && batchPage === coursePage ? `${batchJobs[0]?.course?.name || '课程'} · 批量目录 ${batchJobs.length} 节` : '';
  const detectedContext = sourceCoursePage === coursePage && Object.keys(sourceCourse).length ? lessonLabel({course: sourceCourse}) : '';
  const source = activeBatchJob ? `${lessonLabel(activeBatchJob)} · ${activeBatchJob.sourceName || sourceName} · ${activeBatchJob.state || '已加载'}`
    : sourceReady ? `已加载 · ${sourceName}` : batchContext || (selected ? `待加载 · ${selected.name}` : sourceName ? `未加载 · ${sourceName}` : detectedContext || '等待加载视频');
  $('ledger-source').textContent = source; $('ledger-source').title = source;
  $('preview-empty').hidden = sourceReady || !!stream;
  document.body.classList.toggle('has-pages', pages.length > 0);
  $('current-lesson').textContent = '当前整理 · ' + (activeLesson ? lessonLabel({course: namingInfo(), source: activeLesson.source}) : '尚未选择课次');
  $('export-scope').textContent = `本节全部 · ${pages.length} 页`;
  $('current-course-context').textContent = '当前课次所属课程 · ' + lessonLabel({course: activeLesson ? namingInfo() : sourceCoursePage === coursePage ? sourceCourse : namingInfo()});
  $('batch-course-context').textContent = '批量列表课程 · ' + (batchJobs[0]?.course?.name || (batchPage ? '未命名课程' : '尚未读取'));
  const selectedJobs = batchJobs.filter(job => PPTBatch.automatic(job) && job.selected && job.state !== 'done').length;
  const manualJobs = batchJobs.filter(job => job.requiresCrop && !PPTBatch.automatic(job) && job.state !== 'done').length;
  $('batch-count').textContent = batchJobs.length ? `共 ${batchJobs.length} 节 · 已选自动 ${selectedJobs} 节${manualJobs ? ` · 待框选 ${manualJobs} 节` : ''} · ${discoverySummary(batchJobs, savedBatches.find(item => item.page === batchPage)?.discovery)}` : '未读取';
  const options = pdfOptions();
  $('export-options-summary').textContent = [options.layout === 'handout' ? 'A4 讲义 · 每页两张' : '原始页面 · 每页一张', options.timestamps ? '视频时间' : '', options.bookmarks ? '页码书签' : ''].filter(Boolean).join(' · ');
}
const settingTabs = [...document.querySelectorAll('.setting-tabs [role="tab"]')];
function activateTab(id, focus = false) {
  const previous = settingTabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
  const next = settingTabs.findIndex(tab => tab.id === id), marker = $('tab-marker');
  for (const tab of settingTabs) {
    const active = tab.id === id, panel = $(tab.getAttribute('aria-controls'));
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    if (!active) PPTMotion.cancel(panel);
    if (active && focus) tab.focus();
  }
  if (next !== previous) {
    marker.style.transform = `translateX(${next * 100}%)`;
    PPTMotion.reveal(marker, {x: (previous - next) * marker.offsetWidth, y: 0, duration: 160});
    PPTMotion.reveal($(settingTabs[next].getAttribute('aria-controls')), {x: Math.sign(next - previous) * 6, y: 0, duration: 160});
  }
}
$('export-settings').onclick = () => { activateTab('tab-export'); $('course-name').focus(); };
$('go-source').onclick = () => activateTab('tab-source', true);
$('go-extraction').onclick = () => activateTab('tab-extraction', true);
$('go-results').onclick = () => $('pages').focus({preventScroll: false});
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
function acceptCandidates(items, page) {
  if (candidatesPage !== page) { sourceCandidates = []; candidatesPage = page; }
  sourceCandidates = PPTCourse.mergeCandidates(sourceCandidates, Array.isArray(items) ? items : []);
}
function acceptCourse(info, page) {
  if (sourceCoursePage !== page) { sourceCourse = {}; acceptCandidates([], page); }
  sourceCoursePage = page; sourceCourse = {...sourceCourse, ...PPTCourse.normalize(info)};
  const option = $('course').selectedOptions[0];
  if (page === coursePage && option && sourceCourse.name) option.textContent = sourceCourse.name;
  syncWorkspace();
  dbReady.then(() => {
    if (sourceCoursePage !== page || reviewBusy || pageWrites || exportBusy) return;
    // A directory's latest lesson cannot rename a different retained batch lesson.
    const sameLesson = activeLesson?.page === page && !activeLesson.source?.batchJobId && /\/preview-detail\/[^/?#]+/.test(page);
    if (!namingManual && (!activeLesson || (!activeLesson.source && !pages.length) || sameLesson)) {
      const selected = sameLesson && activeLesson.source?.kind === 'remote';
      const candidate = selected && candidatesPage === page && sourceCandidates.find(item => item.url === activeLesson.source.url);
      const detected = selected ? candidate ? PPTCourse.forMedia(candidate.url, [candidate], sourceCourse) : activeLesson.course : sourceCourse;
      setNaming(PPTCourse.forBinding(detected, namingInfo()), page); persistNaming();
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
function busy() { return !studyAccepted || !!task || !!realtimeTimer || realtimeBusy || batchRunning || !!batchDiscovery || reviewBusy || exportBusy || pageWrites > 0; }
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
  const changed = [];
  document.querySelectorAll('#pages article').forEach(card => {
    const selected = selectedPages.has(Number(card.dataset.pageId));
    if (card.classList.contains('selected') !== selected && thumbnailStates.get(card.querySelector('img'))?.visible) changed.push(card);
    card.classList.toggle('selected', selected); card.querySelector('.page-select').checked = selected;
  });
  revealCards(changed, {y: 0, duration: 140});
}
async function seekPage(page) {
  if (busy()) return;
  let message = '';
  if (!sourceReady || stream || !loadedIdentity || !page.sourceKey || PPTLibrary.key(page) !== PPTLibrary.key(loadedIdentity)) message = '视频与截图来源不一致，请重新加载对应的视频再回看。';
  else if (!Number.isFinite(page.sourceTime) || page.sourceTime < 0 || !Number.isFinite(video.duration) || page.sourceTime > video.duration) message = '这张截图没有可用的视频时间。';
  else {
    let seekable = false;
    for (let i = 0; i < video.seekable.length; i++) if (page.sourceTime >= video.seekable.start(i) && page.sourceTime <= video.seekable.end(i)) seekable = true;
    if (!seekable) message = '这个位置还没加载好，稍等一下再回看。';
    else {
      task = new AbortController(); const controller = task; controls();
      try { video.pause(); await new PPTScanner(video, () => {}, mediaContext).seek(page.sourceTime, controller.signal); message = `已定位到 ${timecode(page.sourceTime)}。`; }
      catch (e) { message = e.name === 'AbortError' ? '视频回看已停止。' : '视频定位失败：' + e.message; }
      finally { task = null; controls(); }
    }
  }
  status(message); if ($('lightbox').open) $('lightbox-status').textContent = message;
}
function updatePreview(direction = 0) {
  if (!$('lightbox').open) return;
  const index = pages.findIndex(page => page.id === previewPageId), page = pages[index];
  if (!page) { $('lightbox').close(); return; }
  $('lightbox-meta').textContent = `第 ${index + 1} / ${pages.length} 页 · ${page.sourceName || '历史截图'}${Number.isFinite(page.sourceTime) ? ' · ' + timecode(page.sourceTime) : ''}`;
  $('lightbox-img').alt = `第 ${index + 1} 页放大预览`;
  if (previewLoadingId !== page.id) {
    previewLoadingId = page.id; const revision = ++previewRevision;
    PPTMotion.cancel($('lightbox-img'));
    if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; $('lightbox-img').removeAttribute('src');
    PPTPageStore.asset(db, page.id).then(record => {
      if (revision !== previewRevision || !$('lightbox').open) return;
      $('lightbox-img').onload = () => {
        if (revision === previewRevision && $('lightbox').open) PPTMotion.reveal($('lightbox-img'), {x: Math.sign(direction) * 10, y: 0, duration: 160});
      };
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
  if (page) { previewPageId = page.id; $('lightbox-status').textContent = ''; updatePreview(delta); }
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
  PPTMotion.cancel($('lightbox')); PPTMotion.cancel($('lightbox-img')); $('lightbox-img').onload = null;
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
  for (const id of ['load-url', 'url', 'file', 'share', 'sources', 'course', 'discover', 'mode', 'diff', 'dedupe', 'stable', 'page-limit', 'video-only', 'full', 'course-name', 'course-date', 'course-start', 'pdf-layout', 'pdf-timestamps', 'pdf-bookmarks']) $(id).disabled = active;
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
  $('course-report').disabled = active || !currentCourseLessons().length;
  $('batch-course-report').disabled = active || !batchCourseKey();
  document.querySelectorAll('#suspect-ranges button').forEach(button => { button.disabled = active || (!button.classList.contains('suspect-dismiss') && !sourceReady); });
  $('stop').disabled = !task && !realtimeTimer && !batchRunning && !batchDiscovery;
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
  $('batch-discover').textContent = batchDiscovery ? '正在读取课次…' : '读取课程课次';
  $('batch-retry').disabled = active || !batchJobs.some(job => job.discovery?.state === 'error');
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
function revealCards(cards, options) {
  if (!cards.length) return;
  const root = $('pages').getBoundingClientRect();
  let revealed = 0;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom <= root.top || rect.top >= root.bottom || rect.right <= root.left || rect.left >= root.right) continue;
    PPTMotion.reveal(card, options);
    if (++revealed === 12) break;
  }
}
function render({revealNew = false} = {}) {
  const container = $('pages'), scrollTop = container.scrollTop;
  const existing = new Map([...container.children].map(card => [Number(card.dataset.pageId), card]));
  const retained = new Set(pages.map(page => page.id));
  for (const [id, card] of existing) if (!retained.has(id)) {
    const image = card.querySelector('img'); thumbnailObserver.unobserve(image); thumbnailQueue.delete(image);
    PPTMotion.cancel(card); releaseThumbnail(image); thumbnailStates.delete(image); card.remove();
  }
  const added = [];
  pages.forEach((page, index) => {
    const card = existing.get(page.id) || addCard(page, index), image = card.querySelector('img'), label = card.querySelector('.slide-time');
    if (revealNew && !existing.has(page.id)) added.push(card);
    image.alt = `第 ${index + 1} 页`; image.setAttribute('aria-label', `放大第 ${index + 1} 页`);
    label.textContent = `${index + 1} · ${Number.isFinite(page.sourceTime) ? timecode(page.sourceTime) : new Date(page.time).toLocaleTimeString()}`;
    label.setAttribute('aria-label', `回看第 ${index + 1} 页${Number.isFinite(page.sourceTime) ? ' ' + timecode(page.sourceTime) : ''}`);
    card.querySelector('.page-select').setAttribute('aria-label', `选择第 ${index + 1} 页`);
    if (container.children[index] !== card) container.insertBefore(card, container.children[index] || null);
  });
  $('count').textContent = `共 ${pages.length} 页`;
  container.scrollTop = scrollTop; $('review-notice').hidden = !pages.length;
  updateSelection(); renderLibrary(); controls();
  revealCards(added);
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
    PPTMotion.reveal($('status'), {y: 3, duration: 160});
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
function acquisitionError(code, message, cause) { return Object.assign(new Error(message, {cause}), {code}); }
function acquisitionReason(error) {
  for (let depth = 0; error && depth < 8; depth++, error = error.cause) {
    if (error.name === 'QuotaExceededError' || error.code === 'STORAGE_LOW') return 'STORAGE_LOW';
    if (error.code === 'PAGE_LIMIT') return 'PAGE_LIMIT';
  }
  return '';
}
async function checkCaptureStorage(guard = manualStorageGuard) {
  if (guard.checked && guard.committed < 25) return;
  let estimate;
  try { estimate = await navigator.storage?.estimate?.(); } catch { /* Unavailable estimates do not block real writes. */ }
  if (Number.isFinite(estimate?.quota) && estimate.quota >= 0 && Number.isFinite(estimate?.usage) && estimate.usage >= 0 && estimate.quota - estimate.usage < 32 * 1024 ** 2) {
    throw acquisitionError('STORAGE_LOW', '本机剩余空间不足 32 MiB，已暂停提取；截图和进度已保留。请释放空间后继续。');
  }
  guard.checked = true; guard.committed = 0;
}
async function save(f, context = null) {
  const signal = context?.signal || task?.signal, lessonId = activeLesson?.id;
  const check = () => { signal?.throwIfAborted(); checkDedupeContext(context); if (activeLesson?.id !== lessonId) throw new DOMException('课次已切换', 'AbortError'); };
  await dbReady; check();
  if (scanId && pages.some(page => page.scanId === scanId && Math.abs(page.sourceTime - f.sourceTime) < 0.001)) return false;
  const maxPages = PPTLibrary.pageLimit(captureLimits.maxPages), storageGuard = context?.storageGuard || manualStorageGuard;
  if (pages.length >= maxPages) throw acquisitionError('PAGE_LIMIT', `本节已达 ${maxPages} 页上限，截图和进度已保留；可在提取设置中调高上限后继续。`);
  await checkCaptureStorage(storageGuard);
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
  try { page.id = await writePage(page, asset); }
  catch (error) {
    if (acquisitionReason(error) === 'STORAGE_LOW') throw acquisitionError('STORAGE_LOW', '本机存储空间不足，已暂停提取；已保存的截图和进度已保留。请释放空间后继续。', error);
    throw error;
  }
  storageGuard.committed++; cacheSignature(context, page.id, f.sig);
  const append = insertAt === pages.length;
  pages.splice(insertAt, 0, page); syncAllPages(); forgetUndo(); last = f.sig;
  if (append) {
    const container = $('pages'), scrollTop = container.scrollTop, card = addCard(page, insertAt);
    $('count').textContent = `共 ${pages.length} 页`; $('review-notice').hidden = false;
    container.scrollTop = scrollTop; updateSelection(); renderLibrary(); controls(); revealCards([card]);
  } else render({revealNew: true});
  return true;
}
async function releaseSource() {
  releaseDedupeContext(); cancelSelection();
  manualStorageGuard.checked = false; manualStorageGuard.committed = 0;
  let persistenceError;
  if (activeLesson && ready && sourceReady) try { await persistLesson(); } catch (error) { persistenceError = error; }
  window.PPTWorkspace?.cancelPreflight();
  if (stream) { stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; }
  hls?.destroy(); hls = null; video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null; sourceReady = false; loadedIdentity = null; mediaContext = {}; $('media-status').textContent = '';
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
  catch (cleanup) { return Object.assign(Error(`${error.message}；清理失败：${cleanup.message}`, {cause: error}), {...error, name: error.name, code: error.code}); }
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
  if (video.readyState < 2) await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadeddata', done); video.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
    const done = () => { if (video.readyState >= 2) { cleanup(); resolve(); } };
    const fail = () => { cleanup(); reject(PPTCore.mediaError(video.error, mediaContext)); };
    const abort = () => { cleanup(); reject(new DOMException('已停止', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(PPTCore.mediaError({code: 'MEDIA_TIMEOUT'}, mediaContext)); }, 45000);
    video.addEventListener('loadeddata', done); video.addEventListener('error', fail); signal?.addEventListener('abort', abort, {once: true});
  });
  signal?.throwIfAborted();
  if (!(video.videoWidth > 0 && video.videoHeight > 0)) throw mediaFailure('MEDIA_NO_VIDEO', 'load', '媒体没有可用的解码视频画面；可能只有音轨，或视频初始化不受支持。请换用含有效视频轨的文件。');
  if (mediaContext.audioOmitted) {
    const inspection = mediaContext.inspection, tolerance = Math.max(1 / inspection.movieTimescale, 0.001);
    if (!Number.isFinite(video.duration) || Math.abs(video.duration - inspection.videoDuration) > tolerance) {
      throw mediaFailure('MEDIA_DURATION_MISMATCH', 'load', '忽略音轨后的原生时长与视频轨索引不一致，已停止加载；请关闭“仅使用视频轨”后重新加载，或换用同课次其他视频。');
    }
  }
  const decoded = () => {
    const quality = video.getVideoPlaybackQuality?.();
    return !!(quality && quality.totalVideoFrames > quality.droppedVideoFrames || video.webkitDecodedFrameCount > (video.webkitDroppedFrameCount || 0));
  };
  if (!decoded()) {
    // loadeddata can come from audio before any video is decoded, even with track dimensions.
    const start = video.currentTime, time = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.1, video.duration / 2) : 0.1;
    const scanner = new PPTScanner(video, () => {}, mediaContext);
    await scanner.seek(time, signal); signal?.throwIfAborted();
    if (!decoded()) throw Object.assign(mediaFailure('MEDIA_NO_VIDEO', 'load', '浏览器尚未解码出可用的视频画面，只有轨道尺寸信息。请检查文件或使用受支持的编码。'), {time});
    await scanner.seek(start, signal); signal?.throwIfAborted();
  }
}
function mediaFailure(code, phase, message, cause) { return Object.assign(Error(message, cause ? {cause} : undefined), {code, phase}); }
// The deadline is per operation. A slow but progressing movie has no lifetime limit.
function mediaWait(start, {signal, timeoutMs = 0, phase = 'local-read', local = true, onLate} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const finish = (value, error) => { if (settled) return; settled = true; cleanup(); error ? reject(value) : resolve(value); };
    const abort = () => finish(new DOMException('已停止', 'AbortError'), true);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) { abort(); return; }
    if (timeoutMs > 0) timer = setTimeout(() => finish(PPTCore.mediaError({code: 'MEDIA_TIMEOUT'}, {phase, local}), true), timeoutMs);
    Promise.resolve().then(start).then(value => {
      if (settled) { if (onLate) Promise.resolve().then(() => onLate(value)).catch(() => {}); }
      else finish(value, false);
    }, error => finish(error, true));
  });
}
async function prepareMedia(file, signal, {timeoutMs = 30000} = {}) {
  signal?.throwIfAborted();
  mediaContext = {local: true, audioOmitted: false};
  if (!mediaRecovery.omitAudio) { $('media-status').textContent = '未启用音轨忽略，使用原文件。'; return file; }
  status('正在检查本地媒体并准备视频轨…');
  // The parser still receives real Blob slices for its zero-copy rewrite, but each read has an idle deadline.
  const input = {size: file.size, type: file.type, slice(...args) {
    const part = file.slice(...args), read = part.arrayBuffer.bind(part);
    part.arrayBuffer = () => mediaWait(read, {signal, timeoutMs}); return part;
  }};
  let prepared;
  try { prepared = await mediaWait(() => PPTMP4.prepare(input, {signal}), {signal}); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error.code === 'LOCAL_READ_FAILED') throw mediaFailure('LOCAL_READ_FAILED', 'local-read', error.cause?.code === 'MEDIA_TIMEOUT' ? '本地文件或缓存读取超时，请检查磁盘或重新下载后导入。' : '本地文件或缓存读取失败，请检查文件与磁盘；已保存截图不受影响。', error);
    throw error;
  }
  signal?.throwIfAborted();
  const inspection = prepared.inspection;
  if (prepared.mode === 'reject') throw mediaFailure(inspection.code, 'prepare', inspection.status === 'missing-index'
    ? 'MP4 缺少 moov 索引，无法确定视频时间和位置。请换用同课次其他通道或用外部工具处理原文件。'
    : 'MP4 容器结构非法，无法安全读取。请换用同课次其他通道或用外部工具检查原文件。');
  mediaContext = {local: true, audioOmitted: prepared.mode === 'audio-omitted', inspection};
  $('media-status').textContent = mediaContext.audioOmitted ? '已忽略音轨，仅用于画面提取；不代表检测到音轨损坏。'
    : inspection.status === 'video-only' ? '原文件仅有视频轨，无需改写。' : `不支持自动忽略音轨：${inspection.code}；使用原文件加载一次。`;
  return mediaContext.audioOmitted ? prepared.blob : file;
}
function originPattern(url) { const u = new URL(url); return `${u.protocol}//${u.host}/*`; }
async function fetchVideo(url, signal, {timeoutMs = 30000} = {}) {
  status('正在缓存视频到本地磁盘，完成后即可快速提取…');
  videoCache = await PPTDiskCache.create('video');
  signal?.throwIfAborted();
  const controller = new AbortController(), abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, {once: true});
  let response, reader, complete = false;
  try {
    response = await mediaWait(() => fetch(url, {credentials: 'include', signal: controller.signal}), {signal, timeoutMs, phase: 'fetch', local: false, onLate: value => value.body?.cancel()});
    signal?.throwIfAborted();
    if (![200, 206].includes(response.status)) throw mediaFailure('HTTP_STATUS', 'fetch', `视频服务器返回 HTTP ${response.status}：${[401, 403].includes(response.status) ? '请确认登录状态或重新获取地址' : [404, 410].includes(response.status) ? '资源当前不可用，请换用可用地址' : '无法获取完整文件，请检查地址响应'}；此状态不能证明视频损坏。`);
    if (/text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw mediaFailure('NOT_VIDEO', 'fetch', '地址返回登录页或接口数据，不是视频文件。');
    if (!response.body) throw mediaFailure('EMPTY_MEDIA', 'fetch', '视频服务器没有返回可读取的内容。');
    const encoded = !!response.headers.get('content-encoding'), length = response.headers.get('content-length');
    const total = !encoded && length !== null && /^\d+$/.test(length) ? Number(length) : null;
    let rangeTotal = null;
    if (response.status === 206) {
      const match = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
      if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0 || Number(match[1]) !== Number(match[2]) - 1) throw mediaFailure('INCOMPLETE_RESPONSE', 'fetch', '服务器仅返回部分视频，未获得完整文件；请重新下载或换用完整地址。');
      rangeTotal = Number(match[2]);
    }
    reader = response.body.getReader();
    let received = 0, lastUpdate = 0;
    while (true) {
      const {value, done} = await mediaWait(() => reader.read(), {signal, timeoutMs, phase: 'fetch', local: false}); if (done) break;
      signal?.throwIfAborted();
      if (!value?.byteLength) continue;
      await videoCache.write(value); received += value.byteLength;
      if (Date.now() - lastUpdate > 250) {
        lastUpdate = Date.now(); $('progress').value = total ? received / total : 0;
        status(`正在写入磁盘：${(received / 1024 ** 2).toFixed(1)} MB${total ? ' / ' + (total / 1024 ** 2).toFixed(1) + ' MB' : ''}…`);
      }
    }
    signal?.throwIfAborted();
    if (!received) throw mediaFailure('EMPTY_MEDIA', 'fetch', '视频文件为空。');
    if ((total !== null && received !== total) || (rangeTotal !== null && received !== rangeTotal)) throw mediaFailure('INCOMPLETE_RESPONSE', 'fetch', '接收长度与完整视频响应不一致，文件可能被截断；请重新下载或换用完整地址。');
    const file = await videoCache.finish(/webm/i.test(url) ? 'video/webm' : 'video/mp4'); signal?.throwIfAborted();
    complete = true; return file;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('已停止', 'AbortError');
    if (error.phase) throw error;
    throw mediaFailure('FETCH_FAILED', 'fetch', '视频传输中断：' + error.message, error);
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!complete) { controller.abort(); if (reader) await reader.cancel().catch(() => {}); else await response?.body?.cancel().catch(() => {}); }
    reader?.releaseLock();
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
  lastAcquisitionFailure = '';
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
    controller.signal.throwIfAborted(); await releaseSource(); task = controller; activeBatchJob = batchJob; controls();
    await setCourseReferrer([originPattern(info.url), ...pendingOrigins]);
    sourceName = options.sourceName || info.name; $('progress').value = 0;
    const identity = {sourceName, coursePage, batchJobId: batchJob?.id || '', sourceKey: 'url:' + info.url};
    if (info.kind === 'm3u8') {
      pendingOrigins = []; status('正在检查 HLS 播放列表与分片域名…');
      await inspectPlaylist(info.url, controller.signal);
      pendingOrigins = [...new Set(pendingOrigins)];
      if (pendingOrigins.length) throw Error(`视频分片还需要访问 ${pendingOrigins.join('、')}，再点一次加载按钮即可授权`);
      if (!window.Hls?.isSupported()) throw Error('当前浏览器不支持 HLS 解码，请导入本地 MP4');
      hls = new Hls({enableWorker: false, maxBufferLength: 8, maxMaxBufferLength: 15, backBufferLength: 0, xhrSetup: xhr => { xhr.withCredentials = true; }});
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { (task || controller).abort(Error('HLS 加载失败：' + data.details + '，请检查分片域名权限或导入本地 MP4')); } });
      mediaContext = {local: false, audioOmitted: false};
      hls.loadSource(info.url); hls.attachMedia(video); await awaitVideo(controller.signal);
    } else {
      // A Blob URL gives an origin-clean canvas even if the CDN omits CORS headers.
      const original = await fetchVideo(info.url, controller.signal);
      const blob = await prepareMedia(original, controller.signal);
      controller.signal.throwIfAborted(); objectURL = URL.createObjectURL(blob); video.src = objectURL; await awaitVideo(controller.signal);
    }
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw Error('视频没有可用的完整时长，无法快速扫描');
    controller.signal.throwIfAborted(); loadedIdentity = identity;
    const source = {kind: 'remote', url: info.url, ...loadedIdentity, page: coursePage, duration: video.duration};
    const candidates = candidatesPage === coursePage ? sourceCandidates : [];
    const candidate = candidates.find(item => item.url === info.url);
    const retained = !candidate && lessons.find(item => item.source && PPTLibrary.key(item.source) === PPTLibrary.key(source));
    const detected = retained ? retained.course : PPTCourse.forMedia(info.url, candidates, sourceCourse);
    await bindLesson(source, detected, controller.signal);
    await applyBatchCrop(batchJob); controller.signal.throwIfAborted(); sourceReady = true;
    video.pause(); frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${sourceName} · ${timecode(video.duration)} · ${video.videoWidth} × ${video.videoHeight}。可框选 PPT 或直接开始快速提取。`);
    pendingOrigins = []; loaded = true;
  } catch (e) {
    const reason = await releaseFailedSource(controller.signal.aborted ? controller.signal.reason : e);
    lastAcquisitionFailure = acquisitionReason(reason);
    if (activeBatchJob === batchJob) activeBatchJob = null;
    status(lastAcquisitionFailure === 'STORAGE_LOW' ? '本机存储空间不足，视频加载已暂停；已保存的截图和进度已保留。请释放空间后重试：' + reason.message : reason.name === 'AbortError' ? '视频加载已停止。可以重新加载。' : '加载失败：' + reason.message);
  } finally { task = null; controls(); }
  return loaded;
}
$('load').onclick = () => { const source = sources.find(x => x.url === $('sources').value); if (source) loadRemote(source.url); else status('未发现可加载的视频，请先在课程页播放再刷新列表'); };
$('load-url').onclick = () => loadRemote($('url').value.trim());
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file || busy()) return;
  const sourceKey = 'file:' + JSON.stringify([file.name, file.size, file.lastModified]);
  const identity = {sourceName: file.name, sourceKey, fileName: file.name, size: file.size, lastModified: file.lastModified};
  activeBatchJob = null; task = new AbortController(); const controller = task; controls();
  try {
    await dbReady; await namingSave; controller.signal.throwIfAborted();
    await releaseSource(); controller.signal.throwIfAborted(); sourceName = identity.sourceName;
    if (activeLesson?.source?.sourceKey === sourceKey) { coursePage = activeLesson.source.page || ''; sourceCourse = {...activeLesson.course}; sourceCoursePage = coursePage; }
    const blob = await prepareMedia(file, controller.signal);
    controller.signal.throwIfAborted(); objectURL = URL.createObjectURL(blob); video.src = objectURL; await awaitVideo(controller.signal);
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw Error('本地视频时长无效');
    controller.signal.throwIfAborted(); loadedIdentity = {...identity, coursePage, batchJobId: ''};
    await bindLesson({kind: 'file', ...loadedIdentity, page: coursePage, duration: video.duration}, sourceCourse, controller.signal); controller.signal.throwIfAborted(); sourceReady = true; frame(0); draw(); $('progress').value = 0;
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
    cache?.remove().catch(e => status('下载临时文件清理失败：' + e.message));
  }, 60000);
}
window.addEventListener('pagehide', () => {
  stopBatchDiscovery(); task?.abort();
  video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null;
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
$('batch-course-zip').onclick = () => exportCourseZIP(batchCourseKey(), 'batch-status', batchPage);
$('course-pdf').onclick = () => exportCoursePDF();
$('batch-course-pdf').onclick = () => exportCoursePDF(batchCourseKey(), 'batch-status', batchPage);
$('course-report').onclick = () => exportCourseReport();
$('batch-course-report').onclick = () => exportCourseReport(batchCourseKey(), 'batch-status', batchPage);
function courseIntegrity(courseKey, course = currentCourseLessons(courseKey), pages = allPages, {directoryPage = activeLesson?.page || '', ...options} = {}) {
  const retained = savedBatches.filter(item => PPTLibrary.courseKey(item.page, item.jobs[0]?.course) === courseKey);
  const selected = retained.find(item => item.page === directoryPage), jobs = new Map((selected?.jobs || []).map(job => [job.id, job]));
  // Exact-page discovery is authoritative for this action; other known rows cannot disappear.
  for (const batch of retained) for (const job of batch.jobs) if (!jobs.has(job.id)) jobs.set(job.id, job);
  const totals = retained.map(batch => batch.discovery?.total).filter(total => Number.isSafeInteger(total) && total >= 0);
  const total = totals.length ? Math.max(...totals) : undefined;
  const reconciled = selected?.discovery?.complete === true && selected.discovery.total === jobs.size && total === selected.discovery.total;
  const discovery = {...selected?.discovery, total,
    complete: selected?.discovery?.complete === true ? reconciled : selected?.discovery?.complete,
    failures: reconciled ? selected.discovery.failures || [] : retained.flatMap(batch => batch.discovery?.failures || []),
  };
  return PPTLibrary.integrity({batch: {jobs: [...jobs.values()], discovery}, lessons: course, pages, ...options});
}
function integrityHint(snapshot) {
  const s = snapshot.summary, unknown = s.directoryUnknown + s.directoryFailures + s.discoveryFailures + s.discoveryUnknown + (snapshot.directory.state === 'incomplete' ? 1 : 0);
  const retained = snapshot.lessons.filter(row => row.savedPages > 0 && !row.scan.reachedEnd);
  const unfinished = retained.filter(row => ['running', 'paused', 'failed'].includes(row.scan.taskState)).length;
  const legacy = retained.filter(row => row.scan.taskState === 'done').length, unverified = retained.length - unfinished - legacy;
  return `未确认到尾部 ${s.notReachedEnd} 节；目录失败/未知 ${unknown} 项；待复核 ${s.suspectRanges} 段。${unfinished ? `其中 ${unfinished} 节尚未完成本次扫描。` : ''}${legacy ? `旧任务尾部待核对 ${legacy} 节。` : ''}${unverified ? `有截图但覆盖证据待核对 ${unverified} 节。` : ''}知识内容尚需核验。`;
}
async function saveCourseReceipt(courseKey, snapshot) {
  snapshot.export.exportedAt = new Date().toISOString();
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({lastExport: snapshot}, 'courseExport:' + courseKey);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error('导出记录未能保存')); });
}
async function exportCourseReport(courseKey, statusId = 'status', directoryPage) {
  if (busy()) return;
  exportBusy = true; controls();
  try {
    await namingSave; await lessonSave; syncAllPages();
    if (courseKey === undefined) courseKey = currentCourseKey();
    if (!courseKey) throw Error('请先选择课程');
    const snapshot = courseIntegrity(courseKey, undefined, undefined, {directoryPage}), tx = db.transaction('settings'), read = tx.objectStore('settings').get('courseExport:' + courseKey);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error('导出记录未能读取')); });
    snapshot.lastExport = read.result?.lastExport || null;
    downloadBlob(new Blob([JSON.stringify(snapshot, null, 2) + '\n'], {type: 'application/json;charset=utf-8'}), '课程完整性报告.json');
    const message = '已生成课程完整性报告。' + integrityHint(snapshot); status(message); if (statusId !== 'status') $(statusId).textContent = message;
  } catch (e) { const message = '报告导出失败：' + e.message; status(message); if (statusId !== 'status') $(statusId).textContent = message; }
  finally { exportBusy = false; controls(); }
}
async function exportCoursePDF(courseKey, statusId = 'status', directoryPage) {
  if (busy()) return;
  const report = message => { status(message); if (statusId !== 'status') $(statusId).textContent = message; };
  const {layout, timestamps} = pdfOptions();
  exportBusy = true; controls(); let cache;
  try {
    await namingSave; await lessonSave; syncAllPages();
    if (courseKey === undefined) courseKey = currentCourseKey();
    if (!courseKey) throw Error('请先读取课程录像列表');
    const course = structuredClone(currentCourseLessons(courseKey)).sort((a, b) => (a.course?.date || '').localeCompare(b.course?.date || '') || (a.course?.start || '').localeCompare(b.course?.start || '') || a.created - b.created);
    const title = PPTCourse.normalize(course[0]?.course || {}).name || '未命名课程';
    const entries = course.map((lesson, index) => {
      const info = PPTCourse.normalize(lesson.course || {});
      return {title: `第 ${index + 1} 课 · ${info.date || '未知日期'} ${info.start || '未知时间'}`,
        pages: allPages.filter(page => page.lessonId === lesson.id).sort((a, b) => a.order - b.order).map(page => ({...page}))};
    });
    const nonempty = entries.filter(entry => entry.pages.length), total = nonempty.reduce((sum, entry) => sum + entry.pages.length, 0);
    if (!total) throw Error('本课程还没有截图');
    const snapshot = courseIntegrity(courseKey, course, entries.flatMap(entry => entry.pages), {format: 'pdf', directoryPage}), empty = snapshot.summary.emptyLessons;
    cache = await PPTDiskCache.create('export'); let count = 0;
    await writeCoursePDF(entries, {title, layout, timestamps, write: cache.write, readImage: async page => {
      report(`正在合并整课 PDF：第 ${++count} / ${total} 页…`); $('progress').value = (count - 1) / total;
      return PPTPageStore.imageBytes(db, page.id);
    }});
    const file = await cache.finish('application/pdf'), name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    downloadBlob(file, `${name}-整课.pdf`, cache); cache = null; $('progress').value = 1;
    let receiptError = ''; try { await saveCourseReceipt(courseKey, snapshot); } catch (e) { receiptError = '文件已生成，但本次导出记录未保存：' + e.message; }
    report(`已生成整课合并 PDF，含 ${nonempty.length} 节，共 ${total} 页。${empty ? `跳过 ${empty} 个空课次（尚无截图）。` : ''}${integrityHint(snapshot)}${receiptError}`);
  } catch (e) {
    let message = e.message; if (cache) try { await cache.remove(); } catch (cleanup) { message += '；临时文件清理失败：' + cleanup.message; }
    report('整课导出失败：' + message);
  } finally { exportBusy = false; controls(); }
}
async function exportCourseZIP(courseKey, statusId = 'status', directoryPage) {
  if (busy()) return;
  const report = message => { status(message); if (statusId !== 'status') $(statusId).textContent = message; };
  const options = pdfOptions();
  exportBusy = true; controls(); let cache;
  try {
    await namingSave; await lessonSave; syncAllPages();
    // Local lessons are grouped by name, which pending saves may change.
    if (courseKey === undefined) courseKey = currentCourseKey();
    if (!courseKey) throw Error('请先读取课程录像列表');
    const course = structuredClone(currentCourseLessons(courseKey)).sort((a, b) => (a.course?.date || '').localeCompare(b.course?.date || '') || (a.course?.start || '').localeCompare(b.course?.start || '') || a.created - b.created);
    const entries = course.map((lesson, index) => ({name: `${String(index + 1).padStart(3, '0')}-${PPTCourse.filename(lesson.course) || lessonLabel(lesson) + '.pdf'}`, pages: allPages.filter(page => page.lessonId === lesson.id).sort((a, b) => a.order - b.order).map(page => ({...page}))}));
    const nonempty = entries.filter(entry => entry.pages.length), total = nonempty.reduce((sum, entry) => sum + entry.pages.length, 0);
    if (!nonempty.length) throw Error('本课程还没有截图');
    const snapshot = courseIntegrity(courseKey, course, entries.flatMap(entry => entry.pages), {format: 'zip', directoryPage}), empty = snapshot.summary.emptyLessons;
    cache = await PPTDiskCache.create('export'); let count = 0;
    await writeCourseZIP(entries, {...options, write: cache.write, readImage: async page => {
      report(`正在打包课程 PDF：第 ${++count} / ${total} 页…`); $('progress').value = (count - 1) / total;
      return PPTPageStore.imageBytes(db, page.id);
    }});
    const file = await cache.finish('application/zip'), name = (course[0]?.course?.name || '课程').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    downloadBlob(file, `${name}-课次PDF.zip`, cache); cache = null; $('progress').value = 1;
    let receiptError = ''; try { await saveCourseReceipt(courseKey, snapshot); } catch (e) { receiptError = '文件已生成，但本次导出记录未保存：' + e.message; }
    report(`已生成 ${nonempty.length} 节 PDF 的课程包，共 ${total} 页。${empty ? `跳过 ${empty} 个空课次（尚无截图）。` : ''}${integrityHint(snapshot)}${receiptError}`);
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
  if (!range) {
    const coverage = resume && activeLesson.task.coverage ? structuredClone(activeLesson.task.coverage)
      : {version: 1, sourceKey: PPTLibrary.key(activeLesson.source), trackKey: PPTBatch.trackKey(activeLesson.source), duration: video.duration, ranges: [], reachedEnd: false};
    const comparisonVersion = resume && activeLesson.task.comparisonVersion !== 'local-v1' ? 'mixed' : 'local-v1';
    activeLesson.task = {id: scanId, state: 'running', checkpoint: start, baselineTime, duration: video.duration, settings, crop: {...crop}, ignoreRect: ignoreRect && {...ignoreRect}, coverage, comparisonVersion};
  }
  let coveredTo = start;
  const context = createDedupeContext(controller.signal);
  context.storageGuard = {committed: 0, checked: false}; lastAcquisitionFailure = '';
  let outcome = null, discovered = [];
  cancelSelection(); controls(); video.pause(); $('progress').value = 0;
  status(range ? '正在细查所选时间段…' : resume ? `正在从 ${timecode(start)} 继续扫描…` : '正在快速扫描，请保持工具页打开…');
  const started = performance.now();
  try {
    await limitsSave; await persistLesson(); await checkCaptureStorage(context.storageGuard);
    const scanner = new PPTScanner(video, frame, mediaContext);
    const result = await scanner.scan({step: range ? 0.5 : settings.step, threshold: settings.threshold, dedupe: range ? true : settings.dedupe, start, end, baselineTime, signal: controller.signal, save: f => save(f, context),
      compare: (a, b, threshold) => PPTCore.similar(a, b, threshold, context.mask),
      isDuplicate: (sig, threshold) => hasSimilar(sig, threshold, context, context.crop),
      suspect: async item => {
        discovered = PPTLibrary.mergeRanges(discovered, item);
        const suspects = PPTLibrary.mergeRanges(activeLesson.suspects, item);
        await persistLesson({...activeLesson, suspects}); activeLesson.suspects = suspects;
      },
      checkpoint: async p => {
        if (!range) {
          const previous = activeLesson.task, next = {...previous, checkpoint: p.time, baselineTime: p.baselineTime,
            coverage: {...previous.coverage, ranges: PPTLibrary.mergeRanges(previous.coverage.ranges, {start: coveredTo, end: p.time, time: coveredTo})}};
          await persistLesson({...activeLesson, task: next}); activeLesson.task = next; coveredTo = p.time;
        }
        await checkCaptureStorage(context.storageGuard);
      },
      progress: p => { $('progress').value = p.ratio; status(`扫描 ${timecode(p.time)} / ${timecode(p.duration)} · ${(p.ratio * 100).toFixed(1)}% · 新增 ${p.saved} 页 · 耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒`); }
    });
    const remaining = originalRanges.flatMap(item => item.end < start || item.start > end ? [item] : [
      ...(item.start < start ? [{...item, end: start, time: Math.min(item.time ?? item.start, start)}] : []),
      ...(item.end > end ? [{...item, start: end, time: Math.max(item.time ?? item.end, end)}] : [])
    ]);
    const suspects = discovered.reduce((list, item) => PPTLibrary.mergeRanges(list, item), remaining);
    const next = range ? activeLesson.task : {...activeLesson.task, state: 'done', coverage: {...activeLesson.task.coverage,
      reachedEnd: result.completedTo >= video.duration - Math.min(.05, video.duration / 2)}};
    await persistLesson({...activeLesson, task: next, suspects}); activeLesson.task = next; activeLesson.suspects = suspects;
    const verifiedTail = PPTLibrary.integrity({lessons: [activeLesson]}).lessons[0].scan.reachedEnd;
    status(`${range ? '局部细查' : '提取'}完成：新增 ${result.saved} 页，本节共 ${pages.length} 页，耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒。${verifiedTail ? '已从头连续扫到尾部。' : '尚无从头连续扫到尾部的证据。'}${activeLesson.suspects.length ? `还有 ${activeLesson.suspects.length} 个时间段待复核。` : ''}\n请先筛选页面，再下载 PDF 或图片包。`);
    outcome = result;
  } catch (e) {
    lastAcquisitionFailure = acquisitionReason(e);
    let message = e.name === 'AbortError' ? `已停止，本次新增 ${pages.length - before} 页。` : '提取中断，已截页面已保留：' + e.message;
    if (!range) activeLesson.task = {...activeLesson.task, state: e.name === 'AbortError' || lastAcquisitionFailure ? 'paused' : 'failed', ...(lastAcquisitionFailure ? {reason: lastAcquisitionFailure} : {})};
    try { await persistLesson(); } catch (storage) { message += '；任务状态未能保存：' + storage.message; }
    status(message);
  } finally {
    releaseDedupeContext(context); scanId = ''; task = null; video.pause();
    if (manualJob) {
      const count = batchPageCount(manualJob); manualJob.pages = count;
      manualJob.state = outcome ? 'done' : count ? 'partial' : lastAcquisitionFailure ? 'stopped' : 'failed'; manualJob.error = outcome ? '' : $('status').textContent;
      try { await persistBatch(manualJob); } catch (e) { status('批量状态保存失败：' + e.message); }
      renderBatchJobs();
      $('batch-status').textContent = outcome ? `本节 0 路视频本次扫描结束，共 ${count} 页；尾部覆盖与待复核范围请查看课程报告。` : `本节 0 路视频未完成，已保留 ${count} 页。${lastAcquisitionFailure ? manualJob.error : ''}`;
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
    title.textContent = `${job.course?.date || '未知日期'} ${String(job.course?.start || '').slice(0, 5)} · ${job.sourceName || job.captureCode || job.id}${size}${job.requiresCrop ? ' · 仅有 0 路视频' : ''}`;
    const acquisition = job.discovery, acquisitionLabels = {pending: '读取中', ready: '读取成功', error: '读取失败', unavailable: '确认无可用视频', skipped: '未开课/不可读取'};
    state.className = `batch-state ${acquisition?.state === 'error' ? 'failed' : job.state}`;
    const scanLabel = job.state === 'done' ? (batchLesson(job) && PPTLibrary.integrity({lessons: [batchLesson(job)]}).lessons[0].scan.reachedEnd ? '已扫到尾部' : '尾部待核对') : labels[job.state] || job.state;
    state.textContent = `${scanLabel} · ${count} 页${acquisition ? ` · ${acquisitionLabels[acquisition.state]}${acquisition.code ? ` [${acquisition.code}]` : ''}${acquisition.message ? `：${acquisition.message}` : ''}${acquisition.attempts ? `（尝试 ${acquisition.attempts} 次）` : ''}` : ''}`;
    if (job.error) { state.title = job.error; state.textContent += ' · ' + job.error; }
    download.textContent = '下载本节 PDF'; download.disabled = batchRunning || !count;
    download.onclick = async () => {
      if (busy()) return;
      exportBusy = true; controls();
      try { await downloadPDF(batchPages(job), batchLesson(job)?.course || job.course); }
      catch (error) { $('batch-status').textContent = '导出失败：' + error.message; }
      finally { exportBusy = false; controls(); }
    };
    row.append(choose, title, state);
    if (job.requiresCrop && (!job.discovery || job.discovery.state === 'ready')) {
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
function discoverySummary(jobs, metadata) {
  const count = name => jobs.filter(job => job.discovery?.state === name).length;
  const integrity = metadata?.complete === true ? '目录已列举完整' : metadata?.complete === false ? '目录不完整' : '目录完整性未知';
  const resolved = jobs.filter(job => job.discovery && job.discovery.state !== 'pending').length;
  return `已知 ${metadata?.total ?? jobs.length} 节 · 已处理 ${resolved} 节 · 读取成功 ${count('ready')} · 失败 ${count('error')} · 无视频 ${count('unavailable')} · 跳过 ${count('skipped')} · ${integrity}`;
}
function discoveryMessage(session, message, cancellable = true) {
  const signal = cancellable ? session.controller.signal : null;
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('课程读取已停止', 'AbortError')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, {once: true});
    timer = setTimeout(() => { cleanup(); reject(Error('课程消息等待超过 10000ms，请重试')); }, 10000);
    Promise.resolve().then(() => chrome.tabs.sendMessage(session.tabId, message, {frameId: 0})).then(reply => {
      if (message.type === 'PPT_BATCH_DISCOVER' && reply?.requestId && (session.stopRequested || !session.current())) {
        discoveryMessage(session, {type: 'PPT_BATCH_CANCEL', requestId: reply.requestId}, false).catch(() => {});
      }
      cleanup(); resolve(reply);
    }, error => { cleanup(); reject(error); });
  });
}
function discoveryPollWait(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('课程读取已停止', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000);
    signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort();
  });
}
function stopBatchDiscovery() {
  const session = batchDiscovery;
  if (!session) return;
  session.stopRequested = true; session.controller.abort();
  if (session.requestId) discoveryMessage(session, {type: 'PPT_BATCH_CANCEL', requestId: session.requestId}, false).catch(() => {});
  $('batch-status').textContent = '课程读取已停止，正在保留已知课次。';
}
function mergeDiscoveredJobs(result) {
  const previous = savedBatches.find(item => item.page === result.page)?.jobs || (batchPage === result.page ? batchJobs : []);
  const jobs = result.jobs.map(job => {
    const existing = previous.find(old => old.id === job.id);
    if (job.discovery && job.discovery.state !== 'ready') return {...existing, ...job, state: existing?.state || job.state || 'pending', selected: existing?.selected ?? job.selected ?? false};
    if (job.requiresCrop && existing) {
      const option = (job.options || []).find(item => sameMediaSource(existing, item));
      if (option) job = {...job, ...option};
    }
    const unchanged = sameMediaSource(existing, job), lesson = batchLesson(job, result.page), count = lesson ? allPages.filter(page => page.lessonId === lesson.id).length : 0;
    const done = (lesson?.task?.state === 'done' && sameMediaSource(lesson.source, job)) || (unchanged && existing?.state === 'done');
    const next = {...existing, ...job, ...(existing?.cropOverride ? {cropOverride: structuredClone(existing.cropOverride)} : {}),
      manualPrepared: !!existing?.manualPrepared, cropRejected: !!existing?.cropRejected || (!!existing?.cropOverride && !unchanged), cropConfirmed: unchanged && !!existing?.cropConfirmed};
    return {...next, selected: done || !PPTBatch.automatic(next) ? false : job.discovery ? job.selected ?? true : existing?.selected ?? true,
      state: done ? 'done' : count ? 'partial' : unchanged && ['failed', 'stopped', 'manual'].includes(existing?.state) ? existing.state : PPTBatch.automatic(next) ? 'pending' : 'needs-crop', error: unchanged ? existing?.error || '' : ''};
  });
  for (const old of previous) if (!jobs.some(job => job.id === old.id)) jobs.push(old);
  return jobs;
}
async function applyDiscovery(session, result) {
  if (!session.current() || result.page !== session.page || !Array.isArray(result.jobs)) return false;
  const jobs = mergeDiscoveredJobs(result), listing = session.retryOnly ? session.previousDiscovery : result;
  const discovery = {complete: listing?.complete, total: listing?.total ?? result.total, eligible: listing?.eligible ?? result.eligible,
    courseId: listing?.courseId ?? result.courseId, courseName: listing?.courseName ?? result.courseName,
    progress: result.progress, failures: [...(session.retryOnly ? session.previousDiscovery?.failures?.filter(item => !item.jobId) || [] : []), ...(result.failures || [])]};
  await PPTLibrary.batch(db, result.page, jobs, discovery);
  retainBatch(structuredClone({page: result.page, jobs, discovery}));
  if (!session.current()) return false;
  batchPage = result.page; batchJobs = jobs; session.lastResult = result;
  if (activeBatchJob && loadedIdentity?.coursePage === batchPage) activeBatchJob = batchJobs.find(job => job.id === activeBatchJob.id && sameMediaSource(job, loadedIdentity)) || activeBatchJob;
  await namingSave; await lessonSave;
  for (const job of jobs) {
    if (!session.current()) return false;
    const lesson = batchLesson(job, result.page), course = PPTCourse.normalize(job.course);
    if (!lesson || lesson.namingManual || !course.date || !course.start || JSON.stringify(lesson.course) === JSON.stringify(course)) continue;
    const next = {...lesson, course: PPTCourse.forBinding(course, lesson.course)};
    await PPTLibrary.put(db, next); Object.assign(lesson, next);
    if (session.current() && lesson === activeLesson) { namingManual = false; setNaming(course, lesson.page); }
  }
  if (!session.current()) return false;
  renderLibrary(); renderBatchJobs();
  $('source-status').textContent = sourceSummary();
  const reason = discovery.failures?.filter(item => !item.jobId).map(item => item.message).join('；');
  $('batch-status').textContent = discoverySummary(jobs, discovery) + (reason ? ' · ' + reason : '');
  return true;
}
async function discoverBatch(tabId = Number($('course').value), automatic = false, retryOnly = false) {
  if (busy() || !tabId) return;
  const serial = ++batchDiscoverySerial, selected = $('course').value, lessonId = activeLesson?.id;
  const session = {tabId, page: coursePage, retryOnly, previousDiscovery: structuredClone(savedBatches.find(item => item.page === coursePage)?.discovery), controller: new AbortController(), requestId: '', stopRequested: false};
  session.current = () => batchDiscovery === session && serial === batchDiscoverySerial && $('course').value === selected && activeLesson?.id === lessonId && coursePage === session.page;
  batchDiscovery = session; controls();
  $('batch-panel').open = true; $('batch-status').textContent = automatic ? '检测到课程列表页，正在读取全部课次…' : '正在读取课程列表和录像信息…';
  try {
    await dbReady; if (!session.current()) return;
    const previous = structuredClone(savedBatches.find(item => item.page === session.page)?.jobs || (batchPage === session.page ? batchJobs : []));
    let reply = await discoveryMessage(session, {type: 'PPT_BATCH_DISCOVER', previous, retryOnly});
    if (!session.current()) return;
    if (!reply?.ok) throw Error(reply?.error || '课程页没有返回批量数据');
    // Compatibility with already-injected content scripts that return one terminal snapshot.
    if (!reply.pending && Array.isArray(reply.jobs)) { await applyDiscovery(session, reply); return; }
    if (!reply.requestId) throw Error('课程页没有返回读取请求编号');
    session.requestId = reply.requestId;
    while (session.current()) {
      await discoveryPollWait(session.controller.signal);
      reply = await discoveryMessage(session, {type: 'PPT_BATCH_STATUS', requestId: session.requestId});
      if (!session.current()) return;
      if (!reply?.ok || reply.requestId !== session.requestId) throw Error(reply?.error?.message || reply?.error || '课程读取请求已失效');
      if (reply.result && !await applyDiscovery(session, reply.result)) throw Error('课程页面已切换，忽略过期读取结果');
      if (reply.error) throw Error(reply.error.message || reply.error);
      if (!reply.pending) break;
    }
  } catch (error) {
    if (!session.current()) return;
    if (session.requestId) discoveryMessage(session, {type: 'PPT_BATCH_CANCEL', requestId: session.requestId}, false).catch(() => {});
    let recoverySaveError;
    if (session.lastResult) {
      const partial = structuredClone(session.lastResult); partial.complete = false;
      for (const job of partial.jobs) if (job.discovery?.state === 'pending') job.discovery = {state: 'error', code: session.stopRequested ? 'CANCELLED' : 'MESSAGE', message: error.message, attempts: 0};
      partial.failures = [...(partial.failures || []).filter(item => !item.jobId), ...partial.jobs.filter(job => job.discovery?.state === 'error').map(job => ({jobId: job.id, scheduleId: job.scheduleId, ...job.discovery}))];
      partial.progress = {phase: session.stopRequested ? 'cancelled' : 'error', total: partial.jobs.length, resolved: partial.jobs.filter(job => job.discovery?.state !== 'pending').length};
      await applyDiscovery(session, partial).catch(saveError => { recoverySaveError = saveError; });
    }
    const outcome = session.stopRequested ? '课程读取已停止' : '批量读取失败：' + error.message;
    const persistence = recoverySaveError ? `；目录保存失败：${recoverySaveError.message}。${session.stopRequested ? '取消' : '错误'}状态未保存，仅保留上次成功保存的课次快照。` : session.stopRequested ? '，已保留已知课次。' : '';
    $('batch-status').textContent = outcome + persistence + ' ' + discoverySummary(batchJobs, savedBatches.find(item => item.page === batchPage)?.discovery);
  } finally {
    if (batchDiscovery === session) { batchDiscovery = null; controls(); }
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
    await checkCaptureStorage({checked: false, committed: 0});
    for (let index = 0; index < selected.length; index++) {
      if (batchStopRequested) break;
      const job = selected[index]; activeBatchJob = job; job.state = 'loading'; job.error = ''; await persistBatch(); renderBatchJobs();
      $('batch-status').textContent = `第 ${index + 1} / ${selected.length} 节：正在加载 ${job.course.date} ${String(job.course.start).slice(0, 5)}…`;
      coursePage = batchPage; sourceCourse = {...job.course}; sourceCoursePage = coursePage;
      const loaded = await loadRemote(job.url, {permissionGranted: true, sourceName: job.sourceName, batchJob: job});
      if (!loaded) {
        const storageLow = lastAcquisitionFailure === 'STORAGE_LOW';
        job.state = batchStopRequested || storageLow ? 'stopped' : 'failed'; job.error = $('status').textContent;
        await persistBatch(); renderBatchJobs();
        if (storageLow) { startupError = job.error; break; }
        continue;
      }
      if (batchStopRequested) { job.state = 'stopped'; await releaseSource(); renderBatchJobs(); break; }
      if (job.requiresCrop && (!job.cropConfirmed || job.cropRejected)) {
        job.state = 'needs-crop'; job.selected = false; await persistBatch(); await releaseSource(); renderBatchJobs(); continue;
      }
      job.state = 'scanning'; await persistBatch(); renderBatchJobs();
      $('batch-status').textContent = `第 ${index + 1} / ${selected.length} 节：正在提取 PPT…`;
      const result = await fastScan(); job.pages = batchPageCount(job);
      const protection = lastAcquisitionFailure;
      if (!result) { job.state = batchStopRequested ? 'stopped' : protection ? (job.pages ? 'partial' : 'stopped') : 'failed'; job.error = $('status').textContent; }
      else job.state = 'done';
      await releaseSource(); await persistBatch(); renderBatchJobs();
      if (protection === 'STORAGE_LOW') { startupError = job.error; break; }
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
$('batch-retry').onclick = () => discoverBatch(Number($('course').value), false, true);
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
  if (batchDiscovery) { stopBatchDiscovery(); return; }
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
    let mediaReply = await chrome.tabs.sendMessage(id, {type: 'PPT_GET_MEDIA'}, {frameId: 0}).catch(() => null);
    if (revision !== discoverySerial) return;
    const key = 'media-' + id, tabUrl = tabs.find(t => t.id === id)?.url;
    let entry = (await chrome.storage.session.get(key))[key];
    if (revision !== discoverySerial) return;
    sources = entry?.page === tabUrl ? entry.items : [];
    if (!sources.length) {
      await new Promise(resolve => setTimeout(resolve, 350));
      if (revision !== discoverySerial) return;
      discovered = await chrome.tabs.sendMessage(id, {type: 'PPT_DISCOVER'}, {frameId: 0}).catch(() => discovered);
      mediaReply = await chrome.tabs.sendMessage(id, {type: 'PPT_GET_MEDIA'}, {frameId: 0}).catch(() => mediaReply);
      entry = (await chrome.storage.session.get(key))[key];
      if (revision !== discoverySerial) return;
      sources = entry?.page === tabUrl ? entry.items : [];
      if (!sources.length) {
        const fallbackUrls = mediaReply?.page === tabUrl && Array.isArray(mediaReply.urls) ? mediaReply.urls : discovered?.page === tabUrl && Array.isArray(discovered.urls) ? discovered.urls : [];
        sources = fallbackUrls.map(raw => PPTCore.mediaInfo(raw, tabUrl)).filter(Boolean).map(info => ({...info, source: '页面 / 播放器', seen: Date.now()}));
      }
    }
    // The session URL cache is legacy-compatible; candidate authority comes directly
    // from the current top-frame discovery reply even when that cache is populated.
    const combined = new Map(sources.map(item => [item.url, item]));
    for (const reply of [discovered, courseReply, mediaReply]) {
      if (reply?.page !== coursePage) continue;
      acceptCandidates(reply.candidates, coursePage);
      for (const raw of Array.isArray(reply.urls) ? reply.urls : []) {
        const info = PPTCore.mediaInfo(raw, coursePage);
        if (info && !combined.has(info.url)) combined.set(info.url, {...info, source: '页面 / 播放器', seen: Date.now()});
      }
    }
    sources = [...combined.values()];
    if (entry?.page === coursePage) acceptCourse(entry.course, coursePage);
    if (mediaReply?.page === coursePage) acceptCourse(mediaReply.course, coursePage);
    if (courseReply?.page === coursePage) acceptCourse(courseReply.course, coursePage);
    if (discovered?.page === coursePage) acceptCourse(discovered.course, coursePage);
    updateSources(true);
    if (PPTBatch.courseId(coursePage) && batchPage !== coursePage) await discoverBatch(id, true);
    $('source-status').textContent = sourceSummary();
  } catch (e) { $('source-status').textContent = '发现视频失败：' + e.message + '。请刷新课程页，或使用手动地址 / 本地视频。'; }
}
function sourceSummary() {
  const context = sourceCoursePage === coursePage && sourceCourse.name ? `${lessonLabel({course: sourceCourse})} · ` : '';
  if (batchPage === coursePage && batchJobs.length) return `${context}批量目录 ${batchJobs.length} 节。单节视频候选 ${sources.length} 个，可在批量列表选择课次。`;
  return context + (sources.length ? `已发现 ${sources.length} 个视频地址，选好后点击“加载选中视频”。` : '当前课次暂无单节视频候选。可刷新课程页并播放一次，再点“刷新视频列表”。');
}
function updateSources(reset = false) {
  sources = sources.map(item => ({...item, ...(sourceCandidates.find(candidate => candidate.url === item.url) || {}),
    course: PPTCourse.forMedia(item.url, sourceCandidates, sourceCourse)}));
  window.PPTWorkspace?.refreshSources(sources, coursePage, {reset});
  controls();
}
$('discover').onclick = discover; $('course').onchange = discover; $('sources').onchange = controls;
$('page-limit').onchange = async () => {
  const next = {maxPages: PPTLibrary.pageLimit(Number($('page-limit').value))};
  $('page-limit').value = next.maxPages;
  limitsSave = limitsSave.then(async () => {
    const previous = captureLimits;
    try {
      await dbReady;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(next, 'captureLimits');
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error('页数上限保存失败'));
      });
      captureLimits = next;
    } catch (error) { $('page-limit').value = previous.maxPages; status('页数上限保存失败：' + error.message); }
  });
  await limitsSave; renderLibrary(); controls();
};
for (const id of ['mode', 'diff', 'dedupe', 'stable']) $(id).onchange = () => { saveLessonSettings(); controls(); };
if (window.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(async (changes, area) => {
  const id = Number($('course').value), value = changes['media-' + id]?.newValue;
  if (area !== 'session' || value?.page !== coursePage) return;
  const revision = discoverySerial, page = coursePage;
  const reply = await chrome.tabs?.sendMessage(id, {type: 'PPT_GET_MEDIA'}, {frameId: 0}).catch(() => null);
  if (revision !== discoverySerial || page !== coursePage) return;
  if (reply?.page === page) acceptCandidates(reply.candidates, page);
  const combined = new Map((value.items || []).map(item => [item.url, item]));
  for (const raw of reply?.page === page && Array.isArray(reply.urls) ? reply.urls : []) {
    const info = PPTCore.mediaInfo(raw, page);
    if (info && !combined.has(info.url)) combined.set(info.url, {...info, source: '页面 / 播放器', seen: Date.now()});
  }
  sources = [...combined.values()]; acceptCourse(reply?.page === page ? reply.course : value.course, page);
  updateSources(); $('source-status').textContent = sourceSummary();
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
