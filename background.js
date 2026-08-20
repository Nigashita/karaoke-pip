importScripts('/src/lrc.js', '/src/metadata.js', '/src/romanize.js');

const DEBUG = false;
const log = (...a) => { if (DEBUG) console.info('[KaraokePiP]', ...a); };

const API = 'https://lrclib.net/api';
const CLIENT = 'KaraokePiP/1.3.1 (https://github.com/nigashita/karaoke-pip)';
const TTL_MS = 12 * 60 * 60 * 1000;

const ALLOWED_ORIGINS = new Set([
  'https://www.youtube.com',
  'https://music.youtube.com'
]);

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const MAX_LEN = 120;

const clean = (v) => String(v ?? '')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .trim()
  .slice(0, MAX_LEN);

function sanitize(p) {
  const d = Number(p?.duration);
  return {
    artist:        clean(p?.artist),
    track:         clean(p?.track),
    album:         clean(p?.album),
    altTrack:      clean(p?.altTrack),
    primaryArtist: clean(p?.primaryArtist),
    channel:       clean(p?.channel),
    rawTitle:      clean(p?.rawTitle),
    videoId:       String(p?.videoId ?? '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 24),
    duration: Number.isFinite(d) && d > 0 && d < 36000 ? Math.round(d) : null
  };
}

const oembed = new Map();

async function canonicalMeta(videoId) {
  if (!videoId) return null;
  if (oembed.has(videoId)) return oembed.get(videoId);
  try {
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', 'https://www.youtube.com/watch?v=' + videoId);
    url.searchParams.set('format', 'json');
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) { oembed.set(videoId, null); return null; }
    const j = await res.json();
    const out = { title: clean(j.title), channel: clean(j.author_name) };
    oembed.set(videoId, out.title ? out : null);
    return oembed.get(videoId);
  } catch {
    return null;
  }
}

const MIN_GAP_MS = 400;
let lastCall = 0;
let cooldownUntil = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, params) {
  if (Date.now() < cooldownUntil) throw new Error('rate limited — try again shortly');

  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    headers: { 'Lrclib-Client': CLIENT },
    credentials: 'omit',
    cache: 'no-store'
  });

  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After')) || 60;
    cooldownUntil = Date.now() + retry * 1000;
    throw new Error('LRCLIB is rate limiting — try again shortly');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB responded ${res.status}`);
  return res.json();
}

function score(hit, want) {
  let s = 0;
  if (hit.syncedLyrics) s += 100;
  if (want.duration && hit.duration) {
    s += Math.max(0, 40 - Math.abs(hit.duration - want.duration) * 4);
  }
  const t = norm(hit.trackName), a = norm(hit.artistName);
  const wt = norm(want.track),   wa = norm(want.artist);
  if (wt && t === wt) s += 30;
  else if (wt && (t.includes(wt) || wt.includes(t))) s += 15;
  if (wa && a === wa) s += 20;
  else if (wa && (a.includes(wa) || wa.includes(a))) s += 10;
  return s;
}

function best(list, want) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.map((h) => ({ h, s: score(h, want) })).sort((x, y) => y.s - x.s)[0].h;
}

async function resolve(want) {
  const ladder = [
    () => api('/get', { artist_name: want.artist, track_name: want.track,
                        album_name: want.album, duration: want.duration }),
    () => api('/get', { artist_name: want.artist, track_name: want.track }),
    () => api('/search', { artist_name: want.artist, track_name: want.track })
            .then((r) => best(r, want)),
    () => want.romanTrack && api('/search', { artist_name: want.artist,
                                              track_name: want.romanTrack })
            .then((r) => best(r, want)),
    () => want.channel && norm(want.channel) !== norm(want.artist) &&
          api('/search', { artist_name: want.channel, track_name: want.track })
            .then((r) => best(r, want)),
    () => api('/search', { artist_name: want.primaryArtist,
                           track_name: want.altTrack || want.track })
            .then((r) => best(r, want)),
    () => api('/search', { q: `${want.artist} ${want.altTrack || want.track}`.trim() })
            .then((r) => best(r, want)),
    () => want.romanTrack && api('/search', { q: `${want.artist} ${want.romanTrack}`.trim() })
            .then((r) => best(r, want)),
    () => api('/search', { q: want.altTrack || want.track }).then((r) => best(r, want))
  ];

  for (const step of ladder) {
    try {
      const hit = await step();
      if (hit && (hit.syncedLyrics || hit.plainLyrics || hit.instrumental)) return hit;
    } catch (err) {
      log(err.message);
      if (Date.now() < cooldownUntil) throw err;
    }
  }
  return null;
}

function withRomanTrack(want) {
  const lang = KaraokeRomanize.detect(want.track);
  if (lang === 'ja' || lang === 'ko' ||
     (lang === 'zh' && KaraokeRomanize.hasPinyinData())) {
    const r = KaraokeRomanize.line(want.track, lang);
    if (r && r !== want.track) want.romanTrack = r;
  }
  return want;
}

let pinyinReady = null;
function loadPinyin() {
  if (!pinyinReady) {
    pinyinReady = fetch(chrome.runtime.getURL('data/pinyin.json'))
      .then((r) => r.json())
      .then((d) => { KaraokeRomanize.setPinyinData(d); return d; })
      .catch((e) => { pinyinReady = null; throw e; });
  }
  return pinyinReady;
}

async function findRomanized(want) {
  const queries = [
    { artist_name: want.artist, track_name: want.track },
    want.romanTrack && { artist_name: want.artist, track_name: want.romanTrack },
    want.romanTrack && { q: `${want.artist} ${want.romanTrack}`.trim() }
  ].filter(Boolean);

  for (const q of queries) {
    try {
      const hits = await api('/search', q);
      if (!Array.isArray(hits)) continue;

      const ok = hits
        .filter((h) =>
          h.syncedLyrics &&
          KaraokeRomanize.latinRatio(h.syncedLyrics) > 0.9 &&
          (!want.duration || !h.duration || Math.abs(h.duration - want.duration) <= 5))
        .sort((a, b) => {
          const da = want.duration && a.duration ? Math.abs(a.duration - want.duration) : 99;
          const db = want.duration && b.duration ? Math.abs(b.duration - want.duration) : 99;
          return da - db;
        });

      if (ok.length) return KaraokeLRC.parse(ok[0].syncedLyrics);
    } catch {
      continue;
    }
  }
  return null;
}

async function romanize(payload, want) {
  if (!payload.found || !payload.lines?.length) return payload;

  const lang = KaraokeRomanize.detect(payload.lines.map((l) => l.text).join('\n'));
  if (!lang) return payload;
  payload.lang = lang;

  if (lang === 'zh') {
    try { await loadPinyin(); } catch { return payload; }
  }

  payload.lines = payload.lines.map((l) => ({
    ...l,
    roman: l.text ? KaraokeRomanize.line(l.text, lang) : ''
  }));

  const local = payload.lines.map((l) => l.roman).join('');
  payload.romanPartial = KaraokeRomanize.latinRatio(local) < 0.98;
  payload.romanSource = 'local';

  if ((lang === 'ja' || lang === 'ko') && payload.romanPartial) {
    const alt = await findRomanized(want);
    if (alt?.length) {
      payload.romanLines = alt;
      payload.romanSource = 'lrclib';
      payload.romanPartial = false;
      for (const l of payload.lines) {
        const m = nearest(alt, l.time, 0.5);
        if (m?.text) l.roman = m.text;
      }
    }
  }

  payload.romanUsable = !payload.romanPartial;

  if (!payload.romanUsable) {
    for (const l of payload.lines) delete l.roman;
  }

  return payload;
}

const inflight = new Map();

function handle(raw) {
  const want = sanitize(raw);
  if (!want.track) return Promise.resolve({ found: false });

  const key = `kp:${norm(want.artist)}|${norm(want.track)}|${want.duration || 0}`;
  if (inflight.has(key)) return inflight.get(key);

  const job = run(key, want).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function run(key, want) {
  const cached = (await chrome.storage.session.get(key))[key];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.payload;

  let hit = await resolve(withRomanTrack(want));
  let used = want;

  if (!hit && want.videoId) {
    const canon = await canonicalMeta(want.videoId);
    if (canon && norm(canon.title) !== norm(want.rawTitle)) {
      const reparsed = KaraokeMeta.split(canon.title, canon.channel);
      const retry = withRomanTrack({
        ...want,
        ...reparsed,
        channel: KaraokeMeta.cleanChannel(canon.channel),
        rawTitle: canon.title
      });
      log('retrying with canonical title', canon.title);
      hit = await resolve(retry);
      if (hit) used = retry;
    }
  }

  const payload = hit ? {
    found: true,
    instrumental: !!hit.instrumental,
    synced: !!hit.syncedLyrics,
    trackName: hit.trackName,
    artistName: hit.artistName,
    lines: hit.syncedLyrics
      ? KaraokeLRC.parse(hit.syncedLyrics)
      : (hit.plainLyrics || '').split('\n').map((text) => ({ time: null, text: text.trim() }))
  } : { found: false };

  await romanize(payload, used);

  await chrome.storage.session.set({ [key]: { at: Date.now(), payload } });
  return payload;
}

function trusted(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  if (!sender.tab) return false;
  try { return ALLOWED_ORIGINS.has(new URL(sender.url || '').origin); }
  catch { return false; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'KP_FETCH_LYRICS') return;
  if (!trusted(sender)) return;

  handle(msg.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  let origin;
  try { origin = new URL(tab.url || '').origin; } catch { return; }
  if (!ALLOWED_ORIGINS.has(origin)) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'KP_TOGGLE' });
  } catch {
    chrome.tabs.reload(tab.id);
  }
});
