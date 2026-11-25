/* Keep page metadata small; JPEGs, thumbnails and signatures stay in IndexedDB. */
const PPTPageStore = (() => {
  function transaction(db, stores, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('本地保存已取消'));
      try { result = action(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }
  function legacyImage(data) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s.exec(data);
    if (!match) throw Error('旧截图格式无法识别，原数据已保留');
    const raw = atob(match[2]);
    return new Blob([Uint8Array.from(raw, char => char.charCodeAt(0))], {type: match[1]});
  }
  function open({blocked = () => {}} = {}) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('course-ppt', 3);
      let migrationError;
      request.onblocked = blocked;
      request.onerror = () => reject(migrationError || request.error);
      request.onupgradeneeded = () => {
        const db = request.result, tx = request.transaction;
        if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages', {keyPath: 'id', autoIncrement: true});
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', {keyPath: 'id'});
        const cursor = tx.objectStore('pages').openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          try {
            const {data, sig, ...metadata} = entry.value;
            if (data) tx.objectStore('assets').put({id: metadata.id, image: legacyImage(data), sig});
            entry.update(metadata); entry.continue();
          } catch (error) { migrationError = error; tx.abort(); }
        };
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }
  function assetSize(asset) {
    return (asset?.image?.size || 0) + (asset?.thumbnail?.size || 0) + (asset?.sig?.byteLength || 0);
  }
  async function estimate(db, pages) {
    let bytes = 0, missing = 0;
    // Old records have no byte metadata: read and release one asset at a time.
    for (const page of pages) {
      if (Number.isFinite(page.assetBytes) && page.assetBytes >= 0) bytes += page.assetBytes;
      else {
        const [record] = await assets(db, [page.id]);
        if (record) bytes += assetSize(record); else missing++;
      }
    }
    return {bytes, missing};
  }
  async function add(db, metadata, asset) {
    let id;
    await transaction(db, ['pages', 'assets'], 'readwrite', tx => {
      const request = tx.objectStore('pages').add({...metadata, assetBytes: assetSize(asset)});
      request.onsuccess = () => { id = request.result; tx.objectStore('assets').put({...asset, id}); };
    });
    metadata.assetBytes = assetSize(asset);
    return id;
  }
  function assets(db, ids) {
    return transaction(db, ['assets'], 'readonly', tx => {
      const requests = ids.map(id => tx.objectStore('assets').get(id));
      return () => requests.map(request => request.result);
    });
  }
  async function asset(db, id) {
    const [result] = await assets(db, [id]);
    if (!result?.image) throw Error('这张截图的图片不可用，请重新提取');
    return result;
  }
  function blob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('图片编码失败，请重试')), 'image/jpeg', quality));
  }
  async function makeThumbnail(source, width, height) {
    const canvas = document.createElement('canvas'), ratio = Math.min(1, 320 / width);
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    try { canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height); return await blob(canvas, 0.8); }
    finally { canvas.width = canvas.height = 0; }
  }
  async function encode(canvas) {
    const [image, thumbnail] = await Promise.all([blob(canvas, 0.95), makeThumbnail(canvas, canvas.width, canvas.height)]);
    return {image, thumbnail};
  }
  async function thumbnail(db, id) {
    const record = await asset(db, id);
    if (record.thumbnail) return record.thumbnail;
    const bitmap = await createImageBitmap(record.image);
    let small;
    try { small = await makeThumbnail(bitmap, bitmap.width, bitmap.height); }
    finally { bitmap.close(); }
    await transaction(db, ['assets', 'pages'], 'readwrite', tx => {
      const request = tx.objectStore('assets').get(id), page = tx.objectStore('pages').get(id);
      page.onsuccess = () => {
        if (!request.result) return;
        const next = {...request.result, thumbnail: small};
        tx.objectStore('assets').put(next);
        if (Number.isFinite(page.result?.assetBytes)) tx.objectStore('pages').put({...page.result, assetBytes: assetSize(next)});
      };
    });
    return small;
  }
  async function imageBytes(db, id) {
    let image = (await asset(db, id)).image;
    if (image.type !== 'image/jpeg') {
      const bitmap = await createImageBitmap(image), canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      try { canvas.getContext('2d').drawImage(bitmap, 0, 0); image = await blob(canvas, 0.95); }
      finally { bitmap.close(); canvas.width = canvas.height = 0; }
    }
    return new Uint8Array(await image.arrayBuffer());
  }
  function learning(db, updates) {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(updates) || updates.some(item => !item || item.id == null || typeof item.excluded !== 'boolean')
        || new Set(updates.map(item => item.id)).size !== updates.length) { reject(Error('页面排除设置无效')); return; }
      const snapshot = updates.map(item => ({id: item.id, excluded: item.excluded}));
      const tx = db.transaction(['pages'], 'readwrite'), store = tx.objectStore('pages'), oldFlags = []; let failure;
      tx.oncomplete = () => resolve(oldFlags);
      tx.onerror = tx.onabort = () => reject(failure || tx.error || Error('页面排除设置未能保存'));
      const abort = error => { failure = error; tx.abort(); };
      try {
        snapshot.forEach((item, index) => {
          const read = store.get(item.id);
          read.onsuccess = () => {
            try {
              if (!read.result) throw Error('页面已不存在，请刷新后重试');
              oldFlags[index] = {id: item.id, excluded: read.result.learningExcluded === true};
              store.put({...read.result, learningExcluded: item.excluded});
            } catch (error) { abort(error); }
          };
        });
      } catch (error) { abort(error); }
    });
  }
  function discard(db, ids) {
    if (!ids.length) return Promise.resolve();
    return transaction(db, ['assets'], 'readwrite', tx => ids.forEach(id => tx.objectStore('assets').delete(id)));
  }
  function pruneAssets(db) {
    return transaction(db, ['pages', 'assets'], 'readwrite', tx => {
      const keys = tx.objectStore('pages').getAllKeys();
      keys.onsuccess = () => {
        const retained = new Set(keys.result), cursor = tx.objectStore('assets').openKeyCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          if (!retained.has(entry.primaryKey)) tx.objectStore('assets').delete(entry.primaryKey);
          entry.continue();
        };
      };
    });
  }
  let pageLease, releaseLease;
  globalThis.addEventListener?.('pagehide', () => releaseLease?.());
  function prune(db) {
    if (!navigator.locks?.request) return Promise.resolve();
    // Deleted images may still belong to another open page's undo buffer.
    // Only reclaim them before the first live page takes a shared lease.
    if (!pageLease) pageLease = (async () => {
      const name = 'ppt-capture-pages';
      await navigator.locks.request(name, {mode: 'exclusive', ifAvailable: true}, lock => lock ? pruneAssets(db) : undefined);
      await new Promise((resolve, reject) => {
        const lifetime = new Promise(done => { releaseLease = done; });
        navigator.locks.request(name, {mode: 'shared'}, () => { resolve(); return lifetime; }).catch(reject);
      });
    })();
    return pageLease;
  }
  return {open, add, asset, assets, encode, thumbnail, imageBytes, learning, discard, prune, estimate};
})();
