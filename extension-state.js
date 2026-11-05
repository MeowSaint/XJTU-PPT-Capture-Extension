/* Local consent and public GitHub release state; callers serialize update/claim operations. */
(function (root) {
  'use strict';
  const TERMS_VERSION = 'course-materials-v1';
  const CONSENT_KEY = 'ppt-study-consent';
  const UPDATE_KEY = 'ppt-update-state';
  const REPOSITORY = 'https://github.com/MeowSaint/XJTU-PPT-Capture-Extension';
  const ENDPOINT = 'https://api.github.com/repos/MeowSaint/XJTU-PPT-Capture-Extension/releases/latest';
  const INTERVAL = 86400000;
  const TIMEOUT = 8000;

  function validTimestamp(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }
  function versionParts(value) {
    if (typeof value !== 'string' || !/^v?\d+\.\d+\.\d+(?:\.\d+)?$/.test(value)) return null;
    const parts = value.replace(/^v/, '').split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  }
  function compareVersions(a, b) {
    const left = versionParts(a), right = versionParts(b);
    if (!left || !right) return null;
    for (let i = 0; i < 4; i++) {
      if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0) ? 1 : -1;
    }
    return 0;
  }
  async function hasConsent(storage = root.chrome?.storage?.local) {
    try {
      const record = (await storage.get(CONSENT_KEY))?.[CONSENT_KEY];
      return record?.version === TERMS_VERSION && validTimestamp(record.acceptedAt);
    } catch { return false; }
  }
  async function acceptConsent(storage = root.chrome?.storage?.local, now = Date.now()) {
    if (!validTimestamp(now)) throw Error('Invalid consent timestamp');
    await storage.set({[CONSENT_KEY]: {version: TERMS_VERSION, acceptedAt: now}});
  }

  function releaseMetadata(tag) {
    if (!versionParts(tag)) return null;
    return {
      version: tag.replace(/^v/, ''),
      url: `${REPOSITORY}/releases/tag/${tag}`,
      downloadURL: `${REPOSITORY}/releases/download/${tag}/ppt-capture.zip`
    };
  }
  function cachedRelease(value) {
    if (!value || typeof value.version !== 'string') return null;
    for (const tag of [value.version, `v${value.version}`]) {
      const release = releaseMetadata(tag);
      if (release && release.url === value.url && release.downloadURL === value.downloadURL) return release;
    }
    return null;
  }
  function parseRelease(value) {
    if (!value || typeof value.tag_name !== 'string' || typeof value.draft !== 'boolean' || typeof value.prerelease !== 'boolean') throw Error('Invalid release response');
    const release = releaseMetadata(value.tag_name);
    if (value.draft || value.prerelease || !release) return null;
    const asset = Array.isArray(value.assets) ? value.assets.find(item => item?.name === 'ppt-capture.zip') : null;
    if (typeof value.published_at !== 'string' || !Number.isFinite(Date.parse(value.published_at)) ||
        value.html_url !== release.url || asset?.browser_download_url !== release.downloadURL) throw Error('Invalid release response');
    return release;
  }
  function errorResult(error, cached = false) {
    return {status: 'error', release: null, cached, error: typeof error === 'string' ? error : 'Invalid cached update state'};
  }
  function updateResult(record, currentVersion, cached) {
    if (record.error) return errorResult(record.error, cached);
    const release = cachedRelease(record.release);
    if (record.release !== null && !release) return errorResult('Invalid cached release', cached);
    return {status: release && compareVersions(release.version, currentVersion) > 0 ? 'available' : 'current', release, cached};
  }

  async function fetchRelease(fetchImpl, signal) {
    if (signal?.aborted) throw Error('Update check cancelled');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, {once: true});
    let timer;
    const aborted = new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(Error('Update check cancelled')), {once: true});
      timer = setTimeout(() => { reject(Error('Update check timed out')); controller.abort(); }, TIMEOUT);
    });
    try {
      const request = (async () => {
        let response;
        try {
          response = await fetchImpl(ENDPOINT, {
            method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
            headers: {Accept: 'application/vnd.github+json'}, signal: controller.signal
          });
        } catch { throw Error('Unable to reach GitHub'); }
        if (!response?.ok) throw Error(Number.isInteger(response?.status) ? `GitHub returned HTTP ${response.status}` : 'Invalid release response');
        let value;
        try { value = await response.json(); } catch { throw Error('Invalid release response'); }
        return parseRelease(value);
      })();
      return await Promise.race([request, aborted]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  }

  async function checkForUpdate(currentVersion, {storage = root.chrome?.storage?.local, fetchImpl = root.fetch, now = Date.now(), force = false, signal} = {}) {
    if (!await hasConsent(storage)) return {status: 'unaccepted', release: null, cached: false};
    if (!versionParts(currentVersion)) return errorResult('Unrecognized current version');
    if (!validTimestamp(now)) return errorResult('Invalid update timestamp');
    let previous;
    try { previous = (await storage.get(UPDATE_KEY))?.[UPDATE_KEY]; }
    catch { return errorResult('Unable to read update state'); }
    if (!force && validTimestamp(previous?.lastAttemptAt) && now >= previous.lastAttemptAt && now - previous.lastAttemptAt < INTERVAL) {
      return updateResult(previous, currentVersion, true);
    }
    const record = {
      lastAttemptAt: now, release: null,
      notifiedVersion: versionParts(previous?.notifiedVersion) ? previous.notifiedVersion.replace(/^v/, '') : null
    };
    try { record.release = await fetchRelease(fetchImpl, signal); }
    catch (error) { record.error = error.message; }
    try { await storage.set({[UPDATE_KEY]: record}); }
    catch { return errorResult('Unable to save update state'); }
    return updateResult(record, currentVersion, false);
  }

  async function claimNotification(version, storage = root.chrome?.storage?.local) {
    try {
      const record = (await storage.get(UPDATE_KEY))?.[UPDATE_KEY];
      const release = cachedRelease(record?.release);
      if (!release || !validTimestamp(record.lastAttemptAt) || record.error || compareVersions(version, release.version) !== 0 || compareVersions(record.notifiedVersion, release.version) === 0) return false;
      await storage.set({[UPDATE_KEY]: {lastAttemptAt: record.lastAttemptAt, release, notifiedVersion: release.version}});
      return true;
    } catch { return false; }
  }

  const api = {TERMS_VERSION, CONSENT_KEY, UPDATE_KEY, hasConsent, acceptConsent, compareVersions, checkForUpdate, claimNotification};
  root.PPTState = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
