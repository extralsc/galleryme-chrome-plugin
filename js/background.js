let autoScanTabs = new Map();
const AUTO_SCAN_STORAGE_KEY = '_autoScanTabs';

async function loadAutoScanState() {
  try {
    const result = await chrome.storage.local.get([AUTO_SCAN_STORAGE_KEY]);
    if (result[AUTO_SCAN_STORAGE_KEY]) {
      const entries = Object.entries(result[AUTO_SCAN_STORAGE_KEY]);
      autoScanTabs = new Map(entries.map(([k, v]) => [parseInt(k), v]));
    }
  } catch (e) {}
}

async function saveAutoScanState() {
  try {
    const obj = Object.fromEntries(autoScanTabs);
    await chrome.storage.local.set({ [AUTO_SCAN_STORAGE_KEY]: obj });
  } catch (e) {}
}

loadAutoScanState();

function getStorageKey(url) {
  try {
    const urlObj = new URL(url);
    return `media_${urlObj.origin}${urlObj.pathname}`;
  } catch {
    return null;
  }
}

async function updateBadge(tabId, count) {
  try {
    if (count > 0) {
      await chrome.action.setBadgeText({ text: String(count), tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#4361ee', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (e) {}
}

async function updateBadgeFromStorage(tabId, url) {
  const storageKey = getStorageKey(url);
  if (!storageKey) return;
  const result = await chrome.storage.local.get([storageKey]);
  const media = result[storageKey];
  const count = media ? media.images.length + media.videos.length : 0;
  await updateBadge(tabId, count);
}

async function startAutoScan(tabId, storageKey) {
  autoScanTabs.set(tabId, { storageKey, active: true });
  await saveAutoScanState();
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'startObserver',
      storageKey
    });
  } catch (e) {}
}

async function stopAutoScan(tabId) {
  autoScanTabs.delete(tabId);
  await saveAutoScanState();
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'stopObserver' });
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.action) {
    case 'startAutoScan':
      startAutoScan(message.tabId, message.storageKey);
      sendResponse({ success: true });
      break;

    case 'stopAutoScan':
      stopAutoScan(message.tabId);
      sendResponse({ success: true });
      break;

    case 'getAutoScanStatus':
      loadAutoScanState().then(() => {
        const status = autoScanTabs.get(message.tabId);
        sendResponse({ active: status?.active || false });
      });
      return true;

    case 'checkAutoScan':
      loadAutoScanState().then(() => {
        if (tabId && autoScanTabs.has(tabId)) {
          const info = autoScanTabs.get(tabId);
          sendResponse({ shouldObserve: true, storageKey: info.storageKey });
        } else {
          sendResponse({ shouldObserve: false });
        }
      });
      return true;

    case 'updateBadge':
      if (tabId) {
        updateBadge(tabId, message.count);
      }
      sendResponse({ success: true });
      break;

    case 'mediaFound':
      if (tabId) {
        updateBadge(tabId, message.count);
      }
      chrome.runtime.sendMessage({
        action: 'mediaUpdated',
        storageKey: message.storageKey
      }).catch(() => {});
      sendResponse({ success: true });
      break;
  }

  return true;
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await updateBadgeFromStorage(activeInfo.tabId, tab.url);
    }
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await updateBadgeFromStorage(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (autoScanTabs.has(tabId)) {
    autoScanTabs.delete(tabId);
    await saveAutoScanState();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url) {
    await updateBadgeFromStorage(tabs[0].id, tabs[0].url);
  }
});

async function cleanupTempStorage() {
  try {
    const result = await chrome.storage.local.get(null);
    const keysToRemove = [];
    const now = Date.now();
    const maxAge = 60 * 60 * 1000;

    for (const key of Object.keys(result)) {
      if (key.startsWith('_selected_')) {
        const timestamp = parseInt(key.split('_')[2], 10);
        if (!isNaN(timestamp) && now - timestamp > maxAge) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (e) {}
}

cleanupTempStorage();
setInterval(cleanupTempStorage, 30 * 60 * 1000);
