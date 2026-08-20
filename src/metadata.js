var KaraokeMeta = (function () {

  const STRIP = new RegExp(
    '\\b(?:official(?:\\s|-)?(?:music\\s*)?(?:video|audio|version|visuali[sz]er)?|' +
    'music\\s*video|lyrics?(?:\\s*video)?|audio(?:\\s*only)?|visuali[sz]er|m\\/?v|' +
    'hd|hq|4k|8k|1080p?|720p?|hi-?res|full\\s*(?:song|version|album)|explicit|' +
    'clean\\s*version|colou?r\\s*coded|(?:eng|kor|rom|han|esp|jpn|ind)[\\s\\/]*(?:sub|lyrics?)|' +
    'sub(?:titulad[oa]|titles|bed)?|teaser|trailer|out\\s*now|new\\s*single|' +
    'free\\s*(?:download|dl)|prod\\.?\\s*by|premiere|re-?upload|' +
    '(?:op|ed)\\s*\\d*|opening|ending|insert\\s*song|ost|anime|theme\\s*song|' +
    'tv\\s*size|short\\s*ver\\.?|amv|nightcore)\\b', 'i');

  const AGGRESSIVE = new RegExp(
    '\\b(?:live|acoustic|unplugged|remaster(?:ed)?(?:\\s*\\d{4})?|remix|rmx|edit|mix|' +
    'cover|demo|deluxe|bonus|session|performance|instrumental|karaoke|slowed|reverb|' +
    'sped\\s*up|nightcore|8d|extended|radio\\s*edit|(?:single|album)\\s*version|' +
    '\\d{4}\\s*version)\\b', 'i');

  const BRACKET   = /[([{（【「『〈《]([^)\]}）】」』〉》]*)[)\]}）】」』〉》]/g;
  const CJK_TITLE = /^\s*([^「『【《〈]{1,60}?)\s*[「『【《〈]\s*([^」』】》〉]{1,80})\s*[」』】》〉]/;
  const EMOJI     = /[\p{Extended_Pictographic}\u{FE0F}\u{200E}\u{200F}\u{2066}-\u{2069}]/gu;
  const FEAT      = /\s*\b(?:feat|ft|featuring|w\/|with|con|avec)\b\.?\s+.*$/i;
  const SEP       = /\s[-–—―~|:]\s/;

  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  function scrub(input, aggressive) {
    let s = ' ' + (input || '') + ' ';

    s = s.replace(EMOJI, ' ');

    s = s.replace(BRACKET, (whole, inner) => {
      if (STRIP.test(inner)) return ' ';
      if (aggressive && AGGRESSIVE.test(inner)) return ' ';
      if (/^\s*(?:feat|ft|featuring|w\/|with)\b/i.test(inner)) return ' ';
      return whole;
    });

    s = s.replace(/#[\p{L}\p{N}_]+/gu, ' ');
    s = s.replace(/^\s*\d{1,2}\s*[.)\-]\s+/, ' ');
    s = s.replace(/\s*\|[^|]*$/g, (m) => (STRIP.test(m) ? ' ' : m));

    for (let i = 0; i < 3; i++) {
      s = s.replace(
        /[\s\-–—|,]*\b(?:official\s*(?:music\s*)?(?:video|audio)|music\s*video|lyrics?\s*video|lyrics|audio|visuali[sz]er|hd|hq|4k|mv)\b\s*$/i,
        ' '
      );
    }

    return s
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—|,·•"“”']+|[\s\-–—|,·•"“”']+$/g, '')
      .trim();
  }

  function cleanChannel(name) {
    return (name || '')
      .replace(/\s*-\s*Topic\s*$/i, '')
      .replace(/VEVO$/i, '')
      .replace(/\s*Official(?:\s*(?:Channel|Music|Audio|Videos?))?\s*$/i, '')
      .trim();
  }

  function finish(artist, track, fallback) {
    track = (track || '').replace(FEAT, '').trim() || fallback || '';
    return {
      artist: artist || '',
      track,
      altTrack: scrub(track, true) || track,
      primaryArtist: (artist || '').split(/\s*(?:,|&|feat\.?|ft\.?|vs\.?|×|\+)\s*/i)[0].trim()
    };
  }

  function split(rawTitle, rawChannel) {
    const channel = cleanChannel(rawChannel);

    const cjk = (rawTitle || '').match(CJK_TITLE);
    if (cjk) {
      const left  = scrub(cjk[1], false);
      const inner = scrub(cjk[2], false);
      if (left && inner) return finish(left, inner, inner);
      if (inner) return finish(channel, inner, inner);
    }

    const clean = scrub(rawTitle, false);

    const parts = clean.split(SEP);
    if (parts.length >= 2) {
      const left  = parts[0].trim();
      const right = parts.slice(1).join(' - ').trim();

      const ch = norm(channel);
      if (ch && norm(right) && (norm(right) === ch || ch.includes(norm(right)))) {
        return finish(right, left, clean);
      }
      return finish(left, right, clean);
    }

    return finish(channel, clean, clean);
  }

  function readYouTube() {
    const title =
      document.querySelector('#title h1 yt-formatted-string')?.textContent?.trim() ||
      document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() ||
      document.querySelector('meta[name="title"]')?.content ||
      document.title.replace(/\s*-\s*YouTube\s*$/, '');

    const channel =
      document.querySelector('#owner #channel-name a')?.textContent?.trim() ||
      document.querySelector('ytd-channel-name a')?.textContent?.trim() ||
      document.querySelector('link[itemprop="name"]')?.getAttribute('content') || '';

    return { title, channel, album: '' };
  }

  function readYouTubeMusic() {
    const bar    = document.querySelector('ytmusic-player-bar');
    const title  = bar?.querySelector('.title')?.textContent?.trim() || '';
    const byline = bar?.querySelector('.byline')?.textContent?.trim() || '';
    const [artist = '', album = ''] = byline.split('•').map((s) => s.trim());
    return { title, channel: artist, album };
  }

  function getNowPlaying(video) {
    const src = location.hostname === 'music.youtube.com'
      ? readYouTubeMusic()
      : readYouTube();

    const parsed = split(src.title, src.channel);
    const duration = video && Number.isFinite(video.duration)
      ? Math.round(video.duration) : null;

    return {
      ...parsed,
      album: src.album,
      channel: cleanChannel(src.channel),
      duration,
      rawTitle: src.title
    };
  }

  return { getNowPlaying, scrub, split, cleanChannel };
})();
