importScripts('media.js', 'course.js', 'extension-state.js');
const courseOrigin = 'https://rms-v5.xjtu.edu.cn';
let queue = Promise.resolve(), updateQueue = Promise.resolve();
async function updateBadge(tabId, count) {
  const update = (method, details) => new Promise(resolve => {
    try {
      const pending = chrome.action[method]({tabId, ...details}, () => {
        void chrome.runtime.lastError;
        resolve();
      });
      pending?.then(resolve, resolve);
    } catch { resolve(); }
  });
  await Promise.all([
    update('setBadgeBackgroundColor', {color: '#b91c1c'}),
    update('setBadgeText', {text: count ? String(count) : ''})
  ]);
}
function clearTab(tabId) {
  queue = queue.catch(() => {}).then(async () => {
    await chrome.storage.session.remove('media-' + tabId);
    await updateBadge(tabId, 0);
  });
  queue.catch(() => {});
}
function remember(tabId, urls, source, metadata, page) {
  queue = queue.catch(() => {}).then(async () => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.url?.startsWith(courseOrigin + '/')) return;
    if (page && page !== tab.url) return;
    const key = 'media-' + tabId;
    const old = (await chrome.storage.session.get(key))[key];
    const entry = old?.page === tab.url ? old : {page: tab.url, items: []};
    if (metadata) entry.course = {...entry.course, ...PPTCourse.normalize(metadata)};
    for (const raw of urls.slice(0, 200)) {
      const info = PPTCore.mediaInfo(raw, tab.url);
      if (!info) continue;
      const existing = entry.items.find(x => x.url === info.url);
      if (existing) { existing.seen = Date.now(); continue; }
      entry.items.push({...info, source, seen: Date.now()});
    }
    entry.items = entry.items.slice(-150);
    await chrome.storage.session.set({[key]: entry});
    const count = new Set(entry.items.map(item => PPTCore.mediaInfo(item.url, tab.url)?.url).filter(Boolean)).size;
    await updateBadge(tabId, count);
  });
  return queue;
}
chrome.action.onClicked.addListener(async tab => {
  const suffix = tab.url?.startsWith(courseOrigin + '/') ? '?tab=' + tab.id : '';
  await chrome.tabs.create({url: chrome.runtime.getURL('capture.html') + suffix});
});
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId >= 0 && PPTCore.mediaInfo(details.url)) remember(details.tabId, [details.url], '网络请求').catch(() => {});
}, {urls: ['http://*/*', 'https://*/*']});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'PPT_CHECK_UPDATE' || message.type === 'PPT_CLAIM_UPDATE') {
    if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('capture.html')) return;
    updateQueue = updateQueue.catch(() => {}).then(() => message.type === 'PPT_CHECK_UPDATE'
      ? PPTState.checkForUpdate(chrome.runtime.getManifest().version, {force: message.force === true})
      : PPTState.claimNotification(message.version));
    updateQueue.then(respond, () => respond({status: 'error', release: null, cached: false}));
    return true;
  }
  if (message.type === 'PPT_COURSE') {
    if (!sender.tab || sender.frameId !== 0 || sender.url !== message.page || !sender.url?.startsWith(courseOrigin + '/')) return;
    remember(sender.tab.id, [], '', message.course, message.page).then(() => respond({ok: true}), () => respond({ok: false}));
    return true;
  }
  const courseFrame = sender.url?.startsWith(courseOrigin + '/') || /^about:(blank|srcdoc)$/.test(sender.url || '');
  // remember() independently checks the current top-level course URL.
  if (message.type !== 'PPT_MEDIA' || !sender.tab || !courseFrame) return;
  remember(sender.tab.id, Array.isArray(message.urls) ? message.urls.filter(x => typeof x === 'string') : [], '页面 / 播放器')
    .then(() => respond({ok: true}), () => respond({ok: false}));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || changeInfo.url) clearTab(tabId);
});
chrome.tabs.onRemoved.addListener(clearTab);
