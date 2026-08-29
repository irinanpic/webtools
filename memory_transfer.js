/**
 * memory_transfer.js
 * 画像処理ツール間での画像データ受け渡し用 共通 IndexedDB ヘルパー
 */
const AppMemory = (() => {
  const DB_NAME = 'CanvasAppSharedMemoryDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'shared_memory';
  const MEMORY_KEY = 'canvas_active_image';

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function save(dataUrlOrBlobOrCanvas, metadata = {}) {
    if (!dataUrlOrBlobOrCanvas) {
      showToast('保存する画像データがありません', 'warning');
      return false;
    }
    let dataUrl = '';
    try {
      if (typeof dataUrlOrBlobOrCanvas === 'string') {
        dataUrl = dataUrlOrBlobOrCanvas;
      } else if (dataUrlOrBlobOrCanvas instanceof Blob) {
        dataUrl = await blobToDataUrl(dataUrlOrBlobOrCanvas);
      } else if (dataUrlOrBlobOrCanvas instanceof HTMLCanvasElement) {
        dataUrl = dataUrlOrBlobOrCanvas.toDataURL('image/png');
      } else if (dataUrlOrBlobOrCanvas instanceof HTMLImageElement) {
        const c = document.createElement('canvas');
        c.width = dataUrlOrBlobOrCanvas.naturalWidth || dataUrlOrBlobOrCanvas.width;
        c.height = dataUrlOrBlobOrCanvas.naturalHeight || dataUrlOrBlobOrCanvas.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(dataUrlOrBlobOrCanvas, 0, 0);
        dataUrl = c.toDataURL('image/png');
      }
    } catch (e) {
      console.error('画像変換エラー:', e);
      showToast('画像の処理に失敗しました', 'error');
      return false;
    }

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      showToast('保存する画像データがありません', 'warning');
      return false;
    }

    const record = {
      dataUrl: dataUrl,
      savedAt: new Date().toISOString(),
      metadata: metadata
    };

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record, MEMORY_KEY);
        tx.oncomplete = () => {
          showToast('画像をメモリに保存しました', 'success');
          resolve(true);
        };
        tx.onerror = () => {
          showToast('メモリへの保存に失敗しました', 'error');
          reject(tx.error);
        };
      });
    } catch (err) {
      console.error('IndexedDB 保存エラー:', err);
      showToast('メモリへの保存に失敗しました', 'error');
      return false;
    }
  }

  async function load() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(MEMORY_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('IndexedDB 読込エラー:', err);
      return null;
    }
  }

  async function hasData() {
    try {
      const item = await load();
      return !!(item && item.dataUrl);
    } catch {
      return false;
    }
  }

  async function loadAsBlob() {
    const item = await load();
    if (!item || !item.dataUrl) return null;
    return dataUrlToBlob(item.dataUrl);
  }

  async function loadAsFile(filename = 'memory_image.png') {
    const blob = await loadAsBlob();
    if (!blob) return null;
    return new File([blob], filename, { type: blob.type || 'image/png' });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // Toast 通知ヘルパー
  function showToast(message, type = 'info') {
    const existing = document.getElementById('app-memory-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'app-memory-toast';
    const bgColors = {
      success: 'background-color: #059669; border-color: #10b981; color: #ffffff;',
      error: 'background-color: #e11d48; border-color: #f43f5e; color: #ffffff;',
      warning: 'background-color: #d97706; border-color: #f59e0b; color: #ffffff;',
      info: 'background-color: #4f46e5; border-color: #6366f1; color: #ffffff;'
    };

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      padding: 10px 18px;
      border-radius: 12px;
      border: 1px solid;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      font-family: sans-serif;
      font-weight: 600;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      transform: translateY(0);
      opacity: 1;
      ${bgColors[type] || bgColors.info}
    `;

    toast.innerHTML = `<span style="font-size: 14px; font-weight: bold;">${icons[type] || icons.info}</span> <span>${message}</span>`;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  return {
    save,
    load,
    hasData,
    loadAsBlob,
    loadAsFile,
    showToast
  };
})();
