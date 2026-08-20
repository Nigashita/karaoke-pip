(() => {
  'use strict';

  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.info('[KaraokePiP]', ...a); };

  const BTN_ID = 'kp-lyrics-btn';
  const PILL_ID = 'kp-launcher';
  const MODE_KEY = 'kp:romanMode';
  const OFFSET_PREFIX = 'kp:offset:';
  const MODES = ['off', 'roman', 'both'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  for (const [name, ref] of [
    ['KaraokeLRC', typeof KaraokeLRC],
    ['KaraokeMeta', typeof KaraokeMeta],
    ['KaraokePiPUI', typeof KaraokePiPUI]
  ]) {
    if (ref === 'undefined') {
      console.error(`[KaraokePiP] ${name} is missing — check src/ file order in the manifest.`);
      return;
    }
  }
  if (window.__kpBooted) return;
  window.__kpBooted = true;

  const state = {
    pip: null, ui: null, video: null,
    lines: [], romanLines: null, view: [], romanUsable: false,
    synced: false, lang: null, videoId: '',
    index: -2, offset: 0, roman: 'off', raf: 0, token: 0
  };

  const getVideo = () =>
    document.querySelector('video.html5-main-video') || document.querySelector('video');

  const getVideoId = () =>
    new URLSearchParams(location.search).get('v') ||
    new URLSearchParams(location.search).get('list') ||
    location.pathname;

  function micIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const paths = [
      'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z',
      'M17.6 11.4v.6a5.6 5.6 0 0 1-11.2 0v-.6H4.6v.6a7.4 7.4 0 0 0 6.5 7.35V21H8.4v1.8h7.2V21h-2.7v-2.05a7.4 7.4 0 0 0 6.5-7.35v-.6z'
    ];
    for (const d of paths) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }

  const controlsHost = () =>
    document.querySelector('.ytp-right-controls') ||
    document.querySelector('ytmusic-player-bar .right-controls');

  function injectButton() {
    if (document.getElementById(BTN_ID)) return true;
    const host = controlsHost();
    if (!host) return false;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'ytp-button kp-btn-yt';
    btn.type = 'button';
    btn.title = 'Karaoke lyrics (Picture-in-Picture)';
    btn.setAttribute('aria-label', 'Karaoke lyrics');
    btn.appendChild(micIcon());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    host.prepend(btn);
    if (state.pip) btn.classList.add('kp-on');
    return true;
  }

  setInterval(injectButton, 1000);
  injectButton();

  function showLauncher(pulse) {
    let pill = document.getElementById(PILL_ID);
    if (!pill) {
      pill = document.createElement('div');
      pill.id = PILL_ID;
      pill.setAttribute('role', 'button');
      pill.tabIndex = 0;
      pill.textContent = 'Open lyrics';
      const fire = () => { pill.remove(); toggle(); };
      pill.addEventListener('click', fire);
      pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
      });
      document.body.appendChild(pill);
    }
    pill.classList.toggle('kp-pulse', !!pulse);
    return pill;
  }

  setTimeout(() => {
    if (!document.getElementById(BTN_ID) && getVideo()) showLauncher(false);
  }, 8000);

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type !== 'KP_TOGGLE') return;
    toggle(true);
    respond({ ok: true });
  });

  async function toggle(fromToolbar) {
    if (state.pip) { state.pip.close(); return; }

    if (!('documentPictureInPicture' in window)) {
      toast('Document Picture-in-Picture isn\u2019t available here. ' +
            'Chrome/Brave 116+ required; on Brave check ' +
            'brave://flags/#document-picture-in-picture-api');
      return;
    }

    let pip;
    try {
      pip = await documentPictureInPicture.requestWindow({
        width: 420, height: 560, disallowReturnToOpener: true
      });
    } catch (err) {
      if (fromToolbar && err.name === 'NotAllowedError') {
        toast('Click \u201cOpen lyrics\u201d to start the window.');
        showLauncher(true);
      } else {
        toast(`Couldn't open the lyrics window: ${err.message}`);
      }
      return;
    }

    state.pip = pip;
    state.ui = KaraokePiPUI.mount(pip, {
      onOffset: (d) => setOffset(state.offset + d),
      onMode: cycleMode
    });

    document.getElementById(BTN_ID)?.classList.add('kp-on');
    document.getElementById(PILL_ID)?.remove();
    pip.addEventListener('pagehide', teardown, { once: true });
    bindKeys(pip);

    const stored = await chrome.storage.local.get(MODE_KEY);
    state.roman = stored[MODE_KEY] || 'off';

    startLoop();
    load();
  }

  function teardown() {
    if (state.raf && state.pip) state.pip.cancelAnimationFrame(state.raf);
    state.ui?.destroy();
    state.raf = 0;
    state.pip = null;
    state.ui = null;
    state.lines = [];
    state.romanLines = null;
    state.view = [];
    state.lang = null;
    state.index = -2;
    document.getElementById(BTN_ID)?.classList.remove('kp-on');
  }

  async function loadOffset(id) {
    const key = OFFSET_PREFIX + id;
    const stored = await chrome.storage.local.get(key);
    state.offset = stored[key] || 0;
    state.ui?.setOffset(state.offset);
  }

  function applyMode() {
    const mode = state.romanUsable ? state.roman : 'off';
    state.view = (mode === 'roman' && state.romanLines)
      ? state.romanLines
      : state.lines;
    state.ui.setMode(state.romanUsable, mode);
    state.ui.setLines(state.view, state.synced, mode);
    state.index = -2;
  }

  async function load() {
    if (!state.pip) return;

    state.video = getVideo();
    if (!state.video) {
      state.ui.setStatus('No video element found on this page.', true);
      return;
    }

    state.videoId = getVideoId();
    await loadOffset(state.videoId);

    const meta = KaraokeMeta.getNowPlaying(state.video);
    meta.videoId = state.videoId;
    const token = ++state.token;
    log('looking up', meta);

    state.lines = [];
    state.romanLines = null;
    state.view = [];
    state.romanUsable = false;
    state.synced = false;
    state.lang = null;
    state.index = -2;
    state.ui.setMode(false, state.roman);
    state.ui.setLines([], false, state.roman);
    state.ui.setMeta(meta.track, meta.artist);
    state.ui.setStatus('Searching LRCLIB\u2026');

    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'KP_FETCH_LYRICS', payload: meta });
    } catch (err) {
      res = { ok: false, error: `background worker didn't respond (${err.message})` };
    }

    if (token !== state.token || !state.pip) return;

    if (!res?.ok) {
      state.ui.setStatus(`Lyrics unavailable \u2014 ${res?.error || 'request failed'}`, true);
      return;
    }

    const d = res.data;
    if (!d.found) {
      state.ui.setStatus(`No match on LRCLIB for \u201c${meta.track}\u201d`);
      return;
    }
    if (d.instrumental) {
      state.ui.setStatus('Instrumental track \u2014 no lyrics to show');
      return;
    }

    state.synced     = d.synced;
    state.lines      = d.lines;
    state.romanLines = d.romanLines || null;
    state.lang       = d.lang || null;
    state.romanUsable = !!d.lang && d.romanUsable !== false;

    state.ui.setMeta(d.trackName || meta.track, d.artistName || meta.artist);
    applyMode();

    let note = d.synced ? '' : 'Only unsynced lyrics exist for this track';
    if (d.lang && !state.romanUsable) {
      note = 'No romaji available for this track';
    }
    state.ui.setStatus(note);
  }

  function cycleMode() {
    state.roman = MODES[(MODES.indexOf(state.roman) + 1) % MODES.length];
    chrome.storage.local.set({ [MODE_KEY]: state.roman });
    applyMode();
  }

  function startLoop() {
    const tick = () => {
      if (!state.pip || !state.ui) return;
      const v = state.video;
      if (v && state.synced && state.view.length) {
        const t = v.currentTime + state.offset;
        const i = KaraokeLRC.findIndex(state.view, t);
        if (i !== state.index) {
          state.index = i;
          state.ui.setActive(Math.max(0, i));
        }
      }
      state.raf = state.pip.requestAnimationFrame(tick);
    };
    state.raf = state.pip.requestAnimationFrame(tick);
  }

  function setOffset(sec) {
    state.offset = Math.round(Math.max(-30, Math.min(30, sec)) * 10) / 10;
    state.ui.setOffset(state.offset);
    state.index = -2;
    if (state.videoId) {
      chrome.storage.local.set({ [OFFSET_PREFIX + state.videoId]: state.offset });
    }
  }

  function bindKeys(pip) {
    pip.addEventListener('keydown', (e) => {
      const v = state.video;
      if (!v) return;
      const step = e.shiftKey ? 1 : 0.2;
      switch (e.key) {
        case ' ':           e.preventDefault(); v.paused ? v.play() : v.pause(); break;
        case 'ArrowLeft':   v.currentTime -= 5; break;
        case 'ArrowRight':  v.currentTime += 5; break;
        case '[':           setOffset(state.offset - step); break;
        case ']':           setOffset(state.offset + step); break;
        case 'r': case 'R': cycleMode(); break;
        case '0':           setOffset(0); break;
      }
    });
  }

  window.addEventListener('yt-navigate-finish', () => {
    injectButton();
    if (state.pip) setTimeout(load, 400);
  }, true);

  let debounce;
  document.addEventListener('loadedmetadata', (e) => {
    if (e.target?.tagName !== 'VIDEO' || !state.pip) return;
    clearTimeout(debounce);
    debounce = setTimeout(load, 300);
  }, true);

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'kp-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }
})();
