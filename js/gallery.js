let items = [];
let currentIndex = 0;
let currentFilter = 'all';
let isPlaying = false;
let slideshowTimer = null;
let countdownTimer = null;
let countdownValue = 0;
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

const content = document.getElementById('content');
const counter = document.getElementById('counter');
const mediaType = document.getElementById('mediaType');
const openUrl = document.getElementById('openUrl');
const urlDisplay = document.getElementById('urlDisplay');
const copyUrl = document.getElementById('copyUrl');
const downloadBtn = document.getElementById('downloadBtn');
const closeBtn = document.getElementById('closeBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const thumbStrip = document.getElementById('thumbStrip');
const playBtn = document.getElementById('playBtn');
const slideInterval = document.getElementById('slideInterval');
const countdown = document.getElementById('countdown');

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    key: params.get('key'),
    index: parseInt(params.get('index') || '0', 10),
    filter: params.get('filter') || 'all',
    sort: params.get('sort') || 'asc',
    isTemp: params.get('temp') === '1'
  };
}

async function loadMedia() {
  const { key, index, filter, sort, isTemp } = getParams();
  currentFilter = filter;
  currentIndex = index;

  if (!key) {
    showError('No media key provided');
    return;
  }

  try {
    const result = await chrome.storage.local.get([key]);
    const mediaData = result[key];

    if (!mediaData) {
      showError('No media found for this page');
      return;
    }

    if (isTemp) {
      chrome.storage.local.remove([key]);
    }

    items = [];
    if (filter === 'all') {
      mediaData.images.forEach((src, idx) => {
        const order = mediaData.imageOrder?.[idx] ?? idx;
        items.push({ src, type: 'image', order });
      });
      mediaData.videos.forEach((src, idx) => {
        const order = mediaData.videoOrder?.[idx] ?? (mediaData.images.length + idx);
        items.push({ src, type: 'video', order });
      });
      items.sort((a, b) => a.order - b.order);
    } else if (filter === 'images') {
      mediaData.images.forEach(src => items.push({ src, type: 'image' }));
    } else if (filter === 'videos') {
      mediaData.videos.forEach(src => items.push({ src, type: 'video' }));
    }

    if (sort === 'desc') {
      items.reverse();
    }

    if (items.length === 0) {
      showError('No media items found');
      return;
    }

    if (currentIndex >= items.length) {
      currentIndex = 0;
    }

    renderThumbnails();
    showItem(currentIndex);

  } catch (error) {
    showError('Error loading media: ' + error.message);
  }
}

function showError(message) {
  content.innerHTML = `<div class="error">${message}<a href="#" id="goBack">← Go back</a></div>`;
  document.getElementById('goBack')?.addEventListener('click', () => window.close());
}

function showItem(index) {
  if (items.length === 0) return;

  if (index < 0) {
    index = items.length - 1;
  } else if (index >= items.length) {
    index = 0;
  }

  currentIndex = index;
  const item = items[index];
  const isVideo = item.type === 'video';
  const isEmbed = isVideo && (item.src.includes('youtube.com') || item.src.includes('vimeo.com'));

  counter.textContent = `${index + 1} / ${items.length}`;
  mediaType.textContent = isVideo ? 'VIDEO' : 'IMAGE';
  mediaType.className = 'media-type' + (isVideo ? ' video' : '');

  openUrl.href = item.src;
  urlDisplay.href = item.src;
  urlDisplay.textContent = item.src;

  if (isEmbed) {
    let embedSrc = item.src;
    if (item.src.includes('youtube.com/watch')) {
      const videoId = new URL(item.src).searchParams.get('v');
      embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    } else if (item.src.includes('youtube.com/embed')) {
      embedSrc = item.src + (item.src.includes('?') ? '&' : '?') + 'autoplay=1';
    }
    content.innerHTML = `<iframe src="${embedSrc}" allowfullscreen allow="autoplay"></iframe>`;
  } else if (isVideo) {
    content.innerHTML = `<video src="${item.src}" controls autoplay></video>`;
    const video = content.querySelector('video');
    video.play().catch(() => {});
  } else {
    content.innerHTML = `<img src="${item.src}" alt="Image ${index + 1}">`;
  }

  prevBtn.style.display = 'block';
  nextBtn.style.display = 'block';

  document.querySelectorAll('.thumb').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === index);
  });

  const activeThumb = thumbStrip.children[index];
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  document.title = `${index + 1}/${items.length} - GalleryMe`;
}

function renderThumbnails() {
  thumbStrip.innerHTML = '';

  items.forEach((item, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb' + (index === currentIndex ? ' active' : '');

    const isVideo = item.type === 'video';
    const isEmbed = isVideo && (item.src.includes('youtube.com') || item.src.includes('vimeo.com'));
    const badge = isVideo ? 'V' : 'I';

    if (isEmbed) {
      thumb.className += ' thumb-video';
      thumb.innerHTML = `▶<span class="thumb-badge">${badge}</span>`;
    } else if (isVideo) {
      thumb.innerHTML = `<video src="${item.src}" muted preload="metadata"></video><span class="thumb-badge">${badge}</span>`;
    } else {
      thumb.innerHTML = `<img src="${item.src}" alt="Thumb ${index + 1}" loading="lazy" decoding="async"><span class="thumb-badge">${badge}</span>`;
    }

    thumb.addEventListener('click', () => {
      showItem(index);
      if (isPlaying) {
        stopSlideshow();
      }
    });
    thumbStrip.appendChild(thumb);
  });
}

function navigate(direction) {
  let newIndex = currentIndex + direction;

  if (newIndex < 0) {
    newIndex = items.length - 1;
  } else if (newIndex >= items.length) {
    newIndex = 0;
  }

  showItem(newIndex);
}

function updateCountdown() {
  if (countdownValue > 0) {
    countdown.textContent = countdownValue;
    countdown.classList.add('visible');
  } else {
    countdown.textContent = '';
    countdown.classList.remove('visible');
  }
}

function startSlideshow() {
  if (items.length <= 1) return;

  isPlaying = true;
  playBtn.textContent = '⏸ Pause';
  playBtn.classList.add('playing');

  const intervalSecs = parseInt(slideInterval.value, 10) || 3;
  countdownValue = intervalSecs;
  updateCountdown();

  countdownTimer = setInterval(() => {
    countdownValue--;
    updateCountdown();
  }, 1000);

  slideshowTimer = setInterval(() => {
    navigate(1);
    countdownValue = intervalSecs;
    updateCountdown();
  }, intervalSecs * 1000);
}

function stopSlideshow() {
  isPlaying = false;
  playBtn.textContent = '▶ Play';
  playBtn.classList.remove('playing');

  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  countdownValue = 0;
  updateCountdown();
}

function resetSlideshowTimer() {
  if (!isPlaying) return;

  const intervalSecs = parseInt(slideInterval.value, 10) || 3;
  countdownValue = intervalSecs;
  updateCountdown();

  if (slideshowTimer) clearInterval(slideshowTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  countdownTimer = setInterval(() => {
    countdownValue--;
    updateCountdown();
  }, 1000);

  slideshowTimer = setInterval(() => {
    navigate(1);
    countdownValue = intervalSecs;
    updateCountdown();
  }, intervalSecs * 1000);
}

function toggleSlideshow() {
  if (isPlaying) {
    stopSlideshow();
  } else {
    startSlideshow();
  }
}

async function copyUrlToClipboard() {
  const item = items[currentIndex];
  if (!item) return;

  try {
    await navigator.clipboard.writeText(item.src);
    copyUrl.textContent = 'Copied!';
    copyUrl.classList.add('copied');
    setTimeout(() => {
      copyUrl.textContent = 'Copy';
      copyUrl.classList.remove('copied');
    }, 2000);
  } catch (err) {}
}

function downloadItem() {
  const item = items[currentIndex];
  if (!item) return;

  const a = document.createElement('a');
  a.href = item.src;
  a.download = item.src.split('/').pop() || 'download';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

prevBtn.addEventListener('click', () => {
  navigate(-1);
  resetSlideshowTimer();
});

nextBtn.addEventListener('click', () => {
  navigate(1);
  resetSlideshowTimer();
});

playBtn.addEventListener('click', toggleSlideshow);

slideInterval.addEventListener('change', () => {
  if (isPlaying) {
    stopSlideshow();
    startSlideshow();
  }
});

copyUrl.addEventListener('click', copyUrlToClipboard);
downloadBtn.addEventListener('click', downloadItem);
closeBtn.addEventListener('click', () => window.close());

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft':
      navigate(-1);
      resetSlideshowTimer();
      break;
    case 'ArrowRight':
      navigate(1);
      resetSlideshowTimer();
      break;
    case 'Escape':
      window.close();
      break;
    case 'Home':
      showItem(0);
      resetSlideshowTimer();
      break;
    case 'End':
      showItem(items.length - 1);
      resetSlideshowTimer();
      break;
    case ' ':
      e.preventDefault();
      toggleSlideshow();
      break;
    case 'r':
    case 'R':
      resetZoom();
      break;
  }
});

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  applyZoom();
}

function applyZoom() {
  const img = content.querySelector('img');
  if (!img) return;

  if (zoomLevel === 1) {
    img.style.transform = '';
    img.style.cursor = 'default';
    content.classList.remove('zoomed');
  } else {
    img.style.transform = `scale(${zoomLevel}) translate(${panX}px, ${panY}px)`;
    img.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
    content.classList.add('zoomed');
  }
}

function handleZoom(e) {
  const img = content.querySelector('img');
  if (!img) return;

  e.preventDefault();

  const delta = e.deltaY > 0 ? -0.2 : 0.2;
  const newZoom = Math.max(1, Math.min(5, zoomLevel + delta));

  if (newZoom <= 1) {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
  } else {
    const rect = img.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    const imgPointX = mouseX / zoomLevel - panX;
    const imgPointY = mouseY / zoomLevel - panY;

    panX = mouseX / newZoom - imgPointX;
    panY = mouseY / newZoom - imgPointY;

    zoomLevel = newZoom;
  }

  applyZoom();
}

function handleMouseDown(e) {
  if (zoomLevel <= 1) return;
  const img = content.querySelector('img');
  if (!img || e.target !== img) return;

  isDragging = true;
  dragStartX = e.clientX - panX;
  dragStartY = e.clientY - panY;
  img.style.cursor = 'grabbing';
  e.preventDefault();
}

function handleMouseMove(e) {
  if (!isDragging) return;

  panX = e.clientX - dragStartX;
  panY = e.clientY - dragStartY;
  applyZoom();
}

function handleMouseUp() {
  if (!isDragging) return;
  isDragging = false;

  const img = content.querySelector('img');
  if (img) {
    img.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
  }
}

content.addEventListener('wheel', handleZoom, { passive: false });
content.addEventListener('mousedown', handleMouseDown);
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp);

const originalShowItem = showItem;
showItem = function(index) {
  resetZoom();
  originalShowItem(index);
};

window.addEventListener('beforeunload', cleanup);

function cleanup() {
  stopSlideshow();
  content.removeEventListener('wheel', handleZoom);
  content.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  items = [];
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  isDragging = false;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPlaying) {
    stopSlideshow();
  }
});

loadMedia();
