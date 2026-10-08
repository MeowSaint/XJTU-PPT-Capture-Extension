importScripts('media.js', 'course.js');
const courseOrigin = 'https://rms-v5.xjtu.edu.cn';
let queue = Promise.resolve();
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
chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove('media-' + tabId));
