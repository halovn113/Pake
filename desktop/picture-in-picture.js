// Optional video Picture-in-Picture control for WebAppMaker apps.
(() => {
  if (window.top !== window || !document.pictureInPictureEnabled) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'PiP';
  button.title = 'Picture-in-Picture';
  button.setAttribute('aria-label', 'Picture-in-Picture');
  Object.assign(button.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647', padding: '8px 12px', border: '1px solid #aaa', borderRadius: '8px', background: '#222', color: '#fff', cursor: 'pointer', display: 'none' });
  const findVideo = () => {
    const videos = Array.from(document.querySelectorAll('video')).filter((video) => video.readyState > 0 && !video.disablePictureInPicture && typeof video.requestPictureInPicture === 'function');
    return videos.find((video) => !video.paused && !video.ended) || videos.find((video) => !video.ended);
  };
  const refresh = () => { button.style.display = (document.pictureInPictureElement || findVideo()) ? 'block' : 'none'; };
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
