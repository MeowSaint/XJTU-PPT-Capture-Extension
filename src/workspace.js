/* Terms dialog, update check, and source preflight queue for the workspace UI. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const shell = document.querySelector('.app-shell'), terms = el('terms-dialog');
  const storage = globalThis.chrome?.storage?.local || {
    async get(key) { return {[key]: JSON.parse(localStorage.getItem(key) || 'null')}; },
    async set(values) { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }
  };
  const currentVersion = globalThis.chrome?.runtime?.getManifest?.().version || document.querySelector('.version').textContent;
  const states = new Map();
  let items = [], pageURL = '', revision = 0, controller = new AbortController(), queue = [], active = 0;
  let checkingUpdate = false, accepting = false;

  function syncControls() {
    const locked = busy();
    el('preflight-authorize').disabled = locked || !items.length;
    el('source-show-all').disabled = locked;
    el('check-updates').disabled = !studyAccepted || checkingUpdate;
    const source = items.find(item => item.url === el('sources').value);
    el('selected-source-name').textContent = source ? source.name || source.url : '尚未选择视频';
    const name = source ? source.name || new URL(source.url).pathname : '';
    el('source-track-hint').textContent = !PPTCore.isCoursePage(pageURL) ? '加载后查看预览，确认选中 PPT 画面；多个视频请逐个选择确认。预检通过仅表示地址可用。' : /(?:^|\/)0-[^/]+/i.test(name) ? '0 路视频：加载后先框选 PPT 区域，确认画面后再提取。' :
      /(?:^|\/)2-[^/]+/i.test(name) ? '2 路通常为 PPT 机位；加载后确认预览，再开始提取。' :
      '选 2 路 PPT 视频；只有 0 路时，加载后先框选 PPT 区域。预检通过仅表示地址可用。';
    el('frame-source-hint').textContent = PPTCore.isCoursePage(loadedIdentity?.coursePage || pageURL)
      ? '2 路通常为 PPT 机位；0 路先确认截取区域，再开始提取。'
      : '先确认视频中的 PPT 画面，必要时框选截取区域。';
  }
  function renderSources() {
    const select = el('sources'), selected = select.value;
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = items.length ? '请选择视频地址' : '等待发现视频';
    select.replaceChildren(placeholder);
    const groups = [
      ['valid', '预检通过'], ['unknown', '待确认 · 可手动加载'],
      ['checking', '正在检测'], ['queued', '等待检测'], ['permission', '待授权'], ['invalid', '无效地址']
    ];
    for (const [status, label] of groups) {
      if (status === 'invalid' && !el('source-show-all').checked) continue;
      const group = document.createElement('optgroup'); group.label = label;
      for (const source of items) {
        const state = states.get(source.url);
        if (state?.status !== status) continue;
        const option = document.createElement('option'); option.value = source.url;
        option.textContent = `${source.name || '视频地址'} · ${new URL(source.url).host} · ${source.source || '页面'} · ${state.kind ? state.kind.toUpperCase() : state.reason}`;
        option.title = `${state.reason}\n${source.url}`; option.disabled = status === 'invalid';
        option.dataset.status = status; group.append(option);
      }
      if (group.children.length) select.append(group);
    }
    select.value = [...select.options].some(option => option.value === selected && !option.disabled) ? selected : '';
    const count = status => items.filter(source => states.get(source.url)?.status === status).length;
    const waiting = count('permission'), running = count('queued') + count('checking');
    el('preflight-authorize').textContent = waiting ? `授权并检测 (${waiting})` : '重新检测';
    el('preflight-status').textContent = !studyAccepted ? '同意使用约定后自动检测视频地址。' : !items.length ? '发现视频后自动检测可用地址。' :
      `${count('valid')} 个可用 · ${count('unknown')} 个待确认${waiting ? ` · ${waiting} 个待授权` : ''}${running ? ` · ${running} 个检测中` : ''}${count('invalid') ? ` · ${count('invalid')} 个已过滤` : ''}`;
    controls();
  }
  function cancelPreflight() {
    revision++; controller.abort(); controller = new AbortController(); queue = [];
    for (const state of states.values()) {
      if (state.status === 'checking' || state.status === 'queued') Object.assign(state, {status: 'unknown', kind: null, reason: '检测已取消，可直接加载或重新检测'});
    }
  }
  function current(run, url) { return studyAccepted && run.revision === revision && run.page === pageURL && !run.signal.aborted && items.some(source => source.url === url); }
  async function checkSource(run, source) {
    if (!current(run, source.url)) return;
    const origin = originPattern(source.url);
    const allowed = !!globalThis.chrome?.permissions && await chrome.permissions.contains({origins: [origin]}).catch(() => false);
    if (!current(run, source.url)) return;
    if (!allowed) {
      states.set(source.url, {status: 'permission', kind: null, reason: '点“授权并检测”后检查此地址'}); renderSources(); return;
    }
    states.set(source.url, {status: 'checking', kind: null, reason: '正在检测…'}); renderSources();
    await setCourseReferrer([origin], run.page);
    if (!current(run, source.url)) return;
    const result = await PPTPreflight.probe(source.url, {signal: run.signal});
    if (!current(run, source.url)) return;
    states.set(source.url, result); renderSources();
  }
  function pump() {
    while (studyAccepted && active < 2 && queue.length) {
      const {run, source} = queue.shift();
      if (!current(run, source.url)) continue;
      active++;
      checkSource(run, source).catch(error => {
        if (!current(run, source.url) || error.name === 'AbortError') return;
        states.set(source.url, {status: 'unknown', kind: null, reason: '未能完成检测，可直接尝试加载'}); renderSources();
      }).finally(() => { active--; pump(); });
    }
  }
  function refreshSources(sources, nextPageURL, {reset = false} = {}) {
    if (reset || pageURL !== nextPageURL) { cancelPreflight(); states.clear(); }
    pageURL = nextPageURL;
    const unique = new Map();
    for (const source of [...sources].sort((a, b) => (b.seen || 0) - (a.seen || 0))) {
      try { if (/^https?:$/.test(new URL(source.url).protocol) && !unique.has(source.url)) unique.set(source.url, source); } catch {}
    }
    items = [...unique.values()];
    for (const url of states.keys()) if (!unique.has(url)) states.delete(url);
    const run = {revision, page: pageURL, signal: controller.signal};
    for (const source of items) {
      if (states.has(source.url)) continue;
      states.set(source.url, {status: 'queued', kind: null, reason: '等待检测'});
      queue.push({run, source});
    }
    renderSources(); pump();
  }
  el('source-show-all').onchange = renderSources;
  el('preflight-authorize').onclick = () => {
    if (busy() || !items.length) return;
    const origins = [...new Set(items.filter(source => states.get(source.url)?.status === 'permission').map(source => originPattern(source.url)))];
    // Keep request() in the click turn, before any await, to retain Chrome's user gesture.
    const permission = origins.length && globalThis.chrome?.permissions ? chrome.permissions.request({origins}) : Promise.resolve(true);
    const before = revision, page = pageURL;
    Promise.resolve(permission).then(granted => {
      if (before !== revision || page !== pageURL || !studyAccepted) return;
      if (!granted) { el('preflight-status').textContent = '未授予视频域名权限，也可以直接导入本地视频。'; return; }
      refreshSources(items, pageURL, {reset: true});
    }).catch(() => { if (before === revision) el('preflight-status').textContent = '域名授权未完成，请重试。'; });
  };

  async function updateMessage(message) {
    if (globalThis.chrome?.runtime?.id) return chrome.runtime.sendMessage(message);
    return message.type === 'PPT_CHECK_UPDATE'
      ? PPTState.checkForUpdate(currentVersion, {storage, force: message.force})
      : PPTState.claimNotification(message.version, storage);
  }
  function canShowUpdate(manual) { return studyAccepted && (manual || (ready && !busy())) && !document.querySelector('dialog[open]'); }
  async function checkUpdate(manual) {
    if (!studyAccepted || checkingUpdate) return;
    checkingUpdate = true; syncControls();
    try {
      const result = await updateMessage({type: 'PPT_CHECK_UPDATE', force: manual});
      const available = result?.status === 'available' && result.release;
      el('check-updates').dataset.available = String(!!available);
      el('check-updates').textContent = available ? '发现新版' : '检查更新';
      if (!canShowUpdate(manual) || (!manual && !available)) return;
      if (!manual && !await updateMessage({type: 'PPT_CLAIM_UPDATE', version: result.release.version})) return;
      if (!canShowUpdate(manual)) return;
      el('update-current').textContent = currentVersion;
      el('update-available').hidden = !available;
      el('update-version').textContent = available ? result.release.version : '';
      for (const [id, key] of [['update-release', 'url'], ['update-download', 'downloadURL']]) {
        el(id).hidden = !available;
        if (available) el(id).href = result.release[key]; else el(id).removeAttribute('href');
      }
      el('update-status').textContent = available ? '下载解压后覆盖原扩展文件夹，再去扩展管理页点“重新加载”即可。' : result?.status === 'current' ? '当前已是最新版本。' : '暂时连不上 GitHub，请稍后再试。';
      el('update-dialog').showModal();
    } catch {
      if (manual) {
        el('check-updates').textContent = '检查失败，点击重试';
        el('check-updates').title = '暂时无法连接 GitHub 检查更新，请稍后再试。';
      }
    } finally { checkingUpdate = false; syncControls(); }
  }
  el('check-updates').onclick = () => checkUpdate(true);
  el('update-later').onclick = () => el('update-dialog').close();

  function openTerms() {
    el('terms-agree').checked = studyAccepted;
    el('terms-agree').parentElement.hidden = studyAccepted;
    el('terms-accept').hidden = studyAccepted;
    el('terms-accept').disabled = !el('terms-agree').checked || accepting;
    el('terms-decline').textContent = studyAccepted ? '关闭' : '暂不同意';
    if (!terms.open) terms.showModal();
  }
  function unlock() {
    studyAccepted = true; shell.inert = false;
    if (terms.open) terms.close();
    refreshSources(sources, coursePage); discover();
    if (globalThis.chrome?.runtime?.id) dbReady.then(() => checkUpdate(false)).catch(() => {});
  }
  el('terms-agree').onchange = () => { el('terms-accept').disabled = !el('terms-agree').checked || accepting; };
  el('terms-accept').onclick = async () => {
    if (!el('terms-agree').checked || accepting) return;
    accepting = true; el('terms-accept').disabled = true; el('terms-agree').disabled = true; el('terms-decline').disabled = true;
    try { await PPTState.acceptConsent(storage); unlock(); }
    catch { el('terms-status').textContent = '无法保存确认状态，工具保持锁定，请检查浏览器存储权限后重试。'; }
    finally {
      accepting = false; el('terms-agree').disabled = false; el('terms-decline').disabled = false;
      el('terms-accept').disabled = !el('terms-agree').checked;
    }
  };
  el('terms-decline').onclick = () => {
    if (studyAccepted) { terms.close(); return; }
    el('terms-status').textContent = '同意使用约定后才能使用工具；如暂不使用，直接关闭此页即可。';
  };
  el('terms-open').onclick = openTerms;
  terms.addEventListener('cancel', event => { if (!studyAccepted) event.preventDefault(); });
  terms.addEventListener('close', () => { if (!studyAccepted) openTerms(); });
  window.PPTWorkspace = {refreshSources, cancelPreflight, syncControls};
  window.addEventListener('pagehide', cancelPreflight);
  PPTState.hasConsent(storage).then(accepted => { if (accepted) unlock(); else openTerms(); });
  syncControls();
})();
