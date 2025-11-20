/* 08-player-overlay.js - Optimized for Tizen (low CPU)

This overlay should be initialized **when you start the player** — for example, when the user presses “Play Movie” and your Tizen AVPlay or HTML5 video begins playback.
You can call:
  `window.playerOverlay.init();`
right after your player starts. This ensures minimal CPU overhead during idle states.

Keep this file separate from your main playback logic (e.g. `08-player.js`).
That file handles playback, while this one handles UI and remote key input.

Usage:
- Include this file **after** `08-player.js` in your HTML.
- When you start a movie, call `playerOverlay.init()` once if auto init is disabled.
- Call `playerOverlay.setOverlayDetails({name, rating})` to set title/rating.
- Call `playerOverlay.updateStreamInfo({status,width,height,quality})` to update streaming info.
- `playerOverlay.showOverlay()` and `playerOverlay.hideOverlay()` control visibility.

*/

(function () {
    'use strict';
  
    // ---- Configuration ----
    const PROGRESS_RAF_MIN_MS = 250;
    const SEEK_STEP_SECONDS = 10;
    const UI_AUTOHIDE_MS = 4000;
  
    const $ = (s) => document.querySelector(s);
    const noop = () => {};
  
    function fmtTimeSec(s) {
      s = Number(s) || 0;
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }
  
    function createIfMissing() {
      const container = $('#page-player');
      if (!container) return;
  
      if (!$('#tizen-player-overlay')) {
        const top = document.createElement('div');
        top.id = 'tizen-player-overlay';
        top.className = 'tizen-overlay top';
        top.innerHTML = `
          <div class="overlay-top">
            <div class="meta-left">
              <div id="overlay-movie-name" class="title">Unknown Title</div>
              <div id="overlay-movie-rating" class="rating" aria-hidden="true"></div>
              <div id="overlay-player-type" class="player-type">[--]</div>
            </div>
            <div id="overlay-current-clock" class="clock">--:--</div>
          </div>
        `;
        container.appendChild(top);
      }
  
      if (!$('#overlay-bottom')) {
        const bottom = document.createElement('div');
        bottom.id = 'overlay-bottom';
        bottom.className = 'tizen-overlay bottom';
        bottom.innerHTML = `
          <div class="controls-left">
            <button id="btn-subtitles" class="tiny-btn">Sub</button>
            <button id="btn-audio" class="tiny-btn">Audio</button>
            <button id="btn-playpause" class="tiny-btn">Play</button>
          </div>
          <div class="controls-center">
            <div id="progress-wrapper" class="progress-wrapper">
              <div class="progress-track"><div id="progress-inner" class="progress-inner"></div></div>
              <div class="times"><span id="time-elapsed">00:00</span><span id="time-duration">00:00</span></div>
            </div>
          </div>
          <div class="controls-right">
            <div id="stream-status" class="status">Idle</div>
            <div id="stream-resolution" class="resolution">-- x --</div>
            <div id="stream-quality" class="quality">--</div>
          </div>
        `;
        container.appendChild(bottom);
      }
    }
  
    const cache = {};
    let isTizen = !!(window.webapis && window.webapis.avplay);
    let streamInfo = { status: 'Idle', width: 0, height: 0, quality: '--' };
    let overlayVisible = false;
    let rafId = null;
    let lastRafTime = 0;
    let requestedToStopRaf = false;
    let autoHideTimer = null;
    let lastProgressPct = -1;
  
    function updateClock() {
      const el = cache.clock;
      if (!el) return;
      const d = new Date();
      el.textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
  
    function startClock() {
      updateClock();
      setInterval(updateClock, 1000);
    }
  
    function updateStreamInfo(info) {
      streamInfo = Object.assign(streamInfo, info || {});
      if (cache.streamStatus) cache.streamStatus.textContent = streamInfo.status;
      if (cache.streamResolution) cache.streamResolution.textContent = `${streamInfo.width} x ${streamInfo.height}`;
      if (cache.streamQuality) cache.streamQuality.textContent = streamInfo.quality;
    }
  
    function getActivePlayer() {
      if (isTizen && window.webapis && window.webapis.avplay) {
        if (cache.playerType) cache.playerType.textContent = "[native]";
        return { type: 'tizen', obj: webapis.avplay };
      }
      
      if (v) {
          if (cache.playerType) cache.playerType.textContent = "[html5]";
          return { type: 'web', obj: v };
      }
    }
  
    function togglePlayPause() {
      const p = getActivePlayer();
      if (!p) return;
      if (p.type === 'web') {
        const v = p.obj;
        if (v.paused) { v.play().catch(noop); cache.btnPlay.textContent = 'Pause'; updateStreamInfo({ status: 'Playing' }); }
        else { v.pause(); cache.btnPlay.textContent = 'Play'; updateStreamInfo({ status: 'Paused' }); }
      } else {
        try {
          const state = webapis.avplay.getState && webapis.avplay.getState();
          if (state === 'PLAYING') { webapis.avplay.pause(); cache.btnPlay.textContent = 'Play'; updateStreamInfo({ status: 'Paused' }); }
          else { webapis.avplay.play(); cache.btnPlay.textContent = 'Pause'; updateStreamInfo({ status: 'Playing' }); }
        } catch {}
      }
      showOverlay(true);
    }
  
    function seekBy(seconds) {
      const p = getActivePlayer();
      if (!p) return;
      if (p.type === 'web') {
        const v = p.obj;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
      } else {
        try {
          const dur = webapis.avplay.getDuration();
          const cur = webapis.avplay.getCurrentTime();
          const target = Math.max(0, Math.min(dur, (cur || 0) + Math.round(seconds * 1000)));
          webapis.avplay.seekTo(target, noop, noop);
        } catch {}
      }
      showOverlay(true);
    }
  
    function updateProgressOnce() {
      const inner = cache.progressInner;
      const elapsed = cache.timeElapsed;
      const duration = cache.timeDuration;
      if (!inner || !elapsed || !duration) return;
      const p = getActivePlayer();
      if (!p) return;
  
      if (p.type === 'web') {
        const v = p.obj;
        const cur = v.currentTime || 0;
        const dur = v.duration || 0;
        const pct = dur > 0 ? Math.floor((cur / dur) * 100) : 0;
        if (pct !== lastProgressPct) { inner.style.width = pct + '%'; lastProgressPct = pct; }
        elapsed.textContent = fmtTimeSec(cur);
        duration.textContent = fmtTimeSec(dur);
      } else {
        try {
          const cur = (webapis.avplay.getCurrentTime() || 0) / 1000;
          const dur = (webapis.avplay.getDuration() || 0) / 1000;
          const pct = dur > 0 ? Math.floor((cur / dur) * 100) : 0;
          if (pct !== lastProgressPct) { inner.style.width = pct + '%'; lastProgressPct = pct; }
          elapsed.textContent = fmtTimeSec(cur);
          duration.textContent = fmtTimeSec(dur);
        } catch {}
      }
    }
  
    function progressRafLoop(ts) {
      if (!lastRafTime) lastRafTime = ts;
      if (ts - lastRafTime >= PROGRESS_RAF_MIN_MS) { lastRafTime = ts; updateProgressOnce(); }
      if (!requestedToStopRaf) rafId = requestAnimationFrame(progressRafLoop);
    }
    function startProgressUpdates() { requestedToStopRaf = false; if (!rafId) rafId = requestAnimationFrame(progressRafLoop); }
    function stopProgressUpdates() { requestedToStopRaf = true; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
  
    function showOverlay(autoHide = true) {
      if (!cache.top || !cache.bottom) return;
      cache.top.classList.add('visible');
      cache.bottom.classList.add('visible');
      overlayVisible = true;
      startProgressUpdates();
      if (autoHide) {
        if (autoHideTimer) clearTimeout(autoHideTimer);
        autoHideTimer = setTimeout(hideOverlay, UI_AUTOHIDE_MS);
      }
    }
    function hideOverlay() {
      if (!cache.top || !cache.bottom) return;
      cache.top.classList.remove('visible');
      cache.bottom.classList.remove('visible');
      overlayVisible = false;
      stopProgressUpdates();
    }
  
    function setOverlayDetails(o) {
      if (!o) return;
      if (cache.title) cache.title.textContent = o.name || 'Unknown Title';
      if (cache.rating) {
        if (o.rating) { cache.rating.style.display = 'block'; cache.rating.textContent = `Rating: ${Number(o.rating).toFixed(1)}`; }
        else cache.rating.style.display = 'none';
      }
    }
  
    function init() {
      createIfMissing();
      cache.top = $('#tizen-player-overlay');
      cache.bottom = $('#overlay-bottom');
      cache.btnPlay = $('#btn-playpause');
      cache.btnSub = $('#btn-subtitles');
      cache.btnAudio = $('#btn-audio');
      cache.progressWrapper = $('#progress-wrapper');
      cache.progressInner = $('#progress-inner');
      cache.timeElapsed = $('#time-elapsed');
      cache.timeDuration = $('#time-duration');
      cache.clock = $('#overlay-current-clock');
      cache.title = $('#overlay-movie-name');
      cache.rating = $('#overlay-movie-rating');
      cache.playerType = $('#overlay-player-type');
      cache.streamStatus = $('#stream-status');
      cache.streamResolution = $('#stream-resolution');
      cache.streamQuality = $('#stream-quality');
  
      startClock();
  
      if (cache.btnPlay) cache.btnPlay.addEventListener('click', togglePlayPause);
  
      document.addEventListener('keydown', (e) => {
        switch (e.key) {
          case 'MediaPlayPause': togglePlayPause(); break;
          case 'ArrowLeft': seekBy(-SEEK_STEP_SECONDS); break;
          case 'ArrowRight': seekBy(SEEK_STEP_SECONDS); break;
          case 'Enter': togglePlayPause(); break;
          case 'Escape': hideOverlay(); break;
        }
      });
  
      hideOverlay();
    }

    
  
    window.playerOverlay = { init, showOverlay, hideOverlay, setOverlayDetails, updateStreamInfo };
  })();
  