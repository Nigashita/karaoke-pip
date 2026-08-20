var KaraokeLRC = (function () {
  const TIME_RE   = /\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]/g;
  const META_RE   = /^\[(ti|ar|al|au|by|offset|length|re|ve|tool):(.*)\]$/i;
  const LEADING   = /^(?:\s*\[[^\]]*\]\s*)+/;
  const WORD_TAGS = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;

  function parse(raw) {
    const out = [];
    if (!raw) return out;

    let offset = 0;
    for (const row of raw.replace(/\r/g, '').split('\n')) {
      const meta = row.trim().match(META_RE);
      if (meta) {
        if (meta[1].toLowerCase() === 'offset') {
          const v = parseFloat(meta[2]);
          if (!Number.isNaN(v)) offset = v / 1000;
        }
        continue;
      }

      TIME_RE.lastIndex = 0;
      const stamps = [];
      let m;
      while ((m = TIME_RE.exec(row)) !== null) {
        stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')));
      }
      if (!stamps.length) continue;

      const text = row.replace(LEADING, '').replace(WORD_TAGS, '').trim();
      for (const t of stamps) out.push({ time: Math.max(0, t - offset), text });
    }

    out.sort((a, b) => a.time - b.time);
    return out;
  }

  function findIndex(lines, t) {
    let lo = 0, hi = lines.length - 1, res = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= t) { res = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return res;
  }

  return { parse, findIndex };
})();
