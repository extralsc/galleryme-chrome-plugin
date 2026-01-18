let observer = null;
let isObserving = false;
let storageKey = null;
let debounceTimer = null;
const urlCache = new Map();

const THUMB_PATTERNS = [
  /([_-])[sSmMtT](\.[a-zA-Z]{3,4})$/,
  /(\d)[sSmMtTlL](\.[a-zA-Z]{3,4})$/,
  /[_-](thumb|thumbnail|small|medium|sm|md|xs|mini|preview|icon)(\.[a-zA-Z]{3,4})$/i,
  /[_-]\d{2,4}x\d{2,4}(\.[a-zA-Z]{3,4})$/,
  /[_-][wh]?\d{2,4}[wh]?(\.[a-zA-Z]{3,4})$/,
  /\/(thumb|thumbs|thumbnail|thumbnails|small|medium|sm|md|preview|icons?)\//i,
];

const SIZE_PARAMS = ['w', 'h', 'width', 'height', 'size', 'sz', 's', 'resize', 'fit', 'thumb', 'quality', 'q'];
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v|ogv|3gp)(\?.*)?$/i;

function getStorageKey() {
  const url = window.location.href;
  try {
    const urlObj = new URL(url);
    return `media_${urlObj.origin}${urlObj.pathname}`;
  } catch {
    return `media_${url}`;
  }
}

function getCandidateUrls(thumbUrl) {
  if (!thumbUrl) return [thumbUrl];
  const candidates = [];

  try {
    const urlObj = new URL(thumbUrl);
    let pathname = urlObj.pathname;

    if (urlObj.search) {
      const withoutQuery = new URL(thumbUrl);
      withoutQuery.search = '';
      candidates.push(withoutQuery.toString());
    }

    const singleLetterMatch = pathname.match(/^(.+?)([_-])([sSmMtT])(\.[a-zA-Z]{3,4})$/);
    if (singleLetterMatch) {
      const withoutLetter = new URL(thumbUrl);
      withoutLetter.pathname = singleLetterMatch[1] + singleLetterMatch[4];
      candidates.push(withoutLetter.toString());

      const withL = new URL(thumbUrl);
      withL.pathname = singleLetterMatch[1] + singleLetterMatch[2] + 'l' + singleLetterMatch[4];
      candidates.push(withL.toString());

      const withO = new URL(thumbUrl);
      withO.pathname = singleLetterMatch[1] + singleLetterMatch[2] + 'o' + singleLetterMatch[4];
      candidates.push(withO.toString());
    }

    const digitLetterMatch = pathname.match(/^(.+?\d)([sSmMtTlL])(\.[a-zA-Z]{3,4})$/);
    if (digitLetterMatch) {
      const withoutLetter = new URL(thumbUrl);
      withoutLetter.pathname = digitLetterMatch[1] + digitLetterMatch[3];
      candidates.push(withoutLetter.toString());

      if (/[sSmMtT]/.test(digitLetterMatch[2])) {
        const withL = new URL(thumbUrl);
        withL.pathname = digitLetterMatch[1] + 'l' + digitLetterMatch[3];
        candidates.push(withL.toString());
      }
    }

    const withoutParams = new URL(thumbUrl);
    let hadParams = false;
    SIZE_PARAMS.forEach(param => {
      if (withoutParams.searchParams.has(param)) {
        withoutParams.searchParams.delete(param);
        hadParams = true;
      }
    });
    if (hadParams) {
      candidates.push(withoutParams.toString());
    }

    const thumbSuffixMatch = pathname.match(/^(.+?)[_-](thumb|thumbnail|small|medium|sm|md|preview)(\.[a-zA-Z]{3,4})$/i);
    if (thumbSuffixMatch) {
      const cleaned = new URL(thumbUrl);
      cleaned.pathname = thumbSuffixMatch[1] + thumbSuffixMatch[3];
      candidates.push(cleaned.toString());
    }

    const dimMatch = pathname.match(/^(.+?)[_-]\d{2,4}x\d{2,4}(\.[a-zA-Z]{3,4})$/);
    if (dimMatch) {
      const cleaned = new URL(thumbUrl);
      cleaned.pathname = dimMatch[1] + dimMatch[2];
      candidates.push(cleaned.toString());
    }

    const pathSegments = ['thumb', 'thumbs', 'thumbnail', 'thumbnails', 'small', 'medium', 'sm', 'md', 'preview'];
    for (const seg of pathSegments) {
      const regex = new RegExp(`/${seg}/`, 'i');
      if (regex.test(pathname)) {
        for (const replacement of ['', 'images/', 'full/', 'large/', 'original/']) {
          const cleaned = new URL(thumbUrl);
          cleaned.pathname = pathname.replace(regex, '/' + replacement);
          candidates.push(cleaned.toString());
        }
      }
    }
  } catch (e) {}

  candidates.push(thumbUrl);
  return [...new Set(candidates)];
}

function isThumbnailUrl(url) {
  if (!url) return false;
  return THUMB_PATTERNS.some(pattern => pattern.test(url));
}

async function findBestUrl(originalUrl) {
  if (urlCache.has(originalUrl)) {
    return urlCache.get(originalUrl);
  }

  if (!isThumbnailUrl(originalUrl)) {
    urlCache.set(originalUrl, originalUrl);
    return originalUrl;
  }

  const candidates = getCandidateUrls(originalUrl);

  for (let i = 0; i < candidates.length - 1; i++) {
    const candidate = candidates[i];
    if (candidate !== originalUrl) {
      try {
        const response = await fetch(candidate, { method: 'HEAD' });
        if (response.ok) {
          urlCache.set(originalUrl, candidate);
          return candidate;
        }
      } catch {}
    }
  }

  urlCache.set(originalUrl, originalUrl);
  return originalUrl;
}

function getBestImageUrlSync(img) {
  const candidates = [];

  const parentLink = img.closest('a');
  if (parentLink) {
    const href = parentLink.href;
    if (href && /\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?.*)?$/i.test(href)) {
      candidates.push({ url: href, priority: 10 });
    }
  }

  const dataAttrs = [
    'data-src', 'data-original', 'data-full', 'data-large', 'data-lg',
    'data-zoom', 'data-zoom-src', 'data-big', 'data-hires', 'data-hi-res',
    'data-fullsize', 'data-full-src', 'data-image', 'data-lazy',
    'data-srcset', 'data-lazy-src', 'data-original-src'
  ];

  for (const attr of dataAttrs) {
    const value = img.getAttribute(attr);
    if (value && value.startsWith('http')) {
      const priority = attr.includes('original') || attr.includes('full') || attr.includes('large') ? 9 : 7;
      candidates.push({ url: value, priority });
    }
  }

  const srcset = img.srcset || img.getAttribute('data-srcset');
  if (srcset) {
    const srcsetUrls = srcset.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      const url = parts[0];
      const size = parts[1] ? parseInt(parts[1]) : 0;
      return { url, size };
    }).sort((a, b) => b.size - a.size);

    if (srcsetUrls.length > 0 && srcsetUrls[0].url) {
      candidates.push({ url: srcsetUrls[0].url, priority: 8 });
    }
  }

  const src = img.src;
  if (src && !src.startsWith('data:')) {
    candidates.push({ url: src, priority: 5 });
  }

  candidates.sort((a, b) => b.priority - a.priority);

  for (const candidate of candidates) {
    if (candidate.url && candidate.url.startsWith('http')) {
      return candidate.url;
    }
  }

  return src;
}

function extractMediaSync() {
  const images = new Set();
  const videos = new Set();

  document.querySelectorAll('img').forEach(img => {
    const bestUrl = getBestImageUrlSync(img);
    if (bestUrl && !bestUrl.startsWith('data:') && bestUrl.startsWith('http')) {
      if (img.naturalWidth > 50 || img.width > 50 || !img.complete) {
        images.add(bestUrl);
      }
    }
  });

  document.querySelectorAll('picture').forEach(picture => {
    const img = picture.querySelector('img');
    if (img) {
      const bestUrl = getBestImageUrlSync(img);
      if (bestUrl && bestUrl.startsWith('http')) {
        images.add(bestUrl);
      }
    }

    const sources = picture.querySelectorAll('source');
    let largest = null;
    let largestSize = 0;

    sources.forEach(source => {
      const srcset = source.srcset;
      if (srcset) {
        const parts = srcset.split(',').map(s => {
          const p = s.trim().split(/\s+/);
          return { url: p[0], size: parseInt(p[1]) || 0 };
        });
        parts.forEach(p => {
          if (p.size > largestSize) {
            largestSize = p.size;
            largest = p.url;
          }
        });
      }
    });

    if (largest) images.add(largest);
  });

  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const match = bgImage.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1] && match[1].startsWith('http')) {
        images.add(match[1]);
      }
    }
  });

  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    if (href && /\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(href)) {
      const img = a.querySelector('img');
      if (img) {
        images.add(href);
        images.delete(img.src);
      }
    }
  });

  document.querySelectorAll('video').forEach(video => {
    if (video.src && video.src.startsWith('http')) {
      videos.add(video.src);
    }
    video.querySelectorAll('source').forEach(source => {
      if (source.src && source.src.startsWith('http')) {
        videos.add(source.src);
      }
    });
    const videoDataAttrs = ['data-src', 'data-video', 'data-video-src', 'data-url', 'data-source'];
    videoDataAttrs.forEach(attr => {
      const val = video.getAttribute(attr);
      if (val && val.startsWith('http')) {
        videos.add(val);
      }
    });
  });

  document.querySelectorAll('iframe').forEach(iframe => {
    const src = iframe.src;
    if (src && (src.includes('youtube.com') || src.includes('youtu.be') ||
        src.includes('vimeo.com') || src.includes('dailymotion.com') ||
        src.includes('twitch.tv') || src.includes('streamable.com') ||
        src.includes('gfycat.com') || src.includes('redgifs.com'))) {
      videos.add(src);
    }
  });

  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    if (href && VIDEO_EXTENSIONS.test(href)) {
      videos.add(href);
    }
  });

  document.querySelectorAll('[data-video], [data-video-src], [data-video-url], [data-src], [data-mp4], [data-webm]').forEach(el => {
    const attrs = ['data-video', 'data-video-src', 'data-video-url', 'data-src', 'data-mp4', 'data-webm'];
    attrs.forEach(attr => {
      const val = el.getAttribute(attr);
      if (val && val.startsWith('http') && VIDEO_EXTENSIONS.test(val)) {
        videos.add(val);
      }
    });
  });

  document.querySelectorAll('source[src]').forEach(source => {
    const src = source.src;
    const type = source.type || '';
    if (src && src.startsWith('http') && (VIDEO_EXTENSIONS.test(src) || type.startsWith('video/'))) {
      videos.add(src);
    }
  });

  document.querySelectorAll('object[data], embed[src]').forEach(el => {
    const src = el.data || el.src;
    if (src && src.startsWith('http') && VIDEO_EXTENSIONS.test(src)) {
      videos.add(src);
    }
  });

  document.querySelectorAll('*').forEach(el => {
    if (el.tagName === 'SCRIPT' && el.type === 'application/ld+json') {
      try {
        const data = JSON.parse(el.textContent);
        findVideosInObject(data, videos);
      } catch (e) {}
    }
  });

  return {
    images: Array.from(images),
    videos: Array.from(videos)
  };
}

function findVideosInObject(obj, videos) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => findVideosInObject(item, videos));
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.startsWith('http')) {
      if (VIDEO_EXTENSIONS.test(value) ||
          key.toLowerCase().includes('video') ||
          key === 'contentUrl' ||
          key === 'embedUrl') {
        videos.add(value);
      }
    } else if (typeof value === 'object') {
      findVideosInObject(value, videos);
    }
  }
}

async function validateAndUpgradeUrls(media) {
  const upgradedImages = [];
  const batchSize = 5;

  for (let i = 0; i < media.images.length; i += batchSize) {
    const batch = media.images.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(url => findBestUrl(url)));
    upgradedImages.push(...results);
  }

  return {
    images: [...new Set(upgradedImages)],
    videos: media.videos
  };
}

async function saveMedia(media, validate = false) {
  storageKey = getStorageKey();
  let finalMedia = media;

  if (validate) {
    finalMedia = await validateAndUpgradeUrls(media);
  }

  const result = await chrome.storage.local.get([storageKey]);
  const existing = result[storageKey] || { images: [], videos: [], imageOrder: [], videoOrder: [] };

  if (!existing.imageOrder) existing.imageOrder = [];
  if (!existing.videoOrder) existing.videoOrder = [];

  let maxOrder = Math.max(0, ...existing.imageOrder, ...existing.videoOrder);
  let hasNew = false;

  finalMedia.images.forEach(src => {
    if (!existing.images.includes(src)) {
      existing.images.push(src);
      existing.imageOrder.push(++maxOrder);
      hasNew = true;
    }
  });

  finalMedia.videos.forEach(src => {
    if (!existing.videos.includes(src)) {
      existing.videos.push(src);
      existing.videoOrder.push(++maxOrder);
      hasNew = true;
    }
  });

  if (hasNew) {
    await chrome.storage.local.set({ [storageKey]: existing });
    chrome.runtime.sendMessage({
      action: 'mediaFound',
      storageKey: storageKey,
      count: existing.images.length + existing.videos.length
    });
  }

  return existing;
}

function debouncedScan() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(async () => {
    const media = extractMediaSync();
    await saveMedia(media, false);
  }, 500);
}

function startObserver() {
  if (isObserving) return;

  observer = new MutationObserver((mutations) => {
    let hasMediaChanges = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG' || node.tagName === 'VIDEO' ||
                node.tagName === 'IFRAME' || node.tagName === 'PICTURE' ||
                node.querySelector?.('img, video, iframe, picture')) {
              hasMediaChanges = true;
            }
          }
        });
      } else if (mutation.type === 'attributes') {
        if (['src', 'srcset', 'data-src', 'style', 'data-original'].includes(mutation.attributeName)) {
          hasMediaChanges = true;
        }
      }
    }

    if (hasMediaChanges) {
      debouncedScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'data-src', 'style', 'data-original', 'data-full']
  });

  isObserving = true;
  debouncedScan();
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isObserving = false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scan') {
    (async () => {
      const media = extractMediaSync();
      const validated = await validateAndUpgradeUrls(media);
      sendResponse({ media: validated });
    })();
    return true;
  }

  if (message.action === 'startObserver') {
    storageKey = message.storageKey;
    startObserver();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'stopObserver') {
    stopObserver();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getStatus') {
    sendResponse({ observing: isObserving });
    return true;
  }
});

chrome.runtime.sendMessage({ action: 'checkAutoScan' }, (response) => {
  if (response?.shouldObserve) {
    storageKey = response.storageKey;
    startObserver();
  }
});

window.addEventListener('beforeunload', () => {
  stopObserver();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  urlCache.clear();
});
