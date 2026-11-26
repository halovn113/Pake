// Optional video Picture-in-Picture control for WebAppEz apps.
(() => {
  if (window.top !== window || !document.pictureInPictureEnabled) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4.5" width="19" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><rect x="12" y="11" width="7" height="5.5" rx=".8" fill="currentColor"/></svg>'; 
  button.title = 'Picture-in-Picture';
  button.setAttribute('aria-label', 'Picture-in-Picture');
  Object.assign(button.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', padding: '6px', border: '1px solid #aaa', borderRadius: '8px', background: '#222', color: '#fff', cursor: 'pointer', lineHeight: '0', display: 'none' });
  const findVideo = () => {
    const videos = Array.from(document.querySelectorAll('video')).filter((video) => video.readyState > 0 && !video.disablePictureInPicture && typeof video.requestPictureInPicture === 'function');
    return videos.find((video) => !video.paused && !video.ended) || videos.find((video) => !video.ended);
  };
  let pointer = null;
  const refresh = () => {
    const video = findVideo();
    if (document.pictureInPictureElement) { button.style.display = 'block'; return; }
    if (!video || !pointer || typeof video.getBoundingClientRect !== 'function') { button.style.display = 'none'; return; }
    const rect = video.getBoundingClientRect();
    const overVideo = rect.width > 0 && rect.height > 0 && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
    if (!overVideo && pointer.target !== button) { button.style.display = 'none'; return; }
    button.style.left = `${Math.max(0, Math.min(window.innerWidth - 55, rect.right - 60))}px`;
    button.style.top = `${Math.max(0, rect.top + 8)}px`;
    button.style.right = 'auto'; button.style.bottom = 'auto'; button.style.display = 'block';
  };
  let refreshPending = false;
  const scheduleRefresh = () => { if (refreshPending) return; refreshPending = true; requestAnimationFrame(() => { refreshPending = false; refresh(); }); };
  button.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const video = findVideo();
    const reportError = (error) => { console.error('Picture-in-Picture failed:', error); window.pakeToast?.('Picture-in-Picture is unavailable for this video.'); };
    try {
      const action = document.pictureInPictureElement ? document.exitPictureInPicture() : video?.requestPictureInPicture();
      if (action) Promise.resolve(action).catch(reportError);
    } catch (error) { reportError(error); }
  });
  document.addEventListener('pointermove', (event) => { pointer = { x: event.clientX, y: event.clientY, target: event.target }; scheduleRefresh(); }, true);
  document.addEventListener('play', refresh, true);
  document.addEventListener('loadedmetadata', refresh, true);
  document.addEventListener('emptied', refresh, true);
  document.addEventListener('ended', refresh, true);
  document.addEventListener('enterpictureinpicture', refresh, true);
  document.addEventListener('leavepictureinpicture', refresh, true);
  document.body.appendChild(button);
  new MutationObserver(scheduleRefresh).observe(document.body, { childList: true, subtree: true });
  refresh();
})();
