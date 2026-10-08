'use strict';
const $ = id => document.getElementById(id), video = $('video'), overlay = $('overlay');
const status = message => { $('status').textContent = message; };
let db, pages = [], ready = false, sourceReady = false, stream = null, hls = null, objectURL = null;
let crop = {x: 0, y: 0, w: 1, h: 1}, drag = null, cropEditing = false, task = null, sourceName = '', sources = [], pendingOrigins = [], pendingURL = '';
let realtimeTimer = null, realtimeBusy = false, candidate = null, candidateSince = 0, last = null, coursePage = '';
const referrerRule = 16220;
const dbReady = new Promise((resolve, reject) => {
  const request = indexedDB.open('course-ppt', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('pages', {keyPath: 'id', autoIncrement: true});
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    db = request.result;
    const read = db.transaction('pages').objectStore('pages').getAll();
    read.onerror = () => reject(read.error);
    read.onsuccess = () => { pages = read.result; ready = true; render(); controls(); resolve(); };
  };
});
dbReady.then(() => status('本地截图已恢复。请选择课程视频或导入本地视频。')).catch(e => status('本地存储不可用：' + e.message));
function write(action, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite'), request = tx.objectStore('pages')[action](value);
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function timecode(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor(s / 60 % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
function controls() {
  const active = !!task || !!realtimeTimer || realtimeBusy;
  for (const id of ['load-url', 'file', 'share', 'sources', 'course', 'mode', 'diff', 'dedupe', 'full']) $(id).disabled = active;
  $('load').disabled = active || !$('sources').value;
  $('full').disabled = active || !sourceReady;
  $('crop-select').disabled = active || !sourceReady;
  $('crop-select').textContent = cropEditing ? '取消框选' : '框选 PPT 区域';
  $('run').disabled = active || !sourceReady || !ready;
  $('run').textContent = stream ? '开始实时截取' : '开始快速提取';
  $('stop').disabled = !task && !realtimeTimer;
  $('shot').disabled = active || !sourceReady || !ready;
  $('clear').disabled = active || !ready || !pages.length;
  $('pdf').disabled = active || !pages.length;
  $('end').disabled = !stream || active;
  video.controls = sourceReady && !active && !stream;
  overlay.style.pointerEvents = active || !sourceReady || !cropEditing ? 'none' : 'auto';
}
function addCard(page, index) {
  const article = document.createElement('article'), image = document.createElement('img');
  const label = document.createElement('span'), button = document.createElement('button');
  image.src = page.data; image.alt = `第 ${index + 1} 页`; image.loading = 'lazy';
  label.textContent = `${index + 1} · ${Number.isFinite(page.sourceTime) ? timecode(page.sourceTime) : new Date(page.time).toLocaleTimeString()}`;
  article.title = page.sourceName || '历史截图'; button.textContent = '删除';
  button.onclick = async () => {
    if (task || realtimeTimer || realtimeBusy) return;
    try { await write('delete', page.id); pages = pages.filter(x => x.id !== page.id); last = null; render(); controls(); }
    catch (e) { status('删除失败：' + e.message); }
  };
  article.append(image, label, button); $('pages').append(article);
}
function render() {
  $('pages').replaceChildren(); pages.forEach(addCard); $('count').textContent = `共 ${pages.length} 页`;
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
    ctx.strokeStyle = '#00dc90'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + crop.x * b.w, b.y + crop.y * b.h, crop.w * b.w, crop.h * b.h);
  }
}
new ResizeObserver(draw).observe(video);
function pos(event) {
  const rect = overlay.getBoundingClientRect(), b = bounds();
  return {x: Math.max(0, Math.min(1, (event.clientX - rect.left - b.x) / b.w)), y: Math.max(0, Math.min(1, (event.clientY - rect.top - b.y) / b.h))};
}
overlay.onpointerdown = event => { if (!sourceReady || !cropEditing || task || realtimeTimer) return; drag = pos(event); overlay.setPointerCapture(event.pointerId); };
overlay.onpointermove = event => {
  if (!drag) return;
  const p = pos(event); crop = {x: Math.min(p.x, drag.x), y: Math.min(p.y, drag.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y)}; draw();
};
overlay.onpointerup = () => {
  if (!drag) return; drag = null;
  if (crop.w < 0.03 || crop.h < 0.03) crop = {x: 0, y: 0, w: 1, h: 1};
  last = null; cropEditing = false; controls(); draw(); status('截取范围已设置，可以开始提取。');
};
overlay.onpointercancel = () => { drag = null; };
$('crop-select').onclick = () => { cropEditing = !cropEditing; controls(); status(cropEditing ? '请在视频中拖动框选 PPT 区域。' : '已退出框选，可以操作视频播放控件。'); };
$('full').onclick = () => { crop = {x: 0, y: 0, w: 1, h: 1}; last = null; cropEditing = false; controls(); draw(); status('将截取整个视频画面。'); };
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
  const page = {data: f.canvas.toDataURL('image/jpeg', 0.95), w: f.canvas.width, h: f.canvas.height, time: Date.now(), sourceTime: f.sourceTime, sourceName, sig: f.sig};
  page.id = await write('add', page); pages.push(page); last = f.sig;
  addCard(page, pages.length - 1); $('count').textContent = `共 ${pages.length} 页`;
}
function releaseSource() {
  if (stream) { stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; }
  hls?.destroy(); hls = null; video.pause(); video.srcObject = null; video.removeAttribute('src'); video.load();
  if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null; sourceReady = false;
  crop = {x: 0, y: 0, w: 1, h: 1}; cropEditing = false; last = null; controls(); draw();
  return window.chrome?.declarativeNetRequest?.updateSessionRules({removeRuleIds: [referrerRule]}).catch(() => {});
}
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
  if (!response.ok) throw Error(`视频服务器返回 HTTP ${response.status}，请刷新课程页重新捕获；若需要网站专用请求头，请下载视频后导入`);
  if (/text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw Error('地址返回登录页或接口数据，不是视频文件');
  const total = Number(response.headers.get('content-length')) || 0, limit = 2 * 1024 ** 3;
  if (total > limit) { await response.body?.cancel(); throw Error('视频超过 2 GB，请下载后使用“本地视频”导入，避免占用过多内存'); }
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
async function loadRemote(raw) {
  if (task || realtimeTimer) return;
  const info = PPTCore.mediaInfo(raw);
  if (!info) { status('请输入完整的 HTTP(S) MP4、WebM 或 m3u8 视频地址'); return; }
  if (info.kind === 'mpd') { status('当前不支持 DASH (.mpd)，请导入下载的 MP4 视频'); return; }
  if (pendingURL !== info.url) { pendingOrigins = []; pendingURL = info.url; }
  // Call synchronously from the click handler so Chrome retains the user gesture.
  const approval = chrome.permissions.request({origins: [...new Set([originPattern(info.url), ...pendingOrigins])]});
  task = new AbortController(); const controller = task; controls();
  try {
    if (!await approval) throw Error('未获得该视频域名访问权限，可改用本地视频导入');
    controller.signal.throwIfAborted(); await releaseSource(); task = controller; controls();
    await setCourseReferrer([originPattern(info.url), ...pendingOrigins]);
    sourceName = info.name; $('progress').value = 0;
    if (info.kind === 'm3u8') {
      pendingOrigins = []; status('正在检查 HLS 播放列表与分片域名…');
      await inspectPlaylist(info.url, controller.signal);
      pendingOrigins = [...new Set(pendingOrigins)];
      if (pendingOrigins.length) throw Error(`分片还需要访问 ${pendingOrigins.join('、')}。请再次点击“加载”授权这些域名`);
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
    sourceReady = true; video.pause(); frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${sourceName} · ${timecode(video.duration)} · ${video.videoWidth} × ${video.videoHeight}。可框选 PPT 或直接开始快速提取。`);
    pendingOrigins = [];
  } catch (e) {
    await releaseSource(); const reason = controller.signal.aborted ? controller.signal.reason : e;
    status(reason.name === 'AbortError' ? '视频加载已停止。可以重新加载。' : '加载失败：' + reason.message);
  } finally { task = null; controls(); }
}
$('load').onclick = () => { const source = sources.find(x => x.url === $('sources').value); if (source) loadRemote(source.url); else status('未发现可加载的视频，请先在课程页播放再刷新列表'); };
$('load-url').onclick = () => loadRemote($('url').value.trim());
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file || task || realtimeTimer) return;
  releaseSource(); sourceName = file.name; task = new AbortController(); controls();
  try {
    objectURL = URL.createObjectURL(file); video.src = objectURL; await awaitVideo(task.signal);
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) throw Error('本地视频时长无效');
    sourceReady = true; frame(0); draw(); $('progress').value = 0;
    status(`已加载 ${file.name} · ${timecode(video.duration)}。开始提取即可快速扫描。`);
  } catch (e) { releaseSource(); status(e.name === 'AbortError' ? '加载已停止。' : '加载失败：' + e.message); }
  finally { task = null; $('file').value = ''; controls(); }
};
function exportPDF() {
  if (!pages.length) throw Error('还没有截图');
  const blob = makePDF(pages), url = URL.createObjectURL(blob), link = document.createElement('a');
  const name = (sourceName || '课程PPT').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  link.href = url; link.download = `${name}_PPT_${new Date().toLocaleDateString('sv-SE')}.pdf`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('pdf').onclick = () => { try { exportPDF(); status(`已生成 ${pages.length} 页 PDF，下载由浏览器处理。`); } catch (e) { status('导出失败：' + e.message); } };
async function fastScan() {
  if (task || !sourceReady || !ready) return;
  task = new AbortController(); const controller = task, before = pages.length;
  cropEditing = false; controls(); video.pause(); $('progress').value = 0;
  status('正在快速扫描，请保持工具页打开…');
  const started = performance.now();
  try {
    const scanner = new PPTScanner(video, frame);
    const result = await scanner.scan({step: Number($('mode').value), threshold: Math.max(0.2, Math.min(10, Number($('diff').value) || 1.2)), dedupe: $('dedupe').checked, signal: controller.signal, save,
      previous: pages.map(p => p.sig),
      progress: p => { $('progress').value = p.ratio; status(`扫描 ${timecode(p.time)} / ${timecode(p.duration)} · ${(p.ratio * 100).toFixed(1)}% · 新增 ${p.saved} 页 · 耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒`); }
    });
    status(`提取完成：新增 ${result.saved} 页，共 ${pages.length} 页，耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒。${result.unstable ? `跳过 ${result.unstable} 个不稳定画面；可用细查模式复核。` : ''}\n请先筛选页面，删除不需要的截图，再点击“下载 PDF”。`);
    $('results').scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch (e) { status(e.name === 'AbortError' ? `已停止，保留新增 ${pages.length - before} 页。请先筛选页面，再手动下载 PDF；再次开始将从头扫描并按设置去重。` : '扫描中断，已有截图已保留：' + e.message); }
  finally { task = null; video.pause(); controls(); }
}
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
  if (stream) { realtimeTimer = setInterval(realTick, 350); controls(); status('正在实时截取，请保持课程视频播放。'); }
  else fastScan();
};
$('stop').onclick = () => { task?.abort(); stopRealtime(); if (!task) status('已停止实时截取，截图已保留。'); };
$('shot').onclick = async () => {
  if (task || realtimeTimer) return;
  task = new AbortController(); controls();
  try { await save(frame()); status(`已保存当前页，共 ${pages.length} 页。`); }
  catch (e) { status('保存失败：' + e.message); }
  finally { task = null; controls(); }
};
$('clear').onclick = async () => {
  if (task || realtimeTimer || realtimeBusy || !ready || !confirm('清空所有已保存截图？请先下载需要保留的 PDF。')) return;
  task = new AbortController(); controls();
  try { await write('clear'); pages = []; last = null; render(); status('已清空截图。'); }
  catch (e) { status('清空失败：' + e.message); }
  finally { task = null; controls(); }
};
$('share').onclick = async () => {
  if (task || realtimeTimer) return;
  task = new AbortController(); controls();
  try {
    const selected = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 5}, audio: false});
    if (task.signal.aborted) { selected.getTracks().forEach(t => t.stop()); throw new DOMException('已停止', 'AbortError'); }
    releaseSource(); stream = selected; sourceName = '共享画面'; video.srcObject = stream; await video.play(); sourceReady = true;
    stream.getVideoTracks()[0].onended = () => { stopRealtime(); releaseSource(); status('共享已结束，截图已保留。'); };
    draw(); status('请框选 PPT 区域，然后开始实时截取。');
  } catch (e) { status('未开始共享：' + e.message); }
  finally { task = null; controls(); }
};
$('end').onclick = () => { stopRealtime(); releaseSource(); status('共享已结束，截图已保留。'); };
async function discover() {
  if (!window.chrome?.tabs) { $('source-status').textContent = '请通过浏览器扩展打开此工具。也可以导入本地视频。'; return; }
  try {
    const selected = $('course').value || new URLSearchParams(location.search).get('tab');
    const tabs = await chrome.tabs.query({url: 'https://rms-v5.xjtu.edu.cn/*'});
    $('course').replaceChildren();
    for (const tab of tabs) { const option = document.createElement('option'); option.value = String(tab.id); option.textContent = tab.title || tab.url; $('course').append(option); }
    if (tabs.some(t => String(t.id) === selected)) $('course').value = selected;
    if (!tabs.length) { sources = []; updateSources(); $('source-status').textContent = '未找到课程标签页，请先在此浏览器打开课程网站并登录。'; return; }
    const id = Number($('course').value); coursePage = tabs.find(t => t.id === id)?.url || '';
    try { await chrome.tabs.sendMessage(id, {type: 'PPT_DISCOVER'}); }
    catch {
      await chrome.scripting.executeScript({target: {tabId: id, allFrames: true}, world: 'MAIN', files: ['media.js', 'page-hook.js']});
      await chrome.scripting.executeScript({target: {tabId: id, allFrames: true}, files: ['media.js', 'content.js']});
      await chrome.tabs.sendMessage(id, {type: 'PPT_DISCOVER'});
    }
    const key = 'media-' + id;
    const entry = (await chrome.storage.session.get(key))[key];
    sources = entry?.page === tabs.find(t => t.id === id)?.url ? entry.items : [];
    updateSources();
    $('source-status').textContent = sources.length ? `已发现 ${sources.length} 个视频地址，请自行筛选后加载。地址只保留到浏览器会话结束。` : '尚未发现视频地址，请刷新课程页并播放视频，然后再点刷新视频列表。';
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
$('discover').onclick = discover; $('course').onchange = discover; $('sources').onchange = controls;
if (window.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
  const value = changes['media-' + $('course').value]?.newValue;
  if (area === 'session' && value) { sources = value.items; updateSources(); $('source-status').textContent = `已发现 ${sources.length} 个视频地址，请自行筛选后加载。`; }
});
controls(); discover();
window.addEventListener('beforeunload', event => { if (task || realtimeTimer) { event.preventDefault(); event.returnValue = ''; } });
