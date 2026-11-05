/* Temporary OPFS files belong to one locked tool-page session. */
(function (root) {
  'use strict';
  const DIRECTORY = 'ppt-capture-cache';
  const files = new Set(), pending = new Set();
  let sessionPromise, leaving = false, nextFile = 0;

  function stopped() {
    const error = Error('磁盘缓存已关闭或删除，页面可能已退出');
    error.name = 'AbortError';
    return error;
  }
  function explain(error, action) {
    const message = error?.name === 'QuotaExceededError'
      ? '磁盘缓存空间不足，请释放本地磁盘空间后重试；视频也可尝试本地导入。'
      : `磁盘缓存${action}失败：${error?.message || String(error)}`;
    const result = new Error(message, {cause: error});
    result.name = error?.name || 'Error';
    return result;
  }
  function withCleanup(error, cleanup) {
    const result = new Error(`${error.message}；清理失败：${cleanup.message}`, {cause: error});
    result.name = error.name || 'Error';
    result.cleanupError = cleanup;
    return result;
  }
  async function deleteEntry(directory, name, recursive = false) {
    try { await directory.removeEntry(name, {recursive}); }
    catch (error) { if (error?.name !== 'NotFoundError') throw error; }
  }
  function lockSession(name) {
    return new Promise((resolve, reject) => {
      let release;
      const lifetime = new Promise(done => { release = done; });
      let task;
      try {
        task = Promise.resolve(root.navigator.locks.request(name, {mode: 'exclusive', ifAvailable: true}, lock => {
          if (!lock) { reject(Error('磁盘缓存会话锁不可用，请重试')); return; }
          resolve(async () => { release(); await task; });
          return lifetime;
        }));
      } catch (error) { reject(error); return; }
      task.catch(reject);
    });
  }
  async function initialize() {
    if (typeof root.navigator?.storage?.getDirectory !== 'function' ||
        typeof root.navigator?.locks?.request !== 'function' || typeof root.crypto?.randomUUID !== 'function') {
      throw Error('磁盘缓存不可用：当前浏览器不支持 OPFS 或 Web Locks，请使用 Chrome 114 或更新版本；视频也可尝试本地导入。');
    }
    const storage = await root.navigator.storage.getDirectory();
    if (leaving) throw stopped();
    const parent = await storage.getDirectoryHandle(DIRECTORY, {create: true});
    if (leaving) throw stopped();
    const name = `session-${root.crypto.randomUUID()}`;
    const release = await lockSession(`${DIRECTORY}/${name}`);
    try {
      if (leaving) throw stopped();
      const directory = await parent.getDirectoryHandle(name, {create: true});
      for await (const [oldName, handle] of parent.entries()) {
        if (leaving) throw stopped();
        if (oldName === name || handle.kind !== 'directory' || !oldName.startsWith('session-')) continue;
        await root.navigator.locks.request(`${DIRECTORY}/${oldName}`, {mode: 'exclusive', ifAvailable: true}, async lock => {
          if (lock) await deleteEntry(parent, oldName, true);
        });
      }
      if (leaving) throw stopped();
      return {parent, directory, name, release};
    } catch (error) {
      try { await deleteEntry(parent, name, true); }
      catch (cleanup) { error = withCleanup(error, cleanup); }
      finally { await release(); }
      throw error;
    }
  }
  function session() {
    if (leaving) return Promise.reject(stopped());
    if (!sessionPromise) {
      const attempt = initialize().catch(error => { throw explain(error, '初始化'); });
      sessionPromise = attempt;
      attempt.catch(() => { if (sessionPromise === attempt) sessionPromise = undefined; });
    }
    return sessionPromise;
  }

  async function openFile(owner, name) {
    let handle, writable, finishPromise, removePromise, failure;
    let tail = Promise.resolve(), removing = false, removed = false;
    function enqueue(work) {
      const result = tail.then(work);
      tail = result.then(() => {}, () => {});
      return result;
    }
    async function cleanup() {
      if (removed) return;
      let error;
      if (writable) {
        try { await writable.abort(); writable = undefined; }
        catch (abortError) {
          try { await writable.close(); writable = undefined; }
          catch (closeError) { error = withCleanup(abortError, closeError); }
        }
      }
      try { await deleteEntry(owner.directory, name); }
      catch (deleteError) { error = error ? withCleanup(error, deleteError) : deleteError; }
      if (error) throw explain(error, '清理');
      removed = true;
      finishPromise = undefined;
      files.delete(cache);
    }
    async function fail(error, action) {
      failure = explain(error, action);
      try { await cleanup(); }
      catch (cleanupError) { failure = withCleanup(failure, cleanupError); }
      throw failure;
    }
    const cache = {
      write(chunk) {
        if (removing || removed || leaving) return Promise.reject(stopped());
        if (failure) return Promise.reject(failure);
        if (finishPromise) return Promise.reject(Error('磁盘缓存写入已完成，不能继续写入'));
        return enqueue(async () => {
          if (failure) throw failure;
          if (removing || removed || leaving) throw stopped();
          try { await writable.write(chunk); }
          catch (error) { return fail(error, '写入'); }
        });
      },
      finish(type) {
        if (removing || removed || leaving) return Promise.reject(stopped());
        if (failure) return Promise.reject(failure);
        if (!finishPromise) finishPromise = enqueue(async () => {
          if (failure) throw failure;
          if (removing || removed || leaving) throw stopped();
          try {
            await writable.close();
            writable = undefined;
            const file = await handle.getFile();
            if (removing || leaving) throw stopped();
            return type ? new root.File([file], file.name, {type, lastModified: file.lastModified}) : file;
          } catch (error) { return fail(error, '完成'); }
        });
        return finishPromise;
      },
      remove() {
        removing = true;
        if (removed) return Promise.resolve();
        if (!removePromise) {
          removePromise = enqueue(cleanup);
          removePromise.catch(() => { removePromise = undefined; });
        }
        return removePromise;
      }
    };
    files.add(cache);
    try {
      handle = await owner.directory.getFileHandle(name, {create: true});
      if (leaving) throw stopped();
      writable = await handle.createWritable();
      if (leaving) throw stopped();
      return cache;
    } catch (error) { return fail(error, '创建'); }
  }
  async function create(prefix = 'cache') {
    const owner = await session();
    if (leaving) throw stopped();
    const name = `${String(prefix).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64)}-${++nextFile}`;
    const opening = openFile(owner, name);
    pending.add(opening);
    try { return await opening; }
    finally { pending.delete(opening); }
  }

  root.addEventListener?.('pagehide', () => {
    if (leaving) return;
    leaving = true;
    const attempt = sessionPromise;
    if (!attempt) return;
    (async () => {
      const owner = await attempt;
      try {
        await Promise.allSettled([...pending]);
        await Promise.allSettled([...files].map(cache => cache.remove()));
        await deleteEntry(owner.parent, owner.name, true);
      } finally { await owner.release(); }
    })().catch(() => {}); // A killed page leaves its unlocked directory for the next startup.
  });
  root.PPTDiskCache = {create};
  session().catch(() => {});
})(globalThis);
