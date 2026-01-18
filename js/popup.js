let mediaData = { images: [], videos: [] };
let currentTab = 'all';
let currentTabId = null;
let currentTabUrl = null;
let storageKey = null;
let sortOrder = 'asc';
let previousItemCount = 0;
let isSelectMode = false;
let selectedItems = new Set();

const scanBtn = document.getElementById('scanBtn');
const clearBtn = document.getElementById('clearBtn');
const gallery = document.getElementById('gallery');
const allCount = document.getElementById('allCount');
const imageCount = document.getElementById('imageCount');
const videoCount = document.getElementById('videoCount');
const tabBtns = document.querySelectorAll('.tab-btn');
const autoScanToggle = document.getElementById('autoScanToggle');
const autoScanStatus = document.getElementById('autoScanStatus');
const selectRow = document.querySelector('.select-row');
const selectBtn = document.getElementById('selectBtn');
const selectedCount = document.getElementById('selectedCount');
const playSelectedBtn = document.getElementById('playSelectedBtn');
const cancelSelectBtn = document.getElementById('cancelSelectBtn');
const sortSelect = document.getElementById('sortOrder');

function getStorageKey(url) {
  try {
    const urlObj = new URL(url);
    return `media_${urlObj.origin}${urlObj.pathname}`;
  } catch {
    return `media_${url}`;
  }
}

async function loadFromStorage(scrollToNew = false) {
  if (!storageKey) return;
  const result = await chrome.storage.local.get([storageKey]);

  if (result[storageKey]) {
    mediaData = result[storageKey];
  } else {
    mediaData = { images: [], videos: [] };
  }

  updateCounts();
  displayGallery(scrollToNew);
}

async function saveToStorage() {
  if (!storageKey) return;
  await chrome.storage.local.set({ [storageKey]: mediaData });

  chrome.runtime.sendMessage({
    action: 'updateBadge',
    count: mediaData.images.length + mediaData.videos.length
  });
}

function updateCounts() {
  const total = mediaData.images.length + mediaData.videos.length;
  allCount.textContent = total;
  imageCount.textContent = mediaData.images.length;
  videoCount.textContent = mediaData.videos.length;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function initialize() {
  const tab = await getCurrentTab();
  currentTabId = tab.id;
  currentTabUrl = tab.url;
  storageKey = getStorageKey(tab.url);

  updatePageInfo(tab.url);
  await loadFromStorage();

  const response = await chrome.runtime.sendMessage({
    action: 'getAutoScanStatus',
    tabId: currentTabId
  });
  if (response?.active) {
    autoScanToggle.checked = true;
    autoScanStatus.textContent = 'Watching...';
  }
}

function updatePageInfo(url) {
  try {
    const urlObj = new URL(url);
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
      const path = urlObj.pathname.length > 25 ? urlObj.pathname.substring(0, 25) + '...' : urlObj.pathname;
      pageInfo.textContent = urlObj.hostname + path;
    }
  } catch {}
}

function getCurrentItems() {
  let items = [];

  if (currentTab === 'all') {
    mediaData.images.forEach((src, idx) => {
      const order = mediaData.imageOrder?.[idx] ?? idx;
      items.push({ src, type: 'image', originalIndex: idx, order });
    });
    mediaData.videos.forEach((src, idx) => {
      const order = mediaData.videoOrder?.[idx] ?? (mediaData.images.length + idx);
      items.push({ src, type: 'video', originalIndex: idx, order });
    });
    items.sort((a, b) => a.order - b.order);
  } else if (currentTab === 'images') {
    items = mediaData.images.map((src, idx) => ({ src, type: 'image', originalIndex: idx }));
  } else {
    items = mediaData.videos.map((src, idx) => ({ src, type: 'video', originalIndex: idx }));
  }

  if (sortOrder === 'desc') {
    items.reverse();
  }

  return items;
}

async function performScan() {
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning...';
  gallery.innerHTML = '<p class="loading">Scanning page for media...</p>';

  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { action: 'scan' });

    if (response?.media) {
      let addedImages = 0;
      let addedVideos = 0;

      if (!mediaData.imageOrder) mediaData.imageOrder = [];
      if (!mediaData.videoOrder) mediaData.videoOrder = [];

      let maxOrder = Math.max(0, ...mediaData.imageOrder, ...mediaData.videoOrder);

      response.media.images.forEach(src => {
        if (!mediaData.images.includes(src)) {
          mediaData.images.push(src);
          mediaData.imageOrder.push(++maxOrder);
          addedImages++;
        }
      });

      response.media.videos.forEach(src => {
        if (!mediaData.videos.includes(src)) {
          mediaData.videos.push(src);
          mediaData.videoOrder.push(++maxOrder);
          addedVideos++;
        }
      });

      await saveToStorage();
      updateCounts();
      displayGallery(addedImages > 0 || addedVideos > 0);
    }
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: ['js/content.js']
      });
      setTimeout(performScan, 100);
      return;
    } catch (e) {
      gallery.innerHTML = '<p class="placeholder">Cannot scan this page</p>';
    }
  }

  scanBtn.disabled = false;
  scanBtn.textContent = 'Scan Page for Media';
}

function openGallery(index) {
  const url = chrome.runtime.getURL(`gallery.html?key=${encodeURIComponent(storageKey)}&index=${index}&filter=${currentTab}`);
  chrome.tabs.create({ url });
}

function displayGallery(scrollToNew = false) {
  const items = getCurrentItems();
  const hasNewItems = items.length > previousItemCount;

  if (items.length > 0) {
    selectRow.classList.add('active');
  } else {
    selectRow.classList.remove('active');
  }

  if (items.length === 0) {
    gallery.innerHTML = '<p class="placeholder">No media found. Scan this page to collect.</p>';
    previousItemCount = 0;
    return;
  }

  gallery.innerHTML = '';

  if (isSelectMode) {
    gallery.classList.add('select-mode');
  } else {
    gallery.classList.remove('select-mode');
  }

  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'media-card';

    if (selectedItems.has(index)) {
      card.classList.add('selected');
    }

    const isVideo = item.type === 'video';
    const isEmbed = isVideo && (item.src.includes('youtube.com') || item.src.includes('vimeo.com'));
    const displayNum = sortOrder === 'asc' ? index + 1 : items.length - index;

    if (isVideo) {
      card.innerHTML = `
        <div class="card-image video-thumb">
          ${isEmbed ? '<span class="play-icon">▶</span>' : `<video src="${item.src}" muted></video>`}
          <span class="card-index">${displayNum}</span>
          <span class="card-badge video">VIDEO</span>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="card-image">
          <img src="${item.src}" alt="Image ${displayNum}" loading="lazy">
          <span class="card-index">${displayNum}</span>
        </div>
      `;
    }

    card.addEventListener('click', () => {
      if (isSelectMode) {
        toggleSelection(index, card);
      } else {
        openGallery(item.originalIndex);
      }
    });

    gallery.appendChild(card);
  });

  if (scrollToNew && hasNewItems) {
    if (sortOrder === 'asc') {
      gallery.scrollTop = gallery.scrollHeight;
    } else {
      gallery.scrollTop = 0;
    }
  }

  previousItemCount = items.length;
}

function toggleSelection(index, card) {
  if (selectedItems.has(index)) {
    selectedItems.delete(index);
    card.classList.remove('selected');
  } else {
    selectedItems.add(index);
    card.classList.add('selected');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = selectedItems.size;
  if (count > 0) {
    selectedCount.textContent = `${count} selected`;
    playSelectedBtn.disabled = false;
  } else {
    selectedCount.textContent = '';
    playSelectedBtn.disabled = true;
  }
}

function enterSelectMode() {
  isSelectMode = true;
  selectedItems.clear();
  selectRow.classList.add('selecting');
  selectBtn.classList.add('active');
  gallery.classList.add('select-mode');
  updateSelectedCount();
}

function exitSelectMode() {
  isSelectMode = false;
  selectedItems.clear();
  selectRow.classList.remove('selecting');
  selectBtn.classList.remove('active');
  gallery.classList.remove('select-mode');
  updateSelectedCount();
  displayGallery();
}

function playSelected() {
  if (selectedItems.size === 0) return;

  const items = getCurrentItems();
  const selectedMedia = Array.from(selectedItems)
    .sort((a, b) => a - b)
    .map(i => items[i]);

  const tempKey = `_selected_${Date.now()}`;
  const tempData = {
    images: selectedMedia.filter(i => i.type === 'image').map(i => i.src),
    videos: selectedMedia.filter(i => i.type === 'video').map(i => i.src)
  };

  chrome.storage.local.set({ [tempKey]: tempData }, () => {
    const url = chrome.runtime.getURL(`gallery.html?key=${encodeURIComponent(tempKey)}&index=0&filter=all&temp=1`);
    chrome.tabs.create({ url });
    exitSelectMode();
  });
}

scanBtn.addEventListener('click', performScan);

clearBtn.addEventListener('click', async () => {
  if (confirm('Clear media for this page?')) {
    mediaData = { images: [], videos: [] };
    await saveToStorage();
    updateCounts();
    gallery.innerHTML = '<p class="placeholder">Gallery cleared. Click "Scan Page" to find media.</p>';
  }
});

autoScanToggle.addEventListener('change', async () => {
  if (autoScanToggle.checked) {
    autoScanStatus.textContent = 'Starting...';
    await chrome.runtime.sendMessage({
      action: 'startAutoScan',
      tabId: currentTabId,
      storageKey: storageKey
    });
    autoScanStatus.textContent = 'Watching...';
  } else {
    await chrome.runtime.sendMessage({
      action: 'stopAutoScan',
      tabId: currentTabId
    });
    autoScanStatus.textContent = '';
  }
});

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    if (isSelectMode) {
      exitSelectMode();
    } else {
      displayGallery();
    }
  });
});

selectBtn.addEventListener('click', enterSelectMode);
cancelSelectBtn.addEventListener('click', exitSelectMode);
playSelectedBtn.addEventListener('click', playSelected);

sortSelect.addEventListener('change', () => {
  sortOrder = sortSelect.value;
  if (isSelectMode) {
    exitSelectMode();
  } else {
    displayGallery();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'mediaUpdated' && message.storageKey === storageKey) {
    loadFromStorage(true);
  }
});

initialize();
