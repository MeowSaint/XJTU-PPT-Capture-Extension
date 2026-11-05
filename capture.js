'use strict';
const $ = id => document.getElementById(id), video = $('video'), overlay = $('overlay');
const status = message => { $('status').textContent = message; syncWorkspace(); };
let db, pages = [], ready = false, sourceReady = false, stream = null, hls = null, objectURL = null;
let crop = {x: 0, y: 0, w: 1, h: 1}, drag = null, cropEditing = false, task = null, sourceName = '', sources = [], pendingOrigins = [], pendingURL = '';
let realtimeTimer = null, realtimeBusy = false, candidate = null, candidateSince = 0, last = null, coursePage = '';
let draggedPageId = null, reviewBusy = false, exportBusy = false, pageWrites = 0, undoState = null;
let selectedPages = new Set(), previewPageId = null, previewReturn = null, loadedIdentity = null;
let batchJobs = [], batchPage = '', batchRunning = false, batchStopRequested = false, activeBatchJob = null;
const referrerRule = 16220;
let sourceCourse = {}, sourceCoursePage = '', namingPage = '', namingManual = false, namingSave = Promise.resolve(), discoverySerial = 0;
const dbReady = new Promise((resolve, reject) => {
  const request = indexedDB.open('course-ppt', 2);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('pages')) request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true});
    if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings');
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => status('请关闭其他截取工具页，再重新打开，完成本地数据升级。');
  request.onsuccess = () => {
    db = request.result;
    const tx = db.transaction(['pages', 'settings']), read = tx.objectStore('pages').getAll(), naming = tx.objectStore('settings').get('exportNaming');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      pages = read.result.sort((a, b) => (Number.isFinite(a.order) ? a.order : a.id) - (Number.isFinite(b.order) ? b.order : b.id));
      const needsOrderMigration = pages.some(page => !Number.isFinite(page.order));
      if (needsOrderMigration) pages.forEach((page, index) => { page.order = (index + 1) * 1024; });
      ready = true;
      if (pages.length) {
        const saved = naming.result;
        namingManual = !!saved?.manual;
        setNaming(saved?.course || pages[0].course || {}, saved?.page || pages[0].coursePage || '');
      } else setNaming(sourceCourse, sourceCoursePage);
      render(); controls();
      if (needsOrderMigration) putPages(pages).then(resolve, reject); else resolve();
    };
  };
});
dbReady.then(() => status('本地截图已恢复。请选择课程视频或导入本地视频。')).catch(e => status('本地存储不可用：' + e.message));
function namingInfo() { return PPTCourse.normalize({name: $('course-name').value, date: $('course-date').value, start: $('course-start').value}); }
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
  $('filename-preview').textContent = name ? `下载文件名：${name}` : '请补全课程名称、上课日期和开始时间，也可以刷新视频列表自动读取。';
  syncWorkspace();
}
function setNaming(info, page) {
  info = PPTCourse.normalize(info); namingPage = page;
  $('course-name').value = info.name || ''; $('course-date').value = info.date || ''; $('course-start').value = info.start || '';
  previewName();
}
function persistNaming() {
  const snapshot = {course: namingInfo(), page: namingPage, manual: namingManual};
  namingSave = namingSave.catch(() => {}).then(async () => {
    await dbReady;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(snapshot, 'exportNaming');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || Error('命名信息未能保存')); tx.onabort = () => reject(tx.error || Error('命名信息保存已取消'));
    });
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
    if (!namingManual && (!pages.length || pages.every(p => p.coursePage === page))) {
      setNaming(sourceCourse, page); persistNaming();
    }
  }).catch(() => {});
}
for (const id of ['course-name', 'course-date', 'course-start']) $(id).oninput = () => {
  namingManual = true; namingPage = pages[0]?.coursePage || coursePage;
  previewName(); persistNaming();
};
async function write(action, value) {
  pageWrites++; controls();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('pages', 'readwrite'), request = tx.objectStore('pages')[action](value);
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error || Error('本地保存失败或已取消')); tx.onabort = () => reject(tx.error || Error('本地保存已取消'));
    });
  } finally { pageWrites--; controls(); }
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
  pages = next;
}
function timecode(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor(s / 60 % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; /* taste-skill-ignore */
}
function busy() { return !!task || !!realtimeTimer || realtimeBusy || batchRunning || reviewBusy || exportBusy || pageWrites > 0; }
function namingSnapshot() { return {course: namingInfo(), page: namingPage, manual: namingManual}; }
function restoreNaming(snapshot) { namingManual = snapshot.manual; setNaming(snapshot.course, snapshot.page); }
function invalidateUndo() { undoState = null; selectedPages.clear(); updateSelection(); }
async function reviewTransaction({remove = [], restore = [], naming, clear = false}) {
  await dbReady; await namingSave.catch(() => {});
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['pages', 'settings'], 'readwrite'), store = tx.objectStore('pages');
    if (clear) store.clear();
    remove.forEach(id => store.delete(id)); restore.forEach(page => store.put(page));
    tx.objectStore('settings').put(naming, 'exportNaming');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || Error('本地保存失败或已取消')); tx.onabort = () => reject(tx.error || Error('本地保存已取消'));
  });
}
async function deletePages(ids) {
  if (busy() || !ready) return;
  const wanted = new Set(ids), removed = pages.flatMap((page, index) => wanted.has(page.id) ? [{page, index}] : []);
  if (!removed.length) return;
  reviewBusy = true; controls();
  const naming = namingSnapshot(), remaining = pages.filter(page => !wanted.has(page.id));
  const nextNaming = remaining.length ? naming : {course: PPTCourse.normalize(sourceCourse), page: sourceCoursePage, manual: false};
  const previewIndex = pages.findIndex(page => page.id === previewPageId);
  try {
    await reviewTransaction({remove: removed.map(item => item.page.id), naming: nextNaming});
    undoState = {removed, naming}; pages = remaining; last = null; restoreNaming(nextNaming);
    removed.forEach(item => selectedPages.delete(item.page.id));
    if (wanted.has(previewPageId)) previewPageId = pages[Math.min(previewIndex, pages.length - 1)]?.id ?? null;
    render(); if (batchJobs.length) renderBatchJobs();
    status(`已删除 ${removed.length} 页，可点击“撤销删除”恢复。`);
  } catch (e) { status('删除失败，页面保持原样：' + e.message); }
  finally { reviewBusy = false; controls(); }
}
async function undoDelete() {
  if (busy() || !undoState) return;
  reviewBusy = true; controls();
  const snapshot = undoState, restored = pages.slice();
  snapshot.removed.forEach(item => restored.splice(item.index, 0, item.page));
  try {
    await reviewTransaction({restore: snapshot.removed.map(item => item.page), naming: snapshot.naming});
    pages = restored; restoreNaming(snapshot.naming); undoState = null; last = null;
    render(); if (batchJobs.length) renderBatchJobs(); status(`已恢复 ${snapshot.removed.length} 页及删除前的命名。`);
  } catch (e) { status('撤销失败，页面保持原样：' + e.message); }
  finally { reviewBusy = false; controls(); }
}
function sameTimeline(a, b) {
  return typeof a.sourceKey === 'string' && !!a.sourceKey.trim() && a.sourceKey === b.sourceKey && !!a.sourceName?.trim() && a.sourceName === b.sourceName && (a.coursePage || '') === (b.coursePage || '') && (a.batchJobId || '') === (b.batchJobId || '');
}
function validSignature(page) {
  return (page.sig instanceof Uint8ClampedArray || page.sig instanceof Uint8Array) && page.sig.length === 192 * 108 * 4 && Number.isFinite(page.w) && Number.isFinite(page.h) && page.w > 0 && page.h > 0;
}
function cleanSimilar() {
  if (busy()) return;
  const remove = [], threshold = Math.max((Number($('diff').value) || 1.2) * 2.5, 3);
  for (let i = 1; i < pages.length; i++) {
    const a = pages[i - 1], b = pages[i];
    if (sameTimeline(a, b) && Number.isFinite(a.sourceTime) && Number.isFinite(b.sourceTime) && a.sourceTime < b.sourceTime && validSignature(a) && validSignature(b) && a.w === b.w && a.h === b.h && a.sig.length === b.sig.length && PPTCore.similar(a.sig, b.sig, threshold)) remove.push(a.id);
  }
  if (remove.length) deletePages(remove); else status('没有找到需要合并的相邻相似页。');
}
function updateSelection() {
  selectedPages = new Set([...selectedPages].filter(id => pages.some(page => page.id === id)));
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
  if (!sourceReady || stream || !loadedIdentity || !page.sourceKey || !sameTimeline(page, loadedIdentity)) message = '视频与截图来源不一致，请重新加载对应的视频再回看。';
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
  $('lightbox-img').src = page.data; $('lightbox-img').alt = `第 ${index + 1} 页放大预览`;
  $('lightbox-prev').disabled = busy() || index === 0; $('lightbox-next').disabled = busy() || index === pages.length - 1;
  $('lightbox-delete').disabled = busy(); $('lightbox-seek').disabled = busy();
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
$('clear-selection').onclick = () => { selectedPages.clear(); updateSelection(); controls(); };
$('delete-selected').onclick = () => deletePages([...selectedPages]);
$('undo').onclick = undoDelete; $('clean-similar').onclick = cleanSimilar;
$('lightbox-prev').onclick = () => movePreview(-1); $('lightbox-next').onclick = () => movePreview(1);
$('lightbox-delete').onclick = () => deletePages([previewPageId]);
$('lightbox-seek').onclick = () => { const page = pages.find(item => item.id === previewPageId); if (page) seekPage(page); };
$('lightbox-close').onclick = () => $('lightbox').close();
$('lightbox').addEventListener('close', () => {
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
});
function controls() {
  const active = busy();
  for (const id of ['load-url', 'url', 'file', 'share', 'sources', 'course', 'discover', 'mode', 'diff', 'dedupe', 'stable', 'full', 'course-name', 'course-date', 'course-start', 'pdf-layout']) $(id).disabled = active;
  $('load').disabled = active || !$('sources').value;
  $('full').disabled = active || !sourceReady;
  $('crop-select').disabled = active || !sourceReady;
  $('crop-select').textContent = cropEditing ? '取消框选' : '框选 PPT 区域';
  $('crop-select').setAttribute('aria-pressed', String(cropEditing));
  $('run').disabled = active || !sourceReady || !ready;
  $('run').textContent = stream ? '开始实时截取' : '开始快速提取';
  $('stop').disabled = !task && !realtimeTimer && !batchRunning;
  $('shot').disabled = active || !sourceReady || !ready;
  $('clear').disabled = active || !ready || !pages.length;
  $('pdf').disabled = active || !pages.length; $('export-zip').disabled = active || !pages.length;
  $('undo').disabled = active || !undoState;
  $('clean-similar').disabled = active || pages.length < 2;
  $('select-all').disabled = active || !pages.length;
  $('clear-selection').disabled = active || !selectedPages.size; $('delete-selected').disabled = active || !selectedPages.size;
  document.querySelectorAll('#pages article').forEach(card => {
    card.draggable = !active;
    card.querySelector('button').disabled = active; card.querySelector('.page-select').disabled = active;
    card.querySelector('img').setAttribute('aria-disabled', String(active)); card.querySelector('.slide-time').setAttribute('aria-disabled', String(active));
  });
  $('end').disabled = !stream || active;
  $('release-cache').disabled = active || !(sourceReady || objectURL || hls || stream);
  $('batch-discover').disabled = active;
  $('batch-select').disabled = active || !batchJobs.length;
  $('batch-start').disabled = active || !batchJobs.some(job => !job.requiresCrop && job.selected && job.state !== 'done');
  document.querySelectorAll('#batch-jobs input').forEach(input => {
    const job = batchJobs.find(item => item.id === input.closest('.batch-job')?.dataset.jobId);
    input.disabled = active || !job || job.state === 'done' || job.requiresCrop;
  });
  document.querySelectorAll('#batch-jobs .batch-manual select, #batch-jobs .batch-manual button').forEach(control => { control.disabled = active; });
  document.querySelectorAll('#batch-jobs .batch-job > button').forEach(button => {
    const job = batchJobs.find(item => item.id === button.parentElement.dataset.jobId);
    button.disabled = active || !job || !batchPageCount(job);
  });
  updatePreview();
  video.controls = sourceReady && !active && !stream;
  overlay.style.pointerEvents = active || !sourceReady || !cropEditing ? 'none' : 'auto';
  syncWorkspace();
}
function addCard(page, index) {
  const article = document.createElement('article'), image = document.createElement('img');
  const handle = document.createElement('span'), label = document.createElement('span'), button = document.createElement('button'), choose = document.createElement('input');
  article.dataset.pageId = String(page.id); article.draggable = !busy();
  image.src = page.data; image.alt = `第 ${index + 1} 页`; image.loading = 'lazy'; image.draggable = false;
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
  choose.onchange = () => { if (busy()) return; if (choose.checked) selectedPages.add(page.id); else selectedPages.delete(page.id); updateSelection(); controls(); };
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
    try { await persistOrder(ordered); undoState = null; render(); status(`已调整截图顺序：第 ${to + 1} 页。`); }
    catch (e) { status('顺序保存失败，页面保持原样：' + e.message); }
    finally { reviewBusy = false; controls(); }
  };
  article.ondragend = () => { draggedPageId = null; document.querySelectorAll('#pages article').forEach(card => card.classList.remove('dragging', 'drop-before', 'drop-after')); };
  button.onclick = () => deletePages([page.id]);
  article.append(handle, image, choose, label, button); $('pages').append(article);
}
function render() {
  const scrollTop = $('pages').scrollTop;
  $('pages').replaceChildren(); pages.forEach(addCard); $('count').textContent = `共 ${pages.length} 页`;
  $('pages').scrollTop = scrollTop; $('review-notice').hidden = !pages.length;
  updateSelection(); controls();
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
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.strokeRect(b.x + crop.x * b.w, b.y + crop.y * b.h, crop.w * b.w, crop.h * b.h);
    ctx.strokeStyle = '#9e2437'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + crop.x * b.w, b.y + crop.y * b.h, crop.w * b.w, crop.h * b.h);
  }
}
new ResizeObserver(draw).observe(video);
function pos(event) {
  const rect = overlay.getBoundingClientRect(), b = bounds();
  return {x: Math.max(0, Math.min(1, (event.clientX - rect.left - b.x) / b.w)), y: Math.max(0, Math.min(1, (event.clientY - rect.top - b.y) / b.h))};
}
overlay.onpointerdown = event => { if (!sourceReady || !cropEditing || busy()) return; drag = pos(event); overlay.setPointerCapture(event.pointerId); };
overlay.onpointermove = event => {
  if (!drag) return;
  const p = pos(event); crop = {x: Math.min(p.x, drag.x), y: Math.min(p.y, drag.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y)}; draw();
};
overlay.onpointerup = () => {
  if (!drag) return; drag = null;
  if (crop.w < 0.03 || crop.h < 0.03) crop = {x: 0, y: 0, w: 1, h: 1};
  last = null; cropEditing = false; if (activeBatchJob?.requiresCrop) activeBatchJob.cropConfirmed = true; controls(); draw(); status('截取范围已设置，可以开始提取。');
};
overlay.onpointercancel = () => { drag = null; };
$('crop-select').onclick = () => { if (busy()) return; cropEditing = !cropEditing; controls(); status(cropEditing ? '请在视频中拖动框选 PPT 区域。' : '已退出框选，可以操作视频播放控件。'); };
$('full').onclick = () => { if (busy()) return; crop = {x: 0, y: 0, w: 1, h: 1}; last = null; cropEditing = false; if (activeBatchJob?.requiresCrop) activeBatchJob.cropConfirmed = true; controls(); draw(); status('将截取整个视频画面。'); };
function frame(sourceTime = video.currentTime) {
  if (video.readyState < 2 || !video.videoWidth) throw Error('视频画面尚未就绪');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * crop.w)); canvas.height = Math.max(1, Math.round(video.videoHeight * crop.h));
  canvas.getContext('2d').drawImage(video, video.videoWidth * crop.x, video.videoHeight * crop.y, video.videoWidth * crop.w, video.videoHeight * crop.h, 0, 0, canvas.width, canvas.height);
  const small = document.createElement('canvas'); small.width = 192; small.height = 108;
  const ctx = small.getContext('2d', {willReadFrequently: true}); ctx.drawImage(canvas, 0, 0, 192, 108);
  return {canvas, sig: ctx.getImageData(0, 0, 192, 108).data, sourceTime};
}
async function save(f) {
  await dbReady;
  if (pages.length >= 1000) throw Error('已达 1000 页，请先导出 PDF，再清空继续');
  if (!pages.length) await persistNaming();
  const page = {data: f.canvas.toDataURL('image/jpeg', 0.95), w: f.canvas.width, h: f.canvas.height, time: Date.now(), sourceTime: f.sourceTime, sourceName, sourceKey: loadedIdentity?.sourceKey || '', sig: f.sig, course: {...sourceCourse}, coursePage, batchJobId: activeBatchJob?.id || ''};
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
  page.id = await write('add', page); pages.splice(insertAt, 0, page); undoState = null; last = f.sig;
  render();
}
function releaseSource() {
  if (stream) { stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; }
  hls?.destroy(); hls = null; video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null; sourceReady = false; loadedIdentity = null;
  crop = {x: 0, y: 0, w: 1, h: 1}; cropEditing = false; drag = null; candidate = null; candidateSince = 0; last = null; controls(); draw();
  return window.chrome?.declarativeNetRequest?.updateSessionRules({removeRuleIds: [referrerRule]}).catch(() => {});
}
$('release-cache').onclick = async () => {
  if (busy() || !(sourceReady || objectURL || hls || stream)) return;
  task = new AbortController(); controls();
  try {
    await releaseSource(); activeBatchJob = null; if (batchJobs.length) renderBatchJobs();
    status('已卸载视频，截图和命名信息已保留，可以继续整理和导出。预览或补截时重新加载视频即可。');
  } catch (e) { status('视频缓存释放失败：' + e.message + '。截图和命名信息还在，可以关闭工具页后重试。'); }
  finally { task = null; controls(); }
};
async function setCourseReferrer(origins) {
  if (!coursePage || !window.chrome?.declarativeNetRequest) return;
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [referrerRule], addRules: [{
    id: referrerRule, priority: 1,
    action: {type: 'modifyHeaders', requestHeaders: [{header: 'referer', operation: 'set', value: coursePage}]},
    condition: {initiatorDomains: [chrome.runtime.id], requestDomains: [...new Set(origins.map(x => new URL(x).hostname))], resourceTypes: ['xmlhttprequest', 'media']}
  }]});
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
  status('正在下载视频到本地缓存，下载后快速扫描…');
  const response = await fetch(url, {credentials: 'include', signal});
  if (!response.ok) throw Error(`视频服务器返回 HTTP ${response.status}，请刷新课程页获取新地址，或下载视频后导入`);
  if (/text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw Error('地址返回登录页或接口数据，不是视频文件');
  const total = Number(response.headers.get('content-length')) || 0, limit = 2 * 1024 ** 3;
  if (total > limit) { await response.body?.cancel(); throw Error('视频超过 2 GB，请下载后通过“本地视频”导入'); }
  const chunks = [], reader = response.body.getReader(); let received = 0, lastUpdate = 0;
  while (true) {
    const {value, done} = await reader.read(); if (done) break;
    received += value.byteLength;
    if (received > limit) { await reader.cancel(); throw Error('视频超过 2 GB，请改用本地视频导入'); }
    chunks.push(value);
    if (Date.now() - lastUpdate > 250) {
      lastUpdate = Date.now(); $('progress').value = total ? received / total : 0;
      status(`下载视频：${(received / 1024 ** 2).toFixed(1)} MB${total ? ' / ' + (total / 1024 ** 2).toFixed(1) + ' MB' : ''}。下载完即进行快速扫描。`);
    }
  }
  if (!received) throw Error('视频文件为空');
  return new Blob(chunks, {type: /webm/i.test(url) ? 'video/webm' : 'video/mp4'});
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
  if (task || realtimeTimer || realtimeBusy || reviewBusy || exportBusy || pageWrites || (batchRunning && !options.batchJob)) return false;
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
    video.pause(); frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${sourceName} · ${timecode(video.duration)} · ${video.videoWidth} × ${video.videoHeight}。可框选 PPT 或直接开始快速提取。`);
    pendingOrigins = []; loaded = true;
  } catch (e) {
    await releaseSource(); const reason = controller.signal.aborted ? controller.signal.reason : e;
    if (activeBatchJob === batchJob) activeBatchJob = null;
    status(reason.name === 'AbortError' ? '视频加载已停止。可以重新加载。' : '加载失败：' + reason.message);
  } finally { task = null; controls(); }
  return loaded;
}
$('load').onclick = () => { const source = sources.find(x => x.url === $('sources').value); if (source) loadRemote(source.url); else status('未发现可加载的视频，请先在课程页播放再刷新列表'); };
$('load-url').onclick = () => loadRemote($('url').value.trim());
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file || busy()) return;
  invalidateUndo(); activeBatchJob = null; releaseSource(); sourceName = file.name; task = new AbortController(); controls();
  try {
    objectURL = URL.createObjectURL(file); video.src = objectURL; await awaitVideo(task.signal);
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw Error('本地视频时长无效');
    sourceReady = true; loadedIdentity = {sourceName, coursePage, batchJobId: '', sourceKey: 'file:' + JSON.stringify([file.name, file.size, file.lastModified])}; frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${file.name} · ${timecode(video.duration)}。开始提取即可快速扫描。`);
  } catch (e) { releaseSource(); status(e.name === 'AbortError' ? '加载已停止。' : '加载失败：' + e.message); }
  finally { task = null; $('file').value = ''; controls(); }
};
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function downloadPDF(list, course, layout = 'single') {
  if (!list.length) throw Error('还没有截图');
  const name = PPTCourse.filename(course);
  if (!name) throw Error('请先补填课程名称、上课日期和开始时间，并检查填写是否正确，再下载 PDF');
  downloadBlob(makePDF(list, {layout}), name);
}
function exportPDF() { downloadPDF(pages, namingInfo(), $('pdf-layout').value); }
async function exportRetained(kind) {
  if (busy() || !pages.length) return;
  exportBusy = true; controls();
  try {
    await namingSave.catch(() => {});
    const name = PPTCourse.filename(namingInfo());
    if (!name) {
      activateTab('tab-export');
      const missing = ['course-name', 'course-date', 'course-start'].find(id => !$(id).value) || 'course-name';
      // Focus after the export guard releases disabled naming fields.
      exportBusy = false; controls(); $(missing).focus();
      throw Error('请先补填课程名称、上课日期和开始时间，并检查填写是否正确，再下载');
    }
    if (kind === 'zip') downloadBlob(makeZIP(pages), name.replace(/\.pdf$/i, '-slides.zip'));
    else exportPDF();
    status(`已生成全部 ${pages.length} 页的${kind === 'zip' ? '图片包' : $('pdf-layout').value === 'handout' ? '笔记讲义 PDF' : 'PDF'}。`);
  } catch (e) { status('导出失败：' + e.message); }
  finally { exportBusy = false; controls(); }
}
$('pdf').onclick = () => exportRetained('pdf'); $('export-zip').onclick = () => exportRetained('zip');
async function fastScan() {
  if (task || realtimeTimer || realtimeBusy || reviewBusy || exportBusy || pageWrites || !sourceReady || !ready) return null;
  task = new AbortController(); const controller = task, before = pages.length, manualJob = activeBatchJob?.requiresCrop && !batchRunning ? activeBatchJob : null;
  let outcome = null;
  cropEditing = false; controls(); video.pause(); $('progress').value = 0;
  status('正在快速扫描，请保持工具页打开…');
  const started = performance.now();
  try {
    const scanner = new PPTScanner(video, frame);
    const result = await scanner.scan({step: Number($('mode').value), threshold: Math.max(0.2, Math.min(10, Number($('diff').value) || 1.2)), dedupe: $('dedupe').checked, signal: controller.signal, save,
      previous: pages.filter(page => !activeBatchJob || page.batchJobId === activeBatchJob.id).map(p => p.sig),
      progress: p => { $('progress').value = p.ratio; status(`扫描 ${timecode(p.time)} / ${timecode(p.duration)} · ${(p.ratio * 100).toFixed(1)}% · 新增 ${p.saved} 页 · 耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒`); }
    });
    status(`提取完成：新增 ${result.saved} 页，共 ${pages.length} 页，耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒。${result.unstable ? `跳过 ${result.unstable} 个不稳定画面；可用细查模式复核。` : ''}\n请先筛选页面，再下载 PDF 或图片包。`);
    outcome = result;
  } catch (e) { status(e.name === 'AbortError' ? `已停止，保留新增 ${pages.length - before} 页。可以先整理并导出；再次开始会从头扫描，并按设置去重。` : '扫描中断，已有截图已保留：' + e.message); }
  finally {
    task = null; video.pause();
    if (manualJob) {
      const count = batchPageCount(manualJob); manualJob.pages = count;
      manualJob.state = outcome ? 'done' : count ? 'partial' : 'failed';
      manualJob.error = outcome ? '' : $('status').textContent;
      renderBatchJobs();
      $('batch-status').textContent = outcome ? `已完成 ${manualJob.course.date} ${String(manualJob.course.start).slice(0, 5)} 的 0 路视频提取，共 ${count} 页；仍可调整框选区域后再次细查。` : `本节 0 路视频未完成，已保留 ${count} 页。`;
    }
    controls();
  }
  return outcome;
}
function batchPageCount(job) { return pages.filter(page => page.batchJobId === job.id).length; }
function syncBatchJob(job) {
  const count = batchPageCount(job);
  if (!count && ['done', 'partial'].includes(job.state)) {
    job.state = job.requiresCrop ? 'needs-crop' : 'pending'; job.selected = !job.requiresCrop; job.error = '';
  }
  return count;
}
function renderBatchJobs() {
  const container = $('batch-jobs'); container.replaceChildren();
  const labels = {'needs-crop': '需要手动框选', manual: '等待框选/提取', pending: '等待', loading: '下载中', scanning: '提取中', done: '已完成', partial: '部分完成', failed: '失败', stopped: '已停止'};
  for (const job of batchJobs) {
    const row = document.createElement('div'), choose = document.createElement('input'), title = document.createElement('span'), state = document.createElement('span'), download = document.createElement('button');
    row.className = 'batch-job'; row.dataset.jobId = job.id;
    choose.type = 'checkbox'; choose.checked = !!job.selected; choose.disabled = batchRunning || job.state === 'done' || job.requiresCrop;
    choose.onchange = () => { job.selected = choose.checked; controls(); };
    const size = job.size ? ` · ${(job.size / 1024 ** 2).toFixed(0)} MB` : '';
    title.textContent = `${job.course.date || '未知日期'} ${String(job.course.start || '').slice(0, 5)} · ${job.sourceName}${size}${job.requiresCrop ? ' · 仅有 0 路视频' : ''}`;
    const count = syncBatchJob(job);
    state.className = `batch-state ${job.state}`; state.textContent = `${labels[job.state] || job.state} · ${count} 页`;
    if (job.error) state.title = job.error;
    download.textContent = '下载本节 PDF'; download.disabled = batchRunning || !count;
    download.onclick = () => {
      if (busy()) return;
      exportBusy = true; controls();
      try { downloadPDF(pages.filter(page => page.batchJobId === job.id), job.course); }
      catch (error) { $('batch-status').textContent = '导出失败：' + error.message; }
      finally { exportBusy = false; controls(); }
    };
    row.append(choose, title, state);
    if (job.requiresCrop) {
      const manual = document.createElement('span'), select = document.createElement('select'), prepare = document.createElement('button');
      manual.className = 'batch-manual';
      for (const item of job.options) { const option = document.createElement('option'); option.value = item.url; option.textContent = item.sourceName; select.append(option); }
      select.value = job.url; select.disabled = batchRunning || !!task;
      select.onchange = () => { const item = job.options.find(candidate => candidate.url === select.value); if (item) Object.assign(job, item); renderBatchJobs(); };
      prepare.textContent = count ? '继续用 0 路处理' : '加载 0 路并框选'; prepare.disabled = batchRunning || !!task;
      prepare.onclick = () => prepareManualBatchJob(job, chrome.permissions.request({origins: [originPattern(job.url)]}));
      manual.append(select, prepare); row.append(manual);
    }
    row.append(download); container.append(row);
  }
  const selected = batchJobs.filter(job => !job.requiresCrop && job.selected && job.state !== 'done').length, manual = batchJobs.filter(job => job.requiresCrop).length;
  $('batch-count').textContent = batchJobs.length ? `共 ${batchJobs.length} 节，自动 ${selected} 节${manual ? `，需框选 ${manual} 节` : ''}` : '未读取';
  controls();
}
async function discoverBatch(tabId = Number($('course').value), automatic = false) {
  if (busy() || !tabId) return;
  $('batch-panel').open = true; $('batch-status').textContent = automatic ? '检测到课程列表页，正在读取全部课次…' : '正在读取课程列表和录像信息…';
  try {
    const result = await chrome.tabs.sendMessage(tabId, {type: 'PPT_BATCH_DISCOVER'}, {frameId: 0});
    if (!result?.ok) throw Error(result?.error || '课程页没有返回批量数据');
    batchPage = result.page;
    batchJobs = result.jobs.map(job => {
      const existing = batchJobs.find(old => old.id === job.id), count = pages.filter(page => page.batchJobId === job.id).length;
      return {...job, selected: job.requiresCrop ? false : existing?.selected ?? !count, state: count ? (existing?.state === 'done' ? 'done' : 'partial') : job.requiresCrop ? 'needs-crop' : 'pending', error: count ? existing?.error || '' : ''};
    });
    renderBatchJobs();
    const skipped = result.total - result.eligible, missing = result.failures?.length || 0, manual = batchJobs.filter(job => job.requiresCrop).length;
    $('batch-status').textContent = `读取完成：${result.total} 个课次，找到 ${batchJobs.length} 个视频${skipped ? `，跳过 ${skipped} 个未完成/转码中课次` : ''}${missing ? `，${missing} 个录像缺少可用视频` : ''}${manual ? `。其中 ${manual} 节只有 0 路视频，请逐节选择并框选 PPT 区域` : ''}。`;
  } catch (error) {
    batchJobs = []; renderBatchJobs(); $('batch-status').textContent = '批量读取失败：' + error.message;
  }
}
async function prepareManualBatchJob(job, permission) {
  if (busy()) return;
  job.state = 'loading'; job.error = ''; renderBatchJobs();
  $('batch-status').textContent = `正在加载 ${job.course.date} ${String(job.course.start).slice(0, 5)} 的 0 路视频…`;
  try {
    if (!await permission) throw Error('未获得该视频域名访问权限');
    sourceCourse = {...job.course}; sourceCoursePage = coursePage;
    const loaded = await loadRemote(job.url, {permissionGranted: true, sourceName: job.sourceName, batchJob: job});
    if (!loaded) throw Error($('status').textContent || '视频加载失败');
    job.state = 'manual'; job.cropConfirmed = false; cropEditing = true; renderBatchJobs(); controls(); draw();
    const prompt = '本节只有 0 路视频。请在预览中框选 PPT 区域，再点击“开始快速提取”。';
    status(prompt); $('batch-status').textContent = prompt;
  } catch (error) {
    job.state = batchPageCount(job) ? 'partial' : 'failed'; job.error = error.message;
    if (activeBatchJob === job) activeBatchJob = null;
    renderBatchJobs(); $('batch-status').textContent = '0 路视频未就绪：' + error.message;
  }
}
async function runBatch(permission) {
  const selected = batchJobs.filter(job => !job.requiresCrop && job.selected && job.state !== 'done');
  if (!selected.length || busy()) return;
  batchRunning = true; batchStopRequested = false; controls();
  let startupError = '';
  try {
    if (!await permission) throw Error('未获得视频域名访问权限');
    for (let index = 0; index < selected.length; index++) {
      if (batchStopRequested) break;
      const job = selected[index]; activeBatchJob = job; job.state = 'loading'; job.error = ''; renderBatchJobs();
      $('batch-status').textContent = `第 ${index + 1} / ${selected.length} 节：正在加载 ${job.course.date} ${String(job.course.start).slice(0, 5)}…`;
      sourceCourse = {...job.course}; sourceCoursePage = coursePage;
      const loaded = await loadRemote(job.url, {permissionGranted: true, sourceName: job.sourceName, batchJob: job});
      if (!loaded) { job.state = batchStopRequested ? 'stopped' : 'failed'; job.error = $('status').textContent; renderBatchJobs(); continue; }
      if (batchStopRequested) { job.state = 'stopped'; await releaseSource(); renderBatchJobs(); break; }
      job.state = 'scanning'; renderBatchJobs();
      $('batch-status').textContent = `第 ${index + 1} / ${selected.length} 节：正在提取 PPT…`;
      const result = await fastScan(); job.pages = batchPageCount(job);
      if (!result) { job.state = batchStopRequested ? 'stopped' : 'failed'; job.error = $('status').textContent; }
      else job.state = 'done';
      await releaseSource(); renderBatchJobs();
    }
  } catch (error) { startupError = error.message; }
  finally {
    if (sourceReady || objectURL || hls || stream) await releaseSource();
    activeBatchJob = null; batchRunning = false;
    const done = batchJobs.filter(job => job.state === 'done').length, failed = batchJobs.filter(job => job.state === 'failed').length;
    $('batch-status').textContent = startupError ? `批量任务未启动：${startupError}` : batchStopRequested ? `批量任务已停止；已完成 ${done} 节，截图均已保留。` : `批量任务结束：完成 ${done} 节${failed ? `，失败 ${failed} 节` : ''}。可逐节检查并下载 PDF。`;
    batchStopRequested = false; renderBatchJobs(); controls();
  }
}
$('batch-discover').onclick = () => discoverBatch();
$('batch-select').onclick = () => {
  const selectable = batchJobs.filter(job => !job.requiresCrop && job.state !== 'done'), choose = selectable.some(job => !job.selected);
  selectable.forEach(job => { job.selected = choose; }); renderBatchJobs();
};
$('batch-start').onclick = () => {
  const origins = [...new Set(batchJobs.filter(job => !job.requiresCrop && job.selected && job.state !== 'done').map(job => originPattern(job.url)))];
  const permission = origins.length ? chrome.permissions.request({origins}) : Promise.resolve(false);
  runBatch(permission);
};
function stopRealtime() { clearInterval(realtimeTimer); realtimeTimer = null; candidate = null; controls(); }
async function realTick() {
  if (realtimeBusy || !realtimeTimer) return;
  realtimeBusy = true;
  try {
    const f = frame(), threshold = Math.max(0.2, Math.min(10, Number($('diff').value) || 1.2));
    if (last && PPTCore.similar(f.sig, last, threshold)) { candidate = null; return; }
    if (!candidate || !PPTCore.similar(f.sig, candidate, 0.8)) { candidate = f.sig; candidateSince = Date.now(); return; }
    if (Date.now() - candidateSince >= (Number($('stable').value) || 1.5) * 1000) {
      if (!$('dedupe').checked || !pages.some(p => p.sig && PPTCore.similar(f.sig, p.sig, threshold))) { await save(f); status(`实时截取：已保存 ${pages.length} 页。`); }
      last = f.sig; candidate = null;
    }
  } catch (e) { stopRealtime(); status('实时截取已停止：' + e.message); }
  finally { realtimeBusy = false; controls(); }
}
$('run').onclick = () => {
  if (busy()) return;
  if (activeBatchJob?.requiresCrop && !activeBatchJob.cropConfirmed) {
    cropEditing = true; controls(); draw();
    const prompt = '请先在 0 路视频画面中框选 PPT 区域；PPT 已占满画面时，点击“使用完整画面”即可。';
    status(prompt); $('batch-status').textContent = prompt; return;
  }
  if (stream) { realtimeTimer = setInterval(realTick, 350); controls(); status('正在实时截取，请保持课程视频播放。'); }
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
  if (busy() || !ready || !confirm('清空所有已保存截图？请先下载需要保留的 PDF。')) return;
  reviewBusy = true; controls();
  const naming = {course: PPTCourse.normalize(sourceCourse), page: sourceCoursePage, manual: false};
  try {
    await reviewTransaction({clear: true, naming});
    pages = []; last = null; invalidateUndo(); restoreNaming(naming);
    render(); if (batchJobs.length) renderBatchJobs(); status('已清空截图。');
  }
  catch (e) { status('清空失败，页面保持原样：' + e.message); }
  finally { reviewBusy = false; controls(); }
};
$('share').onclick = async () => {
  if (busy()) return;
  activeBatchJob = null;
  task = new AbortController(); controls();
  try {
    const selected = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 5}, audio: false});
    if (task.signal.aborted) { selected.getTracks().forEach(t => t.stop()); throw new DOMException('已停止', 'AbortError'); }
    invalidateUndo(); releaseSource(); stream = selected; sourceName = '共享画面'; video.srcObject = stream; await video.play(); sourceReady = true;
    stream.getVideoTracks()[0].onended = () => { stopRealtime(); releaseSource(); status('共享已结束，截图已保留。'); };
    draw(); status('请框选 PPT 区域，然后开始实时截取。');
  } catch (e) { status('未开始共享：' + e.message); }
  finally { task = null; controls(); }
};
$('end').onclick = () => { stopRealtime(); releaseSource(); status('共享已结束，截图已保留。'); };
async function discover() {
  if (!window.chrome?.tabs) { $('source-status').textContent = '请通过浏览器扩展打开此工具。也可以导入本地视频。'; return; }
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
    await chrome.scripting.executeScript({target: {tabId: id, allFrames: true}, files: ['media.js', 'course.js', 'batch.js', 'content.js']}).catch(() => {});
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
    updateSources();
    $('source-status').textContent = sources.length ? `已发现 ${sources.length} 个视频地址，选好后点击“加载选中视频”。` : '还没找到视频。请刷新课程页并播放一次，再点“刷新视频列表”。';
    if (PPTBatch.courseId(coursePage) && batchPage !== coursePage) await discoverBatch(id, true);
  } catch (e) { $('source-status').textContent = '发现视频失败：' + e.message + '。请刷新课程页，或使用手动地址 / 本地视频。'; }
}
function updateSources() {
  const old = $('sources').value;
  $('sources').replaceChildren();
  sources.sort((a, b) => b.seen - a.seen);
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = sources.length ? '请选择视频地址' : '等待发现视频'; $('sources').append(placeholder);
  for (const source of sources) {
    const option = document.createElement('option'); option.value = source.url;
    option.textContent = `${source.name} · ${new URL(source.url).host} · ${source.source}`;
    option.title = source.url; $('sources').append(option);
  }
  if (sources.some(x => x.url === old)) $('sources').value = old;
  else $('sources').value = '';
  controls();
}
$('discover').onclick = discover; $('course').onchange = discover; $('sources').onchange = controls; $('mode').onchange = syncWorkspace;
if (window.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
  const value = changes['media-' + $('course').value]?.newValue;
  if (area === 'session' && value?.page === coursePage) { sources = value.items; acceptCourse(value.course, value.page); updateSources(); $('source-status').textContent = `已发现 ${sources.length} 个视频地址，选好后点击“加载选中视频”。`; }
});
controls(); previewName(); discover();
window.addEventListener('beforeunload', event => { if (task || realtimeTimer) { event.preventDefault(); event.returnValue = ''; } });
